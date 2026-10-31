'use strict'
// Pure mapping from live telemetry to what the rig may show. The honesty rules live here:
//   - heat tint only when a temperature value exists (never from load, never from a guess)
//   - a fan only spins when RPM, or a duty percentage, was actually reported
//   - load glow only with a load value
// Anything else stays neutral. `snap` is the hub snapshot { s: { key: [value, ageMs, source] } }.
;(function (root) {
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x))
  const val = (snap, k) => { const e = snap && snap.s && snap.s[k]; return e && e[0] != null && Number.isFinite(e[0]) ? e[0] : null }

  // [accent -> warn -> danger] ramp thresholds in degrees C
  const RAMPS = { cpu: [62, 80, 92], gpu: [62, 80, 92] }

  /** 0 = accent (cool), 1 = warm, 2 = hot; null when there is no temperature. Continuous in between. */
  function heatLevel(kind, temp) {
    if (temp == null) return null
    const [a, w, d] = RAMPS[kind] || RAMPS.cpu
    if (temp <= a) return 0
    if (temp <= w) return (temp - a) / (w - a)
    return 1 + clamp((temp - w) / (d - w), 0, 1)
  }

  function mix(c1, c2, t) { return [c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t] }
  /** RGB (0..1 each) for a heat level, given the accent colour. */
  function heatColor(level, accent, warn = [0.96, 0.65, 0.14], danger = [0.95, 0.33, 0.35]) {
    if (level == null) return accent
    return level <= 1 ? mix(accent, warn, level) : mix(warn, danger, level - 1)
  }

  /** Fan speed 0..1 from RPM (preferred) or duty %; null when neither exists. `maxRpm` only scales the visual. */
  function fanLevel(rpm, pct, maxRpm = 3000) {
    if (rpm != null) return clamp(rpm / maxRpm, 0, 1)
    if (pct != null) return clamp(pct / 100, 0, 1)
    return null
  }

  /** Everything the engine needs per frame. */
  function visualState(snap) {
    const cpuT = val(snap, 'cpu.temp.package'), gpuT = val(snap, 'gpu0.temp.hotspot') ?? val(snap, 'gpu0.temp.core')
    const cpuL = val(snap, 'cpu.load'), gpuL = val(snap, 'gpu0.load')
    const ramL = val(snap, 'ram.load')
    const gpuFan = fanLevel(val(snap, 'gpu0.fan.rpm'), val(snap, 'gpu0.fan.pct'))
    const mbFans = ['mb.fan1.rpm', 'mb.fan2.rpm', 'mb.fan3.rpm', 'mb.fan4.rpm', 'cooler.fan.rpm'].map(k => val(snap, k)).filter(v => v != null)
    return {
      cpu: { heat: heatLevel('cpu', cpuT), load: cpuL == null ? null : cpuL / 100, temp: cpuT },
      gpu: { heat: heatLevel('gpu', gpuT), load: gpuL == null ? null : gpuL / 100, temp: gpuT, fan: gpuFan },
      ram: { fill: ramL == null ? null : ramL / 100 },
      pump: { level: fanLevel(val(snap, 'cooler.pump.rpm'), null, 4500) },
      caseFans: mbFans.map(r => fanLevel(r, null)),      // length = number of fans we really have a reading for
      net: { rx: val(snap, 'net.rx'), tx: val(snap, 'net.tx') },
    }
  }

  const api = { heatLevel, heatColor, fanLevel, visualState, mix }
  root.JylliTwinMapping = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
