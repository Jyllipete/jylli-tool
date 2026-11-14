'use strict'
// Apps service "Backstage": scan (ONE read-only probe + one process sample + a look at the apps' own settings files), run (journaled changes, then READ
// AGAIN to verify), undo a run, put old changes back, and Game time (programs step back while a game runs, then everything is put back).
// Every side effect comes in through `deps`, so tests drive it with fakes.
//   deps: { runPS(script, ms)->{ok,out}, runRecorded(control, action, meta, fn(ps,cmd,note)), undoControl?(control),
//           cpumem:{priority({exe,level}), priorityClear({exe})}, files:{read(p)->string|null, write(p,text), exists(p), list(dir)->[name]},
//           env:{appdata, localappdata}, isPremium()->bool, settings()->object, activeGame()->{id,name,stems}|null,
//           legacyRestore(oldId)->Promise<bool>, state:{read(),write(obj)}, emit?(channel, payload), now?, sweepMs?, setInterval?, clearInterval? }
const path = require('path')
const known = require('./known')
const catalog = require('./catalog')
const detect = require('./detect')
const actions = require('./actions')
const rules = require('./rules')
const footprint = require('./footprint')
const findings = require('./findings')
const model = require('./model')

const DEFAULT_STATE = { applied: {}, before: {}, runs: [], rules: { enabled: false, picks: {} }, sessions: [], session: null, drift: {}, driftLog: [], last: null }
const MAX_RUNS = 30, MAX_SESSIONS = 20, MAX_DRIFT = 30
const SWEEP_MS = 30000

