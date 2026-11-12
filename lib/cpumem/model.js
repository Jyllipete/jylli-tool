'use strict'
// Model: catalog + live readings + what Jylli remembers + tweak meta + applicability -> the rows, lanes and verdict the page draws.
// Pure. The ONE place that decides what "recommended" means here (same rule as lib/windows/model.js and lib/network/model.js).
// Status of a switch: on | native | partial | off | drifted | restart | unknown  (see lib/windows/model.js statusOf, shared).
const catalog = require('./catalog')
const { statusOf, SET, OPEN } = require('../windows/model')

/**
 * o: { live: detect.evaluate()|null, remembered: {id: 'applied'|'restored'|'default'}, meta: {id: {safetyTier, gamerImpact, retired, risk, fidelity}},
 *      applic: {id: {show, state, why}}, restart: [ids applied since the last boot], when, premium: bool }
 */
function buildModel(o = {}) {
  const live = o.live || null, remembered = o.remembered || {}, meta = o.meta || {}, applic = o.applic || {}
  const restart = new Set(o.restart || [])
  const premium = o.premium === true
  const items = []
  for (const it of catalog.ITEMS) {
    const m = meta[it.id] || {}, ap = applic[it.id] || null, rem = remembered[it.id] || 'default'
    const retired = !!m.retired || it.lane === 'retired'
    if (retired && rem !== 'applied') continue                                   // nothing to offer, nothing to restore
    if (!retired && ap && ap.show === false && rem !== 'applied') continue       // does not apply to this PC
    const lv = live && live[it.id] ? live[it.id] : null
    const rebootNeeded = !!(it.reboot || (m.risk && m.risk.reboot))
    const status = statusOf(rem, live ? lv : null, restart.has(it.id))
    const tier = retired ? 1 : (m.safetyTier || 1)
    const caution = ap && ap.state === 'caution' ? (ap.why || 'caution') : null
    const locked = !!it.premium && !premium && rem !== 'applied'
    const wanted = !retired && (it.rec || (ap && ap.state === 'recommended'))
    const open = status === 'off' || (status === 'unknown' && rem !== 'applied')
    const rec = !!live && !!wanted && open && !caution && tier < 3 && !rebootNeeded && !locked   // nothing is recommended from a state that was not read
    items.push({
      id: it.id, lane: retired ? 'retired' : it.lane, icon: it.icon, status, remembered: rem, retired, retiredWhy: retired ? (m.retired || '') : '',
      tier, reboot: rebootNeeded, impact: m.gamerImpact || null, caution, applicRec: !!(ap && ap.state === 'recommended'), premium: !!it.premium, locked,
      rec, warn: it.warn || [], hasProbe: !!(it.probe && it.probe.length), values: lv ? lv.values : [], fidelity: m.fidelity || null, revert: m.risk ? m.risk.revert : null,
    })
  }
  const lanes = catalog.lanes().map(l => {
    const list = items.filter(i => i.lane === l.id)
    return { id: l.id, premium: !!l.premium, ids: list.map(i => i.id), on: list.filter(i => SET.has(i.status)).length, total: list.length }
  }).filter(l => l.total > 0)
  const rank = i => (i.rec ? 0 : OPEN.has(i.status) ? 1 : i.status === 'partial' ? 2 : 3)
  for (const l of lanes) l.ids.sort((a, b) => rank(items.find(i => i.id === a)) - rank(items.find(i => i.id === b)) || order(a) - order(b))

  const real = items.filter(i => !i.retired)
  const drifted = items.filter(i => i.status === 'drifted').map(i => i.id)
  const pendingRestart = items.filter(i => i.status === 'restart').map(i => i.id)
  const recommendedIds = items.filter(i => i.rec).map(i => i.id)
  const verdict = {
    kind: !live ? 'unread' : drifted.length ? 'attention' : recommendedIds.length ? 'open' : 'clean',
    set: real.filter(i => SET.has(i.status)).length, total: real.length, jylli: real.filter(i => i.status === 'on').length, native: real.filter(i => i.status === 'native').length,
    drifted: drifted.length, rec: recommendedIds.length, restart: pendingRestart.length, unknown: real.filter(i => i.status === 'unknown').length, locked: real.filter(i => i.locked).length,
  }
  return { when: o.when || null, live: !!live, premium, items, lanes, recommendedIds, drifted, pendingRestart, verdict }
}

function order(id) { return catalog.ITEMS.findIndex(i => i.id === id) }

module.exports = { buildModel, statusOf, SET, OPEN }
