const test = require('node:test')
const assert = require('node:assert')
const known = require('../lib/games/known')
const library = require('../lib/games/library')
const exes = require('../lib/games/exes')
const catalog = require('../lib/games/catalog')
const detect = require('../lib/games/detect')
const model = require('../lib/games/model')
const stats = require('../lib/games/stats')
const findings = require('../lib/games/findings')
const Svc = require('../lib/games')

const CS2 = 'D:\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64\\cs2.exe'

test('known: registry names map to curated ids, aliases include the Pulse preset', () => {
  assert.strictEqual(known.matchName('Counter-Strike 2').id, 'cs2')
  assert.strictEqual(known.matchName('Rust Hour'), null)
  assert.deepStrictEqual(known.aliasesOf('cs2'), ['cs2', 'csgo'])
  assert.strictEqual(known.knownIdOf('csgo'), 'cs2')
  assert.strictEqual(known.knownIdOf('arma'), 'arma-reforger')
  assert.strictEqual(known.knownIdOf('r6'), 'r6siege')
  for (const k of known.KNOWN) for (const e of k.exes) assert.ok(!/vgc|battleye|easyanticheat|launcher|javaw/i.test(e), k.id + ' lists ' + e)
})

test('library: merges registry + hints + customs, dedupes curated titles, validates custom exes', () => {
  const lib = library.build({
    registry: [
      { id: 'steam:730', source: 'steam', name: 'Counter-Strike 2', install: 'D:\\Steam\\steamapps\\common\\Counter-Strike Global Offensive' },
      { id: 'steam:9', source: 'steam', name: 'Obscure Game', install: 'D:\\Steam\\steamapps\\common\\Obscure' },
    ],
    hints: [{ knownId: 'cs2', install: 'C:\\x' }, { knownId: 'valorant', install: 'C:\\Riot Games\\VALORANT' }],
    customs: [{ path: 'D:\\Games\\mygame.exe' }, { path: 'not a path' }],
    prefs: { fav: ['steam:730'], hidden: ['steam:9'] },
  })
  const byId = Object.fromEntries(lib.map(g => [g.id, g]))
  assert.strictEqual(byId['steam:730'].knownId, 'cs2')
  assert.ok(byId['steam:730'].aliases.includes('csgo'))
  assert.ok(!byId.cs2, 'curated id is not duplicated by a hint when the registry has it')
  assert.strictEqual(byId.valorant.source, 'other')
  assert.strictEqual(byId['custom:D:\\Games\\mygame.exe'].launchable, true)
  assert.strictEqual(lib.filter(g => g.source === 'custom').length, 1)
  assert.strictEqual(byId['steam:730'].favorite, true)
  assert.strictEqual(byId['steam:9'].hidden, true)
  assert.strictEqual(library.find(lib, 'csgo').id, 'steam:730')
})

test('exes: curated names win, a guess is never trusted, learned beats known', () => {
  const g = { id: 'steam:730', knownId: 'cs2', exes: ['cs2.exe'], install: 'D:\\Steam\\steamapps\\common\\cs' }
  const files = [{ path: CS2, size: 5e6 }, { path: 'D:\\x\\crashhandler.exe', size: 9e9 }]
  assert.deepStrictEqual(exes.locate(g, files).map(e => e.source), ['known'])
  const g2 = { id: 'steam:9', exes: [], install: 'D:\\o' }
  const guess = exes.locate(g2, [{ path: 'D:\\o\\bin\\game.exe', size: 8e6 }, { path: 'D:\\o\\unins000.exe', size: 9e9 }, { path: 'D:\\o\\tiny.exe', size: 10 }])
  assert.strictEqual(guess.length, 1); assert.strictEqual(guess[0].source, 'guess'); assert.deepStrictEqual(exes.trusted(guess), [])
  const l = exes.locate(g, files, { learned: [CS2] })
  assert.strictEqual(l[0].source, 'learned')
  assert.strictEqual(exes.locate(g, [{ path: "D:\\a'b\\cs2.exe", size: 5e6 }]).length, 0, 'unsafe paths never reach a script')
  assert.strictEqual(exes.learn(g, ['@@cs2.exe|' + CS2.replace('Counter-Strike Global Offensive\\game\\bin\\win64\\', '')]) , null)
})

