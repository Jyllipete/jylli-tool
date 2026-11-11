'use strict'
// "What changed right before it started?" Pure and UMD.
// changes: [{ ts, kind: 'driver'|'update'|'tweak'|'app', label, id? }]  incidents: normalised incidents (lib/diagnostics/incidents.js).
// A change is only blamed when serious incidents follow it within 48 h, the incident cause fits the change kind, and the PC was not
// already crashing as often before it. A bare time match scores too low to be shown.
;(function (root) {
  const HOUR = 3600 * 1000
  const FITS = {
    driver: ['driver', 'unknown'],
    update: ['driver', 'software', 'unknown', 'storage'],
    tweak: ['overclock', 'power', 'thermal', 'software', 'driver', 'unknown', 'memory'],
    app: ['software', 'driver', 'unknown'],
  }
  const WINDOW = 48 * HOUR

  function rank(changes, incidents) {
    const serious = incidents.filter(i => i.kind !== 'app-crash' && i.kind !== 'app-hang').sort((a, b) => a.ts - b.ts)
    if (!serious.length) return []
    const out = []
    for (const ch of changes) {
      const fit = FITS[ch.kind] || ['unknown']
      const after = serious.filter(i => i.ts >= ch.ts)
      if (!after.length) continue
      const first = after[0]
      const gap = first.ts - ch.ts
      if (gap > WINDOW) continue
      const span = after[after.length - 1].ts - ch.ts + HOUR
      const before = serious.filter(i => i.ts < ch.ts && i.ts >= ch.ts - span)
      const between = changes.filter(c => c !== ch && c.ts > ch.ts && c.ts < first.ts).length
      const fitting = after.filter(i => fit.includes(i.cause))
      let pts = 0
      pts += gap <= 6 * HOUR ? 3 : gap <= 24 * HOUR ? 2 : 1
      pts += after.length >= 3 ? 2 : after.length === 2 ? 1 : 0
      pts += fitting.length ? 2 : -1
      if (before.length >= after.length) pts -= 3
      if (between) pts -= 1
      if (pts < 3) continue
      out.push({ change: ch, incidents: after.slice(0, 20), count: after.length, gapMs: gap, before: before.length, confidence: pts >= 6 ? 'high' : pts >= 4 ? 'medium' : 'low', score: pts })
    }
    return out.sort((a, b) => b.score - a.score || a.gapMs - b.gapMs).slice(0, 5)
  }

  const api = { rank, WINDOW }
  root.JylliCauses = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
