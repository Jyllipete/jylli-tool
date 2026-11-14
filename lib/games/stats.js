'use strict'
// Play history per game from the sessions Jylli really recorded (PresentMon while the watcher / Pulse saw the game). Nothing is estimated:
// a game with no recorded session has no numbers. "Impact" compares sessions before and after the tuning only when both sides have enough.
const MIN_SIDE = 2            // sessions needed before AND after the tuning to say anything
const MIN_FRAMES = 600        // a session with fewer frames than this (~10 s at 60 fps) is not a measurement
const MEANINGFUL_PCT = 3      // below this change the honest answer is "no clear difference"
const TREND_MAX = 12

const num = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null)
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)

/** library: [{ id, aliases }]; sessions: [{ id, game:{id,name}, startedAt, durationSec, summary }] -> { <libraryId>: stats } */
function byGame(library, sessions) {
  const owner = new Map()
  for (const g of library) for (const a of g.aliases || [g.id]) if (!owner.has(a)) owner.set(a, g.id)
  const out = {}
  for (const s of sessions || []) {
    const gid = s && s.game && owner.get(s.game.id)
    if (!gid) continue
    const o = out[gid] || (out[gid] = { sessions: 0, seconds: 0, last: 0, list: [] })
    o.sessions++; o.seconds += Math.max(0, Number(s.durationSec) || 0); o.last = Math.max(o.last, Number(s.startedAt) || 0)
    const m = s.summary && Number(s.summary.frames) >= MIN_FRAMES ? { at: Number(s.startedAt) || 0, avg: num(s.summary.avgFps), low1: num(s.summary.low1Fps) } : null
    if (m && m.avg) o.list.push(m)
  }
  for (const o of Object.values(out)) {
    o.list.sort((a, b) => a.at - b.at)
    o.avgFps = mean(o.list.map(x => x.avg)); o.low1Fps = mean(o.list.filter(x => x.low1).map(x => x.low1))
    o.trend = o.list.slice(-TREND_MAX).map(x => Math.round(x.avg))
  }
  return out
}

/** Sessions of one game before / after `at` (ms): { state: 'none'|'need'|'ok', before, after, avgPct, lowPct, verdict } */
function impact(stat, at) {
  if (!stat || !at || !stat.list || !stat.list.length) return { state: 'none' }
  const b = stat.list.filter(x => x.at < at), a = stat.list.filter(x => x.at >= at)
  if (b.length < MIN_SIDE || a.length < MIN_SIDE) return { state: 'need', before: b.length, after: a.length, min: MIN_SIDE }
  const pct = (x, y) => (x && y ? Math.round(((y - x) / x) * 1000) / 10 : null)
  const avgPct = pct(mean(b.map(x => x.avg)), mean(a.map(x => x.avg)))
  const lowPct = pct(mean(b.filter(x => x.low1).map(x => x.low1)), mean(a.filter(x => x.low1).map(x => x.low1)))
  const lead = lowPct != null ? lowPct : avgPct   // 1% lows are what a player feels
  const verdict = lead == null || Math.abs(lead) < MEANINGFUL_PCT ? 'same' : lead > 0 ? 'better' : 'worse'
  return { state: 'ok', before: b.length, after: a.length, avgPct, lowPct, verdict }
}

module.exports = { byGame, impact, MIN_SIDE, MIN_FRAMES, MEANINGFUL_PCT }
