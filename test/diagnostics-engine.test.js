'use strict'
const test = require('node:test')
const assert = require('node:assert')
const probes = require('../lib/diagnostics/probes')
const bug = require('../lib/diagnostics/bugchecks')
const inc = require('../lib/diagnostics/incidents')
const causes = require('../lib/diagnostics/causes')
const grade = require('../lib/diagnostics/grade')
const findings = require('../lib/diagnostics/findings')
const model = require('../lib/diagnostics/model')

const H = 3600 * 1000, D = 24 * H
const NOW = Date.UTC(2026, 10, 11, 12)
const line = o => 'noise\nJJDIAG:' + JSON.stringify(o) + '\n'

// ── probes: parse real-shaped output, never invent data ────────────────────────────
test('every probe has an id, and a script or run()', () => {
  const ids = new Set()
  for (const p of probes.PROBES) {
    assert.ok(!ids.has(p.id)); ids.add(p.id)
    assert.ok(p.run || (typeof p.script === 'string' && typeof p.parse === 'function'), p.id)
    if (p.script) assert.ok(p.script.includes("'JJDIAG:'"), p.id + ' prints the marker')
  }
})

test('parse returns null for output without the marker or with broken JSON', () => {
  for (const p of probes.PROBES.filter(x => x.parse)) {
    assert.strictEqual(p.parse(''), null, p.id)
    assert.strictEqual(p.parse('JJDIAG:{nope'), null, p.id)
  }
})

test('quick mode leaves out the deep probes', () => {
  const q = probes.forMode('quick').map(p => p.id), d = probes.forMode('deep').map(p => p.id)
  for (const id of ['health', 'thermal', 'ram']) { assert.ok(!q.includes(id)); assert.ok(d.includes(id)) }
})

test('storage parse keeps unknown numbers null (not 0)', () => {
  const s = probes.byId.storage.parse(line({ disks: [{ n: 'NVMe', media: 'SSD', bus: 'NVMe', health: 'Healthy', size: 5e11, wear: null, temp: 41 }], predict: null, trimDisabled: 0, vols: [{ l: 'C', size: 5e11, free: 1e11 }], sysDrive: 'C' }))
  assert.strictEqual(s.disks[0].wear, null)
  assert.strictEqual(s.predict, null)
  assert.strictEqual(s.trimDisabled, 0)
})

test('net parse: a router that drops ICMP is not 100% loss when the internet answers', () => {
  const s = probes.byId.net.parse(line({ gw: { ip: '192.168.1.1', avg: null, loss: 100 }, inet: { avg: 12, loss: 0 }, adapter: { name: 'Ethernet', mbps: 1000, wifi: false }, ok: true }))
  assert.strictEqual(s.gw, null)
  assert.strictEqual(s.inet.loss, 0)
})

test('minidumps probe is "not measured" when the folder exists but cannot be read', () => {
  assert.strictEqual(probes.byId.minidumps.parse(line({ readable: false, list: [] })), null)
  assert.deepStrictEqual(probes.byId.minidumps.parse(line({ readable: true, list: [] })), { list: [] })
})

// ── bug checks ───────────────────────────────────────────────────────────────────
test('bug check codes normalise and classify', () => {
  assert.strictEqual(bug.norm('0x000000D1'), 'd1')
  assert.strictEqual(bug.norm('0x0000000a'), 'a')
  assert.strictEqual(bug.norm('zz'), null)
  assert.strictEqual(bug.lookup('0x124').cause, 'overclock')
  assert.deepStrictEqual(bug.lookup('0xfffff'), { code: 'fffff', name: null, cause: 'unknown' })
  assert.strictEqual(bug.fromMessage('The computer has rebooted from a bugcheck.  The bugcheck was: 0x00000116 (0xffff, 0x1, 0x0, 0x2).').name, 'VIDEO_TDR_FAILURE')
})

test('every table entry has a name and a known cause class', () => {
  const ok = new Set(['driver', 'memory', 'storage', 'power', 'thermal', 'software', 'hardware', 'overclock'])
  for (const [k, v] of Object.entries(bug.TABLE)) { assert.ok(/^[0-9a-f]+$/.test(k) && v.name && ok.has(v.cause), k) }
})

