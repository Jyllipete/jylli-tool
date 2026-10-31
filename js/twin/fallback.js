'use strict'
// Static SVG silhouette of the rig, generated from the same layout as the 3D view: same parts, same ghosts, same honesty rules.
// Used instantly while the 3D bundle loads, when 3D is off or the GPU is weak, and always under jsdom. Pure string output.
;(function (root) {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

  // Case units -> a 400x300 viewBox, front view for towers (x right, y up), top view for laptops (x right, z down).
  function project(formFactor, p) {
    if (formFactor === 'laptop') return { cx: 200 + p.pos[0] * 36, cy: 150 + p.pos[2] * 36, w: p.size[0] * 36, h: p.size[2] * 36 }
    return { cx: 200 + p.pos[0] * 26, cy: 150 - p.pos[1] * 26, w: p.size[0] * 26, h: p.size[1] * 26 }
  }

  /**
   * layout: JylliTwinLayout.layoutRig(rig). state: JylliTwinMapping.visualState(snap) or null.
   * heat is only applied when the state carries a temperature; otherwise parts stay neutral.
   */
  function svgFor(layout, state, { label = 'PC' } = {}) {
    const ff = layout.formFactor
    const out = [`<svg class="j-twin-svg" viewBox="0 0 400 300" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg">`]
    for (const p of layout.parts) {
      const r = project(ff, p)
      const x = (r.cx - r.w / 2).toFixed(1), y = (r.cy - r.h / 2).toFixed(1), w = r.w.toFixed(1), h = r.h.toFixed(1)
      let cls = 'j-twin-part'
      if (p.decor) cls += ' j-twin-decor'
      if (p.ghost) cls += ' j-twin-ghost'
      let heat = ''
      const st = state && (p.id === 'cpu' ? state.cpu : p.id === 'gpu' ? state.gpu : null)
      if (st && st.heat != null) heat = ` data-heat="${st.heat > 1 ? 'hot' : st.heat > 0.4 ? 'warm' : 'cool'}"`
      const rx = p.kind === 'case' || p.kind === 'laptop-body' ? 14 : p.kind === 'gpu' || p.kind === 'psu' ? 6 : 3
      out.push(`<rect class="${cls}" data-part="${esc(p.id)}"${heat} x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/>`)
      if (p.kind === 'aio' && p.rad) {
        const rr = project(ff, { pos: p.rad.pos, size: p.rad.size })
        out.push(`<rect class="j-twin-part" data-part="radiator" x="${(rr.cx - rr.w / 2).toFixed(1)}" y="${(rr.cy - rr.h / 2).toFixed(1)}" width="${rr.w.toFixed(1)}" height="${rr.h.toFixed(1)}" rx="4"/>`)
      }
    }
    out.push('</svg>')
    return out.join('')
  }

  const api = { svgFor, project }
  root.JylliTwinFallback = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
