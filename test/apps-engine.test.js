const test = require('node:test')
const assert = require('node:assert')
const path = require('path')
const known = require('../lib/apps/known')
const catalog = require('../lib/apps/catalog')
const detect = require('../lib/apps/detect')
const actions = require('../lib/apps/actions')
const rules = require('../lib/apps/rules')
const footprint = require('../lib/apps/footprint')
const findings = require('../lib/apps/findings')
const model = require('../lib/apps/model')
const Svc = require('../lib/apps')

// ── known ──────────────────────────────────────────────────────────────────
test('known: ids and stems are unique, roles and categories exist, lower is a subset of stems', () => {
  const ids = known.APPS.map(a => a.id)
  assert.strictEqual(new Set(ids).size, ids.length)
  const stems = known.APPS.flatMap(a => a.stems)
  assert.strictEqual(new Set(stems).size, stems.length, 'a stem belongs to one app')
  for (const a of known.APPS) {
    assert.ok(known.CATS.includes(a.cat), a.id + ' cat')
    assert.ok(known.ROLES.includes(a.role), a.id + ' role')
    for (const s of a.lower || []) assert.ok(a.stems.includes(s), a.id + ' lower ' + s)
    for (const s of a.stems) assert.strictEqual(s, s.toLowerCase())
  }
  assert.strictEqual(known.stem('Chrome.exe#3'), 'chrome')
  assert.strictEqual(known.appOfStem('MSEDGE'), 'edge')
  assert.strictEqual(known.appOfStem('notepad'), null)
})

// ── catalog ────────────────────────────────────────────────────────────────
test('catalog: every row belongs to a known app, ids are unique', () => {
  const ids = catalog.ids()
  assert.strictEqual(new Set(ids).size, ids.length)
  for (const r of catalog.ROWS) assert.ok(known.BY_ID[r.app], r.id)
})

