'use strict'
// Home service. create(deps) -> { snapshot, cached, drift, noteLegacy, noteVerify }.
// It only reads what the other engines already recorded (nothing here scans or changes the PC, except `drift`, which re-reads registry values),
// and turns it into the Jylli Index, the facts the Next Best Move ranking needs, and the Proof Ledger. Every side effect comes in through deps,
// so tests drive it with fakes. A source that fails is "not measured", never a made-up value.
//   deps: state { read(), write(v) }   now?()
//         settings() -> settings object            applicability() -> { tweakId: { show, state } } | null (null until the PC is profiled)
//         restore() -> { newestAt, lastCreatedAt } diagCached() -> { report } | null          isAdmin() -> bool | null
//         cleanupHistory() -> [entry]              cleanupScans() -> [{ ts, sizes }]          cleanupLane(id) -> 'safe'|'review'|'permanent'|null
//         debloatSummary() -> summary | null       journal(limit) -> [entry] (newest first)   game() -> { running, name } | null
//         driftCheck() -> { checked, reverted: [ids] }
const model = require('./model')
const proof = require('./proof')
const restoreNudge = require('../../js/restore-nudge')

const DAY = 86400000
const DRIFT_FRESH_MS = 7 * DAY
const SCAN_FRESH_MS = 14 * DAY
const DEFAULT_STATE = { last: null, history: [], verify: null, drift: null, legacy: null }

