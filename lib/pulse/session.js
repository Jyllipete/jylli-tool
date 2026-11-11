'use strict'
// Session debrief: turns a finished recorder session (lib/session-recorder.js) plus what Pulse knew about it (boost steps,
// the baseline taken when the boost started, marks, the previous session of the same game) into one small object the tab
// and the Cockpit render. Pure. Anything not measured stays null; nothing is invented.
;(function (root) {
  const isNode = typeof module !== 'undefined' && module.exports
  const Attr = isNode ? require('./attribution') : root.JylliPulseAttribution
  const Score = isNode ? require('./score') : root.JylliPulseScore
  const Frames = isNode ? require('./frames') : root.JylliPulseFrames

  const has = v => typeof v === 'number' && Number.isFinite(v)
  const nums = a => (a || []).filter(has)
  const clamp01 = v => Math.min(1, Math.max(0, v))
  const rnd1 = v => (has(v) ? Math.round(v * 10) / 10 : null)
  function med(a) { const s = nums(a).sort((x, y) => x - y); return s.length ? Frames.median(s) : null }
  function p95(a) { const s = nums(a).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] : null }

  /** Pacing over a whole session from its 1 s bins: how steady the per-second frame time is, and how many seconds hitched. */
  function pacing(bins, hitchSeconds) {
    const ms = (bins || []).filter(b => b && b.fps > 0).map(b => 1000 / b.fps)
    if (ms.length < 5) return null
    const m = Frames.median(ms.slice().sort((a, b) => a - b))
    const mad = Frames.median(ms.map(v => Math.abs(v - m)).sort((a, b) => a - b))
    const cv = mad / m
    const frac = hitchSeconds / ms.length
    return Math.round(100 * (0.5 * (1 - clamp01(cv / 0.2)) + 0.5 * (1 - clamp01(frac / 0.1))))
  }

  /** At most `n` points for the session list's mini river: { fps, maxMs } per slice. */
  function ribbon(bins, n) {
    const b = bins || []
    if (!b.length) return []
    const per = Math.max(1, Math.ceil(b.length / n)), out = []
    for (let i = 0; i < b.length; i += per) {
      const sl = b.slice(i, i + per).filter(x => x && x.fps > 0)
      out.push({ fps: sl.length ? rnd1(sl.reduce((s, x) => s + x.fps, 0) / sl.length) : null, maxMs: sl.length ? Math.max(...sl.map(x => x.maxMs)) : null })
    }
    return out
  }

  function medians(series) {
    const s = series || {}
    return { cpu: rnd1(med(s['cpu.load'])), gpu: rnd1(med(s['gpu0.load'])), ram: rnd1(med(s['ram.load'])), cpuTemp: rnd1(med(s['cpu.temp.package'])) }
  }

  /**
   * in: { session, boost: { steps: [{id, state}], baseline: {cpu,gpu,ram,cpuTemp}|null } | null, marks: [{sec, label}], previous: debrief|null }
   * -> { id, game, startedAt, durationSec, summary, hitches, net, causes, verdict, score, beforeAfter, vsLast, marks, ribbon }
   */
  function build(o) {
    const s = o.session
    const an = Attr.analyze(s)
    const hitchSeconds = an.hitches.reduce((n, h) => n + (h.endSec - h.startSec + 1), 0)
    const counts = {}
    for (const h of an.hitches) counts[h.primary] = (counts[h.primary] || 0) + 1
    const causes = Object.keys(counts).map(id => ({ id, hitches: counts[id] })).sort((a, b) => b.hitches - a.hitches)
    const steps = o.boost && Array.isArray(o.boost.steps) ? o.boost.steps : null
    const boostInfo = steps ? { ok: steps.filter(x => x.state === 'ok').length, total: steps.length } : null
    const ser = s.series || {}
    const sc = Score.compute({
      smoothness: pacing(s.bins, hitchSeconds), avgFps: s.summary && s.summary.avgFps, low1Fps: s.summary && s.summary.low1Fps,
      cpuTemp: p95(ser['cpu.temp.package']), gpuTemp: p95(ser['gpu0.temp.core']), boost: boostInfo,
    })
    const during = medians(ser)
    const base = o.boost && o.boost.baseline
    const beforeAfter = base ? { baseline: { cpu: base.cpu ?? null, gpu: base.gpu ?? null, ram: base.ram ?? null, cpuTemp: base.cpuTemp ?? null }, during } : null
    const prev = o.previous
    const vsLast = prev && prev.summary && s.summary ? {
      id: prev.id,
      avgFps: has(prev.summary.avgFps) && has(s.summary.avgFps) ? rnd1(s.summary.avgFps - prev.summary.avgFps) : null,
      low1Fps: has(prev.summary.low1Fps) && has(s.summary.low1Fps) ? rnd1(s.summary.low1Fps - prev.summary.low1Fps) : null,
      score: has(prev.score) && has(sc.score) ? sc.score - prev.score : null,
      hitches: (prev.hitches || []).length - an.hitches.length,
    } : null
    const dur = s.durationSec || 0
    const marks = (o.marks || []).filter(m => has(m.sec) && m.sec >= 0 && m.sec <= dur + 1).map(m => ({ sec: Math.round(m.sec), label: typeof m.label === 'string' ? m.label.slice(0, 40) : '' }))
    return {
      v: 1, id: s.id, game: s.game, startedAt: s.startedAt, durationSec: dur, summary: s.summary,
      hitches: an.hitches, net: an.net, medianMs: an.medianMs, hasTelemetry: an.hasTelemetry,
      causes, verdict: an.hitches.length === 0 ? 'clean' : causes[0].id,
      score: sc.score, scoreParts: sc.parts, scoreMissing: sc.missing,
      boost: boostInfo ? { ...boostInfo, steps: steps.map(x => ({ id: x.id, state: x.state })) } : null,
      beforeAfter, vsLast, marks, ribbon: ribbon(s.bins, 120),
    }
  }

  const api = { build, pacing, ribbon, medians }
  root.JylliPulseSession = api
  if (isNode) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
