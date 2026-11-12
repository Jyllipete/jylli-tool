'use strict'
// Hitch attribution, shared by Pulse (live river, debrief) and FiveM (session recorder). For a recorded session: A hitch is a one-second bin whose worst frame is far above the session's typical
// frame time. The cause is named only when telemetry recorded within 2 s supports it; otherwise it is "unknown". Network events
// are listed separately and are never blamed for frame hitches. Pure, no require.
;(function (root) {
  const WINDOW = 2
  const MIN_HITCH_MS = 60
  const HITCH_FACTOR = 4

  const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  function median(a) {
    const s = a.filter(v => v != null).sort((x, y) => x - y)
    if (!s.length) return null
    const m = s.length >> 1
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
  }
  const seriesAt = (series, key, i) => { const a = series && series[key]; return a ? num(a[i]) : null }
  const around = (series, key, i) => { const out = []; for (let k = i - WINDOW; k <= i + WINDOW; k++) { const v = seriesAt(series, key, k); if (v != null) out.push(v) } return out }

  // priority order: the first that applies is the primary cause
  const CAUSES = ['thermal', 'vram-full', 'ram-pressure', 'background-spike', 'gpu-bound', 'cpu-bound', 'clock-drop']
  // Temperatures at which a hitch counts as thermal. Home's Timeline draws the same line, so the two can never disagree.
  const THERMAL_LIMIT = { cpu: 95, gpu: 87 }
  const BG_SPIKE_PCT = 35   // a non-game process using this much of the whole CPU (series 'bg.cpu', optional)

  /** Frame time above which a frame counts as a hitch, given the typical (median) frame time. One definition for the river and the debrief. */
  function hitchLimit(medianMs) { return medianMs == null ? null : Math.max(MIN_HITCH_MS, medianMs * HITCH_FACTOR) }

  /** The same rules for one instant of live telemetry: { cpuTemp, gpuTemp, vramUsed, vramTotal, ram, bg, gpu, cpu, clock, baseClock } -> causes, primary first. */
  function sampleCauses(s) {
    s = s || {}
    const out = []
    if ((num(s.cpuTemp) != null && s.cpuTemp >= THERMAL_LIMIT.cpu) || (num(s.gpuTemp) != null && s.gpuTemp >= THERMAL_LIMIT.gpu)) out.push('thermal')
    if (num(s.vramUsed) != null && num(s.vramTotal) && s.vramUsed / s.vramTotal >= 0.95) out.push('vram-full')
    if (num(s.ram) != null && s.ram >= 92) out.push('ram-pressure')
    if (num(s.bg) != null && s.bg >= BG_SPIKE_PCT) out.push('background-spike')
    if (num(s.gpu) != null && s.gpu >= 97) out.push('gpu-bound')
    if (num(s.cpu) != null && s.cpu >= 90) out.push('cpu-bound')
    if (num(s.clock) != null && num(s.baseClock) && s.clock <= s.baseClock * 0.85) out.push('clock-drop')
    return out
  }

  function causesAt(session, i, base) {
    const s = session.series || {}
    const out = []
    const max = k => { const v = around(s, k, i); return v.length ? Math.max(...v) : null }
    const min = k => { const v = around(s, k, i); return v.length ? Math.min(...v) : null }
    const cpuT = max('cpu.temp.package'), gpuT = max('gpu0.temp.core')
    if ((cpuT != null && cpuT >= THERMAL_LIMIT.cpu) || (gpuT != null && gpuT >= THERMAL_LIMIT.gpu)) out.push('thermal')
    const used = max('gpu0.vram.used'), total = max('gpu0.vram.total')
    if (used != null && total && used / total >= 0.95) out.push('vram-full')
    const ram = max('ram.load')
    if (ram != null && ram >= 92) out.push('ram-pressure')
    const bg = max('bg.cpu')
    if (bg != null && bg >= BG_SPIKE_PCT) out.push('background-spike')
    const gpu = max('gpu0.load'), cpu = max('cpu.load')
    if (gpu != null && gpu >= 97) out.push('gpu-bound')
    if (cpu != null && cpu >= 90) out.push('cpu-bound')
    const clk = min('gpu0.clock.core')
    if (clk != null && base.clock && clk <= base.clock * 0.85) out.push('clock-drop')
    return out.sort((a, b) => CAUSES.indexOf(a) - CAUSES.indexOf(b))
  }

  /** session: { bins:[{fps,maxMs,frames}], series:{key:[...]}, net?:{ rtt:[ms|null per second] } } -> { hitches, net, medianMs, hasTelemetry } */
  function analyze(session) {
    const bins = (session && session.bins) || []
    const avgMs = bins.map(b => (b && b.fps > 0 ? 1000 / b.fps : null))
    const medianMs = median(avgMs)
    const limit = hitchLimit(medianMs)
    const hasTelemetry = !!(session && session.seconds > 0)
    const base = { clock: median(((session && session.series && session.series['gpu0.clock.core']) || []).map(num)) }
    const events = []
    if (limit != null) {
      bins.forEach((b, i) => {
        if (!b || !(b.maxMs >= limit) || !(b.frames > 0)) return
        const last = events[events.length - 1]
        if (last && i - last.endSec <= 1) { last.endSec = i; last.worstMs = Math.max(last.worstMs, b.maxMs); last.bins++ }
        else events.push({ startSec: i, endSec: i, worstMs: b.maxMs, bins: 1 })
      })
    }
    const hitches = events.map(e => {
      const set = new Set()
      if (hasTelemetry) for (let i = e.startSec; i <= e.endSec; i++) for (const c of causesAt(session, i, base)) set.add(c)
      const causes = CAUSES.filter(c => set.has(c))
      return { startSec: e.startSec, endSec: e.endSec, worstMs: Math.round(e.worstMs), causes, primary: causes[0] || 'unknown' }
    })
    return { hitches, net: netEvents(session && session.net), medianMs: medianMs == null ? null : Math.round(medianMs * 10) / 10, hasTelemetry }
  }

  /** net.rtt: one value per second, null = no reply. Spikes and loss runs are reported as events of their own. */
  function netEvents(net) {
    const rtt = net && Array.isArray(net.rtt) ? net.rtt : null
    if (!rtt || rtt.length < 10) return []
    const med = median(rtt)
    if (med == null) return [{ type: 'down', startSec: 0, endSec: rtt.length - 1, worst: null }]
    const spike = Math.max(80, med * 2.5)
    const out = []
    let i = 0
    while (i < rtt.length) {
      const v = rtt[i]
      if (v == null) {
        let j = i; while (j + 1 < rtt.length && rtt[j + 1] == null) j++
        if (j - i + 1 >= 2) out.push({ type: 'loss', startSec: i, endSec: j, worst: null })
        i = j + 1
      } else if (v >= spike) {
        let j = i, w = v; while (j + 1 < rtt.length && rtt[j + 1] != null && rtt[j + 1] >= spike) { j++; w = Math.max(w, rtt[j]) }
        out.push({ type: 'spike', startSec: i, endSec: j, worst: Math.round(w) })
        i = j + 1
      } else i++
    }
    return out
  }

  const api = { CAUSES, THERMAL_LIMIT, MIN_HITCH_MS, HITCH_FACTOR, BG_SPIKE_PCT, hitchLimit, causesAt, sampleCauses, analyze, netEvents, median }
  root.JylliPulseAttribution = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
