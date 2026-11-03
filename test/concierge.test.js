const test = require('node:test')
const assert = require('node:assert')
const C = require('../js/concierge')

const conflicts = {
  sysmain: { warnIf: si => si.ramGB > 0 && si.ramGB < 16 },
  'usb-suspend': { warnIf: si => si.isLaptop },
  'power-throttling': { warnIf: si => si.isLaptop },
}
const plan = [
  { id: 'game-dvr', safetyTier: 1, gamerImpact: 'high' },
  { id: 'sysmain', safetyTier: 1, gamerImpact: 'high' },
  { id: 'usb-suspend', safetyTier: 1, gamerImpact: 'high' },
  { id: 'telemetry', safetyTier: 2, gamerImpact: 'high' },
  { id: 'visual-fx', safetyTier: 1, gamerImpact: 'low' },
  { id: 'mouse-accel', safetyTier: 1, gamerImpact: 'high' },
]
const deps = { tier: { tier: 'mid' }, plan, conflicts, startupRecommended: ['OneDrive', 'Spotify'] }
const base = () => ({
  sysInfo: { ramGB: 32, isLaptop: false, isWifi: false },
  profile: { useCase: 'fps', priorities: ['performance'], comfort: 'balanced', games: [] },
  pfStates: {}, osType: 'Stock', health: { checked: true, ok: true, restorePoint: true },
  games: [{ name: 'Counter-Strike 2' }], startupItems: [{ Name: 'OneDrive', Enabled: true, Impact: 'Low' }, { Name: 'Spotify', Enabled: true }],
  isPremium: true, settings: {},
})
const ids = ms => ms.map(m => m.id)

test('laptop: no power move, no usb-suspend in the essentials', () => {
  const i = base(); i.sysInfo = { ramGB: 16, isLaptop: true, isWifi: false }
  const ms = C.recommend(i, deps)
  assert.ok(!ids(ms).includes('power'))
  const ess = ms.find(m => m.id === 'essentials')
  assert.ok(ess && !ess.action.ids.includes('usb-suspend') && !ess.action.ids.includes('power-throttling'))
})

test('under 16 GB RAM keeps sysmain out of the essentials', () => {
  const i = base(); i.sysInfo.ramGB = 8
  assert.ok(!C.recommend(i, deps).find(m => m.id === 'essentials').action.ids.includes('sysmain'))
  assert.ok(C.recommend(base(), deps).find(m => m.id === 'essentials').action.ids.includes('sysmain'))
})

test('a corrupt health check puts repair first', () => {
  const i = base(); i.health = { checked: true, ok: false, restorePoint: true }
  const ms = C.recommend(i, deps)
  assert.strictEqual(ms[0].id, 'repair'); assert.strictEqual(ms[0].blocking, true)
})

test('safe comfort keeps tier 1 and low-risk moves only', () => {
  const i = base(); i.profile.comfort = 'safe'; i.sysInfo.isWifi = true
  const ms = C.recommend(i, deps)
  assert.ok(ms.every(m => m.risk === 1))
  assert.ok(!ids(ms).includes('network') && !ids(ms).includes('debloat'))
  assert.ok(ms.find(m => m.id === 'essentials').action.ids.every(id => plan.find(t => t.id === id).safetyTier === 1))
})

test('applied tweaks are dropped, and an empty essentials move disappears', () => {
  const i = base(); i.pfStates = { 'game-dvr': true, sysmain: true, 'usb-suspend': true }; i.settings = { 'tweak_mouse-accel': 'applied' }
  assert.ok(!C.recommend(i, deps).find(m => m.id === 'essentials') )
})

test('at most 5 moves and one per tab', () => {
  const i = base(); i.sysInfo.isWifi = true; i.games = [{ name: 'FiveM' }]; i.profile.comfort = 'expert'
  i.health = { checked: true, ok: false, restorePoint: false }
  const ms = C.recommend(i, deps)
  assert.ok(ms.length <= 5)
  assert.strictEqual(new Set(ms.map(m => m.tab)).size, ms.length)
  assert.deepStrictEqual(ids(ms).slice(0, 2).sort(), ['repair', 'restore'])
})

test('free users get the Pulse preset instead of game profiles, and no Pro-only moves', () => {
  const i = base(); i.isPremium = false; i.profile.comfort = 'expert'
  const ms = ids(C.recommend(i, deps))
  assert.ok(!ms.includes('game') && !ms.includes('power') && !ms.includes('latency'))
  assert.ok(ms.includes('gamePulse') || ms.length === 5)
})

test('output is deterministic', () => {
  const a = JSON.stringify(C.recommend(base(), deps)), b = JSON.stringify(C.recommend(base(), deps))
  assert.strictEqual(a, b)
})

test('isDone and hintFor respect done, dismissed and applied tweaks', () => {
  const ms = C.recommend(base(), deps)
  const ess = ms.find(m => m.id === 'essentials')
  assert.strictEqual(C.isDone(ess, { concierge: { done: ['essentials'] } }), true)
  assert.strictEqual(C.isDone(ess, Object.fromEntries(ess.action.ids.map(id => ['tweak_' + id, 'applied']))), true)
  assert.strictEqual(C.isDone(ess, {}), false)
  assert.strictEqual(C.hintFor('windows', ms, {}).id, 'essentials')
  assert.strictEqual(C.hintFor('windows', ms, { concierge: { dismissed: ['essentials'] } }), null)
  assert.strictEqual(C.hintFor('nowhere', ms, {}), null)
})
