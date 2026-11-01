const test = require('node:test')
const assert = require('node:assert')
const Odo = require('../js/ui4/odometer')
const Hold = require('../js/ui4/hold')
const World = require('../js/world')
const Chrono = require('../js/chronoline')
const Manifest = require('../lib/tweak-manifest.json')

test('odometer: columns are rebuilt only when the shape of the text changes', () => {
  assert.strictEqual(Odo.plan(null, '43°C').rebuild, true)
  assert.strictEqual(Odo.plan('43°C', '44°C').rebuild, false)
  assert.strictEqual(Odo.plan('99°C', '100°C').rebuild, true)          // a new digit column appears
  assert.strictEqual(Odo.plan('1.5 GB', '1.6 GB').rebuild, false)
  assert.strictEqual(Odo.plan('1.5 GB', 'Not available').rebuild, true)
  const p = Odo.plan(null, '7.5 GB')
  assert.deepStrictEqual(p.cells.map(c => c.digit), [7, null, 5, null, null, null])
})

test('hold: progress is clamped to 0..1', () => {
  assert.strictEqual(Hold.progress(0, 600), 0)
  assert.strictEqual(Hold.progress(300, 600), 0.5)
  assert.strictEqual(Hold.progress(9000, 600), 1)
  assert.strictEqual(Hold.progress(-5, 600), 0)
  assert.strictEqual(Hold.progress(10, 0), 1)
})

test('world: shots only for tabs about a part, everything else is the whole rig', () => {
  assert.strictEqual(World.shotFor('windows'), 'board')
  assert.strictEqual(World.shotFor('cleanup'), 'drive0')
  assert.strictEqual(World.shotFor('processes'), 'cpu')
  assert.strictEqual(World.shotFor('pulse'), null)
  assert.strictEqual(World.shotFor('toString'), null)                  // inherited keys are not tabs
})

test('world: every tweak in the manifest maps to a real part id', () => {
  const parts = new Set(['board', 'cpu', 'gpu', 'ram0', 'drive0'])
  for (const id of Object.keys(Manifest)) assert.ok(parts.has(World.partFor(id)), id)
  assert.strictEqual(World.partFor('game-dvr'), 'gpu')
  assert.strictEqual(World.partFor('mmcss'), 'cpu')
  assert.strictEqual(World.partFor('clean-temp'), 'drive0')
  assert.strictEqual(World.partFor('memory-compression'), 'ram0')
  assert.deepStrictEqual(World.partsFor(['game-dvr', 'disable-fso', 'mmcss']).sort(), ['cpu', 'gpu'])
})

test('chronoline: window, positions and recorded-only snapshots', () => {
  const now = 1_000_000_000_000, H = 3600e3, D = 24 * H
  assert.strictEqual(Chrono.span(now, null), 6 * H)
  assert.strictEqual(Chrono.span(now, now - 30 * D), 7 * D)           // never more than a week
  assert.ok(Chrono.span(now, now - H) >= 6 * H)
  assert.strictEqual(Chrono.pct(now, now - D, now), 100)
  assert.strictEqual(Chrono.pct(now - D, now - D, now), 0)
  assert.strictEqual(Chrono.pct(now - D / 2, now - D, now), 50)
  const samples = [{ ts: now - 10 * H, cpu: 20, ram: 40 }, { ts: now - 9 * H, cpu: 70, ram: 55 }]
  assert.strictEqual(Chrono.sampleAt(samples, now - 9 * H + 60e3).cpu, 70)
  assert.strictEqual(Chrono.sampleAt(samples, now - 5 * H), null)      // a gap stays a gap
  const snap = Chrono.snapshotFor(samples[1], 3)
  assert.deepStrictEqual(Object.keys(snap.s).sort(), ['cpu.load', 'ram.load'])   // temperatures were never recorded: none are invented
  assert.strictEqual(Chrono.snapshotFor(null, 1), null)
})

test('chronoline: journal entries collapse into one mark per batch', () => {
  const entries = [
    { id: 'a', batchId: 'B1', ts: 300, via: 'stage' }, { id: 'b', batchId: 'B1', ts: 290, via: 'stage' },
    { id: 'c', batchId: null, ts: 100, via: 'manual' },
  ]
  const m = Chrono.marks(entries)
  assert.strictEqual(m.length, 2)
  assert.deepStrictEqual(m.map(x => x.ts), [100, 300])                 // ascending
  assert.strictEqual(m[1].n, 2)
  assert.strictEqual(m[1].batchId, 'B1')
  assert.strictEqual(m[0].batchId, null)
})

test('callouts: plates sit on the window edges, level with their part, never overlapping', () => {
  const C = require('../js/callouts')
  const win = { left: 200, top: 100, right: 900, bottom: 420 }
  const anchors = [{ id: 'cpu', x: 480, y: 160 }, { id: 'gpu', x: 420, y: 170 }, { id: 'ram0', x: 600, y: 200 }, { id: 'drive0', x: 560, y: 380 }]
  const out = C.layout(anchors, win)
  assert.strictEqual(out.length, 4)
  for (const side of ['left', 'right']) {
    const col = out.filter(p => p.side === side).sort((a, b) => a.y - b.y)
    for (let i = 1; i < col.length; i++) assert.ok(col[i].y >= col[i - 1].y + C.SIZE.h, 'no overlap on ' + side)
    for (const p of col) assert.ok(p.y >= win.top && p.y + C.SIZE.h <= win.bottom, 'inside the window')
  }
  assert.strictEqual(out.find(p => p.id === 'cpu').side, 'left')
  assert.strictEqual(out.find(p => p.id === 'ram0').side, 'right')
  assert.ok(C.fits(win)); assert.ok(C.fits({ left: 0, top: 0, right: 480, bottom: 300 }) && C.sizeFor({ left: 0, right: 480 }).compact); assert.ok(!C.sizeFor(win).compact); assert.ok(!C.fits({ left: 0, top: 0, right: 400, bottom: 300 })); assert.ok(!C.fits({ left: 0, top: 0, right: 800, bottom: 200 }))
})

