'use strict'
// Preview fixtures for FiveM 2.0: the REAL ini, graphics, readiness, route-verdict, attribution and signature code on a synthetic PC.
// --fv-state clean (default) | lossy (loss starts at the ISP) | noinstall (FiveM not installed) | first (no server saved yet) | fail (scan error)
const Ini = require('../../lib/fivem/ini')
const Gfx = require('../../lib/fivem/graphics')
const Cat = require('../../lib/fivem/catalog')
const Ready = require('../../lib/fivem/readiness')
const Sig = require('../../lib/fivem/signatures')
const Attr = require('../../lib/fivem/attribution')

const INI = '[Game]\r\nIVPath=C:\\Games\\Grand Theft Auto V\r\nUpdateChannel=canary\r\nDisableNVSP=0\r\nEnableFullMemoryDump=0\r\nSavedBuildNumber=3258\r\nTelemetry=1\r\n'
const XML = ['TextureQuality 3', 'ShaderQuality 2', 'AnisotropicFiltering 16', 'ShadowQuality 3', 'Shadow_Distance 1.000000', 'Shadow_SoftShadows 2', 'UltraShadows_Enabled true', 'ReflectionQuality 3', 'SSAO 2',
  'LodScale 1.500000', 'PedLodBias 0.500000', 'VehicleLodBias 0.500000', 'GrassQuality 3', 'CityDensity 1.000000', 'ParticleQuality 2', 'WaterQuality 2', 'PostFX 3', 'DoF true', 'MotionBlurStrength 0.500000', 'Tessellation 2', 'MSAA 4', 'FXAA_Enabled false']
  .map(l => { const [k, v] = l.split(' '); return `    <${k} value="${v}" />` }).join('\n')
const GFX = `<?xml version="1.0"?>\n<Settings>\n  <graphics>\n${XML}\n  </graphics>\n</Settings>\n`

const SERVERS = [
  { id: 'a1b2c3d4', host: '203.0.113.9', port: 30120, name: 'Los Santos Stories RP', code: 'ls1234' },
  { id: 'e5f6a7b8', host: 'play.example-rp.net', port: 30120, name: 'Vinewood Roleplay', code: null },
]
const live = { a1b2c3d4: { players: 148, max: 256, httpMs: 41 }, e5f6a7b8: { players: 32, max: 64, httpMs: 58 } }

const HOPS = [[1, '192.168.1.1', 1.1], [2, '81.2.69.1', 8.4], [3, null, null], [4, '62.4.5.6', 12.7], [5, '195.12.3.4', 17.2], [6, '80.1.2.3', 21.8], [7, '203.0.113.9', 24.5]]
let seed = 7
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
function round(state, i) {
  const lossy = state === 'lossy'
  const h = HOPS.map(([ttl, ip, base]) => {
    if (ip == null) return [ttl, null, null]
    const jit = ttl === 1 ? 0.4 : 1.8
    const lost = lossy && ttl >= 5 && rnd() < 0.11
    return [ttl, ip, lost ? null : Math.round((base + (rnd() - 0.5) * 2 * jit + (lossy && ttl >= 5 ? 6 : 0)) * 10) / 10]
  })
  return { d: 7, h, tcp: lossy && rnd() < 0.1 ? null : Math.round((26 + rnd() * 3) * 10) / 10 }
}

function session(id, hitchy) {
  const n = 480, bins = [], gpu = [], cpu = [], temp = []
  for (let i = 0; i < n; i++) {
    const hit = hitchy && (i === 90 || i === 91 || i === 210 || i === 333)
    bins.push({ fps: hit ? 24 : 72 + Math.round(Math.sin(i / 20) * 6), maxMs: hit ? 210 : 19 + (i % 7), frames: hit ? 24 : 70 })
    gpu.push(hit && i < 100 ? 99 : 78 + Math.round(Math.sin(i / 15) * 8)); cpu.push(hit && i === 210 ? 96 : 42 + Math.round(Math.sin(i / 11) * 9)); temp.push(hit && i === 333 ? 91 : 71)
  }
  return { id, game: { id: 'fivem', name: 'FiveM' }, startedAt: Date.now() - 86400000, durationSec: n, bins, seconds: n, hist: [], edges: [],
    series: { 'gpu0.load': gpu, 'cpu.load': cpu, 'gpu0.temp.core': temp, 'ram.load': new Array(n).fill(61) }, summary: { avgFps: 71, low1Fps: 44, frames: n * 70 } }
}

