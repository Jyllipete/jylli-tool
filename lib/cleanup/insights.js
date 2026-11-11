'use strict'
// Pure maths over stored scan snapshots ({ ts, sizes: { id: bytes } }, newest first) and clean history. Only prints what the data supports.
const DAY = 86400000

/** Per target: bytes/day it grows back, from the gap between a clean and the next scan. null until there are two usable points. */
function regrowth(snapshots, history) {
  const out = {}
  const cleans = (history || []).filter(h => h && h.per && h.ts).slice().sort((a, b) => a.ts - b.ts)
  const scans = (snapshots || []).filter(s => s && s.sizes && s.ts).slice().sort((a, b) => a.ts - b.ts)
  for (const c of cleans) {
    const next = scans.find(s => s.ts > c.ts + 6 * 3600000)
    if (!next) continue
    const days = (next.ts - c.ts) / DAY
    for (const id of Object.keys(c.per)) {
      const grown = next.sizes[id]
      if (!Number.isFinite(grown) || days <= 0) continue
      const rate = grown / days
      const cur = out[id] || { samples: 0, perDay: 0 }
      cur.perDay = (cur.perDay * cur.samples + rate) / (cur.samples + 1); cur.samples++
      out[id] = cur
    }
  }
  for (const id of Object.keys(out)) out[id].perDay = Math.round(out[id].perDay)
  return out
}

/** "Back to X in N days" for one target. */
function refillDays(perDay, bytes) { return perDay > 0 && bytes > 0 ? Math.max(1, Math.round(bytes / perDay)) : null }

/** Drive-full projection from successive free-space readings (scans + cleans). Needs >= 7 days and a real downward trend. */
function projectFull(points, freeNow) {
  const p = (points || []).filter(x => x && x.ts && Number.isFinite(x.free)).sort((a, b) => a.ts - b.ts)
  if (p.length < 2) return null
  const span = (p[p.length - 1].ts - p[0].ts) / DAY
  if (span < 7) return null
  // least squares slope of free bytes over days
  const n = p.length, xs = p.map(x => (x.ts - p[0].ts) / DAY), ys = p.map(x => x.free)
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n
  const den = xs.reduce((a, x) => a + (x - mx) * (x - mx), 0)
  if (!den) return null
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / den   // bytes/day, negative = filling up
  if (slope >= 0) return null
  const days = freeNow / -slope
  return days > 0 && days < 730 ? { days: Math.round(days), perDay: Math.round(-slope), date: Date.now() + days * DAY } : null
}

/** Autopilot: is a run due? rule = { mode: 'off'|'weekly'|'threshold', thresholdBytes } */
function autopilotDue(rule, { lastRunTs, safeBytes, now }) {
  if (!rule || rule.mode === 'off' || !rule.mode) return false
  now = now || Date.now()
  if (rule.mode === 'weekly') return !lastRunTs || now - lastRunTs >= 7 * DAY
  if (rule.mode === 'threshold') return safeBytes >= (rule.thresholdBytes || 2 * 1073741824) && (!lastRunTs || now - lastRunTs >= DAY)
  return false
}

const totalReclaimed = history => (history || []).reduce((a, h) => a + (h && h.freedBytes || 0), 0)

module.exports = { regrowth, refillDays, projectFull, autopilotDue, totalReclaimed }
