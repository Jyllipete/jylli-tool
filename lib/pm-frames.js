// PresentMon frame store: a fixed ring of frame times (ms) + a small tail of raw rows. O(1) per frame, ~400 KB for 100k frames.
// Replaces keeping every CSV line in memory (and splicing the oldest one out on each frame).
'use strict'
const FRAME_CAP = 100000
const TAIL_CAP = 400

function createFrames({ cap = FRAME_CAP, tailCap = TAIL_CAP } = {}) {
  let ring = new Float32Array(cap), head = 0, count = 0
  let header = null, msIdx = -1, modeIdx = -1, lastMode = null
  let tail = [], tailAt = 0
  const modes = Object.create(null)

  function reset() { head = 0; count = 0; header = null; msIdx = -1; modeIdx = -1; tail = []; tailAt = 0; for (const k of Object.keys(modes)) delete modes[k] }

  /** One stdout line. Returns the frame time in ms (> 0) when the line was a frame, else 0. */
  function pushLine(line) {
    const t = String(line).trim()
    if (!t) return 0
    if (!header) {
      header = t
      const cols = t.split(',').map(h => h.trim())
      msIdx = cols.findIndex(h => /MsBetweenPresents|msFrameTime|msBetweenPresents/i.test(h))
      modeIdx = cols.findIndex(h => /^PresentMode$/i.test(h))
      return 0
    }
    if (tail.length < tailCap) tail.push(t); else { tail[tailAt] = t; tailAt = (tailAt + 1) % tailCap }
    if (msIdx < 0) return 0
    const cols = t.split(',')
    const v = parseFloat(cols[msIdx])
    if (!(v > 0)) return 0
    ring[head] = v; head = (head + 1) % cap; if (count < cap) count++
    lastMode = modeIdx >= 0 ? cols[modeIdx] : null
    if (modeIdx >= 0 && cols[modeIdx]) { const m = cols[modeIdx].trim(); modes[m] = (modes[m] || 0) + 1 }
    return v
  }

  /** Same numbers as parsePresentMonCsvFromBuffer: frames in (0, 1000) ms, null under 10 frames. */
  function stats() {
    const xs = []
    for (let i = 0; i < count; i++) { const v = ring[(head - count + i + cap) % cap]; if (v > 0 && v < 1000) xs.push(v) }
    if (xs.length < 10) return null
    xs.sort((a, b) => a - b)
    const n = xs.length
    const avg = a => a.reduce((s, v) => s + v, 0) / a.length
    const r = v => Math.round(v * 100) / 100
    return { mean: r(avg(xs)), p1Low: r(avg(xs.slice(Math.floor(n * 0.99)))), p01Low: r(avg(xs.slice(Math.floor(n * 0.999)))), samples: n }
  }

  /** Header + the newest rows in arrival order (what the old buffer's tail slice gave the latency visualizer and ARIA). */
  function tailRows(n = tailCap) {
    const ordered = tail.length < tailCap ? tail.slice() : tail.slice(tailAt).concat(tail.slice(0, tailAt))
    return header ? [header].concat(ordered.slice(-n)) : []
  }

  return { pushLine, stats, tailRows, reset, get size() { return count }, get header() { return header }, get msIdx() { return msIdx }, get modeIdx() { return modeIdx }, get lastMode() { return lastMode }, modes: () => ({ ...modes }) }
}

module.exports = { createFrames, FRAME_CAP, TAIL_CAP }
