'use strict'
// Preview fixtures for the CPU & Memory tab: the REAL lib/cpumem service (probe parser, topology, model, findings, run + verify, Lab) on a synthetic PC.
// The poller is replaced by a generator that writes the same JJCMLIVE lines the PowerShell script prints, so the page runs exactly as in the app.
// --cm-state x3d (default: 7950X3D, XMP off, no V-Cache driver) | hybrid (14900K, old microcode, Windows 10, mixed RAM, Power saver)
//            | pressure (4 cores / 8 GB, memory almost full, disk reads) | first (Windows cannot be read) | fail (apply fails, no restore point)
const fs = require('fs'), path = require('path')
const CpuMem = require('../../lib/cpumem')
const detect = require('../../lib/cpumem/detect')
const catalog = require('../../lib/cpumem/catalog')
const { entries } = require('../list-tweaks')
const { RISK } = require('../../lib/tweak-risk')

const main = fs.readFileSync(path.join(__dirname, '..', '..', 'main.js'), 'utf8')
const RETIRED = Object.fromEntries([...main.slice(main.indexOf('const RETIRED_TWEAKS = {'), main.indexOf('function retireFivemTweaks')).matchAll(/^  '([a-z0-9-]+)':\s+'((?:[^'\\]|\\.)*)'/gm)].map(m => [m[1], m[2]]))
const TIER = Object.fromEntries(entries.map(e => [e.id, Number(e.tier) || 1]))
const bits = (from, n) => String(((1n << BigInt(n)) - 1n) << BigInt(from))
const BAL = catalog.BALANCED, SAVER = catalog.SAVER

const PCS = {
  x3d: {
    cpu: { name: 'AMD Ryzen 9 7950X3D 16-Core Processor', baseMHz: 4200, cores: 16, threads: 32 }, mhzMax: 5000, scheme: BAL,
    topo: [...Array.from({ length: 16 }, (_, i) => `C|0|0|${bits(i * 2, 2)}`), `L|3|${96 * 1024}|0|${bits(0, 16)}`, `L|3|${32 * 1024}|0|${bits(16, 16)}`],
    slots: 4, sticks: [0, 1].map(i => ({ slot: 'DIMM_A' + (i + 1), bank: 'BANK ' + i + ' Controller0ChannelADimm' + i, capGB: 16, ratedMT: 6000, runMT: 4800, type: 34, part: 'F5-6000J3038F16G' })), totalMB: 32768,
    caps: { form: 'desktop', os: { win10Eol: false, win11: true }, sec: { hvciRunning: true }, tools: { amd3dSvc: false }, ram: { xmp: 'off', type: 'DDR5' }, cpu: { name: 'AMD Ryzen 9 7950X3D', vendor: 'amd', x3d: true, dualCcdX3d: true, hybrid: false, hvciCostly: false } },
  },
  hybrid: {
    cpu: { name: 'Intel(R) Core(TM) i9-14900K', baseMHz: 3200, cores: 24, threads: 32 }, mhzMax: 5600, scheme: SAVER,
    topo: [...Array.from({ length: 8 }, (_, i) => `C|1|0|${bits(i * 2, 2)}`), ...Array.from({ length: 16 }, (_, i) => `C|0|0|${bits(16 + i, 1)}`), `L|3|${36 * 1024}|0|${bits(0, 32)}`],
    slots: 4, sticks: [{ slot: 'A', bank: 'ChannelA', capGB: 16, ratedMT: 5600, runMT: 5600, type: 34, part: 'a' }, { slot: 'B', bank: 'ChannelB', capGB: 8, ratedMT: 4800, runMT: 4800, type: 34, part: 'b' }], totalMB: 24576,
    caps: { form: 'desktop', os: { win10Eol: true, win11: false }, sec: { hvciRunning: false }, tools: { amd3dSvc: null }, ram: { xmp: 'on', type: 'DDR5' }, cpu: { name: 'Intel Core i9-14900K', vendor: 'intel', x3d: false, dualCcdX3d: false, hybrid: true, raptorLakeDesktop: true, microcode: 0x129, hvciCostly: false } },
  },
  pressure: {
    cpu: { name: 'Intel(R) Core(TM) i5-1135G7 @ 2.40GHz', baseMHz: 2419, cores: 4, threads: 8 }, mhzMax: 4200, scheme: BAL,
    topo: [...Array.from({ length: 4 }, (_, i) => `C|0|0|${bits(i * 2, 2)}`), `L|3|${8 * 1024}|0|${bits(0, 8)}`],
    slots: 2, sticks: [{ slot: 'Bottom-Slot 1(left)', bank: 'Controller0ChannelADimm0', capGB: 8, ratedMT: 3200, runMT: 3200, type: 26, part: 'HMA81GS6DJR8N-XN' }], totalMB: 7872,
    caps: { form: 'laptop', os: { win10Eol: false, win11: true }, sec: { hvciRunning: true }, tools: { amd3dSvc: null }, ram: { xmp: 'on', type: 'DDR4' }, cpu: { name: 'Intel Core i5-1135G7', vendor: 'intel', x3d: false, dualCcdX3d: false, hybrid: false, hvciCostly: false } },
  },
}

