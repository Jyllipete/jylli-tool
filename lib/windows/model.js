'use strict'
// Model: catalog + live readings + what Jylli remembers + tweak meta + applicability -> the rows, lanes and verdict the page draws.
// Pure. Also the ONE place that decides what "recommended" means (stage, chips, CTA and row badge all read `rec` / `recommendedIds`).
//
// Status of a switch (exactly one):
//   on       Windows has it set, and Jylli set it          native   Windows has it set, Jylli never touched it
//   partial  only some of its values are set                off      Windows default
//   drifted  Jylli applied it, Windows reads the default again ("put back")
//   restart  Jylli applied it, waits for a restart before it can be read
//   unknown  cannot be read honestly (no probe, or the read failed): shows what Jylli remembers
const catalog = require('./catalog')

const SET = new Set(['on', 'native'])
const OPEN = new Set(['off', 'drifted'])

function statusOf(remembered, live, restart) {
  const applied = remembered === 'applied'
  if (!live || live.state === 'unread') return 'unknown'
  if (live.state === 'na') return applied ? 'unknown' : 'off'
  if (live.state === 'all') return applied ? 'on' : 'native'
  if (live.state === 'some') return 'partial'
  // none
  if (applied) return restart ? 'restart' : 'drifted'
  return 'off'
}

/**
 * o: { scope: 'windows'|'qol', live: detect.evaluate() | null, remembered: {id: 'applied'|'restored'|'default'},
 *      meta: {id: {safetyTier, gamerImpact, retired, risk:{reboot}}}, applic: {id: {show, state, why}},
 *      restart: [ids applied since the last boot], when: ms of the live read }
 */
function buildModel(o = {}) {
  const scope = o.scope === 'qol' ? 'qol' : 'windows'
  const live = o.live || null, remembered = o.remembered || {}, meta = o.meta || {}, applic = o.applic || {}
  const restart = new Set(o.restart || [])
  const items = []
  for (const it of catalog.ITEMS) {
    if (catalog.scopeOf(it.id) !== scope) continue
    const m = meta[it.id] || {}, ap = applic[it.id] || null, rem = remembered[it.id] || 'default'
    const retired = !!m.retired || it.lane === 'retired'
    if (retired && rem !== 'applied') continue                      // nothing to offer, nothing to restore
    if (!retired && ap && ap.show === false && rem !== 'applied') continue   // does not apply to this PC
    const lv = live && live[it.id] ? live[it.id] : null
    const rebootNeeded = !!(it.reboot || (m.risk && m.risk.reboot))
    const status = statusOf(rem, live ? lv : null, restart.has(it.id))
    const tier = retired ? 1 : (m.safetyTier || 1)
    const caution = ap && ap.state === 'caution' ? (ap.why || 'caution') : null
    const wanted = !retired && (it.rec || (ap && ap.state === 'recommended'))
    const open = status === 'off' || (status === 'unknown' && rem !== 'applied')
    const rec = !!wanted && open && !caution && tier < 3 && !rebootNeeded
    items.push({
      id: it.id, lane: retired ? 'retired' : it.lane, icon: it.icon, status, remembered: rem, retired, retiredWhy: retired ? (m.retired || '') : '',
      tier, reboot: rebootNeeded, impact: m.gamerImpact || null, caution, applicRec: !!(ap && ap.state === 'recommended'),
      rec, warn: it.warn || [], hasProbe: !!(it.probe && it.probe.length), values: lv ? lv.values : [],
      fidelity: m.fidelity || null, revert: m.risk ? m.risk.revert : null,
    })
  }
  const laneIds = catalog.lanes(scope).map(l => l.id)
  const lanes = laneIds.map(id => {
    const list = items.filter(i => i.lane === id)
    const on = list.filter(i => SET.has(i.status)).length
    return { id, ids: list.map(i => i.id), on, total: list.length }
  }).filter(l => l.total > 0)
  // Order inside the page: lanes as listed; inside a lane recommended-and-open first, then open, then the rest.
  const rank = i => (i.rec ? 0 : OPEN.has(i.status) ? 1 : i.status === 'partial' ? 2 : 3)
  for (const l of lanes) l.ids.sort((a, b) => rank(byId(items, a)) - rank(byId(items, b)) || laneIndex(a) - laneIndex(b))

  const real = items.filter(i => !i.retired)
  const set = real.filter(i => SET.has(i.status)).length
  const drifted = items.filter(i => i.status === 'drifted').map(i => i.id)
  const pendingRestart = items.filter(i => i.status === 'restart').map(i => i.id)
  const recommendedIds = items.filter(i => i.rec).map(i => i.id)
  const unknown = real.filter(i => i.status === 'unknown').length
  const verdict = {
    kind: !live ? 'unread' : drifted.length ? 'attention' : recommendedIds.length ? 'open' : 'clean',
    set, total: real.length, jylli: real.filter(i => i.status === 'on').length, native: real.filter(i => i.status === 'native').length,
    drifted: drifted.length, rec: recommendedIds.length, restart: pendingRestart.length, unknown,
  }
  return { scope, when: o.when || null, live: !!live, items, lanes, recommendedIds, drifted, pendingRestart, verdict }
}

function byId(items, id) { return items.find(i => i.id === id) }
function laneIndex(id) { return catalog.ITEMS.findIndex(i => i.id === id) }

module.exports = { statusOf, buildModel, SET, OPEN }
