'use strict'
// Timeline of full-settings snapshots taken before every commit. One JSON file per snapshot.
//   - each file carries a SHA-256 of its content; get() refuses a file that no longer matches
//   - written atomically (temp file, then rename) so a crash never leaves a half-written backup
//   - the first snapshot per device + engine is "pinned" (the original values) and is never pruned
//   - a snapshot remembers which device and BIOS version it came from; restore refuses another PC or a different BIOS version
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const KEEP = 30
const FILE = /^snap_(\d+)\.json$/
const sha = s => crypto.createHash('sha256').update(s).digest('hex')
// what the hash covers: everything that decides what a restore would write
const body = j => JSON.stringify({ id: j.id, engine: j.engine, fingerprint: j.fingerprint || null, biosVersion: j.biosVersion || null, values: j.values, labels: j.labels })

function create(dir) {
  fs.mkdirSync(dir, { recursive: true })
  const names = () => fs.readdirSync(dir).filter(f => FILE.test(f)).sort()
  const readFile = f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) } catch { return null } }
  return {
    /** settings: normalised settings; stored as { id: current } plus names so the timeline stays readable. `device` = { id, biosVersion }. */
    save({ engine, settings, reason, changes, device }) {
      let id = Date.now()
      while (fs.existsSync(path.join(dir, `snap_${id}.json`))) id++
      const values = {}, labels = {}
      for (const s of settings) { values[s.id] = s.current; labels[s.id] = s.name }
      const fingerprint = device && device.id ? device.id : null
      const biosVersion = device && device.biosVersion ? device.biosVersion : null
      const hasPinned = names().some(f => { const j = readFile(f); return j && j.pinned && j.engine === engine && (j.fingerprint || null) === fingerprint })
      const j = { id, ts: id, engine, reason: reason || 'commit', changes: changes || [], values, labels, fingerprint, biosVersion, pinned: !hasPinned }
      j.sha256 = sha(body(j))
      const file = path.join(dir, `snap_${id}.json`)
      fs.writeFileSync(file + '.tmp', JSON.stringify(j))
      fs.renameSync(file + '.tmp', file)
      // prune the oldest unpinned ones beyond KEEP
      const all = names()
      let over = all.length - KEEP
      for (const f of all) {
        if (over <= 0) break
        const s = readFile(f)
        if (s && s.pinned) continue
        try { fs.unlinkSync(path.join(dir, f)); over-- } catch {}
      }
      return id
    },
    list() {
      return names().reverse().map(f => {
        const j = readFile(f)
        if (!j) return null
        return { id: j.id, ts: j.ts, engine: j.engine, reason: j.reason, changes: j.changes, count: Object.keys(j.values || {}).length, pinned: !!j.pinned, fingerprint: j.fingerprint || null, biosVersion: j.biosVersion || null, intact: verify(j) }
      }).filter(Boolean)
    },
    /** The snapshot, or null when missing / unreadable / altered (hash mismatch). Files from before hashing exist are accepted as legacy. */
    get(id) {
      if (!/^\d+$/.test(String(id))) return null
      const j = readFile(`snap_${id}.json`)
      return j && verify(j) ? j : null
    },
  }
}

function verify(j) { return !j.sha256 || j.sha256 === sha(body(j)) }

/** null when a restore may go ahead, else 'device_mismatch' | 'bios_changed'. `device` = current { id, biosVersion }. Legacy snapshots (no fingerprint) pass. */
function checkRestore(snapshot, device) {
  if (!snapshot.fingerprint) return null
  if (!device || !device.id || snapshot.fingerprint !== device.id) return 'device_mismatch'
  if (snapshot.biosVersion && device.biosVersion && snapshot.biosVersion !== device.biosVersion) return 'bios_changed'
  return null
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

module.exports = { create, restoreChanges, checkRestore, KEEP }
