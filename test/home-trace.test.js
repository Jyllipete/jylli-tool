const test = require('node:test')
const assert = require('node:assert')
const T = require('../lib/home/trace')
const Pr = require('../lib/home/processes')
const Tel = require('../js/telemetry')
const Attr = require('../lib/pulse/attribution')

const NOW = new Date(2026, 10, 12, 14, 30).getTime()    // local time: the baseline works on the local hour of day
const DAY = 86400000
const pts = (arr, t0 = 0, step = 1000) => arr.map((v, i) => ({ t: t0 + i * step, v }))

// ── tabs ────────────────────────────────────────────────────────────────────────────
test('tabs: every key a tab draws has a unit the telemetry formatter knows', () => {
  const units = { pct: 'pct', c: 'c', w: 'w', mhz: 'mhz', gb: 'gb', bps: 'bps' }
  for (const id of T.TAB_IDS) {
    for (const l of [...T.TABS[id].lines, ...T.TABS[id].extras]) {
      assert.strictEqual(Tel.unitOf(l.key), units[l.unit], `${l.key} is ${l.unit} here but ${Tel.unitOf(l.key)} in js/telemetry.js`)
    }
  }
})

test('tabs: one primary line each, the 7-day window only where it was recorded, spike rules only with a culprit read', () => {
  for (const id of T.TAB_IDS) {
    const t = T.TABS[id]
    assert.strictEqual(t.lines.filter(l => l.role === 'primary').length, 1, id)
    assert.strictEqual(!!t.history, !!t.baseline, id + ': a baseline needs recorded history')
    assert.strictEqual(!!t.culprit, !!t.spike, id + ': a spike without a way to explain it, or the reverse')
  }
  assert.deepStrictEqual(T.TAB_IDS.filter(id => T.TABS[id].history), ['cpu', 'ram'])
  assert.ok(T.allKeys().includes('cpu.temp.package') && T.allKeys().length === new Set(T.allKeys()).size)
})

test('the temperature ceilings are the ones Pulse uses to call a hitch thermal', () => {
  assert.deepStrictEqual(Attr.THERMAL_LIMIT, { cpu: 95, gpu: 87 })
  for (const id of T.TAB_IDS) for (const l of T.TABS[id].lines) if (l.ceiling) assert.ok(Attr.THERMAL_LIMIT[l.ceiling] != null)
})

// ── ring, decimate, niceMax ──────────────────────────────────────────────────────────
test('ring: old points fall off, bad points are ignored', () => {
  const r = []
  for (let i = 0; i < 20; i++) T.pushRing(r, { t: i * 1000, v: i }, 10000)
  T.pushRing(r, { t: NaN, v: 1 }, 10000)
  assert.strictEqual(r[0].t, 9000)
  assert.strictEqual(r.length, 11)
})

test('decimate: keeps the first, the last and every peak', () => {
  const p = pts(Array.from({ length: 1000 }, (_, i) => (i === 500 ? 99 : 10)))
  const d = T.decimate(p, 50)
  assert.ok(d.length <= 52)
  assert.strictEqual(d[0], p[0]); assert.strictEqual(d[d.length - 1], p[999])
  assert.ok(d.some(x => x.v === 99), 'a spike must survive thinning')
  assert.strictEqual(T.decimate(p.slice(0, 10), 50).length, 10)
  assert.deepStrictEqual(T.decimate(null, 5), [])
})

test('niceMax: 1 / 2 / 5 steps with headroom', () => {
  assert.strictEqual(T.niceMax(0, 1000), 1000)
  assert.strictEqual(T.niceMax(1.4e6), 2e6)
  assert.strictEqual(T.niceMax(4.2e6), 5e6)
  assert.strictEqual(T.niceMax(4.6e6), 10e6)
  assert.strictEqual(T.niceMax(90), 100)
  assert.strictEqual(T.niceMax(NaN, 50), 50)
})

// ── spikes ──────────────────────────────────────────────────────────────────────────
const CPU = T.TABS.cpu.spike

test('spikes: a sudden jump to a high level fires once', () => {
  const p = pts([10, 11, 12, 10, 11, 95, 96, 94, 95, 96, 95, 96])
  const s = T.spikes(p, CPU)
  assert.strictEqual(s.length, 1)
  assert.deepStrictEqual([s[0].kind, s[0].t, s[0].v], ['jump', 5000, 95])
})

