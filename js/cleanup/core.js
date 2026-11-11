'use strict'
// The Cleanup "Core": one ring that shows what can be reclaimed, per group, driven by real scan and run events.
//   outer ring   one arc per group, length = its share of what can be freed (grows live while scanning, drains while cleaning)
//   inner ring   the C: drive: used / reclaimable marker / free
//   centre       the number: "found" during a scan, the running "freed" total during a run, the final freed total after
// Geometry is pure (unit-tested); animation is CSS transitions on stroke-dasharray plus a beam, and stops under motion-reduced / game-live.
;(function (root) {
  const GROUPS = ['system', 'browsers', 'gpu', 'apps', 'games', 'dev', 'permanent']
  const MIN_SHARE = 0.045   // a group that exists is never thinner than this (share of the ring) so it stays visible

  /** groups: { id: bytes } -> [{ id, start, len }] in % of the ring (0..100), in GROUPS order. Only non-zero groups get an arc. */
  function arcs(groups) {
    const list = GROUPS.map(id => ({ id, bytes: Math.max(0, +(groups && groups[id]) || 0) })).filter(g => g.bytes > 0)
    const total = list.reduce((a, g) => a + g.bytes, 0)
    if (!total) return GROUPS.map(id => ({ id, start: 0, len: 0, bytes: 0 }))
    const gap = list.length > 1 ? 1.2 : 0
    const usable = 100 - gap * list.length
    let shares = list.map(g => Math.max(MIN_SHARE, g.bytes / total))
    const sum = shares.reduce((a, b) => a + b, 0)
    shares = shares.map(s => s / sum)
    let pos = 0
    const placed = {}
    list.forEach((g, i) => { const len = shares[i] * usable; placed[g.id] = { id: g.id, start: pos, len, bytes: g.bytes }; pos += len + gap })
    return GROUPS.map(id => placed[id] || { id, start: 0, len: 0, bytes: 0 })
  }

  /** Drive ring: used share (0..100), reclaimable marker share, free share. */
  function drive(total, used, junk) {
    const t = Math.max(1, +total || 0), u = Math.max(0, Math.min(t, +used || 0)), j = Math.max(0, Math.min(u, +junk || 0))
    return { used: +(((u - j) / t) * 100).toFixed(2), junk: Math.max(j > 0 ? 0.6 : 0, +((j / t) * 100).toFixed(2)), free: +(((t - u) / t) * 100).toFixed(2) }
  }

  const api = { GROUPS, arcs, drive }
  root.JylliCleanupCore = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  const NS = 'http://www.w3.org/2000/svg'
  const still = () => document.documentElement.classList.contains('motion-reduced') || document.body.classList.contains('game-live')
  const parts = b => b >= 1073741824 ? { v: (b / 1073741824).toFixed(1), u: 'GB' } : b >= 1048576 ? { v: String(Math.round(b / 1048576)), u: 'MB' } : b > 0 ? { v: String(Math.max(1, Math.round(b / 1024))), u: 'KB' } : { v: '0', u: 'MB' }

  /** mount(host, { label }) -> controller */
  function mount(host, opts) {
    const R = 136, RI = 108
    const ticks = Array.from({ length: 72 }, (_, i) => {
      const a = (i * 5 - 90) * Math.PI / 180, major = i % 6 === 0, r0 = major ? 150 : 152, r1 = 156
      return `<line class="cu-tick${major ? ' major' : ''}" x1="${(160 + r0 * Math.cos(a)).toFixed(2)}" y1="${(160 + r0 * Math.sin(a)).toFixed(2)}" x2="${(160 + r1 * Math.cos(a)).toFixed(2)}" y2="${(160 + r1 * Math.sin(a)).toFixed(2)}"/>`
    }).join('')
    const segs = GROUPS.map(g => `<circle class="cu-arc cu-g-${g}" data-g="${g}" cx="160" cy="160" r="${R}" pathLength="100" stroke-dasharray="0 100" stroke-dashoffset="0" transform="rotate(-90 160 160)"/>`).join('')
    const node = document.createElement('div')
    node.className = 'cu-core'; node.dataset.state = 'idle'
    node.innerHTML = `
      <div class="cu-core-glow"></div>
      <svg viewBox="0 0 320 320" aria-hidden="true" focusable="false">
        <g class="cu-ticks">${ticks}</g>
        <circle class="cu-track" cx="160" cy="160" r="${R}"/>
        ${segs}
        <circle class="cu-dtrack" cx="160" cy="160" r="${RI}"/>
        <circle class="cu-dused" cx="160" cy="160" r="${RI}" pathLength="100" stroke-dasharray="0 100" transform="rotate(-90 160 160)"/>
        <circle class="cu-djunk" cx="160" cy="160" r="${RI}" pathLength="100" stroke-dasharray="0 100" transform="rotate(-90 160 160)"/>
        <circle class="cu-ripple" cx="160" cy="160" r="${R}"/>
      </svg>
      <div class="cu-beam"></div>
      <div class="cu-centre"><div class="cu-num"><span class="cu-v">–</span><small class="cu-u"></small></div><div class="cu-lbl">${opts && opts.label ? String(opts.label).replace(/</g, '&lt;') : ''}</div></div>`
    host.appendChild(node)
    const q = s => node.querySelector(s)
    const vEl = q('.cu-v'), uEl = q('.cu-u'), lEl = q('.cu-lbl')
    const arcEl = Object.fromEntries(GROUPS.map(g => [g, q(`.cu-arc[data-g="${g}"]`)]))
    let shown = 0, raf = 0, hover = null

    function paintNumber(b) { const p = parts(b); vEl.textContent = p.v; uEl.textContent = p.u }
    function tween(to) {
      cancelAnimationFrame(raf)
      if (to == null) { vEl.textContent = '–'; uEl.textContent = ''; shown = 0; return }
      if (still() || to === shown) { shown = to; paintNumber(to); return }
      const from = shown, t0 = performance.now(), dur = Math.min(1100, 380 + Math.abs(to - from) / 4e6)
      const step = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); shown = from + (to - from) * e; paintNumber(shown); if (k < 1) raf = requestAnimationFrame(step); else { shown = to; paintNumber(to) } }
      raf = requestAnimationFrame(step)
    }
    function ripple() { const r = q('.cu-ripple'); r.classList.remove('go'); void r.getBoundingClientRect(); r.classList.add('go') }

    const ctl = {
      el: node,
      state(s) { node.dataset.state = s },
      label(t) { lEl.textContent = t || '' },
      /** groups: { id: bytes } */
      groups(groups) {
        const list = arcs(groups)
        for (const a of list) {
          const el = arcEl[a.id]
          el.setAttribute('stroke-dasharray', `${a.len.toFixed(3)} ${(100 - a.len).toFixed(3)}`)
          el.setAttribute('stroke-dashoffset', String(-a.start.toFixed(3)))
          el.dataset.on = a.len > 0 ? '1' : '0'
        }
      },
      value(bytes) { tween(bytes) },
      empty() { tween(null) },
      drive(total, used, junk) {
        if (!total) return
        const d = drive(total, used, junk)
        q('.cu-dused').setAttribute('stroke-dasharray', `${d.used} ${100 - d.used}`)
        const j = q('.cu-djunk')
        j.setAttribute('stroke-dasharray', `${d.junk} ${100 - d.junk}`); j.setAttribute('stroke-dashoffset', String(-d.used))
      },
      ripple,
      highlight(g) { hover = g; node.dataset.hl = g || ''; for (const id of GROUPS) arcEl[id].classList.toggle('dim', !!g && id !== g) },
      onArc(cb) { node.addEventListener('mouseover', e => { const a = e.target.closest && e.target.closest('.cu-arc'); if (a && a.dataset.on === '1') cb(a.dataset.g) }); node.addEventListener('mouseleave', () => cb(null)) },
      destroy() { cancelAnimationFrame(raf); node.remove() },
    }
    return ctl
  }
  api.mount = mount
  api.parts = parts
})(typeof window !== 'undefined' ? window : globalThis)
