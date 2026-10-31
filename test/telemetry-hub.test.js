const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { createHub } = require('../lib/telemetry-hub')
const smi = require('../lib/nvidia-smi')

const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/sensors/nvidia-smi-rtx-desktop.csv'), 'utf8')

test('nvidia-smi golden parse (real RTX 5070 desktop output)', () => {
  const [g] = smi.parseQuery(fixture)
  assert.strictEqual(g.name, 'NVIDIA GeForce RTX 5070')
  assert.strictEqual(g.uuid, 'GPU-2678552e-4734-a10c-64ee-0aad420e76a2')
  assert.strictEqual(g.temp, 31.48); assert.strictEqual(g.vramTotalMB, 12227); assert.strictEqual(g.fanPct, 30)
  assert.deepStrictEqual([g.minLimit, g.defaultLimit, g.maxLimit], [175, 250, 300])
})

test('nvidia-smi N/A fields become null, never 0', () => {
  const line = '0, GPU-x, NVIDIA GeForce RTX 4060 Laptop GPU, 12, 55, [N/A], [N/A], 1500, 8000, 500, 8188, [N/A], [N/A], [N/A], [N/A], [N/A]'
  const [g] = smi.parseQuery(line)
  assert.strictEqual(g.power, null); assert.strictEqual(g.fanPct, null); assert.strictEqual(g.maxLimit, null)
  assert.strictEqual(g.temp, 55)
  const s = smi.toSamples([g])
  assert.strictEqual(s['gpu0.power'], null)
})

test('power-limit support: desktop yes, laptop/unknown form factor/missing limits no', () => {
  const [g] = smi.parseQuery(fixture)
  const ok = smi.powerLimitSupport(g, { isLaptop: false })
  assert.deepStrictEqual([ok.supported, ok.min, ok.max, ok.default], [true, 175, 300, 250])
  assert.strictEqual(smi.powerLimitSupport(g, { isLaptop: true }).reason, 'laptop')
  assert.strictEqual(smi.powerLimitSupport(g, { isLaptop: undefined }).reason, 'form-factor-unknown')
  assert.strictEqual(smi.powerLimitSupport({ ...g, maxLimit: null }, { isLaptop: false }).reason, 'limits-unavailable')
  assert.strictEqual(smi.powerLimitSupport({ ...g, minLimit: 250 }, { isLaptop: false }).reason, 'limits-inconsistent')
})

test('power-limit validation: integers in range, confirmation above default', () => {
  const sup = smi.powerLimitSupport(smi.parseQuery(fixture)[0], { isLaptop: false })
  assert.strictEqual(smi.validatePowerLimit({ watts: 240 }, sup).ok, true)
  assert.strictEqual(smi.validatePowerLimit({ watts: 999 }, sup).reason, 'out-of-range')
  assert.strictEqual(smi.validatePowerLimit({ watts: 240.5 }, sup).reason, 'not-an-integer')
  assert.strictEqual(smi.validatePowerLimit({ watts: '240' }, sup).reason, 'not-an-integer')
  assert.strictEqual(smi.validatePowerLimit({ watts: 280 }, sup).reason, 'needs-confirmation')
  assert.strictEqual(smi.validatePowerLimit({ watts: 280, confirmAboveDefault: true }, sup).ok, true)
})

test('hub: priority, staleness and reasons', () => {
  let t = 0
  const hub = createHub({ now: () => t })
  hub.ingest('os', { 'gpu0.temp.core': 40 }, { rateHz: 1 })
  hub.ingest('nvidia', { 'gpu0.temp.core': 41 }, { rateHz: 1 })
  assert.strictEqual(hub.value('gpu0.temp.core'), 41)            // nvidia beats os
  hub.ingest('sensor', { 'gpu0.temp.core': 42 }, { rateHz: 2 })
  assert.strictEqual(hub.value('gpu0.temp.core'), 42)            // sensor beats both
  t = 10000                                                       // everything is now stale
  assert.strictEqual(hub.value('gpu0.temp.core'), null)
  assert.deepStrictEqual(hub.capabilities()['gpu0.temp.core'], { available: false, reason: 'stale' })
  hub.ingest('os', { 'gpu0.temp.core': 39 })
  assert.strictEqual(hub.value('gpu0.temp.core'), 39)            // falls back when the better source is gone
})

test('hub: NaN / missing is "not-supported" or "needs-driver", never a number', () => {
  const hub = createHub({ now: () => 0 })
  hub.ingest('sensor', { 'cpu.load': 12, 'gpu0.fan.rpm': NaN }, { rateHz: 2 })
  hub.setContext({ sensorRunning: true, sensorHasDriver: false })
  const caps = hub.capabilities(['cpu.temp.package', 'mb.fan1.rpm'])
  assert.strictEqual(caps['gpu0.fan.rpm'].reason, 'not-supported')
  assert.strictEqual(caps['cpu.temp.package'].reason, 'needs-driver')
  assert.strictEqual(caps['mb.fan1.rpm'].reason, 'needs-driver')
  assert.strictEqual(caps['cpu.load'].available, true)
  const snap = hub.snapshot()
  assert.deepStrictEqual(snap.s['gpu0.fan.rpm'], [null, null, null])
  const m = hub.legacyMetrics()
  assert.strictEqual(m.cpuTemp, null); assert.strictEqual(m.gpuTemp, null); assert.strictEqual(m.cpu, 12)
})

test('hub: no sensor running gives "no-sensor"; ring buffer is bounded; snapshot seq grows', () => {
  let t = 0
  const hub = createHub({ now: () => t, ringSeconds: 10 })
  assert.strictEqual(hub.capabilities(['cpu.temp.package'])['cpu.temp.package'].reason, 'no-sensor')
  for (let i = 0; i < 30; i++) { t = i * 1000; hub.ingest('os', { 'cpu.load': i }) }
  assert.ok(hub.series('cpu.load', 1000).length <= 11)
  assert.ok(hub.snapshot().seq < hub.snapshot().seq)
})
