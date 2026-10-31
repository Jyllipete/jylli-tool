'use strict'
// Score blending that never invents data: a component whose input is unknown (null) is left out and the remaining weights
// are renormalised, so "not measured" can neither raise nor lower the result. Shared by main (health score) and the renderer (Pulse score).
;(function (root) {
  /** parts: [{ key, value: 0..1 | null, weight }]. Returns { score: 0..100 | null, used: [keys], missing: [keys] }. */
  function blend(parts) {
    let sum = 0, wsum = 0
    const used = [], missing = []
    for (const p of parts) {
      if (p.value == null || !Number.isFinite(p.value)) { missing.push(p.key); continue }
      sum += Math.min(1, Math.max(0, p.value)) * p.weight
      wsum += p.weight
      used.push(p.key)
    }
    return { score: wsum > 0 ? Math.round((sum / wsum) * 100) : null, used, missing }
  }
  const api = { blend }
  root.JylliScore = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
