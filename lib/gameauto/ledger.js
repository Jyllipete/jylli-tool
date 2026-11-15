'use strict'
// Session ledger: what the automation changed during one game session and whether each change was put back. Pure.
// event: { at, feature: watcher|updateGuard|shield|autoPulse|profile|apps|mmcss, kind: applied|restored|skipped|failed|info,
//          key?: string (pairs an applied change with its restore), ok?: boolean, detail?: string, vars?: object }

const MAX_EVENTS = 200
const KEEP_SESSIONS = 10

function open({ id, game, now }) {
  return { id, game: game ? { id: game.id, name: game.name, pulse: game.pulse || null, exe: game.exe || null, source: game.source || null } : null, startedAt: now, endedAt: null, endReason: null, events: [] }
}

function add(session, ev) {
  if (!session) return session
  const events = session.events.length >= MAX_EVENTS ? session.events.slice(1) : session.events.slice()
  events.push({ ok: ev.kind === 'failed' ? false : ev.ok !== false, ...ev, at: ev.at || Date.now() })
  return { ...session, events }
}

function close(session, reason, now) {
  return session ? { ...session, endedAt: now, endReason: reason } : session
}

/** changed / restored / failed counts, plus what is still waiting to be put back (applied with a key and no successful restore yet). */
function summary(session) {
  const ev = (session && session.events) || []
  const restoredKeys = new Set(ev.filter(e => e.kind === 'restored' && e.ok !== false && e.key).map(e => e.feature + ':' + e.key))
  const pending = ev.filter(e => e.kind === 'applied' && e.key && !restoredKeys.has(e.feature + ':' + e.key))
  const failedRestores = ev.filter(e => e.kind === 'restored' && e.ok === false)
  return {
    changed: ev.filter(e => e.kind === 'applied').length,
    restored: ev.filter(e => e.kind === 'restored' && e.ok !== false).length,
    failed: ev.filter(e => e.kind === 'failed' || e.ok === false).length,
    pending,
    failedRestores,
    clean: pending.length === 0 && failedRestores.length === 0,
  }
}

const trim = list => (Array.isArray(list) ? list : []).slice(0, KEEP_SESSIONS)

module.exports = { open, add, close, summary, trim, MAX_EVENTS, KEEP_SESSIONS }
