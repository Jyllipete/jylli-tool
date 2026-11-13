'use strict'
// What is holding the GPU back right now. Pure + UMD (the service and the page both use it).
// NVIDIA reports why it is not running faster as a bit mask (NVML clocks event reasons); every other vendor only gives load, VRAM and
// whatever the sensor bridge reads, so the limiter there is "unknown" unless the numbers themselves say so.
;(function (root) {
  const T = {
    LOADED: 60,            // load (%) from which the card counts as working, so "not at full clock" means something
    BUSY: 90,              // load (%) from which the card itself is the limit
    TEMP_WARN_BELOW: 15,   // °C under the slowdown temperature where the rail turns amber
    TEMP_BAD_BELOW: 5,     // °C under the slowdown temperature where the rail turns red
    TEMP_WARN: 83,         // used when the driver does not give a slowdown temperature
    TEMP_BAD: 90,
    VRAM_WARN: 85, VRAM_BAD: 95,
  }
  // NVML clocksEventReasons bits
  const REASONS = { 0x1: 'idle', 0x2: 'appclock', 0x4: 'power', 0x8: 'hwslow', 0x10: 'sync', 0x20: 'thermal', 0x40: 'hwthermal', 0x80: 'powerbrake', 0x100: 'displayclock' }

  /** "0x0000000000000004" | number -> ['power']; null when the value cannot be read. */
  function decodeReasons(v) {
    if (v == null || v === '') return null
    const s = String(v).trim()
    if (/^\[|n\/a|not supported/i.test(s)) return null
    const n = /^0x/i.test(s) ? parseInt(s, 16) : Number(s)
    if (!Number.isFinite(n)) return null
    return Object.keys(REASONS).filter(b => (n & Number(b)) !== 0).map(b => REASONS[b])
  }

  const pct = (v, max) => (v != null && max > 0 ? Math.max(0, Math.min(100, v / max * 100)) : null)

  /**
   * One frame + the scanned facts -> the five rails. A rail without a value is { value: null }; without a ceiling { max: null, pct: null }.
   * facts: { clockMaxMHz, powerLimitW, slowdownC, targetC, vramGB }
   */
  function rails(frame, facts = {}) {
    const f = frame || {}, s = f.smi || null, se = f.sensor || {}
    const load = s && s.load != null ? s.load : f.load != null ? f.load : null
    const clock = s ? s.clock : null
    const clockMax = (s && s.clockMax) || facts.clockMaxMHz || null
    const power = s && s.power != null ? s.power : se.power != null ? se.power : null
    const powerMax = (s && s.powerLimit) || facts.powerLimitW || null
    const temp = s && s.temp != null ? s.temp : se.tempCore != null ? se.tempCore : null
    const slow = facts.slowdownC || null
    const vramUsed = s && s.vramUsed != null ? s.vramUsed : f.mem && f.mem.dedicatedMB != null ? f.mem.dedicatedMB : null
    const vramTotal = (s && s.vramTotal) || (facts.vramGB ? facts.vramGB * 1024 : null)
    const tempTone = temp == null ? '' : slow ? (temp >= slow - T.TEMP_BAD_BELOW ? 'bad' : temp >= slow - T.TEMP_WARN_BELOW ? 'warn' : '') : (temp >= T.TEMP_BAD ? 'bad' : temp >= T.TEMP_WARN ? 'warn' : '')
    const vp = pct(vramUsed, vramTotal)
    return [
      { id: 'load', value: load, max: 100, unit: '%', pct: load, tone: '' },
      { id: 'clock', value: clock, max: clockMax, unit: 'MHz', pct: pct(clock, clockMax), tone: '' },
      { id: 'power', value: power, max: powerMax, unit: 'W', pct: pct(power, powerMax), tone: '' },
      { id: 'temp', value: temp, max: slow, unit: '°C', pct: slow ? pct(temp, slow) : temp, tone: tempTone, hot: se.tempHot != null ? se.tempHot : null },
      { id: 'vram', value: vramUsed, max: vramTotal, unit: 'MB', pct: vp, tone: vp == null ? '' : vp >= T.VRAM_BAD ? 'bad' : vp >= T.VRAM_WARN ? 'warn' : '' },
    ]
  }

  /**
   * The limiter of one frame: { id: 'idle'|'thermal'|'hardware'|'power'|'load'|'none'|'unknown', rail, reasons }.
   *   idle      the card is not working (load under LOADED), nothing is limiting it
   *   thermal   software or hardware thermal slowdown      hardware  hardware slowdown / power brake (PSU, connector, board)
   *   power     the power limit is holding the clock      load      the card is the limit: it is simply fully used
   *   none      working, no reason bit set                 unknown   the driver does not say
   */
  function limiterOf(frame, facts = {}) {
    const f = frame || {}, s = f.smi || null
    const load = s && s.load != null ? s.load : f.load != null ? f.load : null
    if (load != null && load < T.LOADED) return { id: 'idle', rail: null, reasons: s ? decodeReasons(s.reasons) : null }
    const reasons = s ? decodeReasons(s.reasons) : null
    if (reasons) {
      if (reasons.includes('hwthermal') || reasons.includes('thermal')) return { id: 'thermal', rail: 'temp', reasons }
      if (reasons.includes('hwslow') || reasons.includes('powerbrake')) return { id: 'hardware', rail: 'power', reasons }
      if (reasons.includes('power')) return { id: 'power', rail: 'power', reasons }
      if (load != null && load >= T.BUSY) return { id: 'load', rail: 'load', reasons }
      return { id: 'none', rail: null, reasons }
    }
    const t = rails(f, facts).find(r => r.id === 'temp')
    if (t && t.tone === 'bad') return { id: 'thermal', rail: 'temp', reasons: null }
    if (load != null && load >= T.BUSY) return { id: 'load', rail: 'load', reasons: null }
    return { id: 'unknown', rail: null, reasons: null }
  }

  const exported = { T, REASONS, decodeReasons, rails, limiterOf }
  if (typeof module !== 'undefined' && module.exports) module.exports = exported
  if (typeof window !== 'undefined') window.JylliGpuLimiter = exported
})(typeof window !== 'undefined' ? window : globalThis)
