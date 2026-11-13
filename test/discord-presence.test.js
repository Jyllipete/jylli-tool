'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const P = require('../lib/discord/presence')
const { COPY } = require('../lib/discord/copy')
const Routes = require('../js/routes.js')

const T0 = 1700000000000
const base = { lang: 'en', route: { tab: 'home' }, tweaks: 0, game: null, pulse: null, task: null, sessionStart: T0, hidden: false, silent: false }
const b = (o, prefs) => P.build({ ...base, ...o }, prefs)

test('page: one phrase per tab, session timer, tweak count only when there are tweaks', () => {
  const r = b({ route: { tab: 'gpu' } })
  assert.equal(r.mode, 'page')
  assert.equal(r.activity.details, COPY.en.tabs.gpu)
  assert.equal(r.activity.state, undefined)
  assert.equal(r.activity.startTimestamp, T0)
  assert.equal(b({ tweaks: 1 }).activity.state, '1 tweak applied')
  assert.equal(b({ tweaks: 7 }).activity.state, '7 tweaks applied')
})

test('every tab of the app has a phrase in English and Finnish', () => {
  const ids = Routes.SECTIONS.flatMap(s => s.tabs.map(t => t.id))
  assert.ok(ids.length >= 24)
  for (const lang of ['en', 'fi']) for (const id of ids) assert.ok(COPY[lang].tabs[id], `${lang} copy for tab ${id}`)
  assert.deepEqual(Object.keys(COPY.en.tabs).sort(), Object.keys(COPY.fi.tabs).sort())
  assert.deepEqual(Object.keys(COPY.en).sort(), Object.keys(COPY.fi).sort())
  assert.deepEqual(Object.keys(COPY.en.tasks).sort(), Object.keys(COPY.fi.tasks).sort())
  assert.deepEqual(Object.keys(COPY.en.taskKeys).sort(), Object.keys(COPY.fi.taskKeys).sort())
})

test('legacy page ids resolve to a tab that has a phrase', () => {
  for (const page of ['dashboard', 'windows-opti', 'hardware', 'network', 'fivem', 'game-opti', 'debloater', 'preflight', 'fixes', 'process-manager', 'cleanup', 'scheduler', 'changelog', 'restore-points', 'startup-manager', 'app-optimizer', 'pulse', 'latency-monitor', 'replay', 'bios-tuner', 'settings']) {
    const r = Routes.resolve(page)
    assert.ok(r && COPY.en.tabs[r.tab], page)
  }
})

test('priority: task > pulse > game > page', () => {
  const game = { name: 'Valorant', since: T0 + 5000, isFivem: false }
  const pulse = { name: 'Valorant', since: T0 + 9000 }
  const task = { kind: 'auto-opti', step: 3, total: 12, since: T0 + 20000 }
  assert.equal(b({ game }).mode, 'game')
  assert.equal(b({ game, pulse }).mode, 'pulse')
  const t = b({ game, pulse, task })
  assert.equal(t.mode, 'task')
  assert.equal(t.activity.details, 'Auto-Optimizing')
  assert.equal(t.activity.state, 'Step 3 of 12')
  assert.equal(t.activity.startTimestamp, T0 + 20000)
})

test('game and pulse: curated name, own timers, FiveM icon only for the running game', () => {
  const g = b({ game: { name: 'FiveM', since: T0 + 5000, isFivem: true }, tweaks: 4 })
  assert.equal(g.activity.details, 'Playing FiveM')
  assert.equal(g.activity.state, '4 tweaks applied')
  assert.equal(g.activity.smallImageKey, 'fivem_icon')
  assert.equal(g.activity.startTimestamp, T0 + 5000)
  assert.equal(b({ game: { name: 'Valorant', since: T0 + 5000 } }).activity.state, 'Tuned by Jylli Tool')
  const p = b({ pulse: { name: 'Valorant', since: T0 + 9000 }, game: { name: 'Valorant', since: T0 + 5000 } })
  assert.equal(p.activity.state, 'Pulse boost on')
  assert.equal(p.activity.startTimestamp, T0 + 9000)
  assert.equal(p.activity.smallImageText, 'Pulse active')
  // FiveM installed but not running: no FiveM icon (installed software is not published)
  assert.equal(b({ route: { tab: 'home' } }).activity.smallImageKey, 'jylli_small')
})

