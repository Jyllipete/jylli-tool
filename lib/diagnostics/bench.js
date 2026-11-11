'use strict'
// Benchmarks: fixed amounts of work, timed. CPU and memory run in worker threads (the UI never stalls), disk on a temp file that is
// always deleted. Scores are points against REF (1000 = the reference PC, see docs/DIAGNOSTICS_EVIDENCE.md): twice as fast = 2000.
// Workers are created from a source string, not a file, so the asar package needs no extra unpack rule.
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const fsp = require('fs/promises')
const { Worker } = require('worker_threads')

// Reference throughput (what scores 1000): measured once on a Core i5-1135G7 laptop (4C/8T, NVMe), see the evidence doc.
const REF = { cpu1: 55000, cpuN: 200000, mem: 7000000, seqWrite: 150, seqRead: 2600, rand4k: 27000 }
const MB = 1024 * 1024

const WORKER_SRC = String.raw`
const { parentPort, workerData } = require('worker_threads')
function kernel(iters) {
  let a = 1, f = 0.5, h = 2166136261 >>> 0
  const sieve = new Uint8Array(4096)
  for (let i = 0; i < iters; i++) {
    a = (a * 1664525 + 1013904223) >>> 0
    f = f * 1.0000001 + Math.sin(i & 1023) * 0.000001
    h = Math.imul(h ^ (a & 255), 16777619) >>> 0
    sieve[a & 4095] ^= 1
  }
  return h ^ ((f * 1e6) | 0)
}
function mem(bytes, rounds) {
  const src = Buffer.alloc(bytes, 7), dst = Buffer.alloc(bytes)
  src.copy(dst)
  for (let r = 0; r < rounds; r++) src.copy(dst)
  return dst[bytes >> 1]
}
const t0 = process.hrtime.bigint()
const sink = workerData.kind === 'mem' ? mem(workerData.bytes, workerData.rounds) : kernel(workerData.iters)
const ms = Number(process.hrtime.bigint() - t0) / 1e6
parentPort.postMessage({ ms, sink })
`

function runWorker(data, signal) {
  return new Promise((resolve, reject) => {
    const w = new Worker(WORKER_SRC, { eval: true, workerData: data })
    const stop = () => { w.terminate(); reject(new Error('aborted')) }
    if (signal) { if (signal.aborted) return stop(); signal.addEventListener('abort', stop, { once: true }) }
    w.once('message', m => resolve(m))
    w.once('error', reject)
  })
}

const pts = (v, ref) => Math.max(0, Math.round(v / ref * 1000))
const median = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }

/** opts.scale shrinks every workload (tests). Returns { ops/ms, points }. */
async function cpuSingle(opts) {
  const iters = Math.round(40e6 * opts.scale), runs = []
  for (let i = 0; i < opts.runs; i++) { const r = await runWorker({ kind: 'cpu', iters }, opts.signal); runs.push(iters / r.ms) }
  const v = median(runs)
  return { value: v, unit: 'ops/ms', points: pts(v, REF.cpu1) }
}

async function cpuMulti(opts) {
  const n = Math.max(1, (os.cpus() || []).length), iters = Math.round(25e6 * opts.scale), runs = []
  for (let i = 0; i < opts.runs; i++) {
    const t0 = process.hrtime.bigint()
    await Promise.all(Array.from({ length: n }, () => runWorker({ kind: 'cpu', iters }, opts.signal)))
    runs.push(n * iters / (Number(process.hrtime.bigint() - t0) / 1e6))
  }
  const v = median(runs)
  return { value: v, unit: 'ops/ms', threads: n, points: pts(v, REF.cpuN) }
}

async function memory(opts) {
  const bytes = Math.max(MB, Math.round(64 * MB * opts.scale)), rounds = Math.max(2, Math.round(24 * opts.scale)), runs = []
  for (let i = 0; i < opts.runs; i++) { const r = await runWorker({ kind: 'mem', bytes, rounds }, opts.signal); runs.push(bytes * rounds / r.ms) }
  const v = median(runs)
  return { value: v, unit: 'bytes/ms', points: pts(v, REF.mem) }
}

