'use strict'
// Three.js scene for the rig. Everything is procedural, built from the layout (js/twin/layout.js) and driven by the visual state
// (js/twin/mapping.js). Reads window.THREE (js/vendor/three.bundle.js). It never reads telemetry itself and holds no numbers of its
// own: with no state the rig is neutral. Not unit-tested (needs WebGL); the pure parts it relies on are.
;(function (root) {
  const Mo = () => root.JylliTwinMotion
  const Ma = () => root.JylliTwinMapping

  const VIEWS = {
    // camera target [x, y, z] and distance for each framing
    home: { look: [0.2, -0.2, -0.8], dist: 22.5, yaw: 0.4, pitch: 0.1 },
    gpu: { look: [-0.3, -1.4, -0.7], dist: 8.4, yaw: 0.34, pitch: 0.18 },
    laptop: { look: [0, 0, 0], dist: 10.5, yaw: 0.5, pitch: 0.75 },
  }
  const FOCUS_DIST = { gpu: 7.5, cpu: 6.4, cooler: 7.5, ram0: 6.5, board: 11, storage: 7 }

  function create({ accent = [0.55, 0.49, 0.96], quality = 'full', preferLowPower = true } = {}) {
    const T = root.THREE
    const A = T.Addons
    const renderer = new T.WebGLRenderer({ antialias: false, alpha: true, powerPreference: preferLowPower ? 'low-power' : 'high-performance', failIfMajorPerformanceCaveat: true })
    const gl = renderer.getContext()
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    const rendererName = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
    renderer.toneMapping = T.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.4
    renderer.setClearColor(0x000000, 0)
    const dom = renderer.domElement
    dom.className = 'j-twin-canvas'
    dom.setAttribute('aria-hidden', 'true')

    const scene = new T.Scene()
    // The composer output is opaque, so the stage backdrop (dark graphite with an accent glow, as in css/ui.css) is part of the scene.
    function backdrop(rgb) {
      const c = document.createElement('canvas'); c.width = c.height = 256
      const x = c.getContext('2d'), r = (v, k) => Math.round(v * 255 * k)
      x.fillStyle = '#08080b'; x.fillRect(0, 0, 256, 256)
      const g = x.createRadialGradient(108, 160, 4, 108, 160, 190)
      g.addColorStop(0, 'rgba(' + r(rgb[0], 1) + ',' + r(rgb[1], 1) + ',' + r(rgb[2], 1) + ',0.2)'); g.addColorStop(0.5, 'rgba(16,16,21,0.9)'); g.addColorStop(1, 'rgba(8,8,11,1)')
      x.fillStyle = g; x.fillRect(0, 0, 256, 256)
      const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t
    }
    scene.background = backdrop(accent)
    const camera = new T.PerspectiveCamera(32, 1, 0.1, 100)
    const pmrem = new T.PMREMGenerator(renderer)
    const envTex = pmrem.fromScene(new A.RoomEnvironment(), 0.04).texture
    scene.environment = envTex
    scene.environmentIntensity = 1.0
    const key = new T.DirectionalLight(0xffffff, 2.2); key.position.set(4, 8, 10); scene.add(key)
    scene.add(new T.HemisphereLight(0xb8b8ff, 0x1a1a22, 0.9))
    const rim = new T.PointLight(new T.Color(...accent), 18, 30, 2); rim.position.set(-6, 3, 4); scene.add(rim)

    let composer = null, bloom = null
    function setupComposer() {
      composer = null; bloom = null
      if (quality !== 'full') return
      const rt = new T.WebGLRenderTarget(8, 8, { type: T.HalfFloatType, samples: 4 })
      composer = new A.EffectComposer(renderer, rt)
      composer.addPass(new A.RenderPass(scene, camera))
      bloom = new A.UnrealBloomPass(new T.Vector2(512, 512), 0.55, 0.5, 0.82)   // threshold .85: only emissive parts bloom
      composer.addPass(bloom)
      composer.addPass(new A.OutputPass())
    }

    // ── materials ───────────────────────────────────────────────────────────────────────
    const accentColor = new T.Color(...accent)
    const mats = {
      metal: new T.MeshStandardMaterial({ color: 0x2a2a33, roughness: 0.38, metalness: 0.8 }),
      dark: new T.MeshStandardMaterial({ color: 0x101014, roughness: 0.55, metalness: 0.5 }),
      pcb: new T.MeshStandardMaterial({ color: 0xffffff, map: pcbTexture(T), roughness: 0.8, metalness: 0.25 }),
      silver: new T.MeshStandardMaterial({ color: 0x3a3a44, roughness: 0.65, metalness: 0.45 }),
    }
    const ghostMat = new T.LineDashedMaterial({ color: 0x9a9aa8, dashSize: 0.12, gapSize: 0.1, transparent: true, opacity: 0.45 })
    const glowMats = []   // { mat, base, ... }, driven by state
    function glowMat(strength = 1) {
      const m = new T.MeshStandardMaterial({ color: 0x060608, roughness: 0.4, metalness: 0.1, emissive: accentColor.clone(), emissiveIntensity: 0.25 })
      const g = { mat: m, strength, level: 0.25, target: 0.25, color: accentColor.clone() }
      glowMats.push(g)
      return g
    }

    // ── scene content ─────────────────────────────────────────────────────────────────
    const world = new T.Group(); scene.add(world)
    const parts = new Map()      // id -> { group, glow:[...], fans:[...], layoutPart }
    const pickables = []
    let layout = null, hoverId = null, focusId = null, fansCache = []
    let reveal = null      // null = everything shown; else Map(partId -> target 0|1), eased below

    function disposeWorld() {
      world.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && !Object.values(mats).includes(o.material) && o.material !== ghostMat) o.material.dispose?.() })
      world.clear(); parts.clear(); pickables.length = 0; glowMats.length = 0; fansCache = []
    }
    function rbox(w, h, d, r = 0.06) { return new A.RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.1, h / 2.1, d / 2.1)) }
    function add(group, mesh, partId) { mesh.userData.partId = partId; group.add(mesh); pickables.push(mesh); return mesh }
    function ghostBox(size) {
      const e = new T.EdgesGeometry(new T.BoxGeometry(size[0], size[1], size[2]))
      const l = new T.LineSegments(e, ghostMat); l.computeLineDistances(); return l
    }
    function makeFan(r, level) {
      const g = new T.Group(), spin = new T.Group(); g.add(spin)
      const bladeGeo = new T.BoxGeometry(r * 0.5, r * 0.8, 0.03)
      for (let i = 0; i < 7; i++) { const b = new T.Mesh(bladeGeo, mats.dark); b.position.set(0, r * 0.45, 0); const piv = new T.Group(); piv.rotation.z = (i / 7) * Math.PI * 2; b.rotation.y = 0.5; piv.add(b); spin.add(piv) }
      spin.add(new T.Mesh(new T.CylinderGeometry(r * 0.22, r * 0.22, 0.1, 20).rotateX(Math.PI / 2), mats.metal))
      const ring = glowMat(0.6); g.add(new T.Mesh(new T.TorusGeometry(r * 0.98, 0.04, 8, 48), ring.mat))
      g.userData = { spin, level }
      return { g, ring }
    }

    function build(lay) {
      disposeWorld()
      layout = lay
      for (const p of lay.parts) {
        const g = new T.Group(); g.position.set(...p.pos); world.add(g)
        const entry = { group: g, glow: [], fans: [], p, base: p.pos.slice(), r: 1 }
        parts.set(p.id, entry)
        if (p.decor) { buildDecor(p, g); continue }
        if (p.ghost) { g.add(ghostBox(p.size)); const hit = new T.Mesh(new T.BoxGeometry(...p.size), new T.MeshBasicMaterial({ visible: false })); add(g, hit, p.id); continue }
        buildPart(p, g, entry)
      }
      // soft floor shadow
      const sh = new T.Mesh(new T.PlaneGeometry(14, 8), new T.MeshBasicMaterial({ map: shadowTex(T), transparent: true, opacity: 0.55, depthWrite: false }))
      sh.rotation.x = -Math.PI / 2; sh.position.set(0, lay.formFactor === 'laptop' ? -0.5 : -5.4, -0.5); world.add(sh)
    }

    function buildDecor(p, g) {
      if (p.kind === 'case') {
        // glass-panel frame only: the rig has to stay visible
        const e = new T.EdgesGeometry(new T.BoxGeometry(...p.size))
        g.add(new T.LineSegments(e, new T.LineBasicMaterial({ color: 0x6a6a78, transparent: true, opacity: 0.45 })))
      } else if (p.kind === 'psu') {
        g.add(new T.Mesh(rbox(...p.size, 0.12), mats.dark))
      } else if (p.kind === 'laptop-body') {
        g.add(new T.Mesh(rbox(...p.size, 0.12), mats.metal))
      } else if (p.kind === 'battery') {
        g.add(new T.Mesh(rbox(...p.size, 0.05), mats.dark))
      }
    }

    function buildPart(p, g, entry) {
      switch (p.kind) {
        case 'board': add(g, new T.Mesh(new T.BoxGeometry(...p.size), mats.pcb), p.id); break
        case 'cpu': {
          const ihs = add(g, new T.Mesh(rbox(...p.size, 0.05), mats.silver), p.id)
          const glow = glowMat(0.45); const under = new T.Mesh(new T.PlaneGeometry(p.size[0] * 1.5, p.size[1] * 1.5), glow.mat); under.position.z = -0.05; g.add(under); entry.glow.push(glow)
          break
        }
        case 'aio': {
          const pump = add(g, new T.Mesh(new T.CylinderGeometry(p.size[0] / 2, p.size[0] / 2, 0.6, 40).rotateX(Math.PI / 2), mats.metal), p.id)
          pump.position.z = p.size[2] / 2
          const ring = glowMat(1); const rg = new T.Mesh(new T.TorusGeometry(p.size[0] / 2 - 0.02, 0.05, 10, 60), ring.mat); rg.position.z = p.size[2] / 2 + 0.31; g.add(rg); entry.glow.push(ring)
          const rd = p.rad
          const rad = add(world, new T.Mesh(rbox(...rd.size, 0.05), mats.dark), p.id); rad.position.set(...rd.pos)
          // tubes from the pump to the radiator, a real AIO has exactly two
          for (const dx of [-0.35, 0.35]) {
            const curve = new T.CatmullRomCurve3([new T.Vector3(p.pos[0] + dx, p.pos[1] + 0.5, p.pos[2] + 0.5), new T.Vector3(p.pos[0] + dx * 1.6, p.pos[1] + 1.4, p.pos[2] + 0.7), new T.Vector3(rd.pos[0] - 2.2 + dx, rd.pos[1] - 0.45, rd.pos[2] + 0.2)])
            const tube = new T.Mesh(new T.TubeGeometry(curve, 24, 0.07, 8), mats.dark); world.add(tube)
          }
          break
        }
        case 'air': {
          const stack = add(g, new T.Mesh(rbox(p.size[0], p.size[1], 0.9, 0.06), mats.silver), p.id)
          stack.position.z = 0.4
          break
        }
        case 'ram-slot': {
          const slot = add(g, new T.Mesh(new T.BoxGeometry(...p.size), mats.dark), p.id)
          if (p.slot && p.slot.stick) {
            const st = add(g, new T.Mesh(rbox(p.size[0] * 0.8, p.size[1] - 0.1, 0.3, 0.04), mats.metal), p.id); st.position.z = 0.2
            const led = glowMat(0.8); const strip = new T.Mesh(new T.BoxGeometry(p.size[0] * 0.8, 0.12, 0.05), led.mat); strip.position.set(0, p.size[1] / 2 - 0.1, 0.38); g.add(strip); entry.glow.push(led)
          }
          void slot
          break
        }
        case 'ram-slot-flat': {
          add(g, new T.Mesh(rbox(...p.size, 0.03), p.slot && p.slot.stick ? mats.metal : mats.dark), p.id)
          break
        }
        case 'gpu': {
          add(g, new T.Mesh(rbox(...p.size, 0.1), mats.metal), p.id)
          const back = new T.Mesh(rbox(p.size[0] * 0.98, p.size[1] * 0.96, 0.05, 0.03), mats.dark); back.position.z = -p.size[2] / 2 - 0.02; g.add(back)
          // straight grille lines: the fan count is unknown, so no fans are implied
          for (let i = 0; i < 9; i++) { const l = new T.Mesh(new T.BoxGeometry(p.size[0] * 0.8, 0.025, 0.02), mats.dark); l.position.set(0, -p.size[1] * 0.3 + i * (p.size[1] * 0.07), p.size[2] / 2 + 0.005); g.add(l) }
          const edge = glowMat(1); const strip = new T.Mesh(new T.BoxGeometry(p.size[0] * 0.96, 0.05, 0.04), edge.mat); strip.position.set(0, p.size[1] / 2 - 0.02, p.size[2] / 2 + 0.02); g.add(strip); entry.glow.push(edge)
          break
        }
        case 'gpu-laptop': add(g, new T.Mesh(rbox(...p.size, 0.02), mats.metal), p.id); break
        case 'nvme': {
          add(g, new T.Mesh(rbox(...p.size, 0.02), mats.metal), p.id)
          break
        }
        case 'sata': add(g, new T.Mesh(rbox(...p.size, 0.03), mats.metal), p.id); break
        default: add(g, new T.Mesh(new T.BoxGeometry(...p.size), mats.dark), p.id)
      }
    }

    function pcbTexture(T2) {
      const c = document.createElement('canvas'); c.width = c.height = 512
      const x = c.getContext('2d'); x.fillStyle = '#17171d'; x.fillRect(0, 0, 512, 512)
      x.strokeStyle = 'rgba(255,255,255,.075)'; x.lineWidth = 1.4
      let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
      for (let i = 0; i < 170; i++) { let px = rnd() * 512, py = rnd() * 512; x.beginPath(); x.moveTo(px, py); for (let j = 0; j < 4; j++) { if (j % 2) py += (rnd() - 0.5) * 90; else px += (rnd() - 0.5) * 110; x.lineTo(px, py) } x.stroke() }
      x.fillStyle = 'rgba(255,255,255,.1)'; for (let i = 0; i < 150; i++) x.fillRect(rnd() * 512, rnd() * 512, 2, 2)
      const t = new T2.CanvasTexture(c); t.colorSpace = T2.SRGBColorSpace; t.wrapS = t.wrapT = T2.RepeatWrapping; t.repeat.set(1.3, 1.6); return t
    }
    function shadowTex(T2) {
      const c = document.createElement('canvas'); c.width = c.height = 128
      const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64)
      gr.addColorStop(0, 'rgba(0,0,0,.8)'); gr.addColorStop(1, 'rgba(0,0,0,0)')
      x.fillStyle = gr; x.fillRect(0, 0, 128, 128)
      const t = new T2.CanvasTexture(c); return t
    }

    // ── radiator fans: exactly as many as there are real fan readings ──────────────────
    function syncFans(levels) {
      const rad = parts.get('cooler')
      if (!rad || !rad.p.rad) return
      if (fansCache.length === levels.length) return
      for (const f of fansCache) { f.g.parent && f.g.parent.remove(f.g); const i = glowMats.indexOf(f.ring); if (i >= 0) glowMats.splice(i, 1) }
      fansCache = []
      const n = Math.min(3, levels.length)
      const rd = rad.p.rad, r = Math.min(rd.size[0] / (n || 1) / 2 - 0.1, 0.85)
      for (let i = 0; i < n; i++) {
        const f = makeFan(r, 0)
        f.g.position.set(rd.pos[0] - rd.size[0] / 2 + (rd.size[0] / n) * (i + 0.5), rd.pos[1], rd.pos[2] + rd.size[2] / 2 + 0.1)
        world.add(f.g); fansCache.push(f)
      }
    }

    // ── state -> materials (called by the host on every telemetry tick) ────────────────
    let state = null
    function setState(s) { state = s }
    function applyState(dt) {
      const M = Ma()
      const tau = 0.35, k = 1 - Math.exp(-dt / tau)
      const stFor = id => !state ? null : id === 'cpu' || id === 'cooler' ? state.cpu : id === 'gpu' ? state.gpu : id.startsWith('ram') ? state.ram : null
      for (const [id, e] of parts) {
        const st = stFor(id)
        for (const g of e.glow) {
          let level = 0.55, col = accent
          if (st) {
            if (st.heat != null) { col = M.heatColor(st.heat, accent); level = 0.35 + (st.load != null ? st.load : 0.3) * 1.1 }
            else if (st.load != null) level = 0.25 + st.load * 0.9
            else if (st.fill != null) level = 0.25 + st.fill * 0.8
          }
          g.target = level * g.strength
          g.color.setRGB(...col)
        }
      }
      for (const g of glowMats) {
        g.level += (g.target - g.level) * k
        g.mat.emissive.copy(g.color); g.mat.emissiveIntensity = g.level * (quality === 'full' ? 1.6 : 1.1)
      }
      if (state) syncFans(state.caseFans)
      fansCache.forEach((f, i) => { const lv = state && state.caseFans[i]; if (lv != null) f.g.userData.spin.rotation.z -= dt * (1 + lv * 14) })
      if (state && state.pump) { /* the pump has no moving part to show; its RPM only appears in the inspector */ }
    }

    function setReveal(map) { reveal = map; if (!map) for (const e of parts.values()) { e.r = 1; e.group.visible = true; e.group.scale.setScalar(1); e.group.position.set(...e.base) } else for (const e of parts.values()) e.r = 0 }
    function stepReveal(dt) {
      if (!reveal) return
      const k = 1 - Math.exp(-dt / 0.22)
      for (const [id, e] of parts) {
        const target = reveal.get(id) ? 1 : 0
        e.r += (target - e.r) * k
        e.group.visible = e.r > 0.02
        e.group.position.set(e.base[0], e.base[1] + (1 - e.r) * 0.9, e.base[2])
        e.group.scale.setScalar(0.94 + 0.06 * e.r)
      }
    }

    // ── camera ────────────────────────────────────────────────────────────────────────
    const cam = { x: [0, 0, 0, 0, 0, 0], v: [0, 0, 0, 0, 0, 0] }    // look x/y/z, dist, yaw, pitch
    let camTarget = [0, 0, 0, 14, 0.4, 0.1], user = { yaw: 0, pitch: 0 }, viewName = 'home'
    function viewFor(name) { return VIEWS[name] || VIEWS.home }
    function setView(name, opts = {}) {
      viewName = name
      const v = viewFor(layout && layout.formFactor === 'laptop' && name === 'home' ? 'laptop' : name)
      camTarget = [...v.look, v.dist, v.yaw, v.pitch]
      focusId = null; user.yaw = user.pitch = 0
      if (opts.snap) { cam.x = camTarget.slice(); cam.v = cam.v.map(() => 0) }
    }
    function focus(id) {
      focusId = id
      if (!id) { setView(viewName); return }
      const e = parts.get(id); if (!e) return
      const wp = new T.Vector3(); e.group.getWorldPosition(wp)
      camTarget = [wp.x, wp.y, wp.z, FOCUS_DIST[id] || FOCUS_DIST[e.p.kind] || 8, 0.3, 0.12]
    }
    function stepCamera(dt) {
      Mo().springStep(cam, [camTarget[0], camTarget[1], camTarget[2], camTarget[3], camTarget[4] + user.yaw, camTarget[5] + user.pitch], dt, 9)
      const [lx, ly, lz, dist, yaw, pitch] = cam.x
      camera.position.set(lx + Math.sin(yaw) * Math.cos(pitch) * dist, ly + Math.sin(pitch) * dist, lz + Math.cos(yaw) * Math.cos(pitch) * dist)
      camera.lookAt(lx, ly, lz)
    }
    const settled = () => Mo().settled({ x: cam.x, v: cam.v }, [camTarget[0], camTarget[1], camTarget[2], camTarget[3], camTarget[4] + user.yaw, camTarget[5] + user.pitch], 2e-3)

    // ── picking ───────────────────────────────────────────────────────────────────────
    const ray = new T.Raycaster(), ndc = new T.Vector2()
    function pick(clientX, clientY) {
      const r = dom.getBoundingClientRect()
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      const hit = ray.intersectObjects(pickables, false)[0]
      return hit ? hit.object.userData.partId : null
    }
    function setHover(id) {
      if (id === hoverId) return
      hoverId = id
      // hover lifts the part's glow slightly
      for (const [pid, e] of parts) for (const g of e.glow) g.strength = pid === id ? 1.5 : 1
    }

    // ── frame ─────────────────────────────────────────────────────────────────────────
    function resize(w, h, dpr) {
      renderer.setPixelRatio(quality === 'full' ? Math.min(dpr || 1, 1.5) : 1)
      renderer.setSize(w, h, false)
      camera.aspect = w / Math.max(h, 1); camera.updateProjectionMatrix()
      if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); bloom.resolution.set(w, h) }
    }
    function render(dt) {
      stepCamera(dt); stepReveal(dt); applyState(dt)
      if (composer) composer.render(dt); else renderer.render(scene, camera)
    }
    function setAccent(rgb) { accent = rgb; accentColor.setRGB(...rgb); rim.color.setRGB(...rgb); if (scene.background) scene.background.dispose(); scene.background = backdrop(rgb) }
    function dispose() { disposeWorld(); try { composer && composer.dispose?.() } catch {} pmrem.dispose(); envTex.dispose(); renderer.dispose(); renderer.forceContextLoss?.() }

    setupComposer()
    return { domElement: dom, rendererName, build, setReveal, partIds: () => [...parts.keys()], setState, setView, focus, pick, setHover, resize, render, setAccent, dispose, settled,
      nudge(dyaw, dpitch) { user.yaw = Math.max(-0.5, Math.min(0.5, user.yaw + dyaw)); user.pitch = Math.max(-0.25, Math.min(0.25, user.pitch + dpitch)) },
      release() { user.yaw = user.pitch = 0 }, get focusId() { return focusId }, parts: () => [...parts.keys()] }
  }

  root.JylliTwinEngine = { create }
})(typeof window !== 'undefined' ? window : globalThis)