const plan = detect.plan()
const reqs = detect.requests(plan)
const defaults = scheme => { const r = {}; for (const q of reqs) r[q.k] = q.a === 's' ? 'Automatic' : q.a === 'p' ? '0' : null; r['x|scheme'] = scheme; r['x|hvlaunch'] = 'auto'; r['x|pagefile'] = 'True'; r['x|memcomp'] = 'True'; r['x|procmit'] = 'NOTSET'; r['p|SUB_PROCESSOR PROCTHROTTLEMIN'] = '5'; return r }
function setProbe(reg, id, on) {
  for (const c of plan[id] || []) {
    const k = detect.keyOf(c)
    if (c.x === 'scheme') continue
    if (!on) { reg[k] = c.s ? 'Automatic' : c.p ? '0' : c.x === 'memcomp' ? 'True' : c.x === 'procmit' ? 'NOTSET' : c.x === 'hvlaunch' ? 'auto' : null; continue }
    reg[k] = c.s ? c.eq : c.p ? String(c.eq) : c.x ? c.eq : c.eq && typeof c.eq === 'object' ? String('ge' in c.eq ? c.eq.ge : 0) : String(c.eq)
  }
}

// ── live generator: smooth per-core load, clocks that follow it, parked cores on the second CCD / efficiency cores ──
function liveFrame(pc, state, t, nCores) {
  const wave = (i, k) => 0.5 + 0.5 * Math.sin(t / (1700 + i * 130) + i * 1.7 + k)
  const rows = []; let sum = 0
  for (let i = 0; i < pc.threads; i++) {
    const hot = state === 'pressure' ? 0.55 : i < pc.threads / 2 ? 0.45 : 0.15
    const u = Math.max(1, Math.min(99, Math.round(100 * hot * wave(i, 0) + (i % 3 === 0 ? 12 : 0))))
    const parked = state === 'x3d' && i >= 20 && i < 32 && u < 40 || (state === 'hybrid' && i >= 16 && i % 3 === 0)
    const perf = Math.round((60 + u * 0.7) * 10) / 10
    sum += u
    rows.push(['0,' + i, u, perf, Math.round(perf / 100 * pc.baseMHz), parked ? 1 : 0])
  }
  const avg = Math.round(sum / pc.threads)
  rows.push(['_Total', avg, Math.round((60 + avg * 0.7) * 10) / 10, 0, 0])
  const total = pc.totalMB, usedPct = state === 'pressure' ? 0.93 + 0.02 * Math.sin(t / 3000) : 0.46 + 0.04 * Math.sin(t / 4000)
  const avail = Math.round(total * (1 - usedPct))
  const mem = { totalMB: total, avail, commit: Math.round(total * (state === 'pressure' ? 1.17 : 0.7)), limit: Math.round(total * (state === 'pressure' ? 1.42 : 1.5)), modified: state === 'pressure' ? 120 : 210, standby: Math.round(avail * (state === 'pressure' ? 0.9 : 0.7)),
    free: Math.round(avail * (state === 'pressure' ? 0.1 : 0.3)), paged: 420, nonpaged: 610, reads: state === 'pressure' ? 340 + Math.round(60 * Math.sin(t / 900)) : 4, compressed: state === 'pressure' ? 1900 : 420 }
  return 'JJCMLIVE:' + JSON.stringify({ t, mem, cpu: rows })
}

