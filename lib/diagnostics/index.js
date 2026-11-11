'use strict'
// Diagnostics 2.0 service. create(deps) -> { scan, abort, cached, fix, bench, benchBaseline, notePreflight, repairMeta }.
// deps (everything with a side effect comes in here, so tests drive it with fakes):
//   runPS(script, ms) -> { ok, out, err }          runRecorded(control, action, meta, fn(ps)) -> fn's result (journal)
//   createRestorePoint() -> { ok, reason? }        state: { read(), write(v) }          now?()
//   getCapsProfile() -> profile | null             preflight(onProgress) -> result | null       temps() -> { cpuTemp } | null
//   journal() -> journal entries                   isGameRunning() -> bool                      isAdmin() -> bool
//   thermalAudit() / ramStress() / runtimes()      -> slice | null (Pro or existing handlers; the caller leaves them out via opts.skip)
//   installRuntimes(ids, step) -> { ok }           benchDir
const crypto = require('crypto')
const probesLib = require('./probes')
const model = require('./model')
const repair = require('./repair')
const bench = require('./bench')

const CONCURRENCY = 4
const MAX_HISTORY = 20
const MAX_BENCH = 20
const PREFLIGHT_FRESH_MS = 6 * 3600 * 1000

// Which lattice arcs each probe feeds (the page lights an arc when every probe that feeds it has finished).
const PROBE_SUBS = {
  reliability: ['stability'], events: ['stability'], minidumps: ['stability'],
  storage: ['storage'], battery: ['storage'], memory: ['memory'], ram: ['memory'], cpu: ['cpu'], thermal: ['cpu'], temps: ['cpu'],
  devices: ['drivers'], drivers: ['drivers'], runtimes: ['drivers'], updates: ['windows'], health: ['windows'],
  tpm: ['security'], net: ['network'], profile: ['gpu', 'security', 'memory'], preflight: ['config'],
}

const DEFAULT_STATE = { last: null, history: [], bench: { runs: [], baseline: null }, preflight: null }

