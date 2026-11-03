'use strict'
// Runs the probes (a few at a time, each with its own timeout, all within an overall budget) and merges their slices into one
// SystemProfile. A probe that fails leaves its fields undefined: callers treat that as "unknown", never as a default.
const { PROBES, chipsFor } = require('./probes')

const CONCURRENCY = 4
const BUDGET_MS = 20000

const HAGS_GPU = /nvidia|geforce|rtx|gtx 16|gtx 10|rx\s*5\d{3}|rx\s*6|rx\s*7|rx\s*9|\barc\b/i

const dayMs = 24 * 3600 * 1000

/** Joins what several probes know about the GPUs: names/vendors from hw, driver version/date from gpu, HAGS support. */
function deriveGpus(p, now) {
  const list = p.gpuList || []
  const drivers = p.gpuDrivers || []
  return list.map(g => {
    const d = drivers.find(x => x.name && g.name && (x.name.toLowerCase() === g.name.toLowerCase() || g.name.toLowerCase().includes(x.name.toLowerCase()) || x.name.toLowerCase().includes(g.name.toLowerCase()))) || null
    const dateMs = d && d.date ? Date.parse(d.date) : NaN
    return {
      name: g.name, vendor: g.vendor, discrete: !g.integrated, driverVersion: d ? d.ver : null, driverDate: d ? d.date : null,
      driverAgeDays: Number.isFinite(dateMs) ? Math.floor((now - dateMs) / dayMs) : null,
      hagsCapable: !g.integrated && HAGS_GPU.test(g.name),
    }
  })
}

function finalize(p, now) {
  p.gpus = deriveGpus(p, now)
  return p
}

/**
 * deps: { runPS(script, timeoutMs) -> { ok, out }, emit(evt), now() }. opts: { admin, scanId }.
 * Resolves to a profile; every probe's outcome is recorded in profile.probes[id] = { ok, ms, error? }.
 */
async function detect(deps, opts = {}) {
  const now = deps.now || Date.now
  const emit = deps.emit || (() => {})
  const t0 = now()
  const profile = { v: 1, scanId: opts.scanId || null, takenAt: t0, admin: !!opts.admin, context: opts.context || {}, probes: {} }
  const queue = PROBES.slice()
  const deadline = t0 + BUDGET_MS

  async function runOne(pr) {
    const left = deadline - now()
    emit({ scanId: profile.scanId, probe: pr.id, state: 'start' })
    if (left <= 0) {
      profile.probes[pr.id] = { ok: false, ms: 0, error: 'budget' }
      emit({ scanId: profile.scanId, probe: pr.id, state: 'fail', ms: 0, chips: chipsFor(pr.id, null) })
      return
    }
    const s = now()
    let slice = null, error = null
    try {
      const r = await deps.runPS(pr.script, Math.min(pr.timeoutMs, left))
      if (!r || r.ok === false) error = (r && r.err) ? String(r.err).slice(0, 120) : 'failed'
      else { slice = pr.parse(r.out); if (!slice) error = 'unparsed' }
    } catch (e) { error = String(e && e.message || e).slice(0, 120) }
    const ms = now() - s
    if (slice) {
      Object.assign(profile, slice)
      profile.probes[pr.id] = { ok: true, ms }
      let chips = []
      try { chips = chipsFor(pr.id, slice) } catch { chips = chipsFor(pr.id, null) }
      emit({ scanId: profile.scanId, probe: pr.id, state: 'done', ms, chips })
    } else {
      profile.probes[pr.id] = { ok: false, ms, error }
      emit({ scanId: profile.scanId, probe: pr.id, state: 'fail', ms, chips: chipsFor(pr.id, null) })
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, async () => { while (queue.length) await runOne(queue.shift()) }))
  profile.scanMs = now() - t0
  return finalize(profile, now())
}

module.exports = { detect, finalize, deriveGpus, CONCURRENCY, BUDGET_MS }
