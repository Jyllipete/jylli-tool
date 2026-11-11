'use strict'
// Route Radar: the real path from this PC to the FiveM server on a 2D canvas. One node per hop, grouped into your network / your
// ISP / transit / the server; pulses travel each link at a speed set by that link's measured latency, and a probe that was lost
// visibly dies on the way. Nothing here is decorative data: every node, ring and pulse comes from the analysis of measured rounds
// (lib/fivem/route-verdict.js). Hidden hops (routers that never answer) are drawn hollow, and loss at a hop that clears further on is
// drawn as "rate limited", never as a fault. Pure geometry is exported for node tests; the canvas part runs only in the renderer.
;(function (root) {
  const SEGS = ['home', 'isp', 'transit', 'server']
  const MIN_W = 320

  // ── pure ──
  /** n nodes (index 0 is "you") across w x h, on a shallow wave so a long path does not read as a ruler. */
  function layout(n, w, h) {
    const padX = 40, out = []
    for (let i = 0; i < n; i++) out.push({ x: n === 1 ? w / 2 : padX + (i * (w - 2 * padX)) / (n - 1), y: h * 0.56 + Math.sin(i * 0.85) * h * 0.055 })
    return out
  }
  /** nodes: [{seg}] -> [{ seg, from, to }] contiguous runs (node 0 belongs to the first run). */
  function spans(nodes) {
    const out = []
    nodes.forEach((n, i) => { const last = out[out.length - 1]; if (last && last.seg === n.seg) last.to = i; else out.push({ seg: n.seg, from: i, to: i }) })
    return out
  }
  /** Tone of a hop: culprit and endpoint loss are danger; loss that clears further on is "limited" (drawn as a dashed warn). */
  function toneOf(h, verdict) {
    if (h.hidden) return 'hidden'
    const s = h.stats
    if (!s || !s.n) return 'idle'
    if (verdict && verdict.ttl === h.ttl && /^(loss|jitter|unreachable)/.test(verdict.id)) return /^loss|^unreachable/.test(verdict.id) ? 'danger' : 'warn'
    if (s.lossPct != null && s.lossPct >= 2) return 'limited'
    if (s.jitter != null && s.jitter >= 15) return 'warn'
    return 'ok'
  }
  /** Seconds a pulse takes over a link whose far end is `dMs` slower than its near end: fast links are fast. */
  const travel = dMs => Math.min(2.6, Math.max(0.4, 0.4 + Math.max(0, dMs) / 40))
  /** Chance (0..1) that a pulse into a hop dies: that hop's measured loss, but only when it is real loss (the verdict decides). */
  const dieChance = (h, verdict) => (toneOf(h, verdict) === 'danger' && h.stats.lossPct ? Math.min(0.9, h.stats.lossPct / 100 * 1.5) : 0)
  /** Nodes to draw from an analysis: you + every hop. */
  function nodes(a) { return [{ ttl: 0, seg: 'home', you: true, stats: { n: 1, got: 1, avg: 0 } }, ...a.hops] }

  const api = { SEGS, layout, spans, toneOf, travel, dieChance, nodes }
  root.JylliFivemRadar = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  // ── canvas ──
  const still = () => document.documentElement.classList.contains('motion-reduced') || document.body.classList.contains('game-live')
  const css = (el, name) => getComputedStyle(el).getPropertyValue(name).trim()

  /** host: element to fill. opts: { label(seg) -> text, youLabel, serverLabel, ariaLabel }. Returns { update, destroy }. */
  function mount(host, opts) {
    const cv = document.createElement('canvas')
    cv.className = 'fv-radar-cv'
    cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', opts.ariaLabel || '')
    host.appendChild(cv)
    const g = cv.getContext('2d')
    let W = 0, H = 0, dpr = 1, model = null, pulses = [], raf = 0, last = 0, acc = 0, dead = false, tip = null, hoverIdx = -1
    const rnd = (() => { let s = 0x9e3779b9; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000 } })()

    function size() {
      const r = host.getBoundingClientRect()
      W = Math.max(MIN_W, Math.round(r.width)); H = Math.round(host.clientHeight || 250)
      dpr = Math.min(2, window.devicePixelRatio || 1)
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr)
      cv.style.width = W + 'px'; cv.style.height = H + 'px'
    }
    const ro = new ResizeObserver(() => { size(); draw(0) })
    ro.observe(host)
    size()

    function colors() {
      const c = n => css(host, n) || 'gray'
      return { ok: c('--c-success'), warn: c('--c-warning'), danger: c('--c-danger'), accent: c('--c-accent'), text: c('--c-text-primary'), dim: c('--c-text-tertiary'), sec: c('--c-text-secondary'),
        line: c('--hairline-strong'), surf: c('--surface-1'), font: css(host, '--font') || 'sans-serif', mono: css(host, '--font-mono') || 'monospace' }
    }
    const toneColor = (C, t) => (t === 'ok' ? C.ok : t === 'warn' || t === 'limited' ? C.warn : t === 'danger' ? C.danger : C.dim)
    const alpha = (c, a) => { g.globalAlpha = a; return c }

    function draw(dt) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.clearRect(0, 0, W, H)
      const C = colors()
      const a = model && model.analysis
      const ns = a ? nodes(a) : [{ seg: 'home', you: true, stats: {} }, { seg: 'server', server: true, stats: {} }]
      const pos = layout(ns.length, W, H)
      const verdict = a && a.verdict
      // segment bands
      for (const s of spans(ns)) {
        const x0 = pos[s.from].x - (s.from === 0 ? 26 : 12), x1 = pos[s.to].x + (s.to === ns.length - 1 ? 26 : 12)
        g.globalAlpha = 1; g.fillStyle = C.line; g.globalAlpha = 0.16
        roundRect(x0, H * 0.2, x1 - x0, H * 0.62, 12); g.fill()
        g.globalAlpha = 1; g.fillStyle = C.dim; g.font = `500 12px ${C.font}`; g.textAlign = 'left'
        const lbl = opts.label ? opts.label(s.seg) : s.seg
        g.fillText(lbl, Math.max(6, Math.min(x0 + 10, W - 8 - g.measureText(lbl).width)), H * 0.2 + 18)       // a one-node band is narrower than its name
      }
      // links
      for (let i = 0; i < ns.length - 1; i++) {
        const t = ns[i + 1].you ? 'ok' : toneOf(ns[i + 1], verdict)
        g.globalAlpha = a ? 0.7 : 0.3; g.strokeStyle = a ? toneColor(C, t === 'hidden' ? 'idle' : t) : C.dim; g.lineWidth = 2
        g.setLineDash(!a || t === 'hidden' ? [3, 6] : t === 'limited' ? [8, 5] : [])
        g.beginPath(); g.moveTo(pos[i].x, pos[i].y); g.lineTo(pos[i + 1].x, pos[i + 1].y); g.stroke(); g.setLineDash([])
      }
      // pulses
      if (a && dt > 0 && !still()) {
        acc += dt
        if (acc > 0.18) {
          acc = 0
          for (let i = 0; i < ns.length - 1; i++) {
            if (rnd() > 0.22) continue
            const far = ns[i + 1], near = ns[i]
            const d = (far.stats && far.stats.avg != null ? far.stats.avg : 0) - (near.stats && near.stats.avg != null ? near.stats.avg : 0)
            pulses.push({ i, p: 0, dur: travel(d), die: rnd() < dieChance(far, verdict) ? 0.25 + rnd() * 0.5 : 2 })
          }
        }
        pulses = pulses.filter(q => { q.p += dt / q.dur; return q.p < 1 && !(q.die < 2 && q.p > q.die + 0.12) })
      }
      if (a) for (const q of pulses) {
        const A = pos[q.i], B = pos[q.i + 1], p = Math.min(1, q.p)
        const x = A.x + (B.x - A.x) * p, y = A.y + (B.y - A.y) * p
        const dying = q.die < 2 && q.p > q.die
        g.globalAlpha = dying ? Math.max(0, 1 - (q.p - q.die) / 0.12) * 0.9 : 0.9
        g.fillStyle = dying ? C.danger : C.accent
        g.beginPath(); g.arc(x, y, dying ? 2.5 + (q.p - q.die) * 30 : 2.6, 0, 6.2832); g.fill()
      }
      // nodes
      g.textAlign = 'center'
      ns.forEach((n, i) => {
        const P = pos[i]
        const tone = n.you ? 'accent' : toneOf(n, verdict)
        const col = tone === 'accent' ? C.accent : toneColor(C, tone)
        const jit = n.stats && n.stats.jitter ? Math.min(14, n.stats.jitter) : 0
        if (jit > 1 && tone !== 'hidden') { g.globalAlpha = 0.25; g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.arc(P.x, P.y, 7 + jit, 0, 6.2832); g.stroke() }
        if (a && verdict && verdict.ttl === n.ttl && /^(loss|jitter|unreachable)/.test(verdict.id) && !still()) {
          const k = (performance.now() / 1200) % 1
          g.globalAlpha = 0.5 * (1 - k); g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.arc(P.x, P.y, 9 + k * 14, 0, 6.2832); g.stroke()
        }
        g.globalAlpha = 1
        g.beginPath(); g.arc(P.x, P.y, n.you || i === ns.length - 1 ? 8 : 6, 0, 6.2832)
        if (tone === 'hidden' || tone === 'idle') { g.strokeStyle = C.dim; g.lineWidth = 1.5; g.fillStyle = C.surf; g.fill(); g.stroke() }
        else { g.fillStyle = col; g.fill() }
        if (i === hoverIdx) { g.strokeStyle = C.text; g.lineWidth = 1.5; g.beginPath(); g.arc(P.x, P.y, 11, 0, 6.2832); g.stroke() }
        // labels: rtt above the node, ttl below
        const showRtt = ns.length <= 18 || i === ns.length - 1 || i % 2 === 0
        if (n.stats && n.stats.avg != null && !n.you && showRtt) { g.fillStyle = C.sec; g.font = `500 11px ${C.mono}`; g.fillText(String(Math.round(n.stats.avg)), P.x, P.y - 16) }
        g.fillStyle = C.dim; g.font = `11px ${C.font}`
        g.fillText(n.you ? (opts.youLabel || '') : n.server ? (opts.serverLabel || '') : String(n.ttl), P.x, P.y + 24)
      })
      g.globalAlpha = 1
      cv._pos = pos; cv._nodes = ns
    }
    function roundRect(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath() }

    function frame(ts) {
      raf = 0
      if (dead) return
      const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0
      last = ts
      if (!document.hidden && host.isConnected) draw(dt)
      if (!still() && !dead) raf = requestAnimationFrame(frame)
    }
    function kick() { if (!raf && !dead) { last = 0; raf = requestAnimationFrame(frame) } }

    cv.addEventListener('mousemove', e => {
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top
      let best = -1, bd = 16
      ;(cv._pos || []).forEach((p, i) => { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = i } })
      hoverIdx = best
      const n = best >= 0 ? cv._nodes[best] : null
      cv.title = n ? (opts.tip ? opts.tip(n) : '') : ''
      if (still()) draw(0)
    })
    cv.addEventListener('mouseleave', () => { hoverIdx = -1; cv.title = ''; if (still()) draw(0) })

    return {
      update(m) { model = m; if (still()) draw(0); else kick() },
      destroy() { dead = true; if (raf) cancelAnimationFrame(raf); ro.disconnect(); cv.remove() },
    }
  }
  api.mount = mount
})(typeof window !== 'undefined' ? window : globalThis)
