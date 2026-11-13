const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs'), path = require('path')
const catalog = require('../lib/gpu/catalog')
const winCatalog = require('../lib/windows/catalog')
const cmCatalog = require('../lib/cpumem/catalog')
const netCatalog = require('../lib/network/catalog')
const detect = require('../lib/gpu/detect')
const model = require('../lib/gpu/model')
const findings = require('../lib/gpu/findings')
const limiter = require('../lib/gpu/limiter')
const live = require('../lib/gpu/live')
const loadtest = require('../lib/gpu/loadtest')
const { entries } = require('../tools/list-tweaks')

const root = path.join(__dirname, '..')
const mainSrc = fs.readFileSync(path.join(root, 'main.js'), 'utf8')
const retiredInMain = new Set([...mainSrc.slice(mainSrc.indexOf('const RETIRED_TWEAKS = {'), mainSrc.indexOf('function retireFivemTweaks')).matchAll(/^  '([a-z0-9-]+)':/gm)].map(m => m[1]))

// ── catalog ──
test('catalog: every id is a real tweak, ids are unique, every lane exists', () => {
  const tweaks = new Set(entries.map(e => e.id)), seen = new Set()
  for (const i of catalog.ITEMS) {
    assert.ok(tweaks.has(i.id), 'not in TWEAKS: ' + i.id)
    assert.ok(!seen.has(i.id), 'duplicate ' + i.id); seen.add(i.id)
    assert.ok(catalog.LANES.some(l => l.id === i.lane), 'lane of ' + i.id)
  }
})
test('catalog: retired lane = retired tweaks of the GPU, nothing retired is recommended, probed or Premium', () => {
  for (const i of catalog.ITEMS) {
    if (i.lane === 'retired') { assert.ok(retiredInMain.has(i.id), 'not retired in main: ' + i.id); assert.ok(!i.rec && !i.probe && !i.premium, i.id) }
    else assert.ok(!retiredInMain.has(i.id), 'retired but listed live: ' + i.id)
  }
})
test('catalog: no switch is owned by two tabs', () => {
  for (const i of catalog.ITEMS) {
    assert.ok(!winCatalog.isKnown(i.id), 'also in Windows: ' + i.id)
    assert.ok(!cmCatalog.isKnown(i.id), 'also in CPU & Memory: ' + i.id)
    assert.ok(!netCatalog.isKnown(i.id), 'also in Network: ' + i.id)
  }
})
test('catalog: only HAGS off stays Premium (the old GPU tab was Premium, the Windows switches were free)', () => {
  assert.deepStrictEqual(catalog.ITEMS.filter(i => i.premium).map(i => i.id), ['gpu-hags-off'])
})

// ── detect ──
test('detect: the script only reads, covers every probe once and ends with the display list', () => {
  const s = detect.buildScript()
  assert.ok(!/\b(Set-ItemProperty|New-ItemProperty|Remove-Item|Set-Content|reg add|bcdedit \/set)\b/i.test(s.replace(/ChangeDisplaySettingsEx/g, '')), 'writes something')
  assert.ok(s.includes('JJGP:') && s.includes('EnumDisplaySettingsEx'))
  const keys = detect.requests(detect.plan()).map(r => r.k)
  assert.strictEqual(new Set(keys).size, keys.length)
  assert.ok(keys.some(k => k === 'x|msi') && keys.some(k => k === 'x|dxvrr'))
})
const FACTS = { gpus: [{ name: 'NVIDIA GeForce RTX 4070', driver: '31.0.15.5222', date: '2026-01-10', pnp: 'PCI\\X', status: 'OK' }], vram: [{ name: 'NVIDIA GeForce RTX 4070', bytes: 12 * 1024 ** 3 }], irq: [{ name: 'NVIDIA GeForce RTX 4070', irq: [4294967000] }], battery: false, chassis: [3],
  smi: { slowdownC: 92, shutdownC: 98, targetC: 83, bar1MiB: 256, fbMiB: 12282, q: '4,16,2580,10501,200,200,100,220' } }
