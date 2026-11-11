'use strict'
// Frame statistics and the river's column store for Pulse 2.0. Pure, no require (loads in main and in the renderer).
// Definitions match lib/frame-stats.js: avg FPS = 1000 / mean frame time, 1 % / 0.1 % low = 1000 / mean of the slowest 1 % / 0.1 %.
// New here: p99 frame time, jitter (median absolute deviation / median) and a pacing score 0-100 (docs/PULSE_EVIDENCE.md).
;(function (root) {
  const COL_MS = 250          // one river column covers 250 ms of frame time
  const COL_CAP = 240         // 60 s of river
  const RING_CAP = 4096       // about 10 s of frames at 400 fps, more at lower rates

  const ok = v => Number.isFinite(v) && v > 0 && v < 1000
  const clamp01 = v => Math.min(1, Math.max(0, v))
  const sortedCopy = a => Array.from(a).sort((x, y) => x - y)
  function median(sorted) { if (!sorted.length) return null; const m = sorted.length >> 1; return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2 }
  function worstMean(sorted, fraction) {
    const start = Math.min(sorted.length - 1, Math.floor(sorted.length * (1 - fraction)))
    let sum = 0
    for (let i = start; i < sorted.length; i++) sum += sorted[i]
    return sum / (sorted.length - start)
  }
  const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]

  /** frames: array of ms. Null when fewer than 10 usable frames (never a made-up number). */
  function stats(frames) {
    const ft = Array.from(frames || []).filter(ok)
    if (ft.length < 10) return null
    const s = sortedCopy(ft)
    let sum = 0
    for (const v of ft) sum += v
    const mean = sum / ft.length
    const med = median(s)
    const mad = median(sortedCopy(s.map(v => Math.abs(v - med))))
    const p99 = pct(s, 0.99)
    const jitter = mad / med
    // pacing: half from how tight the middle is (jitter), half from how far the slow tail sits above the median
    const smooth = Math.round(100 * (0.5 * (1 - clamp01(jitter / 0.2)) + 0.5 * (1 - clamp01((p99 / med - 1.2) / 1.8))))
    return {
      frames: ft.length, avgFps: 1000 / mean, low1Fps: 1000 / worstMean(s, 0.01), low01Fps: 1000 / worstMean(s, 0.001),
      medianMs: med, p99Ms: p99, maxMs: s[s.length - 1], jitter, smoothness: smooth,
    }
  }

  /** Fixed-size ring of the latest frame times. */
  function createRing(cap = RING_CAP) {
    const buf = new Float32Array(cap)
    let n = 0, head = 0
    return {
      push(ms) { buf[head] = ms; head = (head + 1) % cap; if (n < cap) n++ },
      /** the latest `count` frames, oldest first */
      last(count = n) {
        const c = Math.min(count, n), out = new Array(c)
        for (let i = 0; i < c; i++) out[i] = buf[(head - c + i + cap * 2) % cap]
        return out
      },
      get size() { return n },
      clear() { n = 0; head = 0 },
    }
  }

  /**
   * River columns. Frame time is the clock (a paused game adds nothing), so a column is 250 ms of rendered time.
   * A column keeps { t (ms since start), at (wall clock when it began), n, med, lo, hi }; hi is the slowest frame, which is what a hitch is.
   */
  function createColumns({ colMs = COL_MS, cap = COL_CAP, clock = null } = {}) {
    const cols = []
    let t = 0, cur = null
    const shape = (c, open) => { const s = sortedCopy(c.f); const o = { t: c.t, at: c.at, n: s.length, med: median(s), lo: s[0], hi: s[s.length - 1] }; if (open) o.open = true; return o }
    function seal() {
      if (cur && cur.f.length) { cols.push(shape(cur)); if (cols.length > cap) cols.shift() }
      cur = null
    }
    return {
      push(ms) {
        if (!ok(ms)) return
        if (!cur) cur = { t, at: clock ? clock() : 0, f: [] }
        cur.f.push(ms)
        t += ms
        if (t - cur.t >= colMs) seal()
      },
      /** sealed columns plus the one being built, oldest first */
      view() { return cur && cur.f.length ? cols.concat([shape(cur, true)]) : cols.slice() },
      get now() { return t },
      clear() { cols.length = 0; cur = null; t = 0 },
    }
  }

  const api = { COL_MS, COL_CAP, RING_CAP, stats, median, worstMean, createRing, createColumns }
  root.JylliPulseFrames = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
