const test = require('node:test')
const assert = require('node:assert')
const S = require('../js/sound')

const ok = { enabled: true, focused: true, gameRunning: false, now: 1000, last: null }

test('sounds are off by default and silent when unfocused or while gaming', () => {
  assert.strictEqual(S.canPlay({ ...ok, enabled: false }), false)
  assert.strictEqual(S.canPlay({ ...ok, focused: false }), false)
  assert.strictEqual(S.canPlay({ ...ok, gameRunning: true }), false)
  assert.strictEqual(S.canPlay(ok), true)
})

test('at most one sound per 120 ms', () => {
  assert.strictEqual(S.canPlay({ ...ok, last: 950 }), false)
  assert.strictEqual(S.canPlay({ ...ok, last: 880 }), true)
})

test('palette matches the spec and stays quiet', () => {
  assert.deepStrictEqual(S.spec('tick').segs[0], { type: 'sine', f0: 1200, f1: 1200, ms: 25 })
  assert.deepStrictEqual([S.spec('apply').segs[0].f0, S.spec('apply').segs[0].f1], [660, 990])
  assert.deepStrictEqual([S.spec('undo').segs[0].f0, S.spec('undo').segs[0].f1], [990, 660])
  assert.strictEqual(S.spec('warning').segs[0].type, 'square'); assert.ok(S.spec('warning').segs[0].lp)
  assert.strictEqual(S.spec('click').ms, 15)
  assert.ok(Math.abs(20 * Math.log10(S.PEAK) + 24) < 0.1)     // about -24 dBFS
  assert.strictEqual(S.spec('nope'), null)
})
