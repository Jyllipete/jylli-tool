'use strict'
// CPU & Memory service: scan (one read-only probe), run (journaled batch, then READ AGAIN to verify), history, undo, live sampling,
// and the Lab actions (free standby, consumers, core plans, per-program priority). Every side effect comes in through `deps`, so tests drive it with fakes.
//   deps: { runPS(script, ms)->{ok,out,err}, applyBatch(req), journalList(opts), undo(target,{force}), runRecorded(control, action, meta, fn(ps))->any,
//           tweakMeta(ids), applicability()->{id:{show,state,why}}, settings()->object, caps()->capabilities|null, isPremium()->bool,
//           state:{read(),write(obj)}, bootMs?(), now?(), spawnLive?({script,onLine,onExit})->{kill()}, gameRunning?()->bool, gameNames?()->[exe],
//           emit?(channel, payload), schedule?(fn, ms) }
const catalog = require('./catalog')
const detect = require('./detect')
const topology = require('./topology')
const affinity = require('./affinity')
const memory = require('./memory')
const live = require('./live')
const findings = require('./findings')
const actions = require('./actions')
const { buildModel } = require('./model')

const DEFAULT_STATE = { last: null, applied: {}, runs: [], rules: {}, pinned: {}, priority: {} }
const MAX_RUNS = 30, MAX_IDS = 60
const HEARTBEAT_TIMEOUT_MS = 45000
const WATCHDOG_MS = 15000
const PIN_RETRY_MS = [4000, 15000]       // a game spawns its processes over its first seconds: pin again once after the first try

