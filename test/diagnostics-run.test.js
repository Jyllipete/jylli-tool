'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const Diag = require('../lib/diagnostics')
const probes = require('../lib/diagnostics/probes')

const NOW = Date.UTC(2026, 10, 11, 12)
const out = o => 'JJDIAG:' + JSON.stringify(o)

// A fake PowerShell: answers each probe from a table keyed by a unique fragment of its script.
const ANSWERS = {
  Win32_ReliabilityStabilityMetrics: out({ idx: [{ t: NOW - 86400000, v: 9 }], rec: [] }),
  'Id=41,1001': out({ list: [], ok: true }),
  'Windows\\Minidump': out({ readable: true, list: [] }),
  'Get-PhysicalDisk': out({ disks: [{ n: 'A', media: 'SSD', bus: 'NVMe', health: 'Healthy', size: 1, wear: 3 }], predict: false, trimDisabled: 0, vols: [{ l: 'C', size: 1000, free: 600 }], sysDrive: 'C' }),
  BatteryStaticData: out({ present: false }),
  'ConfigManagerErrorCode <> 0': out({ list: [], ok: true }),
  Win32_PnPSignedDriver: out({ list: [], ok: true }),
  'Get-HotFix': out({ rebootPending: false, kbs: [{ kb: 'KB1', t: NOW - 86400000 }], wu: 'Manual', ok: true }),
  'Get-Tpm': out({ present: null, ready: null }),
  Win32_OperatingSystem: out({ totalKB: 8, freeKB: 4, commitPct: 40, ok: true }),
  'Get-NetRoute': out({ gw: { ip: '1.1.1.1', avg: 2, loss: 0 }, inet: { avg: 9, loss: 0 }, adapter: { name: 'E', mbps: 1000, wifi: false }, ok: true }),
  'Repair-WindowsImage -Online -CheckHealth': out({ dism: 'healthy', sfc: 'clean' }),
}

function harness(o = {}) {
  const log = [], files = { state: null }
  const deps = {
    now: () => NOW,
    cpuLoad: () => 5,
    runPS: async (script) => {
      log.push('ps')
      for (const [k, v] of Object.entries(ANSWERS)) if (script.includes(k)) return { ok: true, out: v }
      return { ok: true, out: '' }
    },
    runRecorded: async (control, action, meta, fn) => { log.push('rec:' + control); return fn(async (s) => { log.push('recps'); return { ok: true, out: '' } }) },
    createRestorePoint: async () => { log.push('rp'); return o.rp || { ok: true } },
    state: { read: () => files.state, write: v => { files.state = JSON.parse(JSON.stringify(v)) } },
    getCapsProfile: async () => o.noProfile ? null : { security: { firewallOn: true, defenderRtp: true, uac: 'on', windowsUpdate: 'ok' } },
    preflight: async () => { log.push('preflight'); return { osType: 'Stock', osLabel: 'Standard', tweakStates: { 'secure-boot-off': false }, conflictDetails: [], detections: [], safetyScore: 100 } },
    temps: async () => ({ cpuTemp: 50 }),
    journal: () => [],
    isGameRunning: () => !!o.game,
    isAdmin: () => true,
    thermalAudit: async () => { log.push('thermal'); return { severity: 'ok', throttlePct: 0, avgTempC: 60 } },
    ramStress: async () => { log.push('ram'); return { passed: true, errors: 0, passes: 3 } },
    runtimes: async () => ({ missing: [] }),
    installRuntimes: async () => ({ ok: true }),
    benchDir: fs.mkdtempSync(path.join(os.tmpdir(), 'jt-diag-')),
  }
  return { svc: Diag.create(deps), deps, log, files }
}

