const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const P = require('../js/apps/pure')
const known = require('../lib/apps/known')
const catalog = require('../lib/apps/catalog')
const findings = require('../lib/apps/findings')
const rules = require('../lib/apps/rules')

const load = lang => { global.LANG = { en: {}, fi: {} }; delete require.cache[require.resolve('../js/lang/apps-' + lang + '.js')]; require('../js/lang/apps-' + lang + '.js'); return global.LANG[lang].apps2 }
const en = load('en'), fi = load('fi')

test('apps2: en and fi have exactly the same keys, and every {var} survives the translation', () => {
  assert.deepStrictEqual(Object.keys(en).sort(), Object.keys(fi).sort())
  const vars = s => (String(s).match(/\{\w+\}/g) || []).sort().join(',')
  for (const k of Object.keys(en)) assert.strictEqual(vars(fi[k]), vars(en[k]), k)
  for (const k of Object.keys(en)) assert.ok(String(fi[k]).trim().length > 0, k)
})

test('every literal T(\'key\') in the page and views exists', () => {
  const src = ['page.js', 'views.js'].map(f => fs.readFileSync(path.join(__dirname, '..', 'js', 'apps', f), 'utf8')).join('\n')
  const keys = new Set([...src.matchAll(/\bT\('([A-Za-z0-9_-]+)'/g)].map(m => m[1]).filter(k => !k.endsWith('_')))   // 'seg_' + id style prefixes are covered by the family test
  assert.ok(keys.size > 80)
  for (const k of keys) assert.ok(k in en, 'missing ' + k)
})

test('every dynamic key family is complete', () => {
  const need = []
  for (const v of P.VIEWS) need.push('seg_' + v)
  for (const c of ['all', 'running', 'attention', ...P.CATS]) need.push('chip_' + c)
  for (const r of known.ROLES) need.push('role_' + r, 'gtWhy_' + r, 'gtWhy_' + r + '_long')
  for (const l of rules.LEVELS) need.push('lv_' + l, 'lvS_' + l)
  for (const r of catalog.ROWS) need.push('row_' + r.id, 'rowS_' + r.id)
  for (const s of ['on', 'native', 'off', 'partial', 'drifted', 'elsewhere', 'unknown']) need.push('st_' + s)
  for (const k of findings.KINDS) need.push('fT_' + k.replace(/-/g, '_'), 'fS_' + k.replace(/-/g, '_'))
  for (const v of findings.VERDICTS) need.push('v_' + v)
  for (const k of ['vS_quiet', 'vS_quiet_nv', 'vS_busy', 'vS_busy_nv', 'vS_attention', 'vS_game', 'vS_game0', 'vS_unknown', 'vS_empty', 'v_attention_1', 'gtNow', 'gtNow_1']) need.push(k)
  for (const c of ['Idle', 'BelowNormal', 'Normal', 'AboveNormal', 'High']) need.push('cls_' + c)
  for (const r of ['failed', 'unknown', 'not-here', 'unread', 'elsewhere', 'not-ours', 'error', 'not-verified']) need.push('r_' + r)
  for (const a of ['now', 'min', 'h', 'd']) need.push('ago_' + a)
  for (const d of ['min', 'h']) need.push('dur_' + d)
  for (const k of need) assert.ok(k in en, 'missing ' + k)
})

test('every known app has a name, and icon files that are named exist', () => {
  for (const a of known.APPS) assert.ok(P.NAMES[a.id], a.id)
  for (const [id, f] of Object.entries(P.ICONS)) assert.ok(fs.existsSync(path.join(__dirname, '..', 'assets', 'apps', f)), id + ' ' + f)
})

test('formatting', () => {
  assert.strictEqual(P.fmtMem(840), '840 MB')
  assert.strictEqual(P.fmtMem(2458), '2.4 GB')
  assert.strictEqual(P.fmtMem(null), '0 MB')
  assert.strictEqual(P.fmtMem('x'), '–')
  assert.strictEqual(P.fmtPct(0.04), '<0.1 %')
  assert.strictEqual(P.fmtPct(0), '0 %')
  assert.strictEqual(P.fmtPct(3.26), '3.3 %')
  assert.strictEqual(P.fmtPct(12.4), '12 %')
  assert.strictEqual(P.fmtVram(null), '–')
  assert.strictEqual(P.fmtVram(0), '0 MB')
  assert.deepStrictEqual(P.ago(Date.now() - 5 * 60000), { k: 'min', n: 5 })
  assert.deepStrictEqual(P.fmtDur(30), { k: 'min', n: 1 })
  assert.deepStrictEqual(P.fmtDur(5400), { k: 'h', n: 1.5 })
})

const A = (id, o = {}) => ({ id, cat: 'browsers', role: 'browser', vendor: 'V', running: false, cost: null, rows: [], rec: [], drift: false, ...o })
test('filters, search and sort', () => {
  const apps = [A('chrome', { running: true, cost: { ram: 900 }, rec: ['x'] }), A('discord', { cat: 'comms', running: true, cost: { ram: 300 } }), A('edge', { drift: true }), A('brave', {})]
  assert.deepStrictEqual(apps.filter(a => P.chipMatch(a, 'running')).map(a => a.id), ['chrome', 'discord'])
  assert.deepStrictEqual(apps.filter(a => P.chipMatch(a, 'attention')).map(a => a.id), ['chrome', 'edge'])
  assert.deepStrictEqual(apps.filter(a => P.chipMatch(a, 'comms')).map(a => a.id), ['discord'])
  const c = P.chipCounts(apps)
  assert.deepStrictEqual([c.all, c.running, c.attention, c.browsers, c.comms], [4, 2, 2, 3, 1])
  assert.deepStrictEqual(apps.filter(a => P.matches(a, 'google chr')).map(a => a.id), ['chrome'])
  assert.deepStrictEqual(apps.filter(a => P.matches(a, 'v browsers')).length, 3, 'vendor and group are searched')
  assert.deepStrictEqual(P.sortApps(apps).map(a => a.id), ['chrome', 'discord', 'brave', 'edge'])
})

test('status helpers: a value somebody else set is never a switch', () => {
  assert.ok(P.canSwitch({ status: 'off' }) && P.canSwitch({ status: 'on' }) && P.canSwitch({ status: 'drifted' }))
  assert.ok(!P.canSwitch({ status: 'elsewhere' }) && !P.canSwitch({ status: 'unknown' }) && !P.canSwitch({ status: 'native' }))
  assert.ok(P.isSet({ status: 'native' }) && !P.isSet({ status: 'drifted' }))
})

test('barParts: shares add up, tiny shares stay visible, empty = no bar', () => {
  assert.deepStrictEqual(P.barParts([]), [])
  assert.deepStrictEqual(P.barParts([{ id: 'a', v: 0 }]), [])
  const parts = P.barParts([{ id: 'a', v: 900 }, { id: 'b', v: 99 }, { id: 'c', v: 1 }])
  assert.strictEqual(parts[0].pct, 90)
  assert.ok(parts[2].pct >= 1.5)
  assert.strictEqual(P.spark([1], 64, 20), '')
  assert.match(P.spark([1, 3, 2], 64, 20), /^M2\.0 /)
})
