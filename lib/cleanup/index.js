'use strict'
// Cleanup service: scan (streamed), run (streamed, abortable), receipt. All side effects come in through `deps` so tests can drive it
// with a temp tree. main.js supplies runPS, the running-process list, GPU/FiveM facts, the history store and the progress sender.
const realFs = require('fs')
const targets = require('./targets')
const walkLib = require('./walk')
const special = require('./special')
const receiptLib = require('./receipt')

const ORDER = { safe: 0, review: 1, permanent: 2 }

/**
 * deps: { env, fs?, runPS(script, ms)->{out}, running()->Promise<Set<lowercase exe>>, has()->Promise<{nvidia,amd,fivem}>,
 *         wuPending()->Promise<bool>, diskFree()->Promise<number|null>, now?() }
 */
function create(deps) {
  const fs = deps.fs || realFs, now = deps.now || Date.now
  let cache = null, active = null

  async function pool(list, n, fn) {
    let i = 0
    await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) { const t = list[i++]; await fn(t) } }))
  }

  /** scan({ onProgress, analyzeDism, only }) -> model. onProgress({ id, bytes, files, done, total }) fires as each target finishes. */
  async function scan(opts = {}) {
    const ctl = { aborted: false }
    const list = targets.TARGETS.filter(t => !opts.only || opts.only.includes(t.id))
    const [running, has, wuPending] = await Promise.all([deps.running().catch(() => new Set()), deps.has().catch(() => ({})), (deps.wuPending ? deps.wuPending() : Promise.resolve(false)).catch(() => false)])
    const scans = {}
    let done = 0
    const jobs = list.filter(t => !(t.requires && !has[t.requires]))
    await pool(jobs, 4, async t => {
      let s
      try { s = t.special ? await special.measure(t, deps.env, deps.runPS, { fs, analyzeDism: !!opts.analyzeDism, ctl }) : await walkLib.scanTarget(t, deps.env, { fs, ctl, now: now() }) }
      catch { s = { id: t.id, present: false, bytes: 0, files: 0 } }
      scans[t.id] = s; done++
      if (opts.onProgress) opts.onProgress({ id: t.id, group: t.group, lane: t.lane, bytes: s.bytes || 0, files: s.files || 0, done, total: jobs.length })
    })
    const model = receiptLib.buildModel(scans, { running, has, wuPending })
    model.ts = now(); model.disk = deps.diskInfo ? await deps.diskInfo().catch(() => null) : null
    cache = { model, scans }
    return model
  }

  async function around(t, fn) {
    if (t.needsExplorerRestart) {
      await deps.runPS('Stop-Process -Name explorer -Force -EA SilentlyContinue; Start-Sleep -Milliseconds 800', 15000)
      try { return await fn() } finally { await deps.runPS('Start-Process explorer', 15000).catch(() => {}) }
    }
    if (t.needsService) {
      await deps.runPS(`Stop-Service -Name ${t.needsService} -Force -EA SilentlyContinue`, 15000)
      try { return await fn() } finally { await deps.runPS(`Start-Service -Name ${t.needsService} -EA SilentlyContinue`, 15000).catch(() => {}) }
    }
    return fn()
  }

  /** Run one target by id (used by the TWEAKS clean-* entries and Auto-Optimize too). Never throws: failures land in `error`. */
  async function cleanOne(id, o = {}) {
    const t = targets.get(id)
    if (!t) return { id, freed: 0, error: 'unknown-target', skipped: {}, skippedBytes: 0 }
    try {
      return await around(t, () => t.special ? special.clean(t, deps.env, deps.runPS, { fs }) : walkLib.cleanTarget(t, deps.env, { fs, ctl: o.ctl, now: now(), onProgress: o.onBytes }))
    } catch (e) { return { id, freed: 0, error: String((e && e.message) || e).slice(0, 160), skipped: { inUse: 0, access: 0, tooNew: 0, personal: 0 }, skippedBytes: 0 } }
  }

  /**
   * run({ ids, confirmed, onProgress }) -> receipt. Permanent targets only run when listed in `confirmed`.
   * onProgress({ id, phase:'start'|'bytes'|'done', freed, total, index, count }).
   */
  async function run(opts = {}) {
    if (active) return { ok: false, error: 'busy' }
    const ctl = active = { aborted: false }
    try {
      const confirmed = new Set(opts.confirmed || [])
      const wanted = (opts.ids || []).map(targets.get).filter(Boolean)
        .filter(t => t.lane !== 'permanent' || confirmed.has(t.id))
        .sort((a, b) => ORDER[a.lane] - ORDER[b.lane])
      const startedAt = now()
      const before = deps.diskFree ? await deps.diskFree().catch(() => null) : null
      const results = []
      let total = 0
      for (let i = 0; i < wanted.length; i++) {
        const t = wanted[i]
        if (ctl.aborted) break
        if (opts.onProgress) opts.onProgress({ id: t.id, phase: 'start', freed: 0, total, index: i, count: wanted.length })
        const r = await cleanOne(t.id, { ctl, onBytes: b => { if (opts.onProgress) opts.onProgress({ id: t.id, phase: 'bytes', freed: b, total: total + b, index: i, count: wanted.length }) } })
        results.push(r); total += r.freed || 0
        if (opts.onProgress) opts.onProgress({ id: t.id, phase: 'done', freed: r.freed || 0, total, index: i, count: wanted.length, skipped: r.skipped, error: r.error || null })
      }
      const after = deps.diskFree ? await deps.diskFree().catch(() => null) : null
      const rec = receiptLib.buildReceipt(results, { startedAt, endedAt: now(), disk: { before, after } })
      rec.aborted = !!ctl.aborted
      cache = null
      return { ok: true, receipt: rec }
    } finally { active = null }
  }

  const abort = () => { if (active) active.aborted = true; return !!active }
  const cached = () => (cache ? cache.model : null)
  return { scan, run, cleanOne, abort, cached }
}

module.exports = { create, targets, walk: walkLib, special, receipt: receiptLib, insights: require('./insights'), explore: require('./explore') }
