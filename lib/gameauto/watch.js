'use strict'
// Game Watcher state machine. Pure: one observation in, a new state and a list of actions out.
// A failed process listing changes nothing (it never ends a session). A game must be missing on MISS_LIMIT checks in a row before the
// session ends (a 5 s poll: about 10 s), so a slow listing or a launcher restarting the game does not end it early.

const MISS_LIMIT = 2
const FAIL_LIMIT = 3

const init = () => ({ game: null, misses: 0, fails: 0, degraded: false })

/** obs: { ok: false } | { ok: true, game: null | { id, name, pulse, exe, source } } -> { state, actions: [{ type: start|end|degraded|recovered, game, reason? }] } */
function step(state, obs) {
  const s = { ...state }
  const actions = []
  if (!obs || !obs.ok) {
    s.fails++
    if (s.fails >= FAIL_LIMIT && !s.degraded) { s.degraded = true; actions.push({ type: 'degraded' }) }
    return { state: s, actions }
  }
  s.fails = 0
  if (s.degraded) { s.degraded = false; actions.push({ type: 'recovered' }) }
  const g = obs.game || null
  if (g && !s.game) { s.game = g; s.misses = 0; actions.push({ type: 'start', game: g }) }
  else if (g && s.game.id === g.id) { s.game = { ...s.game, exe: g.exe }; s.misses = 0 }
  else if (g && s.game) { actions.push({ type: 'end', game: s.game, reason: 'switch' }); s.game = g; s.misses = 0; actions.push({ type: 'start', game: g }) }
  else if (!g && s.game) {
    s.misses++
    if (s.misses >= MISS_LIMIT) { actions.push({ type: 'end', game: s.game, reason: 'exit' }); s.game = null; s.misses = 0 }
  }
  return { state: s, actions }
}

module.exports = { init, step, MISS_LIMIT, FAIL_LIMIT }
