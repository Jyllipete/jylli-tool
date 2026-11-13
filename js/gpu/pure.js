'use strict'
// GPU tab "Headroom", pure helpers (no DOM): view ids, verdict, identity chips, rails -> display numbers, traces, monitor rows, report rows, number formats.
// Builds on js/network/pure.js (status looks, chips, receipt numbers, batch preview groups): one vocabulary for every verified-switch tab. Unit-tested.
;(function (root) {
  const N = root.JylliNetworkPure || (typeof require === 'function' ? require('../network/pure') : {})
  const L = root.JylliGpuLimiter || (typeof require === 'function' ? require('../../lib/gpu/limiter') : null)
  const LANE_ICON = { scheduling: 'microchip', displaypath: 'display', stability: 'shield-halved', retired: 'box-archive' }
  const VIEWS = ['overview', 'tune', 'display', 'history']
  const RAILS = ['load', 'clock', 'power', 'temp', 'vram']
  const RAIL_ICON = { load: 'gauge-high', clock: 'wave-square', power: 'bolt', temp: 'temperature-half', vram: 'memory' }
  const ENGINES = ['gfx', 'compute', 'copy', 'decode', 'encode']
  const TRACE_LEN = 60
  const ARCH = { rtx50: 'RTX 50 series (Blackwell)', rtx40: 'RTX 40 series (Ada)', rtx30: 'RTX 30 series (Ampere)', rtx20: 'RTX 20 series (Turing)', gtx16: 'GTX 16 series', gtx10: 'GTX 10 series', older: 'Older GeForce', rdna4: 'RDNA 4', rdna3: 'RDNA 3', rdna2: 'RDNA 2', rdna1: 'RDNA 1', gcn: 'GCN', vega: 'Vega', 'arc-alchemist': 'Arc Alchemist', 'arc-battlemage': 'Arc Battlemage', uhd: 'UHD Graphics', xe: 'Xe Graphics' }

  const r1 = v => Math.round(v * 10) / 10
  const num = v => (v != null && Number.isFinite(Number(v)) ? Number(v) : null)

  /** MB -> "6.1 GB" / "640 MB" */
  const fmtMB = mb => (num(mb) == null ? '–' : mb >= 1024 ? r1(mb / 1024) + ' GB' : Math.round(mb) + ' MB')
  /** MHz -> "2.52" (GHz, 2 decimals) or "–" */
  const fmtGHz = mhz => (num(mhz) > 0 ? (mhz / 1000).toFixed(2) : '–')
  const pct = v => (num(v) == null ? '–' : Math.round(v) + '%')

  /** One rail -> what the card prints: { main, unit, ceil, fill (0..100|null), tone }. Unknown values print "–", never 0. */
  function railRead(r) {
    if (!r || num(r.value) == null) return { main: '–', unit: '', ceil: null, fill: null, tone: '' }
    const fill = r.max && r.pct != null ? Math.max(0, Math.min(100, r.pct)) : r.id === 'load' ? Math.min(100, r.value) : null
    switch (r.id) {
      case 'load': return { main: String(Math.round(r.value)), unit: '%', ceil: '100 %', fill, tone: '' }
      case 'clock': return { main: fmtGHz(r.value), unit: 'GHz', ceil: r.max ? fmtGHz(r.max) + ' GHz' : null, fill, tone: '' }
      case 'power': return { main: String(Math.round(r.value)), unit: 'W', ceil: r.max ? Math.round(r.max) + ' W' : null, fill, tone: r.pct != null && r.pct >= 99 ? 'cap' : '' }
      case 'temp': return { main: String(Math.round(r.value)), unit: '°C', ceil: r.max ? Math.round(r.max) + ' °C' : null, fill: r.max ? fill : null, tone: r.tone || '' }
      case 'vram': return { main: r.value >= 1024 ? r1(r.value / 1024).toString() : String(Math.round(r.value)), unit: r.value >= 1024 ? 'GB' : 'MB', ceil: r.max ? fmtMB(r.max) : null, fill, tone: r.tone || '' }
      default: return { main: String(r.value), unit: r.unit || '', ceil: null, fill, tone: '' }
    }
  }

  /** A rolling trace of the last TRACE_LEN one-second values (null = no reading that second). */
  function createTrace(len = TRACE_LEN) {
    const v = []
    return { push(x) { v.push(num(x)); if (v.length > len) v.shift() }, values: () => v.slice(), reset() { v.length = 0 }, size: () => v.length }
  }
  /**
   * values -> an SVG polyline `points` string in a w x h box. lo/hi fix the scale (a rail with a ceiling uses 0..ceiling); null breaks the line, so
   * it returns an array of segments. Without a fixed scale the line is fitted to its own min..max with a floor of `span` so noise stays flat.
   */
  function sparkSegments(values, w, h, lo, hi, span = 5) {
    const have = values.filter(v => v != null)
    if (!have.length) return []
    let a = lo, b = hi
    if (a == null || b == null || !(b > a)) { a = Math.min(...have); b = Math.max(...have); if (b - a < span) { const m = (a + b) / 2; a = m - span / 2; b = m + span / 2 } }
    const step = values.length > 1 ? w / (TRACE_LEN - 1) : 0, off = w - (values.length - 1) * step
    const segs = []; let cur = []
    values.forEach((v, i) => {
      if (v == null) { if (cur.length) segs.push(cur.join(' ')); cur = []; return }
      const y = h - 1 - Math.max(0, Math.min(1, (v - a) / (b - a))) * (h - 2)
      cur.push(r1(off + i * step) + ',' + r1(y))
    })
    if (cur.length) segs.push(cur.join(' '))
    return segs
  }

  /** The limiter of the latest frame as the card needs it: { id, rail, reasons } or null before any frame. */
  const limiterNow = (frame, facts) => (frame && L ? L.limiterOf(frame, facts || {}) : null)

  /**
   * The headline of the stage: the worst finding wins, then Windows reverting something, then open recommended switches, then clean.
   * Returns { kind, id|null, tone: 'danger'|'warn'|'ok'|'idle'|'accent', vars }
   */
  function stageVerdict(model, finds, paused) {
    if (!model) return { kind: 'unread', id: null, tone: 'idle', vars: {} }
    const list = finds || []
    const bad = list.find(f => f.tone === 'bad')
    if (bad) return { kind: 'finding', id: bad.id, tone: 'danger', vars: flat(bad.vars) }
    if (model.drifted && model.drifted.length) return { kind: 'drift', id: null, tone: 'warn', vars: { n: model.drifted.length } }
    const warn = list.find(f => f.tone === 'warn')
    if (warn) return { kind: 'finding', id: warn.id, tone: 'warn', vars: flat(warn.vars) }
    if (model.recommendedIds && model.recommendedIds.length) return { kind: 'open', id: null, tone: 'accent', vars: { n: model.recommendedIds.length } }
    if (paused) return { kind: 'paused', id: null, tone: 'idle', vars: {} }
    return { kind: 'clean', id: null, tone: 'ok', vars: {} }
  }
  function flat(v) {
    const o = {}
    for (const [k, x] of Object.entries(v || {})) if (x != null && typeof x !== 'object') o[k] = typeof x === 'number' ? r1(x) : x
    return o
  }

  /** What a finding's action button does, as { kind, label key, ... } for the page. */
  function actionOf(f) {
    const a = f && f.action
    if (!a) return null
    if (a.kind === 'bios') return { kind: 'tab', tab: 'bios', label: 'actBios' }
    if (a.kind === 'display') return { kind: 'display', label: 'actDisplay' }
    if (a.kind === 'switch') return { kind: 'switch', id: a.id, label: 'actReveal' }
    if (a.kind === 'reveal') return { kind: 'reveal', id: a.id, label: 'actReveal' }
    if (a.kind === 'url') return { kind: 'url', url: a.url, label: 'actDriver' }
    return null
  }

  /** Identity chips under the name: [{ k, icon, vars }] only for what is known. facts = snapshot.facts */
  function identity(facts) {
    const g = facts && facts.gpu
    if (!g) return []
    const out = []
    if (g.arch) out.push({ k: 'arch', icon: 'microchip', vars: { arch: ARCH[g.arch] || g.arch } })
    if (g.vramGB) out.push({ k: 'vram', icon: 'memory', vars: { gb: g.vramGB } })
    if (g.driver) out.push({ k: 'driver', icon: 'download', vars: { v: g.driver, days: g.driverDays == null ? '' : g.driverDays } })
    const s = facts.smi
    if (s && s.pcieGenMax) out.push({ k: 'pcie', icon: 'plug', vars: { gen: s.pcieGenMax, w: s.pcieWidthMax || '?' } })
    if (s && s.rebar != null) out.push({ k: s.rebar ? 'rebarOn' : 'rebarOff', icon: 'expand', vars: {} })
    if (g.irqMode) out.push({ k: g.irqMode === 'msi' ? 'irqMsi' : 'irqLine', icon: 'bolt', vars: {} })
    return out
  }

  /** Monitors -> rows for the Display view. */
  function displayRows(displays) {
    return (displays || []).map(d => {
      const same = (d.modes || []).filter(m => m.w === d.cur.w && m.h === d.cur.h)
      const hzs = [...new Set(same.map(m => m.hz))].sort((a, b) => b - a)
      const best = hzs[0] || d.cur.hz
      return { device: d.device, monitor: d.monitor || '', primary: !!d.primary, w: d.cur.w, h: d.cur.h, hz: d.cur.hz, best, hzs,
        below: best - d.cur.hz >= 3, edid: d.edidMaxHz || null, linkLimited: !!(d.edidMaxHz && d.edidMaxHz - d.maxHzAtCur >= 20), index: Number((/DISPLAY(\d+)/.exec(d.device) || [])[1]) || 0 }
    })
  }

  /** Engine bars from one frame. */
  const engineRows = frame => ENGINES.map(id => ({ id, v: frame && frame.eng ? Math.round(frame.eng[id] || 0) : null }))
  /** Top programs: by GPU time, then by memory; names without .exe. */
  function procRows(frame, max = 6) {
    const list = ((frame && frame.procs) || []).slice().sort((a, b) => (b.util - a.util) || (b.mb - a.mb)).slice(0, max)
    const mu = Math.max(1, ...list.map(p => p.mb))
    return list.map(p => ({ pid: p.pid, name: String(p.name || '?').replace(/\.exe$/i, ''), util: Math.round(p.util), mb: p.mb, memFill: Math.round(p.mb / mu * 100) }))
  }

  /** Report -> rows the card prints: [{ k, main, unit, sub, tone }]; null values stay "–". */
  function reportRows(r) {
    if (!r || !r.ok) return []
    const rows = []
    rows.push({ k: 'work', main: r.work == null ? '–' : String(r.work), unit: 'G/s' })
    rows.push({ k: 'clock', main: r.clockAvg == null ? '–' : fmtGHz(r.clockAvg), unit: 'GHz', sub: r.clockPct == null ? null : r.clockPct + '%' })
    rows.push({ k: 'power', main: r.powerAvg == null ? '–' : String(Math.round(r.powerAvg)), unit: 'W', sub: r.powerPct == null ? null : r.powerPct + '%' })
    rows.push({ k: 'temp', main: r.tempPeak == null ? '–' : String(Math.round(r.tempPeak)), unit: '°C', sub: r.hotspotPeak == null ? null : String(Math.round(r.hotspotPeak)), tone: r.tempPeak >= 87 ? 'bad' : r.tempPeak >= 80 ? 'warn' : '' })
    return rows
  }
  /** delta part -> "+1.2" / "−50" / null */
  function signed(v, d = 0) { if (v == null) return null; const a = Math.abs(v), s = d ? a.toFixed(d) : String(Math.round(a)); return (v > 0 ? '+' : v < 0 ? '−' : '±') + s }

  const api = { ...N, LANE_ICON, VIEWS, RAILS, RAIL_ICON, ENGINES, TRACE_LEN, fmtMB, fmtGHz, pct, railRead, createTrace, sparkSegments, limiterNow, stageVerdict, actionOf, identity, displayRows, engineRows, procRows, reportRows, signed }
  root.JylliGpuPure = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