test('quick scan: every probe reports, the report is saved, history has one row', async () => {
  const h = harness(), ev = []
  const r = await h.svc.scan({ mode: 'quick', onProgress: e => ev.push(e) })
  assert.ok(r.ok, JSON.stringify(r))
  const quickIds = probes.forMode('quick').map(p => p.id)
  for (const id of [...quickIds, 'profile', 'preflight', 'temps']) assert.ok(id in r.report.probes, id)
  assert.ok(!('health' in r.report.probes))
  assert.ok(r.report.score >= 90, String(r.report.score))
  assert.strictEqual(r.report.mode, 'quick')
  assert.strictEqual(h.files.state.history.length, 1)
  assert.ok(ev.some(e => e.state === 'done' && e.subs.includes('storage')))
  const last = ev.filter(e => e.state === 'done' || e.state === 'fail').pop()
  assert.strictEqual(last.done, last.total)
})

test('a probe that fails is "not measured", the rest still grade', async () => {
  const h = harness()
  const real = h.deps.runPS
  h.deps.runPS = async s => s.includes('Get-PhysicalDisk') ? { ok: false, err: 'boom' } : real(s)
  const r = await h.svc.scan({ mode: 'quick' })
  assert.strictEqual(r.report.probes.storage.ok, false)
  assert.strictEqual(r.report.grades.storage, null)
  assert.ok(r.report.grades.stability != null)
})

test('no caps profile: the arcs that need it stay unmeasured, the scan does not fail', async () => {
  const r = await harness({ noProfile: true }).svc.scan({ mode: 'quick' })
  assert.ok(r.ok); assert.strictEqual(r.report.probes.profile.ok, false)
})

test('deep scan adds health, thermal and ram, and runs the load tests last and alone', async () => {
  const h = harness()
  const r = await h.svc.scan({ mode: 'deep' })
  for (const id of ['health', 'thermal', 'ram']) assert.ok(r.report.probes[id].ok, id)
  assert.deepStrictEqual(h.log.filter(x => x === 'thermal' || x === 'ram'), ['thermal', 'ram'])
  assert.ok(h.log.lastIndexOf('ps') < h.log.indexOf('thermal'))
})

test('opts.skip leaves Pro probes out and says so', async () => {
  const h = harness()
  const r = await h.svc.scan({ mode: 'deep', skip: ['thermal', 'ram'] })
  assert.strictEqual(r.report.probes.thermal.error, 'skipped')
  assert.ok(!h.log.includes('thermal'))
})

test('a second scan while one runs is refused; abort stops without saving', async () => {
  const h = harness()
  let release
  h.deps.getCapsProfile = () => new Promise(res => { release = () => res({}) })
  const p = h.svc.scan({ mode: 'quick' })
  while (!release) await new Promise(r => setTimeout(r, 5))
  assert.deepStrictEqual(await h.svc.scan({ mode: 'quick' }), { ok: false, error: 'busy' })
  h.svc.abort(); release()
  const r = await p
  assert.strictEqual(r.aborted, true)
  assert.strictEqual(h.files.state && h.files.state.last, null)
})

test('the pre-flight result is reused for six hours in quick mode, never in deep mode', async () => {
  const h = harness()
  await h.svc.scan({ mode: 'quick' })
  h.log.length = 0
  await h.svc.scan({ mode: 'quick' })
  assert.ok(!h.log.includes('preflight'))
  await h.svc.scan({ mode: 'deep' })
  assert.ok(h.log.includes('preflight'))
})

test('history keeps the last 20 checkups', async () => {
  const h = harness()
  for (let i = 0; i < 23; i++) await h.svc.scan({ mode: 'quick' })
  assert.strictEqual(h.files.state.history.length, Diag.MAX_HISTORY)
})

test('the second report carries a diff against the first', async () => {
  const h = harness()
  await h.svc.scan({ mode: 'quick' })
  const real = h.deps.runPS
  h.deps.runPS = async s => s.includes('Get-PhysicalDisk') ? { ok: true, out: out({ disks: [{ n: 'A', media: 'SSD', bus: 'NVMe', health: 'Healthy' }], predict: true, trimDisabled: 0, vols: [{ l: 'C', size: 1000, free: 600 }], sysDrive: 'C' }) } : real(s)
  const r = await h.svc.scan({ mode: 'quick' })
  assert.ok(r.diff.score < 0); assert.deepStrictEqual(r.diff.appeared, ['disk-smart-fail'])
})

