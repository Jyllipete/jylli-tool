'use strict'
// Competitive Mode planner: from the user's options, facts about this PC and the tier, decide which session steps run.
// Pure, UMD. This is the only list of what Competitive Mode may change (docs/COMPETE_EVIDENCE.md). Every step is
//   apply    runs at Start, is undone when the game closes
//   skipped  does not fit this PC (carries a reason)
//   locked   Premium step on a free account (carries nothing to run)
// Left out on purpose: GPU priority, I/O priority, closing steamwebhelper, "latency reduction" (no documented effect).
;(function (root) {
  const HIGH_PERF = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'
  const BALANCED = '381b4222-f694-41f0-9685-ff5bb260df2e'
  const PRIORITIES = ['normal', 'above', 'high']          // never Realtime
  const LEVEL = { normal: 'Normal', above: 'AboveNormal', high: 'High' }
  const CORE_KINDS = ['all', 'pcores', 'vcache', 'skip0', 'custom']
  const MIN_CUSTOM = 4                                     // same floor as lib/cpumem/affinity.js MIN_LOGICAL
  // Order is the order steps run in (reverse on undo).
  const STEPS = [
    { id: 'priority', premium: false },
    { id: 'eco', premium: false },
    { id: 'power', premium: false },
    { id: 'standby', premium: false },
    { id: 'cores', premium: true },
    { id: 'shield', premium: true },
    { id: 'services', premium: true },
    { id: 'tray', premium: false },
  ]
  const DEFAULTS = { priority: 'above', eco: true, power: true, standby: false, cores: 'all', customCpus: [], shield: false, services: false, tray: false }

  function normalize(o) {
    o = o || {}
    const out = Object.assign({}, DEFAULTS)
    if (PRIORITIES.includes(o.priority)) out.priority = o.priority
    for (const k of ['eco', 'power', 'standby', 'shield', 'services', 'tray']) if (typeof o[k] === 'boolean') out[k] = o[k]
    if (CORE_KINDS.includes(o.cores)) out.cores = o.cores
    if (Array.isArray(o.customCpus)) out.customCpus = [...new Set(o.customCpus.filter(n => Number.isInteger(n) && n >= 0 && n < 64))].sort((a, b) => a - b)
    return out
  }

  /**
   * f: { form, dualCcdX3d, activePlan:{guid,name}|null, highPerfAvailable, coreKinds:[kinds valid on this PC], logical, gameCls }
   * -> { opts, steps:[{ id, state, reason?, ...detail }], applied:n }
   */
  function plan(req) {
    const { opts, facts, premium } = req || {}
    const o = normalize(opts), f = facts || {}
    const steps = []
    const guid = f.activePlan && f.activePlan.guid ? String(f.activePlan.guid).toLowerCase() : null
    for (const s of STEPS) {
      const want = s.id === 'priority' ? o.priority !== 'normal' : s.id === 'cores' ? o.cores !== 'all' : !!o[s.id]
      if (!want) continue
      if (s.premium && !premium) { steps.push({ id: s.id, state: 'locked' }); continue }
      const skip = reason => steps.push({ id: s.id, state: 'skipped', reason })
      if (s.id === 'priority') {
        if (f.gameCls && f.gameCls !== 'Normal' && f.gameCls !== 'BelowNormal') skip('already-set')
        else steps.push({ id: 'priority', state: 'apply', level: LEVEL[o.priority] })
      } else if (s.id === 'power') {
        if (f.form === 'laptop') skip('laptop')
        else if (f.dualCcdX3d === true) skip('x3d')
        else if (!guid) skip('unknown')
        else if (guid === HIGH_PERF) skip('already-high')
        else if (guid !== BALANCED) skip('not-balanced')
        else if (f.highPerfAvailable !== true) skip('no-high')
        else steps.push({ id: 'power', state: 'apply', from: guid, to: HIGH_PERF })
      } else if (s.id === 'cores') {
        if (o.cores === 'custom') {
          if (o.customCpus.length < MIN_CUSTOM) skip('custom-too-few')
          else if (f.logical && o.customCpus.some(n => n >= f.logical)) skip('custom-invalid')
          else if (f.logical && o.customCpus.length >= f.logical) skip('custom-all')
          else steps.push({ id: 'cores', state: 'apply', kind: 'custom', cpus: o.customCpus })
        } else if (!Array.isArray(f.coreKinds) || !f.coreKinds.includes(o.cores)) skip('not-on-this-pc')
        else steps.push({ id: 'cores', state: 'apply', kind: o.cores })
      } else steps.push({ id: s.id, state: 'apply' })
    }
    return { opts: o, steps, applied: steps.filter(x => x.state === 'apply' && x.id !== 'tray').length }
  }

  const api = { plan, normalize, STEPS, DEFAULTS, PRIORITIES, LEVEL, CORE_KINDS, MIN_CUSTOM, HIGH_PERF, BALANCED }
  root.JylliCompetePlan = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
