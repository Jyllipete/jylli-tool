'use strict'
// Network tab, pure helpers (no DOM): status looks, chips, verdict, node readings, finding text variables, grades, sparkline. Unit-tested; page.js, views.js and path-view.js use them.
;(function (root) {
  // glyph = Font Awesome name, tone = ok | warn | info | idle (css maps tone -> token)
  const STATUS = {
    on:      { glyph: 'check',              tone: 'ok' },
    native:  { glyph: 'lock',               tone: 'ok' },
    partial: { glyph: 'circle-half-stroke', tone: 'warn' },
    off:     { glyph: 'circle',             tone: 'idle' },
    drifted: { glyph: 'rotate-left',        tone: 'warn' },
    restart: { glyph: 'rotate-right',       tone: 'info' },
    unknown: { glyph: 'circle-question',    tone: 'idle' },
    once:    { glyph: 'wrench',             tone: 'idle' },
  }
  const LANE_ICON = { resolver: 'globe', adapter: 'microchip', protocol: 'network-wired', repair: 'wrench', retired: 'box-archive' }
  const NODE_ICON = { pc: 'desktop', link: 'wifi', router: 'tower-broadcast', isp: 'building', internet: 'globe' }
  const CHIPS = ['all', 'rec', 'set', 'open', 'drifted', 'risky']
  const VIEWS = ['overview', 'tune', 'measure', 'history']

  const statusLook = s => STATUS[s] || STATUS.unknown
  /** Shown as on? native = Windows already has it (locked: Jylli did not set it, so Jylli does not undo it). */
  const isOn = it => it.status === 'on' || it.status === 'native' || it.status === 'restart' || (it.status === 'unknown' && it.remembered === 'applied')
  const isLocked = it => it.status === 'native'
  const flipAction = it => (isOn(it) ? 'restore' : 'apply')

  function chipMatch(it, chip) {
    switch (chip) {
      case 'rec': return !!it.rec
      case 'set': return it.status === 'on' || it.status === 'native' || it.status === 'restart'
      case 'open': return it.status === 'off' || it.status === 'partial' || it.status === 'drifted'
      case 'drifted': return it.status === 'drifted'
      case 'risky': return it.tier >= 2
      default: return true
    }
  }
  function chipCounts(items) { const o = {}; for (const c of CHIPS) o[c] = items.filter(i => chipMatch(i, c)).length; return o }
  function matches(it, q, text) { q = String(q || '').trim().toLowerCase(); return !q || (String(text || '') + ' ' + it.id).toLowerCase().includes(q) }

  /** Relative time: { k: 'now'|'min'|'hour'|'day', n } */
  function ago(ms, now) {
    if (!ms) return null
    const d = Math.max(0, (now || Date.now()) - ms), m = Math.round(d / 60000)
    if (m < 1) return { k: 'now', n: 0 }
    if (m < 60) return { k: 'min', n: m }
    if (m < 1440) return { k: 'hour', n: Math.round(m / 60) }
    return { k: 'day', n: Math.round(m / 1440) }
  }

  const r1 = v => Math.round(v * 10) / 10
  /** "12" / "8.4" / "–": latency numbers as the stage prints them. */
  const fmtMs = v => (v == null || !Number.isFinite(v) ? '–' : v >= 100 ? String(Math.round(v)) : String(r1(v)))

  /** What a node prints under its icon: { value, unit, sub: [{k, v}] } (sub keys are LANG `nd_<k>` labels). */
  function nodeText(n) {
    if (!n) return { value: '–', unit: '', sub: [] }
    const v = n.v || {}
    if (n.id === 'pc') return { value: '', unit: '', sub: [] }
    if (n.id === 'link') {
      if (v.kind === 'wifi') return { value: v.rssi == null ? '–' : String(v.rssi), unit: 'dBm', sub: [v.band ? { k: 'band', v: v.band + ' GHz' } : null, v.radio ? { k: 'radio', v: v.radio } : null].filter(Boolean) }
      if (v.kind === 'ethernet') return { value: v.speedMbps == null ? '–' : v.speedMbps >= 1000 ? String(r1(v.speedMbps / 1000)) : String(v.speedMbps), unit: v.speedMbps != null && v.speedMbps >= 1000 ? 'Gbps' : 'Mbps', sub: [] }
      return { value: '–', unit: '', sub: [] }
    }
    const sub = []
    if (n.ms != null) {
      if (n.jitter != null) sub.push({ k: 'jitter', v: fmtMs(n.jitter) + ' ms' })
      if (n.loss != null) sub.push({ k: 'loss', v: n.loss + ' %' })
    }
    return { value: fmtMs(n.ms), unit: n.ms == null ? '' : 'ms', sub }
  }

  /** The sentence under the stage: which LANG key, which tone, which variables. last = the last checkup | null. */
  function stageVerdict(path, model, last) {
    const v = path && path.verdict
    if (v && v.id && v.id !== 'idle') {
      if (v.id === 'measuring') return { key: 'vMeasuring', tone: 'accent', vars: {} }
      if (v.id === 'clean') return { key: 'vClean', tone: 'ok', vars: flat(v.ev) }
      const bad = ['loss-home', 'loss-isp', 'loss-transit', 'loss-server', 'unreachable', 'no-replies'].includes(v.id)
      const key = v.id === 'jitter-home' && v.wifi ? 'vWifi' : v.id === 'loss-home' && v.wifi ? 'vWifiLoss' : 'v_' + v.id
      return { key, tone: bad ? 'danger' : 'warn', vars: flat(v.ev) }
    }
    if (model && !model.live) return { key: 'vUnread', tone: 'idle', vars: {} }
    return { key: last ? 'vStale' : 'vNever', tone: 'idle', vars: {} }
  }
  function flat(ev) {
    const o = {}
    for (const [k, v] of Object.entries(ev || {})) if (v != null && typeof v !== 'object') o[k] = typeof v === 'number' ? r1(v) : v
    return o
  }

  /** Variables a finding's LANG text may use. nameOf(id) = tweak name. */
  function findingVars(f, nameOf) {
    const ev = f.ev || {}, o = flat(ev)
    if (Array.isArray(ev.ids)) { o.n = ev.ids.length; o.names = ev.ids.slice(0, 3).map(nameOf).join(', ') + (ev.ids.length > 3 ? ' …' : '') }
    if (ev.best != null) o.best = ev.best
    return o
  }

  /** Bufferbloat grade from the extra latency under load (ms): A+ ... F, the bufferbloat.net convention. */
  function bloatGrade(extra) {
    if (extra == null || !Number.isFinite(extra)) return null
    return extra < 5 ? 'A+' : extra < 30 ? 'A' : extra < 60 ? 'B' : extra < 200 ? 'C' : extra < 400 ? 'D' : 'F'
  }
  const gradeTone = g => (!g ? 'idle' : g[0] === 'A' ? 'ok' : g === 'B' || g === 'C' ? 'warn' : 'danger')

  /** Game server row tone from avg / loss. */
  function pingTone(r) {
    if (!r || r.avg == null || r.avg < 0) return 'danger'
    if ((r.packetLoss || 0) >= 2 || r.avg >= 150) return 'danger'
    if ((r.packetLoss || 0) > 0 || r.avg >= 70 || (r.jitter || 0) >= 15) return 'warn'
    return 'ok'
  }

  /** Change against the previous run of the same server: { k: 'better'|'worse'|'same'|'none', v, t }. prevRows = { name: avg }. Under 3 ms is noise. */
  function pingDelta(r, prevRows) {
    const was = prevRows && prevRows[r.name]
    if (r.avg == null || r.avg < 0 || was == null || was < 0) return { k: 'none', v: '', t: '' }
    const d = Math.round((r.avg - was) * 10) / 10
    if (Math.abs(d) < 3) return { k: 'same', v: '≈', t: String(was) }
    return { k: d < 0 ? 'better' : 'worse', v: (d < 0 ? '−' : '+') + Math.abs(d), t: String(was) }
  }

  /** Values -> SVG polyline points string in a w x h box (nulls break nothing: they are skipped). */
  function sparkPoints(values, w, h, pad = 2) {
    const v = (values || []).map(x => (x == null || !Number.isFinite(x) ? null : x))
    const ok = v.filter(x => x != null)
    if (ok.length < 2) return ''
    const lo = Math.min(...ok), hi = Math.max(...ok), span = hi - lo || 1
    const step = (w - pad * 2) / Math.max(1, v.length - 1)
    return v.map((x, i) => (x == null ? null : (pad + i * step).toFixed(1) + ',' + (h - pad - ((x - lo) / span) * (h - pad * 2)).toFixed(1))).filter(Boolean).join(' ')
  }

  /** Receipt numbers: what changed, what was read back, what needs attention. */
  function receiptNumbers(r) {
    const c = r.counts || {}
    return { ok: c.ok || 0, failed: c.failed || 0, verified: c.verified || 0, mismatch: c.mismatch || 0, restart: c.restart || 0, total: (r.items || []).length }
  }

  /** Preview before a batch: items grouped by lane, and what the batch will cost. */
  function previewGroups(model, ids) {
    const set = new Set(ids), groups = []
    for (const l of model.lanes) { const list = l.ids.filter(id => set.has(id)); if (list.length) groups.push({ lane: l.id, ids: list }) }
    const items = model.items.filter(i => set.has(i.id))
    return { groups, n: items.length, restart: items.filter(i => i.reboot).length, restorePoint: items.some(i => i.tier >= 2) || items.length > 5 }
  }

  /** Custom DNS form check (same rule as lib/network/index.js validateDns, so the sheet can say what is wrong before anything is sent). */
  function dnsInput(primary, secondary) {
    const p = String(primary || '').trim(), s = String(secondary || '').trim()
    const ip = a => /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(a) && a !== '0.0.0.0' && a !== '255.255.255.255' && !a.startsWith('127.')
    if (!p) return { ok: false, error: 'primary-missing' }
    if (!ip(p)) return { ok: false, error: 'primary-invalid' }
    if (s && !ip(s)) return { ok: false, error: 'secondary-invalid' }
    if (s && s === p) return { ok: false, error: 'same' }
    return { ok: true, primary: p, secondary: s }
  }

  const api = { STATUS, LANE_ICON, NODE_ICON, CHIPS, VIEWS, statusLook, isOn, isLocked, flipAction, chipMatch, chipCounts, matches, ago, fmtMs, nodeText, stageVerdict, findingVars, bloatGrade, gradeTone, pingTone, pingDelta, sparkPoints, receiptNumbers, previewGroups, dnsInput }
  root.JylliNetworkPure = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
