'use strict'
;(function (root) {
// The only list of what the Power tab may say. Every threshold is a named constant with its meaning; every finding is a fact read from this PC.
//   statics(i)       from a scan:  { id, kind:'static', tone:'bad'|'warn'|'info', vars, action }
//   live(frames,ctx) from the last live frames (at least LIVE_MIN_FRAMES): same shape, kind 'live'
// action: null | { kind:'view', view } | { kind:'switch', id } | { kind:'plan', guid } | { kind:'tidy' } | { kind:'mode', overlay }
// Texts live in LANG power2 as fT_<id with _> / fS_<id with _>, in English and Finnish (test/power-engine.test.js checks both).
const P = (typeof require !== 'undefined' && typeof module !== 'undefined') ? require('./plans') : (typeof window !== 'undefined' ? root.JylliPowerPlans : null)

const T = {
  WEAR_WARN: 80,            // % battery health below which wear is worth saying (battery.js shares it)
  WEAR_BAD: 60,             // % below which the battery is worn out for daily use
  WAKE_MANY: 2,             // wake-capable devices that are not a keyboard or mouse; more than this is a likely cause of "wakes by itself"
  AWAKE_PLAN_ACTIVE: 1,     // one active request that keeps the system awake is already worth showing
  LIVE_MIN_FRAMES: 30,      // frames (seconds) needed before any live finding
  GPU_IDLE_LOAD: 5,         // % GPU load below which the card counts as idle
  GPU_IDLE_W: 45,           // W board power while idle: a card that cannot downclock (usually several monitors or a high refresh rate) sits here
  IDLE_SHARE: 0.8,          // share of idle frames that must show it, so one spike is not a finding
  LAPTOP_IDLE_UTIL: 15,     // % CPU utility below which a laptop counts as idle
  BAT_IDLE_DRAIN_W: 15,     // W drawn from the battery while idle that is worth saying
}
const HID = /\b(hid|keyboard|mouse|n[aä]pp[aä]imist[oö]|hiiri)\b/i
const RANK = { bad: 0, warn: 1, info: 2 }
const IDS = ['saver-on-desktop', 'efficiency-mode-on-ac', 'aspm-on-desktop', 'plan-clutter', 'battery-worn', 'sleep-never-on-battery', 'sleep-blocked', 'wake-armed-many', 'wake-timers', 'modern-standby', 'gpu-idle-draw-high', 'battery-drain-high']
const OVERLAY_EFFICIENCY = '961cc777-2547-4f9d-8174-7d86181b8a7a'

const val = (idx, guid, id, side) => { const a = P.byAnat[id]; const v = P.valuesOf(idx, guid, a); return side === 'dc' ? v.dc : v.ac }

/** i: { laptop, plans, activeGuid, idx, battery, overlayAc, onAC, status:{id:status}, requests, wakeDevices, wakeTimers, modernStandby } */
function statics(i = {}) {
  const out = []
  const add = (id, tone, vars = {}, action = null) => out.push({ id, kind: 'static', tone, vars, action })
  const plans = i.plans || []
  const active = plans.find(p => p.guid === i.activeGuid) || null
  if (!i.laptop && active && active.kind === 'saver') add('saver-on-desktop', 'warn', { plan: active.name }, { kind: 'plan', guid: P.GUID.balanced })
  if (i.laptop && i.onAC === true && i.overlayAc === OVERLAY_EFFICIENCY) add('efficiency-mode-on-ac', 'info', {}, { kind: 'mode', overlay: P.OVERLAY.balanced })
  if (!i.laptop && i.status && (i.status['pcie-power'] === 'off') && active && val(i.idx, i.activeGuid, 'aspm') != null && val(i.idx, i.activeGuid, 'aspm') > 0) add('aspm-on-desktop', 'info', {}, { kind: 'switch', id: 'pcie-power' })
  const dup = P.duplicates(plans)
  if (dup.length) add('plan-clutter', 'info', { n: dup.reduce((n, d) => n + d.guids.length - 1, 0), name: dup[0].name }, { kind: 'tidy' })
  const b = i.battery
  if (b && b.healthPct != null && b.wear && b.wear !== 'ok') add('battery-worn', b.wear === 'bad' ? 'bad' : 'warn', { pct: b.healthPct }, null)
  if (i.laptop && i.activeGuid && i.idx) {
    const s = val(i.idx, i.activeGuid, 'sleep', 'dc')
    if (s === 0) add('sleep-never-on-battery', 'warn', {}, { kind: 'view', view: 'plans' })
  }
  const rq = i.requests
  if (rq && rq.keepsAwake.length >= T.AWAKE_PLAN_ACTIVE) add('sleep-blocked', 'info', { n: rq.keepsAwake.length, name: rq.keepsAwake[0].name }, { kind: 'view', view: 'sleep' })
  const wd = (i.wakeDevices || []).filter(n => !HID.test(n))
  if (wd.length > T.WAKE_MANY) add('wake-armed-many', 'info', { n: wd.length }, { kind: 'view', view: 'sleep' })
  if (i.wakeTimers && i.wakeTimers.length) add('wake-timers', 'info', { n: i.wakeTimers.length, name: i.wakeTimers[0].name }, { kind: 'view', view: 'sleep' })
  if (i.modernStandby === true) add('modern-standby', 'info', {}, null)
  return sort(out)
}

/** frames: [{ util, bat, smi, sensor }]; ctx: { laptop }. Only idle frames count, so a game or a build never reads as a fault. */
function live(frames, ctx = {}) {
  const out = []
  const list = (frames || []).slice(-60)
  if (list.length < T.LIVE_MIN_FRAMES) return out
  const gpuIdle = list.filter(f => f.smi && f.smi.load != null && f.smi.load < T.GPU_IDLE_LOAD && f.smi.powerW != null)
  if (gpuIdle.length >= T.LIVE_MIN_FRAMES / 2) {
    const high = gpuIdle.filter(f => f.smi.powerW > T.GPU_IDLE_W)
    if (high.length / gpuIdle.length >= T.IDLE_SHARE) out.push({ id: 'gpu-idle-draw-high', kind: 'live', tone: 'warn', vars: { w: Math.round(high.reduce((s, f) => s + f.smi.powerW, 0) / high.length) }, action: null })
  }
  if (ctx.laptop) {
    const idle = list.filter(f => f.bat && f.bat.discharging && f.bat.rateW != null && f.util != null && f.util < T.LAPTOP_IDLE_UTIL)
    if (idle.length >= T.LIVE_MIN_FRAMES / 2) {
      const high = idle.filter(f => f.bat.rateW > T.BAT_IDLE_DRAIN_W)
      if (high.length / idle.length >= T.IDLE_SHARE) out.push({ id: 'battery-drain-high', kind: 'live', tone: 'warn', vars: { w: Math.round(high.reduce((s, f) => s + f.bat.rateW, 0) / high.length) }, action: { kind: 'view', view: 'sleep' } })
    }
  }
  return sort(out)
}

const sort = l => l.sort((a, b) => RANK[a.tone] - RANK[b.tone])
const exported = { T, IDS, statics, live, HID }
if (typeof module !== 'undefined' && module.exports) module.exports = exported
if (typeof window !== 'undefined') root.JylliPowerFindings = exported
})(typeof window !== 'undefined' ? window : globalThis)
