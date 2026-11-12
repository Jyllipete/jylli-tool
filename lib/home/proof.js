'use strict'
// Home "Proof Ledger": what Jylli has really done for this PC, built only from what the app recorded (Auto-Optimize verify + last run,
// cleanup history, debloat summary, tweak state, journal). Pure and UMD. A tile with no recorded evidence is absent, never zero.
//   input = { now, verify: { boot: { beforeMs, afterMs, deltaMs } } | null,
//             aom: { ts, batchId, counters: { settingsChanged, startupRemoved, tasksDisabled, bytesReclaimed } } | null,
//             cleanup: { total, history: [{ ts, freedBytes, itemCount }] } | null,
//             debloat: { removed } | null (items Debloat really removed or switched off, from the journal), tweaks: { inPlace, drifted, checked } | null, journal: [entry] (newest first) }
;(function (root) {
  const DAY = 86400000
  const num = n => typeof n === 'number' && Number.isFinite(n)

  /** Last 7 days of the journal: { batches, changes, undone, failed, lastTs, byVia } (a batch = one Auto-Optimize / apply / undo run). */
  function weekSummary(entries, now) {
    const t0 = (num(now) ? now : Date.now()) - 7 * DAY
    const batches = new Set(), byVia = {}
    let changes = 0, undone = 0, failed = 0, lastTs = null
    for (const e of entries || []) {
      if (!e || !num(e.ts) || e.ts < t0 || e.action === 'restore' && e.via === 'undo') continue
      batches.add(e.batchId || 'single:' + e.id)
      changes++
      if (e.undoneBy) undone++
      if (e.result === 'error') failed++
      byVia[e.via || 'manual'] = (byVia[e.via || 'manual'] || 0) + 1
      if (lastTs == null || e.ts > lastTs) lastTs = e.ts
    }
    return { batches: batches.size, changes, undone, failed, lastTs, byVia }
  }

  /** Boot change from the Auto-Optimize verify result: { beforeMs, afterMs, deltaMs, faster }, or null when it was not measured. */
  function bootTile(verify) {
    const b = verify && verify.boot
    if (!b || !num(b.beforeMs) || !num(b.afterMs)) return null
    const deltaMs = num(b.deltaMs) ? b.deltaMs : b.afterMs - b.beforeMs
    return { beforeMs: b.beforeMs, afterMs: b.afterMs, deltaMs, faster: deltaMs < 0 }
  }

  function reclaimedTile(cleanup, aom) {
    const hist = (cleanup && cleanup.history) || []
    const fromHist = hist.reduce((a, h) => a + (num(h.freedBytes) ? h.freedBytes : 0), 0)
    const total = cleanup && num(cleanup.total) && cleanup.total > 0 ? cleanup.total : fromHist
    const bytes = total > 0 ? total : (aom && aom.counters && num(aom.counters.bytesReclaimed) ? aom.counters.bytesReclaimed : 0)
    if (!(bytes > 0)) return null
    const last = hist.length ? hist.reduce((a, h) => (h.ts > a.ts ? h : a), hist[0]) : null
    return { bytes, runs: hist.length, lastTs: last ? last.ts : null, lastBytes: last ? last.freedBytes : null }
  }

  function removedTile(aom, debloat) {
    const c = (aom && aom.counters) || {}
    const startup = num(c.startupRemoved) ? c.startupRemoved : 0, tasks = num(c.tasksDisabled) ? c.tasksDisabled : 0
    const apps = debloat && num(debloat.removed) ? debloat.removed : 0
    const n = startup + tasks
    if (!(n > 0 || apps > 0)) return null
    return { startup, tasks, apps }
  }

  function tweaksTile(t) {
    if (!t || !(num(t.inPlace) && t.inPlace > 0)) return null
    const drifted = Math.min(t.inPlace, Math.max(0, t.drifted || 0))
    // checked: whether the registry values were re-read recently. Unchecked, "holding" is only what the app applied, not proof it stayed.
    return { inPlace: t.inPlace, drifted, holding: t.inPlace - drifted, checked: !!t.checked }
  }

  /** -> { tiles: { boot, reclaimed, removed, tweaks }, week, hasProof, lastRunTs } */
  function ledger(input) {
    input = input || {}
    const tiles = {
      boot: bootTile(input.verify),
      reclaimed: reclaimedTile(input.cleanup, input.aom),
      removed: removedTile(input.aom, input.debloat),
      tweaks: tweaksTile(input.tweaks),
    }
    const week = weekSummary(input.journal, input.now)
    return { tiles, week, hasProof: Object.values(tiles).some(Boolean) || week.batches > 0, lastRunTs: input.aom && num(input.aom.ts) ? input.aom.ts : null }
  }

  const api = { ledger, weekSummary, bootTile, reclaimedTile, removedTile, tweaksTile }
  root.JylliHomeProof = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
