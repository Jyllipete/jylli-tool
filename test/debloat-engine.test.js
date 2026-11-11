const test = require('node:test')
const assert = require('node:assert')
const catalog = require('../lib/debloat/catalog')
const probe = require('../lib/debloat/probe')
const { buildModel } = require('../lib/debloat/model')
const C = require('../lib/debloat/classify')
const F = require('../lib/debloat/footprint')
const { PROTECTED } = require('../lib/uwp-protect')

test('catalog: unique ids, valid kinds, lanes and intents', () => {
  const ids = catalog.CATALOG.map(i => i.id)
  assert.strictEqual(new Set(ids).size, ids.length)
  for (const i of catalog.CATALOG) {
    assert.ok(catalog.KINDS.includes(i.kind), i.id)
    assert.ok(['safe', 'review'].includes(i.lane), i.id)
    for (const n of i.needs) assert.ok(catalog.INTENTS.includes(n), i.id + ' needs ' + n)
  }
})

test('catalog: every protected package is in the catalog and flagged', () => {
  for (const p of PROTECTED) {
    const it = catalog.CATALOG.find(i => i.kind === 'appx' && i.pkg === p)
    assert.ok(it, p)
    assert.ok(catalog.isProtectedItem(it))
    assert.strictEqual(it.lane, 'review', p + ' is never in the safe lane')
  }
})

test('catalog: ad surfaces carry both off and on values', () => {
  for (const a of catalog.ofKind('ad')) {
    assert.ok(a.reg.length && a.surface, a.id)
    for (const r of a.reg) assert.ok(r.key.startsWith('HKCU:\\') && r.name && r.off !== r.on, a.id)
  }
})

test('probe: script embeds the catalog as one escaped literal and ends with the marker line', () => {
  const s = probe.buildScript({ apps: ["It's"], svc: [], tasks: [], reg: [], exe: [] })
  assert.ok(s.includes("It''s"))
  assert.ok(s.includes("'" + probe.MARK + "'"))
  assert.ok(s.includes('Get-AppxProvisionedPackage'))
})

test('probe: iso durations', () => {
  assert.strictEqual(probe.isoMs('PT1H'), 3600000)
  assert.strictEqual(probe.isoMs('PT1H30M'), 5400000)
  assert.strictEqual(probe.isoMs('P1D'), 86400000)
  assert.strictEqual(probe.isoMs(''), 0)
  assert.strictEqual(probe.isoMs('nonsense'), 0)
})

const now = Date.UTC(2026, 10, 11, 12, 0, 0)
const out = probe.MARK + JSON.stringify({
  appx: [{ n: 'Microsoft.BingNews', f: 'Microsoft.BingNews_8wekyb3d8bbwe', sz: 52428800 }, { n: 'Microsoft.WindowsStore', f: 'x', sz: 1 }, { n: 'Microsoft.YourPhone', f: 'y', sz: 1000 }],
  prov: ['Microsoft.BingNews'],
  svc: { DiagTrack: { st: 'Running', sm: 'Auto', sh: 1, ws: 31457280 }, Spooler: { st: 'Running', sm: 'Auto', sh: 1, ws: 9000000 }, SysMain: { st: 'Stopped', sm: 'Disabled', sh: 0, ws: 0 }, WerSvc: { st: 'Running', sm: 'Manual', sh: 4, ws: 5000000 } },
  tasks: [
    { p: '\\Microsoft\\Windows\\Application Experience\\', n: 'ProgramDataUpdater', s: 'Ready', nx: now + 3 * 3600000, rep: '' },
    { p: '\\Microsoft\\Windows\\Autochk\\', n: 'Proxy', s: 'Disabled', nx: 0, rep: '' },
    { p: '\\Microsoft\\Windows\\Maps\\', n: 'MapsUpdateTask', s: 'Ready', nx: now + 1 * 3600000, rep: 'PT6H' },
  ],
  reg: { 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager|SystemPaneSuggestionsEnabled': 0, 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced|Start_IrisRecommendations': 1 },
  feat: { SMB1Protocol: true, TelnetClient: false },
  procs: { teams: 100000 }, lastRun: { yourphone: now - 2 * 86400000 },
  facts: { printers: 1, btPaired: 0, xboxController: 0, gamePass: 0, obs: true, dev: false, laptop: false, build: 26200, ubr: 1, mfr: 'HP' },
})

test('probe.parse: reads the marker line, null when it is missing or broken', () => {
  assert.strictEqual(probe.parse('nothing'), null)
  assert.strictEqual(probe.parse(probe.MARK + '{broken'), null)
  const s = probe.parse('noise\n' + out + '\n')
  assert.strictEqual(s.appx['microsoft.bingnews'].size, 52428800)
  assert.strictEqual(s.tasks[catalog.taskKey('\\Microsoft\\Windows\\Maps\\', 'MapsUpdateTask')].repMs, 6 * 3600000)
})

test('probe.parse: same task name in different folders stays two tasks', () => {
  const s = probe.parse(probe.MARK + JSON.stringify({ tasks: [{ p: '\\A\\', n: 'Same', s: 'Ready' }, { p: '\\B\\', n: 'Same', s: 'Disabled' }] }))
  assert.strictEqual(Object.keys(s.tasks).length, 2)
})

const model = buildModel(probe.parse(out), { now })
const byId = id => model.items.find(i => i.id === id)