function create(deps) {
  const now = deps.now || Date.now
  const read = () => { let s = null; try { s = deps.state.read() } catch { s = null } return { ...DEFAULT_STATE, ...(s || {}) } }
  const write = s => { try { deps.state.write(s) } catch { /* disk full / locked: the result is still returned */ } }
  const safe = async (fn, fallback) => { try { const v = await fn(); return v === undefined ? fallback : v } catch { return fallback } }

  const appliedIds = settings => Object.keys(settings || {}).filter(k => k.startsWith('tweak_') && settings[k] === 'applied').map(k => k.slice(6))

  /** Counts for the Tuned pillar: what is in place, what this PC could still use, what has drifted back. null when the PC is not profiled yet. */
  function tunedFacts(settings, map, drift) {
    if (!map) return null
    const applied = appliedIds(settings)
    const open = Object.keys(map).filter(id => map[id] && map[id].show !== false && map[id].state === 'recommended' && !applied.includes(id)).length
    const drifted = drift ? drift.ids.filter(id => applied.includes(id)).length : 0
    return { applied: applied.length, open, drifted }
  }

  /** The diagnostics report, cut down to what Home shows. */
  function diagFacts(c) {
    const r = c && c.report
    if (!r || typeof r.score !== 'number') return null
    return {
      score: r.score, takenAt: r.takenAt, tone: r.tone, grades: r.grades || {}, stats: r.stats || {},
      findings: (r.findings || []).slice(0, 12).map(f => ({ id: f.id, subsystem: f.subsystem, severity: f.severity, penalty: f.penalty, vars: f.vars || {} })),
    }
  }

  /** Debloat items that are really gone: journalled apply entries of `debloat:*` controls that were not undone and did not fail. */
  function debloatRemoved(journal) {
    const gone = new Set()
    for (const e of journal || []) if (e && typeof e.control === 'string' && e.control.startsWith('debloat:') && e.action === 'apply' && e.result !== 'error' && !e.undoneBy) gone.add(e.control)
    return gone.size
  }

  /** Bytes the last cleanup scan found in the safe lane (a scan older than two weeks says nothing about now). */
  function reclaimable(scans, t) {
    const s = (scans || [])[0]
    if (!s || !s.sizes || !(t - s.ts < SCAN_FRESH_MS)) return null
    let sum = 0
    for (const id of Object.keys(s.sizes)) if (deps.cleanupLane(id) === 'safe' && s.sizes[id] > 0) sum += s.sizes[id]
    return sum
  }

  async function snapshot() {
    const t = now()
    const st = read()
    const settings = (await safe(deps.settings, {})) || {}
    const [map, rp, diagC, adm, cleanHist, scans, deb, journal, game] = await Promise.all([
      safe(deps.applicability, null), safe(deps.restore, null), safe(deps.diagCached, null), safe(deps.isAdmin, null),
      safe(deps.cleanupHistory, []), safe(deps.cleanupScans, []), safe(deps.debloatSummary, null), safe(() => deps.journal(900), []), safe(deps.game, null),
    ])
    const restore = rp ? restoreNudge.restoreStatus({ newestAt: rp.newestAt, lastCreatedAt: rp.lastCreatedAt, now: t }) : null
    const drift = st.drift && t - st.drift.checkedAt < DRIFT_FRESH_MS ? { ids: st.drift.ids || [], checkedAt: st.drift.checkedAt } : null
    const diag = diagFacts(diagC)
    const legacy = st.legacy && typeof st.legacy.score === 'number' ? st.legacy : null
    const tuned = tunedFacts(settings, map, drift)
    const aom = settings.aom_last_run && settings.aom_last_run.ts ? settings.aom_last_run : null

    const index = model.buildIndex({ now: t, diag, legacy, tuned, protect: { restore, isAdmin: adm == null ? null : !!adm } })
    let history = st.history
    if (index.score != null) {
      history = model.pushHistory(st.history, { ts: t, score: index.score, h: index.pillars.health.pct, t: index.pillars.tuned.pct, p: index.pillars.protected.pct })
    }
    const ledger = proof.ledger({
      now: t, verify: st.verify, aom, journal,
      cleanup: { history: cleanHist, total: cleanHist.reduce((a, h) => a + (h && h.freedBytes > 0 ? h.freedBytes : 0), 0) },
      debloat: { removed: debloatRemoved(journal) },
      tweaks: { inPlace: tuned ? tuned.applied : appliedIds(settings).length, drifted: tuned ? tuned.drifted : 0, checked: !!drift },
    })
    const facts = {
      now: t, restore, diag, legacy, tuned, driftCheckedAt: st.drift ? st.drift.checkedAt : null, drift: drift && drift.ids.length ? { count: drift.ids.filter(id => appliedIds(settings).includes(id)).length, ids: drift.ids, checkedAt: drift.checkedAt } : null,
      autoOpti: { lastAt: aom ? aom.ts : null }, isAdmin: adm == null ? null : !!adm, game,
      cleanup: { reclaimableBytes: reclaimable(scans, t), scanTs: scans && scans[0] ? scans[0].ts : null }, debloat: deb ? { safe: deb.safe, count: deb.count, ram: deb.safeRam > 0 ? deb.safeRam : null, ts: deb.ts || null } : null,
      profiled: !!map, premium: !!settings.isPremium,
    }
    if (facts.drift && facts.drift.count === 0) facts.drift = null
    const out = { ok: true, ts: t, index, trend: model.trend(history, t), history: history.slice(-30), facts, proof: ledger }
    write({ ...st, history, last: out })
    return out
  }

  /** The last snapshot, for painting Home instantly before the fresh one arrives. */
  function cached() { const s = read(); return { ok: true, last: s.last || null } }

  /** Re-read the registry values of the applied tweaks (slow: one PowerShell read each), remember which ones changed back. */
  async function drift() {
    const r = await safe(deps.driftCheck, null)
    if (!r) return { ok: false, error: 'check-failed' }
    const st = read()
    st.drift = { ids: Array.isArray(r.reverted) ? r.reverted.slice(0, 200) : [], checkedAt: now() }
    write(st)
    return { ok: true, checked: r.checked || 0, ids: st.drift.ids, checkedAt: st.drift.checkedAt }
  }

  /** The quick health score, only a fallback for a PC that has not had a Vitals checkup yet. */
  function noteLegacy(score) {
    if (typeof score !== 'number' || !Number.isFinite(score)) return { ok: false }
    const st = read(); st.legacy = { score: Math.max(0, Math.min(100, Math.round(score))), at: now() }; write(st)
    return { ok: true }
  }

  /** Remember the boot before/after of the last verified Auto-Optimize run (the verify result is gone once it is dismissed). */
  function noteVerify(v) {
    const b = v && v.rebooted && v.boot
    if (!b || typeof b.beforeMs !== 'number' || typeof b.afterMs !== 'number') return { ok: false }
    const st = read(); st.verify = { boot: { beforeMs: b.beforeMs, afterMs: b.afterMs, deltaMs: typeof b.deltaMs === 'number' ? b.deltaMs : b.afterMs - b.beforeMs }, runAt: v.runAt || null, ts: now() }; write(st)
    return { ok: true }
  }

  return { snapshot, cached, drift, noteLegacy, noteVerify }
}

module.exports = { create, model, proof, moves: require('./moves'), rewind: require('./rewind') }
