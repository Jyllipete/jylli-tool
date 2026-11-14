'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { EventEmitter } = require('events')
const Fivem = require('../lib/fivem')
const Cat = require('../lib/fivem/catalog')
const Srv = require('../lib/fivem/server')
const Rt = require('../lib/fivem/route')
const Mods = require('../lib/fivem/mods')
const Sig = require('../lib/fivem/signatures')
const Sess = require('../lib/fivem/session')

const INI = '[Game]\r\nIVPath=GTAPATH\r\nUpdateChannel=production\r\nDisableNVSP=0\r\n'
const XML = '<?xml version="1.0"?>\n<Settings>\n  <graphics>\n    <TextureQuality value="3" />\n    <MSAA value="4" />\n    <LodScale value="1.000000" />\n  </graphics>\n</Settings>\n'

/** A temp "PC": FiveM installed (unless opts.bare), GTA folder with GTA5.exe, settings file, one mod file. */
function pc(opts = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jt-fivem-'))
  const local = path.join(root, 'Local'), roam = path.join(root, 'Roaming'), gta = path.join(root, 'GTA V')
  const app = path.join(local, 'FiveM', 'FiveM.app')
  if (!opts.bare) {
    fs.mkdirSync(path.join(app, 'data', 'cache', 'browser'), { recursive: true })
    fs.mkdirSync(path.join(app, 'data', 'cache', 'game'), { recursive: true })
    fs.writeFileSync(path.join(app, 'data', 'cache', 'browser', 'a.bin'), Buffer.alloc(2 * 1048576))
    fs.mkdirSync(path.join(app, 'plugins'), { recursive: true })
    fs.writeFileSync(path.join(app, 'plugins', 'ScriptHookV.dll'), 'x')
    fs.writeFileSync(path.join(app, 'FiveM.exe'), 'x'); fs.writeFileSync(path.join(app, 'FiveM_b3258_GTAProcess.exe'), 'x'); fs.writeFileSync(path.join(app, 'readme.txt'), 'x')
    fs.mkdirSync(gta, { recursive: true }); fs.writeFileSync(path.join(gta, 'GTA5.exe'), 'x')
    fs.writeFileSync(path.join(app, 'CitizenFX.ini'), INI.replace('GTAPATH', gta))
    fs.mkdirSync(path.join(roam, 'CitizenFX'), { recursive: true })
    fs.writeFileSync(path.join(roam, 'CitizenFX', 'gta5_settings.xml'), XML)
  }
  return { root, local, roam, gta, app, ini: path.join(app, 'CitizenFX.ini'), xml: path.join(roam, 'CitizenFX', 'gta5_settings.xml') }
}

