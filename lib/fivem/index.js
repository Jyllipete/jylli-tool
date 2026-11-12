'use strict'
// FiveM service. create(deps) -> the object the main process wires to IPC. Everything with a side effect comes in through deps
// so tests drive it with fakes:
//   runPS(script, ms) -> { ok, out, err }          runRecorded(control, action, meta, fn(ps, cmd, note)) -> fn's result (change journal)
//   undoControl(control) -> result                  state: { read(), write(v) }            now?()
//   fs, path, env                                   isAdmin() -> bool                      isFivemRunning() -> Promise<bool>
//   vramMB() -> number|null                         cleanCache() -> Promise<{ ok, ... }>   recorder: { list(), get(id) }
//   transport: { getJson, tcp, lookup4 }            spawn(cmd, args, opts)                 emit(channel, payload)
//   backupDir, sessionsDir                          legacyState() -> [ids still marked applied]   legacyRestore(id) -> Promise<{ ok }>
const crypto = require('crypto')
const Ini = require('./ini')
const Gfx = require('./graphics')
const Cat = require('./catalog')
const Srv = require('./server')
const Rt = require('./route')
const Verdict = require('./route-verdict')
const Attr = require('./attribution')
const Sig = require('./signatures')
const Mods = require('./mods')
const Ready = require('./readiness')
const Loc = require('./locate')
const Sess = require('./session')

const MAX_SERVERS = 12
const MAX_BACKUPS = 40
const DEFAULT_STATE = { v: 1, last: null, servers: [], active: null, imported: false }
const CACHE_DIRS = [['browser', ['cache', 'browser']], ['subprocess', ['cache', 'subprocess']], ['private', ['server-cache-priv']], ['nui', ['nui-storage']]]

