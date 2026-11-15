'use strict'
// Games service "Library": scan (launcher registry + curated folder hints + custom games, executables per game, ONE read-only probe),
// run (journaled per-game changes, then READ AGAIN to verify), undo a run, learn executables from running processes, launch, stats.
// Every side effect comes in through `deps`, so tests drive it with fakes.
//   deps: { registry(refresh)->{games:[{id,source,name,install,appid?,aumid?,exe?}]}, bases()->[folder], exists(p)->bool, walk(install)->[{path,size}],
//           runPS(script, ms)->{ok,out}, runCmd(cmd, ms)->{ok,out,code}, runRecorded(control, action, meta, fn(ps,cmd,note)),
//           cpumem:{priority({exe,level}), priorityClear({exe})}, isPremium()->bool, settings()->object, facts()->{hybrid,laptop,build},
//           listLines()->[ "@@exe|fullpath" ], sessions()->[session], launch(spec)->Promise, state:{read(),write(obj)}, emit?(channel, payload),
//           legacyRestore?(knownId)->Promise, now? }
const known = require('./known')
const library = require('./library')
const exes = require('./exes')
const catalog = require('./catalog')
const detect = require('./detect')
const model = require('./model')
const stats = require('./stats')
const findings = require('./findings')
const launchLib = require('../compete/launch')

const DEFAULT_STATE = { exes: {}, hidden: [], fav: [], customs: [], applied: {}, runs: [], last: null }
const MAX_RUNS = 30, WALK_TTL = 10 * 60 * 1000
const slug = id => String(id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)

