'use strict'
// The Limiter: one sentence on what is holding FPS back right now, from the last few seconds of data. Pure.
// Only data that was measured is used; with no frames it says so. Thresholds are the ones attribution.js and docs/PULSE_EVIDENCE.md use.
;(function (root) {
  const CAPS = [30, 40, 45, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 175, 240, 360]
  const has = v => typeof v === 'number' && Number.isFinite(v)
  const rnd = v => (has(v) ? Math.round(v) : null)

  /**
   * i: { fps, medianMs, p99Ms, jitter, cpu, gpu, cpuTemp, gpuTemp, ram, vramUsed, vramTotal, clock, baseClock, bg }  (any may be null)
   * returns { id, tone: 'ok'|'warn'|'danger'|'idle', evidence: {numbers}, suggest: { kind: 'tab'|'rule'|'none', target } }
   */
  function judge(i) {
    i = i || {}
    const none = { kind: 'none' }
    if (!has(i.fps) || !has(i.medianMs)) return { id: 'idle', tone: 'idle', evidence: {}, suggest: none }
    if ((has(i.cpuTemp) && i.cpuTemp >= 95) || (has(i.gpuTemp) && i.gpuTemp >= 87)) return { id: 'thermal', tone: 'danger', evidence: { cpuTemp: rnd(i.cpuTemp), gpuTemp: rnd(i.gpuTemp) }, suggest: { kind: 'tab', target: 'thermal' } }
    if (has(i.vramUsed) && has(i.vramTotal) && i.vramTotal > 0 && i.vramUsed / i.vramTotal >= 0.95) return { id: 'vram', tone: 'danger', evidence: { usedMB: rnd(i.vramUsed), totalMB: rnd(i.vramTotal) }, suggest: none }
    if (has(i.ram) && i.ram >= 92) return { id: 'ram', tone: 'danger', evidence: { ram: rnd(i.ram) }, suggest: { kind: 'rule', target: 'gameshield' } }
    if (has(i.bg) && i.bg >= 35) return { id: 'background', tone: 'warn', evidence: { bg: rnd(i.bg) }, suggest: { kind: 'rule', target: 'gameshield' } }
    if (has(i.gpu) && i.gpu >= 97) return { id: 'gpu', tone: 'ok', evidence: { gpu: rnd(i.gpu), cpu: rnd(i.cpu) }, suggest: none }
    if (has(i.cpu) && i.cpu >= 90) return { id: 'cpu', tone: 'warn', evidence: { cpu: rnd(i.cpu), gpu: rnd(i.gpu) }, suggest: { kind: 'tab', target: 'boost' } }
    if (has(i.clock) && has(i.baseClock) && i.baseClock > 0 && i.clock <= i.baseClock * 0.85) return { id: 'clock', tone: 'warn', evidence: { mhz: rnd(i.clock), baseMhz: rnd(i.baseClock) }, suggest: { kind: 'tab', target: 'thermal' } }
    // nothing is maxed: either the game is held at a cap, or the machine has headroom
    const steady = has(i.p99Ms) && i.p99Ms / i.medianMs < 1.25 && (!has(i.jitter) || i.jitter < 0.06)
    const cap = CAPS.find(c => Math.abs(i.fps - c) / c <= 0.02)
    if (steady && cap) return { id: 'capped', tone: 'ok', evidence: { capHz: cap }, suggest: none }
    return { id: 'balanced', tone: 'ok', evidence: { gpu: rnd(i.gpu), cpu: rnd(i.cpu) }, suggest: none }
  }

  const api = { CAPS, judge }
  root.JylliPulseLimiter = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
