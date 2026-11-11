const test = require('node:test')
const assert = require('node:assert')
const D = require('../lib/debloat')
const catalog = require('../lib/debloat/catalog')
const probe = require('../lib/debloat/probe')

const now = Date.UTC(2026, 10, 11, 12)
const snapJson = (over = {}) => probe.MARK + JSON.stringify({
  appx: [{ n: 'Microsoft.BingNews', f: 'Microsoft.BingNews_8wekyb3d8bbwe', sz: 1000 }, { n: 'Microsoft.WindowsStore', f: 's', sz: 1 }],
  prov: ['Microsoft.BingNews'],
  svc: { DiagTrack: { st: 'Running', sm: 'Auto', sh: 1, ws: 5000 } },
  tasks: [{ p: '\\Microsoft\\Windows\\Maps\\', n: 'MapsUpdateTask', s: 'Ready', nx: now + 3600000, rep: '' }],
  reg: {}, feat: {}, procs: {}, lastRun: {}, facts: { printers: 0, build: 26200, ubr: 1 }, ...over,
})

function harness(o = {}) {
  const calls = [], notes = [], store = { v: null }
  let probeOut = o.probe || snapJson()
  const deps = {
    now: () => now,
    state: { read: () => store.v, write: v => { store.v = JSON.parse(JSON.stringify(v)) } },
    runPS: async (script) => {
      calls.push(['ps', script])
      if (script.includes(probe.MARK)) return { ok: true, out: probeOut }
      if (script.includes('Remove-AppxPackage')) return { ok: true, out: o.appxFail ? 'JJFAIL' : 'JJOK' }
      if (script.includes('Disable-WindowsOptionalFeature')) return { ok: true, out: 'JJRESTART\nJJOK' }
      return { ok: true, out: '' }
    },
    runRecorded: async (control, action, meta, fn) => {
      calls.push(['rec', control, meta.batchId])
      return fn(async s => { calls.push(['recps', s]); return { ok: !o.recFail, out: '', err: o.recFail ? 'denied' : '' } }, null, c => notes.push(c))
    },
    createRestorePoint: async () => { calls.push(['rp']); return o.rp || { ok: true } },
  }
  const svc = D.create(deps)
  return { svc, calls, notes, store, setProbe: p => { probeOut = p } }
}

test('plan: order is ads, tasks, services, features, apps; shield drops protected; unknown and absent ids are reported', () => {
  const present = new Set(['app:Microsoft.BingNews', 'svc:DiagTrack', 'task:mapsupdatetask', 'app:Microsoft.WindowsStore'])
  const p = D.run.plan(['app:Microsoft.BingNews', 'svc:DiagTrack', 'task:mapsupdatetask', 'app:Microsoft.WindowsStore', 'nope', 'svc:Fax'], { present })
  assert.deepStrictEqual(p.items.map(i => i.id), ['task:mapsupdatetask', 'svc:DiagTrack', 'app:Microsoft.BingNews'])
  assert.deepStrictEqual(p.skipped.map(s => s.reason).sort(), ['not-present', 'protected', 'unknown'])
})

test('run without a scan is refused', async () => {
  const h = harness()
  assert.strictEqual((await h.svc.run({ ids: ['svc:DiagTrack'] })).error, 'scan-first')
})

