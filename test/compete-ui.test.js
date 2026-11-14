const test = require('node:test')
const assert = require('node:assert')
const U = require('../js/compete/pure')

function loadLang(list) {
  global.LANG = { en: {}, fi: {} }
  for (const l of list) { const f = require.resolve('../js/lang/compete-' + l + '.js'); delete require.cache[f]; require(f) }
}
const games = [{ id: 'steam:1', name: 'Battlefield™ 6', source: 'steam' }, { id: 'steam:2', name: 'Call of Duty®', source: 'steam' }, { id: 'epic:f', name: 'Fortnite', source: 'epic' }]

test('search ignores punctuation and word order', () => {
  assert.deepStrictEqual(U.filterGames(games, 'battlefield 6').map(g => g.id), ['steam:1'])
  assert.deepStrictEqual(U.filterGames(games, 'duty call').map(g => g.id), ['steam:2'])
  assert.strictEqual(U.filterGames(games, '').length, 3)
  assert.strictEqual(U.filterGames(games, 'zzz').length, 0)
})

test('core choices only list plans this PC offers; Custom needs 8 to 64 CPUs', () => {
  assert.deepStrictEqual(U.coreChoices({ kinds: ['skip0'], logical: 16 }), ['all', 'skip0', 'custom'])
  assert.deepStrictEqual(U.coreChoices({ kinds: ['pcores', 'skip0'], logical: 20 }), ['all', 'pcores', 'skip0', 'custom'])
  assert.deepStrictEqual(U.coreChoices({ kinds: [], logical: 4 }), ['all'])
  assert.deepStrictEqual(U.coreChoices(null), ['all'])
})

test('custom presets', () => {
  const cpus = [{ n: 0, smt: false }, { n: 1, smt: true }, { n: 2, smt: false }, { n: 3, smt: true }]
  assert.deepStrictEqual(U.presetCpus('smtOff', cpus), [0, 2])
  assert.deepStrictEqual(U.presetCpus('all', cpus), [0, 1, 2, 3])
  assert.deepStrictEqual(U.presetCpus('none', cpus), [])
})

test('status line follows the session', () => {
  assert.deepStrictEqual(U.statusFor(null, 6), { key: 'found', vars: { n: 6 } })
  assert.strictEqual(U.statusFor(null, 1).key, 'foundOne')
  assert.strictEqual(U.statusFor(null, 0).key, 'noneFound')
  assert.deepStrictEqual(U.statusFor({ state: 'waiting', name: 'CS2' }, 6), { key: 'waiting', vars: { name: 'CS2' } })
  const run = { state: 'running', name: 'CS2', steps: [{ id: 'priority', state: 'apply', ok: true }, { id: 'tray', state: 'apply', ok: true }, { id: 'eco', state: 'skipped' }] }
  assert.deepStrictEqual(U.statusFor(run, 6), { key: 'running', vars: { name: 'CS2', n: 1 } })
  assert.strictEqual(U.statusFor({ state: 'running', name: 'x', steps: [] }, 6).key, 'runningNone')
  assert.strictEqual(U.statusFor({ state: 'idle' }, 6, { why: 'no-game-found', name: 'CS2' }).key, 'endedNone')
  assert.strictEqual(U.statusFor({ state: 'idle' }, 6, { why: 'stopped', reverted: 3 }).key, 'endedStop')
  assert.deepStrictEqual(U.statusFor({ state: 'idle' }, 6, { why: 'game-closed', applied: 4, reverted: 4 }), { key: 'endedGame', vars: { applied: 4, reverted: 4 } })
})

test('row badges and request options', () => {
  const steps = [{ id: 'power', state: 'skipped', reason: 'laptop' }, { id: 'shield', state: 'locked' }, { id: 'eco', state: 'apply', ok: true, detail: 'EcoQoS off' }]
  assert.deepStrictEqual(U.badgeFor('power', steps), { kind: 'skip', reason: 'laptop' })
  assert.deepStrictEqual(U.badgeFor('shield', steps), { kind: 'lock' })
  assert.deepStrictEqual(U.badgeFor('eco', steps), { kind: 'ok', detail: 'EcoQoS off' })
  assert.strictEqual(U.badgeFor('standby', steps), null)
  assert.deepStrictEqual(U.requestOpts({ cores: 'skip0', customCpus: [1, 2, 3, 4] }).customCpus, [])
  assert.deepStrictEqual(U.requestOpts({ cores: 'custom', customCpus: [1, 2, 3, 4] }).customCpus, [1, 2, 3, 4])
  assert.strictEqual(U.requestOpts({}).priority, 'above')
})

test('every row in every group has a label and help string in both languages', () => {
  loadLang(['en', 'fi'])
  for (const lng of ['en', 'fi']) {
    const t = global.LANG[lng].compete
    for (const g of U.GROUPS) { assert.ok(t['g_' + g.id], lng + ' g_' + g.id); for (const r of g.rows) { assert.ok(t['o_' + r.id], lng + ' o_' + r.id); assert.ok(t['h_' + r.id], lng + ' h_' + r.id) } }
    for (const k of Object.keys(global.LANG.en.compete)) assert.ok(k in t, lng + ' missing ' + k)
  }
})

test('every skip reason the planner and the steps can give has text', () => {
  loadLang(['en'])
  const t = global.LANG.en.compete
  const reasons = ['laptop', 'x3d', 'unknown', 'already-high', 'not-balanced', 'no-high', 'already-set', 'not-on-this-pc', 'custom-too-few', 'custom-invalid', 'custom-all',
    'denied', 'not-changed', 'not-switched', 'not-purged', 'not-pinned', 'not-started', 'none-running', 'error', 'not-applied', 'bad-exe', 'unproven']
  for (const r of reasons) assert.ok(t['r_' + r], r)
})
