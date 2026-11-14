'use strict'
// Route memory: one small entry per finished trace of a server, and the pattern over many of them ("most evening runs lose packets
// at your ISP"). Entries come from lib/fivem/route-verdict.js analyses, so everything is measured; a pattern needs MIN_RUNS runs
// and says "runs", never "always". Pure, no require.
;(function (root) {
  const MIN_ROUNDS = 30          // a trace shorter than this says too little to remember
  const MIN_RUNS = 3             // runs needed before any pattern is stated
  const CAP = 40                 // entries kept per server
  const BAD = /^(loss|unreachable|no-replies|jitter|spikes)/
  const BUCKETS = ['night', 'morning', 'afternoon', 'evening']   // 0-5, 6-11, 12-17, 18-23 (local time)

  const bucketOf = hour => BUCKETS[Math.min(3, Math.floor((((hour % 24) + 24) % 24) / 6))]

  /** analysis (Verdict.analyze result) -> entry | null. `at` is epoch ms, `hour` the local hour. */
  function entryFrom(analysis, at, hour) {
    if (!analysis || !analysis.verdict || analysis.rounds < MIN_ROUNDS) return null
    const v = analysis.verdict
    if (v.id === 'measuring') return null
    const ref = analysis.end && analysis.end.got ? analysis.end : analysis.tcp && analysis.tcp.got ? analysis.tcp : null
    return { at, hour, bucket: bucketOf(hour), verdict: v.id, seg: v.seg || null, ttl: v.ttl != null ? v.ttl : null, avg: ref ? ref.avg : null, jitter: ref ? ref.jitter : null, loss: ref ? ref.lossPct : null, rounds: analysis.rounds }
  }

  const add = (list, e) => { const out = [...(Array.isArray(list) ? list : []), e]; return out.slice(-CAP) }
  const isBad = e => BAD.test(String(e && e.verdict))

  /** entries -> { runs, badRuns, buckets: { evening: { n, bad } ... }, worst: { bucket, n, bad }|null, repeat: { verdict, seg, count }|null, enough } */
  function pattern(entries) {
    const list = (Array.isArray(entries) ? entries : []).filter(e => e && e.verdict)
    const buckets = Object.fromEntries(BUCKETS.map(b => [b, { n: 0, bad: 0 }]))
    let bad = 0
    const kinds = {}
    for (const e of list) {
      const b = buckets[e.bucket] || buckets[bucketOf(e.hour || 0)]
      b.n++
      if (isBad(e)) { b.bad++; bad++; const k = e.verdict + '|' + (e.seg || ''); kinds[k] = (kinds[k] || 0) + 1 }
    }
    const enough = list.length >= MIN_RUNS
    let worst = null
    for (const name of BUCKETS) { const b = buckets[name]; if (b.n >= 2 && b.bad > 0 && (!worst || b.bad / b.n > worst.bad / worst.n)) worst = { bucket: name, n: b.n, bad: b.bad } }
    const top = Object.entries(kinds).sort((a, b) => b[1] - a[1])[0]
    const repeat = top && top[1] >= 2 ? { verdict: top[0].split('|')[0], seg: top[0].split('|')[1] || null, count: top[1] } : null
    return { runs: list.length, badRuns: bad, buckets, worst: enough ? worst : null, repeat: enough ? repeat : null, enough }
  }

  const api = { MIN_ROUNDS, MIN_RUNS, CAP, BUCKETS, bucketOf, entryFrom, add, isBad, pattern }
  root.JylliFivemHistory = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
