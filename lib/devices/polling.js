'use strict'
// Devices tab: turns what the Raw Input helper counted into a polling rate, and says how sure it is. Pure.
// Windows does not tell anyone a mouse's polling rate, and the movement reports carry no time stamp, so the only honest way is to COUNT how many
// movement reports one mouse delivers per 100 ms while it is being moved, and take the fast end of that (a mouse reports at its full rate only while it
// moves quickly; slow movement and pauses give lower counts). The result is "what this mouse delivered just now", not a certified spec:
// motion sync, power saving, a busy USB hub or a wireless dongle in a low-power state can all change it.
const STANDARD = [125, 250, 500, 1000, 2000, 4000, 8000]
const BIN_MS = 100
const MIN_ACTIVE = 8        // bins that must contain movement
const MIN_EVENTS = 40       // movement reports in total
const SNAP = 0.12           // a rate within 12% of a standard one is that standard rate
const TIGHT = 0.06          // within 6% is "high" confidence when there is enough data

const percentile = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b)
  if (!s.length) return 0
  const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i)
  return s[lo] + (s[hi] - s[lo]) * (i - lo)
}

/** bins = movement reports per 100 ms bin for ONE device. Returns { ok, hz, rawHz, snapped, confidence, active, events, reason }. */
function estimate(bins) {
  const b = Array.isArray(bins) ? bins.map(Number).filter(Number.isFinite) : []
  const events = b.reduce((a, x) => a + x, 0)
  const rates = b.filter(x => x > 0).map(x => x * (1000 / BIN_MS))
  if (!events) return { ok: false, reason: 'no_movement', events: 0, active: 0 }
  if (rates.length < MIN_ACTIVE || events < MIN_EVENTS) return { ok: false, reason: 'too_little', events, active: rates.length }
  const rawHz = percentile(rates, 0.9)
  let best = null
  for (const s of STANDARD) { const d = Math.abs(rawHz - s) / s; if (d <= SNAP && (!best || d < best.d)) best = { s, d } }
  const steady = percentile(rates, 0.5) >= rawHz * 0.5
  let confidence = 'low'
  if (best && rates.length >= 15 && best.d <= TIGHT && steady) confidence = 'high'
  else if (best && rates.length >= MIN_ACTIVE) confidence = 'medium'
  return { ok: true, hz: best ? best.s : Math.round(rawHz), rawHz: Math.round(rawHz), snapped: !!best, confidence, active: rates.length, events, steady }
}

/** Instance id of a Raw Input device path: \\?\HID#VID_373B&PID_1085&MI_01&Col01#a&1e57f1fe&0&0000#{guid} -> HID\VID_373B&PID_1085&MI_01&COL01\A&1E57F1FE&0&0000 */
function pathToInstance(p) {
  const m = /^\\\\\?\\([^#]+)#([^#]+)#([^#]+)#\{[0-9a-f-]+\}$/i.exec(String(p || ''))
  return m ? (m[1] + '\\' + m[2] + '\\' + m[3]).toUpperCase() : ''
}

/** Parse the helper's output line. */
const MARK = 'JJPOLL:'
function parse(out) {
  const line = String(out || '').split(/\r?\n/).reverse().find(l => l.startsWith(MARK))
  if (!line) return null
  let j; try { j = JSON.parse(line.slice(MARK.length)) } catch { return null }
  if (!j || typeof j !== 'object') return null
  return {
    ok: j.ok !== false, error: j.error ? String(j.error) : '', seconds: Number(j.seconds) || 0, synthetic: Number(j.synthetic) || 0,
    devices: (Array.isArray(j.devices) ? j.devices : []).filter(d => d && d.path).map(d => ({ path: String(d.path), instance: pathToInstance(d.path), events: Number(d.n) || 0, bins: Array.isArray(d.w) ? d.w.map(Number) : [] })),
  }
}

module.exports = { STANDARD, BIN_MS, estimate, pathToInstance, parse, MARK }
