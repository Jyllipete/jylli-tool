const test = require('node:test')
const assert = require('node:assert')
const ST = require('../lib/speedtest')
const SS = require('../lib/ssdp')

test('mbps discards the ramp-up window and uses cumulative bytes', () => {
  // 1 MB per 100 ms after the first second = 80 Mbit/s; the slow first second must not count
  const samples = []
  for (let t = 0; t <= 3000; t += 100) samples.push({ t, bytes: t < 1000 ? t * 100 : 100000 + (t - 1000) * 10000 })
  const v = ST.mbps(samples)
  assert.ok(Math.abs(v - 80) < 0.5, String(v))
  assert.strictEqual(ST.mbps([{ t: 0, bytes: 0 }]), null)
})

test('latency stats: median and mean-absolute-difference jitter, NaN dropped', () => {
  const s = ST.latencyStats([20, 22, 21, NaN, 30])
  assert.strictEqual(s.ms, 21.5); assert.strictEqual(s.samples, 4)
  assert.ok(Math.abs(s.jitterMs - (2 + 1 + 9) / 3) < 1e-9)
  assert.strictEqual(ST.latencyStats([]).ms, null)
})

test('colo comes from the headers, never guessed', () => {
  assert.strictEqual(ST.coloFrom({ 'cf-meta-colo': 'ams' }), 'AMS')
  assert.strictEqual(ST.coloFrom({ 'cf-ray': '8a1b2c3d4e5f6a7b-HEL' }), 'HEL')
  assert.strictEqual(ST.coloFrom({}), null)
})

test('run() with a fake transport: both phases, colo, loaded latency, cap respected', async () => {
  let now = 0
  const clock = setInterval(() => { now += 50 }, 10)
  const deps = {
    now: () => now, latencyProbe: async () => 20 + (now % 3),
    fetchChunked: (url, o) => new Promise(resolve => { const iv = setInterval(() => { o.onChunk(125000); if (o.signal.aborted) { clearInterval(iv); resolve({ headers: { 'cf-meta-colo': 'HEL' } }) } }, 25) }),
  }
  const r = await ST.run(deps, { maxMs: 1500, discardMs: 300, streams: 4 })
  clearInterval(clock)
  assert.strictEqual(r.ok, true); assert.strictEqual(r.colo, 'HEL')
  assert.ok(r.downMbps > 0 && r.upMbps > 0); assert.ok(r.latency.samples === 8)
  assert.ok(r.bytes > 0)
})

test('SSDP: private-IP rule, response parsing and device XML', () => {
  assert.ok(SS.isPrivateIp('192.168.1.1')); assert.ok(SS.isPrivateIp('10.0.0.1')); assert.ok(SS.isPrivateIp('172.20.0.1'))
  assert.ok(!SS.isPrivateIp('8.8.8.8')); assert.ok(!SS.isPrivateIp('172.32.0.1')); assert.ok(!SS.isPrivateIp('abc'))
  const r = SS.parseSsdpResponse('HTTP/1.1 200 OK\r\nCACHE-CONTROL: max-age=1800\r\nLOCATION: http://192.168.1.1:5000/rootDesc.xml\r\nSERVER: Linux UPnP/1.1\r\nUSN: uuid:abc::upnp:rootdevice\r\n\r\n')
  assert.strictEqual(r.host, '192.168.1.1'); assert.strictEqual(r.port, '5000')
  assert.strictEqual(SS.parseSsdpResponse('garbage'), null)
  const xml = '<root><device><deviceType>urn:schemas-upnp-org:device:InternetGatewayDevice:1</deviceType><friendlyName>Gateway &amp; Co</friendlyName><manufacturer>Example Networks</manufacturer><modelName>EX-1000</modelName><deviceList><device><manufacturer>Inner</manufacturer></device></deviceList></device></root>'
  assert.deepStrictEqual(SS.parseDeviceXml(xml), { manufacturer: 'Example Networks', model: 'EX-1000', friendlyName: 'Gateway & Co', modelNumber: null })
  assert.strictEqual(SS.parseDeviceXml('<root></root>'), null)
})

test('SSDP: only the gateway may be queried, and the URL is rebuilt from the gateway IP', () => {
  const evil = { location: 'http://203.0.113.9/steal.xml', host: '203.0.113.9' }
  const gw = { location: 'http://192.168.1.1:5000/rootDesc.xml', host: '192.168.1.1' }
  const other = { location: 'http://192.168.1.50:80/x.xml', host: '192.168.1.50' }
  assert.deepStrictEqual(SS.pickGatewayDescription([evil, other, gw], '192.168.1.1'), { url: 'http://192.168.1.1:5000/rootDesc.xml' })
  assert.strictEqual(SS.pickGatewayDescription([evil, other], '192.168.1.1'), null)
  assert.strictEqual(SS.pickGatewayDescription([evil], '8.8.8.8'), null)       // a public "gateway" is never queried
})
