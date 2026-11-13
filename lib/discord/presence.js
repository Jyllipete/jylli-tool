'use strict'
// What Jylli Tool publishes as its Discord activity. Pure: input + prefs in, one activity object (or null = publish nothing) out.
// Only fields the discord-rpc client really sends: details, state, startTimestamp, large/small image key + text, buttons, instance.
// Privacy: nothing here ever carries an exe name, path, server, hardware or account detail. Game names must arrive already curated
// (built-in game list / Pulse preset names); they are only cleaned and clamped here.
const { copy, fill } = require('./copy')

const INVITE = 'https://discord.gg/jylligraffat'
const DOWNLOAD = 'https://discord.com/channels/1295856827388399779/1295856828160282746'
const DEFAULT_PREFS = Object.freeze({ detail: 'full', showGame: true, whenHidden: 'clear', buttons: true })

function normalizePrefs(p) {
  const q = p && typeof p === 'object' ? p : {}
  return {
    detail: q.detail === 'minimal' ? 'minimal' : 'full',
    showGame: q.showGame !== false,
    whenHidden: q.whenHidden === 'keep' ? 'keep' : 'clear',
    buttons: q.buttons !== false,
  }
}

// Discord wants 2..128 characters per text field; control and bidi characters never go out.
function clean(s, max = 128) {
  const t = String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, '').replace(/\s+/g, ' ').trim()
  if (t.length < 2) return undefined
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}
const ts = v => (Number.isFinite(v) && v > 0 && v < 2147483647000 ? Math.round(v) : undefined)

function build(input, rawPrefs) {
  const inp = input || {}
  const prefs = normalizePrefs(rawPrefs)
  const L = copy(inp.lang)
  if (inp.silent) return { activity: null, mode: 'silent' }
  if (inp.hidden && prefs.whenHidden === 'clear') return { activity: null, mode: 'hidden' }

  const tweaks = Number.isFinite(inp.tweaks) && inp.tweaks > 0 ? Math.floor(inp.tweaks) : 0
  const tweakText = tweaks === 1 ? L.tweak1 : fill(L.tweakN, { n: tweaks })
  const gameName = prefs.showGame && inp.game ? clean(inp.game.name, 40) : undefined
  const showFivem = !!(prefs.showGame && inp.game && inp.game.isFivem)
  let mode, details, state, start = ts(inp.sessionStart)
  let small = { key: 'jylli_small', text: L.app }

  if (prefs.detail === 'minimal') {
    mode = 'minimal'; details = L.minimal
  } else if (inp.task && L.tasks[inp.task.kind]) {
    const t = inp.task
    mode = 'task'; details = L.tasks[t.kind]
    if (Number.isFinite(t.step) && Number.isFinite(t.total) && t.total > 0) state = fill(L.step, { step: t.step, total: t.total })
    else if (t.key && L.taskKeys[t.key]) state = L.taskKeys[t.key]
    start = ts(t.since) || start
  } else if (inp.pulse) {
    mode = 'pulse'
    details = gameName ? fill(L.playing, { game: gameName }) : L.inGame
    state = L.pulseOn
    start = ts(inp.pulse.since) || start
    small = showFivem ? { key: 'fivem_icon', text: L.fivemHover } : { key: 'jylli_small', text: L.pulseHover }
  } else if (inp.game) {
    mode = 'game'
    details = gameName ? fill(L.playing, { game: gameName }) : L.inGame
    state = tweaks > 0 ? tweakText : L.tuned
    start = ts(inp.game.since) || start
    if (showFivem) small = { key: 'fivem_icon', text: L.fivemHover }
  } else {
    mode = 'page'
    details = (inp.route && L.tabs[inp.route.tab]) || L.minimal
    state = tweaks > 0 ? tweakText : undefined
  }

  const activity = {
    details: clean(details),
    state: clean(state),
    startTimestamp: start,
    largeImageKey: 'jylli_logo',
    largeImageText: clean(L.invite),
    smallImageKey: small.key,
    smallImageText: clean(small.text),
    buttons: prefs.buttons ? [{ label: L.btnJoin, url: INVITE }, { label: L.btnGet, url: DOWNLOAD }] : undefined,
    instance: false,
  }
  return { activity, mode }
}

module.exports = { build, normalizePrefs, clean, DEFAULT_PREFS, INVITE, DOWNLOAD }
