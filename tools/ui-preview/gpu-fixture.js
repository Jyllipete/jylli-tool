'use strict'
// Preview fixtures for the GPU tab: the REAL lib/gpu service (probe parser, model, findings, limiter, run + verify, display keep/revert, Headroom test)
// on a synthetic PC. The pollers are replaced by generators that print the same JJGPLIVE lines and nvidia-smi csv lines the real ones do.
// --gp-state nvidia (default: desktop RTX 4070 held by its power limit, monitor below its best rate, Resizable BAR off)
//            | hybrid (laptop: Intel iGPU + RTX 4060 Laptop, games may start on the iGPU)  | hot (thermal throttle, fan stopped, hotspot far above core)
//            | amd (RX 7800 XT: no reason bits, only measured values)  | first (Windows cannot be read)  | fail (apply fails, no restore point)
const fs = require('fs'), path = require('path')
const Gpu = require('../../lib/gpu')
const detect = require('../../lib/gpu/detect')
const catalog = require('../../lib/gpu/catalog')
const { entries } = require('../list-tweaks')
const { RISK } = require('../../lib/tweak-risk')

const main = fs.readFileSync(path.join(__dirname, '..', '..', 'main.js'), 'utf8')
const RETIRED = Object.fromEntries([...main.slice(main.indexOf('const RETIRED_TWEAKS = {'), main.indexOf('function retireFivemTweaks')).matchAll(/^  '([a-z0-9-]+)':\s+'((?:[^'\\]|\\.)*)'/gm)].map(m => [m[1], m[2]]))
const TIER = Object.fromEntries(entries.map(e => [e.id, Number(e.tier) || 1]))

const PCS = {
  nvidia: { gpus: [{ name: 'NVIDIA GeForce RTX 4070', vendor: 'nvidia' }], vramGB: 12, laptop: false, nv: true, mon: [{ n: 'DELL G3223D', hz: 60, w: 2560, h: 1440, rates: [60, 120, 144, 165], edid: 165 }], rebar: false, irq: 'line', driverDate: '2025-11-02', caps: { form: 'desktop' } },
  hybrid: { gpus: [{ name: 'Intel(R) Iris(R) Xe Graphics', vendor: 'intel' }, { name: 'NVIDIA GeForce RTX 4060 Laptop GPU', vendor: 'nvidia' }], vramGB: 8, laptop: true, nv: true, mon: [{ n: 'Generic PnP Monitor', hz: 60, w: 1920, h: 1080, rates: [60, 144], edid: 144 }], rebar: true, irq: 'msi', driverDate: '2026-08-20', caps: { form: 'laptop' } },
  hot: { gpus: [{ name: 'NVIDIA GeForce RTX 3080', vendor: 'nvidia' }], vramGB: 10, laptop: false, nv: true, mon: [{ n: 'LG 27GP850', hz: 165, w: 2560, h: 1440, rates: [60, 120, 144, 165], edid: 165 }], rebar: true, irq: 'msi', driverDate: '2026-09-10', caps: { form: 'desktop' } },
  amd: { gpus: [{ name: 'AMD Radeon RX 7800 XT', vendor: 'amd' }], vramGB: 16, laptop: false, nv: false, mon: [{ n: 'Samsung Odyssey G5', hz: 144, w: 2560, h: 1440, rates: [60, 100, 144], edid: 165 }], rebar: null, irq: 'msi', driverDate: '2026-02-01', caps: { form: 'desktop' } },
}
PCS.first = PCS.nvidia; PCS.fail = PCS.nvidia

const plan = detect.plan()
const reqs = detect.requests(plan)
const defaults = () => { const r = {}; for (const q of reqs) r[q.k] = null; r['x|msi'] = 'off'; r['x|dxvrr'] = 'off'; return r }
function setProbe(reg, id, on) {
  for (const c of plan[id] || []) {
    const k = detect.keyOf(c)
    if (!on) { reg[k] = c.x ? 'off' : null; continue }
    reg[k] = c.x ? c.eq : c.eq && typeof c.eq === 'object' ? String('ge' in c.eq ? c.eq.ge : 0) : String(c.eq)
  }
}

