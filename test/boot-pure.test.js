'use strict'
const test = require('node:test')
const assert = require('node:assert')
const P = require('../js/boot/pure.js')
const t = (k, v) => k + (v ? JSON.stringify(v) : '')
const I = { cpu: 'Intel Core i7-13700K', cpuThreads: 24, cpuSpeed: 5400, ramGB: 32, ramSpec: 'DDR5-5600', gpu: 'RTX 4070', gpuDriver: '555.1', vramMB: 12288, diskModel: 'Samsung 980', diskType: 'NVMe SSD', diskUsedGB: 200, diskTotalGB: 1000, displayRes: '2560x1440', displayRefresh: 165, board: 'ASUS PRIME Z790', biosVersion: '1602', osCaption: 'Windows 11 Home', osBuild: '26200', isAdmin: true }

test('progress is monotonic, weighted, and reaches 1', () => {
  assert.strictEqual(P.progress([], null), 0)
  const ids = P.STEPS.map(s => s.id)
  let last = 0
  for (let n = 1; n <= ids.length; n++) { const p = P.progress(ids.slice(0, n)); assert.ok(p > last); last = p }
  assert.strictEqual(last, 1)
  assert.ok(P.progress([], 'storage') > P.progress([], 'vram'))
})
test('core steps gate Continue now', () => {
  assert.ok(!P.coreDone(['cpu', 'ram']))
  assert.ok(P.coreDone(['cpu', 'ram', 'gpu']))
})
test('rowText fills every row from a full scan and returns null for missing reads', () => {
  for (const s of P.STEPS) assert.ok(P.rowText(s.id, I, t), s.id)
  assert.strictEqual(P.rowText('cpu', I, t).main, 'Intel Core i7-13700K')
  assert.strictEqual(P.rowText('vram', I, t).main, '12 GB VRAM')
  assert.strictEqual(P.rowText('display', I, t).main, '2560 × 1440')
  assert.strictEqual(P.rowText('gpu', { gpu: 'Detecting…' }, t), null)
  assert.strictEqual(P.rowText('vram', { vramMB: 0 }, t), null)
  assert.strictEqual(P.rowText('storage', { diskType: 'SSD/HDD' }, t), null)
  assert.strictEqual(P.rowText('board', {}, t), null)
})
test('rigClass is honest about thin data', () => {
  assert.deepStrictEqual(P.rigClass(I), { tier: 'high', form: 'desktop' })
  assert.deepStrictEqual(P.rigClass({ cpu: 'x', cpuThreads: 8, ramGB: 16, isLaptop: true }), { tier: 'mid', form: 'laptop' })
  assert.strictEqual(P.rigClass({}), null)
})
test('promise line only states facts it holds', () => {
  assert.deepStrictEqual(P.promiseParts({}), [])
  const now = 10 * 86400000
  const p = P.promiseParts({ changes: [{ key: 'ramGB', label: 'RAM', before: 16, after: 32 }], applied: 4, lastRunAt: now - 3 * 86400000, now })
  assert.deepStrictEqual(p.map(x => x.key), ['pChanged', 'pApplied', 'pOptDays'])
  assert.ok(p[0].vars.list.includes('RAM 16 → 32 GB'))
  assert.strictEqual(P.promiseParts({ lastRunAt: now, now })[0].key, 'pOptToday')
  assert.deepStrictEqual(P.promiseParts({ lastRunAt: now + 5, now }), [])
})
test('glyph is deterministic and differs per signature', () => {
  const a = P.glyph('JT-7F3A-92C1'), b = P.glyph('JT-7F3A-92C1'), c = P.glyph('JT-0000-FFFF')
  assert.deepStrictEqual(a, b)
  assert.notStrictEqual(a.ring, c.ring)
  assert.ok(a.ring.startsWith('M') && a.ring.endsWith('Z'))
  assert.ok(P.glyph(null).ring)
})
