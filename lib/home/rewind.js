'use strict'
// Home "Rewind strip": the last 7 days as one thin strip. CPU / RAM from the metrics history (one sample a minute) and one mark per
// journal batch. Pure and UMD. Gaps stay gaps (null), temperatures were never recorded so none are shown.
//   strip({ samples: [{ts,cpu,ram}], entries: [journal entry, newest first], now, hours }) -> { from, to, buckets: [{ ts, cpu, ram }], marks: [{ x, ts, key, n, via, batchId, entryId, undone }] }
//   at(strip, x) -> { ts, bucket, marks }  (x = 0..1 along the strip: the bucket under the playhead and the marks within a few buckets of it)
;(function (root) {
  const HOUR = 3600e3
  const BUCKETS = 112
  const num = n => typeof n === 'number' && Number.isFinite(n)
  const marksOf = (root.JylliChronoPure || (typeof require === 'function' ? require('../../js/chronoline.js') : null)).marks

  function strip(input) {
    input = input || {}
    const to = num(input.now) ? input.now : Date.now()
    const hours = Math.max(6, Math.min(168, input.hours || 168))
    const from = to - hours * HOUR
    const step = (to - from) / BUCKETS
    const acc = Array.from({ length: BUCKETS }, () => ({ c: 0, cn: 0, r: 0, rn: 0 }))
    for (const s of input.samples || []) {
      if (!s || !num(s.ts) || s.ts < from || s.ts > to) continue
      const i = Math.min(BUCKETS - 1, Math.floor((s.ts - from) / step))
      if (num(s.cpu)) { acc[i].c += s.cpu; acc[i].cn++ }
      if (num(s.ram)) { acc[i].r += s.ram; acc[i].rn++ }
    }
    const buckets = acc.map((a, i) => ({ ts: Math.round(from + (i + 0.5) * step), cpu: a.cn ? Math.round(a.c / a.cn) : null, ram: a.rn ? Math.round(a.r / a.rn) : null }))
    const undoneBatches = new Set((input.entries || []).filter(e => e && e.undoneBy).map(e => e.batchId || 'single:' + e.id))
    const marks = marksOf((input.entries || []).filter(e => e && num(e.ts) && e.ts >= from && e.ts <= to && !(e.via === 'undo')))
      .map(m => ({ x: (m.ts - from) / (to - from), ts: m.ts, key: m.key, n: m.n, via: m.via, batchId: m.batchId, entryId: m.entryId, undone: undoneBatches.has(m.key) }))
    return { from, to, buckets, marks }
  }

  function at(s, x) {
    if (!s || !s.buckets || !s.buckets.length) return null
    const f = Math.max(0, Math.min(1, x))
    const i = Math.min(s.buckets.length - 1, Math.floor(f * s.buckets.length))
    const reach = 3 / s.buckets.length
    return { ts: Math.round(s.from + f * (s.to - s.from)), bucket: s.buckets[i], marks: s.marks.filter(m => Math.abs(m.x - f) <= reach) }
  }

  const api = { strip, at, BUCKETS }
  root.JylliHomeRewind = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
