const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs'), path = require('path')
const S = require('../js/gameconfig/sheet')
const Cat = require('../lib/gameconfig/catalog')

const rows = [
  { key: 'setting.mat_vsync', group: 'display', type: 'bool01', current: '1', rec: '0', recOpen: true },
  { key: 'setting.msaa_samples', group: 'graphics', type: 'choice', current: '4' },
  { key: 'maxFps', group: 'performance', type: 'int', current: '120' },
]

test('pendingChanges drops edits that equal the current value, comparing numbers and case loosely', () => {
  assert.deepStrictEqual(S.pendingChanges(rows, { 'setting.mat_vsync': '0', 'setting.msaa_samples': '4', maxFps: '120.000000' }), { 'setting.mat_vsync': '0' })
  assert.deepStrictEqual(S.pendingChanges(rows, { nope: '1' }), {})
})

test('recommended lists only open recommendations; tabs show only groups that have rows', () => {
  assert.deepStrictEqual(S.recommended(rows), { 'setting.mat_vsync': '0' })
  assert.deepStrictEqual(S.recommended([{ ...rows[0], recOpen: false }]), {})
  assert.deepStrictEqual(S.tabsFor(rows), ['all', 'display', 'graphics', 'performance'])
  assert.deepStrictEqual(S.tabsFor([rows[0]]), ['all', 'display'])
})

test('every catalog setting has an English and a Finnish row label, and every reason used has text', () => {
  const load = f => { const L = { en: {}, fi: {} }; new Function('LANG', fs.readFileSync(path.join(__dirname, '..', 'js', 'lang', f), 'utf8'))(L); return L }
  const en = load('gamecfg-en.js').en.gamecfg, fi = load('gamecfg-fi.js').fi.gamecfg
  for (const id of Cat.IDS) {
    assert.ok(en['n_' + id] && fi['n_' + id], 'name ' + id)
    for (const s of Cat.get(id).settings) {
      const k = 'k_' + s.key.split('|').pop().replace(/[^\w]/g, '_')
      assert.ok(en[k] && fi[k], 'label ' + k)
      if (s.rec) assert.ok(en['why_' + s.rec.why] && fi['why_' + s.rec.why], 'why ' + s.rec.why)
    }
  }
  assert.deepStrictEqual(Object.keys(en).sort(), Object.keys(fi).sort())
})
