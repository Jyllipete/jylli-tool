const test = require('node:test')
const assert = require('node:assert/strict')
const Auto = require('../lib/gameauto')

const presets = { csgo: { name: 'CS2 / CS:GO', exe: 'cs2' }, apex: { name: 'Apex Legends', exe: 'r5apex*' } }
const known = [{ id: 'gtav', name: 'GTA V', exes: ['GTA5.exe'], pulse: 'fivem' }]

function world(over = {}) {
  const w = {
    names: new Set(), listOk: true, premium: true, compete: false, saveOk: true, stateOk: true,
    settings: { gameWatcherEnabled: false, updateGuardEnabled: true, gameShieldEnabled: true, autoPulseEnabled: true, ...over },
    store: null, pulseActive: null, pulseStartOk: true, shieldRestoreFail: null, ug: { held: false, pending: false, releaseOk: true, holdState: 'holding' },
    calls: [], legacy: [], events: [], tstate: null,
  }
  const deps = {
    now: (() => { let t = 1000; return () => (t += 10) })(),
    tickMs: 3600000,
    settings: () => w.settings,
    saveSettings: patch => { if (!w.saveOk) return false; Object.assign(w.settings, patch); return true },
    premium: () => w.premium,
    processes: async () => ({ ok: w.listOk, names: w.names }),
    sources: () => ({ presets, known, library: [{ id: 'lib:hades', name: 'Hades', exes: ['Hades.exe'], source: 'custom' }] }),
    competeActive: () => w.compete,
    state: { read: () => w.store, write: v => { if (!w.stateOk) return false; w.store = JSON.parse(JSON.stringify(v)); return true } },
    updateGuard: {
      pendingUpdates: async () => ({ count: 2 }),
      hold: async () => { w.calls.push('ug.hold'); if (w.ug.holdState === 'holding') { w.ug.held = true; w.ug.pending = true } return { ok: w.ug.holdState !== 'failed', state: w.ug.holdState, reason: w.ug.holdState === 'skipped' ? 'already-disabled' : 'not-held' } },
      release: async () => { w.calls.push('ug.release'); if (!w.ug.releaseOk) return { ok: false, state: 'failed' }; w.ug.held = false; w.ug.pending = false; return { ok: true, state: 'restored' } },
      pendingRestore: () => w.ug.pending,
    },
    shield: {
      activate: async g => { w.calls.push('shield.activate'); return { ok: true, stopped: ['onedrive.exe', 'teams.exe'] } },
      deactivate: async () => { w.calls.push('shield.deactivate'); return w.shieldRestoreFail ? { ok: true, restored: ['onedrive.exe'], failed: [{ name: 'teams.exe', verdict: w.shieldRestoreFail }], stoppedCount: 2, freedMB: 300 } : { ok: true, restored: ['onedrive.exe', 'teams.exe'], failed: [], stoppedCount: 2, freedMB: 300 } },
      recover: async () => null, active: () => false,
    },
    pulse: {
      active: () => w.pulseActive,
      start: async id => { w.calls.push('pulse.start:' + id); if (!w.pulseStartOk) return { ok: false, error: 'Unknown preset' }; w.pulseActive = id; return { ok: true } },
      stop: async () => { w.calls.push('pulse.stop'); w.pulseActive = null; return { ok: true } },
    },
    effects: { start: async g => { w.calls.push('fx.start'); return [{ feature: 'apps', kind: 'applied', key: 'gametime' }] }, end: async () => { w.calls.push('fx.end'); return [{ feature: 'apps', kind: 'restored', key: 'gametime' }] } },
    emit: p => w.events.push(p),
    legacyEvent: p => w.legacy.push(p.event),
    log: () => {},
  }
  w.svc = Auto.create(deps)
  w.run = async (...names) => { w.names = new Set(names); await w.svc.tick() }
  return w
}
const last = w => w.svc.snapshot().lastSession

test('a game that is already running starts its session when the watcher starts, and everything is applied', async () => {
  const w = world(); w.names = new Set(['cs2'])
  await w.svc.startWatcher()
  const s = w.svc.snapshot()
  assert.equal(s.session.game.id, 'csgo')
  assert.deepEqual(w.calls, ['fx.start', 'shield.activate', 'ug.hold', 'pulse.start:csgo'])
  assert.equal(s.features.updateGuard.status, 'holding')
  assert.equal(s.features.updateGuard.pending.count, 2)
  assert.equal(s.features.autoPulse.status, 'active')
  assert.deepEqual(w.legacy, ['auto-pulse-start', 'game-started'])
})

