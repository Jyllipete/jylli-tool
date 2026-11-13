const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs'), path = require('path')
const catalog = require('../lib/power/catalog')
const winCatalog = require('../lib/windows/catalog')
const cmCatalog = require('../lib/cpumem/catalog')
const netCatalog = require('../lib/network/catalog')
const gpuCatalog = require('../lib/gpu/catalog')
const detect = require('../lib/power/detect')
const model = require('../lib/power/model')
const plans = require('../lib/power/plans')
const battery = require('../lib/power/battery')
const sleep = require('../lib/power/sleep')
const energy = require('../lib/power/energy')
const findings = require('../lib/power/findings')
const live = require('../lib/power/live')
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
test('catalog: retired lane = retired tweaks, nothing retired is probed, recommended or Premium', () => {
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
    assert.ok(!gpuCatalog.isKnown(i.id), 'also in GPU: ' + i.id)
  }
})
test('catalog: the Premium set is exactly what the old Power tab sold (plans and PCIe), the rest is free', () => {
  assert.deepStrictEqual(catalog.ITEMS.filter(i => i.premium).map(i => i.id), ['intel-power-plan', 'amd-power-plan', 'pcie-power'])
})

// ── plans ──
const BAL = '381b4222-f694-41f0-9685-ff5bb260df2e', MINE = '89f7c0cb-7c17-4774-be56-b135ea7e679b', SAVER = 'a1841308-3541-4fab-bc81-f71556f20b4a'
const K = id => plans.keyOf(plans.byAnat[id])
test('plans: normalize drops bad guids and duplicates, marks built-in, own and kind', () => {
  const l = plans.normalize([{ guid: '{' + BAL.toUpperCase() + '}', name: 'Balanced', active: true }, { guid: BAL, name: 'dup' }, { guid: 'nope', name: 'x' }, { guid: MINE, name: 'Intel Max Performance' }, null])
  assert.strictEqual(l.length, 2); assert.ok(l[0].builtin && l[0].kind === 'balanced' && l[0].active); assert.ok(l[1].own && l[1].kind === 'jylli' && !l[1].builtin)
})
test('plans: deletable = custom, not active; duplicates are grouped by name; tidyable lists the same', () => {
  const l = plans.normalize([{ guid: BAL, name: 'Balanced' }, { guid: MINE, name: 'Mine', active: true }, { guid: 'b7c1e4d9-3a52-4f88-9c60-2d5e8a1f6b34', name: 'Old' }, { guid: 'c7c1e4d9-3a52-4f88-9c60-2d5e8a1f6b34', name: 'old' }])
  assert.deepStrictEqual(plans.tidyable(l).map(p => p.name), ['Old', 'old'])
  assert.strictEqual(plans.duplicates(l).length, 1); assert.strictEqual(plans.duplicates(l)[0].guids.length, 2)
  assert.ok(!plans.deletable(l[0]) && !plans.deletable(l[1]))
})
test('plans: describe turns a value into a descriptor, unread stays null', () => {
  const a = id => plans.byAnat[id]
  assert.deepStrictEqual(plans.describe(a('display'), 0), { kind: 'never' }); assert.deepStrictEqual(plans.describe(a('display'), 600), { kind: 'min', n: 10 })
  assert.deepStrictEqual(plans.describe(a('sleep'), 7200), { kind: 'hour', n: 2 }); assert.strictEqual(plans.describe(a('cpuMax'), null), null)
  assert.strictEqual(plans.describe(a('aspm'), 0).kind, 'aspmOff'); assert.strictEqual(plans.describe(a('boost'), 2).kind, 'boostAggressive')
})
test('plans: character reads the plan from facts only and says unread when there are none', () => {
  const idx = { [SAVER]: { AC: { [K('cpuMax')]: 70, [K('boost')]: 0 }, DC: {} }, [MINE]: { AC: { [K('cpuMin')]: 100, [K('cpuMax')]: 100, [K('boost')]: 2, [K('aspm')]: 0 }, DC: {} } }
  assert.strictEqual(plans.character(idx, SAVER).kind, 'saver'); assert.strictEqual(plans.character(idx, MINE).kind, 'performance')
  assert.ok(plans.character(idx, MINE).flags.includes('linksAwake')); assert.strictEqual(plans.character(idx, BAL).kind, 'unread')
})
test('plans: diff marks only rows that differ, a row unread on both sides never differs', () => {
  const idx = { a: { AC: { [K('cpuMax')]: 100 }, DC: {} }, b: { AC: { [K('cpuMax')]: 70 }, DC: {} } }
  const d = plans.diff(idx, 'A', 'B')
  assert.ok(d.find(r => r.id === 'cpuMax').differs); assert.ok(!d.find(r => r.id === 'epp').differs)
})

