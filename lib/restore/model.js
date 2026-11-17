'use strict'
// Restore points "Lifeline": turns the probe facts + the change journal into what the tab shows. Pure: no I/O, no clock (now is passed in).
// originOf is the ONLY decoder of restore point names; coverage / lifeline / afterPoint answer "what does a rollback to this point undo?" from recorded evidence.
const F = require('./findings')

const DAY = F.DAY
const WINDOW_MS = 30 * DAY
const SLOTS = 90                    // the lifeline is 90 columns wide; changes inside one column share a tick
const RESTORE_OP_TYPE = 6           // Windows' own "Restore Operation" point (RESTORE in the SRSetRestorePoint type list)
const REBOOT_WAIT_MS = 15 * 60 * 1000

/** What made a point. group: 'jylli' (this app) or 'windows' (everything else). arg: the tweak id / the user's label when there is one. */
function originOf(desc, type) {
  const d = String(desc || '').trim()
  let m
  if ((m = /^JylliTool_Before_(.+)$/i.exec(d))) return { origin: 'beforeTweak', group: 'jylli', arg: m[1] }
  if (/^JylliTool_AutoOpti/i.test(d)) return { origin: 'autoOpti', group: 'jylli', arg: '' }
  if (/^JylliTool_(v1_)?FirstRun/i.test(d)) return { origin: 'firstRun', group: 'jylli', arg: '' }
  if (/^JylliTool_Debloat/i.test(d)) return { origin: 'debloat', group: 'jylli', arg: '' }
  if (/^JylliTool_Diagnostics/i.test(d)) return { origin: 'diagnostics', group: 'jylli', arg: '' }
  if (/^JylliTool_Scheduled/i.test(d)) return { origin: 'scheduled', group: 'jylli', arg: '' }
  if ((m = /^JylliTool_(?:Manual|Restore|v1_Quick|EnableSR_Check)(?:[ _:-]+(.*))?$/i.exec(d))) {
    const arg = String(m[1] || '').trim()
    return { origin: 'manual', group: 'jylli', arg: /^\d{6,8}$/.test(arg) ? '' : arg }   // the old default name ended in a date: not a label
  }
  if (/^JylliTool/i.test(d)) return { origin: 'jylli', group: 'jylli', arg: d.replace(/^JylliTool[_ -]*/i, '') }
  if (type === RESTORE_OP_TYPE) return { origin: 'restoreOp', group: 'windows', arg: '' }
  if (type === 10) return { origin: 'driver', group: 'windows', arg: d }
  if (type === 0 || type === 1) return { origin: /windows update|cumulative|kb\d{6,}/i.test(d) ? 'windowsUpdate' : 'installer', group: 'windows', arg: d }
  if (/windows update|cumulative update|kb\d{6,}/i.test(d)) return { origin: 'windowsUpdate', group: 'windows', arg: d }
  return { origin: 'windows', group: 'windows', arg: d }
}

/** Journal entries that are live changes made by Jylli: not an undo, not already undone, not a failure. */
function activeChanges(entries, nameOf) {
  const out = []
  for (const e of entries || []) {
    if (!e || typeof e.ts !== 'number' || e.via === 'undo' || e.undoneBy || e.result === 'error') continue
    if (e.action !== 'apply' && e.action !== 'restore') continue
    out.push({ id: e.id, ts: e.ts, tweakId: e.tweakId || null, action: e.action, via: e.via || null, name: (nameOf && nameOf(e)) || e.tweakId || e.control || e.id })
  }
  return out.sort((a, b) => a.ts - b.ts)
}

const newestAtOf = points => points.reduce((m, p) => (p.at != null && (m == null || p.at > m) ? p.at : m), null)

const oldestAtOf = points => points.reduce((m, p) => (p.at != null && (m == null || p.at < m) ? p.at : m), null)

/** A point covers every change made AFTER it (rolling back to it undoes them). So: `since` = changes after the newest point (a rollback to it would undo them all),
 *  `unprotected` = changes older than every point (only the change journal can undo those). With no points neither is meaningful. */
