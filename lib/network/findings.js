'use strict'
// Findings: the ONLY list of what the Network tab may tell the user after a checkup. Pure.
// A finding exists only when its evidence is in the input; a measurement that is missing produces no finding (never a guess).
// Every threshold is named here and documented in docs/NETWORK_EVIDENCE.md.
//   in:  { model: model.buildModel(), path: path.pathOf(), bench: { results:[{name, server, tweak, fail, median}], current:{server, fail, median}|null } | null,
//          speed: { latencyMs, loadedLatencyMs, t } | null, now }
//   out: [{ id, tone: 'bad'|'warn'|'info', ev, action }]   ranked: bad, warn, info, then rule order
//   action: { kind: 'tweak', ids, act } | { kind: 'dns', preset, tweak } | { kind: 'view', view } | { kind: 'speed' } | { kind: 'advice' }
const T = {
  DNS_GAIN_MS: 15,          // a public resolver must be at least this much faster ...
  DNS_GAIN_RATIO: 1.5,      // ... and at least this many times faster than the one in use
  BLOAT_WARN_MS: 100,       // loaded minus idle latency (RFC 8290 / bufferbloat.net: >100 ms hurts interactive use)
  BLOAT_BAD_MS: 300,
  SPEED_FRESH_MS: 7 * 24 * 3600 * 1000,
  RSSI_WARN: -67, RSSI_BAD: -75,
  LINK_SLOW_MBPS: 100,
}

const RANK = { bad: 0, warn: 1, info: 2 }

function run(inp = {}) {
  const model = inp.model, path = inp.path, bench = inp.bench, speed = inp.speed, now = inp.now || Date.now()
  const out = []
  const add = (id, tone, ev, action) => out.push({ id, tone, ev: ev || {}, action: action || { kind: 'advice' } })
  const facts = model && model.facts
  const wifi = !!(facts && facts.adapter && facts.adapter.wifi)

  // 1. Jylli applied something and Windows reads the default again
  if (model && model.drifted.length) add('drifted', 'warn', { ids: model.drifted }, { kind: 'tweak', ids: model.drifted, act: 'apply' })

  // 2. The path: where the trace says the problem lives (route-verdict rules, mapped to a node by path.js)
  const v = path && path.verdict
  if (v && v.id !== 'idle' && v.id !== 'measuring' && v.id !== 'clean') {
    const bad = ['loss-home', 'loss-isp', 'loss-transit', 'loss-server', 'unreachable', 'no-replies'].includes(v.id)
    if ((v.id === 'jitter-home' || v.id === 'loss-home') && wifi) add('wifi-path', bad ? 'bad' : 'warn', { verdict: v.id, ...v.ev }, { kind: 'view', view: 'live' })
    else add('path-' + v.id, bad ? 'bad' : 'warn', { ...v.ev, node: v.node }, { kind: 'view', view: 'live' })
  }

  // 3. The Wi-Fi link itself
  const w = facts && facts.wlan
  if (wifi && w && w.rssi != null) {
    if (w.rssi <= T.RSSI_BAD) add('wifi-weak', 'bad', { rssi: w.rssi, band: w.band })
    else if (w.rssi <= T.RSSI_WARN) add('wifi-weak', 'warn', { rssi: w.rssi, band: w.band })
  }
  if (wifi && w && w.band === 2.4) add('wifi-band', 'info', { band: w.band, channel: w.channel })

  // 4. Cable negotiated slow
  const a = facts && facts.adapter
  if (a && !a.wifi && a.speedMbps != null && a.speedMbps <= T.LINK_SLOW_MBPS) add('link-slow', 'warn', { mbps: a.speedMbps })

  // 5. Resolver
  if (bench && bench.results) {
    const good = bench.results.filter(r => !r.fail && Number.isFinite(r.median)).sort((x, y) => x.median - y.median)
    const best = good[0]
    const cur = bench.current
    const rs = model && model.resolver
    if (best && cur && rs && rs.known && rs.current !== best.preset) {
      if (cur.fail) add('dns-down', 'bad', { server: cur.server, best: best.name, ms: best.median }, { kind: 'dns', preset: best.preset, tweak: best.tweak })
      else if (Number.isFinite(cur.median) && cur.median - best.median >= T.DNS_GAIN_MS && cur.median >= best.median * T.DNS_GAIN_RATIO) {
        add('dns-slow', 'warn', { server: cur.server, ms: cur.median, best: best.name, bestMs: best.median }, { kind: 'dns', preset: best.preset, tweak: best.tweak })
      }
    }
  }

  // 6. Bufferbloat, from the last speed test (loaded minus idle latency)
  if (speed && Number.isFinite(speed.latencyMs) && Number.isFinite(speed.loadedLatencyMs) && now - (speed.t || 0) <= T.SPEED_FRESH_MS) {
    const d = Math.round(speed.loadedLatencyMs - speed.latencyMs)
    if (d >= T.BLOAT_BAD_MS) add('bufferbloat', 'bad', { extra: d, idle: Math.round(speed.latencyMs), loaded: Math.round(speed.loadedLatencyMs) }, { kind: 'advice' })
    else if (d >= T.BLOAT_WARN_MS) add('bufferbloat', 'warn', { extra: d, idle: Math.round(speed.latencyMs), loaded: Math.round(speed.loadedLatencyMs) }, { kind: 'advice' })
  }

  // 7. Switches the rules recommend for this PC
  if (model && model.recommendedIds.length) add('tune', 'info', { ids: model.recommendedIds, n: model.recommendedIds.length }, { kind: 'tweak', ids: model.recommendedIds, act: 'apply' })

  // 8. A change that waits for a restart
  if (model && model.pendingRestart.length) add('restart', 'info', { ids: model.pendingRestart }, { kind: 'advice' })

  out.forEach((f, i) => { f.o = i })
  out.sort((x, y) => RANK[x.tone] - RANK[y.tone] || x.o - y.o)
  out.forEach(f => { delete f.o })
  const measured = !!(path && path.verdict && path.verdict.id !== 'idle' && path.verdict.id !== 'measuring')
  return { findings: out, healthy: measured && !out.some(f => f.tone !== 'info'), measured }
}

module.exports = { run, T }
