'use strict'
// Append-only audit record of every BIOS write attempt (and every disarm / restore request). One JSON object per line.
// Kept apart from snapshots: a snapshot is a backup, this says what was tried and how it ended. Never read back to make decisions.
const fs = require('fs')
const path = require('path')

const MAX_BYTES = 2 * 1024 * 1024

function create(file) {
  return {
    /** entry: { action, engine, device, changes:[{id,name,from,to}], result, error?, mismatches?, reverted?, stillChanged?, snapshotId?, trial? } */
    append(entry) {
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true })
        try { if (fs.statSync(file).size > MAX_BYTES) fs.renameSync(file, file + '.old') } catch {}
        fs.appendFileSync(file, JSON.stringify({ ts: Date.now(), ...entry }) + '\n')
        return true
      } catch { return false }   // the audit must never break a commit
    },
    /** Newest first. */
    list(limit = 100) {
      let text = ''
      try { text = fs.readFileSync(file, 'utf8') } catch { return [] }
      const out = []
      for (const line of text.split(/\r?\n/).reverse()) {
        if (!line) continue
        try { out.push(JSON.parse(line)) } catch {}
        if (out.length >= limit) break
      }
      return out
    },
  }
}

/** Shapes a transaction result (lib/bios/transaction.js) into an audit entry. */
function fromResult(action, engine, device, items, r) {
  const result = r.ok ? 'ok' : r.partial ? 'partial' : 'failed'
  return { action, engine, device: device ? { id: device.id, biosVersion: device.biosVersion || null } : null, changes: items || [], result, error: r.ok ? null : r.error || null,
    mismatches: r.mismatches || null, reverted: r.reverted != null ? r.reverted : null, stillChanged: r.stillChanged || null, snapshotId: r.snapshotId || null, trial: r.trial || null }
}

module.exports = { create, fromResult }
