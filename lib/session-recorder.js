'use strict'
// Game session recorder: frame times are streamed into 1 s bins plus a frame-time histogram (so memory stays bounded however long
// the game runs), telemetry is sampled once a second, and the finished session is saved to userData/sessions/<id>.json
// (at most 50 sessions or 20 MB). advice() turns a session into rule-based findings, each with the evidence behind it, and
// only from data that was actually recorded.
const FS = require('./frame-stats')
const crypto = require('crypto')

const TELEMETRY_KEYS = ['cpu.load', 'gpu0.load', 'cpu.temp.package', 'gpu0.temp.core', 'gpu0.temp.hotspot', 'gpu0.power', 'gpu0.clock.core', 'ram.load', 'bg.cpu']
const MAX_SESSIONS = 50
const MAX_BYTES = 20 * 1024 * 1024
const MAX_SECONDS = 4 * 3600

function createRecorder({ now = Date.now } = {}) {
  let cur = null

  function start({ gameId, gameName }) {
    cur = {
      v: 1, id: crypto.randomBytes(6).toString('hex'), game: { id: gameId, name: gameName || gameId }, startedAt: now(),
      t: 0,                                    // media time of the frame stream in ms
      bins: [],                                // { frames, sumMs, maxMs, worst: [] } per second
      hist: new Array(FS.EDGES.length + 1).fill(0), frames: 0, sumMs: 0,
      series: Object.fromEntries(TELEMETRY_KEYS.map(k => [k, []])), seconds: 0,
    }
  }

  function onFrame(ms) {
    if (!cur || !(ms > 0) || ms >= 1000) return
    const sec = Math.floor(cur.t / 1000)
    if (sec >= MAX_SECONDS) return
    while (cur.bins.length <= sec) cur.bins.push({ frames: 0, sumMs: 0, maxMs: 0 })
    const b = cur.bins[sec]
    b.frames++; b.sumMs += ms; if (ms > b.maxMs) b.maxMs = ms
    cur.t += ms; cur.frames++; cur.sumMs += ms; cur.hist[FS.bucket(ms)]++
  }

  /** values: { key: number|null }. Call about once a second. Missing keys stay null, never 0. */
  function onTelemetry(values) {
    if (!cur) return
    for (const k of TELEMETRY_KEYS) { const v = values[k]; cur.series[k].push(typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : null) }
    cur.seconds++
  }

  /** Approximate 1 % / 0.1 % lows from the histogram (bucket upper edges), so they need no per-frame storage. */
  function histLows(hist, frames) {
    const edgesUp = [...FS.EDGES, 400]
    const low = frac => {
      let need = Math.max(1, Math.ceil(frames * frac)), sum = 0, n = 0
      for (let i = hist.length - 1; i >= 0 && n < need; i--) { const take = Math.min(hist[i], need - n); const mid = i === 0 ? FS.EDGES[0] / 2 : (edgesUp[i - 1] + edgesUp[i]) / 2; sum += take * mid; n += take }
      return n ? 1000 / (sum / n) : null
    }
    return { low1Fps: low(0.01), low01Fps: low(0.001) }
  }

  function finish() {
    if (!cur) return null
    const c = cur; cur = null
    if (c.frames < 120) return null            // too short to say anything
    const lows = histLows(c.hist, c.frames)
    return {
      v: c.v, id: c.id, game: c.game, startedAt: c.startedAt, endedAt: now(), durationSec: Math.round(c.t / 1000),
      bins: c.bins.map(b => ({ fps: b.frames ? Math.round((1000 / (b.sumMs / b.frames)) * 10) / 10 : null, maxMs: Math.round(b.maxMs * 10) / 10, frames: b.frames })),
      series: c.series, seconds: c.seconds, hist: c.hist, edges: FS.EDGES,
      summary: { frames: c.frames, avgFps: Math.round((1000 / (c.sumMs / c.frames)) * 10) / 10, low1Fps: lows.low1Fps && Math.round(lows.low1Fps * 10) / 10, low01Fps: lows.low01Fps && Math.round(lows.low01Fps * 10) / 10 },
    }
  }

  return { start, onFrame, onTelemetry, finish, get active() { return !!cur } }
}

