const test = require('node:test')
const assert = require('node:assert')
const { nextRegion } = require('../js/regions')

test('F6 cycles forward and backward, skipping hidden regions', () => {
  const usable = [true, true, false, true]
  assert.strictEqual(nextRegion(usable, -1, 1), 0)
  assert.strictEqual(nextRegion(usable, 1, 1), 3)      // the dock is hidden
  assert.strictEqual(nextRegion(usable, 3, 1), 0)      // wraps
  assert.strictEqual(nextRegion(usable, 0, -1), 3)
  assert.strictEqual(nextRegion(usable, -1, -1), 3)
  assert.strictEqual(nextRegion([false, false], 0, 1), -1)
})
