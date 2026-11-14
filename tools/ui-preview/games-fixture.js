// Games tab "Library" answers for the browser preview: the REAL lib/games service on a synthetic PC (nine games, one of them a guess, one custom).
// State comes from ?ga=full|first|empty|legacy|running|fail on /app (serve.js passes it as ctx.ga). The fake PC keeps its registry values in memory,
// so Tune / Undo really round-trip through detect -> run -> read back like on a real machine.
const Games = require('../../lib/games')
const known = require('../../lib/games/known')

const NOW = Date.now(), H = 3600e3
const REG = [
  { id: 'steam:730', source: 'steam', name: 'Counter-Strike 2', install: 'D:\\Steam\\steamapps\\common\\Counter-Strike Global Offensive' },
  { id: 'steam:1091500', source: 'steam', name: 'Cyberpunk 2077', install: 'D:\\Steam\\steamapps\\common\\Cyberpunk 2077' },
  { id: 'steam:271590', source: 'steam', name: 'Grand Theft Auto V', install: 'D:\\Steam\\steamapps\\common\\Grand Theft Auto V' },
  { id: 'steam:1086940', source: 'steam', name: 'Baldur\'s Gate 3', install: 'D:\\Steam\\steamapps\\common\\Baldurs Gate 3' },
  { id: 'epic:Fortnite', source: 'epic', name: 'Fortnite', install: 'C:\\Program Files\\Epic Games\\Fortnite' },
  { id: 'epic:Sugar', source: 'epic', name: 'Rocket League', install: 'C:\\Program Files\\Epic Games\\rocketleague' },
  { id: 'xbox:Playground.ForzaHorizon5_x', source: 'xbox', name: 'Forza Horizon 5', install: 'C:\\XboxGames\\Forza Horizon 5\\Content', aumid: 'Playground.ForzaHorizon5_x!App' },
]
const FILES = {
  'D:\\Steam\\steamapps\\common\\Counter-Strike Global Offensive': ['game\\bin\\win64\\cs2.exe'],
  'D:\\Steam\\steamapps\\common\\Cyberpunk 2077': ['bin\\x64\\Cyberpunk2077.exe'],
  'D:\\Steam\\steamapps\\common\\Grand Theft Auto V': ['GTA5.exe'],
  'D:\\Steam\\steamapps\\common\\Baldurs Gate 3': ['bin\\bg3_dx11.exe', 'bin\\bg3.exe'],
  'C:\\Program Files\\Epic Games\\Fortnite': ['FortniteGame\\Binaries\\Win64\\FortniteClient-Win64-Shipping.exe'],
  'C:\\Program Files\\Epic Games\\rocketleague': ['Binaries\\Win64\\RocketLeague.exe'],
  'C:\\XboxGames\\Forza Horizon 5\\Content': ['ForzaHorizon5.exe'],
  'D:\\Games\\Tiny': ['tiny.exe'],
}
const sessions = (gid, name, n, base, step, t0) => Array.from({ length: n }, (_, i) => ({ id: gid + i, game: { id: gid, name }, startedAt: t0 + i * 20 * H, durationSec: 1800 + i * 600, summary: { frames: 90000, avgFps: base + step * i, low1Fps: Math.round((base + step * i) * 0.62) } }))

