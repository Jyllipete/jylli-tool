const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs'), path = require('path'), vm = require('vm')
const catalog = require('../lib/windows/catalog')
const model = require('../lib/windows/model')
const detect = require('../lib/windows/detect')
const P = require('../js/windows/pure')

const root = path.join(__dirname, '..')
const ctx = {}
vm.runInNewContext(['en', 'fi', 'windows-en', 'windows-fi'].map(c => fs.readFileSync(path.join(root, 'js', 'lang', c + '.js'), 'utf8')).join('\n') + '\n;globalThis.__L = LANG', ctx)
const L = ctx.__L
const en = L.en.windows2, fi = L.fi.windows2

test('LANG: English and Finnish have the same keys and placeholders', () => {
  assert.deepStrictEqual(Object.keys(en).sort(), Object.keys(fi).sort())
  const ph = s => (String(s).match(/\{\w+\}/g) || []).sort().join()
  for (const k of Object.keys(en)) { assert.ok(String(fi[k]).length > 0, k); assert.strictEqual(ph(fi[k]), ph(en[k]), k) }
})

test('LANG: every literal key page.js and views.js use exists, and so do the run-time families', () => {
  const src = ['page.js', 'views.js'].map(f => fs.readFileSync(path.join(root, 'js', 'windows', f), 'utf8')).join('\n')
  const keys = new Set([...src.matchAll(/\bT\('([A-Za-z0-9_]+)'/g)].map(m => m[1]))
  for (const m of src.matchAll(/\bT\(([a-z]+ \? )?'([A-Za-z0-9_]+)'/g)) keys.add(m[2])
  for (const m of src.matchAll(/titleKey: ?'([A-Za-z0-9_]+)'|'(pv[A-Za-z]+|ctaPutBack|vRun)'/g)) keys.add(m[1] || m[2])
  for (const m of src.matchAll(/batch\([^)]*'(pv[A-Za-z]+)'\)/g)) keys.add(m[1])
  for (const k of [...keys].filter(x => !x.endsWith('_'))) { assert.ok(en[k] !== undefined, 'en ' + k); assert.ok(fi[k] !== undefined, 'fi ' + k) }
  const fam = {
    lane_: catalog.LANES.map(l => l.id), laneSub_: catalog.LANES.map(l => l.id), st_: Object.keys(P.STATUS), chip_: P.CHIPS, ago_: ['now', 'min', 'hour', 'day'],
    via_: ['manual', 'stage', 'auto-opti', 'spw', 'ai', 'game-watcher', 'scheduler', 'safety-revert', 'undo'], act_: ['apply', 'restore'],
    v: ['Unread', 'Drift', 'Open', 'Clean'],
  }
  for (const [pre, list] of Object.entries(fam)) for (const x of list) { assert.ok(en[pre + x] !== undefined, 'en ' + pre + x); assert.ok(fi[pre + x] !== undefined, 'fi ' + pre + x) }
  assert.ok(en.st_unknownApplied && fi.st_unknownApplied)
})

test('LANG: every catalog id has a name and description in both languages, and every warning key exists', () => {
  for (const [code, lang] of [['en', L.en], ['fi', L.fi]]) {
    for (const i of catalog.ITEMS) {
      assert.ok(lang.tweakNames[i.id], `${code} name ${i.id}`)
      assert.ok(lang.tweakDescs[i.id], `${code} desc ${i.id}`)
      for (const w of i.warn || []) assert.ok(lang.ui[w.key], `${code} ${w.key}`)
    }
  }
})

test('pure: switch semantics (native is locked, drifted is off, flip direction)', () => {
  const it = (status, extra) => ({ id: 'x', status, remembered: 'default', tier: 1, rec: false, reboot: false, ...extra })
  assert.ok(P.isOn(it('on'))); assert.ok(P.isOn(it('native'))); assert.ok(P.isOn(it('restart'))); assert.ok(!P.isOn(it('off'))); assert.ok(!P.isOn(it('drifted'))); assert.ok(!P.isOn(it('partial')))
  assert.ok(P.isOn(it('unknown', { remembered: 'applied' }))); assert.ok(!P.isOn(it('unknown')))
  assert.ok(P.isLocked(it('native'))); assert.ok(!P.isLocked(it('on')))
  assert.strictEqual(P.flipAction(it('on')), 'restore'); assert.strictEqual(P.flipAction(it('off')), 'apply'); assert.strictEqual(P.flipAction(it('drifted')), 'apply')
})

test('pure: chips, counts, search, time', () => {
  const items = [{ id: 'a', status: 'on', tier: 1 }, { id: 'b', status: 'off', tier: 2, rec: true }, { id: 'c', status: 'drifted', tier: 1 }, { id: 'd', status: 'restart', tier: 1, reboot: true }]
  const c = P.chipCounts(items)
  assert.deepStrictEqual([c.all, c.rec, c.set, c.open, c.drifted, c.restart, c.risky], [4, 1, 2, 2, 1, 1, 1])
  assert.ok(P.matches({ id: 'game-dvr' }, 'xbox', 'Disable Xbox Game Bar')); assert.ok(P.matches({ id: 'game-dvr' }, 'dvr', '')); assert.ok(!P.matches({ id: 'a' }, 'zzz', 'abc'))
  assert.deepStrictEqual(P.ago(1000, 1000), { k: 'now', n: 0 }); assert.deepStrictEqual(P.ago(0, 1), null)
  assert.deepStrictEqual(P.ago(1000, 1000 + 5 * 60000), { k: 'min', n: 5 }); assert.strictEqual(P.ago(1000, 1000 + 3 * 3600000).k, 'hour'); assert.strictEqual(P.ago(1000, 1000 + 3 * 86400000).k, 'day')
})

function live() { const p = detect.plan(), r = {}; for (const q of detect.requests(p)) r[q.k] = q.a === 's' || q.a === 't' ? 'Automatic' : q.a === 'f' ? 'True' : q.a === 'x' ? 'True' : null; return detect.evaluate(r, p) }

test('pure: verdict, switchboard, preview and warnings follow the model', () => {
  const m = model.buildModel({ scope: 'windows', live: live(), remembered: { 'game-dvr': 'applied' }, meta: { sysmain: { safetyTier: 2 } }, applic: {} })
  assert.strictEqual(P.verdict(m, false).key, 'vDrift')
  assert.strictEqual(P.verdict(model.buildModel({ scope: 'windows', live: null }), false).key, 'vUnread')
  const clean = model.buildModel({ scope: 'qol', live: live(), remembered: {}, meta: {}, applic: {} })
  assert.strictEqual(P.verdict(clean, false).key, 'vOpen')
  const b = P.board(m)
  assert.strictEqual(b.length, m.lanes.length)
  assert.strictEqual(b.reduce((n, c) => n + c.cells.length, 0), m.items.length)
  const pv = P.previewGroups(m, ['game-dvr', 'sysmain', 'spectre-meltdown'])
  assert.strictEqual(pv.n, 3); assert.ok(pv.restorePoint); assert.deepStrictEqual(pv.expert, [])
  const hib = m.items.find(i => i.id === 'hibernate'), sys = m.items.find(i => i.id === 'sysmain')
  assert.deepStrictEqual(P.warnsFor(hib, { laptop: true }).map(w => w.key), ['warnLaptopHibernate'])
  assert.deepStrictEqual(P.warnsFor(hib, { laptop: false }), [])
  assert.deepStrictEqual(P.warnsFor(sys, { ramGB: 8 }), [{ key: 'warnLowRamSysmain', vars: { n: 8 } }])
  assert.deepStrictEqual(P.warnsFor(sys, { ramGB: 32 }), [])
})
