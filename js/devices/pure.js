'use strict'
// Devices tab: the pure rules of the page (what goes in which group, which chips exist, what a fact looks like, keyboard repeat labels). No DOM, unit-tested.
// The engine (lib/devices) decides what a device IS; nothing here re-decides it.
;(function (root) {
  const GROUPS = [
    { id: 'input', cats: ['mouse', 'keyboard'], icon: 'computer-mouse' },
    { id: 'displays', cats: ['display'], icon: 'display' },
    { id: 'audio', cats: ['audio'], icon: 'headphones' },
    { id: 'controllers', cats: ['gamepad'], icon: 'gamepad' },
    { id: 'other', cats: ['camera', 'rgb', 'bluetooth', 'other'], icon: 'plug' },
  ]
  const CHIPS = ['all', 'input', 'displays', 'audio', 'controllers', 'other', 'core', 'software', 'gone']
  const ICON = { mouse: 'computer-mouse', keyboard: 'keyboard', gamepad: 'gamepad', audio: 'headphones', display: 'display', camera: 'camera', rgb: 'lightbulb', bluetooth: 'tower-broadcast', other: 'plug', cpu: 'microchip', gpu: 'cube', ram: 'memory', storage: 'hard-drive', board: 'server', network: 'network-wired' }
  // Order of the facts in the detail table; a key a device does not have is skipped, an unknown one is shown with its reason.
  const FACT_ORDER = ['vendor', 'model', 'connection', 'ids', 'polling', 'battery', 'size', 'year', 'driver', 'port', 'cores', 'threads', 'socket', 'slots', 'type', 'media', 'bus', 'sizeGB', 'health', 'integrated', 'speed', 'kind', 'up', 'model']
  const SOURCES = ['device', 'windows', 'table', 'inferred', 'measured', 'user']
  const CONFIDENCE = ['high', 'medium', 'low']
  const REASONS = ['absent', 'unread', 'denied', 'unsupported', 'vendor_only', 'not_measured']
  const INFO = ['dpi', 'polling_write', 'lighting', 'buttons', 'macros', 'deadzone', 'eq']
  const KBD_DELAY = [0, 1, 2, 3]

  const groupOf = cat => (GROUPS.find(g => g.cats.includes(cat)) || GROUPS[GROUPS.length - 1]).id
  const known = f => !!f && f.value != null
  const iconOf = cat => ICON[cat] || 'plug'

  const norm = s => String(s == null ? '' : s).toLowerCase()
  /** Search: title, vendor, model, ids and category words, all lower case. */
  function matches(d, q) {
    const t = norm(q).trim()
    if (!t) return true
    const f = d.facts || {}
    const hay = [d.title, d.category, f.vendor && f.vendor.value, f.model && f.model.value, f.ids && f.ids.value, f.connection && f.connection.value, d.vendor].map(norm).join(' ')
    return t.split(/\s+/).every(w => hay.includes(w))
  }

  function chipCounts(snap) {
    const c = { all: 0, input: 0, displays: 0, audio: 0, controllers: 0, other: 0, core: 0, software: 0, gone: 0 }
    if (!snap) return c
    for (const d of snap.devices || []) { c[groupOf(d.category)]++; c.all++ }
    c.core = (snap.core || []).length
    c.software = (snap.software || []).length
    c.gone = (snap.disconnected || []).length
    return c
  }

  /** What the list shows for a chip and a search: [{ id, kind: 'live' | 'core' | 'software' | 'gone', items }]. Empty sections are left out. */
  function layout(snap, chip, q) {
    if (!snap) return []
    const out = []
    const pick = (arr, f) => (arr || []).filter(d => matches(d, q) && (f ? f(d) : true))
    const want = id => chip === 'all' || chip === id
    for (const g of GROUPS) if (want(g.id)) { const items = pick(snap.devices, d => groupOf(d.category) === g.id); if (items.length) out.push({ id: g.id, kind: 'live', icon: g.icon, items }) }
    if (want('core')) { const items = pick(snap.core); if (items.length) out.push({ id: 'core', kind: 'core', icon: 'microchip', items }) }
    if (want('software')) { const items = pick(snap.software); if (items.length) out.push({ id: 'software', kind: 'software', icon: 'ghost', items }) }
    if (want('gone')) { const items = pick(snap.disconnected); if (items.length) out.push({ id: 'gone', kind: 'gone', icon: 'plug-circle-xmark', items }) }
    return out
  }

  const failedSections = snap => Object.entries((snap && snap.sections) || {}).filter(([, s]) => s && !s.ok).map(([id]) => id)
  /** idle = nothing read, warn = a problem device or an unreadable part, ok otherwise. */
  function tone(snap) {
    if (!snap || !snap.read) return 'idle'
    return (snap.problems || 0) > 0 || failedSections(snap).length ? 'warn' : 'ok'
  }
  /** "2 mice, 1 keyboard ..." as [{ cat, n }] in a fixed order. */
  function summary(snap) {
    const order = ['mouse', 'keyboard', 'display', 'audio', 'gamepad', 'camera', 'rgb', 'bluetooth', 'other']
    const c = (snap && snap.counts) || {}
    return order.filter(k => c[k]).map(k => ({ cat: k, n: c[k] }))
  }

  const rowsOf = d => {
    const f = d.facts || {}
    const seen = new Set(), out = []
    for (const k of FACT_ORDER) if (k in f && !seen.has(k)) { seen.add(k); out.push(k) }
    for (const k of Object.keys(f)) if (!seen.has(k)) { seen.add(k); out.push(k) }
    return out
  }

  /** Keyboard repeat: Windows documents delay 0..3 as 250 ms steps and speed 0..31 as about 2.5 to 30 characters per second. */
  const repeatDelayMs = d => (Number(d) + 1) * 250
  const repeatCps = s => Math.round((2.5 + (Number(s) * 27.5) / 31) * 10) / 10

  function ago(ts, now) {
    const d = Number(now) - Number(ts)
    if (!Number.isFinite(d) || d < 0) return null
    if (d < 90 * 1000) return { k: 'now', n: 0 }
    if (d < 3600 * 1000) return { k: 'min', n: Math.round(d / 60000) }
    if (d < 36 * 3600 * 1000) return { k: 'h', n: Math.round(d / 3600000) }
    return { k: 'd', n: Math.round(d / 86400000) }
  }

  const api = { GROUPS, CHIPS, ICON, FACT_ORDER, SOURCES, CONFIDENCE, REASONS, INFO, KBD_DELAY, groupOf, known, iconOf, matches, chipCounts, layout, failedSections, tone, summary, rowsOf, repeatDelayMs, repeatCps, ago }
  root.JylliDevicesPure = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