function create(deps) {
  const now = deps.now || Date.now
  const emit = (ch, p) => { try { deps.emit && deps.emit(ch, p) } catch { /* events are best effort */ } }
  const schedule = deps.schedule || ((fn, ms) => { const t = setTimeout(fn, ms); if (t.unref) t.unref(); return t })
  let cache = null, active = null
  let proc = null, beat = 0, watchdog = null, wanted = false, paused = null, lastFrame = null
  const win = live.createWindow(120)

  const load = () => ({ ...DEFAULT_STATE, ...(deps.state.read() || {}) })
  const save = s => { try { deps.state.write(s) } catch { /* state is best effort */ } }
  const premium = () => { try { return deps.isPremium ? deps.isPremium() === true : false } catch { return false } }

  async function read() {
    let r = null
    try { r = await deps.runPS(detect.buildScript(), 90000) } catch { r = null }
    const parsed = r && r.out ? detect.parse(r.out) : null
    if (parsed) { const s = load(); s.last = { when: now(), r: parsed.r, f: parsed.f }; save(s); return { ...parsed, when: now(), stale: false } }
    const s = load()
    return s.last ? { r: s.last.r, f: s.last.f, when: s.last.when, stale: true } : { r: null, f: null, when: null, stale: false }
  }

  function modelFrom(c) {
    const ids = catalog.ids()
    const meta = Object.fromEntries((safe(() => deps.tweakMeta(ids), []) || []).map(m => [m.id, m]))
    const applic = safe(() => deps.applicability(), {}) || {}
    const settings = safe(() => deps.settings(), {}) || {}
    const remembered = {}
    for (const id of ids) remembered[id] = settings['tweak_' + id] || 'default'
    const s = load(), boot = safe(() => deps.bootMs(), 0) || 0
    const restart = Object.keys(s.applied || {}).filter(id => s.applied[id] > boot && remembered[id] === 'applied' && ((meta[id] && meta[id].risk && meta[id].risk.reboot) || (catalog.byId[id] && catalog.byId[id].reboot)))
    const liveState = c.r ? detect.evaluate(c.r) : null
    return buildModel({ live: liveState, remembered, meta, applic, restart, when: c.when, premium: premium() })
  }

  // What the page draws that is not a switch: topology (+ the core plans that apply), memory modules, the findings that follow from them.
  function factsFrom(c, model) {
    const f = (c && c.f) || {}
    const caps = safe(() => deps.caps(), null)
    const hint = { x3d: !!(caps && caps.cpu && caps.cpu.x3d) }
    const topo = topology.build(f, hint)
    const mods = memory.modules(f.sticks, f.slots)
    const scheme = findings.schemeKind(f.scheme)
    const status = model ? Object.fromEntries(model.items.map(i => [i.id, i.status])) : {}
    const plans = affinity.plans(topo).map(p => ({ kind: p.kind, count: p.count, total: p.total, cpus: p.cpus, mask: p.mask }))
    return {
      cpu: f.cpu || null, baseMHz: (f.cpu && f.cpu.baseMHz) || 0, scheme, topo, plans, mods, vbs: f.vbs == null ? null : !!f.vbs, hvci: f.hvci == null ? null : !!f.hvci,
      findings: findings.statics({ caps, topo, mods, status, scheme, base: (f.cpu && f.cpu.baseMHz) || 0 }),
    }
  }

  function snapshot(c) {
    const model = modelFrom(c)
    return { model, facts: factsFrom(c, model), when: c.when, stale: !!c.stale, read: !!c.r }
  }

  async function scan() {
    const c = await read()
    cache = c
    return { ok: true, ...snapshot(c), rules: rulesView(), premium: premium() }
  }
  const cached = () => {
    if (!cache) { const s = load(); if (!s.last) return null; cache = { r: s.last.r, f: s.last.f, when: s.last.when, stale: true } }
    return { ok: true, ...snapshot(cache), rules: rulesView(), premium: premium() }
  }

  /** ids: catalog ids. action 'apply' | 'restore'. A retired switch can only be restored; a Premium switch needs Premium. */
  async function run({ ids, action = 'apply', label = 'cpumem', onProgress } = {}) {
    if (active) return { ok: false, error: 'busy' }
    const act = action === 'restore' ? 'restore' : 'apply'
    const known = [...new Set(ids || [])].filter(id => typeof id === 'string' && catalog.isKnown(id)).slice(0, MAX_IDS)
    const meta = Object.fromEntries((safe(() => deps.tweakMeta(known), []) || []).map(m => [m.id, m]))
    const retired = id => catalog.byId[id].lane === 'retired' || !!(meta[id] && meta[id].retired)
    const allowed = known.filter(id => act === 'restore' || !retired(id))
    const locked = allowed.filter(id => catalog.isPremium(id) && !premium() && act === 'apply')
    const want = allowed.filter(id => !locked.includes(id))
    if (!want.length) return { ok: false, error: locked.length ? 'premium_required' : 'nothing-to-do', locked }
    active = { ids: want, act }
    const progress = p => { try { onProgress && onProgress(p) } catch { /* progress is best effort */ } }
    try {
      progress({ kind: 'run', phase: 'start', total: want.length, action: act })
      const b = await deps.applyBatch({ items: want.map(id => ({ tweakId: id, action: act })), via: 'manual', restorePoint: 'auto', label })
      if (b && b.aborted) { progress({ kind: 'run', phase: 'done', aborted: true }); return { ok: false, aborted: true, reason: b.reason || 'restore-point-failed', guidance: b.guidance || null, restorePoint: b.restorePoint || null } }
      if (act === 'apply') { const s = load(); for (const i of (b.items || [])) if (i.status === 'ok') s.applied[i.id] = now(); save(s) }
      progress({ kind: 'run', phase: 'verify' })
      const c = await read()
      cache = c
      const snap = snapshot(c)
      const items = (b.items || []).map(i => {
        const row = snap.model.items.find(x => x.id === i.id)
        return { id: i.id, status: i.status, error: i.error || null, journalId: i.journalId || null, fidelity: i.fidelity || null, verified: i.status === 'ok' ? verify(act, row) : null, live: row ? row.status : null }
      })
      for (const id of locked) items.push({ id, status: 'locked', error: null, journalId: null, fidelity: null, verified: null, live: null })
      const counts = { ok: items.filter(i => i.status === 'ok').length, failed: items.filter(i => ['failed', 'partial', 'blocked', 'unknown', 'skipped'].includes(i.status)).length, locked: locked.length,
        verified: items.filter(i => i.verified === true).length, mismatch: items.filter(i => i.verified === false).length, restart: items.filter(i => i.live === 'restart').length }
      const receipt = { ok: !!b.ok, batchId: b.batchId || null, action: act, at: now(), items, counts, restorePoint: b.restorePoint || null, restartNeeded: items.filter(i => i.live === 'restart').map(i => i.id) }
      const s = load(); s.runs = [{ batchId: receipt.batchId, at: receipt.at, action: act, counts }, ...(s.runs || [])].slice(0, MAX_RUNS); save(s)
      progress({ kind: 'run', phase: 'done' })
      return { ok: true, receipt, ...snap, rules: rulesView(), premium: premium() }
    } catch (e) {
      progress({ kind: 'run', phase: 'done', failed: true })
      return { ok: false, error: String((e && e.message) || e).slice(0, 200) }
    } finally { active = null }
  }

  // The same change, read back: did Windows end up where we asked? null = cannot be read (no probe) or waits for a restart.
  function verify(act, row) {
    if (!row || row.status === 'unknown' || row.status === 'restart') return null
    return act === 'apply' ? row.status === 'on' : row.status === 'off'
  }

  function history() {
    const ids = new Set(catalog.ids())
    const entries = safe(() => deps.journalList({ limit: 800 }), []) || []
    const mine = e => e && ((e.tweakId && ids.has(e.tweakId)) || (typeof e.control === 'string' && e.control.startsWith('cpumem:')))
    const rows = entries.filter(mine).map(e => ({ id: e.id, batchId: e.batchId || e.id, tweakId: e.tweakId || null, control: e.control || null, action: e.action, via: e.via, ts: e.ts, result: e.result, fidelity: e.fidelity, undone: !!e.undoneBy, undoes: e.undoes || null }))
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
    return { ...r, ...snapshot(c), rules: rulesView() }
  }

  // ── Live sampling: one counter poller while the tab is open and visible. It stops by itself without a heartbeat, and never runs while a game does.
  function liveStart() {
    wanted = true; beat = now()
    if (!deps.spawnLive) return { ok: false, error: 'unavailable' }
    if (deps.gameRunning && deps.gameRunning()) { setPaused('game'); return { ok: true, paused: 'game' } }
    if (!proc) spawn()
    if (!watchdog) { watchdog = setInterval(() => { if (now() - beat > HEARTBEAT_TIMEOUT_MS) liveStop() }, WATCHDOG_MS); if (watchdog.unref) watchdog.unref() }
    return { ok: true, paused: null }
  }
  function spawn() {
    paused = null
    // the base clock may not be known yet when the poller starts (the first scan is still running): ask again for every line
    const baseNow = () => (cache && cache.f && cache.f.cpu && cache.f.cpu.baseMHz) || (load().last && load().last.f && load().last.f.cpu && load().last.f.cpu.baseMHz) || 0
    let buf = ''
    const me = deps.spawnLive({
      script: live.buildScript(),
      onLine: chunk => {
        buf += chunk
        let i
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1)
          const f = live.parseLine(line, baseNow())
          if (f) { lastFrame = f; win.push(f); emit('cpumem2-live', { frame: f }) }
        }
      },
      onExit: () => { if (proc === me) { proc = null; if (wanted && !paused) emit('cpumem2-live', { ended: true }) } },
    })
    proc = me
  }
  function killProc() { const p = proc; proc = null; try { p && p.kill() } catch { /* already gone */ } }
  function setPaused(why) { paused = why; killProc(); emit('cpumem2-live', { paused: why }) }
  function liveStop() {
    wanted = false; paused = null; killProc(); win.clear(); lastFrame = null
    if (watchdog) { clearInterval(watchdog); watchdog = null }
  }
  const heartbeat = () => { beat = now(); return { ok: true, running: !!proc, paused } }

  // ── Lab: core plans
  const rulesView = () => { const s = load(); return { rules: s.rules || {}, pinned: s.pinned || {}, priority: s.priority || {} } }

  function planOf(kind) {
    if (!cache) cached()
    const f = cache && cache.f
    if (!f) return null
    const caps = safe(() => deps.caps(), null)
    return affinity.planFor(topology.build(f, { x3d: !!(caps && caps.cpu && caps.cpu.x3d) }), kind)
  }

  /** Pins every running process of `exe` to a plan now. remember: also pin it automatically whenever the game starts. */
  async function pin({ exe, kind, remember = false } = {}) {
    if (!premium()) return { ok: false, error: 'premium_required' }
    if (!affinity.validExe(exe)) return { ok: false, error: 'bad-exe' }
    const plan = planOf(kind)
    if (!plan) return { ok: false, error: 'plan-not-available' }
    const r = await deps.runPS(actions.pinScript(exe, plan.mask), 20000)
    const res = actions.parsePin(r && r.out)
    if (!res) return { ok: false, error: 'script-failed' }
    const s = load(), key = String(exe).toLowerCase()
    if (res.pinned > 0) s.pinned[key] = { kind, mask: plan.mask, at: now() }
    if (remember) s.rules[key] = kind
    save(s)
    return { ok: true, processes: res.pinned, failed: res.failed, count: plan.count, total: plan.total, remembered: !!remember, ...rulesView() }
  }

  /** Gives every running process of `exe` all processors back; forget = also drop the automatic rule. */
  async function unpin({ exe, forget = false } = {}) {
    if (!premium()) return { ok: false, error: 'premium_required' }
    if (!affinity.validExe(exe)) return { ok: false, error: 'bad-exe' }
    const c = cache || (cached() && cache)
    const topo = c && c.f ? topology.build(c.f, {}) : null
    if (!topo || !topo.ok) return { ok: false, error: 'no-topology' }
    const r = await deps.runPS(actions.pinScript(exe, affinity.maskOf(topo.cpus.map(x => x.n))), 20000)
    const res = actions.parsePin(r && r.out)
    const s = load(), key = String(exe).toLowerCase()
    delete s.pinned[key]; if (forget) delete s.rules[key]
    save(s)
    return { ok: true, released: res ? res.pinned : 0, ...rulesView() }
  }

  /** The game watcher calls this when a game starts: a remembered plan is applied (twice, because games spawn processes over several seconds). */
  function gameStarted(exe) {
    const key = String(exe || '').toLowerCase()
    if (wanted) setPaused('game')
    const kind = (load().rules || {})[key]
    if (!kind || !premium()) return { ok: true, applying: false }
    for (const ms of PIN_RETRY_MS) schedule(() => { pin({ exe: key, kind }).then(r => emit('cpumem2-pin', { exe: key, kind, ...r })).catch(() => {}) }, ms)
    return { ok: true, applying: true, kind }
  }
  function gameEnded() {
    const s = load()
    if (Object.keys(s.pinned || {}).length) { s.pinned = {}; save(s) }   // affinity ends with the process
    if (wanted && now() - beat <= HEARTBEAT_TIMEOUT_MS) { paused = null; emit('cpumem2-live', { resumed: true }); if (!proc && deps.spawnLive) spawn() }
  }

  // ── Lab: per-program CPU priority (IFEO PerfOptions), journaled so History can undo it
  async function priority({ exe, level } = {}) {
    if (!premium()) return { ok: false, error: 'premium_required' }
    if (!affinity.validExe(exe) || !actions.PRIORITY[level]) return { ok: false, error: 'bad-input' }
    const batchId = 'cpumem-prio-' + now()
    const lines = actions.prioritySetLines(exe, level)
    const failed = await deps.runRecorded('cpumem:priority:' + String(exe).toLowerCase(), 'apply', { via: 'manual', batchId }, async ps => { for (const l of lines) await ps(l) })
    void failed
    const s = load(); s.priority[String(exe).toLowerCase()] = level; save(s)
    return { ok: true, ...(await readPriorities()) }
  }
  async function priorityClear({ exe } = {}) {
    if (!premium()) return { ok: false, error: 'premium_required' }
    if (!affinity.validExe(exe)) return { ok: false, error: 'bad-input' }
    const batchId = 'cpumem-prio-' + now()
    await deps.runRecorded('cpumem:priority:' + String(exe).toLowerCase(), 'apply', { via: 'manual', batchId }, async ps => { for (const l of actions.priorityClearLines(exe)) await ps(l) })
    const s = load(); delete s.priority[String(exe).toLowerCase()]; save(s)
    return { ok: true, ...(await readPriorities()) }
  }
  /** What Windows really has for the programs Jylli set (not what it remembers). */
  async function readPriorities() {
    const s = load(), exes = Object.keys(s.priority || {})
    if (!exes.length) return { priorities: {} }
    const r = await deps.runPS(actions.priorityReadScript(exes), 15000)
    const real = actions.parsePriorities(r && r.out)
    return { priorities: real || {}, unread: !real }
  }

  // ── Overview actions
  async function freeStandby() {
    const r = await deps.runPS(actions.purgeScript(), 30000)
    const p = actions.parsePurge(r && r.out)
    if (!p) return { ok: false, error: 'script-failed' }
    return { ok: p.ok, accepted: p.ok, beforeMB: p.beforeMB, afterMB: p.afterMB, freedMB: p.freedMB }
  }
  async function consumers() {
    if (deps.gameRunning && deps.gameRunning()) return { ok: true, game: true }
    const f = (cache && cache.f) || (load().last && load().last.f) || {}
    const r = await deps.runPS(actions.consumersScript(), 20000)
    if (!r || !r.out) return { ok: false, error: 'script-failed' }
    const games = safe(() => deps.gameNames(), []) || []
    return { ok: true, ...actions.parseConsumers(r.out, { cores: (f.cpu && f.cpu.threads) || 1, games }), at: now() }
  }

  function shutdown() { liveStop() }
  const frames = () => win.frames()

  return { scan, cached, run, history, undo, liveStart, liveStop, heartbeat, freeStandby, consumers, pin, unpin, priority, priorityClear, readPriorities, gameStarted, gameEnded, shutdown, frames, lastFrame: () => lastFrame, busy: () => !!active, running: () => !!proc }
}

function safe(fn, fallback) { try { const v = fn(); return v === undefined ? fallback : v } catch { return fallback } }

module.exports = { create, HEARTBEAT_TIMEOUT_MS }
