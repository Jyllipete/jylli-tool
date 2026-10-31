'use strict'
// Speed test against Cloudflare's public test endpoints. Runs in main, only when the user starts it. 4-6 parallel streams, the
// first second of each phase is discarded (TCP ramp-up), capped at about 10 s or 250 MB per phase. Results carry the real
// Cloudflare colo from the response headers and unloaded latency/jitter measured with small requests. The maths is pure and
// unit-tested; network I/O is injected as `fetchChunked(url, opts)` so a fake can stand in.

const BASE = 'https://speed.cloudflare.com'
const MAX_BYTES = 250 * 1024 * 1024
const MAX_MS = 10000
const DISCARD_MS = 1000

/** samples: [{ t (ms since phase start), bytes (cumulative, all streams) }] -> Mbit/s over the window after the discard. */
function mbps(samples, discardMs = DISCARD_MS) {
  const usable = samples.filter(s => s.t >= discardMs)
  if (usable.length < 2) return null
  const a = usable[0], b = usable[usable.length - 1]
  const dt = (b.t - a.t) / 1000
  if (dt <= 0) return null
  return ((b.bytes - a.bytes) * 8) / dt / 1e6
}

const median = xs => { if (!xs.length) return null; const s = xs.slice().sort((p, q) => p - q); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
/** Mean absolute difference between consecutive latencies, the usual jitter definition. */
const jitter = xs => { if (xs.length < 2) return null; let d = 0; for (let i = 1; i < xs.length; i++) d += Math.abs(xs[i] - xs[i - 1]); return d / (xs.length - 1) }

function latencyStats(times) {
  const ok = times.filter(x => Number.isFinite(x))
  return { ms: median(ok), jitterMs: jitter(ok), samples: ok.length }
}

/** colo from Cloudflare headers: "cf-meta-colo: AMS", or the airport code at the end of cf-ray. */
function coloFrom(headers) {
  const h = k => { const v = headers && (headers[k] || headers[k.toLowerCase()]); return Array.isArray(v) ? v[0] : v }
  const c = h('cf-meta-colo') || h('cf-colo')
  if (c) return String(c).toUpperCase()
  const ray = h('cf-ray')
  const m = ray && String(ray).match(/-([A-Z]{3})$/)
  return m ? m[1] : null
}

/**
 * deps.fetchChunked(url, { method, body, onChunk(bytes), signal }) -> Promise<{ headers }>.  onChunk receives byte counts.
 * deps.now() -> ms.  deps.latencyProbe() -> Promise<ms|null>.
 * opts: { streams, maxMs, maxBytes, onProgress({phase, mbps}) }
 */
async function run(deps, opts = {}) {
  const streams = Math.min(6, Math.max(4, opts.streams || 4))
  const maxMs = opts.maxMs || MAX_MS, maxBytes = opts.maxBytes || MAX_BYTES
  const out = { ok: true, colo: null, downMbps: null, upMbps: null, latency: null, loadedLatency: null, startedAt: deps.now() }

  const unloaded = []
  for (let i = 0; i < 8; i++) unloaded.push(await deps.latencyProbe())
  out.latency = latencyStats(unloaded)

  async function phase(kind) {
    const t0 = deps.now(), samples = []
    let total = 0, stop = false
    const loaded = []
    const abort = new AbortController()
    const tick = () => { const t = deps.now() - t0; samples.push({ t, bytes: total }); if (opts.onProgress) opts.onProgress({ phase: kind, mbps: mbps(samples, opts.discardMs ?? DISCARD_MS) ?? 0, t }); if (t >= maxMs || total >= maxBytes) { stop = true; abort.abort() } }
    const timer = setInterval(tick, 250)
    const probe = setInterval(async () => { if (!stop) { const v = await deps.latencyProbe(); if (v != null) loaded.push(v) } }, 1000)
    const one = async () => {
      while (!stop) {
        const url = kind === 'down' ? `${BASE}/__down?bytes=${25 * 1024 * 1024}` : `${BASE}/__up`
        try {
          const r = await deps.fetchChunked(url, { method: kind === 'down' ? 'GET' : 'POST', uploadBytes: kind === 'up' ? 4 * 1024 * 1024 : 0, onChunk: n => { total += n }, signal: abort.signal })
          if (!out.colo && r && r.headers) out.colo = coloFrom(r.headers)
        } catch { if (stop) break; await new Promise(r => setTimeout(r, 100)) }
      }
    }
    await Promise.all(Array.from({ length: streams }, one))
    clearInterval(timer); clearInterval(probe)
    tick()
    return { value: mbps(samples, opts.discardMs ?? DISCARD_MS), loaded, bytes: total }
  }

  const down = await phase('down')
  out.downMbps = down.value
  out.loadedLatency = latencyStats(down.loaded)
  const up = await phase('up')
  out.upMbps = up.value
  out.finishedAt = deps.now()
  out.bytes = down.bytes + up.bytes
  if (out.downMbps == null && out.upMbps == null) out.ok = false
  return out
}

module.exports = { run, mbps, jitter, median, latencyStats, coloFrom, BASE, MAX_BYTES, MAX_MS }
