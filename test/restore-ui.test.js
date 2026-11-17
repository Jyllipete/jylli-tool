'use strict'
// Restore points "Lifeline" page: pure helpers, HTML builders, and the LANG contract (every key the page can ask for exists in en AND fi).
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs'), path = require('path')
const P = require('../js/restore/pure')
global.LANG = { en: {}, fi: {} }
require('../js/lang/restore-en.js'); require('../js/lang/restore-fi.js')
const V = require('../js/restore/views')

const GB = 1024 ** 3
test('filter and counts', () => {
  const pts = [{ group: 'jylli' }, { group: 'windows' }, { group: 'jylli' }]
  assert.equal(P.filterPoints(pts, 'jylli').length, 2); assert.equal(P.filterPoints(pts, 'all').length, 3)
  assert.deepEqual(P.counts(pts), { all: 3, jylli: 2, windows: 1 })
})
test('age buckets', () => {
  assert.equal(P.age(30000).key, 'age_now'); assert.deepEqual(P.age(5 * 60000), { key: 'age_min', n: 5 }); assert.deepEqual(P.age(3 * 3600000), { key: 'age_hour', n: 3 })
  assert.deepEqual(P.age(2 * 86400000), { key: 'age_day', n: 2 }); assert.equal(P.age(90 * 86400000).key, 'age_month'); assert.equal(P.age(null).key, 'age_unknown')
})
test('bytes, shares and the nearest offered cap', () => {
  assert.equal(P.fmtBytes(0.5 * GB), '512 MB'); assert.equal(P.fmtBytes(2.34 * GB), '2.3 GB'); assert.equal(P.fmtBytes(40 * GB), '40 GB'); assert.equal(P.fmtBytes(null), '–')
  assert.equal(P.usedShare({ has: true, used: 5, max: 10 }), 0.5); assert.equal(P.usedShare({ has: true, used: 5, max: null }), null)
  assert.equal(P.capPercent({ has: true, max: 10 * GB }, { size: 100 * GB }), 10)
  assert.equal(P.nearestPct(10.4, [2, 5, 10, 15]), 10); assert.equal(P.nearestPct(7.5, [2, 5, 10, 15]), null); assert.equal(P.nearestPct(null, [2]), null)
})
test('tick height grows with the batch but stays bounded', () => {
  assert.ok(P.tickHeight(1) < P.tickHeight(50)); assert.ok(P.tickHeight(100000) <= 40)
})

const T = (k, v) => (v ? k + JSON.stringify(v) : k)
const ctx = S => ({ T, esc: s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])), P, S })
const snap = over => ({ read: true, admin: true, drive: 'C:', protection: 'on', policy: { blocked: false }, vss: { disabled: false }, storage: { has: true, used: GB, max: 10 * GB }, volume: { size: 100 * GB, free: 50 * GB },
  points: [{ seq: 4, desc: 'JylliTool_Manual - Mine', at: Date.now() - 3600000, origin: 'manual', group: 'jylli', arg: 'Mine', after: 2 }], newestAt: Date.now() - 3600000, since: 2, unprotected: 0, room: 8,
  line: { from: Date.now() - 30 * 86400000, to: Date.now(), points: [{ seq: 4, x: 0.99, origin: 'manual', group: 'jylli' }], ticks: [{ x: 0.99, n: 2, since: 2, old: 0, names: ['a', 'b'] }], older: 0, sinceFrom: 0.99, since: true },
  verdict: { kind: 'covered', tone: 'ok', cta: 'create', vars: { n: 1, since: 2 } }, findings: [], schedule: { days: 3, lastAt: null, nextAt: null }, capPcts: [2, 5, 10, 15], pending: null, lastRestore: null, ...over })