// ── incidents ────────────────────────────────────────────────────────────────────
const crashData = () => ({
  events: { list: [
    { t: NOW - 5 * H, id: 1001, p: 'Microsoft-Windows-WER-SystemErrorReporting', m: 'The bugcheck was: 0x00000116 (0x1)' },
    { t: NOW - 5 * H + 30000, id: 1001, p: 'Microsoft-Windows-WER-SystemErrorReporting', m: 'The bugcheck was: 0x00000116 (0x1)' },
    { t: NOW - 5 * H - 60000, id: 41, p: 'Microsoft-Windows-Kernel-Power', m: '' },
    { t: NOW - 3 * H, id: 4101, p: 'Display', m: '' },
    { t: NOW - 2 * H, id: 17, p: 'Microsoft-Windows-WHEA-Logger', m: '' },
    { t: NOW - 20 * D, id: 153, p: 'disk', m: '' },
    { t: NOW - 1 * H, id: 1234, p: 'Other', m: '' },
  ] },
  reliability: { idx: [{ t: NOW - 2 * D, v: 3.2 }, { t: NOW - 1 * D, v: 4.1 }], rec: [{ t: NOW - 3 * H, src: 'Application Error', id: 1000, p: 'game.exe', m: '' }] },
  minidumps: { list: [{ t: NOW - 5 * H + 120000, n: '111126-1.dmp', size: 1 }] },
})

test('normalize: dedupes repeats, drops unknown events, folds a minidump into its bugcheck', () => {
  const l = inc.normalize(crashData())
  const bc = l.filter(i => i.kind === 'bugcheck')
  assert.strictEqual(bc.length, 1)
  assert.strictEqual(bc[0].n, 2)
  assert.strictEqual(bc[0].code, '116')
  assert.strictEqual(bc[0].file, '111126-1.dmp')
  assert.ok(l.some(i => i.kind === 'power-loss') && l.some(i => i.kind === 'gpu-reset') && l.some(i => i.kind === 'whea') && l.some(i => i.kind === 'disk') && l.some(i => i.kind === 'app-crash'))
  assert.ok(!l.some(i => i.code === '1234'))
})

test('a lone minidump with no matching event is still an incident', () => {
  const l = inc.normalize({ minidumps: { list: [{ t: NOW, n: 'x.dmp' }] } })
  assert.strictEqual(l.length, 1); assert.strictEqual(l[0].kind, 'bugcheck')
})

test('cluster groups by gap and reports the worst severity', () => {
  const c = inc.cluster(inc.normalize(crashData()))
  assert.strictEqual(c.length, 2)                    // the 20-day-old disk event is on its own
  assert.strictEqual(c[1].worst, 'critical')
})

test('summarize counts serious incidents inside the window only', () => {
  const s = inc.summarize(inc.normalize(crashData()), NOW, 30)
  assert.strictEqual(s.by.bugcheck, 2)
  assert.strictEqual(s.by['app-crash'], 1)
  assert.strictEqual(s.serious, 5)
  assert.ok(s.last7 >= 4)
  assert.strictEqual(inc.summarize([], NOW).serious, 0)
})

// ── causes ───────────────────────────────────────────────────────────────────────
test('a driver installed hours before the crashes is blamed, an old one is not', () => {
  const list = inc.normalize(crashData())
  const r = causes.rank([{ ts: NOW - 9 * H, kind: 'driver', label: 'GeForce 566.14' }, { ts: NOW - 25 * D, kind: 'driver', label: 'Old audio' }], list)
  assert.strictEqual(r.length, 1)
  assert.strictEqual(r[0].change.label, 'GeForce 566.14')
  assert.ok(['medium', 'high'].includes(r[0].confidence))
})

test('no blame when the PC was already crashing as often before the change', () => {
  const list = [0, 1, 2, 3].map(i => ({ ts: NOW - (30 - i) * H, kind: 'bugcheck', severity: 'critical', cause: 'driver', n: 1 })).concat([{ ts: NOW - 5 * H, kind: 'bugcheck', severity: 'critical', cause: 'driver', n: 1 }])
  assert.deepStrictEqual(causes.rank([{ ts: NOW - 40 * H, kind: 'driver', label: 'x' }, { ts: NOW - 20 * H, kind: 'tweak', label: 'y' }], list).filter(c => c.change.label === 'y'), [])
})