function build(state, now) {
  const pc = PCS[state] || PCS.x3d
  const reg = defaults(pc.scheme), settings = { isPremium: true }, journal = []
  if (state === 'x3d') { setProbe(reg, 'power-throttling', true); setProbe(reg, 'sysmain', true); settings['tweak_sysmain'] = 'applied'; settings['tweak_cpu-parking'] = 'applied'; setProbe(reg, 'cpu-parking', false)
    journal.push({ id: 'e1', batchId: 'b-1', tweakId: 'sysmain', action: 'apply', via: 'manual', ts: now - 30 * 3600000, result: 'ok', fidelity: 'exact', changes: [{ kind: 'service' }] }, { id: 'e2', batchId: 'b-2', control: 'cpumem:priority:game.exe', action: 'apply', via: 'manual', ts: now - 4 * 3600000, result: 'ok', changes: [{ kind: 'reg' }] }) }
  if (state === 'hybrid') { setProbe(reg, 'global-timer-resolution', true) }
  if (state === 'pressure') { reg['s|SysMain'] = 'Automatic' }
  return { pc, reg, settings, journal }
}

const insts = new Map()
function svc(sender, ctx) {
  const key = sender.id + ':' + (ctx.cm || 'x3d')
  let o = insts.get(key)
  if (o) return o
  const state = ctx.cm || 'x3d'
  const now = Date.now(), w = build(state, now), store = { v: null }
  const timers = new Set()
  const send = (ev, data) => { try { sender.send('mock-event', ev, data) } catch (e) { /* window closed */ } }
  const deps = {
    runPS: async script => {
      if (script.includes('JJCM:')) return state === 'first' ? { ok: false, out: '' } : { ok: true, out: 'JJCM:' + JSON.stringify({ r: w.reg, f: { scheme: w.reg['x|scheme'], topo: w.pc.topo, cpu: w.pc.cpu, slots: w.pc.slots, sticks: w.pc.sticks, vbs: true, hvci: true } }) }
      if (script.includes('JJPURGE:')) return { ok: true, out: 'JJPURGE:' + JSON.stringify({ before: 1850, after: 140, status: 0 }) }
      if (script.includes('JJCONS:')) return { ok: true, out: ['chrome#1|34|1200', 'chrome#2|20|640', 'Code|18|820', 'MsMpEng|9|310', 'dwm|7|210', 'game|60|3400', 'explorer|2|180', 'Teams|11|560'].map(l => 'JJCONS:' + l).join('\n') }
      if (script.includes('JJPIN:')) return { ok: true, out: 'JJPIN:{"pinned":1,"failed":0}' }
      if (script.includes('JJPRIO:')) return { ok: true, out: 'JJPRIO:{"game.exe":"6"}' }
      return { ok: true, out: '' }
    },
    applyBatch: async req => {
      if (state === 'fail') return { ok: false, aborted: true, reason: 'restore-point-failed', guidance: 'Turn on System Protection for the system drive, then try again.', restorePoint: { ok: false } }
      const items = req.items.map(i => {
        const reboot = !!catalog.byId[i.tweakId].reboot
        setProbe(w.reg, i.tweakId, i.action === 'apply' && !reboot)
        if (i.tweakId === 'power-balanced-restore' && i.action === 'apply') w.reg['x|scheme'] = BAL
        w.settings['tweak_' + i.tweakId] = i.action === 'apply' ? 'applied' : 'restored'
        w.journal.unshift({ id: 'n' + Math.random().toString(36).slice(2, 7), batchId: 'nb', tweakId: i.tweakId, action: i.action, via: 'manual', ts: Date.now(), result: 'ok', fidelity: 'exact', changes: [{ kind: 'reg' }] })
        return { id: i.tweakId, action: i.action, status: 'ok', journalId: 'j-' + i.tweakId, fidelity: 'exact' }
      })
      await new Promise(r => setTimeout(r, 700))
      return { ok: true, batchId: 'nb', items, restorePoint: { ok: true } }
    },
    journalList: () => w.journal,
    undo: async t => { for (const e of w.journal.filter(x => x.batchId === t.batchId || x.id === t.entryId)) { if (e.tweakId) { setProbe(w.reg, e.tweakId, false); w.settings['tweak_' + e.tweakId] = 'restored' } e.undoneBy = 'u' + e.id } return { ok: true } },
    runRecorded: async (control, action, meta, fn) => { await fn(async () => ({ ok: true })); w.journal.unshift({ id: 'p' + Date.now(), batchId: meta.batchId, control, action, via: 'manual', ts: Date.now(), result: 'ok', changes: [{ kind: 'reg' }] }) },
    tweakMeta: ids => ids.filter(id => TIER[id]).map(id => ({ id, safetyTier: RETIRED[id] ? 1 : TIER[id], gamerImpact: 'medium', retired: RETIRED[id] || null, risk: RISK[id] || null, fidelity: 'exact' })),
    applicability: () => (state === 'hybrid' ? { 'power-throttling': { show: true, state: 'recommended' } } : { 'global-timer-resolution': { show: true, state: 'recommended' }, 'power-throttling': { show: true, state: 'available' } }),
    caps: () => w.pc.caps, isPremium: () => !!ctx.premium, settings: () => w.settings, state: { read: () => store.v, write: v => { store.v = v } },
    bootMs: () => now - 3 * 3600000, now: () => Date.now(), gameRunning: () => false, gameNames: () => ['game.exe'],
    emit: (ch, p) => send({ 'cpumem2-live': 'onCpumem2Live', 'cpumem2-progress': 'onCpumem2Progress', 'cpumem2-pin': 'onCpumem2Pin' }[ch], p),
    spawnLive: ({ onLine }) => {
      let live = true
      const tick = () => { if (live) onLine(liveFrame({ ...w.pc.cpu, totalMB: w.pc.totalMB }, state, Date.now(), 0) + '\n') }
      const first = setTimeout(tick, 50), iv = setInterval(tick, 1000)
      timers.add(iv)
      return { kill() { live = false; clearTimeout(first); clearInterval(iv); timers.delete(iv) } }
    },
  }
  o = { svc: CpuMem.create(deps), w }
  insts.set(key, o)
  return o
}

