'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.join(__dirname, '..')
const LANG = { en: {}, fi: {} }
for (const f of ['fivem-en.js', 'fivem-fi.js']) vm.runInNewContext(fs.readFileSync(path.join(root, 'js', 'lang', f), 'utf8'), { LANG })
const EN = LANG.en.fivem2, FI = LANG.fi.fivem2

const Cat = require('../lib/fivem/catalog')
const Ready = require('../lib/fivem/readiness')
const Verdict = require('../lib/fivem/route-verdict')
const Sig = require('../lib/fivem/signatures')
const Mods = require('../lib/fivem/mods')
const Attr = require('../lib/fivem/attribution')
const Gfx = require('../lib/fivem/graphics')
const Ini = require('../lib/fivem/ini')
const Radar = require('../js/fivem/radar')
const Page = require('../js/fivem/page')
const Views = require('../js/fivem/views')

const ph = s => (String(s).match(/\{\w+\}/g) || []).sort().join(',')

test('lang: EN and FI have the same keys and the same placeholders', () => {
  assert.deepEqual(Object.keys(EN).sort(), Object.keys(FI).sort())
  for (const k of Object.keys(EN)) assert.equal(ph(EN[k]), ph(FI[k]), k)
})
test('lang: Finnish is actually translated (almost nothing identical to English)', () => {
  const same = Object.keys(EN).filter(k => EN[k] === FI[k] && /\s/.test(EN[k]))
  assert.ok(same.length < 8, same.join(', '))
})
test('lang: no empty strings', () => { for (const k of Object.keys(EN)) { assert.ok(EN[k].trim(), 'en ' + k); assert.ok(FI[k].trim(), 'fi ' + k) } })

