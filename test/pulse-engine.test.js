'use strict'
const test = require('node:test')
const assert = require('node:assert')
const F = require('../lib/pulse/frames')
const FS = require('../lib/frame-stats')
const L = require('../lib/pulse/limiter')
const S = require('../lib/pulse/score')
const R = require('../lib/pulse/river')
const A = require('../lib/pulse/attribution')
const Sess = require('../lib/pulse/session')
const Pre = require('../lib/pulse/preflight')
const Fivem = require('../lib/fivem/attribution')
const Steps = require('../lib/pulse/steps')

const steady = (n, ms = 8) => new Array(n).fill(ms)

// ── frames ───────────────────────────────────────────────────────────────────────
test('frames: avg and lows match lib/frame-stats.js', () => {
  const a = steady(300).map((v, i) => (i % 40 === 0 ? 30 : v))
  const mine = F.stats(a), ref = FS.stats(a)
  assert.ok(Math.abs(mine.avgFps - ref.avgFps) < 1e-9)
  assert.ok(Math.abs(mine.low1Fps - ref.low1Fps) < 1e-9)
  assert.ok(Math.abs(mine.low01Fps - ref.low01Fps) < 1e-9)
})

test('frames: fewer than 10 usable frames is null, never a number', () => {
  assert.equal(F.stats(steady(9)), null)
  assert.equal(F.stats([...steady(5), 0, -1, 5000, NaN, Infinity]), null)
})

test('frames: a steady game paces near 100, a stuttering one far lower', () => {
  assert.ok(F.stats(steady(300)).smoothness >= 95)
  const bad = steady(300).map((v, i) => (i % 5 === 0 ? 40 : v))
  assert.ok(F.stats(bad).smoothness < F.stats(steady(300)).smoothness - 25)
})

test('frames: the ring keeps the latest frames, oldest first', () => {
  const r = F.createRing(4)
  for (let i = 1; i <= 6; i++) r.push(i)
  assert.deepEqual(r.last(), [3, 4, 5, 6])
  assert.deepEqual(r.last(2), [5, 6])
  assert.equal(r.size, 4)
})

test('frames: columns cover 250 ms of frame time and keep the slowest frame', () => {
  const c = F.createColumns()
  for (let i = 0; i < 60; i++) c.push(i === 10 ? 50 : 10)    // about 0.64 s
  const v = c.view()
  assert.ok(v.length >= 2)
  assert.equal(Math.max(...v.map(x => x.hi)), 50)
  assert.ok(v[0].lo <= v[0].med && v[0].med <= v[0].hi)
})

test('frames: columns are capped at 60 s and a bad frame is ignored', () => {
  const c = F.createColumns({ cap: 8 })
  c.push(NaN); c.push(0); c.push(2000)
  assert.equal(c.view().length, 0)
  for (let i = 0; i < 2000; i++) c.push(10)
  assert.ok(c.view().length <= 9)
})

// ── attribution ──────────────────────────────────────────────────────────────────
test('attribution: FiveM still gets the same module, and the hitch limit is shared', () => {
  assert.equal(Fivem, A)
  assert.equal(A.hitchLimit(null), null)
  assert.equal(A.hitchLimit(8), 60)
  assert.equal(A.hitchLimit(30), 120)
})

test('attribution: a background process spike is named when it explains the hitch, between ram and gpu', () => {
  const bins = steady(30).map(() => ({ fps: 120, maxMs: 9, frames: 120 })); bins[15] = { fps: 100, maxMs: 120, frames: 100 }
  const bg = new Array(30).fill(2); bg[15] = 60
  const a = A.analyze({ bins, seconds: 30, series: { 'bg.cpu': bg, 'gpu0.load': new Array(30).fill(99) } })
  assert.equal(a.hitches[0].primary, 'background-spike')
  assert.deepEqual(a.hitches[0].causes, ['background-spike', 'gpu-bound'])
})

// ── limiter ──────────────────────────────────────────────────────────────────────
const base = { fps: 100, medianMs: 10, p99Ms: 14, jitter: 0.1, cpu: 50, gpu: 70 }
test('limiter: no frames is idle', () => assert.equal(L.judge(null).id, 'idle'))
test('limiter: thermal outranks load', () => assert.equal(L.judge({ ...base, gpu: 99, gpuTemp: 90 }).id, 'thermal'))
test('limiter: saturated GPU with idle CPU is gpu-bound, saturated CPU is cpu-bound', () => {
  assert.equal(L.judge({ ...base, gpu: 99, cpu: 40 }).id, 'gpu')
  const c = L.judge({ ...base, cpu: 95, gpu: 80 })
  assert.equal(c.id, 'cpu'); assert.deepEqual(c.suggest, { kind: 'tab', target: 'boost' })
})
test('limiter: a background hog and full RAM point at Game Shield', () => {
  assert.deepEqual(L.judge({ ...base, bg: 50 }).suggest, { kind: 'rule', target: 'gameshield' })
  assert.equal(L.judge({ ...base, ram: 95 }).id, 'ram')
})
test('limiter: steady frames on a common cap read as capped, otherwise balanced', () => {
  assert.deepEqual(L.judge({ fps: 60.4, medianMs: 16.6, p99Ms: 17, jitter: 0.01, cpu: 30, gpu: 50 }).evidence, { capHz: 60 })
  assert.equal(L.judge({ ...base, jitter: 0.12 }).id, 'balanced')
})
test('limiter: a missing sensor never produces a verdict from nothing', () => {
  assert.equal(L.judge({ fps: 100, medianMs: 10, cpu: null, gpu: null }).id, 'balanced')
})