function create(deps) {
  const now = deps.now || Date.now
  const emit = (ch, p) => { try { deps.emit && deps.emit(ch, p) } catch { /* best effort */ } }
  const clone = o => JSON.parse(JSON.stringify(o))
  const load = () => { const s = { ...clone(DEFAULT_STATE), ...(deps.state.read() || {}) }; s.rules = { enabled: false, picks: {}, ...(s.rules || {}) }; return s }
  const save = s => { try { deps.state.write(s) } catch { /* best effort */ } }
  const premium = () => { try { return deps.isPremium ? deps.isPremium() === true : false } catch { return false } }
  const safe = (fn, d) => { try { return fn() } catch { return d } }
  const ring = footprint.Ring(24)
  let busy = false, snap = null, probe = null, files = null, legacyFiles = {}, sample = null, timer = null, sweeping = false

  // ── reading ────────────────────────────────────────────────────────────
  const dirs = () => ({
    ff: path.join((deps.env && deps.env.appdata) || '', 'Mozilla', 'Firefox', 'Profiles'),
    discord: path.join((deps.env && deps.env.appdata) || '', 'discord', 'settings.json'),
  })
  const ffProfiles = () => {
    const d = dirs().ff
    return safe(() => deps.files.list(d), []).map(n => path.join(d, n)).filter(p => safe(() => deps.files.exists(p), false))
  }
  /** What the apps' own settings files say: { rows: {rowId: {state}}, legacy: {discord, firefox} }. Unreadable = unread, a program that is not there = na. */
  function readFiles() {
    const rows = {}, legacy = { discord: false, firefox: false }
    const profiles = ffProfiles()
    if (!profiles.length) rows['firefox-lean'] = { state: 'na' }
    else {
      const has = profiles.map(p => { const t = safe(() => deps.files.read(path.join(p, 'user.js')), null); if (catalog.ffLegacy(t)) legacy.firefox = true; return catalog.ffHas(t) })
      rows['firefox-lean'] = { state: has.every(Boolean) ? 'all' : has.some(Boolean) ? 'some' : 'none' }
    }
    const dp = dirs().discord
    if (!safe(() => deps.files.exists(dp), false)) rows['discord-hwaccel'] = { state: 'na' }
    else {
      const t = safe(() => deps.files.read(dp), null)
      rows['discord-hwaccel'] = t == null ? { state: 'unread' } : { state: catalog.discordReadHw(t) }
      if (t != null && catalog.discordLegacy(t)) legacy.discord = true
    }
    return { rows, legacy }
  }

  const runProbe = async () => {
    let r = null
    try { r = await deps.runPS(detect.buildScript(), 30000) } catch { r = null }
    return r && r.out ? detect.parse(r.out) : null
  }
  const runSample = async () => {
    let r = null
    try { r = await deps.runPS(detect.procScript(), 30000) } catch { r = null }
    return r && r.out ? detect.parseProcs(r.out) : null
  }

  // ── composing the snapshot ─────────────────────────────────────────────
  function gametimeView(s, m, game) {
    const sess = s.session
    const lastS = (s.sessions || [])[0] || null
    return {
      enabled: !!s.rules.enabled, picks: s.rules.picks || {},
      active: sess ? { name: sess.name || '', since: sess.since, apps: [...new Set(sess.items.map(i => i.app))].length, procs: sess.items.length, before: sess.before, last: sess.last } : null,
      lastSession: lastS,
      preview: rules.preview(m.apps, { picks: s.rules.picks, premium: premium() }),
    }
  }

  function compose(s) {
    const prem = premium()
    const remembered = Object.fromEntries(Object.keys(s.applied || {}).map(k => [k, 'applied']))
    const settings = safe(() => deps.settings(), {}) || {}
    const m = model.build({
      probe, sample, files: files ? files.rows : {}, remembered, picks: s.rules.picks, premium: prem,
      legacy: catalog.legacyFound({ settings, ifeo: probe ? probe.ifeo : {}, files: legacyFiles }),
    })
    if (sample) ring.push(Object.fromEntries(m.apps.filter(a => a.cost && a.running).map(a => [a.id, a.cost.cpu])))
    const game = safe(() => deps.activeGame(), null) || (s.session ? { id: s.session.gameId, name: s.session.name } : null)
    const gt = gametimeView(s, m, game)
    const counts = model.counts(m.apps)
    const finds = findings.compute({ apps: m.apps, totals: m.totals, legacy: m.legacy, game, gametime: { enabled: gt.enabled, stepping: gt.preview.length }, read: m.read, measured: m.measured })
    return {
      apps: m.apps, totals: m.totals, segments: m.segments, others: m.others, gpu: m.gpu, cores: m.cores, counts, findings: finds,
      verdict: findings.verdict({ count: m.apps.length, measured: m.measured, totals: m.totals, game, findings: finds, stepped: gt.active ? gt.active.procs : 0 }),
      gametime: gt, game, legacy: m.legacy, premium: prem, read: m.read, measured: m.measured, when: now(), spark: ring.all(),
    }
  }

  function trackDrift(s, out) {
    let changed = false
    for (const a of out.apps) for (const r of a.rows) {
      if (r.status === 'drifted' && !s.drift[r.id]) { s.drift[r.id] = now(); s.driftLog = [{ row: r.id, app: a.id, at: now() }, ...(s.driftLog || [])].slice(0, MAX_DRIFT); changed = true }
      else if (r.status !== 'drifted' && s.drift[r.id]) { delete s.drift[r.id]; changed = true }
    }
    return changed
  }

  async function scan() {
    if (busy && snap) return snap
    busy = true
    try {
      const [p, sm] = await Promise.all([runProbe(), runSample()])
      probe = p; sample = sm
      const f = readFiles(); files = f; legacyFiles = f.legacy
      const s = load()
      snap = compose(s)
      trackDrift(s, snap)
      s.last = { when: snap.when, rec: snap.counts.rec }
      save(s)
      return snap
    } finally { busy = false }
  }

  /** Cheap refresh for the live view: one process sample, everything else as the last scan left it. */
  async function cost() {
    if (!snap) return scan()
    if (busy) return snap
    const sm = await runSample()
    if (sm) sample = sm
    snap = compose(load())
    return snap
  }

  // ── changes ────────────────────────────────────────────────────────────
  async function fileWrite(row, on, s) {
    const d = dirs()
    if (row.id === 'firefox-lean') {
      let n = 0
      for (const p of ffProfiles()) {
        const f = path.join(p, 'user.js'), t = safe(() => deps.files.read(f), null)
        deps.files.write(f, on ? catalog.ffAdd(t == null ? '' : t) : catalog.ffRemove(t == null ? '' : t)); n++
      }
      return n > 0
    }
    if (row.id === 'discord-hwaccel') {
      const t = deps.files.read(d.discord)
      if (t == null) return false
      const r = catalog.discordSetHw(t, on, s.before[row.id])
      if (on) s.before[row.id] = r.before
      deps.files.write(d.discord, r.text)
      return true
    }
    return false
  }

  /** items: [{ row, action: 'apply'|'restore' }] -> { ok, run, snapshot } */
  async function run({ items } = {}) {
    if (!Array.isArray(items) || !items.length || items.length > 60) return { ok: false, error: 'invalid_items' }
    if (!snap) await scan()
    const batchId = 'apps-' + now(), runId = 'a' + now()
    const s = load()
    const probe0 = await runProbe()
    const f0 = readFiles()
    const out = []
    for (const it of items) {
      const row = catalog.byId[it.row], on = it.action !== 'restore'
      const base = { row: String(it.row), action: on ? 'apply' : 'restore' }
      if (!row) { out.push({ ...base, ok: false, reason: 'unknown' }); continue }
      const live = detect.evaluate(probe0, row, f0.rows)
      base.app = row.app
      if (live.state === 'unread' || live.state === 'na') { out.push({ ...base, ok: false, reason: live.state === 'na' ? 'not-here' : 'unread' }); continue }
      if (on && live.state === 'other') { out.push({ ...base, ok: false, reason: 'elsewhere' }); continue }
      if (on && live.state === 'all') { out.push({ ...base, ok: true, noop: true }); continue }
      if (!on && live.state === 'none') { out.push({ ...base, ok: true, noop: true }); continue }
      if (!on && !s.applied[row.id]) { out.push({ ...base, ok: false, reason: 'not-ours' }); continue }     // set by somebody else: never removed here
      try {
        let ok = true
        if (row.kind === 'policy' || row.kind === 'service') {
          let failed = null
          if (row.kind === 'service' && on) s.before[row.id] = live.value
          const ls = catalog.lines(row, on, s.before[row.id])
          await deps.runRecorded('apps:' + row.id, 'apply', { via: 'manual', batchId, onFailures: x => { failed = x } }, async ps => { for (const l of ls) await ps(l) })
          if (failed) ok = false
        } else if (row.kind === 'priority') {
          const r = on ? await deps.cpumem.priority({ exe: row.exe, level: row.level }) : await deps.cpumem.priorityClear({ exe: row.exe })
          if (r && r.ok === false) ok = false
        } else if (row.kind === 'file') {
          ok = await fileWrite(row, on, s)
        }
        out.push({ ...base, ok, reason: ok ? null : 'failed' })
      } catch { out.push({ ...base, ok: false, reason: 'error' }) }
    }
    // Read it again: a change is only "applied" when the PC says so.
    probe = await runProbe(); files = readFiles(); legacyFiles = files.legacy
    for (const o of out) {
      if (o.noop) { if (o.action === 'restore') { delete s.applied[o.row]; delete s.drift[o.row] } continue }     // already in the wanted state: nothing was changed, nothing is claimed
      if (!o.ok) continue
      const live = detect.evaluate(probe, catalog.byId[o.row], files.rows)
      if (live.state === 'unread') o.verified = null
      else {
        const want = o.action === 'apply' ? 'all' : 'none'
        o.verified = live.state === want
        if (!o.verified) { o.ok = false; o.reason = 'not-verified' }
      }
      if (o.ok && o.action === 'apply') s.applied[o.row] = now()
      if (o.ok && o.action === 'restore') { delete s.applied[o.row]; delete s.drift[o.row] }
    }
    const rec = { id: runId, at: now(), batchId, items: out }
    s.runs = [rec, ...(s.runs || [])].slice(0, MAX_RUNS)
    snap = compose(s)
    trackDrift(s, snap)
    save(s)
    emit('apps2-changed', { runId })
    return { ok: out.some(o => o.ok), run: rec, snapshot: snap }
  }

  const recommended = () => (snap ? snap.apps.flatMap(a => a.rec.map(row => ({ row, action: 'apply' }))) : [])
  const tuneRecommended = () => run({ items: recommended() })

  async function undoRun({ runId } = {}) {
    const r = (load().runs || []).find(x => x.id === runId)
    if (!r) return { ok: false, error: 'not-found' }
    const items = r.items.filter(i => i.ok && !i.noop && i.action === 'apply').map(i => ({ row: i.row, action: 'restore' }))
    if (!items.length) return { ok: false, error: 'nothing-to-undo' }
    return run({ items })
  }

  const history = () => { const s = load(); return { runs: s.runs || [], sessions: s.sessions || [], drift: s.driftLog || [] } }

  /** Puts back what an older version changed and this one no longer does. */
  async function migrate() {
    if (!snap) await scan()
    const list = (snap.legacy || []).slice()
    let n = 0, failed = 0
    for (const l of list) {
      let ok = false
      try { ok = deps.legacyRestore ? !!(await deps.legacyRestore(l.id)) : false } catch { ok = false }
      if (ok) n++; else failed++
    }
    await scan()
    emit('apps2-changed', { migrated: n })
    return { ok: failed === 0, migrated: n, failed, snapshot: snap }
  }

  // ── Game time ──────────────────────────────────────────────────────────
  function rulesSet({ enabled, picks } = {}) {
    const s = load()
    if (typeof enabled === 'boolean') s.rules.enabled = enabled
    if (picks && typeof picks === 'object') {
      for (const [id, lv] of Object.entries(picks)) {
        const app = known.BY_ID[id]
        if (!app) continue
        if (lv === null || lv === 'default') { delete s.rules.picks[id]; continue }
        if (rules.LEVELS.includes(lv) && rules.allowed(app).includes(lv)) s.rules.picks[id] = lv
      }
    }
    save(s)
    if (snap) snap = compose(s)
    emit('apps2-changed', { rules: true })
    return { ok: true, gametime: snap ? snap.gametime : null, snapshot: snap }
  }
  const rulesGet = () => { const s = load(); return { enabled: !!s.rules.enabled, picks: s.rules.picks || {} } }

  function sumCpu(items, procs) {
    const pids = new Set(items.map(i => i.pid))
    return Math.round((procs || []).filter(p => pids.has(p.pid)).reduce((t, p) => t + p.cpu, 0) * 10) / 10
  }

  /** Lowers what the plan lists; returns the items that really changed (read back). */
  async function lower(targets, batchId) {
    if (!targets.length) return []
    const reqs = targets.map(t => ({ pid: t.pid, name: t.name, st: t.st, only: ['Normal'], to: 'BelowNormal', eco: t.level === 'quiet' ? 'on' : '' }))
    let res = new Map()
    await deps.runRecorded('apps:gametime', 'apply', { via: 'game-watcher', batchId }, async (ps, cmd, note) => {
      const r = await deps.runPS(actions.priorityScript('set', reqs), 30000)
      res = actions.parsePriority(r && r.out)
      for (const t of targets) {
        const o = res.get(t.pid)
        if (o && o.st === 'SET' && o.b === 'BelowNormal') note({ kind: 'pulse-priority', id: t.pid, name: t.name, st: String(t.st || ''), before: { exists: true, value: o.a }, after: { exists: true, value: o.b } })
      }
    })
    return targets.filter(t => { const o = res.get(t.pid); return o && o.st === 'SET' && o.b === 'BelowNormal' }).map(t => ({ pid: t.pid, name: t.name, st: t.st, app: t.app, level: t.level, eco: t.level === 'quiet' && res.get(t.pid).eco === 'ok' }))
  }

  const planFor = (s, procs, game) => rules.plan(procs, { picks: s.rules.picks, premium: premium(), gameStems: (game && game.stems) || [], enabled: s.rules.enabled })

  async function gameStart(game) {
    const s = load()
    if (!s.rules.enabled) return { ok: true, skipped: 'disabled' }
    if (s.session) return { ok: true, skipped: 'active' }
    const sm = await runSample()
    if (!sm) return { ok: false, error: 'no-sample' }
    const targets = planFor(s, sm.procs, game)
    const items = await lower(targets, 'apps-gt-' + now())
    s.session = { gameId: String((game && game.id) || ''), name: String((game && game.name) || ''), since: now(), items, before: sumCpu(items, sm.procs), last: sumCpu(items, sm.procs), stems: (game && game.stems) || [] }
    save(s)
    startTimer()
    if (snap) snap = compose(s)
    emit('apps2-changed', { gametime: 'start' })
    return { ok: true, lowered: items.length }
  }

  async function sweep() {
    if (sweeping) return { ok: true, skipped: 'busy' }
    sweeping = true
    try {
      const s = load()
      if (!s.session) { stopTimer(); return { ok: true, skipped: 'idle' } }
      if (!safe(() => deps.activeGame(), null)) { sweeping = false; return gameEnd() }
      const sm = await runSample()
      if (!sm) return { ok: false, error: 'no-sample' }
      const have = new Set(s.session.items.map(i => i.pid))
      const targets = planFor(s, sm.procs, { stems: s.session.stems }).filter(t => !have.has(t.pid))
      const add = await lower(targets, 'apps-gt-' + now())
      s.session.items.push(...add)
      s.session.last = sumCpu(s.session.items, sm.procs)
      save(s)
      if (add.length) { if (snap) snap = compose(s); emit('apps2-changed', { gametime: 'sweep', added: add.length }) }
      return { ok: true, added: add.length }
    } finally { sweeping = false }
  }

  async function putBack(items) {
    if (!items.length) return { restored: 0, left: 0, gone: 0 }
    const reqs = items.map(i => ({ pid: i.pid, name: i.name, st: i.st, only: ['BelowNormal'], to: 'Normal', eco: i.eco ? 'reset' : '' }))
    let res = new Map()
    try { const r = await deps.runPS(actions.priorityScript('restore', reqs), 30000); res = actions.parsePriority(r && r.out) } catch { res = new Map() }
    let restored = 0, left = 0, gone = 0
    for (const i of items) { const o = res.get(i.pid); if (!o || o.st === 'GONE') gone++; else if (o.st === 'SET') restored++; else left++ }
    return { restored, left, gone }
  }

  async function gameEnd() {
    const s = load()
    if (!s.session) return { ok: true, skipped: 'idle' }
    stopTimer()
    const sess = s.session
    const r = await putBack(sess.items)
    if (deps.undoControl) { try { await deps.undoControl('apps:gametime') } catch { /* the journal entry is only an audit trail */ } }
    const rec = {
      id: 's' + now(), gameId: sess.gameId, name: sess.name, at: now(), seconds: Math.max(0, Math.round((now() - sess.since) / 1000)),
      apps: [...new Set(sess.items.map(i => i.app))].length, procs: sess.items.length, cpuBefore: sess.before, cpuDuring: sess.last, restored: r.restored, left: r.left, gone: r.gone,
    }
    s.session = null
    s.sessions = [rec, ...(s.sessions || [])].slice(0, MAX_SESSIONS)
    save(s)
    if (snap) snap = compose(s)
    emit('apps2-changed', { gametime: 'end' })
    return { ok: true, session: rec }
  }

  /** At start: a session left by a crash or a power cut is put back (a program that closed or restarted since counts as gone). */
  async function recover() {
    const s = load()
    if (!s.session) return { ok: true, recovered: 0 }
    const r = await putBack(s.session.items)
    s.session = null; save(s)
    return { ok: true, recovered: r.restored }
  }

  function startTimer() {
    stopTimer()
    const si = deps.setInterval || setInterval
    timer = si(() => { sweep().catch(() => {}) }, deps.sweepMs || SWEEP_MS)
    if (timer && timer.unref) timer.unref()
  }
  function stopTimer() { if (timer) { (deps.clearInterval || clearInterval)(timer); timer = null } }
  const shutdown = async () => { stopTimer(); return gameEnd() }

  const state = () => ({ snapshot: snap })
  return { scan, cost, run, tuneRecommended, recommended, undoRun, history, migrate, rulesGet, rulesSet, gameStart, sweep, gameEnd, recover, shutdown, state, busy: () => busy }
}

module.exports = { create, known, catalog, rules, findings, footprint, detect, model }
