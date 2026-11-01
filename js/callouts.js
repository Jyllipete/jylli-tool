'use strict'
// Callouts (4.0): on Home the main parts of the rig carry a small glass plate with their live numbers, joined to the part by a thin
// line that follows the camera. The numbers are the same data-metric elements as everywhere else, so a missing sensor reads
// "Not available" with its reason and nothing is made up. Only shown when the hero window is big enough for them.
// `layout` is the pure part (unit-tested): it puts plates on the window's left and right edges, level with their part, without overlap.
;(function (root) {
  const W = 176, H = 58, GAP = 8, PAD = 12, CW = 132, CH = 48   // CW/CH: compact plates for narrower windows (one number each)

  /** anchors: [{id,x,y}] screen px. win: {left,top,right,bottom}. Returns [{id, x, y, side}] (plate top-left). */
  function layout(anchors, win, size = { w: W, h: H }) {
    const mid = (win.left + win.right) / 2, out = []
    for (const side of ['left', 'right']) {
      const list = anchors.filter(a => (a.x < mid) === (side === 'left')).sort((a, b) => a.y - b.y)
      let minY = win.top + PAD
      const x = side === 'left' ? win.left + PAD : win.right - size.w - PAD
      for (const a of list) {
        const y = Math.max(minY, Math.min(win.bottom - size.h - PAD, a.y - size.h / 2))
        out.push({ id: a.id, x, y, side }); minY = y + size.h + GAP
      }
    }
    return out
  }
  /** Big enough to host plates without covering the rig. */
  const fits = win => win && (win.right - win.left) >= 420 && (win.bottom - win.top) >= 250
  /** Full plates when the window is wide, compact ones when it is not. */
  const sizeFor = win => ((win.right - win.left) >= 600 ? { w: W, h: H, compact: false } : { w: CW, h: CH, compact: true })

  /** 40 C and below stays neutral; warming toward red at 85 C and above. */
  const heatColor = t => { const k = Math.max(0, Math.min(1, (t - 40) / 45)); return t == null || !Number.isFinite(t) || k === 0 ? '' : 'hsl(' + (210 - k * 195).toFixed(0) + ' 85% 55% / ' + (0.1 + k * 0.4).toFixed(2) + ')' }
  const api = { layout, fits, sizeFor, heatColor, SIZE: { w: W, h: H } }
  root.JylliCallouts = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  // ── runtime ──────────────────────────────────────────────────────────────────────
  // which parts carry a plate in which hero window; the heat tint reads the part's temperature key (only when a reading exists)
  const WINDOWS = { 'home-twin-slot': ['cpu', 'cooler', 'gpu', 'ram0', 'drive0'], 'gpu-twin-slot': ['gpu'], 'cpumem-twin-slot': ['cpu', 'cooler', 'ram0'], 'storage-twin-slot': ['drive0'] }
  const HEAT_KEY = { cpu: 'cpu.temp.package', gpu: 'gpu0.temp.core' }
  const NS = 'http://www.w3.org/2000/svg'
  let box, svg, items = [], tick = 0, lastWin = null
  const esc = s => (typeof escHtml === 'function' ? escHtml(s) : String(s))

  function build(win) {
    teardown()
    const lay = root.JylliTwin && JylliTwin.layout; if (!lay) return false
    box = document.createElement('div'); box.id = 'jx-callouts'; box.setAttribute('aria-hidden', 'true')   // the same numbers are in the inspector and the parts list
    svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'jx-co-lines'); box.appendChild(svg)
    for (const id of WINDOWS[win.id] || []) {
      const info = JylliTwin.partInfo(id)
      if (!info || info.ghost || !(info.metrics || []).length) continue
      const el = document.createElement('button'); el.type = 'button'; el.className = 'jx-co'; el.tabIndex = -1
      const key = { cpu: 'twinPartCpu', cooler: 'twinPartCooler', gpu: 'twinPartGpu', ram0: 'twinPartRam', drive0: 'twinPartStorage' }[id]
      el.innerHTML = `<span class="jx-co-t">${esc(tUI(key))}</span><span class="jx-co-m">${info.metrics.slice(0, 2).map(m => `<span class="j-num jx-co-n" data-odo data-metric="${esc(m)}">—</span>`).join('')}</span>`
      el.title = tUI(key)   // the full name stays reachable when a compact plate has to shorten it
      el.onclick = () => JylliTwin.select(id)
      const line = document.createElementNS(NS, 'line'), dot = document.createElementNS(NS, 'circle')
      dot.setAttribute('r', '3'); svg.append(line, dot)
      box.appendChild(el); items.push({ id, el, line, dot, p: null })
    }
    if (!items.length) { box.remove(); box = svg = null; return false }
    document.body.appendChild(box)
    try { JylliTelemetry.applyToDom() } catch {}
    return true
  }
  function teardown() { if (box) box.remove(); box = svg = null; items = [] }

  function frame() {
    if (document.visibilityState !== 'visible') return   // nothing to draw (and nothing to project) while the window is hidden
    const win = root.JylliTwin && JylliTwin.win
    const on = !!(win && WINDOWS[win.id] && document.body.classList.contains('world-on') && document.body.classList.contains('world-live') && !document.body.classList.contains('game-live'))
    if (!on) { if (box) teardown(); lastWin = null; return }
    const r = win.getBoundingClientRect(), rect = { left: r.left, top: Math.max(r.top, 56), right: r.right, bottom: Math.min(r.bottom, innerHeight - 40) }
    if (!fits(rect)) { if (box) teardown(); lastWin = null; return }
    if (!box || lastWin !== win) { if (!build(win)) return; lastWin = win }
    const anchors = items.map(i => { const a = JylliTwin.anchor(i.id); return a && { id: i.id, x: a.x, y: a.y } }).filter(Boolean)
    const size = sizeFor(rect)
    const pos = new Map(layout(anchors, rect, size).map(p => [p.id, p]))
    for (const it of items) {
      const p = pos.get(it.id), a = anchors.find(x => x.id === it.id)
      it.el.hidden = it.dot.style.display = it.line.style.display = !p ? 'none' : ''
      if (!p) { it.el.hidden = true; continue }
      it.el.hidden = false
      const heat = HEAT_KEY[it.id] && root.JylliTelemetry ? heatColor(JylliTelemetry.value(HEAT_KEY[it.id])) : ''
      if (heat !== it.heat) { it.heat = heat; it.el.style.setProperty('--heat', heat || 'transparent') }
      it.el.classList.toggle('jx-co-compact', size.compact); it.el.style.width = size.w + 'px'; it.el.style.height = size.h + 'px'
      const k = root.JylliWorld && JylliWorld.reduced() ? 1 : 0.25
      it.p = it.p ? { x: it.p.x + (p.x - it.p.x) * k, y: it.p.y + (p.y - it.p.y) * k } : { x: p.x, y: p.y }
      it.el.style.transform = `translate(${it.p.x.toFixed(1)}px,${it.p.y.toFixed(1)}px)`
      const ex = p.side === 'left' ? it.p.x + size.w : it.p.x, ey = it.p.y + size.h / 2
      it.line.setAttribute('x1', ex); it.line.setAttribute('y1', ey); it.line.setAttribute('x2', a.x); it.line.setAttribute('y2', a.y)
      it.dot.setAttribute('cx', a.x); it.dot.setAttribute('cy', a.y)
    }
  }
  function start() { if (!tick) tick = setInterval(frame, 50) }
  root.JylliCalloutsRT = { start, stop() { clearInterval(tick); tick = 0; teardown() } }
})(typeof window !== 'undefined' ? window : globalThis)
