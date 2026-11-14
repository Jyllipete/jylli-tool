'use strict'
// Apps tab "Backstage": pure helpers (names, icons, filters, sort, number formatting, sparkline geometry). No DOM, unit-tested (test/apps-ui.test.js).
;(function (root) {
  const VIEWS = ['apps', 'gametime', 'history']
  const VIEW_ICON = { apps: 'table-cells-large', gametime: 'gamepad', history: 'clock-rotate-left' }
  const CATS = ['browsers', 'comms', 'media', 'launchers', 'streaming', 'sync', 'gear', 'tools']
  const SET = new Set(['on', 'native'])
  const ROW_ICON = { 'edge-startup-boost': 'bolt', 'edge-background': 'moon', 'chrome-background': 'moon', 'brave-background': 'moon', 'firefox-lean': 'feather', 'discord-hwaccel': 'microchip', 'nvidia-telemetry': 'eye-slash', 'obs-priority': 'gauge-high' }
  // Brand names are never translated.
  const NAMES = {
    edge: 'Microsoft Edge', chrome: 'Google Chrome', brave: 'Brave', opera: 'Opera', firefox: 'Firefox', discord: 'Discord', teams: 'Microsoft Teams', zoom: 'Zoom', slack: 'Slack',
    whatsapp: 'WhatsApp', spotify: 'Spotify', wallpaper: 'Wallpaper Engine', steam: 'Steam', epic: 'Epic Games Launcher', ea: 'EA app', ubisoft: 'Ubisoft Connect', battlenet: 'Battle.net',
    gog: 'GOG Galaxy', riot: 'Riot Client', xbox: 'Xbox app', playnite: 'Playnite', obs: 'OBS Studio', medal: 'Medal', overwolf: 'Overwolf', onedrive: 'OneDrive', dropbox: 'Dropbox',
    gdrive: 'Google Drive', icue: 'iCUE', synapse: 'Razer Synapse', ghub: 'Logitech G HUB', armoury: 'Armoury Crate', nvidia: 'NVIDIA app', vscode: 'VS Code',
  }
  const ICONS = { edge: 'microsoft.ico', chrome: 'chrome.ico', brave: 'brave.ico', opera: 'opera.ico', firefox: 'firefox.ico', discord: 'discord.ico', spotify: 'spotify.ico', steam: 'Steam.ico', epic: 'Epic Games.ico', obs: 'obs.ico', nvidia: 'Nvidia App.ico', vscode: 'VS Code.ico' }

  const norm = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const hue = id => [...String(id)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 360, 11)
  const nameOf = id => NAMES[id] || id
  const initial = id => ((String(nameOf(id)).match(/[A-Za-z0-9]/) || ['?'])[0]).toUpperCase()

  /** Memory: 840 MB, 2.4 GB. */
  function fmtMem(mb) {
    const n = Number(mb); if (!Number.isFinite(n)) return '–'
    return n >= 1024 ? (Math.round((n / 1024) * 10) / 10) + ' GB' : Math.round(n) + ' MB'
  }
  /** CPU share: under 0.1 reads as "<0.1 %", one decimal below 10, whole above. */
  function fmtPct(p) {
    const n = Number(p); if (!Number.isFinite(n)) return '–'
    if (n > 0 && n < 0.1) return '<0.1 %'
    return (n < 10 ? (Math.round(n * 10) / 10) : Math.round(n)) + ' %'
  }
  const fmtVram = v => (v == null ? '–' : fmtMem(v))

  function chipMatch(a, chip) {
    if (chip === 'all') return true
    if (chip === 'running') return !!a.running
    if (chip === 'attention') return !!a.drift || a.rec.length > 0
    return a.cat === chip
  }
  function chipCounts(apps) {
    const out = { all: apps.length, running: 0, attention: 0 }
    for (const c of CATS) out[c] = 0
    for (const a of apps) { if (a.running) out.running++; if (a.drift || a.rec.length) out.attention++; out[a.cat]++ }
    return out
  }
  /** Search matches the name, the vendor and the group. */
  function matches(a, q) {
    const n = norm(q); if (!n) return true
    const hay = norm([nameOf(a.id), a.vendor, a.cat, a.role].join(' '))
    return n.split(' ').every(w => hay.includes(w))
  }
  /** Running first, biggest memory first; then installed-but-idle by name. */
  function sortApps(apps) {
    return [...apps].sort((a, b) => (b.running ? 1 : 0) - (a.running ? 1 : 0) || ((b.cost && b.cost.ram) || 0) - ((a.cost && a.cost.ram) || 0) || nameOf(a.id).localeCompare(nameOf(b.id)))
  }

  const isSet = r => SET.has(r.status)
  const rowTone = r => (r.status === 'on' || r.status === 'native' ? 'ok' : r.status === 'drifted' ? 'warn' : r.status === 'elsewhere' || r.status === 'unknown' ? 'info' : '')
  /** A switch can be turned on when the row is open, off when it is Jylli's own; a value somebody else set is never a switch. */
  const canSwitch = r => r.status === 'off' || r.status === 'drifted' || r.status === 'on' || r.status === 'partial'

  /** Stacked-bar geometry: [{ id, pct }] summing to <= 100, hairline gaps are CSS. */
  function barParts(segs) {
    const total = (segs || []).reduce((s, x) => s + x.v, 0)
    if (!total) return []
    return segs.map(x => ({ id: x.id, n: x.n || 0, v: x.v, pct: Math.max(1.5, Math.round((x.v / total) * 1000) / 10) }))
  }

  function spark(values, w, h, pad = 2) {
    const v = (values || []).filter(x => Number.isFinite(x))
    if (v.length < 2) return ''
    const lo = Math.min(...v), hi = Math.max(...v, lo + 0.5), span = hi - lo || 1
    return v.map((y, i) => (i ? 'L' : 'M') + (pad + (i * (w - 2 * pad)) / (v.length - 1)).toFixed(1) + ' ' + (h - pad - ((y - lo) / span) * (h - 2 * pad)).toFixed(1)).join(' ')
  }

  function ago(ms, now) {
    if (!ms) return null
    const d = Math.max(0, (now || Date.now()) - ms), m = Math.floor(d / 60000)
    if (m < 2) return { k: 'now', n: 0 }
    if (m < 60) return { k: 'min', n: m }
    const h = Math.floor(m / 60)
    if (h < 48) return { k: 'h', n: h }
    return { k: 'd', n: Math.floor(h / 24) }
  }
  const fmtDur = sec => { const m = Math.round((Number(sec) || 0) / 60); return m < 60 ? { k: 'min', n: Math.max(1, m) } : { k: 'h', n: Math.round(m / 6) / 10 } }

  const api = { VIEWS, VIEW_ICON, CATS, ROW_ICON, NAMES, ICONS, nameOf, initial, hue, fmtMem, fmtPct, fmtVram, chipMatch, chipCounts, matches, sortApps, isSet, rowTone, canSwitch, barParts, spark, ago, fmtDur }
  root.JylliAppsPure = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
