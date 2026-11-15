'use strict'
// Gaming automation model: raw service state -> what each feature is doing and what will happen. Pure, loaded by the page too.
// phase: off | locked | needsWatcher | paused | armed | starting | active | skipped | failed | restored | degraded | unavailable | manual | snoozed
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory()
  else root.JylliGameAutoModel = factory()
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const FEATURES = ['watcher', 'updateGuard', 'shield', 'autoPulse']
  const TONE = { off: 'idle', locked: 'idle', needsWatcher: 'warn', paused: 'warn', armed: 'ok', starting: 'info', active: 'ok', skipped: 'warn', failed: 'bad', restored: 'ok', degraded: 'warn', unavailable: 'warn', manual: 'info', snoozed: 'warn' }
  const LIMITS = { tier3: { min: 50, max: 90 }, mid: { min: 55, max: 95 }, gap: 5 }

  /** Keeps Tier 3 in 50-90 and mid-session at least 5 points above it (and at most 95). which = the slider the user moved. */
  function clampPair(tier3, mid, which) {
    const n = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d)
    let t3 = Math.min(LIMITS.tier3.max, Math.max(LIMITS.tier3.min, Math.round(n(tier3, 70))))
    let m = Math.round(n(mid, 80))
    m = Math.min(LIMITS.mid.max, Math.max(t3 + LIMITS.gap, m))
    return { tier3: t3, mid: m, moved: which === 'tier3' ? 'mid' : which === 'mid' ? 'tier3' : null }
  }

  function phaseOf(name, raw) {
    const st = raw.settings || {}, w = raw.watcher || {}, f = (raw.features || {})[name] || {}
    if (name === 'watcher') {
      if (!st.watcher) return 'off'
      if (w.paused) return 'paused'
      if (w.degraded) return 'degraded'
      return raw.session ? 'active' : 'armed'
    }
    if (!raw.premium) return 'locked'
    if (!st[name]) return 'off'
    if (!w.running) return 'needsWatcher'
    if (f.restoreFailed && (!Array.isArray(f.restoreFailed) || f.restoreFailed.length)) return 'failed'
    if (w.paused) return 'paused'
    if (raw.session) {
      const s = f.status || 'starting'
      if (s === 'holding' || s === 'active') return 'active'
      if (s === 'off-for-game') return 'skipped'
      return TONE[s] ? s : 'starting'
    }
    return f.lastEnd === 'restored' ? 'restored' : 'armed'
  }

  const view = (name, raw) => { const phase = phaseOf(name, raw); return { phase, tone: TONE[phase] || 'idle' } }

  /** { n, total }: features switched on out of the ones this account can use. */
  function armed(raw) {
    const list = raw.premium ? FEATURES : ['watcher']
    return { n: list.filter(k => (raw.settings || {})[k]).length, total: list.length }
  }

  /** What happens at start / while playing / at exit, only for what is on. Each item { feature, key, vars }. */
  function plan(raw) {
    const st = raw.settings || {}, L = raw.lists || {}, g = raw.session && raw.session.game
    const on = k => raw.premium && st[k]
    const out = { start: [], playing: [], exit: [] }
    const ap = autoPulseFor(raw)
    if (on('updateGuard')) { out.start.push({ feature: 'updateGuard', key: 'planUgStart' }); out.exit.push({ feature: 'updateGuard', key: 'planUgExit' }) }
    if (on('shield')) {
      out.start.push({ feature: 'shield', key: 'planGsStart', vars: { list: (L.tier1 || []).join(', '), t3: st.tier3, tier3: (L.tier3 || []).join(', ') } })
      out.playing.push({ feature: 'shield', key: 'planGsMid', vars: { mid: st.mid, list: [...(L.tier3 || []), ...(L.browsers || [])].join(', ') } })
      out.exit.push({ feature: 'shield', key: 'planGsExit' })
    }
    if (on('autoPulse')) {
      out.start.push({ feature: 'autoPulse', key: ap.can ? 'planApStart' : 'planApNone', vars: { game: ap.name || '' } })
      if (ap.can) out.exit.push({ feature: 'autoPulse', key: 'planApExit' })
    }
    out.exit.push({ feature: 'watcher', key: 'planSummary' })
    if (g) out.game = g
    return out
  }

  /** Will Auto-Pulse act for this game? { can, reason: no-preset | off-for-game | null, name } */
  function autoPulseFor(raw) {
    const g = (raw.session && raw.session.game) || null
    if (!g) return { can: true, reason: null, name: '' }
    if (!g.pulse) return { can: false, reason: 'no-preset', name: g.name }
    if (((raw.settings || {}).pulseOff || []).includes(g.pulse)) return { can: false, reason: 'off-for-game', name: g.name }
    return { can: true, reason: null, name: g.name }
  }

  return { FEATURES, TONE, LIMITS, clampPair, phaseOf, view, armed, plan, autoPulseFor }
})