const cache = new Map()
function rig(state, premium) {
  const key = state + '|' + premium
  if (cache.has(key)) return cache.get(key)
  const pc = { ifeo: {}, dx: {}, fso: {}, thr: new Set(), elevated: state !== 'fail', settings: {}, applied: false }
  const norm = s => String(s).toLowerCase()
  const lines = []
  const customs = state === 'first' || state === 'empty' ? [] : ['D:\\Games\\Tiny\\tiny.exe']
  const registry = state === 'empty' ? [] : REG
  const saved = { s: { customs } }
  if (state === 'legacy') pc.settings['tweak_game-cs2'] = 'applied'
  const setL = (v) => pc.settings = Object.assign(pc.settings, v)
  const thrText = () => (pc.elevated ? [...pc.thr].map(p => 'Application: ' + p).join('\n') || 'No applications are configured.' : 'This command requires administrator privileges and must be executed from an elevated command prompt.')
  const t0 = NOW - 18 * 24 * H
  const sess = state === 'first' || state === 'empty' ? [] : [...sessions('csgo', 'csgo', 6, 140, 4, t0), ...sessions('fortnite', 'fortnite', 3, 120, 3, NOW - 6 * 24 * H)]
  const svc = Games.create({
    registry: async () => ({ games: registry }), bases: () => [], exists: () => false,
    walk: dir => (FILES[dir] || []).map(rel => ({ path: dir + '\\' + rel, size: /bg3_dx11/.test(rel) ? 9e7 : 4e7 })),
    runPS: async () => ({ ok: true, out: JSON.stringify({ rows: allPaths().map(p => ({ p, ifeo: pc.ifeo[p] ?? null, dx: pc.dx[p] ?? null, fso: pc.fso[p] ?? null })), thr: thrText() }) }),
    runCmd: async cmd => {
      const m = /powerthrottling (disable|reset) \/path "(.+)"/.exec(cmd)
      if (m) { if (m[1] === 'disable') pc.thr.add(m[2]); else pc.thr.delete(m[2]) }
      return { ok: true, out: '', code: 0 }
    },
    runRecorded: async (control, action, meta, fn) => {
      await fn(async line => {
        let m
        if ((m = /Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\DirectX\\UserGpuPreferences' -Name '(.+?)' -Value '(.*?)' /.exec(line))) pc.dx[m[1]] = m[2]
        if ((m = /Remove-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\DirectX\\UserGpuPreferences' -Name '(.+?)'/.exec(line))) delete pc.dx[m[1]]
        if ((m = /Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers' -Name '(.+?)' -Value '(.*?)' /.exec(line))) pc.fso[m[1]] = m[2]
        if ((m = /Remove-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers' -Name '(.+?)'/.exec(line))) delete pc.fso[m[1]]
        return { ok: true }
      })
    },
    cpumem: { priority: async ({ exe }) => { for (const p of allPaths()) if (norm(p).endsWith('\\' + norm(exe))) pc.ifeo[p] = 3; return { ok: true } }, priorityClear: async ({ exe }) => { for (const p of allPaths()) if (norm(p).endsWith('\\' + norm(exe))) delete pc.ifeo[p]; return { ok: true } } },
    isPremium: () => premium,
    settings: () => ({ ...pc.settings, gameWatcherEnabled: false }),
    facts: () => ({ hybrid: true, laptop: false, build: 26100 }),
    listLines: async () => (state === 'running' ? ['@@cs2.exe|D:\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64\\cs2.exe'] : lines),
    sessions: () => sess, launch: async () => {},
    legacyRestore: async id => { pc.settings['tweak_game-' + id] = 'restored' },
    state: { read: () => saved.s, write: v => { saved.s = v } },
    now: () => Date.now(),
  })
  function allPaths() { return Object.entries(FILES).flatMap(([d, fs]) => fs.map(f => d + '\\' + f)) }
  const r = { svc, pc }
  cache.set(key, r)
  return r
}

function cover(id, name) {
  const h = [...id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 360, 7)
  const words = String(name).split(/\s+/).slice(0, 3)
  const t = words.map((w, i) => `<text x="150" y="${300 + i * 34}" text-anchor="middle" font-family="Georgia,serif" font-size="30" fill="#fff" fill-opacity=".92">${w.replace(/[<&]/g, '')}</text>`).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},55%,38%)"/><stop offset="1" stop-color="hsl(${(h + 55) % 360},60%,14%)"/></linearGradient></defs><rect width="300" height="450" fill="url(#g)"/><circle cx="220" cy="90" r="120" fill="#fff" fill-opacity=".06"/>${t}</svg>`
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
}

async function respond(name, args, ctx) {
  const state = ctx.ga || 'full'
  if (name === 'getGameCover') { const g = REG.find(x => x.id === args[0]); return g && g.source !== 'xbox' ? cover(g.id, g.name) : null }
  if (!/^games2/.test(name)) return undefined
  const { svc } = rig(state, !!ctx.premium)
  const a = args[0] || {}
  switch (name) {
    case 'games2Scan': if (state === 'fail') return { ok: false, error: 'scan-failed' }; return svc.scan(a)
    case 'games2State': return svc.state()
    case 'games2Run': return svc.run(a)
    case 'games2TuneAll': return svc.tuneAll()
    case 'games2UndoRun': return svc.undoRun(a)
    case 'games2History': return svc.history()
    case 'games2Launch': return svc.launch(a)
    case 'games2Favorite': return svc.favorite(a)
    case 'games2Hide': return svc.hide(a)
    case 'games2Migrate': return svc.migrate()
    case 'games2AddCustom': return { ok: false, canceled: true }
    case 'games2RemoveCustom': return svc.removeCustom(a)
    case 'games2PickExe': return { ok: false, canceled: true }
    case 'games2UseExe': return svc.useExe(a)
    case 'games2OpenFolder': return { ok: true }
    default: return undefined
  }
}
module.exports = { respond, known }