test('spikes: a slow climb does not fire a jump, but held high load does fire after five seconds', () => {
  const climb = pts(Array.from({ length: 60 }, (_, i) => 20 + i))                   // +1 a second to 79
  assert.deepStrictEqual(T.spikes(climb, CPU), [])
  const held = pts([50, 88, 89, 90, 91, 90, 89, 88, 90])
  const s = T.spikes(held, CPU)
  assert.strictEqual(s.length, 1)
  assert.strictEqual(s[0].kind, 'jump', 'the jump from 50 to 88 is already a spike')
  const plateau = pts([86, 86, 87, 88, 87, 86, 87])
  const h = T.spikes(plateau, CPU)
  assert.deepStrictEqual(h.map(x => x.kind), ['held'])
  assert.strictEqual(h[0].t, 5000)
})

test('spikes: a dip inside the window means it was not held; a low jump never fires', () => {
  assert.deepStrictEqual(T.spikes(pts([90, 90, 60, 90, 90, 90, 90]), { jump: 99, jumpTo: 99, held: 85 }), [])
  assert.deepStrictEqual(T.spikes(pts([5, 5, 40, 45, 5]), CPU), [], 'ends below the jumpTo level')
})

test('spikes: one event, one flag. A second spike inside 20 s is the same event; later ones count', () => {
  const v = Array.from({ length: 60 }, (_, i) => (i === 10 || i === 18 || i === 40 ? 95 : 10))
  assert.deepStrictEqual(T.spikes(pts(v), CPU).map(s => s.t), [10000, 40000])
  assert.deepStrictEqual(T.spikes([], CPU), [])
  assert.deepStrictEqual(T.spikes(pts([1, 99]), null), [])
})

// ── baseline ────────────────────────────────────────────────────────────────────────
function history(days, hourShift = 0, level = 30) {
  const h = []
  for (let d = 1; d <= days; d++) for (let m = -90; m <= 90; m += 3) {
    h.push({ ts: NOW - d * DAY + m * 60000 + hourShift * 3600000, cpu: level + (m % 7), ram: 50 })
  }
  return h
}

test('baseline: needs samples on three earlier days around this hour, else no guess', () => {
  assert.strictEqual(T.baseline(history(2), 'cpu', NOW), null)
  const b = T.baseline(history(5), 'cpu', NOW)
  assert.ok(b && b.days === 5 && b.p25 <= b.p50 && b.p50 <= b.p75)
  assert.ok(b.p50 >= 27 && b.p50 <= 37)
  assert.strictEqual(T.baseline(history(5, 8), 'cpu', NOW), null, 'samples from another time of day do not describe this hour')
  assert.strictEqual(T.baseline([], 'cpu', NOW), null)
  assert.strictEqual(T.baseline(history(5), 'gpu', NOW), null, 'a field that was never recorded')
})

test('baseline: today never describes today', () => {
  const todayOnly = []
  for (let m = -60; m <= 0; m++) todayOnly.push({ ts: NOW + m * 60000, cpu: 40 })
  assert.strictEqual(T.baseline(todayOnly, 'cpu', NOW), null)
})

test('compare: high, normal, low against your normal', () => {
  const b = { p25: 20, p50: 30, p75: 40, days: 5, n: 100 }
  assert.deepStrictEqual(T.compare(90, b), { kind: 'high', ratio: 3 })
  assert.strictEqual(T.compare(35, b).kind, 'normal')
  assert.strictEqual(T.compare(45, b).kind, 'normal', 'a bit above is still normal')
  assert.strictEqual(T.compare(5, b).kind, 'low')
  assert.strictEqual(T.compare(50, null), null)
  assert.strictEqual(T.compare(NaN, b), null)
})

// ── narrator ────────────────────────────────────────────────────────────────────────
test('narrator: a missing reading comes first and says why', () => {
  assert.deepStrictEqual(T.narrate({ unavailable: { reason: 'needs-driver' }, spike: { ageS: 3, flag: { type: 'game' } } }), { key: 'nar_na', vars: { reason: 'needs-driver' } })
})

