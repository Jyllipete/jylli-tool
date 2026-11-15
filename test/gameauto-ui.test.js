const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const V = require('../js/gameauto/views')
const M = require('../lib/gameauto/model')
const GS = require('../lib/gameshield')

const LANG = { en: {}, fi: {} }
for (const f of ['gameauto-en.js', 'gameauto-fi.js']) new Function('LANG', fs.readFileSync(path.join(__dirname, '../js/lang', f), 'utf8'))(LANG)
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function ctx(lang, over = {}) {
  const used = new Set(), missing = new Set()
  const D = LANG[lang].gameauto
  const T = (k, v) => { used.add(k); if (!(k in D)) missing.add(k); return String(D[k] != null ? D[k] : k).replace(/\{(\w+)\}/g, (m, n) => (v && n in v ? v[n] : m)) }
  return { x: { T, esc, M, has: k => k in D, now: 1700000000000, busy: {}, exMsg: null, open: new Set(), ...over }, used, missing }
}

const lists = { tier1: GS.TIER1, tier3: GS.TIER3, browsers: GS.BROWSERS }
const base = () => ({
  premium: true,
  settings: { watcher: true, updateGuard: true, shield: true, autoPulse: true, tier3: 70, mid: 80, exclusions: ['obs64.exe', 'notepad.exe', 'discord.exe'], libraryDetect: false, pulseOff: ['apex'] },
  watcher: { running: true, paused: false, degraded: false, targets: 24 }, session: null, features: {}, lastSession: null, history: [],
  detected: [{ id: 'csgo', name: 'CS2 / CS:GO', pulse: true, source: 'preset' }, { id: 'apex', name: 'Apex Legends', pulse: true, source: 'preset' }, { id: 'gtav', name: 'GTA V', pulse: false, source: 'curated' }, { id: 'lib:hades', name: 'Hades', pulse: false, source: 'custom' }],
  lists, legacyOverrides: 0, pending: false, at: 1700000000000,
})
const T0 = 1700000000000 - 20 * 60000
const playing = () => {
  const s = base()
  s.session = { id: 'g1', game: { id: 'csgo', name: 'CS2 / CS:GO', pulse: 'csgo', exe: 'cs2.exe' }, startedAt: T0, events: [
    { at: T0 + 1000, feature: 'mmcss', kind: 'applied', key: 'mmcss', ok: true, detail: 'verified' },
    { at: T0 + 2000, feature: 'shield', kind: 'applied', key: 'onedrive.exe', ok: true, detail: 'launch' },
    { at: T0 + 3000, feature: 'updateGuard', kind: 'applied', key: 'wu', ok: true, detail: 'held' },
    { at: T0 + 4000, feature: 'autoPulse', kind: 'applied', key: 'pulse', ok: true, detail: 'csgo' },
    { at: T0 + 5000, feature: 'profile', kind: 'applied', ok: true, detail: 'kept', vars: { name: 'Competitive' } },
    { at: T0 + 9000, feature: 'shield', kind: 'applied', key: 'chrome.exe', ok: true, detail: 'mid-session' }] }
  s.features = { updateGuard: { status: 'holding', held: true, pending: { count: 2 } }, shield: { status: 'active', stopped: ['onedrive.exe', 'chrome.exe'], active: true }, autoPulse: { status: 'active' } }
  return s
}
const ended = () => {
  const s = playing(); const sess = s.session; s.session = null
  const events = [...sess.events,
    { at: T0 + 20000, feature: 'shield', kind: 'restored', key: 'onedrive.exe', ok: true, detail: 'restarted' },
    { at: T0 + 21000, feature: 'shield', kind: 'restored', key: 'chrome.exe', ok: false, detail: 'no-path' },
    { at: T0 + 22000, feature: 'updateGuard', kind: 'restored', key: 'wu', ok: false, detail: 'restore-failed' },
    { at: T0 + 23000, feature: 'mmcss', kind: 'restored', key: 'mmcss', ok: true, detail: 'ok' },
    { at: T0 + 24000, feature: 'autoPulse', kind: 'restored', key: 'pulse', ok: true, detail: 'ok' }]
  const last = { ...sess, events, endedAt: T0 + 1500000, endReason: 'exit' }
  const failedRestores = events.filter(e => e.kind === 'restored' && e.ok === false)
  last.summary = { changed: 6, restored: 3, failed: 2, pending: [], failedRestores, clean: false }
  s.lastSession = last
  s.history = [{ id: 'g0', game: { name: 'Apex Legends' }, startedAt: T0 - 86400000, endedAt: T0 - 80000000, endReason: 'switch', summary: { clean: true, pending: [], failedRestores: [] } }]
  s.features = { updateGuard: { restoreFailed: true }, shield: { restoreFailed: [{ name: 'chrome.exe', verdict: 'no-path' }] } }
  return s
}
const variants = {
  idleArmed: base, playing, ended,
  watcherOff: () => { const s = base(); s.settings.watcher = false; s.watcher.running = false; return s },
  paused: () => { const s = base(); s.watcher.paused = true; return s },
  degraded: () => { const s = playing(); s.watcher.degraded = true; return s },
  free: () => { const s = base(); s.premium = false; return s },
  everythingOff: () => { const s = base(); Object.assign(s.settings, { updateGuard: false, shield: false, autoPulse: false }); return s },
  failures: () => { const s = playing(); s.features = { updateGuard: { status: 'failed', reason: 'not-held', pending: { count: null, error: 'timeout' } }, shield: { status: 'failed' }, autoPulse: { status: 'failed', reason: 'Unknown preset' } }; return s },
  autoPulseStates: () => { const s = playing(); s.session.game = { id: 'lib:hades', name: 'Hades', pulse: null }; s.features.autoPulse = { status: 'unavailable', reason: 'no-preset' }; s.features.updateGuard = { status: 'skipped' }; s.legacyOverrides = 3; return s },
  snoozed: () => { const s = playing(); s.features.autoPulse = { status: 'snoozed' }; return s },
  manual: () => { const s = playing(); s.features.autoPulse = { status: 'manual' }; return s },
  restoredOk: () => { const s = base(); s.features = { updateGuard: { lastEnd: 'restored', reenabled: true }, shield: { lastEnd: 'restored', summary: { killed: 3, freedMB: 420 } }, autoPulse: { lastEnd: 'restored' } }; return s },
}

