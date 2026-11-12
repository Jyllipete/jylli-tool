const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs'), path = require('path')
const catalog = require('../lib/cpumem/catalog')
const winCatalog = require('../lib/windows/catalog')
const netCatalog = require('../lib/network/catalog')
const detect = require('../lib/cpumem/detect')
const model = require('../lib/cpumem/model')
const topology = require('../lib/cpumem/topology')
const affinity = require('../lib/cpumem/affinity')
const memory = require('../lib/cpumem/memory')
const live = require('../lib/cpumem/live')
const findings = require('../lib/cpumem/findings')
const actions = require('../lib/cpumem/actions')
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
test('catalog: retired lane = exactly the retired tweaks, nothing retired is recommended or probed', () => {
  for (const i of catalog.ITEMS) {
    assert.strictEqual(i.lane === 'retired', retiredInMain.has(i.id), i.id)
    if (i.lane === 'retired') { assert.ok(!i.rec && !i.probe && !i.premium, i.id) }
  }
})
test('catalog: no switch is owned by two tabs', () => {
  for (const i of catalog.ITEMS) { assert.ok(!winCatalog.isKnown(i.id), 'also in Windows: ' + i.id); assert.ok(!netCatalog.isKnown(i.id), 'also in Network: ' + i.id) }
})
test('catalog: what was Premium stays Premium, what was free stays free', () => {
  const premium = catalog.ITEMS.filter(i => i.premium).map(i => i.id).sort()
  assert.deepStrictEqual(premium, ['cpu-parking', 'cstates', 'full-mitigation-wipe', 'hvci-offload', 'hypervisor-off', 'vbs-disable'])
  for (const id of ['power-throttling', 'global-timer-resolution', 'sysmain', 'memory-compression', 'spectre-meltdown']) assert.ok(!catalog.isPremium(id), id)
})
test('catalog: nothing tier 3 is recommended, every probe kind is known', () => {
  const tier = Object.fromEntries(entries.map(e => [e.id, Number(e.tier)]))
  for (const i of catalog.ITEMS.filter(x => x.rec)) assert.ok(tier[i.id] < 3, i.id)
  for (const i of catalog.ITEMS) for (const p of i.probe || []) assert.ok(p.r || p.s || p.p || ['memcomp', 'scheme', 'hvlaunch', 'pagefile', 'procmit'].includes(p.x), i.id)
})
test('catalog: every probe value matches what the tweak really writes', () => {
  const body = id => entries.find(e => e.id === id).body.join('\n')
  assert.match(body('cpu-parking'), /CPMINCORES 100/)
  assert.match(body('cstates'), /PROCTHROTTLEMIN 100/); assert.match(body('cstates'), /IDLEPROMOTE 0/); assert.match(body('cstates'), /IDLEDEMOTE 0/)
  assert.match(body('hvci-offload'), /HypervisorEnforcedCodeIntegrity/); assert.match(body('vbs-disable'), /EnableVirtualizationBasedSecurity -Value 0/)
  assert.match(body('hypervisor-off'), /hypervisorlaunchtype off/); assert.match(body('spectre-meltdown'), /FeatureSettingsOverride -Value 3/)
  assert.match(body('pagefile-auto'), /PagingFiles/); assert.match(body('sysmain'), /SysMain/); assert.match(body('memory-compression'), /MemoryCompression/)
})

