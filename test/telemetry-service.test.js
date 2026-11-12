const test = require('node:test')
const assert = require('node:assert')
const { EventEmitter } = require('events')
const fs = require('fs'), path = require('path')
const { createHub } = require('../lib/telemetry-hub')
const { createTelemetryService, osSamples, sensorSamples } = require('../lib/telemetry-service')

function fakeProc() { const p = new EventEmitter(); p.stdout = new EventEmitter(); p.kill = () => p.emit('exit'); return p }

test('os line maps to stable keys, totals the adapters, keeps per-adapter keys', () => {
  const s = osSamples({ cpuLoad: 7, ramTotalGB: 32, ramUsedGB: 8, uptimeSec: 100, processes: 140, diskTotalGB: 1000, diskUsedGB: 500, gpuLoad: 3, net: { 'Eth A': [100, 10], 'Wi-Fi': [50, 5] } })
  assert.strictEqual(s['ram.load'], 25); assert.strictEqual(s['disk.c.pct'], 50)
  assert.strictEqual(s['net.rx'], 150); assert.strictEqual(s['net.tx'], 15); assert.strictEqual(s['net.Eth A.rx'], 100)
})

test('old sensor bridge zeros become missing, not 0', () => {
  const s = sensorSamples({ cpu_package_temp: 0, gpu_core_temp: 61, cpu_power: 0, gpu_usage: 0 })
  assert.strictEqual(s['cpu.temp.package'], null); assert.strictEqual(s['gpu0.temp.core'], 61); assert.strictEqual(s['gpu0.load'], null)
})

test('service feeds the hub from both pollers and pushes only when subscribed and visible', () => {
  const hub = createHub()
  const procs = []
  const emitted = []
  let visible = true
  const timers = []
  const svc = createTelemetryService({
    hub, spawn: () => { const p = fakeProc(); procs.push(p); return p }, exists: () => true,
    emit: (c, p) => emitted.push([c, p]), isVisible: () => visible, scriptPath: 'x.ps1',
    setTimer: (fn) => { timers.push(fn); return timers.length }, clearTimer: () => {},
  })
  svc.start()
  const [os, nv] = procs
  os.stdout.emit('data', Buffer.from('{"cpuLoad":9,"ramTotalGB":16,"ramUsedGB":4}\n{"cpuLoad":1'))   // second line arrives in two chunks
  os.stdout.emit('data', Buffer.from('0}\n'))
  const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/sensors/nvidia-smi-rtx-desktop.csv'), 'utf8')
  nv.stdout.emit('data', Buffer.from(fixture))
  assert.strictEqual(hub.value('cpu.load'), 10)
  assert.strictEqual(hub.value('gpu0.temp.core'), 31.48)
  assert.strictEqual(svc.osHealthy(), true)
  svc.push(); assert.strictEqual(emitted.length, 0)          // nobody subscribed
  svc.subscribe(); svc.push(); assert.strictEqual(emitted.length, 1)
  assert.strictEqual(emitted[0][0], 'twin-telemetry')
  visible = false; svc.push(); assert.strictEqual(emitted.length, 1)   // hidden window: no traffic
  svc.stop()
})

test('missing nvidia-smi is recorded, not an error', () => {
  const hub = createHub()
  const svc = createTelemetryService({ hub, spawn: () => fakeProc(), exists: () => false, emit() {}, scriptPath: 'x', setTimer: () => 1, clearTimer() {} })
  svc.start()
  assert.strictEqual(hub.getContext().nvidiaPresent, false)
})

test('os line: drive activity keys exist only when the counters reported', () => {
  const s = osSamples({ cpuLoad: 7, diskIdle: 92.5, diskRead: 1000, diskWrite: 250 })
  assert.strictEqual(s['disk.load'], 7.5)
  assert.strictEqual(s['disk.read'], 1000)
  assert.strictEqual(s['disk.write'], 250)
  const none = osSamples({ cpuLoad: 7 })
  assert.ok(!('disk.load' in none) && !('disk.read' in none) && !('disk.write' in none))
})
