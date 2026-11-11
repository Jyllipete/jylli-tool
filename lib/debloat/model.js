'use strict'
// Snapshot (probe.parse) + catalog -> the scan model the tab renders. Pure.
//   item.state: 'on' (present, can be removed/switched off) | 'off' (already done) | 'missing' (not on this PC)
// The model only carries facts. Which lane an item lands in, and what is ticked, is classify.js (it needs the user's intents).
const catalog = require('./catalog')

const HOUR = 3600000

function stateOf(item, snap) {
  switch (item.kind) {
    case 'appx': return snap.appx[item.pkg.toLowerCase()] ? 'on' : 'missing'
    case 'service': {
      const s = snap.svc[item.svc.toLowerCase()]
      return !s ? 'missing' : /disabled/i.test(s.start) ? 'off' : 'on'
    }
    case 'task': {
      const t = snap.tasks[catalog.taskKey(item.task.path, item.task.name)]
      return !t ? 'missing' : /disabled/i.test(t.state) ? 'off' : 'on'
    }
    case 'ad': return item.reg.every(r => snap.reg[r.key + '|' + r.name] === r.off) ? 'off' : 'on'
    case 'feature': {
      const v = snap.feat[item.feature.toLowerCase()]
      return v === undefined ? 'missing' : v ? 'on' : 'off'
    }
    default: return 'missing'
  }
}

function ramOf(item, snap) {
  let ram = 0
  if (item.kind === 'service') { const s = snap.svc[item.svc.toLowerCase()]; if (s && s.shared === 1) ram = s.ram }   // a shared svchost is not this service's memory
  if (!ram) ram = item.exe.reduce((a, e) => a + (snap.procs[e.toLowerCase()] || 0), 0)
  return ram
}

function lastUsedOf(item, snap) {
  const ts = item.exe.map(e => snap.lastRun[e.toLowerCase()]).filter(Boolean)
  return ts.length ? Math.max(...ts) : null
}

function refOf(item) {
  switch (item.kind) {
    case 'appx': return item.pkg
    case 'service': return item.svc
    case 'task': return item.task.path + item.task.name
    case 'ad': return item.reg.map(r => r.name).join(', ')
    default: return item.feature
  }
}

/** buildModel(snapshot, { now }) -> { ts, items[], facts, totals } or null when the snapshot is missing. */
function buildModel(snap, opts = {}) {
  if (!snap) return null
  const now = opts.now || Date.now()
  const items = catalog.CATALOG.map(item => {
    const state = stateOf(item, snap)
    const out = {
      id: item.id, kind: item.kind, layer: catalog.layerOf(item), group: item.group, lane: item.lane, state,
      needs: item.needs, use: item.use || null, tags: item.tags, breaks: item.breaks, security: !!item.security,
      protected: catalog.isProtectedItem(item), surface: item.surface || null, ref: refOf(item),
      ram: state === 'on' ? ramOf(item, snap) : 0, disk: 0, lastUsed: lastUsedOf(item, snap),
    }
    if (item.kind === 'appx') {
      const a = snap.appx[item.pkg.toLowerCase()]
      out.family = a ? a.family : ''
      out.disk = a ? a.size : 0
      out.provisioned = snap.provisioned.includes(item.pkg.toLowerCase())
    }
    if (item.kind === 'task') {
      const t = snap.tasks[catalog.taskKey(item.task.path, item.task.name)]
      out.next = t && t.next ? t.next : null
      out.repMs = t ? t.repMs : 0
    }
    if (item.kind === 'service') { const s = snap.svc[item.svc.toLowerCase()]; out.running = !!s && /running/i.test(s.state) }
    if (item.kind === 'ad') out.regs = item.reg.map(r => ({ key: r.key, name: r.name, now: snap.reg[r.key + '|' + r.name] === undefined ? null : snap.reg[r.key + '|' + r.name] }))
    return out
  })
  return { ts: now, items, facts: snap.facts, oem: catalog.oemFor(snap.facts.mfr), window: 24 * HOUR }
}

module.exports = { buildModel, stateOf, ramOf }
