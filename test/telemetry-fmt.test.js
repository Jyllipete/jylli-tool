const test = require('node:test')
const assert = require('node:assert')
const T = require('../js/telemetry')

const tr = k => ({ metricNA: 'Not available', metricNeedsDriver: 'needs driver', metricNoSensor: 'no sensor', metricNotSupported: 'not supported', metricStale: 'stale', metricFrom: 'From', metricAgo: 'ago' }[k] || k)

test('null / NaN / missing entries are "Not available" with a reason, never a number', () => {
  for (const entry of [[null, null, null], undefined, [NaN, 10, 'os']]) {
    const r = T.fmt('cpu.temp.package', entry, { available: false, reason: 'needs-driver' }, tr)
    assert.strictEqual(r.ok, false); assert.strictEqual(r.text, 'Not available')
    assert.ok(!/\d/.test(r.text)); assert.ok(r.title.includes('needs driver'))
  }
  assert.strictEqual(T.fmt('gpu0.fan.rpm', undefined, undefined, tr).title, 'Not available: no sensor')
})

test('sentinel values render, with units and provenance', () => {
  const r = T.fmt('gpu0.temp.hotspot', [71.4, 400, 'sensor'], { available: true, detail: 'LibreHardwareMonitor', rateHz: 2 }, tr)
  assert.deepStrictEqual([r.text, r.unit], ['71', '°C'])
  assert.ok(/From sensor · LibreHardwareMonitor · 0.4s ago · 2\/s/.test(r.title))
  assert.strictEqual(T.fmt('gpu0.power', [123.4, 0, 'nvidia'], null, tr).text, '123')
  assert.strictEqual(T.fmt('gpu0.power', [45.67, 0, 'nvidia'], null, tr).text, '45.7')
  assert.strictEqual(T.fmt('gpu0.vram.used', [8192, 0, 'nvidia'], null, tr).text, '8.0')
  assert.strictEqual(T.fmt('gpu0.fan.rpm', [1650.2, 0, 'sensor'], null, tr).unit, 'RPM')
})

test('temperature hysteresis: no flicker inside the band', () => {
  assert.strictEqual(T.hysteresis(70, 70.5), 70)
  assert.strictEqual(T.hysteresis(70, 70.7), 71)
  assert.strictEqual(T.hysteresis(null, 55.4), 55)
})

test('bytes per second switch KB->MB at 1000 KB', () => {
  assert.strictEqual(T.fmtBytes(500 * 1024).u, 'KB/s')
  assert.strictEqual(T.fmtBytes(1100 * 1024).u, 'MB/s')
})

test('ease approaches the target and never overshoots', () => {
  let v = 0
  for (let i = 0; i < 20; i++) { v = T.ease(v, 100, 16.7); assert.ok(v <= 100) }
  assert.ok(v > 50 && v < 100)
  assert.strictEqual(T.ease(null, 42, 16), 42)
})
