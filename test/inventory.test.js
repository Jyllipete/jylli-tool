const test = require('node:test')
const assert = require('node:assert')
const { buildRigSpec } = require('../lib/inventory')
const raw = require('./fixtures/sensors/inventory-raw-desktop.json')

test('real desktop capture parses into a RigSpec', () => {
  const r = buildRigSpec(raw)
  assert.strictEqual(r.formFactor, 'tower')
  assert.strictEqual(r.gpus.length, 1); assert.strictEqual(r.gpus[0].vendor, 'nvidia'); assert.strictEqual(r.gpus[0].integrated, false)
  assert.strictEqual(r.ram.slotsTotal, 4); assert.strictEqual(r.ram.sticks.length, 2)
  assert.deepStrictEqual(r.ram.sticks.map(s => s.channel), ['A', 'B'])
  assert.ok(r.ram.sticks[0].ratedMT < r.ram.sticks[0].speedMT)       // rated vs actual are both kept
  assert.strictEqual(r.drives[0].bus, 'NVMe')
  assert.strictEqual(r.cooler.source, 'unknown')                     // never guessed
  assert.ok(r.board.model)
})

test('laptop is detected from chassis type or battery; unknown stays unknown', () => {
  assert.strictEqual(buildRigSpec({ chassis: [10] }).formFactor, 'laptop')
  assert.strictEqual(buildRigSpec({ chassis: [2], hasBattery: true }).formFactor, 'laptop')
  assert.strictEqual(buildRigSpec({ chassis: [2] }).formFactor, 'unknown')
  assert.strictEqual(buildRigSpec({}).formFactor, 'unknown')
})

test('placeholder board strings and virtual adapters are dropped', () => {
  const r = buildRigSpec({ board: { vendor: 'To be filled by O.E.M.', model: 'Default string' }, gpus: [{ name: 'Microsoft Basic Display Adapter' }, { name: 'Intel(R) UHD Graphics', vendor: 'Intel Corporation' }] })
  assert.strictEqual(r.board.vendor, null); assert.strictEqual(r.board.model, null)
  assert.strictEqual(r.gpus.length, 1); assert.strictEqual(r.gpus[0].integrated, true)
})

test('declared values fill gaps and are marked as user-sourced', () => {
  const r = buildRigSpec({ chassis: [2] }, { cooler: 'aio', formFactor: 'tower' })
  assert.deepStrictEqual([r.cooler.type, r.cooler.source, r.formFactor, r.formFactorSource], ['aio', 'user', 'tower', 'user'])
})