function harness(opts = {}) {
  const p = pc(opts)
  const log = { rec: [], cmds: [], ps: [], emitted: [], undone: [], spawned: [] }
  let stateObj = null
  const spawn = () => { const proc = new EventEmitter(); proc.stdout = new EventEmitter(); proc.killed = false; proc.kill = () => { proc.killed = true }; log.spawned.push(proc); return proc }
  const deps = {
    fs, path, env: { LOCALAPPDATA: p.local, APPDATA: p.roam },
    runPS: async s => {
      log.ps.push(s)
      if (/JJFV/.test(s)) return { ok: true, out: 'JJFV:' + JSON.stringify(opts.applied || { priority: false, io: false, fso: true, gamebar: false, defender: false }) }
      if (/JJLOC/.test(s)) return { ok: true, out: 'JJLOC:{}' }
      if (/JJMTU/.test(s)) return { ok: true, out: 'JJMTU:{"payload":1464}' }
      if (/-LiteralPath .*PerfOptions/.test(s) && opts.ifeo !== undefined) return { ok: true, out: 'JJV:' + opts.ifeo }
      return { ok: true, out: '' }
    },
    runRecorded: async (control, action, meta, fn) => {
      const notes = []
      const r = await fn(async s => { log.ps.push(s); return { ok: true, out: '' } }, async c => { log.cmds.push(c); return { ok: opts.cmdFails ? false : true } }, n => notes.push(n))
      log.rec.push({ control, action, meta, notes })
      return r
    },
    undoControl: async c => { log.undone.push(c); return { ok: true } },
    state: { read: () => stateObj, write: v => { stateObj = v } },
    isAdmin: () => opts.admin !== false, isFivemRunning: async () => !!opts.running,
    vramMB: () => (opts.vram === undefined ? 2048 : opts.vram), cleanCache: async () => ({ ok: true, freed: 1 }),
    recorder: { list: () => opts.recorderRows || [], get: id => (opts.recorderSessions || {})[id] || null },
    transport: {
      getJson: async url => {
        if (/servers-frontend/.test(url)) return { ok: true, ms: 40, data: { Data: { connectEndPoints: ['203.0.113.9:30120'], hostname: '^1My ^2Server', clients: 12, sv_maxclients: 64, vars: { sv_projectName: 'Cool RP' } } } }
        if (/dynamic\.json/.test(url) && /203\.0\.113\.9/.test(url)) return { ok: true, ms: 33, data: { hostname: 'Cool RP', clients: 20, sv_maxclients: 64, mapname: 'los_santos' } }
        return { ok: false }
      },
      tcp: async () => 25, lookup4: async h => (h === 'nodns.example' ? null : '203.0.113.9'),
    },
    spawn, emit: (ch, pl) => log.emitted.push([ch, pl]),
    backupDir: path.join(p.root, 'backups'), sessionsDir: path.join(p.root, 'sessions'),
    legacyState: () => opts.legacy || [], legacyRestore: async () => ({ ok: true }),
  }
  return { p, log, deps, svc: Fivem.create(deps), state: () => stateObj }
}

// ── scan ───────────────────────────────────────────────────────────────────────────
test('scan: FiveM not installed gives a not-installed finding and nothing else breaks', async () => {
  const h = harness({ bare: true })
  const r = await h.svc.scan()
  assert.equal(r.ok, true)
  assert.equal(r.report.loc.installed, false)
  assert.deepEqual(r.report.findings.map(f => f.id), ['not-installed'])
  assert.equal(r.report.tweaks.every(t => t.applied === null), true)
})
test('scan: reads the real files, finds exes, game path, mods and cache without touching the game folders', async () => {
  const h = harness()
  const r = (await h.svc.scan()).report
  assert.equal(r.loc.installed, true); assert.equal(r.loc.gtaOk, true); assert.equal(r.loc.gtaSource, 'ini')
  assert.deepEqual(r.loc.exes.sort(), ['FiveM.exe', 'FiveM_b3258_GTAProcess.exe'])
  assert.equal(r.gfx.values.TextureQuality, '3'); assert.equal(r.gfx.values.GrassQuality, null)
  assert.equal(r.tweaks.find(t => t.id === 'fso').applied, true)
  assert.equal(r.tweaks.find(t => t.id === 'priority').applied, false)
  assert.ok(r.cache.mb >= 2)
  assert.deepEqual(r.mods.map(m => m.id), ['scripthookv'])
  const ids = r.findings.map(f => f.id)
  assert.ok(ids.includes('texture-vram') && ids.includes('mods-high'))
})
test('scan: unknown video memory never produces a texture finding', async () => {
  const h = harness({ vram: null })
  assert.ok(!(await h.svc.scan()).report.findings.some(f => f.id === 'texture-vram'))
})

