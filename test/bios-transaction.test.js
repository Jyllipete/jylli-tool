'use strict'
// Commit transaction against a SIMULATED engine: preflight refusals, snapshot, read-back verification, silent write drop, auto-revert.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const tx = require('../lib/bios/transaction')
const snaps = require('../lib/bios/snapshots')
const model = require('../lib/bios/model')

const rows = () => [
  { cls: 'HP_BIOSEnumeration', Name: 'Fast Boot', CurrentValue: 'Disable', PossibleValues: ['Enable', 'Disable'] },
  { cls: 'HP_BIOSEnumeration', Name: 'Turbo Boost', CurrentValue: 'Enable', PossibleValues: ['Enable', 'Disable'] },
  { cls: 'HP_BIOSEnumeration', Name: 'Power On Password', CurrentValue: 'Disable', PossibleValues: ['Enable', 'Disable'], IsReadOnly: true },
  { cls: 'HP_BIOSInteger', Name: 'CPU Core Voltage Offset', CurrentValue: '0', LowerBound: -100, UpperBound: 100 },
]
// simulated firmware: `dropFor` names writes that are silently ignored, `failOn` makes a write error after applying the first item
function sim({ dropFor = [], failAfterFirst = false } = {}) {
  const state = new Map(rows().map(r => [r.Name, r.CurrentValue]))
  const writes = []
  return {
    id: 'hp-wmi', state, writes,
    async read() { return model.fromHp(rows().map(r => ({ ...r, CurrentValue: state.get(r.Name) }))) },
    async write(ch) {
      writes.push(ch)
      let n = 0
      for (const c of ch) { if (!dropFor.includes(c.id)) state.set(c.id, c.value); n++; if (failAfterFirst && n === 1 && ch.length > 1) return { ok: false, error: 'write_failed' } }
      return { ok: true }
    },
  }
}
const mk = (o = {}) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jbios-tx-'))
  return { store: snaps.create(dir), allowed: () => true, typed: false, onBattery: false, ...o, dir }
}

test('refuses locked engines, read-only, invalid, unchanged, unknown and duplicate changes', async () => {
  const e = sim()
  assert.equal((await tx.run(e, [{ id: 'Fast Boot', value: 'Enable' }], mk({ allowed: () => false }))).error, 'engine_locked')
  assert.equal((await tx.run(e, [{ id: 'Power On Password', value: 'Enable' }], mk())).error, 'not_allowed')
  assert.equal((await tx.run(e, [{ id: 'Fast Boot', value: 'Maybe' }], mk())).error, 'invalid_value')
  assert.equal((await tx.run(e, [{ id: 'Fast Boot', value: 'Disable' }], mk())).error, 'no_change')
  assert.equal((await tx.run(e, [{ id: 'Nope', value: 'x' }], mk())).error, 'unknown_setting')
  assert.equal((await tx.run(e, [{ id: 'Fast Boot', value: 'Enable' }, { id: 'Fast Boot', value: 'Enable' }], mk())).error, 'duplicate')
  assert.equal((await tx.run(e, [], mk())).error, 'no_changes')
  assert.equal(e.writes.length, 0)   // nothing was written by any refusal
})

test('critical changes need typed confirmation; range is enforced; battery blocks', async () => {
  const e = sim()
  assert.equal((await tx.run(e, [{ id: 'CPU Core Voltage Offset', value: '5' }], mk())).error, 'typed_required')
  assert.equal((await tx.run(e, [{ id: 'CPU Core Voltage Offset', value: '500' }], mk({ typed: true }))).error, 'invalid_value')
  assert.equal((await tx.run(e, [{ id: 'Fast Boot', value: 'Enable' }], mk({ onBattery: true }))).error, 'on_battery')
  assert.equal(e.writes.length, 0)
})

test('successful commit takes a snapshot first and verifies by reading back', async () => {
  const e = sim(), ctx = mk()
  const r = await tx.run(e, [{ id: 'Fast Boot', value: 'Enable' }, { id: 'Turbo Boost', value: 'Disable' }], ctx)
  assert.equal(r.ok, true); assert.equal(r.applied, 2)
  assert.equal(e.state.get('Fast Boot'), 'Enable')
  const snap = ctx.store.get(r.snapshotId)
  assert.equal(snap.values['Fast Boot'], 'Disable')            // the state BEFORE the write
  assert.deepEqual(snap.changes.map(c => c.to), ['Enable', 'Disable'])
})

test('a write the firmware silently drops is a failure, not a success', async () => {
  const e = sim({ dropFor: ['Fast Boot'] })
  const r = await tx.run(e, [{ id: 'Fast Boot', value: 'Enable' }], mk())
  assert.equal(r.ok, false); assert.equal(r.error, 'verify_failed'); assert.deepEqual(r.mismatches, ['Fast Boot'])
})

test('a partial write is reverted', async () => {
  const e = sim({ failAfterFirst: true })
  const r = await tx.run(e, [{ id: 'Fast Boot', value: 'Enable' }, { id: 'Turbo Boost', value: 'Disable' }], mk())
  assert.equal(r.ok, false)
  assert.equal(r.reverted, 1)
  assert.equal(e.state.get('Fast Boot'), 'Disable')   // put back
  assert.equal(e.state.get('Turbo Boost'), 'Enable')
})

test('restore: snapshot back to the earlier values, skipping read-only settings', async () => {
  const e = sim(), ctx = mk()
  const r = await tx.run(e, [{ id: 'Fast Boot', value: 'Enable' }], ctx)
  const changes = snaps.restoreChanges(ctx.store.get(r.snapshotId), await e.read())
  assert.deepEqual(changes, [{ id: 'Fast Boot', value: 'Disable' }])
  const back = await tx.run(e, changes, ctx)
  assert.equal(back.ok, true); assert.equal(e.state.get('Fast Boot'), 'Disable')
  assert.equal(ctx.store.list().length, 2)
  assert.equal(ctx.store.get('../x'), null)
})
