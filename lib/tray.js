// Which background jobs are worth running right now. Pure: main.js gathers the facts, this decides.
'use strict'

/** facts: { visible, game, session, powerGuard, hud, aria, pulseSub } -> list of reasons (empty = everything may sleep). */
function needs(f = {}) {
  const out = []
  if (f.visible) out.push('visible')
  if (f.game) out.push('game')
  if (f.session) out.push('session')
  if (f.powerGuard) out.push('power-guard')
  if (f.hud) out.push('hud')
  if (f.aria) out.push('aria')
  if (f.pulseSub) out.push('pulse-sub')
  return out
}

/** Live sensors (poller, nvidia-smi, JylliSensor) are needed whenever anything above wants numbers. */
const liveSensors = f => needs(f).length > 0

/** The page may be unloaded after it has been hidden for this long, when nothing runs in it. */
const UNLOAD_AFTER_MS = 60000
const RETRY_MS = 30000

module.exports = { needs, liveSensors, UNLOAD_AFTER_MS, RETRY_MS }
