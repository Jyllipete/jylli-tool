'use strict'
// Energy, pure. Watts over time -> watt-hours by the trapezoid rule, per source. Sources that were not measured stay null and are never summed as 0;
// the total is "CPU + GPU", never claimed to be what the wall socket delivers.
const MAX_GAP_MS = 5000          // a gap longer than this (poller paused, game running) is not integrated across
const KEEP = 20                  // sessions kept
const num = v => { const n = Number(v); return v == null || v === '' || !Number.isFinite(n) || n < 0 ? null : n }
const round = (v, d) => { const f = 10 ** d; return Math.round(v * f) / f }

function createMeter() {
  const last = { t: null, cpu: null, gpu: null }
  let startT = null, samples = 0
  const stat = () => ({ wh: 0, peakW: 0, sumW: 0, n: 0 })
  const acc = { cpu: stat(), gpu: stat() }
  function push(t, { cpu, gpu } = {}) {
    if (startT == null) startT = t
    samples++
    for (const [k, v] of [['cpu', num(cpu)], ['gpu', num(gpu)]]) {
      const a = acc[k]
      if (v == null) { last[k] = null; continue }
      if (last[k] != null && last.t != null && t - last.t > 0 && t - last.t <= MAX_GAP_MS) a.wh += ((last[k] + v) / 2) * ((t - last.t) / 3600000)
      a.peakW = Math.max(a.peakW, v); a.sumW += v; a.n++
      last[k] = v
    }
    last.t = t
  }
  function summary(now) {
    const part = a => (a.n ? { wh: round(a.wh, 3), avgW: round(a.sumW / a.n, 1), peakW: round(a.peakW, 1), samples: a.n } : null)
    const cpu = part(acc.cpu), gpu = part(acc.gpu)
    const parts = [cpu, gpu].filter(Boolean)
    return { ms: startT == null ? 0 : (now || last.t) - startT, cpu, gpu, whTotal: parts.length ? round(parts.reduce((s, p) => s + p.wh, 0), 3) : null, samples }
  }
  return { push, summary }
}

/** Cost in the user's currency for wh at price per kWh. null when either is missing. */
const cost = (wh, pricePerKwh) => (wh == null || num(pricePerKwh) == null ? null : round((wh / 1000) * pricePerKwh, 4))
/** Projected per hour from an average draw: { wh, cost }. null when the draw was not measured. */
const perHour = (avgW, price) => (avgW == null ? null : { wh: round(avgW, 1), cost: cost(avgW, price) })

const exported = { createMeter, cost, perHour, MAX_GAP_MS, KEEP }
if (typeof module !== 'undefined' && module.exports) module.exports = exported
if (typeof window !== 'undefined') window.JylliPowerEnergy = exported
