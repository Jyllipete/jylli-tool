const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const P = require('../js/games/pure')
const known = require('../lib/games/known')
const catalog = require('../lib/games/catalog')

const games = [
  { id: 'steam:730', name: 'Counter-Strike 2', dev: 'Valve', source: 'steam', favorite: true, running: false, model: { summary: 'tuned', trusted: 1 } },
  { id: 'epic:f', name: 'Fortnite', dev: 'Epic Games', source: 'epic', favorite: false, running: false, model: { summary: 'open', trusted: 1 } },
  { id: 'valorant', name: 'Valorant', dev: 'Riot Games', source: 'other', favorite: false, running: true, model: { summary: 'drift', trusted: 1 } },
  { id: 'xbox:fh5', name: 'Forza Horizon 5', source: 'xbox', favorite: false, running: false, model: { summary: 'noexe', trusted: 0 } },
  { id: 'custom:D:\\a.exe', name: 'a', source: 'custom', favorite: false, running: false, model: { summary: 'open', trusted: 1 } },
]

test('chips: counts and matches (custom games count as Other, noexe is not "needs attention")', () => {
  const c = P.chipCounts(games)
  assert.deepStrictEqual([c.all, c.fav, c.tuned, c.attention, c.steam, c.epic, c.xbox, c.other], [5, 1, 1, 3, 1, 1, 1, 2])
  assert.ok(P.chipMatch(games[4], 'other') && !P.chipMatch(games[3], 'attention'))
})

test('search ignores punctuation and word order, and also finds developers and stores', () => {
  assert.deepStrictEqual(games.filter(g => P.matches(g, 'counter strike')).map(g => g.id), ['steam:730'])
  assert.deepStrictEqual(games.filter(g => P.matches(g, '2 strike')).map(g => g.id), ['steam:730'])
  assert.deepStrictEqual(games.filter(g => P.matches(g, 'riot')).map(g => g.id), ['valorant'])
  assert.deepStrictEqual(games.filter(g => P.matches(g, 'xbox')).map(g => g.id), ['xbox:fh5'])
  assert.strictEqual(games.filter(g => P.matches(g, '')).length, 5)
  assert.strictEqual(games.filter(g => P.matches(g, 'zzz')).length, 0)
})

test('sort: running first, then recent / name / most played; Jylli launches count as recent', () => {
  const stats = { 'epic:f': { last: 500, seconds: 10 }, 'steam:730': { last: 100, seconds: 900 } }
  assert.deepStrictEqual(P.sortGames(games, 'recent', stats, {}).map(g => g.id).slice(0, 3), ['valorant', 'epic:f', 'steam:730'])
  assert.deepStrictEqual(P.sortGames(games, 'recent', stats, { 'xbox:fh5': 9999 }).map(g => g.id).slice(0, 3), ['valorant', 'xbox:fh5', 'epic:f'])
  assert.deepStrictEqual(P.sortGames(games, 'name', stats, {}).map(g => g.name), ['Valorant', 'a', 'Counter-Strike 2', 'Fortnite', 'Forza Horizon 5'])
  assert.strictEqual(P.sortGames(games, 'time', stats, {})[1].id, 'steam:730')
})

test('labels, time and sparkline geometry', () => {
  assert.strictEqual(P.initial('  ¡hola'), 'H'); assert.strictEqual(P.initial(''), '?')
  assert.strictEqual(P.hue('steam:730'), P.hue('steam:730'))
  assert.deepStrictEqual(P.fmtHours(1800), { k: 'min', n: 30 }); assert.deepStrictEqual(P.fmtHours(7200), { k: 'h', n: 2 })
  const now = 1e12
  assert.deepStrictEqual(P.ago(now - 30e3, now), { k: 'now', n: 0 }); assert.deepStrictEqual(P.ago(now - 5 * 3600e3, now), { k: 'h', n: 5 }); assert.deepStrictEqual(P.ago(now - 72 * 3600e3, now), { k: 'd', n: 3 })
  assert.strictEqual(P.ago(0, now), null)
  assert.strictEqual(P.spark([1], 100, 20), '')
  assert.match(P.spark([1, 2, 3], 100, 20), /^M3\.0 17\.0 L50\.0 10\.0 L97\.0 3\.0$/)
  assert.match(P.spark([5, 5], 100, 20), /^M3\.0 10\.0 L97\.0 10\.0$/)
})

