'use strict'
// Home Timeline: the pure part. Which tabs exist and what they draw, spike detection, "your normal" for this hour, the narrator sentence,
// event pins, number helpers. UMD, unit-tested in test/home-trace.test.js. Nothing here reads a sensor or draws; a missing value is null.
;(function (root) {
  const DAY = 86400000
  const num = n => typeof n === 'number' && Number.isFinite(n)

  // The ONLY table of tabs. lines: what is drawn (left axis unless axis:'right'); ceiling: key into the shared thermal limits;
  // spike: thresholds for the culprit read; culprit: which per-process read explains a spike ('cpu'|'ram'|'disk'|null);
  // history: which field of the 7-day metrics history this tab can show (null = not recorded, so the 7-day window is disabled).
  const TABS = {
    cpu: { id: 'cpu', lines: [{ key: 'cpu.load', unit: 'pct', role: 'primary' }, { key: 'cpu.temp.package', unit: 'c', role: 'secondary', axis: 'right', ceiling: 'cpu' }],
      extras: [{ key: 'cpu.power', unit: 'w' }], spike: { jump: 25, jumpTo: 60, held: 85 }, culprit: 'cpu', history: 'cpu', baseline: true },
    gpu: { id: 'gpu', lines: [{ key: 'gpu0.load', unit: 'pct', role: 'primary' }, { key: 'gpu0.temp.core', unit: 'c', role: 'secondary', axis: 'right', ceiling: 'gpu' }],
      extras: [{ key: 'gpu0.vram.pct', unit: 'pct' }, { key: 'gpu0.power', unit: 'w' }, { key: 'gpu0.clock.core', unit: 'mhz' }], spike: null, culprit: null, history: null, baseline: false },
    ram: { id: 'ram', lines: [{ key: 'ram.load', unit: 'pct', role: 'primary' }],
      extras: [{ key: 'ram.used', unit: 'gb' }, { key: 'ram.total', unit: 'gb' }], spike: { jump: 15, jumpTo: 70, held: 92 }, culprit: 'ram', history: 'ram', baseline: true },
    disk: { id: 'disk', lines: [{ key: 'disk.load', unit: 'pct', role: 'primary' }, { key: 'disk0.temp', unit: 'c', role: 'secondary', axis: 'right' }],
      extras: [{ key: 'disk.read', unit: 'bps' }, { key: 'disk.write', unit: 'bps' }], spike: { jump: 30, jumpTo: 70, held: 90 }, culprit: 'disk', history: null, baseline: false },
    net: { id: 'net', lines: [{ key: 'net.rx', unit: 'bps', role: 'primary' }, { key: 'net.tx', unit: 'bps', role: 'secondary' }],
      extras: [], spike: null, culprit: null, history: null, baseline: false },
  }
  const TAB_IDS = ['cpu', 'gpu', 'ram', 'disk', 'net']
  // Live windows in ms; '7d' is the recorded history, drawn from the metrics history instead of the live ring.
  const WINDOWS = { '1m': 60000, '10m': 600000, '7d': 7 * DAY }

  /** Every telemetry key a tab draws or reads, for one backfill call. */
  const keysOf = tab => [...tab.lines, ...tab.extras].map(l => l.key)
  const allKeys = () => [...new Set(TAB_IDS.flatMap(id => keysOf(TABS[id])))]

  /** Append a point and drop the ones older than maxMs. Mutates and returns the ring. */
  function pushRing(ring, pt, maxMs) {
    if (!pt || !num(pt.t)) return ring
    ring.push(pt)
    const cut = pt.t - maxMs
    let i = 0
    while (i < ring.length && ring[i].t < cut) i++
    if (i) ring.splice(0, i)
    return ring
  }

  /** At most `max` points, keeping the first, the last and the peak of every bucket (a spike must survive thinning). */
  function decimate(points, max) {
    const p = (points || []).filter(x => x && num(x.t) && num(x.v))
    if (p.length <= max || max < 3) return p
    const t0 = p[0].t, span = p[p.length - 1].t - t0 || 1
    const buckets = new Map()
    for (const x of p) {
      const b = Math.min(max - 1, Math.floor(((x.t - t0) / span) * (max - 1)))
      const cur = buckets.get(b)
      if (!cur || x.v > cur.v) buckets.set(b, x)
    }
    const out = [...buckets.values()]
    if (out[0] !== p[0]) out.unshift(p[0])
    if (out[out.length - 1] !== p[p.length - 1]) out.push(p[p.length - 1])
    return out
  }

  /** Top of a throughput axis: the next 1 / 2 / 5 x 10^k above 110 % of the peak, never below `min`. */
  function niceMax(v, min) {
    const floor = min || 1
    const x = Math.max(floor, (num(v) ? v : 0) * 1.1)
    const e = Math.pow(10, Math.floor(Math.log10(x)))
    const m = x / e
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * e
  }

  /**
   * Spikes in one series (points {t, v}, ascending), oldest first. A spike is
   *   jump: a rise of >= spec.jump points within 5 s that ends at >= spec.jumpTo, or
   *   held: >= spec.held for 5 s in a row.
   * After one fires, the next one is not reported for 20 s (one event, one flag).
   */
  function spikes(points, spec) {
    if (!spec) return []
    const out = [], p = (points || []).filter(x => x && num(x.t) && num(x.v))
    let quietUntil = -Infinity, j = 0
    for (let i = 0; i < p.length; i++) {
      const { t, v } = p[i]
      if (t < quietUntil) continue
      while (j < i && p[j].t < t - 5000) j++
      let kind = null, from = null
      if (v >= spec.jumpTo) for (let k = j; k < i; k++) if (v - p[k].v >= spec.jump) { kind = 'jump'; from = p[k]; break }
      if (!kind && v >= spec.held && j < i && p[j].t <= t - 4800) {   // a full 5 s, allowing for sample jitter
        let all = true
        for (let k = j; k <= i; k++) if (p[k].v < spec.held) { all = false; break }
        if (all) { kind = 'held'; from = p[j] }
      }
      if (kind) { out.push({ t, v, kind, from: from.v }); quietUntil = t + 20000 }
    }
    return out
  }

  const pct = (a, q) => { const s = a.slice().sort((x, y) => x - y); const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo) }

  /**
   * "Your normal": the typical range of a metric around this hour of the day, from earlier days only.
   * history: [{ ts, cpu, ram }] (one a minute). Needs samples on >= 3 earlier days, else null (no guess).
   * -> { p25, p50, p75, days, n }
   */
  function baseline(history, field, now) {
    const at = new Date(num(now) ? now : Date.now())
    const hour = at.getHours() + at.getMinutes() / 60
    const today = at.toDateString()
    const vals = [], days = new Set()
    for (const h of history || []) {
      if (!h || !num(h.ts) || !num(h[field])) continue
      const d = new Date(h.ts)
      if (d.toDateString() === today) continue
      let dh = Math.abs(d.getHours() + d.getMinutes() / 60 - hour)
      if (dh > 12) dh = 24 - dh
      if (dh > 1) continue
      vals.push(h[field]); days.add(d.toDateString())
    }
    if (days.size < 3 || vals.length < 20) return null
    return { p25: Math.round(pct(vals, .25)), p50: Math.round(pct(vals, .5)), p75: Math.round(pct(vals, .75)), days: days.size, n: vals.length }
  }

  /** Where a value sits against your normal: { kind: 'high'|'normal'|'low', ratio }. ratio is against the median. */
  function compare(value, base) {
    if (!base || !num(value)) return null
    const ratio = Math.round((value / Math.max(base.p50, 1)) * 10) / 10
    if (value > base.p75 * 1.25 && value - base.p75 >= 10) return { kind: 'high', ratio }
    if (value < base.p25 * 0.5 && base.p25 - value >= 10) return { kind: 'low', ratio }
    return { kind: 'normal', ratio }
  }

  /**
   * The sentence under the chart, as a LANG key and vars. state = {
   *   tab, now: { primary, secondary }, unavailable: { reason } | null (the primary line has no reading),
   *   spike: { ageS, flag } | null (a spike in the last 30 s; flag from processes.flagFor or { type: 'pending' }),
   *   cmp: compare() | null, ceiling: number | null }
   */
  function narrate(state) {
    const s = state || {}
    if (s.unavailable) return { key: 'nar_na', vars: { reason: s.unavailable.reason || 'no-sensor' } }
    if (s.spike) {
      const f = s.spike.flag || { type: 'pending' }
      const v = { ago: s.spike.ageS, v: s.spike.v == null ? '' : Math.round(s.spike.v) }
      if (f.type === 'process') return { key: 'nar_spikeBy', vars: { ...v, name: f.name, id: f.id || '', share: Math.round(f.value) } }
      if (f.type === 'spread') return { key: 'nar_spikeSpread', vars: v }
      if (f.type === 'game') return { key: 'nar_spikeGame', vars: v }
      if (f.type === 'none') return { key: 'nar_spikeUnknown', vars: v }
      return { key: 'nar_spikePending', vars: v }
    }
    const sec = s.now && s.now.secondary
    if (s.ceiling != null && num(sec) && sec >= s.ceiling - 5) return { key: 'nar_hot', vars: { t: Math.round(sec), limit: s.ceiling } }
    if (s.cmp) {
      if (s.cmp.kind === 'high') return { key: 'nar_high', vars: { x: s.cmp.ratio } }
      if (s.cmp.kind === 'low') return { key: 'nar_low', vars: {} }
      return { key: 'nar_normal', vars: {} }
    }
    return { key: 'nar_calm', vars: {} }
  }

  /**
   * Pins inside a window. events: [{ t, kind: 'change'|'game'|'restore'|'spike', ... }] -> same events with x (0..1), oldest first.
   */
  function pinsIn(events, now, windowMs) {
    const from = now - windowMs
    return (events || []).filter(e => e && num(e.t) && e.t >= from && e.t <= now).sort((a, b) => a.t - b.t).map(e => ({ ...e, x: (e.t - from) / windowMs }))
  }

  const api = { TABS, TAB_IDS, WINDOWS, keysOf, allKeys, pushRing, decimate, niceMax, spikes, baseline, compare, narrate, pinsIn }
  root.JylliHomeTrace = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
