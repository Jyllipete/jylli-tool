'use strict'
// Startup tab "Ignition": how much a startup program slowed the boot, from Windows' own "this program slowed your startup" events (101). Pure.
// Only what Windows logged counts as measured. A program Windows did not flag is "not flagged" when the log has boots on file, and "unknown" when it has none.
// Without any log a category's typical weight is shown, always labelled as typical.
const catalog = require('./catalog')
const { exeStem } = require('./detect')
const num = v => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) && n > 0 ? n : null }

/** events: [{at, d}] -> { stem: { count, medianMs, maxMs, lastAt } } using the slowdown Windows wrote (DegradationTime, else TotalTime / Duration). */
function parseSlow(events) {
  const by = {}
  for (const e of events || []) {
    const d = (e && e.d) || {}
    const ms = num(d.DegradationTime) || num(d.TotalTime) || num(d.Duration)
    const stem = exeStem(d.Path || d.Name || d.FriendlyName || '')
    if (!ms || !stem) continue
    ;(by[stem] = by[stem] || []).push({ ms, at: e.at })
  }
  const out = {}
  for (const [stem, list] of Object.entries(by)) {
    const ms = list.map(x => x.ms).sort((a, b) => a - b), m = ms.length >> 1
    out[stem] = { count: list.length, medianMs: ms.length % 2 ? ms[m] : Math.round((ms[m - 1] + ms[m]) / 2), maxMs: ms[ms.length - 1], lastAt: Math.max(...list.map(x => x.at)) }
  }
  return out
}

const levelOf = ms => (ms >= catalog.IMPACT.high ? 'high' : ms >= catalog.IMPACT.medium ? 'medium' : 'low')
const RANK = { high: 3, medium: 2, low: 1 }

/** -> { level: 'high'|'medium'|'low'|null, basis: 'measured'|'clear'|'typical'|'none', ms?, count? } */
function impactOf(stem, cat, slow, haveLog) {
  const s = stem && slow ? slow[stem] : null
  if (s) return { level: levelOf(s.medianMs), basis: 'measured', ms: s.medianMs, count: s.count, maxMs: s.maxMs }
  if (haveLog) return { level: 'low', basis: 'clear' }
  const t = catalog.TYPICAL[cat]
  return t ? { level: t, basis: 'typical' } : { level: null, basis: 'none' }
}

module.exports = { parseSlow, impactOf, levelOf, RANK }
