'use strict'
// Devices tab: the ONLY list of what the tab may say about the devices as a whole. Every threshold has a name. Pure.
// A finding is { id, level: 'warn' | 'info', device?: id, vars }. The text lives in the LANG group devices2 (f_<id>).
const MIN_GAMING_HZ = 500          // a measured rate below this on a gaming mouse is worth a hint (a measurement only counts when its confidence is not low)
const MANY_UNKNOWN = 3             // this many unknown vendor / model / connection facts get one note that explains why

function compute(snap) {
  const out = []
  if (!snap) return out
  for (const d of snap.devices || []) {
    if (d.problem) out.push({ id: 'device_problem', level: 'warn', device: d.id, vars: { name: d.title, code: d.problem.code } })
    const p = d.facts && d.facts.polling
    if (p && p.value != null && p.confidence !== 'low' && p.value < MIN_GAMING_HZ) out.push({ id: 'polling_low', level: 'info', device: d.id, vars: { name: d.title, hz: p.value } })
  }
  const failed = Object.entries(snap.sections || {}).filter(([, s]) => s && !s.ok).map(([id]) => id)
  if (failed.length) out.push({ id: 'section_failed', level: 'warn', vars: { n: failed.length, sections: failed.join(', ') } })
  if ((snap.unknown || 0) >= MANY_UNKNOWN) out.push({ id: 'many_unknown', level: 'info', vars: { n: snap.unknown } })
  return out
}

module.exports = { MIN_GAMING_HZ, MANY_UNKNOWN, compute }
