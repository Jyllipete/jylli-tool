// Accuracy guarantees (plan: "Accuracy guarantees and how they are tested"): no-sensor, stale and sentinel fixtures.
const test = require('node:test')
const assert = require('node:assert')
const T = require('../js/telemetry')

const KEYS = ['cpu.load', 'cpu.temp.package', 'cpu.power', 'ram.used', 'ram.load', 'gpu0.load', 'gpu0.temp.core', 'gpu0.temp.hotspot', 'gpu0.power', 'gpu0.power.pct',
  'gpu0.clock.core', 'gpu0.clock.mem', 'gpu0.vram.used', 'gpu0.fan.rpm', 'gpu0.fan.pct', 'net.rx', 'net.tx', 'disk.c.pct', 'cooler.pump.rpm']
const tr = k => ({ metricNA: 'Not available', metricNeedsDriver: 'needs driver', metricNoSensor: 'no sensor', metricStale: 'stale', metricNotSupported: 'not supported', metricFrom: 'From', metricAgo: 'ago' }[k] || k)

test('no-sensor fixture: not one metric renders a digit', () => {
  for (const key of KEYS) {
    for (const entry of [undefined, [null, null, null], [NaN, 5, 'os'], [undefined, 5, 'os']]) {
      const r = T.fmt(key, entry, { available: false, reason: 'no-sensor' }, tr)
      assert.strictEqual(r.ok, false, key)
      assert.ok(!/\d/.test(r.text), `${key} rendered "${r.text}"`)
    }
  }
})

test('sentinel fixture: every rendered number traces back to its sentinel value', () => {
  // unique odd values; the first digits of each must appear in the rendered text (rounding only changes the tail)
  const sentinel = { 'cpu.load': 73, 'cpu.temp.package': 61.4, 'cpu.power': 87.6, 'ram.used': 19.3, 'ram.load': 59, 'gpu0.load': 37, 'gpu0.temp.core': 53.2, 'gpu0.temp.hotspot': 67.9,
    'gpu0.power': 141.7, 'gpu0.power.pct': 57, 'gpu0.clock.core': 1913, 'gpu0.clock.mem': 9001, 'gpu0.vram.used': 5123, 'gpu0.fan.rpm': 1377, 'gpu0.fan.pct': 41, 'disk.c.pct': 54, 'cooler.pump.rpm': 2711 }
  for (const [key, v] of Object.entries(sentinel)) {
    const r = T.fmt(key, [v, 100, 'sensor'], { available: true }, tr)
    assert.ok(r.ok, key)
    const shown = parseFloat(r.text)
    const expected = r.unit === 'GB' && key.endsWith('vram.used') ? v / 1024 : v   // MB values over 1024 are shown in GB
    assert.ok(Math.abs(shown - expected) <= 0.5, `${key}: shows ${r.text} ${r.unit} for ${v}`)
  }
})

test('stale fixture: an old reading is reported as unavailable by the hub, and the formatter says so', () => {
  const { createHub } = require('../lib/telemetry-hub')
  let t = 0
  const hub = createHub({ now: () => t })
  hub.ingest('sensor', { 'gpu0.temp.core': 60 }, { rateHz: 2 })
  t = 7000                                                    // "no reading for 6 s": past 3x the source rate
  const snap = hub.snapshot(), caps = hub.capabilities()
  assert.deepStrictEqual(snap.s['gpu0.temp.core'], [null, null, null])
  const r = T.fmt('gpu0.temp.core', snap.s['gpu0.temp.core'], caps['gpu0.temp.core'], tr)
  assert.strictEqual(r.ok, false); assert.ok(r.title.includes('stale'))
})