// ── score ────────────────────────────────────────────────────────────────────────
test('score: parts that were not measured are left out and the rest renormalised', () => {
  const full = S.compute({ smoothness: 80, avgFps: 100, low1Fps: 85, cpuTemp: 70, boost: { ok: 8, total: 8 } })
  assert.ok(full.score > 800 && full.score <= 1000)
  const none = S.compute({})
  assert.equal(none.score, null)
  assert.equal(none.missing.length, 4)
  assert.equal(S.compute({ cpuTemp: 40, boost: { ok: 8, total: 8 } }).score, null)   // cool and boosted, but no frames: no score
  const onlySmooth = S.compute({ smoothness: 50 })
  assert.equal(onlySmooth.score, 500)
})
test('score: heat and a collapsing 1 % low pull the score down', () => {
  const a = S.compute({ smoothness: 90, avgFps: 100, low1Fps: 90, cpuTemp: 60 }).score
  const b = S.compute({ smoothness: 90, avgFps: 100, low1Fps: 30, cpuTemp: 94 }).score
  assert.ok(b < a - 150)
  assert.equal(S.tone(null), 'idle'); assert.equal(S.tone(850), 'ok'); assert.equal(S.tone(650), 'warn'); assert.equal(S.tone(200), 'danger')
})

// ── river geometry ───────────────────────────────────────────────────────────────
function cols(n, med = 8, hiAt = {}) { return Array.from({ length: n }, (_, i) => ({ t: i * 250, n: 30, med, lo: med - 1, hi: hiAt[i] || med + 2 })) }
test('river: new columns enter at the right edge and points stay inside the box', () => {
  const sh = R.shape(cols(100), 600, 120)
  assert.equal(sh.mid.length, 100)
  assert.ok(Math.abs(sh.mid[99].x - 596) < 1e-9)
  assert.ok(sh.mid[0].x < sh.mid[99].x)
  for (const p of [...sh.mid, ...sh.hi, ...sh.lo]) assert.ok(p.x >= 0 && p.x <= 600 && p.y >= 0 && p.y <= 120)
  assert.ok(sh.hi[0].y <= sh.lo[0].y)
})
test('river: a column with a long frame is a hitch, and uses the debrief limit', () => {
  const sh = R.shape(cols(100, 8, { 40: 90 }), 600, 120)
  assert.equal(sh.limit, 60)
  assert.deepEqual(sh.hitches.map(h => h.i), [40])
  assert.equal(R.hitchIndexes(cols(50)).idx.length, 0)
})
test('river: empty input, bezier and hover lookups are safe', () => {
  const sh = R.shape([], 600, 120)
  assert.equal(sh.n, 0); assert.equal(R.nearest(sh, 100), -1); assert.deepEqual(R.bezier([]), [])
  const seg = R.bezier([{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 0 }])
  assert.equal(seg.length, 2); assert.equal(seg[1].x, 20)
  const s2 = R.shape(cols(100), 600, 120)
  assert.equal(R.nearest(s2, 596), 99); assert.equal(R.nearest(s2, -50), 0)
})

