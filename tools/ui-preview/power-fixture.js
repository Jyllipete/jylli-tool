'use strict'
// Preview fixtures for the Power tab: the REAL lib/power service (probe parser, model, findings, run + verify, plan switch, tidy with export, timeouts, wake, mode,
// energy sessions) on a synthetic PC. The pollers are replaced by generators that print the same JJPWLIVE and nvidia-smi lines the real ones do.
// --pw-state desktop (default: custom plan active, PCIe links may sleep, duplicate plans, a program keeping it awake, several wake devices)
//            | laptop (battery at 71 % health, discharging, Windows on Best power efficiency, never sleeps on battery, no sensor bridge)
//            | clutter (seven custom plans, five of them duplicates)  | blocked (three things keep it awake, a wake timer, many wake devices)
//            | first (Windows cannot be read)  | fail (changes abort: no restore point)
const fs = require('fs'), path = require('path')
const Power = require('../../lib/power')
const detect = require('../../lib/power/detect')
const plans = require('../../lib/power/plans')
const catalog = require('../../lib/power/catalog')
const { entries } = require('../list-tweaks')
const { RISK } = require('../../lib/tweak-risk')

const main = fs.readFileSync(path.join(__dirname, '..', '..', 'main.js'), 'utf8')
const RETIRED = Object.fromEntries([...main.slice(main.indexOf('const RETIRED_TWEAKS = {'), main.indexOf('function retireFivemTweaks')).matchAll(/^  '([a-z0-9-]+)':\s+'((?:[^'\\]|\\.)*)'/gm)].map(m => [m[1], m[2]]))
const TIER = Object.fromEntries(entries.map(e => [e.id, Number(e.tier) || 1]))
const K = id => plans.keyOf(plans.byAnat[id])
const g = n => `${String(n).padStart(8, '0')}-3a52-4f88-9c60-2d5e8a1f6b34`

