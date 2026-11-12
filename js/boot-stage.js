'use strict'
// Boot stage: while the loading screen detects the machine, the rig twin assembles itself next to the ledger, one part per
// detection result that really arrived (never on a timer), with a thin leader line from each ledger row to its part. When the
// scan is done the same canvas travels to Home's twin slot (js/twin/host.js bootEnd), so Home opens with the rig already built.
// Without live 3D the static SVG silhouette gets the same beats. The pure helpers are unit-tested.
;(function (root) {
  // Ledger step -> what it builds. vram adds to the GPU, os switches the lights on.
  const STEP_TO_STAGE = { cpu: 'cpu', ram: 'ram', gpu: 'gpu', vram: 'gpu', storage: 'disk', display: 'shell', board: 'board', os: 'power' }

  /** The part a ledger step points at: parts = layout.parts, stageOf = host.bootStageOf. Detected parts win over ghosts. */
  function partForStep(parts, step, stageOf) {
    const stage = STEP_TO_STAGE[step]
    if (!stage || stage === 'power') return null
    const inStage = parts.filter(p => !p.decor && stageOf(p) === stage)
    if (stage === 'gpu') return (inStage.find(p => p.kind === 'gpu' || p.kind === 'gpu-laptop') || inStage[0] || { id: null }).id
    return (inStage.find(p => !p.ghost && p.kind !== 'ram-slot') || inStage.find(p => !p.ghost) || inStage[0] || { id: null }).id
  }

  /** Elbow leader: out of the row's right edge, along a lane of its own (so neighbouring lines do not run on top of each other),
   *  then straight to the part. Both points are clamped into `bounds` ({w,h}) when given. */
  function leaderPath(a, b, lane = 0, bounds = null) {
    const cl = (v, max) => bounds ? Math.max(0, Math.min(max, v)) : v
    const bx = cl(b.x, bounds && bounds.w), by = cl(b.y, bounds && bounds.h)
    const mid = Math.min(a.x + 26 + lane * 10, Math.max(a.x + 8, bx - 8))
    const r = v => Math.round(v * 10) / 10
    return `M${r(a.x)} ${r(a.y)}H${r(mid)}L${r(bx)} ${r(by)}`
  }

  const api = { STEP_TO_STAGE, partForStep, leaderPath }
  root.JylliBootStagePure = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  // ── runtime ──────────────────────────────────────────────────────────────────────
  const NS = 'http://www.w3.org/2000/svg'
  const reduced = () => document.body.classList.contains('motion-reduced') || (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const wait = ms => new Promise(r => setTimeout(r, ms))
  const Tw = () => root.JylliTwin

  const S = { on: false, slot: null, svg: null, leaders: new Map(), stages: new Set(), raf: 0, skipped: false, power: 0, svgFor: null }

  function ensureLeader(step) {
    let l = S.leaders.get(step)
    if (l) return l
    const path = document.createElementNS(NS, 'path'), dot = document.createElementNS(NS, 'circle')
    path.setAttribute('class', 'boot-leader'); path.setAttribute('pathLength', '1'); dot.setAttribute('class', 'boot-leader-dot'); dot.setAttribute('r', '3')
    const ret = document.createElementNS(NS, 'path'); ret.setAttribute('class', 'boot-reticle')
    S.svg.appendChild(path); S.svg.appendChild(ret); S.svg.appendChild(dot)
    l = { step, path, dot, ret, part: null, drawn: false, lane: Object.keys(STEP_TO_STAGE).indexOf(step) }
    S.leaders.set(step, l)
    return l
  }

  function anchorOf(l) {
    const T = Tw()
    if (!l.part) return null
    if (T.state === 'live') {
      const p = T.bootAnchor(l.part), r = S.slot.getBoundingClientRect()
      return p ? { x: r.left + p.x, y: r.top + p.y } : null
    }
    const el = S.slot.querySelector('[data-part="' + l.part + '"]')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
  }

  // Static silhouette: rects of a stage fade in (css: .boot-stage .j-twin-part:not([data-in]) is hidden)
  function syncSvg() {
    const lay = Tw().layout; if (!lay) return
    for (const p of lay.parts) {
      const el = S.slot.querySelector('.j-twin-fallback [data-part="' + p.id + '"]')
      if (el && S.stages.has(Tw().bootStageOf(p))) el.setAttribute('data-in', '')
    }
  }

  function frame() {
    S.raf = requestAnimationFrame(frame)
    syncSvg()
    for (const l of S.leaders.values()) {
      if (!l.part && Tw().layout) l.part = partForStep(Tw().layout.parts, l.step, Tw().bootStageOf)   // the inventory can arrive after the step
      const row = document.getElementById('lstep-' + l.step), b = anchorOf(l)
      const rr = row && row.getBoundingClientRect()
      if (!row || !b || !rr.width) { l.path.style.opacity = l.dot.style.opacity = l.ret.style.opacity = '0'; continue }   // folded rows (VRAM) have no box: they share the GPU's line
      const a = { x: rr.right + 6, y: rr.top + rr.height / 2 }
      l.path.setAttribute('d', leaderPath(a, b, l.lane, { w: innerWidth, h: innerHeight }))
      l.dot.setAttribute('cx', b.x); l.dot.setAttribute('cy', b.y)
      const R = 11, c = 4   // reticle: four corner ticks around the part
      l.ret.setAttribute('d', `M${b.x - R} ${b.y - R + c}V${b.y - R}H${b.x - R + c}M${b.x + R - c} ${b.y - R}H${b.x + R}V${b.y - R + c}M${b.x + R} ${b.y + R - c}V${b.y + R}H${b.x + R - c}M${b.x - R + c} ${b.y + R}H${b.x - R}V${b.y + R - c}`)
      l.path.style.opacity = l.dot.style.opacity = l.ret.style.opacity = ''
      if (!l.drawn) { l.drawn = true; requestAnimationFrame(() => { l.path.classList.add('is-drawn'); l.ret.classList.add('is-lock') }) }
    }
  }

  function stage(name) {
    if (S.stages.has(name)) return
    S.stages.add(name)
    Tw().bootStage(name)
  }

  function powerOn(instant) {
    if (S.power >= 1) return
    if (instant || reduced()) { S.power = 1; Tw().bootPower(1); return }
    const t0 = performance.now()
    const tick = now => {
      const t = Math.min(1, (now - t0) / 900)
      S.power = t; Tw().bootPower(1 - Math.pow(1 - t, 3))
      if (t < 1 && S.on) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  function start() {
    const T = Tw(), slot = document.getElementById('boot-twin-slot'), svg = document.getElementById('boot-leaders')
    if (!T || !slot || !svg || !T.bootBegin) return
    S.on = true; S.slot = slot; S.svg = svg
    try { slot.setAttribute('aria-label', tUI('bootStageAria')) } catch {}
    T.bootBegin(slot)
    stage('shell'); stage('board')
    S.raf = requestAnimationFrame(frame)
    const skip = () => { if (S.skipped) return; S.skipped = true; ['cpu', 'ram', 'gpu', 'disk'].forEach(stage); T.bootRevealAll(); powerOn(true) }
    S.skip = skip
    document.getElementById('boot-skip')?.addEventListener('click', skip)
    slot.addEventListener('click', skip)
    document.addEventListener('keydown', S.onKey = e => { if (e.key === 'Escape') skip() })
    for (const id of Object.keys(STEP_TO_STAGE)) {
      const row = document.getElementById('lstep-' + id)
      if (!row) continue
      row.addEventListener('mouseenter', () => { const l = S.leaders.get(id); if (l) { l.path.classList.add('is-hot'); T.bootPulse(l.part) } })
      row.addEventListener('mouseleave', () => { const l = S.leaders.get(id); if (l) l.path.classList.remove('is-hot') })
    }
  }

  function onStepActive(id) { if (S.on && id === 'os') powerOn(false) }

  function onStepDone(id) {
    if (!S.on) return
    const st = STEP_TO_STAGE[id]
    if (st === 'power') { powerOn(false); return }
    stage(st)
    const T = Tw(), lay = T.layout
    const l = ensureLeader(id)
    l.part = lay ? partForStep(lay.parts, id, T.bootStageOf) : null
  }

  /** Scan complete: the lights are on, everything is in; the stage travels to Home's slot, then the overlay lets go. */
  async function finish() {
    const T = Tw(), ov = document.getElementById('loading')
    if (!S.on) return
    ['cpu', 'ram', 'gpu', 'disk'].forEach(stage); T.bootRevealAll(); powerOn(true)
    const wrap = S.slot
    ov && ov.classList.add('handoff')
    T.bootSettle()
    const quick = reduced()
    await wait(quick ? 0 : 260)
    let pending = T.bootPending
    for (let i = 0; !pending && i < 12; i++) { await wait(50); pending = T.bootPending }   // Home renders right after the scan ends
    if (pending && T.state === 'live' && !quick) {
      const from = wrap.getBoundingClientRect(), to = pending.getBoundingClientRect()
      if (to.width > 40 && to.height > 40) {
        wrap.style.transformOrigin = '0 0'
        wrap.style.transition = 'transform 560ms cubic-bezier(.2,.8,.2,1)'
        wrap.style.transform = `translate(${to.left - from.left}px,${to.top - from.top}px) scale(${to.width / from.width},${to.height / from.height})`
        await wait(580)
      }
    }
    S.on = false
    cancelAnimationFrame(S.raf)
    document.removeEventListener('keydown', S.onKey)
    T.bootEnd()
    if (ov) { ov.classList.add('handoff-done'); await wait(quick ? 0 : 240) }
    wrap.style.transform = wrap.style.transition = ''
  }

  root.JylliBootStage = { start, onStepActive, onStepDone, finish, get active() { return S.on } }
})(typeof window !== 'undefined' ? window : globalThis)
