'use strict'
// Timeline of full-settings snapshots taken before every commit. One JSON file per snapshot, newest 30 kept.
const fs = require('fs')
const path = require('path')

const KEEP = 30
const FILE = /^snap_(\d+)\.json$/

function create(dir) {
  fs.mkdirSync(dir, { recursive: true })
  const names = () => fs.readdirSync(dir).filter(f => FILE.test(f)).sort()
  return {
    /** settings: normalised settings; stored as { id: current } plus names so the timeline stays readable. */
    save({ engine, settings, reason, changes }) {
      let id = Date.now()
      while (fs.existsSync(path.join(dir, `snap_${id}.json`))) id++
      const values = {}, labels = {}
      for (const s of settings) { values[s.id] = s.current; labels[s.id] = s.name }
      fs.writeFileSync(path.join(dir, `snap_${id}.json`), JSON.stringify({ id, ts: id, engine, reason: reason || 'commit', changes: changes || [], values, labels }))
      for (const f of names().slice(0, -KEEP)) { try { fs.unlinkSync(path.join(dir, f)) } catch {} }
      return id
    },
    list() {
      return names().reverse().map(f => { try { const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); return { id: j.id, ts: j.ts, engine: j.engine, reason: j.reason, changes: j.changes, count: Object.keys(j.values).length } } catch { return null } }).filter(Boolean)
    },
    get(id) {
      if (!/^\d+$/.test(String(id))) return null
      try { return JSON.parse(fs.readFileSync(path.join(dir, `snap_${id}.json`), 'utf8')) } catch { return null }
    },
  }
}

/** Changes needed to go from `current` settings back to a snapshot; read-only and unknown settings are skipped. */
function restoreChanges(snapshot, current) {
  const out = []
  for (const s of current) {
    if (s.tier === 'readonly' || !(s.id in snapshot.values)) continue
    if (String(snapshot.values[s.id]) !== String(s.current)) out.push({ id: s.id, value: String(snapshot.values[s.id]) })
  }
  return out
}

module.exports = { create, restoreChanges, KEEP }