test('no incidents, no suspects', () => { assert.deepStrictEqual(causes.rank([{ ts: NOW, kind: 'driver', label: 'x' }], []), []) })

// ── grade ────────────────────────────────────────────────────────────────────────
test('a subsystem that was not measured has no grade, and does not count', () => {
  const g = grade.grades({ storage: 3 }, [{ subsystem: 'storage', penalty: 30 }])
  assert.strictEqual(g.storage, 70); assert.strictEqual(g.stability, null)
  const o = grade.overall({ ...g })
  assert.strictEqual(o.score, 70); assert.ok(o.missing.includes('stability'))
  assert.strictEqual(grade.overall(grade.grades({}, [])).score, null)
})

test('one failing subsystem caps the headline score', () => {
  const g = { stability: 100, storage: 15, memory: 100, cpu: 100, gpu: 100, drivers: 100, windows: 100, security: 100, network: 100, config: 100 }
  assert.ok(grade.overall(g).score <= 45)
})

test('tone thresholds match the hero', () => {
  assert.deepStrictEqual([80, 79, 50, 49, null].map(grade.tone), ['ok', 'warn', 'warn', 'danger', 'idle'])
})

// ── findings ─────────────────────────────────────────────────────────────────────
test('rule ids are unique, every rule has a subsystem the grade knows', () => {
  const ids = new Set()
  for (const r of findings.RULES) { assert.ok(!ids.has(r.id), r.id); ids.add(r.id); assert.ok(grade.SUBSYSTEMS.includes(r.sub), r.id); assert.strictEqual(typeof r.needs, 'function'); assert.strictEqual(typeof r.test, 'function') }
})

test('empty model: nothing measured, nothing found', () => {
  const r = findings.evaluate({ data: {} })
  assert.deepStrictEqual(r.findings, []); assert.deepStrictEqual(r.measured, {})
})

test('a rule whose data is missing is not a pass', () => {
  const r = findings.evaluate({ data: { storage: { disks: [], vols: [{ l: 'C', size: 100, free: 50 }], sysDrive: 'C' } } })
  assert.ok(r.passed.some(p => p.id === 'disk-low'))
  assert.ok(!r.passed.some(p => p.id === 'disk-smart-fail'))
})

test('storage rules fire on evidence', () => {
  const m = { data: { storage: { disks: [{ n: 'A', media: 'SSD', bus: 'NVMe', health: 'Healthy', wear: 92, temp: 75, rerr: 0, werr: 3 }], predict: true, trimDisabled: 1, vols: [{ l: 'C', size: 1000, free: 40 }], sysDrive: 'C' } } }
  const ids = findings.evaluate(m).findings.map(f => f.id)
  for (const id of ['disk-smart-fail', 'disk-wear', 'disk-errors', 'disk-hot', 'disk-low', 'trim-off']) assert.ok(ids.includes(id), id)
  assert.strictEqual(findings.evaluate(m).findings[0].severity, 'critical')
})

test('stability rules read the incident summary', () => {
  const list = inc.normalize(crashData())
  const r = findings.evaluate({ data: crashData(), incidents: list, incidentSummary: inc.summarize(list, NOW), causes: [], takenAt: NOW })
  const ids = r.findings.map(f => f.id)
  for (const id of ['crash-bugcheck', 'crash-power-loss', 'crash-whea', 'crash-gpu-reset', 'stability-index']) assert.ok(ids.includes(id), id)
})

test('driver and security rules', () => {
  const m = { takenAt: NOW, data: { devices: { list: [{ n: 'Unknown device', code: 43, cls: 'USB' }] }, drivers: { list: [{ n: 'Old NIC', t: NOW - 700 * D, cls: 'NET' }] }, runtimes: { missing: ['vcredist'] } },
    profile: { security: { firewallOn: false, defenderRtp: false, thirdPartyAv: [], uac: 'on', windowsUpdate: 'disabled' } } }
  const ids = findings.evaluate(m).findings.map(f => f.id)
  for (const id of ['device-problem', 'driver-old', 'runtimes-missing', 'shield-firewall', 'shield-defender', 'shield-update']) assert.ok(ids.includes(id), id)
  assert.ok(!ids.includes('shield-uac'))
})

