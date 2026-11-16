'use strict'
// Discord gate ("Keyring"), pure part: which state the screen is in, how far the four real stages have got, how many of the
// 120 ticks are left, which avatar Discord shows by default. No DOM, no IPC. Unit-tested (test/gate-pure.test.js).
;(function (root) {
  const WINDOW_MS = 120000          // how long one sign-in may wait (the outer ring: one tick per second)
  const TICKS = 120
  const POLL_MS = 2000
  const STAGES = ['browser', 'approve', 'verify', 'unlocked']

  const STATES = ['idle', 'expired', 'opening', 'waiting', 'browserFailed', 'denied', 'timeout', 'offline', 'checking', 'noSession', 'granted']

  /** How many of the four stages are true in a state (0..4). Each arc of the middle ring fills when its stage is true. */
  function stageOf(state, verifying) {
    switch (state) {
      case 'opening': return 0
      case 'browserFailed': return 0
      case 'waiting': return verifying ? 3 : 2
      case 'checking': return 3
      case 'granted': return 4
      default: return 0
    }
  }

  /** Ticks still lit on the outer ring. Never negative, never above TICKS. */
  function ticksLeft(deadline, now) {
    if (!(deadline > 0)) return TICKS
    const left = Math.ceil((deadline - now) / 1000)
    return Math.max(0, Math.min(TICKS, left))
  }

  /** The server's reason for a refusal -> the LANG key suffix that explains it. Unknown reasons are the common case: not in the server. */
  function reasonKey(reason) {
    if (reason === 'bad_entitlement') return 'key'
    if (reason === 'expired' || reason === 'state_expired' || reason === 'invalid_state') return 'expired'
    if (reason === 'cancelled') return 'cancelled'
    if (reason === 'banned') return 'banned'
    if (reason === 'error') return 'error'
    return 'member'   // not_member, not_in_server and anything older bots send
  }

  /** Discord's default avatar: (id >> 22) % 6 for the current naming system. A malformed id must not break the gate -> 0. */
  function avatarIndex(id) {
    try { return id ? Number((BigInt(id) >> 22n) % 6n) : 0 } catch { return 0 }
  }

  /** The picture shown on success: the person's own Discord avatar when the bot sent a valid hash, otherwise Discord's default one. */
  function avatarUrl(id, profile) {
    const hash = profile && typeof profile.avatar === 'string' && /^(a_)?[0-9a-f]{1,64}$/.test(profile.avatar) ? profile.avatar : null
    if (hash && typeof id === 'string' && /^\d{5,25}$/.test(id)) return 'https://cdn.discordapp.com/avatars/' + id + '/' + hash + '.png?size=128'
    return 'https://cdn.discordapp.com/embed/avatars/' + avatarIndex(id) + '.png'
  }

  /** "Welcome" or "Welcome, Name": the name is plain text, shortened to 32 characters. */
  function welcomeLine(welcome, profile) {
    const n = profile && typeof profile.name === 'string' ? profile.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 32) : ''
    return n ? welcome + ', ' + n : welcome
  }

  /** Which copy the success line uses. */
  function tierKey(isPremium) { return isPremium === true ? 'premium' : 'free' }

  /** Whether a state shows the primary "Link Discord" style action, and which one. */
  function primaryAction(state, reason) {
    switch (state) {
      case 'idle': case 'expired': return 'link'
      case 'noSession': return 'link'
      case 'timeout': case 'offline': return 'again'
      case 'denied': { const k = reasonKey(reason); return k === 'member' ? 'join' : k === 'banned' ? null : 'again' }
      case 'browserFailed': return 'reopen'
      default: return null
    }
  }

  /** A network-looking failure from authStart/authPoll (error code or message) -> offline. */
  function isOffline(err) {
    const s = String(err && (err.code || err.message || err) || '')
    return /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|timeout|network|fetch/i.test(s)
  }

  const api = { WINDOW_MS, TICKS, POLL_MS, STAGES, STATES, stageOf, ticksLeft, reasonKey, avatarIndex, avatarUrl, welcomeLine, tierKey, primaryAction, isOffline }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else root.JylliGatePure = api
})(typeof globalThis !== 'undefined' ? globalThis : this)
