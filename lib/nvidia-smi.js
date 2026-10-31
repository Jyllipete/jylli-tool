'use strict'
// nvidia-smi helpers: one long-lived `-l`-style poller for telemetry and a probe for the power-limit control.
// Parsing is pure and unit-tested against real output. The binary is always System32\nvidia-smi.exe, started without a shell.
const path = require('path')

const FIELDS = ['index', 'uuid', 'name', 'utilization.gpu', 'temperature.gpu', 'power.draw', 'power.limit', 'clocks.gr', 'clocks.mem',
  'memory.used', 'memory.total', 'fan.speed', 'enforced.power.limit', 'power.default_limit', 'power.min_limit', 'power.max_limit']

function exePath(env = process.env) { return path.join(env.SystemRoot || 'C:\\Windows', 'System32', 'nvidia-smi.exe') }

const num = s => {
  const t = String(s).trim()
  if (!t || /^\[?(n\/a|not supported|unknown error|not available|\[.*\])\]?$/i.test(t) || /^\[/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** Parses `--query-gpu=<FIELDS> --format=csv,noheader,nounits` output. One object per GPU. */
function parseQuery(out) {
  const gpus = []
  for (const line of String(out || '').split(/\r?\n/)) {
    if (!line.trim()) continue
    const c = line.split(',').map(x => x.trim())
    if (c.length < FIELDS.length) continue
    gpus.push({
      index: parseInt(c[0]), uuid: c[1], name: c[2],
      load: num(c[3]), temp: num(c[4]), power: num(c[5]), powerLimit: num(c[6]), clockCore: num(c[7]), clockMem: num(c[8]),
      vramUsedMB: num(c[9]), vramTotalMB: num(c[10]), fanPct: num(c[11]),
      enforcedLimit: num(c[12]), defaultLimit: num(c[13]), minLimit: num(c[14]), maxLimit: num(c[15]),
    })
  }
  return gpus
}

/** Telemetry key map for the hub. gpu index 0 only is surfaced as gpu0.*; others as gpuN.*. */
function toSamples(gpus) {
  const s = {}
  for (const g of gpus) {
    const p = `gpu${g.index}.`
    s[p + 'load'] = g.load; s[p + 'temp.core'] = g.temp; s[p + 'power'] = g.power; s[p + 'power.limit'] = g.powerLimit
    s[p + 'clock.core'] = g.clockCore; s[p + 'clock.mem'] = g.clockMem
    s[p + 'vram.used'] = g.vramUsedMB; s[p + 'vram.total'] = g.vramTotalMB; s[p + 'fan.pct'] = g.fanPct
  }
  return s
}

/**
 * Decides whether the power-limit control may be shown for a GPU (plan "NVIDIA power limit safety").
 * `power.management` is deprecated on newer drivers (prints "[Requested functionality has been deprecated]"), so it is not
 * required; instead the limits must be numeric and consistent, and the machine must not be a laptop.
 */
function powerLimitSupport(gpu, { isLaptop }) {
  if (!gpu) return { supported: false, reason: 'no-nvidia-gpu' }
  if (isLaptop !== false) return { supported: false, reason: isLaptop ? 'laptop' : 'form-factor-unknown' }
  const { minLimit, maxLimit, defaultLimit, powerLimit } = gpu
  if ([minLimit, maxLimit, defaultLimit, powerLimit].some(x => x == null)) return { supported: false, reason: 'limits-unavailable' }
  if (!(minLimit < defaultLimit && defaultLimit <= maxLimit)) return { supported: false, reason: 'limits-inconsistent' }
  return { supported: true, min: Math.ceil(minLimit), max: Math.floor(maxLimit), default: Math.round(defaultLimit), current: Math.round(powerLimit) }
}

/** Validates a requested limit. Integer watts inside [min,max]; above the default needs an explicit confirmation. */
function validatePowerLimit(req, support) {
  if (!support?.supported) return { ok: false, reason: 'unsupported' }
  const w = req?.watts
  if (!Number.isInteger(w)) return { ok: false, reason: 'not-an-integer' }
  if (w < support.min || w > support.max) return { ok: false, reason: 'out-of-range' }
  if (w > support.default && req.confirmAboveDefault !== true) return { ok: false, reason: 'needs-confirmation' }
  return { ok: true, watts: w }
}

module.exports = { FIELDS, exePath, parseQuery, toSamples, powerLimitSupport, validatePowerLimit }
