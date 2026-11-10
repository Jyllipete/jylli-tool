'use strict'
// The Auto-Optimize reactor: an SVG whose parts are driven by real events, never by a timer.
//   outer ring   one arc per module (idle / planned / running / done / warn)
//   satellites   one dot per detection probe: orbits while scanning, lights up as each probe really resolves
//   core         brightness follows real progress; a ripple fires whenever a step really finishes
// Animation is CSS only (transform/opacity) and stops under html.motion-reduced / body.game-live.
;(function (root) {
  const C = 150   // centre of the 300 x 300 viewBox
  const rad = d => (d - 90) * Math.PI / 180
  const pt = (r, deg) => [C + r * Math.cos(rad(deg)), C + r * Math.sin(rad(deg))]
  const f = n => Math.round(n * 100) / 100

  /** SVG arc path from a0 to a1 degrees (0 = top, clockwise) on radius r. */
  function arcPath(r, a0, a1) {
    const [x0, y0] = pt(r, a0), [x1, y1] = pt(r, a1)
    return `M${f(x0)} ${f(y0)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${f(x1)} ${f(y1)}`
  }

  /** n equal arcs separated by gapDeg. Returns [{ i, a0, a1, d }]. */
  function segments(n, gapDeg = 6, r = 124) {
    if (!n || n < 1) return []
    const span = 360 / n
    return Array.from({ length: n }, (_, i) => {
      const a0 = i * span + gapDeg / 2, a1 = (i + 1) * span - gapDeg / 2
      return { i, a0, a1, d: arcPath(r, a0, a1) }
    })
  }

  /** n points evenly spaced on radius r, starting at the top. */
  function satellites(n, r = 142) {
    return Array.from({ length: n }, (_, i) => { const [x, y] = pt(r, (i * 360) / Math.max(n, 1)); return { i, x: f(x), y: f(y) } })
  }

  const api = { arcPath, segments, satellites, pt }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  /**
   * mount(el, { modules: [id], probes: [id] }) -> controller.
   * controller: probe(id, state), module(id, state), level(0..1), center(text, label), scanning(bool), pulse(), phase(name), destroy().
   */
  function mount(el, opts) {
    const modules = (opts && opts.modules) || [], probes = (opts && opts.probes) || []
    const segs = segments(modules.length, 7)
    const sats = satellites(probes.length)
    el.classList.add('ao-reactor')
    el.innerHTML =
      `<svg viewBox="0 0 300 300" aria-hidden="true" focusable="false">
        <defs><radialGradient id="ao-core-grad"><stop offset="0" class="ao-stop-a" stop-opacity=".9"/><stop offset="1" class="ao-stop-b"/></radialGradient></defs>
        <circle class="ao-ring-thin" cx="150" cy="150" r="104"/>
        <circle class="ao-ring-dash" cx="150" cy="150" r="92"/>
        ${segs.map(s => `<path class="ao-seg" data-module="${modules[s.i]}" data-state="idle" d="${s.d}"/>`).join('')}
        <g class="ao-orbit">${sats.map(s => `<circle class="ao-sat" data-probe="${probes[s.i]}" data-state="idle" cx="${s.x}" cy="${s.y}" r="4"/>`).join('')}</g>
        <g class="ao-core-c"><circle cx="150" cy="150" r="78" fill="url(#ao-core-grad)"/><circle class="ao-core-disc" cx="150" cy="150" r="66"/></g>
        <circle class="ao-ripple" cx="150" cy="150" r="130"/>
      </svg>
      <div class="ao-center"><div class="ao-center-n" aria-live="polite"></div><div class="ao-center-l"></div></div>`
    const q = s => el.querySelector(s)
    const orbit = q('.ao-orbit'), ripple = q('.ao-ripple'), n = q('.ao-center-n'), l = q('.ao-center-l')
    const set = (sel, state) => { const t = q(sel); if (t) t.setAttribute('data-state', state) }
    return {
      probe(id, state) { set(`[data-probe="${id}"]`, state) },
      module(id, state) { set(`[data-module="${id}"]`, state) },
      allModules(state, only) { el.querySelectorAll('[data-module]').forEach(m => m.setAttribute('data-state', only && !only.includes(m.dataset.module) ? 'idle' : state)) },
      level(v) { el.style.setProperty('--ao-level', String(Math.max(0, Math.min(1, v)))) },
      center(text, label) { if (n.textContent !== String(text)) n.textContent = text; if (l.textContent !== String(label || '')) l.textContent = label || '' },
      scanning(on) { orbit.classList.toggle('is-still', !on) },
      pulse() { ripple.classList.remove('go'); void ripple.getBoundingClientRect(); ripple.classList.add('go') },
      phase(name) { el.dataset.phase = name },
      destroy() { el.innerHTML = ''; el.classList.remove('ao-reactor') },
    }
  }

  root.JylliReactor = Object.assign({ mount }, api)
})(typeof window !== 'undefined' ? window : globalThis)
