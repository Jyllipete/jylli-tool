'use strict'
// The only list of what the GPU tab may say about this PC. A finding exists only when its evidence is in the input, and every threshold
// below has a name and is documented in docs/GPU_EVIDENCE.md. Pure + UMD: the service runs `statics` from a scan, the page re-runs `live` on live frames.
;(function (root) {
  const L = root.JylliGpuLimiter || (typeof require === 'function' ? require('./limiter') : null)
  const T = {
    LIVE_MIN_FRAMES: 10,       // a live finding needs this many one-second frames, so one spike never counts
    DRIVER_OLD_DAYS: 180,      // driver build date older than this
    LINK_GAP_HZ: 20,           // EDID max refresh minus the best offered mode, at the current resolution
    REFRESH_GAP_HZ: 3,         // below this a "faster mode" is 59.94 vs 60, not a fix (same as lib/auto-opti/display.js)
    THROTTLE_SHARE: 0.2,       // share of loaded frames with a thermal reason bit
    SLOWDOWN_SHARE: 0.2,       // share of loaded frames with hardware slowdown / power brake
    POWERCAP_SHARE: 0.5,       // share of loaded frames held by the power limit
    HOTSPOT_DELTA_C: 25,       // average hotspot minus core temperature
    VRAM_FULL_PCT: 95,         // average dedicated memory in use
    LINK_LOW_SHARE: 0.8,       // share of loaded frames on a slower PCIe link than the maximum
    FAN_STOPPED_TEMP_C: 80,    // a fan at 0 rpm above this is a fault, not a semi-passive mode
  }
  const RANK = { bad: 0, warn: 1, info: 2 }
  const DRIVER_URL = { nvidia: 'https://www.nvidia.com/Download/index.aspx', amd: 'https://www.amd.com/en/support/download/drivers.html', intel: 'https://www.intel.com/content/www/us/en/download-center/home.html' }

  /**
   * Static findings. i = { name, vendor, discrete, dlssFrameGen, driverDays, irqMode, rebar, hybrid, laptop, displays:[display.parseList entries],
   *   status: {tweakId: 'on'|'native'|'off'|...}, remembered: {tweakId: 'applied'|...}, power: {current, default}|null, remote }
   */
  function statics(i = {}) {
    const out = []
    const add = (id, tone, vars, action) => out.push({ id, kind: 'static', tone, vars: vars || {}, action: action || null })
    const st = i.status || {}, rem = i.remembered || {}
    const set = id => st[id] === 'on' || st[id] === 'native'
    if (/microsoft basic (display|render)/i.test(i.name || '')) add('no-driver', 'bad', { name: i.name }, DRIVER_URL[i.vendor] ? { kind: 'url', url: DRIVER_URL[i.vendor] } : null)
    else if (i.driverDays != null && i.driverDays >= T.DRIVER_OLD_DAYS) add('driver-old', 'info', { days: i.driverDays, months: Math.round(i.driverDays / 30) }, DRIVER_URL[i.vendor] ? { kind: 'url', url: DRIVER_URL[i.vendor] } : null)

    const D = i.displays || []
    if (!i.remote) {
      const slow = D.map(d => ({ d, best: Math.max(0, ...(d.modes || []).filter(m => m.w === d.cur.w && m.h === d.cur.h).map(m => m.hz)) })).filter(x => x.best - x.d.cur.hz >= T.REFRESH_GAP_HZ)
      if (slow.length) add('refresh-below-max', 'warn', { monitor: slow[0].d.monitor || slow[0].d.device, cur: slow[0].d.cur.hz, max: slow[0].best, count: slow.length }, { kind: 'display' })
      else if (D.length === 1 && D[0].edidMaxHz && D[0].edidMaxHz - D[0].maxHzAtCur >= T.LINK_GAP_HZ) add('link-limited', 'warn', { monitor: D[0].monitor, cur: D[0].maxHzAtCur, max: D[0].edidMaxHz })
    }
    if (i.rebar === false && i.vendor === 'nvidia') add('rebar-off', 'info', {}, { kind: 'bios' })
    if (i.hybrid === true && !set('gpu-per-app-preference') && rem['gpu-per-app-preference'] !== 'applied') add('hybrid-games-igpu', 'warn', {}, { kind: 'switch', id: 'gpu-per-app-preference' })
    if (i.discrete === true && i.irqMode === 'line' && !set('msi-mode')) add('line-interrupts', 'info', {}, { kind: 'reveal', id: 'msi-mode' })
    // Absent HwSchMode means "driver decides", so only an explicit 1 (read by the gpu-hags-off probe) is evidence that scheduling is off.
    if (i.dlssFrameGen === true && set('gpu-hags-off')) add('fg-needs-hags', 'info', { name: i.name }, { kind: 'reveal', id: 'gpu-hags-off' })
    if (i.power && i.power.current != null && i.power.default != null && Math.abs(i.power.current - i.power.default) > 1) add('power-limit-custom', 'info', { w: i.power.current, d: i.power.default })
    return sort(out)
  }

  const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)

  /**
   * Live findings over a window of frames. ctx = { facts: {clockMaxMHz, powerLimitW, slowdownC, vramGB, pcieGenMax, pcieWidthMax} }
   * Returns [] until LIVE_MIN_FRAMES frames exist.
   */
  function live(frames, ctx = {}) {
    const out = []
    const f = (frames || []).filter(Boolean)
    if (f.length < T.LIVE_MIN_FRAMES || !L) return out
    const facts = ctx.facts || {}
    const add = (id, tone, vars) => out.push({ id, kind: 'live', tone, vars: vars || {}, action: null })
    const loaded = f.filter(x => { const r = L.rails(x, facts)[0].value; return r != null && r >= L.T.LOADED })
    const withReasons = loaded.filter(x => x.smi && L.decodeReasons(x.smi.reasons))
    const share = names => (withReasons.length >= T.LIVE_MIN_FRAMES ? withReasons.filter(x => L.decodeReasons(x.smi.reasons).some(r => names.includes(r))).length / withReasons.length : 0)
    const hw = share(['hwthermal']), sw = share(['thermal'])
    if (hw >= T.THROTTLE_SHARE || sw >= T.THROTTLE_SHARE) add('thermal-throttle', hw >= T.THROTTLE_SHARE ? 'bad' : 'warn', { pct: Math.round(Math.max(hw, sw) * 100) })
    const slow = share(['hwslow', 'powerbrake'])
    if (slow >= T.SLOWDOWN_SHARE) add('hw-slowdown', 'warn', { pct: Math.round(slow * 100) })
    const cap = share(['power'])
    if (cap >= T.POWERCAP_SHARE) add('power-capped', 'info', { pct: Math.round(cap * 100), w: Math.round(mean(loaded.map(x => x.smi && x.smi.powerLimit).filter(v => v != null)) || facts.powerLimitW || 0) })
    const deltas = f.filter(x => x.sensor && x.sensor.tempHot != null && x.sensor.tempCore != null).map(x => x.sensor.tempHot - x.sensor.tempCore)
    if (deltas.length >= T.LIVE_MIN_FRAMES && mean(deltas) >= T.HOTSPOT_DELTA_C) add('hotspot-delta', 'warn', { c: Math.round(mean(deltas)) })
    const vr = f.map(x => L.rails(x, facts)[4].pct).filter(v => v != null)
    if (vr.length >= T.LIVE_MIN_FRAMES && mean(vr) >= T.VRAM_FULL_PCT) add('vram-full', 'warn', { pct: Math.round(mean(vr)) })
    const gm = facts.pcieGenMax, wm = facts.pcieWidthMax
    const linked = loaded.filter(x => x.smi && x.smi.genCur != null && x.smi.widthCur != null)
    if ((gm || wm) && linked.length >= T.LIVE_MIN_FRAMES) {
      const low = linked.filter(x => (gm && x.smi.genCur < gm) || (wm && x.smi.widthCur < wm))
      if (low.length / linked.length >= T.LINK_LOW_SHARE) add('pcie-link-low', 'warn', { gen: linked[linked.length - 1].smi.genCur, genMax: gm || '?', width: linked[linked.length - 1].smi.widthCur, widthMax: wm || '?' })
    }
    const hot = f.filter(x => x.smi && x.smi.temp != null && x.smi.temp >= T.FAN_STOPPED_TEMP_C && x.smi.fan != null)
    if (hot.length >= T.LIVE_MIN_FRAMES && hot.every(x => x.smi.fan === 0)) add('fan-stopped-hot', 'bad', { c: Math.round(mean(hot.map(x => x.smi.temp))) })
    return sort(out)
  }

  const sort = list => list.sort((a, b) => RANK[a.tone] - RANK[b.tone])
  const IDS = ['no-driver', 'driver-old', 'refresh-below-max', 'link-limited', 'rebar-off', 'hybrid-games-igpu', 'line-interrupts', 'fg-needs-hags', 'power-limit-custom',
    'thermal-throttle', 'hw-slowdown', 'power-capped', 'hotspot-delta', 'vram-full', 'pcie-link-low', 'fan-stopped-hot']

  const exported = { T, IDS, DRIVER_URL, statics, live }
  if (typeof module !== 'undefined' && module.exports) module.exports = exported
  if (typeof window !== 'undefined') window.JylliGpuFindings = exported
})(typeof window !== 'undefined' ? window : globalThis)
