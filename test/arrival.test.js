const test = require('node:test')
const assert = require('node:assert')
const A = require('../js/arrival')

test('greetingKey follows the time of day', () => {
  assert.strictEqual(A.greetingKey(5), 'greetMorning')
  assert.strictEqual(A.greetingKey(10), 'greetMorning')
  assert.strictEqual(A.greetingKey(11), 'greetDay')
  assert.strictEqual(A.greetingKey(16), 'greetDay')
  assert.strictEqual(A.greetingKey(17), 'greetEvening')
  assert.strictEqual(A.greetingKey(21), 'greetEvening')
  assert.strictEqual(A.greetingKey(22), 'greetNight')
  assert.strictEqual(A.greetingKey(3), 'greetNight')
  assert.strictEqual(A.greetingKey(24), 'greetNight')
})

test('prepSteps: admin before hardware before restore point, the rest after it', () => {
  const steps = A.prepSteps(true), by = Object.fromEntries(steps.map(s => [s.id, s]))
  assert.deepStrictEqual(by.admin.after, [])
  assert.deepStrictEqual(by.hardware.after, ['admin'])
  assert.deepStrictEqual(by.restore.after, ['hardware'])
  for (const id of ['preflight', 'health', 'games', 'profile', 'startup', 'score']) assert.deepStrictEqual(by[id].after, ['restore'])
  assert.ok(steps.every(s => !s.skip))
  // every dependency exists and is listed earlier (no cycles)
  steps.forEach((s, i) => s.after.forEach(d => assert.ok(steps.findIndex(x => x.id === d) < i)))
})

test('prepSteps without administrator rights skips only the admin-only steps, with a reason', () => {
  const steps = A.prepSteps(false)
  assert.deepStrictEqual(steps.filter(s => s.skip).map(s => s.id).sort(), ['health', 'restore'])
  assert.ok(steps.filter(s => s.skip).every(s => s.reason === 'reasonNoAdmin'))
  assert.ok(steps.filter(s => !s.skip).every(s => s.reason === null))
})

test('resumeScene resumes an unfinished run and restarts everything else', () => {
  assert.strictEqual(A.resumeScene(undefined), 1)
  assert.strictEqual(A.resumeScene({ scene: 3 }), 3)
  assert.strictEqual(A.resumeScene({ scene: 3, completedAt: 1 }), 1)
  assert.strictEqual(A.resumeScene({ scene: 3, deferred: true }), 1)
  assert.strictEqual(A.resumeScene({ scene: 9 }), 1)
  assert.strictEqual(A.resumeScene({ scene: 0 }), 1)
  assert.strictEqual(A.resumeScene({ scene: 'x' }), 1)
})

test('useCaseMap maps the answers to the existing Auto-Optimize presets', () => {
  assert.deepStrictEqual(A.useCaseMap('fps'), { aom_use_case: 'fps', runMode: 'gaming' })
  assert.deepStrictEqual(A.useCaseMap('open'), { aom_use_case: 'open', runMode: 'gaming' })
  assert.deepStrictEqual(A.useCaseMap('stream'), { aom_use_case: 'stream', runMode: 'smart' })
  assert.deepStrictEqual(A.useCaseMap('work'), { aom_use_case: 'mix', runMode: 'smart' })
  assert.deepStrictEqual(A.useCaseMap('mix'), { aom_use_case: 'mix', runMode: 'smart' })
  assert.deepStrictEqual(A.useCaseMap(null), { aom_use_case: 'mix', runMode: 'smart' })
})

test('comfortSettings: expert turns advanced mode on, the others do not', () => {
  assert.deepStrictEqual(A.comfortSettings('safe'), { maxTier: 1, advancedMode: false })
  assert.deepStrictEqual(A.comfortSettings('balanced'), { maxTier: 2, advancedMode: false })
  assert.deepStrictEqual(A.comfortSettings('expert'), { maxTier: 3, advancedMode: true })
  assert.strictEqual(A.comfortSettings('nope').maxTier, 2)
})

test('togglePriority keeps at most two, dropping the oldest', () => {
  assert.deepStrictEqual(A.togglePriority([], 'latency'), ['latency'])
  assert.deepStrictEqual(A.togglePriority(['latency'], 'quiet'), ['latency', 'quiet'])
  assert.deepStrictEqual(A.togglePriority(['latency', 'quiet'], 'privacy'), ['quiet', 'privacy'])
  assert.deepStrictEqual(A.togglePriority(['latency', 'quiet'], 'latency'), ['quiet'])
})
