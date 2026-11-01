'use strict'
// Three.js scene for the rig. Everything is procedural, built from the layout (js/twin/layout.js), the model kit (js/twin/kit.js)
// and driven by the visual state (js/twin/mapping.js). Reads window.THREE (js/vendor/three.bundle.js). It never reads telemetry
// itself and holds no numbers of its own: with no state the rig is neutral. Not unit-tested (needs WebGL); the pure parts it
// relies on are. Showcase rule: every part the kit can model is always drawn (case, fans, shrouds); glow, heat tint and fan spin
// still come only from real readings (js/twin/mapping.js), and undetected hardware stays a ghost.
;(function (root) {
  const Mo = () => root.JylliTwinMotion
  const Ma = () => root.JylliTwinMapping
  const Kit = () => root.JylliTwinKit

  const VIEWS = {
    // camera target [x, y, z] and distance for each framing
    home: { look: [0.2, -0.3, -0.6], dist: 25, yaw: 0.46, pitch: 0.14 },
    gpu: { look: [-0.3, -1.4, -0.7], dist: 9.5, yaw: 1.05, pitch: 0.16 },
    laptop: { look: [0, 0, 0], dist: 10.5, yaw: 0.5, pitch: 0.75 },
  }
  // A close-up looks in from the glass side (yaw near pi/2 ~ straight at +x), never through the opaque mesh front: the showcase
  // case's front panel is a real, mostly-solid surface now, not a wireframe. Distances clear the glass (case half-width ~4.2).
  const FOCUS_DIST = { gpu: 9.5, cpu: 8.8, cooler: 9.2, ram0: 8.6, board: 12.5, storage: 9 }
  const FOCUS_YAW = 1.25, FOCUS_PITCH = 0.16
  const CASE_FAN_ORDER = ['fanFront0', 'fanFront1', 'fanFront2', 'fanRear']

  function create({ accent = [0.55, 0.49, 0.96], quality = 'full', preferLowPower = true } = {}) {
    const T = root.THREE
    const A = T.Addons
    const kit = Kit(); kit.init(T)
    const renderer = new T.WebGLRenderer({ antialias: false, alpha: true, powerPreference: preferLowPower ? 'low-power' : 'high-performance', failIfMajorPerformanceCaveat: true })
    const gl = renderer.getContext()
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    const rendererName = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
    renderer.toneMapping = T.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.8
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = T.PCFSoftShadowMap
    renderer.setClearColor(0x000000, 0)
    const dom = renderer.domElement
    dom.className = 'j-twin-canvas'
    dom.setAttribute('aria-hidden', 'true')

    const scene = new T.Scene()
    // The composer output is opaque, so the stage backdrop (dark graphite with an accent glow, as in css/ui.css) is part of the scene.
    function backdrop(rgb) {
      const c = document.createElement('canvas'); c.width = c.height = 256
      const x = c.getContext('2d'), r = (v, k) => Math.round(v * 255 * k)
      x.fillStyle = '#07070a'; x.fillRect(0, 0, 256, 256)
      const g = x.createRadialGradient(118, 150, 4, 118, 150, 200)
      g.addColorStop(0, 'rgba(' + r(rgb[0], 1) + ',' + r(rgb[1], 1) + ',' + r(rgb[2], 1) + ',0.16)'); g.addColorStop(0.55, 'rgba(14,14,19,0.92)'); g.addColorStop(1, 'rgba(7,7,10,1)')
      x.fillStyle = g; x.fillRect(0, 0, 256, 256)
      const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t
    }
    scene.background = backdrop(accent)
    const camera = new T.PerspectiveCamera(30, 1, 0.1, 100)

    const accentColor = new T.Color(...accent)
    const mats = kit.materials(accentColor)
    const pmrem = new T.PMREMGenerator(renderer)
    const envTex = pmrem.fromScene(kit.studioScene(), 0.035).texture
    scene.environment = envTex
    scene.environmentIntensity = 1.0
    const key = new T.DirectionalLight(0xffffff, 4.8); key.position.set(5, 9, 8); key.castShadow = true
    key.shadow.mapSize.set(1024, 1024); key.shadow.camera.near = 1; key.shadow.camera.far = 30
    key.shadow.camera.left = -10; key.shadow.camera.right = 10; key.shadow.camera.top = 10; key.shadow.camera.bottom = -10
    key.shadow.bias = -0.0015
    scene.add(key)
    const fill = new T.DirectionalLight(0xaab0ff, 1.6); fill.position.set(-4, 4, -6); scene.add(fill)
    const beauty = new T.DirectionalLight(0xffffff, 2.4); beauty.position.set(9, 3, 16); scene.add(beauty)   // camera-side "product shot" fill, keeps the facing panel readable
    scene.add(new T.HemisphereLight(0xb8b8ff, 0x16161c, 1.1))
    const rim = new T.PointLight(new T.Color(...accent), 28, 32, 2); rim.position.set(-6.5, 3, 4); scene.add(rim)

    let composer = null, bloom = null
    function setupComposer() {
      composer = null; bloom = null
      if (quality === 'static') return
      const full = quality === 'full'
      const rt = new T.WebGLRenderTarget(8, 8, full ? { type: T.HalfFloatType, samples: 4 } : {})
      composer = new A.EffectComposer(renderer, rt)
      composer.addPass(new A.RenderPass(scene, camera))
      bloom = new A.UnrealBloomPass(new T.Vector2(512, 512), 0.5, 0.5, 0.86)   // high threshold: only emissive parts bloom
      composer.addPass(bloom)
      if (!full) { try { composer.addPass(new A.SMAAPass(8, 8)) } catch {} }
      if (full) {
        try {
          const vign = new A.ShaderPass({
            uniforms: { tDiffuse: { value: null }, amount: { value: 0.28 } },
            vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
            fragmentShader: 'uniform sampler2D tDiffuse; uniform float amount; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 d = vUv - 0.5; float v = 1.0 - amount * dot(d,d) * 2.2; gl_FragColor = vec4(c.rgb * v, c.a); }',
          })
          composer.addPass(vign)
        } catch {}
      }
      composer.addPass(new A.OutputPass())
    }

    // ── glow materials: driven by state every frame; `strength` is a per-part multiplier (hover lifts it) ────────────────────
    const ghostMat = new T.LineDashedMaterial({ color: 0x9a9aa8, dashSize: 0.12, gapSize: 0.1, transparent: true, opacity: 0.45 })
    const glowMats = []   // { mat, base, ... }, driven by state
    function glowMat(strength = 1) {
      const m = new T.MeshStandardMaterial({ color: 0x060608, roughness: 0.4, metalness: 0.1, emissive: accentColor.clone(), emissiveIntensity: 0.22 })
      const g = { mat: m, strength, level: 0.22, target: 0.22, color: accentColor.clone() }
      glowMats.push(g)
      return g
    }
    const sharedMats = new Set(Object.values(mats))

    // ── scene content ─────────────────────────────────────────────────────────────────
    const world = new T.Group(); scene.add(world)
    const parts = new Map()      // id -> { group, glow:[...], fans:[...], layoutPart }
    const pickables = []
    let layout = null, hoverId = null, focusId = null, fansCache = [], decorFans = [], gpuFans = []
    let reveal = null      // null = everything shown; else Map(partId -> target 0|1), eased below

    function disposeWorld() {
      world.traverse(o => {
        if (o.geometry) o.geometry.dispose()
        if (o.material && !sharedMats.has(o.material) && o.material !== ghostMat) o.material.dispose?.()
      })
      world.clear(); parts.clear(); pickables.length = 0; glowMats.length = 0; fansCache = []; decorFans = []; gpuFans = []
    }
    function add(group, mesh, partId) { mesh.userData.partId = partId; mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); pickables.push(mesh); return mesh }
    function ghostBox(size) {
      const e = new T.EdgesGeometry(new T.BoxGeometry(size[0], size[1], size[2]))
      const l = new T.LineSegments(e, ghostMat); l.computeLineDistances(); return l
    }

    function build(lay) {
      disposeWorld()
      layout = lay
      for (const p of lay.parts) {
        const g = new T.Group(); g.position.set(...p.pos); world.add(g)
        const entry = { group: g, glow: [], fans: [], p, base: p.pos.slice(), r: 1 }
        parts.set(p.id, entry)
        if (p.decor) { buildDecor(p, g, entry); continue }
        if (p.ghost) { g.add(ghostBox(p.size)); const hit = new T.Mesh(new T.BoxGeometry(...p.size), new T.MeshBasicMaterial({ visible: false })); add(g, hit, p.id); continue }
        buildPart(p, g, entry)
      }
      world.add(kit.groundPlane(mats, 14, 10).translateY(lay.formFactor === 'laptop' ? -0.5 : -5.4))
    }

    function buildDecor(p, g, entry) {
      if (p.kind === 'case') {
        g.add(kit.caseTower(mats, p.size))
      } else if (p.kind === 'psu') {
        g.add(kit.psuShroud(mats, p.size))
      } else if (p.kind === 'laptop-body') {
        g.add(kit.laptopBody(mats, p.size))
      } else if (p.kind === 'battery') {
        g.add(new T.Mesh(kit.rbox(...p.size, 0.05), mats.satin))
      } else if (p.kind === 'case-fan') {
        const ring = glowMat(0.55)
        const { group, spin } = kit.fan(mats, p.size[0] / 2, { ringMat: ring.mat })
        if (p.rot) group.rotation.set(...p.rot)
        g.add(group); entry.glow.push(ring)
        decorFans.push({ spinGroup: spin, ring, index: decorFans.length })
      }
    }

    // Visual content is always a kit model (showcase); picking is always one invisible hit box sized to the part, so detail
    // never has to be tagged or kept flat for raycasting.
    function buildPart(p, g, entry) {
      add(g, invisHit(p.size), p.id)
      switch (p.kind) {
        case 'board': g.add(kit.board(mats, p.size)); break
        case 'cpu': {
          g.add(new T.Mesh(kit.rbox(...p.size, 0.04), mats.chrome))
          const glow = glowMat(0.45); const under = new T.Mesh(new T.PlaneGeometry(p.size[0] * 1.6, p.size[1] * 1.6), glow.mat); under.position.z = -0.05; g.add(under); entry.glow.push(glow)
          break
        }
        case 'aio': {
          g.add(kit.aioPump(mats, p.size))
          const pumpTop = p.size[2] / 2
          const ring = glowMat(1); const rg = new T.Mesh(new T.TorusGeometry(p.size[0] / 2 - 0.02, 0.05, 10, 60), ring.mat); rg.position.z = pumpTop + 0.01; g.add(rg); entry.glow.push(ring)
          const rd = p.rad
          const rad = kit.radiatorFins(mats, rd.size); rad.position.set(...rd.pos); world.add(rad)
          for (const dx of [-0.35, 0.35]) {
            const curve = new T.CatmullRomCurve3([new T.Vector3(p.pos[0] + dx, p.pos[1] + 0.5, p.pos[2] + 0.5), new T.Vector3(p.pos[0] + dx * 1.6, p.pos[1] + 1.4, p.pos[2] + 0.7), new T.Vector3(rd.pos[0] - 2.2 + dx, rd.pos[1] - 0.45, rd.pos[2] + 0.2)])
            const tube = new T.Mesh(new T.TubeGeometry(curve, 24, 0.07, 8), mats.satin); world.add(tube)
          }
          break
        }
        case 'air': {
          g.add(kit.airCoolerStack(mats, p.size))
          const { group } = kit.fan(mats, Math.min(p.size[0], p.size[1]) * 0.42, { ringMat: null })
          group.position.z = p.size[2] / 2 + 0.05; g.add(group)
          break
        }
        case 'ram-slot': {
          if (p.slot && p.slot.stick) {
            g.add(kit.ramStick(mats, p.size, [accentColor.r, accentColor.g, accentColor.b]))
            const led = glowMat(0.8); const strip = new T.Mesh(new T.BoxGeometry(p.size[0] * 0.76, 0.1, 0.05), led.mat); strip.position.set(0, p.size[1] / 2 - 0.12, 0.42); g.add(strip); entry.glow.push(led)
          } else g.add(new T.Mesh(new T.BoxGeometry(...p.size), mats.satin))
          break
        }
        case 'ram-slot-flat': {
          const mat = p.slot && p.slot.stick ? mats.chrome : mats.satin
          g.add(new T.Mesh(kit.rbox(...p.size, 0.03), mat))
          break
        }
        case 'gpu': {
          g.add(kit.gpuShroud(mats, p.size))
          const edge = glowMat(1); const strip = new T.Mesh(new T.BoxGeometry(p.size[0] * 0.94, 0.05, 0.04), edge.mat); strip.position.set(0, p.size[1] / 2 - 0.02, p.size[2] / 2 + 0.03); g.add(strip); entry.glow.push(edge)
          // shroud fans: always drawn (showcase); spin only follows the one real fan reading the GPU reports
          const n = 3, fr = Math.min(p.size[1], p.size[2]) * 0.42
          for (let i = 0; i < n; i++) {
            const { group, spin } = kit.fan(mats, fr, { ringMat: null, frame: false })
            group.position.set(-p.size[0] / 2 + (p.size[0] / n) * (i + 0.5), 0, p.size[2] / 2 + 0.04)
            g.add(group)
            gpuFans.push({ spinGroup: spin })
          }
          break
        }
        case 'gpu-laptop': g.add(new T.Mesh(kit.rbox(...p.size, 0.02), mats.anodised)); break
        case 'nvme': g.add(kit.nvmeStick(mats, p.size)); break
        case 'sata': g.add(kit.sataDrive(mats, p.size)); break
        default: g.add(new T.Mesh(new T.BoxGeometry(...p.size), mats.satin))
      }
    }
    function invisHit(size) { return new T.Mesh(new T.BoxGeometry(...size), new T.MeshBasicMaterial({ visible: false })) }

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
          let level = 0.5, col = accent
          if (st) {
            if (st.heat != null) { col = M.heatColor(st.heat, accent); level = 0.35 + (st.load != null ? st.load : 0.3) * 1.1 }
            else if (st.load != null) level = 0.25 + st.load * 0.9
            else if (st.fill != null) level = 0.25 + st.fill * 0.8
          }
          g.target = level * g.strength
          g.color.setRGB(...col)
        }
      }
      // decorative case fans: spin/glow only for the indexes we actually have a reading for
      const caseReal = (state && state.caseFans) || []
      for (const f of decorFans) {
        const lv = caseReal[f.index]
        f.ring.target = (lv != null ? 0.4 + lv * 0.8 : 0.18) * f.ring.strength
        if (!reducedMotion() && lv != null) f.spinGroup.rotation.z -= dt * (1 + lv * 14)
      }
      // GPU shroud fans: one real reading drives all three
      const gpuFan = state && state.gpu && state.gpu.fan
      if (!reducedMotion() && gpuFan != null) for (const f of gpuFans) f.spinGroup.rotation.z -= dt * (1 + gpuFan * 16)
      for (const g of glowMats) {
        g.level += (g.target - g.level) * k
        g.mat.emissive.copy(g.color); g.mat.emissiveIntensity = g.level * (quality === 'full' ? 1.5 : 1.05)
      }
      if (state) syncFans(state.caseFans)
      fansCache.forEach((f, i) => { const lv = state && state.caseFans[i]; if (lv != null && !reducedMotion()) f.spin.rotation.z -= dt * (1 + lv * 14) })
      if (state && state.pump) { /* the pump has no moving part to show; its RPM only appears in the inspector */ }
    }

    // ── radiator fans: exactly as many as there are real fan readings ──────────────────
    function syncFans(levels) {
      const rad = parts.get('cooler')
      if (!rad || !rad.p.rad) return
      if (fansCache.length === levels.length) return
      for (const f of fansCache) { f.group.parent && f.group.parent.remove(f.group); const i = glowMats.indexOf(f.ring); if (i >= 0) glowMats.splice(i, 1) }
      fansCache = []
      const n = Math.min(3, levels.length)
      const rd = rad.p.rad, r = Math.min(rd.size[0] / (n || 1) / 2 - 0.1, 0.85)
      for (let i = 0; i < n; i++) {
        const ring = glowMat(0.6)
        const { group, spin } = kit.fan(mats, r, { ringMat: ring.mat })
        group.position.set(rd.pos[0] - rd.size[0] / 2 + (rd.size[0] / n) * (i + 0.5), rd.pos[1], rd.pos[2] + rd.size[2] / 2 + 0.12)
        world.add(group); fansCache.push({ group, spin, ring })
      }
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
      camTarget = [wp.x, wp.y, wp.z, FOCUS_DIST[id] || FOCUS_DIST[e.p.kind] || 9, FOCUS_YAW, FOCUS_PITCH]
    }
    const reducedMotion = () => document.body.classList.contains('motion-reduced') || (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches)
    function stepCamera(dt) {
      Mo().springStep(cam, [camTarget[0], camTarget[1], camTarget[2], camTarget[3], camTarget[4] + user.yaw, camTarget[5] + user.pitch], dt, reducedMotion() ? 80 : 9)
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
      if (composer) {
        composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h)
        if (bloom) bloom.resolution.set(w, h)
      }
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
