'use strict'
// Raw events / reliability records / minidumps -> normalised incidents, then clusters. Pure.
// incident: { ts, kind, severity: 'critical'|'high'|'medium'|'low', source, code, detail, cause, n }
// kinds: bugcheck | power-loss | whea | gpu-reset | disk | app-crash | app-hang | unclean
const bug = require('./bugchecks')

const HOUR = 3600 * 1000
const SEV_RANK = { critical: 4, high: 3, medium: 2, low: 1 }

function fromEvent(e) {
  const id = Number(e.id), p = String(e.p || ''), m = String(e.m || ''), ts = Number(e.t)
  if (!Number.isFinite(ts)) return null
  if (id === 1001 && /SystemErrorReporting/i.test(p)) {
    const b = bug.fromMessage(m)
    return { ts, kind: 'bugcheck', severity: 'critical', source: 'event', code: b ? b.code : null, cause: b ? b.cause : 'unknown', detail: b && b.name ? b.name : m.slice(0, 120) }
  }
  if (id === 41 && /Kernel-Power/i.test(p)) return { ts, kind: 'power-loss', severity: 'critical', source: 'event', code: '41', cause: 'power', detail: 'Kernel-Power 41' }
  if (id === 6008) return { ts, kind: 'unclean', severity: 'high', source: 'event', code: '6008', cause: 'unknown', detail: 'Unexpected shutdown' }
  if (/WHEA/i.test(p) && [17, 18, 19, 20, 47].includes(id)) return { ts, kind: 'whea', severity: id === 18 ? 'critical' : 'high', source: 'event', code: String(id), cause: id === 17 ? 'hardware' : 'overclock', detail: 'WHEA ' + id }
  if (id === 4101) return { ts, kind: 'gpu-reset', severity: 'high', source: 'event', code: '4101', cause: 'driver', detail: 'Display driver stopped responding and recovered' }
  if ([7, 51, 153, 11, 15, 55, 98, 129, 140].includes(id) && /disk|stor|ntfs|nvme|iaStor/i.test(p)) return { ts, kind: 'disk', severity: id === 7 || id === 55 ? 'high' : 'medium', source: 'event', code: String(id), cause: 'storage', detail: (p || 'disk') + ' ' + id }
  return null
}

function fromRecord(r) {
  const ts = Number(r.t), id = Number(r.id), src = String(r.src || ''), prod = String(r.p || '')
  if (!Number.isFinite(ts)) return null
  if (/Application Error|Windows Error Reporting|Application Hang|Application Crash/i.test(src) || [1000, 1002].includes(id)) {
    const hang = id === 1002 || /Hang/i.test(src)
    return { ts, kind: hang ? 'app-hang' : 'app-crash', severity: 'low', source: 'reliability', code: String(id), cause: 'software', detail: prod || src }
  }
  return null
}

function fromDump(d) {
  const ts = Number(d.t)
  if (!Number.isFinite(ts)) return null
  return { ts, kind: 'bugcheck', severity: 'critical', source: 'minidump', code: null, cause: 'unknown', detail: String(d.n || 'minidump'), file: String(d.n || '') }
}

/** Dedupe: events of the same kind+code within 2 minutes are one incident; a minidump near a bugcheck event folds into it. */
function normalize(data) {
  const out = []
  for (const e of (data.events && data.events.list) || []) { const i = fromEvent(e); if (i) out.push(i) }
  for (const r of (data.reliability && data.reliability.rec) || []) { const i = fromRecord(r); if (i) out.push(i) }
  const dumps = ((data.minidumps && data.minidumps.list) || []).map(fromDump).filter(Boolean)
  out.sort((a, b) => a.ts - b.ts)
  const res = []
  for (const i of out) {
    const prev = res.slice(-6).reverse().find(x => x.kind === i.kind && x.code === i.code && Math.abs(x.ts - i.ts) < 2 * 60 * 1000)
    if (prev) { prev.n += 1; continue }
    res.push({ ...i, n: 1 })
  }
  for (const d of dumps) {
    const bc = res.find(x => x.kind === 'bugcheck' && Math.abs(x.ts - d.ts) < 10 * 60 * 1000)
    if (bc) { bc.file = d.file; continue }
    res.push({ ...d, n: 1 })
  }
  return res.sort((a, b) => a.ts - b.ts)
}

/** Incidents closer than gapMs to the previous one share a cluster. Returns [{ start, end, incidents, worst, kinds }]. */
function cluster(list, gapMs = 6 * HOUR) {
  const out = []
  for (const i of list.slice().sort((a, b) => a.ts - b.ts)) {
    const last = out[out.length - 1]
    if (last && i.ts - last.end <= gapMs) { last.incidents.push(i); last.end = i.ts }
    else out.push({ start: i.ts, end: i.ts, incidents: [i] })
  }
  for (const c of out) {
    c.worst = c.incidents.reduce((m, i) => SEV_RANK[i.severity] > SEV_RANK[m] ? i.severity : m, 'low')
    c.kinds = [...new Set(c.incidents.map(i => i.kind))]
  }
  return out
}

/** Counts the findings use: serious incidents (everything except app crashes and hangs) in the last `days`. */
function summarize(list, now, days = 30) {
  const from = now - days * 24 * HOUR
  const inWin = list.filter(i => i.ts >= from)
  const serious = inWin.filter(i => i.kind !== 'app-crash' && i.kind !== 'app-hang')
  const by = {}
  for (const i of inWin) by[i.kind] = (by[i.kind] || 0) + (i.n || 1)
  return { total: inWin.length, serious: serious.length, by, last: serious.length ? serious[serious.length - 1].ts : null, last7: serious.filter(i => i.ts >= now - 7 * 24 * HOUR).length }
}

module.exports = { normalize, cluster, summarize, SEV_RANK, HOUR }
