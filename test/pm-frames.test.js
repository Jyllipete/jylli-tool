const test = require('node:test')
const assert = require('node:assert')
const { createFrames } = require('../lib/pm-frames')

const HEADER = 'Application,ProcessID,PresentMode,MsBetweenPresents'
const row = (ms, mode = 'Hardware: Independent Flip') => `game.exe,1,${mode},${ms}`

// the reference: what parsePresentMonCsvFromBuffer in main.js computes from the raw lines
function legacy(buf) {
  const header = buf[0].split(',').map(h => h.trim())
  const msIdx = header.findIndex(h => /MsBetweenPresents|msFrameTime|msBetweenPresents/i.test(h))
  const xs = buf.slice(1).map(l => parseFloat(l.split(',')[msIdx])).filter(v => !isNaN(v) && v > 0 && v < 1000)
  if (xs.length < 10) return null
  xs.sort((a, b) => a - b)
  const n = xs.length, avg = a => a.reduce((s, v) => s + v, 0) / a.length, r = v => Math.round(v * 100) / 100
  return { mean: r(avg(xs)), p1Low: r(avg(xs.slice(Math.floor(n * 0.99)))), p01Low: r(avg(xs.slice(Math.floor(n * 0.999)))), samples: n }
}

test('stats match the old whole-buffer parser', () => {
  const f = createFrames()
  const lines = [HEADER]
  for (let i = 0; i < 500; i++) lines.push(row((6 + (i % 17) * 0.5 + (i % 97 === 0 ? 40 : 0)).toFixed(3)))
  for (const l of lines) f.pushLine(l)
  assert.deepStrictEqual(f.stats(), legacy(lines))
})

test('under ten frames is null, and a frame of 1000 ms or more is left out of the numbers', () => {
  const f = createFrames()
  f.pushLine(HEADER); for (let i = 0; i < 9; i++) f.pushLine(row(8))
  assert.strictEqual(f.stats(), null)
  f.pushLine(row(8)); f.pushLine(row(2500))
  assert.strictEqual(f.stats().samples, 10)
})

test('the ring keeps the newest frames once it is full', () => {
  const f = createFrames({ cap: 100 })
  f.pushLine(HEADER)
  for (let i = 1; i <= 250; i++) f.pushLine(row(i))
  assert.strictEqual(f.size, 100)
  const s = f.stats()
  assert.strictEqual(s.samples, 100)
  assert.strictEqual(s.mean, 200.5)     // frames 151..250
})

test('tail rows are the header plus the last rows, in order, also after wrapping', () => {
  const f = createFrames({ tailCap: 5 })
  f.pushLine(HEADER)
  for (let i = 1; i <= 8; i++) f.pushLine(row(i))
  const t = f.tailRows()
  assert.strictEqual(t[0], HEADER)
  assert.deepStrictEqual(t.slice(1).map(l => l.split(',')[3]), ['4', '5', '6', '7', '8'])
  assert.deepStrictEqual(f.tailRows(2).slice(1).map(l => l.split(',')[3]), ['7', '8'])
})

test('present modes are counted, reset clears everything, pushLine returns the frame time', () => {
  const f = createFrames()
  assert.strictEqual(f.pushLine(HEADER), 0)
  assert.strictEqual(f.pushLine(row(7.5)), 7.5)
  f.pushLine(row(7.5, 'Composed: Flip')); f.pushLine(row(7.5, 'Composed: Flip'))
  assert.deepStrictEqual(f.modes(), { 'Hardware: Independent Flip': 1, 'Composed: Flip': 2 })
  f.reset()
  assert.strictEqual(f.size, 0); assert.strictEqual(f.header, null); assert.deepStrictEqual(f.tailRows(), [])
})
