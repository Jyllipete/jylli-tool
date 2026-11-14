'use strict'
// Frame pacing from a recorded session's one-second bins ({ fps, maxMs, frames }). Pure, no require: the main process and the
// renderer run the same code. Everything here is derived from measured frame times; nothing is an FPS estimate.
//   smallSpikes    seconds whose worst frame is a visible stutter but below the hitch floor of lib/pulse/attribution.js (60 ms)
//   consistencyPct share of seconds whose worst frame stayed within 2x that second's average frame time (higher = smoother)
;(function (root) {
  const SPIKE_MIN_MS = 25          // below this a single slow frame is not noticeable on its own
  const SPIKE_FACTOR = 2.5         // and it must be this many times the session median
  const HITCH_FLOOR_MS = 60        // from here lib/pulse/attribution.js calls it a hitch
  const CONSISTENT_FACTOR = 2

  const median = a => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null }

  /** bins -> { seconds, medianMs, smallSpikes, consistencyPct } (nulls when there is nothing to measure) */
  function analyze(bins) {
    const ok = (Array.isArray(bins) ? bins : []).filter(b => b && b.frames > 0 && b.fps > 0 && Number.isFinite(b.maxMs))
    if (ok.length < 5) return { seconds: ok.length, medianMs: null, smallSpikes: null, consistencyPct: null }
    const medianMs = median(ok.map(b => 1000 / b.fps))
    let spikes = 0, steady = 0
    for (const b of ok) {
      const avg = 1000 / b.fps
      if (b.maxMs >= Math.max(SPIKE_MIN_MS, medianMs * SPIKE_FACTOR) && b.maxMs < HITCH_FLOOR_MS) spikes++
      if (b.maxMs <= avg * CONSISTENT_FACTOR) steady++
    }
    return { seconds: ok.length, medianMs: Math.round(medianMs * 10) / 10, smallSpikes: spikes, consistencyPct: Math.round((steady / ok.length) * 100) }
  }

  /** { 'Hardware: Independent Flip': n, 'Composed: Flip': n } -> [{ mode, pct, kind }] largest first. kind: direct | composed | other */
  function modes(counts) {
    const e = Object.entries(counts && typeof counts === 'object' ? counts : {}).filter(([, n]) => Number.isFinite(n) && n > 0)
    const total = e.reduce((s, [, n]) => s + n, 0)
    if (!total) return []
    const kind = m => (/^composed/i.test(m) ? 'composed' : /^hardware|independent|direct/i.test(m) ? 'direct' : 'other')
    return e.sort((a, b) => b[1] - a[1]).map(([mode, n]) => ({ mode, pct: Math.round((n / total) * 1000) / 10, kind: kind(mode) }))
  }

  const api = { SPIKE_MIN_MS, SPIKE_FACTOR, HITCH_FLOOR_MS, CONSISTENT_FACTOR, analyze, modes }
  root.JylliFivemPacing = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