test('rows: a row can only be switched with a trusted exe, Premium and no other owner', () => {
  assert.ok(P.canSwitch({ status: 'off' }, true)); assert.ok(P.canSwitch({ status: 'drifted' }, true))
  assert.ok(!P.canSwitch({ status: 'off' }, false) && !P.canSwitch({ status: 'noexe' }, true) && !P.canSwitch({ status: 'elsewhere' }, true) && !P.canSwitch({ status: 'unknown' }, true))
  assert.ok(P.isSet({ status: 'on' }) && P.isSet({ status: 'native' }) && !P.isSet({ status: 'drifted' }))
  for (const id of catalog.ids()) assert.ok(P.ROW_ICON[id], 'icon for ' + id)
})

// ── translations: every key the page and views ask for exists in en and fi ──
function loadLang() {
  global.LANG = { en: {}, fi: {} }
  for (const f of ['games-en', 'games-fi']) { const p = require.resolve('../js/lang/' + f + '.js'); delete require.cache[p]; require(p) }
  return global.LANG
}
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')

test('translations: games2 has the same keys in en and fi', () => {
  const L = loadLang()
  const en = Object.keys(L.en.games2), fi = Object.keys(L.fi.games2)
  assert.deepStrictEqual(en.filter(k => !fi.includes(k)), [], 'missing in fi')
  assert.deepStrictEqual(fi.filter(k => !en.includes(k)), [], 'missing in en')
})

test('translations: every literal T() key in page.js and views.js exists, and the dynamic families are complete', () => {
  const L = loadLang(), have = new Set(Object.keys(L.en.games2))
  const src = read('js/games/page.js') + read('js/games/views.js')
  const literal = new Set([...src.matchAll(/\bT\('([A-Za-z0-9_]+)'\s*[,)]/g)].map(m => m[1]))
  assert.deepStrictEqual([...literal].filter(k => !have.has(k)), [])
  const family = (prefix, ids) => assert.deepStrictEqual(ids.map(i => prefix + i).filter(k => !have.has(k)), [], prefix)
  family('seg_', P.VIEWS); family('chip_', P.CHIPS); family('sort_', P.SORTS)
  family('src_', ['steam', 'epic', 'xbox', 'other'])
  family('dot_', ['running', 'tuned', 'partial', 'open', 'drift', 'noexe', 'unknown'])
  family('st_', ['on', 'native', 'off', 'partial', 'drifted', 'elsewhere', 'unknown', 'noexe', 'running'])
  family('ago_', ['now', 'min', 'h', 'd']); family('dur_', ['min', 'h'])
  family('tab_', ['tune', 'perf', 'cfg', 'tips']); family('exeSrc_', ['picked', 'learned', 'known'])
  family('row_', catalog.ids()); family('rowS_', catalog.ids())
  family('v_', ['empty', 'running', 'free', 'todo', 'done']); family('vS_', ['empty', 'running', 'free', 'todo', 'done'])
  family('fT_', ['drift', 'legacy', 'noexe', 'unread', 'running']); family('fS_', ['drift', 'legacy', 'noexe', 'unread', 'running'])
  family('r_', ['unknown', 'noexe', 'elsewhere', 'failed', 'error', 'not-verified', 'premium_required'])
  family('imp_', ['better', 'worse', 'same']); family('did_', ['apply', 'restore']); family('rd_', ['gamemode', 'gamedvr']); family('rdS_', ['gamemode', 'gamedvr'])
  family('tip_', ['generic', ...known.KNOWN.map(k => k.id.replace(/-/g, '_'))])
})

test('findings and verdict kinds the engine can produce all have stage text', () => {
  const L = loadLang(), have = new Set(Object.keys(L.en.games2))
  const findings = require('../lib/games/findings')
  const f = findings.compute({ models: { a: { summary: 'drift', recIds: [] }, b: { summary: 'noexe', recIds: [] }, c: { summary: 'unknown', recIds: [] } }, names: {}, legacy: ['a'], running: 'a', premium: true })
  for (const x of f) { assert.ok(have.has('fT_' + x.id), 'fT_' + x.id); assert.ok(have.has('fS_' + x.id), 'fS_' + x.id) }
  for (const k of ['empty', 'running', 'free', 'todo', 'done']) {
    const v = findings.verdict({ totals: { games: k === 'empty' ? 0 : 3, tuned: 1, todo: k === 'todo' ? 2 : 0 }, findings: [], running: k === 'running' ? 'a' : null, names: { a: 'A' }, premium: k !== 'free' })
    assert.strictEqual(v.kind, k)
  }
})
