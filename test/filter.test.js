'use strict'
const test = require('node:test')
const assert = require('node:assert')
const F = require('../js/ui/filter.js')

const m = (o = {}) => ({ search: 'disable telemetry', applied: false, recommended: false, reboot: false, risk: 0, ...o })

test('empty query and all chip match everything', () => {
  assert.ok(F.matches(m(), '', 'all'))
  assert.ok(F.matches(m(), '   ', undefined))
})
test('query is case-insensitive substring on search text', () => {
  assert.ok(F.matches(m(), 'TELEM', 'all'))
  assert.ok(!F.matches(m(), 'bluetooth', 'all'))
})
test('chips', () => {
  assert.ok(F.matches(m({ recommended: true }), '', 'recommended'))
  assert.ok(!F.matches(m({ recommended: true, applied: true }), '', 'recommended'), 'applied items are not "recommended" any more')
  assert.ok(F.matches(m({ applied: true }), '', 'applied'))
  assert.ok(F.matches(m({ reboot: true }), '', 'reboot'))
  assert.ok(F.matches(m({ risk: 2 }), '', 'risky'))
  assert.ok(!F.matches(m({ risk: 1 }), '', 'risky'))
})
test('query and chip combine', () => {
  assert.ok(!F.matches(m({ applied: true }), 'bluetooth', 'applied'))
  assert.ok(F.matches(m({ applied: true }), 'telemetry', 'applied'))
})
test('counts', () => {
  const c = F.counts([m(), m({ applied: true }), m({ recommended: true, reboot: true })])
  assert.deepStrictEqual(c, { all: 3, recommended: 1, applied: 1, reboot: 1, risky: 0 })
})
