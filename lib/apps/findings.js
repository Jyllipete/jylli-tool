'use strict'
// Apps tab "Backstage": the ONLY list of what the tab may say about this PC. Pure and UMD. Every threshold is named here.
// A finding is a fact with a number behind it (never "this may cause stutter"). Copy: LANG group `apps2`, fT_<kind> / fS_<kind>.
//   kind: heavy-vram | heavy-ram | busy-cpu | drift | legacy | startup-many | gametime-idle | unread
;(function (root) {
  const THRESH = {
    vramApp: 250,         // MB of dedicated video memory one app holds
    ramApp: 1000,         // MB of private memory one app holds
    cpuApp: 3,            // % of the whole CPU one app uses while no game runs
    startupMany: 6,       // programs from this list that start with Windows
    busyRam: 3000, busyCpu: 5, busyVram: 500,   // the stage says "busy" above any of these in total
  }
  const QUIET_ROLES = new Set(['capture', 'gpu-tool'])      // a streaming / driver tool using the CPU is its job

  /**
   * o: { apps: [model apps], totals, legacy: [{id,app}], game: {id,name}|null, gametime: {enabled, stepping: n}, read: bool, measured: bool }
   * -> [{ id, kind, tone: 'info'|'warn', apps: [ids], vars, act? }]  most important first
   */
  function compute(o) {
    const out = [], apps = (o && o.apps) || [], T = THRESH
    if (o && o.measured === false) return o.read === false ? [{ id: 'unread', kind: 'unread', tone: 'warn', apps: [], vars: {} }] : []
    const costed = apps.filter(a => a.cost)
    if (o && o.legacy && o.legacy.length) out.push({ id: 'legacy', kind: 'legacy', tone: 'warn', apps: [...new Set(o.legacy.map(l => l.app))], vars: { n: o.legacy.length }, act: 'migrate' })
    for (const a of apps.filter(x => x.drift)) out.push({ id: 'drift:' + a.id, kind: 'drift', tone: 'warn', apps: [a.id], vars: {}, act: 'open' })
    if (!(o && o.game)) {
      for (const a of costed.filter(x => x.cost.vram != null && x.cost.vram >= T.vramApp).sort((x, y) => y.cost.vram - x.cost.vram).slice(0, 2)) out.push({ id: 'heavy-vram:' + a.id, kind: 'heavy-vram', tone: 'info', apps: [a.id], vars: { mb: a.cost.vram }, act: 'open' })
      for (const a of costed.filter(x => x.cost.ram >= T.ramApp).sort((x, y) => y.cost.ram - x.cost.ram).slice(0, 2)) out.push({ id: 'heavy-ram:' + a.id, kind: 'heavy-ram', tone: 'info', apps: [a.id], vars: { mb: a.cost.ram }, act: 'open' })
      for (const a of costed.filter(x => x.cost.cpu >= T.cpuApp && !QUIET_ROLES.has(x.role)).sort((x, y) => y.cost.cpu - x.cost.cpu).slice(0, 2)) out.push({ id: 'busy-cpu:' + a.id, kind: 'busy-cpu', tone: 'info', apps: [a.id], vars: { pct: a.cost.cpu }, act: 'open' })
    }
    const starters = apps.filter(a => a.startup && a.startup.on)
    if (starters.length >= T.startupMany) out.push({ id: 'startup-many', kind: 'startup-many', tone: 'info', apps: starters.map(a => a.id), vars: { n: starters.length }, act: 'startup' })
    if (o && o.gametime && !o.gametime.enabled && o.gametime.stepping > 0) out.push({ id: 'gametime-idle', kind: 'gametime-idle', tone: 'info', apps: [], vars: { n: o.gametime.stepping }, act: 'gametime' })
    return out
  }

  /** The stage's one sentence: kind game | attention | busy | quiet | unknown. */
  function verdict(o) {
    if (!o || o.measured === false) return { kind: 'unknown', vars: {} }
    const t = o.totals || { cpu: 0, ram: 0, vram: 0, apps: 0 }
    if (o.count === 0) return { kind: 'empty', vars: {} }
    if (o.game) return { kind: 'game', vars: { name: o.game.name || '', n: o.stepped || 0 } }
    if ((o.findings || []).some(f => f.tone === 'warn')) return { kind: 'attention', vars: { n: o.findings.filter(f => f.tone === 'warn').length } }
    if (t.ram >= THRESH.busyRam || t.cpu >= THRESH.busyCpu || (t.vram != null && t.vram >= THRESH.busyVram)) return { kind: 'busy', vars: {} }
    return { kind: 'quiet', vars: {} }
  }

  const KINDS = ['heavy-vram', 'heavy-ram', 'busy-cpu', 'drift', 'legacy', 'startup-many', 'gametime-idle', 'unread']
  const VERDICTS = ['game', 'attention', 'busy', 'quiet', 'unknown', 'empty']
  const api = { THRESH, KINDS, VERDICTS, compute, verdict }
  root.JylliAppsFindings = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