function report(ctx) {
  const st = ctx.fv || 'clean'
  const installed = st !== 'noinstall'
  const ini = installed ? Ini.read(INI) : null
  const g = Gfx.read(GFX)
  const vramMB = 6144
  const applied = { priority: true, 'io-priority': false, fso: true, gamebar: false, defender: false }
  const iniv = ini ? Object.fromEntries(ini.known.map(k => [k.key, k.value])) : {}
  const mods = installed ? [{ file: 'ScriptHookV.dll', dir: 'C:\\Games\\Grand Theft Auto V', id: 'scripthookv', sev: 'high' }, { file: 'ReShade.ini', dir: 'C:\\Games\\Grand Theft Auto V', id: 'reshade', sev: 'low' }] : []
  const r = Ready.evaluate({ installed, gtaOk: installed, gtaPath: 'C:\\Games\\Grand Theft Auto V', running: false, settingsExists: installed, channel: iniv.UpdateChannel, fullDump: false,
    textureQuality: installed ? g.values.TextureQuality : null, textureLimit: installed ? Gfx.textureLimit(vramMB) : null, vramMB, mods, cacheMB: installed ? 3480 : null, route: null })
  return {
    v: 1, at: Date.now(), admin: true, running: false,
    loc: { installed, gtaOk: installed, gtaPath: 'C:\\Games\\Grand Theft Auto V', gtaSource: 'ini', iniExists: installed, settingsExists: installed, exes: ['FiveM.exe', 'FiveM_b3258_GTAProcess.exe'] },
    ini, gfx: installed ? { structure: g.structure, values: g.values, load: Gfx.load(g.values), vramMB, textureLimit: Gfx.textureLimit(vramMB) } : null,
    tweaks: Cat.IDS.map(id => ({ ...Cat.meta(id), applied: installed ? applied[id] === true : null })),
    cache: { mb: installed ? 3480 : 0, folders: installed ? [{ key: 'browser', mb: 410 }, { key: 'subprocess', mb: 96 }, { key: 'private', mb: 2210 }, { key: 'nui', mb: 764 }] : [] },
    mods, findings: r.findings, passed: r.passed, legacy: installed ? ['fivem-network', 'fivem-mmcss'] : [],
  }
}

const timers = new Map()
async function handle(name, args, sender, ctx) {
  const req = args && args[0]
  const st = ctx.fv || 'clean'
  const send = (ch, d) => { try { sender.send('mock-event', ch, d) } catch { /* window gone */ } }
  const servers = () => ({ ok: true, servers: st === 'first' ? [] : SERVERS, active: st === 'first' ? null : SERVERS[0].id })
  switch (name) {
    case 'fivem2Scan': return st === 'fail' ? { ok: false, error: 'boom' } : { ok: true, report: report(ctx), ...servers() }
    case 'fivem2Cached': return { ok: true, last: null, ...servers() }
    case 'fivem2Servers': return servers()
    case 'fivem2ServerAdd': return { ok: true, server: SERVERS[0], live: { ...live.a1b2c3d4, reachable: true }, ...servers() }
    case 'fivem2ServerLive': return { ok: true, ...(live[req && req.id] || live.a1b2c3d4) }
    case 'fivem2ImportBookmarks': case 'fivem2ServerUse': case 'fivem2ServerRemove': return servers()
    case 'fivem2RouteSnapshot': return { ok: true, running: false, meta: null, state: null }
    case 'fivem2RouteStart': {
      const id = req && req.id
      clearInterval(timers.get(sender.id))
      let i = 0
      setTimeout(() => {
        const burst = setInterval(() => { send('onFivem2Route', { id, round: round(st, i++) }); if (i >= 45) { clearInterval(burst); timers.set(sender.id, setInterval(() => send('onFivem2Route', { id, round: round(st, i++) }), 1000)) } }, 40)
      }, 350)
      return { ok: true, id, ip: '203.0.113.9', port: 30120 }
    }
    case 'fivem2RouteStop': clearInterval(timers.get(sender.id)); return { ok: true }
    case 'fivem2Mtu': return { ok: true, mtu: 1492 }
    case 'fivem2Connect': return { ok: true }
    case 'fivem2Apply': case 'fivem2Undo': case 'fivem2CacheClear': case 'fivem2LegacyRestore': return { ok: true }
    case 'fivem2IniWrite': return { ok: true, changed: Object.keys((req && req.changes) || {}), rejected: [] }
    case 'fivem2GfxWrite': return { ok: true, changed: Object.keys((req && req.changes) || {}), rejected: [] }
    case 'fivem2GfxPreset': { const g = Gfx.read(GFX); return { ok: true, changes: Gfx.preset(req && req.name, g.values, 6144), current: g.values } }
    case 'fivem2Legacy': return { ok: true, legacy: ['fivem-network', 'fivem-mmcss'] }
    case 'fivem2Mods': return { ok: true, found: report(ctx).mods, scanned: [] }
    case 'fivem2Logs': {
      const text = ['[ 1203.554] CitizenFX build 3258 started', '[ 1203.9] Loaded resource chat', '[ 1480.1] warning: resource spawnmanager took 410ms', '[ 2110.7] DXGI_ERROR_DEVICE_HUNG: the GPU stopped responding', '[ 2111.0] error: failed to load d3d11_extra.dll', '[ 2111.4] Unhandled exception at 0x00007FF', '[ 2111.5] crash dump written'].join('\n')
      const lines = Sig.parse(text)
      return { ok: true, file: 'CitizenFX_log_2026-11-10.log', at: Date.now() - 3600000, lines, found: Sig.scan(lines) }
    }
    case 'fivem2Sessions': return { ok: true, sessions: [
      { id: 's1', startedAt: Date.now() - 86400000, durationSec: 480, summary: { avgFps: 71 }, hasTelemetry: true, server: { host: SERVERS[0].host, name: SERVERS[0].name }, hasNet: true },
      { id: 's2', startedAt: Date.now() - 3 * 86400000, durationSec: 1900, summary: { avgFps: 88 }, hasTelemetry: true, server: null, hasNet: false }] }
    case 'fivem2Session': {
      const s = session(req && req.id, req && req.id === 's1')
      const rtt = Array.from({ length: 460 }, (_, i) => (i === 130 || i === 131 ? null : i === 300 ? 310 : 26 + (i % 5)))
      const net = req && req.id === 's1' ? { server: SERVERS[0], rtt, offsetSec: 10 } : null
      return { ok: true, session: s, net, analysis: Attr.analyze({ ...s, net: net && { rtt } }) }
    }
    default: return undefined
  }
}

module.exports = { handle, report }
