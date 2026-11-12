'use strict'
// Home Timeline, canvas part. One surface, two kinds of time: live (1 min / 10 min, from the telemetry hub's rings, scrolling with the clock)
// and recorded (7 days, from lib/home/rewind.js: CPU and RAM, one mark per journal batch). Draws; it never decides anything.
//   mount(host, { label, onHover(info|null) }) -> { setTab(tab), setWindow(id), setRings(rings), setStrip(strip), setBand(band|null), setPins(pins), invalidate(), release(), destroy() }
//   rings: { key: [{ t, v }] } (the page owns and appends to them; call invalidate() after). A gap (> 3 s between samples) breaks the line.
//   onHover({ mode: 'live', t, x, values: { key: v|null }, pins: [pin] } | { mode: '7d', x, hit } | null)
;(function (root) {
  if (typeof document === 'undefined') return
  const css = (el, name, fb) => (getComputedStyle(el).getPropertyValue(name).trim() || fb)
  const GAP_MS = 3000
  const PAD = { top: 18, bot: 22, left: 44 }
  const TRACE = root.JylliHomeTrace
  const REWIND = root.JylliHomeRewind
  const num = n => typeof n === 'number' && Number.isFinite(n)

  function mount(host, opts) {
    const canvas = document.createElement('canvas')
    canvas.className = 'hm-tl-canvas'
    canvas.tabIndex = 0
    canvas.setAttribute('role', 'slider')
    canvas.setAttribute('aria-valuemin', '0'); canvas.setAttribute('aria-valuemax', '100'); canvas.setAttribute('aria-valuenow', '100')
    if (opts.label) canvas.setAttribute('aria-label', opts.label)
    host.appendChild(canvas)
    const S = { tab: null, win: '1m', rings: {}, strip: null, band: null, pins: [], x: null, pinned: false, dirty: true, w: 0, h: 0, dead: false, timer: 0, lay: null }

    function size() {
      const r = host.getBoundingClientRect(), dpr = Math.min(2, root.devicePixelRatio || 1)
      S.w = Math.max(160, Math.round(r.width)); S.h = Math.max(120, Math.round(r.height))
      canvas.width = Math.round(S.w * dpr); canvas.height = Math.round(S.h * dpr)
      canvas.style.width = S.w + 'px'; canvas.style.height = S.h + 'px'
      canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0)
      S.dirty = true
    }

    const fmtAxis = (v, unit) => {
      if (unit === 'bps') { const b = root.JylliTelemetry ? JylliTelemetry.fmtBytes(v) : { n: String(Math.round(v)), u: 'B' }; return b.n + ' ' + b.u + '/s' }
      if (unit === 'c') return Math.round(v) + '°'
      return Math.round(v) + '%'
    }

    /** Where everything goes for the current tab and window. */
    function layout() {
      const tab = S.tab
      const hasRight = !!tab && tab.lines.some(l => l.axis === 'right')
      const L = { left: PAD.left + (tab && tab.lines[0].unit === 'bps' ? 22 : 0), right: hasRight ? 40 : 12, top: PAD.top, bot: S.h - PAD.bot }
      L.pw = S.w - L.left - L.right; L.ph = L.bot - L.top
      const span = TRACE.WINDOWS[S.win]
      L.to = Date.now(); L.from = L.to - span
      // left axis range
      L.unit = tab ? tab.lines[0].unit : 'pct'
      L.max = 100
      if (L.unit === 'bps') {
        let peak = 0
        for (const l of tab.lines) if (l.unit === 'bps') for (const p of S.rings[l.key] || []) if (p.t >= L.from && p.v > peak) peak = p.v
        L.max = TRACE.niceMax(peak, 100 * 1024)
      }
      return L
    }
    const xOf = (L, t) => L.left + ((t - L.from) / (L.to - L.from)) * L.pw
    const yOf = (L, v, max) => L.bot - (Math.max(0, Math.min(max, v)) / max) * L.ph

    function drawGrid(g, L, c) {
      g.lineWidth = 1; g.strokeStyle = c.line; g.fillStyle = c.text; g.font = '11px ' + c.font; g.textBaseline = 'middle'
      const rows = 4
      for (let i = 0; i <= rows; i++) {
        const y = Math.round(L.bot - (L.ph * i) / rows) + .5
        g.beginPath(); g.moveTo(L.left, y); g.lineTo(L.left + L.pw, y); g.stroke()
        g.textAlign = 'right'; g.fillText(fmtAxis((L.max * i) / rows, L.unit), L.left - 8, y)
        if (S.tab && S.tab.lines.some(l => l.axis === 'right') && S.win !== '7d') { g.textAlign = 'left'; g.fillText(fmtAxis((100 * i) / rows, 'c'), L.left + L.pw + 8, y) }
      }
      g.textBaseline = 'alphabetic'; g.textAlign = 'center'
      const span = L.to - L.from
      if (S.win === '7d') {
        for (let d = 0; d <= 7; d++) {
          const x = Math.round(L.left + (L.pw * d) / 7) + .5
          g.beginPath(); g.moveTo(x, L.top); g.lineTo(x, L.bot); g.stroke()
          if (d < 7 && d % 1 === 0) { const day = new Date(L.from + ((d + .5) / 7) * span); g.fillText(day.toLocaleDateString(root.settings && settings.language === 'fi' ? 'fi-FI' : 'en-GB', { weekday: 'short' }), L.left + (L.pw * (d + .5)) / 7, L.bot + 15) }
        }
      } else {
        const marks = S.win === '1m' ? [60, 45, 30, 15, 0] : [10, 7.5, 5, 2.5, 0]
        marks.forEach((m, i) => {
          const x = L.left + (L.pw * i) / 4
          g.beginPath(); g.moveTo(Math.round(x) + .5, L.top); g.lineTo(Math.round(x) + .5, L.bot); g.stroke()
          g.textAlign = i === 0 ? 'left' : i === 4 ? 'right' : 'center'
          g.fillText(m === 0 ? (opts.nowLabel || 'now') : S.win === '1m' ? m + 's' : (m % 1 ? m : m) + 'm', x, L.bot + 15)
        })
      }
    }

    /** Points -> runs without gaps, as canvas coordinates. */
    // smooth: a short moving average for display only (10 minutes of 2 Hz samples is noise to the eye). Detection and the crosshair stay raw.
    function runs(L, pts, max, smooth) {
      const out = []; let cur = []; let last = null
      const done = () => { if (smooth && cur.length > 4) { const ys = cur.map(p => p[1]); cur = cur.map((p, i) => { let a = 0, n = 0; for (let k = Math.max(0, i - 2); k <= Math.min(ys.length - 1, i + 2); k++) { a += ys[k]; n++ } return [p[0], a / n] }) } }
      for (const p of pts) {
        if (p.t < L.from - 1500 || !num(p.v)) continue
        if (last != null && p.t - last > GAP_MS) { if (cur.length) { done(); out.push(cur) } cur = [] }
        cur.push([xOf(L, p.t), yOf(L, p.v, max)]); last = p.t
      }
      if (cur.length) { done(); out.push(cur) }
      return out
    }

    function drawLive(g, L, c) {
      const tab = S.tab
      // your usual range (primary line only): a dashed ghost band, so a number has something to be compared with
      if (S.band && tab.lines[0].unit === 'pct') {
        const y1 = yOf(L, S.band.p75, 100), y2 = yOf(L, S.band.p25, 100)
        g.fillStyle = `rgba(${c.rgb},.07)`; g.fillRect(L.left, y1, L.pw, Math.max(2, y2 - y1))
        g.setLineDash([4, 4]); g.strokeStyle = `rgba(${c.rgb},.4)`; g.lineWidth = 1
        g.beginPath(); g.moveTo(L.left, y1 + .5); g.lineTo(L.left + L.pw, y1 + .5); g.moveTo(L.left, y2 + .5); g.lineTo(L.left + L.pw, y2 + .5); g.stroke(); g.setLineDash([])
      }
      // throttle limit on the temperature axis
      const tl = tab.lines.find(l => l.ceiling)
      if (tl && root.JylliPulseAttribution) {
        const lim = JylliPulseAttribution.THERMAL_LIMIT[tl.ceiling]
        if (lim != null) { const y = Math.round(yOf(L, lim, 100)) + .5; g.setLineDash([2, 4]); g.strokeStyle = c.warn; g.globalAlpha = .55; g.beginPath(); g.moveTo(L.left, y); g.lineTo(L.left + L.pw, y); g.stroke(); g.setLineDash([]); g.globalAlpha = 1 }
      }
      // lines: secondary first so the primary sits on top
      const order = [...tab.lines].sort((a, b) => (a.role === 'primary') - (b.role === 'primary'))
      for (const l of order) {
        const max = l.axis === 'right' ? 100 : L.max
        const rs = runs(L, S.rings[l.key] || [], max, S.win === '10m' && l.unit === 'pct')
        if (l.role === 'primary') {
          for (const r of rs) {
            if (r.length < 2) continue
            const grad = g.createLinearGradient(0, L.top, 0, L.bot); grad.addColorStop(0, `rgba(${c.rgb},.30)`); grad.addColorStop(1, `rgba(${c.rgb},.02)`)
            g.fillStyle = grad; g.beginPath(); g.moveTo(r[0][0], L.bot); r.forEach(p => g.lineTo(p[0], p[1])); g.lineTo(r[r.length - 1][0], L.bot); g.closePath(); g.fill()
          }
        }
        g.strokeStyle = l.role === 'primary' ? c.accent : (l.axis === 'right' ? c.warn : c.info); g.lineWidth = l.role === 'primary' ? 1.8 : 1.4; g.lineJoin = 'round'
        for (const r of rs) { g.beginPath(); r.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke() }
      }
    }

    function draw7d(g, L, c) {
      const st = S.strip, tab = S.tab
      if (!st) return
      const field = tab.history
      const n = st.buckets.length, bw = L.pw / n
      let run = []
      const flush = () => {
        if (run.length > 1) {
          const grad = g.createLinearGradient(0, L.top, 0, L.bot); grad.addColorStop(0, `rgba(${c.rgb},.30)`); grad.addColorStop(1, `rgba(${c.rgb},.02)`)
          g.fillStyle = grad; g.beginPath(); g.moveTo(run[0][0], L.bot); run.forEach(p => g.lineTo(p[0], p[1])); g.lineTo(run[run.length - 1][0], L.bot); g.closePath(); g.fill()
          g.strokeStyle = c.accent; g.lineWidth = 1.6; g.beginPath(); run.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke()
        }
        run = []
      }
      st.buckets.forEach((b, i) => { if (!num(b[field])) flush(); else run.push([L.left + (i + .5) * bw, yOf(L, b[field], 100)]) })
      flush()
    }

    const PIN_COLOR = { change: 'ok', game: 'accent', restore: 'info', spike: 'warn' }
    function drawPins(g, L, c) {
      let pins = S.pins
      if (S.win === '7d') pins = ((S.strip && S.strip.marks) || []).map(m => ({ kind: 'change', t: m.ts, undone: m.undone }))
      for (const p of pins) {
        if (p.t < L.from || p.t > L.to) continue
        const x = Math.round(xOf(L, p.t)) + .5, col = c[PIN_COLOR[p.kind] || 'accent']
        g.globalAlpha = p.undone ? .45 : .9; g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1
        g.beginPath(); g.moveTo(x, L.top - 2); g.lineTo(x, L.bot); g.stroke()
        if (p.kind === 'spike') { g.beginPath(); g.moveTo(x, L.top - 12); g.lineTo(x + 9, L.top - 8); g.lineTo(x, L.top - 4); g.closePath(); g.fill() }
        else { g.beginPath(); g.arc(x, L.top - 7, 3.2, 0, Math.PI * 2); g.fill() }
        g.globalAlpha = 1
      }
    }

    function drawCross(g, L, c) {
      if (S.x == null) return
      const x = Math.round(L.left + S.x * L.pw) + .5
      g.strokeStyle = c.text1; g.globalAlpha = .8; g.lineWidth = 1.4
      g.beginPath(); g.moveTo(x, 4); g.lineTo(x, L.bot + 3); g.stroke(); g.globalAlpha = 1
      if (S.win === '7d') return
      const t = L.from + S.x * (L.to - L.from)
      for (const l of S.tab.lines) {
        const v = nearest(S.rings[l.key], t)
        if (v == null) continue
        const max = l.axis === 'right' ? 100 : L.max
        g.fillStyle = l.role === 'primary' ? c.accent : (l.axis === 'right' ? c.warn : c.info)
        g.beginPath(); g.arc(x, yOf(L, v, max), 3.6, 0, Math.PI * 2); g.fill()
        g.strokeStyle = c.surface; g.lineWidth = 1.5; g.stroke()
      }
    }

    /** The sample closest to t, only if one lies within 2.5 s of it (a gap stays a gap). */
    function nearest(ring, t) {
      if (!ring || !ring.length) return null
      let lo = 0, hi = ring.length - 1
      while (lo < hi) { const mid = (lo + hi) >> 1; if (ring[mid].t < t) lo = mid + 1; else hi = mid }
      let best = ring[lo]
      if (lo > 0 && Math.abs(ring[lo - 1].t - t) < Math.abs(best.t - t)) best = ring[lo - 1]
      return Math.abs(best.t - t) <= 2500 ? best.v : null
    }

    function draw() {
      if (S.dead || !S.tab) return
      S.dirty = false
      const g = canvas.getContext('2d')
      g.clearRect(0, 0, S.w, S.h)
      const L = S.lay = layout()
      const c = {
        line: css(canvas, '--hairline', 'rgba(255,255,255,.08)'), text: css(canvas, '--c-text-tertiary', '#888'), text1: css(canvas, '--c-text-primary', '#fff'),
        accent: css(canvas, '--c-accent', '#8B7CF6'), rgb: css(canvas, '--c-accent-rgb', '139,124,246'), warn: css(canvas, '--c-warning', '#f5a524'),
        ok: css(canvas, '--c-success', '#4ade80'), info: css(canvas, '--c-info', '#60a5fa'), surface: css(canvas, '--surface-1', '#111'), font: css(canvas, '--font', 'sans-serif'),
      }
      drawGrid(g, L, c)
      if (S.win === '7d') draw7d(g, L, c); else drawLive(g, L, c)
      drawPins(g, L, c)
      drawCross(g, L, c)
    }

    // 10 fps, only while on screen and something changed (or the live window is scrolling)
    S.timer = setInterval(() => {
      if (S.dead || document.hidden || !canvas.isConnected) return
      if (S.dirty || (S.win !== '7d' && S.tab)) draw()
    }, 100)

    // ── pointer / keyboard ──
    const frac = e => { const r = canvas.getBoundingClientRect(), L = S.lay || layout(); return Math.max(0, Math.min(1, (e.clientX - r.left - L.left) / Math.max(1, L.pw))) }
    function report() {
      if (S.x == null) { opts.onHover && opts.onHover(null); return }
      const L = S.lay || layout()
      if (S.win === '7d') { opts.onHover && opts.onHover({ mode: '7d', x: S.x, hit: REWIND.at(S.strip, S.x) }); return }
      const t = L.from + S.x * (L.to - L.from), values = {}
      for (const l of S.tab.lines) values[l.key] = nearest(S.rings[l.key], t)
      for (const e of S.tab.extras) values[e.key] = nearest(S.rings[e.key], t)
      const reach = (L.to - L.from) * 8 / Math.max(1, L.pw)
      opts.onHover && opts.onHover({ mode: 'live', t, x: S.x, values, pins: S.pins.filter(p => Math.abs(p.t - t) <= reach) })
    }
    const move = x => { S.x = x; S.dirty = true; canvas.setAttribute('aria-valuenow', String(Math.round(x * 100))); draw(); report() }
    canvas.addEventListener('pointermove', e => { if (!S.pinned) move(frac(e)) })
    canvas.addEventListener('pointerleave', () => { if (S.pinned) return; S.x = null; S.dirty = true; draw(); report() })
    canvas.addEventListener('click', e => { S.pinned = !S.pinned || (Math.abs(frac(e) - (S.x == null ? -1 : S.x)) > .02); move(frac(e)) })
    canvas.addEventListener('keydown', e => {
      const step = e.shiftKey ? 0.1 : 0.02
      if (e.key === 'ArrowLeft') { e.preventDefault(); S.pinned = true; move(Math.max(0, (S.x == null ? 1 : S.x) - step)) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); S.pinned = true; move(Math.min(1, (S.x == null ? 1 : S.x) + step)) }
      else if (e.key === 'Escape') { release() }
    })
    function release() { S.pinned = false; S.x = null; S.dirty = true; draw(); report() }

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { cancelAnimationFrame(S.raf); S.raf = requestAnimationFrame(size) }) : null
    if (ro) ro.observe(host)
    size()
    return {
      setTab(tab) { S.tab = tab; S.x = null; S.pinned = false; S.dirty = true; draw(); report() },
      setWindow(id) { S.win = id; S.x = null; S.pinned = false; S.dirty = true; draw(); report() },
      setRings(r) { S.rings = r; S.dirty = true },
      setStrip(st) { S.strip = st; S.dirty = true },
      setBand(b) { S.band = b; S.dirty = true },
      setPins(p) { S.pins = p || []; S.dirty = true },
      invalidate() { S.dirty = true },
      release,
      destroy() { S.dead = true; clearInterval(S.timer); if (ro) ro.disconnect(); cancelAnimationFrame(S.raf); canvas.remove() },
    }
  }
  root.JylliHomeTraceView = { mount }
})(typeof window !== 'undefined' ? window : globalThis)
