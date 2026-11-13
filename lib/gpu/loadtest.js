'use strict'
// The Headroom test: 30 seconds of load the page generates on its own canvas while the service samples the GPU. Pure: guards, the report, the comparison.
// The test never touches a setting. It stops by itself when the card runs hot, when a game starts, when the tab is hidden or after MAX_MS.
const L = require('./limiter')

const T = {
  DURATION_MS: 30000,      // what the page runs
  MAX_MS: 45000,           // the service stops a test that has not finished after this
  CORE_STOP_C: 87,         // same ceiling as the power-limit thermal guard (lib/gpu-power-limit.js GUARD_CORE_C)
  HOTSPOT_STOP_C: 100,     // hotspot / junction
  MIN_FRAMES: 8,           // a report needs this many one-second frames
  KEEP: 10,                // runs kept
  SAME_WORK_PCT: 1,        // work-rate change under this is "same"
}

/** Should the running test stop now? frame = latest merged frame. Returns a reason string or null. */
function guard(frame) {
  const f = frame || {}, s = f.smi || {}, se = f.sensor || {}
  const core = s.temp != null ? s.temp : se.tempCore
  if (core != null && core >= T.CORE_STOP_C) return 'hot-core'
  if (se.tempHot != null && se.tempHot >= T.HOTSPOT_STOP_C) return 'hot-spot'
  return null
}

const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
const max = a => (a.length ? Math.max(...a) : null)
const min = a => (a.length ? Math.min(...a) : null)
const r1 = v => (v == null ? null : Math.round(v * 10) / 10)

/**
 * frames: the merged frames recorded while the test ran. client: { work: G-iterations/s, frames, renderer, ms } from the page.
 * facts: scan facts (clockMaxMHz, powerLimitW). Returns the report (every field is a number or null; null = no sensor said).
 */
function summarize(frames, client = {}, facts = {}) {
  const f = (frames || []).filter(Boolean)
  if (f.length < T.MIN_FRAMES) return { ok: false, error: 'too-few-frames', frames: f.length }
  const loaded = f.filter(x => { const l = L.rails(x, facts)[0].value; return l != null && l >= L.T.LOADED })
  const clocks = loaded.map(x => x.smi && x.smi.clock).filter(v => v != null)
  const clockMax = (loaded.find(x => x.smi && x.smi.clockMax) || {}).smi ? loaded.find(x => x.smi && x.smi.clockMax).smi.clockMax : (facts.clockMaxMHz || null)
  const power = loaded.map(x => (x.smi && x.smi.power != null ? x.smi.power : x.sensor && x.sensor.power != null ? x.sensor.power : null)).filter(v => v != null)
  const powerLimit = (loaded.find(x => x.smi && x.smi.powerLimit) || { smi: {} }).smi.powerLimit || facts.powerLimitW || null
  const temps = f.map(x => (x.smi && x.smi.temp != null ? x.smi.temp : x.sensor && x.sensor.tempCore != null ? x.sensor.tempCore : null)).filter(v => v != null)
  const hots = f.map(x => x.sensor && x.sensor.tempHot).filter(v => v != null)
  const fans = f.map(x => (x.smi && x.smi.fan != null ? x.smi.fan : x.sensor && x.sensor.fanPct != null ? x.sensor.fanPct : null)).filter(v => v != null)
  const loads = f.map(x => L.rails(x, facts)[0].value).filter(v => v != null)
  const lim = {}
  for (const x of loaded) { const id = L.limiterOf(x, facts).id; lim[id] = (lim[id] || 0) + 1 }
  const lead = Object.entries(lim).sort((a, b) => b[1] - a[1])[0]
  return {
    ok: true, frames: f.length, loadedFrames: loaded.length,
    load: r1(avg(loads)), clockAvg: r1(avg(clocks)), clockMin: min(clocks), clockMax, clockPct: clocks.length && clockMax ? r1(avg(clocks) / clockMax * 100) : null,
    powerAvg: r1(avg(power)), powerPeak: r1(max(power)), powerLimit, powerPct: power.length && powerLimit ? r1(avg(power) / powerLimit * 100) : null,
    tempPeak: max(temps), tempAvg: r1(avg(temps)), hotspotPeak: max(hots), fanPeak: max(fans),
    limiter: lead && loaded.length ? { id: lead[0], pct: Math.round(lead[1] / loaded.length * 100) } : null,
    limiters: Object.fromEntries(Object.entries(lim).map(([k, v]) => [k, Math.round(v / loaded.length * 100)])),
    work: client.work != null && Number.isFinite(client.work) ? r1(client.work) : null, renderer: client.renderer ? String(client.renderer).slice(0, 120) : null,
  }
}

/** The change since the previous run: positive = higher now. Only fields both runs have. */
function compare(now, before) {
  if (!now || !before || !now.ok || !before.ok) return null
  const d = (a, b) => (a != null && b != null ? r1(a - b) : null)
  const workPct = now.work != null && before.work ? r1((now.work - before.work) / before.work * 100) : null
  return {
    work: workPct, workSame: workPct != null && Math.abs(workPct) < T.SAME_WORK_PCT,
    clock: d(now.clockAvg, before.clockAvg), power: d(now.powerAvg, before.powerAvg), temp: d(now.tempPeak, before.tempPeak), limiterChanged: !!(now.limiter && before.limiter && now.limiter.id !== before.limiter.id),
  }
}

/** True when the render ran on a different GPU than the one the tab is about: the integrated one, or a software renderer. */
function wrongRenderer(renderer, gpuName) {
  const r = String(renderer || '').toLowerCase(), g = String(gpuName || '').toLowerCase()
  if (!r) return null
  if (/swiftshader|llvmpipe|software|basic render/.test(r)) return true
  const key = s => (s.match(/(rtx|gtx|rx|arc|iris|uhd|radeon)[^a-z0-9]*([a-z]?\d{3,4}|graphics|xe)?/i) || [''])[0].replace(/[^a-z0-9]/gi, '')
  const a = key(r), b = key(g)
  return a && b ? !(a.includes(b) || b.includes(a)) : null
}

const exported = { T, guard, summarize, compare, wrongRenderer }
if (typeof module !== 'undefined' && module.exports) module.exports = exported
if (typeof window !== 'undefined') window.JylliGpuLoadTest = exported