// ── detect ──
test('detect: the probe script only reads', () => {
  const s = detect.buildScript()
  assert.ok(!/\b(Set-ItemProperty|Remove-Item|New-Item|Stop-Service|Start-Service|Set-Service|Disable-MMAgent|Enable-MMAgent|Set-ProcessMitigation|sc\.exe config|powercfg\s+\/set|bcdedit\s+\/set)/i.test(s))
  assert.ok(s.includes('powercfg /qh') && s.includes('JJCM:'))
})
test('detect: the parser tolerates noise and unwraps a single module', () => {
  const out = 'banner\nJJCM:' + JSON.stringify({ r: { 's|SysMain': 'Disabled' }, f: { topo: 'C|0|0|3', sticks: { slot: 'A', capGB: 8 } } }) + '\nmore noise'
  const p = detect.parse(out)
  assert.deepStrictEqual(p.f.topo, ['C|0|0|3']); assert.strictEqual(p.f.sticks.length, 1)
  assert.strictEqual(detect.parse('nothing'), null); assert.strictEqual(detect.parse('JJCM:{bad'), null); assert.strictEqual(detect.parse('JJCM:{"f":{}}'), null)
})
test('detect: states follow the readings; unreadable is never "off"', () => {
  const k = id => detect.keyOf(catalog.byId[id].probe[0])
  const r = { [k('sysmain')]: 'Disabled', [k('cpu-parking')]: '100', [k('hypervisor-off')]: 'auto', [k('memory-compression')]: null, [k('x3d-balanced')]: '381b4222-f694-41f0-9685-ff5bb260df2e' }   // x3d-balanced and power-balanced-restore read the same key
  const ev = detect.evaluate(r)
  assert.strictEqual(ev.sysmain.state, 'all'); assert.strictEqual(ev['cpu-parking'].state, 'all'); assert.strictEqual(ev['hypervisor-off'].state, 'none')
  assert.strictEqual(ev['memory-compression'].state, 'unread'); assert.strictEqual(ev['power-balanced-restore'].state, 'all'); assert.strictEqual(ev['x3d-balanced'].state, 'all')
  const saver = detect.evaluate({ 'x|scheme': 'a1841308-3541-4fab-bc81-f71556f20b4a' }); assert.strictEqual(saver['power-balanced-restore'].state, 'none'); assert.strictEqual(saver['x3d-balanced'].state, 'none')
  assert.strictEqual(detect.evaluate(r, detect.plan(['sysmain'])).sysmain.state, 'all')
  assert.strictEqual(detect.evaluate({ 's|SysMain': 'MISSING' }, detect.plan(['sysmain'])).sysmain.state, 'na')
})
test('detect: a service or registry value that is absent follows the Windows default', () => {
  const r = {}; for (const q of detect.requests(detect.plan(['power-throttling', 'sysmain']))) r[q.k] = q.a === 's' ? 'Automatic' : null
  const ev = detect.evaluate(r, detect.plan(['power-throttling', 'sysmain']))
  assert.strictEqual(ev['power-throttling'].state, 'none'); assert.strictEqual(ev.sysmain.state, 'none')
})

// ── topology ──
const lines = (cores, caches) => [...cores.map(c => `C|${c[0]}|${c[1] || 0}|${c[2]}`), ...caches.map(c => `L|3|${c[0] * 1024}|0|${c[1]}`)]
const bitsMask = (from, n) => String(((1n << BigInt(n)) - 1n) << BigInt(from))
function zen(ccdCores, l3s) {   // dual CCD, SMT: core i owns threads 2i and 2i+1
  const cores = []; for (let i = 0; i < ccdCores * 2; i++) cores.push([0, 0, bitsMask(i * 2, 2)])
  return lines(cores, [[l3s[0], bitsMask(0, ccdCores * 2)], [l3s[1], bitsMask(ccdCores * 2, ccdCores * 2)]])
}
function hybrid(p, e) {   // P cores with SMT (class 1), E cores single thread (class 0)
  const cores = []; for (let i = 0; i < p; i++) cores.push([1, 0, bitsMask(i * 2, 2)]); for (let i = 0; i < e; i++) cores.push([0, 0, bitsMask(p * 2 + i, 1)])
  return lines(cores, [[33, bitsMask(0, p * 2 + e)]])
}
test('topology: dual-CCD X3D finds the V-Cache die by the larger L3', () => {
  const t = topology.build({ topo: zen(8, [96, 32]) })
  assert.ok(t.ok); assert.strictEqual(t.logical, 32); assert.strictEqual(t.physical, 16); assert.strictEqual(t.ccdCount, 2); assert.ok(t.dualCcdVcache); assert.ok(!t.hybrid)
  assert.deepStrictEqual(t.groups.map(g => [g.label, g.l3MB, g.vcache, g.cores.length]), [['CCD 0', 96, true, 8], ['CCD 1', 32, false, 8]])
})
test('topology: two equal CCDs are not V-Cache', () => { const t = topology.build({ topo: zen(6, [32, 32]) }); assert.ok(!t.dualCcdVcache); assert.ok(t.groups.every(g => !g.vcache)) })
test('topology: a hybrid CPU splits by efficiency class, P first', () => {
  const t = topology.build({ topo: hybrid(8, 12) })
  assert.ok(t.hybrid); assert.strictEqual(t.logical, 28); assert.deepStrictEqual(t.groups.map(g => [g.kind, g.cores.length]), [['p', 8], ['e', 12]])
})
test('topology: single CCD labels V-Cache only when the CPU name says X3D; bad lines are skipped', () => {
  const l = [...lines(Array.from({ length: 8 }, (_, i) => [0, 0, bitsMask(i * 2, 2)]), [[96, bitsMask(0, 16)]]), 'garbage', 'C|x']
  assert.ok(topology.build({ topo: l }, { x3d: true }).groups[0].vcache); assert.ok(!topology.build({ topo: l }, {}).groups[0].vcache)
  assert.strictEqual(topology.build({ topo: [] }).ok, false); assert.strictEqual(topology.build(null).ok, false)
})
test('topology: the real laptop reading (4 cores, 8 threads, one L3) and a negative mask', () => {
  const t = topology.build({ topo: ['C|0|0|3', 'L|3|8192|0|255', 'C|0|0|12', 'C|0|0|48', 'C|0|0|192'] })
  assert.strictEqual(t.logical, 8); assert.strictEqual(t.physical, 4); assert.strictEqual(t.groups.length, 1); assert.strictEqual(t.groups[0].l3MB, 8)
  assert.deepStrictEqual(topology.bits('-9223372036854775808'), [63])
  assert.strictEqual(topology.logicalOf('0,5'), 5); assert.strictEqual(topology.logicalOf('1,2'), 66); assert.strictEqual(topology.logicalOf('_Total'), -1)
})

