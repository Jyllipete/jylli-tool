'use strict'
// FiveM session network track. While FiveM runs and a server is pinned, one TCP connect to that server's HTTP port per second is
// stored (null = no answer). When the game closes the track is saved to userData/fivem-sessions/<id>.json (newest 30 kept). The frame
// and telemetry side of a session already lives in lib/session-recorder.js; the two are joined by time (see join()), so neither
// depends on the other having run.
const crypto = require('crypto')

const MAX_FILES = 30
const MAX_SECONDS = 4 * 3600

function create({ fs, path, dir, now = Date.now, tcp, setTimer = setInterval, clearTimer = clearInterval }) {
  let cur = null, timer = null

  function begin(server) {
    end()                                   // a second start closes the first one
    if (!server || !server.host || !server.port) return { ok: false, error: 'no-server' }
    cur = { v: 1, id: crypto.randomBytes(6).toString('hex'), startedAt: now(), server: { host: server.host, port: server.port, name: server.name || null }, rtt: [] }
    const mine = cur
    timer = setTimer(async () => {
      if (cur !== mine || mine.rtt.length >= MAX_SECONDS) return
      let v = null
      try { v = await tcp(mine.server.host, mine.server.port, 900) } catch { v = null }
      if (cur === mine) mine.rtt.push(typeof v === 'number' ? v : null)
    }, 1000)
    return { ok: true, id: cur.id }
  }

  function end() {
    if (timer) { clearTimer(timer); timer = null }
    const s = cur; cur = null
    if (!s || s.rtt.length < 10) return null
    const rec = { v: s.v, id: s.id, startedAt: s.startedAt, endedAt: now(), server: s.server, net: { rtt: s.rtt } }
    try {
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, rec.id + '.json'), JSON.stringify(rec))
      prune()
    } catch { /* disk full or locked: the session simply has no network track */ }
    return rec
  }

  function files() {
    try { return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => { const p = path.join(dir, f); return { p, t: fs.statSync(p).mtimeMs } }).sort((a, b) => b.t - a.t) } catch { return [] }
  }
  function prune() { for (const f of files().slice(MAX_FILES)) { try { fs.unlinkSync(f.p) } catch { /* in use */ } } }
  function list() {
    return files().map(f => { try { const s = JSON.parse(fs.readFileSync(f.p, 'utf8')); return { id: s.id, startedAt: s.startedAt, endedAt: s.endedAt, server: s.server, seconds: s.net && s.net.rtt ? s.net.rtt.length : 0 } } catch { return null } }).filter(Boolean)
  }
  function get(id) {
    if (!/^[0-9a-f]{12}$/.test(String(id))) return null
    try { return JSON.parse(fs.readFileSync(path.join(dir, id + '.json'), 'utf8')) } catch { return null }
  }

  return { begin, end, list, get, get active() { return cur ? { id: cur.id, server: cur.server, seconds: cur.rtt.length, last: cur.rtt[cur.rtt.length - 1] ?? null } : null } }
}

/** Frame sessions (lib/session-recorder list rows) whose time range overlaps a network session. */
function join(netSession, recorderRows) {
  const a0 = netSession.startedAt, a1 = netSession.endedAt || netSession.startedAt
  return (recorderRows || []).find(r => {
    const b0 = r.startedAt, b1 = r.startedAt + (r.durationSec || 0) * 1000
    return b0 < a1 && b1 > a0
  }) || null
}

module.exports = { MAX_FILES, create, join }
