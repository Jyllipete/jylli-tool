'use strict'
// What keeps the PC awake and what wakes it, pure parsers over powercfg text. powercfg prints in the Windows language, so only STRUCTURE is trusted:
// a non-indented line ending in ':' starts a section, "[PROCESS] name" style lines are entries. Text that does not look like powercfg output at all
// (an error, an empty string, no admin) returns null = "unread", never "nothing found".
const SECTIONS = ['display', 'system', 'awaymode', 'execution', 'perfboost', 'lockscreen']   // powercfg /requests prints them in this order
const ENTRY = /^\s*\[([A-Z_ ]{3,20})\]\s*(.+?)\s*$/
const TIMER_ENTRY = /\[([A-Z_ ]{3,20})\]\s*(.+?)\s*$/    // wake timers print "Timer set by [SERVICE] path expires at ..." (the lead-in is localized)
const HEADER = /^(\S[^:[]{1,40}):\s*$/
const ADMIN = /administrator|j[aä]rjestelm[aä]nvalvoja|rights|oikeuks/i

function parseRequests(text) {
  const t = String(text || '')
  if (!t.trim()) return null
  const sections = []
  let cur = null
  for (const l of t.split(/\r?\n/)) {
    const h = HEADER.exec(l)
    if (h) { cur = { header: h[1].trim(), items: [] }; sections.push(cur); continue }
    const e = ENTRY.exec(l)
    if (e && cur) cur.items.push({ type: e[1].trim().toLowerCase(), name: e[2].slice(0, 200) })
  }
  if (!sections.length) return null                    // an error message or something else entirely
  const named = sections.map((s, i) => ({ id: SECTIONS[i] || 'other', header: s.header, items: s.items }))
  const keepsAwake = named.filter(s => s.id === 'system' || s.id === 'awaymode' || s.id === 'execution').flatMap(s => s.items.map(i => ({ ...i, section: s.id })))
  return { sections: named, keepsAwake, count: named.reduce((n, s) => n + s.items.length, 0) }
}

/** powercfg /lastwake: count plus the raw detail lines (the labels are localized, so they are shown as printed). null when unreadable. */
function parseLastWake(text) {
  const t = String(text || '')
  if (!t.trim()) return null
  const lines = t.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const m = /(\d+)\s*$/.exec(lines[0] || '')
  if (!m) return null
  const count = Number(m[1])
  return { count, lines: count > 0 ? lines.slice(1, 14) : [] }
}

const NONE = /^\s*(none|ei mit[aä]{2}n|ei yht[aä]{2}n)\.?\s*$/i
/** powercfg /devicequery wake_armed (+ wake_programmable to cross-check): one device per line. null when both are empty or an admin error. */
function parseWakeDevices(armed, programmable) {
  const a = String(armed || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (!a.length && !String(programmable || '').trim()) return null
  if (a.some(l => ADMIN.test(l) && l.length > 40)) return null
  const prog = new Set(String(programmable || '').split(/\r?\n/).map(l => l.trim().toLowerCase()).filter(Boolean))
  const list = a.filter(l => !NONE.test(l) && (prog.size === 0 || prog.has(l.toLowerCase())))
  return [...new Set(list)].slice(0, 40)
}

/** powercfg /waketimers: entries carry the same [SERVICE]/[PROCESS] tags. Non-empty text without tags = none; empty = unread. */
function parseWakeTimers(text) {
  const t = String(text || '')
  if (!t.trim()) return null
  const items = []
  for (const l of t.split(/\r?\n/)) { const e = TIMER_ENTRY.exec(l); if (e) items.push({ type: e[1].trim().toLowerCase(), name: e[2].slice(0, 200) }) }
  if (!items.length && ADMIN.test(t) && t.length < 200) return null
  return items
}

const exported = { parseRequests, parseLastWake, parseWakeDevices, parseWakeTimers, SECTIONS }
if (typeof module !== 'undefined' && module.exports) module.exports = exported
if (typeof window !== 'undefined') window.JylliPowerSleep = exported