// ── affinity ──
test('affinity: P-cores plan keeps the performance threads only', () => {
  const t = topology.build({ topo: hybrid(8, 12) }), p = affinity.planFor(t, 'pcores')
  assert.strictEqual(p.count, 16); assert.strictEqual(p.mask, '65535'); assert.ok(!affinity.planFor(t, 'vcache'))
})
test('affinity: V-Cache plan keeps the cache die, only on dual-CCD parts with one V-Cache die', () => {
  const t = topology.build({ topo: zen(8, [96, 32]) }), p = affinity.planFor(t, 'vcache')
  assert.strictEqual(p.count, 16); assert.strictEqual(p.mask, '65535'); assert.ok(!affinity.planFor(t, 'pcores'))
  assert.ok(!affinity.planFor(topology.build({ topo: zen(6, [32, 32]) }), 'vcache'))
})
test('affinity: skip-core-0 leaves both threads of the first core and needs room', () => {
  const t = topology.build({ topo: zen(8, [32, 32]) }), p = affinity.planFor(t, 'skip0')
  assert.strictEqual(p.count, 30); assert.ok(!p.cpus.includes(0) && !p.cpus.includes(1))
  const small = topology.build({ topo: zen(2, [16, 16]) })   // 8 threads: 6 left, still allowed; 4 threads: refused
  assert.strictEqual(affinity.planFor(small, 'skip0').count, 6)
  assert.strictEqual(affinity.plans(topology.build({ topo: lines([[0, 0, '3'], [0, 0, '12']], [[8, '15']]) })).length, 0)
})
test('affinity: never more than one processor group, never fewer than four threads', () => {
  const l = []; for (let g = 0; g < 2; g++) for (let i = 0; i < 24; i++) l.push(`C|0|${g}|${bitsMask(i * 2, 2)}`)   // 96 threads in two processor groups
  const big = topology.build({ topo: l }); assert.strictEqual(big.logical, 96)
  assert.strictEqual(affinity.plans(big).length, 0)
  assert.strictEqual(affinity.maskOf([0, 1, 63]), String((1n << 63n) | 3n))
})
test('affinity: only plain program names may be pinned or prioritised', () => {
  for (const ok of ['game.exe', 'FiveM_b3095_GTAProcess.exe', 'my game.exe']) assert.ok(affinity.validExe(ok), ok)
  for (const bad of ['', 'game', 'C:\\x\\game.exe', '..\\a.exe', 'a.exe;calc', 'svchost.exe', 'DWM.EXE', 'explorer.exe', 'a"b.exe', 'x'.repeat(90) + '.exe']) assert.ok(!affinity.validExe(bad), bad)
  assert.throws(() => actions.pinScript('svchost.exe', '15')); assert.throws(() => actions.pinScript('game.exe', '1;calc')); assert.throws(() => actions.prioritySetLines('game.exe', 'realtime'))
})

