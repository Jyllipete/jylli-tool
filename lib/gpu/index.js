'use strict'
// GPU service "Headroom": scan (one read-only probe), run (journaled batch, then READ AGAIN to verify), history, undo, live sampling, monitor refresh
// (test -> apply -> keep or revert), and the Headroom test. Every side effect comes in through `deps`, so tests drive it with fakes.
//   deps: { runPS(script, ms)->{ok,out,err}, applyBatch(req), journalList(opts), undo(target,{force}), runRecorded(control, action, meta, fn(ps,cmd,note))->any,
//           tweakMeta(ids), applicability()->{id:{show,state,why}}, settings()->object, caps()->capabilities|null, isPremium()->bool,
//           state:{read(),write(obj)}, bootMs?(), now?(), spawnLive?({script,onLine,onExit})->{kill()}, spawnSmi?({args,onLine,onExit})->{kill()},
//           hub?(keys)->{key:value}, power?()->Promise<{supported,current,default}|null>, gameRunning?()->bool, emit?(channel, payload), schedule?(fn, ms)->timer,
//           clearSchedule?(timer), confirmMs? }
const catalog = require('./catalog')
const detect = require('./detect')
const live = require('./live')
const findings = require('./findings')
const limiter = require('./limiter')
const loadtest = require('./loadtest')
const display = require('../auto-opti/display')
const { classifyGpu } = require('../gpu-arch')
const { buildModel } = require('./model')

const DEFAULT_STATE = { last: null, applied: {}, runs: [], tests: [] }
const MAX_RUNS = 30, MAX_IDS = 60
const HEARTBEAT_TIMEOUT_MS = 45000
const WATCHDOG_MS = 15000
const CONFIRM_MS = 15000
const SMI_GRACE_MS = 4000
const LAPTOP_CHASSIS = new Set([8, 9, 10, 11, 14, 30, 31, 32])
const HUB_KEYS = { tempCore: 'gpu0.temp.core', tempHot: 'gpu0.temp.hotspot', power: 'gpu0.power', fanRpm: 'gpu0.fan.rpm', fanPct: 'gpu0.fan.pct' }
const DAY = 86400000

