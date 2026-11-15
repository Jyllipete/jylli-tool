'use strict'
// Startup service "Ignition": scan (ONE read-only probe + Windows' boot timing), run (journaled on / off / delay / undelay, then READ AGAIN to verify),
// undo a run, keep a program off (Premium guard), put old changes back, and the one switch this tab owns.
// Every side effect comes in through `deps`, so tests drive it with fakes.
//   deps: { runPS(script, ms)->{ok,out}, runRecorded(control, action, meta, fn(ps,cmd,note)), isPremium()->bool, isLaptop?()->bool|Promise<bool>,
//           state:{read(),write(obj)}, emit?(channel, payload), now? }
const catalog = require('./catalog')
const detect = require('./detect')
const bootlib = require('./boot')
const impact = require('./impact')
const model = require('./model')
const findings = require('./findings')
const actions = require('./actions')

const DEFAULT_STATE = { applied: {}, pinned: {}, delays: {}, seen: [], fresh: {}, offByUs: {}, cbSeen: {}, runs: [], boots: [], baseline: null, guardLog: [], newLog: [], cameBackLog: [], before: {}, last: null }
const MAX_RUNS = 30, MAX_LOG = 30, FRESH_MS = 14 * 24 * 3600 * 1000, BOOT_EVERY = 5 * 60 * 1000
const ACTIONS = ['off', 'on', 'delay', 'undelay']