// ── memory ──
test('memory: strata add up to the installed RAM and keep compressed inside active', () => {
  const s = memory.strata({ totalMB: 16000, availMB: 4000, modifiedMB: 200, standbyMB: 3000, compressedMB: 900, committedMB: 12000, commitLimitMB: 24000, pageReads: 10 })
  assert.strictEqual(Math.round(s.parts.reduce((n, p) => n + p.mb, 0)), 16000)
  assert.deepStrictEqual([s.activeMB, s.modifiedMB, s.standbyMB, s.freeMB], [11800, 200, 3000, 1000]); assert.strictEqual(s.loadPct, 75); assert.strictEqual(s.commitPct, 50)
  assert.strictEqual(memory.strata({ totalMB: 0 }), null); assert.strictEqual(memory.strata({ totalMB: 8000, availMB: 9000 }).loadPct, 0)
})
test('memory: modules map channels, empty slots and single-channel', () => {
  const m = memory.modules([{ slot: 'A', bank: 'Controller0ChannelADimm0', capGB: 8, ratedMT: 3200, runMT: 2400, type: 26 }], 2)
  assert.strictEqual(m.list[0].channel, 'A'); assert.ok(m.list[0].below); assert.strictEqual(m.empty, 1); assert.ok(m.singleChannel); assert.strictEqual(m.list[0].type, 'DDR4')
  assert.ok(!memory.modules([{ type: 37, capGB: 16, ratedMT: 5500, runMT: 5500 }], 2).singleChannel, 'LPDDR is soldered')
})

// ── live ──
test('live: a frame parses cores, package and memory; bad lines are dropped', () => {
  const line = 'JJCMLIVE:' + JSON.stringify({ t: 5, mem: { totalMB: 8000, avail: 2000, commit: 5000, limit: 9000, modified: 10, standby: 1500, free: 400, paged: 300, nonpaged: 200, reads: 12, compressed: 600 }, cpu: [['_Total', 120, 130, 3000, 0], ['0,0', 50, 130, 3000, 0], ['0,1', 5, 40, 900, 1]] })
  const f = live.parseLine(line, 2400)
  assert.strictEqual(f.cpu.total.util, 100); assert.strictEqual(f.cpu.total.mhz, Math.round(1.3 * 2400)); assert.deepStrictEqual(f.cpu.cores.map(c => [c.n, c.parked]), [[0, false], [1, true]]); assert.strictEqual(f.cpu.parkedCount, 1)
  assert.strictEqual(f.mem.compressedMB, 600); assert.strictEqual(live.parseLine('JJCMLIVE:{x', 1), null); assert.strictEqual(live.parseLine('hello', 1), null)
  const w = live.createWindow(3); for (let i = 0; i < 5; i++) w.push({ t: i }); assert.deepStrictEqual(w.frames().map(x => x.t), [2, 3, 4])
})
test('live: the poller only samples counters', () => {
  const s = live.buildScript()
  assert.ok(!/\b(Set-|Remove-|New-Item|Stop-|Start-Process)/.test(s.replace('Start-Sleep', '')))
})