test('catalog.lines: policy on writes the value, off removes only that value; service off goes back to the original start type', () => {
  const r = catalog.byId['edge-background']
  assert.ok(catalog.lines(r, true).some(l => /Set-ItemProperty .*BackgroundModeEnabled' -Value 0/.test(l)))
  const off = catalog.lines(r, false)
  assert.strictEqual(off.length, 1)
  assert.match(off[0], /^Remove-ItemProperty .*BackgroundModeEnabled/)
  const s = catalog.byId['nvidia-telemetry']
  assert.ok(catalog.lines(s, false, 'Manual')[0].includes('-StartupType Manual'))
  assert.ok(catalog.lines(s, false, 'Disabled')[0].includes('-StartupType Automatic'), 'never restores to Disabled')
  assert.ok(catalog.lines(s, true).some(l => l.startsWith('Stop-Service')))
})

test('Firefox block: only our lines move, the user\'s are kept byte for byte (LF and CRLF), idempotent', () => {
  for (const nl of ['\n', '\r\n']) {
    const mine = ['user_pref("a.b", 1);', '// my comment', 'user_pref("c.d", "x");'].join(nl) + nl
    const added = catalog.ffAdd(mine)
    assert.ok(added.startsWith(mine))
    assert.ok(catalog.ffHas(added))
    assert.strictEqual(catalog.ffAdd(added), added)
    assert.strictEqual(catalog.ffRemove(added), mine)
  }
  assert.strictEqual(catalog.ffRemove('keep me'), 'keep me')
  assert.strictEqual(catalog.ffRemove(catalog.ffAdd('')), '')
  assert.ok(catalog.ffLegacy('// PTU Firefox Performance\nuser_pref("x", 1);'))
  assert.ok(!catalog.ffLegacy('user_pref("x", 1);'))
})

test('Discord settings: only enableHardwareAcceleration changes and its old value comes back', () => {
  const t = JSON.stringify({ SKIP_HOST_UPDATE: false, enableHardwareAcceleration: true, other: { a: 1 } })
  assert.strictEqual(catalog.discordReadHw(t), 'none')
  const on = catalog.discordSetHw(t, true)
  assert.deepStrictEqual(on.before, { exists: true, value: true })
  assert.strictEqual(catalog.discordReadHw(on.text), 'all')
  const back = catalog.discordSetHw(on.text, false, on.before)
  assert.deepStrictEqual(JSON.parse(back.text), JSON.parse(t))
  const none = JSON.stringify({ a: 1 })
  const on2 = catalog.discordSetHw(none, true)
  assert.deepStrictEqual(on2.before, { exists: false })
  assert.deepStrictEqual(JSON.parse(catalog.discordSetHw(on2.text, false, on2.before).text), { a: 1 })
  assert.strictEqual(catalog.discordReadHw('{oops'), 'unread')
  assert.strictEqual(catalog.discordLegacy('{"SKIP_HOST_UPDATE":true}'), true)
  assert.strictEqual(catalog.discordLegacy('{"enableHardwareAcceleration":false}'), false)
})

test('legacyFound: the old flag or the exact old value, never a value somebody else set', () => {
  const none = catalog.legacyFound({ settings: {}, ifeo: {}, files: {} })
  assert.deepStrictEqual(none, [])
  const flagged = catalog.legacyFound({ settings: { 'tweak_spotify-optimize': 'applied' }, ifeo: {}, files: {} })
  assert.deepStrictEqual(flagged.map(l => l.id), ['spotify-optimize'])
  const live = catalog.legacyFound({ settings: {}, ifeo: { 'discord.exe': 1, 'code.exe': 3 }, files: {} })
  assert.deepStrictEqual(live.map(l => l.id), ['discord-cpu-priority'], 'Code.exe=High is not ours')
  const obsOnlyValue = catalog.legacyFound({ settings: {}, ifeo: { 'obs64.exe': 3 }, files: {} })
  assert.deepStrictEqual(obsOnlyValue, [], 'High on OBS without the old flag is the user\'s')
  const obsBoth = catalog.legacyFound({ settings: { 'tweak_obs-optimize': 'applied' }, ifeo: { 'obs64.exe': 3 }, files: {} })
  assert.deepStrictEqual(obsBoth.map(l => l.id), ['obs-optimize'])
  const files = catalog.legacyFound({ settings: {}, ifeo: {}, files: { discord: true, firefox: true } })
  assert.deepStrictEqual(files.map(l => l.id).sort(), ['discord-optimize', 'firefox-optimize'])
})

// ── detect ─────────────────────────────────────────────────────────────────
test('detect.parse: reads the marker line, rejects junk, keeps unreadable as null', () => {
  assert.strictEqual(detect.parse('nothing'), null)
  assert.strictEqual(detect.parse('JJAPPS:{broken'), null)
  const p = detect.parse('noise\nJJAPPS:' + JSON.stringify({ inst: { edge: true, chrome: false }, pol: { 'edge-background': 0, 'chrome-background': null }, ifeo: { 'Discord.exe': 1 }, svc: { NvTelemetryContainer: null }, run: { n: 'Discord', c: 'x', on: false } }))
  assert.strictEqual(p.installed.edge, true)
  assert.strictEqual(p.pol['chrome-background'], null)
  assert.strictEqual(p.ifeo['discord.exe'], 1)
  assert.strictEqual(p.svc.NvTelemetryContainer, null)
  assert.deepStrictEqual(p.run, [{ n: 'Discord', c: 'x', on: false }], 'a single object becomes a list')
})

test('detect.evaluate: all / none / other / unread / na', () => {
  const p = detect.parse('JJAPPS:' + JSON.stringify({ inst: {}, pol: { 'edge-background': 0, 'chrome-background': 1, 'brave-background': null }, ifeo: { 'obs64.exe': 6 }, svc: { NvTelemetryContainer: 'Disabled' }, run: [] }))
  const ev = id => detect.evaluate(p, catalog.byId[id], { 'firefox-lean': { state: 'all' } })
  assert.strictEqual(ev('edge-background').state, 'all')
  assert.deepStrictEqual(ev('chrome-background'), { state: 'other', value: 1 })
  assert.strictEqual(ev('brave-background').state, 'none')
  assert.strictEqual(ev('edge-startup-boost').state, 'unread', 'a key the probe did not answer is unread, not off')
  assert.strictEqual(ev('obs-priority').state, 'all')
  assert.strictEqual(ev('nvidia-telemetry').state, 'all')
  assert.strictEqual(ev('firefox-lean').state, 'all')
  assert.strictEqual(detect.evaluate(null, catalog.byId['edge-background']).state, 'unread')
  const p2 = detect.parse('JJAPPS:' + JSON.stringify({ inst: {}, pol: {}, ifeo: {}, svc: { NvTelemetryContainer: null }, run: [] }))
  assert.strictEqual(detect.evaluate(p2, catalog.byId['nvidia-telemetry']).state, 'na')
})

test('detect scripts only read', () => {
  for (const s of [detect.buildScript(), detect.procScript()]) {
    assert.ok(!/\b(Set-|Remove-|New-Item|Stop-|Start-Process|Invoke-Expression|iex\b)/.test(s.replace(/Start-Sleep/g, '')), 'no writes')
  }
})

test('detect.parseProcs: sanitises numbers and names', () => {
  assert.strictEqual(detect.parseProcs('x'), null)
  const r = detect.parseProcs('JJPROC:' + JSON.stringify({ cores: 8, gpu: true, procs: [{ id: 4, name: 'Chrome#2', cpu: 1.5, ws: 300, vram: 10, cls: 'Normal', st: '5' }, { id: 0, name: 'bad' }, { id: 9, name: 'x', cpu: -3, ws: null }] }))
  assert.strictEqual(r.cores, 8)
  assert.strictEqual(r.procs.length, 2)
  assert.strictEqual(r.procs[0].name, 'chrome')
  assert.strictEqual(r.procs[1].cpu, 0)
})

// ── footprint ──────────────────────────────────────────────────────────────
const P = (pid, name, cpu, ram, vram = 0, cls = 'Normal') => ({ pid, name, cpu, ram, vram, cls, st: String(pid) })
test('footprint.group: sums per app, lists unknown heavy programs once by name, skips Windows', () => {
  const g = footprint.group([P(1, 'chrome', 1, 400, 50), P(2, 'chrome', 2, 600, 70), P(3, 'discord', 0.5, 200, 5), P(4, 'svchost', 9, 900), P(5, 'mystery', 3, 100), P(6, 'mystery', 1, 600), P(7, 'tiny', 0.1, 10)], { gpu: true })
  assert.deepStrictEqual([g.byApp.chrome.cpu, g.byApp.chrome.ram, g.byApp.chrome.vram, g.byApp.chrome.n], [3, 1000, 120, 2])
  assert.deepStrictEqual(g.others.map(o => [o.name, o.n]), [['mystery', 2]])
  const t = footprint.totals(g.byApp)
  assert.deepStrictEqual([t.cpu, t.ram, t.vram, t.apps], [3.5, 1200, 125, 2])
})
test('footprint: vram is null (not 0) when the PC cannot report it; segments fold the tail', () => {
  const g = footprint.group([P(1, 'chrome', 1, 400)], { gpu: false })
  assert.strictEqual(g.byApp.chrome.vram, null)
  assert.strictEqual(footprint.totals(g.byApp).vram, null)
  const by = {}
  for (let i = 0; i < 8; i++) by['a' + i] = { ram: 100 * (i + 1) }
  const seg = footprint.segments(by, 'ram', 5)
  assert.strictEqual(seg.length, 6)
  assert.strictEqual(seg[5].id, '_rest')
  assert.strictEqual(seg[5].v, 100 + 200 + 300)
})
test('footprint.Ring keeps a fixed size and forgets programs that stopped', () => {
  const r = footprint.Ring(3, 2)
  for (let i = 1; i <= 5; i++) r.push({ a: i })
  assert.deepStrictEqual(r.get('a'), [3, 4, 5])
  r.push({}); r.push({}); r.push({})
  assert.deepStrictEqual(r.get('a'), [])
})

// ── rules ──────────────────────────────────────────────────────────────────
test('rules.levelOf: defaults by role, invalid picks ignored, quiet needs Premium', () => {
  const B = known.BY_ID
  assert.strictEqual(rules.levelOf(B.chrome, {}, false), 'calm')
  assert.strictEqual(rules.levelOf(B.discord, {}, true), 'off', 'a voice call is opt-in')
  assert.strictEqual(rules.levelOf(B.discord, { discord: 'quiet' }, true), 'off', 'quiet is not offered for voice')
  assert.strictEqual(rules.levelOf(B.discord, { discord: 'calm' }, false), 'calm')
  assert.strictEqual(rules.levelOf(B.onedrive, {}, true), 'quiet')
  assert.strictEqual(rules.levelOf(B.onedrive, {}, false), 'calm', 'free falls back to calm')
  assert.strictEqual(rules.levelOf(B.obs, { obs: 'calm' }, true), 'off', 'capture never steps back')
  assert.strictEqual(rules.levelOf(B.nvidia, { nvidia: 'calm' }, true), 'off')
  assert.strictEqual(rules.levelOf(B.ea, { ea: 'calm' }, true), 'off', 'a launcher with nothing safe to lower offers only off')
  assert.deepStrictEqual(rules.allowed(B.steam), ['off', 'calm'])
})
test('rules.plan: only Normal-priority processes of known apps, never protected, only the lowerable stems of a launcher', () => {
  const procs = [P(1, 'chrome', 5, 1), P(2, 'chrome', 1, 1, 0, 'High'), P(3, 'steam', 1, 1), P(4, 'steamwebhelper', 2, 1), P(5, 'discord', 9, 1), P(6, 'notepad', 1, 1), P(7, 'obs64', 1, 1), P(8, 'onedrive', 0, 1), P(9, 'chrome', 0, 1, 0, '')]
  const t = rules.plan(procs, { picks: { discord: 'calm' }, premium: true, enabled: true })
  assert.deepStrictEqual(t.map(x => x.pid).sort((a, b) => a - b), [1, 4, 5, 8])
  assert.deepStrictEqual(t.map(x => x.pid), [5, 1, 4, 8], 'busiest first')
  assert.strictEqual(t.find(x => x.pid === 8).level, 'quiet')
  assert.deepStrictEqual(rules.plan(procs, { enabled: false }), [])
  assert.strictEqual(rules.isProtected('EasyAntiCheat.exe'), true)
  assert.strictEqual(rules.isProtected('chrome', ['chrome']), true, 'the game itself')
  assert.deepStrictEqual(rules.plan(procs, { premium: true, enabled: true, gameStems: ['chrome'] }).map(x => x.name).includes('chrome'), false)
})
test('rules.preview: lists running apps that would step back', () => {
  const apps = [{ id: 'chrome', running: true }, { id: 'discord', running: true }, { id: 'obs', running: true }, { id: 'edge', running: false }]
  assert.deepStrictEqual(rules.preview(apps, { picks: {}, premium: false }), [{ id: 'chrome', level: 'calm' }])
})

// ── findings ───────────────────────────────────────────────────────────────
const A = (id, role, cost, extra = {}) => ({ id, role, cost, rows: [], rec: [], ...extra })
test('findings: thresholds are the named ones, a running game silences cost findings', () => {
  const T = findings.THRESH
  const apps = [A('chrome', 'browser', { cpu: T.cpuApp, ram: T.ramApp, vram: T.vramApp }), A('obs', 'capture', { cpu: 20, ram: 10, vram: 0 }), A('edge', 'browser', { cpu: T.cpuApp - 0.1, ram: T.ramApp - 1, vram: T.vramApp - 1 })]
  const f = findings.compute({ apps, totals: { cpu: 1, ram: 1, vram: 1, apps: 3 }, legacy: [], game: null, gametime: { enabled: true, stepping: 0 }, measured: true, read: true })
  assert.deepStrictEqual(f.map(x => x.kind).sort(), ['busy-cpu', 'heavy-ram', 'heavy-vram'])
  assert.ok(f.every(x => x.apps[0] === 'chrome'))
  assert.deepStrictEqual(findings.compute({ apps, legacy: [], game: { id: 'g' }, gametime: { enabled: true, stepping: 0 }, measured: true }), [])
})
test('findings: legacy, drift, startup, idle Game time, unread', () => {
  const starters = Array.from({ length: 6 }, (_, i) => A('s' + i, 'sync', null, { startup: { on: true } }))
  const f = findings.compute({ apps: [...starters, A('edge', 'browser', null, { drift: true })], legacy: [{ id: 'x', app: 'discord' }], game: null, gametime: { enabled: false, stepping: 2 }, measured: true, read: true })
  assert.deepStrictEqual(f.map(x => x.kind), ['legacy', 'drift', 'startup-many', 'gametime-idle'])
  assert.deepStrictEqual(findings.compute({ apps: [], measured: false, read: false }).map(x => x.kind), ['unread'])
})
test('findings.verdict', () => {
  assert.strictEqual(findings.verdict({ measured: false }).kind, 'unknown')
  assert.strictEqual(findings.verdict({ measured: true, count: 0, totals: { cpu: 0, ram: 0, vram: 0 }, findings: [] }).kind, 'empty')
  assert.strictEqual(findings.verdict({ measured: true, totals: { cpu: 0, ram: 0, vram: 0 }, game: { name: 'X' }, findings: [] }).kind, 'game')
  assert.strictEqual(findings.verdict({ measured: true, totals: { cpu: 0, ram: 0, vram: 0 }, findings: [{ tone: 'warn' }] }).kind, 'attention')
  assert.strictEqual(findings.verdict({ measured: true, totals: { cpu: 0, ram: 3000, vram: null }, findings: [] }).kind, 'busy')
  assert.strictEqual(findings.verdict({ measured: true, totals: { cpu: 1, ram: 500, vram: null }, findings: [] }).kind, 'quiet')
})

// ── service on a synthetic PC ──────────────────────────────────────────────
function world(over = {}) {
  const appdata = 'C:\\Users\\T\\AppData\\Roaming'
  const ffDir = path.join(appdata, 'Mozilla', 'Firefox', 'Profiles'), dsPath = path.join(appdata, 'discord', 'settings.json')
  const pc = {
    installed: { edge: true, chrome: true, firefox: true, discord: true, obs: true, nvidia: true, onedrive: true },
    pol: {}, ifeo: {}, svc: { NvTelemetryContainer: 'Automatic' }, run: [],
    procs: [P(10, 'chrome', 2, 700, 100), P(11, 'chrome', 1, 300, 30), P(20, 'discord', 1, 200, 5), P(30, 'onedrive', 0.5, 120), P(40, 'obs64', 4, 300), P(50, 'steamwebhelper', 1, 250), P(60, 'steam', 0.2, 80)],
    files: { [path.join(ffDir, 'p1', 'user.js')]: 'user_pref("mine", 1);\n', [dsPath]: JSON.stringify({ enableHardwareAcceleration: true, keep: 'me' }) },
    dirs: { [ffDir]: ['p1'] }, settings: {}, premium: true, game: null, gaming: false, journal: [], applyFails: false, elevated: true, undone: 0, ...over,
  }
  const polRow = (key, name) => catalog.ROWS.find(r => r.kind === 'policy' && r.key === key && r.name === name)
  const dirOf = p => path.dirname(p)
  const deps = {
    runPS: async s => {
      if (s.includes("'JJAPPS:'")) {
        const pol = {}; for (const r of catalog.ROWS.filter(x => x.kind === 'policy')) pol[r.id] = r.id in pc.pol ? pc.pol[r.id] : null
        return { ok: true, out: 'JJAPPS:' + JSON.stringify({ inst: pc.installed, pol, ifeo: Object.fromEntries([...catalog.LEGACY_IFEO, 'obs64.exe'].map(e => [e.toLowerCase(), pc.ifeo[e.toLowerCase()] == null ? null : pc.ifeo[e.toLowerCase()]])), svc: pc.svc, run: pc.run }) }
      }
      if (s.includes("'JJPROC:'")) return { ok: true, out: 'JJPROC:' + JSON.stringify({ cores: 8, gpu: true, procs: pc.procs.map(p => ({ id: p.pid, name: p.name, cpu: p.cpu, ws: p.ram, vram: p.vram, cls: p.cls, st: p.st })) }) }
      const mode = /\$mode = '(\w+)'/.exec(s)[1]
      const items = JSON.parse(/ConvertFrom-Json '((?:[^']|'')*)'/.exec(s)[1].replace(/''/g, "'"))
      const out = []
      for (const i of items) {
        const p = pc.procs.find(x => x.pid === i.id)
        if (!p || p.name !== i.name || (i.st && p.st !== i.st)) { out.push('GONE|' + i.id); continue }
        if (mode === 'read') { out.push('CUR|' + i.id + '|' + p.cls); continue }
        if (i.only.length && !i.only.includes(p.cls)) { out.push((mode === 'restore' ? 'LEFT|' : 'SKIP|') + i.id + '|' + p.cls); continue }
        const before = p.cls; p.cls = i.to; if (i.eco === 'on') p.eco = true; if (i.eco === 'reset') p.eco = false
        out.push('SET|' + i.id + '|' + before + '|' + p.cls + '|' + (i.eco ? 'ok' : 'none'))
      }
      return { ok: true, out: out.join('\n') }
    },
    runRecorded: async (control, action, meta, fn) => {
      pc.journal.push({ control, action })
      const ps = async line => {
        if (pc.applyFails) return
        let m
        if ((m = /^Set-ItemProperty -Path '([^']+)' -Name '([^']+)' -Value (\d+)/.exec(line))) { const r = polRow(m[1], m[2]); if (r) pc.pol[r.id] = Number(m[3]) }
        else if ((m = /^Remove-ItemProperty -Path '([^']+)' -Name '([^']+)'/.exec(line))) { const r = polRow(m[1], m[2]); if (r) delete pc.pol[r.id] }
        else if ((m = /^Set-Service -Name '([^']+)' -StartupType (\w+)/.exec(line))) pc.svc[m[1]] = m[2]
      }
      await fn(ps, async () => ({ ok: true }), () => {})
    },
    undoControl: async () => { pc.undone++ },
    cpumem: {
      priority: async ({ exe }) => { pc.ifeo[exe.toLowerCase()] = 6; return { ok: true } },
      priorityClear: async ({ exe }) => { delete pc.ifeo[exe.toLowerCase()]; return { ok: true } },
    },
    files: {
      read: p => (p in pc.files ? pc.files[p] : null), write: (p, t) => { pc.files[p] = t },
      exists: p => p in pc.files || p in pc.dirs || Object.values(pc.dirs).some((names, i) => names.some(n => path.join(Object.keys(pc.dirs)[i], n) === p)),
      list: d => pc.dirs[d] || [],
    },
    env: { appdata }, isPremium: () => pc.premium, settings: () => pc.settings, activeGame: () => pc.game,
    legacyRestore: async id => { pc.settings['tweak_' + id] = 'restored'; delete pc.ifeo['discord.exe']; return true },
    state: (() => { let st = null; return { read: () => (st ? JSON.parse(JSON.stringify(st)) : null), write: v => { st = JSON.parse(JSON.stringify(v)) } } })(),
    emit: () => {}, now: (() => { let t = 1000000; return () => (t += 1000) })(), sweepMs: 1e9,
  }
  return { pc, deps, svc: Svc.create(deps), dsPath, ffDir }
}
const app = (snap, id) => snap.apps.find(a => a.id === id)
const row = (snap, id) => snap.apps.flatMap(a => a.rows).find(r => r.id === id)

