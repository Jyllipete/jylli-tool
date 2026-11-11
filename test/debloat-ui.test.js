const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs'), path = require('path')
const catalog = require('../lib/debloat/catalog')
const C = require('../lib/debloat/classify')
const F = require('../lib/debloat/footprint')
globalThis.JylliDebloatFootprint = F
const P = require('../js/debloat/page')
const V = require('../js/debloat/views')

const root = path.join(__dirname, '..')
const LANG = {}
const loadLang = code => { const src = fs.readFileSync(path.join(root, 'js', 'lang', `debloat-${code}.js`), 'utf8'); new Function('LANG', src)(LANG); return LANG[code].debloat2 }
LANG.en = {}; LANG.fi = {}
const en = loadLang('en'), fi = loadLang('fi')

test('LANG: every catalog item has a name and description in both languages, and what-breaks text when it breaks', () => {
  for (const i of catalog.CATALOG) {
    for (const [lang, d] of [['en', en], ['fi', fi]]) {
      assert.ok(d['n_' + i.id], `${lang} n_${i.id}`)
      assert.ok(d['d_' + i.id], `${lang} d_${i.id}`)
      if (i.breaks) assert.ok(d['w_' + i.id], `${lang} w_${i.id}`)
    }
  }
})

test('LANG: English and Finnish have exactly the same keys', () => {
  assert.deepStrictEqual(Object.keys(en).sort(), Object.keys(fi).sort())
  for (const k of Object.keys(en)) assert.ok(String(fi[k]).length > 0, k)
})

test('LANG: placeholders match between languages', () => {
  const ph = s => (String(s).match(/\{\w+\}/g) || []).sort().join()
  for (const k of Object.keys(en)) assert.strictEqual(ph(fi[k]), ph(en[k]), k)
})