test('model: states come from the snapshot', () => {
  assert.strictEqual(byId('app:Microsoft.BingNews').state, 'on')
  assert.strictEqual(byId('app:Microsoft.BingNews').provisioned, true)
  assert.strictEqual(byId('app:Microsoft.BingWeather').state, 'missing')
  assert.strictEqual(byId('svc:SysMain').state, 'off')
  assert.strictEqual(byId('svc:DiagTrack').state, 'on')
  assert.strictEqual(byId('task:proxy').state, 'off')
  assert.strictEqual(byId('ad:start-suggestions').state, 'off')
  assert.strictEqual(byId('ad:start-recommended').state, 'on')
  assert.strictEqual(byId('feat:SMB1Protocol').state, 'on')
  assert.strictEqual(byId('feat:TelnetClient').state, 'off')
  assert.strictEqual(byId('feat:TFTP').state, 'missing')
})

test('model: a service in a shared svchost has no RAM of its own', () => {
  assert.strictEqual(byId('svc:DiagTrack').ram, 31457280)
  assert.strictEqual(byId('svc:WerSvc').ram, 0)
})

test('classify: Store is kept by the shield, and removable with it off', () => {
  const id = 'app:Microsoft.WindowsStore'
  assert.deepStrictEqual(C.classify(model.items, model.facts, {}, { now })[id].reason, { code: 'protected' })
  const off = C.classify(model.items, model.facts, {}, { now, shield: false })[id]
  assert.strictEqual(off.lane, 'review')
})

test('classify: a connected printer keeps the Print Spooler; no printer leaves it to the user', () => {
  assert.strictEqual(C.classify(model.items, model.facts, {}, { now })['svc:Spooler'].lane, 'kept')
  const none = C.classify(model.items, { ...model.facts, printers: 0 }, {}, { now })['svc:Spooler']
  assert.strictEqual(none.lane, 'review')
})

test('classify: intents keep what they need, recent use moves an app to Your call', () => {
  const v = C.classify(model.items, model.facts, { laptop: true }, { now })
  assert.strictEqual(v['app:Microsoft.YourPhone'].lane, 'kept')
  const v2 = C.classify(model.items, model.facts, {}, { now })
  assert.deepStrictEqual(v2['app:Microsoft.YourPhone'].reason, { code: 'recent', arg: 2 })
  assert.strictEqual(v2['app:Microsoft.BingNews'].lane, 'safe')
  assert.strictEqual(v2['app:Microsoft.BingWeather'].present, false)
})

test('classify: kept items are never in the default selection; unlocking moves them to Your call', () => {
  const v = C.classify(model.items, model.facts, { laptop: true }, { now })
  const sel = C.defaultSelection(v)
  for (const id of sel) assert.strictEqual(v[id].lane, 'safe')
  assert.ok(!sel.has('app:Microsoft.WindowsStore') && !sel.has('svc:Spooler'))
  const u = C.classify(model.items, model.facts, { laptop: true }, { now, unlocked: new Set(['svc:Spooler']) })
  assert.strictEqual(u['svc:Spooler'].lane, 'review')
})

test('autoIntents: derived from facts only', () => {
  const a = C.autoIntents({ obs: true, printers: 0, laptop: true, gamePass: 2 })
  assert.ok(a.stream && a.laptop && a.xbox && !a.print && !a.dev)
})

test('footprint: tick list uses real next runs and repetition, inside 24 h only', () => {
  const v = C.classify(model.items, model.facts, {}, { now })
  const ticks = F.chatter(model.items, v, now)
  const maps = ticks.filter(t => t.id === 'task:mapsupdatetask')
  assert.deepStrictEqual(maps.map(t => (t.t - now) / 3600000), [1, 7, 13, 19])
  assert.strictEqual(ticks.filter(t => t.id === 'task:programdataupdater').length, 1)
  assert.strictEqual(ticks.filter(t => t.id === 'task:proxy').length, 0)
  assert.ok(ticks.every(t => t.t >= now && t.t <= now + F.DAY))
  assert.deepStrictEqual(ticks.map(t => t.t), ticks.map(t => t.t).sort((a, b) => a - b))
})

test('footprint: a stale NextRunTime without repetition makes no tick', () => {
  assert.deepStrictEqual(F.taskTicks({ kind: 'task', next: now - 1000, repMs: 0 }, now), [])
  assert.strictEqual(F.taskTicks({ kind: 'task', next: now - 1000, repMs: 3600000 }, now).length, 24)
})

test('footprint: totals count removable items only, selection is a subset', () => {
  const v = C.classify(model.items, model.facts, {}, { now })
  const sel = C.defaultSelection(v)
  const t = F.totals(model.items, v, now, sel)
  const kept = Object.values(v).filter(x => x.lane === 'kept').length
  assert.ok(kept > 0)
  assert.strictEqual(t.all.count, Object.values(v).filter(x => x.present && x.lane !== 'kept').length)
  assert.ok(t.selected.count <= t.all.count)
  assert.strictEqual(t.layers.apps.disk, 52429800)
})

test('footprint: arcs sum to the ring, a tiny layer is still visible', () => {
  const a = F.arcs({ apps: 100, services: 1, tasks: 0 })
  const used = a.filter(x => x.len > 0)
  assert.strictEqual(used.length, 2)
  assert.ok(used.find(x => x.id === 'services').len > 4)
  assert.ok(a.reduce((s, x) => s + x.len, 0) <= 100)
  assert.ok(F.arcs({}).every(x => x.len === 0))
})
