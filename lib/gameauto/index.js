'use strict'
// Game session automation: the one owner of "a game started / a game ended". It watches for games, and for each session it
//   - holds Windows Update (lib/updateguard), - frees RAM with Game Shield (lib/gameshield + main.js), - starts Auto-Pulse (main.js activatePulse),
//   - runs the existing per-game effects (Apps game time, MMCSS, profile, frame capture) handed in as `effects`,
// records what changed in a ledger, and puts every change back when the game ends, the watcher stops, or after a crash.
// Everything that touches the PC is injected, so the whole lifecycle is tested with fakes (test/gameauto-service.test.js).
// Operations run one after the other (a queue): a quick start/exit can never interleave, and a restore always follows its change.

const Targets = require('./targets')
const Watch = require('./watch')
const Ledger = require('./ledger')
const Model = require('./model')
const GS = require('../gameshield')

const TICK_MS = 5000
const PENDING_TIMEOUT_MS = 8000
const DEFAULT_STATE = () => ({ v: 1, sessions: [], current: null, libraryDetect: { library: false }, pulseOff: [], legacyOverrides: 0 })

function create(deps) {
  const now = deps.now || Date.now
  const log = deps.log || (() => {})
  const emitRaw = deps.emit || (() => {})
  let st = DEFAULT_STATE()
  let loaded = false
  let queue = Promise.resolve()
  let timer = null
  let watch = Watch.init()
  let running = false, paused = false, ticking = false
  let session = null            // ledger session of the game being played, or null
  let features = {}             // per-feature live facts for the model
  let autoStarted = false       // Auto-Pulse (not the user) started the boost that is active now
  let ownPulse = false          // our own start/stop of Pulse is in progress: pulseChanged() ignores it
  let seq = 0

  const enqueue = fn => { const p = queue.then(fn, fn); queue = p.catch(() => {}); return p }
  const safe = async (fn, fallback) => { try { return await fn() } catch (e) { log('gameauto: ' + (e && e.message), 'warn'); return fallback } }

  function load() {
    if (loaded) return
    loaded = true
    const raw = safe2(() => deps.state.read())
    if (raw && typeof raw === 'object') st = { ...DEFAULT_STATE(), ...raw, libraryDetect: { library: !!(raw.libraryDetect && raw.libraryDetect.library) }, pulseOff: Array.isArray(raw.pulseOff) ? raw.pulseOff.filter(x => typeof x === 'string') : [], sessions: Ledger.trim(raw.sessions) }
  }
  function safe2(fn) { try { return fn() } catch { return null } }
  const persist = () => { try { return deps.state.write(st) !== false } catch { return false } }

  const cfg = () => {
    const s = deps.settings() || {}
    const t = GS.clampThresholds(s.gameShieldTier3Threshold, s.gameShieldMidSessionThreshold)
    return { watcher: !!s.gameWatcherEnabled, updateGuard: !!s.updateGuardEnabled, shield: !!s.gameShieldEnabled, autoPulse: !!s.autoPulseEnabled, tier3: t.tier3, mid: t.mid, exclusions: GS.normalizeExclusions(s.gameShieldExclusions), libraryDetect: st.libraryDetect.library, pulseOff: st.pulseOff }
  }
  const targets = () => { const src = deps.sources() || {}; return Targets.build(src, { custom: true, library: st.libraryDetect.library }) }

  function snapshot() {
    load()
    const t = targets()
    const premium = !!deps.premium()
    const last = st.sessions[0] || null
    return {
      premium, settings: cfg(),
      watcher: { running, paused, degraded: watch.degraded, targets: Targets.describe(t).length },
      session: session ? { id: session.id, game: session.game, startedAt: session.startedAt, events: session.events } : null,
      features: JSON.parse(JSON.stringify(features)),
      lastSession: last ? { ...last, summary: Ledger.summary(last) } : null,
      history: st.sessions.slice(0, 6).map(s => ({ id: s.id, game: s.game, startedAt: s.startedAt, endedAt: s.endedAt, endReason: s.endReason, summary: Ledger.summary(s) })),
      detected: Targets.describe(t),
      lists: { tier1: GS.TIER1.slice(), tier3: GS.TIER3.slice(), browsers: GS.BROWSERS.slice() },
      pending: safe2(() => deps.updateGuard.pendingRestore()) === true,
      legacyOverrides: st.legacyOverrides || 0,
      at: now(),
    }
  }
  const emit = () => { try { emitRaw({ type: 'state', state: snapshot() }) } catch { /* window gone */ } }

  function note(ev) {
    if (!session) return
    session = Ledger.add(session, { at: now(), ...ev })
    st.current = session
    persist()
  }
  const setFeature = (name, patch) => { features[name] = { ...(features[name] || {}), ...patch } }

  // ── Update Guard ──
  async function ugStart() {
    if (!deps.premium() || !cfg().updateGuard) return
    setFeature('updateGuard', { status: 'starting' }); emit()
    const pend = await Promise.race([safe(() => deps.updateGuard.pendingUpdates(), { count: null, error: 'failed' }), new Promise(r => setTimeout(() => r({ count: null, error: 'timeout' }), PENDING_TIMEOUT_MS).unref())])
    setFeature('updateGuard', { pending: pend })
    if (!session) return
    const r = await safe(() => deps.updateGuard.hold(), { ok: false, state: 'failed', reason: 'error' })
    if (r.state === 'holding') { setFeature('updateGuard', { status: 'holding', held: true, restoreFailed: false }); note({ feature: 'updateGuard', kind: 'applied', key: 'wu', detail: 'held' }) }
    else if (r.state === 'skipped') { setFeature('updateGuard', { status: 'skipped', reason: r.reason }); note({ feature: 'updateGuard', kind: 'skipped', detail: r.reason }) }
    else { setFeature('updateGuard', { status: 'failed', reason: r.reason || 'failed' }); note({ feature: 'updateGuard', kind: 'failed', detail: r.reason || 'failed' }) }
  }
  async function ugEnd() {
    const f = features.updateGuard || {}
    if (!f.held && !safe2(() => deps.updateGuard.pendingRestore())) { setFeature('updateGuard', { held: false }); return }
    const r = await safe(() => deps.updateGuard.release(), { ok: false, state: 'failed' })
    if (r.ok) {
      setFeature('updateGuard', { status: 'idle', held: false, restoreFailed: false, lastEnd: f.held ? 'restored' : null, reenabled: !!r.reenabled })
      if (f.held) note({ feature: 'updateGuard', kind: 'restored', key: 'wu', detail: r.reenabled ? 'windows-reenabled' : 'ok' })
    } else {
      setFeature('updateGuard', { status: 'failed', restoreFailed: true, held: true })
      note({ feature: 'updateGuard', kind: 'restored', key: 'wu', ok: false, detail: 'restore-failed' })
    }
    return r
  }

  // ── Game Shield ──
  async function gsStart(game) {
    if (!deps.premium() || !cfg().shield) return
    setFeature('shield', { status: 'starting' }); emit()
    const r = await safe(() => deps.shield.activate(game), { ok: false, error: 'error' })
    if (r && r.ok) {
      setFeature('shield', { status: 'active', stopped: r.stopped || [], restoreFailed: null, active: true })
      for (const n of r.stopped || []) note({ feature: 'shield', kind: 'applied', key: n, detail: 'launch' })
      if (!(r.stopped || []).length) note({ feature: 'shield', kind: 'info', detail: 'nothing-to-stop' })
    } else { setFeature('shield', { status: 'failed', reason: (r && r.error) || 'failed' }); note({ feature: 'shield', kind: 'failed', detail: (r && r.error) || 'failed' }) }
  }
  function gsRecord(r) {
    const failed = (r.failed || []).filter(x => x && x.verdict !== 'already-running')
    for (const n of r.restored || []) note({ feature: 'shield', kind: 'restored', key: n, detail: 'restarted' })
    for (const x of r.failed || []) note({ feature: 'shield', kind: 'restored', key: x.name, ok: x.verdict === 'already-running', detail: x.verdict })
    return failed
  }
  async function gsEnd() {
    const f = features.shield || {}
    if (!f.active && !(deps.shield.active && deps.shield.active())) return
    const r = await safe(() => deps.shield.deactivate(), { ok: false, restored: [], failed: [{ name: '?', verdict: 'error' }] })
    const failed = gsRecord(r)
    setFeature('shield', { status: 'idle', active: false, restoreFailed: failed.length ? failed : null, lastEnd: failed.length ? null : (f.stopped || []).length ? 'restored' : null, summary: { killed: r.stoppedCount || (f.stopped || []).length, freedMB: r.freedMB || 0 } })
  }

  // ── Auto-Pulse ──
  async function apStart(game) {
    const c = cfg()
    if (!deps.premium() || !c.autoPulse) return
    if (!game.pulse) { setFeature('autoPulse', { status: 'unavailable', reason: 'no-preset' }); note({ feature: 'autoPulse', kind: 'skipped', detail: 'no-preset' }); return }
    if (st.pulseOff.includes(game.pulse)) { setFeature('autoPulse', { status: 'off-for-game' }); note({ feature: 'autoPulse', kind: 'skipped', detail: 'off-for-game' }); return }
    const cur = deps.pulse.active()
    if (cur) { setFeature('autoPulse', { status: 'manual', preset: cur }); note({ feature: 'autoPulse', kind: 'info', detail: 'manual-boost-left-alone' }); return }
    setFeature('autoPulse', { status: 'starting', preset: game.pulse }); emit()
    ownPulse = true
    let r
    try { r = await deps.pulse.start(game.pulse) } catch (e) { r = { ok: false, error: String((e && e.message) || e).slice(0, 120) } } finally { ownPulse = false }
    if (r && r.ok) {
      autoStarted = true
      setFeature('autoPulse', { status: 'active', preset: game.pulse, restoreFailed: null })
      note({ feature: 'autoPulse', kind: 'applied', key: 'pulse', detail: game.pulse })
      safe2(() => deps.legacyEvent && deps.legacyEvent({ event: 'auto-pulse-start', gameId: game.id, presetId: game.pulse }))
    } else { setFeature('autoPulse', { status: 'failed', reason: (r && r.error) || 'failed' }); note({ feature: 'autoPulse', kind: 'failed', detail: (r && r.error) || 'failed' }) }
  }
  async function apEnd(game) {
    const cur = deps.pulse.active()
    const ours = autoStarted || (cur && game && game.pulse && cur === game.pulse)   // a boost the user started by hand for THIS game ends with it, as before
    if (!ours || !cur) { autoStarted = false; return }
    const manual = !autoStarted
    ownPulse = true
    let r
    try { r = await deps.pulse.stop() } catch (e) { r = { ok: false } } finally { ownPulse = false }
    const ok = !r || r.ok !== false
    autoStarted = false
    note({ feature: 'autoPulse', kind: 'restored', key: 'pulse', ok, detail: manual ? 'manual-boost-ended-with-game' : 'ok' })
    setFeature('autoPulse', { status: 'idle', lastEnd: ok ? 'restored' : null, restoreFailed: ok ? null : true })
    safe2(() => deps.legacyEvent && deps.legacyEvent({ event: 'auto-pulse-stop', gameId: game && game.id }))
  }

  // ── session ──
  async function sessionStart(game) {
    session = Ledger.open({ id: 'gs' + now().toString(36) + (++seq), game, now: now() })
    features = {}; autoStarted = false
    st.current = session; persist()
    log('Game detected: ' + game.name, 'head')
    emit()
    const ev = await safe(() => (deps.effects && deps.effects.start ? deps.effects.start(game) : []), [])
    for (const e of ev || []) note(e)
    await gsStart(game)
    await ugStart()
    await apStart(game)
    safe2(() => deps.legacyEvent && deps.legacyEvent({ event: 'game-started', gameId: game.id, displayName: game.name, isDbOnly: !game.pulse }))
    emit()
  }

  async function sessionEnd(game, reason) {
    if (!session) return
    log('Game closed: ' + game.name + ' — restoring', 'info')
    setFeature('watcher', { ending: true }); emit()
    await gsEnd()
    await ugEnd()
    const ev = await safe(() => (deps.effects && deps.effects.end ? deps.effects.end(game, reason) : []), [])
    for (const e of ev || []) note(e)
    await apEnd(game)
    const closed = Ledger.close(session, reason, now())
    const sum = Ledger.summary(closed)
    st.sessions = Ledger.trim([closed, ...st.sessions])
    st.current = null
    session = null
    persist()
    safe2(() => deps.legacyEvent && deps.legacyEvent({ event: 'game-closed', gameId: game.id }))
    log(sum.clean ? 'Game session ended — everything restored.' : 'Game session ended — some changes could not be put back.', sum.clean ? 'ok' : 'err')
    emit()
  }

  async function tickOnce() {
    load()
    if (!running) return
    if (deps.competeActive && deps.competeActive()) { if (!paused) { paused = true; emit() } return }
    if (paused) { paused = false; emit() }
    const snap = await safe(() => deps.processes(), { ok: false })
    const game = snap && snap.ok ? Targets.match(snap.names, targets(), watch.game && watch.game.id) : null
    const { state, actions } = Watch.step(watch, { ok: !!(snap && snap.ok), game })
    watch = state
    for (const a of actions) {
      if (a.type === 'start') await sessionStart(a.game)
      else if (a.type === 'end') await sessionEnd(a.game, a.reason)
      else emit()
    }
  }
  const tick = () => enqueue(tickOnce)

  function startWatcher() {
    return enqueue(async () => {
      load()
      if (running) return { ok: true, status: 'already running' }
      running = true; watch = Watch.init()
      timer = setInterval(() => { if (!ticking) { ticking = true; tick().finally(() => { ticking = false }) } }, deps.tickMs || TICK_MS)
      if (timer.unref) timer.unref()
      log('Game Watcher started', 'ok')
      await tickOnce()       // a game that is already running starts its session now
      emit()
      return { ok: true, status: 'started' }
    })
  }
  function stopWatcher() {
    return enqueue(async () => {
      if (timer) { clearInterval(timer); timer = null }
      const wasRunning = running
      running = false; paused = false
      if (session && watch.game) await sessionEnd(watch.game, 'watcher-stopped')
      watch = Watch.init()
      if (wasRunning) log('Game Watcher stopped.', 'info')
      emit()
      return { ok: true }
    })
  }

  // ── settings ──
  const premiumOnly = ['updateGuard', 'shield', 'autoPulse']
  const KEYS = { watcher: 'gameWatcherEnabled', updateGuard: 'updateGuardEnabled', shield: 'gameShieldEnabled', autoPulse: 'autoPulseEnabled' }

  function set(patch = {}) {
    return enqueue(async () => {
      load()
      const out = { ok: true }
      for (const name of Object.keys(KEYS)) {
        if (typeof patch[name] !== 'boolean') continue
        const on = patch[name]
        if (on && premiumOnly.includes(name) && !deps.premium()) return { ok: false, reason: 'premium_required' }
        if (!deps.saveSettings({ [KEYS[name]]: on })) return { ok: false, error: 'settings_write_failed' }
        if (name === 'watcher') { if (on) await startWatcherInner(); else await stopWatcherInner() }
        else if (session) {
          // the game is already running: apply (or take back) this feature for it right now
          if (name === 'updateGuard') { if (on) await ugStart(); else await ugEnd() }
          if (name === 'shield') { if (on) await gsStart(session.game); else await gsEnd() }
          if (name === 'autoPulse') { if (on) await apStart(session.game); else await apEnd(session.game) }
        }
      }
      if (patch.tier3 !== undefined || patch.mid !== undefined) {
        const cur = cfg()
        const p = Model.clampPair(patch.tier3 !== undefined ? patch.tier3 : cur.tier3, patch.mid !== undefined ? patch.mid : cur.mid, patch.tier3 !== undefined ? 'tier3' : 'mid')
        if (!deps.saveSettings({ gameShieldTier3Threshold: p.tier3, gameShieldMidSessionThreshold: p.mid })) return { ok: false, error: 'settings_write_failed' }
        out.tier3 = p.tier3; out.mid = p.mid
      }
      if (typeof patch.libraryDetect === 'boolean') { st.libraryDetect = { library: patch.libraryDetect }; if (!persist()) return { ok: false, error: 'state_write_failed' } }
      if (patch.pulseOff && typeof patch.pulseOff.gameId === 'string') {
        const id = patch.pulseOff.gameId
        const next = patch.pulseOff.off ? [...new Set([...st.pulseOff, id])] : st.pulseOff.filter(x => x !== id)
        st.pulseOff = next
        if (!persist()) return { ok: false, error: 'state_write_failed' }
      }
      if (patch.pulseReset) { st.pulseOff = []; persist() }
      if (patch.dismissLegacy) { st.legacyOverrides = 0; persist() }
      emit()
      return { ...out, state: snapshot() }
    })
  }
  // the inner variants run inside an already queued op
  async function startWatcherInner() {
    if (running) return
    running = true; watch = Watch.init()
    timer = setInterval(() => { if (!ticking) { ticking = true; tick().finally(() => { ticking = false }) } }, deps.tickMs || TICK_MS)
    if (timer.unref) timer.unref()
    await tickOnce()
  }
  async function stopWatcherInner() {
    if (timer) { clearInterval(timer); timer = null }
    running = false; paused = false
    if (session && watch.game) await sessionEnd(watch.game, 'watcher-stopped')
    watch = Watch.init()
  }

  /** Exclusions: validated, de-duplicated, and only reported as saved when the write really worked. */
  function exclusion({ add, remove } = {}) {
    return enqueue(async () => {
      const list = cfg().exclusions
      let next = list
      if (typeof add === 'string') {
        const v = GS.validateExclusion(add, list)
        if (!v.ok) return { ok: false, reason: v.reason, exclusions: list }
        next = [...list, v.value]
      } else if (typeof remove === 'string') next = list.filter(x => x !== remove.toLowerCase())
      else return { ok: false, reason: 'bad_request', exclusions: list }
      if (!deps.saveSettings({ gameShieldExclusions: next })) return { ok: false, error: 'settings_write_failed', exclusions: list }
      emit()
      return { ok: true, exclusions: next, coverage: typeof add === 'string' ? GS.coverage(add) : undefined }
    })
  }

  /** Retry a restore that failed: 'updateGuard' | 'shield'. */
  function retry(what) {
    return enqueue(async () => {
      if (what === 'updateGuard') {
        const r = await safe(() => deps.updateGuard.release(), { ok: false })
        setFeature('updateGuard', r.ok ? { status: 'idle', held: false, restoreFailed: false, lastEnd: 'restored' } : { restoreFailed: true })
        emit(); return { ok: !!r.ok }
      }
      if (what === 'shield') {
        const r = await safe(() => deps.shield.recover(), null)
        const failed = r ? gsRecord(r) : []
        setFeature('shield', { restoreFailed: failed.length ? failed : null, active: false, lastEnd: failed.length ? null : 'restored' })
        emit(); return { ok: !failed.length }
      }
      return { ok: false, reason: 'bad_request' }
    })
  }

  /** At app start: finish what a crash or forced shutdown left behind. */
  function recover() {
    return enqueue(async () => {
      load()
      const result = { updateGuard: null, shield: null, session: null }
      if (st.current) {
        const left = Ledger.add(st.current, { feature: 'watcher', kind: 'info', detail: 'app-closed-during-session', at: now() })
        session = left
        result.session = left.id
      }
      if (safe2(() => deps.updateGuard.pendingRestore())) {
        const r = await safe(() => deps.updateGuard.release(), { ok: false })
        result.updateGuard = r.ok
        setFeature('updateGuard', r.ok ? { held: false, lastEnd: 'restored', restoreFailed: false } : { restoreFailed: true })
        if (session) note({ feature: 'updateGuard', kind: 'restored', key: 'wu', ok: !!r.ok, detail: 'recovery' })
      }
      const sr = await safe(() => (deps.shield.recover ? deps.shield.recover() : null), null)
      if (sr && ((sr.restored && sr.restored.length) || (sr.failed && sr.failed.length))) {
        const failed = gsRecord(sr)
        result.shield = !failed.length
        setFeature('shield', { restoreFailed: failed.length ? failed : null, lastEnd: failed.length ? null : 'restored' })
      }
      if (session) {
        const closed = Ledger.close(session, 'crash', now())
        st.sessions = Ledger.trim([closed, ...st.sessions]); st.current = null; session = null; persist()
      }
      emit()
      return result
    })
  }

  /** main.js tells us after every Pulse start/stop, from any surface, so the UI never keeps a stale "active". */
  function pulseChanged(activePreset) {
    if (ownPulse || !session) return
    const f = features.autoPulse
    if (!f) return
    if (!activePreset && (f.status === 'active')) { autoStarted = false; setFeature('autoPulse', { status: 'snoozed' }); note({ feature: 'autoPulse', kind: 'info', detail: 'stopped-by-user' }); emit() }
    else if (activePreset && f.status !== 'active' && f.status !== 'manual') { setFeature('autoPulse', { status: 'manual', preset: activePreset }); emit() }
  }

  /** Counts overrides from the old preset-override file; they are not carried over (see docs/GAMEAUTO_EVIDENCE.md). */
  function migrateLegacy(count) { load(); if (count > 0 && !st.legacyMigrated) { st.legacyMigrated = true; st.legacyOverrides = count; persist() } }

  /** The 8 h safety timer released Windows Update by itself. */
  function ugExpired(r) {
    setFeature('updateGuard', r && r.ok ? { status: 'idle', held: false, restoreFailed: false, lastEnd: 'restored' } : { restoreFailed: true })
    note({ feature: 'updateGuard', kind: 'restored', key: 'wu', ok: !!(r && r.ok), detail: 'time-limit' })
    emit()
  }

  /** Game Shield stopped more programs because RAM passed the mid-session threshold. */
  function shieldMid(names) {
    if (!session || !names || !names.length) return
    const f = features.shield || {}
    setFeature('shield', { stopped: [...(f.stopped || []), ...names] })
    for (const n of names) note({ feature: 'shield', kind: 'applied', key: n, detail: 'mid-session' })
    emit()
  }

  return { ugExpired, shieldMid, snapshot, startWatcher, stopWatcher, tick, set, exclusion, retry, recover, pulseChanged, migrateLegacy, isRunning: () => running, currentGame: () => (watch.game || null) }
}

module.exports = { create, TICK_MS }
