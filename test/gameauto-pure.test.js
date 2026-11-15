const test = require('node:test')
const assert = require('node:assert/strict')
const T = require('../lib/gameauto/targets')
const W = require('../lib/gameauto/watch')
const L = require('../lib/gameauto/ledger')
const M = require('../lib/gameauto/model')

const presets = {
  csgo: { name: 'CS2 / CS:GO', exe: 'cs2' }, fivem: { name: 'FiveM', exe: 'FiveM_GTAProcess' }, apex: { name: 'Apex Legends', exe: 'r5apex*' },
  minecraft: { name: 'Minecraft', exe: 'javaw' }, arma: { name: 'Arma Reforger', exe: 'ArmaReforger*' },
}
const known = [
  { id: 'cs2', name: 'Counter-Strike 2', exes: ['cs2.exe'], pulse: 'csgo' },
  { id: 'gtav', name: 'GTA V', exes: ['GTA5.exe'], pulse: 'fivem' },
  { id: 'apex', name: 'Apex Legends', exes: ['r5apex_dx12.exe', 'r5apex.exe'], pulse: 'apex' },
  { id: 'minecraft', name: 'Minecraft', exes: ['Minecraft.Windows.exe'], pulse: 'minecraft' },
]
const library = [{ id: 'lib:hades', name: 'Hades', exes: ['Hades.exe'], source: 'custom' }, { id: 'lib:auto', name: 'Auto Found', exes: ['found.exe'], source: 'library' }]
const names = (...n) => new Set(n)

test('targets: preset ids stay the game id, new executables of a curated game are found', () => {
  const t = T.build({ presets, known, library })
  assert.equal(T.match(names('cs2', 'chrome'), t).id, 'csgo')
  const apex = T.match(names('r5apex_dx12'), t)
  assert.deepEqual([apex.id, apex.pulse], ['apex', 'apex'])
  assert.equal(T.match(names('fivem_b3095_gtaprocess'), t).id, 'fivem')
  assert.equal(T.match(names('armareforgersteam'), t).id, 'arma')
})

test('targets: a Pulse preset is only attached when the running exe fits it', () => {
  const t = T.build({ presets, known, library })
  const gta = T.match(names('gta5'), t)
  assert.deepEqual([gta.id, gta.pulse], ['gtav', null])
  const bedrock = T.match(names('minecraft.windows'), t)
  assert.deepEqual([bedrock.id, bedrock.pulse], ['minecraft', null])
  assert.equal(T.match(names('javaw'), t).pulse, 'minecraft')
})

test('targets: library games are opt-in, custom games on by default', () => {
  const t = T.build({ presets, known, library })
  assert.equal(T.match(names('hades'), t).source, 'custom')
  assert.equal(T.match(names('found'), t), null)
  assert.equal(T.match(names('found'), T.build({ presets, known, library }, { library: true })).id, 'lib:auto')
  assert.equal(T.match(names('hades'), T.build({ presets, known, library }, { custom: false })), null)
})

test('targets: the current game wins while it still runs', () => {
  const t = T.build({ presets, known, library })
  assert.equal(T.match(names('cs2', 'hades'), t, 'lib:hades').id, 'lib:hades')
  assert.equal(T.match(names('cs2', 'hades'), t, null).id, 'csgo')
  assert.equal(T.match(names('notepad'), t), null)
})

test('watch: probe failures never end a session and flag degraded after three', () => {
  let s = W.init(); let r
  r = W.step(s, { ok: true, game: { id: 'a' } }); s = r.state
  assert.deepEqual(r.actions.map(a => a.type), ['start'])
  for (let i = 0; i < 2; i++) { r = W.step(s, { ok: false }); s = r.state; assert.equal(r.actions.length, 0) }
  r = W.step(s, { ok: false }); s = r.state
  assert.deepEqual(r.actions.map(a => a.type), ['degraded'])
  assert.equal(s.game.id, 'a')
  r = W.step(s, { ok: true, game: { id: 'a' } })
  assert.deepEqual(r.actions.map(a => a.type), ['recovered'])
})

test('watch: one miss keeps the session, two end it', () => {
  let s = W.step(W.init(), { ok: true, game: { id: 'a' } }).state
  let r = W.step(s, { ok: true, game: null }); s = r.state
  assert.equal(r.actions.length, 0)
  r = W.step(s, { ok: true, game: { id: 'a' } }); s = r.state
  assert.equal(s.misses, 0)
  s = W.step(s, { ok: true, game: null }).state
  r = W.step(s, { ok: true, game: null })
  assert.deepEqual(r.actions.map(a => [a.type, a.reason]), [['end', 'exit']])
  assert.equal(r.state.game, null)
})