test('showGame off hides the name and the FiveM icon, everywhere', () => {
  const prefs = { showGame: false }
  const g = b({ game: { name: 'FiveM', since: T0, isFivem: true } }, prefs)
  assert.equal(g.activity.details, 'In a game')
  assert.equal(g.activity.smallImageKey, 'jylli_small')
  const p = b({ pulse: { name: 'FiveM', since: T0 }, game: { name: 'FiveM', isFivem: true } }, prefs)
  assert.equal(p.activity.details, 'In a game')
  assert.ok(!JSON.stringify(p.activity).includes('FiveM'))
})

test('minimal detail publishes only the app name and the session timer', () => {
  const r = b({ route: { tab: 'bios' }, tweaks: 9, game: { name: 'Valorant', since: T0 + 1 }, pulse: { name: 'Valorant', since: T0 + 2 }, task: { kind: 'scan', since: T0 + 3 } }, { detail: 'minimal' })
  assert.equal(r.mode, 'minimal')
  assert.equal(r.activity.details, 'Using Jylli Tool')
  assert.equal(r.activity.state, undefined)
  assert.equal(r.activity.startTimestamp, T0)
  assert.ok(!/Valorant|BIOS|tweak/i.test(JSON.stringify(r.activity)))
})

test('hidden and silent publish nothing; whenHidden keep overrides hidden only', () => {
  assert.deepEqual(b({ hidden: true }), { activity: null, mode: 'hidden' })
  assert.deepEqual(b({ silent: true }), { activity: null, mode: 'silent' })
  assert.deepEqual(b({ silent: true }, { whenHidden: 'keep' }), { activity: null, mode: 'silent' })
  assert.equal(b({ hidden: true }, { whenHidden: 'keep' }).mode, 'page')
})

test('buttons follow the preference and respect Discord limits (2 buttons, label <= 32)', () => {
  const on = b({}).activity.buttons
  assert.equal(on.length, 2)
  for (const lang of ['en', 'fi']) for (const btn of P.build({ ...base, lang }).activity.buttons) { assert.ok(btn.label.length >= 1 && btn.label.length <= 32); assert.match(btn.url, /^https:\/\//) }
  assert.equal(b({}, { buttons: false }).activity.buttons, undefined)
})

test('text is cleaned and clamped; Finnish follows the language', () => {
  assert.equal(P.clean('a\u0000b‮   c'), 'ab c')
  assert.equal(P.clean('x'), undefined)
  assert.equal(P.clean('y'.repeat(300)).length, 128)
  const r = b({ game: { name: 'Bad\u0000Name'.repeat(20), since: T0 } })
  assert.ok(r.activity.details.length <= 128 && !/\u0000/.test(r.activity.details))
  assert.equal(b({ lang: 'fi', route: { tab: 'gpu' } }).activity.details, COPY.fi.tabs.gpu)
  assert.equal(b({ lang: 'xx', route: { tab: 'gpu' } }).activity.details, COPY.en.tabs.gpu)
})

test('the activity has only fields the discord-rpc client sends, and nothing sensitive-looking', () => {
  const allowed = new Set(['details', 'state', 'startTimestamp', 'largeImageKey', 'largeImageText', 'smallImageKey', 'smallImageText', 'buttons', 'instance'])
  for (const input of [{}, { game: { name: 'Valorant', since: T0 } }, { pulse: { name: 'CS2', since: T0 } }, { task: { kind: 'health', key: 'sfc', since: T0 } }]) {
    const a = b(input).activity
    for (const k of Object.keys(a)) assert.ok(allowed.has(k), k)
    assert.doesNotMatch(JSON.stringify(a), /\.exe|[A-Z]:\\|\\\\/i)
  }
})

test('normalizePrefs: unknown values fall back to today\'s behaviour', () => {
  assert.deepEqual(P.normalizePrefs(null), { detail: 'full', showGame: true, whenHidden: 'clear', buttons: true })
  assert.deepEqual(P.normalizePrefs({ detail: 'x', showGame: 0, whenHidden: 'y', buttons: false }), { detail: 'full', showGame: true, whenHidden: 'clear', buttons: false })
})
