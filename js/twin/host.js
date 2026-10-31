'use strict'
// Owns the one persistent WebGL renderer ("the twin"), the lazy loading of the three.js bundle, the low-end fallback and the
// frame loop. Pages declare <div class="j-twin-slot" data-twin-view="rig:home">; attach(slot) moves the canvas in, park() moves it
// out before the page is wiped. Until (or unless) 3D is ready the slot shows the static SVG silhouette of the same rig.
;(function (root) {
  const Lay = () => root.JylliTwinLayout, Map_ = () => root.JylliTwinMapping, Mo = () => root.JylliTwinMotion, Fb = () => root.JylliTwinFallback

  const H = {
    state: 'idle',          // idle | loading | live | static
    reason: null,           // why 3D is not running (shown in Settings)
    rig: null, layout: null, quality: 'full', slot: null, engine: null, rendererName: null,
    lastSeq: -1, visual: null, listeners: {}, loopId: 0, lastFrame: 0, lastInput: Date.now(), interacting: false, visible: true,
    probe: null, bundlePromise: null, io: null, ro: null, hoverT: 0, drag: null, retries: 0,
  }

  const on = (ev, cb) => { (H.listeners[ev] = H.listeners[ev] || []).push(cb) }
  const emit = (ev, v) => (H.listeners[ev] || []).forEach(cb => { try { cb(v) } catch {} })

  function setting() { const s = (root.settings && root.settings.visuals3d) || 'auto'; return ['auto', 'full', 'reduced', 'off'].includes(s) ? s : 'auto' }
  function readStored(name) { try { return JSON.parse(localStorage.getItem('jt_twin_q') || '{}')[name] || null } catch { return null } }
  function writeStored(name, q) { try { const o = JSON.parse(localStorage.getItem('jt_twin_q') || '{}'); o[name] = q; localStorage.setItem('jt_twin_q', JSON.stringify(o)) } catch {} }

  function readAccentRGB() {
    try {
      const el = document.createElement('i'); el.style.color = 'var(--c-accent)'; el.style.display = 'none'; document.body.appendChild(el)
      const m = getComputedStyle(el).color.match(/[\d.]+/g); el.remove()
      if (m && m.length >= 3) return [m[0] / 255, m[1] / 255, m[2] / 255]
    } catch {}
    return [0.55, 0.49, 0.96]
  }

  function parkEl() {
    let p = document.getElementById('twin-park')
    if (!p) { p = document.createElement('div'); p.id = 'twin-park'; p.setAttribute('aria-hidden', 'true'); p.style.cssText = 'position:fixed;left:-9999px;top:0;width:8px;height:8px;overflow:hidden'; document.body.appendChild(p) }
    return p
  }

  async function ensureRig() {
    if (H.rig) return H.rig
    try { const r = await root.api.getHardwareInventory(); if (r && r.ok) { H.rig = r.rig; H.layout = Lay().layoutRig(H.rig) } } catch {}
    if (!H.layout) { H.layout = Lay().layoutRig({}); H.rig = null }
    return H.rig
  }

  /** Cheap probe before the 700 KB bundle is fetched: no hardware WebGL (or only software rendering) means the silhouette stays. */
  function webglAvailable() {
    try {
      const c = document.createElement('canvas')
      const gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: true }) || c.getContext('webgl', { failIfMajorPerformanceCaveat: true })
      if (!gl) return false
      const ext = gl.getExtension('WEBGL_debug_renderer_info')
      H.rendererName = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
      const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext()
      return true
    } catch { return false }
  }

  function loadBundle() {
    if (root.THREE && root.THREE.Addons) return Promise.resolve(true)
    if (H.bundlePromise) return H.bundlePromise
    H.bundlePromise = new Promise(res => {
      const s = document.createElement('script')
      s.src = root.JYLLI_TWIN_BUNDLE || 'js/vendor/three.bundle.js'
      s.onload = () => res(!!(root.THREE && root.THREE.Addons))
      s.onerror = () => res(false)
      document.head.appendChild(s)
    })
    return H.bundlePromise
  }

  function renderFallback(slot) {
    const lay = H.layout || Lay().layoutRig({})
    const label = typeof tUI === 'function' ? tUI('twinAria') : 'PC'
    let svg = slot.querySelector('.j-twin-fallback')
    if (!svg) { svg = document.createElement('div'); svg.className = 'j-twin-fallback'; slot.prepend(svg) }
    svg.innerHTML = Fb().svgFor(lay, H.visual, { label })
  }

  async function attach(slot) {
    if (!slot) return
    H.slot = slot
    slot.classList.add('j-twin-slot-ready')
    await ensureRig()
    if (H.slot !== slot) return                  // navigated away while the inventory was loading
    renderFallback(slot)
    const want = setting()
    if (want === 'off') { H.state = 'static'; H.reason = 'off-by-setting'; return }
    if (H.engine) { mount(slot); return }
    H.state = 'loading'
    const idle = root.requestIdleCallback || (cb => setTimeout(cb, 120))
    idle(async () => {
      if (H.slot !== slot) return
      if (!webglAvailable()) { H.state = 'static'; H.reason = 'webgl-unavailable'; return }
      if (Mo().isSoftwareRenderer(H.rendererName)) { H.state = 'static'; H.reason = 'software-renderer'; return }
      const ok = await loadBundle()
      if (!ok) { H.state = 'static'; H.reason = 'bundle-missing'; return }
      if (H.slot !== slot) return
      startEngine(slot)
    })
  }

  function startEngine(slot, forceQuality) {
    let eng
    try {
      const startQ = forceQuality || Mo().startQuality(setting(), { stored: readStored(H.rendererName || '') })
      if (startQ === 'static') { H.state = 'static'; H.reason = 'quality-static'; return }
      H.quality = startQ
      eng = root.JylliTwinEngine.create({ accent: readAccentRGB(), quality: startQ })
    } catch (e) {
      H.state = 'static'; H.reason = 'webgl-unavailable'; H.error = String(e && e.message || e)
      return
    }
    H.rendererName = eng.rendererName
    if (Mo().isSoftwareRenderer(eng.rendererName)) { eng.dispose(); H.state = 'static'; H.reason = 'software-renderer'; return }
    H.engine = eng
    eng.build(H.layout)
    eng.setView('home', { snap: true })
    eng.domElement.addEventListener('webglcontextlost', e => {
      e.preventDefault()
      const slot2 = H.slot
      teardown('context-lost')
      // one retry with a fresh renderer; a second loss stays on the static silhouette
      if (H.retries++ < 1 && slot2) setTimeout(() => { if (H.slot === slot2 && !H.engine) { slot2.querySelectorAll('canvas').forEach(c => c.remove()); startEngine(slot2) } }, 800)
    })
    bindInput(eng.domElement)
    mount(slot)
    H.probe = { frames: [], start: performance.now(), last: 0 }
    H.state = 'live'
    startLoop()
  }

  function mount(slot) {
    const c = H.engine.domElement
    if (c.parentElement !== slot) slot.appendChild(c)
    sizeToSlot()
    slot.classList.add('j-twin-live')
    if (!H.ro && root.ResizeObserver) { H.ro = new ResizeObserver(sizeToSlot); H.ro.observe(slot) }
    if (!H.io && root.IntersectionObserver) { H.io = new IntersectionObserver(es => { H.visible = es[0].isIntersecting }); H.io.observe(slot) }
    if (!H.loopId && H.state === 'live') startLoop()
  }

  function sizeToSlot() {
    if (!H.engine || !H.slot) return
    const r = H.slot.getBoundingClientRect()
    if (r.width < 4 || r.height < 4) return
    H.engine.resize(Math.round(r.width), Math.round(r.height), root.devicePixelRatio || 1)
  }

  function park() {
    if (H.ro) { H.ro.disconnect(); H.ro = null }
    if (H.io) { H.io.disconnect(); H.io = null }
    if (H.engine) parkEl().appendChild(H.engine.domElement)
    if (H.slot) H.slot.classList.remove('j-twin-live')
    H.slot = null
    stopLoop()
  }

  function teardown(reason) {
    stopLoop()
    if (H.engine) { try { H.engine.dispose() } catch {} H.engine = null }
    H.state = 'static'; H.reason = reason
    if (H.slot) { H.slot.classList.remove('j-twin-live'); renderFallback(H.slot) }
  }

  // ── frame loop ────────────────────────────────────────────────────────────────────
  function startLoop() { if (H.loopId) return; H.lastFrame = performance.now(); H.loopId = requestAnimationFrame(tick) }
  function stopLoop() { if (H.loopId) cancelAnimationFrame(H.loopId); H.loopId = 0 }
  function tick(now) {
    H.loopId = requestAnimationFrame(tick)
    if (!H.engine || !H.slot) return
    const fps = H.probe ? 60 : Mo().targetFps({
      visible: document.visibilityState === 'visible' && H.visible,
      gameForeground: !!(root._systemContext && root._systemContext.gameRunning),
      msSinceInput: Date.now() - H.lastInput, interacting: H.interacting || !H.engine.settled(),
    })
    if (fps === 0) return
    const dt = (now - H.lastFrame) / 1000
    if (!H.probe && dt < 1 / fps - 0.002) return   // uncapped while probing so the intervals show what the GPU can do
    H.lastFrame = now
    const snap = root.JylliTelemetry && root.JylliTelemetry.state.snap
    if (snap && snap.seq !== H.lastSeq) { H.lastSeq = snap.seq; H.visual = Map_().visualState(snap); H.engine.setState(H.visual) }
    H.engine.render(Math.min(dt, 0.1))
    if (H.probe) {
      if (document.visibilityState === 'visible' && dt > 0 && dt < 0.25) H.probe.frames.push(dt * 1000)
      if (performance.now() - H.probe.start > 2500 && H.probe.frames.length >= 30) {
        const p90 = Mo().percentile(H.probe.frames.slice(5), 90), next = Mo().nextQuality(H.quality, p90)
        H.probe = null
        if (next !== H.quality) stepDown(next)
        else writeStored(H.rendererName, H.quality)
      }
    }
  }
  function stepDown(next) {
    const slot = H.slot
    const was = H.engine
    stopLoop(); if (was) { try { was.dispose() } catch {} } H.engine = null
    writeStored(H.rendererName, next)
    if (next === 'static') { H.state = 'static'; H.reason = 'too-slow'; if (slot) { slot.classList.remove('j-twin-live'); slot.querySelectorAll('canvas').forEach(c => c.remove()) } return }
    if (slot) { slot.querySelectorAll('canvas').forEach(c => c.remove()); startEngine(slot, next) }
  }

  // ── input ─────────────────────────────────────────────────────────────────────────
  function bindInput(cv) {
    const touch = () => { H.lastInput = Date.now() }
    cv.addEventListener('pointermove', e => {
      touch()
      if (H.drag) {
        const dx = e.clientX - H.drag.x, dy = e.clientY - H.drag.y
        if (Math.abs(dx) + Math.abs(dy) > 3) H.drag.moved = true
        H.engine.nudge(dx * 0.006, dy * 0.004); H.drag.x = e.clientX; H.drag.y = e.clientY; H.interacting = true; return
      }
      const n = performance.now(); if (n - H.hoverT < 50) return; H.hoverT = n
      const id = H.engine.pick(e.clientX, e.clientY)
      H.engine.setHover(id); cv.style.cursor = id ? 'pointer' : 'grab'
      emit('hover', id)
    })
    cv.addEventListener('pointerdown', e => { touch(); H.drag = { x: e.clientX, y: e.clientY, moved: false }; try { cv.setPointerCapture(e.pointerId) } catch {} })
    const up = e => {
      if (!H.drag) return
      const moved = H.drag.moved; H.drag = null; H.interacting = false; H.engine && H.engine.release()
      if (!moved && H.engine) { const id = H.engine.pick(e.clientX, e.clientY); if (id) select(id) }
    }
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up)
    cv.addEventListener('pointerleave', () => { if (!H.drag && H.engine) { H.engine.setHover(null); emit('hover', null) } })
  }

  // ── assembly: parts appear one by one, from what detection actually found; skippable, never longer than ~6 s ──
  const STAGE_OF = id => id === 'cpu' || id === 'cooler' ? 'cpu' : id.startsWith('ram') ? 'ram' : id === 'gpu' || id === 'gpu-laptop' ? 'gpu' : id.startsWith('drive') ? 'disk' : 'board'
  const ORDER = ['board', 'cpu', 'ram', 'gpu', 'disk']
  /** Returns a promise that resolves when assembly ends (finished or skipped). Without live 3D it resolves at once. */
  function assemble({ reduced = false } = {}) {
    return new Promise(resolve => {
      const eng = H.engine
      if (!eng || H.state !== 'live' || reduced) { resolve('skipped'); return }
      const shown = new Map()
      const all = eng.partIds()
      const set = stage => { all.forEach(id => { if (STAGE_OF(id) === stage) shown.set(id, true) }); eng.setReveal(new Map(shown)) }
      eng.setReveal(new Map())
      let i = 0, done = false
      const finish = why => { if (done) return; done = true; clearInterval(t); document.removeEventListener('keydown', onKey); eng.setReveal(null); H.assembling = false; resolve(why) }
      const onKey = e => { if (e.key === 'Escape') finish('skipped') }
      document.addEventListener('keydown', onKey)
      H.assembling = true; H.skipAssembly = () => finish('skipped')
      const t = setInterval(() => { if (i < ORDER.length) { set(ORDER[i]); emit('assemble', ORDER[i]); i++ } else finish('done') }, 850)
      set(ORDER[i]); emit('assemble', ORDER[i]); i++
    })
  }

  function select(id) { if (H.engine) H.engine.focus(id); emit('select', id) }
  function back() { if (H.engine) H.engine.focus(null); emit('select', null) }

  /** Rows for the inspector: which metrics a part can show. Values are rendered by JylliTelemetry via data-metric. */
  function partInfo(id) {
    const p = H.layout && H.layout.parts.find(x => x.id === id)
    if (!p) return null
    return { id: p.id, kind: p.kind, label: p.label || p.id, ghost: !!p.ghost, info: p.info || {}, metrics: p.metrics || [], note: p.note || null }
  }

  async function setRigDeclared() { H.rig = null; H.layout = null; await ensureRig(); if (H.engine) H.engine.build(H.layout); if (H.slot) renderFallback(H.slot) }

  root.JylliTwin = {
    attach, park, select, back, on, partInfo, setRigDeclared, assemble, skipAssembly() { H.skipAssembly && H.skipAssembly() },
    get state() { return H.state }, get reason() { return H.reason }, get quality() { return H.quality }, get rendererName() { return H.rendererName },
    get layout() { return H.layout }, get rig() { return H.rig },
    applySetting() { if (H.slot) { const s = H.slot; park(); teardownEngine(); attach(s) } },
  }
  function teardownEngine() { if (H.engine) { try { H.engine.dispose() } catch {} H.engine = null } H.state = 'idle'; H.reason = null }
})(typeof window !== 'undefined' ? window : globalThis)
