// Pure timeline for the release video (UMD: node tests + browser). No DOM, no clock: everything is a function of t (seconds).
//   build(beats, scenes) -> { scenes, sample(t, opts), camera(scene, bt, opts), duration, at(pos) }
// Positions are "bar.beat" strings ('28.0' = bar 28, beat 0) and are converted with beats.json (bpm, offset) so retiming a new
// track = re-run analyze.js and edit bar numbers in scenes.js. Nothing here knows an absolute second.
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory()
  else root.PromoTimeline = factory()
})(typeof self !== 'undefined' ? self : this, function () {
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
  const lerp = (a, b, k) => a + (b - a) * k
  const ease = {
    out: k => 1 - Math.pow(1 - k, 3),
    expo: k => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)),
    inOut: k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
    soft: k => k * k * (3 - 2 * k),
  }

  function build(beats, defs) {
    const B = beats.beat, off = beats.offset
    const bt2s = n => off + n * B                           // absolute beat number -> seconds
    const pos = p => { const [b, k] = String(p).split('.').map(Number); return b * 4 + (k || 0) }   // 'bar.beat' -> beat number
    const energyAt = bar => { const e = beats.energy; const i = clamp(bar, 0, e.length - 1); return e[Math.floor(i)] }
    const smoothEnergy = t => {                              // bar-interpolated, for background mood (never jumps)
      const x = clamp((t - off) / beats.bar - 0.5, 0, beats.energy.length - 1), i = Math.floor(x)
      return lerp(beats.energy[i], beats.energy[Math.min(i + 1, beats.energy.length - 1)], ease.soft(x - i))
    }
    const scenes = defs.map((d, i) => {
      const a = pos(d.at), z = pos(d.to)
      const e = energyAt(Math.floor(a / 4))
      const strength = d.hit ? 'hit' : e >= 0.8 ? 'strong' : e >= 0.5 ? 'mid' : 'soft'
      return Object.assign({}, d, { i, a, z, start: bt2s(a), end: bt2s(z), beats: z - a, energy: e, strength,
        // how fast it arrives: a hit pops in half a beat, quiet material eases in over two
        enter: d.enter != null ? d.enter : { hit: 0.5, strong: 0.75, mid: 1, soft: 2 }[strength],
        tail: d.tail != null ? d.tail : 0.5 })
    })
    // a hard cut (no dissolve tail) into hits and out of / into black
    scenes.forEach((s, i) => {
      const nx = scenes[i + 1]
      if (!nx || nx.hit || nx.kind === 'black' || s.kind === 'black' || s.kind === 'logo' && nx.kind === 'black') s.tail = 0
      if (nx && nx.a !== s.z) s.tail = 0
    })
    const duration = beats.duration

    // camera: keys arrive on beats ({b: beats since scene start, z, x, y}); each move eases over `mv` beats and lands exactly on b.
    function camera(s, bt, opts) {
      if (opts && opts.reduce) return { z: 1, x: 0.5, y: 0.5, tiltX: 0, tiltY: 0, dx: 0, dy: 0, scale: 1 }
      const keys = (s.cam && s.cam.length ? s.cam : [{ b: 0, z: 1, x: 0.5, y: 0.5 }])
      let from = keys[0], to = keys[0], k = 1
      for (let i = 0; i < keys.length; i++) {
        if (bt <= keys[i].b || i === keys.length - 1) {
          to = keys[i]; from = keys[Math.max(0, i - 1)]
          const gap = to.b - from.b, mv = Math.min(to.mv != null ? to.mv : 1.5, gap)
          k = gap <= 0 ? 1 : clamp((bt - (to.b - mv)) / mv)
          if (i === 0) k = 1
          break
        }
      }
      const e = ease.inOut(k)
      const drift = clamp(bt / Math.max(1, s.beats)) * 0.035          // always a little alive, never still
      const z = lerp(from.z, to.z, e) * (1 + drift)
      let x = lerp(from.x, to.x, e), y = lerp(from.y, to.y, e)
      const hx = 0.5 / z, hy = 0.5 / z                                  // keep the crop inside the image
      x = clamp(x, hx, 1 - hx); y = clamp(y, hy, 1 - hy)
      const amp = s.strength === 'soft' ? 0.6 : 1
      const tilt = s.tilt || [-4, 2]
      const arrive = 1 - ease.expo(clamp(bt / (s.enter * 1.6)))       // window comes in rotated further, settles
      return { z, x, y, tiltY: (tilt[0] * amp) * (1 + arrive * 1.2) + Math.sin(bt * 0.18) * 0.8 * amp, tiltX: (tilt[1] * amp) * (1 + arrive * 0.8),
        dx: (s.dx || 0) + arrive * (s.from || 0) * 90, dy: arrive * 36, scale: 1 + (s.hit ? 0.08 : 0.04) * arrive }
    }

    function pulseAt(t, reduce) {
      if (reduce) return 0
      const n = (t - off) / B, ph = n - Math.floor(n), bar = Math.floor(n / 4)
      const e = energyAt(bar), down = Math.floor(n) % 4 === 0
      return Math.exp(-ph * 5.5) * (0.006 + 0.026 * e * e) * (down ? 1.8 : 1)
    }

    function sample(t, opts) {
      opts = opts || {}
      const n = (t - off) / B
      const out = []
      for (const s of scenes) {
        const bt = (t - s.start) / B
        if (bt < 0 || bt >= s.beats + s.tail) continue
        const inT = clamp(bt / s.enter), outT = bt > s.beats ? 1 - clamp((bt - s.beats) / Math.max(s.tail, 1e-6)) : 1
        out.push({ i: s.i, id: s.id, kind: s.kind, bt, u: bt * B, alpha: (opts.reduce ? clamp(bt / 0.5) : ease.out(inT)) * outT,
          enter: ease.expo(inT), exit: bt > s.beats ? clamp((bt - s.beats) / s.tail) : 0, life: clamp(bt / s.beats), cam: camera(s, bt, opts), tail: bt > s.beats })
      }
      // flash: only on scenes that ask for it (the drop hits), 120 ms
      let flash = 0
      if (!opts.reduce) for (const s of scenes) if (s.flash) { const u = t - s.start; if (u >= 0 && u < 0.12) flash = Math.max(flash, Math.pow(1 - u / 0.12, 2)) }
      return { t, beat: n, bar: Math.floor(n / 4), inBar: n - Math.floor(n / 4) * 4, pulse: pulseAt(t, opts.reduce), flash, mood: smoothEnergy(t), scenes: out }
    }
    return { scenes, sample, camera, duration, at: p => bt2s(pos(p)), pos, bt2s, energyAt }
  }
  return { build, ease, clamp, lerp }
})