test('scan: installed apps, live costs, recommended changes, nothing is written', async () => {
  const w = world()
  const s = await w.svc.scan()
  assert.ok(s.measured && s.read)
  assert.deepStrictEqual(s.apps.map(a => a.id).sort(), ['chrome', 'discord', 'edge', 'firefox', 'nvidia', 'obs', 'onedrive', 'steam'])
  assert.ok(app(s, 'steam').running, 'steam shows because it is running')
  assert.deepStrictEqual([app(s, 'chrome').cost.cpu, app(s, 'chrome').cost.ram, app(s, 'chrome').cost.vram, app(s, 'chrome').cost.n], [3, 1000, 130, 2])
  assert.strictEqual(s.totals.apps, s.apps.filter(a => a.running).length)
  assert.ok(row(s, 'edge-background').rec && row(s, 'chrome-background').rec && row(s, 'firefox-lean').rec && row(s, 'obs-priority').rec)
  assert.ok(!row(s, 'discord-hwaccel').rec, 'not recommended by default')
  assert.ok(row(s, 'nvidia-telemetry') && !row(s, 'nvidia-telemetry').rec, 'shown because the service exists, never recommended')
  const w0 = world({ svc: { NvTelemetryContainer: null } })
  assert.ok(!row(await w0.svc.scan(), 'nvidia-telemetry'), 'hidden: current drivers do not ship that service')
  assert.strictEqual(w.pc.journal.length, 0)
  assert.strictEqual(Object.keys(w.pc.pol).length, 0)
})

