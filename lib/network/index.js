'use strict'
// Network service: scan (one read-only probe -> live state of every switch + the facts), run (journaled batch, then READ AGAIN to verify),
// dnsSet (one resolver choice), checkup (switches + route trace + DNS benchmark -> findings), live route trace, history, undo.
// Every side effect comes in through `deps`, so tests drive it with fakes.
//   deps: { runPS(script, ms)->{ok,out,err}, applyBatch(req), journalList(opts), undo(target, {force}), tweakMeta(ids), applicability()->{id:{show,state,why}},
//           settings()->object, saveSettings(patch)->bool, state:{read(),write(obj)}, bootMs?(), now?(),
//           benchDns([{name, server}])->[{name, server, fail, median}], speedHistory()->[{t, latencyMs, loadedLatencyMs}],
//           spawn(cmd, args, opts), lookup4(host)->ip|null, emit(channel, payload), roundTimeoutMs? (tests) }
const catalog = require('./catalog')
const detect = require('./detect')
const { buildModel } = require('./model')
const Path = require('./path')
const Findings = require('./findings')
const Rt = require('../fivem/route')
const Verdict = require('../fivem/route-verdict')

const DEFAULT_STATE = { last: null, applied: {}, runs: [], checkups: [], lastCheckup: null }
const MAX_RUNS = 30, MAX_IDS = 60, MAX_CHECKUPS = 10
const CHECKUP_ROUNDS = 12, CHECKUP_TARGET = '1.1.1.1', ROUND_TIMEOUT_MS = 30000
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/
const HOST = /^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/

/** Custom resolver input -> { ok, primary, secondary } | { ok:false, error }. IPv4 only, secondary optional, never the same twice, never 0.0.0.0 / 255.255.255.255. */
function validateDns(primary, secondary) {
  const p = String(primary || '').trim(), s = String(secondary || '').trim()
  const bad = a => !IPV4.test(a) || a === '0.0.0.0' || a === '255.255.255.255' || a.startsWith('127.')
  if (!p) return { ok: false, error: 'primary-missing' }
  if (bad(p)) return { ok: false, error: 'primary-invalid' }
  if (s && bad(s)) return { ok: false, error: 'secondary-invalid' }
  if (s && s === p) return { ok: false, error: 'same' }
  return { ok: true, primary: p, secondary: s }
}

