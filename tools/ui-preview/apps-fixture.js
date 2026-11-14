// Apps tab "Backstage" answers for the browser preview: the REAL lib/apps service on a synthetic PC (browsers, Discord, a launcher, OBS, sync, gear, one unknown heavy program).
// State comes from ?ap=full|first|none|legacy|gaming|fail on /app (serve.js passes it as ctx.ap). The fake PC keeps its policies, services, files and process priorities in
// memory, so Apply / Undo / Game time really round-trip through detect -> run -> read back like on a real machine.
const path = require('path')
const Apps = require('../../lib/apps')
const catalog = require('../../lib/apps/catalog')

const P = (pid, name, cpu, ram, vram = 0, cls = 'Normal') => ({ pid, name, cpu, ram, vram, cls, st: String(1000 + pid) })
const APPDATA = 'C:\\Users\\Preview\\AppData\\Roaming'
const FF_DIR = path.join(APPDATA, 'Mozilla', 'Firefox', 'Profiles'), DS = path.join(APPDATA, 'discord', 'settings.json')

function pcFor(state) {
  const procs = [
    P(101, 'chrome', 2.1, 620, 140), P(102, 'chrome', 0.9, 410, 60), P(103, 'chrome', 0.4, 380, 30), P(104, 'chrome', 0.2, 240), P(105, 'chrome', 0.1, 190), P(106, 'chrome', 0.1, 150),
    P(111, 'msedge', 0.3, 310, 25), P(112, 'msedge', 0.1, 190), P(113, 'msedge', 0.1, 120),
    P(121, 'discord', 1.4, 330, 210), P(122, 'discord', 0.4, 140, 40), P(123, 'discord', 0.1, 70),
    P(131, 'steam', 0.2, 95), P(132, 'steamwebhelper', 0.8, 260, 20), P(133, 'steamwebhelper', 0.3, 130), P(134, 'steamwebhelper', 0.1, 90),
    P(141, 'onedrive', 0.6, 190), P(151, 'spotify', 0.9, 280, 35), P(152, 'spotify', 0.2, 120), P(153, 'spotify', 0.1, 80),
    P(161, 'obs64', 3.6, 420, 180), P(171, 'code', 0.7, 360), P(172, 'code', 0.5, 280), P(173, 'code', 0.3, 410), P(174, 'code', 0.2, 190),
    P(181, 'icue', 0.5, 160), P(191, 'nvcontainer', 0.1, 60), P(201, 'mystery-updater', 2.4, 740),
  ]
  const pc = {
    installed: { edge: true, chrome: true, firefox: true, discord: true, spotify: true, steam: true, obs: true, nvidia: true, onedrive: true, vscode: true, icue: true, brave: true },
    pol: {}, ifeo: {}, svc: { NvTelemetryContainer: 'Automatic' }, procs,
    run: [{ n: 'Discord', c: 'C:\\Users\\Preview\\AppData\\Local\\Discord\\Update.exe --processStart Discord.exe', on: true }, { n: 'Steam', c: '"C:\\Steam\\steam.exe" -silent', on: true }, { n: 'OneDrive', c: 'C:\\x\\OneDrive.exe /background', on: true }, { n: 'Spotify', c: 'C:\\x\\Spotify.exe --autostart', on: true }, { n: 'iCUE', c: 'C:\\x\\iCUE.exe --autorun', on: true }, { n: 'Medal', c: 'C:\\x\\Medal.exe', on: true }],
    files: { [path.join(FF_DIR, 'p1.default', 'user.js')]: 'user_pref("browser.startup.homepage", "about:home");\n', [DS]: JSON.stringify({ enableHardwareAcceleration: true, BACKGROUND: false }) },
    dirs: { [FF_DIR]: ['p1.default'] }, settings: {}, game: null, gaming: state === 'gaming',
  }
  if (state === 'none') { pc.installed = {}; pc.procs = []; pc.run = []; pc.files = {}; pc.dirs = {}; pc.svc = { NvTelemetryContainer: null } }
  if (state === 'legacy') { pc.ifeo = { 'discord.exe': 1, 'spotify.exe': 1 }; pc.settings = { 'tweak_discord-cpu-priority': 'applied', 'tweak_spotify-optimize': 'applied', 'tweak_vscode-optimize': 'applied' }; pc.ifeo['code.exe'] = 1 }
  if (state === 'gaming') { pc.game = { id: 'cs2', name: 'Counter-Strike 2' }; pc.procs.push(P(900, 'cs2', 31, 5200, 4300)) }
  return pc
}