test('run: apply is read back, then verified; undo puts back the exact old state', async () => {
  const w = world()
  await w.svc.scan()
  const r = await w.svc.tuneRecommended()
  assert.ok(r.ok)
  assert.ok(r.run.items.every(i => i.ok && i.verified === true), JSON.stringify(r.run.items))
  assert.strictEqual(w.pc.pol['edge-background'], 0)
  assert.strictEqual(w.pc.ifeo['obs64.exe'], 6)
  assert.ok(w.pc.files[path.join(w.ffDir, 'p1', 'user.js')].startsWith('user_pref("mine", 1);\n'))
  assert.strictEqual(row(r.snapshot, 'edge-background').status, 'on')
  const u = await w.svc.undoRun({ runId: r.run.id })
  assert.ok(u.ok)
  assert.deepStrictEqual(w.pc.pol, {})
  assert.strictEqual(w.pc.ifeo['obs64.exe'], undefined)
  assert.strictEqual(w.pc.files[path.join(w.ffDir, 'p1', 'user.js')], 'user_pref("mine", 1);\n')
  assert.strictEqual(row(u.snapshot, 'edge-background').status, 'off')
  assert.strictEqual((await w.svc.undoRun({ runId: 'nope' })).error, 'not-found')
})

test('run: a value somebody else set is never overwritten and never removed', async () => {
  const w = world({ pol: { 'chrome-background': 1 } })
  const s = await w.svc.scan()
  assert.strictEqual(row(s, 'chrome-background').status, 'elsewhere')
  const r = await w.svc.run({ items: [{ row: 'chrome-background', action: 'apply' }] })
  assert.strictEqual(r.run.items[0].reason, 'elsewhere')
  assert.strictEqual(w.pc.pol['chrome-background'], 1)
  const w2 = world({ pol: { 'edge-background': 0 } })
  const s2 = await w2.svc.scan()
  assert.strictEqual(row(s2, 'edge-background').status, 'native', 'set, but not by Jylli')
  const r2 = await w2.svc.run({ items: [{ row: 'edge-background', action: 'restore' }] })
  assert.strictEqual(r2.run.items[0].reason, 'not-ours')
  assert.strictEqual(w2.pc.pol['edge-background'], 0)
  const r3 = await w2.svc.run({ items: [{ row: 'edge-background', action: 'apply' }] })
  assert.ok(r3.run.items[0].noop)
  const again = await w2.svc.run({ items: [{ row: 'edge-background', action: 'restore' }] })
  assert.strictEqual(again.run.items[0].reason, 'not-ours', 'a no-op apply does not claim it')
})

