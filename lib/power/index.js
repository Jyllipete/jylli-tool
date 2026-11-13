'use strict'
// Power service "Current": scan (one read-only probe), run (journaled batch, then READ AGAIN to verify), plan switch, plan tidy (exported first, undoable),
// timeouts, wake devices, power mode, history, undo, live sampling and energy sessions. Every side effect comes in through `deps`, so tests drive it with fakes.
//   deps: { runPS(script, ms)->{ok,out,err}, runCmd(cmd, ms)->{ok,out,err,code}, applyBatch(req), journalList(opts), undo(target,{force}),
//           runRecorded(control, action, meta, fn(ps,cmd,note))->any, tweakMeta(ids), applicability()->{id:{show,state,why}}, settings()->object, isPremium()->bool,
//           state:{read(),write(obj)}, planDir:string, fileExists?(path)->bool, bootMs?(), now?(), spawnLive?({script,onLine,onExit})->{kill()}, spawnSmi?({args,onLine,onExit})->{kill()},
//           hub?(keys)->{key:value}, gameRunning?()->bool, gameName?()->string|null, emit?(channel, payload), schedule?(fn, ms)->timer, clearSchedule?(timer) }
const catalog = require('./catalog')
const detect = require('./detect')
const live = require('./live')
const findings = require('./findings')
const plansLib = require('./plans')
const energy = require('./energy')
const overlay = require('../auto-opti/overlay')
const { buildModel } = require('./model')

