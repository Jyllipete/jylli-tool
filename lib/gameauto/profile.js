'use strict'
// Per-game tweak profile: which of the saved tweaks a game session may apply, and what the ledger says about it. Pure.
// The tweaks stay applied after the game closes (they are put back from History), so the rules are stricter than "apply everything":
//   - a tweak that is already applied is not applied again (before, every session re-ran every tweak and added a journal entry each time),
//   - a tier 3 tweak, or one the user excluded from automatic runs, is refused: the same rule the journal's automatic pipeline uses
//     (lib/journal-service.js PLAN_VIAS), which the old profile loop skipped,
//   - an unknown tweak id (removed from the app since the profile was saved) is reported, not silently dropped.

const MAX_TIER = 2   // tier 3 never runs automatically

/**
 * profile: { tweaks: { tweak_<id>: 'applied' | ... } }; ctx: { settings, hasTweak(id), isPlanExcluded(id), tierOf(id) }
 * -> { apply: id[], already: id[], refused: { id, reason: 'tier'|'excluded' }[], unknown: id[] } (ids in profile order)
 */
function plan(profile, ctx) {
  const out = { apply: [], already: [], refused: [], unknown: [] }
  const settings = (ctx && ctx.settings) || {}
  for (const [k, v] of Object.entries((profile && profile.tweaks) || {})) {
    if (v !== 'applied') continue
    const id = String(k).replace(/^tweak_/, '')
    if (!ctx.hasTweak(id)) { out.unknown.push(id); continue }
    if (ctx.isPlanExcluded(id)) { out.refused.push({ id, reason: 'excluded' }); continue }
    if (Number(ctx.tierOf(id)) > MAX_TIER) { out.refused.push({ id, reason: 'tier' }); continue }
    if (settings['tweak_' + id] === 'applied') { out.already.push(id); continue }
    out.apply.push(id)
  }
  return out
}

/**
 * Ledger events for one profile run. `failed` = [{ id, error }] from the tweaks that did not apply.
 * One summary event (the tweaks stay until undone in History: no `key`, so it never counts as "waiting to be put back"),
 * plus one event for each problem so the panel can say which tweak and why.
 */
function events(name, p, failed = []) {
  const failedIds = new Set(failed.map(f => f.id))
  const done = p.apply.filter(id => !failedIds.has(id))
  const ev = []
  if (done.length || p.already.length) ev.push({ feature: 'profile', kind: 'applied', detail: 'kept-counts', vars: { name, n: done.length, already: p.already.length } })
  for (const f of failed) ev.push({ feature: 'profile', kind: 'failed', detail: 'tweak-failed', vars: { name, id: f.id, error: String(f.error || '').slice(0, 120) } })
  for (const r of p.refused) ev.push({ feature: 'profile', kind: 'skipped', detail: 'refused-' + r.reason, vars: { name, id: r.id } })
  for (const id of p.unknown) ev.push({ feature: 'profile', kind: 'skipped', detail: 'unknown-tweak', vars: { name, id } })
  return ev
}

module.exports = { plan, events, MAX_TIER }