// ── live generator: load swings, the clock follows it until the power limit (or heat) holds it, temperature lags behind ──
function frames(pc, state, t) {
  const phase = 0.5 + 0.5 * Math.sin(t / 7000)
  const load = Math.round(state === 'hot' ? 97 : 38 + 60 * phase)
  const hotCard = state === 'hot'
  const temp = Math.round((hotCard ? 86 : 58) + (hotCard ? 5 : 20) * phase + Math.sin(t / 2300))
  const clockMax = hotCard ? 1980 : 2850
  const capped = !hotCard && load >= 88
  const clock = Math.round(hotCard ? 1620 + 80 * Math.sin(t / 1500) : capped ? 2520 + 40 * Math.sin(t / 900) : 1400 + 1380 * (load / 100))
  const limit = pc.laptop ? 80 : 200
  const power = Math.round((hotCard ? limit * 0.99 : Math.min(limit, 20 + limit * 1.02 * (load / 100))) * 10) / 10
  const used = Math.round(pc.vramGB * 1024 * (0.3 + 0.25 * phase))
  const reasons = hotCard ? '0x20' : capped ? '0x4' : load < 20 ? '0x1' : '0x0'
  const fan = hotCard ? 0 : Math.round(25 + 50 * phase)
  const eng = { gfx: load, compute: Math.round(load > 60 ? 4 : 0), copy: Math.round(3 + 4 * phase), decode: Math.round(phase > 0.7 ? 22 : 0), encode: 0, vproc: 0 }
  const procs = [['game', Math.max(1, load - 8), Math.round(used * 0.8)], ['dwm', 3, 160], ['chrome', Math.round(4 * phase), 210], ['obs64', Math.round(phase > 0.7 ? 16 : 0), 380]].filter(p => p[1] > 0 || p[2] > 100).map((p, i) => [100 + i, ...p])
  const ps = 'JJGPLIVE:' + JSON.stringify({ t, luid: '0x0_0x1', mem: { dedicated: used, shared: 120 }, eng, procs })
  const smi = state === 'amd' || !pc.nv ? null : `0, ${load}, ${clock}, 10000, ${clockMax}, 10501, ${power}, ${limit}, ${temp}, ${fan}, ${used}, ${pc.vramGB * 1024}, ${load < 20 ? 'P8' : 'P2'}, ${load > 30 ? 4 : 1}, 16, ${reasons}`
  return { ps, smi }
}

function build(state) {
  const pc = PCS[state] || PCS.nvidia
  const reg = defaults(), settings = { isPremium: true }, journal = []
  const now = Date.now()
  if (state === 'hot') { setProbe(reg, 'tdr-delay', true); settings['tweak_tdr-delay'] = 'applied'; reg['r|HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers|HwSchMode'] = '2'
    journal.push({ id: 'e1', batchId: 'b-1', tweakId: 'tdr-delay', action: 'apply', via: 'manual', ts: now - 30 * 3600000, result: 'ok', fidelity: 'exact', changes: [{ kind: 'reg' }] },
      { id: 'e2', batchId: 'b-2', control: 'gpu-power-limit', action: 'apply', via: 'manual', ts: now - 5 * 3600000, result: 'ok', changes: [{ kind: 'gpu-power-limit', before: { watts: 320 }, after: { watts: 280 } }] }) }
  if (state === 'nvidia') { reg['r|HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers|HwSchMode'] = '2' }
  return { pc, reg, settings, journal, mode: pc.mon.map(m => m.hz) }
}

