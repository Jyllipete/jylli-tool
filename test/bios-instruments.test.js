'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const I = require('../lib/bios/instruments')

test('readings: stale and missing values are null, never 0', () => {
  const snap = { s: { 'cpu.load': [42.4, 100, 'x'], 'cpu.temp.package': [95, 100, 'x'], 'cpu.power': [30, 9000, 'x'], 'gpu0.load': [null, null, null] } }
  const r = Object.fromEntries(I.readings(snap).map(x => [x.key, x]))
  assert.equal(r['cpu.load'].text, '42 %')
  assert.equal(r['cpu.temp.package'].hot, true)
  assert.equal(r['cpu.power'].value, null)
  assert.equal(r['gpu0.load'].value, null)
  assert.equal(r['ram.used'].value, null)
  assert.equal(I.readings(null).every(x => x.value === null), true)
})

test('makeRun: failed run gives null; rate is passes per second', () => {
  assert.equal(I.makeRun({ ram: { ok: false }, secs: 30, now: 1 }), null)
  const run = I.makeRun({ ram: { ok: true, passes: 60, errors: 0 }, secs: 30, label: 'before', now: 5, list: I.readings({ s: { 'cpu.temp.package': [61.2, 0, 'x'] } }) })
  assert.equal(run.rate, 2); assert.equal(run.cpuTemp, 61); assert.equal(run.cpuPower, null)
})

test('compare: verdicts, noise band, short runs', () => {
  const a = { secs: 30, rate: 2, errors: 0 }
  assert.deepEqual(I.compare(a, { secs: 30, rate: 2.02, errors: 0 }), { pct: 1, verdict: 'same' })
  assert.equal(I.compare(a, { secs: 30, rate: 2.5, errors: 0 }).verdict, 'faster')
  assert.equal(I.compare(a, { secs: 30, rate: 1.5, errors: 0 }).verdict, 'slower')
  assert.equal(I.compare(a, { secs: 30, rate: 3, errors: 2 }).verdict, 'errors')
  assert.equal(I.compare(a, { secs: 5, rate: 3, errors: 0 }), null)
  assert.equal(I.compare(null, a), null)
})

test('addRun keeps the newest first and caps the list; parseStored survives junk', () => {
  let runs = []
  for (let i = 0; i < 25; i++) runs = I.addRun(runs, { ts: i, rate: 1, secs: 30, errors: 0 })
  assert.equal(runs.length, I.MAX_RUNS); assert.equal(runs[0].ts, 24)
  assert.deepEqual(I.addRun(runs, null), runs)
  assert.deepEqual(I.parseStored('not json'), [])
  assert.deepEqual(I.parseStored('[1,{"ts":1,"rate":2}]'), [{ ts: 1, rate: 2 }])
})
