'use strict'
// Startup tab "Ignition": pure helpers (names, filters, sort, number formatting, stack and boot-bar geometry). No DOM, unit-tested (test/startup-ui.test.js).
;(function (root) {
  const VIEWS = ['programs', 'boot', 'history']
  const VIEW_ICON = { programs: 'rocket', boot: 'stopwatch', history: 'clock-rotate-left' }
  const LANES = ['worth', 'call', 'delayed', 'keep', 'off']
  const LANE_ICON = { worth: 'wand-magic-sparkles', call: 'hand-pointer', delayed: 'hourglass-half', keep: 'shield-halved', off: 'power-off' }
  const CHIPS = ['all', 'on', 'worth', 'delayed', 'off', 'new', 'attention']
  const SRC_ICON = { 'run-hkcu': 'user', 'run-hklm': 'desktop', 'run-hklm32': 'desktop', 'folder-user': 'folder', 'folder-all': 'folder', task: 'calendar-check', appx: 'store' }
  const DELAYS = [30, 60, 120]
  const RANK = { high: 3, medium: 2, low: 1 }

  const norm = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const hue = id => [...String(id)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 360, 11)

  /** The name a person knows: no .lnk, no task GUIDs, Store packages as words. */
  function display(e) {
    let n = String(e.name || '')
    if (e.src === 'appx') {
      const part = n.includes('.') ? n.slice(n.lastIndexOf('.') + 1) : n
      return part.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').trim() || n
    }
    if (e.src === 'folder-user' || e.src === 'folder-all') n = n.replace(/\.(lnk|url|exe|bat|cmd)$/i, '')
    if (e.src === 'task') {
      n = n.replace(/\{[0-9a-f-]{8,}\}/gi, '').replace(/S-1-5-[0-9-]+/g, '').replace(/UserS?$/i, '').trim()
      n = n.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s*Task\s*User\s*(Core|UA)?$/i, '').replace(/\s+/g, ' ').trim()
    }
    return n || String(e.name || '')
  }
  const initial = e => ((String(display(e)).match(/[A-Za-z0-9]/) || ['?'])[0]).toUpperCase()
  /** The grey line under a name: who made it, else what it is. */
  const sub = e => e.publisher || e.desc || (e.src === 'appx' ? e.sub : '') || ''

  /** 4200 -> "4.2 s", 640 -> "640 ms". */
  function fmtMs(ms) {
    const n = Number(ms); if (!Number.isFinite(n)) return '–'
    if (n < 1000) return Math.round(n) + ' ms'
    return (Math.round(n / 100) / 10) + ' s'
  }
  /** Boot length: 45000 -> "45 s", 72000 -> "1 min 12 s". */
  function fmtBoot(ms) {
    const n = Number(ms); if (!Number.isFinite(n)) return '–'
    const s = Math.round(n / 1000)
    return s < 60 ? s + ' s' : Math.floor(s / 60) + ' min' + (s % 60 ? ' ' + (s % 60) + ' s' : '')
  }
  function fmtMem(mb) {
    const n = Number(mb); if (!Number.isFinite(n)) return '–'
    return n >= 1024 ? (Math.round((n / 1024) * 10) / 10) + ' GB' : Math.round(n) + ' MB'
  }
  const signed = ms => { const n = Math.round(Number(ms) / 100) / 10; return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n) + ' s' }

  function ago(ms, now) {
    if (!ms) return null
    const d = Math.max(0, (now || Date.now()) - ms), m = Math.floor(d / 60000)
    if (m < 2) return { k: 'now', n: 0 }
    if (m < 60) return { k: 'min', n: m }
    const h = Math.floor(m / 60)
    if (h < 48) return { k: 'h', n: h }
    return { k: 'd', n: Math.floor(h / 24) }
  }

  const attention = e => !!(e.cameBack || (e.broken && e.enabled) || e.isNew)
  function chipMatch(e, chip) {
    switch (chip) {
      case 'all': return true
      case 'on': return e.lane !== 'off'
      case 'worth': return e.lane === 'worth'
      case 'delayed': return e.lane === 'delayed'
      case 'off': return e.lane === 'off'
      case 'new': return !!e.isNew
      case 'attention': return attention(e)
      default: return true
    }
  }
  function chipCounts(entries) {
    const out = {}
    for (const c of CHIPS) out[c] = entries.filter(e => chipMatch(e, c)).length
    return out
  }
  function matches(e, q) {
    const n = norm(q); if (!n) return true
    const hay = norm([display(e), e.name, e.publisher, e.stem, e.cat, e.src].join(' '))
    return n.split(' ').every(w => hay.includes(w))
  }
  /** Heaviest first inside a lane, running before idle, then by name. */
  function sortEntries(list) {
    return [...list].sort((a, b) => (RANK[b.impact && b.impact.level] || 0) - (RANK[a.impact && a.impact.level] || 0) || ((b.running && b.running.mb) || 0) - ((a.running && a.running.mb) || 0) || display(a).localeCompare(display(b)))
  }
  function byLane(entries) {
    const out = {}
    for (const l of LANES) out[l] = sortEntries(entries.filter(e => e.lane === l))
    return out
  }

  /** The weight of one program in the sign-in stack: measured slowdown in seconds, else a typical weight (never shown as measured). */
  const weight = e => (e.impact && e.impact.basis === 'measured' ? Math.max(0.5, e.impact.ms / 1000) : e.impact && e.impact.level ? RANK[e.impact.level] * 0.8 : 0.4)
  function stack(entries) {
    const on = entries.filter(e => e.enabled)
    const total = on.reduce((t, e) => t + weight(e), 0)
    if (!total) return []
    return on.sort((a, b) => weight(b) - weight(a)).map(e => ({ id: e.id, lane: e.lane, measured: !!(e.impact && e.impact.basis === 'measured'), pct: Math.max(1.6, Math.round((weight(e) / total) * 1000) / 10) }))
  }

  /** Bars for the boots on file: width = total boot time, the darker part = until the desktop was usable (only when Windows wrote it). */
  function bootBars(boots) {
    const list = (boots || []).slice(0, 10)
    const max = Math.max(1, ...list.map(b => b.ms))
    return list.map(b => {
      const main = b.mainMs != null && b.mainMs <= b.ms ? b.mainMs : null
      return { at: b.at, ms: b.ms, mainMs: b.mainMs, postMs: b.postMs, apps: b.apps, pct: Math.round((b.ms / max) * 1000) / 10, mainPct: main != null ? Math.round((main / b.ms) * 1000) / 10 : null }
    })
  }

  const api = { VIEWS, VIEW_ICON, LANES, LANE_ICON, CHIPS, SRC_ICON, DELAYS, norm, hue, display, initial, sub, fmtMs, fmtBoot, fmtMem, signed, ago, attention, chipMatch, chipCounts, matches, sortEntries, byLane, weight, stack, bootBars }
  root.JylliStartupPure = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