const BASE_PLANS = [{ guid: plans.GUID.balanced, name: 'Balanced' }, { guid: plans.GUID.high, name: 'High performance' }, { guid: plans.GUID.saver, name: 'Power saver' }]
function world(state) {
  const laptop = state === 'laptop'
  const list = [...BASE_PLANS]
  const mine = '89f7c0cb-7c17-4774-be56-b135ea7e679b'
  if (laptop) list.length = 3
  else list.push({ guid: mine, name: 'FSOS AMD Gaming' })
  if (state === 'desktop' || state === 'blocked' || state === 'first' || state === 'fail') list.push({ guid: g(1), name: 'Old gaming' }, { guid: g(2), name: 'Old gaming' })
  if (state === 'clutter') for (let i = 0; i < 6; i++) list.push({ guid: g(10 + i), name: i < 5 ? 'Imported plan' : 'Work' })
  const active = laptop ? plans.GUID.balanced : mine
  const idx = {}
  const def = (balanced) => ({ AC: { [K('cpuMin')]: balanced ? 5 : 100, [K('cpuMax')]: 100, [K('boost')]: balanced ? 2 : 2, [K('epp')]: balanced ? 50 : 0, [K('parking')]: balanced ? 10 : 100, [K('aspm')]: balanced ? 1 : 1, [K('usb')]: 1, [K('disk')]: 1200, [K('display')]: 600, [K('sleep')]: 1800, [K('hibernate')]: 0 },
    DC: { [K('cpuMin')]: 5, [K('cpuMax')]: 100, [K('boost')]: 1, [K('epp')]: 60, [K('parking')]: 10, [K('aspm')]: 2, [K('usb')]: 1, [K('disk')]: 600, [K('display')]: 300, [K('sleep')]: laptop ? 0 : 900, [K('hibernate')]: 0 } })
  for (const p of list) idx[p.guid] = def(p.guid === plans.GUID.balanced || !!p.name.match(/Balanced|Old|Imported|Work/))
  idx[plans.GUID.saver] = { AC: { ...def(true).AC, [K('cpuMax')]: 70, [K('boost')]: 0, [K('aspm')]: 2 }, DC: def(true).DC }
  idx[plans.GUID.high] = { AC: { ...def(false).AC, [K('aspm')]: 0 }, DC: def(true).DC }
  const wake = laptop ? ['HID Keyboard Device', 'Intel(R) Wi-Fi 6E AX211'] : ['HID Keyboard Device', 'HID-compliant mouse', 'Realtek PCIe GbE Family Controller', 'Intel(R) Ethernet Controller I225-V', 'USB Root Hub (USB 3.0)']
  return {
    laptop, plans: list, active, idx, trim: 0, overlay: laptop ? plans.OVERLAY.efficiency : plans.OVERLAY.performance, wake, files: new Set(),
    battery: laptop ? { present: true, name: 'DELL 4GVMP', percent: 64, discharging: true, charging: false, acLine: false, remainingMWh: 27300, fullMWh: 42600, designMWh: 60000, rateMW: 14200 } : null,
    requests: state === 'blocked' ? 'DISPLAY:\nNone.\n\nSYSTEM:\n[PROCESS] \\Device\\HarddiskVolume3\\Program Files\\VideoLAN\\VLC\\vlc.exe\n[DRIVER] Realtek High Definition Audio\n[SERVICE] \\Device\\HarddiskVolume3\\Windows\\System32\\svchost.exe (Spooler)\n\nAWAYMODE:\nNone.\n' : state === 'desktop' ? 'DISPLAY:\nNone.\n\nSYSTEM:\n[PROCESS] \\Device\\HarddiskVolume3\\Program Files\\Spotify\\Spotify.exe\n\nAWAYMODE:\nNone.\n' : 'DISPLAY:\nNone.\n\nSYSTEM:\nNone.\n\nAWAYMODE:\nNone.\n',
    timers: state === 'blocked' || laptop ? 'Timer set by [SERVICE] \\Device\\HarddiskVolume3\\Windows\\System32\\svchost.exe (UsoSvc) expires at 03:12:00.' : 'There are no active wake timers in the system.',
  }
}

