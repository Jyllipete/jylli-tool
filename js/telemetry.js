'use strict'
// Renderer side of the telemetry pipeline. Every live number in the app goes through fmt(): a missing, stale or unsupported
// value is shown as "Not available" with the reason, never as 0. The pure parts (fmt, ease, hysteresis) are unit-tested.
;(function (root) {
  const REASON_KEY = { 'needs-driver': 'metricNeedsDriver', 'not-supported': 'metricNotSupported', 'no-sensor': 'metricNoSensor', stale: 'metricStale', premium: 'metricPremium' }

  // Unit by key suffix. 'pct' = percent, 'mb' = megabytes (shown as GB above 1024), 'bps' = bytes per second.
  function unitOf(key) {
    if (/\.temp\./.test(key) || /^disk\d+\.temp$/.test(key)) return 'c'
    if (/\.(load|pct|fan\.pct)$/.test(key)) return 'pct'
    if (/\.power(\.limit)?$/.test(key)) return 'w'
    if (/\.clock\./.test(key)) return 'mhz'
    if (/\.rpm$/.test(key)) return 'rpm'
    if (/(\.vram\.(used|total))$/.test(key)) return 'mb'
    if (/^(ram|disk\.c)\.(used|total)$/.test(key)) return 'gb'
    if (/(^|\.)(rx|tx)$/.test(key)) return 'bps'
    return ''
  }

  /** Integer-shown values only move once the target is clearly past the shown one. */
  function hysteresis(shown, target, band = 0.6) {
    if (shown == null || !Number.isFinite(shown)) return Math.round(target)
    return Math.abs(target - shown) > band ? Math.round(target) : shown
  }

  /** Exponential ease toward a target (tau in ms). dt in ms. */
  function ease(display, target, dt, tau = 350) {
    if (display == null || !Number.isFinite(display)) return target
    return display + (target - display) * (1 - Math.exp(-dt / tau))
  }

  function fmtBytes(v, prevUnit) {
    // KB -> MB at 1000, back at 900 (prevUnit keeps the choice stable)
    const kb = v / 1024
    const asMB = prevUnit === 'MB' ? kb >= 900 * 1 : kb >= 1000
    if (asMB) return { n: (kb / 1024).toFixed(kb / 1024 >= 10 ? 0 : 1), u: 'MB/s' }
    return { n: kb >= 10 ? kb.toFixed(0) : kb.toFixed(1), u: 'KB/s' }
  }

  /**
   * entry: [value|null, ageMs|null, source|null] from a snapshot, or undefined. caps: capability map entry (optional).
   * Returns { ok, text, unit, reason, title }. `t` translates keys (defaults to identity so the module works in tests).
   */
  function fmt(key, entry, caps, t = k => k, shown = null) {
    const value = entry ? entry[0] : null
    if (value == null || !Number.isFinite(value)) {
      const reason = caps && caps.available === false ? caps.reason : 'no-sensor'
      const why = t(REASON_KEY[reason] || 'metricNoSensor')
      return { ok: false, text: t('metricNA'), unit: '', reason, title: `${t('metricNA')}: ${why}` }
    }
    const u = unitOf(key)
    let text, unit = ''
    switch (u) {
      case 'c': text = String(hysteresis(shown, value)); unit = '°C'; break
      case 'pct': text = String(Math.round(value)); unit = '%'; break
      case 'w': text = value >= 100 ? String(Math.round(value)) : value.toFixed(1); unit = 'W'; break
      case 'mhz': text = String(Math.round(value)); unit = 'MHz'; break
      case 'rpm': text = String(Math.round(value)); unit = 'RPM'; break
      case 'mb': text = value >= 1024 ? (value / 1024).toFixed(1) : String(Math.round(value)); unit = value >= 1024 ? 'GB' : 'MB'; break
      case 'gb': text = value.toFixed(1); unit = 'GB'; break
      case 'bps': { const b = fmtBytes(value); text = b.n; unit = b.u; break }
      default: text = String(Math.round(value * 10) / 10)
    }
    const age = entry[1] == null ? '' : `${(entry[1] / 1000).toFixed(1)}s`
    const rate = caps && caps.rateHz ? `${caps.rateHz}/s` : ''
    const title = [entry[2] && (t('metricFrom') + ' ' + entry[2]), caps && caps.detail, age && `${age} ${t('metricAgo')}`, rate].filter(Boolean).join(' · ')
    return { ok: true, text, unit, reason: null, title }
  }

  // ── Runtime ─────────────────────────────────────────────────────────────────────────────────────────────
  const state = { snap: null, override: null, caps: {}, shown: {}, subscribed: false, off: null }

  function applyToDom() {
    const snap = state.override || state.snap
    if (typeof document === 'undefined' || !snap) return
    const t = (typeof tUI === 'function') ? tUI : k => k
    // the element list is only re-queried after elements were added (page build, callouts); a 4 Hz full-document query was wasted work
    if (!state.els || state.dirty) { state.els = [...document.querySelectorAll('[data-metric]')]; state.dirty = false; watchDom() }
    for (const el of state.els) {
      if (!el.isConnected) { state.dirty = true; continue }
      const key = el.getAttribute('data-metric')
      const r = fmt(key, snap.s[key], state.caps[key], t, state.shown[key])
      if (r.ok) state.shown[key] = Number(r.text)
      const text = r.ok ? `${r.text}${r.unit ? (r.unit === '%' || r.unit === '°C' ? '' : ' ') + r.unit : ''}` : r.text
      if (root.JylliOdo && el.hasAttribute('data-odo')) root.JylliOdo.set(el, text)
      else if (el.textContent !== text) el.textContent = text
      // with the provenance tag the native tooltip is replaced; without it the title stays
      if (root.JylliProv) { if (el._prov !== r.title) { el._prov = r.title; el.setAttribute('data-prov', r.title) } if (el.hasAttribute('title')) el.removeAttribute('title') } else if (el.title !== r.title) el.title = r.title
      const na = !r.ok
      if (el._na !== na) { el._na = na; el.classList.toggle('j-metric-na', na) }
    }
  }
  function watchDom() {
    if (state.mo || typeof MutationObserver === 'undefined') return
    state.mo = new MutationObserver(muts => {
      for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1 && !(n.parentElement && n.parentElement.hasAttribute('data-odo'))) { state.dirty = true; return }
    })
    state.mo.observe(document.body, { childList: true, subtree: true })
  }

  async function refreshCaps() {
    try { const r = await root.api.telemetryCapabilities(); state.caps = r.capabilities || {}; state.ctx = r.context } catch {}
  }

  async function start() {
    if (state.subscribed || !root.api || !root.api.telemetrySubscribe) return
    state.subscribed = true
    state.off = root.api.onTwinTelemetry(snap => { state.snap = snap; applyToDom() })
    try { const r = await root.api.telemetrySubscribe(); if (r && r.snapshot) { state.snap = r.snapshot; applyToDom() } } catch {}
    refreshCaps()
    state.capTimer = setInterval(refreshCaps, 10000)
  }
  function stop() {
    if (!state.subscribed) return
    state.subscribed = false
    try { state.off && state.off() } catch {}
    clearInterval(state.capTimer)
    try { root.api.telemetryUnsubscribe() } catch {}
  }

  /** Text for a missing value, usable by code that formats its own markup (tiles, status bar). */
  function explain(key) {
    const t = (typeof tUI === 'function') ? tUI : k => k
    const c = state.caps[key]
    const reason = c && c.available === false ? c.reason : 'no-sensor'
    return `${t('metricNA')}: ${t(REASON_KEY[reason] || 'metricNoSensor')}`
  }
  function value(key) { const e = state.snap && state.snap.s[key]; return e && e[0] != null ? e[0] : null }

  /** Replay: show a recorded snapshot instead of the live one (null returns to live). */
  function setOverride(snap) { state.override = snap || null; applyToDom() }

  const api = { fmt, ease, hysteresis, unitOf, fmtBytes, start, stop, explain, value, applyToDom, state, setOverride }
  root.JylliTelemetry = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
