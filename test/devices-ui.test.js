const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const P = require('../js/devices/pure')
const { classify, model, controls, findings, vendors, sources } = require('../lib/devices-all')

const load = lang => { global.LANG = { en: {}, fi: {} }; delete require.cache[require.resolve('../js/lang/devices-' + lang + '.js')]; require('../js/lang/devices-' + lang + '.js'); return global.LANG[lang].devices2 }
const en = load('en'), fi = load('fi')
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')
const PROBE = JSON.parse(read('test/fixtures/devices/probe-desktop.json'))
const snapOf = () => { const r = classify.classify(PROBE); const s = model.build({ probe: PROBE, records: r.devices, rig: null, state: {}, now: 1000 }); s.findings = findings.compute(s); return s }

test('EN and FI have exactly the same keys', () => {
  assert.deepStrictEqual(Object.keys(fi).filter(k => !(k in en)), [], 'keys only in fi')
  assert.deepStrictEqual(Object.keys(en).filter(k => !(k in fi)), [], 'keys only in en')
})
test('every placeholder in EN exists in FI and the other way round', () => {
  const vars = s => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',')
  for (const k of Object.keys(en)) assert.strictEqual(vars(fi[k]), vars(en[k]), k)
})
test('no empty strings; FI is not a copy of EN except for names', () => {
  for (const k of Object.keys(en)) { assert.ok(en[k].length > 0, 'en ' + k); assert.ok(fi[k].length > 0, 'fi ' + k) }
  const same = Object.keys(en).filter(k => en[k] === fi[k] && /[a-z]{4,}/.test(en[k]))
  assert.ok(same.length <= 4, 'copied: ' + same.join(', '))
})
test('every literal T(\'key\') in the page and views exists in both languages', () => {
  const keys = new Set()
  for (const f of ['js/devices/page.js', 'js/devices/views.js']) for (const m of read(f).matchAll(/\bT\('([A-Za-z0-9_-]+)'(?!\s*\+)/g)) keys.add(m[1])
  assert.ok(keys.size > 60, 'found ' + keys.size)
  for (const k of keys) { assert.ok(k in en, 'en missing ' + k); assert.ok(k in fi, 'fi missing ' + k) }
})
test('every family the page builds with a prefix has all its members', () => {
  const need = []
  for (const c of P.CHIPS) need.push('chip_' + c)
  for (const g of P.GROUPS) need.push('grp_' + g.id, 'grpS_' + g.id)
  for (const k of ['core', 'software', 'gone']) need.push('grp_' + k, 'grpS_' + k)
  for (const c of Object.keys(P.ICON)) need.push('cat_' + c)
  for (const c of ['mouse', 'keyboard', 'display', 'audio', 'gamepad', 'camera', 'rgb', 'bluetooth', 'other']) need.push('catN_' + c, 'catN_' + c + '_1')
  for (const c of ['usb', 'receiver', 'bluetooth', 'internal', 'display', 'software']) need.push('conn_' + c)
  for (const s of P.SOURCES) need.push('src_' + s)
  for (const c of P.CONFIDENCE) need.push('conf_' + c)
  for (const r of P.REASONS) need.push('why_' + r)
  for (const k of new Set([...P.FACT_ORDER, 'maker'])) if (k !== 'maker') need.push('f_' + k)
  for (const n of ['abbreviated', 'conflict', 'chipMaker', 'generic', 'approx']) need.push('note_' + n)
  for (const s of sources.SECTIONS) need.push('sec_' + s)
  for (const k of P.INFO) need.push('info_' + k)
  for (const c of controls.CONTROLS.filter(x => x.kind === 'link')) need.push('lk_' + c.id, 'lkS_' + c.id)
  for (const f of ['device_problem', 'polling_low', 'section_failed', 'many_unknown']) need.push('fT_' + f, 'fS_' + f)
  for (const k of ['now', 'min', 'h', 'd']) need.push('ago_' + k)
  for (const k of ['few', 'none']) need.push('pollRes_' + k)
  for (const k of ['input', 'output']) need.push('flow_' + k)
  for (const k of ['on', 'off', 'unknown']) need.push('st_' + k)
  for (const k of need) { assert.ok(k in en, 'en missing ' + k); assert.ok(k in fi, 'fi missing ' + k) }
})
test('findings the engine can raise all have text', () => {
  const ids = require('fs').readFileSync(path.join(__dirname, '../lib/devices/findings.js'), 'utf8').match(/id: '([a-z_]+)'/g).map(s => s.slice(5, -1))
  assert.ok(ids.length >= 4)
  for (const id of ids) { assert.ok('fT_' + id in en && 'fS_' + id in en, id) }
})
test('the singular variants are only declared next to their plural', () => {
  for (const k of Object.keys(en).filter(k => k.endsWith('_1'))) assert.ok(k.slice(0, -2) in en, k)
})
test('product and unit names are never translated', () => {
  for (const k of ['info_dpi']) assert.strictEqual(fi[k], 'DPI')
  assert.match(fi.kbdWhy, /Windows/); assert.match(fi.ctl_linkS, /Windows/); assert.match(fi.openWin, /Windows/)
  assert.match(fi.pollRunning, /\{n\}/); assert.match(fi.fT_polling_low, /Hz/)
})

// ── pure helpers ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('groups: every category the engine can produce lands in a group', () => {
  const cats = ['mouse', 'keyboard', 'gamepad', 'audio', 'display', 'camera', 'rgb', 'bluetooth', 'other']
  for (const c of cats) assert.ok(P.GROUPS.some(g => g.cats.includes(c)), c)
  assert.strictEqual(P.groupOf('mouse'), 'input'); assert.strictEqual(P.groupOf('rgb'), 'other'); assert.strictEqual(P.groupOf('something-new'), 'other')
  const classes = new Set(); for (const g of P.GROUPS) for (const c of g.cats) assert.ok(!classes.has(c), 'duplicate ' + c) || classes.add(c)
})
test('layout and chips on the real capture', () => {
  const s = snapOf()
  const c = P.chipCounts(s)
  assert.strictEqual(c.all, s.devices.length)
  assert.strictEqual(c.input, 3); assert.strictEqual(c.displays, 2); assert.strictEqual(c.audio, 3)
  assert.strictEqual(c.software, s.software.length)
  const all = P.layout(s, 'all', '')
  assert.deepStrictEqual(all.map(x => x.id), ['input', 'displays', 'audio', 'other', 'software'])
  assert.deepStrictEqual(P.layout(s, 'input', '').map(x => x.id), ['input'])
  assert.deepStrictEqual(P.layout(s, 'gone', ''), [])
  assert.deepStrictEqual(P.layout(null, 'all', ''), [])
})
test('search matches title, maker, ids and category words', () => {
  const s = snapOf()
  const find = q => P.layout(s, 'all', q).flatMap(x => x.items).map(d => d.title)
  assert.deepStrictEqual(find('wlmouse'), ['WLMOUSE BEAST MAX'])
  assert.ok(find('logitech').some(t => /PRO Gaming/.test(t)))
  assert.ok(find('36a7').some(t => /WLMOUSE/.test(t)))
  assert.ok(find('mouse').length >= 2)
  assert.deepStrictEqual(find('zzzz-nothing'), [])
  assert.deepStrictEqual(find('msi 244'), ['MSI MAG 244F'])
})
test('tone and summary', () => {
  const s = snapOf()
  assert.strictEqual(P.tone(null), 'idle'); assert.strictEqual(P.tone({ read: false }), 'idle')
  assert.strictEqual(P.tone(s), 'warn', 'this capture has a Bluetooth radio with a problem')
  assert.strictEqual(P.tone(Object.assign({}, s, { problems: 0 })), 'ok')
  assert.strictEqual(P.tone(Object.assign({}, s, { problems: 0, sections: { hid: { ok: false } } })), 'warn')
  assert.deepStrictEqual(P.summary(s).slice(0, 3), [{ cat: 'mouse', n: 2 }, { cat: 'keyboard', n: 1 }, { cat: 'display', n: 2 }])
})
test('fact rows follow a fixed order and include unknowns', () => {
  const s = snapOf()
  const wl = s.devices.find(d => /WLMOUSE/.test(d.title))
  const rows = P.rowsOf(wl)
  assert.deepStrictEqual(rows.slice(0, 3), ['vendor', 'model', 'connection'])
  assert.ok(rows.includes('polling') && rows.includes('ids'))
  assert.strictEqual(new Set(rows).size, rows.length)
  for (const k of rows) assert.ok(('f_' + k) in en, k)
})
test('keyboard repeat labels follow the documented Windows ranges', () => {
  assert.deepStrictEqual(P.KBD_DELAY.map(P.repeatDelayMs), [250, 500, 750, 1000])
  assert.strictEqual(P.repeatCps(0), 2.5); assert.strictEqual(P.repeatCps(31), 30)
  assert.ok(P.repeatCps(15) > 15 && P.repeatCps(15) < 17)
})
test('ago', () => {
  const now = Date.now()
  assert.deepStrictEqual(P.ago(now - 30 * 1000, now), { k: 'now', n: 0 })
  assert.deepStrictEqual(P.ago(now - 5 * 60000, now), { k: 'min', n: 5 })
  assert.deepStrictEqual(P.ago(now - 3 * 3600000, now), { k: 'h', n: 3 })
  assert.deepStrictEqual(P.ago(now - 4 * 86400000, now), { k: 'd', n: 4 })
  assert.strictEqual(P.ago(now + 5000, now), null); assert.strictEqual(P.ago('x', now), null)
})
test('the page never writes colours or sizes inline, and only calls engine functions that exist in preload', () => {
  const page = read('js/devices/page.js') + read('js/devices/views.js')
  assert.ok(!/style="[^"]*(#[0-9a-f]{3,6}|rgb\(|color:)/i.test(page), 'inline colours')
  const preload = read('preload.js')
  for (const m of page.matchAll(/api\.(devices2\w+)\(/g)) assert.ok(preload.includes(m[1] + ':'), m[1] + ' missing in preload.js')
  const main = read('main.js')
  for (const ch of ['scan', 'poll', 'kbd-set', 'kbd-undo', 'forget', 'open-app']) { assert.ok(main.includes("'devices2-" + ch + "'"), ch); assert.ok(preload.includes("'devices2-" + ch + "'"), ch) }
})
test('the tab is registered everywhere a tab must be', () => {
  const routes = require('../js/routes')
  assert.ok(routes.SECTIONS.find(s => s.id === 'system').tabs.some(t => t.id === 'devices' && !t.premium), 'free tab in System')
  assert.deepStrictEqual(routes.resolve('devices'), { section: 'system', tab: 'devices', page: 'devices', premium: false })
  assert.match(read('js/shell.js'), /devices: 'tabDevices'/); assert.match(read('js/shell.js'), /devices: c => JylliDevicesPage\.mount\(c\)/)
  assert.match(read('js/lang/en.js'), /tabDevices:'Devices'/); assert.match(read('js/lang/fi.js'), /tabDevices:'Laitteet'/)
  const copy = read('lib/discord/copy.js'); assert.match(copy, /devices: 'Checking connected devices'/); assert.match(copy, /devices: 'Tarkistaa/)
  const html = read('index.html')
  for (const f of ['css/devices.css', 'js/lang/devices-en.js', 'js/lang/devices-fi.js', 'js/devices/pure.js', 'js/devices/views.js', 'js/devices/page.js']) assert.ok(html.includes('"' + f + '"'), f)
  assert.ok(html.indexOf('js/devices/pure.js') < html.indexOf('js/devices/views.js') && html.indexOf('js/devices/views.js') < html.indexOf('js/devices/page.js'))
})
test('the vendor table and the engine agree on which controls exist', () => {
  assert.ok(controls.CONTROLS.every(c => c.cats.every(x => ['mouse', 'keyboard', 'gamepad', 'audio', 'rgb'].includes(x))))
  assert.ok(vendors.appFor('046D') && vendors.appFor('046D').name === 'Logitech G HUB')
  assert.strictEqual(vendors.appFor('3142'), null)
})