function create(deps) {
  const now = deps.now || Date.now
  let active = null, benching = null, fixing = false

  const read = () => { let s = null; try { s = deps.state.read() } catch { s = null } return { ...DEFAULT_STATE, ...(s || {}), bench: { ...DEFAULT_STATE.bench, ...((s && s.bench) || {}) } } }
  const write = s => { try { deps.state.write(s) } catch { /* disk full / locked: the run still returns its result */ } }

  /** One probe -> { slice, ms, error }. A probe can never throw out of here. */
  async function runProbe(p, ctl) {
    const t = now()
    try {
      if (p.run) {
        const slice = await p.run(deps)
        return { slice: slice || null, ms: now() - t, error: slice ? null : 'unavailable' }
      }
      const r = await deps.runPS(p.script, p.timeoutMs || 30000)
      if (!r || r.ok === false) return { slice: null, ms: now() - t, error: (r && r.err) ? String(r.err).slice(0, 120) : 'failed' }
      const slice = p.parse(r.out)
      return { slice, ms: now() - t, error: slice ? null : 'unparsed' }
    } catch (e) { return { slice: null, ms: now() - t, error: String((e && e.message) || e).slice(0, 120) } }
  }

  async function scan(opts = {}) {
    if (active) return { ok: false, error: 'busy' }
    const mode = opts.mode === 'deep' ? 'deep' : 'quick'
    const skip = new Set(opts.skip || [])
    const send = typeof opts.onProgress === 'function' ? opts.onProgress : () => {}
    const ctl = { aborted: false }
    active = ctl
    const t0 = now()
    const prev = read()
    const data = {}, probes = {}
    let profile = null, preflight = null, temps = null
    try {
      const list = probesLib.forMode(mode).filter(p => !skip.has(p.id))
      const quiet = list.filter(p => p.id === 'cpu')                       // measured alone: our own probes would otherwise be the load it sees
      const loud = list.filter(p => p.id !== 'cpu' && p.id !== 'thermal' && p.id !== 'ram')
      const serial = list.filter(p => p.id === 'thermal' || p.id === 'ram') // under-load tests never overlap anything else
      const special = ['profile', 'preflight', 'temps']
      const total = list.length + special.length
      let done = 0
      const emit = (probe, state, ms) => send({ kind: 'scan', probe, state, ms: ms || 0, done, total, subs: PROBE_SUBS[probe] || [] })

      async function doProbe(p) {
        if (ctl.aborted) return
        emit(p.id, 'start')
        const r = await runProbe(p, ctl)
        done++
        probes[p.id] = { ok: !!r.slice, ms: r.ms, error: r.error }
        if (r.slice) data[p.id] = r.slice
        emit(p.id, r.slice ? 'done' : 'fail', r.ms)
      }
      async function doSpecial(id) {
        if (ctl.aborted) return
        emit(id, 'start')
        const t = now()
        let ok = false, error = null
        try {
          if (id === 'profile') { profile = deps.getCapsProfile ? await deps.getCapsProfile() : null; ok = !!profile }
          else if (id === 'temps') { temps = deps.temps ? await deps.temps() : null; ok = !!(temps && temps.cpuTemp != null) }
          else {
            const c = prev.preflight
            if (c && c.result && now() - c.ts < PREFLIGHT_FRESH_MS && mode === 'quick') preflight = c.result
            else if (deps.preflight) {
              preflight = await deps.preflight(p => send({ kind: 'scan', probe: 'preflight', state: 'progress', pct: p && p.pct }))
              if (preflight) write({ ...read(), preflight: { ts: now(), result: preflight } })
            }
            ok = !!preflight
          }
        } catch (e) { error = String((e && e.message) || e).slice(0, 120) }
        done++
        probes[id] = { ok, ms: now() - t, error: ok ? null : (error || 'unavailable') }
        emit(id, ok ? 'done' : 'fail', now() - t)
      }

      for (const p of quiet) await doProbe(p)
      for (const id of skip) if (probesLib.byId[id]) { probes[id] = { ok: false, ms: 0, error: 'skipped' }; send({ kind: 'scan', probe: id, state: 'skip', done, total, subs: PROBE_SUBS[id] || [] }) }
      // Longest first so the pool never ends waiting on one slow probe.
      const queue = [{ special: 'preflight' }, ...loud.sort((a, b) => (b.timeoutMs || 0) - (a.timeoutMs || 0)), { special: 'profile' }, { special: 'temps' }]
      await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
        while (queue.length && !ctl.aborted) { const j = queue.shift(); await (j.special ? doSpecial(j.special) : doProbe(j)) }
      }))
      for (const p of serial) await doProbe(p)

      if (ctl.aborted) return { ok: false, aborted: true }
      const report = model.buildReport({ mode, takenAt: now(), ms: now() - t0, admin: !!(deps.isAdmin && deps.isAdmin()), probes, data, profile, preflight, temps, journal: deps.journal ? safe(() => deps.journal()) : [] })
      const st = read()
      const prevRow = st.history.length ? st.history[st.history.length - 1] : null
      st.last = report
      st.history = [...st.history, model.historyRow(report)].slice(-MAX_HISTORY)
      write(st)
      return { ok: true, report, diff: model.diff(prevRow, report), history: st.history }
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e).slice(0, 160) }
    } finally { active = null }
  }

  const safe = fn => { try { return fn() || [] } catch { return [] } }
  function abort() { if (active) active.aborted = true; if (benching) benching.abort.abort(); return { ok: true } }
  function cached() { const s = read(); return { ok: true, report: s.last, history: s.history, bench: s.bench } }

  /** Runs one repair by id. Restore point first where the repair asks for one; the run itself is journaled. */
  async function fix(req = {}, onProgress = () => {}) {
    const r = repair.get(req.id)
    if (!r) return { ok: false, error: 'unknown' }
    if (fixing || active) return { ok: false, error: 'busy' }
    fixing = true
    const t0 = now()
    const send = p => { try { onProgress({ kind: 'fix', id: req.id, ...p }) } catch { /* listener gone */ } }
    try {
      let restorePoint = null
      if (r.rp) {
        send({ phase: 'rp' })
        const rp = await deps.createRestorePoint()
        restorePoint = { ok: !!(rp && rp.ok), reason: rp && rp.reason }
        if (!restorePoint.ok) return { ok: false, aborted: true, id: req.id, reason: restorePoint.reason || 'restore-point-failed' }
      }
      send({ phase: 'run' })
      const batchId = crypto.randomBytes(6).toString('hex')
      const ctx = { missing: req.missing, step: s => send({ phase: 'step', step: s }) }
      const res = await deps.runRecorded('diag:' + req.id, 'apply', { via: 'manual', batchId }, (ps) => r.run(deps, ps, ctx))
      const out = { ok: !!(res && res.ok), id: req.id, ms: now() - t0, restorePoint, restart: !!(res && res.restart), error: res && res.ok ? null : (res && res.error) || 'failed', batchId }
      send({ phase: 'done', ok: out.ok })
      return out
    } catch (e) {
      return { ok: false, id: req.id, error: String((e && e.message) || e).slice(0, 160) }
    } finally { fixing = false }
  }

  /** Benchmarks. Refuses under a game (it would measure the game and slow it down). */
  async function runBench(kinds, onProgress = () => {}, o = {}) {
    if (benching || active) return { ok: false, error: 'busy' }
    if (deps.isGameRunning && deps.isGameRunning()) return { ok: false, error: 'game-running' }
    const ctl = { abort: new AbortController() }
    benching = ctl
    try {
      const res = await bench.run(kinds, { dir: deps.benchDir, signal: ctl.abort.signal, now, scale: o.scale, runs: o.runs, onProgress: p => onProgress({ ...p, kind: 'bench', bench: p.kind }) })
      const st = read()
      st.bench.runs = [...st.bench.runs, res].slice(-MAX_BENCH)
      if (!st.bench.baseline) st.bench.baseline = res
      write(st)
      return { ok: true, run: res, baseline: st.bench.baseline, runs: st.bench.runs }
    } catch (e) {
      return { ok: false, error: /aborted/.test(String(e && e.message)) ? 'aborted' : String((e && e.message) || e).slice(0, 160) }
    } finally { benching = null }
  }

  /** { reset: true } forgets the baseline, { pin: true } makes the latest run the baseline. */
  function benchBaseline(o = {}) {
    const st = read()
    if (o.reset) st.bench.baseline = null
    else if (o.pin && st.bench.runs.length) st.bench.baseline = st.bench.runs[st.bench.runs.length - 1]
    write(st)
    return { ok: true, baseline: st.bench.baseline, runs: st.bench.runs }
  }

  /** The legacy pre-flight scan finished somewhere else (background pre-scan, Arrival): keep it so a quick checkup can reuse it. */
  function notePreflight(result) {
    if (!result || !result.tweakStates) return
    const st = read(); st.preflight = { ts: now(), result }; write(st)
  }

  return { scan, abort, cached, fix, bench: runBench, benchBaseline, notePreflight, repairMeta: repair.meta }
}

module.exports = { create, PROBE_SUBS, CONCURRENCY, MAX_HISTORY, model, repair, probes: probesLib, bench, grade: require('./grade'), findings: require('./findings') }
