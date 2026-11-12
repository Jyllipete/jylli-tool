'use strict'
// Windows service: scan (one read-only probe -> live state of every switch), run (journaled batch, then READ AGAIN to verify), history, undo.
// Every side effect comes in through `deps`, so tests drive it with fakes.
//   deps: { runPS(script, ms)->{ok,out,err}, applyBatch(req)->batch result (lib/journal-service), journalList(opts)->entries, undo(target, {force})->result,
//           tweakMeta(ids)->[{id, safetyTier, gamerImpact, retired, risk, fidelity}], applicability()->{id:{show,state,why}}, settings()->object (tweak_<id>),
//           state: { read()->obj, write(obj) }, bootMs?()->ms of the last boot, now?() }
const catalog = require('./catalog')
const detect = require('./detect')
const { buildModel } = require('./model')

const DEFAULT_STATE = { last: null, applied: {}, runs: [] }
const MAX_RUNS = 30
const MAX_IDS = 120

function create(deps) {
  const now = deps.now || Date.now
  let cache = null, active = null

  const load = () => ({ ...DEFAULT_STATE, ...(deps.state.read() || {}) })
  const save = s => { try { deps.state.write(s) } catch { /* state is best effort */ } }

  async function read() {
    let r = null
    try { r = await deps.runPS(detect.buildScript(), 60000) } catch { r = null }
    const readings = r && r.out ? detect.parse(r.out) : null
    if (readings) { const s = load(); s.last = { when: now(), readings }; save(s); return { readings, when: now(), stale: false } }
    const s = load()
    return s.last ? { readings: s.last.readings, when: s.last.when, stale: true } : { readings: null, when: null, stale: false }
  }

  function modelsFrom(c) {
    const ids = catalog.ids()
    const metaList = safe(() => deps.tweakMeta(ids), [])
    const meta = Object.fromEntries(metaList.map(m => [m.id, m]))
    const applic = safe(() => deps.applicability(), {}) || {}
    const settings = safe(() => deps.settings(), {}) || {}
    const remembered = {}
    for (const id of ids) remembered[id] = settings['tweak_' + id] || 'default'
    const s = load(), boot = safe(() => deps.bootMs(), 0) || 0
    const restart = Object.keys(s.applied || {}).filter(id => s.applied[id] > boot && remembered[id] === 'applied' && ((meta[id] && meta[id].risk && meta[id].risk.reboot) || (catalog.byId[id] && catalog.byId[id].reboot)))
    const live = c.readings ? detect.evaluate(c.readings) : null
    const out = {}
    for (const scope of ['windows', 'qol']) out[scope] = buildModel({ scope, live, remembered, meta, applic, restart, when: c.when })
    return out
  }

  async function scan() {
    const c = await read()
    cache = c
    const models = modelsFrom(c)
    return { ok: true, models, stale: !!c.stale, when: c.when, read: !!c.readings }
  }

  /** ids: catalog ids. action 'apply' | 'restore'. A retired switch can only be restored. */
  async function run({ ids, action = 'apply', label = 'windows', onProgress } = {}) {
    if (active) return { ok: false, error: 'busy' }
    const act = action === 'restore' ? 'restore' : 'apply'
    const metaList = safe(() => deps.tweakMeta((ids || []).filter(catalog.isKnown)), [])
    const meta = Object.fromEntries(metaList.map(m => [m.id, m]))
    const want = [...new Set(ids || [])].filter(id => typeof id === 'string' && catalog.isKnown(id)).slice(0, MAX_IDS)
      .filter(id => act === 'restore' || !(catalog.byId[id].lane === 'retired' || (meta[id] && meta[id].retired)))
    if (!want.length) return { ok: false, error: 'nothing-to-do' }
    active = { ids: want, act }
    const emit = p => { try { onProgress && onProgress(p) } catch { /* progress is best effort */ } }
    try {
      emit({ kind: 'run', phase: 'start', total: want.length, action: act })
      const b = await deps.applyBatch({ items: want.map(id => ({ tweakId: id, action: act })), via: 'manual', restorePoint: 'auto', label })
      if (b && b.aborted) { emit({ kind: 'run', phase: 'done', aborted: true }); return { ok: false, aborted: true, reason: b.reason || 'restore-point-failed', guidance: b.guidance || null, restorePoint: b.restorePoint || null } }
      const okIds = (b.items || []).filter(i => i.status === 'ok').map(i => i.id)
      if (act === 'apply') { const s = load(); for (const id of okIds) s.applied[id] = now(); save(s) }
      emit({ kind: 'run', phase: 'verify' })
      const c = await read()
      cache = c
      const models = modelsFrom(c)
      const items = (b.items || []).map(i => {
        const row = models.windows.items.concat(models.qol.items).find(x => x.id === i.id)
        return { id: i.id, status: i.status, error: i.error || null, journalId: i.journalId || null, fidelity: i.fidelity || null, verified: i.status === 'ok' ? verify(act, row) : null, live: row ? row.status : null }
      })
      const counts = { ok: items.filter(i => i.status === 'ok').length, failed: items.filter(i => i.status === 'failed' || i.status === 'partial' || i.status === 'blocked' || i.status === 'unknown' || i.status === 'skipped').length,
        verified: items.filter(i => i.verified === true).length, mismatch: items.filter(i => i.verified === false).length, restart: items.filter(i => i.live === 'restart').length }
      const receipt = { ok: !!b.ok, batchId: b.batchId || null, action: act, at: now(), items, counts, restorePoint: b.restorePoint || null, restartNeeded: items.filter(i => i.live === 'restart').map(i => i.id) }
      const s = load(); s.runs = [{ batchId: receipt.batchId, at: receipt.at, action: act, counts }, ...(s.runs || [])].slice(0, MAX_RUNS); save(s)
      emit({ kind: 'run', phase: 'done' })
      return { ok: true, receipt, models, when: c.when, stale: !!c.stale }
    } catch (e) {
      emit({ kind: 'run', phase: 'done', failed: true })
      return { ok: false, error: String((e && e.message) || e).slice(0, 200) }
    } finally { active = null }
  }

  // The same change, read back: did Windows end up where we asked? null = cannot be read (no probe) or waits for a restart.
  function verify(act, row) {
    if (!row || row.status === 'unknown' || row.status === 'restart') return null
    if (act === 'apply') return row.status === 'on'
    return row.status === 'off'
  }

  /** Journal entries of the Windows switches, newest first, grouped by batch. */
  function history() {
    const ids = new Set(catalog.ids())
    const entries = safe(() => deps.journalList({ limit: 600 }), []) || []
    const rows = entries.filter(e => e && e.tweakId && ids.has(e.tweakId)).map(e => ({
      id: e.id, batchId: e.batchId || e.id, tweakId: e.tweakId, action: e.action, via: e.via, ts: e.ts, result: e.result, fidelity: e.fidelity, undone: !!e.undoneBy, undoes: e.undoes || null,
    }))
    const batches = []
    for (const r of rows) {
      let b = batches.find(x => x.batchId === r.batchId)
      if (!b) { b = { batchId: r.batchId, ts: r.ts, via: r.via, entries: [] }; batches.push(b) }
      b.entries.push(r)
      if (r.ts > b.ts) b.ts = r.ts
    }
    batches.sort((a, b) => b.ts - a.ts)
    return { ok: true, batches: batches.slice(0, 60), runs: load().runs }
  }

  async function undo(target, { force = false } = {}) {
    if (active) return { ok: false, error: 'busy' }
    const r = await deps.undo(target, { force })
    const c = await read(); cache = c
    return { ...r, models: modelsFrom(c), when: c.when }
  }

  function summary() {
    if (!cache) { const s = load(); if (!s.last) return null; cache = { readings: s.last.readings, when: s.last.when, stale: true } }
    const v = modelsFrom(cache).windows.verdict
    return { set: v.set, total: v.total, drifted: v.drifted, rec: v.rec, restart: v.restart, when: cache.when }
  }

  const cached = () => (cache ? { ok: true, models: modelsFrom(cache), when: cache.when, stale: !!cache.stale, read: !!cache.readings } : null)

  return { scan, run, history, undo, summary, cached, busy: () => !!active }
}

function safe(fn, fallback) { try { const v = fn(); return v === undefined ? fallback : v } catch { return fallback } }

module.exports = { create }