function create(deps) {
  const now = deps.now || Date.now
  const emit = (ch, p) => { try { deps.emit && deps.emit(ch, p) } catch { /* best effort */ } }
  const load = () => ({ ...JSON.parse(JSON.stringify(DEFAULT_STATE)), ...(deps.state.read() || {}) })
  const save = s => { try { deps.state.write(s) } catch { /* best effort */ } }
  const premium = () => { try { return deps.isPremium ? deps.isPremium() === true : false } catch { return false } }
  const safe = (fn, d) => { try { return fn() } catch { return d } }
  const walkCache = new Map()
  let busy = false, snap = null

  async function buildLibrary(refresh) {
    const s = load()
    let reg = []
    try { reg = ((await deps.registry(!!refresh)) || {}).games || [] } catch { reg = [] }
    const hints = library.hintPaths(safe(() => deps.bases(), []), p => safe(() => deps.exists(p), false))
    return library.build({ registry: reg, hints, customs: (s.customs || []).map(p => ({ path: p })), prefs: { hidden: s.hidden, fav: s.fav, exes: {} } })
  }

  // Folder walks are the slow part of a scan. They run one game at a time with a yield in between (the app stays responsive) and are cached.
  const filesOf = g => { const hit = g.install ? walkCache.get(g.install) : null; return hit ? hit.files : [] }
  async function prefetch(lib) {
    for (const g of lib) {
      if (!g.install) continue
      const hit = walkCache.get(g.install)
      if (hit && now() - hit.t < WALK_TTL) continue
      let files = []
      try { files = (await deps.walk(g.install)) || [] } catch { files = [] }
      walkCache.set(g.install, { t: now(), files })
      await new Promise(r => setImmediate(r))
    }
  }

  function exeListFor(g, s) {
    const mem = s.exes[g.id] || {}
    return exes.locate(g, filesOf(g), { picked: mem.picked, learned: mem.learned })
  }

  async function probe(paths) {
    const list = [...new Set(paths)]
    if (!list.length) return { byPath: {}, throttle: { read: false, text: '' } }
    let r = null
    try { r = await deps.runPS(detect.buildScript(list), 60000) } catch { r = null }
    return r && r.out ? detect.parse(r.out) : null
  }

  function compose(lib, s, parsed, running) {
    const facts = safe(() => deps.facts(), {}) || {}
    const settings = safe(() => deps.settings(), {}) || {}
    const prem = premium()
    const models = {}, games = []
    for (const g of lib) {
      const exeList = exeListFor(g, s)
      const applied = s.applied[g.id] || {}
      const remembered = Object.fromEntries(Object.keys(applied).map(r => [r, 'applied']))
      const m = model.buildGame({ game: g, exeList, parsed, remembered, facts, premium: prem })
      models[g.id] = m
      games.push({ ...g, model: m, legacy: g.knownId ? settings['tweak_game-' + g.knownId] === 'applied' && !Object.keys(applied).length : false, running: running.includes(g.id) })
    }
    const names = Object.fromEntries(lib.map(g => [g.id, g.name]))
    const legacy = games.filter(g => g.legacy).map(g => g.id)
    const runId = running[0] || null
    const finds = findings.compute({ totals: model.totals(models), models, names, legacy, running: runId, premium: prem })
    const totals = model.totals(models)
    const st = stats.byGame(lib, safe(() => deps.sessions(), []) || [])
    const impacts = {}
    for (const g of lib) { const ap = s.applied[g.id]; const at = ap ? Math.min(...Object.values(ap)) : 0; impacts[g.id] = stats.impact(st[g.id], at) }
    const statOut = {}
    for (const [id, v] of Object.entries(st)) statOut[id] = { sessions: v.sessions, seconds: v.seconds, last: v.last, avgFps: v.avgFps, low1Fps: v.low1Fps, trend: v.trend }
    return {
      games, totals, findings: finds, verdict: findings.verdict({ totals, findings: finds, running: runId, names, premium: prem }), facts, premium: prem,
      stats: statOut, impacts, fav: s.fav, lastPlayed: s.lastPlayed || {}, when: now(), read: !!parsed, throttleRead: !!(parsed && parsed.throttle.read),
      watcher: safe(() => deps.settings().gameWatcherEnabled === true, false), autoPulse: safe(() => deps.settings().autoPulseEnabled === true, false),
    }
  }

  async function runningIds(lib) {
    const lines = await Promise.resolve().then(() => deps.listLines()).catch(() => [])
    const out = []
    for (const g of lib) if (g.install || g.custom) { if (exes.learn(g, lines || [])) out.push(g.id) }
    return out
  }

  async function scan({ refresh } = {}) {
    if (busy && snap) return snap
    busy = true
    try {
      let lib = await buildLibrary(refresh)
      const s = load()
      await prefetch(lib)
      lib = lib.filter(g => g.source !== 'other' || filesOf(g).length)   // a Riot / Rockstar folder with no program in it is a leftover, not a game
      const paths = []
      for (const g of lib) for (const e of exeListFor(g, s)) paths.push(e.path)
      const parsed = await probe(paths)
      const running = await runningIds(lib)
      snap = compose(lib, s, parsed, running)
      snap.libraryAt = now()
      const s2 = load(); s2.last = { when: snap.when, totals: snap.totals }; save(s2)
      return snap
    } finally { busy = false }
  }

  const find = (id) => (snap ? snap.games.find(g => g.id === id || g.aliases.includes(id)) : null)

  /** items: [{ gameId, row, action: 'apply'|'restore' }] -> { ok, run, snapshot } */
  async function run({ items } = {}) {
    if (!premium()) return { ok: false, error: 'premium_required' }
    if (!Array.isArray(items) || !items.length || items.length > 200) return { ok: false, error: 'invalid_items' }
    if (!snap) await scan()
    const runId = 'g' + now()
    const batchId = 'games-' + now()
    const parsed0 = await probe(snap.games.flatMap(g => exes.trusted(g.model.exes).map(e => e.path)))
    const out = []
    const s = load()
    for (const it of items) {
      const g = find(it.gameId), row = catalog.byId[it.row]
      const on = it.action !== 'restore'
      if (!g || !row) { out.push({ gameId: String(it.gameId), row: String(it.row), action: on ? 'apply' : 'restore', ok: false, reason: 'unknown' }); continue }
      const trusted = exes.trusted(g.model.exes)
      if (!trusted.length) { out.push({ gameId: g.id, row: row.id, action: on ? 'apply' : 'restore', ok: false, reason: 'noexe' }); continue }
      let ok = true, reason = null
      for (const e of trusted) {
        try {
          const live = detect.evaluate(parsed0, e.path)[row.id]
          if (row.id === 'priority') {
            if (on && live.state === 'other') { ok = false; reason = 'elsewhere'; continue }
            const r = on ? await deps.cpumem.priority({ exe: e.exe, level: 'high' }) : await deps.cpumem.priorityClear({ exe: e.exe })
            if (r && r.ok === false) { ok = false; reason = r.error || 'failed' }
          } else if (row.id === 'throttle') {
            const r = await deps.runCmd(catalog.throttleCmd(e.path, on), 15000)
            if (!r || r.ok === false) { ok = false; reason = 'failed' }
          } else {
            const before = (parsed0 && parsed0.byPath[e.path.toLowerCase()]) || {}
            const lines = catalog.regLines(row.id, e.path, on, before)
            await deps.runRecorded(`games:${slug(g.id)}:${row.id}`, 'apply', { via: 'manual', batchId }, async ps => { for (const l of lines) await ps(l) })
          }
        } catch (err) { ok = false; reason = 'error' }
      }
      out.push({ gameId: g.id, name: g.name, row: row.id, action: on ? 'apply' : 'restore', ok, reason })
    }
    // Read it again: a row is only "applied" when Windows says so.
    const parsed1 = await probe(snap.games.flatMap(g => exes.trusted(g.model.exes).map(e => e.path)))
    for (const o of out) {
      if (!o.ok) continue
      const g = find(o.gameId)
      const states = exes.trusted(g.model.exes).map(e => detect.evaluate(parsed1, e.path)[o.row].state)
      const want = o.action === 'apply' ? 'all' : 'none'
      o.verified = states.every(x => x === want)
      if (states.some(x => x === 'unread')) o.verified = null          // could not be read back (needs elevation): reported as such
      else if (!o.verified) { o.ok = false; o.reason = 'not-verified' }
      s.applied[g.id] = s.applied[g.id] || {}
      if (o.ok && o.action === 'apply') s.applied[g.id][o.row] = now()
      if (o.ok && o.action === 'restore') delete s.applied[g.id][o.row]
    }
    const rec = { id: runId, at: now(), batchId, items: out }
    s.runs = [rec, ...(s.runs || [])].slice(0, MAX_RUNS)
    save(s)
    const lib = snap.games
    snap = compose(lib, s, parsed1, snap.games.filter(g => g.running).map(g => g.id))
    emit('games2-changed', { runId })
    return { ok: out.some(o => o.ok), run: rec, snapshot: snap }
  }

  /** Everything recommended and still open, for the stage's one action. */
  function recommended() {
    if (!snap) return []
    return snap.games.flatMap(g => g.model.recIds.map(row => ({ gameId: g.id, row })))
  }
  const tuneAll = () => run({ items: recommended().map(i => ({ ...i, action: 'apply' })) })

  async function undoRun({ runId } = {}) {
    const r = (load().runs || []).find(x => x.id === runId)
    if (!r) return { ok: false, error: 'not-found' }
    const items = r.items.filter(i => i.ok && i.action === 'apply').map(i => ({ gameId: i.gameId, row: i.row, action: 'restore' }))
    if (!items.length) return { ok: false, error: 'nothing-to-undo' }
    return run({ items })
  }

  const history = () => ({ runs: load().runs || [] })

  // ── library edits
  async function addCustom({ path: p } = {}) {
    if (!launchLib.validExePath(p) || !exes.SAFE(p)) return { ok: false, error: 'bad-exe' }
    const s = load(); if (!s.customs.includes(p)) s.customs.push(p); save(s)
    walkCache.clear()
    return { ok: true, id: 'custom:' + p, snapshot: await scan() }
  }
  async function removeCustom({ id } = {}) {
    const s = load(); s.customs = s.customs.filter(p => 'custom:' + p !== id); save(s)
    return { ok: true, snapshot: await scan() }
  }
  function setList(key, id, on) {
    const s = load(); const set = new Set(s[key] || []); on ? set.add(id) : set.delete(id); s[key] = [...set]; save(s)
    if (snap) { const g = find(id); if (g) { g[key === 'fav' ? 'favorite' : 'hidden'] = !!on; snap.fav = s.fav } }
    return { ok: true }
  }
  const favorite = ({ id, on } = {}) => setList('fav', String(id), on !== false)
  const hide = async ({ id, on } = {}) => { const r = setList('hidden', String(id), on !== false); await scan(); return { ...r, snapshot: snap } }
  async function pickExe({ gameId, path: p } = {}) {
    if (!exes.SAFE(p)) return { ok: false, error: 'bad-exe' }
    const g = find(gameId); if (!g) return { ok: false, error: 'unknown-game' }
    const s = load(); const m = s.exes[g.id] || (s.exes[g.id] = { picked: [], learned: [] })
    if (!m.picked.includes(p)) m.picked.push(p); save(s)
    return { ok: true, snapshot: await scan() }
  }
  /** The user confirms the executable Jylli found by guessing (the biggest likely file in the folder): it becomes "picked". */
  async function useExe({ gameId, path: p } = {}) {
    const g = find(gameId); if (!g) return { ok: false, error: 'unknown-game' }
    if (!(g.model.exes || []).some(e => e.path === p) || !exes.SAFE(p)) return { ok: false, error: 'bad-exe' }
    return pickExe({ gameId: g.id, path: p })
  }
  /** The watcher / Competitive Mode saw this process running from a game's folder: remember it as that game's executable. */
  async function learn(lines) {
    if (!snap) return { ok: false }
    const s = load(); let changed = false
    for (const g of snap.games) {
      if (!g.install && !g.custom) continue
      const hit = exes.learn(g, lines || [])
      if (!hit || !exes.SAFE(hit.path)) continue
      const m = s.exes[g.id] || (s.exes[g.id] = { picked: [], learned: [] })
      if (!m.learned.includes(hit.path) && !m.picked.includes(hit.path) && !(g.model.exes || []).some(e => e.path.toLowerCase() === hit.path.toLowerCase() && e.source !== 'guess')) { m.learned.push(hit.path); changed = true }
    }
    if (changed) { save(s); emit('games2-changed', { learned: true }) }
    return { ok: true, changed }
  }

  async function launch({ gameId } = {}) {
    const g = find(gameId)
    if (!g) return { ok: false, error: 'unknown-game' }
    const spec = g.custom ? (launchLib.validExePath(g.id.slice(7)) ? { kind: 'exe', exe: g.id.slice(7), cwd: g.install } : null) : launchLib.launchFor({ id: g.id, aumid: g.aumid })
    if (!spec) return { ok: false, error: 'cannot-launch' }
    try { await deps.launch(spec) } catch { return { ok: false, error: 'launch-failed' } }
    const s = load(); s.lastPlayed = { ...(s.lastPlayed || {}), [g.id]: now() }; save(s)
    return { ok: true }
  }

  /** Games that still carry the old profile (it added a Defender exclusion and global MMCSS / Game DVR writes): put those back, then offer the new rows. */
  async function migrate() {
    if (!premium()) return { ok: false, error: 'premium_required' }
    if (!snap) await scan()
    const legacy = snap.games.filter(g => g.legacy && g.knownId)
    if (!legacy.length) return { ok: true, migrated: 0, snapshot: snap }
    let n = 0
    for (const g of legacy) { try { if (deps.legacyRestore) { await deps.legacyRestore(g.knownId, g.install); n++ } } catch { /* reported by count */ } }
    await scan()
    return { ok: true, migrated: n, snapshot: snap }
  }

  const lastPlayed = () => load().lastPlayed || {}
  const state = () => ({ snapshot: snap, lastPlayed: lastPlayed() })

  /**
   * What the Game Watcher may recognise besides the curated list: library games whose executable is trusted (picked, learned or known on disk,
   * never a guess). A curated game only contributes the executables the user picked or Jylli learned (the rest is already in known.js).
   */
  function watchTargets() {
    const out = []
    if (!snap) return out
    for (const g of snap.games || []) {
      const list = exes.trusted((g.model && g.model.exes) || []).filter(e => !g.knownId || e.source === 'picked' || e.source === 'learned')
      const files = [...new Set(list.map(e => e.exe).filter(Boolean))]
      if (!files.length) continue
      out.push({ id: g.knownId || g.id, name: g.name, exes: files, source: g.custom ? 'custom' : 'library' })
    }
    return out
  }

  return { scan, run, tuneAll, recommended, undoRun, history, addCustom, removeCustom, favorite, hide, pickExe, useExe, learn, launch, migrate, state, find, watchTargets, busy: () => busy }
}

module.exports = { create, slug, known }