test('run: restore point first for apps, then journaled items in order, receipt measured by a rescan', async () => {
  const h = harness()
  await h.svc.scan()
  h.setProbe(snapJson({ appx: [{ n: 'Microsoft.WindowsStore', f: 's', sz: 1 }], svc: { DiagTrack: { st: 'Stopped', sm: 'Disabled', sh: 1, ws: 0 } } }))
  const events = []
  const r = await h.svc.run({ ids: ['app:Microsoft.BingNews', 'svc:DiagTrack'], onProgress: e => events.push(e.phase + ':' + (e.id || '')) })
  assert.ok(r.ok)
  assert.deepStrictEqual(events, ['rp:', 'start:svc:DiagTrack', 'done:svc:DiagTrack', 'start:app:Microsoft.BingNews', 'done:app:Microsoft.BingNews'])
  assert.strictEqual(h.calls.findIndex(c => c[0] === 'rp'), h.calls.findIndex(c => c[0] === 'rp'))
  assert.ok(h.calls.findIndex(c => c[0] === 'rp') < h.calls.findIndex(c => c[0] === 'rec'))
  const batch = new Set(h.calls.filter(c => c[0] === 'rec').map(c => c[2]))
  assert.strictEqual(batch.size, 1)
  assert.deepStrictEqual(r.receipt.rows.map(x => x.ok), [true, true])
  assert.deepStrictEqual(r.receipt.delta.disk, [1000, 0])
  assert.deepStrictEqual(r.receipt.delta.ram, [5000, 0])
  assert.deepStrictEqual(r.receipt.counts, { apps: 1, services: 1, tasks: 0, ads: 0, features: 0 })
  const n = h.notes.find(x => x.kind === 'appx')
  assert.strictEqual(n.family, 'Microsoft.BingNews_8wekyb3d8bbwe')
  assert.strictEqual(n.deprovisioned, true)
  assert.ok(h.calls.some(c => c[0] === 'ps' && c[1].includes('Remove-AppxProvisionedPackage')))
  assert.ok(h.calls.some(c => c[0] === 'recps' && c[1].includes("Set-Service -Name 'DiagTrack' -StartupType Disabled")))
})

test('run: deprovision off leaves the package staged (offline way back)', async () => {
  const h = harness()
  await h.svc.scan()
  await h.svc.run({ ids: ['app:Microsoft.BingNews'], deprovision: false })
  assert.ok(!h.calls.some(c => c[0] === 'ps' && c[1].includes('Remove-AppxProvisionedPackage -Online')))
  assert.strictEqual(h.notes.find(x => x.kind === 'appx').deprovisioned, false)
})

test('run: a failed restore point stops everything', async () => {
  const h = harness({ rp: { ok: false, reason: 'rp-off', guidance: 'enable it' } })
  await h.svc.scan()
  const r = await h.svc.run({ ids: ['app:Microsoft.BingNews'] })
  assert.strictEqual(r.ok, false); assert.ok(r.aborted); assert.strictEqual(r.reason, 'rp-off')
  assert.ok(!h.calls.some(c => c[0] === 'rec'))
})

test('run: only reversible items need no restore point', async () => {
  const h = harness()
  await h.svc.scan()
  await h.svc.run({ ids: ['svc:DiagTrack', 'task:mapsupdatetask'] })
  assert.ok(!h.calls.some(c => c[0] === 'rp'))
})

test('run: a failing item is in the receipt and is not remembered for Guard', async () => {
  const h = harness({ appxFail: true })
  await h.svc.scan()
  const r = await h.svc.run({ ids: ['app:Microsoft.BingNews'] })
  assert.strictEqual(r.receipt.rows[0].ok, false)
  assert.deepStrictEqual(r.receipt.failed, ['app:Microsoft.BingNews'])
  assert.deepStrictEqual(h.store.v.removed, {})
})

test('run: a rejected journaled write is a failure, not a success', async () => {
  const h = harness({ recFail: true })
  await h.svc.scan()
  const r = await h.svc.run({ ids: ['svc:DiagTrack'] })
  assert.strictEqual(r.receipt.rows[0].ok, false)
})

test('run: abort stops before the next item', async () => {
  const h = harness()
  await h.svc.scan()
  const r = await h.svc.run({ ids: ['svc:DiagTrack', 'task:mapsupdatetask'], onProgress: e => { if (e.phase === 'done') h.svc.abort() } })
  assert.ok(r.receipt.aborted)
  assert.strictEqual(r.receipt.rows.length, 1)
})

test('run: a second run while one is active is busy', async () => {
  const h = harness()
  await h.svc.scan()
  const a = h.svc.run({ ids: ['svc:DiagTrack'] })
  assert.strictEqual((await h.svc.run({ ids: ['svc:DiagTrack'] })).error, 'busy')
  await a
})