async function handle(name, args, sender, ctx) {
  switch (name) {
    case 'getProcesses': return [{ name: 'game.exe', ram: 3400 }, { name: 'chrome.exe', ram: 900 }]
    case 'latencyBudgetStart': return { ok: true }
    case 'latencyBudgetStop': return { ok: true }
    case 'biosRamStress': return { ok: true, passed: true, errors: 0, passes: 6 }
    case 'cpuzReadTimings': return { ok: true, cl: '30', trcd: '38', trp: '38', tras: '96', cr: '1T', freq: '2400' }
    default: break
  }
  const o = svc(sender, ctx), a = args[0] || {}
  switch (name) {
    case 'cpumem2Scan': return o.svc.scan()
    case 'cpumem2Cached': return o.svc.cached() || { ok: false }
    case 'cpumem2Run': return o.svc.run({ ids: a.ids || [], action: a.action })
    case 'cpumem2History': return o.svc.history()
    case 'cpumem2Undo': return o.svc.undo(a.target || {}, { force: !!a.force })
    case 'cpumem2LiveStart': return o.svc.liveStart()
    case 'cpumem2LiveBeat': return o.svc.heartbeat()
    case 'cpumem2LiveStop': o.svc.liveStop(); return { ok: true }
    case 'cpumem2FreeStandby': return o.svc.freeStandby()
    case 'cpumem2Consumers': return o.svc.consumers()
    case 'cpumem2Pin': return o.svc.pin(a)
    case 'cpumem2Unpin': return o.svc.unpin(a)
    case 'cpumem2Priority': return o.svc.priority(a)
    case 'cpumem2PriorityClear': return o.svc.priorityClear(a)
    case 'cpumem2Priorities': return { ok: true, ...(await o.svc.readPriorities()) }
    default: return undefined
  }
}

module.exports = { handle }
