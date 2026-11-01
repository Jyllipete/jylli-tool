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

  function attach(slot) {
    const w = worldOn() && document.getElementById('world-slot')
    if (!w || (H.boot && H.boot.slot)) return attachSlot(slot)
    H.worldSlot = w
    if (slot && slot !== w) setWindow(slot)
    return H.slot === w ? Promise.resolve() : attachSlot(w)
  }

  async function attachSlot(slot) {
    if (!slot) return
    // While the boot stage owns the canvas, a page that wants it waits: bootEnd() hands it over after the transition.
    if (H.boot && H.boot.slot && slot !== H.boot.slot) { H.boot.pending = slot; return }
    H.slot = slot
    slot.classList.add('j-twin-slot-ready')
    await ensureRig()
    if (H.slot !== slot) return                  // navigated away while the inventory was loading
    renderFallback(slot)
    const want = setting()
    if (want === 'off') { H.state = 'static'; H.reason = 'off-by-setting'; return }
    if (H.engine) { H.state = 'live'; mount(slot); return }
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
      if (H.engine !== eng) return   // a disposed engine's forced context loss must not tear down its replacement
      const slot2 = H.slot
      teardown('context-lost')
      // one retry with a fresh renderer; a second loss stays on the static silhouette
      if (H.retries++ < 1 && slot2) setTimeout(() => { if (H.slot === slot2 && !H.engine) { slot2.querySelectorAll('canvas').forEach(c => c.remove()); startEngine(slot2) } }, 800)
    })
    bindInput(eng.domElement)
    mount(slot)
    H.probe = H.boot ? null : { frames: [], start: performance.now(), last: 0 }   // boot is PowerShell-heavy: frame times are noisy, so probing waits for bootEnd
    H.state = 'live'
    startLoop()
  }

  /** data-twin-view: "rig:home" (whole PC) or "rig:gpu" (the card isolated and framed). */
  function applyView(slot) {
    if (!H.engine || !slot) return
    const v = (slot.dataset.twinView || 'rig:home').split(':')[1] || 'home'
    H.view = v
    if (v === 'boot') { H.engine.setBoot(true); H.engine.setPowered(H.boot && H.boot.powered ? 1 : 0); H.engine.setReveal(new Map()); H.engine.setView('boot', { snap: true }); applyBoot(); return }
    H.engine.setBoot(false); H.engine.setPowered(1)
    if (v === 'gpu') { H.engine.setView('gpu', { snap: false }); H.engine.setReveal(H.worldSlot ? null : new Map([['gpu', 1], ['board', 1]])) }
    else { H.engine.setReveal(null); H.engine.setView('home', { snap: false }) }
    if (H.worldSlot && slot.dataset.twinFocus) H.engine.focus(slot.dataset.twinFocus)
  }

  // ── world mode (4.0): the canvas lives in #world-slot behind the whole app. A page's hero slot is only a "window": the rig is
  // centred on it and the camera takes the slot's shot, but the scene keeps showing through the glass around it. ──
  const worldOn = () => !!(root.JylliWorld && root.JylliWorld.enabled())
  function worldClass() { const w = H.worldSlot && H.worldSlot.parentElement; if (w) w.classList.toggle('has-window', !!H.win) }
  function setWindow(slot) {
    H.win = slot; worldClass()
    try { renderFallback(slot) } catch {}   // shown only while 3D is not running (css: body.world-live hides it)
    if (H.engine) { applyView(slot); syncCenter(true) }
  }
  function syncCenter(snap) {
    if (!H.engine || !H.worldSlot) return
    if (!H.win || !H.win.isConnected) { H.engine.setCenter(null); return }
    const r = H.win.getBoundingClientRect(), w = H.worldSlot.getBoundingClientRect()
    if (r.width < 4) { H.engine.setCenter(null); return }
    // a window smaller than the screen gets a proportionally smaller rig, so it stays inside its frame instead of covering the cards around it
    // only the part of the window that is on screen counts: a hero scrolled mostly out of view lets the rig drift back to the middle
    const top = Math.max(r.top, w.top), bottom = Math.min(r.bottom, w.bottom), vis = bottom - top
    if (vis < r.height * 0.35 || vis < 80) { H.engine.setCenter(null); return }
    const zoom = Math.max(0.4, Math.min(1, (vis / Math.max(w.height, 1)) * 1.05))
    H.engine.setCenter(r.left + r.width / 2 - w.left, (top + bottom) / 2 - w.top, snap, zoom)
  }
  /** Leave world mode (Classic, light scheme): the canvas goes back to the park and pages host it in their own slots again. */
  function exitWorld() {
    if (!H.worldSlot) return
    stopLoop(); H.win = null
    if (H.engine) { H.engine.setCenter(null); parkEl().appendChild(H.engine.domElement) }
    H.worldSlot.classList.remove('j-twin-live'); H.slot = null; H.worldSlot = null; H.wl = false
    document.body.classList.remove('world-live')
  }
  /** A page without a hero slot asks for a camera shot of one part (null = the whole rig). */
  function shot(id) { if (!H.engine) return; H.engine.setReveal(null); if (id) H.engine.focus(id); else H.engine.setView('home', { snap: false }) }

  function mount(slot) {
    const c = H.engine.domElement
    if (c.parentElement !== slot) slot.appendChild(c)
    sizeToSlot()
    slot.classList.add('j-twin-live')
    applyView(H.win || slot); if (H.worldSlot) syncCenter(true)
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
    if (H.worldSlot && H.slot === H.worldSlot) { H.win = null; worldClass(); if (H.engine) H.engine.setCenter(null); return }   // the world canvas never leaves its slot
    if (H.ro) { H.ro.disconnect(); H.ro = null }
    if (H.io) { H.io.disconnect(); H.io = null }
    if (H.engine) parkEl().appendChild(H.engine.domElement)
    if (H.slot) H.slot.classList.remove('j-twin-live')
    H.slot = null
    stopLoop()
  }

  function teardown(reason) {
    if (H.worldSlot) { H.wl = false; document.body.classList.remove('world-live') }
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
      gameForeground: !!(root._gameRunning || (root._systemContext && root._systemContext.gameRunning)),
      msSinceInput: Date.now() - H.lastInput, interacting: H.interacting || !!H.boot || !H.engine.settled(),
    })
    if (fps === 0) return
    const dt = (now - H.lastFrame) / 1000
    if (!H.probe && dt < 1 / fps - 0.002) return   // uncapped while probing so the intervals show what the GPU can do
    H.lastFrame = now
    const snap = root.JylliTelemetry && (root.JylliTelemetry.state.override || root.JylliTelemetry.state.snap)
    if (H.worldSlot) { syncCenter(); const live = H.state === 'live'; if (live !== H.wl) { H.wl = live; document.body.classList.toggle('world-live', live) } }
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
    if (H.worldSlot) { H.wl = false; document.body.classList.remove('world-live') }
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

  // ── boot stage: the loading screen assembles the rig as detection results arrive (js/boot-stage.js drives it) ──
  // Stages: 'shell' (case, PSU, fans: decor), then board/cpu/ram/gpu/disk. Reveal follows what boot-stage reports, never a timer.
  const bootStageOf = p => p.decor ? 'shell' : STAGE_OF(p.id)
  function applyBoot() {
    const eng = H.engine, b = H.boot
    if (!eng || !b || !H.layout) return
    const m = new Map()
    for (const p of H.layout.parts) if (b.all || b.stages.has(bootStageOf(p))) m.set(p.id, true)
    eng.revealTo(m)
  }
  /** Start the boot stage in `slot` (a .j-twin-slot inside the loading screen). Resolves once the slot has its fallback/engine path. */
  function bootBegin(slot) {
    H.boot = { slot, stages: new Set(), all: false, powered: false, pending: null }
    H.bootActive = true
    slot.dataset.twinView = 'rig:boot'
    return attach(slot)
  }
  function bootStage(stage) {
    const b = H.boot; if (!b || b.stages.has(stage)) return
    b.stages.add(stage)
    applyBoot()
    if (H.engine && H.layout) for (const p of H.layout.parts) if (!p.decor && bootStageOf(p) === stage) H.engine.pulse(p.id)
    emit('assemble', stage)
  }
  function bootPower(t) { if (H.boot) { H.boot.powered = t >= 1 }; if (H.engine && H.boot) H.engine.setPowered(t) }
  function bootRevealAll() { if (H.boot) { H.boot.all = true; applyBoot() } }
  /** Anchor of a part (by stage-level id) in CSS px inside the boot slot, or null. Used for the leader lines. */
  function bootAnchor(id) { return H.engine && H.boot ? H.engine.screenPos(id) : null }
  function bootPulse(id) { if (H.engine && H.boot) H.engine.pulse(id) }
  /** Handoff starts: stop the drift and let the camera spring to the Home framing while the stage travels to its slot. */
  function bootSettle() { if (H.engine && H.boot) { H.engine.setBoot(false); H.engine.setView('home', { snap: false }) } }
  /** Boot is over: give the canvas to the page that asked for it while boot held it. */
  function bootEnd() {
    const b = H.boot; if (!b) return
    const pending = b.pending
    H.assembledByBoot = !!(H.engine && H.state === 'live')
    H.boot = null; H.bootActive = false
    park()
    if (H.engine) { H.engine.setBoot(false); H.engine.setPowered(1); H.engine.setReveal(null); H.probe = { frames: [], start: performance.now(), last: 0 } }
    if (pending) attach(pending)
    else if (worldOn()) attach(null)
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
    attach, park, shot, exitWorld, select, back, on, partInfo,
    get win() { return H.win },
    anchor(id) { return H.engine && H.slot ? H.engine.screenPos(id) : null },   // CSS px relative to the canvas, null when unknown or behind the camera
    pulse(id) { if (H.engine) H.engine.pulse(id) },
    partIds() { return H.engine ? H.engine.partIds() : [] }, setRigDeclared, assemble, skipAssembly() { H.skipAssembly && H.skipAssembly() },
    bootBegin, bootStage, bootPower, bootRevealAll, bootAnchor, bootPulse, bootSettle, bootEnd, bootStageOf,
    get bootPending() { return (H.boot && H.boot.pending) || null },
    get bootActive() { return !!H.bootActive }, get bootAssembled() { return !!H.assembledByBoot },
    get state() { return H.state }, get reason() { return H.reason }, get quality() { return H.quality }, get rendererName() { return H.rendererName },
    get layout() { return H.layout }, get rig() { return H.rig },
    applySetting() { if (H.slot) { const s = H.slot; park(); teardownEngine(); attach(s) } },
  }
  function teardownEngine() { if (H.engine) { try { H.engine.dispose() } catch {} H.engine = null } H.state = 'idle'; H.reason = null }
})(typeof window !== 'undefined' ? window : globalThis)