function sinceOf(points, changes) { const n = newestAtOf(points); return n == null ? [] : changes.filter(c => c.ts > n) }
function unprotectedOf(points, changes) { const o = oldestAtOf(points); return o == null ? [] : changes.filter(c => c.ts < o) }

/** The 30-day strip: x is 0..1. Changes are bucketed into SLOTS columns so a big batch is one tick, not a hundred. */
function lifeline(points, changes, now) {
  const from = now - WINDOW_MS
  const xOf = t => Math.min(1, Math.max(0, (t - from) / WINDOW_MS))
  const newest = newestAtOf(points), oldest = oldestAtOf(points)
  const pts = points.filter(p => p.at != null && p.at >= from).map(p => ({ seq: p.seq, x: xOf(p.at), origin: p.origin, group: p.group })).sort((a, b) => a.x - b.x)
  const slots = new Map()
  for (const c of changes) {
    if (c.ts < from) continue
    const k = Math.min(SLOTS - 1, Math.floor(xOf(c.ts) * SLOTS))
    const s = slots.get(k) || { x: (k + 0.5) / SLOTS, n: 0, since: 0, old: 0, names: [] }
    s.n++
    if (newest != null && c.ts > newest) s.since++
    if (oldest != null && c.ts < oldest) s.old++
    if (s.names.length < 3 && !s.names.includes(c.name)) s.names.push(c.name)
    slots.set(k, s)
  }
  const ticks = [...slots.values()].sort((a, b) => a.x - b.x)
  const hasSince = ticks.some(t => t.since > 0)
  return { from, to: now, points: pts, ticks, older: points.filter(p => p.at != null && p.at < from).length, sinceFrom: newest != null && newest >= from ? xOf(newest) : hasSince ? 0 : null, since: hasSince }
}

const midnight = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }

/**
 * What a rollback to `point` would undo, from evidence only: Jylli changes recorded after it (exact) and programs whose install DAY is later (day precision;
 * same-day installs can not be ordered against the point, so they are listed apart).
 */
function afterPoint(point, changes, programs) {
  if (!point || point.at == null) return { changes: [], later: [], same: [] }
  const day = midnight(point.at)
  const after = changes.filter(c => c.ts > point.at)
  const later = (programs || []).filter(p => p.day > day).sort((a, b) => b.day - a.day)
  const same = (programs || []).filter(p => p.day === day)
  return { changes: after, later, same }
}

/** "Room for about N more": free cap / average point. An estimate: point sizes differ a lot, so null when there is nothing to base it on. */
const ROOM_MIN_POINTS = 3   // with fewer points the "average size" is just whatever else the shadow storage holds (seen on a real PC: 1 point, 9.4 GB)
function roomEstimate(storage, volume, pointCount) {
  if (!storage || !storage.has || !(pointCount >= ROOM_MIN_POINTS) || !(storage.used > 0)) return null
  const avg = storage.used / pointCount
  if (!(avg > 0)) return null
  const free = storage.max != null ? storage.max - storage.used : volume && volume.free != null ? volume.free : null
  if (free == null || free <= 0) return 0
  return Math.floor(free / avg)
}

/**
 * Did the restore we asked for happen? pending: { at (ms, when we asked) }. Evidence, strongest first:
 * a Windows "Restore Operation" point newer than the request; else the machine rebooted since and Windows' last status says how it went.
 * With no reboot yet it is still waiting, and after REBOOT_WAIT_MS with no reboot the request evidently never ran.
 */
