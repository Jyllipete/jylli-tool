const test = require('node:test')
const assert = require('node:assert')
const { blend } = require('../js/score')

test('unknown components are excluded and weights renormalised', () => {
  assert.deepStrictEqual(blend([{ key: 'a', value: 1, weight: 1 }, { key: 'b', value: 0, weight: 1 }]), { score: 50, used: ['a', 'b'], missing: [] })
  const r = blend([{ key: 'a', value: 1, weight: 3 }, { key: 'b', value: null, weight: 5 }])
  assert.strictEqual(r.score, 100); assert.deepStrictEqual(r.missing, ['b'])
})
test('nothing measured gives null, not zero', () => {
  assert.strictEqual(blend([{ key: 'a', value: null, weight: 1 }, { key: 'b', value: NaN, weight: 1 }]).score, null)
})
test('values are clamped', () => {
  assert.strictEqual(blend([{ key: 'a', value: 7, weight: 1 }]).score, 100)
})