test('names: the app\'s own points are decoded, Windows\' are shown as written', () => {
  const c = ctx({})
  assert.equal(V.nameOf(c, { origin: 'manual', arg: 'Mine', desc: 'x' }), 'n_manual_l{"arg":"Mine"}')
  assert.equal(V.nameOf(c, { origin: 'manual', arg: '', desc: 'x' }), 'n_manual{"arg":""}')
  assert.equal(V.nameOf(c, { origin: 'beforeTweak', arg: 'msi', argName: 'MSI mode' }), 'n_beforeTweak{"arg":"MSI mode"}')
  assert.equal(V.nameOf(c, { origin: 'windowsUpdate', desc: 'Windows Update' }), 'Windows Update')
  assert.equal(V.nameOf(c, { origin: 'windows', desc: '' }), 'n_unnamed')
})
test('stage: the CTA follows the verdict and a busy page offers no second action', () => {
  const S = { snap: snap({}) }
  assert.match(V.stage(ctx(S)).html, /data-act="create"/)
  S.snap = snap({ verdict: { kind: 'off', tone: 'danger', cta: 'protect', vars: { policy: 1 } } })
  const off = V.stage(ctx(S)); assert.match(off.html, /data-act="protect"/); assert.equal(off.tone, 'danger'); assert.match(off.html, /vS_off_policy/)
  S.snap = snap({ verdict: { kind: 'noadmin', tone: 'warn', cta: 'relaunch', vars: {} } }); assert.match(V.stage(ctx(S)).html, /data-act="relaunch"/)
  S.creating = { phase: 'snapshot' }
  const busy = V.stage(ctx(S)); assert.match(busy.html, /disabled/); assert.doesNotMatch(busy.html, /data-act="create"/); assert.match(busy.html, /data-state="now"/)
})
test('stage: changes since the newest point are mentioned as covered, never as a warning', () => {
  const h = V.stage(ctx({ snap: snap({}) })).html
  assert.match(h, /vSAfter/)
})
test('list: loading, failed, unread, empty and filtered-empty are each their own state', () => {
  const l = S => V.list(ctx({ filter: 'all', ...S }))
  assert.match(l({ snap: null }), /aria-busy/)
  assert.match(l({ snap: null, failed: true }), /data-act="rescan"/)
  assert.match(l({ snap: snap({ read: false, points: [] }) }), /unreadT/)
  assert.match(l({ snap: snap({ points: [] }) }), /emptyT/)
  assert.match(l({ snap: snap({}), filter: 'windows' }), /data-act="clear-filter"/)
  assert.match(l({ snap: snap({}) }), /data-seq="4"/)
})
test('rows never invent a count: "after" only shows what the snapshot says', () => {
  const c = ctx({ snap: snap({}), sel: null })
  assert.match(V.row(c, { seq: 1, desc: 'd', at: Date.now(), origin: 'windows', group: 'windows', after: 0 }), /rs-after"><\/span>/)
  assert.match(V.row(c, { seq: 1, desc: 'd', at: Date.now(), origin: 'windows', group: 'windows', after: 3 }), /afterN/)
})
test('sheet: restore stays disabled until the user confirms, and says what is evidence and what is not', () => {
  const pv = { ok: true, point: { seq: 4, desc: 'd', at: Date.now(), origin: 'windows', group: 'windows' }, changes: [{ id: 'a', ts: 1, name: 'MSI' }], changeCount: 1, programsLater: [{ name: 'Foo', day: 1 }], programsLaterCount: 1, programsSame: [], programsSameCount: 0, ready: { admin: true, onBattery: true, diskLow: false } }
  const h = V.sheet(ctx({}), pv)
  assert.match(h, /data-go disabled/); assert.match(h, /data-ack/); assert.match(h, /chkPowerBad/); assert.match(h, /MSI/); assert.match(h, /shPrograms/)
})

// ── LANG contract ──
const en = LANG.en.restore2, fi = LANG.fi.restore2
test('LANG: en and fi have exactly the same keys', () => {
  const a = Object.keys(en).sort(), b = Object.keys(fi).sort()
  assert.deepEqual(a.filter(k => !(k in fi)), []); assert.deepEqual(b.filter(k => !(k in en)), [])
})
test('LANG: every key the page asks for exists, including the dynamic families', () => {
  const src = ['views.js', 'page.js'].map(f => fs.readFileSync(path.join(__dirname, '..', 'js', 'restore', f), 'utf8')).join('\n')
  // a key that ends in '_' (or is 'know') is a family prefix built at run time: the families are listed below
  const keys = new Set([...src.matchAll(/\bT\('([A-Za-z0-9_]+)'/g)].map(m => m[1]).filter(k => !k.endsWith('_') && k !== 'know'))
  const fam = (prefix, list) => list.forEach(x => keys.add(prefix + x))
  const kinds = ['unknown', 'noadmin', 'off', 'none', 'stale', 'covered']
  fam('v_', kinds); fam('vS_', kinds); keys.add('vS_off_policy')
  fam('fT_', ['none', 'unprotected', 'stale', 'policy', 'vss', 'storageHigh', 'capSmall', 'diskLow']); fam('fS_', ['none', 'unprotected', 'stale', 'policy', 'vss', 'storageHigh', 'capSmall', 'diskLow'])
  const origins = ['manual', 'beforeTweak', 'autoOpti', 'firstRun', 'debloat', 'diagnostics', 'scheduled', 'jylli', 'installer', 'driver', 'windowsUpdate', 'restoreOp', 'windows']
  fam('o_', origins); fam('n_', ['manual', 'manual_l', 'beforeTweak', 'autoOpti', 'firstRun', 'debloat', 'diagnostics', 'scheduled', 'jylli', 'restoreOp', 'unnamed'])
  fam('rc_', ['succeededT', 'succeededS', 'failedT', 'failedS', 'interruptedT', 'interruptedS', 'cancelledT', 'cancelledS', 'unknownT', 'unknownS'])
  fam('step_', ['check', 'snapshot', 'verify']); fam('sch_', ['off', 'day', 'days3', 'week']); fam('chip_', ['all', 'jylli', 'windows']); fam('know', ['1T', '1B', '2T', '2B', '3T', '3B'])
  fam('age_', ['now', 'min', 'hour', 'day', 'month', 'unknown']); fam('r_', ['not_admin', 'not_confirmed', 'failed', 'busy', 'invalid', 'not_found', 'delete_failed', 'still_there', 'error', 'restore_failed'])
  const missing = [...keys].filter(k => !(k in en) || !(k in fi))
  assert.deepEqual(missing, [])
})
test('LANG: singular keys exist in both languages', () => {
  for (const k of Object.keys(en).filter(k => k.endsWith('_1'))) assert.ok(k in fi, k)
})
