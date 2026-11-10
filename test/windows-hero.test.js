'use strict'
const test = require('node:test')
const assert = require('node:assert')
const H = require('../js/pages/windows-hero.js')

const sections = [
  { id: 'a', title: 'A', cards: [{ id: 'game-dvr' }, { id: 'hpet' }, { id: 'mmcss' }] },
  { id: 'b', title: 'B', cards: [{ id: 'win-tips' }, { id: 'retired-x' }] },
  { id: 'empty', title: 'E', cards: [] },
]
const states = { 'game-dvr': 'applied', 'win-tips': 'pre-applied' }
const stateOf = id => states[id] || 'default'

test('counts applied, ignores retired, drops empty sections', () => {
  const s = H.summarize({ sections, stateOf, visible: id => id !== 'retired-x' })
  assert.strictEqual(s.total, 4)
  assert.strictEqual(s.applied, 1)
  assert.strictEqual(s.pct, 25)
  assert.deepStrictEqual(s.sections.map(r => r.id), ['a', 'b'])
})
test('recommended = safe defaults not yet applied; pre-applied and reboot-needing ones are skipped', () => {
  const s = H.summarize({ sections, stateOf, visible: id => id !== 'retired-x', reboot: new Set(['hpet']) })
  assert.deepStrictEqual(s.recommendedIds, ['mmcss'])   // game-dvr applied, win-tips pre-applied, hpet is not in safe set anyway
})
test('applicability can recommend and can veto', () => {
  const applicOf = id => id === 'hpet' ? { state: 'recommended' } : id === 'mmcss' ? { state: 'caution' } : undefined
  const s = H.summarize({ sections, stateOf, applicOf })
  assert.deepStrictEqual(s.recommendedIds.sort(), ['hpet'])
})
test('a recommended tweak that needs a restart is never in the one-click set', () => {
  const s = H.summarize({ sections, stateOf, applicOf: id => id === 'hpet' ? { state: 'recommended' } : undefined, reboot: new Set(['hpet']) })
  assert.ok(!s.recommendedIds.includes('hpet'))
})
test('needs-restart counts applied tweaks only', () => {
  const s = H.summarize({ sections, stateOf, reboot: new Set(['game-dvr', 'hpet']) })
  assert.strictEqual(s.needsRestart, 1)
})
test('no tweaks gives null pct (shown as a dash)', () => {
  assert.strictEqual(H.summarize({ sections: [], stateOf }).pct, null)
})
