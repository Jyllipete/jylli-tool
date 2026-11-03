const test = require('node:test')
const assert = require('node:assert')
const T = require('../js/tour')

test('isStale / shouldShow follow the definition version', () => {
  assert.strictEqual(T.isStale(undefined, 1), true)
  assert.strictEqual(T.isStale(1, 1), false)
  assert.strictEqual(T.isStale(1, 2), true)
  assert.strictEqual(T.shouldShow({ enabled: true, seen: {}, key: 'home', v: 1 }), true)
  assert.strictEqual(T.shouldShow({ enabled: true, seen: { home: 1 }, key: 'home', v: 1 }), false)
  assert.strictEqual(T.shouldShow({ enabled: true, seen: { home: 1 }, key: 'home', v: 2 }), true)
  assert.strictEqual(T.shouldShow({ enabled: false, seen: {}, key: 'home', v: 1 }), false)
  assert.strictEqual(T.shouldShow({ enabled: undefined, seen: undefined, key: 'home', v: 1 }), false)
})

test('nextIndex skips stops whose target is missing', () => {
  const stops = [{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }]
  const has = new Set([0, 2])
  const ex = s => has.has(s.id)
  assert.strictEqual(T.nextIndex(stops, -1, 1, ex), 0)
  assert.strictEqual(T.nextIndex(stops, 0, 1, ex), 2)
  assert.strictEqual(T.nextIndex(stops, 2, 1, ex), -1)
  assert.strictEqual(T.nextIndex(stops, 2, -1, ex), 0)
  assert.strictEqual(T.nextIndex(stops, 0, -1, ex), -1)
})

test('holeRect pads and clamps to the viewport', () => {
  assert.deepStrictEqual(T.holeRect({ left: 100, top: 100, width: 50, height: 40 }, 800, 600), { x: 92, y: 92, w: 66, h: 56 })
  assert.deepStrictEqual(T.holeRect({ left: 2, top: 2, width: 50, height: 40 }, 800, 600), { x: 0, y: 0, w: 60, h: 50 })
  const h = T.holeRect({ left: 780, top: 580, width: 100, height: 100 }, 800, 600)
  assert.ok(h.x + h.w <= 800 && h.y + h.h <= 600)
})

test('placeCard prefers below, flips above, then beside, and stays inside the viewport', () => {
  const card = { w: 300, h: 150 }
  const below = T.placeCard({ x: 100, y: 50, w: 100, h: 40 }, card, 1000, 700)
  assert.strictEqual(below.side, 'bottom'); assert.strictEqual(below.y, 50 + 40 + 14)
  const above = T.placeCard({ x: 100, y: 600, w: 100, h: 40 }, card, 1000, 700)
  assert.strictEqual(above.side, 'top'); assert.strictEqual(above.y, 600 - 14 - 150)
  const beside = T.placeCard({ x: 100, y: 20, w: 100, h: 660 }, card, 1000, 700)
  assert.strictEqual(beside.side, 'right'); assert.strictEqual(beside.x, 214)
  const left = T.placeCard({ x: 800, y: 20, w: 190, h: 660 }, card, 1000, 700)
  assert.strictEqual(left.side, 'left')
  const over = T.placeCard({ x: 5, y: 5, w: 990, h: 690 }, card, 1000, 700)
  assert.strictEqual(over.side, 'over')
  for (const p of [below, above, beside, left, over]) {
    assert.ok(p.x >= 12 && p.x + card.w <= 1000 - 12, 'x inside'); assert.ok(p.y >= 12 && p.y + card.h <= 700, 'y inside')
  }
  const edge = T.placeCard({ x: 0, y: 50, w: 20, h: 20 }, card, 1000, 700)
  assert.strictEqual(edge.x, 12)
})