test('watch: a different game ends the old one first, then starts the new one; a game already running starts at once', () => {
  let s = W.step(W.init(), { ok: true, game: { id: 'a' } }).state
  const r = W.step(s, { ok: true, game: { id: 'b' } })
  assert.deepEqual(r.actions.map(a => a.type + ':' + (a.game && a.game.id)), ['end:a', 'start:b'])
  assert.equal(r.actions[0].reason, 'switch')
})

test('ledger: pairs applied changes with restores and flags what is still pending', () => {
  let s = L.open({ id: 's1', game: { id: 'a', name: 'A' }, now: 1 })
  s = L.add(s, { feature: 'updateGuard', kind: 'applied', key: 'wu' })
  s = L.add(s, { feature: 'shield', kind: 'applied', key: 'discord' })
  s = L.add(s, { feature: 'shield', kind: 'restored', key: 'discord' })
  s = L.add(s, { feature: 'updateGuard', kind: 'restored', key: 'wu', ok: false })
  const sum = L.summary(s)
  assert.deepEqual([sum.changed, sum.restored, sum.failed], [2, 1, 1])
  assert.equal(sum.pending.length, 1)
  assert.equal(sum.clean, false)
  s = L.add(s, { feature: 'updateGuard', kind: 'restored', key: 'wu' })
  assert.equal(L.summary(s).pending.length, 0)
  assert.equal(L.trim(Array.from({ length: 30 }, (_, i) => i)).length, 10)
})

const base = () => ({ premium: true, settings: { watcher: true, updateGuard: true, shield: true, autoPulse: true, tier3: 70, mid: 80, pulseOff: [] }, watcher: { running: true }, session: null, features: {}, lists: { tier1: ['onedrive'], tier3: ['discord'], browsers: ['chrome'] } })

test('model: phases follow the switches, the watcher and the session', () => {
  const r = base()
  assert.equal(M.phaseOf('updateGuard', r), 'armed')
  r.watcher.running = false
  assert.equal(M.phaseOf('autoPulse', r), 'needsWatcher')
  r.watcher.running = true
  r.session = { game: { id: 'a', name: 'A', pulse: null } }
  r.features.updateGuard = { status: 'holding' }
  r.features.autoPulse = { status: 'failed' }
  assert.equal(M.phaseOf('updateGuard', r), 'active')
  assert.equal(M.phaseOf('autoPulse', r), 'failed')
  r.features.shield = { restoreFailed: [{ name: 'x' }] }
  assert.equal(M.phaseOf('shield', r), 'failed')
  r.premium = false
  assert.equal(M.phaseOf('shield', r), 'locked')
  assert.deepEqual(M.armed(r), { n: 1, total: 1 })
})

test('model: after a session the feature says restored only when something was restored', () => {
  const r = base()
  r.features.updateGuard = { lastEnd: 'restored' }
  assert.equal(M.phaseOf('updateGuard', r), 'restored')
})

test('model: Auto-Pulse is unavailable for a game without a preset and when switched off for that game', () => {
  const r = base()
  r.session = { game: { id: 'lib:x', name: 'X', pulse: null } }
  assert.deepEqual(M.autoPulseFor(r), { can: false, reason: 'no-preset', name: 'X' })
  r.session = { game: { id: 'apex', name: 'Apex', pulse: 'apex' } }
  r.settings.pulseOff = ['apex']
  assert.equal(M.autoPulseFor(r).reason, 'off-for-game')
})

test('model: plan lists only what is on, with the real thresholds', () => {
  const r = base(); r.settings.updateGuard = false
  const p = M.plan(r)
  assert.ok(!p.start.some(i => i.feature === 'updateGuard'))
  assert.equal(p.playing[0].vars.mid, 80)
  assert.equal(p.start.find(i => i.feature === 'shield').vars.t3, 70)
})

test('model: clampPair keeps the 5 point gap and the engine limits', () => {
  assert.deepEqual(M.clampPair(70, 80), { tier3: 70, mid: 80, moved: null })
  assert.equal(M.clampPair(90, 80, 'tier3').mid, 95)
  assert.equal(M.clampPair(95, 80).tier3, 90)
  assert.equal(M.clampPair(70, 72, 'mid').mid, 75)
  assert.equal(M.clampPair('x', 'y').mid, 80)
})
