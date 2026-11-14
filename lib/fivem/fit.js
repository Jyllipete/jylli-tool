'use strict'
// Fit Check: "will joining this server go smoothly on this PC?", from facts that were read or measured just now. Like
// readiness.js there is no score: an item is there or it is not. Wording lives in LANG ft_<id> / fw_<id>. Pure, no require.
// What the server publishes (build, pure level, resource list) is community-documented and optional; a missing value is
// "not reported" and never counts for or against. The thresholds below are named heuristics, not FiveM rules.
;(function (root) {
  const MANY_RESOURCES = 300     // heuristic: a long resource list usually means a longer first join
  const LOSS_PCT = 2
  const JITTER_MS = 15
  const FAR_MS = 150
  const SOFT_MODS = ['reshade', 'enb', 'naturalvision', 'visualv']   // graphics hooks: only these are named for pure mode

  /**
   * facts: { installed, enhanced, builds: [numbers of the GTA processes on disk], server: { reachable, hidden, build, pure, resources } | null,
   *          mods: [{ id, sev }], tcp: { n, got, lossPct, avg, jitter } | null }
   * -> { items: [{ id, sev, vars }], ok: bool }   sev: bad | warn | info
   */
  function evaluate(facts) {
    const f = facts || {}
    const items = []
    const add = (id, sev, vars) => items.push({ id, sev, vars: vars || {} })
    const sv = f.server || null

    if (!f.installed) add('not-installed', 'bad')
    if (f.enhanced) add('enhanced', 'info')
    if (!sv || sv.reachable === false) add('unreachable', 'bad')
    else if (sv.hidden) add('hidden', 'info')

    if (sv && sv.reachable !== false) {
      const build = Number(sv.build)
      if (Number.isInteger(build) && build > 0 && Array.isArray(f.builds) && f.builds.length && !f.builds.includes(build)) add('build', 'info', { build })
      const pure = Number(sv.pure)
      if (Number.isInteger(pure) && pure >= 1) {
        const soft = (f.mods || []).filter(m => SOFT_MODS.includes(m.id)).length
        if (soft) add('pure-mods', 'warn', { level: pure, n: soft })
      }
      if (Number.isInteger(sv.resources) && sv.resources >= MANY_RESOURCES) add('resources', 'info', { n: sv.resources })
    }
    const t = f.tcp
    if (t && t.n >= 3) {
      if (t.got === 0) add('no-connect', 'bad')
      else {
        if (t.lossPct != null && t.lossPct >= LOSS_PCT) add('loss', 'bad', { loss: t.lossPct })
        if (t.jitter != null && t.jitter >= JITTER_MS) add('jitter', 'warn', { jitter: t.jitter })
        if (t.avg != null && t.avg >= FAR_MS) add('far', 'warn', { avg: t.avg })
      }
    }
    const high = (f.mods || []).filter(m => m.sev === 'high').length
    if (high) add('mods-high', 'warn', { n: high })

    const rank = { bad: 0, warn: 1, info: 2 }
    items.sort((a, b) => rank[a.sev] - rank[b.sev])
    return { items, ok: !items.some(i => i.sev !== 'info') }
  }

  /** Samples of one TCP connect each (ms or null) -> { n, got, lossPct, avg, jitter }. */
  function tcpStats(samples) {
    const s = Array.isArray(samples) ? samples : []
    const ok = s.filter(v => typeof v === 'number')
    const r1 = v => Math.round(v * 10) / 10
    let j = 0
    for (let i = 1; i < ok.length; i++) j += Math.abs(ok[i] - ok[i - 1])
    return { n: s.length, got: ok.length, lossPct: s.length ? r1(((s.length - ok.length) / s.length) * 100) : null, avg: ok.length ? r1(ok.reduce((a, b) => a + b, 0) / ok.length) : null, jitter: ok.length > 1 ? r1(j / (ok.length - 1)) : ok.length ? 0 : null }
  }

  const api = { MANY_RESOURCES, LOSS_PCT, JITTER_MS, FAR_MS, SOFT_MODS, evaluate, tcpStats }
  root.JylliFivemFit = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
