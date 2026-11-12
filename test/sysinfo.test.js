'use strict'
const test = require('node:test')
const assert = require('node:assert')
const os = require('os'), fs = require('fs'), path = require('path')
const F = require('../lib/sysinfo/fingerprint')
const { merge } = require('../lib/sysinfo/merge')
const store = require('../lib/sysinfo/store')

const A = { cpu: 'Intel Core i7-13700K', cpuThreads: 24, ramGB: 32, ramSpeed: 5600, gpu: 'NVIDIA GeForce RTX 4070', vramMB: 12288, gpuDriver: '555.1', diskModel: 'Samsung 980', diskSizeGB: 1000, displayRes: '2560x1440', displayRefresh: 165, isAdmin: true, onBattery: false }

test('signature is stable and ignores volatile + driver changes', () => {
  const s = F.signature(A)
  assert.match(s, /^JT-[0-9A-F]{4}-[0-9A-F]{4}$/)
  assert.strictEqual(F.signature({ ...A, isAdmin: false, onBattery: true, gpuDriver: '999' }), s)
  assert.notStrictEqual(F.signature({ ...A, ramGB: 64 }), s)
  assert.strictEqual(F.signature({}), null)
})
test('diff reports real changes only', () => {
  assert.deepStrictEqual(F.diff(A, { ...A, isAdmin: false }), [])
  const d = F.diff(A, { ...A, ramGB: 64, gpuDriver: '556.0' })
  assert.deepStrictEqual(d.map(x => x.key).sort(), ['gpuDriver', 'ramGB'])
  assert.strictEqual(d.find(x => x.key === 'ramGB').after, 64)
})
test('diff never treats a failed read as a change', () => {
  assert.deepStrictEqual(F.diff(A, { ...A, gpu: '', vramMB: 0 }), [])
})
test('merge never downgrades known values but takes live flags', () => {
  const m = merge(A, { gpu: 'Detecting…', vramMB: 0, cpu: 'Intel Core i7-13700K', isAdmin: false })
  assert.strictEqual(m.gpu, A.gpu); assert.strictEqual(m.vramMB, 12288); assert.strictEqual(m.isAdmin, false)
  assert.strictEqual(merge(A, { ramGB: 64 }).ramGB, 64)
})
test('store round-trips, drops volatile fields, survives corruption', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'jt-si-')), 'jt_sysinfo.json')
  assert.strictEqual(store.read(f), null)
  assert.ok(store.write(f, A))
  const r = store.read(f)
  assert.strictEqual(r.info.cpu, A.cpu)
  assert.strictEqual(r.info.isAdmin, undefined)
  assert.strictEqual(r.signature, F.signature(A))
  fs.writeFileSync(f, '{nope')
  assert.strictEqual(store.read(f), null)
  fs.writeFileSync(f, JSON.stringify({ v: 99, info: A }))
  assert.strictEqual(store.read(f), null)
})
