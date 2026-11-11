'use strict'
// Per-subsystem grades and the overall Vitals score. Pure and UMD (the page recomputes nothing, but the preview and tests share it).
// A subsystem with no measured rule has grade null ("not measured"); it never counts as 100 or 0 (see js/score.js).
;(function (root) {
  const blendFn = () => (root.JylliScore || (typeof require === 'function' ? require('../../js/score.js') : null)).blend

  const SUBSYSTEMS = ['stability', 'storage', 'memory', 'cpu', 'gpu', 'drivers', 'windows', 'security', 'network', 'config']
  const WEIGHT = { stability: 0.22, storage: 0.14, memory: 0.10, cpu: 0.10, gpu: 0.06, drivers: 0.10, windows: 0.10, security: 0.08, network: 0.05, config: 0.05 }
  const SEV = ['critical', 'high', 'medium', 'low', 'info']

  const clamp = n => Math.max(0, Math.min(100, Math.round(n)))
  const tone = g => g == null ? 'idle' : g >= 80 ? 'ok' : g >= 50 ? 'warn' : 'danger'

  /** measured: { subsystem: number of rules that could run }, findings: [{ subsystem, penalty }]. */
  function grades(measured, findings) {
    const out = {}
    for (const s of SUBSYSTEMS) {
      if (!measured[s]) { out[s] = null; continue }
      const pen = findings.filter(f => f.subsystem === s).reduce((a, f) => a + (f.penalty || 0), 0)
      out[s] = clamp(100 - pen)
    }
    return out
  }

  /** Overall: weighted blend of the measured subsystems, but one failing subsystem caps it (a dying disk is not "average"). */
  function overall(g) {
    const parts = SUBSYSTEMS.map(s => ({ key: s, value: g[s] == null ? null : g[s] / 100, weight: WEIGHT[s] }))
    const b = blendFn()(parts)
    if (b.score == null) return { score: null, used: b.used, missing: b.missing }
    const worst = Math.min(...b.used.map(s => g[s]))
    return { score: Math.min(b.score, worst + 30), used: b.used, missing: b.missing }
  }

  function sevRank(s) { const i = SEV.indexOf(s); return i < 0 ? SEV.length : i }

  const api = { SUBSYSTEMS, WEIGHT, SEV, grades, overall, tone, sevRank, clamp }
  root.JylliDiagGrade = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
