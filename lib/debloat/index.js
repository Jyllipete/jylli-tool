'use strict'
// Debloat service: scan (one probe), run (streamed, abortable, journaled, restore point first), receipt with MEASURED deltas,
// Guard (drift of what was removed), Way back. Every side effect comes in through `deps`, so tests drive it with fakes.
//   deps: { runPS(script, ms)->{ok,out,err}, runRecorded(control, action, meta, fn(ps, cmd, note))->any, createRestorePoint()->{ok,reason?,guidance?},
//           state: { read()->obj, write(obj) }, openExternal?(url), isProtectedService?(id), now?() }
const crypto = require('crypto')
const catalog = require('./catalog')
const probe = require('./probe')
const { buildModel } = require('./model')
const classifyLib = require('./classify')
const footprint = require('./footprint')
const runLib = require('./run')
const guardLib = require('./guard')
const waybackLib = require('./wayback')

const DEFAULT_STATE = { removed: {}, runs: [], intents: null, shield: true, deprovision: true, guard: { mode: 'off' }, last: null }
const MAX_RUNS = 30

function create(deps) {
  const now = deps.now || Date.now
  let cache = null, active = null
  const wayback = waybackLib.create({ runPS: deps.runPS, openExternal: deps.openExternal })

  const load = () => ({ ...DEFAULT_STATE, ...(deps.state.read() || {}) })
  const save = s => { try { deps.state.write(s) } catch { /* state is best effort */ } }

  /** The prefs the page needs with a scan: user intents (null = use the detected ones), shield, deprovision. */
  const prefs = () => { const s = load(); return { intents: s.intents, shield: s.shield !== false, deprovision: s.deprovision !== false, guard: s.guard } }
  function setPrefs(p = {}) {
    const s = load()
    if (p.intents !== undefined) s.intents = p.intents && typeof p.intents === 'object' ? Object.fromEntries(classifyLib.INTENTS.map(k => [k, !!p.intents[k]])) : null
    if (typeof p.shield === 'boolean') s.shield = p.shield
    if (typeof p.deprovision === 'boolean') s.deprovision = p.deprovision
    save(s)
    return prefs()
  }

  async function scan() {
    const r = await deps.runPS(probe.buildScript(), 180000)
    const model = buildModel(probe.parse(r.out), { now: now() })
    if (!model) return { ok: false, error: 'scan-failed' }
    cache = model
    const s = load()
    s.last = { build: model.facts.build, ubr: model.facts.ubr, at: now() }
    s.summary = summarize(model)
    save(s)
    return { ok: true, model, drift: drift(model), prefs: prefs() }
  }

  /** Classification with the saved prefs. Used by the summary, Guard and the quiet re-apply; the page re-runs it itself when an intent chip changes. */
  function verdicts(model) {
    const p = prefs()
    const intents = p.intents || classifyLib.autoIntents(model.facts)
    return classifyLib.classify(model.items, model.facts, intents, { shield: p.shield, now: now() })
  }
  function summarize(model) {
    const v = verdicts(model), t = footprint.totals(model.items, v, now(), classifyLib.defaultSelection(v))
    return { ts: now(), count: t.all.count, safe: t.selected.count, ram: t.all.ram, disk: t.all.disk, wakes: t.all.wakes, layers: Object.fromEntries(Object.entries(t.layers).map(([k, v]) => [k, v.count])) }
  }
  const summary = () => load().summary || null

  function drift(model) { return guardLib.drift(load().removed, model || cache) }

  /** run({ ids, deprovision, restorePoint: 'auto'|'skip'|'force', onProgress }) -> { ok, receipt } | { ok:false, aborted?, reason? } */
  async function run(opts = {}) {
    if (active) return { ok: false, error: 'busy' }
    if (!cache) return { ok: false, error: 'scan-first' }
    const ctl = active = { aborted: false }
    const send = p => { try { if (opts.onProgress) opts.onProgress(p) } catch { /* progress is best effort */ } }
    try {
      const p = prefs()
      const deprovision = typeof opts.deprovision === 'boolean' ? opts.deprovision : p.deprovision
      const before = cache
      const present = new Set(before.items.filter(i => i.state === 'on').map(i => i.id))
      const { items, skipped } = runLib.plan(opts.ids, { present, shield: p.shield })
      if (!items.length) return { ok: false, error: 'nothing-to-do', skipped }
      const started = now()
      const needsRp = opts.restorePoint === 'force' || (opts.restorePoint !== 'skip' && (items.some(i => i.kind === 'appx' || i.kind === 'feature') || items.length > 5))
      let restorePoint = null
      if (needsRp) {
        send({ kind: 'run', phase: 'rp' })
        const rp = await deps.createRestorePoint()
        restorePoint = { ok: !!(rp && rp.ok), reason: rp && rp.reason, guidance: rp && rp.guidance }
        if (!restorePoint.ok) return { ok: false, aborted: true, reason: restorePoint.reason || 'restore-point-failed', guidance: restorePoint.guidance }
      }
      const batchId = crypto.randomBytes(6).toString('hex')
      const rows = []
      const byId = new Map(before.items.map(i => [i.id, i]))
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        if (ctl.aborted) break
        send({ kind: 'run', phase: 'start', id: it.id, index: i, count: items.length })
        let res = { ok: false, error: 'not-run' }, failures = null
        try {
          res = await deps.runRecorded('debloat:' + it.id, 'apply', { via: 'manual', batchId, onFailures: f => { failures = f } },
            (ps, cmd, note) => runLib.execute(it, deps, { ps, note }, { deprovision, family: (byId.get(it.id) || {}).family, isProtectedService: deps.isProtectedService }))
          if (res.ok && failures && failures.length) res = { ok: false, error: failures.map(f => f.err).join('; ').slice(0, 200) }
        } catch (e) { res = { ok: false, error: String((e && e.message) || e).slice(0, 200) } }
        rows.push({ id: it.id, kind: it.kind, ok: !!res.ok, error: res.ok ? null : res.error, restart: !!res.restart })
        send({ kind: 'run', phase: 'done', id: it.id, ok: !!res.ok, error: res.ok ? null : res.error, index: i, count: items.length, restart: !!res.restart })
      }
      // Measured, not estimated: scan again and compare the very items that were run.
      const done = new Set(rows.filter(r => r.ok).map(r => r.id))
      const idsRun = new Set(rows.map(r => r.id))
      let after = null
      try { const s = await scan(); after = s.ok ? s.model : null } catch { /* the receipt still lists the rows */ }
      const sumOf = (model, only) => { let ram = 0, disk = 0, wakes = 0; for (const x of model.items) if (only.has(x.id) && x.state === 'on') { ram += x.ram || 0; disk += x.disk || 0; wakes += footprint.taskTicks(x, model.ts).length } return { ram, disk, wakes } }
      const b = sumOf(before, idsRun), a = after ? sumOf(after, idsRun) : null
      const receipt = {
        batchId, ts: now(), ms: now() - started, aborted: !!ctl.aborted, rows, skipped, restorePoint, deprovision,
        counts: Object.fromEntries(catalog.LAYERS.map(l => [l, rows.filter(r => r.ok && catalog.LAYER_OF[r.kind] === l).length])),
        failed: rows.filter(r => !r.ok).map(r => r.id), restartNeeded: rows.some(r => r.restart),
        delta: a ? { ram: [b.ram, a.ram], disk: [b.disk, a.disk], wakes: [b.wakes, a.wakes] } : null,
      }
      const s = load()
      for (const id of done) s.removed[id] = started
      s.runs = [{ batchId, ts: receipt.ts, ids: [...done], deprovision, failed: receipt.failed.length }, ...(s.runs || [])].slice(0, MAX_RUNS)
      save(s)
      return { ok: true, receipt, drift: after ? drift(after) : [] }
    } finally { active = null }
  }

  const abort = () => { if (active) active.aborted = true; return !!active }

  /** After an undo: these ids are meant to be on again, so Guard must stop calling them drift. */
  function forget(ids) {
    const s = load()
    for (const id of ids || []) delete s.removed[id]
    save(s)
  }

  const setGuard = mode => { const s = load(); s.guard = { mode: ['off', 'update', 'quiet'].includes(mode) ? mode : 'off' }; save(s); return s.guard }

  /** Background check (main calls it at start-up for Premium users). Returns { ran, drift, reapplied? }. */
  async function guardCheck(facts) {
    const s = load()
    if (!guardLib.due(s.guard, s.last, facts, now())) return { ran: false, drift: [] }
    const sc = await scan()
    if (!sc.ok) return { ran: true, drift: [] }
    const d = sc.drift
    if (d.length && s.guard.mode === 'quiet') {
      const r = await run({ ids: d.map(x => x.id), restorePoint: 'auto' })
      return { ran: true, drift: d, reapplied: r.ok ? r.receipt.rows.filter(x => x.ok).length : 0 }
    }
    return { ran: true, drift: d }
  }

  return { scan, run, abort, cached: () => cache, summary, prefs, setPrefs, drift, forget, setGuard, guardCheck, wayback, handlers: wayback.handlers, verdicts }
}

module.exports = { create, DEFAULT_STATE, catalog, probe, model: require('./model'), classify: classifyLib, footprint, run: runLib, guard: guardLib, wayback: waybackLib }