const DISP = 'REMOTE=0\nDISP=\\\\.\\DISPLAY1|Dell|1|2560|1440|60|32|2560x1440@60,2560x1440@165,1920x1080@60\nEDIDMAX=165\n'
test('detect.parse: facts, smi limits, rebar and the display list; arrays that PowerShell unwrapped are arrays again', () => {
  const out = 'noise\nJJGP:' + JSON.stringify({ r: { 'x|msi': 'off' }, f: FACTS }) + '\n' + DISP
  const p = detect.parse(out)
  assert.strictEqual(p.f.gpus[0].name, 'NVIDIA GeForce RTX 4070'); assert.strictEqual(p.f.vram[0].gb, 12)
  assert.strictEqual(p.f.irq[0].mode, 'msi'); assert.strictEqual(p.f.smi.rebar, false); assert.strictEqual(p.f.smi.slowdownC, 92)
  assert.strictEqual(p.f.smi.pcieGenMax, 4); assert.strictEqual(p.f.smi.powerLimitW, 200); assert.strictEqual(p.displays.length, 1); assert.strictEqual(p.displays[0].cur.hz, 60)
  assert.strictEqual(detect.parse('nothing'), null); assert.strictEqual(detect.parse('JJGP:{bad'), null)
})
test('detect.evaluate: absent registry value = default (miss), unread computed value = unread, ge and eq', () => {
  const r = {}; for (const q of detect.requests(detect.plan())) r[q.k] = null
  let ev = detect.evaluate(r)
  assert.strictEqual(ev['tdr-delay'].state, 'none'); assert.strictEqual(ev['msi-mode'].state, 'unread')
  r['r|HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers|TdrDelay'] = '60'; r['x|msi'] = 'on'; r['r|HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers|HwSchMode'] = '2'
  ev = detect.evaluate(r)
  assert.strictEqual(ev['tdr-delay'].state, 'all'); assert.strictEqual(ev['msi-mode'].state, 'all'); assert.strictEqual(ev['gpu-hwsch'].state, 'all'); assert.strictEqual(ev['gpu-hags-off'].state, 'none')
})

// ── model ──
test('model: recommended only from a read state, nothing for a retired or locked row, retired shown only when applied', () => {
  const r = {}; for (const q of detect.requests(detect.plan())) r[q.k] = null
  const live1 = detect.evaluate(r)
  const m = model.buildModel({ live: live1, remembered: { 'nvidia-profile': 'applied' }, meta: { 'nvidia-profile': { retired: 'old' } }, applic: { 'msi-mode': { state: 'recommended' } }, premium: false })
  assert.ok(m.items.find(i => i.id === 'nvidia-profile' && i.lane === 'retired')); assert.ok(!m.items.find(i => i.id === 'nvidia-max-perf'))
  assert.ok(m.items.find(i => i.id === 'gpu-hags-off').locked)
  assert.ok(!m.recommendedIds.includes('msi-mode'), 'reboot-needing switches are never in the one-click set')
  assert.strictEqual(model.buildModel({ live: null }).verdict.kind, 'unread')
  assert.deepStrictEqual(model.buildModel({ live: null, applic: { 'msi-mode': { state: 'recommended' } } }).recommendedIds, [])
})

