'use strict'
const test = require('node:test')
const assert = require('node:assert')
const Ini = require('../lib/fivem/ini')
const Gfx = require('../lib/fivem/graphics')
const Route = require('../lib/fivem/route-verdict')
const Attr = require('../lib/fivem/attribution')

// ── CitizenFX.ini ───────────────────────────────────────────────────────────────────
const INI = '\uFEFF[Game]\r\nIVPath=C:\\Games\\GTA V\r\nUpdateChannel = production\r\n; keep me\r\nSomethingElse=1\r\n\r\n[Other]\r\nX=2\r\n'

test('ini: read splits documented keys from unknown ones', () => {
  const r = Ini.read(INI)
  assert.equal(r.known.find(k => k.key === 'UpdateChannel').value, 'production')
  assert.equal(r.known.find(k => k.key === 'DisableNVSP').present, false)
  assert.deepEqual(r.other.map(o => o.key).sort(), ['SomethingElse', 'X'])
})
test('ini: patch changes only the value text and keeps everything else byte for byte', () => {
  const p = Ini.patch(INI, { UpdateChannel: 'beta' })
  assert.deepEqual(p.changed, ['UpdateChannel'])
  assert.equal(p.text, INI.replace('production', 'beta'))
})
test('ini: undocumented, read-only and invalid keys are rejected and never written', () => {
  const p = Ini.patch(INI, { StreamingMemory: '1024', IVPath: 'D:\\x', UpdateChannel: 'nightly', DisableNVSP: '2' })
  assert.equal(p.text, INI)
  assert.deepEqual(p.rejected.map(r => r.reason).sort(), ['bad-value', 'bad-value', 'read-only', 'unknown-key'])
})
test('ini: a missing key is appended inside its own section, a missing section at the end', () => {
  const a = Ini.patch(INI, { DisableCrashUpload: '1' }).text
  assert.ok(a.indexOf('DisableCrashUpload=1') > a.indexOf('SomethingElse=1') && a.indexOf('DisableCrashUpload=1') < a.indexOf('[Other]'))
  assert.ok(a.startsWith('\uFEFF'))
  const b = Ini.patch('', { DisableNVSP: '1' }).text
  assert.equal(b, '[Game]\r\nDisableNVSP=1\r\n')
})
test('ini: patching to the current value is a byte-identical no-op', () => {
  assert.equal(Ini.patch(INI, { UpdateChannel: 'production' }).text, INI)
})

// ── gta5_settings.xml ──────────────────────────────────────────────────────────────
const XML = '<?xml version="1.0"?>\n<Settings>\n  <graphics>\n    <TextureQuality value="3" />\n    <LodScale value="1.000000"/>\n    <MSAA value="4" />\n  </graphics>\n</Settings>\n'

test('graphics: read reports keys the file has and null for the rest', () => {
  const r = Gfx.read(XML)
  assert.equal(r.structure, true)
  assert.equal(r.values.TextureQuality, '3')
  assert.equal(r.values.GrassQuality, null)
})
test('graphics: patch edits existing keys only, validates values and keeps the file otherwise intact', () => {
  const p = Gfx.patch(XML, { MSAA: '0', GrassQuality: '1', TextureQuality: '9', Nope: '1' })
  assert.deepEqual(p.changed, ['MSAA'])
  assert.equal(p.text, XML.replace('<MSAA value="4"', '<MSAA value="0"'))
  assert.deepEqual(p.skipped.map(s => s.reason).sort(), ['bad-value', 'not-in-file', 'unknown-key'])
})
test('graphics: floats match numerically and are written in the option spelling', () => {
  const p = Gfx.patch(XML, { LodScale: '0.5' })
  assert.match(p.text, /<LodScale value="0.500000"\/>/)
})
test('graphics: presets only touch keys that exist and unknown VRAM never means low-end', () => {
  const cur = Gfx.read(XML).values
  assert.deepEqual(Object.keys(Gfx.preset('performance', cur, 0)).sort(), ['LodScale', 'MSAA', 'TextureQuality'])
  assert.equal(Gfx.textureLimit(0), null)
  assert.equal(Gfx.vramTier(0), 1)
  assert.equal(Gfx.vramTier(8192), 3)
})

// ── route verdict ──────────────────────────────────────────────────────────────────
function feed(rounds, fn, destTtl = 4) {
  const s = Route.create()
  for (let i = 0; i < rounds; i++) Route.ingest(s, { d: destTtl, h: fn(i), tcp: undefined })
  return s
}
const ok = (ttl, ip, ms) => [ttl, ip, ms]
const path = (i, over = {}) => [
  ok(1, '192.168.1.1', over[1] !== undefined ? over[1](i) : 1),
  ok(2, '81.2.3.4', over[2] !== undefined ? over[2](i) : 8),
  ok(3, '62.4.5.6', over[3] !== undefined ? over[3](i) : 15),
  ok(4, '5.6.7.8', over[4] !== undefined ? over[4](i) : 24),
]

