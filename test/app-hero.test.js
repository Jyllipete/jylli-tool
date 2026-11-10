const test = require('node:test')
const assert = require('node:assert')
const H = require('../js/pages/app-hero')

const defs = [
  { id: 'a', cat: 'Browsers' }, { id: 'b', cat: 'Browsers' }, { id: 'c', cat: 'Media' }, { id: 'd', cat: 'System' },
]

test('arcs: none for zero, one full ring for one app, n arcs with gaps otherwise', () => {
  assert.deepStrictEqual(H.arcs(0), [])
  assert.strictEqual(H.arcs(1).length, 1)
  const a = H.arcs(12)
  assert.strictEqual(a.length, 12)
  for (let i = 0; i < 12; i++) {
    assert.ok(a[i].a1 > a[i].a0)
    if (i < 11) assert.ok(a[i + 1].a0 > a[i].a1, 'gap between arcs')
  }
})

test('summary only counts installed apps and rounds the percentage', () => {
  const s = H.summary(defs, ['a', 'b', 'c'], { a: 'applied', d: 'applied' }, [], [])
  assert.strictEqual(s.total, 3)
  assert.strictEqual(s.applied, 1)
  assert.strictEqual(s.pct, 33)
  assert.strictEqual(s.left, 2)
  assert.deepStrictEqual(s.remainingIds, ['b', 'c'])
  assert.deepStrictEqual(s.cats.map(c => [c.cat, c.applied, c.total]), [['Browsers', 1, 2], ['Media', 0, 1]])
})

test('summary: drifted counts only applied apps, running only unapplied ones', () => {
  const s = H.summary(defs, ['a', 'b', 'c'], { a: 'applied' }, new Set(['a', 'b']), new Set(['a', 'c']))
  const st = Object.fromEntries(s.apps.map(x => [x.id, x.state]))
  assert.deepStrictEqual(st, { a: 'drifted', b: 'live', c: 'idle' })
  assert.strictEqual(s.drifted, 1)
  assert.strictEqual(s.running, 1)
})

test('summary: nothing installed gives zeros, no NaN', () => {
  const s = H.summary(defs, [], {}, [], [])
  assert.deepStrictEqual([s.total, s.pct, s.left, s.running, s.drifted], [0, 0, 0, 0, 0])
  assert.deepStrictEqual(s.cats, [])
})