// ── limiter ──
test('limiter.decodeReasons: bit mask, hex or number, unknown stays null', () => {
  assert.deepStrictEqual(limiter.decodeReasons('0x0000000000000004'), ['power'])
  assert.deepStrictEqual(limiter.decodeReasons(0x24), ['power', 'thermal'])
  assert.deepStrictEqual(limiter.decodeReasons('0x0'), [])
  assert.strictEqual(limiter.decodeReasons('[N/A]'), null); assert.strictEqual(limiter.decodeReasons(''), null); assert.strictEqual(limiter.decodeReasons(null), null)
})
const F = (o = {}) => ({ t: 0, load: 99, smi: { load: 99, clock: 2500, clockMax: 2850, power: 199, powerLimit: 200, temp: 70, fan: 50, vramUsed: 6000, vramTotal: 12000, reasons: '0x4', genCur: 4, widthCur: 16, ...(o.smi || {}) }, sensor: { tempCore: null, tempHot: null, power: null, fanRpm: null, fanPct: null, ...(o.sensor || {}) }, mem: { dedicatedMB: 6000, sharedMB: 0 }, ...(o.top || {}) })
test('limiter.limiterOf: idle first, then thermal > hardware > power > load; unknown without reason bits', () => {
  assert.strictEqual(limiter.limiterOf(F({ smi: { load: 10, reasons: '0x1' } })).id, 'idle')
  assert.strictEqual(limiter.limiterOf(F({ smi: { reasons: '0x4' } })).id, 'power')
  assert.strictEqual(limiter.limiterOf(F({ smi: { reasons: '0x24' } })).id, 'thermal')
  assert.strictEqual(limiter.limiterOf(F({ smi: { reasons: '0x8' } })).id, 'hardware')
  assert.strictEqual(limiter.limiterOf(F({ smi: { reasons: '0x0' } })).id, 'load')
  assert.strictEqual(limiter.limiterOf(F({ smi: { load: 70, reasons: '0x0' } })).id, 'none')
  assert.strictEqual(limiter.limiterOf({ load: 70, mem: {} }).id, 'unknown')
  assert.strictEqual(limiter.limiterOf({ load: 97, mem: {} }).id, 'load')
})
test('limiter.rails: five rails, ceilings from the driver, temperature tone against the slowdown temperature', () => {
  const r = limiter.rails(F({ smi: { temp: 89 } }), { slowdownC: 92 })
  assert.deepStrictEqual(r.map(x => x.id), ['load', 'clock', 'power', 'temp', 'vram'])
  assert.strictEqual(r[1].max, 2850); assert.strictEqual(r[2].pct, 99.5); assert.strictEqual(r[3].tone, 'bad'); assert.strictEqual(r[4].pct, 50)
  assert.strictEqual(limiter.rails(F({ smi: { temp: 70 } }), { slowdownC: 92 })[3].tone, '')
  const none = limiter.rails({ load: 20, mem: {} }, {})
  assert.strictEqual(none[1].value, null); assert.strictEqual(none[2].max, null); assert.strictEqual(none[4].pct, null)
})