test('catalog: dx merge keeps GpuPreference, fso keeps other flags, lines are quoted', () => {
  assert.strictEqual(catalog.dxMerge('GpuPreference=2;', true), 'GpuPreference=2;SwapEffectUpgradeEnable=1;')
  assert.strictEqual(catalog.dxMerge('GpuPreference=2;SwapEffectUpgradeEnable=1;', false), 'GpuPreference=2;')
  assert.strictEqual(catalog.dxMerge('SwapEffectUpgradeEnable=1;', false), '')
  const off = catalog.regLines('windowed', CS2, false, { dx: 'SwapEffectUpgradeEnable=1;' })
  assert.match(off[0], /^Remove-ItemProperty/)
  const on = catalog.regLines('fso', CS2, true, { fso: '~ HIGHDPIAWARE' })
  assert.match(on[1], /'~ HIGHDPIAWARE DISABLEDXMAXIMIZEDWINDOWEDMODE'/)
  assert.match(catalog.regLines('fso', CS2, false, { fso: '~ DISABLEDXMAXIMIZEDWINDOWEDMODE' })[0], /^Remove-ItemProperty/)
  assert.strictEqual(catalog.throttleCmd('C:\\a.exe', true), 'powercfg /powerthrottling disable /path "C:\\a.exe"')
})