test('LANG: every literal key the page and views use exists', () => {
  const src = ['page.js', 'views.js'].map(f => fs.readFileSync(path.join(root, 'js', 'debloat', f), 'utf8')).join('\n')
  const keys = new Set([...src.matchAll(/\bT\('([A-Za-z0-9_]+)'/g)].map(m => m[1]))
  for (const m of src.matchAll(/loadingHtml\(ctx, '([A-Za-z0-9_]+)'\)/g)) keys.add(m[1])
  for (const m of src.matchAll(/'(adOn|adOffNow)'/g)) keys.add(m[1])
  for (const k of [...keys].filter(x => !x.endsWith('_'))) { assert.ok(en[k] !== undefined, 'en ' + k); assert.ok(fi[k] !== undefined, 'fi ' + k) }
  // key families built at run time
  const fam = { lane_: ['safe', 'review', 'kept'], laneSub_: ['safe', 'review', 'kept'], layer_: ['all', ...P.LAYERS], int_: C.INTENTS, guard_: ['off', 'update', 'quiet'], why_: ['protected', 'unlocked'],
    use_: ['printers', 'btPaired', 'xboxController'], wb_: ['offline', 'store'], wbTip_: ['offline', 'store'], wbDone_: ['present', 'offline', 'store'], pgF_: ['all', 'oem', 'unused', 'large'], pgS_: ['name', 'size', 'date', 'last'],
    surface_: ['lock', 'start', 'search', 'taskbar', 'explorer', 'settings', 'notify'] }
  for (const [p, list] of Object.entries(fam)) for (const x of list) assert.ok(en[p + x] && fi[p + x], p + x)
})

test('LANG: every ad surface in the catalog has a map label', () => {
  for (const a of catalog.ofKind('ad')) assert.ok(en['surface_' + a.surface], a.surface)
})

const items = [
  { id: 'a', kind: 'appx', layer: 'apps', ref: 'Pkg.A', disk: 5 * 1048576, ram: 0, state: 'on' },
  { id: 'b', kind: 'service', layer: 'services', ref: 'Svc', disk: 0, ram: 40 * 1048576, state: 'on' },
  { id: 'c', kind: 'task', layer: 'tasks', ref: '\\x\\Task', disk: 0, ram: 0, next: 1000 + 3600000, repMs: 0, state: 'on' },
  { id: 'd', kind: 'ad', layer: 'ads', ref: 'Enabled', disk: 0, ram: 0, state: 'on' },
]
const verdicts = { a: { present: true, lane: 'safe' }, b: { present: true, lane: 'review' }, c: { present: true, lane: 'safe' }, d: { present: true, lane: 'kept' } }

test('page: costOf shows disk for apps, RAM for services, wake-ups for tasks, nothing otherwise', () => {
  assert.deepStrictEqual(P.costOf(items[0], 1000), { v: '5', u: 'MB' })
  assert.deepStrictEqual(P.costOf(items[1], 1000), { v: '40', u: 'MB' })
  assert.deepStrictEqual(P.costOf(items[2], 1000), { v: '1', u: '×' })
  assert.strictEqual(P.costOf(items[3], 1000), null)
})

test('page: laneList filters by lane, layer and name, biggest first', () => {
  const nameOf = id => ({ a: 'Weather', b: 'Search indexer', c: 'Task', d: 'Ad' }[id])
  assert.deepStrictEqual(P.laneList(items, verdicts, 'safe', { nameOf }).map(i => i.id), ['a', 'c'])
  assert.deepStrictEqual(P.laneList(items, verdicts, 'safe', { nameOf, layer: 'tasks' }).map(i => i.id), ['c'])
  assert.deepStrictEqual(P.laneList(items, verdicts, 'safe', { nameOf, q: 'weath' }).map(i => i.id), ['a'])
  assert.deepStrictEqual(P.laneList(items, verdicts, 'kept', { nameOf }).map(i => i.id), ['d'])
})

test('page: layerCounts counts removable items only', () => {
  assert.deepStrictEqual(P.layerCounts(items, verdicts), { all: 3, apps: 1, services: 1, tasks: 1, ads: 0, features: 0 })
})

test('page: a confirm dialog is needed for apps, features and Your call items, not for plain safe tasks', () => {
  assert.ok(P.needsConfirm(items, verdicts, new Set(['a'])))
  assert.ok(P.needsConfirm(items, verdicts, new Set(['b'])))
  assert.ok(!P.needsConfirm(items, verdicts, new Set(['c'])))
})

test('page: selectedIds never includes kept or absent items', () => {
  assert.deepStrictEqual(P.selectedIds(items, verdicts, new Set(['a', 'd', 'zzz'])), ['a'])
})

test('page: wake-ups after the run, band position, way back kind', () => {
  assert.deepStrictEqual(P.wakesAfter([{ id: 'c' }, { id: 'x' }], new Set(['c'])), { now: 2, after: 1 })
  assert.strictEqual(P.bandPos(1000 + 12 * 3600000, 1000, 24 * 3600000), 50)
  assert.strictEqual(P.wayBack({ kind: 'appx', provisioned: true }, false), 'offline')
  assert.strictEqual(P.wayBack({ kind: 'appx', provisioned: true }, true), 'store')
  assert.strictEqual(P.wayBack({ kind: 'appx', provisioned: false }, false), 'store')
  assert.strictEqual(P.wayBack({ kind: 'service' }, false), null)
})

test('views: last-opened matching needs a 60 % name overlap', () => {
  const as = V.assistMap([{ path: 'C:\\Program Files\\Foo\\foobar.exe', count: 7, lastUsed: '2026-09-01T00:00:00Z' }])
  assert.strictEqual(V.lastOpened('FooBar Studio 2026', as, {}), null)   // "foobarstudio2026" vs "foobar": too different
  assert.strictEqual(V.lastOpened('FooBar', as, {}).count, 7)
  assert.strictEqual(V.lastOpened('Zzz', as, {}), null)
  const pm = V.prefetchMap([{ Name: 'FOOBAR.EXE-1A2B3C4D.pf', LastWriteTime: '2026-10-01T00:00:00Z' }])
  assert.strictEqual(V.lastOpened('FooBar', as, pm).ts, Date.parse('2026-10-01T00:00:00Z'))
})

test('views: programRows filter, sort and search', () => {
  const now = Date.UTC(2026, 10, 1), old = now - 200 * 86400000
  const apps = [
    { name: 'Alpha', size: 600 * 1048576, date: '2020-01-01', publisher: 'A', system: false, oem: false, last: { ts: old } },
    { name: 'Beta', size: 10, date: '2024-01-01', publisher: 'B', system: false, oem: true, last: { ts: now } },
    { name: 'Gamma', size: 0, date: '', publisher: 'C', system: true, oem: false, last: null },
  ]
  assert.deepStrictEqual(V.programRows(apps, { filter: 'unused', now }).map(a => a.name), ['Alpha'])
  assert.deepStrictEqual(V.programRows(apps, { filter: 'oem', now }).map(a => a.name), ['Beta'])
  assert.deepStrictEqual(V.programRows(apps, { filter: 'large', now }).map(a => a.name), ['Alpha'])
  assert.deepStrictEqual(V.programRows(apps, { sort: 'size' }).map(a => a.name), ['Alpha', 'Beta', 'Gamma'])
  assert.deepStrictEqual(V.programRows(apps, { sort: 'last' }).map(a => a.name), ['Alpha', 'Beta', 'Gamma'])
  assert.deepStrictEqual(V.programRows(apps, { q: 'bet' }).map(a => a.name), ['Beta'])
  assert.ok(V.isSystem('Microsoft Visual C++ 2022 Redistributable'))
  assert.ok(!V.isSystem('Firefox'))
  assert.strictEqual(V.installDate('20240131'), '2024-01-31')
})

test('views: journal entries group into runs, newest first', () => {
  const b = V.groupBatches([{ entryId: '1', batchId: 'x', ts: 10, undone: true }, { entryId: '2', batchId: 'x', ts: 12, undone: true }, { entryId: '3', batchId: 'y', ts: 20, undone: false }])
  assert.deepStrictEqual(b.map(x => [x.batchId, x.rows.length, x.undone]), [['y', 1, false], ['x', 2, true]])
})
