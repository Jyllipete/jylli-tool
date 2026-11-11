'use strict'
// Frame River canvas. Draws what lib/pulse/river.js computes: a median line, the slowest-frame envelope, hitches as marked rapids
// and the player's marks. Colours come from the design tokens at draw time. Draws once per update (no animation loop), which also
// satisfies "nothing animates while a game runs". Used by the tab, the Cockpit (live), the debrief (session) and the HUD (ribbon).
;(function (root) {
  const River = typeof module !== 'undefined' && module.exports ? require('../../lib/pulse/river') : root.JylliPulseRiver

  const HITCH_TONE = { thermal: 'danger', 'vram-full': 'danger', 'ram-pressure': 'danger', 'background-spike': 'warn', 'gpu-bound': 'warn', 'cpu-bound': 'warn', 'clock-drop': 'warn' }

  function mount(host, opts) {
    opts = opts || {}
    const mode = opts.mode || 'live'
    const cv = document.createElement('canvas')
    cv.className = 'pu-river-cv'
    cv.setAttribute('aria-hidden', 'true')
    const tip = document.createElement('div')
    tip.className = 'pu-tip'; tip.hidden = true
    host.appendChild(cv); if (mode !== 'ribbon') host.appendChild(tip)
    let cols = [], markers = [], hover = -1, raf = 0, dead = false, shape = null
    let w = 0, h = 0

    const rgb = name => (getComputedStyle(host).getPropertyValue(name).trim() || '128, 128, 128')
    function colors() {
      const cs = getComputedStyle(host)
      return {
        accent: rgb('--c-accent-rgb'), danger: rgb('--c-danger-rgb'), warn: rgb('--c-warning-rgb'),
        flag: cs.getPropertyValue('--c-accent-fg').trim() || cs.color, grid: cs.getPropertyValue('--hairline').trim() || 'rgba(128,128,128,.2)',
        muted: cs.getPropertyValue('--c-text-tertiary').trim() || 'rgba(128,128,128,.7)',
      }
    }

    function size() {
      const r = host.getBoundingClientRect()
      const dpr = Math.min(2, root.devicePixelRatio || 1)
      w = Math.max(10, Math.round(r.width)); h = Math.max(10, Math.round(r.height))
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr)
      cv.style.width = w + 'px'; cv.style.height = h + 'px'
      const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    function path(ctx, pts, move) {
      if (!pts.length) return
      if (move) ctx.moveTo(pts[0].x, pts[0].y); else ctx.lineTo(pts[0].x, pts[0].y)
      for (const s of River.bezier(pts)) ctx.bezierCurveTo(s.c1x, s.c1y, s.c2x, s.c2y, s.x, s.y)
    }

    function draw() {
      raf = 0
      if (dead) return
      const ctx = cv.getContext('2d')
      ctx.clearRect(0, 0, w, h)
      const c = colors()
      const ribbon = mode === 'ribbon'
      const sh = shape = River.shape(cols, w, h, { cap: mode === 'session' ? Math.max(2, cols.length) : undefined, pad: ribbon ? 2 : 8 })
      host.dataset.empty = cols.length ? '0' : '1'
      if (!cols.length) return

      if (!ribbon) {
        ctx.strokeStyle = c.grid; ctx.lineWidth = 1
        for (const f of [1 / 3, 2 / 3]) { const y = Math.round(sh.y(sh.yMax * f)) + .5; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }
      }
      // envelope: lo -> hi, the slowest frame of each column is the river's bank
      ctx.beginPath(); path(ctx, sh.hi, true)
      const lo = sh.lo.slice().reverse(); ctx.lineTo(lo[0].x, lo[0].y); path(ctx, lo, false); ctx.closePath()
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, `rgba(${c.accent}, .28)`); g.addColorStop(1, `rgba(${c.accent}, .05)`)
      ctx.fillStyle = g; ctx.fill()
      // median
      ctx.beginPath(); path(ctx, sh.mid, true)
      ctx.lineWidth = ribbon ? 1.5 : 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = `rgb(${c.accent})`; ctx.stroke()

      // hitches
      for (const ht of sh.hitches) {
        const cause = cols[ht.i].cause, tone = cause && HITCH_TONE[cause] ? HITCH_TONE[cause] : cause === 'unknown' ? 'muted' : 'danger'
        const col = tone === 'muted' ? c.muted : `rgb(${c[tone]})`
        if (!ribbon) { ctx.strokeStyle = tone === 'muted' ? c.muted : `rgba(${c[tone]}, .45)`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ht.x, ht.y); ctx.lineTo(ht.x, h - 8); ctx.stroke() }
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(ht.x, ht.y, ribbon ? 2 : 3.5, 0, Math.PI * 2); ctx.fill()
      }
      // marks
      if (!ribbon) for (const m of markers) {
        const x = sh.x(Math.min(cols.length - 1, Math.max(0, m.i)))
        ctx.setLineDash([3, 3]); ctx.strokeStyle = `rgba(${c.accent}, .7)`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, 10); ctx.lineTo(x, h - 8); ctx.stroke(); ctx.setLineDash([])
        ctx.fillStyle = `rgb(${c.accent})`; ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(x + 9, 7.5); ctx.lineTo(x, 11); ctx.closePath(); ctx.fill()
      }
      // hover cursor
      if (hover >= 0 && hover < cols.length && !ribbon) {
        const x = sh.x(hover)
        ctx.strokeStyle = c.muted; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, h); ctx.stroke()
        ctx.fillStyle = `rgb(${c.accent})`; ctx.beginPath(); ctx.arc(x, sh.mid[hover].y, 3.5, 0, Math.PI * 2); ctx.fill()
      }
    }
    const kick = () => { if (!raf && !dead) raf = requestAnimationFrame(draw) }

    function onMove(e) {
      if (!shape || !cols.length || !opts.label) return
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left
      hover = River.nearest(shape, x)
      if (hover < 0) return
      tip.hidden = false
      tip.textContent = opts.label(cols[hover], hover, cols.length)
      const tw = tip.offsetWidth
      tip.style.left = Math.max(4, Math.min(w - tw - 4, x - tw / 2)) + 'px'
      kick()
    }
    function onLeave() { hover = -1; tip.hidden = true; kick() }
    if (mode !== 'ribbon') { cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerleave', onLeave) }

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { size(); kick() }) : null
    if (ro) ro.observe(host)
    size(); kick()

    return {
      /** cols: [{ t, med, lo, hi, cause }]; marks: [{ i (column index, may be fractional), label }] */
      update(d) { cols = (d && d.cols) || []; markers = (d && d.marks) || []; if (hover >= cols.length) hover = -1; kick() },
      destroy() { dead = true; cancelAnimationFrame(raf); if (ro) ro.disconnect(); cv.remove(); tip.remove() },
    }
  }

  /** The engine's live frame -> river input: compact columns to objects, and marks (media seconds) to column positions. */
  function fromLive(live) {
    const cols = ((live && live.cols) || []).map(a => ({ t: a[0], med: a[1], lo: a[2], hi: a[3], n: a[4], cause: a[5] }))
    const marks = []
    for (const m of (live && live.marks) || []) {
      let best = -1, d = Infinity
      cols.forEach((c, i) => { const x = Math.abs(c.t - m.sec * 1000); if (x < d) { d = x; best = i } })
      if (best >= 0 && d < 1500) marks.push({ i: best, label: m.label })
    }
    return { cols, marks }
  }

  /** A debrief's ribbon -> river input: one point per slice of the session, hitches and marks placed by second. */
  function fromDebrief(deb) {
    const rb = (deb && deb.ribbon) || []
    const per = rb.length ? Math.max(1, (deb.durationSec || rb.length) / rb.length) : 1
    const cols = rb.map((r, i) => {
      const ms = r && r.fps > 0 ? 1000 / r.fps : null
      return { t: i * per * 1000, med: ms == null ? 0 : ms, lo: ms == null ? 0 : ms, hi: r && r.maxMs ? Math.max(r.maxMs, ms || 0) : (ms || 0), cause: null }
    })
    // the engine's hitch limit already decided what is a hitch; tag the column that holds each one with its cause
    for (const hc of (deb && deb.hitches) || []) { const i = Math.min(cols.length - 1, Math.floor(hc.startSec / per)); if (i >= 0) { cols[i].cause = hc.primary; cols[i].hi = Math.max(cols[i].hi, hc.worstMs) } }
    const marks = ((deb && deb.marks) || []).map(m => ({ i: m.sec / per, label: m.label }))
    return { cols, marks }
  }

  const api = { mount, fromLive, fromDebrief }
  root.JylliPulseRiverView = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
