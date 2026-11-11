'use strict'
// Pulse score 0-1000 from measured parts. A part that was not measured is left out and the rest renormalised (JylliScore.blend),
// so a missing sensor can never raise or lower the score. Smoothness or stability must be measured, otherwise there is no score.
// Every part is returned with the number behind it.
;(function (root) {
  const blend = (typeof module !== 'undefined' && module.exports) ? require('../../js/score').blend : root.JylliScore.blend
  const WEIGHTS = { smooth: 0.35, stable: 0.25, thermal: 0.25, boost: 0.15 }
  const has = v => typeof v === 'number' && Number.isFinite(v)
  const clamp01 = v => Math.min(1, Math.max(0, v))
  const rnd = v => (has(v) ? Math.round(v) : null)

  /** i: { smoothness (0-100), avgFps, low1Fps, cpuTemp, gpuTemp, boost: { ok, total } | null } -> { score 0-1000|null, parts, missing } */
  function compute(i) {
    i = i || {}
    const temps = [i.cpuTemp, i.gpuTemp].filter(has)
    const hottest = temps.length ? Math.max(...temps) : null
    const parts = [
      { key: 'smooth', weight: WEIGHTS.smooth, value: has(i.smoothness) ? clamp01(i.smoothness / 100) : null, evidence: { smoothness: rnd(i.smoothness) } },
      { key: 'stable', weight: WEIGHTS.stable, value: has(i.avgFps) && has(i.low1Fps) && i.avgFps > 0 ? clamp01((i.low1Fps / i.avgFps - 0.4) / 0.45) : null, evidence: { avgFps: rnd(i.avgFps), low1Fps: rnd(i.low1Fps) } },
      { key: 'thermal', weight: WEIGHTS.thermal, value: hottest == null ? null : clamp01((95 - hottest) / 25), evidence: { hottestC: rnd(hottest) } },
      { key: 'boost', weight: WEIGHTS.boost, value: i.boost && i.boost.total > 0 ? clamp01(i.boost.ok / i.boost.total) : null, evidence: i.boost ? { ok: i.boost.ok, total: i.boost.total } : { ok: null, total: null } },
    ]
    const b = blend(parts.map(p => ({ key: p.key, value: p.value, weight: p.weight })))
    // a cool PC with no frames behind it is not a good score: the score needs at least one part about how the game ran
    const ran = b.used.includes('smooth') || b.used.includes('stable')
    return { score: b.score == null || !ran ? null : b.score * 10, parts, missing: b.missing }
  }
  /** colour tone for a score */
  const tone = s => (s == null ? 'idle' : s >= 800 ? 'ok' : s >= 600 ? 'warn' : 'danger')

  const api = { WEIGHTS, compute, tone }
  root.JylliPulseScore = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
