'use strict'
const test = require('node:test')
const assert = require('node:assert')
const core = require('../js/cleanup/core')
const page = require('../js/cleanup/page')
const extras = require('../js/cleanup/extras')
const receipt = require('../lib/cleanup/receipt')

test('core.arcs: proportional, ordered, never overlapping, tiny groups stay visible', () => {
  const a = core.arcs({ system: 900, browsers: 100, gpu: 1 })
  const on = a.filter(x => x.len > 0)
  assert.deepStrictEqual(on.map(x => x.id), ['system', 'browsers', 'gpu'])
  assert.ok(on[0].len > on[1].len && on[1].len >= on[2].len)
  assert.ok(on[2].len >= 4, 'a tiny group is still at least a visible sliver')
  for (let i = 1; i < on.length; i++) assert.ok(on[i].start >= on[i - 1].start + on[i - 1].len - 1e-9)
  const end = on[on.length - 1]; assert.ok(end.start + end.len <= 100 + 1e-9)
  assert.ok(core.arcs({}).every(x => x.len === 0))
  assert.strictEqual(core.arcs({ apps: 5 }).find(x => x.id === 'apps').len, 100, 'a single group closes the ring')
})

test('core.drive: used / junk / free shares add up and the junk marker is visible', () => {
  const d = core.drive(1000, 600, 6)
  assert.ok(Math.abs(d.used + d.junk + d.free - 100) < 0.1)
  assert.ok(core.drive(1e12, 5e11, 10).junk >= 0.6)
  assert.strictEqual(core.drive(1000, 2000, 0).free, 0)
})

const scans = { 'clean-temp': { present: true, bytes: 1000 }, 'clean-browsers': { present: true, bytes: 500, personalFiles: 2 }, 'clean-nvidia': { present: true, bytes: 300 }, 'clean-recycle': { present: true, bytes: 9000 }, 'clean-winsxs': { present: true, unknown: true, bytes: 0 }, 'clean-steam': { present: true, bytes: 0 } }
const model = receipt.buildModel(scans, { running: new Set(['chrome.exe']), has: { nvidia: true } })

test('page: lanes, default selection and totals follow the scan; permanent is never selected', () => {
  assert.deepStrictEqual(page.lane(model, 'safe').map(i => i.id), ['clean-temp', 'clean-browsers'])
  assert.deepStrictEqual(page.lane(model, 'review').map(i => i.id).sort(), ['clean-nvidia', 'clean-winsxs'])
  assert.deepStrictEqual(page.lane(model, 'permanent').map(i => i.id), ['clean-recycle'])
  const sel = page.defaultSelection(model)
  assert.deepStrictEqual([...sel].sort(), ['clean-browsers', 'clean-temp'])
  assert.strictEqual(page.selectionBytes(model, sel), 1500)
  assert.strictEqual(page.selectionBytes(model, new Set(['clean-recycle', 'clean-temp'])), 1000, 'permanent bytes never count toward the batch')
  assert.strictEqual(page.laneBytes(model, 'permanent'), 9000)
  assert.ok(!page.shown(model).some(i => i.id === 'clean-steam'), 'places with nothing to free are not listed')
})

test('page: group bytes can be limited to lanes (the ring excludes permanent)', () => {
  const g = page.groupBytes(model, ['safe', 'review'])
  assert.strictEqual(g.system, 1000); assert.strictEqual(g.browsers, 500); assert.strictEqual(g.gpu, 300); assert.ok(!('permanent' in g))
})

test('page: formatting and skip reasons', () => {
  assert.strictEqual(page.fmt(1610612736), '1.5 GB'); assert.strictEqual(page.fmt(5 * 1048576), '5 MB'); assert.strictEqual(page.fmt(2048), '2 KB')
  assert.strictEqual(page.lockedNames({ lockedBy: ['chrome.exe', 'Chrome.exe', 'msedge.exe'] }), 'chrome, Chrome, msedge')
  assert.deepStrictEqual(page.skippedReasons({ inUse: 2, personal: 1, tooNew: 0 }), [['inUse', 2], ['personal', 1]])
  assert.deepStrictEqual(page.skippedReasons(null), [])
  assert.ok(page.HOLD_MS >= 1000, 'permanent actions need a deliberate press')
})

test('extras.squarify: areas add up, tiles stay inside the box and do not overlap', () => {
  const vals = [412, 288, 96, 61, 54, 22, 9, 3.8, 2.4], W = 640, H = 360
  const r = extras.squarify(vals, W, H)
  assert.strictEqual(r.length, vals.length)
  const area = r.reduce((a, q) => a + q.w * q.h, 0)
  assert.ok(Math.abs(area - W * H) < 1, 'areas add up to the box')
  for (const q of r) assert.ok(q.x >= -1e-6 && q.y >= -1e-6 && q.x + q.w <= W + 1e-6 && q.y + q.h <= H + 1e-6)
  for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
    const a = r[i], b = r[j], ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
    assert.ok(!(ox > 1e-6 && oy > 1e-6), `tiles ${i} and ${j} overlap`)
  }
  assert.ok(r[0].w * r[0].h > r[1].w * r[1].h, 'bigger value, bigger tile')
  assert.deepStrictEqual(extras.squarify([], 100, 100), []); assert.deepStrictEqual(extras.squarify([0, 0], 100, 100), [])
})

test('extras.crumbs: builds the path trail', () => {
  const bs = String.fromCharCode(92)
  assert.deepStrictEqual(extras.crumbs('C:' + bs + 'Users' + bs + 'a').map(c => c.name), ['C:' + bs, 'Users', 'a'])
  assert.strictEqual(extras.crumbs('C:' + bs + 'Users').pop().path, 'C:' + bs + 'Users')
  assert.deepStrictEqual(extras.crumbs(''), [])
})

test('LANG: every target has a name, description and impact line in both languages', () => {
  const vm = require('vm'), fs = require('fs'), path = require('path')
  const ids = require('../lib/cleanup/targets').ids()
  for (const code of ['en', 'fi']) {
    const ctx = { window: null, LANG: {} }; ctx.window = ctx; vm.createContext(ctx)
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'lang', code + '.js'), 'utf8') + `\n;globalThis.__L = (typeof LANG !== 'undefined' ? LANG : null)`, ctx)
    const g = ctx.__L && ctx.__L[code] && ctx.__L[code].cleanup2
    assert.ok(g, code + ' has cleanup2')
    for (const id of ids) for (const k of ['n_', 'd_', 'i_']) assert.ok(g[k + id], `${code}: ${k}${id}`)
  }
})