test('detect: parse + evaluate, unelevated throttle read stays unread, other IFEO values are not "applied"', () => {
  const out = JSON.stringify({ rows: [{ p: CS2, ifeo: 3, dx: 'SwapEffectUpgradeEnable=1;', fso: null }], thr: 'Application: ' + CS2 })
  const p = detect.parse(out)
  const ev = detect.evaluate(p, CS2)
  assert.deepStrictEqual([ev.priority.state, ev.windowed.state, ev.fso.state, ev.throttle.state], ['all', 'all', 'none', 'all'])
  const p2 = detect.parse(JSON.stringify({ rows: [{ p: CS2, ifeo: 6, dx: null, fso: null }], thr: 'This command requires administrator privileges' }))
  const e2 = detect.evaluate(p2, CS2)
  assert.strictEqual(e2.priority.state, 'other'); assert.strictEqual(e2.throttle.state, 'unread')
  assert.strictEqual(detect.parse('garbage'), null)
  assert.match(detect.buildScript([CS2, "C:\\bad'path.exe"]), /^\$paths = @\('D:/m)
  assert.ok(!/bad'path/.test(detect.buildScript([CS2, "C:\\bad'path.exe"])))
})

test('model: statuses, recommendations by PC facts, noexe, drift', () => {
  const exeList = [{ path: CS2, exe: 'cs2.exe', source: 'known' }]
  const parsed = detect.parse(JSON.stringify({ rows: [{ p: CS2, ifeo: null, dx: null, fso: null }], thr: 'none' }))
  const m = model.buildGame({ game: {}, exeList, parsed, remembered: {}, facts: { hybrid: true, build: 26100 }, premium: true })
  const by = Object.fromEntries(m.rows.map(r => [r.id, r]))
  assert.ok(by.priority.rec && by.throttle.rec && by.windowed.rec && !by.fso.rec)
  assert.strictEqual(m.summary, 'open')
  const desktop = model.buildGame({ game: {}, exeList, parsed, remembered: {}, facts: { hybrid: false, laptop: false, build: 19045 }, premium: true })
  assert.ok(!desktop.rows.find(r => r.id === 'windowed'), 'windowed-game optimisations need Windows 11')
  assert.ok(!desktop.rows.find(r => r.id === 'throttle').rec)
  const drift = model.buildGame({ game: {}, exeList, parsed, remembered: { priority: 'applied' }, facts: {}, premium: true })
  assert.strictEqual(drift.summary, 'drift')
  const none = model.buildGame({ game: {}, exeList: [{ path: 'D:\\o\\g.exe', exe: 'g.exe', source: 'guess' }], parsed, remembered: {}, facts: {}, premium: true })
  assert.strictEqual(none.summary, 'noexe'); assert.strictEqual(none.rows[0].status, 'noexe')
  assert.strictEqual(model.totals({ a: none, b: m }).noexe, 1)
})

test('stats: groups by alias, needs sessions on both sides, ignores tiny sessions', () => {
  const lib = [{ id: 'steam:730', aliases: ['steam:730', 'cs2', 'csgo'] }]
  const mk = (at, avg, low) => ({ game: { id: 'csgo' }, startedAt: at, durationSec: 600, summary: { frames: 5000, avgFps: avg, low1Fps: low } })
  const s = stats.byGame(lib, [mk(1, 100, 60), mk(2, 102, 62), mk(10, 120, 80), mk(11, 118, 78), { game: { id: 'csgo' }, startedAt: 3, durationSec: 5, summary: { frames: 10, avgFps: 999 } }])
  assert.strictEqual(s['steam:730'].sessions, 5)
  assert.strictEqual(s['steam:730'].list.length, 4)
  const imp = stats.impact(s['steam:730'], 5)
  assert.strictEqual(imp.state, 'ok'); assert.strictEqual(imp.verdict, 'better')
  assert.strictEqual(stats.impact(s['steam:730'], 11).state, 'need')
  assert.strictEqual(stats.impact(undefined, 5).state, 'none')
})

test('findings: legacy and drift outrank info, verdict shows the stage sentence', () => {
  const models = { a: { summary: 'drift', recIds: [] }, b: { summary: 'open', recIds: ['priority'] } }
  const f = findings.compute({ models, names: { a: 'A', b: 'B' }, legacy: ['b'], running: 'b', premium: true })
  assert.deepStrictEqual(f.map(x => x.id), ['drift', 'legacy', 'running'])
  const v = findings.verdict({ totals: { games: 2, tuned: 0, todo: 1 }, findings: f, premium: true })
  assert.strictEqual(v.kind, 'finding')
  assert.strictEqual(findings.verdict({ totals: { games: 2, tuned: 1, todo: 1 }, findings: [], premium: true }).kind, 'todo')
  assert.strictEqual(findings.verdict({ totals: { games: 0 }, findings: [] }).kind, 'empty')
})

// ── service, with a fake PC ────────────────────────────────────────────────
function rig(over = {}) {
  const pc = { ifeo: null, dx: null, fso: null, thr: false, elevated: true, cmds: [], rec: [], prio: [] }
  const saved = {}
  const deps = Object.assign({
    registry: async () => ({ games: [{ id: 'steam:730', source: 'steam', name: 'Counter-Strike 2', install: 'D:\\Steam\\steamapps\\common\\Counter-Strike Global Offensive' }] }),
    bases: () => [], exists: () => false,
    walk: () => [{ path: CS2, size: 5e6 }],
    runPS: async () => ({ ok: true, out: JSON.stringify({ rows: [{ p: CS2, ifeo: pc.ifeo, dx: pc.dx, fso: pc.fso }], thr: pc.elevated ? (pc.thr ? 'Application ' + CS2 : 'none') : 'This command requires administrator privileges' }) }),
    runCmd: async cmd => { pc.cmds.push(cmd); if (/disable/.test(cmd)) pc.thr = true; if (/reset/.test(cmd)) pc.thr = false; return { ok: true, out: '', code: 0 } },
    runRecorded: async (control, action, meta, fn) => { pc.rec.push(control); await fn(async line => { if (/Set-ItemProperty.*UserGpuPreferences/.test(line)) pc.dx = 'SwapEffectUpgradeEnable=1;'; if (/Remove-ItemProperty.*UserGpuPreferences/.test(line)) pc.dx = null; return { ok: true } }) },
    cpumem: { priority: async ({ exe }) => { pc.prio.push('set:' + exe); pc.ifeo = 3; return { ok: true } }, priorityClear: async ({ exe }) => { pc.prio.push('clear:' + exe); pc.ifeo = null; return { ok: true } } },
    isPremium: () => true, settings: () => ({}), facts: () => ({ hybrid: true, laptop: false, build: 26100 }),
    listLines: async () => [], sessions: () => [], launch: async () => {},
    state: { read: () => saved.s || {}, write: v => { saved.s = v } },
  }, over)
  return { deps, pc, saved, svc: Svc.create(deps) }
}

test('service: scan -> tune all -> every row read back -> undo the run', async () => {
  const r = rig()
  const s0 = await r.svc.scan()
  assert.strictEqual(s0.games.length, 1)
  assert.strictEqual(s0.games[0].model.summary, 'open')
  assert.deepStrictEqual(s0.games[0].model.recIds.sort(), ['priority', 'throttle', 'windowed'])
  const res = await r.svc.tuneAll()
  assert.ok(res.ok)
  assert.ok(res.run.items.every(i => i.ok && i.verified === true), JSON.stringify(res.run.items))
  assert.strictEqual(res.snapshot.games[0].model.summary, 'tuned')
  assert.deepStrictEqual(r.pc.prio, ['set:cs2.exe'])
  assert.ok(r.pc.rec.some(c => c === 'games:steam-730:windowed'))
  const undo = await r.svc.undoRun({ runId: res.run.id })
  assert.ok(undo.ok)
  assert.strictEqual(undo.snapshot.games[0].model.summary, 'open')
  assert.strictEqual(r.pc.thr, false); assert.strictEqual(r.pc.dx, null)
})

test('service: a row that does not read back is reported as failed, other values are never overwritten, free accounts cannot write', async () => {
  const bad = rig({ runCmd: async () => ({ ok: true, out: '', code: 0 }) })   // powercfg "succeeds" but nothing changes
  await bad.svc.scan()
  const r1 = await bad.svc.run({ items: [{ gameId: 'steam:730', row: 'throttle', action: 'apply' }] })
  assert.strictEqual(r1.run.items[0].ok, false); assert.strictEqual(r1.run.items[0].reason, 'not-verified')
  const other = rig(); other.pc.ifeo = 6
  await other.svc.scan()
  const r2 = await other.svc.run({ items: [{ gameId: 'steam:730', row: 'priority', action: 'apply' }] })
  assert.strictEqual(r2.run.items[0].reason, 'elsewhere'); assert.deepStrictEqual(other.pc.prio, [])
  const free = rig({ isPremium: () => false })
  await free.svc.scan()
  assert.deepStrictEqual(await free.svc.run({ items: [{ gameId: 'steam:730', row: 'priority', action: 'apply' }] }), { ok: false, error: 'premium_required' })
})

test('service: unelevated throttle read is "could not verify", not a failure; picking an exe makes a guess trusted', async () => {
  const r = rig(); r.pc.elevated = false
  await r.svc.scan()
  const res = await r.svc.run({ items: [{ gameId: 'steam:730', row: 'throttle', action: 'apply' }] })
  assert.strictEqual(res.run.items[0].verified, null)
  const g = rig({ registry: async () => ({ games: [{ id: 'steam:9', source: 'steam', name: 'Obscure', install: 'D:\\o' }] }), walk: () => [{ path: 'D:\\o\\bin\\game.exe', size: 8e6 }] })
  const s = await g.svc.scan()
  assert.strictEqual(s.games[0].model.summary, 'noexe')
  assert.strictEqual((await g.svc.pickExe({ gameId: 'steam:9', path: 'D:\\o\\bin\\game.exe' })).snapshot.games[0].model.trusted, 1)
  assert.strictEqual((await g.svc.pickExe({ gameId: 'steam:9', path: "D:\\o\\b'ad.exe" })).ok, false)
})

test('service: learn remembers the executable seen running in a game folder; custom games, launch, favourites', async () => {
  const launched = []
  const r = rig({ registry: async () => ({ games: [{ id: 'steam:9', source: 'steam', name: 'Obscure', install: 'D:\\o' }] }), walk: () => [], launch: async s => { launched.push(s) } })
  await r.svc.scan()
  assert.strictEqual((await r.svc.learn(['@@game.exe|D:\\o\\bin\\game.exe'])).changed, true)
  const s = await r.svc.scan()
  assert.strictEqual(s.games[0].model.exes[0].source, 'learned')
  assert.strictEqual((await r.svc.launch({ gameId: 'steam:9' })).ok, true); assert.strictEqual(launched[0].url, 'steam://rungameid/9')
  assert.strictEqual((await r.svc.addCustom({ path: 'D:\\Games\\mine.exe' })).ok, true)
  assert.strictEqual((await r.svc.addCustom({ path: 'nope' })).ok, false)
  assert.ok(r.svc.favorite({ id: 'steam:9' }).ok)
})