// ── detect ──
test('detect: the script only reads, and every registry probe is requested once', () => {
  const s = detect.buildScript()
  assert.ok(!/\b(Set-ItemProperty|New-ItemProperty|Remove-Item|Set-Content|reg add|bcdedit \/set|\/setactive|\/delete|\/import|\/devicedisablewake|\/setacvalueindex|\/setdcvalueindex|\/change)\b/i.test(s), 'writes something')
  assert.ok(s.includes('JJPW:'))
  const keys = detect.requests(detect.plan()).map(r => r.k)
  assert.strictEqual(new Set(keys).size, keys.length); assert.ok(keys.some(k => k.endsWith('HiberbootEnabled')))
})
const ASPM = catalog.ASPM
const FACTS = {
  plans: [{ guid: BAL, name: 'Balanced', active: false }, { guid: MINE, name: 'FSOS AMD Gaming', active: true }], battery: null,
  idx: { [MINE]: { AC: { [ASPM]: 1, [K('sleep')]: 0 }, DC: { [ASPM]: 2 } } }, trim: 0, overlayAc: 'DED574B5-45A0-4F42-8737-46345C09C238', cs: '0', hibernate: '0', fastStartup: '0', chassis: [3],
  req: 'DISPLAY:\nNone.\n\nSYSTEM:\n[PROCESS] \\Device\\x\\vlc.exe\n\nAWAYMODE:\nNone.\n', last: 'Wake History Count - 0', armed: 'HID Keyboard Device\nIntel(R) Ethernet', prog: 'HID Keyboard Device\nIntel(R) Ethernet\nOther', timers: 'There are no active wake timers.',
}
test('detect.parse: plans, per-plan values, battery, power mode and the powercfg text; unwrapped arrays are arrays again', () => {
  const p = detect.parse('noise\nJJPW:' + JSON.stringify({ r: {}, f: { ...FACTS, plans: FACTS.plans[0], chassis: 3 } }) + '\n')
  assert.strictEqual(p.f.plans.length, 1)
  const q = detect.parse('JJPW:' + JSON.stringify({ r: {}, f: FACTS }))
  assert.strictEqual(q.f.activeName, 'FSOS AMD Gaming'); assert.strictEqual(q.f.activeGuid, MINE); assert.strictEqual(q.f.idx[MINE].AC[ASPM], 1)
  assert.strictEqual(q.f.overlayAc, 'ded574b5-45a0-4f42-8737-46345c09c238'); assert.strictEqual(q.f.modernStandby, false); assert.strictEqual(q.f.laptop, false)
  assert.strictEqual(q.f.requests.keepsAwake.length, 1); assert.deepStrictEqual(q.f.wakeDevices, ['HID Keyboard Device', 'Intel(R) Ethernet']); assert.strictEqual(q.f.wakeTimers.length, 0)
  assert.strictEqual(detect.parse('nothing'), null); assert.strictEqual(detect.parse('JJPW:{bad'), null)
})
test('detect.evaluate: the plan probe, the ASPM values and TRIM; an absent registry value is the default, an unread fact is unread', () => {
  const p = detect.parse('JJPW:' + JSON.stringify({ r: { [detect.keyOf({ r: 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power', n: 'HiberbootEnabled' })]: null }, f: FACTS }))
  let ev = detect.evaluate(p)
  assert.strictEqual(ev['amd-power-plan'].state, 'none'); assert.strictEqual(ev['pcie-power'].state, 'none'); assert.strictEqual(ev['trim-enable'].state, 'all'); assert.strictEqual(ev['fast-startup-off'].state, 'none')
  p.f.activeName = 'AMD Max Performance'; p.f.idx[MINE].AC[ASPM] = 0; p.f.idx[MINE].DC[ASPM] = 0
  ev = detect.evaluate(p)
  assert.strictEqual(ev['amd-power-plan'].state, 'all'); assert.strictEqual(ev['pcie-power'].state, 'all')
  p.f.idx[MINE].DC[ASPM] = 2; assert.strictEqual(detect.evaluate(p)['pcie-power'].state, 'some')
  p.f.trim = null; assert.strictEqual(detect.evaluate(p)['trim-enable'].state, 'unread')
  assert.strictEqual(detect.evaluate({ r: null, f: null })['pcie-power'].state, 'unread')
})

// ── model ──
test('model: nothing is recommended from a state that was not read; Premium rows lock; retired rows hide', () => {
  const m0 = model.buildModel({ live: null, premium: false })
  assert.strictEqual(m0.verdict.kind, 'unread'); assert.strictEqual(m0.recommendedIds.length, 0); assert.ok(m0.items.find(i => i.id === 'pcie-power').locked); assert.ok(!m0.items.some(i => i.retired))
  const p = detect.parse('JJPW:' + JSON.stringify({ r: {}, f: FACTS }))
  const m = model.buildModel({ live: detect.evaluate(p), premium: true, applic: { 'pcie-power': { show: true, state: 'recommended' } } })
  assert.ok(!m.items.find(i => i.id === 'pcie-power').locked)
})

// ── battery ──
test('battery: no battery = null; health, wear, time left and the signed flow', () => {
  assert.strictEqual(battery.normalize(null), null); assert.strictEqual(battery.normalize({ present: false }), null)
  const b = battery.normalize({ present: true, percent: 50, discharging: true, remainingMWh: 20000, fullMWh: 40000, designMWh: 60000, rateMW: 10000 })
  assert.strictEqual(b.healthPct, 67); assert.strictEqual(b.wear, 'warn'); assert.strictEqual(b.rateW, 10); assert.strictEqual(b.minutesLeft, 120); assert.strictEqual(battery.flowW(b), -10)
  const c = battery.normalize({ present: true, percent: 80, charging: true, remainingMWh: 32000, fullMWh: 40000, designMWh: 40000, rateMW: 20000 })
  assert.strictEqual(c.wear, 'ok'); assert.strictEqual(c.minutesToFull, 24); assert.strictEqual(battery.flowW(c), 20)
  const d = battery.normalize({ present: true, percent: 80, acLine: true })
  assert.strictEqual(d.healthPct, null); assert.strictEqual(d.wear, null); assert.strictEqual(d.minutesLeft, null)
  assert.strictEqual(battery.normalize({ present: true, fullMWh: 10, designMWh: 100 }).wear, 'bad')
})

// ── sleep parsers ──
test('sleep.parseRequests: structure only (works in any language), an error is unread not "nothing"', () => {
  const fi = 'NÄYTTÖ:\nEi mitään.\n\nJÄRJESTELMÄ:\n[PROCESS] \\Device\\HarddiskVolume3\\Windows\\vlc.exe\n[DRIVER] Realtek Audio\n\nAWAYMODE:\nEi mitään.\n'
  const r = sleep.parseRequests(fi)
  assert.strictEqual(r.count, 2); assert.strictEqual(r.keepsAwake.length, 2); assert.strictEqual(r.keepsAwake[0].type, 'process')
  assert.strictEqual(sleep.parseRequests('This command requires administrator privileges and must be executed from an elevated command prompt.'), null)
  assert.strictEqual(sleep.parseRequests(''), null); assert.strictEqual(sleep.parseRequests('DISPLAY:\nNone.\nSYSTEM:\nNone.\n').keepsAwake.length, 0)
})
test('sleep: last wake count, armed devices cross-checked with programmable ones, wake timers', () => {
  assert.deepStrictEqual(sleep.parseLastWake('Wake History Count - 0'), { count: 0, lines: [] })
  assert.strictEqual(sleep.parseLastWake('Wake History Count - 2\nWake History [0]\n  Wake Source Count - 1').count, 2); assert.strictEqual(sleep.parseLastWake('garbage'), null)
  assert.deepStrictEqual(sleep.parseWakeDevices('NONE', 'A\nB'), []); assert.deepStrictEqual(sleep.parseWakeDevices('A\nEi mitään.', 'A\nB'), ['A']); assert.strictEqual(sleep.parseWakeDevices('', ''), null)
  assert.deepStrictEqual(sleep.parseWakeDevices('Ghost\nA', 'A'), ['A'])
  assert.strictEqual(sleep.parseWakeTimers('Timer set by [SERVICE] \\Device\\x\\svc.exe expires at 10:00').length, 1); assert.strictEqual(sleep.parseWakeTimers('There are no active wake timers.').length, 0); assert.strictEqual(sleep.parseWakeTimers(''), null)
})

// ── energy ──
test('energy: trapezoid watt-hours per source, a gap is not integrated, an unmeasured source stays null, cost needs a price', () => {
  const m = energy.createMeter()
  m.push(0, { cpu: 100, gpu: null }); m.push(1800000 / 1000 * 1000 / 1000 * 1000, { cpu: 100, gpu: null })   // 1800 ms apart
  const t0 = 10000
  const m2 = energy.createMeter()
  for (let i = 0; i <= 3600; i++) m2.push(t0 + i * 1000, { cpu: 100, gpu: i < 1800 ? 200 : null })   // an hour: cpu 100 W; gpu 200 W for the first half hour
  const s = m2.summary()
  assert.ok(Math.abs(s.cpu.wh - 100) < 0.5, 'cpu wh ' + s.cpu.wh); assert.ok(Math.abs(s.gpu.wh - 100) < 0.5, 'gpu wh ' + s.gpu.wh)
  assert.ok(Math.abs(s.whTotal - 200) < 1); assert.strictEqual(s.cpu.peakW, 100); assert.strictEqual(m.summary().gpu, null)
  const g = energy.createMeter(); g.push(0, { cpu: 100 }); g.push(60000, { cpu: 100 }); assert.strictEqual(g.summary().cpu.wh, 0)   // 60 s gap
  assert.strictEqual(energy.cost(500, 0.2), 0.1); assert.strictEqual(energy.cost(500, null), null); assert.strictEqual(energy.cost(null, 0.2), null)
  assert.strictEqual(energy.perHour(null, 0.2), null); assert.deepStrictEqual(energy.perHour(250, 0.2), { wh: 250, cost: 0.05 })
})

// ── live ──
test('live: poller line, nvidia-smi line, watts and where they came from', () => {
  const f = live.parseLine('JJPWLIVE:' + JSON.stringify({ t: 5, perf: 130, util: 40, bat: { ac: false, charging: false, discharging: true, rateMW: 12500, remMWh: 30000 } }))
  assert.strictEqual(f.perf, 130); assert.strictEqual(f.bat.rateW, 12.5); assert.strictEqual(live.parseLine('x'), null); assert.strictEqual(live.parseLine('JJPWLIVE:{bad'), null)
  assert.deepStrictEqual(live.parseSmi('0, 123.4, 55'), { powerW: 123.4, load: 55 }); assert.strictEqual(live.parseSmi('1, 2, 3'), null); assert.strictEqual(live.parseSmi('0, [N/A], 3').powerW, null)
  const w = live.wattsOf({ smi: { powerW: 80, load: 10 }, sensor: { cpuW: 45, gpuW: 90 } })
  assert.strictEqual(w.gpuW, 80); assert.strictEqual(w.gpuSrc, 'nvidia-smi'); assert.strictEqual(w.cpuSrc, 'sensor')
  assert.deepStrictEqual(live.wattsOf({ smi: null, sensor: { cpuW: null, gpuW: null } }), { cpuW: null, gpuW: null, cpuSrc: null, gpuSrc: null, gpuLoad: null })
})

// ── findings ──
const T = findings.T
function base(o = {}) { return { laptop: false, plans: plans.normalize(FACTS.plans), activeGuid: MINE, idx: FACTS.idx, battery: null, overlayAc: null, onAC: true, status: {}, requests: null, wakeDevices: null, wakeTimers: null, modernStandby: null, ...o } }
test('findings.statics: saver on a desktop, but not on a laptop', () => {
  const l = plans.normalize([{ guid: SAVER, name: 'Power saver', active: true }])
  assert.ok(findings.statics(base({ plans: l, activeGuid: SAVER })).some(f => f.id === 'saver-on-desktop' && f.action.guid === BAL))
  assert.ok(!findings.statics(base({ plans: l, activeGuid: SAVER, laptop: true })).some(f => f.id === 'saver-on-desktop'))
})
test('findings.statics: ASPM only when the switch is open and the plan really has it on; clutter names the duplicates', () => {
  assert.ok(findings.statics(base({ status: { 'pcie-power': 'off' } })).some(f => f.id === 'aspm-on-desktop'))
  assert.ok(!findings.statics(base({ status: { 'pcie-power': 'on' } })).some(f => f.id === 'aspm-on-desktop'))
  assert.ok(!findings.statics(base({ status: {} })).some(f => f.id === 'aspm-on-desktop'))
  const l = plans.normalize([{ guid: MINE, name: 'X', active: true }, { guid: 'b7c1e4d9-3a52-4f88-9c60-2d5e8a1f6b34', name: 'Old' }, { guid: 'c7c1e4d9-3a52-4f88-9c60-2d5e8a1f6b34', name: 'old' }])
  const c = findings.statics(base({ plans: l })).find(f => f.id === 'plan-clutter'); assert.strictEqual(c.vars.n, 1)
})
test('findings.statics: battery wear at and just above the thresholds', () => {
  const at = pct => findings.statics(base({ laptop: true, battery: { healthPct: pct, wear: pct < T.WEAR_BAD ? 'bad' : pct < T.WEAR_WARN ? 'warn' : 'ok' } })).find(f => f.id === 'battery-worn')
  assert.strictEqual(at(T.WEAR_BAD - 1).tone, 'bad'); assert.strictEqual(at(T.WEAR_BAD).tone, 'warn'); assert.strictEqual(at(T.WEAR_WARN - 1).tone, 'warn'); assert.strictEqual(at(T.WEAR_WARN), undefined)
})
test('findings.statics: sleep blocked, wake devices ignore keyboards and mice, timers, modern standby, efficiency mode on AC', () => {
  const rq = sleep.parseRequests(FACTS.req)
  assert.strictEqual(findings.statics(base({ requests: rq })).find(f => f.id === 'sleep-blocked').vars.n, 1)
  const few = ['HID Keyboard Device', 'HID-compliant mouse', 'NIC 1', 'NIC 2'], many = [...few, 'NIC 3']
  assert.ok(!findings.statics(base({ wakeDevices: few })).some(f => f.id === 'wake-armed-many')); assert.ok(findings.statics(base({ wakeDevices: many })).some(f => f.id === 'wake-armed-many'))
  assert.ok(findings.statics(base({ wakeTimers: [{ type: 'service', name: 'x' }] })).some(f => f.id === 'wake-timers')); assert.ok(findings.statics(base({ modernStandby: true })).some(f => f.id === 'modern-standby'))
  assert.ok(findings.statics(base({ laptop: true, onAC: true, overlayAc: '961cc777-2547-4f9d-8174-7d86181b8a7a' })).some(f => f.id === 'efficiency-mode-on-ac'))
  assert.ok(!findings.statics(base({ laptop: true, onAC: false, overlayAc: '961cc777-2547-4f9d-8174-7d86181b8a7a' })).some(f => f.id === 'efficiency-mode-on-ac'))
  const lap = base({ laptop: true, idx: { [MINE]: { AC: {}, DC: { [K('sleep')]: 0 } } } }); assert.ok(findings.statics(lap).some(f => f.id === 'sleep-never-on-battery'))
})
test('findings.live: needs enough idle frames, enough of them over the line, and a laptop for the battery one', () => {
  const n = T.LIVE_MIN_FRAMES
  const gf = (k, w) => Array.from({ length: n }, (_, i) => ({ smi: { load: 1, powerW: i < k ? w : 20 }, bat: null, util: 5 }))
  assert.ok(findings.live(gf(n, T.GPU_IDLE_W + 5)).some(f => f.id === 'gpu-idle-draw-high'))
  assert.ok(!findings.live(gf(Math.floor(n * T.IDLE_SHARE) - 2, T.GPU_IDLE_W + 5)).some(f => f.id === 'gpu-idle-draw-high'))
  assert.ok(!findings.live(gf(n, T.GPU_IDLE_W)).some(f => f.id === 'gpu-idle-draw-high'))   // at the line is not over it
  assert.deepStrictEqual(findings.live(gf(n, 100).slice(0, n - 1)), [])
  const busy = Array.from({ length: n }, () => ({ smi: { load: 90, powerW: 300 }, bat: null, util: 90 })); assert.deepStrictEqual(findings.live(busy), [])
  const bf = Array.from({ length: n }, () => ({ smi: null, util: 5, bat: { discharging: true, rateW: T.BAT_IDLE_DRAIN_W + 5 } }))
  assert.ok(findings.live(bf, { laptop: true }).some(f => f.id === 'battery-drain-high')); assert.ok(!findings.live(bf, { laptop: false }).some(f => f.id === 'battery-drain-high'))
})
test('findings: every id is in the list and the test below knows the language files once they exist', () => {
  for (const f of findings.statics(base({ status: { 'pcie-power': 'off' }, modernStandby: true }))) assert.ok(findings.IDS.includes(f.id))
})
