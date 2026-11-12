'use strict'
// Path: turns a route analysis (lib/fivem/route-verdict.js analyze()) plus the adapter facts into the five nodes of the stage
// (PC, link, router, ISP, internet) and one verdict. Pure. It adds no new measuring rules: loss, jitter and "hidden hop" decisions are
// the route verdict's (docs/FIVEM_EVIDENCE.md); this file only decides where on the strip they are drawn and how the link itself reads.
//
// node  { id, tone: 'ok'|'warn'|'bad'|'idle', ms, jitter, loss, ip, ttl, v: { ... facts for the label } }
// verdict { id, node, ev, wifi } with id one of route-verdict's VERDICTS, or 'idle' (no trace yet)
const NODE_OF_SEG = { home: 'router', isp: 'isp', transit: 'internet', server: 'internet' }
const BAD = new Set(['loss-home', 'loss-isp', 'loss-transit', 'loss-server', 'unreachable', 'no-replies'])
const WARN = new Set(['jitter-home', 'jitter-path', 'spikes', 'far'])

const RSSI_WARN = -67, RSSI_BAD = -75   // dBm: Microsoft/Cisco guidance for reliable real-time use is better than -67; below -75 is marginal

function linkOf(facts) {
  const a = facts && facts.adapter
  if (!a) return { id: 'link', tone: 'idle', ms: null, jitter: null, loss: null, ip: null, ttl: null, v: { kind: null } }
  if (a.wifi) {
    const w = facts.wlan || {}
    const rssi = w.rssi, band = w.band
    const tone = rssi == null ? 'idle' : rssi <= RSSI_BAD ? 'bad' : rssi <= RSSI_WARN || band === 2.4 ? 'warn' : 'ok'
    return { id: 'link', tone, ms: null, jitter: null, loss: null, ip: null, ttl: null, v: { kind: 'wifi', rssi: rssi == null ? null : rssi, pct: w.signalPct, band: band || null, channel: w.channel || null, radio: w.radio || null, speedMbps: a.speedMbps } }
  }
  const sp = a.speedMbps
  return { id: 'link', tone: sp == null ? 'idle' : sp <= 100 ? 'warn' : 'ok', ms: null, jitter: null, loss: null, ip: null, ttl: null, v: { kind: 'ethernet', speedMbps: sp } }
}

function nodeFromHops(id, hops) {
  // the router is the first hop; any other segment is read at its last hop that answered (how far it adds up to)
  const got = hops.filter(h => h.stats.got > 0)
  const h = id === 'router' ? got[0] : got[got.length - 1]
  if (!h) return { id, tone: 'idle', ms: null, jitter: null, loss: null, ip: hops[0] ? hops[0].ip : null, ttl: hops[0] ? hops[0].ttl : null, v: { hidden: hops.length > 0 } }
  return { id, tone: 'ok', ms: h.stats.avg, jitter: h.stats.jitter, loss: h.stats.lossPct, ip: h.ip, ttl: h.ttl, v: { hops: hops.length } }
}

/** analysis: route-verdict analyze() | null. facts: detect.normFacts() | null. */
function pathOf(analysis, facts) {
  const link = linkOf(facts)
  const a = facts && facts.adapter
  const pc = { id: 'pc', tone: a ? 'ok' : 'idle', ms: null, jitter: null, loss: null, ip: null, ttl: null, v: { name: a ? a.name : null, desc: a ? a.desc : null } }
  const wifi = !!(a && a.wifi)
  if (!analysis || !analysis.hops || !analysis.hops.length) {
    const idle = id => ({ id, tone: 'idle', ms: null, jitter: null, loss: null, ip: id === 'router' && facts ? facts.gateway : null, ttl: null, v: {} })
    return { nodes: [pc, link, idle('router'), idle('isp'), idle('internet')], verdict: { id: 'idle', node: null, ev: {}, wifi }, rounds: 0 }
  }
  const bySeg = { home: [], isp: [], transit: [], server: [] }
  // Your router is hop 1. A private address further along (carrier-grade NAT, the ISP's modem or core) is the ISP's side of the line, so it is drawn on the ISP node.
  for (const h of analysis.hops) (h.seg === 'home' && h.ttl > 1 ? bySeg.isp : (bySeg[h.seg] || bySeg.transit)).push(h)
  const router = nodeFromHops('router', bySeg.home)
  const isp = nodeFromHops('isp', bySeg.isp)
  // internet = the endpoint when it answers, else the last transit hop that did; TCP connect time stands in when the server drops ICMP
  let internet
  if (analysis.end) internet = { id: 'internet', tone: 'ok', ms: analysis.end.avg, jitter: analysis.end.jitter, loss: analysis.end.lossPct, ip: (analysis.hops.find(h => h.seg === 'server') || {}).ip || null, ttl: (analysis.hops.find(h => h.seg === 'server') || {}).ttl || null, v: { via: 'icmp' } }
  else if (analysis.tcp && analysis.tcp.got > 0) internet = { id: 'internet', tone: 'ok', ms: analysis.tcp.avg, jitter: analysis.tcp.jitter, loss: analysis.tcp.lossPct, ip: null, ttl: null, v: { via: 'tcp' } }
  else internet = nodeFromHops('internet', bySeg.transit.concat(bySeg.server))
  const nodes = [pc, link, router, isp, internet]

  const v = analysis.verdict || { id: 'measuring', ev: {} }
  let node = null
  if (v.id !== 'measuring' && v.id !== 'clean') {
    const vt = v.ttl || (v.ev && v.ev.ttl) || 0
    node = v.id === 'no-replies' ? 'router' : v.seg === 'home' && vt > 1 ? 'isp' : NODE_OF_SEG[v.seg] || 'internet'
    const n = nodes.find(x => x.id === node)
    if (n) n.tone = BAD.has(v.id) ? 'bad' : WARN.has(v.id) ? 'warn' : n.tone
  }
  // routers that never answer are not faults: a node with no reply at all stays 'idle', never red
  return { nodes, verdict: { id: v.id, node, ev: v.ev || {}, wifi }, rounds: analysis.rounds || 0 }
}

/** The compact hop list the live view draws: [{ ttl, ip, seg, avg, loss, jitter, hidden }]. */
function hopsOf(analysis) {
  return ((analysis && analysis.hops) || []).map(h => ({ ttl: h.ttl, ip: h.ip, seg: h.seg, avg: h.stats.avg, loss: h.stats.lossPct, jitter: h.stats.jitter, hidden: !!h.hidden }))
}

module.exports = { pathOf, hopsOf, linkOf, RSSI_WARN, RSSI_BAD }