function create(deps) {
  const now = deps.now || Date.now
  const { fs, path } = deps
  const send = (ch, p) => { try { deps.emit && deps.emit(ch, p) } catch { /* window closed */ } }
  const sessions = Sess.create({ fs, path, dir: deps.sessionsDir, now, tcp: deps.transport.tcp })
  let routeState = null, routeMeta = null, lastTcp, tcpTimer = null, busy = false
  const poller = Rt.create({ spawn: deps.spawn, onRound: onRound })

  // A fresh copy every time: the default's arrays must never be shared with (or mutated through) a caller.
  const read = () => { let s = null; try { s = deps.state.read() } catch { s = null } const o = { ...DEFAULT_STATE, ...(s || {}) }; o.servers = Array.isArray(o.servers) ? o.servers.map(x => ({ ...x })) : []; return o }
  const write = s => { try { deps.state.write(s) } catch { /* disk full or locked */ } }
  const locate = () => Loc.locate({ fs, path, env: deps.env, runPS: deps.runPS, readIni: Ini.read })

  // ── servers ─────────────────────────────────────────────────────────────────────
  const sid = (host, port) => crypto.createHash('sha1').update(host + ':' + port).digest('hex').slice(0, 8)
  const publicServer = s => ({ id: s.id, host: s.host, port: s.port, name: s.name || null, code: s.code || null })

  function servers() { const st = read(); return { ok: true, servers: st.servers.map(publicServer), active: st.active } }

  async function serverAdd(input) {
    const d = await Srv.describe(deps.transport, input)
    if (!d.ok) return d
    const st = read()
    const id = sid(d.host, d.port)
    const row = { id, host: d.host, port: d.port, name: d.name, code: d.code || null, added: now() }
    const i = st.servers.findIndex(s => s.id === id)
    if (i >= 0) st.servers[i] = { ...st.servers[i], ...row, added: st.servers[i].added }
    else { if (st.servers.length >= MAX_SERVERS) return { ok: false, error: 'too-many' }; st.servers.push(row) }
    if (!st.active) st.active = id
    write(st)
    return { ok: true, server: publicServer(row), live: { players: d.players, max: d.max, mapName: d.mapName, reachable: d.reachable, httpMs: d.httpMs }, ...servers() }
  }
  function serverRemove(id) {
    const st = read()
    st.servers = st.servers.filter(s => s.id !== id)
    if (st.active === id) st.active = st.servers[0] ? st.servers[0].id : null
    write(st)
    if (routeMeta && routeMeta.id === id) routeStop()
    return servers()
  }
  function serverUse(id) { const st = read(); if (st.servers.some(s => s.id === id)) { st.active = id; write(st) } return servers() }
  async function serverLive(id) {
    const s = read().servers.find(x => x.id === id)
    if (!s) return { ok: false, error: 'unknown' }
    const live = await Srv.readServer(deps.transport, s.host, s.port)
    return live.ok ? { ok: true, name: live.name, players: live.players, max: live.max, mapName: live.mapName, httpMs: live.httpMs } : { ok: false, error: 'no-answer' }
  }
  /** One-time move of the old tab's bookmarks (browser storage) into the saved servers: no network, validated like any input. */
  function importBookmarks(list) {
    const st = read()
    if (st.imported) return servers()
    for (const b of (Array.isArray(list) ? list : []).slice(0, MAX_SERVERS)) {
      const t = Srv.parseTarget(`${b && b.host}:${b && b.port}`)
      if (!t || t.kind !== 'host' || st.servers.length >= MAX_SERVERS) continue
      const id = sid(t.host, t.port)
      if (!st.servers.some(s => s.id === id)) st.servers.push({ id, host: t.host, port: t.port, name: Srv.clean(b.name), code: /^[a-z0-9]{3,12}$/i.test(String(b.cfxCode || '')) ? String(b.cfxCode).toLowerCase() : null, added: now() })
    }
    if (!st.active && st.servers[0]) st.active = st.servers[0].id
    st.imported = true
    write(st)
    return servers()
  }

  // ── route radar ─────────────────────────────────────────────────────────────────
  function onRound(round) {
    if (!routeState) return
    const r = { ...round, tcp: lastTcp }
    Verdict.ingest(routeState, r)
    send('fivem2-route', { id: routeMeta && routeMeta.id, round: r })
  }
  function routeStop() {
    poller.stop()
    if (tcpTimer) { clearInterval(tcpTimer); tcpTimer = null }
    routeState = null; routeMeta = null; lastTcp = undefined
    return { ok: true }
  }
  async function routeStart(id) {
    const s = read().servers.find(x => x.id === id)
    if (!s) return { ok: false, error: 'unknown' }
    routeStop()
    const ip = await deps.transport.lookup4(s.host)
    if (!ip) return { ok: false, error: 'dns' }
    routeState = Verdict.create(); routeMeta = { id, host: s.host, port: s.port, ip }
    const st = poller.start(ip)
    if (!st.ok) { routeState = null; routeMeta = null; return st }
    const probe = async () => { const v = await deps.transport.tcp(s.host, s.port, 1500); lastTcp = typeof v === 'number' ? v : null }
    probe(); tcpTimer = setInterval(probe, 1000)
    return { ok: true, id, ip, port: s.port }
  }
  function routeSnapshot() { return { ok: true, running: poller.running, meta: routeMeta, state: routeState } }
  async function mtu(id) {
    const s = read().servers.find(x => x.id === id)
    if (!s) return { ok: false, error: 'unknown' }
    const ip = await deps.transport.lookup4(s.host)
    if (!ip) return { ok: false, error: 'dns' }
    const r = await deps.runPS(Rt.mtuScript(ip), 45000)
    const v = Rt.parseMtu(r && r.out)
    return v ? { ok: true, mtu: v } : { ok: false, error: 'no-answer' }
  }

  // ── scan ────────────────────────────────────────────────────────────────────────
  function dirSize(dir, budgetMs = 1500) {
    const t0 = Date.now(); let bytes = 0, n = 0
    const stack = [dir]
    while (stack.length) {
      const d = stack.pop()
      let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }) } catch { continue }
      for (const e of ents) {
        const p = path.join(d, e.name)
        if (e.isDirectory()) stack.push(p)
        else { try { bytes += fs.statSync(p).size } catch { /* gone */ } n++ }
        if ((n & 255) === 0 && Date.now() - t0 > budgetMs) return bytes
      }
    }
    return bytes
  }

  async function scan() {
    if (busy) return { ok: false, error: 'busy' }
    busy = true
    try {
      send('fivem2-progress', { kind: 'scan', step: 'locate' })
      const loc = await locate()
      const running = await deps.isFivemRunning().catch(() => false)
      const ini = loc.iniText ? Ini.read(loc.iniText) : null
      let gfx = null
      if (loc.settingsExists) { try { const g = Gfx.read(fs.readFileSync(loc.settingsPath, 'utf8')); gfx = { structure: g.structure, values: g.values, load: Gfx.load(g.values) } } catch { gfx = null } }
      send('fivem2-progress', { kind: 'scan', step: 'state' })
      let applied = null
      if (loc.installed) { const r = await deps.runPS(Cat.probeScript({ exes: loc.exes, appDir: loc.appDir }), 20000); applied = Cat.parseProbe(r && r.out) }
      const tweaks = Cat.IDS.map(id => ({ ...Cat.meta(id), applied: applied ? applied[id] === true : null }))
      send('fivem2-progress', { kind: 'scan', step: 'files' })
      const folders = loc.installed ? CACHE_DIRS.map(([key, parts]) => ({ key, mb: Math.round(dirSize(path.join(loc.dataDir, ...parts)) / 1048576) })) : []
      const cacheMB = folders.reduce((n, f) => n + f.mb, 0)
      const mods = loc.installed ? Mods.scan({ fs, path }, { plugins: [path.join(loc.appDir, 'plugins'), path.join(loc.appDir, 'addons')], gta: loc.gtaOk ? loc.gtaPath : null }).found : []
      const vramMB = deps.vramMB ? deps.vramMB() : null
      const iniv = ini ? Object.fromEntries(ini.known.map(k => [k.key, k.value])) : {}
      const route = routeState ? Verdict.analyze(routeState).verdict : null
      const readiness = Ready.evaluate({
        installed: loc.installed, gtaOk: loc.gtaOk, gtaPath: loc.gtaPath, running, settingsExists: loc.settingsExists,
        channel: iniv.UpdateChannel || null, fullDump: iniv.EnableFullMemoryDump === '1',
        textureQuality: gfx && gfx.values.TextureQuality, textureLimit: vramMB ? Gfx.textureLimit(vramMB) : null, vramMB,
        mods, cacheMB: loc.installed ? cacheMB : null, route,
      })
      const st = read()
      const report = {
        v: 1, at: now(), admin: !!(deps.isAdmin && deps.isAdmin()), running,
        loc: { installed: loc.installed, gtaOk: loc.gtaOk, gtaPath: loc.gtaPath, gtaSource: loc.gtaSource, iniExists: loc.iniExists, settingsExists: loc.settingsExists, exes: loc.exes.map(p => path.basename(p)) },
        ini, gfx: gfx && { ...gfx, vramMB, textureLimit: vramMB ? Gfx.textureLimit(vramMB) : null }, tweaks, cache: { mb: cacheMB, folders }, mods,
        findings: readiness.findings, passed: readiness.passed, legacy: legacy().legacy,
      }
      st.last = { at: report.at, installed: loc.installed }
      write(st)
      send('fivem2-progress', { kind: 'scan', step: 'done' })
      return { ok: true, report, ...servers() }
    } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 160) } } finally { busy = false }
  }

  // ── changes (every one journaled) ───────────────────────────────────────────────
  const batch = () => crypto.randomBytes(6).toString('hex')

  async function apply(id) {
    const t = Cat.get(id)
    if (!t) return { ok: false, error: 'unknown' }
    if (t.admin && !(deps.isAdmin && deps.isAdmin())) return { ok: false, id, error: 'admin-required' }
    const loc = await locate()
    if (!loc.installed) return { ok: false, id, error: 'not-installed' }
    const batchId = batch()
    try {
      const res = await deps.runRecorded('fivem2:' + id, 'apply', { via: 'manual', batchId }, (ps, cmd, note) => t.apply({ exes: loc.exes, appDir: loc.appDir }, { ps, cmd, note }, deps))
      return { ok: !!(res && res.ok), id, error: res && res.ok ? null : (res && res.error) || 'failed', batchId }
    } catch (e) { return { ok: false, id, error: String((e && e.message) || e).slice(0, 160) } }
  }
  async function undo(id) {
    if (!(Cat.get(id) || id === 'ini' || id === 'gfx')) return { ok: false, error: 'unknown' }
    try { const r = await deps.undoControl('fivem2:' + id); return { ok: !r || r.ok !== false, result: r || null } } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 160) } }
  }

  function backup(file) {
    fs.mkdirSync(deps.backupDir, { recursive: true })
    const dest = path.join(deps.backupDir, new Date(now()).toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(2).toString('hex') + '-' + path.basename(file))
    fs.copyFileSync(file, dest)
    try { const all = fs.readdirSync(deps.backupDir).map(f => ({ f, t: fs.statSync(path.join(deps.backupDir, f)).mtimeMs })).sort((a, b) => b.t - a.t); for (const o of all.slice(MAX_BACKUPS)) fs.unlinkSync(path.join(deps.backupDir, o.f)) } catch { /* keep going */ }
    return dest
  }

  /** read -> patch -> back up -> temp file + rename -> verify -> journal. Nothing is written when nothing changes. */
  async function writeFile({ control, file, patchFn, verify }) {
    if (await deps.isFivemRunning().catch(() => false)) return { ok: false, error: 'game-running' }
    let text
    try { text = fs.readFileSync(file, 'utf8') } catch { return { ok: false, error: 'no-file' } }
    const p = patchFn(text)
    if (!p.ok) return p
    if (!p.changed.length || p.text === text) return { ok: true, changed: [], rejected: p.rejected || [] }
    const batchId = batch()
    let failure = null
    await deps.runRecorded(control, 'apply', { via: 'manual', batchId }, async (ps, cmd, note) => {
      const bak = backup(file)
      const tmp = file + '.jt-tmp'
      try {
        fs.writeFileSync(tmp, p.text, 'utf8')
        fs.renameSync(tmp, file)
        if (!verify(fs.readFileSync(file, 'utf8'))) { fs.copyFileSync(bak, file); failure = 'verify-failed'; return }
      } catch (e) { try { fs.unlinkSync(tmp) } catch { /* none */ } try { fs.copyFileSync(bak, file) } catch { /* keep */ } failure = 'write-failed'; return }
      const sha = f => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex')
      note({ kind: 'fivem-file', file, backup: bak, before: { exists: true, value: sha(bak) }, after: { exists: true, value: sha(file) } })
    })
    return failure ? { ok: false, error: failure } : { ok: true, changed: p.changed, rejected: p.rejected || p.skipped || [], batchId }
  }

  async function iniWrite(changes) {
    const loc = await locate()
    if (!loc.iniExists) return { ok: false, error: 'no-file' }
    return writeFile({ control: 'fivem2:ini', file: loc.iniPath, patchFn: t => Ini.patch(t, changes), verify: t => Ini.parse(t).sections.length > 0 })
  }
  async function gfxWrite(changes) {
    const loc = await locate()
    if (!loc.settingsExists) return { ok: false, error: 'no-file' }
    return writeFile({
      control: 'fivem2:gfx', file: loc.settingsPath,
      patchFn: t => { if (!Gfx.read(t).structure) return { ok: false, error: 'corrupt' }; const p = Gfx.patch(t, changes); return { ok: true, ...p } },
      verify: t => Gfx.read(t).structure,
    })
  }
  /** Preview only: the values a preset would write for keys this file has. The page shows the diff, then calls gfxWrite. */
  async function gfxPreset(name) {
    if (!['performance', 'balanced', 'quality'].includes(name)) return { ok: false, error: 'unknown' }
    const loc = await locate()
    if (!loc.settingsExists) return { ok: false, error: 'no-file' }
    const g = Gfx.read(fs.readFileSync(loc.settingsPath, 'utf8'))
    if (!g.structure) return { ok: false, error: 'corrupt' }
    return { ok: true, changes: Gfx.preset(name, g.values, deps.vramMB ? deps.vramMB() : null), current: g.values }
  }

  // ── cache, mods, logs, legacy ───────────────────────────────────────────────────
  async function cacheClear() {
    if (await deps.isFivemRunning().catch(() => false)) return { ok: false, error: 'game-running' }
    return deps.cleanCache()
  }
  async function mods() {
    const loc = await locate()
    if (!loc.installed) return { ok: false, error: 'not-installed' }
    return { ok: true, ...Mods.scan({ fs, path }, { plugins: [path.join(loc.appDir, 'plugins'), path.join(loc.appDir, 'addons')], gta: loc.gtaOk ? loc.gtaPath : null }) }
  }
  async function logs() {
    const loc = await locate()
    let files = []
    try { files = fs.readdirSync(loc.logsDir).filter(f => /^CitizenFX.*\.log$/i.test(f)).map(f => ({ f, t: fs.statSync(path.join(loc.logsDir, f)).mtimeMs })).sort((a, b) => b.t - a.t) } catch { files = [] }
    if (!files.length) return { ok: false, error: 'no-log' }
    const file = path.join(loc.logsDir, files[0].f)
    let text
    try {
      const size = fs.statSync(file).size, want = 262144
      const fd = fs.openSync(file, 'r')
      try { const buf = Buffer.alloc(Math.min(size, want)); fs.readSync(fd, buf, 0, buf.length, Math.max(0, size - buf.length)); text = buf.toString('utf8') } finally { fs.closeSync(fd) }
    } catch { return { ok: false, error: 'unreadable' } }
    const lines = Sig.parse(text)
    return { ok: true, file: files[0].f, at: files[0].t, lines, found: Sig.scan(lines) }
  }
  function legacy() { let ids = []; try { ids = deps.legacyState() } catch { ids = [] } return { ok: true, legacy: ids.filter(i => Cat.LEGACY.includes(i)) } }
  async function legacyRestore(id) {
    if (!Cat.LEGACY.includes(id)) return { ok: false, error: 'unknown' }
    try { const r = await deps.legacyRestore(id); return { ok: !r || r.ok !== false, id } } catch (e) { return { ok: false, id, error: String((e && e.message) || e).slice(0, 160) } }
  }

  // ── sessions ────────────────────────────────────────────────────────────────────
  const isFiveM = g => !!g && /fivem|gta/i.test(String(g.id || '') + ' ' + String(g.name || ''))
  function gameStarted() {
    const st = read(), s = st.servers.find(x => x.id === st.active)
    return s ? sessions.begin(s) : { ok: false, error: 'no-server' }
  }
  function gameEnded() { return sessions.end() }
  function sessionList() {
    const net = sessions.list()
    const rows = (deps.recorder.list() || []).filter(r => isFiveM(r.game)).map(r => {
      const n = net.find(x => Sess.join(x, [r]))
      return { id: r.id, startedAt: r.startedAt, durationSec: r.durationSec, summary: r.summary, hasTelemetry: !!r.hasTelemetry, server: n ? n.server : null, hasNet: !!n }
    })
    return { ok: true, sessions: rows }
  }
  function session(id) {
    const got = deps.recorder.get(id)
    const rec = got && got.session ? got.session : got
    if (!rec || !Array.isArray(rec.bins)) return { ok: false, error: 'unknown' }
    const netRow = sessions.list().find(x => Sess.join(x, [{ startedAt: rec.startedAt, durationSec: rec.durationSec }]))
    const netFull = netRow ? sessions.get(netRow.id) : null
    const analysis = Attr.analyze({ ...rec, net: netFull ? netFull.net : null })
    return {
      ok: true,
      session: { id: rec.id, startedAt: rec.startedAt, durationSec: rec.durationSec, bins: rec.bins, series: rec.series, seconds: rec.seconds, summary: rec.summary, hist: rec.hist, edges: rec.edges },
      net: netFull ? { server: netFull.server, rtt: netFull.net.rtt, offsetSec: Math.round((netFull.startedAt - rec.startedAt) / 1000) } : null,
      analysis,
    }
  }

  function cached() { const st = read(); return { ok: true, last: st.last, ...servers() } }
  function shutdown() { routeStop(); sessions.end() }

  return {
    scan, cached, servers, serverAdd, serverRemove, serverUse, serverLive, importBookmarks,
    routeStart, routeStop, routeSnapshot, mtu,
    apply, undo, iniWrite, gfxWrite, gfxPreset, cacheClear, mods, logs, legacy, legacyRestore,
    gameStarted, gameEnded, sessionList, session, shutdown,
    handlers: () => Cat.handlers(deps),
    get trackingSession() { return sessions.active },
  }
}

module.exports = { create, DEFAULT_STATE, ini: Ini, LEGACY: Cat.LEGACY }
