'use strict'
// Battery, pure. Health = what the cell holds now against what it was built for; time left from the real signed rate. A value that was not read is null, never 0.
const WEAR_WARN = 80, WEAR_BAD = 60            // % health below which the wear is worth saying / is bad
const num = v => { const n = Number(v); return v === '' || v == null || !Number.isFinite(n) ? null : n }

/**
 * raw: { present, percent, acLine, charging, discharging, remainingMWh, fullMWh, designMWh, rateMW (positive number, direction from the flags), name }
 * -> null when there is no battery, else { percent, state: 'charging'|'discharging'|'full'|'ac'|'unknown', healthPct, wear: 'ok'|'warn'|'bad'|null, rateW, minutesLeft, minutesToFull, name }
 */
function normalize(raw) {
  if (!raw || raw.present !== true) return null
  const percent = num(raw.percent), full = num(raw.fullMWh), design = num(raw.designMWh), rem = num(raw.remainingMWh), rate = num(raw.rateMW)
  const state = raw.charging === true ? 'charging' : raw.discharging === true ? 'discharging' : raw.acLine === true ? (percent != null && percent >= 99 ? 'full' : 'ac') : 'unknown'
  const healthPct = full != null && design != null && design > 0 ? Math.min(100, Math.round((full / design) * 100)) : null
  const wear = healthPct == null ? null : healthPct < WEAR_BAD ? 'bad' : healthPct < WEAR_WARN ? 'warn' : 'ok'
  const rateW = rate != null && rate > 0 ? Math.round((rate / 1000) * 10) / 10 : null
  const minutesLeft = state === 'discharging' && rate != null && rate > 0 && rem != null ? Math.round((rem / rate) * 60) : null
  const minutesToFull = state === 'charging' && rate != null && rate > 0 && rem != null && full != null && full > rem ? Math.round(((full - rem) / rate) * 60) : null
  return { percent, state, healthPct, wear, rateW, minutesLeft, minutesToFull, name: String(raw.name || '').slice(0, 60) || null, designWh: design != null ? Math.round(design / 100) / 10 : null, fullWh: full != null ? Math.round(full / 100) / 10 : null }
}

/** Signed battery flow in watts for the live view: negative = drawing from the battery, positive = charging, null = unknown. */
const flowW = b => (!b || b.rateW == null ? null : b.state === 'discharging' ? -b.rateW : b.state === 'charging' ? b.rateW : 0)

const exported = { normalize, flowW, WEAR_WARN, WEAR_BAD }
if (typeof module !== 'undefined' && module.exports) module.exports = exported
if (typeof window !== 'undefined') window.JylliPowerBattery = exported
