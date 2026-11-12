'use strict'
// Home "Next Best Move": one ranked list from real state. Pure and UMD. It only suggests; every action goes through an existing flow
// (restore point, Auto-Optimize, tweak batch, showPage). The concierge's moves (js/concierge.js) are merged in, not re-derived.
//   input = { now, restore:{level}, diag:{findings:[{id,subsystem,severity,penalty,vars}], takenAt}|null, drift:{count,ids}|null,
//             autoOpti:{lastAt}|null, cleanup:{reclaimableBytes}|null, debloat:{safe}|null, isAdmin, game:{running,name}|null,
//             ai:[{id,title,why}]|null, concierge:[move], dismissed:[id], done:[id] }
//   move  = { id, kind, titleKey, whyKey, vars, impact (ranking weight only, never shown), risk, reversible, facts, blocking, score, tab, action }
//   reversible: true only when the flow behind the button writes to the journal (Auto-Optimize, tweak batches, drift re-apply); opening a tab promises nothing.
//   facts: measured things shown as chips: { k: 'ram', bytes } | { k: 'scanned', ts }. Nothing here is an estimate.
//   action types: tab {page,tab} | autoOpti | batch {ids} | restore | drift {ids} | admin | ai {id}
;(function (root) {
  const DAY = 86400000
  const MB = 1048576, GB = 1073741824
  const MAX_NEXT = 3
  const IMPACT = { high: 3, medium: 2, low: 1 }
  // Concierge ids that a Home move already covers (the Home move knows more, so the concierge one is dropped).
  const COVERS = { protect: ['restore'], protectStale: ['restore'], autoOptiFirst: ['autoOpti'], autoOptiAgain: ['autoOpti'], reclaim: ['cleanup'], lean: ['debloat'] }

  const scanFact = ts => (Number.isFinite(ts) ? [{ k: 'scanned', ts }] : [])

  function candidates(input) {
    const out = []
    const add = m => out.push(Object.assign({ vars: {}, reversible: false, facts: [], blocking: false, risk: 1, kind: 'home' }, m, { titleKey: m.id + 'Title', whyKey: m.id + 'Why' }))
    const now = Number.isFinite(input.now) ? input.now : Date.now()

    const lvl = input.restore && input.restore.level
    if (lvl === 'never') add({ id: 'protect', base: 100, blocking: true, impact: 'high', tab: 'restore', action: { type: 'restore' } })
    else if (lvl === 'stale') add({ id: 'protectStale', base: 82, impact: 'high', tab: 'restore', action: { type: 'restore' } })

    const urgent = ((input.diag && input.diag.findings) || []).filter(f => f.severity === 'critical' || f.severity === 'high')
    if (urgent.length) add({ id: 'vitals', base: 92, blocking: urgent.some(f => f.severity === 'critical'), impact: 'high', vars: { n: urgent.length, first: urgent[0].id }, tab: 'diagnostics', action: { type: 'tab', page: 'preflight', tab: 'diagnostics' } })
    else if (!input.diag) add({ id: 'checkup', base: 70, impact: 'medium', tab: 'diagnostics', action: { type: 'tab', page: 'preflight', tab: 'diagnostics' } })

    if (input.drift && input.drift.count > 0) add({ id: 'drift', base: 88, impact: 'medium', reversible: true, vars: { n: input.drift.count }, tab: 'windows', action: { type: 'drift', ids: input.drift.ids || [] } })

    const last = input.autoOpti && input.autoOpti.lastAt
    if (!last) add({ id: 'autoOptiFirst', base: 86, impact: 'high', reversible: true, tab: 'home', action: { type: 'autoOpti' } })
    else if (now - last > 30 * DAY) add({ id: 'autoOptiAgain', base: 55, impact: 'medium', reversible: true, vars: { days: Math.floor((now - last) / DAY) }, tab: 'home', action: { type: 'autoOpti' } })

    const rec = input.cleanup && input.cleanup.reclaimableBytes
    if (rec >= 500 * MB) add({ id: 'reclaim', base: 45 + Math.min(20, Math.floor(rec / GB) * 4), impact: rec >= 5 * GB ? 'high' : 'medium', facts: scanFact(input.cleanup && input.cleanup.scanTs), vars: { bytes: rec }, tab: 'cleanup', action: { type: 'tab', page: 'privacy-cleanup', tab: 'cleanup' } })

    const safe = input.debloat && input.debloat.safe
    if (safe >= 3) add({ id: 'lean', base: 38, impact: 'medium', facts: [...(input.debloat.ram > 0 ? [{ k: 'ram', bytes: input.debloat.ram }] : []), ...scanFact(input.debloat.ts)], vars: { n: safe }, tab: 'debloat', action: { type: 'tab', page: 'debloater', tab: 'debloat' } })

    if (input.isAdmin === false) add({ id: 'admin', base: 50, impact: 'medium', tab: 'admin', action: { type: 'admin' } })

    if (input.game && input.game.running) add({ id: 'gameLive', base: 30, impact: 'low', vars: { name: input.game.name || '' }, tab: 'pulse', action: { type: 'tab', page: 'pulse', tab: 'pulse' } })

    for (const r of (input.ai || []).slice(0, 3)) add({ id: 'ai-' + r.id, kind: 'ai', base: 35, impact: 'medium', reversible: true, text: r.title || '', why: r.why || '', tab: 'ai-' + r.id, action: { type: 'ai', id: r.id } })
    return out
  }

  /** Home candidates plus the concierge's moves; a concierge move a Home move covers is dropped, dismissed/done are left out. */
  function rank(input) {
    input = input || {}
    const skip = new Set([...(input.dismissed || []), ...(input.done || [])])
    const own = candidates(input).map(m => ({ ...m, score: m.base }))
    const covered = new Set(own.flatMap(m => COVERS[m.id] || []))
    const conc = (input.concierge || [])
      .filter(m => !covered.has(m.id))
      .map(m => ({ vars: {}, risk: 1, impact: 'medium', facts: [], ...m, reversible: !!m.action && m.action.type === 'batch', blocking: !!m.blocking, score: m.score || 0, kind: 'concierge' }))
    const sorted = [...own, ...conc]
      .filter(m => !skip.has(m.id))
      .sort((a, b) => (b.blocking ? 1 : 0) - (a.blocking ? 1 : 0) || b.score - a.score || IMPACT[b.impact] - IMPACT[a.impact] || (a.id < b.id ? -1 : 1))
    const seenId = new Set(), seenTab = new Set(), all = []
    for (const m of sorted) {
      if (seenId.has(m.id) || (m.kind !== 'ai' && seenTab.has(m.tab))) continue
      seenId.add(m.id); seenTab.add(m.tab); all.push(m)
    }
    return { primary: all[0] || null, next: all.slice(1, 1 + MAX_NEXT), all, allClear: all.length === 0 }
  }

  const api = { rank, candidates, MAX_NEXT }
  root.JylliHomeMoves = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
