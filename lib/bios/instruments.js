'use strict'
// Instruments (pure, UMD): which live readings the BIOS workstation shows, and how measurements are compared before/after a change.
// Nothing here touches the PC. A RAM run is "passes over 256 MB in N seconds": the rate (passes/s) is comparable between runs
// on the same PC, which is how a memory-profile or power change is judged. Errors are the only pass/fail signal.
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.JylliBiosInstruments = factory()
})(typeof window !== 'undefined' ? window : globalThis, function () {
  // key = telemetry hub key (lib/telemetry-hub.js), fmt = how to print the value
  const READINGS = [
    { key: 'cpu.load', unit: '%', digits: 0, group: 'cpu' },
    { key: 'cpu.temp.package', unit: '°C', digits: 0, group: 'cpu', hot: 90 },
    { key: 'cpu.power', unit: 'W', digits: 0, group: 'cpu' },
    { key: 'ram.used', unit: '%', digits: 0, group: 'ram' },
    { key: 'gpu0.load', unit: '%', digits: 0, group: 'gpu' },
    { key: 'gpu0.temp.core', unit: '°C', digits: 0, group: 'gpu', hot: 85 },
    { key: 'gpu0.power', unit: 'W', digits: 0, group: 'gpu' },
    { key: 'gpu0.fan.rpm', unit: 'rpm', digits: 0, group: 'gpu' },
  ]
  const DURATIONS = [15, 30, 60, 120]
  const MAX_RUNS = 20

  /** snapshot payload ({ s: { key: [value, ageMs, source] } }) -> [{ key, value|null, unit, text, hot }]; stale (>5 s) or missing = null, never 0 */
  function readings(snap) {
    const s = (snap && snap.s) || {}
    return READINGS.map(r => {
      const e = s[r.key]
      const v = e && typeof e[0] === 'number' && Number.isFinite(e[0]) && (e[1] == null || e[1] <= 5000) ? e[0] : null
      return { key: r.key, group: r.group, unit: r.unit, value: v, text: v == null ? null : v.toFixed(r.digits) + ' ' + r.unit, hot: v != null && r.hot != null && v >= r.hot }
    })
  }
  const pick = (list, key) => { const x = list.find(r => r.key === key); return x && x.value != null ? Math.round(x.value) : null }

  /** one measurement record from a finished RAM run + the readings taken at its end; null when the run itself failed */
  function makeRun({ ram, secs, label, now, list }) {
    if (!ram || !ram.ok || !(secs > 0) || !(ram.passes >= 0)) return null
    return { ts: now, label: String(label || '').slice(0, 60), secs, passes: ram.passes, errors: ram.errors, rate: Math.round((ram.passes / secs) * 100) / 100,
      cpuTemp: pick(list || [], 'cpu.temp.package'), cpuPower: pick(list || [], 'cpu.power') }
  }

  /**
   * Compare a run with the previous one. `pct` is the change in passes/s. Runs shorter than 10 s are not compared; a change under 3 %
   * is "same" because background load alone moves the rate that much.
   */
  function compare(prev, cur) {
    if (!prev || !cur || prev.secs < 10 || cur.secs < 10 || !(prev.rate > 0)) return null
    const pct = Math.round(((cur.rate - prev.rate) / prev.rate) * 1000) / 10
    return { pct, verdict: cur.errors > 0 ? 'errors' : Math.abs(pct) < 3 ? 'same' : pct > 0 ? 'faster' : 'slower' }
  }

  function addRun(runs, run) { return run ? [run].concat(Array.isArray(runs) ? runs : []).slice(0, MAX_RUNS) : (runs || []) }
  function parseStored(text) {
    try { const a = JSON.parse(text); return Array.isArray(a) ? a.filter(r => r && typeof r.rate === 'number' && typeof r.ts === 'number').slice(0, MAX_RUNS) : [] } catch { return [] }
  }

  return { READINGS, DURATIONS, MAX_RUNS, readings, makeRun, compare, addRun, parseStored }
})
