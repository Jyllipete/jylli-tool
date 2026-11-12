'use strict'
// Pulse service. create(deps) -> the object the main process wires to IPC. Everything with a side effect comes in through deps
// so tests drive it with fakes:
//   hub: { snapshot() }                               telemetry hub; vitals carry their source and age
//   send(id, channel, payload) -> bool                false when that window is gone (it is then unsubscribed)
//   state: { read(), write(v) }                       jt_pulse.json (window prefs)
//   sessions: { list(), get(id) }                     the session recorder's saved sessions
//   debriefs: { save(id, obj), load(id), list() }     one small debrief per session
//   activate({ presetId, killBg, report }) -> { ok }  deactivate() -> { ok }     the boost (main.js activatePulse / pulseRestoreAll)
//   baseline() -> { cpu, gpu, ram, cpuTemp }|null     bgCpu() -> number|null     probe() -> Promise<probe>     now()
const Frames = require('./frames')
const Limiter = require('./limiter')
const Score = require('./score')
const Sess = require('./session')
const Pre = require('./preflight')
const Attr = require('./attribution')
const River = require('./river')

const TICK_MS = 250
const RECENT_MS = 4000       // the window the live stats and the limiter look at
const FRESH_MS = 2500        // no frame for this long = the game is not rendering (paused, minimised, closed)
const MAX_MARKS = 60
const DEFAULT_PREFS = { v: 1, mode: 'cockpit', pin: false, hud: { layout: 'standard', corner: 'tr', opacity: 0.9 }, keys: { hud: 'CommandOrControl+Alt+P', mark: 'CommandOrControl+Alt+M' }, bounds: null }
const LAYOUTS = ['minimal', 'standard', 'full']
const ACCEL = /^(?:(?:Ctrl|CommandOrControl|Alt|Shift)\+){1,3}(?:[A-Z0-9]|F(?:[1-9]|1\d|2[0-4]))$/
const CORNERS = ['tl', 'tr', 'bl', 'br']
const MODES = ['cockpit', 'hud']