const insts = new Map()
function svc(sender, ctx) {
  const state = ctx.gp || 'nvidia'
  const key = sender.id + ':' + state
  let o = insts.get(key)
  if (o) return o
  const now = Date.now(), w = build(state), store = { v: null }
  const send = (ev, data) => { try { sender.send('mock-event', ev, data) } catch (e) { /* window closed */ } }
  const timers = new Set()
  let power = w.pc.nv && !w.pc.laptop ? { supported: true, min: 100, max: 220, default: 200, current: state === 'hot' ? 200 : 200, name: w.pc.gpus[0].name, needsAdmin: false, policy: 'session' } : { supported: false, reason: w.pc.laptop ? 'laptop' : 'no-nvidia-gpu' }
  const scanOut = () => {
    const pc = w.pc
    const f = {
      gpus: pc.gpus.map(g => ({ name: g.name, driver: '32.0.15.8157', date: pc.driverDate, pnp: 'PCI\\VEN_10DE', status: 'OK' })), vram: pc.gpus.map((g, i) => ({ name: g.name, bytes: (i === pc.gpus.length - 1 ? pc.vramGB : 1) * 1024 ** 3 })),
      irq: pc.gpus.map((g, i) => ({ name: g.name, irq: i === pc.gpus.length - 1 ? [pc.irq === 'msi' ? 4294967000 : 17] : [] })), battery: pc.laptop, chassis: [pc.laptop ? 10 : 3],
      smi: pc.nv ? { slowdownC: 92, shutdownC: 98, targetC: 83, bar1MiB: pc.rebar ? pc.vramGB * 1024 : 256, fbMiB: pc.vramGB * 1024, q: `4,16,${state === 'hot' ? 1980 : 2850},10501,200,200,100,220` } : null }
    const disp = pc.mon.map((m, i) => `DISP=\\\\.\\DISPLAY${i + 1}|${m.n}|${i === 0 ? 1 : 0}|${m.w}|${m.h}|${w.mode[i]}|32|${m.rates.map(r => `${m.w}x${m.h}@${r}`).join(',')},640x480@60`).join('\n')
    return 'JJGP:' + JSON.stringify({ r: w.reg, f }) + '\nREMOTE=0\n' + disp + '\nEDIDMAX=' + (pc.mon.length === 1 ? pc.mon[0].edid : '') + '\n'
  }
  const deps = {
    runPS: async script => {
      if (script.includes('JJGP:')) return state === 'first' ? { ok: false, out: '' } : { ok: true, out: scanOut() }
      if (script.includes('[JD]::Set(')) {
        const m = /\[JD\]::Set\('([^']+)', (\d+), (\d+), (\d+), (\d)\)/.exec(script)
        if (m && m[5] !== '2') { const i = Number((/DISPLAY(\d+)/.exec(m[1]) || [])[1]) - 1; if (i >= 0) w.mode[i] = Number(m[4]) }
        return { ok: true, out: 'JDRESULT=0' }
      }
      return { ok: true, out: '' }
    },
    applyBatch: async req => {
      if (state === 'fail') return { ok: false, aborted: true, reason: 'restore-point-failed', guidance: 'Turn on System Protection for the system drive, then try again.', restorePoint: { ok: false } }
      const items = req.items.map(i => {
        const reboot = !!catalog.byId[i.tweakId].reboot
        setProbe(w.reg, i.tweakId, i.action === 'apply' && !reboot)
        w.settings['tweak_' + i.tweakId] = i.action === 'apply' ? 'applied' : 'restored'
        w.journal.unshift({ id: 'n' + Math.random().toString(36).slice(2, 7), batchId: 'nb', tweakId: i.tweakId, action: i.action, via: 'manual', ts: Date.now(), result: 'ok', fidelity: 'exact', changes: [{ kind: 'reg' }] })
        return { id: i.tweakId, action: i.action, status: 'ok', journalId: 'j-' + i.tweakId, fidelity: 'exact' }
      })
      await new Promise(r => setTimeout(r, 700))
      return { ok: true, batchId: 'nb', items, restorePoint: { ok: true } }
    },
    journalList: () => w.journal,
    undo: async t => { for (const e of w.journal.filter(x => x.batchId === t.batchId || x.id === t.entryId)) { if (e.tweakId) { setProbe(w.reg, e.tweakId, false); w.settings['tweak_' + e.tweakId] = 'restored' } e.undoneBy = 'u' + e.id } return { ok: true } },
    runRecorded: async (control, action, meta, fn) => { const ch = []; await fn(async () => ({ ok: true }), async () => ({ ok: true }), c => ch.push(c)); w.journal.unshift({ id: 'p' + Date.now(), batchId: meta.batchId, control, action, via: 'manual', ts: Date.now(), result: 'ok', changes: ch }) },
    tweakMeta: ids => ids.filter(id => TIER[id]).map(id => ({ id, safetyTier: RETIRED[id] ? 1 : TIER[id], gamerImpact: 'medium', retired: RETIRED[id] || null, risk: RISK[id] || null, fidelity: 'exact' })),
    applicability: () => (state === 'nvidia' ? { 'msi-mode': { show: true, state: 'recommended' } } : {}),
    caps: () => w.pc.caps, isPremium: () => !!ctx.premium, settings: () => w.settings, state: { read: () => store.v, write: v => { store.v = v } },
    bootMs: () => now - 3 * 3600000, now: () => Date.now(), gameRunning: () => false,
    hub: keys => Object.fromEntries(keys.map(k => [k, k === 'gpu0.temp.core' ? null : k === 'gpu0.temp.hotspot' ? (state === 'hot' ? 108 : null) : null])),
    power: async () => power,
    confirmMs: 15000,
    emit: (ch, p) => send({ 'gpu2-live': 'onGpu2Live', 'gpu2-progress': 'onGpu2Progress', 'gpu2-display': 'onGpu2Display', 'gpu2-test': 'onGpu2Test' }[ch], p),
    spawnLive: ({ onLine }) => {
      let live = true
      const tick = () => { if (live) onLine(frames(w.pc, state, Date.now()).ps + '\n') }
      const first = setTimeout(tick, 50), iv = setInterval(tick, 1000)
      timers.add(iv)
      return { kill() { live = false; clearTimeout(first); clearInterval(iv); timers.delete(iv) } }
    },
    spawnSmi: ({ onLine }) => {
      let live = true
      const tick = () => { const f = frames(w.pc, state, Date.now()); if (live && f.smi) onLine(f.smi + '\n') }
      const first = setTimeout(tick, 20), iv = setInterval(tick, 1000)
      timers.add(iv)
      return { kill() { live = false; clearTimeout(first); clearInterval(iv); timers.delete(iv) } }
    },
  }
  o = { svc: Gpu.create(deps), w, power: () => power, setPower: p => { power = p } }
  insts.set(key, o)
  return o
}