test('route: classifies private, CGNAT and public addresses', () => {
  assert.equal(Route.classifyIp('192.168.0.1'), 'private')
  assert.equal(Route.classifyIp('172.20.1.1'), 'private')
  assert.equal(Route.classifyIp('100.64.1.1'), 'cgnat')
  assert.equal(Route.classifyIp('8.8.8.8'), 'public')
})
test('route: a clean path is clean and segments are home, isp, transit, server', () => {
  const a = Route.analyze(feed(30, i => path(i)))
  assert.equal(a.verdict.id, 'clean')
  assert.deepEqual(a.hops.map(h => h.seg), ['home', 'isp', 'isp', 'server'])
})
test('route: fewer than five rounds is "measuring"', () => {
  assert.equal(Route.analyze(feed(3, i => path(i))).verdict.id, 'measuring')
})
test('route: loss that starts at the ISP hop and carries to the server is the ISP', () => {
  const lossy = i => (i % 5 === 0 ? null : 8)
  const a = Route.analyze(feed(40, i => path(i, { 2: lossy, 3: lossy, 4: lossy })))
  assert.equal(a.verdict.id, 'loss-isp')
  assert.equal(a.verdict.ttl, 2)
})
test('route: loss at one middle hop that clears further on is rate limiting, not loss', () => {
  const a = Route.analyze(feed(40, i => path(i, { 3: i => (i % 2 ? null : 15) })))
  assert.equal(a.verdict.id, 'clean')
})
test('route: a hop that never answers is hidden, not a fault', () => {
  const a = Route.analyze(feed(30, i => path(i, { 3: () => null })))
  assert.equal(a.hops.find(h => h.ttl === 3).hidden, true)
  assert.equal(a.verdict.id, 'clean')
})
test('route: jitter on the router hop points at the home network', () => {
  const a = Route.analyze(feed(40, i => path(i, { 1: i => (i % 2 ? 2 : 25) })))
  assert.equal(a.verdict.id, 'jitter-home')
})
test('route: ICMP blocked at the server falls back to the TCP connect', () => {
  const s = Route.create()
  for (let i = 0; i < 30; i++) Route.ingest(s, { d: null, h: [ok(1, '192.168.1.1', 1), ok(2, '81.2.3.4', 8), ok(3, null, null)], tcp: 30 })
  const a = Route.analyze(s)
  assert.equal(a.verdict.id, 'clean')
  assert.equal(a.verdict.ev.via, 'tcp')
})
test('route: nothing answering at all is no-replies; replies that stop mid-path are unreachable', () => {
  const none = Route.create(); for (let i = 0; i < 10; i++) Route.ingest(none, { d: null, h: [ok(1, null, null)], tcp: null })
  assert.equal(Route.analyze(none).verdict.id, 'no-replies')
  const cut = Route.create(); for (let i = 0; i < 10; i++) Route.ingest(cut, { d: null, h: [ok(1, '192.168.1.1', 1), ok(2, '81.2.3.4', 8), ok(3, null, null)], tcp: null })
  const v = Route.analyze(cut).verdict
  assert.equal(v.id, 'unreachable'); assert.equal(v.ttl, 2)
})
test('route: rings are capped', () => {
  const s = feed(300, i => path(i))
  assert.ok(s.hops[1].ring.length <= Route.CAP)
})

// ── attribution ────────────────────────────────────────────────────────────────────
function session(bins, series = {}, extra = {}) { return { bins, series, seconds: Object.keys(series).length ? bins.length : 0, ...extra } }
const steady = n => Array.from({ length: n }, () => ({ fps: 60, maxMs: 20, frames: 60 }))

test('attribution: a hitch with a saturated GPU is gpu-bound; without telemetry it is unknown', () => {
  const bins = steady(30); bins[10] = { fps: 20, maxMs: 180, frames: 20 }
  const gpu = new Array(30).fill(60); gpu[9] = gpu[10] = gpu[11] = 99
  const a = Attr.analyze(session(bins, { 'gpu0.load': gpu }))
  assert.equal(a.hitches.length, 1)
  assert.equal(a.hitches[0].primary, 'gpu-bound')
  assert.equal(Attr.analyze(session(bins)).hitches[0].primary, 'unknown')
})
test('attribution: thermal outranks load, adjacent bins merge into one hitch', () => {
  const bins = steady(30); bins[10] = { fps: 20, maxMs: 200, frames: 20 }; bins[11] = { fps: 25, maxMs: 120, frames: 25 }
  const a = Attr.analyze(session(bins, { 'gpu0.load': new Array(30).fill(99), 'gpu0.temp.core': new Array(30).fill(90) }))
  assert.equal(a.hitches.length, 1)
  assert.equal(a.hitches[0].endSec, 11)
  assert.equal(a.hitches[0].primary, 'thermal')
})
test('attribution: network spikes and loss runs are separate events and never blamed for hitches', () => {
  const rtt = new Array(40).fill(30); rtt[10] = 400; rtt[20] = null; rtt[21] = null
  const a = Attr.analyze(session(steady(40), {}, { net: { rtt } }))
  assert.deepEqual(a.net.map(e => e.type), ['spike', 'loss'])
  assert.equal(a.hitches.length, 0)
})
