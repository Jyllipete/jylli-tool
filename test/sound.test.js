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

test('arrival chimes are short, quiet sines in a gentle range', () => {
  assert.deepStrictEqual(S.spec('welcome').segs.map(s => s.f0), [659, 831, 988])
  assert.deepStrictEqual(S.spec('welcome').segs.map(s => s.at), [0, 90, 180])
  assert.strictEqual(S.spec('step').segs[0].f0, 880); assert.strictEqual(S.spec('step').segs[0].ms, 60)
  assert.deepStrictEqual([S.spec('ready').segs[0].f0, S.spec('ready').segs[0].f1], [440, 659])
  for (const name of ['welcome', 'step', 'ready']) {
    const segs = S.spec(name).segs
    assert.ok(Math.max(...segs.map(s => (s.at || 0) + s.ms)) < 700, name + ' under 700 ms')
    for (const s of segs) {
      assert.ok((s.at || 0) >= 0, name + ' at >= 0')
      assert.ok((s.gain ?? 1) <= 1, name + ' gain <= 1')
      assert.notStrictEqual(s.type, 'square')
      for (const f of [s.f0, s.f1]) assert.ok(f >= 200 && f <= 2000, name + ' frequency in range')
    }
  }
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
