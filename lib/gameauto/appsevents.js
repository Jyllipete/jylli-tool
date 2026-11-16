'use strict'
// Ledger events for Apps "Game time" (programs stepping back while a game runs). Pure. Before this, Game time ran outside the session
// and left no trace in the ledger, so a failed or skipped start was invisible.

/** r = result of appsSvc().gameStart(). Returns { events, lowered } (lowered = how many processes stepped back). */
function startEvents(r) {
  if (!r || r.ok === false) return { events: [{ feature: 'apps', kind: 'failed', detail: 'start-failed' }], lowered: 0 }
  if (r.skipped === 'active') return { events: [{ feature: 'apps', kind: 'info', detail: 'still-ending' }], lowered: 0 }
  if (r.skipped) return { events: [], lowered: 0 }          // switched off: nothing was asked, nothing to say
  if (!(r.lowered > 0)) return { events: [{ feature: 'apps', kind: 'info', detail: 'nothing-to-lower' }], lowered: 0 }
  return { events: [{ feature: 'apps', kind: 'applied', key: 'gametime', detail: 'lowered', vars: { n: r.lowered } }], lowered: r.lowered }
}

/** r = result of appsSvc().gameEnd(); hadLowered = the start of this session lowered something. */
function endEvents(r, hadLowered) {
  if (!hadLowered) return []
  const s = r && r.session
  if (!s) return [{ feature: 'apps', kind: 'restored', key: 'gametime', ok: !(r && r.ok === false), detail: r && r.ok === false ? 'end-failed' : 'ok' }]
  const left = Number(s.left) || 0
  return [{ feature: 'apps', kind: 'restored', key: 'gametime', ok: left === 0, detail: left ? 'left' : 'ok', vars: { n: Number(s.restored) || 0, left } }]
}

module.exports = { startEvents, endEvents }