test('symptoms: plain words in English or Finnish find the right page', () => {
  const S = require('../js/symptoms')
  assert.deepStrictEqual(S.match('stutter').map(s => s.id), ['stutter'])
  assert.deepStrictEqual(S.match('high ping').map(s => s.id), ['ping'])
  assert.deepStrictEqual(S.match('tuuletin').map(s => s.id), ['hot'])
  assert.deepStrictEqual(S.match('x'), [])
  assert.deepStrictEqual(S.match(''), [])
  const R = require('../js/routes')
  for (const s of S.SYMPTOMS) assert.ok(R.resolve(s.page, s.tab), s.id)
})

test('share card: only recorded values are printed', () => {
  const C = require('../js/sharecard')
  const full = { durationSec: 3 * 3600 + 8 * 60, summary: { avgFps: 141.6, low1Fps: 95.2 }, series: { 'gpu0.temp.core': [60, null, 71, 66] } }
  assert.deepStrictEqual(C.stats(full), [{ value: '142', label: 'avg FPS' }, { value: '95', label: '1% low FPS' }, { value: '71°', label: 'GPU peak °C' }])
  const noTemp = { summary: { avgFps: 60, low1Fps: null }, series: { 'gpu0.temp.core': [null, null] } }
  assert.deepStrictEqual(C.stats(noTemp), [{ value: '60', label: 'avg FPS' }])   // no temperature recorded: no temperature on the card
  assert.deepStrictEqual(C.stats({}), [])
  assert.strictEqual(C.minutes({ durationSec: 3 * 3600 + 8 * 60 }), '3 h 08 min')
  assert.strictEqual(C.minutes({ durationSec: 1500 }), '25 min')
})

test('callouts: heat tint appears only with a reading above 40 C', () => {
  const C = require('../js/callouts')
  assert.strictEqual(C.heatColor(null), ''); assert.strictEqual(C.heatColor(35), ''); assert.strictEqual(C.heatColor(undefined), '')
  assert.ok(C.heatColor(70).startsWith('hsl('))
  assert.notStrictEqual(C.heatColor(50), C.heatColor(85))
})

test('chronoline: restore points from WMI or /Date()/ times', () => {
  assert.strictEqual(Chrono.parseRestoreTime('/Date(1761340800000)/'), 1761340800000)
  assert.strictEqual(Chrono.parseRestoreTime('20261024210000.000000-000'), new Date(2026, 9, 24, 21, 0, 0).getTime())
  assert.strictEqual(Chrono.parseRestoreTime('nonsense'), null)
  const m = Chrono.restoreMarks([{ SequenceNumber: 2, Description: 'b', CreationTime: '20261024210000.000000-000' }, { SequenceNumber: 1, Description: 'a', CreationTime: '20260930191500.000000-000' }, { SequenceNumber: 3, CreationTime: 'x' }])
  assert.deepStrictEqual(m.map(x => x.seq), [1, 2])   // ascending, unreadable times dropped
  assert.deepStrictEqual(Chrono.restoreMarks({ error: 'x' }), [])
})

test('toast: long names are shortened in the middle, games silence only confirmations, at most three show', () => {
  const T = require('../js/ui4/toast')
  assert.strictEqual(T.shorten('short'), 'short')
  const s = T.shorten('Restored: Disable Game DVR / Xbox Game Bar and a very long extra explanation of everything that happened', 40)
  assert.ok(s.length <= 40 && s.includes('…') && s.startsWith('Restored') && s.endsWith('happened'))
  assert.strictEqual(T.shorten(null), '')
  assert.strictEqual(T.quiet('ok', true), true)
  assert.strictEqual(T.quiet('err', true), false); assert.strictEqual(T.quiet('warn', true), false); assert.strictEqual(T.quiet('info', true), false)
  assert.strictEqual(T.quiet('ok', false), false)
  assert.deepStrictEqual(T.visibleSplit(2), { shown: 2, hidden: 0 })
  assert.deepStrictEqual(T.visibleSplit(5), { shown: 3, hidden: 2 })
})

test('replay recap: lowest second and steadiness come from recorded bins only', () => {
  const C = require('../js/sharecard')
  const bins = [90, 80, 25, 70, null, 65].map(fps => ({ fps }))
  const r = C.recap({ bins })
  assert.deepStrictEqual(r.dip, { fps: 25, at: 2 })
  assert.strictEqual(r.steadyPct, 80)                       // 4 of the 5 recorded seconds were >= 60
  assert.strictEqual(C.recap({ bins: [{ fps: 60 }] }), null)   // too short to say anything
  assert.strictEqual(C.recap({}), null)
  assert.strictEqual(C.clock(83), '1:23')
})

test('drive bar: fractions stay inside the drive and a missing value is zero', () => {
  const W = require('../js/world')
  assert.deepStrictEqual(W.driveFractions(500, 1000, 100), { used: 40, junk: 10, free: 50 })
  assert.deepStrictEqual(W.driveFractions(500, 1000, 900), { used: 0, junk: 50, free: 50 })   // junk cannot exceed what is used
  assert.deepStrictEqual(W.driveFractions(2000, 1000, 0), { used: 100, junk: 0, free: 0 })
  assert.deepStrictEqual(W.driveFractions(undefined, 0, undefined), { used: 0, junk: 0, free: 100 })
})
