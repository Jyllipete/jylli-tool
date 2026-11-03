'use strict'
// UI sound palette, synthesised with WebAudio (no files). Off unless Settings "UI sounds" is on. At most one sound per 120 ms,
// about -24 dBFS at the peak, silent while the window is not focused or a game is running. spec() and canPlay() are pure and unit-tested.
;(function (root) {
  const PEAK = 0.063   // -24 dBFS

  // name -> list of tone segments { type, f0, f1, ms, lp?, at? (ms offset), gain? (0..1), attack? (ms) } or a noise click
  const SPECS = {
    tick: { segs: [{ type: 'sine', f0: 1200, f1: 1200, ms: 25 }] },
    apply: { segs: [{ type: 'sine', f0: 660, f1: 990, ms: 140 }] },
    undo: { segs: [{ type: 'sine', f0: 990, f1: 660, ms: 140 }] },
    warning: { segs: [{ type: 'square', f0: 220, f1: 220, ms: 180, lp: 600 }], gain: 0.7 },
    click: { noise: true, ms: 15 },
    // Arrival chimes: staggered sines, soft attack
    welcome: { segs: [
      { type: 'sine', f0: 659, f1: 659, ms: 260, at: 0, gain: 0.8, attack: 20 },
      { type: 'sine', f0: 831, f1: 831, ms: 260, at: 90, gain: 0.8, attack: 20 },
      { type: 'sine', f0: 988, f1: 988, ms: 300, at: 180, gain: 0.8, attack: 20 },
    ] },
    step: { segs: [{ type: 'sine', f0: 880, f1: 880, ms: 60, gain: 0.6, attack: 8 }] },
    ready: { segs: [{ type: 'sine', f0: 440, f1: 659, ms: 380, gain: 0.9, attack: 30 }] },
  }
  const spec = name => SPECS[name] || null

  /** Whether a sound may play now. last = timestamp of the previous sound. */
  function canPlay({ enabled, focused, gameRunning, now, last, minGapMs = 120 }) {
    return !!enabled && !!focused && !gameRunning && (last == null || now - last >= minGapMs)
  }

  let ctx = null, last = null
  function audio() {
    if (!ctx || ctx.state === 'closed') { try { ctx = new (root.AudioContext || root.webkitAudioContext)() } catch { return null } }
    return ctx
  }

  function play(name) {
    const s = spec(name)
    if (!s) return false
    const now = Date.now()
    const ok = canPlay({ enabled: !!(root.settings && root.settings.uiSounds), focused: typeof document !== 'undefined' && document.hasFocus(), gameRunning: !!(root._systemContext && root._systemContext.gameRunning), now, last })
    if (!ok) return false
    const a = audio(); if (!a) return false
    last = now
    try {
      const t0 = a.currentTime, out = a.createGain()
      out.gain.value = PEAK * (s.gain || 1); out.connect(a.destination)
      if (s.noise) {
        const len = Math.max(1, Math.round(a.sampleRate * s.ms / 1000)), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0)
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len)
        const src = a.createBufferSource(), bp = a.createBiquadFilter()
        bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 1.2
        src.buffer = buf; src.connect(bp); bp.connect(out); src.start(t0)
        return true
      }
      for (const seg of s.segs) {
        const o = a.createOscillator(), g = a.createGain()
        const ts = t0 + (seg.at || 0) / 1000, te = ts + seg.ms / 1000, atk = (seg.attack || 6) / 1000
        o.type = seg.type
        o.frequency.setValueAtTime(seg.f0, ts); if (seg.f1 !== seg.f0) o.frequency.linearRampToValueAtTime(seg.f1, te)
        g.gain.setValueAtTime(0.0001, ts); g.gain.exponentialRampToValueAtTime(seg.gain || 1, ts + atk); g.gain.exponentialRampToValueAtTime(0.0001, te)
        let node = g
        if (seg.lp) { const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = seg.lp; g.connect(f); node = f }
        o.connect(g); node.connect(out); o.start(ts); o.stop(te + 0.02)
      }
      return true
    } catch { return false }
  }

  const api = { play, spec, canPlay, PEAK }
  root.JylliSound = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