test('lang: every literal T() key used by the page and the views exists', () => {
  const used = new Set()
  for (const f of ['page.js', 'views.js']) for (const m of fs.readFileSync(path.join(root, 'js', 'fivem', f), 'utf8').matchAll(/\bT\('([^']+)'/g)) used.add(m[1])
  const prefixes = [...used].filter(k => /_$/.test(k))
  const missing = [...used].filter(k => !/_$/.test(k) && !(k in EN))
  assert.deepEqual(missing, [])
  assert.ok(prefixes.length > 10)
})
test('lang: dynamic keys have copy for every id they can be built from', () => {
  const need = []
  for (const id of Cat.IDS) { need.push('n_' + id, 'd_' + id); if (Cat.get(id).risk === 'confirm') need.push('r_' + id, 'cf_' + id + '_t') }
  for (const r of Ready.RULES) if (r.id !== 'route') { need.push('t_' + r.id, 'w_' + r.id); if (r.action) need.push('a_' + r.id) }
  for (const v of Verdict.VERDICTS) need.push('v_' + v, 'vd_' + v)
  for (const s of Sig.IDS) need.push('sig_' + s, 'sigf_' + s)
  for (const m of Mods.IDS) need.push('mod_' + m)
  for (const c of [...Attr.CAUSES, 'unknown']) need.push('cause_' + c)
  for (const d of Gfx.DEFS) { need.push('g_' + d.key); for (const o of d.opts) if (/^[a-z]/i.test(o[1])) need.push('o_' + o[1]) }
  for (const g of Gfx.GROUPS) need.push('gg_' + g)
  for (const k of Object.keys(Ini.KNOWN)) need.push('kd_' + k)
  for (const l of Cat.LEGACY) need.push('ln_' + l)
  for (const v of ['icmp', 'tcp']) need.push('via_' + v)
  for (const s of ['home', 'isp', 'transit', 'server']) need.push('seg_' + s)
  for (const v of Page.VIEWS) need.push('seg_' + v)
  for (const e of ['bad-input', 'bad-code', 'unresolved', 'too-many', 'network']) need.push('addErr_' + e)
  for (const e of ['x', 'game-running', 'no-file', 'corrupt', 'verify-failed', 'write-failed']) need.push('werr_' + e)
  for (const e of ['x', 'admin-required', 'not-installed', 'reg-failed', 'ps-failed', 'no-exe', 'bad-path', 'defender-refused', 'unknown', 'failed']) need.push('aerr_' + e)
  for (const e of ['x', 'dns', 'unknown', 'spawn-failed', 'bad-ip']) need.push('traceFail_' + e)
  for (const e of ['now', 'min', 'hour', 'day']) need.push('ago_' + e)
  for (const e of ['spike', 'loss', 'down']) need.push('net_' + e)
  for (const e of ['all', 'error', 'warn']) need.push('lf_' + e)
  for (const e of ['performance', 'balanced', 'quality']) need.push('pre_' + e)
  for (const e of ['browser', 'subprocess', 'private', 'nui']) need.push('cf_' + e)
  for (const e of ['dur', 'avg', 'low1', 'hitches']) need.push('ss_' + e)
  for (const e of ['icmp', 'tcp', 'jitter', 'loss', 'hops', 'mtu']) need.push('st_' + e)
  for (const e of ['addr', 'seg', 'avg', 'jitter', 'loss']) need.push('th_' + e)
  for (const e of ['notInstalled', 'noGfx', 'corruptGfx']) need.push('e_' + e + 'T', 'e_' + e + 'B')
  assert.deepEqual(need.filter(k => !(k in EN)), [])
  assert.deepEqual(need.filter(k => !(k in FI)), [])
})
test('lang: every verdict lead only uses placeholders the page fills', () => {
  const given = new Set(['ip', 'ttl', 'loss', 'endLoss', 'jitter', 'avg', 'p95', 'via', 'n', 'need'])
  for (const v of Verdict.VERDICTS) for (const p of (EN['vd_' + v].match(/\{(\w+)\}/g) || [])) assert.ok(given.has(p.slice(1, -1)), v + ' ' + p)
})

// ── pure helpers ──────────────────────────────────────────────────────────────────
test('page: every verdict has a tone and the stat row never invents numbers', () => {
  for (const v of Verdict.VERDICTS) assert.ok(v in Page.TONE, v)
  assert.equal(Page.TONE.clean, 'ok'); assert.equal(Page.TONE['loss-isp'], 'danger')
  assert.deepEqual(Page.statRow(null, null), { icmp: null, tcp: null, jitter: null, loss: null, hops: 0, mtu: null })
  assert.equal(Page.players(null, 64), null); assert.equal(Page.players(12, 64), '12 / 64')
  assert.equal(Page.age(10 * 1000).k, 'now'); assert.equal(Page.age(3 * 3600000).k, 'hour')
})
test('views: paths break on missing samples and stay inside the box', () => {
  const d = Views.pathOf([10, null, 20, 30], 100, 50, 0, 40)
  assert.equal((d.match(/M/g) || []).length, 2)
  assert.ok(!/NaN/.test(d))
  assert.equal(Views.pathOf([1], 100, 50, 0, 1), '')
  assert.ok(/M0\.0 0\.0/.test(Views.pathOf([100], 10, 10, 0, 100).replace('', '')) || Views.pathOf([100, 100], 10, 10, 0, 100).startsWith('M0.0 0.0'))
  assert.equal(Views.secs(125), '2:05')
  assert.deepEqual(Views.causeCounts([{ primary: 'thermal' }, { primary: 'thermal' }, { primary: 'unknown' }]), { thermal: 2, unknown: 1 })
})
test('radar: layout spans the width in order, segments are contiguous, tones follow the verdict rules', () => {
  const pos = Radar.layout(6, 800, 250)
  assert.equal(pos.length, 6); assert.ok(pos[0].x < pos[5].x && pos.every(p => p.x >= 0 && p.x <= 800 && p.y > 0 && p.y < 250))
  assert.deepEqual(Radar.spans([{ seg: 'home' }, { seg: 'home' }, { seg: 'isp' }, { seg: 'server' }]), [{ seg: 'home', from: 0, to: 1 }, { seg: 'isp', from: 2, to: 2 }, { seg: 'server', from: 3, to: 3 }])
  const lossy = { ttl: 2, hidden: false, stats: { n: 50, got: 40, lossPct: 20, jitter: 1 } }
  assert.equal(Radar.toneOf(lossy, { id: 'loss-isp', ttl: 2 }), 'danger')
  assert.equal(Radar.toneOf(lossy, { id: 'clean' }), 'limited')                 // rate limiting is not drawn as a fault
  assert.equal(Radar.toneOf({ ttl: 3, hidden: true, stats: { n: 5, got: 0 } }, null), 'hidden')
  assert.equal(Radar.dieChance(lossy, { id: 'clean' }), 0)
  assert.ok(Radar.dieChance(lossy, { id: 'loss-isp', ttl: 2 }) > 0)
  assert.ok(Radar.travel(0) < Radar.travel(100) && Radar.travel(1e6) <= 2.6)
})

// ── source hygiene (same rules tools/check-ui.js enforces for the other rebuilt tabs) ─────
test('source: no hex colours or colour inline styles in the FiveM page code', () => {
  for (const f of ['radar.js', 'page.js', 'views.js']) {
    const s = fs.readFileSync(path.join(root, 'js', 'fivem', f), 'utf8')
    assert.ok(!/#[0-9a-f]{3,8}\b/i.test(s.replace(/&#39;/g, '')), f + ' hex colour')
    assert.ok(!/style="[^"]*(color|background)/i.test(s), f + ' inline colour')
  }
})
test('css: tokens only, no hex, no tiny text, line-clamp untouched', () => {
  const css = fs.readFileSync(path.join(root, 'css', 'fivem.css'), 'utf8')
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(css), 'hex colour in css')
  for (const m of css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) assert.ok(Number(m[1]) >= 11, 'font-size ' + m[1])
  assert.ok(!/line-clamp/.test(css))
})
