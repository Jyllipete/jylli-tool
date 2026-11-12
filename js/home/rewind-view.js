'use strict'
// Home Rewind strip, canvas part. Draws lib/home/rewind.js's strip: CPU as an area, RAM as a line, one mark per journal batch, a playhead.
// Pointer or arrow keys move the playhead; onScrub(x | null) tells the page what is under it. Gaps stay gaps; nothing is interpolated.
;(function (root) {
  if (typeof document === 'undefined') return
  const css = (el, name, fb) => (getComputedStyle(el).getPropertyValue(name).trim() || fb)

  function mount(host, opts) {
    const canvas = document.createElement('canvas')
    canvas.className = 'hm-rw-canvas'
    canvas.tabIndex = 0
    canvas.setAttribute('role', 'slider')
    canvas.setAttribute('aria-valuemin', '0'); canvas.setAttribute('aria-valuemax', '100'); canvas.setAttribute('aria-valuenow', '100')
    if (opts.label) canvas.setAttribute('aria-label', opts.label)
    host.appendChild(canvas)
    const S = { strip: null, x: null, w: 0, h: 0, raf: 0, dead: false }

    function size() {
      const r = host.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1)
      S.w = Math.max(120, Math.round(r.width)); S.h = Math.max(60, Math.round(r.height))
      canvas.width = Math.round(S.w * dpr); canvas.height = Math.round(S.h * dpr)
      canvas.style.width = S.w + 'px'; canvas.style.height = S.h + 'px'
      const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0)
      draw()
    }

    function draw() {
      if (S.dead) return
      const g = canvas.getContext('2d'), w = S.w, h = S.h
      g.clearRect(0, 0, w, h)
      const accent = css(canvas, '--c-accent', '#8B7CF6'), line = css(canvas, '--hairline', 'rgba(255,255,255,.08)'), text = css(canvas, '--c-text-tertiary', '#888')
      const rgb = css(canvas, '--c-accent-rgb', '139,124,246')
      const top = 14, bot = h - 16, ph = bot - top
      // day gridlines
      g.strokeStyle = line; g.lineWidth = 1; g.beginPath()
      for (let i = 0; i <= 7; i++) { const x = Math.round((w * i) / 7) + .5; g.moveTo(x, top); g.lineTo(x, bot) }
      g.stroke()
      const s = S.strip
      if (!s) return
      const n = s.buckets.length, bw = w / n
      const y = v => bot - (Math.max(0, Math.min(100, v)) / 100) * ph
      // CPU area (runs of consecutive buckets; a gap ends the run)
      let run = []
      const flush = () => {
        if (run.length) {
          const grad = g.createLinearGradient(0, top, 0, bot); grad.addColorStop(0, `rgba(${rgb},.34)`); grad.addColorStop(1, `rgba(${rgb},.02)`)
          g.fillStyle = grad; g.strokeStyle = accent; g.lineWidth = 1.4
          g.beginPath(); g.moveTo(run[0][0], bot); run.forEach(p => g.lineTo(p[0], p[1])); g.lineTo(run[run.length - 1][0], bot); g.closePath(); g.fill()
          g.beginPath(); run.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke()
        }
        run = []
      }
      s.buckets.forEach((b, i) => { if (b.cpu == null) flush(); else run.push([(i + .5) * bw, y(b.cpu)]) })
      flush()
      // RAM line
      g.strokeStyle = text; g.lineWidth = 1; g.setLineDash([3, 3]); g.beginPath(); let pen = false
      s.buckets.forEach((b, i) => { if (b.ram == null) { pen = false; return } const px = (i + .5) * bw, py = y(b.ram); if (pen) g.lineTo(px, py); else g.moveTo(px, py); pen = true })
      g.stroke(); g.setLineDash([])
      // change marks
      const ok = css(canvas, '--c-success', '#4ade80'), muted = css(canvas, '--c-text-tertiary', '#888')
      for (const m of s.marks) {
        const x = Math.round(m.x * w) + .5
        g.strokeStyle = m.undone ? muted : ok; g.globalAlpha = m.undone ? .5 : .9; g.lineWidth = 1
        g.beginPath(); g.moveTo(x, top - 4); g.lineTo(x, bot); g.stroke()
        g.fillStyle = m.undone ? muted : ok; g.beginPath(); g.arc(x, top - 6, 3.2, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1
      }
      // playhead
      if (S.x != null) {
        const x = Math.round(S.x * w) + .5
        g.strokeStyle = css(canvas, '--c-text-primary', '#fff'); g.globalAlpha = .85; g.lineWidth = 1.5
        g.beginPath(); g.moveTo(x, 4); g.lineTo(x, bot + 4); g.stroke(); g.globalAlpha = 1
        g.fillStyle = css(canvas, '--c-text-primary', '#fff'); g.beginPath(); g.arc(x, bot + 6, 3.5, 0, Math.PI * 2); g.fill()
      }
    }

    const frac = e => { const r = canvas.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width))) }
    const move = x => { S.x = x; canvas.setAttribute('aria-valuenow', String(Math.round(x * 100))); draw(); opts.onScrub && opts.onScrub(x) }
    canvas.addEventListener('pointermove', e => move(frac(e)))
    canvas.addEventListener('pointerdown', e => { try { canvas.setPointerCapture(e.pointerId) } catch {} move(frac(e)) })
    canvas.addEventListener('pointerleave', () => { if (S.pinned) return; S.x = null; draw(); opts.onScrub && opts.onScrub(null) })
    canvas.addEventListener('click', e => { S.pinned = true; move(frac(e)) })
    canvas.addEventListener('keydown', e => {
      const step = e.shiftKey ? 0.1 : 0.02
      if (e.key === 'ArrowLeft') { e.preventDefault(); S.pinned = true; move(Math.max(0, (S.x == null ? 1 : S.x) - step)) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); S.pinned = true; move(Math.min(1, (S.x == null ? 1 : S.x) + step)) }
      else if (e.key === 'Escape') { S.pinned = false; S.x = null; draw(); opts.onScrub && opts.onScrub(null) }
    })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { cancelAnimationFrame(S.raf); S.raf = requestAnimationFrame(size) }) : null
    if (ro) ro.observe(host)
    size()
    return {
      set(strip) { S.strip = strip; draw() },
      release() { S.pinned = false; S.x = null; draw(); opts.onScrub && opts.onScrub(null) },
      destroy() { S.dead = true; if (ro) ro.disconnect(); cancelAnimationFrame(S.raf); canvas.remove() },
    }
  }
  root.JylliHomeRewindView = { mount }
})(typeof window !== 'undefined' ? window : globalThis)
