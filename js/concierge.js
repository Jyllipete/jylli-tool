'use strict'
// Concierge: pure ranking of "first moves" for this PC. It only suggests; applying goes through the existing flows (showPage, applyTweakBatch,
// runAutoOpti). recommend(input, deps) is deterministic. Unit-tested in test/concierge.test.js.
//   input: { sysInfo, profile:{useCase,priorities[],comfort,games[]}, pfStates, safetyScore, osType, health:{checked,ok,restorePoint}, games, startupItems, aomDetected, isPremium, settings }
//   deps:  { tier: pcTier(), plan: [{id,name,gamerImpact,safetyTier}], meta, conflicts: TWEAK_CONFLICTS, startupRecommended: STARTUP_RECOMMENDED_DISABLE }
;(function (root) {
  const MAX_MOVES = 5
  const COMFORT_MAX_RISK = { safe: 1, balanced: 2, expert: 3 }
  const RISK_PENALTY = { safe: { 1: 0, 2: 30, 3: 60 }, balanced: { 1: 0, 2: 5, 3: 25 }, expert: { 1: 0, 2: 0, 3: 5 } }
  // Weight of a use case / priority for a move id
  const USE = {
    fps: { essentials: 15, 'game-profile': 20, latency: 20, network: 8 },
    open: { essentials: 12, 'game-profile': 15, power: 6 },
    stream: { essentials: 10, 'game-profile': 8, startup: 8 },
    work: { startup: 15, cleanup: 12, debloat: 8 },
    mix: { essentials: 8, startup: 6, cleanup: 6 },
  }
  const PRIO = {
    performance: { essentials: 12, 'game-profile': 8, power: 8 },
    latency: { latency: 15, network: 10, 'game-profile': 6 },
    quiet: { startup: 6, cleanup: 4, power: -4 },
    battery: { startup: 8, power: -20 },
    privacy: { debloat: 14, essentials: 4 },
    startup: { startup: 18 },
  }
  const norm = s => String(s || '').toLowerCase()

  const applied = (id, input) => input.pfStates?.[id] === true || input.settings?.['tweak_' + id] === 'applied'

  function essentialsIds(input, deps) {
    const si = input.sysInfo || {}
    return (deps.plan || [])
      .filter(t => (t.safetyTier || 1) === 1 && t.gamerImpact === 'high' && !applied(t.id, input))
      .filter(t => { const c = deps.conflicts?.[t.id]; return !(c && typeof c.warnIf === 'function' && c.warnIf(si)) })
      .map(t => t.id).sort().slice(0, 8)
  }

  function startupCount(input, deps) {
    const rec = (deps.startupRecommended || []).map(norm)
    const keep = ['realtek', 'nvidia', 'amd', 'intel', 'steam', 'discord', 'logitech ghub', 'corsair icue', 'razer synapse']
    return (input.startupItems || []).filter(i => {
      if (!i || i.Enabled === false) return false
      const n = norm(i.Name)
      if (keep.some(k => n.includes(k))) return false
      return i.Impact === 'High' || rec.some(r => n.includes(r))
    }).length
  }

  /** Candidate moves before ranking. base = importance on its own; blocking moves are always listed first. */
  function candidates(input, deps) {
    const si = input.sysInfo || {}, prof = input.profile || {}, out = []
    const add = m => out.push(Object.assign({ vars: {}, reversible: true, blocking: false }, m))

    if (input.health && input.health.checked && input.health.ok === false) {
      add({ id: 'repair', tab: 'fixes', base: 100, blocking: true, impact: 'high', risk: 1, minutes: 10, action: { type: 'tab', page: 'fixes', tab: 'fixes' } })
    }
    if (input.health && input.health.restorePoint === false) {
      add({ id: 'restore', tab: 'restore', base: 95, blocking: true, impact: 'high', risk: 1, minutes: 1, action: { type: 'tab', page: 'restore-points', tab: 'restore' } })
    }
    // Auto-Optimize: offered when it has never run here or the last run is over 30 days old (the caller says it is available)
    if (input.autoOptiReady && (!input.lastAutoOptiAt || Date.now() - input.lastAutoOptiAt > 30 * 86400000)) add({ id: 'autoOpti', tab: 'home', base: 90, impact: 'high', risk: 1, minutes: 3, action: { type: 'autoOpti', useCase: (prof && prof.useCase) || undefined } })
    const ess = essentialsIds(input, deps)
    if (ess.length) add({ id: 'essentials', tab: 'windows', base: 60, vars: { n: ess.length }, impact: 'high', risk: 1, minutes: 2, action: { type: 'batch', ids: ess } })

    const su = startupCount(input, deps)
    if (su > 0) add({ id: 'startup', tab: 'startup', base: 40, vars: { n: su }, impact: 'medium', risk: 1, minutes: 2, action: { type: 'tab', page: 'startup-manager', tab: 'startup' } })

    add({ id: 'cleanup', tab: 'cleanup', base: 30, impact: 'low', risk: 1, minutes: 3, action: { type: 'tab', page: 'cleanup', tab: 'cleanup' } })

    const games = prof.games && prof.games.length ? prof.games : (input.games || [])
    if (games.length && prof.useCase !== 'work') {
      if (input.isPremium) add({ id: 'game', tab: 'games', base: 50, vars: { n: games.length }, impact: 'high', risk: 1, minutes: 3, action: { type: 'tab', page: 'game-opti', tab: 'games' } })
      else add({ id: 'gamePulse', tab: 'pulse', base: 45, impact: 'medium', risk: 1, minutes: 2, action: { type: 'tab', page: 'pulse', tab: 'pulse' } })
    }
    if (si.isWifi) add({ id: 'network', tab: 'network', base: 35, impact: 'medium', risk: 2, minutes: 3, action: { type: 'tab', page: 'network', tab: 'network' } })

    if (games.some(g => /fivem|gta/.test(norm(typeof g === 'string' ? g : g.name || g.id)))) {
      add({ id: 'fivem', tab: 'fivem', base: 48, impact: 'high', risk: 2, minutes: 4, action: { type: 'tab', page: 'fivem', tab: 'fivem' } })
    }
    if (!si.isLaptop && input.isPremium) add({ id: 'power', tab: 'power', base: 25, impact: 'medium', risk: 2, minutes: 2, action: { type: 'tab', page: 'hardware', tab: 'power' } })
    if (norm(input.osType) === 'stock') add({ id: 'debloat', tab: 'debloat', base: 28, impact: 'medium', risk: 2, minutes: 5, action: { type: 'tab', page: 'debloater', tab: 'debloat' } })
    if (prof.comfort === 'expert' && prof.useCase === 'fps' && input.isPremium) add({ id: 'latency', tab: 'latency', base: 32, impact: 'high', risk: 2, minutes: 5, action: { type: 'tab', page: 'latency-monitor', tab: 'latency' } })
    return out
  }

  const weightKey = id => (id === 'game' || id === 'gamePulse') ? 'game-profile' : id

  function score(m, input, deps) {
    const prof = input.profile || {}, k = weightKey(m.id), comfort = COMFORT_MAX_RISK[prof.comfort] ? prof.comfort : 'balanced'
    let s = m.base + ((USE[prof.useCase] || {})[k] || 0)
    for (const p of (prof.priorities || []).slice(0, 2)) s += (PRIO[p] || {})[k] || 0
    if (m.id === 'essentials' && deps.tier && deps.tier.tier === 'low') s += 6        // low-end hardware gains most from the basics
    return s - RISK_PENALTY[comfort][m.risk]
  }

  /** Ranked first moves: blocking first, at most one per tab, at most MAX_MOVES, deterministic (score desc, then id). */
  function recommend(input, deps) {
    input = input || {}; deps = deps || {}
    const comfort = COMFORT_MAX_RISK[(input.profile || {}).comfort] ? input.profile.comfort : 'balanced'
    const ranked = candidates(input, deps)
      .filter(m => m.blocking || m.risk <= COMFORT_MAX_RISK[comfort])
      .map(m => Object.assign(m, { score: score(m, input, deps), titleKey: m.id + 'Title', whyKey: m.id + 'Why' }))
      .sort((a, b) => (b.blocking - a.blocking) || (b.score - a.score) || (a.id < b.id ? -1 : 1))
    const seen = new Set(), out = []
    for (const m of ranked) { if (seen.has(m.tab)) continue; seen.add(m.tab); out.push(m); if (out.length >= MAX_MOVES) break }
    return out
  }

  /** state = settings.concierge { moves:[ids], done:[ids], dismissed:[ids] } */
  function isDone(move, settings) {
    const c = (settings && settings.concierge) || {}
    if ((c.done || []).includes(move.id)) return true
    return move.action.type === 'batch' && move.action.ids.length > 0 && move.action.ids.every(id => settings && settings['tweak_' + id] === 'applied')
  }

  /** The not-yet-done, not-dismissed move to hint on a tab (shown once as a "Recommended for you" callout), or null. */
  function hintFor(tab, moves, settings) {
    const c = (settings && settings.concierge) || {}
    return (moves || []).find(m => m.tab === tab && !isDone(m, settings) && !(c.dismissed || []).includes(m.id)) || null
  }

  const api = { recommend, isDone, hintFor, MAX_MOVES }
  root.JylliConcierge = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