function create(deps) {
  const now = deps.now || Date.now
  const ring = Frames.createRing()
  const cols = Frames.createColumns({ clock: now })
  const subs = new Set()
  let timer = null
  let lastFrameAt = 0
  let game = null                 // { id, name, startedAt }
  let marks = []
  let boost = { active: false, presetId: null, name: null, since: null, steps: [], baseline: null }
  let lastLive = null
  const sampleRing = []      // wall-clock samples of the vitals (4 Hz), so a hitch can be tied to what the PC was doing

  const readPrefs = () => {
    let s = null
    try { s = deps.state.read() } catch { s = null }
    const o = { ...DEFAULT_PREFS, ...(s || {}) }
    o.hud = { ...DEFAULT_PREFS.hud, ...((s && s.hud) || {}) }
    o.keys = { ...DEFAULT_PREFS.keys, ...((s && s.keys) || {}) }
    return o
  }
  const writePrefs = p => { try { deps.state.write(p) } catch { /* disk full or locked */ } }

  function broadcast(ch, payload) {
    for (const id of Array.from(subs)) { let ok = false; try { ok = deps.send(id, ch, payload) } catch { ok = false } if (!ok) subs.delete(id) }
    if (!subs.size) stopTimer()
  }

  // ── frames ──────────────────────────────────────────────────────────────────────
  function onFrame(ms) {
    if (!(ms > 0 && ms < 1000)) return
    ring.push(ms)
    cols.push(ms)
    lastFrameAt = now()
  }

  /** The latest frames covering about RECENT_MS of rendered time. */
  function recentFrames() {
    const all = ring.last(), out = []
    let t = 0
    for (let i = all.length - 1; i >= 0 && t < RECENT_MS; i--) { out.push(all[i]); t += all[i] }
    return out.reverse()
  }

  // ── live frame ──────────────────────────────────────────────────────────────────
  const val = (snap, k) => { const e = snap && snap.s && snap.s[k]; return e && typeof e[0] === 'number' ? e[0] : null }
  const VITAL_KEYS = ['cpu.load', 'cpu.temp.package', 'cpu.power', 'gpu0.load', 'gpu0.temp.core', 'gpu0.temp.hotspot', 'gpu0.power', 'gpu0.clock.core', 'gpu0.vram.used', 'gpu0.vram.total', 'ram.load', 'net.rx', 'net.tx']

  function live() {
    const snap = deps.hub ? deps.hub.snapshot() : null
    const fresh = lastFrameAt > 0 && now() - lastFrameAt <= FRESH_MS
    const st = fresh ? Frames.stats(recentFrames()) : null
    const v = k => val(snap, k)
    const bg = deps.bgCpu ? deps.bgCpu() : null
    const limiter = Limiter.judge(st ? {
      fps: st.avgFps, medianMs: st.medianMs, p99Ms: st.p99Ms, jitter: st.jitter, cpu: v('cpu.load'), gpu: v('gpu0.load'),
      cpuTemp: v('cpu.temp.package'), gpuTemp: v('gpu0.temp.core'), ram: v('ram.load'), vramUsed: v('gpu0.vram.used'), vramTotal: v('gpu0.vram.total'),
      clock: v('gpu0.clock.core'), baseClock: null, bg,
    } : null)
    const steps = boost.steps
    const sc = Score.compute({
      smoothness: st && st.smoothness, avgFps: st && st.avgFps, low1Fps: st && st.low1Fps,
      cpuTemp: v('cpu.temp.package'), gpuTemp: v('gpu0.temp.core'),
      boost: boost.active && steps.length ? { ok: steps.filter(x => x.state === 'ok').length, total: steps.length } : null,
    })
    const vitals = {}
    if (snap) for (const k of VITAL_KEYS) { const e = snap.s[k]; vitals[k] = e ? { v: e[0], age: e[1], src: e[2] } : { v: null, age: null, src: null } }
    const r1 = x => Math.round(x * 10) / 10
    const sample = { at: now(), cpuTemp: v('cpu.temp.package'), gpuTemp: v('gpu0.temp.core'), vramUsed: v('gpu0.vram.used'), vramTotal: v('gpu0.vram.total'), ram: v('ram.load'), bg, gpu: v('gpu0.load'), cpu: v('cpu.load'), clock: v('gpu0.clock.core'), baseClock: null }
    if (!sampleRing.length || sample.at - sampleRing[sampleRing.length - 1].at >= 200) { sampleRing.push(sample); if (sampleRing.length > 260) sampleRing.shift() }
    const view = cols.view()
    const limit = River.hitchIndexes(view).limit
    const causeOf = c => {
      if (limit == null || !(c.hi >= limit)) return null
      let best = null
      for (const sm of sampleRing) if (best == null || Math.abs(sm.at - c.at) < Math.abs(best.at - c.at)) best = sm
      if (!best || Math.abs(best.at - c.at) > 2000) return 'unknown'
      return Attr.sampleCauses(best)[0] || 'unknown'
    }
    lastLive = {
      t: now(), fresh, game, boost: publicBoost(),
      fps: st ? { avg: r1(st.avgFps), low1: r1(st.low1Fps), low01: r1(st.low01Fps), medianMs: r1(st.medianMs), p99Ms: r1(st.p99Ms), jitter: Math.round(st.jitter * 1000) / 1000, smooth: st.smoothness } : null,
      cols: view.map(c => [Math.round(c.t), r1(c.med), r1(c.lo), r1(c.hi), c.n, causeOf(c)]),
      mediaMs: Math.round(cols.now), marks: marks.slice(-MAX_MARKS),
      vitals, limiter, score: sc.score, scoreParts: sc.parts,
    }
    return lastLive
  }

  function tick() { if (subs.size) broadcast('pulse2-live', live()) }
  function startTimer() { if (timer) return; timer = setInterval(tick, TICK_MS); if (timer.unref) timer.unref() }
  function stopTimer() { if (timer) { clearInterval(timer); timer = null } }

  function subscribe(id) {
    subs.add(id)
    startTimer()
    return { ok: true, live: live(), prefs: readPrefs() }
  }
  function unsubscribe(id) { subs.delete(id); if (!subs.size) stopTimer(); return { ok: true } }

  // ── boost ───────────────────────────────────────────────────────────────────────
  const publicBoost = () => ({ active: boost.active, presetId: boost.presetId, name: boost.name, since: boost.since, steps: boost.steps.map(s => ({ id: s.id, state: s.state, detail: s.detail || null })) })

  function report(id, state, detail) {
    const i = boost.steps.findIndex(s => s.id === id)
    const step = { id, state: state === 'ok' || state === 'skip' || state === 'fail' || state === 'run' ? state : 'ok', detail: typeof detail === 'string' ? detail.slice(0, 120) : null }
    if (i >= 0) boost.steps[i] = step; else boost.steps.push(step)
    broadcast('pulse2-event', { type: 'boost-step', step, boost: publicBoost() })
  }

  /** A boost is starting (from any surface): fresh steps and a baseline of how the PC looked before. */
  function beginBoost(presetId, name) {
    boost = { active: false, presetId: String(presetId || '').slice(0, 40) || null, name: name || presetId || null, since: now(), steps: [], baseline: deps.baseline ? deps.baseline() : null }
    broadcast('pulse2-event', { type: 'state', boost: publicBoost() })
  }

  async function startBoost(opts) {
    if (boost.active) return { ok: true, boost: publicBoost() }
    const presetId = String((opts && opts.presetId) || '').slice(0, 40)
    if (!presetId) return { ok: false, error: 'no-preset' }
    beginBoost(presetId, (opts && opts.name) || presetId)
    const r = await deps.activate({ presetId, killBg: !!(opts && opts.killBg), report })
    if (!r || !r.ok) { boost = { active: false, presetId: null, name: null, since: null, steps: [], baseline: null }; broadcast('pulse2-event', { type: 'state', boost: publicBoost() }); return { ok: false, error: (r && r.error) || 'failed' } }
    boost.active = true
    broadcast('pulse2-event', { type: 'state', boost: publicBoost() })
    return { ok: true, boost: publicBoost() }
  }

  async function stopBoost() {
    const was = boost.active
    const r = await deps.deactivate()
    boost = { ...boost, active: false, presetId: null, name: null, since: null }
    broadcast('pulse2-event', { type: 'state', boost: publicBoost(), restored: !!was })
    return { ok: !r || r.ok !== false, boost: publicBoost() }
  }

  /** Called by main whenever the boost changes (tab, tray, Auto-Pulse, Cockpit): the one place every window learns the state. */
  function syncBoost(active, presetId, name) {
    if (active) boost = { ...boost, active: true, presetId: presetId || boost.presetId, name: name || boost.name || presetId || null, since: boost.since || now() }
    else boost = { ...boost, active: false, presetId: null, name: null, since: null }
    broadcast('pulse2-event', { type: 'state', boost: publicBoost() })
  }

  // ── game and session lifecycle ──────────────────────────────────────────────────
  function gameStarted(id, name) {
    ring.clear(); cols.clear(); marks = []; lastFrameAt = 0; sampleRing.length = 0
    game = { id: String(id || ''), name: String(name || id || ''), startedAt: now() }
    broadcast('pulse2-event', { type: 'game-start', game })
  }

  /** `session` is the recorder's finished session (or null when it was too short). Returns the debrief. */
  function gameEnded(session) {
    const g = game
    game = null
    let debrief = null
    if (session) {
      try {
        const prev = lastDebriefFor(session.game && session.game.id, session.id)
        debrief = Sess.build({ session, boost: boost.steps.length ? { steps: boost.steps, baseline: boost.baseline } : null, marks, previous: prev })
        deps.debriefs.save(session.id, debrief)
      } catch { debrief = null }
    }
    marks = []
    broadcast('pulse2-event', { type: 'game-end', game: g, debrief })
    return debrief
  }

  function lastDebriefFor(gameId, exceptId) {
    try {
      const rows = deps.debriefs.list().filter(d => d && d.game && d.game.id === gameId && d.id !== exceptId)
      rows.sort((a, b) => b.startedAt - a.startedAt)
      return rows[0] || null
    } catch { return null }
  }

  function mark(label) {
    const sec = Math.round(cols.now / 1000)
    const m = { sec, label: typeof label === 'string' ? label.slice(0, 40) : '', at: now() }
    marks.push(m)
    if (marks.length > MAX_MARKS) marks.shift()
    broadcast('pulse2-event', { type: 'mark', mark: m })
    return { ok: true, mark: m }
  }

  // ── history ─────────────────────────────────────────────────────────────────────
  function sessions() {
    let rows = []
    try { rows = deps.sessions.list() } catch { rows = [] }
    const byId = {}
    try { for (const d of deps.debriefs.list()) if (d) byId[d.id] = d } catch { /* none yet */ }
    return {
      ok: true,
      sessions: rows.map(r => { const d = byId[r.id]; return { ...r, score: d ? d.score : null, verdict: d ? d.verdict : null, hitches: d ? d.hitches.length : null, ribbon: d ? d.ribbon : null } }),
    }
  }

  function session(id) {
    const s = deps.sessions.get(id)
    if (!s) return { ok: false, error: 'not-found' }
    let d = null
    try { d = deps.debriefs.load(id) } catch { d = null }
    if (!d) { try { d = Sess.build({ session: s, boost: null, marks: [], previous: null }) } catch { d = null } }
    return { ok: true, session: { id: s.id, game: s.game, startedAt: s.startedAt, durationSec: s.durationSec, summary: s.summary }, debrief: d }
  }

  async function preflight() {
    let probe = null
    try { probe = await deps.probe() } catch { probe = null }
    return { ok: true, ...Pre.evaluate(probe) }
  }

  // ── window prefs ────────────────────────────────────────────────────────────────
  function prefs() { return { ok: true, prefs: readPrefs() } }
  function setPrefs(patch) {
    const p = readPrefs(), q = patch && typeof patch === 'object' ? patch : {}
    if (MODES.includes(q.mode)) p.mode = q.mode
    if (typeof q.pin === 'boolean') p.pin = q.pin
    if (q.hud && typeof q.hud === 'object') {
      if (LAYOUTS.includes(q.hud.layout)) p.hud.layout = q.hud.layout
      if (CORNERS.includes(q.hud.corner)) p.hud.corner = q.hud.corner
      if (typeof q.hud.opacity === 'number' && Number.isFinite(q.hud.opacity)) p.hud.opacity = Math.min(1, Math.max(0.3, Math.round(q.hud.opacity * 20) / 20))
    }
    if (q.keys && typeof q.keys === 'object') for (const k of ['hud', 'mark']) if (typeof q.keys[k] === 'string' && ACCEL.test(q.keys[k]) && q.keys[k] !== p.keys[k === 'hud' ? 'mark' : 'hud']) p.keys[k] = q.keys[k]
    if (q.bounds && typeof q.bounds === 'object') {
      const b = {}
      for (const k of ['x', 'y', 'width', 'height']) if (Number.isFinite(q.bounds[k])) b[k] = Math.round(q.bounds[k])
      if (Object.keys(b).length === 4) p.bounds = b
    }
    writePrefs(p)
    return { ok: true, prefs: p }
  }

  function status() { return { ok: true, boost: publicBoost(), game, fresh: lastFrameAt > 0 && now() - lastFrameAt <= FRESH_MS, subscribers: subs.size } }
  function dispose() { stopTimer(); subs.clear() }

  return {
    onFrame, tick, live, subscribe, unsubscribe, beginBoost, startBoost, stopBoost, syncBoost, report, gameStarted, gameEnded, mark,
    sessions, session, preflight, prefs, setPrefs, status, dispose,
    get lastLive() { return lastLive }, get subscribers() { return subs.size },
  }
}

module.exports = { create, DEFAULT_PREFS, LAYOUTS, CORNERS, MODES, TICK_MS }
