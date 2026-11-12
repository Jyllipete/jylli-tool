const test = require('node:test')
const assert = require('node:assert')
const P = require('../js/home/pure')
const M = require('../lib/home/model')

const NOW = Date.UTC(2026, 10, 12, 12)

test('dial: three bands, an unmeasured one is empty and flagged, never a full ring', () => {
  const idx = M.buildIndex({ now: NOW, diag: { score: 90, takenAt: NOW } })
  const d = P.dial(idx)
  assert.deepStrictEqual(d.map(b => b.key), ['health', 'tuned', 'protected'])
  assert.deepStrictEqual(d.map(b => b.measured), [true, false, false])
  assert.strictEqual(d[0].dash, '90 100')
  assert.strictEqual(d[1].dash, '0 100')
  assert.strictEqual(d[0].tone, 'ok')
  assert.strictEqual(P.dial(null).length, 3)
  assert.ok(P.dial(null).every(b => !b.measured))
})

test('bytes: binary units, one decimal under 10', () => {
  assert.deepStrictEqual(P.bytes(0), { n: '0', u: 'B' })
  assert.deepStrictEqual(P.bytes(1536), { n: '1.5', u: 'KB' })
  assert.deepStrictEqual(P.bytes(2.4 * 1073741824), { n: '2.4', u: 'GB' })
  assert.deepStrictEqual(P.bytes(15.7 * 1048576), { n: '16', u: 'MB' })
  assert.deepStrictEqual(P.bytes(400 * 1048576), { n: '400', u: 'MB' })
  assert.strictEqual(P.bytes(-1), null)
  assert.strictEqual(P.bytes(NaN), null)
})

test('seconds and ago', () => {
  assert.strictEqual(P.seconds(-9200), '9.2')
  assert.strictEqual(P.seconds(null), null)
  assert.deepStrictEqual(P.ago(NOW - 30e3, NOW), { key: 'agoNow', n: 0 })
  assert.deepStrictEqual(P.ago(NOW - 10 * 60e3, NOW), { key: 'agoMin', n: 10 })
  assert.deepStrictEqual(P.ago(NOW - 5 * 3600e3, NOW), { key: 'agoHour', n: 5 })
  assert.deepStrictEqual(P.ago(NOW - 3 * 86400e3, NOW), { key: 'agoDay', n: 3 })
  assert.strictEqual(P.ago(undefined, NOW), null)
  assert.deepStrictEqual(P.ago(NOW + 5000, NOW), { key: 'agoNow', n: 0 })
})

test('move copy: home moves live in home2, concierge moves keep their group, AI moves carry text', () => {
  assert.deepStrictEqual(P.moveCopy({ kind: 'home', titleKey: 'protectTitle', whyKey: 'protectWhy' }), { group: 'home2', titleKey: 'm_protectTitle', whyKey: 'm_protectWhy' })
  assert.strictEqual(P.moveCopy({ kind: 'concierge', titleKey: 'essentialsTitle', whyKey: 'essentialsWhy' }).group, 'concierge')
  assert.deepStrictEqual(P.moveCopy({ kind: 'ai', id: 'ai-x', text: 'Disable X', why: 'y' }), { group: null, title: 'Disable X', why: 'y' })
  assert.strictEqual(P.moveCopy(null), null)
})

test('move vars: raw byte counts become a size text', () => {
  assert.strictEqual(P.moveVars({ vars: { bytes: 3 * 1073741824 } }).size, '3.0 GB'.replace('3.0', '3.0'))
  assert.strictEqual(P.moveVars({ vars: { n: 4 } }).n, 4)
  assert.deepStrictEqual(P.moveVars({}), {})
})

test('tone boundaries match the index', () => {
  assert.deepStrictEqual([P.tone(80), P.tone(79), P.tone(55), P.tone(54), P.tone(null)], ['ok', 'warn', 'warn', 'danger', 'idle'])
})

test('spark: gaps break the line, short series draw nothing', () => {
  assert.strictEqual(P.spark([10], 100, 20), '')
  assert.strictEqual(P.spark([0, 100], 100, 20), 'M 0 20 L 100 0')
  assert.strictEqual(P.spark([0, null, 100, 100], 90, 10), 'M 0 10 M 60 0 L 90 0')
  assert.strictEqual(P.spark([150, -5], 10, 10), 'M 0 0 L 10 10')
})