test('run: a change that does not read back is reported as not verified and is not remembered', async () => {
  const w = world({ applyFails: true })
  await w.svc.scan()
  const r = await w.svc.run({ items: [{ row: 'edge-background', action: 'apply' }] })
  assert.strictEqual(r.run.items[0].ok, false)
  assert.strictEqual(r.run.items[0].reason, 'not-verified')
  assert.strictEqual(row(r.snapshot, 'edge-background').status, 'off')
  assert.strictEqual((await w.svc.run({ items: [] })).error, 'invalid_items')
  assert.strictEqual((await w.svc.run({ items: [{ row: 'nope', action: 'apply' }] })).run.items[0].reason, 'unknown')
})

test('drift: a change Windows or an update undid shows as drifted and lands in the history once', async () => {
  const w = world()
  await w.svc.scan()
  await w.svc.run({ items: [{ row: 'edge-background', action: 'apply' }] })
  delete w.pc.pol['edge-background']
  const s = await w.svc.scan()
  assert.strictEqual(row(s, 'edge-background').status, 'drifted')
  assert.ok(app(s, 'edge').drift)
  assert.ok(s.findings.some(f => f.kind === 'drift'))
  await w.svc.scan()
  assert.strictEqual(w.svc.history().drift.length, 1)
  const r = await w.svc.run({ items: [{ row: 'edge-background', action: 'apply' }] })
  assert.strictEqual(row(r.snapshot, 'edge-background').status, 'on')
})