test('exit: two missed checks end the session and put everything back, the ledger says so', async () => {
  const w = world(); w.names = new Set(['cs2']); await w.svc.startWatcher()
  await w.run('chrome'); assert.ok(w.svc.snapshot().session, 'one miss keeps the session')
  await w.run('chrome')
  const s = w.svc.snapshot()
  assert.equal(s.session, null)
  assert.ok(last(w).summary.clean)
  assert.equal(last(w).endReason, 'exit')
  assert.equal(w.ug.held, false); assert.equal(w.pulseActive, null)
  assert.equal(s.features.updateGuard.lastEnd, 'restored')
  assert.ok(w.legacy.includes('game-closed') && w.legacy.includes('auto-pulse-stop'))
  assert.equal(w.store.current, null)
})

test('a failed process listing never ends a session', async () => {
  const w = world(); w.names = new Set(['cs2']); await w.svc.startWatcher()
  w.listOk = false
  for (let i = 0; i < 5; i++) await w.svc.tick()
  assert.ok(w.svc.snapshot().session)
  assert.equal(w.svc.snapshot().watcher.degraded, true)
})

test('Auto-Pulse failure is reported as failed and never announced as started', async () => {
  const w = world(); w.pulseStartOk = false; w.names = new Set(['cs2'])
  await w.svc.startWatcher()
  const f = w.svc.snapshot().features.autoPulse
  assert.equal(f.status, 'failed')
  assert.ok(!w.legacy.includes('auto-pulse-start'))
  assert.equal(w.svc.snapshot().session.events.find(e => e.feature === 'autoPulse').kind, 'failed')
})

test('a boost the user started is never replaced; one for the same game ends with it, one for another game stays', async () => {
  const a = world(); a.pulseActive = 'csgo'; a.names = new Set(['cs2']); await a.svc.startWatcher()
  assert.equal(a.svc.snapshot().features.autoPulse.status, 'manual')
  assert.ok(!a.calls.includes('pulse.start:csgo'))
  await a.run(); await a.run()
  assert.equal(a.pulseActive, null)
  const b = world(); b.pulseActive = 'apex'; b.names = new Set(['cs2']); await b.svc.startWatcher()
  await b.run(); await b.run()
  assert.equal(b.pulseActive, 'apex')
})

test('stopping the watcher in the middle of a game restores everything', async () => {
  const w = world(); w.names = new Set(['cs2']); await w.svc.startWatcher()
  await w.svc.stopWatcher()
  assert.equal(w.svc.snapshot().session, null)
  assert.ok(w.calls.includes('shield.deactivate') && w.calls.includes('ug.release') && w.calls.includes('fx.end'))
  assert.equal(w.ug.held, false); assert.equal(w.pulseActive, null)
  assert.equal(last(w).endReason, 'watcher-stopped')
})

test('Update Guard restore failure is shown as failed, the session is not clean, retry fixes it', async () => {
  const w = world(); w.names = new Set(['cs2']); await w.svc.startWatcher()
  w.ug.releaseOk = false
  await w.run(); await w.run()
  const s = w.svc.snapshot()
  assert.equal(s.features.updateGuard.restoreFailed, true)
  assert.equal(s.lastSession.summary.clean, false)
  assert.equal(require('../lib/gameauto/model').phaseOf('updateGuard', s), 'failed')
  w.ug.releaseOk = true
  assert.equal((await w.svc.retry('updateGuard')).ok, true)
  assert.equal(w.svc.snapshot().features.updateGuard.restoreFailed, false)
})

test('Game Shield reports each program it could not start again', async () => {
  const w = world(); w.shieldRestoreFail = 'no-path'; w.names = new Set(['cs2']); await w.svc.startWatcher()
  await w.run(); await w.run()
  const f = w.svc.snapshot().features.shield
  assert.deepEqual(f.restoreFailed.map(x => [x.name, x.verdict]), [['teams.exe', 'no-path']])
  assert.equal(last(w).summary.failedRestores.length, 1)
})

test('Update Guard that skipped (service already disabled) is shown as skipped, not held', async () => {
  const w = world(); w.ug.holdState = 'skipped'; w.names = new Set(['cs2']); await w.svc.startWatcher()
  assert.equal(w.svc.snapshot().features.updateGuard.status, 'skipped')
  assert.equal(require('../lib/gameauto/model').phaseOf('updateGuard', w.svc.snapshot()), 'skipped')
})

test('free accounts: the watcher works, the premium features do nothing and cannot be switched on', async () => {
  const w = world(); w.premium = false; w.names = new Set(['cs2']); await w.svc.startWatcher()
  assert.deepEqual(w.calls, ['fx.start'])
  assert.deepEqual(await w.svc.set({ shield: true }), { ok: false, reason: 'premium_required' })
})

