'use strict'
const test = require('node:test')
const assert = require('node:assert')
const { replaySummary } = require('../js/pages/gaming-replay.js')

test('totals, distinct games, best average', () => {
  const s = replaySummary([
    { durationSec: 3600, game: { name: 'A' }, summary: { avgFps: 90 } },
    { durationSec: 1800, game: { name: 'B' }, summary: { avgFps: 120 } },
    { durationSec: 600, game: { name: 'A' }, summary: { avgFps: 100 } },
  ])
  assert.deepStrictEqual(s, { n: 3, minutes: 100, games: 2, bestAvg: 120 })
})
test('empty list and sessions without a game or summary', () => {
  assert.deepStrictEqual(replaySummary([]), { n: 0, minutes: 0, games: 0, bestAvg: null })
  const s = replaySummary([{ durationSec: 60 }])
  assert.strictEqual(s.games, 0)
  assert.strictEqual(s.bestAvg, null)
})