test('files: Discord keeps its other settings and the old value; a Discord that is not installed offers nothing', async () => {
  const w = world()
  await w.svc.scan()
  const r = await w.svc.run({ items: [{ row: 'discord-hwaccel', action: 'apply' }] })
  assert.ok(r.run.items[0].ok)
  assert.deepStrictEqual(JSON.parse(w.pc.files[w.dsPath]), { enableHardwareAcceleration: false, keep: 'me' })
  await w.svc.run({ items: [{ row: 'discord-hwaccel', action: 'restore' }] })
  assert.deepStrictEqual(JSON.parse(w.pc.files[w.dsPath]), { enableHardwareAcceleration: true, keep: 'me' })
  const w2 = world(); delete w2.pc.files[w2.dsPath]
  assert.ok(!row(await w2.svc.scan(), 'discord-hwaccel'))
})

test('service row: shown only where the service exists, restores the original start type', async () => {
  const w = world({ svc: { NvTelemetryContainer: 'Manual' } })
  const s = await w.svc.scan()
  assert.ok(row(s, 'nvidia-telemetry'))
  await w.svc.run({ items: [{ row: 'nvidia-telemetry', action: 'apply' }] })
  assert.strictEqual(w.pc.svc.NvTelemetryContainer, 'Disabled')
  await w.svc.run({ items: [{ row: 'nvidia-telemetry', action: 'restore' }] })
  assert.strictEqual(w.pc.svc.NvTelemetryContainer, 'Manual')
})