test('every fix points at a repair that exists, or a known kind', () => {
  const repair = require('../lib/diagnostics/repair')
  const m = { takenAt: NOW, data: { storage: { disks: [{ n: 'A', media: 'SSD', bus: 'NVMe', health: 'Healthy' }], trimDisabled: 1, vols: [] }, memory: { commitPct: 97, memdiag: { ok: false } }, updates: { rebootPending: true, lastKbTs: NOW - 200 * D }, health: { dism: 'corrupted', sfc: 'corrupt' }, ram: { passed: false, errors: 2 }, runtimes: { missing: ['x'] } },
    profile: { storage: { pagefileDisabled: true }, security: { firewallOn: false, windowsUpdate: 'disabled' } } }
  const f = findings.evaluate(m).findings.filter(x => x.fix)
  assert.ok(f.length >= 8)
  for (const x of f) {
    assert.ok(['repair', 'tweak', 'jump', 'view', 'external', 'undo'].includes(x.fix.kind), x.id)
    if (x.fix.kind === 'repair') assert.ok(repair.get(x.fix.id), x.id + ' -> ' + x.fix.id)
  }
})

// ── report ───────────────────────────────────────────────────────────────────────
const healthy = () => ({ mode: 'quick', takenAt: NOW, ms: 1, probes: {}, journal: [], data: {
  storage: { disks: [{ n: 'A', media: 'SSD', bus: 'NVMe', health: 'Healthy', wear: 5, temp: 40, rerr: 0, werr: 0 }], predict: false, trimDisabled: 0, vols: [{ l: 'C', size: 1000, free: 500 }], sysDrive: 'C' },
  events: { list: [] }, reliability: { idx: [{ t: NOW - D, v: 9.5 }], rec: [] }, memory: { totalKB: 1, freeKB: 1, commitPct: 40, memdiag: null }, net: { gw: { avg: 2, loss: 0 }, inet: { avg: 10, loss: 0 }, adapter: { name: 'E', mbps: 1000, wifi: false } },
} })

test('a healthy PC scores high and lists what passed', () => {
  const r = model.buildReport(healthy())
  assert.ok(r.score >= 95, String(r.score))
  assert.strictEqual(r.stats.findings, 0)
  assert.ok(r.stats.passed >= 8)
  assert.strictEqual(r.grades.gpu, null)                      // nothing measured for gpu
  assert.ok(r.missing.includes('gpu'))
  assert.strictEqual(r.tone, 'ok')
})

test('a crashing PC with a dying disk scores low and blames the driver', () => {
  const h = healthy()
  Object.assign(h.data, crashData(), { drivers: { list: [{ n: 'GeForce', v: '566.14', t: NOW - 9 * H, cls: 'DISPLAY' }] } })
  h.data.storage.predict = true
  const r = model.buildReport(h)
  assert.ok(r.score < 50, String(r.score))
  assert.strictEqual(r.findings[0].severity, 'critical')
  assert.ok(r.findings.some(f => f.id === 'suspect-change'))
  assert.ok(r.index.length >= 1)
})

test('buildReport is deterministic and has no undefined holes in JSON', () => {
  const a = JSON.stringify(model.buildReport(healthy())), b = JSON.stringify(model.buildReport(healthy()))
  assert.strictEqual(a, b)
})

test('diff reports grade deltas and findings that appeared or went away', () => {
  const a = model.buildReport(healthy())
  const h = healthy(); h.data.storage.predict = true
  const b = model.buildReport(h)
  const d = model.diff(model.historyRow(a), b)
  assert.ok(d.score < 0); assert.ok(d.deltas.storage < 0); assert.deepStrictEqual(d.appeared, ['disk-smart-fail'])
  assert.deepStrictEqual(model.diff(model.historyRow(b), a).resolved, ['disk-smart-fail'])
  assert.strictEqual(model.diff(null, a), null)
})

test('journal entries become tweak changes, undone ones do not', () => {
  const c = model.collectChanges({ takenAt: NOW, data: {}, journal: [{ id: 'a', ts: NOW - H, action: 'apply', tweakId: 'hpet' }, { id: 'b', ts: NOW - H, action: 'apply', tweakId: 'x', undoneBy: 'u' }, { id: 'c', ts: NOW - H, action: 'restore', tweakId: 'y' }] })
  assert.deepStrictEqual(c.map(x => x.id), ['hpet'])
})
