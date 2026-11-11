'use strict'
// Guard: notices what Windows brought back. Pure.
//   desired  { id: removedAt } - everything a debloat run switched off and the user did not undo (kept by index.js)
//   drift    desired items the fresh scan finds switched ON again (a feature update re-provisioned an app, reset a service, ...)
//   osChanged  the Windows build or update revision differs from the last check, i.e. an update was installed
const WEEK = 7 * 24 * 3600 * 1000

/** drift(desired, model) -> [{ id, since }] oldest removal first. Items that are not in the catalog or not on this PC are not drift. */
function drift(desired, model) {
  if (!model) return []
  const state = new Map(model.items.map(i => [i.id, i.state]))
  return Object.entries(desired || {}).filter(([id]) => state.get(id) === 'on').map(([id, since]) => ({ id, since: +since || 0 })).sort((a, b) => a.since - b.since)
}

const osChanged = (prev, facts) => !!(facts && facts.build && (!prev || prev.build !== facts.build || prev.ubr !== facts.ubr))

/** Background rule: should the main process scan now? mode 'off' never. `last` = { build, ubr, at } */
function due(rule, last, facts, now = Date.now()) {
  if (!rule || rule.mode === 'off') return false
  if (!last || !last.at) return true
  return osChanged(last, facts) || now - last.at > WEEK
}

module.exports = { WEEK, drift, osChanged, due }
