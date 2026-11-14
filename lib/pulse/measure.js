'use strict'
// Before / after for one boost. Pure. "Before" is the frames drawn just before the boost, "after" the frames drawn once it settled.
// They are different moments of play, so the result says how far to trust the comparison and never claims a cause.
;(function (root) {
  const has = v => typeof v === 'number' && Number.isFinite(v)
  const BEFORE_MS = 15000        // rendered time looked at before the boost
  const MIN_BEFORE_MS = 5000     // less than this is no baseline
  const SETTLE_MS = 5000         // rendered time ignored right after the boost
  const AFTER_MS = 15000         // rendered time looked at after it
  const r1 = v => (has(v) ? Math.round(v * 10) / 10 : null)
  const pick = s => (s ? { avgFps: r1(s.avgFps), low1Fps: r1(s.low1Fps), p99Ms: r1(s.p99Ms), smooth: has(s.smoothness) ? Math.round(s.smoothness) : null } : null)

  /** The latest frames covering up to `ms` of rendered time (oldest first). */
  function lastWindow(frames, ms) {
    const out = []; let t = 0
    for (let i = frames.length - 1; i >= 0 && t < ms; i--) { out.push(frames[i]); t += frames[i] }
    return { frames: out.reverse(), ms: t }
  }

  /** before/after: Frames.stats results (or null); limiters: { before, after } ids. -> { state, ... } */
  function compare(before, after, limiters) {
    const l = limiters || {}
    if (!before) return { state: 'unavailable', reason: 'no-before' }
    if (!after) return { state: 'unavailable', reason: 'no-after' }
    const b = pick(before), a = pick(after)
    const d = k => (has(a[k]) && has(b[k]) ? r1(a[k] - b[k]) : null)
    const capped = l.before === 'capped' || l.after === 'capped'
    const sameLimit = !!(l.before && l.after && l.before === l.after)
    return { state: 'done', before: b, after: a, delta: { avgFps: d('avgFps'), low1Fps: d('low1Fps'), p99Ms: d('p99Ms'), smooth: d('smooth') },
      capped, comparable: !capped && sameLimit, limiters: { before: l.before || null, after: l.after || null } }
  }

  const api = { BEFORE_MS, MIN_BEFORE_MS, SETTLE_MS, AFTER_MS, lastWindow, compare, pick }
  root.JylliPulseMeasure = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