async function handle(name, args, sender, ctx) {
  const o = svc(sender, ctx), a = args[0] || {}
  switch (name) {
    case 'gpu2Scan': return o.svc.scan()
    case 'gpu2Cached': return (await o.svc.cached()) || { ok: false }
    case 'gpu2Run': return o.svc.run({ ids: a.ids || [], action: a.action })
    case 'gpu2History': return o.svc.history()
    case 'gpu2Undo': return o.svc.undo(a.target || {}, { force: !!a.force })
    case 'gpu2LiveStart': return o.svc.liveStart()
    case 'gpu2LiveBeat': return o.svc.heartbeat()
    case 'gpu2LiveStop': o.svc.liveStop(); return { ok: true }
    case 'gpu2DisplaySet': return o.svc.displaySet(a)
    case 'gpu2DisplayAnswer': return o.svc.displayAnswer(a)
    case 'gpu2TestStart': return o.svc.testStart()
    case 'gpu2TestStop': return o.svc.testStop('stopped')
    case 'gpu2TestFinish': return o.svc.testFinish(a)
    case 'gpu2Tests': return o.svc.tests()
    case 'gpuPowerLimitGet': return o.power()
    case 'gpuPowerLimitSet': { const p = o.power(); if (!p.supported) return { ok: false, reason: 'unsupported' }; o.setPower({ ...p, current: a.watts }); return { ok: true, before: p.current, after: a.watts } }
    case 'gpuPowerLimitReset': { const p = o.power(); if (p.supported) o.setPower({ ...p, current: p.default }); return { ok: true } }
    default: return undefined
  }
}

module.exports = { handle }