test('narrator: a spike names the process only when it was measured', () => {
  const sp = flag => T.narrate({ now: {}, spike: { ageS: 6, v: 97.4, flag } })
  assert.deepStrictEqual(sp({ type: 'process', name: 'MsMpEng', id: 'defender', value: 41.2 }), { key: 'nar_spikeBy', vars: { ago: 6, v: 97, name: 'MsMpEng', id: 'defender', share: 41 } })
  assert.strictEqual(sp({ type: 'spread', value: 6 }).key, 'nar_spikeSpread')
  assert.strictEqual(sp({ type: 'game' }).key, 'nar_spikeGame')
  assert.strictEqual(sp({ type: 'none' }).key, 'nar_spikeUnknown')
  assert.strictEqual(sp(null).key, 'nar_spikePending')
})

test('narrator: heat, then your normal, then calm', () => {
  assert.strictEqual(T.narrate({ now: { secondary: 92 }, ceiling: 95, cmp: { kind: 'high', ratio: 3 } }).key, 'nar_hot')
  assert.deepStrictEqual(T.narrate({ now: { secondary: 60 }, ceiling: 95, cmp: { kind: 'high', ratio: 3.2 } }), { key: 'nar_high', vars: { x: 3.2 } })
  assert.strictEqual(T.narrate({ now: {}, cmp: { kind: 'low', ratio: 0.2 } }).key, 'nar_low')
  assert.strictEqual(T.narrate({ now: {}, cmp: { kind: 'normal', ratio: 1 } }).key, 'nar_normal')
  assert.strictEqual(T.narrate({ now: {} }).key, 'nar_calm')
  assert.strictEqual(T.narrate(null).key, 'nar_calm')
})

// ── pins ────────────────────────────────────────────────────────────────────────────
test('pins: only the window, with their place along it', () => {
  const ev = [{ t: NOW - 30000, kind: 'game' }, { t: NOW - 90000, kind: 'change' }, { t: NOW - 5 * DAY, kind: 'restore' }, { t: NOW + 1000, kind: 'spike' }, { kind: 'change' }]
  const p = T.pinsIn(ev, NOW, 60000)
  assert.deepStrictEqual(p.map(e => e.kind), ['game'])
  assert.strictEqual(p[0].x, 0.5)
  assert.deepStrictEqual(T.pinsIn(ev, NOW, 7 * DAY).map(e => e.kind), ['restore', 'change', 'game'])
})

// ── processes ───────────────────────────────────────────────────────────────────────
test('processes: names are matched without .exe, #n or case; unknown stays unknown', () => {
  assert.strictEqual(Pr.describe('MsMpEng.exe#2'), 'defender')
  assert.strictEqual(Pr.describe('SearchIndexer'), 'indexer')
  assert.strictEqual(Pr.describe('msedgewebview2'), 'edge')
  assert.strictEqual(Pr.describe('SomethingWeNeverHeardOf'), null)
  assert.strictEqual(Pr.describe(null), null)
  const stems = Pr.IDS.flatMap(id => Pr.ENTRIES[id])
  assert.strictEqual(new Set(stems).size, stems.length, 'a stem belongs to exactly one entry')
})

test('processes: instances of one program add up, the heaviest comes first', () => {
  const out = 'chrome#1|12.5\nchrome#2|9\nchrome|4\nMsMpEng|20\nweird name|1\nbroken line\n|5\nx|NaN'
  const r = Pr.parseTop(out, 3)
  assert.deepStrictEqual(r.top.map(t => [t.name, t.value, t.id]), [['chrome', 25.5, 'chrome'], ['MsMpEng', 20, 'defender'], ['weird name', 1, null]])
  assert.strictEqual(r.total, 46.5)
  assert.deepStrictEqual(Pr.parseTop('', 3), { top: [], total: 0 })
})

test('processes: a flag is a process only when one clearly stands out', () => {
  const top = v => ({ ok: true, top: [{ name: 'x', id: null, value: v }] })
  assert.strictEqual(Pr.flagFor('cpu', top(41)).type, 'process')
  assert.strictEqual(Pr.flagFor('cpu', top(6)).type, 'spread')
  assert.strictEqual(Pr.flagFor('ram', top(800)).type, 'process')
  assert.strictEqual(Pr.flagFor('disk', top(500000)).type, 'spread')
  assert.strictEqual(Pr.flagFor('cpu', { ok: true, game: true }).type, 'game')
  assert.strictEqual(Pr.flagFor('cpu', { ok: false }).type, 'none')
  assert.strictEqual(Pr.flagFor('cpu', { ok: true, top: [] }).type, 'none')
  assert.strictEqual(Pr.flagFor('gpu', top(99)).type, 'spread', 'no threshold for a metric means no claim')
})
