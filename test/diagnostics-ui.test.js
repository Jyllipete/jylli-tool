'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.join(__dirname, '..')
const LANG = { en: {}, fi: {} }
for (const f of ['diagnostics-en.js', 'diagnostics-fi.js']) vm.runInNewContext(fs.readFileSync(path.join(root, 'js/lang', f), 'utf8'), { LANG })
const en = LANG.en.diag2, fi = LANG.fi.diag2

const lat = require('../js/diagnostics/lattice')
const page = require('../js/diagnostics/page')
const views = require('../js/diagnostics/views')
const lib = require('../lib/diagnostics')
const { RULES } = require('../lib/diagnostics/findings')
const repair = require('../lib/diagnostics/repair')
const bug = require('../lib/diagnostics/bugchecks')

const ph = s => (String(s).match(/\{\w+\}/g) || []).sort().join()

test('EN and FI have the same keys and the same placeholders', () => {
  assert.deepStrictEqual(Object.keys(en).sort(), Object.keys(fi).sort())
  for (const k of Object.keys(en)) assert.strictEqual(ph(en[k]), ph(fi[k]), k)
})

test('no empty strings, and Finnish is not a copy of English', () => {
  for (const k of Object.keys(en)) { assert.ok(en[k] && fi[k], k) }
  const same = Object.keys(en).filter(k => en[k] === fi[k] && /[a-z]{4}/i.test(en[k]))
  assert.ok(same.length < 8, same.join(','))
})

