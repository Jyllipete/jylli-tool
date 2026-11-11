'use strict'
// Probe slices -> the report the page renders. Pure: the same inputs always give the same report (tests and the preview rely on that).
const incidents = require('./incidents')
const causes = require('./causes')
const findingsLib = require('./findings')
const grade = require('./grade')

const DAY = 24 * 3600 * 1000

/** Hourly stability-index samples -> one point per day (mean), oldest first. */
function dailyIndex(idx) {
  const by = new Map()
  for (const p of idx || []) {
    const d = Math.floor(p.t / DAY)
    const e = by.get(d) || { s: 0, n: 0 }
    e.s += p.v; e.n += 1
    by.set(d, e)
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([d, e]) => ({ t: d * DAY + DAY / 2, v: Math.round(e.s / e.n * 10) / 10 }))
}

/** What changed on the PC: journal entries (tweaks), driver installs, Windows updates. Last 30 days. */
function collectChanges(input) {
  const from = input.takenAt - 30 * DAY
  const out = []
  for (const e of input.journal || []) {
    if (!e || e.action !== 'apply' || e.undoneBy || !(e.ts >= from)) continue
    const id = e.tweakId || null
    out.push({ ts: e.ts, kind: 'tweak', id, entryId: e.id || null, label: id || String(e.control || 'change') })
  }
  for (const d of (input.data.drivers && input.data.drivers.list) || []) if (d.t && d.t >= from) out.push({ ts: d.t, kind: 'driver', label: `${d.n} ${d.v}`.trim() })
  for (const k of (input.data.updates && input.data.updates.kbs) || []) if (k.t >= from) out.push({ ts: k.t, kind: 'update', label: k.kb })
  return out.sort((a, b) => a.ts - b.ts)
}

/** input: { mode, takenAt, ms, admin, probes, data, profile, preflight, temps, journal }. */
function buildReport(input) {
  const data = input.data || {}
  const inc = incidents.normalize(data)
  const incSummary = incidents.summarize(inc, input.takenAt)
  const changes = collectChanges({ ...input, data })
  const ranked = causes.rank(changes, inc)
  const model = { data, profile: input.profile || null, preflight: input.preflight || null, temps: input.temps || null, incidents: inc, incidentSummary: incSummary, causes: ranked, takenAt: input.takenAt }
  const ev = findingsLib.evaluate(model)
  const grades = grade.grades(ev.measured, ev.findings)
  const ov = grade.overall(grades)
  const measuredTotal = Object.values(ev.measured).reduce((a, b) => a + b, 0)

  return {
    v: 1, mode: input.mode, takenAt: input.takenAt, ms: input.ms || 0, admin: !!input.admin,
    probes: input.probes || {},
    score: ov.score, tone: grade.tone(ov.score), used: ov.used, missing: ov.missing,
    grades, findings: ev.findings, passed: ev.passed,
    stats: { checks: measuredTotal, passed: ev.passed.length, findings: ev.findings.length, urgent: ev.findings.filter(f => f.severity === 'critical' || f.severity === 'high').length },
    incidents: inc.slice(-200),
    incidentSummary: incSummary,
    causes: ranked.map(c => ({ change: c.change, count: c.count, gapMs: c.gapMs, confidence: c.confidence, before: c.before, at: c.incidents.slice(0, 5).map(i => ({ ts: i.ts, kind: i.kind, code: i.code })) })),
    index: dailyIndex(data.reliability && data.reliability.idx),
    changes: changes.slice(-120),
    facts: {
      disks: (data.storage && data.storage.disks) || [], vols: (data.storage && data.storage.vols) || [], battery: data.battery || null,
      drivers: (data.drivers && data.drivers.list) || [], devices: (data.devices && data.devices.list) || [], net: data.net || null,
      memory: data.memory || null, cpu: data.cpu || null, updates: data.updates ? { rebootPending: data.updates.rebootPending, lastKbTs: data.updates.lastKbTs } : null,
      runtimes: data.runtimes || null, health: data.health || null, thermal: data.thermal || null, ram: data.ram || null, minidumps: (data.minidumps && data.minidumps.list) || [],
    },
    os: input.preflight ? { type: input.preflight.osType, label: input.preflight.osLabel } : null,
  }
}

/** Compact row for the history list. */
function historyRow(r) {
  return { ts: r.takenAt, mode: r.mode, score: r.score, grades: r.grades, findings: r.findings.map(f => f.id), urgent: r.stats.urgent }
}

/** What changed since the previous checkup: grade deltas, findings that appeared / went away. */
function diff(prev, r) {
  if (!prev || prev.score == null && !prev.grades) return null
  const deltas = {}
  for (const s of grade.SUBSYSTEMS) {
    const a = prev.grades && prev.grades[s], b = r.grades[s]
    if (a != null && b != null && a !== b) deltas[s] = b - a
  }
  const before = new Set(prev.findings || []), now = new Set(r.findings.map(f => f.id))
  return {
    since: prev.ts, score: r.score != null && prev.score != null ? r.score - prev.score : null, deltas,
    appeared: [...now].filter(id => !before.has(id)), resolved: [...before].filter(id => !now.has(id)),
  }
}

module.exports = { buildReport, historyRow, diff, dailyIndex, collectChanges }
