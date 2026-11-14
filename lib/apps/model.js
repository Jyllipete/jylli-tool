'use strict'
// Apps tab "Backstage": probe + process sample + what Jylli remembers -> one model per program. Pure.
// Change status (exactly one): on | native (set, Jylli did not set it) | off | partial | drifted (Jylli set it, Windows reads default)
//   | elsewhere (another value from somebody else: never overwritten) | unknown (cannot be read) | na (the service is not on this PC)
// "rec" (recommended) is decided here and nowhere else: the row says so, the program is installed and the row is open.
const known = require('./known')
const catalog = require('./catalog')
const detect = require('./detect')
const rules = require('./rules')
const footprint = require('./footprint')
const { statusOf } = require('../windows/model')

const SET = new Set(['on', 'native'])

/**
 * o: { probe: detect.parse()|null, sample: detect.parseProcs()|null, files: {rowId: {state}}, remembered: {rowId:'applied'},
 *      picks: {appId: level}, premium, legacy: [{id,app}], game: {stems:[..]}|null, skip: [process names to leave out of costs] }
 */
function build(o) {
  const probe = o.probe || null, sample = o.sample || null
  const grouped = sample ? footprint.group(sample.procs, { gpu: sample.gpu, skip: o.skip }) : null
  const byApp = grouped ? grouped.byApp : {}
  const remembered = o.remembered || {}
  const apps = []
  for (const a of known.APPS) {
    const cost = grouped ? (byApp[a.id] || { cpu: 0, ram: 0, vram: sample.gpu ? 0 : null, n: 0, procs: [] }) : null
    const running = !!(cost && cost.n > 0)
    const rows = []
    for (const r of catalog.rowsOf(a.id)) {
      const live = detect.evaluate(probe, r, o.files)
      const rem = remembered[r.id] || 'default'
      if (live.state === 'na' && rem !== 'applied') continue            // a service this PC does not have is not offered
      const status = live.state === 'other' ? 'elsewhere' : live.state === 'na' ? 'unknown' : statusOf(rem, live, false)
      rows.push({ id: r.id, icon: r.icon, kind: r.kind, status, remembered: rem, restart: !!r.restart, wanted: !!r.rec, value: live.value == null ? null : live.value })
    }
    const startEntry = probe ? probe.run.find(x => known.startsApp(a, x.c) || known.startsApp(a, x.n)) : null
    const installedByProbe = !!(probe && probe.installed[a.id])
    const installed = installedByProbe || running || !!startEntry || rows.some(r => SET.has(r.status))
    if (!installed) continue
    for (const r of rows) r.rec = r.wanted && r.status === 'off' && (installedByProbe || running || !!startEntry)
    const wanted = rows.filter(r => r.wanted)
    const setN = wanted.filter(r => SET.has(r.status)).length
    const drift = rows.some(r => r.status === 'drifted')
    let summary = 'none'
    if (rows.length) summary = drift ? 'drift' : rows.some(r => r.status === 'unknown') && !rows.some(r => SET.has(r.status)) ? 'unknown' : wanted.length && setN === wanted.length ? 'tuned' : rows.some(r => r.rec) ? 'open' : rows.some(r => SET.has(r.status)) ? 'partial' : 'none'
    const allowed = rules.allowed(a)
    const level = rules.levelOf(a, o.picks, o.premium)
    const picked = o.picks && o.picks[a.id] != null ? o.picks[a.id] : null
    apps.push({
      id: a.id, cat: a.cat, role: a.role, vendor: a.vendor, installed: true, running, cost,
      rows, rec: rows.filter(r => r.rec).map(r => r.id), summary, drift,
      startup: startEntry ? { on: startEntry.on !== false, name: startEntry.n } : null,
      level, picked, levels: allowed.map(id => ({ id, locked: id === 'quiet' && !o.premium })), canStep: allowed.length > 1,
      stepping: level !== 'off',
    })
  }
  const costs = {}
  for (const a of apps) if (a.cost && a.running) costs[a.id] = a.cost
  const totals = grouped ? footprint.totals(costs) : null
  return {
    apps, totals, others: grouped ? grouped.others : [], gpu: sample ? sample.gpu : false, cores: sample ? sample.cores : 0, measured: !!sample, read: !!probe,
    segments: grouped ? { cpu: footprint.segments(costs, 'cpu'), ram: footprint.segments(costs, 'ram'), vram: sample.gpu ? footprint.segments(costs, 'vram') : [] } : null,
    legacy: (o.legacy || []),
  }
}

/** Counts for the stage and the chips. */
function counts(apps) {
  const rec = apps.reduce((n, a) => n + a.rec.length, 0)
  return {
    apps: apps.length, running: apps.filter(a => a.running).length, rec, recApps: apps.filter(a => a.rec.length).length,
    on: apps.reduce((n, a) => n + a.rows.filter(r => SET.has(r.status)).length, 0), drift: apps.filter(a => a.drift).length,
    startup: apps.filter(a => a.startup && a.startup.on).length, stepping: apps.filter(a => a.running && a.stepping).length,
  }
}

module.exports = { build, counts, SET }