function create(deps) {
  const now = deps.now || Date.now
  const emit = (ch, p) => { try { deps.emit && deps.emit(ch, p) } catch { /* the page went away */ } }
  let cache = null, active = null, checkupBusy = false
  let liveState = null, liveMeta = null, live = null, cuPoller = null

  const load = () => ({ ...DEFAULT_STATE, ...(deps.state.read() || {}) })
  const save = s => { try { deps.state.write(s) } catch { /* state is best effort */ } }

  async function read() {
    let r = null
    try { r = await deps.runPS(detect.buildScript(), 60000) } catch { r = null }
    const got = r && r.out ? detect.parse(r.out) : null
    if (got) { const s = load(); s.last = { when: now(), readings: got.r, facts: got.f }; save(s); return { readings: got.r, facts: got.f, when: now(), stale: false } }
    const s = load()
    return s.last ? { readings: s.last.readings, facts: s.last.facts, when: s.last.when, stale: true } : { readings: null, facts: null, when: null, stale: false }
  }

  function lastRuns() {
    const out = {}
    const entries = safe(() => deps.journalList({ limit: 600 }), []) || []
    for (const e of entries) {
      const it = e && catalog.byId[e.tweakId]
      if (!it || !it.once || e.action === 'restore' || e.undoneBy) continue
      if (!out[e.tweakId] || e.ts > out[e.tweakId]) out[e.tweakId] = e.ts
    }
    return out
  }

  function modelFrom(c) {
    const ids = catalog.ids()
    const metaList = safe(() => deps.tweakMeta(ids), [])
    const meta = Object.fromEntries(metaList.map(m => [m.id, m]))
    const applic = safe(() => deps.applicability(), {}) || {}
    const settings = safe(() => deps.settings(), {}) || {}
    const remembered = {}
    for (const id of ids) remembered[id] = settings['tweak_' + id] || 'default'
    const s = load(), boot = safe(() => deps.bootMs(), 0) || 0
    const restart = Object.keys(s.applied || {}).filter(id => s.applied[id] > boot && remembered[id] === 'applied' && ((meta[id] && meta[id].risk && meta[id].risk.reboot) || (catalog.byId[id] && catalog.byId[id].reboot)))
    const liveEval = c.readings ? detect.evaluate(c.readings) : null
    const m = buildModel({ live: liveEval, facts: c.facts, remembered, meta, applic, restart, lastRun: lastRuns(), settings, when: c.when })
    m.path = Path.pathOf(null, m.facts)   // the stage before anything is traced: the PC and link nodes come from this read
    return m
  }

  async function scan() {
    const c = await read()
    cache = c
    return { ok: true, model: modelFrom(c), stale: !!c.stale, when: c.when, read: !!c.readings, last: load().lastCheckup }
  }

  /** ids: catalog ids. action 'apply' | 'restore'. A retired switch can only be restored. */
  async function run({ ids, action = 'apply', label = 'network', onProgress } = {}) {
    if (active || checkupBusy) return { ok: false, error: 'busy' }
    const act = action === 'restore' ? 'restore' : 'apply'
    const known = (ids || []).filter(i => typeof i === 'string' && catalog.isKnown(i))
    const metaList = safe(() => deps.tweakMeta(known), [])
    const meta = Object.fromEntries(metaList.map(m => [m.id, m]))
    const want = [...new Set(known)].slice(0, MAX_IDS)
      .filter(id => act === 'restore' || !(catalog.byId[id].lane === 'retired' || (meta[id] && meta[id].retired)))
    if (!want.length) return { ok: false, error: 'nothing-to-do' }
    active = { ids: want, act }
    const emitP = p => { try { onProgress && onProgress(p) } catch { /* progress is best effort */ } }
    try {
      emitP({ kind: 'run', phase: 'start', total: want.length, action: act })
      const b = await deps.applyBatch({ items: want.map(id => ({ tweakId: id, action: act })), via: 'manual', restorePoint: 'auto', label })
      if (b && b.aborted) { emitP({ kind: 'run', phase: 'done', aborted: true }); return { ok: false, aborted: true, reason: b.reason || 'restore-point-failed', guidance: b.guidance || null, restorePoint: b.restorePoint || null } }
      const okIds = (b.items || []).filter(i => i.status === 'ok').map(i => i.id)
      if (act === 'apply') { const s = load(); for (const id of okIds) s.applied[id] = now(); save(s) }
      emitP({ kind: 'run', phase: 'verify' })
      const c = await read()
      cache = c
      const model = modelFrom(c)
      const items = (b.items || []).map(i => {
        const row = model.items.find(x => x.id === i.id)
        const preset = catalog.presetOf(i.id)
        return { id: i.id, status: i.status, error: i.error || null, journalId: i.journalId || null, fidelity: i.fidelity || null,
          verified: i.status === 'ok' ? verify(act, row, preset, i.id, model) : null, live: row ? row.status : null }
      })
      const counts = { ok: items.filter(i => i.status === 'ok').length, failed: items.filter(i => i.status === 'failed' || i.status === 'partial' || i.status === 'blocked' || i.status === 'unknown' || i.status === 'skipped').length,
        verified: items.filter(i => i.verified === true).length, mismatch: items.filter(i => i.verified === false).length, restart: items.filter(i => i.live === 'restart').length }
      const receipt = { ok: !!b.ok, batchId: b.batchId || null, action: act, at: now(), items, counts, restorePoint: b.restorePoint || null, restartNeeded: items.filter(i => i.live === 'restart').map(i => i.id) }
      const s = load(); s.runs = [{ batchId: receipt.batchId, at: receipt.at, action: act, counts }, ...(s.runs || [])].slice(0, MAX_RUNS); save(s)
      emitP({ kind: 'run', phase: 'done' })
      return { ok: true, receipt, model, when: c.when, stale: !!c.stale }
    } catch (e) {
      emitP({ kind: 'run', phase: 'done', failed: true })
      return { ok: false, error: String((e && e.message) || e).slice(0, 200) }
    } finally { active = null }
  }

  // The same change, read back: did Windows end up where we asked? null = cannot be read (no probe, once-only repair) or waits for a restart.
  function verify(act, row, preset, id, model) {
    if (preset) {                                     // a resolver preset is verified against the addresses the adapter really uses
      const cur = model.resolver && model.resolver.current
      if (!model.resolver || !model.resolver.known || !cur) return null
      return act === 'apply' ? cur === preset : cur === 'auto'
    }
    if (!row || row.status === 'unknown' || row.status === 'restart' || row.status === 'once') return null
    if (act === 'apply') return row.status === 'on'
    return row.status === 'off'
  }

  /** One resolver choice. preset: 'auto' | cloudflare | google | quad9 | adguard | custom (custom: {primary, secondary}, validated and remembered first). */
  async function dnsSet({ preset, custom, onProgress } = {}) {
    if (active || checkupBusy) return { ok: false, error: 'busy' }
    if (preset === 'auto') {
      const settings = safe(() => deps.settings(), {}) || {}
      const dnsIds = catalog.ITEMS.filter(i => i.preset).map(i => i.id)
      const applied = dnsIds.filter(id => settings['tweak_' + id] === 'applied')
      return run({ ids: applied.length ? applied : ['dns-cloudflare'], action: 'restore', onProgress })
    }
    if (preset === 'custom') {
      const v = validateDns(custom && custom.primary, custom && custom.secondary)
      if (!v.ok) return { ok: false, error: v.error }
      let saved = false
      try { saved = !!(deps.saveSettings && deps.saveSettings({ customDnsPrimary: v.primary, customDnsSecondary: v.secondary })) } catch { saved = false }
      if (!saved) return { ok: false, error: 'save-failed' }
      return run({ ids: ['dns-custom'], action: 'apply', onProgress })
    }
    const p = catalog.PRESETS.find(x => x.id === preset)
    if (!p) return { ok: false, error: 'unknown-preset' }
    return run({ ids: [p.tweak], action: 'apply', onProgress })
  }

  // ── route trace ────────────────────────────────────────────────────────────────
  function newTrace(onRound) {
    const st = Verdict.create()
    const poller = Rt.create({ spawn: deps.spawn, onRound: r => { Verdict.ingest(st, r); onRound(st, r) } })
    return { st, poller }
  }
  function frame(st, target) {
    const facts = cache ? cache.facts : (load().last || {}).facts || null
    const analysis = Verdict.analyze(st)
    return { target, path: Path.pathOf(analysis, facts), hops: Path.hopsOf(analysis), rounds: st.rounds }
  }

  async function routeStart(host) {
    const h = String(host || CHECKUP_TARGET).trim()
    let ip = null
    if (IPV4.test(h)) ip = h
    else if (HOST.test(h) && deps.lookup4) ip = await deps.lookup4(h)
    if (!ip || !IPV4.test(ip)) return { ok: false, error: 'dns' }
    routeStop()
    liveMeta = { host: h, ip }
    live = newTrace((st) => emit('net2-route', frame(st, liveMeta)))
    liveState = live.st
    const r = live.poller.start(ip)
    if (!r.ok) { live = null; liveState = null; liveMeta = null; return r }
    return { ok: true, host: h, ip }
  }
  function routeStop() {
    if (live) { try { live.poller.stop() } catch { /* gone */ } }
    live = null; liveState = null; liveMeta = null
    return { ok: true }
  }
  const routeSnapshot = () => ({ ok: true, running: !!live, ...(live ? frame(liveState, liveMeta) : {}) })

  // ── checkup ────────────────────────────────────────────────────────────────────
  /** The whole picture in about 25 seconds: switches, a route trace to 1.1.1.1, a DNS benchmark -> findings. onProgress({kind:'checkup', phase, ...}). */
  async function checkup({ onProgress } = {}) {
    if (checkupBusy || active) return { ok: false, error: 'busy' }
    checkupBusy = true
    const step = p => { try { onProgress && onProgress({ kind: 'checkup', ...p }) } catch { /* progress is best effort */ }; emit('net2-progress', { kind: 'checkup', ...p }) }
    try {
      step({ phase: 'switches' })
      const c = await read(); cache = c
      let model = modelFrom(c)

      step({ phase: 'path', done: 0, total: CHECKUP_ROUNDS })
      const analysis = await traceOnce(n => step({ phase: 'path', done: n, total: CHECKUP_ROUNDS }))
      const path = Path.pathOf(analysis, model.facts)

      step({ phase: 'dns' })
      const bench = await dnsBench(model)

      const hist = safe(() => deps.speedHistory(), []) || []
      const speed = hist[0] ? { t: hist[0].t, latencyMs: hist[0].latencyMs, loadedLatencyMs: hist[0].loadedLatencyMs } : null
      const res = Findings.run({ model, path, bench, speed, now: now() })
      const at = now()
      const out = { at, path, hops: Path.hopsOf(analysis), findings: res.findings, healthy: res.healthy, measured: res.measured, bench }
      const s = load()
      s.lastCheckup = out
      s.checkups = [{ at, verdict: path.verdict.id, node: path.verdict.node, findings: res.findings.map(f => f.id), ms: { router: path.nodes[2].ms, internet: path.nodes[4].ms }, dns: bench && bench.current ? bench.current.median : null }, ...(s.checkups || [])].slice(0, MAX_CHECKUPS)
      save(s)
      step({ phase: 'done' })
      return { ok: true, ...out, model }
    } catch (e) {
      step({ phase: 'failed' })
      return { ok: false, error: String((e && e.message) || e).slice(0, 200) }
    } finally { checkupBusy = false; if (cuPoller) { try { cuPoller.stop() } catch { /* gone */ } cuPoller = null } }
  }

  function traceOnce(progress) {
    return new Promise(resolve => {
      let done = false
      const t = newTrace((st) => { emit('net2-route', frame(st, { host: CHECKUP_TARGET, ip: CHECKUP_TARGET, checkup: true })); progress(st.rounds); if (st.rounds >= CHECKUP_ROUNDS) finish() })
      cuPoller = t.poller
      const timer = setTimeout(finish, deps.roundTimeoutMs || ROUND_TIMEOUT_MS)
      function finish() {
        if (done) return
        done = true; clearTimeout(timer)
        try { t.poller.stop() } catch { /* gone */ }
        cuPoller = null
        resolve(t.st.rounds ? Verdict.analyze(t.st) : null)
      }
      const r = t.poller.start(CHECKUP_TARGET)
      if (!r.ok) finish()
    })
  }

  async function dnsBench(model) {
    if (!deps.benchDns) return null
    const list = catalog.PRESETS.map(p => ({ name: p.id, server: p.bench, preset: p.id, tweak: p.tweak }))
    const cur = model.resolver && model.resolver.servers[0]
    const curKnown = cur && IPV4.test(cur)
    if (curKnown && !list.some(p => p.server === cur)) list.push({ name: 'current', server: cur })
    let rows = []
    try { rows = await deps.benchDns(list.map(p => ({ name: p.name, server: p.server }))) } catch { rows = [] }
    const by = Object.fromEntries((rows || []).map(r => [r.name, r]))
    const row = r => { const fail = !r || !!r.fail || !Number.isFinite(r.median); return { fail, median: fail ? null : r.median } }
    const results = catalog.PRESETS.map(p => ({ name: p.id, preset: p.id, tweak: p.tweak, server: p.bench, ...row(by[p.id]) }))
    let current = null
    if (curKnown) {
      const hit = results.find(r => r.server === cur) || (by.current ? { ...row(by.current) } : null)
      if (hit) current = { server: cur, fail: hit.fail, median: hit.median }
    }
    return { results: results.sort((a, b) => (a.median == null) - (b.median == null) || a.median - b.median), current }
  }

  /** Journal entries of the Network switches, newest first, grouped by batch. */
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
    const s = load()
    return { ok: true, batches: batches.slice(0, 60), runs: s.runs, checkups: s.checkups || [] }
  }

  async function undo(target, { force = false } = {}) {
    if (active || checkupBusy) return { ok: false, error: 'busy' }
    const r = await deps.undo(target, { force })
    const c = await read(); cache = c
    return { ...r, model: modelFrom(c), when: c.when }
  }

  const cached = () => {
    if (!cache) { const s = load(); if (!s.last) return null; cache = { readings: s.last.readings, facts: s.last.facts, when: s.last.when, stale: true } }
    return { ok: true, model: modelFrom(cache), when: cache.when, stale: !!cache.stale, read: !!cache.readings, last: load().lastCheckup }
  }

  function shutdown() { routeStop(); if (cuPoller) { try { cuPoller.stop() } catch { /* gone */ } cuPoller = null } }

  return { scan, run, dnsSet, checkup, routeStart, routeStop, routeSnapshot, history, undo, cached, shutdown, busy: () => !!(active || checkupBusy) }
}

function safe(fn, fallback) { try { const v = fn(); return v === undefined ? fallback : v } catch { return fallback } }

module.exports = { create, validateDns, CHECKUP_ROUNDS, CHECKUP_TARGET }
