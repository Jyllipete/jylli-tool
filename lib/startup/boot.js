'use strict'
// Startup tab "Ignition": boot timing from Windows' own Diagnostics-Performance events. Pure.
//   event 100 = one boot (BootTime, MainPathBootTime = until the desktop is usable, BootPostBootTime = until it settled, BootNumStartupApps)
// Every field is optional: a number Windows did not write stays null and is never filled in.
const num = v => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) ? n : null }
const MIN_MS = 1000, MAX_MS = 3600000

/** events: [{at, d}] -> [{ at, ms, mainMs, postMs, apps }] newest first. */
function parseBoots(events) {
  const out = []
  for (const e of events || []) {
    const d = (e && e.d) || {}
    const ms = num(d.BootTime)
    if (ms == null || ms < MIN_MS || ms > MAX_MS || !Number.isFinite(e.at)) continue
    out.push({ at: e.at, ms, mainMs: num(d.MainPathBootTime), postMs: num(d.BootPostBootTime), apps: num(d.BootNumStartupApps) })
  }
  return out.sort((a, b) => b.at - a.at)
}

/** Boots already remembered + the ones just read (same timestamp = same boot), newest first, at most `max`. */
function mergeBoots(old, fresh, max = 30) {
  const by = new Map()
  for (const b of [...(old || []), ...(fresh || [])]) if (b && Number.isFinite(b.at)) by.set(b.at, b)
  return [...by.values()].sort((a, b) => b.at - a.at).slice(0, max)
}

function median(nums) {
  const a = nums.filter(n => Number.isFinite(n)).sort((x, y) => x - y)
  if (!a.length) return null
  const m = a.length >> 1
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2)
}
const medianOf = (boots, key, n = 3, before = Infinity) => median((boots || []).filter(b => b.at < before).slice(0, n).map(b => b[key]))

/** { last, median, mainMedian, postMedian, trend: {deltaMs, newer, older}|null } */
function summary(boots) {
  const b = boots || []
  if (!b.length) return null
  const newer = median(b.slice(0, 3).map(x => x.ms)), older = b.length >= 6 ? median(b.slice(3, 6).map(x => x.ms)) : null
  return {
    last: b[0], count: b.length, median: median(b.slice(0, 5).map(x => x.ms)),
    mainMedian: median(b.slice(0, 5).map(x => x.mainMs)), postMedian: median(b.slice(0, 5).map(x => x.postMs)),
    trend: older != null && newer != null ? { deltaMs: newer - older, newer, older } : null,
  }
}

const WAIT_MS = 15 * 60 * 1000
/**
 * baseline: { at, bootMs, mainMs, n } stored when a run switched programs off.
 * -> null (nothing to compare) | { state: 'restart' | 'waiting' | 'unavailable' | 'done', beforeMs, afterMs, deltaMs, mainBeforeMs, mainAfterMs, mainDeltaMs, at, n }
 */
function compare(baseline, boots, lastBootAt, now = Date.now()) {
  if (!baseline) return null
  const base = { at: baseline.at, n: baseline.n || 0, beforeMs: baseline.bootMs || null, mainBeforeMs: baseline.mainMs || null }
  if (lastBootAt == null || lastBootAt <= baseline.at) return { state: 'restart', ...base }
  const after = (boots || []).slice().sort((a, b) => a.at - b.at).find(b => b.at > baseline.at)
  if (!after) return { state: now - lastBootAt < WAIT_MS ? 'waiting' : 'unavailable', ...base }
  return {
    state: 'done', ...base, afterMs: after.ms, deltaMs: base.beforeMs != null ? after.ms - base.beforeMs : null,
    mainAfterMs: after.mainMs, mainDeltaMs: base.mainBeforeMs != null && after.mainMs != null ? after.mainMs - base.mainBeforeMs : null,
  }
}

module.exports = { parseBoots, mergeBoots, median, medianOf, summary, compare, WAIT_MS }