test('migrate: old changes are found and put back, then the tab reads clean', async () => {
  const w = world({ ifeo: { 'discord.exe': 1 }, settings: { 'tweak_spotify-optimize': 'applied' } })
  const s = await w.svc.scan()
  assert.deepStrictEqual(s.legacy.map(l => l.id).sort(), ['discord-cpu-priority', 'spotify-optimize'])
  assert.strictEqual(s.verdict.kind, 'attention')
  w.deps.legacyRestore = async id => { w.pc.settings['tweak_' + id] = 'restored'; if (id === 'discord-cpu-priority') delete w.pc.ifeo['discord.exe']; return true }
  const m = await w.svc.migrate()
  assert.ok(m.ok)
  assert.strictEqual(m.migrated, 2)
  assert.deepStrictEqual(m.snapshot.legacy, [])
})

test('startup: a Run entry marks the app and a disabled one does not count', async () => {
  const w = world({ run: [{ n: 'OneDrive', c: 'C:\\x\\OneDrive.exe /background', on: true }, { n: 'Discord', c: 'C:\\x\\Update.exe --processStart Discord.exe', on: false }] })
  const s = await w.svc.scan()
  assert.strictEqual(app(s, 'onedrive').startup.on, true)
  assert.strictEqual(app(s, 'discord').startup.on, false)
  assert.strictEqual(s.counts.startup, 1)
})

test('a failed probe is "unread", never a claim', async () => {
  const w = world()
  const real = w.deps.runPS
  w.deps.runPS = async s => (s.includes("'JJAPPS:'") ? { ok: false, out: '' } : real(s))
  const svc = Svc.create(w.deps)
  const s = await svc.scan()
  assert.ok(!s.read && s.measured)
  assert.ok(s.apps.every(a => a.rows.every(r => r.status === 'unknown' || r.status === 'on' || r.status === 'off')))
  assert.ok(s.apps.flatMap(a => a.rows).filter(r => r.kind === 'policy').every(r => r.status === 'unknown'))
  const r = await svc.run({ items: [{ row: 'edge-background', action: 'apply' }] })
  assert.strictEqual(r.run.items[0].reason, 'unread')
})

// ── Game time ──────────────────────────────────────────────────────────────
const cls = (w, pid) => w.pc.procs.find(p => p.pid === pid).cls

test('Game time is off until switched on; then a game lowers only what the rules allow and the end puts it all back', async () => {
  const w = world({ game: { id: 'g1', name: 'Game', stems: ['game'] } })
  w.pc.procs.push(P(70, 'game', 30, 4000, 3000))
  await w.svc.scan()
  assert.strictEqual((await w.svc.gameStart({ id: 'g1', name: 'Game', stems: ['game'] })).skipped, 'disabled')
  assert.strictEqual(cls(w, 10), 'Normal')
  w.svc.rulesSet({ enabled: true })
  const st = await w.svc.gameStart({ id: 'g1', name: 'Game', stems: ['game'] })
  assert.strictEqual(st.lowered, 4, 'two chrome, onedrive, steamwebhelper')
  assert.deepStrictEqual([cls(w, 10), cls(w, 11), cls(w, 30), cls(w, 50)], ['BelowNormal', 'BelowNormal', 'BelowNormal', 'BelowNormal'])
  assert.strictEqual(w.pc.procs.find(p => p.pid === 30).eco, true, 'onedrive is quiet with Premium')
  assert.deepStrictEqual([cls(w, 20), cls(w, 40), cls(w, 60), cls(w, 70)], ['Normal', 'Normal', 'Normal', 'Normal'], 'discord is opt-in, obs/steam/the game are never touched')
  assert.strictEqual((await w.svc.gameStart({ id: 'g1' })).skipped, 'active')
  const snap = w.svc.state().snapshot
  assert.strictEqual(snap.gametime.active.procs, 4)
  assert.strictEqual(snap.verdict.kind, 'game')
  const end = await w.svc.gameEnd()
  assert.strictEqual(end.session.restored, 4)
  assert.deepStrictEqual([cls(w, 10), cls(w, 11), cls(w, 30), cls(w, 50)], ['Normal', 'Normal', 'Normal', 'Normal'])
  assert.strictEqual(w.pc.procs.find(p => p.pid === 30).eco, false)
  assert.strictEqual(w.pc.undone, 1, 'the journal entries are closed')
  assert.strictEqual(w.svc.history().sessions.length, 1)
  assert.strictEqual((await w.svc.gameEnd()).skipped, 'idle')
})