// ── findings ──
const base = { name: 'NVIDIA GeForce RTX 4070', vendor: 'nvidia', discrete: true, driverDays: 10, displays: [], status: {}, remembered: {} }
const ids = l => l.map(f => f.id)
test('findings.statics: each exists only on its evidence, every one at and just under its threshold', () => {
  assert.deepStrictEqual(findings.statics(base), [])
  assert.ok(ids(findings.statics({ ...base, name: 'Microsoft Basic Display Adapter', driverDays: 900 })).join() === 'no-driver')
  assert.ok(!ids(findings.statics({ ...base, driverDays: 179 })).includes('driver-old')); assert.ok(ids(findings.statics({ ...base, driverDays: 180 })).includes('driver-old'))
  const mon = (cur, hz2, edid) => ({ device: '\\\\.\\DISPLAY1', monitor: 'Dell', cur: { w: 2560, h: 1440, hz: cur }, modes: [{ w: 2560, h: 1440, hz: cur }, { w: 2560, h: 1440, hz: hz2 }], maxHzAtCur: Math.max(cur, hz2), edidMaxHz: edid })
  assert.ok(ids(findings.statics({ ...base, displays: [mon(60, 165, 165)] })).includes('refresh-below-max'))
  assert.ok(!ids(findings.statics({ ...base, displays: [mon(60, 62, 62)] })).includes('refresh-below-max'), 'under 3 Hz is not a fix')
  assert.ok(ids(findings.statics({ ...base, displays: [mon(60, 60, 144)] })).includes('link-limited'))
  assert.ok(!ids(findings.statics({ ...base, displays: [mon(60, 60, 79)] })).includes('link-limited'))
  assert.ok(!ids(findings.statics({ ...base, remote: true, displays: [mon(60, 165, 165)] })).includes('refresh-below-max'))
  assert.ok(ids(findings.statics({ ...base, rebar: false })).includes('rebar-off')); assert.ok(!ids(findings.statics({ ...base, rebar: null })).includes('rebar-off'), 'unknown is not off')
  assert.ok(!ids(findings.statics({ ...base, vendor: 'amd', rebar: false })).includes('rebar-off'))
  assert.ok(ids(findings.statics({ ...base, hybrid: true })).includes('hybrid-games-igpu')); assert.ok(!ids(findings.statics({ ...base, hybrid: true, remembered: { 'gpu-per-app-preference': 'applied' } })).includes('hybrid-games-igpu'))
  assert.ok(ids(findings.statics({ ...base, irqMode: 'line' })).includes('line-interrupts')); assert.ok(!ids(findings.statics({ ...base, irqMode: 'msi' })).includes('line-interrupts'))
  assert.ok(ids(findings.statics({ ...base, dlssFrameGen: true, status: { 'gpu-hags-off': 'on' } })).includes('fg-needs-hags')); assert.ok(!ids(findings.statics({ ...base, dlssFrameGen: true, status: { 'gpu-hags-off': 'off' } })).includes('fg-needs-hags'))
  assert.ok(ids(findings.statics({ ...base, power: { current: 150, default: 200 } })).includes('power-limit-custom')); assert.ok(!ids(findings.statics({ ...base, power: { current: 200, default: 200 } })).includes('power-limit-custom'))
})
const many = (n, o) => Array.from({ length: n }, () => F(o))
test('findings.live: nothing before 10 frames; thresholds at and just under; tone', () => {
  const facts = { clockMaxMHz: 2850, powerLimitW: 200, slowdownC: 92, vramGB: 12, pcieGenMax: 4, pcieWidthMax: 16 }
  assert.deepStrictEqual(findings.live(many(9, { smi: { reasons: '0x20' } }), { facts }), [])
  const th = (k, n) => [...many(k, { smi: { reasons: '0x20' } }), ...many(n - k, { smi: { reasons: '0x0' } })]
  assert.ok(ids(findings.live(th(2, 10), { facts })).includes('thermal-throttle')); assert.ok(!ids(findings.live(th(1, 10), { facts })).includes('thermal-throttle'))
  assert.strictEqual(findings.live(many(10, { smi: { reasons: '0x40' } }), { facts })[0].tone, 'bad')
  assert.ok(ids(findings.live(many(10, { smi: { reasons: '0x8' } }), { facts })).includes('hw-slowdown'))
  assert.ok(ids(findings.live(many(10, { smi: { reasons: '0x4' } }), { facts })).includes('power-capped'))
  assert.ok(ids(findings.live(many(10, { sensor: { tempCore: 70, tempHot: 95 } }), { facts })).includes('hotspot-delta')); assert.ok(!ids(findings.live(many(10, { sensor: { tempCore: 70, tempHot: 94 } }), { facts })).includes('hotspot-delta'))
  assert.ok(ids(findings.live(many(10, { smi: { vramUsed: 11500, reasons: '0x0' } }), { facts })).includes('vram-full')); assert.ok(!ids(findings.live(many(10, { smi: { vramUsed: 11000, reasons: '0x0' } }), { facts })).includes('vram-full'))
  assert.ok(ids(findings.live(many(10, { smi: { genCur: 1, reasons: '0x0' } }), { facts })).includes('pcie-link-low')); assert.ok(!ids(findings.live(many(10, { smi: { reasons: '0x0' } }), { facts })).includes('pcie-link-low'))
  assert.ok(ids(findings.live(many(10, { smi: { temp: 85, fan: 0, reasons: '0x0' } }), { facts })).includes('fan-stopped-hot')); assert.ok(!ids(findings.live(many(10, { smi: { temp: 79, fan: 0, reasons: '0x0' } }), { facts })).includes('fan-stopped-hot'))
  assert.deepStrictEqual(findings.live(many(10, { smi: { load: 5, reasons: '0x1', power: 20 } }), { facts }), [], 'an idle card is never throttled')
})
test('findings: every id has English and Finnish text', () => {
  const dir = path.join(root, 'js', 'lang')
  const en = fs.existsSync(path.join(dir, 'gpu-en.js')) ? fs.readFileSync(path.join(dir, 'gpu-en.js'), 'utf8') : '', fi = fs.existsSync(path.join(dir, 'gpu-fi.js')) ? fs.readFileSync(path.join(dir, 'gpu-fi.js'), 'utf8') : ''
  for (const id of findings.IDS) for (const k of ['fT_', 'fS_']) for (const [n, src] of [['en', en], ['fi', fi]]) assert.ok(src.includes(k + id.replace(/-/g, '_') + ':'), `${n} ${k}${id}`)
})

