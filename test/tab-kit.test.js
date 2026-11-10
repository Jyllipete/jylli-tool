'use strict'
const test = require('node:test')
const assert = require('node:assert')
const K = require('../js/ui/tab-kit.js')

test('clampPct', () => {
  assert.strictEqual(K.clampPct(null), null)
  assert.strictEqual(K.clampPct('x'), null)
  assert.strictEqual(K.clampPct(140), 100)
  assert.strictEqual(K.clampPct(-5), 0)
  assert.strictEqual(K.clampPct(49.6), 50)
})
test('tone boundaries match the Bloat hero tiers', () => {
  assert.strictEqual(K.tone(80), 'ok')
  assert.strictEqual(K.tone(79), 'warn')
  assert.strictEqual(K.tone(50), 'warn')
  assert.strictEqual(K.tone(49), 'danger')
  assert.strictEqual(K.tone(null), 'idle')
})
