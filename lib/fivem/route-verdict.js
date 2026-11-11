'use strict'
// Route Radar maths: hop rings, per-hop statistics, segment owners and the verdict. Pure, no require: the renderer ingests the same
// rounds the main process receives from the poller (a round = { d, h:[[ttl, ip|null, rtt|null]], tcp? }).
// Rules (docs/FIVEM_EVIDENCE.md): loss counts only when it persists at every later hop and at the endpoint, so a router that
// rate-limits its own ICMP replies is never reported as packet loss; a hop that never answers is "hidden", not a fault.
;(function (root) {
  const CAP = 120            // samples kept per hop
  const WINDOW = 60          // samples the verdict looks at
  const MIN_ROUNDS = 5
  const LOSS_MIN = 2         // percent
  const JITTER_HOME = 8      // ms, first private hop
  const JITTER_PATH = 15     // ms, endpoint
  const FAR_MS = 150

  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k)

  function classifyIp(ip) {
    const m = String(ip || '').match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
    if (!m) return /^(fe80|fc|fd)/i.test(String(ip || '')) ? 'private' : 'public'
    const a = +m[1], b = +m[2]
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'private'
    if (a === 100 && b >= 64 && b <= 127) return 'cgnat'
    if (a === 127) return 'loopback'
    if (a === 169 && b === 254) return 'linklocal'
    return 'public'
  }

  function create() { return { rounds: 0, destTtl: null, hops: {}, tcp: [] } }

  const push = (ring, v) => { ring.push(v == null ? null : v); if (ring.length > CAP) ring.shift() }

  /** round: { d: destination ttl or null, h: [[ttl, ip, rtt]], tcp: rtt|null|undefined }. Mutates and returns state. */
  function ingest(state, round) {
    if (!round || !Array.isArray(round.h)) return state
    state.rounds++
    if (Number.isInteger(round.d) && round.d > 0) {
      if (state.destTtl !== round.d) { for (const t of Object.keys(state.hops)) if (+t > round.d) delete state.hops[t] }
      state.destTtl = round.d
    }
    for (const row of round.h) {
      const ttl = row[0]
      if (!Number.isInteger(ttl) || ttl < 1 || ttl > 64) continue
      if (state.destTtl && ttl > state.destTtl) continue
      const h = state.hops[ttl] || (state.hops[ttl] = { ttl, ip: null, ring: [] })
      if (row[1]) h.ip = String(row[1])
      push(h.ring, typeof row[2] === 'number' && Number.isFinite(row[2]) ? row[2] : null)
    }
    if (round.tcp !== undefined) push(state.tcp, typeof round.tcp === 'number' ? round.tcp : null)
    return state
  }

  /** { n, got, lossPct, avg, min, max, p95, jitter } over the last `last` samples; null fields when nothing answered. */
  function stats(ring, last = WINDOW) {
    const r = ring.slice(-last)
    const ok = r.filter(v => v != null)
    const n = r.length
    if (!n) return { n: 0, got: 0, lossPct: null, avg: null, min: null, max: null, p95: null, jitter: null }
    const base = { n, got: ok.length, lossPct: Math.round(((n - ok.length) / n) * 1000) / 10 }
    if (!ok.length) return { ...base, avg: null, min: null, max: null, p95: null, jitter: null }
    const sorted = [...ok].sort((a, b) => a - b)
    const avg = ok.reduce((s, v) => s + v, 0) / ok.length
    let j = 0, jn = 0
    for (let i = 1; i < ok.length; i++) { j += Math.abs(ok[i] - ok[i - 1]); jn++ }
    const r1 = v => Math.round(v * 10) / 10
    return { ...base, avg: r1(avg), min: sorted[0], max: sorted[sorted.length - 1], p95: sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)], jitter: jn ? r1(j / jn) : 0 }
  }

  /** ttl -> 'home' | 'isp' | 'transit' | 'server' */
  function segments(state) {
    const ttls = Object.keys(state.hops).map(Number).sort((a, b) => a - b)
    const seg = {}
    let firstPublic = null, pub = 0
    for (const t of ttls) {
      const c = classifyIp(state.hops[t].ip)
      if (state.destTtl && t === state.destTtl) { seg[t] = 'server'; continue }
      if (c === 'private' || c === 'loopback' || c === 'linklocal') { seg[t] = firstPublic == null ? 'home' : 'transit'; continue }
      if (c === 'cgnat') { seg[t] = 'isp'; if (firstPublic == null) firstPublic = t; continue }
      if (!state.hops[t].ip) { seg[t] = firstPublic == null ? 'home' : (pub < 2 ? 'isp' : 'transit'); continue }
      if (firstPublic == null) firstPublic = t
      seg[t] = pub < 2 ? 'isp' : 'transit'
      pub++
    }
    return seg
  }

  /** -> { rounds, hops:[{ttl, ip, seg, stats, hidden}], end, tcp, verdict:{ id, ttl?, seg?, ev } } */
  function analyze(state) {
    const seg = segments(state)
    const ttls = Object.keys(state.hops).map(Number).sort((a, b) => a - b)
    const hops = ttls.map(t => { const h = state.hops[t]; const s = stats(h.ring); return { ttl: t, ip: h.ip, seg: seg[t], stats: s, hidden: s.n > 0 && s.got === 0 } })
    const endHop = state.destTtl ? hops.find(h => h.ttl === state.destTtl) : null
    const end = endHop && !endHop.hidden ? endHop.stats : null
    const tcp = stats(state.tcp)
    return { rounds: state.rounds, hops, end, tcp, verdict: verdictOf(state, hops, end, tcp) }
  }

  function verdictOf(state, hops, end, tcp) {
    if (state.rounds < MIN_ROUNDS) return { id: 'measuring', ev: { rounds: state.rounds, need: MIN_ROUNDS } }
    const tcpUp = tcp.n > 0 && tcp.got > 0
    const anyHop = hops.some(h => h.stats.got > 0)
    if (!end && !tcpUp) {
      if (!anyHop) return { id: 'no-replies', ev: {} }
      const last = [...hops].reverse().find(h => h.stats.got > 0)
      return { id: 'unreachable', ttl: last.ttl, seg: last.seg, ev: { ip: last.ip, ttl: last.ttl } }
    }
    // The reference for the endpoint: ICMP when the server answers it, otherwise the TCP connect to the game port.
    const icmpDead = !end || end.got === 0
    const ref = icmpDead ? tcp : end
    const via = icmpDead ? 'tcp' : 'icmp'

    // Loss: earliest hop whose loss persists at every later answering hop and at the endpoint.
    if (ref.lossPct != null && ref.lossPct >= LOSS_MIN) {
      let origin = null
      const answering = hops.filter(h => h.stats.got > 0 && !(state.destTtl && h.ttl === state.destTtl))
      for (let i = 0; i < answering.length && !origin; i++) {
        const h = answering[i]
        if (h.stats.lossPct < LOSS_MIN) continue
        const floor = Math.max(LOSS_MIN, h.stats.lossPct * 0.5)
        const later = answering.slice(i + 1)
        if (later.every(x => x.stats.lossPct >= floor) && ref.lossPct >= floor) origin = h
      }
      if (origin) return { id: 'loss-' + origin.seg, ttl: origin.ttl, seg: origin.seg, ev: { ip: origin.ip, ttl: origin.ttl, loss: origin.stats.lossPct, endLoss: ref.lossPct, via } }
      return { id: 'loss-server', seg: 'server', ev: { loss: ref.lossPct, via } }
    }

    const home = hops.find(h => h.seg === 'home' && h.stats.got > 0)
    if (home && home.stats.jitter != null && home.stats.jitter >= JITTER_HOME) return { id: 'jitter-home', ttl: home.ttl, seg: 'home', ev: { ip: home.ip, jitter: home.stats.jitter, ttl: home.ttl } }
    if (ref.jitter != null && ref.jitter >= JITTER_PATH) return { id: 'jitter-path', seg: 'server', ev: { jitter: ref.jitter, via } }
    if (ref.avg != null && ref.p95 != null && ref.p95 >= Math.max(ref.avg * 2.5, ref.avg + 60)) return { id: 'spikes', seg: 'server', ev: { avg: ref.avg, p95: ref.p95, via } }
    if (ref.avg != null && ref.avg >= FAR_MS) return { id: 'far', seg: 'server', ev: { avg: ref.avg, via } }
    return { id: 'clean', seg: 'server', ev: { avg: ref.avg, jitter: ref.jitter, loss: ref.lossPct, via } }
  }

  const api = { CAP, WINDOW, MIN_ROUNDS, LOSS_MIN, classifyIp, create, ingest, stats, segments, analyze, VERDICTS: ['measuring', 'no-replies', 'unreachable', 'loss-home', 'loss-isp', 'loss-transit', 'loss-server', 'jitter-home', 'jitter-path', 'spikes', 'far', 'clean'] }
  root.JylliFivemRoute = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
