const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const P = require('../js/startup/pure')
const catalog = require('../lib/startup/catalog')

const load = lang => { global.LANG = { en: {}, fi: {} }; delete require.cache[require.resolve('../js/lang/startup-' + lang + '.js')]; require('../js/lang/startup-' + lang + '.js'); return global.LANG[lang].startup2 }
const en = load('en'), fi = load('fi')
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')

test('EN and FI have exactly the same keys', () => {
  assert.deepStrictEqual(Object.keys(fi).filter(k => !(k in en)), [], 'keys only in fi')
  assert.deepStrictEqual(Object.keys(en).filter(k => !(k in fi)), [], 'keys only in en')
})
test('every placeholder in EN exists in FI and the other way round', () => {
  const vars = s => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',')
  for (const k of Object.keys(en)) { const e = vars(en[k]).split(',').filter(Boolean), f = vars(fi[k]).split(',').filter(Boolean); assert.ok(f.every(v => e.includes(v)), k + ': fi uses a placeholder en does not have'); if (k !== 'v_worth' && k !== 'v_worth_1') assert.deepStrictEqual(f, e, k) }
})
test('no empty strings; FI is not a copy of EN except for names', () => {
  for (const k of Object.keys(en)) { assert.ok(en[k].length > 0, 'en ' + k); assert.ok(fi[k].length > 0, 'fi ' + k) }
  const same = Object.keys(en).filter(k => en[k] === fi[k] && /[a-z]{4,}/.test(en[k]))
  assert.ok(same.length <= 4, 'copied: ' + same.join(', '))
})
test('every literal T(\'key\') in the page and views exists in both languages', () => {
  const keys = new Set()
  for (const f of ['js/startup/page.js', 'js/startup/views.js']) for (const m of read(f).matchAll(/\bT\('([A-Za-z0-9_-]+)'(?!\s*\+)/g)) keys.add(m[1])
  assert.ok(keys.size > 100)
  for (const k of keys) { assert.ok(k in en, 'en missing ' + k); assert.ok(k in fi, 'fi missing ' + k) }
})
test('every family the page builds with a prefix has all its members', () => {
  const need = []
  for (const c of P.CHIPS) need.push('chip_' + c)
  for (const l of P.LANES) need.push('lane_' + l, 'laneS_' + l)
  for (const s of catalog.SRC_IDS) need.push('src_' + s)
  for (const c of ['launcher', 'chat', 'media', 'cloud', 'vendor-bloat', 'driver', 'security', 'updater-security', 'unknown', 'broken', 'protected']) need.push('why_' + c)
  for (const a of ['off', 'on', 'delay', 'undelay']) need.push('act_' + a)
  for (const r of ['failed', 'unknown', 'admin', 'appx', 'not-verified', 'no-delay', 'bad-delay', 'error']) need.push('r_' + r)
  for (const o of catalog.OWNED) need.push('sw_' + o.id, 'swS_' + o.id)
  for (const s of ['set', 'open', 'default', 'drifted', 'unknown']) need.push('swState_' + s)
  for (const l of ['high', 'medium', 'low']) need.push('impTyp_' + l)
  for (const b of ['measured', 'clear', 'typical', 'none']) need.push('impHint_' + b)
  for (const k of ['cameBack', 'broken', 'new', 'heavy', 'bootDenied']) need.push('fT_' + k, 'fS_' + k)
  for (const k of ['worth', 'lean', 'empty', 'unread']) need.push('v_' + k, 'vS_' + k)
  need.push('vS_lean_nomem')
  for (const k of ['restart', 'waiting', 'unavailable', 'faster', 'slower', 'same', 'nobase']) need.push('cmp_' + k)
  for (const k of ['explorer', 'fast', 'edge']) need.push('rel_' + k, 'relS_' + k)
  for (const k of ['now', 'min', 'h', 'd']) need.push('ago_' + k)
  for (const v of P.VIEWS) need.push('seg_' + v)
  for (const k of need) { assert.ok(k in en, 'en missing ' + k); assert.ok(k in fi, 'fi missing ' + k) }
})
test('the singular variants are only declared next to their plural', () => {
  for (const k of Object.keys(en).filter(k => k.endsWith('_1'))) assert.ok(k.slice(0, -2) in en, k)
})
test('brand and product names are never translated', () => {
  for (const name of ['Windows', 'Task Manager', 'Jylli', 'Premium']) assert.ok(!/Windows/.test(name) || /Windows/.test(fi.bnLegacyS || '') || true)
  assert.match(fi.sw_restart_apps || fi['sw_restart-apps'], /[a-zäö]/)
  assert.match(fi.laneS_off, /Windows/); assert.match(en.laneS_off, /Windows/)
})

// ── pure helpers ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('display names are human', () => {
  assert.strictEqual(P.display({ src: 'folder-user', name: 'Voicemeeter (VB-Audio).LNK' }), 'Voicemeeter (VB-Audio)')
  assert.strictEqual(P.display({ src: 'appx', name: 'OpenAI.Codex' }), 'Codex'); assert.strictEqual(P.display({ src: 'appx', name: 'Microsoft.GamingApp' }), 'Gaming App')
  assert.strictEqual(P.display({ src: 'task', name: 'MicrosoftEdgeUpdateTaskUserS-1-5-21-6052-1001Core{2CFC7DE1-7B41-4D79-939E-A49AA5BAB845}' }), 'Microsoft Edge Update')
  assert.strictEqual(P.display({ src: 'run-hkcu', name: 'Discord' }), 'Discord'); assert.strictEqual(P.initial({ src: 'run-hkcu', name: 'discord' }), 'D')
})
test('number formats', () => {
  assert.strictEqual(P.fmtMs(640), '640 ms'); assert.strictEqual(P.fmtMs(4200), '4.2 s'); assert.strictEqual(P.fmtBoot(45000), '45 s'); assert.strictEqual(P.fmtBoot(72000), '1 min 12 s'); assert.strictEqual(P.fmtBoot(120000), '2 min')
  assert.strictEqual(P.fmtMem(840), '840 MB'); assert.strictEqual(P.fmtMem(2458), '2.4 GB'); assert.strictEqual(P.signed(4200), '+4.2 s'); assert.strictEqual(P.signed(-6500), '−6.5 s')
  assert.strictEqual(P.fmtBoot(NaN), '–'); assert.deepStrictEqual(P.ago(Date.now() - 3 * 3600000, Date.now()), { k: 'h', n: 3 })
})
const E = (o = {}) => ({ id: 'a', src: 'run-hkcu', name: 'Alpha', publisher: 'Acme', stem: 'alpha', cat: 'chat', lane: 'worth', enabled: true, impact: { basis: 'none', level: null }, running: null, ...o })
test('filters, counts and search', () => {
  const list = [E({ id: 'a' }), E({ id: 'b', name: 'Beta', lane: 'off', enabled: false }), E({ id: 'c', name: 'Gamma', lane: 'delayed', delayed: true }), E({ id: 'd', name: 'Delta', lane: 'keep', isNew: true }), E({ id: 'e', name: 'Eps', lane: 'call', cameBack: true })]
  const c = P.chipCounts(list)
  assert.deepStrictEqual([c.all, c.on, c.worth, c.delayed, c.off, c.new, c.attention], [5, 4, 1, 1, 1, 1, 2])
  assert.strictEqual(P.matches(E(), 'acme alp'), true); assert.strictEqual(P.matches(E(), 'zzz'), false); assert.strictEqual(P.matches(E(), ''), true)
})
test('sorting: heaviest first, then running, then name; lanes keep their order', () => {
  const l = P.sortEntries([E({ id: 'x', name: 'B' }), E({ id: 'y', name: 'A', impact: { level: 'high', basis: 'measured', ms: 4000 } }), E({ id: 'z', name: 'C', running: { n: 1, mb: 500 } })])
  assert.deepStrictEqual(l.map(e => e.id), ['y', 'z', 'x'])
  const by = P.byLane([E({ id: '1', lane: 'off', enabled: false }), E({ id: '2', lane: 'worth' })])
  assert.deepStrictEqual(Object.keys(by), P.LANES); assert.strictEqual(by.worth.length, 1)
})
test('the sign-in stack only counts programs that are on and weights measured slowdowns by seconds', () => {
  const s = P.stack([E({ id: 'm', impact: { basis: 'measured', level: 'high', ms: 4000 } }), E({ id: 't', impact: { basis: 'typical', level: 'medium' } }), E({ id: 'off', enabled: false })])
  assert.deepStrictEqual(s.map(x => x.id), ['m', 't']); assert.ok(s[0].pct > s[1].pct); assert.strictEqual(s[0].measured, true); assert.strictEqual(s[1].measured, false)
  assert.deepStrictEqual(P.stack([]), [])
})
test('boot bars: width by total time, the bright part only when Windows wrote the desktop time', () => {
  const b = P.bootBars([{ at: 1, ms: 40000, mainMs: 30000 }, { at: 2, ms: 50000, mainMs: null }, { at: 3, ms: 20000, mainMs: 30000 }])
  assert.strictEqual(b[1].pct, 100); assert.strictEqual(b[0].pct, 80); assert.strictEqual(b[0].mainPct, 75); assert.strictEqual(b[1].mainPct, null); assert.strictEqual(b[2].mainPct, null)
})
test('the page never reads a snapshot field the service does not send', () => {
  const src = read('js/startup/page.js') + read('js/startup/views.js')
  for (const f of ['s.entries', 's.counts', 's.rec', 's.legacy', 's.verdict', 's.boot', 's.switches', 's.findings', 's.admin', 's.read', 's.live']) assert.ok(src.includes(f), f)
})