function create(deps) {
  const now = deps.now || Date.now
  const emit = (ch, p) => { try { deps.emit && deps.emit(ch, p) } catch { /* events are best effort */ } }
  const schedule = deps.schedule || ((fn, ms) => { const t = setTimeout(fn, ms); if (t.unref) t.unref(); return t })
  const unschedule = deps.clearSchedule || (t => clearTimeout(t))
  let cache = null, active = null
  let proc = null, smiProc = null, smiLast = null, smiGot = false, smiIdx = 0, beat = 0, watchdog = null, wanted = false, paused = null, lastFrame = null
  let test = null, pendingDisplay = null
  const win = live.createWindow(120)

  const load = () => ({ ...DEFAULT_STATE, ...(deps.state.read() || {}) })
  const save = s => { try { deps.state.write(s) } catch { /* state is best effort */ } }
  const premium = () => { try { return deps.isPremium ? deps.isPremium() === true : false } catch { return false } }

  async function read() {
    let r = null
    try { r = await deps.runPS(detect.buildScript(), 90000) } catch { r = null }
    const parsed = r && r.out ? detect.parse(r.out) : null
    if (parsed) { const s = load(); s.last = { when: now(), r: parsed.r, f: parsed.f, displays: parsed.displays, remote: parsed.remote }; save(s); return { ...parsed, when: now(), stale: false } }
    const s = load()
    return s.last ? { r: s.last.r, f: s.last.f, displays: s.last.displays || [], remote: !!s.last.remote, when: s.last.when, stale: true } : { r: null, f: null, displays: [], remote: false, when: null, stale: false }
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
    return { model: buildModel({ live: liveState, remembered, meta, applic, restart, when: c.when, premium: premium() }), remembered }
  }

  /** The adapter the page is about: the first discrete one, else the first. */
  function primaryOf(f) {
    const list = ((f && f.gpus) || []).map(g => ({ g, c: classifyGpu(g.name, '') }))
    const pick = list.find(x => x.c.discrete === true) || list[0] || null
    if (!pick) return null
    const same = (a, b) => a && b && (a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase()))
    const vr = (f.vram || []).find(v => same(v.name, pick.g.name)), irq = (f.irq || []).find(v => same(v.name, pick.g.name))
    const t = pick.g.date ? Date.parse(pick.g.date) : NaN
    return {
      name: pick.g.name, vendor: pick.c.vendor, arch: pick.c.arch, discrete: pick.c.discrete, dlssFrameGen: pick.c.dlssFrameGen === true,
      driver: pick.g.driver, driverDate: pick.g.date, driverDays: Number.isFinite(t) ? Math.max(0, Math.floor((now() - t) / DAY)) : null,
      vramGB: vr && vr.gb ? vr.gb : null, irqMode: irq ? irq.mode : null,
      hybrid: list.some(x => x.c.discrete === true) && list.some(x => x.c.discrete === false),
    }
  }
  const factsOfLimiter = (f, gpu) => {
    const s = (f && f.smi) || {}
    return { clockMaxMHz: s.clockMaxMHz || null, powerLimitW: s.powerLimitW || null, slowdownC: s.slowdownC || null, targetC: s.targetC || null, vramGB: gpu ? gpu.vramGB : null, pcieGenMax: s.pcieGenMax || null, pcieWidthMax: s.pcieWidthMax || null }
  }

  async function factsFrom(c, model, remembered) {
    const f = (c && c.f) || {}
    const gpu = primaryOf(f)
    const caps = safe(() => deps.caps(), null)
    const laptop = (caps && caps.form === 'laptop') || f.battery === true || (f.chassis || []).some(n => LAPTOP_CHASSIS.has(n))
    const status = model ? Object.fromEntries(model.items.map(i => [i.id, i.status])) : {}
    const power = deps.power ? await safe2(deps.power) : null
    const smi = f.smi || null
    return {
      gpu, laptop, smi: smi ? { slowdownC: smi.slowdownC, targetC: smi.targetC, rebar: smi.rebar, pcieGenMax: smi.pcieGenMax, pcieWidthMax: smi.pcieWidthMax, clockMaxMHz: smi.clockMaxMHz } : null,
      limits: factsOfLimiter(f, gpu), displays: (c && c.displays) || [], remote: !!(c && c.remote), power: power && power.supported ? { current: power.current, default: power.default } : null, powerWhy: power && !power.supported ? power.reason || null : null,
      gpus: (f.gpus || []).length,
      findings: gpu ? findings.statics({ name: gpu.name, vendor: gpu.vendor, discrete: gpu.discrete, dlssFrameGen: gpu.dlssFrameGen, driverDays: gpu.driverDays, irqMode: gpu.irqMode, rebar: smi ? smi.rebar : null,
        hybrid: gpu.hybrid, laptop, displays: (c && c.displays) || [], remote: !!(c && c.remote), status, remembered: remembered || {}, power: power && power.supported ? { current: power.current, default: power.default } : null }) : [],
    }
  }

  async function snapshot(c) {
    const { model, remembered } = modelFrom(c)
    return { model, facts: await factsFrom(c, model, remembered), when: c.when, stale: !!c.stale, read: !!c.r }
  }

  async function scan() {
    const c = await read()
    cache = c
    return { ok: true, ...(await snapshot(c)), premium: premium() }
  }
  async function cached() {
    if (!cache) { const s = load(); if (!s.last) return null; cache = { r: s.last.r, f: s.last.f, displays: s.last.displays || [], remote: !!s.last.remote, when: s.last.when, stale: true } }
    return { ok: true, ...(await snapshot(cache)), premium: premium() }
  }

  /** ids: catalog ids. action 'apply' | 'restore'. A retired switch can only be restored; a Premium switch needs Premium. */
  async function run({ ids, action = 'apply', label = 'gpu', onProgress } = {}) {
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
      const snap = await snapshot(c)
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

  // The same change, read back: did Windows end up where we asked? null = cannot be read (no probe) or waits for a restart.
  function verify(act, row) {
    if (!row || row.status === 'unknown' || row.status === 'restart') return null
    return act === 'apply' ? row.status === 'on' : row.status === 'off'
  }

  function history() {
    const ids = new Set(catalog.ids())
    const entries = safe(() => deps.journalList({ limit: 800 }), []) || []
    const mine = e => e && ((e.tweakId && ids.has(e.tweakId)) || (typeof e.control === 'string' && (e.control === 'gpu-power-limit' || e.control.startsWith('gpu2:'))))
    const rows = entries.filter(mine).map(e => ({ id: e.id, batchId: e.batchId || e.id, tweakId: e.tweakId || null, control: e.control || null, action: e.action, via: e.via, ts: e.ts, result: e.result, fidelity: e.fidelity, undone: !!e.undoneBy, undoes: e.undoes || null,
      detail: describeChange(e) }))
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
    const c = (e.changes || [])[0]
    if (!c) return null
    if (c.kind === 'display-mode') return { kind: 'display', from: c.before && c.before.value, to: c.after && c.after.value }
    if (c.kind === 'gpu-power-limit') return { kind: 'power', from: c.before && c.before.watts, to: c.after && c.after.watts }
    return null
  }

  async function undo(target, { force = false } = {}) {
    if (active) return { ok: false, error: 'busy' }
    const r = await deps.undo(target, { force })
    const c = await read(); cache = c
    return { ...r, ...(await snapshot(c)) }
  }

  // ── Live sampling: one counter poller (+ nvidia-smi) while the tab is open and visible. It stops by itself without a heartbeat, and never runs while a game does.
  const limits = () => { const c = cache || (load().last && { f: load().last.f }); return factsOfLimiter(c && c.f, primaryOf(c && c.f)) }
  function liveStart() {
    wanted = true; beat = now()
    if (!deps.spawnLive) return { ok: false, error: 'unavailable' }
    if (deps.gameRunning && deps.gameRunning()) { setPaused('game'); return { ok: true, paused: 'game' } }
    if (!proc) spawn()
    if (!watchdog) { watchdog = setInterval(() => { if (!test && now() - beat > HEARTBEAT_TIMEOUT_MS) liveStop() }, WATCHDOG_MS); if (watchdog.unref) watchdog.unref() }
    return { ok: true, paused: null }
  }
  function spawn() {
    paused = null
    let buf = ''
    const me = deps.spawnLive({
      script: live.buildScript(),
      onLine: chunk => {
        buf += chunk
        let i
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1)
          const f = live.parseLine(line)
          if (f) onFrame(f)
        }
      },
      onExit: () => { if (proc === me) { proc = null; if (wanted && !paused) emit('gpu2-live', { ended: true }) } },
    })
    proc = me
    if (deps.spawnSmi && !smiProc) spawnSmi()
  }
  function spawnSmi() {
    const reason = live.SMI_REASON_FIELDS[smiIdx]
    const started = now()
    let buf = ''
    smiGot = false
    const me = deps.spawnSmi({
      args: live.smiArgs(reason),
      onLine: chunk => {
        buf += chunk
        let i
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1)
          const s = live.parseSmi(line, !!reason)
          if (s) { smiGot = true; smiLast = { at: now(), s } }
        }
      },
      onExit: () => {
        if (smiProc !== me) return
        smiProc = null
        // The driver rejected the reason field: try the older name, then none. Without any frames it is simply not an NVIDIA card.
        if (!smiGot && now() - started < SMI_GRACE_MS && smiIdx < live.SMI_REASON_FIELDS.length - 1 && proc) { smiIdx++; spawnSmi() }
      },
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
    f.t = now()   // one clock for the window, the test start and the guard
    const l = f.smi && f.smi.load != null ? f.smi.load : f.load
    f.load = l
    lastFrame = f; win.push(f)
    emit('gpu2-live', { frame: f })
    if (test) {
      const why = loadtest.guard(f)
      if (why) testStop(why)
    }
  }
  function killProc() {
    const p = proc, q = smiProc
    proc = null; smiProc = null; smiLast = null; smiIdx = 0
    try { p && p.kill() } catch { /* already gone */ }
    try { q && q.kill() } catch { /* already gone */ }
  }
  function setPaused(why) { paused = why; killProc(); emit('gpu2-live', { paused: why }) }
  function liveStop() {
    wanted = false; paused = null; killProc(); win.clear(); lastFrame = null
    if (watchdog) { clearInterval(watchdog); watchdog = null }
    if (test) testStop('stopped')
  }
  const heartbeat = () => { beat = now(); return { ok: true, running: !!proc, paused } }

  function gameStarted() {
    if (test) testStop('game')
    if (wanted) setPaused('game')
    return { ok: true }
  }
  function gameEnded() {
    if (wanted && now() - beat <= HEARTBEAT_TIMEOUT_MS) { paused = null; emit('gpu2-live', { resumed: true }); if (!proc && deps.spawnLive) spawn() }
  }

  // ── Monitor refresh rate: test the mode, apply it for this session, ask, then keep (persist + journal) or put the old one back. No answer = back.
  const known = () => ((cache && cache.displays) || (load().last && load().last.displays) || [])
  async function displaySet({ device, w, h, hz } = {}) {
    if (pendingDisplay) return { ok: false, error: 'busy' }
    const d = known().find(x => x.device === device)
    if (!d) return { ok: false, error: 'unknown-device' }
    if (!display.DEVICE_RE.test(String(device)) || !d.modes.some(m => m.w === w && m.h === h && m.hz === hz) || d.cur.w !== w || d.cur.h !== h) return { ok: false, error: 'mode-not-offered' }
    if (hz === d.cur.hz) return { ok: false, error: 'same-mode' }
    const from = d.cur.hz
    const t = await deps.runPS(display.setScript(device, { w, h, hz }, 'test'), 15000)
    if (!display.setOk(t && t.out)) return { ok: false, error: 'driver-refused' }
    const dyn = await deps.runPS(display.setScript(device, { w, h, hz }, 'dynamic'), 15000)
    if (!display.setOk(dyn && dyn.out)) return { ok: false, error: 'apply-failed' }
    const ms = deps.confirmMs || CONFIRM_MS
    const answer = await new Promise(resolve => {
      let timer = null
      const done = v => { if (timer) unschedule(timer); pendingDisplay = null; resolve(v) }
      timer = schedule(() => done('revert'), ms)
      pendingDisplay = { device, done }
      emit('gpu2-display', { phase: 'confirm', device, monitor: d.monitor, from, to: hz, deadline: now() + ms })
    })
    let result
    if (answer === 'keep') {
      const keep = await deps.runPS(display.setScript(device, { w, h, hz }, 'persist'), 15000)
      if (display.setOk(keep && keep.out)) {
        await deps.runRecorded('gpu2:display:' + device, 'apply', { via: 'manual', batchId: 'gpu2-display-' + now() }, async (ps, cmd, note) => {
          note({ kind: 'display-mode', device, w, h, before: { exists: true, value: from }, after: { exists: true, value: hz } })
        })
        result = { ok: true, kept: true, from, to: hz }
      } else {
        await deps.runPS(display.setScript(device, { w, h, hz: from }, 'dynamic'), 15000)
        result = { ok: false, error: 'persist-failed' }
      }
    } else {
      await deps.runPS(display.setScript(device, { w, h, hz: from }, 'dynamic'), 15000)
      result = { ok: true, kept: false, reverted: true, from, to: hz }
    }
    emit('gpu2-display', { phase: 'done', ...result })
    const c = await read(); cache = c
    return { ...result, ...(await snapshot(c)) }
  }
  function displayAnswer({ keep } = {}) {
    if (!pendingDisplay) return { ok: false }
    pendingDisplay.done(keep ? 'keep' : 'revert')
    return { ok: true }
  }

  // ── Headroom test
  function testStart() {
    if (test) return { ok: false, error: 'busy' }
    if (active) return { ok: false, error: 'busy' }
    if (deps.gameRunning && deps.gameRunning()) return { ok: false, error: 'game' }
    if (!deps.spawnLive) return { ok: false, error: 'unavailable' }
    const t0 = now()
    test = { t0, timer: null }
    test.timer = schedule(() => { if (test && test.t0 === t0) testStop('timeout') }, loadtest.T.MAX_MS)
    liveStart(); beat = now()
    emit('gpu2-test', { phase: 'start', t0, durationMs: loadtest.T.DURATION_MS })
    return { ok: true, t0, durationMs: loadtest.T.DURATION_MS }
  }
  function testStop(reason) {
    if (!test) return { ok: false }
    const t = test; test = null
    if (t.timer) unschedule(t.timer)
    emit('gpu2-test', { phase: 'abort', reason: reason || 'stopped' })
    return { ok: true, reason: reason || 'stopped' }
  }
  /** The page finished its 30 s: client = { work, renderer, frames }. Returns the report and the change since the previous run. */
  function testFinish(client = {}) {
    if (!test) return { ok: false, error: 'not-running' }
    const t = test; test = null
    if (t.timer) unschedule(t.timer)
    const c = cache || (load().last && { f: load().last.f })
    const gpu = primaryOf(c && c.f)
    const report = loadtest.summarize(win.since(t.t0), client, limits())
    if (!report.ok) { emit('gpu2-test', { phase: 'abort', reason: report.error }); return { ok: false, error: report.error } }
    report.at = now(); report.gpu = gpu ? gpu.name : null
    report.wrongGpu = loadtest.wrongRenderer(report.renderer, gpu && gpu.name)
    const s = load()
    const prev = (s.tests || []).find(x => x && x.ok) || null
    const delta = loadtest.compare(report, prev)
    s.tests = [report, ...(s.tests || [])].slice(0, loadtest.T.KEEP); save(s)
    emit('gpu2-test', { phase: 'done', report, delta })
    return { ok: true, report, delta, tests: s.tests }
  }
  const tests = () => ({ ok: true, tests: load().tests || [] })

  function shutdown() { liveStop() }
  const frames = () => win.frames()

  return { scan, cached, run, history, undo, liveStart, liveStop, heartbeat, gameStarted, gameEnded, displaySet, displayAnswer, testStart, testStop, testFinish, tests, shutdown, frames,
    lastFrame: () => lastFrame, busy: () => !!active, running: () => !!proc, testing: () => !!test }
}

function safe(fn, fallback) { try { const v = fn(); return v === undefined ? fallback : v } catch { return fallback } }
async function safe2(fn) { try { return await fn() } catch { return null } }

module.exports = { create, HEARTBEAT_TIMEOUT_MS, CONFIRM_MS }