// ── live parsing ──
test('live.parseLine / parseSmi: clean frames, "[N/A]" is null, GPU 0 only', () => {
  const f = live.parseLine('JJGPLIVE:' + JSON.stringify({ t: 5, luid: '0x0_0x1', mem: { dedicated: 800, shared: 10 }, eng: { gfx: 70, compute: 5, copy: 0, decode: 0, encode: 12, vproc: 0 }, procs: [[10, 'game', 70, 600], [11, 'dwm', 3, 90]] }))
  assert.strictEqual(f.load, 70); assert.strictEqual(f.procs[0].name, 'game'); assert.strictEqual(f.mem.dedicatedMB, 800); assert.strictEqual(live.parseLine('x'), null)
  const s = live.parseSmi('0, 98, 2500, 10000, 2850, 10501, 190.5, 200.00, 71, [N/A], 6000, 12282, P2, 4, 16, 0x0000000000000004')
  assert.strictEqual(s.fan, null); assert.strictEqual(s.pstate, 'P2'); assert.strictEqual(s.reasons, '0x0000000000000004'); assert.strictEqual(s.powerLimit, 200)
  assert.strictEqual(live.parseSmi('1, 98, 2500, 10000, 2850, 10501, 190.5, 200.00, 71, 30, 6000, 12282, P2, 4, 16'), null)
  assert.strictEqual(live.parseSmi('0, 98, 2500, 10000, 2850, 10501, 190.5, 200.00, 71, 30, 6000, 12282, P2, 4, 16', false).reasons, null)
})
test('live script only reads counters', () => { assert.ok(!/Set-|Remove-|New-Item/.test(live.buildScript().replace(/New-Object/g, ''))) })

// ── load test ──
test('loadtest.guard: stops at the named ceilings only', () => {
  assert.strictEqual(loadtest.guard(F({ smi: { temp: 86 } })), null); assert.strictEqual(loadtest.guard(F({ smi: { temp: 87 } })), 'hot-core')
  assert.strictEqual(loadtest.guard(F({ sensor: { tempHot: 99 } })), null); assert.strictEqual(loadtest.guard(F({ sensor: { tempHot: 100 } })), 'hot-spot')
})
test('loadtest.summarize / compare: honest numbers, null where nothing was measured, the change since the last run', () => {
  assert.strictEqual(loadtest.summarize(many(3), {}).ok, false)
  const r = loadtest.summarize(many(20), { work: 41.23, renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070)' }, { clockMaxMHz: 2850 })
  assert.strictEqual(r.ok, true); assert.strictEqual(r.clockAvg, 2500); assert.strictEqual(r.clockPct, 87.7); assert.strictEqual(r.limiter.id, 'power'); assert.strictEqual(r.limiter.pct, 100); assert.strictEqual(r.tempPeak, 70); assert.strictEqual(r.hotspotPeak, null); assert.strictEqual(r.work, 41.2)
  const r2 = loadtest.summarize(many(20, { smi: { power: 150, clock: 2400 } }), { work: 39.9 }, {})
  const d = loadtest.compare(r2, r)
  assert.strictEqual(d.power, -49); assert.strictEqual(d.clock, -100); assert.strictEqual(d.work, -3.2); assert.strictEqual(d.limiterChanged, false); assert.strictEqual(loadtest.compare(r2, null), null)
  assert.strictEqual(loadtest.wrongRenderer('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics)', 'NVIDIA GeForce RTX 4070'), true)
  assert.strictEqual(loadtest.wrongRenderer('ANGLE (NVIDIA, NVIDIA GeForce RTX 4070)', 'NVIDIA GeForce RTX 4070'), false)
  assert.strictEqual(loadtest.wrongRenderer('Google SwiftShader', 'x'), true); assert.strictEqual(loadtest.wrongRenderer('', 'x'), null)
})
