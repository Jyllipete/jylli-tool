const test = require('node:test')
const assert = require('node:assert')
const os = require('os'), path = require('path'), fs = require('fs')
const FS = require('../lib/frame-stats')
const R = require('../lib/session-recorder')

test('frame stats: one definition of 1 % low (mean of the slowest 1 % of frames)', () => {
  const ft = [...Array(99).fill(10), 100]                 // 99 fast frames, one 100 ms hitch
  const s = FS.stats(ft)
  assert.ok(Math.abs(s.avgFps - 1000 / ((99 * 10 + 100) / 100)) < 1e-9)
  assert.strictEqual(s.low1Fps, 10)                       // slowest 1 % = the single 100 ms frame
  assert.strictEqual(FS.stats([10, 10]), null)            // too few frames to say anything
  assert.strictEqual(FS.bucket(1), 0); assert.strictEqual(FS.bucket(16.7), 8); assert.strictEqual(FS.bucket(500), FS.EDGES.length)
})

function session({ frames = 6000, frameMs = 16, gpu = 99, cpu = 40, temp = 70 } = {}) {
  const rec = R.createRecorder({ now: () => 1000 })
  rec.start({ gameId: 'g', gameName: 'G' })
  for (let i = 0; i < frames; i++) rec.onFrame(frameMs)
  for (let s = 0; s < Math.floor(frames * frameMs / 1000); s++) rec.onTelemetry({ 'gpu0.load': gpu, 'cpu.load': cpu, 'gpu0.temp.core': temp })
  return rec.finish()
}

test('recorder bins frames per second and keeps memory bounded', () => {
  const s = session({ frames: 3000, frameMs: 10 })
  assert.strictEqual(s.durationSec, 30)
  assert.strictEqual(s.bins.length, 30)
  assert.ok(Math.abs(s.bins[5].fps - 100) < 0.5)
  assert.strictEqual(s.summary.frames, 3000)
  assert.ok(JSON.stringify(s).length < 20000)              // 30 s of 100 fps is a few KB, not 3000 frame records
  assert.strictEqual(s.series['gpu0.temp.hotspot'].every(x => x === null), true)   // never recorded: stays null, not 0
})

test('too short sessions are discarded; telemetry gaps stay null', () => {
  const rec = R.createRecorder(); rec.start({ gameId: 'g' }); for (let i = 0; i < 50; i++) rec.onFrame(16)
  assert.strictEqual(rec.finish(), null)
  const r2 = R.createRecorder(); r2.start({ gameId: 'g' }); for (let i = 0; i < 500; i++) r2.onFrame(16)
  r2.onTelemetry({ 'cpu.load': 10 }); r2.onTelemetry({})
  const s = r2.finish()
  assert.deepStrictEqual(s.series['cpu.load'], [10, null])
})

test('advice: evidence-based and only from recorded data', () => {
  const a = R.advice(session({ gpu: 99, cpu: 40 }))
  assert.deepStrictEqual(a.map(x => x.id), ['gpu-bound'])
  assert.strictEqual(a[0].evidence.share, 100)
  const hot = R.advice(session({ gpu: 60, cpu: 40, temp: 90 }))
  assert.ok(hot.some(x => x.id === 'gpu-hot' && x.evidence.maxC === 90))
  const cpuB = R.advice(session({ gpu: 50, cpu: 95 }))
  assert.ok(cpuB.some(x => x.id === 'cpu-bound'))
  // no telemetry recorded -> no claims about load or heat
  const rec = R.createRecorder(); rec.start({ gameId: 'g' }); for (let i = 0; i < 3000; i++) rec.onFrame(16)
  assert.deepStrictEqual(R.advice(rec.finish()).filter(x => x.id !== 'stutter'), [])
})

test('stutter rule: 1 % low far below the average', () => {
  const rec = R.createRecorder(); rec.start({ gameId: 'g' })
  for (let i = 0; i < 3000; i++) rec.onFrame(i % 50 === 0 ? 80 : 8)    // 2 % of frames are 80 ms hitches
  assert.ok(R.advice(rec.finish()).some(x => x.id === 'stutter'))
})

test('storage: save, list, load (id validated), prune to the session cap', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sess-'))
  const s = session({ frames: 1000 })
  R.save(dir, s, fs, path)
  assert.strictEqual(R.list(dir, fs, path)[0].id, s.id)
  assert.strictEqual(R.load(dir, s.id, fs, path).id, s.id)
  assert.strictEqual(R.load(dir, '../../etc/passwd', fs, path), null)
  for (let i = 0; i < R.MAX_SESSIONS + 5; i++) { const x = session({ frames: 200 }); x.id = ('00000000000' + i.toString(16)).slice(-12); R.save(dir, x, fs, path) }
  assert.ok(R.list(dir, fs, path).length <= R.MAX_SESSIONS)
})