const render = (st, x) => [V.strip(st, x), V.flow(st, x), V.cardUg(st, x), V.cardGs(st, x), V.cardAp(st, x), V.ledger(st, x)].join('\n')

test('English and Finnish have exactly the same keys', () => {
  const en = Object.keys(LANG.en.gameauto), fi = Object.keys(LANG.fi.gameauto)
  assert.deepEqual(en.filter(k => !fi.includes(k)), [])
  assert.deepEqual(fi.filter(k => !en.includes(k)), [])
})

for (const lang of ['en', 'fi']) {
  test('every panel state renders in ' + lang + ' with no missing keys and no unfilled placeholders', () => {
    for (const [name, make] of Object.entries(variants)) {
      const { x, missing } = ctx(lang)
      const html = render(make(), x)
      assert.deepEqual([...missing], [], name + ' uses keys that do not exist')
      assert.ok(!/\{\w+\}/.test(html.replace(/\{\w+\}\s*(?=<\/code>)/g, '')), name + ' left a placeholder: ' + (html.match(/\{\w+\}/) || [])[0])
      assert.ok(!html.includes('undefined') && !html.includes('[object'), name + ' printed an undefined value')
    }
    const { x } = ctx(lang)
    assert.ok(V.loading(x).includes('role="status"'))
    assert.ok(V.failed(x).includes('data-act="reload"'))
  })
}

