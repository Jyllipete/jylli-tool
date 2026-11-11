'use strict'
// The Vitals lattice: a ring of ten segments, one per subsystem. During a checkup a segment fills as the probes that feed it finish
// (real events, never a timer); when the report lands each segment settles at its grade, coloured by tone. A subsystem that was not
// measured stays a dashed outline. Geometry is pure and unit-tested; animation is CSS and stops under motion-reduced / game-live.
;(function (root) {
  const SUBS = ['stability', 'storage', 'memory', 'cpu', 'gpu', 'drivers', 'windows', 'security', 'network', 'config']
  const ICON = { stability: 'heart-pulse', storage: 'hard-drive', memory: 'memory', cpu: 'microchip', gpu: 'display', drivers: 'plug', windows: 'window-maximize', security: 'shield-halved', network: 'wifi', config: 'sliders' }
  const SLOT = 100 / SUBS.length        // each segment owns 10% of the circumference
  const GAP = 1.4                        // of which this much is the gap between neighbours

  // ── pure ──
  /** Segment i: where it starts (in % of the circle, from 12 o'clock), its full length, and the filled length for a 0..100 value. */
  function seg(i, value) {
    const len = SLOT - GAP, start = i * SLOT + GAP / 2
    const v = value == null ? 0 : Math.max(0, Math.min(100, value))
    return { start, len, fill: len * v / 100 }
  }
  /** Mid-angle of segment i in radians (0 = 12 o'clock, clockwise) -> unit vector for label placement. */
  function mid(i) {
    const a = ((i * SLOT + SLOT / 2) / 100) * Math.PI * 2 - Math.PI / 2
    return { x: Math.cos(a), y: Math.sin(a) }
  }
  const tone = g => g == null ? 'idle' : g >= 80 ? 'ok' : g >= 50 ? 'warn' : 'danger'

  const api = { SUBS, ICON, SLOT, GAP, seg, mid, tone }
  root.JylliDiagLattice = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  const NS = 'http://www.w3.org/2000/svg'
  const still = () => document.documentElement.classList.contains('motion-reduced') || document.body.classList.contains('game-live')

  /** mount(host, { names: {sub: label}, label }) -> { el, state, label, sub, score, select, onSeg, destroy } */
  function mount(host, opts) {
    const names = (opts && opts.names) || {}
    const R = 136
    const ticks = Array.from({ length: 60 }, (_, i) => {
      const a = (i * 6 - 90) * Math.PI / 180, major = i % 6 === 0, r0 = major ? 150 : 152, r1 = 156
      return `<line class="dx-tick${major ? ' major' : ''}" x1="${(160 + r0 * Math.cos(a)).toFixed(2)}" y1="${(160 + r0 * Math.sin(a)).toFixed(2)}" x2="${(160 + r1 * Math.cos(a)).toFixed(2)}" y2="${(160 + r1 * Math.sin(a)).toFixed(2)}"/>`
    }).join('')
    const arcs = SUBS.map((s, i) => {
      const g = seg(i, 0)
      const common = `cx="160" cy="160" r="${R}" pathLength="100" transform="rotate(-90 160 160)"`
      return `<g class="dx-seg" data-s="${s}" data-tone="idle" data-measured="0">
        <circle class="dx-seg-track" ${common} stroke-dasharray="${g.len} ${100 - g.len}" stroke-dashoffset="${-g.start}"/>
        <circle class="dx-seg-fill" ${common} stroke-dasharray="0 100" stroke-dashoffset="${-g.start}"/></g>`
    }).join('')
    const node = document.createElement('div')
    node.className = 'dx-lattice'; node.dataset.state = 'idle'
    const labels = SUBS.map((s, i) => {
      const m = mid(i)
      return `<button type="button" class="dx-node" data-s="${s}" data-tone="idle" style="left:${(50 + 47 * m.x).toFixed(2)}%;top:${(50 + 47 * m.y).toFixed(2)}%" aria-label="${esc(names[s] || s)}" title="${esc(names[s] || s)}"><i class="fa fa-${ICON[s]}" aria-hidden="true"></i><b class="dx-node-n">–</b></button>`
    }).join('')
    node.innerHTML = `
      <div class="dx-glow"></div>
      <svg viewBox="0 0 320 320" aria-hidden="true" focusable="false"><g class="dx-ticks">${ticks}</g><circle class="dx-inner" cx="160" cy="160" r="104"/>${arcs}<circle class="dx-ripple" cx="160" cy="160" r="${R}"/></svg>
      <div class="dx-beam"></div>
      ${labels}
      <div class="dx-centre"><div class="dx-num"><span class="dx-v">–</span></div><div class="dx-lbl">${esc((opts && opts.label) || '')}</div></div>`
    host.appendChild(node)
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) }
    const q = s => node.querySelector(s)
    const vEl = q('.dx-v'), lEl = q('.dx-lbl')
    const segEl = Object.fromEntries(SUBS.map(s => [s, q(`.dx-seg[data-s="${s}"]`)]))
    const nodeEl = Object.fromEntries(SUBS.map(s => [s, q(`.dx-node[data-s="${s}"]`)]))
    let shown = 0, raf = 0, selected = null

    function tween(to) {
      cancelAnimationFrame(raf)
      if (to == null) { vEl.textContent = '–'; shown = 0; return }
      if (still() || to === shown) { shown = to; vEl.textContent = String(Math.round(to)); return }
      const from = shown, t0 = performance.now(), dur = Math.min(1100, 400 + Math.abs(to - from) * 12)
      const step = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); shown = from + (to - from) * e; vEl.textContent = String(Math.round(shown)); if (k < 1) raf = requestAnimationFrame(step); else { shown = to; vEl.textContent = String(Math.round(to)) } }
      raf = requestAnimationFrame(step)
    }

    const ctl = {
      el: node,
      state(s) { node.dataset.state = s },
      label(t) { lEl.textContent = t || '' },
      /** v: { progress: 0..1 (scan), grade: 0..100|null, measured: bool } */
      sub(id, v) {
        const i = SUBS.indexOf(id); if (i < 0) return
        const g = seg(i, v.grade != null ? v.grade : (v.progress || 0) * 100)
        const s = segEl[id], f = s.querySelector('.dx-seg-fill')
        f.setAttribute('stroke-dasharray', `${g.fill.toFixed(3)} ${(100 - g.fill).toFixed(3)}`)
        const t = v.grade != null ? tone(v.grade) : v.progress != null && v.progress > 0 ? 'scan' : 'idle'
        s.dataset.tone = t; s.dataset.measured = v.measured === false ? '0' : '1'
        nodeEl[id].dataset.tone = t
        nodeEl[id].querySelector('.dx-node-n').textContent = v.grade != null ? String(v.grade) : '–'
      },
      reset() { for (const s of SUBS) ctl.sub(s, { progress: 0, grade: null }) ; tween(null) },
      score(n, t) { tween(n); node.dataset.tone = t || tone(n) },
      ripple() { const r = q('.dx-ripple'); r.classList.remove('go'); void r.getBoundingClientRect(); r.classList.add('go') },
      select(id) { selected = id || null; node.dataset.sel = selected || ''; for (const s of SUBS) { segEl[s].classList.toggle('dim', !!selected && s !== selected); nodeEl[s].classList.toggle('on', s === selected) } },
      onSeg(cb) {
        node.addEventListener('click', e => { const n = e.target.closest('.dx-node'); if (n) cb(n.dataset.s === selected ? null : n.dataset.s) })
        node.addEventListener('mouseover', e => { const n = e.target.closest('.dx-node'); if (n && !selected) { node.dataset.hover = n.dataset.s; lEl.textContent = names[n.dataset.s] || '' } })
        node.addEventListener('mouseleave', () => { delete node.dataset.hover; if (ctl._lbl != null) lEl.textContent = ctl._lbl })
      },
      destroy() { cancelAnimationFrame(raf); node.remove() },
    }
    ctl.label = t => { ctl._lbl = t || ''; lEl.textContent = t || '' }
    return ctl
  }

  api.mount = mount
})(typeof window !== 'undefined' ? window : globalThis)