function create(deps) {
  const now = deps.now || Date.now
  const emit = (ch, p) => { try { deps.emit && deps.emit(ch, p) } catch { /* best effort */ } }
  const clone = o => JSON.parse(JSON.stringify(o))
  const load = () => ({ ...clone(DEFAULT_STATE), ...(deps.state.read() || {}) })
  const save = s => { try { deps.state.write(s) } catch { /* best effort */ } }
  const premium = () => { try { return deps.isPremium ? deps.isPremium() === true : false } catch { return false } }
  let busy = false, snap = null, probe = null, bootRaw = null, bootAt = 0, live = null, laptop, guarding = false
  const icons = new Map()

  const runPS = async (script, ms) => { try { return (await deps.runPS(script, ms)) || { ok: false, out: '' } } catch { return { ok: false, out: '' } } }
  const runProbe = async () => { const r = await runPS(detect.buildScript(), 40000); return r.out ? detect.parse(r.out) : null }
  async function readBoot(force) {
    if (!force && bootRaw && now() - bootAt < BOOT_EVERY) return bootRaw
    const r = await runPS(detect.bootScript(), 30000)
    const b = r.out ? detect.parseBoot(r.out) : null
    if (b) { bootRaw = b; bootAt = now() }
    return bootRaw
  }
  async function isLaptop() {
    if (laptop !== undefined) return laptop
    try { laptop = deps.isLaptop ? !!(await deps.isLaptop()) : false } catch { laptop = false }
    return laptop
  }

  // ── composing the snapshot ─────────────────────────────────────────────
  function bootView(s) {
    const raw = bootRaw
    const boots = bootlib.mergeBoots(s.boots, raw ? bootlib.parseBoots(raw.boots) : [])
    const slow = raw ? impact.parseSlow(raw.slow) : {}
    return { raw, boots, slow, summary: bootlib.summary(boots), compare: bootlib.compare(s.baseline, boots, raw ? raw.lastBoot : null, now()) }
  }

  function compose(s) {
    const b = bootView(s)
    const m = model.build({
      probe, boot: b.raw, boots: b.boots, slow: b.slow, live,
      state: { applied: s.applied, pinned: s.pinned, delays: s.delays, fresh: s.fresh, offByUs: s.offByUs },
      premium: premium(), isLaptop: laptop === true, now: now(),
    })
    const byStem = {}
    for (const e of m.entries) if (e.stem) byStem[e.stem] = e.name
    const slowList = Object.entries(b.slow).map(([stem, v]) => ({ stem, name: byStem[stem] || stem, inList: !!byStem[stem], ...v, level: impact.levelOf(v.medianMs) })).sort((x, y) => y.medianMs - x.medianMs).slice(0, 8)
    const sw = catalog.OWNED.map(o => {
      const v = m.switches ? m.switches[o.id] : undefined
      return { id: o.id, icon: o.icon, value: v == null ? null : v, state: m.read ? model.switchState(o, v, !!s.applied['sw:' + o.id]) : 'unknown', ours: !!s.applied['sw:' + o.id] }
    })
    const finds = findings.compute(m, { boot: b.raw })
    return {
      entries: m.entries, counts: m.counts, totals: m.totals, rec: m.rec, legacy: m.legacy, read: m.read, admin: m.admin, switches: sw,
      findings: finds, verdict: findings.verdict(m, b.summary),
      boot: { status: b.raw ? b.raw.status : 'unread', summary: b.summary, boots: b.boots.slice(0, 10), compare: b.compare, slow: slowList, lastBoot: b.raw ? b.raw.lastBoot : null },
      premium: premium(), when: now(), live: !!live,
    }
  }

  /** What is new since the last look, and what came back on after Jylli switched it off. Pure bookkeeping on the state, returns true when it changed. */
  function track(s, c) {
    let changed = false
    const ids = c.entries.map(e => e.id)
    if (s.seen.length) {
      for (const e of c.entries) if (!s.seen.includes(e.id) && !s.fresh[e.id]) { s.fresh[e.id] = now(); s.newLog = [{ id: e.id, name: e.name, at: now() }, ...s.newLog].slice(0, MAX_LOG); changed = true }
    }
    const merged = [...new Set([...s.seen, ...ids])].slice(-400)
    if (merged.length !== s.seen.length) { s.seen = merged; changed = true }
    for (const id of Object.keys(s.fresh)) if (!ids.includes(id) || now() - s.fresh[id] > FRESH_MS) { delete s.fresh[id]; changed = true }
    if (c.read) for (const id of Object.keys(s.offByUs)) if (!ids.includes(id)) { delete s.offByUs[id]; delete s.cbSeen[id]; changed = true }
    for (const e of c.entries) {
      if (e.cameBack && !s.cbSeen[e.id]) { s.cbSeen[e.id] = now(); s.cameBackLog = [{ id: e.id, name: e.name, at: now() }, ...s.cameBackLog].slice(0, MAX_LOG); changed = true }
      if (!e.cameBack && s.cbSeen[e.id]) { delete s.cbSeen[e.id]; changed = true }
    }
    return changed
  }

  async function scan({ forceBoot } = {}) {
    if (busy && snap) return snap
    busy = true
    try {
      await isLaptop()
      const [p] = await Promise.all([runProbe(), readBoot(forceBoot)])
      probe = p; live = null
      const s = load()
      snap = compose(s)
      if (track(s, snap)) { snap = compose(s) }
      s.last = { when: snap.when, worth: snap.counts.worth }
      save(s)
      await guard().catch(() => {})
      return snap
    } finally { busy = false }
  }

  /** The cheap refresh: which startup programs are running right now and how much memory they hold. */
  async function liveRefresh() {
    if (!snap) return scan()
    if (busy) return { ok: true, running: runningMap() }
    const r = await runPS(detect.liveScript(), 20000)
    const l = r.out ? detect.parseLive(r.out) : null
    if (l) { live = l; snap = compose(load()) }
    return { ok: !!l, running: runningMap(), when: now() }
  }
  const runningMap = () => Object.fromEntries((snap ? snap.entries : []).filter(e => e.running).map(e => [e.id, e.running]))

  /** Icons for the entries' program files, extracted once per file. */
  async function iconsFor() {
    if (!snap) return {}
    const want = [...new Set(snap.entries.map(e => e.exe).filter(p => p && /^[A-Za-z]:\\/.test(p) && !icons.has(p)))].slice(0, 60)
    if (want.length) {
      const r = await runPS(detect.iconScript(want), 40000)
      const got = r.out ? detect.parseIcons(r.out) : {}
      for (const p of want) icons.set(p, got[p] || null)
    }
    const out = {}
    for (const e of snap.entries) { const d = e.exe && icons.get(e.exe); if (d) out[e.id] = d }
    return out
  }

  // ── changes ────────────────────────────────────────────────────────────
  async function removeDelay(e, note) {
    const r = await runPS(actions.delayRemoveScript(e.delay.task), 15000)
    const ok = /JJOK/.test(r.out || '')
    if (ok && note) note({ kind: 'startup-task', path: catalog.DELAY_PATH, name: e.delay.task, exe: e.exe, args: e.args, sec: e.delay.sec, before: { exists: true, value: 'present' }, after: { exists: false } })
    return ok
  }
  async function createDelay(e, sec, note) {
    const name = catalog.delayTaskName(e.id)
    const r = await runPS(actions.delayCreateScript({ name, exe: e.exe, args: e.args, sec }), 20000)
    const ok = /JJOK/.test(r.out || '')
    if (ok && note) note({ kind: 'startup-task', path: catalog.DELAY_PATH, name, exe: e.exe, args: e.args, sec, before: { exists: false }, after: { exists: true, value: 'present' } })
    return ok ? name : null
  }

  async function perform(e, it, batchId, via) {
    let failed = null, task = null
    const meta = { via, batchId, onFailures: x => { failed = x } }
    const ctl = 'startup:' + e.src + ':' + catalog.slug(e.name)
    await deps.runRecorded(ctl, 'apply', meta, async (ps, cmd, note) => {
      const setApproved = on => (e.kind === 'task' ? actions.taskLines(e.path, e.name, on) : actions.approvedLines(e.src, e.name, on, now()))
      if (it.action === 'off') {
        if (e.delayed) { if (!(await removeDelay(e, note))) failed = failed || [{ err: 'delay task' }] }
        else for (const l of setApproved(false)) await ps(l)
      } else if (it.action === 'on' || it.action === 'undelay') {
        if (e.delay && e.delay.ok) { if (!(await removeDelay(e, note))) { failed = failed || [{ err: 'delay task' }]; return } }
        for (const l of setApproved(true)) await ps(l)
      } else if (it.action === 'delay') {
        task = await createDelay(e, it.sec, note)
        if (!task) { failed = failed || [{ err: 'delay task' }]; return }
        for (const l of setApproved(false)) await ps(l)
      }
    })
    return { ok: !failed, task }
  }

  /** items: [{ id, action: 'off'|'on'|'delay'|'undelay', sec? }] -> { ok, run, snapshot } */
  async function run({ items, via, undo } = {}) {
    if (!Array.isArray(items) || !items.length || items.length > 60) return { ok: false, error: 'invalid_items' }
    if (!snap) await scan()
    await isLaptop()
    const batchId = 'startup-' + now(), runId = 'u' + now()
    const s = load()
    const p0 = await runProbe()
    if (!p0) return { ok: false, error: 'unread' }
    const m0 = model.build({ probe: p0, boots: [], slow: {}, state: { applied: s.applied, pinned: s.pinned, delays: s.delays, fresh: s.fresh, offByUs: s.offByUs }, isLaptop: laptop === true })
    const by = Object.fromEntries(m0.entries.map(e => [e.id, e]))
    const out = []
    for (const it of items) {
      const action = ACTIONS.includes(it && it.action) ? it.action : null
      const e = by[it && it.id]
      const base = { id: String((it && it.id) || ''), name: e ? e.name : '', action: action || 'off' }
      if (!action || !e) { out.push({ ...base, ok: false, reason: 'unknown' }); continue }
      if (!e.canToggle) { out.push({ ...base, ok: false, reason: e.kind === 'appx' ? 'appx' : 'admin' }); continue }
      const was = { enabled: e.enabled, delaySec: e.delayed && e.delay ? e.delay.sec : null }
      if (action === 'off' && !e.enabled && !e.delayed) { out.push({ ...base, ok: true, noop: true, was }); continue }
      if ((action === 'on' || action === 'undelay') && e.enabled && !e.delayed) { out.push({ ...base, ok: true, noop: true, was }); continue }
      if (action === 'delay') {
        if (!e.delayable) { out.push({ ...base, ok: false, reason: 'no-delay', was }); continue }
        if (!catalog.DELAYS.includes(Number(it.sec))) { out.push({ ...base, ok: false, reason: 'bad-delay', was }); continue }
      }
      try {
        const r = await perform(e, { action, sec: Number(it.sec) || 60 }, batchId, via || 'manual')
        out.push({ ...base, ok: r.ok, reason: r.ok ? null : 'failed', was, sec: action === 'delay' ? Number(it.sec) : null, task: r.task || null })
      } catch { out.push({ ...base, ok: false, reason: 'error', was }) }
    }
    // Read it again: a change only counts when Windows says so.
    probe = (await runProbe()) || probe
    const m1 = model.build({ probe, boots: [], slow: {}, state: { applied: s.applied, pinned: s.pinned, delays: { ...s.delays, ...Object.fromEntries(out.filter(o => o.ok && o.action === 'delay').map(o => [o.id, { sec: o.sec, task: o.task }])) }, fresh: {}, offByUs: {} }, isLaptop: laptop === true })
    const after = Object.fromEntries(m1.entries.map(e => [e.id, e]))
    for (const o of out) {
      if (o.noop) { if (o.action === 'on' || o.action === 'undelay') { delete s.offByUs[o.id]; delete s.delays[o.id] } continue }
      if (!o.ok) continue
      const a = after[o.id]
      if (!a) o.verified = null
      else {
        o.verified = o.action === 'off' ? !a.enabled && !a.delayed : o.action === 'delay' ? a.delayed : a.enabled && !a.delayed
        if (!o.verified) { o.ok = false; o.reason = 'not-verified' }
      }
      if (!o.ok) continue
      if (o.action === 'off') { s.offByUs[o.id] = now(); s.applied[o.id] = now(); delete s.delays[o.id] }
      else if (o.action === 'delay') { s.delays[o.id] = { sec: o.sec, task: o.task, at: now() }; delete s.offByUs[o.id]; s.applied[o.id] = now() }
      else { delete s.offByUs[o.id]; delete s.delays[o.id]; delete s.applied[o.id]; if (via !== 'scheduler') delete s.pinned[o.id] }
    }
    // The first change since the last restart records where the boot time stood, so the next boot can be compared honestly.
    // Undoing changes that are still waiting for a restart takes them off the count again (nothing left = nothing to compare).
    const changed = out.filter(o => o.ok && !o.noop && (o.action === 'off' || o.action === 'delay')).length
    const reverted = undo ? out.filter(o => o.ok && !o.noop).length : 0
    const b0 = bootView(s)
    const waiting = !!(s.baseline && b0.compare && b0.compare.state === 'restart')
    if (undo && waiting) { s.baseline.n = Math.max(0, (s.baseline.n || 0) - reverted); if (!s.baseline.n) s.baseline = null }
    else if (changed) {
      if (waiting) s.baseline = { ...s.baseline, n: (s.baseline.n || 0) + changed }
      else s.baseline = { at: now(), bootMs: bootlib.medianOf(b0.boots, 'ms'), mainMs: bootlib.medianOf(b0.boots, 'mainMs'), n: changed }
    }
    const rec = { id: runId, at: now(), batchId, via: via || 'manual', items: out }
    s.runs = [rec, ...(s.runs || [])].slice(0, MAX_RUNS)
    for (const id of Object.keys(s.fresh)) if (out.some(o => o.id === id && o.ok)) delete s.fresh[id]
    snap = compose(s)
    track(s, snap)
    save(s)
    emit('startup2-changed', { runId })
    return { ok: out.some(o => o.ok), run: rec, snapshot: snap }
  }

  const recommended = () => (snap ? snap.rec.map(id => ({ id, action: 'off' })) : [])
  const tuneRecommended = () => run({ items: recommended() })

  async function undoRun({ runId } = {}) {
    const r = (load().runs || []).find(x => x.id === runId)
    if (!r) return { ok: false, error: 'not-found' }
    const items = r.items.filter(i => i.ok && !i.noop && i.was).map(i => (i.was.delaySec ? { id: i.id, action: 'delay', sec: i.was.delaySec } : { id: i.id, action: i.was.enabled ? 'on' : 'off' }))
    if (!items.length) return { ok: false, error: 'nothing-to-undo' }
    return run({ items, undo: true })
  }

  const history = () => { const s = load(); const b = bootView(s); return { runs: s.runs || [], guard: s.guardLog || [], fresh: s.newLog || [], cameBack: s.cameBackLog || [], boots: b.boots, compare: b.compare } }

  /** A program that came back is dismissed from "new". */
  function ack({ id } = {}) {
    const s = load()
    if (s.fresh[id]) { delete s.fresh[id]; save(s); if (snap) snap = compose(s) }
    return { ok: true, snapshot: snap }
  }

  // ── keep off (Premium guard) ───────────────────────────────────────────
  async function keepSet({ id, on } = {}) {
    if (!premium()) return { ok: false, error: 'premium_required' }
    if (!snap) await scan()
    const e = snap.entries.find(x => x.id === id)
    if (!e || !e.canToggle) return { ok: false, error: 'unknown' }
    const s = load()
    if (on) s.pinned[id] = now(); else delete s.pinned[id]
    save(s)
    snap = compose(s)
    if (on && (e.enabled || e.delayed)) return run({ items: [{ id, action: 'off' }], via: 'manual' }).then(r => ({ ...r, ok: true }))
    emit('startup2-changed', { keep: id })
    return { ok: true, snapshot: snap }
  }
  /** A pinned program that switched itself back on is switched off again (and logged). */
  async function guard() {
    if (guarding || !snap || !premium()) return { ok: true, skipped: true }
    const s = load()
    const due = snap.entries.filter(e => e.pinned && e.enabled && !e.delayed && e.canToggle)
    if (!due.length) return { ok: true, switched: 0 }
    guarding = true
    try {
      const r = await run({ items: due.map(e => ({ id: e.id, action: 'off' })), via: 'scheduler' })
      const s2 = load()
      for (const o of (r.run && r.run.items) || []) if (o.ok && !o.noop) s2.guardLog = [{ id: o.id, name: o.name, at: now() }, ...(s2.guardLog || [])].slice(0, MAX_LOG)
      save(s2)
      return { ok: true, switched: due.length }
    } finally { guarding = false; void s }
  }

  // ── the owned switch ───────────────────────────────────────────────────
  async function switchSet({ id, on } = {}) {
    const row = catalog.OWNED.find(o => o.id === id)
    if (!row) return { ok: false, error: 'unknown' }
    if (!snap) await scan()
    const s = load()
    const batchId = 'startup-sw-' + now()
    const cur = probe && probe.switches ? probe.switches[id] : null
    if (on && s.before[id] === undefined) s.before[id] = cur == null ? null : cur
    if (!on && !s.applied['sw:' + id]) return { ok: false, error: 'not-ours' }
    let failed = null
    try { await deps.runRecorded('startup:' + id, 'apply', { via: 'manual', batchId, onFailures: x => { failed = x } }, async ps => { for (const l of actions.switchLines(row, !!on, s.before[id])) await ps(l) }) } catch { failed = failed || [{}] }
    probe = (await runProbe()) || probe
    const v = probe && probe.switches ? probe.switches[id] : undefined
    const ok = !failed && (on ? v === row.value : v == null || v === s.before[id])
    if (ok) { if (on) s.applied['sw:' + id] = now(); else { delete s.applied['sw:' + id]; delete s.before[id] } }
    save(s)
    snap = compose(s)
    emit('startup2-changed', { sw: id })
    return { ok, verified: ok, snapshot: snap }
  }

  // ── what an older version did ──────────────────────────────────────────
  async function migrate() {
    if (!snap) await scan()
    let n = 0, failed = 0
    const batchId = 'startup-migrate-' + now()
    for (const l of snap.legacy || []) {
      let bad = null
      try {
        await deps.runRecorded('startup:legacy:' + catalog.slug(l.name), 'apply', { via: 'manual', batchId, onFailures: x => { bad = x } }, async ps => {
          const lines = l.kind === 'disabled' ? actions.migrateDisabledLines(l.src, l.name, now()) : actions.migrateTaskLines(l)
          for (const line of lines) await ps(line)
        })
      } catch { bad = bad || [{}] }
      if (bad) failed++; else n++
    }
    await scan()
    const left = snap.legacy.length
    emit('startup2-changed', { migrated: n })
    return { ok: failed === 0 && left === 0, migrated: n, failed: failed + left, snapshot: snap }
  }

  const fileOf = id => { const e = snap && snap.entries.find(x => x.id === id); return e ? (e.file || e.exe || '') : '' }
  const state = () => ({ snapshot: snap })

  /** Journal undo handlers for Jylli's delay task (a created task is removed, a removed one is made again). */
  function handlers() {
    return {
      'startup-task': {
        read: async c => actions.stateOk((await runPS(actions.delayStateScript(c.name), 15000)).out),
        restore: async c => {
          if (c.before && c.before.exists === false) return /JJOK/.test((await runPS(actions.delayRemoveScript(c.name), 15000)).out || '')
          if (!c.exe) return false
          return /JJOK/.test((await runPS(actions.delayCreateScript({ name: c.name, exe: c.exe, args: c.args, sec: c.sec }), 20000)).out || '')
        },
      },
    }
  }

  return { scan, live: liveRefresh, icons: iconsFor, run, tuneRecommended, recommended, undoRun, history, ack, keepSet, guard, switchSet, migrate, fileOf, handlers, state, busy: () => busy }
}

module.exports = { create, catalog, detect, boot: bootlib, impact, model, findings, actions }
