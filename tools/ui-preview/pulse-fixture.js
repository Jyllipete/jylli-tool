'use strict'
// Preview fixtures for Pulse 2.0: the REAL lib/pulse service (frames, river columns, limiter, score, attribution, debrief, pre-flight) driven by a
// synthetic game, so the tab, the Cockpit and the HUD show real engine output. No PresentMon, no PowerShell, no registry.
// --pu-state live (default) | idle (no game, no frames) | hitchy (heat and stalls) | debrief (history already recorded) | fail (calls fail)
const Pulse = require('../../lib/pulse')
const Sess = require('../../lib/pulse/session')
const Steps = require('../../lib/pulse/steps')

const PRESETS = [['fortnite', 'Fortnite'], ['valorant', 'Valorant'], ['csgo', 'CS2 / CS:GO'], ['fivem', 'FiveM'], ['warzone', 'Warzone'], ['apex', 'Apex Legends'], ['minecraft', 'Minecraft'],
  ['arma', 'Arma Reforger'], ['tarkov', 'Escape from Tarkov'], ['rocketleague', 'Rocket League'], ['rust', 'Rust'], ['r6', 'Rainbow Six Siege'], ['overwatch', 'Overwatch 2']].map(([id, name]) => ({ id, name, exe: name }))
const sleep = ms => new Promise(r => setTimeout(r, ms))

let seed = 11
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }

function recorded(id, game, ago, hitchy) {
  const n = 600, bins = [], gpu = [], cpu = [], tmp = [], ram = []
  for (let i = 0; i < n; i++) {
    const hit = hitchy && (i === 120 || i === 121 || i === 300 || i === 455)
    bins.push({ fps: hit ? 22 : 142 + Math.round(Math.sin(i / 25) * 9), maxMs: hit ? 190 : 9 + (i % 5), frames: hit ? 22 : 140 })
    gpu.push(hit && i < 200 ? 99 : 88 + Math.round(Math.sin(i / 17) * 6)); cpu.push(hit && i === 300 ? 96 : 46 + Math.round(Math.sin(i / 11) * 9))
    tmp.push(hit && i === 455 ? 92 : 68 + Math.round(Math.sin(i / 60) * 4)); ram.push(58)
  }
  return { id, game, startedAt: Date.now() - ago, durationSec: n, bins, seconds: n, hist: [], edges: [],
    series: { 'gpu0.load': gpu, 'cpu.load': cpu, 'cpu.temp.package': tmp.map(v => v - 4), 'gpu0.temp.core': tmp, 'ram.load': ram }, summary: { frames: n * 140, avgFps: hitchy ? 118 : 141, low1Fps: hitchy ? 61 : 112, low01Fps: hitchy ? 38 : 94 } }
}
const SESSIONS = [
  recorded('aaaaaaaaaaa1', { id: 'valorant', name: 'Valorant' }, 3600e3 * 5, false),
  recorded('aaaaaaaaaaa2', { id: 'fivem', name: 'FiveM' }, 3600e3 * 29, true),
  recorded('aaaaaaaaaaa3', { id: 'apex', name: 'Apex Legends' }, 3600e3 * 75, true),
]