// ── tweaks ─────────────────────────────────────────────────────────────────────────
test('apply: unknown ids never reach the journal or a shell', async () => {
  const h = harness()
  for (const id of ['nope', '__proto__', 'constructor', 'toString', '', null]) assert.equal((await h.svc.apply(id)).error, 'unknown')
  assert.equal(h.log.rec.length, 0); assert.equal(h.log.cmds.length, 0)
})
test('apply: an admin-only tweak without admin does nothing', async () => {
  const h = harness({ admin: false })
  assert.equal((await h.svc.apply('priority')).error, 'admin-required')
  assert.equal(h.log.rec.length, 0)
})
test('apply: priority sets the real exes only, through the journal under the fivem2: control', async () => {
  const h = harness()
  const r = await h.svc.apply('priority')
  assert.equal(r.ok, true)
  assert.equal(h.log.rec[0].control, 'fivem2:priority')
  assert.equal(h.log.cmds.length, 2)
  assert.ok(h.log.cmds.every(c => /^reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\FiveM(_b3258_GTAProcess)?\.exe\\PerfOptions" \/v CpuPriorityClass/.test(c)))
})
test('apply: a priority value another tab already set is never overwritten', async () => {
  const h = harness({ ifeo: 6 })
  const r = await h.svc.apply('priority')
  assert.equal(r.ok, false); assert.equal(r.error, 'owned-elsewhere'); assert.equal(h.log.cmds.length, 0)
  const same = harness({ ifeo: 3 })
  assert.equal((await same.svc.apply('priority')).ok, true)
})
test('apply: a failing registry write is reported, not hidden', async () => {
  const h = harness({ cmdFails: true })
  assert.equal((await h.svc.apply('priority')).ok, false)
})
test('undo: only known controls can be undone', async () => {
  const h = harness()
  assert.equal((await h.svc.undo('evil')).error, 'unknown')
  assert.equal((await h.svc.undo('fso')).ok, true)
  assert.deepEqual(h.log.undone, ['fivem2:fso'])
})
test('catalog: probe output parses and the defender handler is registered', () => {
  const r = Cat.parseProbe('noise\nJJFV:{"priority":true,"io":false,"fso":true,"gamebar":false,"defender":false}\n')
  assert.equal(r.priority, true); assert.equal(r['io-priority'], false)
  assert.equal(Cat.parseProbe('garbage'), null)
  assert.ok(Cat.handlers({ runPS: async () => ({}), fs })['fivem-defender'] && Cat.handlers({ runPS: async () => ({}), fs })['fivem-file'])
})

// ── ini and graphics writes ────────────────────────────────────────────────────────
test('iniWrite: backs up first, changes only the value, journals a hash-checked file change, and undo restores the original bytes', async () => {
  const h = harness()
  const before = fs.readFileSync(h.p.ini, 'utf8')
  const r = await h.svc.iniWrite({ DisableNVSP: '1', StreamingMemory: '2048' })
  assert.equal(r.ok, true); assert.deepEqual(r.changed, ['DisableNVSP']); assert.equal(r.rejected[0].key, 'StreamingMemory')
  assert.equal(fs.readFileSync(h.p.ini, 'utf8'), before.replace('DisableNVSP=0', 'DisableNVSP=1'))
  const note = h.log.rec[0].notes[0]
  assert.equal(note.kind, 'fivem-file'); assert.equal(fs.readFileSync(note.backup, 'utf8'), before)
  assert.notEqual(note.before.value, note.after.value)       // same-length edit is still a recorded change
  const handler = Cat.handlers(h.deps)['fivem-file']
  assert.equal((await handler.read(note)).value, note.after.value)
  assert.equal(await handler.restore(note), true)
  assert.equal(fs.readFileSync(h.p.ini, 'utf8'), before)
})
test('iniWrite: nothing is written or journaled when nothing changes, or while the game runs', async () => {
  const h = harness()
  const r = await h.svc.iniWrite({ UpdateChannel: 'production' })
  assert.deepEqual(r.changed, []); assert.equal(h.log.rec.length, 0)
  const g = harness({ running: true })
  assert.equal((await g.svc.iniWrite({ DisableNVSP: '1' })).error, 'game-running')
})
test('gfxWrite: only keys already in the file, valid values only, backup restores the original', async () => {
  const h = harness()
  const r = await h.svc.gfxWrite({ MSAA: '0', GrassQuality: '1', TextureQuality: '9' })
  assert.deepEqual(r.changed, ['MSAA'])
  assert.deepEqual(r.rejected.map(x => x.reason).sort(), ['bad-value', 'not-in-file'])
  assert.equal(fs.readFileSync(h.p.xml, 'utf8'), XML.replace('<MSAA value="4"', '<MSAA value="0"'))
  assert.equal(await Cat.handlers(h.deps)['fivem-file'].restore(h.log.rec[0].notes[0]), true)
  assert.equal(fs.readFileSync(h.p.xml, 'utf8'), XML)
})
test('gfxWrite: a corrupt file is refused untouched; a preset previews only keys the file has', async () => {
  const h = harness()
  const preview = await h.svc.gfxPreset('performance')
  assert.deepEqual(Object.keys(preview.changes).sort(), ['LodScale', 'MSAA', 'TextureQuality'])
  assert.equal((await h.svc.gfxPreset('nonsense')).error, 'unknown')
  fs.writeFileSync(h.p.xml, '<broken')
  assert.equal((await h.svc.gfxWrite({ MSAA: '0' })).error, 'corrupt')
  assert.equal(fs.readFileSync(h.p.xml, 'utf8'), '<broken')
})

// ── servers and route ──────────────────────────────────────────────────────────────
test('server input: join codes, host:port, defaults and rejects', () => {
  assert.deepEqual(Srv.parseTarget('https://cfx.re/join/abc123'), { kind: 'join', code: 'abc123' })
  assert.deepEqual(Srv.parseTarget('play.example.com'), { kind: 'host', host: 'play.example.com', port: 30120 })
  assert.deepEqual(Srv.parseTarget('203.0.113.9:30121'), { kind: 'host', host: '203.0.113.9', port: 30121 })
  for (const bad of ['', 'a b', 'x;calc', '203.0.113.9:99999', 'http://a/../b', '$(whoami)', 'a'.repeat(400)]) assert.equal(Srv.parseTarget(bad), null, bad)
})
test('serverAdd: resolves a join code, strips colour codes, dedupes, rejects junk, and the first one becomes active', async () => {
  const h = harness()
  const r = await h.svc.serverAdd('cfx.re/join/abc123')
  assert.equal(r.ok, true); assert.equal(r.server.host, '203.0.113.9'); assert.equal(r.server.name, 'Cool RP')
  assert.equal(r.live.players, 20)
  assert.equal(r.active, r.server.id)
  assert.equal((await h.svc.serverAdd('203.0.113.9:30120')).servers.length, 1)
  assert.equal((await h.svc.serverAdd('not a server!')).ok, false)
  assert.equal(Srv.clean('^1My ^2Server'), 'My Server')
})
test('importBookmarks: once only, validated, no network', async () => {
  const h = harness()
  const a = h.svc.importBookmarks([{ name: 'A', host: 'play.example.com', port: '30120' }, { name: 'bad', host: 'x;y', port: 1 }])
  assert.equal(a.servers.length, 1)
  assert.equal(h.svc.importBookmarks([{ host: 'other.example.com', port: 30120 }]).servers.length, 1)
})
test('route: start validates and resolves the host, rounds are emitted, stop kills the poller', async () => {
  const h = harness()
  const add = await h.svc.serverAdd('203.0.113.9:30120')
  assert.equal((await h.svc.routeStart('missing')).error, 'unknown')
  const s = await h.svc.routeStart(add.server.id)
  assert.equal(s.ok, true); assert.equal(s.ip, '203.0.113.9')
  const proc = h.log.spawned[0]
  proc.stdout.emit('data', Buffer.from('JJROUTE:{"d":2,"h":[[1,"192.168.1.1",1.2],[2,"203.0.113.9",20.5]]}\nnoise\n'))
  assert.equal(h.log.emitted.filter(e => e[0] === 'fivem2-route').length, 1)
  assert.equal(h.svc.routeSnapshot().state.destTtl, 2)
  h.svc.routeStop()
  assert.equal(proc.killed, true); assert.equal(h.svc.routeSnapshot().running, false)
})
test('route: unresolvable host reports dns; scripts only ever accept an IPv4 literal', async () => {
  const h = harness()
  const add = await h.svc.serverAdd('nodns.example:30120')
  assert.equal((await h.svc.routeStart(add.server.id)).error, 'dns')
  for (const bad of ["1.1.1.1';calc;'", 'example.com', '1.1.1', '::1', '1.1.1.1\n$x']) { assert.throws(() => Rt.pollScript(bad)); assert.throws(() => Rt.mtuScript(bad)) }
  assert.match(Rt.pollScript('1.1.1.1'), /\[JjTrace\]::Round\('1\.1\.1\.1'\)/)
  assert.equal(Rt.parseLine('JJROUTE:{"d":0,"h":[[1,null,null]]}').d, null)
  assert.equal(Rt.parseLine('nope'), null)
  assert.equal(Rt.parseMtu('JJMTU:{"payload":1464}'), 1492)
  assert.equal(Rt.parseMtu('JJMTU:{"payload":null}'), null)
})
test('mtu: runs the probe against the resolved address', async () => {
  const h = harness()
  const add = await h.svc.serverAdd('203.0.113.9:30120')
  assert.deepEqual(await h.svc.mtu(add.server.id), { ok: true, mtu: 1492 })
})

// ── mods, logs, sessions, cache, legacy ────────────────────────────────────────────
test('mods: anchored names only, no content reading', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jt-mods-'))
  for (const f of ['ScriptHookV.dll', 'thickenbolt.txt', 'enbseries.ini', 'dinput8.dll', 'ReShade.ini', 'trainer.asi']) fs.writeFileSync(path.join(dir, f), 'MZ DirectInput8Create')
  const r = Mods.scan({ fs, path }, { plugins: [dir], gta: null })
  assert.deepEqual(r.found.map(f => f.file).sort(), ['ReShade.ini', 'ScriptHookV.dll', 'enbseries.ini', 'trainer.asi'])
  assert.equal(r.found[0].sev, 'high')
})
test('logs: newest CitizenFX log, tail only, signatures from the text that is there', async () => {
  const h = harness()
  fs.mkdirSync(path.join(h.p.app, 'logs'), { recursive: true })
  fs.writeFileSync(path.join(h.p.app, 'logs', 'CitizenFX_log_1.log'), 'old\n')
  fs.writeFileSync(path.join(h.p.app, 'logs', 'CitizenFX_log_2.log'), 'start\nDXGI_ERROR_DEVICE_HUNG happened\nwarning: slow\nfine\n')
  fs.utimesSync(path.join(h.p.app, 'logs', 'CitizenFX_log_1.log'), new Date(Date.now() - 60000), new Date(Date.now() - 60000))
  const r = await h.svc.logs()
  assert.equal(r.ok, true); assert.equal(r.file, 'CitizenFX_log_2.log')
  assert.deepEqual(r.found.map(f => f.id), ['gpu-removed'])
  assert.equal(r.lines.find(l => /warning/.test(l.text)).sev, 'warn')
  assert.equal(Sig.scan(Sig.parse('all quiet')).length, 0)
})
test('sessions: the network track is stored per second and joined to a frame session by time', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jt-sess-'))
  let t = 1000, tick = null
  const s = Sess.create({ fs, path, dir, now: () => t, tcp: async () => 30, setTimer: fn => { tick = fn; return 1 }, clearTimer: () => {} })
  assert.equal(s.begin(null).ok, false)
  s.begin({ host: 'h.example.com', port: 30120, name: 'X' })
  return (async () => {
    for (let i = 0; i < 12; i++) await tick()
    t = 20000
    const rec = s.end()
    assert.equal(rec.net.rtt.length, 12)
    assert.equal(s.list().length, 1)
    assert.equal(s.get(rec.id).server.host, 'h.example.com')
    assert.equal(s.get('../../x'), null)
    assert.ok(Sess.join(rec, [{ startedAt: 5000, durationSec: 30 }]))
    assert.equal(Sess.join(rec, [{ startedAt: 900000, durationSec: 30 }]), null)
  })()
})
test('sessionList + session: a FiveM frame session gets its hitches attributed and the network track offset', async () => {
  const bins = Array.from({ length: 30 }, () => ({ fps: 60, maxMs: 20, frames: 60 })); bins[10] = { fps: 20, maxMs: 200, frames: 20 }
  const rec = { id: 'abc', game: { id: 'fivem', name: 'FiveM' }, startedAt: 10000, durationSec: 30, bins, series: { 'gpu0.load': new Array(30).fill(99) }, seconds: 30, summary: { avgFps: 55 }, hist: [], edges: [] }
  const h = harness({ recorderRows: [{ id: 'abc', game: rec.game, startedAt: 10000, durationSec: 30, summary: rec.summary, hasTelemetry: true }, { id: 'zzz', game: { id: 'cs2', name: 'CS2' }, startedAt: 10000, durationSec: 30 }], recorderSessions: { abc: { session: rec } } })
  const list = h.svc.sessionList()
  assert.deepEqual(list.sessions.map(s => s.id), ['abc'])
  const s = h.svc.session('abc')
  assert.equal(s.analysis.hitches[0].primary, 'gpu-bound')
  assert.equal(s.net, null)
  assert.equal(h.svc.session('nope').error, 'unknown')
})
test('cache: refused while the game runs; legacy restore only knows the retired ids', async () => {
  const g = harness({ running: true })
  assert.equal((await g.svc.cacheClear()).error, 'game-running')
  const h = harness({ legacy: ['fivem-network', 'tcp-ack', 'fivem-fso'] })
  assert.deepEqual(h.svc.legacy().legacy, ['fivem-network', 'fivem-fso'])
  assert.equal((await h.svc.legacyRestore('rm -rf')).error, 'unknown')
  assert.equal((await h.svc.legacyRestore('fivem-network')).ok, true)
})

