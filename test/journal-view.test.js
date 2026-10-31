const test = require('node:test')
const assert = require('node:assert')
const V = require('../js/journal-view')

const e = (id, sessionId, batchId, ts, extra = {}) => ({ id, sessionId, batchId, ts, via: 'manual', action: 'apply', changes: [], fidelity: 'exact', ...extra })

test('grouping: session > batch > entries, singles get their own batch', () => {
  const g = V.group([e('1', 's1', 'b1', 30), e('2', 's1', 'b1', 20), e('3', 's1', null, 10), e('4', 's2', 'b2', 5)])
  assert.strictEqual(g.length, 2)
  assert.deepStrictEqual(g[0].batches.map(b => b.entries.length), [2, 1])
  assert.strictEqual(g[0].batches[1].batchId, null)
  assert.strictEqual(g[1].sessionId, 's2')
})

test('describe: registry, service and unresolved changes', () => {
  assert.deepStrictEqual(V.describe({ kind: 'reg', path: 'Microsoft.PowerShell.Core\\Registry::HKEY_CURRENT_USER\\X', name: 'A', before: { exists: false }, after: { exists: true, value: 1 } }),
    { label: 'HKEY_CURRENT_USER\\X\\A', before: null, after: '1' })
  assert.strictEqual(V.describe({ kind: 'service', name: 'S', before: { exists: true, value: 'auto' }, after: { exists: true, value: 'disabled' } }).after, 'disabled')
  assert.strictEqual(V.describe({ kind: 'unresolved', cmd: 'netsh x' }).unresolved, true)
  assert.strictEqual(V.describe({ kind: 'gpu-power-limit', before: { watts: 250 }, after: { watts: 240 } }).after, '240 W')
})

test('fidelity summary counts what can be undone exactly', () => {
  const s = V.fidelitySummary({ fidelity: 'partial', changes: [{ kind: 'reg' }, { kind: 'unresolved' }, { kind: 'unresolved' }] })
  assert.deepStrictEqual([s.exact, s.unresolved], [1, 2])
})
