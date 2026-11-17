'use strict'
// Restore points service "Lifeline": scan (ONE read-only probe + the change journal), create, preview, restore (with a pending record that is reconciled
// after the reboot), delete, protection on/off, storage cap, schedule. Every write is READ BACK with a fresh scan before it reports success.
// Every side effect comes in through `deps`, so tests drive it with fakes.
//   deps: { runPS(script, ms)->{ok,out,err}, createPoint(desc, send)->{ok,seq,code,reason,guidance}, journal:{ list(opts)->entries, markUndone(id, by) }, nameOf?(entry),
//           settings:{ get()->{autoSnapshotDays,lastAutoSnapshot}, patch(obj) }, flagPatch?(obj) (tweak_<id> flags), isGameRunning?()->bool, openRstrui?()->Promise<bool>,
//           state:{read(),write(obj)}, emit?(channel, payload), now? }
const detect = require('./detect')
const model = require('./model')
const actions = require('./actions')

const DEFAULT_STATE = { pending: null, lastRestore: null, lastAutoAt: null, lastAutoTry: 0 }
const DAYS = [0, 1, 3, 7]
const RETRY_MS = 6 * 3600 * 1000       // a failed scheduled point is not retried every hour
const FRESH_MS = 20 * 1000             // a scan this young is reused by create's pre-check
const PENDING_TTL_MS = 3 * 24 * 3600 * 1000
const JOURNAL_LIMIT = 600
const MAX_LABEL = 40