test('Auto-Pulse: no preset for a library game, and per-game off', async () => {
  const w = world(); w.names = new Set(['hades']); await w.svc.startWatcher()
  assert.equal(w.svc.snapshot().features.autoPulse.reason, 'no-preset')
  await w.svc.stopWatcher()
  await w.svc.set({ pulseOff: { gameId: 'csgo', off: true } })
  w.names = new Set(['cs2']); await w.svc.startWatcher()
  assert.equal(w.svc.snapshot().features.autoPulse.status, 'off-for-game')
  assert.ok(!w.calls.includes('pulse.start:csgo'))
  await w.svc.set({ pulseReset: true })
  assert.deepEqual(w.svc.snapshot().settings.pulseOff, [])
})

test('toggling a feature during a game applies or takes it back at once', async () => {
  const w = world({ updateGuardEnabled: false }); w.names = new Set(['cs2']); await w.svc.startWatcher()
  assert.ok(!w.calls.includes('ug.hold'))
  await w.svc.set({ updateGuard: true })
  assert.equal(w.ug.held, true)
  await w.svc.set({ updateGuard: false })
  assert.equal(w.ug.held, false)
})

test('a failed settings write is reported and nothing is applied', async () => {
  const w = world(); w.saveOk = false
  assert.deepEqual(await w.svc.set({ watcher: true }), { ok: false, error: 'settings_write_failed' })
  assert.equal(w.svc.isRunning(), false)
  assert.equal((await w.svc.exclusion({ add: 'obs64' })).error, 'settings_write_failed')
})

test('exclusions are validated, de-duplicated and report coverage', async () => {
  const w = world()
  const a = await w.svc.exclusion({ add: ' OBS64 ' })
  assert.deepEqual([a.ok, a.exclusions], [true, ['obs64.exe']])
  assert.equal((await w.svc.exclusion({ add: 'obs64.exe' })).reason, 'duplicate')
  assert.equal((await w.svc.exclusion({ add: 'a;b' })).reason, 'format')
  assert.equal((await w.svc.exclusion({ add: 'discord' })).coverage, 'tier3')
  assert.deepEqual((await w.svc.exclusion({ remove: 'OBS64.exe' })).exclusions, ['discord.exe'])
})

test('thresholds are saved clamped with the five point gap', async () => {
  const w = world()
  const r = await w.svc.set({ tier3: 85 })
  assert.deepEqual([r.tier3, r.mid], [85, 90])
  assert.equal(w.settings.gameShieldMidSessionThreshold, 90)
  assert.equal((await w.svc.set({ mid: 60 })).mid, 90)
})

test('a different game ends the first session before the second starts', async () => {
  const w = world(); w.names = new Set(['cs2']); await w.svc.startWatcher()
  await w.run('r5apex_dx12')
  const s = w.svc.snapshot()
  assert.equal(s.session.game.id, 'apex')
  assert.equal(s.history[0].game.id, 'csgo')
  assert.equal(s.history[0].endReason, 'switch')
})

test('Competitive Mode pauses the watcher and leaves everything alone', async () => {
  const w = world(); await w.svc.startWatcher()
  w.compete = true; await w.run('cs2')
  assert.equal(w.svc.snapshot().session, null)
  assert.equal(w.svc.snapshot().watcher.paused, true)
  w.compete = false; await w.run('cs2')
  assert.equal(w.svc.snapshot().watcher.paused, false)
  assert.ok(w.svc.snapshot().session)
})

test('the user stopping an automatic boost snoozes Auto-Pulse for this game', async () => {
  const w = world(); w.names = new Set(['cs2']); await w.svc.startWatcher()
  w.pulseActive = null; w.svc.pulseChanged(null)
  assert.equal(w.svc.snapshot().features.autoPulse.status, 'snoozed')
  await w.run(); await w.run()
  assert.equal(w.svc.snapshot().session, null)
})

test('crash recovery: the persisted session is closed as a crash and Windows Update is released', async () => {
  const w = world(); w.names = new Set(['cs2']); await w.svc.startWatcher()
  const persisted = JSON.parse(JSON.stringify(w.store))
  assert.ok(persisted.current)
  // new process: same saved state, held service still recorded
  const w2 = world(); w2.store = persisted; w2.ug.pending = true; w2.ug.held = true
  const r = await w2.svc.recover()
  assert.equal(r.updateGuard, true)
  assert.equal(w2.ug.held, false)
  const s = w2.svc.snapshot()
  assert.equal(s.lastSession.endReason, 'crash')
  assert.equal(s.session, null)
  assert.equal(w2.store.current, null)
})

test('a legacy preset override count is surfaced once and can be dismissed', async () => {
  const w = world(); w.svc.migrateLegacy(3)
  assert.equal(w.svc.snapshot().legacyOverrides, 3)
  await w.svc.set({ dismissLegacy: true })
  assert.equal(w.svc.snapshot().legacyOverrides, 0)
  w.svc.migrateLegacy(3)
  assert.equal(w.svc.snapshot().legacyOverrides, 0)
})