test('guard: what was removed and is on again is drift; forget clears it', async () => {
  const h = harness()
  await h.svc.scan()
  await h.svc.run({ ids: ['svc:DiagTrack'] })
  assert.ok('svc:DiagTrack' in h.store.v.removed)
  // the rescan inside run already saw the service as still enabled (the fake probe did not change), which is exactly drift
  const s = await h.svc.scan()
  assert.deepStrictEqual(s.drift.map(d => d.id), ['svc:DiagTrack'])
  h.svc.forget(['svc:DiagTrack'])
  assert.deepStrictEqual(h.svc.drift().map(d => d.id), [])
})

test('guard: osChanged and due', () => {
  const g = D.guard
  assert.ok(g.osChanged({ build: 26100, ubr: 1 }, { build: 26200, ubr: 1 }))
  assert.ok(g.osChanged({ build: 26200, ubr: 1 }, { build: 26200, ubr: 2 }))
  assert.ok(!g.osChanged({ build: 26200, ubr: 1 }, { build: 26200, ubr: 1 }))
  assert.ok(!g.due({ mode: 'off' }, null, { build: 1 }, now))
  assert.ok(g.due({ mode: 'update' }, { build: 26200, ubr: 1, at: now - 1000 }, { build: 26200, ubr: 2 }, now))
  assert.ok(!g.due({ mode: 'update' }, { build: 26200, ubr: 1, at: now - 1000 }, { build: 26200, ubr: 1 }, now))
  assert.ok(g.due({ mode: 'update' }, { build: 26200, ubr: 1, at: now - 8 * 86400000 }, { build: 26200, ubr: 1 }, now))
})

test('guardCheck quiet mode re-applies drift', async () => {
  const h = harness()
  await h.svc.scan(); await h.svc.run({ ids: ['svc:DiagTrack'] })
  h.svc.setGuard('quiet')
  const r = await h.svc.guardCheck({ build: 26200, ubr: 99 })
  assert.ok(r.ran); assert.strictEqual(r.drift.length, 1); assert.strictEqual(r.reapplied, 1)
})

test('prefs: intents are stored as booleans for known intents only', () => {
  const h = harness()
  const p = h.svc.setPrefs({ intents: { gaming: 1, bogus: true }, shield: false })
  assert.strictEqual(p.intents.gaming, true); assert.ok(!('bogus' in p.intents)); assert.strictEqual(p.shield, false)
  assert.strictEqual(h.svc.setPrefs({ intents: null }).intents, null)
})

test('wayback: present, offline register, store deep link, none', async () => {
  const opened = []
  let installed = false, register = false
  const wb = D.wayback.create({
    runPS: async s => { if (s.includes('Add-AppxPackage')) { installed = register; return { ok: true, out: '' } } return { ok: true, out: installed ? 'JJYES' : 'JJNO' } },
    openExternal: u => opened.push(u),
  })
  assert.deepStrictEqual(await wb.restoreApp({ pkg: 'Microsoft.BingNews', family: 'Microsoft.BingNews_8wekyb3d8bbwe' }), { ok: false, how: 'store' })
  assert.ok(opened[0].startsWith('ms-windows-store://pdp/?PFN='))
  register = true
  assert.deepStrictEqual(await wb.restoreApp({ pkg: 'Microsoft.BingNews', family: 'Microsoft.BingNews_8wekyb3d8bbwe' }), { ok: true, how: 'offline' })
  assert.deepStrictEqual(await wb.restoreApp({ pkg: 'Microsoft.BingNews', family: 'x' }), { ok: true, how: 'present' })
  assert.deepStrictEqual(await wb.restoreApp({ pkg: "bad'name", family: '' }), { ok: false, how: 'none' })
})

test('catalog ids used by run exist for every kind', () => {
  for (const k of catalog.KINDS) assert.ok(catalog.ofKind(k).length > 0, k)
})
