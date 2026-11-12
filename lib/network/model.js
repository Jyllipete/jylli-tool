'use strict'
// Model: catalog + live readings + facts + what Jylli remembers + tweak meta + applicability -> the rows, lanes, resolver and verdict the page draws.
// Pure. Also the ONE place that decides what "recommended" means (stage, chips, CTA and row badge all read `rec` / `recommendedIds`),
// and the ONE place that maps the addresses an adapter really uses to a resolver preset.
//
// Status of a switch (exactly one), same words as the Windows tab:
//   on  Windows has it set, Jylli set it     native  Windows has it set, Jylli never touched it     partial  only some values are set
//   off Windows default                      drifted Jylli applied it, Windows reads the default again
//   restart Jylli applied it, waits for a restart       unknown  cannot be read honestly (no probe, or the read failed)
//   once  a repair with no state (flush DNS, Winsock reset)
// A switch whose probe says 'na' (this driver or Windows does not expose it) is not offered: it goes to `unavailable`.
const catalog = require('./catalog')
const { statusOf } = require('../windows/model')

const SET = new Set(['on', 'native'])
const OPEN = new Set(['off', 'drifted'])

/** The resolver the primary adapter really uses. facts: detect.normFacts(); settings: { customDnsPrimary }. */
function resolverOf(facts, settings = {}) {
  const dns = (facts && facts.dns) || []
  const prim = facts && facts.adapter ? dns.find(d => d.ifIndex === facts.adapter.ifIndex) || null : null
  const presetFor = d => {
    if (!d || !d.servers.length) return null
    if (!d.isStatic) return 'auto'
    const first = d.servers[0]
    const hit = catalog.PRESETS.find(p => p.servers[0] === first)
    if (hit) return hit.id
    if (settings.customDnsPrimary && settings.customDnsPrimary === first) return 'custom'
    return 'other'
  }
  const current = presetFor(prim)
  const differs = dns.filter(d => d !== prim && d.servers.length && presetFor(d) !== current).map(d => d.name)
  return {
    known: !!prim, current, servers: prim ? prim.servers : [], adapter: prim ? prim.name : null, isStatic: prim ? prim.isStatic : false,
    differs,   // other adapters that use a different resolver than the primary one (VPNs, virtual switches...)
    custom: { primary: settings.customDnsPrimary || '', secondary: settings.customDnsSecondary || '' },
    presets: catalog.PRESETS.map(p => ({ id: p.id, tweak: p.tweak, servers: p.servers, bench: p.bench, active: current === p.id })),
  }
}

/**
 * o: { live: detect.evaluate() | null, facts, remembered: {id: 'applied'|'restored'|'default'}, meta: {id: {safetyTier, gamerImpact, retired, risk}},
 *      applic: {id: {show, state, why}}, restart: [ids applied since the last boot], lastRun: {id: ms}, settings, when }
 */
function buildModel(o = {}) {
  let live = o.live || null
  const remembered = o.remembered || {}, meta = o.meta || {}, applic = o.applic || {}, lastRun = o.lastRun || {}
  const restart = new Set(o.restart || [])
  const items = [], unavailable = []
  const resolver = resolverOf(live ? (o.facts || null) : null, o.settings || {})
  // Windows ships a built-in list of DoH servers, so "listed" means nothing: DoH counts as on only when 1.1.1.1 is set to upgrade AND is the resolver in use.
  if (live && live['dns-doh'] && live['dns-doh'].state === 'all' && resolver.known && resolver.current !== 'cloudflare') live = { ...live, 'dns-doh': { ...live['dns-doh'], state: 'none' } }
  for (const it of catalog.ITEMS) {
    if (it.preset) continue                                            // the resolver card, not a row
    const m = meta[it.id] || {}, ap = applic[it.id] || null, rem = remembered[it.id] || 'default'
    const retired = !!m.retired || it.lane === 'retired'
    if (retired && rem !== 'applied') continue                          // nothing to offer, nothing to restore
    if (!retired && ap && ap.show === false && rem !== 'applied') continue   // does not apply to this PC
    const lv = live && live[it.id] ? live[it.id] : null
    if (!retired && !it.once && lv && lv.state === 'na' && rem !== 'applied') { unavailable.push(it.id); continue }
    const rebootNeeded = !!(it.reboot || (m.risk && m.risk.reboot))
    const status = it.once ? 'once' : statusOf(rem, live ? lv : null, restart.has(it.id))
    const tier = retired ? 1 : (m.safetyTier || 1)
    const caution = ap && ap.state === 'caution' ? (ap.why || 'caution') : null
    const wanted = !retired && !it.once && ap && ap.state === 'recommended'
    const open = status === 'off' || (status === 'unknown' && rem !== 'applied')
    const rec = !!wanted && open && !caution && tier < 3 && !rebootNeeded
    items.push({
      id: it.id, lane: retired ? 'retired' : it.lane, icon: it.icon, status, remembered: rem, retired, retiredWhy: retired ? (m.retired || '') : '',
      tier, reboot: rebootNeeded, impact: m.gamerImpact || null, caution, applicRec: !!(ap && ap.state === 'recommended'), rec,
      once: !!it.once, lastRun: it.once ? (lastRun[it.id] || null) : null, hasProbe: !!(it.probe && it.probe.length),
      values: lv ? lv.values : [], fidelity: m.fidelity || null, revert: m.risk ? m.risk.revert : null,
    })
  }
  const lanes = catalog.LANES.map(l => {
    const list = items.filter(i => i.lane === l.id)
    const on = list.filter(i => SET.has(i.status)).length
    return { id: l.id, ids: list.map(i => i.id), on, total: list.length }
  }).filter(l => l.total > 0)
  const rank = i => (i.rec ? 0 : OPEN.has(i.status) ? 1 : i.status === 'partial' ? 2 : 3)
  const pos = id => catalog.ITEMS.findIndex(i => i.id === id)
  const byId = id => items.find(i => i.id === id)
  for (const l of lanes) l.ids.sort((a, b) => rank(byId(a)) - rank(byId(b)) || pos(a) - pos(b))

  const real = items.filter(i => !i.retired && !i.once)
  const set = real.filter(i => SET.has(i.status)).length
  const drifted = items.filter(i => i.status === 'drifted').map(i => i.id)
  const pendingRestart = items.filter(i => i.status === 'restart').map(i => i.id)
  const recommendedIds = items.filter(i => i.rec).map(i => i.id)
  const facts = live ? (o.facts || null) : null
  const verdict = {
    kind: !live ? 'unread' : drifted.length ? 'attention' : recommendedIds.length ? 'open' : 'clean',
    set, total: real.length, jylli: real.filter(i => i.status === 'on').length, native: real.filter(i => i.status === 'native').length,
    drifted: drifted.length, rec: recommendedIds.length, restart: pendingRestart.length, unknown: real.filter(i => i.status === 'unknown').length,
  }
  return { when: o.when || null, live: !!live, facts, resolver, items, lanes, unavailable, recommendedIds, drifted, pendingRestart, verdict }
}

module.exports = { resolverOf, buildModel, SET, OPEN }
