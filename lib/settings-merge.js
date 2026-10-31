'use strict'
// save-settings takes the renderer's whole settings object. When main itself changed tweak state a moment earlier
// (apply-batch, Auto-Optimize), a stale renderer copy must not overwrite it. main remembers its own recent writes and
// re-applies them over the incoming object; older ones are assumed to have reached the renderer through `settings-patch`.

function createWriteLog({ now = Date.now, windowMs = 15000 } = {}) {
  const writes = new Map()   // key -> { value, ts }
  return {
    note(key, value) { writes.set(key, { value, ts: now() }) },
    /** Keys main wrote inside the window, as a plain object. Expired entries are dropped. */
    recent() {
      const t = now(), out = {}
      for (const [k, w] of writes) {
        if (t - w.ts > windowMs) writes.delete(k)
        else out[k] = w.value
      }
      return out
    },
  }
}

/** incoming: object from the renderer. Returns a copy where main's recent writes win. */
function mergeIncoming(incoming, recentMainWrites) {
  const out = { ...incoming }
  for (const [k, v] of Object.entries(recentMainWrites || {})) out[k] = v
  return out
}

module.exports = { createWriteLog, mergeIncoming }
