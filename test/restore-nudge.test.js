const test = require('node:test')
const assert = require('node:assert')
const { restoreStatus, parseWmiDate, STALE_MS } = require('../js/restore-nudge')

const now = Date.UTC(2026, 10, 12, 12, 0, 0)

test('never when nothing is known', () => {
  assert.strictEqual(restoreStatus({ now }).level, 'never')
  assert.strictEqual(restoreStatus({ newestAt: 0, lastCreatedAt: null, now }).level, 'never')
})
test('fresh inside 7 days, stale after', () => {
  assert.strictEqual(restoreStatus({ newestAt: now - 2 * 86400000, now }).level, 'fresh')
  assert.strictEqual(restoreStatus({ newestAt: now - STALE_MS, now }).level, 'fresh')
  assert.strictEqual(restoreStatus({ newestAt: now - STALE_MS - 1, now }).level, 'stale')
})
test('uses the newer of the two sources', () => {
  const r = restoreStatus({ newestAt: now - 30 * 86400000, lastCreatedAt: now - 3600000, now })
  assert.strictEqual(r.level, 'fresh')
  assert.strictEqual(r.ageMs, 3600000)
})
test('parses WMI dates with offset', () => {
  assert.strictEqual(parseWmiDate('20250523143000.000000+120'), Date.UTC(2025, 4, 23, 12, 30, 0))
  assert.strictEqual(parseWmiDate('garbage'), null)
})