// ── repairs ──────────────────────────────────────────────────────────────────────
test('fix: unknown ids never run anything', async () => {
  const h = harness()
  assert.deepStrictEqual(await h.svc.fix({ id: 'format-c' }), { ok: false, error: 'unknown' })
  assert.deepStrictEqual(h.log, [])
})

test('fix: restore point first, then the journaled run', async () => {
  const h = harness(), ev = []
  const r = await h.svc.fix({ id: 'restore-pagefile' }, e => ev.push(e.phase))
  assert.ok(r.ok); assert.strictEqual(r.restart, true)
  assert.deepStrictEqual(h.log, ['rp', 'rec:diag:restore-pagefile', 'recps'])
  assert.deepStrictEqual(ev, ['rp', 'run', 'done'])
})

test('fix: a failed restore point stops the repair before it changes anything', async () => {
  const h = harness({ rp: { ok: false, reason: 'disabled' } })
  const r = await h.svc.fix({ id: 'dism-sfc' })
  assert.strictEqual(r.ok, false); assert.strictEqual(r.aborted, true); assert.strictEqual(r.reason, 'disabled')
  assert.ok(!h.log.some(x => x.startsWith('rec:')))
})

test('fix: a safe repair makes no restore point', async () => {
  const h = harness()
  assert.ok((await h.svc.fix({ id: 'enable-trim' })).ok)
  assert.ok(!h.log.includes('rp'))
})

test('fix: runtimes installs only what the caller names', async () => {
  const h = harness(); let got = null
  h.deps.installRuntimes = async ids => { got = ids; return { ok: true } }
  assert.ok((await h.svc.fix({ id: 'runtimes', missing: ['vcredist', 5, 'dotnet'] })).ok)
  assert.deepStrictEqual(got, ['vcredist', 'dotnet'])
  assert.strictEqual((await h.svc.fix({ id: 'runtimes', missing: [] })).ok, false)
})

test('repairMeta describes risk without running anything', () => {
  const h = harness()
  assert.strictEqual(h.svc.repairMeta('dism-sfc').rp, true)
  assert.strictEqual(h.svc.repairMeta('nope'), null)
})

// ── benchmarks ───────────────────────────────────────────────────────────────────
test('bench: runs small, stores the run, pins the first as baseline, deletes the temp file', async () => {
  const h = harness()
  const r = await h.svc.bench(['cpu1', 'mem', 'disk'], () => {}, { scale: 0.02, runs: 1 })
  assert.ok(r.ok, JSON.stringify(r))
  assert.ok(r.run.points.cpu1 > 0 && r.run.points.mem > 0 && r.run.points.disk > 0)
  assert.strictEqual(r.baseline.ts, r.run.ts)
  assert.ok(!fs.existsSync(path.join(h.deps.benchDir, 'jt_bench.tmp')))
  const r2 = await h.svc.bench(['cpu1'], () => {}, { scale: 0.02, runs: 1 })
  assert.strictEqual(r2.runs.length, 2); assert.strictEqual(r2.baseline.ts, r.run.ts)
  assert.strictEqual(h.svc.benchBaseline({ pin: true }).baseline.ts, r2.run.ts)
  assert.strictEqual(h.svc.benchBaseline({ reset: true }).baseline, null)
})

test('bench: refuses under a running game', async () => {
  assert.deepStrictEqual(await harness({ game: true }).svc.bench(['cpu1']), { ok: false, error: 'game-running' })
})

test('bench: the temp file is gone after an abort', async () => {
  const h = harness()
  const p = h.svc.bench(['disk'], () => {}, { scale: 0.5, runs: 1 })
  await new Promise(r => setTimeout(r, 30))
  h.svc.abort()
  const r = await p
  assert.ok(r.ok === false || r.ok === true)
  assert.ok(!fs.existsSync(path.join(h.deps.benchDir, 'jt_bench.tmp')))
})
