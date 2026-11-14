'use strict'
// Server Passport (first version): what this PC measured on one server, set beside what it measured elsewhere. Built only from
// recorded FiveM sessions that were tagged with a server (lib/fivem/session.js join) - sessions without a server tag are
// "elsewhere", never guessed into a server. Medians, not averages, so one odd session does not rule. Pure, no require.
;(function (root) {
  const MIN_SESSIONS = 2            // below this the numbers are listed but not compared
  const MIN_SECONDS = 120           // very short sessions say nothing
  const median = a => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null }
  const r1 = v => (v == null ? null : Math.round(v * 10) / 10)
  const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null)

  /** rows: sessionList rows [{ durationSec, summary: { avgFps, low1Fps }, server: { host, port }|null }], server: { host, port } -> passport | null */
  function build(rows, server) {
    const all = (Array.isArray(rows) ? rows : []).filter(r => r && r.durationSec >= MIN_SECONDS && r.summary && num(r.summary.avgFps) != null)
    const here = all.filter(r => r.server && server && r.server.host === server.host && Number(r.server.port) === Number(server.port))
    if (!here.length) return null
    const elsewhere = all.filter(r => !here.includes(r))
    const stat = list => ({ n: list.length, minutes: Math.round(list.reduce((s, r) => s + r.durationSec, 0) / 60), avg: r1(median(list.map(r => r.summary.avgFps))), low1: r1(median(list.map(r => num(r.summary.low1Fps)).filter(v => v != null))) })
    const a = stat(here), b = elsewhere.length ? stat(elsewhere) : null
    const enough = here.length >= MIN_SESSIONS && !!b && b.n >= MIN_SESSIONS
    const deltaPct = enough && a.avg != null && b.avg ? Math.round(((a.avg - b.avg) / b.avg) * 100) : null
    return { here: a, elsewhere: b, enough, deltaPct }
  }

  const api = { MIN_SESSIONS, MIN_SECONDS, build }
  root.JylliFivemPassport = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