// ── route memory, trace guard, fit check, session extras ────────────────────────────
test('route: an automatic start is refused while the game runs, an explicit one is not, and the game starting stops a running trace', async () => {
  const h = harness({ running: true })
  const add = await h.svc.serverAdd('203.0.113.9:30120')
  assert.equal((await h.svc.routeStart(add.server.id)).error, 'game-running'); assert.equal(h.log.spawned.length, 0)
  assert.equal((await h.svc.routeStart(add.server.id, { force: true })).ok, true)
  assert.equal(h.svc.routeSnapshot().running, true)
  h.svc.gameStarted()
  assert.equal(h.svc.routeSnapshot().running, false)
  h.svc.gameEnded()                                  // the session timer must not outlive the test
})
test('route memory: a finished trace of enough rounds is remembered per server, short ones are not', async () => {
  const h = harness()
  const add = await h.svc.serverAdd('203.0.113.9:30120')
  await h.svc.routeStart(add.server.id)
  h.log.spawned[0].stdout.emit('data', Buffer.from('JJROUTE:{"d":2,"h":[[1,"192.168.1.1",1.2],[2,"203.0.113.9",20.5]]}\n'))
  h.svc.routeStop()
  assert.equal(h.svc.routeHistory(add.server.id).entries.length, 0)            // 1 round: not remembered
  await h.svc.routeStart(add.server.id)
  for (let i = 0; i < 35; i++) h.log.spawned[1].stdout.emit('data', Buffer.from('JJROUTE:{"d":2,"h":[[1,"192.168.1.1",1.2],[2,"203.0.113.9",20.5]]}\n'))
  h.svc.routeStop()
  const r = h.svc.routeHistory(add.server.id)
  assert.equal(r.entries.length, 1); assert.equal(r.entries[0].verdict, 'clean'); assert.equal(r.pattern.runs, 1); assert.equal(r.pattern.enough, false)
  assert.equal(h.svc.routeHistory('missing').entries.length, 0)
})
test('fitCheck: combines the server, the local builds and mods and six quick connections; read-only', async () => {
  const h = harness()
  h.deps.fitGapMs = 0
  const add = await h.svc.serverAdd('203.0.113.9:30120')
  const r = await h.svc.fitCheck(add.server.id)
  assert.equal(r.ok, true); assert.equal(r.tcp.n, 6); assert.equal(r.tcp.got, 6)
  assert.ok(r.items.some(i => i.id === 'mods-high'))                          // ScriptHookV.dll sits in the fixture's plugins folder
  assert.equal(h.log.rec.length, 0); assert.equal(h.log.cmds.length, 0)       // nothing was written or journaled
  assert.equal((await h.svc.fitCheck('missing')).error, 'unknown')
  const bare = harness({ bare: true }); bare.deps.fitGapMs = 0
  const a2 = await bare.svc.serverAdd('203.0.113.9:30120')
  assert.ok((await bare.svc.fitCheck(a2.server.id)).items.some(i => i.id === 'not-installed'))
})
test('session: carries pacing, present modes and the console coach next to the hitch list', async () => {
  const bins = Array.from({ length: 30 }, () => ({ fps: 100, maxMs: 12, frames: 100 })); bins[4] = { fps: 100, maxMs: 40, frames: 100 }
  const rec = { id: 'abc', game: { id: 'fivem', name: 'FiveM' }, startedAt: 10000, durationSec: 30, bins, series: {}, seconds: 0, summary: { avgFps: 100 }, hist: [], edges: [], presentModes: { 'Hardware: Independent Flip': 80, 'Composed: Flip': 20 } }
  const h = harness({ recorderRows: [{ id: 'abc', game: rec.game, startedAt: 10000, durationSec: 30, summary: rec.summary }], recorderSessions: { abc: rec } })
  const s = h.svc.session('abc')
  assert.equal(s.pacing.smallSpikes, 1)
  assert.deepEqual(s.modes.map(m => [m.kind, m.pct]), [['direct', 80], ['composed', 20]])
  assert.ok(Array.isArray(s.coach))
})
test('scan: an Enhanced client folder is reported, never edited', async () => {
  const h = harness()
  fs.mkdirSync(path.join(h.p.local, 'FiveM for GTAV Enhanced'), { recursive: true })
  const r = (await h.svc.scan()).report
  assert.equal(r.loc.enhanced, true); assert.ok(r.findings.some(f => f.id === 'enhanced'))
})
test('passport: groups the recorded sessions of one saved server against the rest', async () => {
  const rows = ['p1', 'p2', 'p3'].map((id, i) => ({ id, game: { id: 'fivem', name: 'FiveM' }, startedAt: 1000000 + i * 3600000, durationSec: 900, summary: { avgFps: 100 + i * 10, low1Fps: 60 }, hasTelemetry: false }))
  const h = harness({ recorderRows: rows })
  const add = await h.svc.serverAdd('203.0.113.9:30120')
  assert.equal(h.svc.passport('missing').error, 'unknown')
  assert.equal(h.svc.passport(add.server.id).passport, null)                         // no session is tagged with this server
})
test('logs: an earlier log can be picked by name from the listing; any other name falls back to the newest', async () => {
  const h = harness()
  const dir = path.join(h.p.app, 'logs'); fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'CitizenFX_log_old.log'), 'DXGI_ERROR_DEVICE_HUNG here\n'); fs.utimesSync(path.join(dir, 'CitizenFX_log_old.log'), new Date(1000), new Date(1000))
  fs.writeFileSync(path.join(dir, 'CitizenFX_log_new.log'), 'all fine\n')
  const newest = await h.svc.logs()
  assert.equal(newest.file, 'CitizenFX_log_new.log'); assert.equal(newest.files.length, 2); assert.equal(newest.found.length, 0)
  assert.equal((await h.svc.logs('CitizenFX_log_old.log')).found[0].id, 'gpu-removed')
  assert.equal((await h.svc.logs('..\..\evil.log')).file, 'CitizenFX_log_new.log')
})