const insts = new Map()
function svc(sender, ctx) {
  const state = ctx.pw || 'desktop'
  const key = sender.id + ':' + state
  let o = insts.get(key)
  if (o) return o
  const w = world(state), store = { v: null }, settings = { isPremium: true }, journal = []
  const now0 = Date.now()
  const send = (ev, data) => { try { sender.send('mock-event', ev, data) } catch (e) { /* window closed */ } }
  const timers = new Set()
  const HIBER = detect.keyOf({ r: 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power', n: 'HiberbootEnabled' })
  const facts = () => ({
    plans: w.plans.map(p => ({ ...p, active: p.guid === w.active })), idx: w.idx, battery: w.battery ? { ...w.battery } : null, trim: w.trim, overlayAc: w.overlay, overlayDc: w.overlay,
    cs: w.laptop ? '1' : '0', hibernate: '1', fastStartup: '1', laptop: w.laptop, chassis: [w.laptop ? 10 : 3],
    req: w.requests, last: w.laptop ? 'Wake History Count - 1\nWake History [0]\n  Wake Source Count - 1\n  Wake Source [0]\n    Type: Device\n    Friendly Name: Intel(R) Wi-Fi 6E AX211' : 'Wake History Count - 0',
    armed: w.wake.join('\n'), prog: w.wake.concat(['Other']).join('\n'), timers: w.timers,
  })
  const deps = {
    runPS: async script => {
      if (script.includes('JJPW:')) return state === 'first' ? { ok: false, out: '' } : { ok: true, out: 'JJPW:' + JSON.stringify({ r: { [HIBER]: '1' }, f: facts() }) }
      if (script.includes('JOVL')) return { ok: true, out: 'JOVL=' + w.overlay + ' RC=0' }
      if (script.includes('JOSET')) { const m = /\[guid\]'([0-9a-f-]+)'/.exec(script); w.overlay = m[1]; return { ok: true, out: 'JOSET=0' } }
      return { ok: true, out: '' }
    },
    runCmd: async c => {
      let m
      await new Promise(r => setTimeout(r, 250))
      if ((m = /^powercfg \/export "([^"]+)" ([0-9a-f-]+)$/.exec(c))) { w.files.add(m[1]); return { ok: true, out: '' } }
      if ((m = /^powercfg \/delete ([0-9a-f-]+)$/.exec(c))) { w.plans = w.plans.filter(p => p.guid !== m[1]); return { ok: true, out: '' } }
      if ((m = /^powercfg \/device(enable|disable)wake "(.+)"$/.exec(c))) { w.wake = w.wake.filter(d => d !== m[2]); if (m[1] === 'enable') w.wake.push(m[2]); return { ok: true, out: '' } }
      return { ok: true, out: '' }
    },
    applyBatch: async req => {
      if (state === 'fail') return { ok: false, aborted: true, reason: 'restore-point-failed', guidance: 'Turn on System Protection for the system drive, then try again.', restorePoint: { ok: false } }
      const items = req.items.map(i => {
        if (i.tweakId === 'pcie-power') { const v = i.action === 'apply' ? 0 : 2; const a = w.idx[w.active]; a.AC[K('aspm')] = v; a.DC[K('aspm')] = v }
        if (i.tweakId === 'trim-enable') w.trim = i.action === 'apply' ? 0 : 1
        settings['tweak_' + i.tweakId] = i.action === 'apply' ? 'applied' : 'restored'
        journal.unshift({ id: 'n' + Math.random().toString(36).slice(2, 7), batchId: 'nb', tweakId: i.tweakId, action: i.action, via: 'manual', ts: Date.now(), result: 'ok', fidelity: 'exact', changes: [{ kind: 'reg' }] })
        return { id: i.tweakId, action: i.action, status: 'ok', journalId: 'j-' + i.tweakId, fidelity: 'exact' }
      })
      await new Promise(r => setTimeout(r, 700))
      return { ok: true, batchId: 'nb', items, restorePoint: { ok: true } }
    },
    journalList: () => journal,
    undo: async t => { for (const e of journal.filter(x => x.batchId === t.batchId || x.id === t.entryId)) e.undoneBy = 'u' + e.id; return { ok: true } },
    runRecorded: async (control, action, meta, fn) => {
      const ch = []
      const cmd = async c => { let m; if ((m = /^powercfg \/setactive ([0-9a-f-]+)$/.exec(c))) w.active = m[1]
        if ((m = /^powercfg \/set(ac|dc)valueindex SCHEME_CURRENT (\S+) (\S+) (\d+)$/.exec(c))) { w.idx[w.active][m[1].toUpperCase()][m[2] + '|' + m[3]] = Number(m[4]); ch.push({ kind: 'powercfg', ac: m[1] === 'ac', setting: m[3], before: { value: '600' }, after: { value: m[4] } }) }
        return { ok: true, out: '' } }
      await fn(async () => ({ ok: true }), cmd, c => ch.push(c))
      journal.unshift({ id: 'p' + Date.now() + Math.random().toString(36).slice(2, 5), batchId: meta.batchId, control, action, via: 'manual', ts: Date.now(), result: 'ok', changes: ch })
    },
    tweakMeta: ids => ids.filter(id => TIER[id]).map(id => ({ id, safetyTier: RETIRED[id] ? 1 : TIER[id], gamerImpact: 'medium', retired: RETIRED[id] || null, risk: RISK[id] || null, fidelity: 'exact' })),
    applicability: () => (w.laptop ? { 'pcie-power': { show: false }, 'amd-power-plan': { show: false }, 'intel-power-plan': { show: false } } : { 'amd-power-plan': { show: true, state: 'recommended' }, 'intel-power-plan': { show: false } }),
    isPremium: () => !!ctx.premium, settings: () => settings, state: { read: () => store.v, write: v => { store.v = v } },
    planDir: 'C:\\Users\\Preview\\AppData\\Roaming\\Jylli Tool\\power-plans', fileExists: p => w.files.has(p), bootMs: () => now0 - 3 * 3600000, now: () => Date.now(), gameRunning: () => false, gameName: () => null,
    hub: keys => Object.fromEntries(keys.map(k => [k, k === 'cpu.power' && !w.laptop ? Math.round((38 + 30 * (0.5 + 0.5 * Math.sin(Date.now() / 6000)) + 4 * Math.sin(Date.now() / 900)) * 10) / 10 : null])),
    emit: (ch, p) => send({ 'power2-live': 'onPower2Live', 'power2-progress': 'onPower2Progress' }[ch], p),
    spawnLive: ({ onLine }) => {
      let live = true
      const tick = () => {
        if (!live) return
        const ph = 0.5 + 0.5 * Math.sin(Date.now() / 6000)
        const bat = w.laptop ? { ac: false, charging: false, discharging: true, rateMW: Math.round(11000 + 7000 * ph), remMWh: w.battery.remainingMWh } : null
        onLine('JJPWLIVE:' + JSON.stringify({ t: Date.now(), perf: Math.round(55 + 70 * ph), util: Math.round(4 + 30 * ph), bat }) + '\n')
      }
      const first = setTimeout(tick, 50), iv = setInterval(tick, 1000)
      timers.add(iv)
      return { kill() { live = false; clearTimeout(first); clearInterval(iv); timers.delete(iv) } }
    },
    spawnSmi: ({ onLine }) => {
      let live = true
      const tick = () => { if (!live) return; const ph = 0.5 + 0.5 * Math.sin(Date.now() / 6000); onLine(`0, ${Math.round((w.laptop ? 9 : 24) + (w.laptop ? 30 : 150) * ph * ph)}, ${Math.round(3 + 60 * ph * ph)}\n`) }
      const first = setTimeout(tick, 20), iv = setInterval(tick, 1000)
      timers.add(iv)
      return { kill() { live = false; clearTimeout(first); clearInterval(iv); timers.delete(iv) } }
    },
  }
  if (state === 'desktop') {
    journal.push({ id: 'e1', batchId: 'b-1', control: 'power2:plan', action: 'apply', via: 'manual', ts: now0 - 26 * 3600000, result: 'ok', changes: [{ kind: 'powercfg-active' }] })
  }
  o = { svc: Power.create(deps), w }
  insts.set(key, o)
  return o
}

async function handle(name, args, sender, ctx) {
  const o = svc(sender, ctx), a = args[0] || {}
  switch (name) {
    case 'power2Scan': return o.svc.scan()
    case 'power2Cached': return o.svc.cached() || { ok: false }
    case 'power2Run': return o.svc.run({ ids: a.ids || [], action: a.action })
    case 'power2PlanSet': return o.svc.planSet(a)
    case 'power2TimeoutSet': return o.svc.timeoutSet(a)
    case 'power2PlanTidy': return o.svc.planTidy(a)
    case 'power2WakeSet': return o.svc.wakeSet(a)
    case 'power2ModeSet': return o.svc.modeSet(a)
    case 'power2History': return o.svc.history()
    case 'power2Undo': return o.svc.undo(a.target || {}, { force: !!a.force })
    case 'power2LiveStart': return o.svc.liveStart()
    case 'power2LiveBeat': return o.svc.heartbeat()
    case 'power2LiveStop': o.svc.liveStop(); return { ok: true }
    case 'power2SessionStart': return o.svc.sessionStart(a)
    case 'power2SessionStop': return o.svc.sessionStop('stopped')
    case 'power2PriceSet': return o.svc.priceSet(a)
    case 'power2SessionsClear': return o.svc.sessionsClear()
    default: return undefined
  }
}

module.exports = { handle }