test('every literal key the views and the page use exists in both languages', () => {
  const src = ['../js/gameauto/views.js', '../js/gameauto/page.js'].map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n')
  const keys = new Set([...src.matchAll(/\bT\('([A-Za-z0-9_-]+)'/g)].map(m => m[1]).filter(k => !k.endsWith('_')))   // 'ph_' + phase style prefixes are covered by the families below
  for (const k of keys) { assert.ok(k in LANG.en.gameauto, 'en missing ' + k); assert.ok(k in LANG.fi.gameauto, 'fi missing ' + k) }
  // the dynamic families
  const fam = { wph_: ['off', 'paused', 'degraded', 'active', 'armed'], ph_: ['off', 'locked', 'needsWatcher', 'paused', 'armed', 'starting', 'active', 'skipped', 'failed', 'restored', 'degraded', 'unavailable', 'manual', 'snoozed'], cov_: ['launch', 'tier3', 'mid', 'none'], end_: ['exit', 'switch', 'watcher-stopped', 'crash'], v_: ['restarted', 'already-running', 'no-path', 'missing', 'start-failed', 'error'], ex_: ['empty', 'format', 'duplicate', 'limit', 'save'], err_: ['premium_required', 'settings_write_failed', 'state_write_failed', 'bad_request', 'failed'] }
  for (const [p, list] of Object.entries(fam)) for (const l of list) { assert.ok((p + l) in LANG.en.gameauto, 'en missing ' + p + l); assert.ok((p + l) in LANG.fi.gameauto, 'fi missing ' + p + l) }
})

test('the panel says what is really going on', () => {
  const { x } = ctx('en')
  const p = render(playing(), x)
  assert.ok(p.includes('Windows Update is held for this game.') && p.includes('Pulse is boosting CS2 / CS:GO.') && p.includes('Closed 2 so far'))
  assert.ok(p.includes('Updates waiting when the game started: 2'))
  const f = render(variants.failures(), x)
  assert.ok(f.includes('Could not check for waiting updates. That does not mean there are none.'), 'an unreadable count is not shown as zero')
  assert.ok(f.includes('Pulse could not start: Unknown preset'))
  const e = render(ended(), x)
  assert.ok(e.includes('Windows Update could not be put back as it was'), 'a failed restore is shown, not hidden')
  assert.ok(e.includes('Jylli Tool did not record where it ran from'))
  assert.ok(e.includes('data-tone="bad">2 need attention'), 'the session header says what needs attention')
  assert.ok(render(variants.restoredOk(), x).includes('Windows had already switched the service on during the game'))
})

test('exclusions: chips, coverage and the .exe hint are shown; the list is escaped', () => {
  const { x } = ctx('en', { exMsg: { tone: 'bad', text: 'That program is already on the list.' } })
  const s = base(); s.settings.exclusions = ['obs64.exe', 'notepad.exe', 'discord.exe', '<b>x</b>.exe']
  const html = V.cardGs(s, x)
  assert.ok(html.includes('data-exe="obs64.exe"') && html.includes('data-cov="none"') && html.includes('data-cov="tier3"'))
  assert.ok(!html.includes('<b>x</b>') && html.includes('&lt;b&gt;'))
  assert.ok(html.includes('obs64.exe') && html.includes('already on the list'))
})

test('the Game Shield sliders use the engine limits and the markers follow the values', () => {
  const { x } = ctx('en')
  const html = V.cardGs(base(), x)
  assert.ok(html.includes('data-slider="tier3"') && /min="50" max="90"/.test(html) && /min="55" max="95"/.test(html))
  assert.ok(html.includes('left:44%') && html.includes('left:67%'))
})

test('free accounts see locked cards, not switches, and the watcher stays free', () => {
  const { x } = ctx('en')
  const s = variants.free()
  const ug = V.cardUg(s, x)
  assert.ok(ug.includes('data-act="premium"') && !ug.includes('data-act="sw-updateGuard"'))
  assert.ok(V.strip(s, x).includes('data-act="watcher"'))
})

test('Auto-Pulse lists only games with a preset and offers reset when something is off', () => {
  const { x } = ctx('en')
  const html = V.cardAp(base(), x)
  assert.ok(html.includes('data-id="csgo"') && html.includes('data-id="apex"') && !html.includes('data-id="gtav"'))
  assert.ok(html.includes('data-act="pulse-reset"'))
  assert.ok(/data-id="apex"[^>]*>/.test(html) && /aria-checked="false"[^>]*data-act="pulse-game" data-id="apex"/.test(html))
})
