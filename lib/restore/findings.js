'use strict'
// Restore points "Lifeline": the ONLY list of what the tab may say. Every threshold is named here; the page renders the result and never decides anything itself.
const DAY = 24 * 3600 * 1000
const T = {
  STALE_MS: 7 * DAY,            // the newest point is older than this -> "refresh it"
  STORAGE_HIGH: 0.85,           // points use this share of their cap -> Windows will start dropping the oldest ones
  CAP_MIN_BYTES: 1024 ** 3,     // a cap below 1 GB holds hardly one point
  DISK_LOW_BYTES: 5 * 1024 ** 3, // less free disk than this -> a restore may fail halfway
  CAP_PCT: [2, 5, 10, 15],      // what the storage control offers (percent of the disk)
}

/**
 * The one headline rule. m: { read, admin, protection, policyBlocked, points, since, newestAt, now }. `since` = Jylli changes made after the newest point: a rollback to it
 * would undo them, so they are COVERED by it (never a warning); they only make a rollback bigger, which is what a stale point costs.
 * Order matters: a PC we could not read is never called "covered", and a switched-off protection beats everything that follows from it.
 */
function verdict(m) {
  const now = m.now
  if (m.admin === false) return { kind: 'noadmin', tone: 'warn', cta: 'relaunch', vars: {} }
  if (!m.read) return { kind: 'unknown', tone: 'warn', cta: 'rescan', vars: {} }
  if (m.protection === 'off' || m.policyBlocked) return { kind: 'off', tone: 'danger', cta: 'protect', vars: { policy: m.policyBlocked ? 1 : 0 } }
  if (!m.points) return { kind: 'none', tone: 'warn', cta: 'create', vars: {} }
  if (m.newestAt != null && now - m.newestAt > T.STALE_MS) return { kind: 'stale', tone: 'warn', cta: 'create', vars: { days: Math.floor((now - m.newestAt) / DAY), since: m.since || 0 } }
  return { kind: 'covered', tone: 'ok', cta: 'create', vars: { n: m.points, since: m.since || 0 } }
}

/** Findings besides the headline (the page hides the one the headline already says). m adds: vssDisabled, storage, volume, lastRestore. */
function compute(m, verdictKind) {
  const out = []
  const add = (kind, tone, vars = {}) => { if (kind !== verdictKind) out.push({ kind, tone, vars }) }
  if (!m.read) return out
  if (m.admin !== false && m.protection !== 'off' && !m.policyBlocked && !m.points) add('none', 'warn')
  // Changes older than EVERY point: no restore point can undo them, only the change journal (History tab). Information, not an alarm: a new point never fixes it.
  if (m.points && m.unprotected > 0) add('unprotected', 'info', { n: m.unprotected })
  if (m.points && m.newestAt != null && m.now - m.newestAt > T.STALE_MS) add('stale', 'warn', { days: Math.floor((m.now - m.newestAt) / DAY) })
  if (m.policyBlocked && m.protection !== 'off') add('policy', 'warn')
  if (m.vssDisabled) add('vss', 'warn')
  const st = m.storage
  if (st && st.has && st.max && st.used / st.max >= T.STORAGE_HIGH) add('storageHigh', 'warn', { pct: Math.round((st.used / st.max) * 100) })
  if (st && st.has && st.max != null && st.max < T.CAP_MIN_BYTES) add('capSmall', 'info')
  if (m.volume && m.volume.free != null && m.volume.free < T.DISK_LOW_BYTES) add('diskLow', 'warn')
  // The result of the last restore is the receipt banner's job (it can be dismissed); it is not repeated here.
  return out
}

module.exports = { T, DAY, verdict, compute }