/** Sequential write (fsync'd), sequential read, 4K random read at queue depth 1. The file is deleted whatever happens. */
async function disk(opts) {
  const size = Math.max(4 * MB, Math.round(512 * MB * opts.scale)), chunk = 4 * MB
  const file = path.join(opts.dir, 'jt_bench.tmp')
  const buf = crypto.randomBytes(chunk)
  let fh = null
  try {
    fh = await fsp.open(file, 'w+')
    let t0 = process.hrtime.bigint()
    for (let off = 0; off < size; off += chunk) {
      if (opts.signal && opts.signal.aborted) throw new Error('aborted')
      await fh.write(buf, 0, Math.min(chunk, size - off), off)
    }
    await fh.sync()
    const seqWrite = size / MB / (Number(process.hrtime.bigint() - t0) / 1e9)

    t0 = process.hrtime.bigint()
    const rb = Buffer.allocUnsafe(chunk)
    for (let off = 0; off < size; off += chunk) {
      if (opts.signal && opts.signal.aborted) throw new Error('aborted')
      await fh.read(rb, 0, Math.min(chunk, size - off), off)
    }
    const seqRead = size / MB / (Number(process.hrtime.bigint() - t0) / 1e9)

    const n = Math.max(200, Math.round(3000 * opts.scale)), small = Buffer.allocUnsafe(4096), slots = Math.floor(size / 4096)
    t0 = process.hrtime.bigint()
    for (let i = 0; i < n; i++) {
      if (opts.signal && opts.signal.aborted) throw new Error('aborted')
      await fh.read(small, 0, 4096, crypto.randomInt(0, slots) * 4096)
    }
    const sec = Number(process.hrtime.bigint() - t0) / 1e9
    const rand4k = n / sec
    const p = [pts(seqWrite, REF.seqWrite), pts(seqRead, REF.seqRead), pts(rand4k, REF.rand4k)]
    return { value: { seqWrite, seqRead, rand4k, latencyUs: sec / n * 1e6 }, unit: 'MB/s | IOPS', points: Math.round(p.reduce((a, b) => a + b, 0) / p.length), parts: p,
      // Node cannot bypass the Windows file cache, so a read of a freshly written file can be inflated. Said out loud in the UI.
      cached: true }
  } finally {
    try { if (fh) await fh.close() } catch { /* already closed */ }
    try { await fsp.unlink(file) } catch { /* never created, or already gone */ }
  }
}

const KINDS = { cpu1: cpuSingle, cpuN: cpuMulti, mem: memory, disk }

/**
 * run(kinds, { dir, scale, runs, signal, onProgress }) -> { ts, cpu, points: { cpu1, cpuN, mem, disk }, detail }.
 * Kinds run one after another (a parallel run would measure the benchmarks against each other).
 */
async function run(kinds, o = {}) {
  const want = (kinds && kinds.length ? kinds : Object.keys(KINDS)).filter(k => KINDS[k])
  const opts = { dir: o.dir || os.tmpdir(), scale: o.scale || 1, runs: o.runs || 3, signal: o.signal }
  const res = { ts: (o.now || Date.now)(), cpu: ((os.cpus() || [])[0] || {}).model || '', points: {}, detail: {} }
  for (let i = 0; i < want.length; i++) {
    const k = want[i]
    if (o.onProgress) o.onProgress({ kind: k, phase: 'start', index: i, count: want.length })
    const r = await KINDS[k](opts)
    res.points[k] = r.points
    res.detail[k] = r
    if (o.onProgress) o.onProgress({ kind: k, phase: 'done', index: i, count: want.length, points: r.points })
  }
  return res
}

module.exports = { run, KINDS, REF, WORKER_SRC }
