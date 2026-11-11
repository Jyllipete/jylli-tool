'use strict'
// The Debloat "Footprint Core": one ring, one arc per layer (Apps, Services, Tasks, Ads, Features). Arc length = that layer's share of
// what can be removed. The centre is a count: items found, then items removed so far during a run. Driven by real scan and run events.
// Geometry comes from JylliDebloatFootprint.arcs (unit-tested); animation is CSS only and stops under motion-reduced / game-live.
;(function (root) {
  const LAYERS = ['apps', 'services', 'tasks', 'ads', 'features']
  const NS = 'http://www.w3.org/2000/svg'
  const still = () => document.documentElement.classList.contains('motion-reduced') || document.body.classList.contains('game-live')

  /** mount(host, { label }) -> controller { el, state(s), label(t), groups({layer: n}), value(n), empty(), ripple(), highlight(layer), onArc(cb), destroy() } */
  function mount(host, opts) {
    const R = 136
    const ticks = Array.from({ length: 72 }, (_, i) => {
      const a = (i * 5 - 90) * Math.PI / 180, major = i % 6 === 0, r0 = major ? 150 : 152, r1 = 156
      return `<line class="db-tick${major ? ' major' : ''}" x1="${(160 + r0 * Math.cos(a)).toFixed(2)}" y1="${(160 + r0 * Math.sin(a)).toFixed(2)}" x2="${(160 + r1 * Math.cos(a)).toFixed(2)}" y2="${(160 + r1 * Math.sin(a)).toFixed(2)}"/>`
    }).join('')
    const segs = LAYERS.map(l => `<circle class="db-arc db-l-${l}" data-l="${l}" cx="160" cy="160" r="${R}" pathLength="100" stroke-dasharray="0 100" stroke-dashoffset="0" transform="rotate(-90 160 160)"/>`).join('')
    const node = document.createElement('div')
    node.className = 'db-core'; node.dataset.state = 'idle'
    node.innerHTML = `
      <div class="db-core-glow"></div>
      <svg viewBox="0 0 320 320" aria-hidden="true" focusable="false">
        <g class="db-ticks">${ticks}</g>
        <circle class="db-track" cx="160" cy="160" r="${R}"/>
        ${segs}
        <circle class="db-inner" cx="160" cy="160" r="104"/>
        <circle class="db-ripple" cx="160" cy="160" r="${R}"/>
      </svg>
      <div class="db-beam"></div>
      <div class="db-centre"><div class="db-num"><span class="db-v">–</span></div><div class="db-lbl">${opts && opts.label ? String(opts.label).replace(/</g, '&lt;') : ''}</div></div>`
    host.appendChild(node)
    const q = s => node.querySelector(s)
    const vEl = q('.db-v'), lEl = q('.db-lbl')
    const arcEl = Object.fromEntries(LAYERS.map(l => [l, q(`.db-arc[data-l="${l}"]`)]))
    let shown = 0, raf = 0

    function tween(to) {
      cancelAnimationFrame(raf)
      if (to == null) { vEl.textContent = '–'; shown = 0; return }
      if (still() || to === shown) { shown = to; vEl.textContent = String(Math.round(to)); return }
      const from = shown, t0 = performance.now(), dur = Math.min(900, 300 + Math.abs(to - from) * 25)
      const step = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); shown = from + (to - from) * e; vEl.textContent = String(Math.round(shown)); if (k < 1) raf = requestAnimationFrame(step); else { shown = to; vEl.textContent = String(Math.round(to)) } }
      raf = requestAnimationFrame(step)
    }

    const ctl = {
      el: node,
      state(s) { node.dataset.state = s },
      label(t) { lEl.textContent = t || '' },
      groups(values) {
        const list = root.JylliDebloatFootprint.arcs(values)
        for (const a of list) {
          const el = arcEl[a.id]
          el.setAttribute('stroke-dasharray', `${a.len.toFixed(3)} ${(100 - a.len).toFixed(3)}`)
          el.setAttribute('stroke-dashoffset', String(-a.start.toFixed(3)))
          el.dataset.on = a.len > 0 ? '1' : '0'
        }
      },
      value(n) { tween(n) },
      empty() { tween(null) },
      ripple() { const r = q('.db-ripple'); r.classList.remove('go'); void r.getBoundingClientRect(); r.classList.add('go') },
      highlight(l) { node.dataset.hl = l || ''; for (const id of LAYERS) arcEl[id].classList.toggle('dim', !!l && id !== l) },
      onArc(cb) { node.addEventListener('mouseover', e => { const a = e.target.closest && e.target.closest('.db-arc'); if (a && a.dataset.on === '1') cb(a.dataset.l) }); node.addEventListener('mouseleave', () => cb(null)) },
      destroy() { cancelAnimationFrame(raf); node.remove() },
    }
    return ctl
  }

  root.JylliDebloatCore = { LAYERS, mount }
  if (typeof module !== 'undefined' && module.exports) module.exports = root.JylliDebloatCore
})(typeof window !== 'undefined' ? window : globalThis)