const insts = new Map()
function inst(sender, ctx) {
  let o = insts.get(sender.id)
  if (o) return o
  const st = ctx.pu || 'live'
  const sim = { t: 0, hot: false }
  const debriefs = {}
  const hub = { snapshot: () => {
    const hit = st === 'hitchy'
    const v = { 'cpu.load': 44 + Math.sin(sim.t / 9) * 9, 'cpu.temp.package': hit ? 91 : 66 + Math.sin(sim.t / 30) * 3, 'cpu.power': 88 + Math.sin(sim.t / 7) * 6, 'gpu0.load': hit ? 99 : 97 + Math.sin(sim.t / 5), 'gpu0.temp.core': hit ? 82 + Math.sin(sim.t / 20) * 6 : 68 + Math.sin(sim.t / 40) * 2,
      'gpu0.temp.hotspot': hit ? 94 : 79, 'gpu0.power': 312 + Math.sin(sim.t / 6) * 14, 'gpu0.clock.core': hit ? 2410 : 2745, 'gpu0.vram.used': 7200, 'gpu0.vram.total': 12288, 'ram.load': 61, 'net.rx': 380000 + Math.sin(sim.t) * 90000, 'net.tx': 52000 }
    const s = {}
    for (const k of Object.keys(v)) s[k] = [v[k], 120, k.startsWith('gpu0') ? 'nvidia' : k.startsWith('cpu.temp') || k === 'cpu.power' ? 'sensor' : 'os']
    return { s }
  } }
  const svc = Pulse.create({
    hub,
    send: (id, ch, p) => { if (sender.isDestroyed()) return false; try { sender.send('mock-event', ch === 'pulse2-live' ? 'onPulse2Live' : 'onPulse2Event', p); return true } catch { return false } },
    state: { read: () => null, write: () => {} },
    sessions: { list: () => (st === 'debrief' || st === 'hitchy' ? SESSIONS.map(s => ({ id: s.id, game: s.game, startedAt: s.startedAt, durationSec: s.durationSec, summary: s.summary, hasTelemetry: true })) : []), get: id => SESSIONS.find(s => s.id === id) || null },
    debriefs: { save: (id, d) => { debriefs[id] = d }, load: id => debriefs[id] || null, list: () => Object.values(debriefs) },
    activate: async ({ presetId, report }) => { for (const id of Steps.IDS) { await sleep(110); report(id, id === 'affinity' ? 'skip' : 'ok', id) } return { ok: true } },
    deactivate: async () => ({ ok: true }),
    baseline: () => ({ cpu: 12, gpu: 4, ram: 66, cpuTemp: 51 }),
    bgCpu: () => (st === 'hitchy' ? 41 : 3),
    probe: async () => ({ cpuTemp: 58, ramPct: 74, topProc: { name: 'chrome', cpu: 27 }, updateActive: true, powerPlan: { name: 'Balanced', high: false }, pendingReboot: false }),
  })
  if (st === 'debrief' || st === 'hitchy') for (const s of SESSIONS) debriefs[s.id] = Sess.build({ session: s, boost: { steps: Steps.IDS.map(id => ({ id, state: 'ok' })), baseline: { cpu: 12, gpu: 4, ram: 66, cpuTemp: 51 } }, marks: s.id === 'aaaaaaaaaaa2' ? [{ sec: 120, label: '' }, { sec: 300, label: 'rubber-band' }] : [], previous: null })
  o = insts.set(sender.id, { svc, sim, timer: null, st }).get(sender.id)
  if (st !== 'idle' && st !== 'fail') {
    svc.gameStarted(st === 'hitchy' ? 'fivem' : 'valorant', st === 'hitchy' ? 'FiveM' : 'Valorant')
    const frame = () => { const hitch = st === 'hitchy' && rnd() < 0.004; return hitch ? 60 + rnd() * 90 : (st === 'hitchy' ? 9.6 : 6.9) + (rnd() - 0.5) * (st === 'hitchy' ? 3 : 1.2) }
    for (let i = 0; i < 8000; i++) { if (i % 125 === 0) svc.live(); svc.onFrame(frame()) }   // a minute of play already on the river
    o.timer = setInterval(() => {
      if (sender.isDestroyed()) { clearInterval(o.timer); return }
      sim.t += 0.015
      svc.onFrame(frame())
    }, 4)
  }
  return o
}

async function handle(name, args, sender, ctx) {
  const req = args && args[0]
  const st = ctx.pu || 'live'
  if (name === 'pulseGetPresets') return PRESETS
  if (name === 'pulseGetCoreLoads') return Object.fromEntries(Array.from({ length: 16 }, (_, i) => [String(i), Math.round(30 + Math.sin(Date.now() / 900 + i) * 25 + (i === 3 ? 40 : 0))]))
  if (name === 'pulseThermalAudit') {
    for (let i = 1; i <= 10; i++) { try { sender.send('mock-event', 'onThermalProgress', { sample: i, of: 10, clkNow: 4400, temp: 78 }) } catch { /* gone */ } await sleep(60) }
    return { ok: true, severity: 'moderate', throttlePct: 12, avgCurMhz: 4390, maxMhz: 5000, avgTempC: 86, avgFanRpm: 1650, recommendation: 'airflow', throttleCause: 'thermal', boostScore: 71, coreClocks: [], sparkline: [], trend: { throttleDelta: -3, tempDelta: -2, ts: Date.now() - 864e5 } }
  }
  if (!/^pulse2/.test(name)) return undefined
  if (st === 'fail' && name !== 'pulse2Prefs') return { ok: false, error: 'boom' }
  const o = inst(sender, ctx), svc = o.svc
  switch (name) {
    case 'pulse2Status': return svc.status()
    case 'pulse2Subscribe': return svc.subscribe(sender.id)
    case 'pulse2Unsubscribe': return svc.unsubscribe(sender.id)
    case 'pulse2Boost': return svc.startBoost(req || {})
    case 'pulse2Unboost': return svc.stopBoost()
    case 'pulse2Preflight': return svc.preflight()
    case 'pulse2Sessions': return svc.sessions()
    case 'pulse2Session': return svc.session(req)
    case 'pulse2Mark': return svc.mark(req || '')
    case 'pulse2Prefs': return svc.prefs()
    case 'pulse2SetPrefs': return svc.setPrefs(req || {})
    case 'pulse2OpenCockpit': case 'pulse2CloseCockpit': case 'pulse2Hud': return { ok: true }
    default: return undefined
  }
}

module.exports = { handle, SESSIONS }
