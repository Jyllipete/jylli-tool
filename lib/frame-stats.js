'use strict'
// The one definition of frame statistics used by Pulse, the FPS HUD and the session replay.
//   average FPS      = 1000 / mean frame time
//   1 % low FPS      = 1000 / mean of the slowest 1 % of frames      (the app's long-standing definition)
//   0.1 % low FPS    = 1000 / mean of the slowest 0.1 % of frames
// The tooltip text below is what the UI shows next to every "1 % low".

const LOW_TOOLTIP_KEY = 'fpsLowTip'   // "Average FPS of the slowest 1 % of frames."

/** Mean of the slowest `fraction` of frames (at least one frame). frameTimes in ms. */
function worstMean(frameTimes, fraction) {
  const sorted = frameTimes.slice().sort((a, b) => a - b)
  const start = Math.min(sorted.length - 1, Math.floor(sorted.length * (1 - fraction)))
  const slice = sorted.slice(start)
  return slice.reduce((s, v) => s + v, 0) / slice.length
}

function stats(frameTimes) {
  const ft = frameTimes.filter(v => Number.isFinite(v) && v > 0 && v < 1000)
  if (ft.length < 10) return null
  const mean = ft.reduce((s, v) => s + v, 0) / ft.length
  return { frames: ft.length, avgFps: 1000 / mean, low1Fps: 1000 / worstMean(ft, 0.01), low01Fps: 1000 / worstMean(ft, 0.001) }
}

// Histogram of frame times for sessions: fixed log-ish edges in ms so histograms from different sessions line up.
const EDGES = [2, 4, 6, 8, 10, 12, 14, 16.7, 20, 25, 33.3, 40, 50, 66.7, 100, 200]
function bucket(ms) { let i = 0; while (i < EDGES.length && ms >= EDGES[i]) i++; return i }   // 0..EDGES.length

module.exports = { worstMean, stats, EDGES, bucket, LOW_TOOLTIP_KEY }