// ── copy ────────────────────────────────────────────────────────────────────────────
const fs = require('node:fs')
const path = require('node:path')
function loadLang() {
  const L = { en: {}, fi: {} }
  for (const lang of ['en', 'fi']) new Function('LANG', fs.readFileSync(path.join(__dirname, '..', 'js', 'lang', `home-${lang}.js`), 'utf8'))(L)
  return { en: L.en.home2, fi: L.fi.home2 }
}

test('copy: EN and FI have exactly the same keys and the same {placeholders}', () => {
  const { en, fi } = loadLang()
  assert.deepStrictEqual(Object.keys(fi).sort(), Object.keys(en).sort())
  const vars = s => (String(s).match(/\{\w+\}/g) || []).sort().join()
  for (const k of Object.keys(en)) assert.strictEqual(vars(fi[k]), vars(en[k]), 'placeholders differ in ' + k)
})

test('copy: every key the Home code asks for exists', () => {
  const { en } = loadLang()
  const src = ['page.js', 'views.js'].map(f => fs.readFileSync(path.join(__dirname, '..', 'js', 'home', f), 'utf8')).join('\n')
  const used = new Set()
  for (const m of src.matchAll(/\bT\('([A-Za-z0-9_-]+)'/g)) if (!m[1].endsWith('_')) used.add(m[1])   // 'p_' + key style prefixes are covered by the loops below
  for (const k of ['p_', 'pd_', 'sub_']) for (const s of (k === 'sub_' ? ['stability', 'storage', 'memory', 'cpu', 'gpu', 'drivers', 'windows', 'security', 'network', 'config'] : ['health', 'tuned', 'protected'])) used.add(k + s)
  for (const s of ['high', 'medium', 'low']) used.add('impact_' + s)
  for (const s of ['restore', 'autoOpti', 'tab', 'batch', 'drift', 'admin', 'ai']) used.add('btn_' + s)
  for (const s of ['fresh', 'stale', 'never', 'unknown']) used.add('rp_' + s)
  for (const s of ['manual', 'stage', 'auto-opti', 'spw', 'ai', 'game-watcher', 'scheduler', 'safety-revert', 'undo']) used.add('via_' + s)
  for (const s of ['agoNow', 'agoMin', 'agoHour', 'agoDay']) used.add(s)
  for (const s of ['verdictNone', 'verdictStrong', 'verdictFair', 'verdictWeak_health', 'verdictWeak_tuned', 'verdictWeak_protected']) used.add(s)
  const Moves = require('../lib/home/moves')
  const ids = new Set(Moves.candidates({ restore: { level: 'never' }, diag: null, drift: { count: 1 }, autoOpti: null, cleanup: { reclaimableBytes: 9e9 }, debloat: { safe: 5 }, isAdmin: false, game: { running: true }, now: 1 }).map(m => m.id))
  for (const lvl of ['stale']) for (const m of Moves.candidates({ restore: { level: lvl }, diag: { findings: [{ severity: 'high', id: 'x' }] }, autoOpti: { lastAt: 1 }, now: 1e12 })) ids.add(m.id)
  for (const id of ids) if (!id.startsWith('ai-')) { used.add('m_' + id + 'Title'); used.add('m_' + id + 'Why') }
  const Pr = require('../lib/home/processes'), Tr = require('../lib/home/trace')
  for (const id of Pr.IDS) { used.add('pn_' + id); used.add('pr_' + id) }
  for (const id of Tr.TAB_IDS) used.add('trTab_' + id)
  for (const w of Object.keys(Tr.WINDOWS)) used.add('trWin_' + w)
  for (const r of ['needs_driver', 'no_sensor', 'not_supported', 'stale']) used.add('nar_why_' + r)
  for (const k of ['trLoad', 'trTemp', 'trPower', 'trVram', 'trClock', 'trUsed', 'trTotal', 'trRead', 'trWrite', 'trRx', 'trTx', 'trActive', 'trDriveTemp']) used.add(k)
  for (const st of [{ unavailable: { reason: 'x' } }, { spike: { ageS: 1, flag: { type: 'process', name: 'a', value: 1 } } }, { spike: { ageS: 1, flag: { type: 'spread' } } }, { spike: { ageS: 1, flag: { type: 'game' } } },
    { spike: { ageS: 1, flag: { type: 'none' } } }, { spike: { ageS: 1 } }, { now: { secondary: 99 }, ceiling: 95 }, { cmp: { kind: 'high', ratio: 2 } }, { cmp: { kind: 'low' } }, { cmp: { kind: 'normal' } }, {}]) used.add(Tr.narrate(st).key)
  used.add('nar_week')
  const missing = [...used].filter(k => !(k in en))
  assert.deepStrictEqual(missing, [])
})