// ── findings: every threshold ──
const frames = (n, mem, util = 10, mhz = 3000) => Array.from({ length: n }, (_, i) => ({ t: i, mem: { totalMB: 16000, availMB: 8000, committedMB: 8000, commitLimitMB: 24000, pageReads: 0, ...mem }, cpu: { total: { util, mhz } } }))
test('findings: live rules need ten frames and fire exactly at their named threshold', () => {
  const T = findings.T
  assert.deepStrictEqual(findings.live(frames(9, { availMB: 100 })), [])
  const ids = fr => findings.live(fr, { base: 3000 }).map(f => f.id)
  assert.ok(ids(frames(10, { availMB: 16000 * (1 - T.RAM_PRESSURE_PCT / 100) })).includes('ram-pressure'))
  assert.ok(!ids(frames(10, { availMB: 16000 * (1 - T.RAM_PRESSURE_PCT / 100) + 400 })).includes('ram-pressure'))
  assert.ok(ids(frames(10, { committedMB: 24000 * T.COMMIT_PRESSURE_PCT / 100 })).includes('commit-pressure'))
  assert.ok(ids(frames(10, { availMB: 16000 * 0.12, pageReads: T.FAULT_READS })).includes('hard-faults'))
  assert.ok(!ids(frames(10, { availMB: 16000 * 0.3, pageReads: T.FAULT_READS * 5 })).includes('hard-faults'), 'reads alone are not pressure')
  assert.ok(ids(frames(10, {}, T.CLOCK_HELD_LOAD, 3000 * T.CLOCK_HELD_RATIO)).includes('clock-held'))
  assert.ok(!ids(frames(10, {}, T.CLOCK_HELD_LOAD - 1, 500)).includes('clock-held'))
  assert.ok(findings.live(frames(10, {}), { cpuTemp: T.THERMAL_C }).some(f => f.id === 'thermal')); assert.ok(!findings.live(frames(10, {}), { cpuTemp: T.THERMAL_C - 1 }).some(f => f.id === 'thermal'))
  assert.ok(findings.live(frames(10, {}), { consumers: [{ name: 'a.exe', cpu: T.BG_HOG_CPU }] }).some(f => f.id === 'bg-hog'))
  assert.ok(!findings.live(frames(10, {}), { consumers: [{ name: 'game.exe', cpu: 90, game: true }] }).some(f => f.id === 'bg-hog'), 'a game is not a background hog')
})
test('findings: static rules only fire with their evidence, worst first', () => {
  const caps = { form: 'desktop', os: { win10Eol: true }, sec: { hvciRunning: true }, tools: { amd3dSvc: false }, cpu: { name: '14900K', vendor: 'intel', hybrid: true, raptorLakeDesktop: true, microcode: 0x129, hvciCostly: true, dualCcdX3d: false } }
  const mods = memory.modules([{ bank: 'ChannelA', capGB: 8, ratedMT: 3200, runMT: 2133, type: 26 }], 2)
  const ids = findings.statics({ caps, mods, status: {}, scheme: 'saver' }).map(f => f.id)
  for (const id of ['cpu-microcode', 'hybrid-win10', 'hvci-costly', 'power-saver', 'ram-below-rated', 'ram-single-channel']) assert.ok(ids.includes(id), id)
  assert.strictEqual(findings.statics({ caps, mods, status: {} })[0].id, 'cpu-microcode'); assert.strictEqual(findings.statics({ caps, mods, status: {} })[0].tone, 'bad')
  assert.strictEqual(findings.statics({ caps: { ...caps, cpu: { ...caps.cpu, microcode: 0x12F } }, mods: { list: [] }, status: {}, scheme: 'balanced' }).filter(f => f.id === 'cpu-microcode').length, 0)
  const x3d = { form: 'desktop', tools: { amd3dSvc: false }, cpu: { name: '7950X3D', vendor: 'amd', dualCcdX3d: true } }
  const a = findings.statics({ caps: x3d, mods: { list: [] }, status: { 'cpu-parking': 'on' }, scheme: 'balanced' }).map(f => f.id)
  assert.ok(a.includes('x3d-driver') && a.includes('x3d-steering-broken'))
  assert.deepStrictEqual(findings.statics({ caps: null, mods: { list: [] }, status: {} }), [], 'no evidence, no findings')
  assert.strictEqual(findings.schemeKind('381b4222-f694-41f0-9685-ff5bb260df2e'), 'balanced'); assert.strictEqual(findings.schemeKind(''), null)
})
test('findings: the microcode floor matches Auto-Optimize', () => {
  const src = fs.readFileSync(path.join(root, 'lib/auto-opti/findings.js'), 'utf8')
  assert.ok(src.includes('0x12F') && findings.T.MICROCODE_MIN === 0x12F && src.includes('0x12B') && findings.T.MICROCODE_HIGH === 0x12B)
})

