'use strict'
// Restore-point nudge: pure status from the newest known restore point. Used by Home (Safety net card), the nav dot and the Restore tab banner.
//   restoreStatus({ newestAt, lastCreatedAt, now }) -> { level: 'fresh'|'stale'|'never', ageMs, at }
//   newestAt = newest Windows restore point (ms), lastCreatedAt = settings.lastRestorePointAt (ms). The newer of the two counts.
;(function (root) {
  const STALE_MS = 7 * 24 * 3600 * 1000

  function restoreStatus(input) {
    const i = input || {}
    const now = Number.isFinite(i.now) ? i.now : Date.now()
    const times = [i.newestAt, i.lastCreatedAt].filter(t => Number.isFinite(t) && t > 0)
    if (!times.length) return { level: 'never', ageMs: null, at: null }
    const at = Math.max(...times)
    const ageMs = Math.max(0, now - at)
    return { level: ageMs > STALE_MS ? 'stale' : 'fresh', ageMs, at }
  }

  // WMI date: 20250523143000.000000+120 (offset in minutes from UTC)
  function parseWmiDate(s) {
    const m = String(s || '').match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\.?\d*([+-]\d+)?$/)
    if (!m) return null
    const off = m[7] ? parseInt(m[7], 10) : 0
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - off * 60000
  }

  const api = { restoreStatus, parseWmiDate, STALE_MS }
  root.JylliRestoreNudge = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
