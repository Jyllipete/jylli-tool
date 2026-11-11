'use strict'
// Pre-flight: an honest readiness checklist from one probe of the machine. Pure. Each item is ok / warn / bad / unknown
// (unknown = not measured, never a pass). A fix is offered only where Pulse already has an action for it:
//   { kind: 'boost' }  the Pulse boost sets the power plan   { kind: 'rule', target: 'gameshield' | 'updateguard' }  a launch rule
;(function (root) {
  const has = v => typeof v === 'number' && Number.isFinite(v)
  const rnd = v => (has(v) ? Math.round(v) : null)
  const item = (id, state, evidence, fix) => ({ id, state, evidence: evidence || {}, fix: fix || null })

  /** probe: { cpuTemp, ramPct, topProc: { name, cpu } | null, updateActive: bool|null, powerPlan: { name, high } | null, pendingReboot: bool|null } */
  function evaluate(p) {
    p = p || {}
    const out = []
    out.push(!has(p.cpuTemp) ? item('thermal', 'unknown') : item('thermal', p.cpuTemp >= 90 ? 'bad' : p.cpuTemp >= 75 ? 'warn' : 'ok', { cpuTemp: rnd(p.cpuTemp) }))
    out.push(!has(p.ramPct) ? item('ram', 'unknown') : item('ram', p.ramPct >= 85 ? 'bad' : p.ramPct >= 70 ? 'warn' : 'ok', { ram: rnd(p.ramPct) }, p.ramPct >= 70 ? { kind: 'rule', target: 'gameshield' } : null))
    const top = p.topProc && has(p.topProc.cpu) ? p.topProc : null
    out.push(!top ? item('background', 'unknown') : item('background', top.cpu >= 35 ? 'bad' : top.cpu >= 20 ? 'warn' : 'ok', { name: String(top.name || '').slice(0, 40), cpu: rnd(top.cpu) }, top.cpu >= 20 ? { kind: 'rule', target: 'gameshield' } : null))
    out.push(typeof p.updateActive !== 'boolean' ? item('updates', 'unknown') : item('updates', p.updateActive ? 'warn' : 'ok', {}, p.updateActive ? { kind: 'rule', target: 'updateguard' } : null))
    out.push(!p.powerPlan ? item('power', 'unknown') : item('power', p.powerPlan.high ? 'ok' : 'warn', { plan: String(p.powerPlan.name || '').slice(0, 40) }, p.powerPlan.high ? null : { kind: 'boost' }))
    out.push(typeof p.pendingReboot !== 'boolean' ? item('reboot', 'unknown') : item('reboot', p.pendingReboot ? 'warn' : 'ok'))
    const worst = out.some(i => i.state === 'bad') ? 'bad' : out.some(i => i.state === 'warn') ? 'warn' : out.every(i => i.state === 'unknown') ? 'unknown' : 'ok'
    return { items: out, state: worst }
  }

  const api = { evaluate }
  root.JylliPulsePreflight = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