const cache = new Map()
function rig(state, premium) {
  const key = state + '|' + premium
  if (cache.has(key)) return cache.get(key)
  const pc = pcFor(state)
  const polRow = (k, n) => catalog.ROWS.find(r => r.kind === 'policy' && r.key === k && r.name === n)
  let st = null
  const deps = {
    runPS: async s => {
      if (state === 'fail') return { ok: false, out: '' }
      if (s.includes("'JJAPPS:'")) {
        const pol = {}; for (const r of catalog.ROWS.filter(x => x.kind === 'policy')) pol[r.id] = r.id in pc.pol ? pc.pol[r.id] : null
        return { ok: true, out: 'JJAPPS:' + JSON.stringify({ inst: pc.installed, pol, ifeo: Object.fromEntries([...catalog.LEGACY_IFEO, 'obs64.exe'].map(e => [e.toLowerCase(), pc.ifeo[e.toLowerCase()] == null ? null : pc.ifeo[e.toLowerCase()]])), svc: pc.svc, run: pc.run }) }
      }
      if (s.includes("'JJPROC:'")) {
        const j = () => 0.75 + Math.random() * 0.5
        return { ok: true, out: 'JJPROC:' + JSON.stringify({ cores: 16, gpu: true, procs: pc.procs.map(p => ({ id: p.pid, name: p.name, cpu: Math.round(p.cpu * j() * 10) / 10, ws: p.ram, vram: p.vram, cls: p.cls, st: p.st })) }) }
      }
      const mode = /\$mode = '(\w+)'/.exec(s)[1]
      const items = JSON.parse(/ConvertFrom-Json '((?:[^']|'')*)'/.exec(s)[1].replace(/''/g, "'"))
      const out = []
      for (const i of items) {
        const p = pc.procs.find(x => x.pid === i.id)
        if (!p || p.name !== i.name || (i.st && p.st !== i.st)) { out.push('GONE|' + i.id); continue }
        if (mode === 'read') { out.push('CUR|' + i.id + '|' + p.cls); continue }
        if (i.only.length && !i.only.includes(p.cls)) { out.push((mode === 'restore' ? 'LEFT|' : 'SKIP|') + i.id + '|' + p.cls); continue }
        const before = p.cls; p.cls = i.to
        out.push('SET|' + i.id + '|' + before + '|' + p.cls + '|' + (i.eco ? 'ok' : 'none'))
      }
      return { ok: true, out: out.join('\n') }
    },
    runRecorded: async (control, action, meta, fn) => {
      const ps = async line => {
        let m
        if ((m = /^Set-ItemProperty -Path '([^']+)' -Name '([^']+)' -Value (\d+)/.exec(line))) { const r = polRow(m[1], m[2]); if (r) pc.pol[r.id] = Number(m[3]) }
        else if ((m = /^Remove-ItemProperty -Path '([^']+)' -Name '([^']+)'/.exec(line))) { const r = polRow(m[1], m[2]); if (r) delete pc.pol[r.id] }
        else if ((m = /^Set-Service -Name '([^']+)' -StartupType (\w+)/.exec(line))) pc.svc[m[1]] = m[2]
      }
      await fn(ps, async () => ({ ok: true }), () => {})
    },
    undoControl: async () => {},
    cpumem: { priority: async ({ exe }) => { pc.ifeo[exe.toLowerCase()] = 6; return { ok: true } }, priorityClear: async ({ exe }) => { delete pc.ifeo[exe.toLowerCase()]; return { ok: true } } },
    files: {
      read: p => (p in pc.files ? pc.files[p] : null), write: (p, t) => { pc.files[p] = t },
      exists: p => p in pc.files || Object.entries(pc.dirs).some(([d, names]) => names.some(n => path.join(d, n) === p)),
      list: d => pc.dirs[d] || [],
    },
    env: { appdata: APPDATA }, isPremium: () => premium, settings: () => pc.settings, activeGame: () => pc.game,
    legacyRestore: async id => { pc.settings['tweak_' + id] = 'restored'; for (const e of ['discord.exe', 'spotify.exe', 'code.exe']) delete pc.ifeo[e]; return true },
    state: { read: () => (st ? JSON.parse(JSON.stringify(st)) : null), write: v => { st = JSON.parse(JSON.stringify(v)) } },
    emit: () => {}, sweepMs: 1e9,
  }
  const svc = Apps.create(deps)
  const ready = state === 'gaming' ? (async () => { svc.rulesSet({ enabled: true, picks: { discord: 'calm' } }); await svc.scan(); await svc.gameStart({ id: 'cs2', name: 'Counter-Strike 2', stems: ['cs2'] }) })() : Promise.resolve()
  const r = { svc, ready }
  cache.set(key, r)
  return r
}

async function respond(name, args, ctx) {
  const state = ctx.ap || 'full'
  const { svc, ready } = rig(state, ctx.premium !== false)
  await ready
  const a = Array.isArray(args) ? args[0] : args
  try {
    switch (name) {
      case 'apps2Scan': if (state === 'fail') return { ok: false, error: 'scan failed' }; return await svc.scan()
      case 'apps2Cost': if (state === 'fail') return { ok: false, error: 'scan failed' }; return await svc.cost()
      case 'apps2State': return svc.state()
      case 'apps2Run': return await svc.run(a)
      case 'apps2Tune': return await svc.tuneRecommended()
      case 'apps2UndoRun': return await svc.undoRun(a)
      case 'apps2History': return svc.history()
      case 'apps2Migrate': return await svc.migrate()
      case 'apps2GameEnd': return await svc.gameEnd()
      case 'apps2RulesGet': return svc.rulesGet()
      case 'apps2RulesSet': return svc.rulesSet(a)
      default: return undefined
    }
  } catch (e) { return { ok: false, error: String(e && e.message || e) } }
}
module.exports = { respond }
