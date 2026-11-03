'use strict'
// findings + the user's choices -> an ordered list of steps. Pure. The renderer sends finding ids only; steps are built here from the
// catalog and the cached profile, then filtered through the allowlist, so a tampered request cannot run anything outside the catalog.
const { MODULES, NEVER_AUTO, allowedTweaks, allowedControls } = require('./catalog')

const RESTORE_POINT_SEC = 25
// Plan-switching steps go first inside their module so later powercfg tweaks land on the right scheme.
const FIRST = ['power-saver', 'power-laptop-ac', 'power-desktop', 'x3d-setup']

/**
 * ctx: { include: [findingId], exclude: [findingId], itemExclude: { 'startup-apps': [name] }, startupItems: [name], premium, modules: { id: false } }
 * Returns { steps, modules, estSeconds, rebootRequired, skipped, selected }.
 */
function plan(list, ctx = {}) {
  const include = new Set(ctx.include || [])
  const exclude = new Set(ctx.exclude || [])
  const offModules = ctx.modules || {}
  const okTweaks = allowedTweaks(), okControls = allowedControls()
  const skipped = []
  const selected = []
  const steps = []
  const seen = new Set()

  for (const f of list) {
    if (f.kind !== 'fix') continue
    const want = include.has(f.id) || (f.defaultOn && !exclude.has(f.id))
    if (exclude.has(f.id) || !want) continue
    if (offModules[f.module] === false) { skipped.push({ findingId: f.id, reason: 'module-off' }); continue }
    if (f.premium && !ctx.premium) { skipped.push({ findingId: f.id, reason: 'premium' }); continue }
    let added = 0
    for (const s of f.steps) {
      const key = `${s.type}:${s.id}`
      if (seen.has(key)) continue
      if (s.type === 'tweak' && (!okTweaks.has(s.id) || NEVER_AUTO.has(s.id))) { skipped.push({ findingId: f.id, reason: 'not-allowed', id: s.id }); continue }
      if (s.type === 'control' && !okControls.has(s.id)) { skipped.push({ findingId: f.id, reason: 'not-allowed', id: s.id }); continue }
      let params
      if (s.id === 'display-refresh') params = { targets: ((f.detail && f.detail.targets) || []).map(t => ({ device: t.device, w: t.w, h: t.h, hz: t.hz, from: t.from })) }
      if (s.id === 'startup-cleanup') {
        const items = (f.detail && f.detail.items) || []
        const skip = new Set((ctx.itemExclude && ctx.itemExclude['startup-apps']) || [])
        const names = Array.isArray(ctx.startupItems) ? items.filter(i => ctx.startupItems.includes(i.name)) : items.filter(i => i.defaultOn)
        params = { items: names.map(i => i.name).filter(n => !skip.has(n)) }
        if (!params.items.length) { skipped.push({ findingId: f.id, reason: 'empty' }); continue }
      }
      seen.add(key)
      steps.push({ stepId: `${f.id}:${s.id}`, findingId: f.id, module: f.module, type: s.type, tweakId: s.type === 'tweak' ? s.id : undefined, control: s.type === 'control' ? s.id : undefined,
        params, estMs: Math.round((f.estMs || 1000) / Math.max(1, f.steps.length)), reboot: f.reboot, interactive: f.interactive || undefined, undoable: f.undoable })
      added++
    }
    if (added) selected.push(f.id)
  }

  const rank = s => MODULES.indexOf(s.module) * 100 + (FIRST.includes(s.findingId) ? 0 : 50)
  steps.sort((a, b) => rank(a) - rank(b))

  const mods = MODULES.map(id => ({ id, steps: steps.filter(s => s.module === id).length })).filter(m => m.steps > 0)
  const estSeconds = steps.length ? Math.round(steps.reduce((a, s) => a + s.estMs, 0) / 1000) + RESTORE_POINT_SEC : 0
  return { steps, modules: mods, estSeconds, rebootRequired: steps.some(s => s.reboot), skipped, selected }
}

module.exports = { plan, RESTORE_POINT_SEC }