// ── model ──
function liveFor(over = {}) { const r = {}; for (const q of detect.requests(detect.plan())) r[q.k] = q.a === 's' ? 'Automatic' : null; return detect.evaluate({ ...r, ...over }) }
test('model: one recommended rule, Premium rows lock for free users, retired shows only when applied', () => {
  const meta = { 'power-balanced-restore': { safetyTier: 1 }, 'cpu-parking': { safetyTier: 1 }, 'hvci-offload': { safetyTier: 3 }, 'pool-usage-max': { retired: 'ignored' } }
  const saver = liveFor({ 'x|scheme': 'a1841308-3541-4fab-bc81-f71556f20b4a' })
  const m = model.buildModel({ live: saver, remembered: {}, meta, applic: { 'cpu-parking': { show: true, state: 'recommended' } }, premium: false })
  assert.ok(m.recommendedIds.includes('power-balanced-restore'))
  assert.ok(!m.recommendedIds.includes('cpu-parking') && m.items.find(i => i.id === 'cpu-parking').locked, 'locked is never recommended')
  assert.ok(!m.items.some(i => i.id === 'pool-usage-max'))
  const p = model.buildModel({ live: saver, remembered: {}, meta, applic: { 'cpu-parking': { show: true, state: 'recommended' } }, premium: true })
  assert.ok(!p.items.find(i => i.id === 'cpu-parking').locked && p.items.find(i => i.id === 'cpu-parking').rec === false, 'reboot-needing switches are never in the batch')
  const m2 = model.buildModel({ live: saver, remembered: { 'pool-usage-max': 'applied' }, meta, applic: {} })
  assert.ok(m2.items.find(i => i.id === 'pool-usage-max' && i.retired && i.lane === 'retired'))
})
test('model: drift, restart and unread verdicts', () => {
  const m = model.buildModel({ live: liveFor({ 'p|SUB_PROCESSOR CPMINCORES': '0' }), remembered: { sysmain: 'applied', 'cpu-parking': 'applied' }, restart: ['cpu-parking'], meta: {}, applic: {}, premium: true })
  assert.deepStrictEqual(m.drifted, ['sysmain']); assert.deepStrictEqual(m.pendingRestart, ['cpu-parking']); assert.strictEqual(m.verdict.kind, 'attention')
  assert.strictEqual(model.buildModel({ live: null }).verdict.kind, 'unread')
  assert.deepStrictEqual(model.buildModel({ live: null, applic: { 'power-throttling': { show: true, state: 'recommended' } } }).recommendedIds, [], 'no recommendation without a reading')
  assert.ok(model.buildModel({ live: null }).items.every(i => i.status === 'unknown' || i.retired))
})

// ── actions ──
test('actions: consumers sum program instances and skip idle; purge reports before and after', () => {
  const out = ['JJCONS:chrome#1|40|900', 'JJCONS:chrome#2|20|500', 'JJCONS:game|80|3000', 'JJCONS:_Total|100|9000', 'JJCONS:Idle|300|0'].join('\n')
  const c = actions.parseConsumers(out, { cores: 4, games: ['game.exe'] })
  assert.deepStrictEqual(c.cpu.map(x => [x.name, x.cpu, x.game]), [['game', 20, true], ['chrome', 15, false]]); assert.strictEqual(c.ram[0].name, 'game'); assert.strictEqual(c.ram[1].mb, 1400)
  assert.deepStrictEqual(actions.parsePurge('x\nJJPURGE:{"before":2000,"after":300,"status":0}'), { ok: true, beforeMB: 2000, afterMB: 300, freedMB: 1700 })
  assert.strictEqual(actions.parsePurge('JJPURGE:{"before":1,"after":1,"status":3221225569}').ok, false); assert.strictEqual(actions.parsePurge('nope'), null)
  assert.deepStrictEqual(actions.parsePriorities('JJPRIO:{"a.exe":"3","b.exe":"6","c.exe":null}'), { 'a.exe': 'high', 'b.exe': 'above', 'c.exe': null })
})