test('Game time: free accounts get calm, not quiet', async () => {
  const w = world({ premium: false, game: { id: 'g', name: 'G' } })
  await w.svc.scan(); w.svc.rulesSet({ enabled: true })
  await w.svc.gameStart({ id: 'g', name: 'G', stems: [] })
  assert.strictEqual(cls(w, 30), 'BelowNormal')
  assert.ok(!w.pc.procs.find(p => p.pid === 30).eco)
})

test('Game time: sweep catches new processes; a priority the user changed meanwhile is left alone at the end; a closed program counts as gone', async () => {
  const w = world({ game: { id: 'g', name: 'G' } })
  await w.svc.scan(); w.svc.rulesSet({ enabled: true })
  await w.svc.gameStart({ id: 'g', name: 'G', stems: [] })
  w.pc.procs.push(P(12, 'chrome', 1, 100))
  assert.strictEqual((await w.svc.sweep()).added, 1)
  assert.strictEqual(cls(w, 12), 'BelowNormal')
  assert.strictEqual((await w.svc.sweep()).added, 0)
  w.pc.procs.find(p => p.pid === 10).cls = 'High'
  w.pc.procs = w.pc.procs.filter(p => p.pid !== 11)
  const end = (await w.svc.gameEnd()).session
  assert.strictEqual(cls(w, 10), 'High', 'the user\'s choice wins')
  assert.deepStrictEqual([end.left, end.gone], [1, 1])
  assert.strictEqual(cls(w, 12), 'Normal')
})

test('Game time: a program that already has another priority is skipped; the sweep ends the session when the game has closed', async () => {
  const w = world({ game: { id: 'g', name: 'G' } })
  w.pc.procs.find(p => p.pid === 11).cls = 'AboveNormal'
  await w.svc.scan(); w.svc.rulesSet({ enabled: true })
  const st = await w.svc.gameStart({ id: 'g', name: 'G', stems: [] })
  assert.strictEqual(st.lowered, 3)
  assert.strictEqual(cls(w, 11), 'AboveNormal')
  w.pc.game = null
  const r = await w.svc.sweep()
  assert.ok(r.session, 'ended by the sweep')
  assert.strictEqual(cls(w, 10), 'Normal')
})

test('Game time: recover() puts back what a crash left, and a pid reused by another program is not touched', async () => {
  const w = world({ game: { id: 'g', name: 'G' } })
  await w.svc.scan(); w.svc.rulesSet({ enabled: true })
  await w.svc.gameStart({ id: 'g', name: 'G', stems: [] })
  const fresh = Svc.create(w.deps)         // a new process after a crash: same saved state
  const p = w.pc.procs.find(x => x.pid === 11); p.name = 'other'; p.st = '999'
  const r = await fresh.recover()
  assert.ok(r.recovered >= 2)
  assert.strictEqual(cls(w, 10), 'Normal')
  assert.strictEqual(p.cls, 'BelowNormal', 'not ours any more')
  assert.strictEqual((await fresh.recover()).recovered, 0)
})

test('rulesSet: validates app ids and levels, default clears a pick', () => {
  const w = world()
  w.svc.rulesSet({ picks: { chrome: 'quiet', discord: 'quiet', obs: 'calm', nope: 'calm', edge: 'bogus' } })
  assert.deepStrictEqual(w.svc.rulesGet().picks, { chrome: 'quiet' })
  w.svc.rulesSet({ picks: { chrome: 'default' } })
  assert.deepStrictEqual(w.svc.rulesGet().picks, {})
  assert.strictEqual(w.svc.rulesGet().enabled, false)
})

test('actions.priorityScript: never offers Realtime, quotes safely, caps the list', () => {
  const s = actions.priorityScript('set', [{ pid: 1, name: "o'brien", st: '1', only: ['Normal'], to: 'RealTime', eco: 'on' }])
  assert.ok(s.includes("o''brien"))
  assert.ok(!s.includes('RealTime'))
  const many = actions.priorityScript('set', Array.from({ length: 400 }, (_, i) => ({ pid: i + 1, name: 'x', to: 'BelowNormal' })))
  assert.ok((many.match(/"id"/g) || []).length === 150)
  assert.deepStrictEqual([...actions.parsePriority('SET|5|Normal|BelowNormal|ok\nGONE|6\nnoise\nLEFT|7|High')].map(([k, v]) => [k, v.st]), [[5, 'SET'], [6, 'GONE'], [7, 'LEFT']])
})

test('model.build without a process sample still lists installed apps and their changes', () => {
  const probe = detect.parse('JJAPPS:' + JSON.stringify({ inst: { edge: true }, pol: { 'edge-background': 0 }, ifeo: {}, svc: {}, run: [] }))
  const m = model.build({ probe, sample: null, files: {}, remembered: { 'edge-background': 'applied' }, picks: {}, premium: false, legacy: [] })
  assert.strictEqual(m.measured, false)
  assert.strictEqual(m.apps[0].id, 'edge')
  assert.strictEqual(m.apps[0].cost, null)
  assert.strictEqual(m.apps[0].rows.find(r => r.id === 'edge-background').status, 'on')
})
