'use strict'
// Pre-flight findings for the Uplink view, derived only from facts that were read or measured. No score: a finding is there
// or it is not. Each rule is { id, test(f) -> null | { sev, vars } }; wording lives in LANG t_<id> / w_<id> (and a_<id> for the
// button). sev: bad | warn | info. Pure, no require.
;(function (root) {
  const RULES = [
    { id: 'not-installed', test: f => (!f.installed ? { sev: 'info', vars: {} } : null) },
    { id: 'gta-missing', test: f => (f.installed && !f.gtaOk ? { sev: 'bad', vars: { path: f.gtaPath || '' } } : null), action: 'open-client' },
    { id: 'game-running', test: f => (f.running ? { sev: 'info', vars: {} } : null) },
    { id: 'channel-canary', test: f => (f.channel === 'canary' ? { sev: 'warn', vars: {} } : null), action: 'open-client' },
    { id: 'memory-dump', test: f => (f.fullDump ? { sev: 'warn', vars: {} } : null), action: 'open-client' },
    { id: 'texture-vram', test: f => {
      if (f.textureQuality == null || f.textureLimit == null) return null
      const q = Number(f.textureQuality)
      return Number.isFinite(q) && q > f.textureLimit ? { sev: 'warn', vars: { q, limit: f.textureLimit, vram: Math.round(f.vramMB / 1024 * 10) / 10 } } : null
    }, action: 'open-graphics' },
    { id: 'graphics-missing', test: f => (f.installed && !f.settingsExists ? { sev: 'info', vars: {} } : null) },
    { id: 'mods-high', test: f => { const n = (f.mods || []).filter(m => m.sev === 'high').length; return n ? { sev: 'warn', vars: { n } } : null }, action: 'open-crash' },
    { id: 'cache-large', test: f => (f.cacheMB != null && f.cacheMB >= 3000 ? { sev: 'info', vars: { gb: Math.round(f.cacheMB / 102.4) / 10 } } : null), action: 'open-client' },
    { id: 'route', test: f => {
      const v = f.route && f.route.id
      if (!v || v === 'measuring' || v === 'clean') return null
      const bad = /^(loss|unreachable|no-replies)/.test(v)
      return { sev: bad ? 'bad' : 'warn', vars: { verdict: v } }
    }, action: 'open-uplink' },
  ]
  const IDS = RULES.map(r => r.id)

  /** facts -> { findings: [{ id, sev, vars, action }], passed: [id] } sorted bad, warn, info. */
  function evaluate(facts) {
    const f = facts || {}
    const findings = [], passed = []
    for (const r of RULES) {
      let res = null
      try { res = r.test(f) } catch { res = null }
      if (res) findings.push({ id: r.id, sev: res.sev, vars: res.vars || {}, action: r.action || null })
      else passed.push(r.id)
    }
    const rank = { bad: 0, warn: 1, info: 2 }
    findings.sort((a, b) => rank[a.sev] - rank[b.sev])
    return { findings, passed }
  }

  const api = { RULES, IDS, evaluate }
  root.JylliFivemReadiness = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
