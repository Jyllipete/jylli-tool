'use strict'
// Merges every live data source (hardware sensor bridge, nvidia-smi, OS counters) into one picture with stable keys.
// A key only has a value while some source has reported it recently; otherwise it is "unavailable" with a reason. Nothing here
// ever fills in 0 or a neutral guess, and the renderer cannot tell a missing sensor from a real reading unless it checks.

// Higher number wins when two sources report the same key.
const PRIORITY = { sensor: 3, nvidia: 2, os: 1 }

// Keys that only a hardware driver can provide: if the sensor bridge runs but lacks them, the reason is "needs-driver".
const DRIVER_KEYS = [/^disk\d+\.temp$/, /^cpu\.temp\./, /^cpu\.power$/, /^mb\./, /^cooler\./]

function createHub({ now = Date.now, ringSeconds = 120, staleFactor = 3, minStaleMs = 2500 } = {}) {
  const cur = new Map()       // key -> { source -> { value, t, rateHz, detail } }
  const rings = new Map()     // key -> [{t, v}]
  const ctx = { sensorRunning: false, sensorHasDriver: null, nvidiaPresent: null }
  let seq = 0

  function ingest(source, values, { rateHz = 1, detail = '', unit = '' } = {}) {
    const t = now()
    for (const [key, value] of Object.entries(values)) {
      let per = cur.get(key)
      if (!per) { per = {}; cur.set(key, per) }
      const ok = typeof value === 'number' && Number.isFinite(value)
      per[source] = { value: ok ? value : null, t, rateHz, detail, unit, reported: true }
      if (ok) {
        let r = rings.get(key)
        if (!r) { r = []; rings.set(key, r) }
        r.push({ t, v: value })
        const cutoff = t - ringSeconds * 1000
        while (r.length && r[0].t < cutoff) r.shift()
      }
    }
  }

  function staleMs(rateHz) { return Math.max(minStaleMs, (staleFactor * 1000) / Math.max(rateHz, 0.1)) }

  /** Best current entry for a key, or null. */
  function best(key) {
    const per = cur.get(key)
    if (!per) return null
    const t = now()
    let pick = null
    for (const [source, e] of Object.entries(per)) {
      if (e.value == null || t - e.t > staleMs(e.rateHz)) continue
      if (!pick || PRIORITY[source] > PRIORITY[pick.source]) pick = { source, ...e }
    }
    return pick
  }

  function reasonFor(key) {
    const per = cur.get(key)
    if (per) {
      const t = now()
      const anyFresh = Object.values(per).some(e => t - e.t <= staleMs(e.rateHz))
      if (!anyFresh) return 'stale'
      return 'not-supported'      // a source reports the key but its value is empty (NaN / [N/A])
    }
    if (DRIVER_KEYS.some(rx => rx.test(key)) && ctx.sensorRunning && ctx.sensorHasDriver === false) return 'needs-driver'
    if (!ctx.sensorRunning && /^(cpu\.temp|cpu\.power|mb\.|cooler\.)/.test(key)) return 'no-sensor'
    return 'no-sensor'
  }

  /** { key: [value|null, ageMs, source|null] } for every known key; the payload pushed to the renderer. */
  function snapshot() {
    const t = now(), s = {}
    for (const key of cur.keys()) {
      const b = best(key)
      s[key] = b ? [b.value, t - b.t, b.source] : [null, null, null]
    }
    return { v: 1, seq: ++seq, t, s }
  }

  /** What each key offers right now: availability, source, rate, last time seen, and the reason when unavailable. */
  function capabilities(expectedKeys = []) {
    const out = {}
    const keys = new Set([...cur.keys(), ...expectedKeys])
    const t = now()
    for (const key of keys) {
      const b = best(key)
      if (b) { out[key] = { available: true, source: b.source, detail: b.detail, unit: b.unit, rateHz: b.rateHz, lastSeen: b.t } }
      else out[key] = { available: false, reason: reasonFor(key) }
    }
    return out
  }

  function series(key, seconds = 60) {
    const r = rings.get(key) || []
    const cutoff = now() - seconds * 1000
    return r.filter(p => p.t >= cutoff)
  }

  function value(key) { const b = best(key); return b ? b.value : null }

  /** Legacy get-metrics shape. Unknown stays null; the old code defaulted everything to 0. */
  function legacyMetrics() {
    const v = k => value(k)
    const ramTotal = v('ram.total'), ramUsed = v('ram.used')
    return {
      cpu: v('cpu.load') == null ? null : Math.round(v('cpu.load')),
      ram: ramTotal ? Math.round((ramUsed / ramTotal) * 100) : v('ram.load'),
      ramUsed: ramUsed == null ? null : Math.round(ramUsed),
      ramTotal: ramTotal == null ? null : Math.round(ramTotal),
      disk: v('disk.c.pct'), diskUsed: v('disk.c.used'), diskTotal: v('disk.c.total'),
      gpu: v('gpu0.load') == null ? null : Math.round(v('gpu0.load')),
      netDown: v('net.rx'), netUp: v('net.tx'),
      uptime: v('sys.uptime'), processes: v('sys.processes'),
      cpuTemp: v('cpu.temp.package'), gpuTemp: v('gpu0.temp.core'),
    }
  }

  return { ingest, snapshot, capabilities, series, value, legacyMetrics, setContext(o) { Object.assign(ctx, o) }, getContext: () => ({ ...ctx }) }
}

module.exports = { createHub, PRIORITY }
