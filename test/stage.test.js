const test = require('node:test')
const assert = require('node:assert')
const S = require('../js/stage')

test('staging toggles: same action twice removes; already-in-effect is a no-op', () => {
  let m = new Map()
  let r = S.nextStaged(m, 'a', 'apply', 'default'); assert.strictEqual(r.change, 'added'); m = r.staged
  r = S.nextStaged(m, 'a', 'apply', 'default'); assert.strictEqual(r.change, 'removed'); assert.strictEqual(r.staged.size, 0)
  r = S.nextStaged(new Map(), 'b', 'apply', 'applied'); assert.strictEqual(r.change, 'noop'); assert.strictEqual(r.staged.size, 0)
  r = S.nextStaged(new Map(), 'c', 'restore', 'default'); assert.strictEqual(r.change, 'noop')
  r = S.nextStaged(new Map([['d', 'apply']]), 'd', 'restore', 'applied'); assert.strictEqual(r.change, 'added'); assert.strictEqual(r.staged.get('d'), 'restore')
})

test('review rows come from main\'s tier, riskiest first, with from -> to states', () => {
  const staged = new Map([['low', 'apply'], ['risky', 'apply'], ['undo', 'restore']])
  const meta = { low: { name: 'Low', safetyTier: 1 }, risky: { name: 'Risky', safetyTier: 3 }, undo: { name: 'Undo me', safetyTier: 2 } }
  const rows = S.summarize(staged, meta, id => (id === 'undo' ? 'applied' : 'default'))
  assert.deepStrictEqual(rows.map(r => r.id), ['risky', 'undo', 'low'])
  assert.deepStrictEqual([rows[1].from, rows[1].to], ['applied', 'default'])
  assert.deepStrictEqual([rows[0].from, rows[0].to], ['default', 'applied'])
})

test('actions and destructive tweaks are never staged', () => {
  for (const id of ['fix-wifi', 'clean-temp', 'reboot-now', 'remove-uwp', 'debloat-x']) assert.ok(S.EXCLUDE.test(id), id)
  assert.ok(!S.EXCLUDE.test('game-dvr'))
})