// ── debrief ──────────────────────────────────────────────────────────────────────
function recorded(over) {
  const bins = steady(60).map(() => ({ fps: 120, maxMs: 9, frames: 120 }))
  bins[30] = { fps: 90, maxMs: 120, frames: 90 }
  return { id: 'aabbccddeeff', game: { id: 'valorant', name: 'Valorant' }, startedAt: 1000, durationSec: 60, bins, seconds: 60,
    series: { 'cpu.load': new Array(60).fill(40), 'gpu0.load': new Array(60).fill(99), 'cpu.temp.package': new Array(60).fill(70), 'gpu0.temp.core': new Array(60).fill(65), 'ram.load': new Array(60).fill(60) },
    summary: { frames: 7000, avgFps: 118, low1Fps: 70, low01Fps: 40 }, ...over }
}
test('debrief: hitches, causes, verdict, score and marks are built from the session', () => {
  const d = Sess.build({ session: recorded(), boost: { steps: [{ id: 'a', state: 'ok' }, { id: 'b', state: 'skip' }], baseline: { cpu: 20, gpu: 5, ram: 70, cpuTemp: 50 } }, marks: [{ sec: 30, label: 'stutter' }, { sec: 999, label: 'late' }], previous: null })
  assert.equal(d.hitches.length, 1)
  assert.equal(d.verdict, 'gpu-bound')
  assert.deepEqual(d.causes, [{ id: 'gpu-bound', hitches: 1 }])
  assert.equal(d.marks.length, 1)
  assert.ok(d.score > 0 && d.score <= 1000)
  assert.deepEqual(d.beforeAfter.during, { cpu: 40, gpu: 99, ram: 60, cpuTemp: 70 })
  assert.deepEqual(d.boost, { ok: 1, total: 2, steps: [{ id: 'a', state: 'ok' }, { id: 'b', state: 'skip' }] })
  assert.ok(d.ribbon.length <= 120)
})
test('debrief: no boost, no baseline and no previous session are null, not zero', () => {
  const d = Sess.build({ session: recorded(), boost: null, marks: [], previous: null })
  assert.equal(d.boost, null); assert.equal(d.beforeAfter, null); assert.equal(d.vsLast, null)
  assert.ok(d.scoreMissing.includes('boost'))
})
test('debrief: compares with the previous session of the game', () => {
  const prev = Sess.build({ session: recorded({ id: '111111111111', summary: { frames: 7000, avgFps: 100, low1Fps: 50, low01Fps: 30 } }), boost: null, marks: [], previous: null })
  const d = Sess.build({ session: recorded(), boost: null, marks: [], previous: prev })
  assert.equal(d.vsLast.avgFps, 18); assert.equal(d.vsLast.low1Fps, 20); assert.equal(d.vsLast.hitches, 0)
})
test('debrief: a clean session says clean, and one without telemetry still builds', () => {
  const clean = recorded({ bins: steady(60).map(() => ({ fps: 120, maxMs: 9, frames: 120 })) })
  assert.equal(Sess.build({ session: clean, boost: null, marks: [], previous: null }).verdict, 'clean')
  const none = recorded({ seconds: 0, series: {} })
  assert.equal(Sess.build({ session: none, boost: null, marks: [], previous: null }).hasTelemetry, false)
})

// ── preflight ────────────────────────────────────────────────────────────────────
test('preflight: unknown stays unknown, and fixes exist only where Pulse has an action', () => {
  const r = Pre.evaluate(null)
  assert.equal(r.state, 'unknown'); assert.ok(r.items.every(i => i.state === 'unknown' && i.fix === null))
  const p = Pre.evaluate({ cpuTemp: 92, ramPct: 78, topProc: { name: 'chrome', cpu: 40 }, updateActive: true, powerPlan: { name: 'Balanced', high: false }, pendingReboot: true })
  const by = id => p.items.find(i => i.id === id)
  assert.equal(p.state, 'bad')
  assert.equal(by('thermal').state, 'bad'); assert.equal(by('thermal').fix, null)
  assert.deepEqual(by('ram').fix, { kind: 'rule', target: 'gameshield' })
  assert.deepEqual(by('updates').fix, { kind: 'rule', target: 'updateguard' })
  assert.deepEqual(by('power').fix, { kind: 'boost' })
  assert.equal(by('reboot').fix, null)
})
test('preflight: a healthy machine is ok', () => {
  const r = Pre.evaluate({ cpuTemp: 50, ramPct: 40, topProc: { name: 'x', cpu: 3 }, updateActive: false, powerPlan: { name: 'High performance', high: true }, pendingReboot: false })
  assert.equal(r.state, 'ok')
})

// ── boost steps ──────────────────────────────────────────────────────────────────
test('steps: every line activatePulse logs maps to a named step, and anything else is ignored', () => {
  assert.deepEqual(Steps.stepOf('  Timer resolution → 0.5ms', 'ok'), { id: 'timer', state: 'ok', detail: 'Timer resolution → 0.5ms' })
  assert.equal(Steps.stepOf('  Core unparking skipped (laptop — battery/heat safety)', 'info').state, 'skip')
  assert.equal(Steps.stepOf('  CPU core parking disabled', 'ok').id, 'parking')
  assert.equal(Steps.stepOf('  Power plan → High Performance', 'ok').id, 'power')
  assert.equal(Steps.stepOf('  MMCSS Games scheduling → High (SystemResponsiveness=10, 8 cores)', 'ok').id, 'mmcss')
  assert.equal(Steps.stepOf('  Interrupt affinity routed for 2 device(s) → CPU 3', 'ok').id, 'affinity')
  assert.equal(Steps.stepOf('  Stopped: discord', 'ok').id, 'kill')
  assert.equal(Steps.stepOf('  Game process not found yet — priority will apply when game launches', 'info').id, 'priority')
  assert.equal(Steps.stepOf('  3 background process(es) deprioritised', 'ok').id, 'deprio')
  assert.equal(Steps.stepOf('◆ Pulse active — Valorant', 'head'), null)
  assert.equal(Steps.IDS.length, 8)
})

test('attribution: one instant of telemetry gets the same causes and order as a recorded second', () => {
  assert.deepEqual(A.sampleCauses({ gpu: 99, cpu: 95, gpuTemp: 90 }), ['thermal', 'gpu-bound', 'cpu-bound'])
  assert.deepEqual(A.sampleCauses({ bg: 50, ram: 95 }), ['ram-pressure', 'background-spike'])
  assert.deepEqual(A.sampleCauses({}), [])
  assert.deepEqual(A.sampleCauses({ vramUsed: 7900, vramTotal: 8000, clock: 1400, baseClock: 1900 }), ['vram-full', 'clock-drop'])
})