// ── storage ──────────────────────────────────────────────────────────────────────────
function save(dir, session, fs, path) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, session.id + '.json'), JSON.stringify(session))
  prune(dir, fs, path)
}
function listFiles(dir, fs, path) {
  try { return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => { const p = path.join(dir, f); const st = fs.statSync(p); return { f, p, size: st.size, t: st.mtimeMs } }).sort((a, b) => b.t - a.t) } catch { return [] }
}
function prune(dir, fs, path) {
  const files = listFiles(dir, fs, path)          // newest first
  let total = files.reduce((n, x) => n + x.size, 0)
  while (files.length && (files.length > MAX_SESSIONS || total > MAX_BYTES)) {
    const old = files.pop()                        // drop the oldest
    try { fs.unlinkSync(old.p); total -= old.size } catch {}
  }
}
function list(dir, fs, path) {
  return listFiles(dir, fs, path).map(x => { try { const s = JSON.parse(fs.readFileSync(x.p, 'utf8')); return { id: s.id, game: s.game, startedAt: s.startedAt, durationSec: s.durationSec, summary: s.summary, hasTelemetry: s.seconds > 0 } } catch { return null } }).filter(Boolean)
}
function load(dir, id, fs, path) {
  if (!/^[0-9a-f]{12}$/.test(String(id))) return null
  try { return JSON.parse(fs.readFileSync(path.join(dir, id + '.json'), 'utf8')) } catch { return null }
}

// ── advice ───────────────────────────────────────────────────────────────────────────
const pct = (xs, fn) => { const v = xs.filter(x => x != null); return v.length ? v.filter(fn).length / v.length : null }
const cover = xs => (xs.length ? xs.filter(x => x != null).length / xs.length : 0)

/** Rule-based findings. Each: { id, severity, evidence: {...numbers} }. A rule needs >= 80 % of the session covered by its inputs. */
function advice(s) {
  const out = []
  const g = s.series['gpu0.load'], c = s.series['cpu.load'], gt = s.series['gpu0.temp.hotspot'].some(x => x != null) ? s.series['gpu0.temp.hotspot'] : s.series['gpu0.temp.core']
  const ok = (...series) => series.every(x => cover(x) >= 0.8)
  if (ok(g, c)) {
    const gpuBound = pct(g.map((v, i) => (v != null && c[i] != null ? (v >= 95 && c[i] <= 60 ? 1 : 0) : null)), v => v === 1)
    if (gpuBound != null && gpuBound >= 0.8) out.push({ id: 'gpu-bound', severity: 'info', evidence: { share: Math.round(gpuBound * 100) } })
    const cpuBound = pct(c.map((v, i) => (v != null && g[i] != null ? (v >= 85 && g[i] <= 85 ? 1 : 0) : null)), v => v === 1)
    if (cpuBound != null && cpuBound >= 0.6) out.push({ id: 'cpu-bound', severity: 'info', evidence: { share: Math.round(cpuBound * 100) } })
  }
  if (ok(gt)) {
    const hot = pct(gt, v => v >= 85)
    if (hot != null && hot >= 0.3) out.push({ id: 'gpu-hot', severity: 'warn', evidence: { share: Math.round(hot * 100), maxC: Math.max(...gt.filter(x => x != null)) } })
  }
  const { avgFps, low1Fps } = s.summary
  if (avgFps && low1Fps && low1Fps < avgFps * 0.6) out.push({ id: 'stutter', severity: 'warn', evidence: { avgFps, low1Fps } })
  return out
}

module.exports = { createRecorder, save, list, load, prune, advice, TELEMETRY_KEYS, MAX_SESSIONS, MAX_BYTES }
