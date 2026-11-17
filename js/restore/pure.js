'use strict'
// Restore points tab "Lifeline": pure helpers for the page (no DOM, no IPC). Every fact comes from the service snapshot (lib/restore); nothing here decides what is true.
;(function (root) {
  const FILTERS = ['all', 'jylli', 'windows']
  const SCHEDULE = [[0, 'off'], [1, 'day'], [3, 'days3'], [7, 'week']]
  const ORIGIN_ICON = {
    manual: 'hand-pointer', beforeTweak: 'sliders', autoOpti: 'wand-magic-sparkles', firstRun: 'flag-checkered', debloat: 'broom', diagnostics: 'stethoscope',
    scheduled: 'clock-rotate-left', jylli: 'life-ring', installer: 'box-open', driver: 'microchip', windowsUpdate: 'rotate', restoreOp: 'rotate-left', windows: 'windows',
  }
  const NAMED_BY_APP = ['manual', 'beforeTweak', 'autoOpti', 'firstRun', 'debloat', 'diagnostics', 'scheduled']   // the app's own names are decoded; Windows' descriptions are shown as written

  const filterPoints = (points, f) => (f === 'all' ? points : points.filter(p => p.group === f))
  const counts = points => ({ all: points.length, jylli: points.filter(p => p.group === 'jylli').length, windows: points.filter(p => p.group === 'windows').length })

  function fmtBytes(n) {
    if (n == null || !Number.isFinite(n)) return '–'
    const gb = n / 1024 ** 3
    if (gb >= 10) return Math.round(gb) + ' GB'
    if (gb >= 1) return (Math.round(gb * 10) / 10) + ' GB'
    const mb = n / 1024 ** 2
    return mb >= 1 ? Math.round(mb) + ' MB' : '0 MB'
  }

  /** age -> { key, n } for the age_* strings. */
  function age(ms) {
    if (ms == null || !Number.isFinite(ms)) return { key: 'age_unknown', n: 0 }
    const m = Math.floor(ms / 60000)
    if (m < 2) return { key: 'age_now', n: 0 }
    if (m < 60) return { key: 'age_min', n: m }
    const h = Math.floor(m / 60)
    if (h < 24) return { key: 'age_hour', n: h }
    const d = Math.floor(h / 24)
    if (d < 60) return { key: 'age_day', n: d }
    return { key: 'age_month', n: Math.floor(d / 30) }
  }

  /** How full the cap is (0..1), or null when there is no cap. */
  const usedShare = st => (st && st.has && st.max ? Math.min(1, st.used / st.max) : null)
  /** The cap as a percent of the disk, or null when unknown / unbounded. */
  const capPercent = (st, vol) => (st && st.has && st.max && vol && vol.size ? (st.max / vol.size) * 100 : null)
  /** Which of the offered percents is closest to the current cap (within 1.5 points), else null. */
  function nearestPct(cap, offered) {
    if (cap == null) return null
    let best = null, d = 1.5
    for (const o of offered || []) { const x = Math.abs(o - cap); if (x < d) { d = x; best = o } }
    return best
  }

  /** Tick height in px: 1 change is a short stroke, a big batch is taller (log scale, capped). */
  const tickHeight = n => Math.round(Math.min(40, 10 + Math.log2(Math.max(1, n)) * 6))
  const pct = x => Math.round(x * 10000) / 100

  /** The "N changes after this point" figure, never larger than what the snapshot says. */
  const afterLabel = p => (p && p.after > 0 ? p.after : 0)

  const api = { FILTERS, SCHEDULE, ORIGIN_ICON, NAMED_BY_APP, filterPoints, counts, fmtBytes, age, usedShare, capPercent, nearestPct, tickHeight, pct, afterLabel }
  root.JylliRestorePure = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
