'use strict'
// Pure helpers: scan model (what the UI draws), receipts, history entries. No fs, no Electron.
const targets = require('./targets')

/** A scan result per target -> the model the renderer gets. `ctx` = { running:Set(lower-case exe), has:{nvidia,amd,fivem}, wuPending } */
function buildModel(scans, ctx = {}) {
  const running = ctx.running || new Set(), has = ctx.has || {}
  const items = []
  for (const t of targets.TARGETS) {
    const s = scans[t.id]
    if (!s) continue
    if (t.requires && !has[t.requires]) continue
    if (t.skipWhenWuPending && ctx.wuPending) continue
    if (!s.present && !s.unknown) continue
    const lockedBy = (t.processes || []).filter(p => running.has(p.toLowerCase()))
    items.push({
      id: t.id, group: t.group, lane: t.lane, rebuild: t.rebuild, icon: t.icon, slow: !!t.slow, special: t.special || null,
      bytes: s.bytes || 0, files: s.files || 0, unknown: !!s.unknown, recommended: s.recommended == null ? null : !!s.recommended,
      personalFiles: s.personalFiles || 0, personalBytes: s.personalBytes || 0, recentBytes: s.recentBytes || 0, newest: s.newest || 0,
      roots: (s.roots || []).slice(0, 8), lockedBy,
    })
  }
  const sum = f => items.filter(f).reduce((a, i) => a + i.bytes, 0)
  const groups = {}
  for (const i of items) { const g = groups[i.group] || (groups[i.group] = { id: i.group, bytes: 0, items: 0 }); g.bytes += i.bytes; g.items++ }
  return {
    items,
    groups: targets.GROUPS.filter(g => groups[g]).map(g => groups[g]),
    totals: { safe: sum(i => i.lane === 'safe'), review: sum(i => i.lane === 'review'), permanent: sum(i => i.lane === 'permanent'), all: sum(() => true) },
    locked: items.filter(i => i.lockedBy.length && i.bytes > 0).length,
    personalFiles: items.reduce((a, i) => a + i.personalFiles, 0),
  }
}

/** Run results -> receipt. `disk` = { before, after } free bytes (nullable). */
function buildReceipt(results, { startedAt, endedAt, disk } = {}) {
  const rows = results.map(r => ({
    id: r.id, freed: r.freed || 0, files: r.files || 0, unknownFreed: !!r.unknownFreed, error: r.error || null,
    skipped: r.skipped || { inUse: 0, access: 0, tooNew: 0, personal: 0 }, skippedBytes: r.skippedBytes || 0,
  }))
  const total = rows.reduce((a, r) => a + r.freed, 0)
  const retry = rows.filter(r => r.skipped.inUse > 0 || r.skipped.access > 0 || r.error).map(r => r.id)
  const delta = disk && disk.before != null && disk.after != null ? Math.max(0, disk.after - disk.before) : null
  return { rows, total, delta, retry, ms: Math.max(0, (endedAt || 0) - (startedAt || 0)), skippedTotal: rows.reduce((a, r) => a + r.skippedBytes, 0), endedAt: endedAt || Date.now(), disk: disk || null }
}

/** What goes into jt_cleanup_history.json (kept compatible with the old { ts, freedBytes, itemCount, failedCount, diskFreeBytes }). */
function historyEntry(receipt) {
  return {
    ts: receipt.endedAt, freedBytes: receipt.total, itemCount: receipt.rows.filter(r => r.freed > 0).length,
    failedCount: receipt.rows.filter(r => r.error || r.skipped.inUse || r.skipped.access).length,
    diskFreeBytes: receipt.disk && receipt.disk.after != null ? receipt.disk.after : 0,
    per: Object.fromEntries(receipt.rows.filter(r => r.freed > 0).map(r => [r.id, r.freed])),
  }
}

module.exports = { buildModel, buildReceipt, historyEntry }