const DEFAULT_STATE = { last: null, applied: {}, runs: [], sessions: [], price: { perKwh: null, currency: 'EUR' } }
const MAX_RUNS = 30, MAX_IDS = 60, MAX_TIDY = 12
const HEARTBEAT_TIMEOUT_MS = 45000
const WATCHDOG_MS = 15000
const HUB_KEYS = { cpuW: 'cpu.power', gpuW: 'gpu0.power', gpuLoad: 'gpu0.load' }
const TIMEOUTS = [0, 60, 120, 180, 300, 600, 900, 1200, 1800, 2700, 3600, 7200, 10800, 18000]   // seconds, 0 = never
const DEVICE_OK = /^[^"&|<>^%\x00-\x1f]{1,120}$/
const CURRENCY = /^[A-Za-z€$£]{1,4}$/

function create(deps) {
  const now = deps.now || Date.now
  const emit = (ch, p) => { try { deps.emit && deps.emit(ch, p) } catch { /* events are best effort */ } }
  let cache = null, active = null
  let proc = null, smiProc = null, smiLast = null, beat = 0, watchdog = null, wanted = false, paused = null, lastFrame = null
  let session = null
  const win = live.createWindow(120)

  const load = () => ({ ...DEFAULT_STATE, ...(deps.state.read() || {}) })
  const save = s => { try { deps.state.write(s) } catch { /* state is best effort */ } }
  const premium = () => { try { return deps.isPremium ? deps.isPremium() === true : false } catch { return false } }

  async function read() {
    let r = null
    try { r = await deps.runPS(detect.buildScript(), 90000) } catch { r = null }
    const parsed = r && r.out ? detect.parse(r.out) : null
    if (parsed) { const s = load(); s.last = { when: now(), r: parsed.r, f: slim(parsed.f) }; save(s); return { ...parsed, when: now(), stale: false } }
    const s = load()
    return s.last ? { r: s.last.r, f: s.last.f, when: s.last.when, stale: true } : { r: null, f: null, when: null, stale: false }
  }
  // The saved copy keeps what the page draws, without the bulky raw text.
  const slim = f => f

  function modelFrom(c) {
    const ids = catalog.ids()
    const meta = Object.fromEntries((safe(() => deps.tweakMeta(ids), []) || []).map(m => [m.id, m]))
    const applic = safe(() => deps.applicability(), {}) || {}
    const settings = safe(() => deps.settings(), {}) || {}
    const remembered = {}
    for (const id of ids) remembered[id] = settings['tweak_' + id] || 'default'
    const s = load(), boot = safe(() => deps.bootMs(), 0) || 0
    const restart = Object.keys(s.applied || {}).filter(id => s.applied[id] > boot && remembered[id] === 'applied' && ((meta[id] && meta[id].risk && meta[id].risk.reboot) || (catalog.byId[id] && catalog.byId[id].reboot)))
    const liveState = c.r && c.f ? detect.evaluate(c) : null
    return { model: buildModel({ live: liveState, remembered, meta, applic, restart, when: c.when, premium: premium() }), remembered }
  }

  function factsFrom(c, model) {
    const f = c.f
    if (!f) return { read: false, findings: [], price: load().price, sessions: load().sessions || [] }
    const status = model ? Object.fromEntries(model.items.map(i => [i.id, i.status])) : {}
    const onAC = f.battery ? f.battery.state !== 'discharging' : true
    const s = load()
    return {
      read: true, laptop: f.laptop, plans: f.plans, activeGuid: f.activeGuid, activeName: f.activeName, idx: f.idx, battery: f.battery, onAC, trim: f.trim,
      overlayAc: f.overlayAc, overlayDc: f.overlayDc, modernStandby: f.modernStandby, hibernate: f.hibernate, fastStartup: f.fastStartup,
      requests: f.requests, lastWake: f.lastWake, wakeDevices: f.wakeDevices, wakeTimers: f.wakeTimers,
      findings: findings.statics({ laptop: f.laptop, plans: f.plans, activeGuid: f.activeGuid, idx: f.idx, battery: f.battery, overlayAc: f.overlayAc, onAC, status,
        requests: f.requests, wakeDevices: f.wakeDevices, wakeTimers: f.wakeTimers, modernStandby: f.modernStandby }),
      price: s.price, sessions: s.sessions || [],
    }
  }
  function snapshot(c) {
    const { model } = modelFrom(c)
    return { model, facts: factsFrom(c, model), when: c.when, stale: !!c.stale, read: !!c.r }
  }

  async function scan() { const c = await read(); cache = c; return { ok: true, ...snapshot(c), premium: premium() } }
  function cached() {
    if (!cache) { const s = load(); if (!s.last) return null; cache = { r: s.last.r, f: s.last.f, when: s.last.when, stale: true } }
    return { ok: true, ...snapshot(cache), premium: premium() }
  }
  async function refresh() { const c = await read(); cache = c; return snapshot(c) }

  /** ids: catalog ids. action 'apply' | 'restore'. A retired switch can only be restored; a Premium switch needs Premium. */
  async function run({ ids, action = 'apply', label = 'power', onProgress } = {}) {
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
      const snap = await refresh()
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
      return { ok: true, receipt, ...snap, premium: premium() }
    } catch (e) {
      progress({ kind: 'run', phase: 'done', failed: true })
      return { ok: false, error: String((e && e.message) || e).slice(0, 200) }
    } finally { active = null }
  }
  function verify(act, row) {
    if (!row || row.status === 'unknown' || row.status === 'restart') return null
    return act === 'apply' ? row.status === 'on' : row.status === 'off'
  }

  // ── Things the plan switches do not cover. Each one is journaled and read back.
  const meta2 = () => cache && cache.f ? cache.f : null
  const batch = tag => ({ via: 'manual', batchId: 'power2-' + tag + '-' + now() })

  /** Make another plan the active one. */
  async function planSet({ guid } = {}) {
    if (active) return { ok: false, error: 'busy' }
    const g = plansLib.guidKey(guid)
    const f = meta2()
    if (!plansLib.isGuid(g) || !f || !f.plans.some(p => p.guid === g)) return { ok: false, error: 'unknown-plan' }
    active = { plan: g }
    try {
      await deps.runRecorded('power2:plan', 'apply', batch('plan'), async (ps, cmd) => { await cmd('powercfg /setactive ' + g) })
      const snap = await refresh()
      const verified = snap.facts.activeGuid ? snap.facts.activeGuid === g : null
      return { ok: true, verified, ...snap }
    } catch (e) { return fail(e) } finally { active = null }
  }

  /** Display-off or sleep timeout of the ACTIVE plan, for AC or battery. seconds: one of TIMEOUTS (0 = never). */
  async function timeoutSet({ id, side, seconds } = {}) {
    if (active) return { ok: false, error: 'busy' }
    const a = plansLib.byAnat[id]
    if (!a || !a.timeout || (side !== 'ac' && side !== 'dc') || !TIMEOUTS.includes(seconds)) return { ok: false, error: 'invalid' }
    const f = meta2()
    if (!f || !f.activeGuid) return { ok: false, error: 'unread' }
    active = { timeout: id }
    try {
      await deps.runRecorded('power2:timeout:' + id + ':' + side, 'apply', batch('timeout'), async (ps, cmd) => {
        await cmd(`powercfg /set${side}valueindex SCHEME_CURRENT ${a.sub} ${a.setting} ${seconds}`)
        await cmd('powercfg /setactive SCHEME_CURRENT')
      })
      const snap = await refresh()
      const now2 = plansLib.valuesOf(snap.facts.idx, snap.facts.activeGuid, a)[side]
      return { ok: true, verified: now2 == null ? null : now2 === seconds, ...snap }
    } catch (e) { return fail(e) } finally { active = null }
  }

  /** Remove custom plans the user picked. Each is exported to planDir first, so Undo can import it back. Never the active or a built-in plan. */
  async function planTidy({ guids } = {}) {
    if (active) return { ok: false, error: 'busy' }
    const fresh = await read(); cache = fresh
    if (!fresh.f) return { ok: false, error: 'unread' }
    const list = [...new Set((guids || []).map(plansLib.guidKey))].slice(0, MAX_TIDY)
    const targets = list.map(g => fresh.f.plans.find(p => p.guid === g)).filter(p => p && plansLib.deletable(p))
    if (!targets.length) return { ok: false, error: 'nothing-to-do' }
    active = { tidy: true }
    const results = []
    const meta = batch('tidy')
    try {
      for (const p of targets) {
        const file = (deps.planDir || '') + '\\' + p.guid + '.pow'
        const ex = await deps.runCmd(`powercfg /export "${file}" ${p.guid}`, 15000)
        const saved = ex && ex.ok !== false && (deps.fileExists ? deps.fileExists(file) : true)
        if (!saved) { results.push({ guid: p.guid, name: p.name, ok: false, error: 'export-failed' }); continue }
        let removed = false
        await deps.runRecorded('power2:plan-tidy', 'apply', meta, async (ps, cmd, note) => {
          const d = await deps.runCmd('powercfg /delete ' + p.guid, 15000)
          removed = !!d && d.ok !== false
          if (removed) note({ kind: 'power-plan-file', guid: p.guid, name: p.name, file, before: { exists: true, value: p.guid }, after: { exists: false, value: null } })
        })
        results.push({ guid: p.guid, name: p.name, ok: removed, error: removed ? null : 'delete-failed' })
      }
      const snap = await refresh()
      const gone = r => (r.ok ? !snap.facts.plans.some(p => p.guid === r.guid) : null)
      for (const r of results) if (r.ok) r.verified = gone(r)
      return { ok: true, results, batchId: meta.batchId, ...snap }
    } catch (e) { return fail(e) } finally { active = null }
  }

  /** Stop a device from waking the PC (or let it again). Only devices the last scan listed as wake-armed. */
  async function wakeSet({ device, enable = false } = {}) {
    if (active) return { ok: false, error: 'busy' }
    const f = meta2()
    const name = String(device || '')
    if (!DEVICE_OK.test(name)) return { ok: false, error: 'invalid' }
    if (!enable && !(f && (f.wakeDevices || []).includes(name))) return { ok: false, error: 'unknown-device' }
    active = { wake: name }
    try {
      let ok = false
      await deps.runRecorded('power2:wake', 'apply', batch('wake'), async (ps, cmd, note) => {
        const r = await deps.runCmd(`powercfg /device${enable ? 'enable' : 'disable'}wake "${name}"`, 15000)
        ok = !!r && r.ok !== false
        if (ok) note({ kind: 'power-wake', device: name, before: { exists: true, value: enable ? 'disarmed' : 'armed' }, after: { exists: true, value: enable ? 'armed' : 'disarmed' } })
      })
      if (!ok) return { ok: false, error: 'refused' }
      const snap = await refresh()
      const armed = (snap.facts.wakeDevices || []).includes(name)
      return { ok: true, verified: snap.facts.wakeDevices ? armed === !!enable : null, ...snap }
    } catch (e) { return fail(e) } finally { active = null }
  }

  /** Windows power mode (best efficiency / balanced / best performance) through the overlay API. */
  async function modeSet({ overlay: want } = {}) {
    if (active) return { ok: false, error: 'busy' }
    const guid = String(want || '').toLowerCase()
    if (![plansLib.OVERLAY.efficiency, plansLib.OVERLAY.balanced, plansLib.OVERLAY.performance].includes(guid)) return { ok: false, error: 'invalid' }
    active = { mode: guid }
    try {
      const before = overlay.parseRead((await deps.runPS(overlay.readScript(), 8000)).out)
      if (!before) return { ok: false, error: 'unsupported' }
      let ok = false
      await deps.runRecorded('power2:mode', 'apply', batch('mode'), async (ps, cmd, note) => {
        ok = overlay.setOk((await deps.runPS(overlay.setScript(guid), 8000)).out)
        if (ok) note({ kind: 'power-overlay', before: { exists: true, value: before }, after: { exists: true, value: guid } })
      })
      if (!ok) return { ok: false, error: 'refused' }
      const snap = await refresh()
      return { ok: true, verified: snap.facts.overlayAc ? snap.facts.overlayAc === guid : null, ...snap }
    } catch (e) { return fail(e) } finally { active = null }
  }

  const fail = e => ({ ok: false, error: String((e && e.message) || e).slice(0, 200) })

  function history() {
    const ids = new Set(catalog.ids())
    const entries = safe(() => deps.journalList({ limit: 800 }), []) || []
    const mine = e => e && ((e.tweakId && ids.has(e.tweakId)) || (typeof e.control === 'string' && e.control.startsWith('power2:')))
    const rows = entries.filter(mine).map(e => ({ id: e.id, batchId: e.batchId || e.id, tweakId: e.tweakId || null, control: e.control || null, action: e.action, via: e.via, ts: e.ts, result: e.result, fidelity: e.fidelity, undone: !!e.undoneBy, undoes: e.undoes || null, detail: describeChange(e) }))
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
  function describeChange(e) {
    const c = (e.changes || []).find(x => x.kind && x.kind !== 'powercfg-active') || (e.changes || [])[0]
    if (!c) return null
    if (c.kind === 'power-plan-file') return { kind: 'tidy', name: c.name || null }
    if (c.kind === 'power-wake') return { kind: 'wake', name: c.device || null, to: c.after && c.after.value }
    if (c.kind === 'power-overlay') return { kind: 'mode', from: c.before && c.before.value, to: c.after && c.after.value }
    if (c.kind === 'powercfg') return { kind: 'timeout', from: c.before && c.before.value, to: c.after && c.after.value, setting: c.setting || null, ac: c.ac }
    if (c.kind === 'powercfg-active') return { kind: 'plan' }
    return null
  }

  async function undo(target, { force = false } = {}) {
    if (active) return { ok: false, error: 'busy' }
    const r = await deps.undo(target, { force })
    const snap = await refresh()
    return { ...r, ...snap }
  }

  // ── Live sampling: one counter poller (+ nvidia-smi) while the tab is open and visible. It stops by itself without a heartbeat, and pauses while a game runs
  //    (an energy session in progress keeps reading nvidia-smi and the sensor bridge, which cost nothing to run).
  function liveStart() {
    wanted = true; beat = now()
    if (!deps.spawnLive) return { ok: false, error: 'unavailable' }
    if (deps.gameRunning && deps.gameRunning() && !session) { setPaused('game'); return { ok: true, paused: 'game' } }
    if (!proc && !(paused === 'game' && smiProc)) spawn()
    if (!watchdog) { watchdog = setInterval(() => { if (!session && now() - beat > HEARTBEAT_TIMEOUT_MS) liveStop() }, WATCHDOG_MS); if (watchdog.unref) watchdog.unref() }
    return { ok: true, paused: null }
  }
  function spawn() {
    paused = null
    const f = meta2()
    let buf = ''
    const me = deps.spawnLive({
      script: live.buildScript(!!(f && f.battery)),
      onLine: chunk => {
        buf += chunk
        let i
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1)
          const fr = live.parseLine(line)
          if (fr) onFrame(fr)
        }
      },
      onExit: () => { if (proc === me) { proc = null; if (wanted && !paused) emit('power2-live', { ended: true }) } },
    })
    proc = me
    if (deps.spawnSmi && !smiProc) spawnSmi()
  }
  function spawnSmi() {
    let buf = ''
    const me = deps.spawnSmi({
      args: live.smiArgs(),
      onLine: chunk => {
        buf += chunk
        let i
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1)
          const s = live.parseSmi(line)
          if (s) { smiLast = { at: now(), s }; if (paused === 'game' && session) onFrame({ t: now(), perf: null, util: null, bat: null, smi: null, sensor: null }) }
        }
      },
      onExit: () => { if (smiProc === me) smiProc = null },
    })
    smiProc = me
  }
  function onFrame(f) {
    if (smiLast && now() - smiLast.at < 3500) f.smi = smiLast.s
    if (deps.hub) {
      const v = safe(() => deps.hub(Object.values(HUB_KEYS)), {}) || {}
      const se = {}
      for (const [k, key] of Object.entries(HUB_KEYS)) se[k] = v[key] == null ? null : v[key]
      f.sensor = se
    }
    f.t = now()
    lastFrame = f; win.push(f)
    const w = live.wattsOf(f)
    if (session) session.meter.push(f.t, { cpu: w.cpuW, gpu: w.gpuW })
    emit('power2-live', { frame: { ...f, watts: w }, findings: findings.live(win.frames(), { laptop: !!(meta2() && meta2().laptop) }), session: session ? sessionInfo() : null })
  }
  function killProc(keepSmi) {
    const p = proc, q = smiProc
    proc = null
    try { p && p.kill() } catch { /* already gone */ }
    if (!keepSmi) { smiProc = null; smiLast = null; try { q && q.kill() } catch { /* already gone */ } }
  }
  function setPaused(why) { paused = why; killProc(why === 'game' && !!session); emit('power2-live', { paused: why }) }
  function liveStop() {
    wanted = false; paused = null; killProc(false); win.clear(); lastFrame = null
    if (watchdog) { clearInterval(watchdog); watchdog = null }
    if (session) sessionStop('live-stopped')
  }
  const heartbeat = () => { beat = now(); return { ok: true, running: !!proc, paused, session: session ? sessionInfo() : null } }

  function gameStarted() { if (wanted) setPaused('game'); if (session) session.game = safe(() => deps.gameName && deps.gameName(), null) || session.game; return { ok: true } }
  function gameEnded() {
    if (wanted && now() - beat <= HEARTBEAT_TIMEOUT_MS) { paused = null; emit('power2-live', { resumed: true }); if (!proc && deps.spawnLive) { const q = smiProc; smiProc = null; try { q && q.kill() } catch { /* gone */ } spawn() } }
  }

  // ── Energy sessions: watt-hours from the measured sources only, and a cost when the user has given a price.
  const sessionInfo = () => ({ startedAt: session.t0, label: session.label, game: session.game, ...session.meter.summary(now()) })
  function sessionStart({ label } = {}) {
    if (session) return { ok: false, error: 'busy' }
    if (!wanted) return { ok: false, error: 'live-off' }
    session = { t0: now(), label: typeof label === 'string' ? label.slice(0, 40) : '', game: (deps.gameRunning && deps.gameRunning()) ? (safe(() => deps.gameName && deps.gameName(), null) || null) : null, meter: energy.createMeter() }
    return { ok: true, session: sessionInfo() }
  }
  function sessionStop(why) {
    if (!session) return { ok: false, error: 'not-running' }
    const sm = session.meter.summary(now()), s = load()
    const rec = { at: session.t0, ms: sm.ms, label: session.label, game: session.game, cpu: sm.cpu, gpu: sm.gpu, whTotal: sm.whTotal, perKwh: s.price ? s.price.perKwh : null, currency: s.price ? s.price.currency : null, cost: energy.cost(sm.whTotal, s.price ? s.price.perKwh : null), ended: why || 'stopped' }
    session = null
    const keepable = rec.ms >= 10000 && rec.whTotal != null
    if (keepable) { s.sessions = [rec, ...(s.sessions || [])].slice(0, energy.KEEP); save(s) }
    emit('power2-live', { session: null, sessionEnded: keepable ? rec : null })
    return { ok: true, saved: keepable, record: rec, sessions: load().sessions }
  }
  function priceSet({ perKwh, currency } = {}) {
    const p = perKwh === null || perKwh === '' ? null : Number(perKwh)
    if (p !== null && !(Number.isFinite(p) && p >= 0 && p <= 10)) return { ok: false, error: 'invalid' }
    const cur = currency == null ? 'EUR' : String(currency)
    if (!CURRENCY.test(cur)) return { ok: false, error: 'invalid' }
    const s = load(); s.price = { perKwh: p, currency: cur }; save(s)
    return { ok: true, price: s.price }
  }
  function sessionsClear() { const s = load(); s.sessions = []; save(s); return { ok: true } }

  function shutdown() { liveStop() }

  return { scan, cached, run, planSet, timeoutSet, planTidy, wakeSet, modeSet, history, undo, liveStart, liveStop, heartbeat, gameStarted, gameEnded, sessionStart, sessionStop, priceSet, sessionsClear,
    shutdown, frames: () => win.frames(), lastFrame: () => lastFrame, busy: () => !!active, running: () => !!proc, sessionActive: () => !!session }
}

function safe(fn, fallback) { try { const v = fn(); return v === undefined ? fallback : v } catch { return fallback } }

module.exports = { create, TIMEOUTS, HEARTBEAT_TIMEOUT_MS, DEVICE_OK }