test('every literal T(...) key in the page and views exists', () => {
  const src = ['page.js', 'views.js'].map(f => fs.readFileSync(path.join(root, 'js/diagnostics', f), 'utf8')).join('\n')
  const miss = [...new Set([...src.matchAll(/\bT\('([A-Za-z0-9_\-]+)'/g)].map(m => m[1]))].filter(k => !k.endsWith('_') && !(k in en))
  assert.deepStrictEqual(miss, [])
})

test('every finding rule has a title, a reason and a pass label (suspect-change has no pass state)', () => {
  for (const r of RULES) {
    assert.ok(en['t_' + r.id], 't_' + r.id); assert.ok(en['w_' + r.id], 'w_' + r.id)
    if (r.id !== 'suspect-change') assert.ok(en['t_' + r.id + '_ok'], 't_' + r.id + '_ok')
  }
})

test('every repair a finding offers has its confirm text and result text', () => {
  for (const id of repair.ids()) { assert.ok(en['fd_' + id], 'fd_' + id) }
  for (const id of repair.ids().filter(i => repair.get(i).risk === 'confirm')) assert.ok(en['cb_' + id], 'cb_' + id)
})

test('every fix button label exists: repair, undo and external fixes use f_<finding>', () => {
  const ids = RULES.map(r => r.id)
  const src = fs.readFileSync(path.join(root, 'lib/diagnostics/findings.js'), 'utf8')
  for (const id of ids) {
    const block = src.slice(src.indexOf(`id: '${id}'`), src.indexOf(`id: '`, src.indexOf(`id: '${id}'`) + 10))
    if (/kind: '(repair|external|undo)'/.test(block)) assert.ok(en['f_' + id], 'f_' + id)
  }
})

test('severity, incident kind, confidence, subsystem and driver-status labels exist', () => {
  for (const s of page.SEV_ORDER) assert.ok(en['sev_' + s], s)
  for (const k of ['bugcheck', 'power-loss', 'whea', 'gpu-reset', 'disk', 'app-crash', 'app-hang', 'unclean']) assert.ok(en['inc_' + k], k)
  for (const c of ['low', 'medium', 'high']) assert.ok(en['conf_' + c], c)
  for (const s of lat.SUBS) assert.ok(en['sub_' + s], s)
  for (const s of ['ok', 'aging', 'old', 'unknown']) assert.ok(en['drSt_' + s], s)
  for (const k of ['cpu1', 'cpuN', 'mem', 'disk']) { assert.ok(en['bn_' + k]); assert.ok(en['bnd_' + k]) }
})

test('stop code descriptions are real table entries', () => {
  for (const k of Object.keys(en).filter(k => k.startsWith('bc_'))) assert.ok(bug.TABLE[k.slice(3)], k)
})

test('the page maps probes to the same arcs as the engine', () => {
  assert.deepStrictEqual(page.PROBE_SUBS, lib.PROBE_SUBS)
})

test('feeds: quick leaves out the deep probes, deep adds them', () => {
  const q = page.feeds('quick'), d = page.feeds('deep')
  assert.ok(!(q.windows || []).includes('health')); assert.ok(d.windows.includes('health'))
  assert.ok(d.cpu.includes('thermal') && !q.cpu.includes('thermal'))
  assert.strictEqual(page.progress(q.stability, new Set(['events'])), 1 / 3)
  assert.strictEqual(page.progress(undefined, new Set()), 0)
})

test('age buckets and finding order', () => {
  assert.deepStrictEqual(page.age(20000), { k: 'now', n: 0 })
  assert.deepStrictEqual(page.age(5 * 60000), { k: 'min', n: 5 })
  assert.deepStrictEqual(page.age(5 * 3600000), { k: 'hour', n: 5 })
  assert.deepStrictEqual(page.age(5 * 86400000), { k: 'day', n: 5 })
  const v = page.visible([{ severity: 'low', penalty: 5, subsystem: 'cpu' }, { severity: 'critical', penalty: 1, subsystem: 'cpu' }, { severity: 'high', penalty: 9, subsystem: 'gpu' }], 'cpu')
  assert.deepStrictEqual(v.map(f => f.severity), ['critical', 'low'])
})

test('lattice geometry: ten segments that never overlap, filled in proportion', () => {
  assert.strictEqual(lat.SUBS.length, 10)
  const segs = lat.SUBS.map((_, i) => lat.seg(i, 100))
  for (let i = 1; i < segs.length; i++) assert.ok(segs[i].start >= segs[i - 1].start + segs[i - 1].len)
  assert.ok(segs[9].start + segs[9].len <= 100)
  assert.strictEqual(lat.seg(0, 50).fill, lat.seg(0, 100).len / 2)
  assert.strictEqual(lat.seg(0, null).fill, 0)
  assert.strictEqual(lat.seg(0, 250).fill, lat.seg(0, 100).len)
  const m = lat.mid(0)
  assert.ok(m.y < 0 && Math.abs(m.x) < 0.35)            // first segment sits at the top
  assert.deepStrictEqual([90, 60, 20, null].map(lat.tone), ['ok', 'warn', 'danger', 'idle'])
})

test('timeline helpers', () => {
  assert.strictEqual(views.xOf(0, 0, 100, 960), 0); assert.strictEqual(views.xOf(100, 0, 100, 960), 960); assert.strictEqual(views.xOf(500, 0, 100, 960), 960)
  const g = views.group([{ ts: 0, severity: 'low' }, { ts: 3600000, severity: 'critical' }, { ts: 30 * 3600000, severity: 'high' }])
  assert.strictEqual(g.length, 2); assert.strictEqual(views.worst(g[0].items), 'critical')
})

test('driver and benchmark helpers', () => {
  const D = 86400000
  assert.deepStrictEqual([null, 100 * D, 400 * D, 600 * D].map(a => views.driverStatus(a == null ? null : Math.floor(a / D))), ['unknown', 'ok', 'aging', 'old'])
  assert.strictEqual(views.driverAge(0, 1), null)
  const d = views.deltas({ points: { cpu1: 1100, mem: 900, disk: 1000 } }, { points: { cpu1: 1000, mem: 1000 } })
  assert.deepStrictEqual(d, { cpu1: 10, mem: -10, disk: null })
  assert.strictEqual(views.spark([1], 100, 20), '')
  assert.strictEqual(views.spark([0, 10], 100, 22, 0, 10).split(' ').length, 2)
})
