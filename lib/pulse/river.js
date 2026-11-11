'use strict'
// Frame River geometry. Pure: turns river columns (see frames.js) into points and bezier segments for a canvas, so the tab,
// the Cockpit and the HUD ribbon draw the same river and node:test can check it. No DOM here.
;(function (root) {
  const Attr = (typeof module !== 'undefined' && module.exports) ? require('./attribution') : root.JylliPulseAttribution
  const Frames = (typeof module !== 'undefined' && module.exports) ? require('./frames') : root.JylliPulseFrames
  const CAP = Frames.COL_CAP

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

  /** Typical frame time of the window: median of the column medians. */
  function typical(cols) {
    const m = cols.map(c => c.med).filter(v => v != null).sort((a, b) => a - b)
    return Frames.median(m)
  }

  /** Indexes of columns whose slowest frame is a hitch (same limit as the session debrief). */
  function hitchIndexes(cols) {
    const limit = Attr.hitchLimit(typical(cols))
    if (limit == null) return { limit: null, idx: [] }
    const idx = []
    cols.forEach((c, i) => { if (c.hi >= limit) idx.push(i) })
    return { limit, idx }
  }

  /**
   * cols -> { n, step, yMax, medianMs, limit, mid, hi, lo, hitches, x(i), y(ms) }
   * New columns enter at the right edge; the window always spans `cap` columns, so the river flows left as it fills.
   * Frame time is drawn upwards = slower, scaled to the typical frame time so a 60 fps and a 240 fps game fill the same height.
   */
  function shape(cols, w, h, o) {
    o = o || {}
    const cap = o.cap || CAP, pad = o.pad == null ? 4 : o.pad
    const n = cols.length
    const step = (w - pad * 2) / Math.max(1, cap - 1)
    const med = typical(cols)
    const yMax = med == null ? 33.4 : clamp(med * 3, 8, 120)
    const x = i => w - pad - (n - 1 - i) * step
    const y = ms => h - pad - (clamp(ms, 0, yMax) / yMax) * (h - pad * 2)
    const hit = hitchIndexes(cols)
    return {
      n, step, yMax, medianMs: med, limit: hit.limit, x, y,
      mid: cols.map((c, i) => ({ x: x(i), y: y(c.med) })),
      hi: cols.map((c, i) => ({ x: x(i), y: y(c.hi) })),
      lo: cols.map((c, i) => ({ x: x(i), y: y(c.lo) })),
      hitches: hit.idx.map(i => ({ i, x: x(i), y: y(cols[i].hi), ms: cols[i].hi, clipped: cols[i].hi > yMax })),
    }
  }

  /** Catmull-Rom through points as cubic bezier segments: [{ c1x, c1y, c2x, c2y, x, y }]. The first point is the start. */
  function bezier(pts, tension) {
    const k = tension == null ? 0.5 : tension, out = []
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)]
      out.push({ c1x: p1.x + (p2.x - p0.x) * k / 3, c1y: p1.y + (p2.y - p0.y) * k / 3, c2x: p2.x - (p3.x - p1.x) * k / 3, c2y: p2.y - (p3.y - p1.y) * k / 3, x: p2.x, y: p2.y })
    }
    return out
  }

  /** Column index nearest to an x position (for hover), or -1 when the river is empty. */
  function nearest(sh, px) {
    if (!sh.n) return -1
    return clamp(Math.round((px - sh.x(0)) / sh.step), 0, sh.n - 1)
  }

  const api = { typical, hitchIndexes, shape, bezier, nearest }
  root.JylliPulseRiver = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
