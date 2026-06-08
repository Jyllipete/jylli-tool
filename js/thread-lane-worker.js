// thread-lane-worker.js — reads one CPU core's thread activity from SharedArrayBuffer
// Spawned by thread-mapper.js — one worker per logical core
// SAB layout: Int32 slot 0 = thread count, then 4 slots per thread:
//   [tid, currentCpu, cpuPct*100, reserved]

self.onmessage = function({ data: { sab, coreIndex } }) {
  const view = new Int32Array(sab)
  setInterval(() => {
    const count = Atomics.load(view, 0)
    const threads = []
    for (let i = 0; i < count && i < 255; i++) {
      const base   = (i + 1) * 4
      const tid    = Atomics.load(view, base + 0)
      const cpu    = Atomics.load(view, base + 1)
      const cpuPct = Atomics.load(view, base + 2) / 100
      if (cpu === coreIndex && tid > 0) threads.push({ tid, cpuPct })
    }
    self.postMessage({ coreIndex, threads })
  }, 100)
}