/** Finnish letters become their plain Latin twin (the description may only hold ASCII), everything else outside the allowed set becomes a space. */
function cleanLabel(s) {
  const map = { ä: 'a', ö: 'o', å: 'a', Ä: 'A', Ö: 'O', Å: 'A', é: 'e', É: 'E', ü: 'u', Ü: 'U' }
  return String(s == null ? '' : s).replace(/[äöåÄÖÅéÉüÜ]/g, c => map[c]).replace(/[^A-Za-z0-9 ._-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL)
}

function create(deps) {
  const now = deps.now || Date.now
  const emit = (ch, p) => { try { deps.emit && deps.emit(ch, p) } catch { /* best effort */ } }
  const clone = o => JSON.parse(JSON.stringify(o))
  const load = () => ({ ...clone(DEFAULT_STATE), ...(deps.state.read() || {}) })
  const save = s => { try { deps.state.write(s) } catch { /* best effort */ } }
  const runPS = async (script, ms) => { try { return (await deps.runPS(script, ms)) || { ok: false, out: '' } } catch (e) { return { ok: false, out: '', err: String((e && e.message) || e) } } }
  const settings = () => { try { return (deps.settings && deps.settings.get()) || {} } catch { return {} } }
  let snap = null, probe = null, probeAt = 0, inflight = null, creating = false, busy = false

  const entries = () => { try { return deps.journal.list({ limit: JOURNAL_LIMIT }) || [] } catch { return [] } }
  const runProbe = async () => { const r = await runPS(detect.buildScript(), 60000); return r.out ? detect.parse(r.out) : { ok: false } }

  function compose() {
    const st = settings(), s = load()
    const days = DAYS.includes(parseInt(st.autoSnapshotDays, 10)) ? parseInt(st.autoSnapshotDays, 10) : 0
    const last = s.lastAutoAt || (st.lastAutoSnapshot ? Date.parse(st.lastAutoSnapshot) : null)
    const b = model.build({ probe, entries: entries(), nameOf: deps.nameOf, state: s, days, lastAutoAt: Number.isFinite(last) ? last : null, now: now(), creating })
    // "Before: <tweak>" points carry the tweak id; show the tweak's own name when the journal knows it.
    if (deps.nameOf) for (const p of b.points || []) if (p.origin === 'beforeTweak') { try { p.argName = deps.nameOf({ tweakId: p.arg }) || p.arg } catch { p.argName = p.arg } }
    return b
  }

  /** Did a restore we asked for finish? Runs on every scan while a request is pending, so the receipt shows the first time the tab opens after the reboot. */
  function reconcile() {
    const s = load()
    if (!s.pending || !probe || !probe.ok) return false
    const out = model.outcome(s.pending, probe, now())
    if (out.status === 'waiting' || out.status === 'unreadable') return false
    if (out.status === 'unknown' && now() - s.pending.at < PENDING_TTL_MS) return false   // Windows has not said yet: ask again next scan
    let marked = 0, tweaks = 0
    if (out.status === 'succeeded') {
      const plan = model.reconcilePlan(s.pending, entries())
      for (const id of plan.ids) { try { deps.journal.markUndone(id, 'system-restore:' + s.pending.seq); marked++ } catch { /* the entry stays; the receipt says how many were marked */ } }
      tweaks = Object.keys(plan.flags).length
      if (tweaks && deps.flagPatch) { try { deps.flagPatch(plan.flags) } catch { /* flags are re-read by the next tweak scan */ } }
    }
    s.lastRestore = { status: out.status === 'unknown' ? 'unknown' : out.status, seq: s.pending.seq, desc: s.pending.desc || '', at: s.pending.at, doneAt: now(), marked, tweaks, evidence: out.evidence || null }
    s.pending = null
    save(s)
    return true
  }

  async function scan() {
    if (inflight) return inflight
    inflight = (async () => {
      try {
        probe = await runProbe(); probeAt = now()
        reconcile()
        snap = compose()
        return snap
      } finally { inflight = null }
    })()
    return inflight
  }
  const cached = () => snap
  /** Another feature made or removed a point: the page reloads when it hears this. */
  function invalidate() { probeAt = 0; emit('restore2-changed', {}) }
  const changed = () => emit('restore2-changed', {})

  // ── create ──
  async function createNow({ label, source } = {}) {
    if (creating) return { ok: false, code: 'busy', reason: 'busy' }
    creating = true
    const phase = p => emit('restore2-phase', { phase: p })
    try {
      phase('check')
      const fresh = snap && probe && now() - probeAt < FRESH_MS
      const s0 = fresh ? snap : await scan()
      if (s0.admin === false) { phase('done'); return { ok: false, code: 'not_admin', reason: 'Administrator rights are required to create a restore point', guidance: 'Restart Jylli Tool as administrator, then try again.' } }
      phase('snapshot')
      const clean = cleanLabel(label)
      const desc = source === 'scheduled' ? 'JylliTool_Scheduled' : clean ? `JylliTool_Manual - ${clean}` : 'JylliTool_Manual'
      const r = await deps.createPoint(desc, () => {})
      if (!r.ok) { phase('done'); return r }
      phase('verify')
      const after = await scan()
      phase('done')
      const found = after.points.find(p => p.seq === r.seq)
      changed()
      return { ok: true, seq: r.seq, desc, verified: !!found, snapshot: after }
    } finally { creating = false }
  }

  // ── preview / restore / delete ──
  async function preview({ seq }) {
    let n; try { n = actions.posInt(seq) } catch { return { ok: false, error: 'invalid' } }
    const s = snap || await scan()
    const p = s.points.find(x => x.seq === n)
    if (!p) return { ok: false, error: 'not_found' }
    const changes = model.activeChanges(entries(), deps.nameOf)
    const a = model.afterPoint(p, changes, probe ? probe.programs : [])
    const pr = a.later.slice(0, 40).map(x => ({ name: x.name, day: x.day })), same = a.same.slice(0, 20).map(x => ({ name: x.name, day: x.day }))
    return {
      ok: true, point: p,
      changes: a.changes.slice(-80).reverse().map(c => ({ id: c.id, ts: c.ts, name: c.name })), changeCount: a.changes.length,
      programsLater: pr, programsLaterCount: a.later.length, programsSame: same, programsSameCount: a.same.length,
      ready: { admin: s.admin !== false, onBattery: !!(s.battery && s.battery.discharging), batteryPct: s.battery ? s.battery.pct : null, diskFree: s.volume ? s.volume.free : null, diskLow: !!(s.volume && s.volume.free != null && s.volume.free < require('./findings').T.DISK_LOW_BYTES) },
    }
  }

  async function restore({ seq }) {
    let n; try { n = actions.posInt(seq) } catch { return { ok: false, error: 'invalid' } }
    if (busy || creating) return { ok: false, error: 'busy' }
    busy = true
    try {
      const s = await scan()
      if (s.admin === false) return { ok: false, error: 'not_admin' }
      const p = s.points.find(x => x.seq === n)
      if (!p) return { ok: false, error: 'not_found' }
      const st = load()
      st.pending = { seq: n, desc: p.desc, pointAt: p.at, at: now() }   // written BEFORE the call: the reboot may kill this process
      save(st)
      const r = await runPS(actions.restoreScript(n), 120000)
      if (r.ok) return { ok: true, rebooting: true }
      const st2 = load(); st2.pending = null; save(st2)
      let opened = false
      try { opened = deps.openRstrui ? !!(await deps.openRstrui()) : false } catch { opened = false }
      return { ok: false, fallback: opened, error: String(r.err || '').slice(0, 300) || 'restore_failed' }
    } finally { busy = false }
  }

  async function remove({ seq }) {
    let n; try { n = actions.posInt(seq) } catch { return { ok: false, error: 'invalid' } }
    if (busy || creating) return { ok: false, error: 'busy' }
    busy = true
    try {
      const r = await runPS(actions.deleteScript(n), 60000)
      let ok = r.ok && /deleted:/.test(r.out || '')
      let why = String(r.err || '').slice(0, 300)
      if (!ok) {
        const id = (String(r.out || '').match(/\{[0-9a-fA-F-]{36}\}/) || [])[0]
        if (id) { const r2 = actions.parseOk(await runPS(actions.deleteByIdScript(id), 30000)); ok = r2.ok; if (!ok) why = r2.reason || why }
      }
      const after = await scan()
      const gone = !after.points.some(p => p.seq === n)
      changed()
      return ok && gone ? { ok: true, snapshot: after } : { ok: false, error: why || (ok ? 'still_there' : 'delete_failed'), snapshot: after }
    } finally { busy = false }
  }

  // ── protection / storage / schedule ──
  async function protect({ on }) {
    if (busy || creating) return { ok: false, error: 'busy' }
    busy = true
    try {
      const r = actions.parseOk(await runPS(on ? actions.protectOnScript() : actions.protectOffScript(), 60000))
      const after = await scan()
      const want = on ? 'on' : 'off'
      changed()
      return r.ok && after.protection === want ? { ok: true, snapshot: after } : { ok: false, error: r.ok ? 'not_confirmed' : r.code || 'failed', reason: r.reason || '', snapshot: after }
    } finally { busy = false }
  }

  async function storage({ pct }) {
    let p; try { p = actions.pctOf(pct) } catch { return { ok: false, error: 'invalid' } }
    if (busy || creating) return { ok: false, error: 'busy' }
    busy = true
    try {
      const r = actions.parseOk(await runPS(actions.storageScript(p), 60000))
      const after = await scan()
      const sz = after.volume && after.volume.size, mx = after.storage && after.storage.max
      // Read back: the cap now reported must match the percent we asked for (vssadmin rounds, so allow one percent).
      const got = sz && mx ? (mx / sz) * 100 : null
      const confirmed = got != null && Math.abs(got - p) <= 1
      changed()
      return r.ok && confirmed ? { ok: true, snapshot: after } : { ok: false, error: r.ok ? 'not_confirmed' : r.code || 'failed', reason: r.reason || '', snapshot: after }
    } finally { busy = false }
  }

  function schedule({ days }) {
    const d = parseInt(days, 10)
    if (!DAYS.includes(d)) return { ok: false, error: 'invalid' }
    try { deps.settings.patch({ autoSnapshotDays: d }) } catch { return { ok: false, error: 'failed' } }
    snap = compose()
    changed()
    return { ok: true, snapshot: snap }
  }

  /** The hourly schedule check. Never while a game runs or on battery; a failed attempt waits RETRY_MS. */
  async function tick() {
    const st = settings(), days = parseInt(st.autoSnapshotDays, 10) || 0
    if (!DAYS.includes(days) || !days) return { ran: false, reason: 'off' }
    if (creating || busy) return { ran: false, reason: 'busy' }
    let game = false; try { game = deps.isGameRunning ? !!deps.isGameRunning() : false } catch { game = false }
    if (game) return { ran: false, reason: 'game' }
    const s = load()
    const last = s.lastAutoAt || (st.lastAutoSnapshot ? Date.parse(st.lastAutoSnapshot) : 0) || 0
    if (now() - last < days * 24 * 3600 * 1000) return { ran: false, reason: 'not_due' }
    if (s.lastAutoTry && now() - s.lastAutoTry < RETRY_MS) return { ran: false, reason: 'retry_wait' }
    const sc = await scan()
    if (sc.battery && sc.battery.discharging) return { ran: false, reason: 'battery' }
    const s1 = load(); s1.lastAutoTry = now(); save(s1)
    const r = await createNow({ source: 'scheduled' })
    if (!r.ok) return { ran: false, reason: 'failed', error: r.reason || r.code }
    const s2 = load(); s2.lastAutoAt = now(); save(s2)
    try { deps.settings.patch({ lastAutoSnapshot: new Date(now()).toISOString() }) } catch { /* the service state is the source of truth */ }
    emit('auto-snapshot-done', { ts: new Date(now()).toISOString() })
    return { ran: true, seq: r.seq }
  }

  const hasPending = () => !!load().pending

  function ack() { const s = load(); s.lastRestore = null; save(s); snap = compose(); return { ok: true, snapshot: snap } }

  function exportText() {
    const pts = (snap && snap.points) || []
    const lines = pts.map(p => `#${p.seq} | ${p.desc} | ${p.at != null ? new Date(p.at).toISOString() : ''}`)
    return { filename: 'RestorePoints.txt', content: lines.join('\n') + '\n', count: pts.length }
  }

  return { scan, cached, createNow, preview, restore, remove, protect, storage, schedule, tick, ack, exportText, reconcile, invalidate, hasPending, cleanLabel }
}

module.exports = { create, cleanLabel, detect, model, actions, DAYS }