function outcome(pending, probe, now) {
  if (!pending || !probe || !probe.ok) return { status: 'unreadable' }
  const op = (probe.points || []).find(p => p.type === RESTORE_OP_TYPE && p.at != null && p.at >= pending.at - 60000)
  if (op) return { status: 'succeeded', evidence: 'point' }
  const rebooted = probe.bootAt != null && probe.bootAt > pending.at
  if (rebooted) {
    if (probe.lastStatus === 'failed' || probe.lastStatus === 'interrupted') return { status: probe.lastStatus, evidence: 'status' }
    if (probe.lastStatus === 'succeeded') return { status: 'succeeded', evidence: 'status' }
    return { status: 'unknown' }
  }
  if (now - pending.at > REBOOT_WAIT_MS) return { status: probe.bootAt == null ? 'unknown' : 'cancelled' }
  return { status: 'waiting' }
}

/**
 * After a successful restore: which journal entries did Windows roll back (the ones recorded between the point and the request), and which
 * `tweak_<id>` flags that changes. The OLDEST entry per tweak decides: if it was an apply, the tweak was not applied at the point.
 */
function reconcilePlan(pending, entries) {
  const hit = (entries || []).filter(e => e && typeof e.ts === 'number' && e.ts > pending.pointAt && e.ts <= pending.at && !e.undoneBy && e.via !== 'undo' && e.result !== 'error')
    .sort((a, b) => a.ts - b.ts)
  const flags = {}
  for (const e of hit) if (e.tweakId && !(('tweak_' + e.tweakId) in flags)) flags['tweak_' + e.tweakId] = e.action === 'apply' ? 'restored' : 'applied'
  return { ids: hit.map(e => e.id), flags }
}

/** The whole snapshot the page renders. */
function build({ probe, entries, nameOf, state, days, lastAutoAt, now, creating }) {
  const read = !!(probe && probe.ok && probe.pointsRead)
  const base = { ok: true, read, when: now, creating: !!creating, pending: state && state.pending ? { seq: state.pending.seq, at: state.pending.at } : null, lastRestore: (state && state.lastRestore) || null }
  if (!probe || !probe.ok) return { ...base, ok: true, admin: null, protection: 'unknown', points: [], verdict: F.verdict({ read: false, now }), findings: [], line: lifeline([], [], now), changes: [], schedule: { days: days || 0, lastAt: lastAutoAt || null, nextAt: null } }
  const changes = activeChanges(entries, nameOf)
  const points = probe.points.map(p => {
    const o = originOf(p.desc, p.type)
    return { seq: p.seq, desc: p.desc, at: p.at, type: p.type, origin: o.origin, group: o.group, arg: o.arg, after: p.at == null ? 0 : changes.filter(c => c.ts > p.at).length }
  })
  const newestAt = newestAtOf(points)
  const since = sinceOf(points, changes), unprotected = unprotectedOf(points, changes)
  const m = { read, admin: probe.admin, protection: probe.protection, policyBlocked: probe.policy.blocked, points: points.length, since: since.length, unprotected: unprotected.length, newestAt, now,
    vssDisabled: probe.vss.disabled, storage: probe.storage, volume: probe.volume, lastRestore: base.lastRestore }
  const v = F.verdict(m)
  const sched = { days: days || 0, lastAt: lastAutoAt || null, nextAt: days > 0 ? (lastAutoAt || now) + days * DAY : null }
  return {
    ...base, admin: probe.admin, drive: probe.drive, protection: probe.protection, policy: probe.policy, vss: probe.vss, storage: probe.storage, volume: probe.volume,
    battery: probe.battery, points, newestAt, since: since.length, unprotected: unprotected.length, changes: changes.slice(-200).map(c => ({ id: c.id, ts: c.ts, name: c.name })),
    room: roomEstimate(probe.storage, probe.volume, points.length), line: lifeline(points, changes, now),
    verdict: v, findings: F.compute(m, v.kind), schedule: sched, capPcts: F.T.CAP_PCT,
  }
}

module.exports = { originOf, activeChanges, sinceOf, unprotectedOf, lifeline, afterPoint, roomEstimate, outcome, reconcilePlan, build, newestAtOf, WINDOW_MS, SLOTS, RESTORE_OP_TYPE, REBOOT_WAIT_MS }
