'use strict'
// Three.js scene for the rig. Everything is procedural, built from the layout (js/twin/layout.js), the model kit (js/twin/kit.js)
// and driven by the visual state (js/twin/mapping.js). Reads window.THREE (js/vendor/three.bundle.js). It never reads telemetry
// itself and holds no numbers of its own: with no state the rig is neutral. Not unit-tested (needs WebGL); the pure parts it
// relies on are. Showcase rule: every part the kit can model is always drawn (case, fans, shrouds) and decor lights keep a steady
// ambient glow; heat tint, load surges and fan spin still come only from real readings (js/twin/mapping.js), and undetected
// hardware stays a frosted x-ray ghost (empty RAM slots are real, empty slots).
;(function (root) {
  const Mo = () => root.JylliTwinMotion
  const Ma = () => root.JylliTwinMapping
  const Kit = () => root.JylliTwinKit

  const VIEWS = {
    // camera target [x, y, z] and distance for each framing
    home: { look: [0.1, -0.3, -0.5], dist: 23.5, yaw: 0.4, pitch: 0.12 },
    gpu: { look: [-0.3, -1.4, -0.7], dist: 10, yaw: 0.5, pitch: 0.14 },
    laptop: { look: [0, 0, 0.1], dist: 12.5, yaw: 0.45, pitch: 0.72 },
  }
  // A close-up looks in through the glass at a moderate angle (the intake fans and radiator sit on the +x wall, so a steep side
  // view would look through them). Distances clear the glass (case half-depth ~2.3).
  const FOCUS_DIST = { gpu: 10, cpu: 9, cooler: 9.5, ram0: 9, board: 13, storage: 9 }
  const FOCUS_YAW = 0.5, FOCUS_PITCH = 0.14
  const AMB = 2.5   // steady emissive level of decor lights; readings move a part's own glow around it

  function create({ accent = [0.55, 0.49, 0.96], quality = 'full', preferLowPower = true } = {}) {
    const T = root.THREE
    const A = T.Addons
    const kit = Kit()
    const renderer = new T.WebGLRenderer({ antialias: false, alpha: true, powerPreference: preferLowPower ? 'low-power' : 'high-performance', failIfMajorPerformanceCaveat: true })
    kit.init(T, { anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()) })
    const gl = renderer.getContext()
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    const rendererName = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
    renderer.toneMapping = T.NeutralToneMapping    // keeps the accent saturated where ACES/AgX bleach it to white
    renderer.toneMappingExposure = 1.1
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = T.PCFSoftShadowMap
    renderer.setClearColor(0x000000, 0)
    const dom = renderer.domElement
    dom.className = 'j-twin-canvas'
    dom.setAttribute('aria-hidden', 'true')

    const scene = new T.Scene()
    // The composer output is opaque, so the stage backdrop (near-black with the faintest accent haze, as in css/ui.css) is part of the scene.
    function backdrop(rgb) {
      const c = document.createElement('canvas'); c.width = c.height = 256
      const x = c.getContext('2d'), r = v => Math.round(v * 255)
      x.fillStyle = '#07070c'; x.fillRect(0, 0, 256, 256)
      const g = x.createRadialGradient(128, 140, 4, 128, 140, 190)
      g.addColorStop(0, 'rgba(' + r(rgb[0]) + ',' + r(rgb[1]) + ',' + r(rgb[2]) + ',0.07)'); g.addColorStop(1, 'rgba(7,7,12,0)')
      x.fillStyle = g; x.fillRect(0, 0, 256, 256)
      const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t
    }
    scene.background = backdrop(accent)
    const camera = new T.PerspectiveCamera(30, 1, 0.1, 100)

    const accentColor = new T.Color(...accent)
    const mats = kit.materials(accentColor)
    const pmrem = new T.PMREMGenerator(renderer)
    const envTex = pmrem.fromScene(kit.studioScene(), 0.02).texture
    scene.environment = envTex
    scene.environmentIntensity = 1.2
    const key = new T.DirectionalLight(0xffffff, 8); key.position.set(6, 10, 9); key.castShadow = quality !== 'static'
    const smap = quality === 'full' ? 2048 : 1024
    key.shadow.mapSize.set(smap, smap); key.shadow.camera.near = 1; key.shadow.camera.far = 40
    key.shadow.camera.left = -9; key.shadow.camera.right = 9; key.shadow.camera.top = 9; key.shadow.camera.bottom = -9
    key.shadow.bias = -0.0008; key.shadow.normalBias = 0.02
    scene.add(key)
    const rimLight = new T.DirectionalLight(0x9aa6ff, 3); rimLight.position.set(-8, 5, -7); scene.add(rimLight)
    scene.add(new T.AmbientLight(0x8a8a9c, 1.5))
    // accent spill: the coloured light the case fans, GPU and pump throw into the interior; scaled by how bright the lights are
    const spills = [
      { pos: [2.6, 0.5, 1.8], i: 10, d: 13 },     // intake column
      { pos: [-0.3, -1.2, 1.9], i: 11, d: 11 },   // GPU
      { pos: [-0.5, 1.9, 0.4], i: 3, d: 7 },      // pump / socket
      { pos: [-3.3, 2.8, 0.2], i: 3, d: 7 },      // rear exhaust fan
    ].map(s => { const l = new T.PointLight(accentColor, s.i, s.d, 2); l.position.set(...s.pos); scene.add(l); s.light = l; return s })
    if (quality !== 'full') spills.splice(2).forEach(s => scene.remove(s.light))   // reduced: fewer lights keeps the per-pixel cost down

    let composer = null, bloom = null
    function setupComposer() {
      composer = null; bloom = null
      if (quality === 'static') return
      const full = quality === 'full'
      const rt = new T.WebGLRenderTarget(8, 8, { type: T.HalfFloatType, samples: full ? 4 : 2 })
      composer = new A.EffectComposer(renderer, rt)
      composer.addPass(new A.RenderPass(scene, camera))
      bloom = new A.UnrealBloomPass(new T.Vector2(512, 512), 0.4, 0.55, 0.62)   // threshold keeps it to emissive rings and strips
      composer.addPass(bloom)
      if (full) {
        try {
          const vign = new A.ShaderPass({
            uniforms: { tDiffuse: { value: null }, amount: { value: 0.3 } },
            vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
            fragmentShader: 'uniform sampler2D tDiffuse; uniform float amount; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 d = vUv - 0.5; float v = 1.0 - amount * dot(d,d) * 2.2; gl_FragColor = vec4(c.rgb * v, c.a); }',
          })
          composer.addPass(vign)
        } catch {}
      }
      composer.addPass(new A.OutputPass())
    }

    // ── glow materials: driven by state every frame; `strength` is a per-part multiplier (hover lifts it) ────────────────────
    const glowMats = []   // { mat, strength, level, target, color }, driven by state
    function glowMat(strength = 1) {
      const m = new T.MeshStandardMaterial({ color: 0x020203, roughness: 0.95, metalness: 0, emissive: accentColor.clone(), emissiveIntensity: AMB * strength })
      const g = { mat: m, strength, base: strength, level: AMB, target: AMB, color: accentColor.clone() }
      glowMats.push(g)
      return g
    }
    const sharedMats = new Set(Object.values(mats))

    // ── scene content ─────────────────────────────────────────────────────────────────
    const world = new T.Group(); scene.add(world)
    const parts = new Map()      // id -> { group, glow:[...], p, base, r }
    const pickables = []
    let layout = null, hoverId = null, focusId = null, decorFans = [], gpuFans = []
    let reveal = null      // null = everything shown; else Map(partId -> target 0|1), eased below

    function disposeWorld() {
      world.traverse(o => {
        if (o.geometry) o.geometry.dispose()
        if (o.material && !sharedMats.has(o.material)) o.material.dispose?.()
      })
      world.clear(); parts.clear(); pickables.length = 0; glowMats.length = 0; decorFans = []; gpuFans = []
    }
    function add(group, mesh, partId) { mesh.userData.partId = partId; group.add(mesh); pickables.push(mesh); return mesh }
    // x-ray look for hardware that was not detected: every mesh below `o` takes the frosted fresnel material
    function ghostify(o) { o.traverse(m => { if (m.isMesh) { m.material = mats.ghost; m.castShadow = false; m.receiveShadow = false } }); return o }

    function build(lay) {
      disposeWorld()
      layout = lay
      for (const p of lay.parts) {
        const g = new T.Group(); g.position.set(...p.pos); world.add(g)
        const entry = { group: g, glow: [], p, base: p.pos.slice(), r: 1 }
        parts.set(p.id, entry)
        if (p.decor) { buildDecor(p, g, entry); continue }
        add(g, invisHit(p.size), p.id)
        if (p.ghost) { buildGhost(p, g); continue }
        buildPart(p, g, entry)
      }
      world.add(kit.groundPlane(mats, 14, 10, accentColor).translateY(lay.formFactor === 'laptop' ? -0.5 : -5.4))
      for (const sp of spills) sp.light.visible = lay.formFactor !== 'laptop'   // the spill positions are tower-specific
    }

    function buildDecor(p, g, entry) {
      if (p.kind === 'case') {
        const strip = glowMat(0.22)
        g.add(kit.caseTower(mats, p.size, { accentMat: strip.mat, rearFan: { y: 2.8, z: -0.6, r: p.size[0] * 0.143 } })); entry.glow.push(strip)
      } else if (p.kind === 'psu') {
        g.add(kit.psuShroud(mats, p.size))
      } else if (p.kind === 'laptop-body') {
        g.add(kit.laptopBody(mats, p.size))
      } else if (p.kind === 'battery') {
        g.add(kit.shade(new T.Mesh(kit.rbox(...p.size, 0.05), mats.satin)))
      } else if (p.kind === 'case-fan') {
        const ring = glowMat(0.6)
        const { group, spin } = kit.fan(mats, p.size[0] / 2, { ringMat: ring.mat })
        if (p.rot) group.rotation.set(...p.rot)
        g.add(group); entry.glow.push(ring)
        decorFans.push({ spinGroup: spin, ring, index: decorFans.length })
      }
    }

    // Undetected hardware: a frosted x-ray model, never a solid part. Empty RAM slots are physical, so they are drawn as real slots.
    function buildGhost(p, g) {
      switch (p.kind) {
        case 'ram-slot': { const s = kit.dimmSlot(mats, p.size[0], p.size[1] - 0.1); s.position.z = -p.size[2] * 0.375; g.add(s); break }
        case 'cooler-unknown': case 'aio': g.add(ghostify(kit.aioPump(mats, p.size))); break
        case 'gpu': g.add(ghostify(kit.gpuShroud(mats, p.size))); break
        case 'nvme': g.add(ghostify(kit.nvmeStick(mats, p.size))); break
        case 'cpu': g.add(ghostify(kit.cpuSocket(mats, p.size))); break
        default: g.add(ghostify(new T.Mesh(kit.rbox(...p.size, 0.04), mats.satin)))
      }
    }

    // Visual content is always a kit model (showcase); picking is always one invisible hit box sized to the part, so detail
    // never has to be tagged or kept flat for raycasting.
    function buildPart(p, g, entry) {
      switch (p.kind) {
        case 'board': g.add(kit.board(mats, p.size)); break
        case 'cpu': {
          const glow = glowMat(0.45); entry.glow.push(glow)
          if (p.size[1] < p.size[2]) {   // laptop: the package lies flat, with a halo on the board
            g.add(kit.shade(new T.Mesh(kit.rbox(...p.size, 0.03), mats.nickel)))
            const halo = new T.Mesh(new T.PlaneGeometry(p.size[0] * 1.5, p.size[2] * 1.5), glow.mat); halo.rotation.x = -Math.PI / 2; halo.position.y = -p.size[1] / 2 + 0.01; g.add(halo)
          } else {
            g.add(kit.cpuSocket(mats, p.size))
            const under = new T.Mesh(new T.PlaneGeometry(p.size[0] * 1.6, p.size[1] * 1.6), glow.mat); under.position.z = -0.06; g.add(under)
          }
          break
        }
        case 'aio': {
          const pump = kit.aioPump(mats, p.size); g.add(pump)
          const ring = glowMat(1); const rg = new T.Mesh(new T.TorusGeometry(p.size[0] / 2 - 0.02, 0.05, 10, 64), ring.mat); rg.position.z = pump.userData.topZ + 0.005; g.add(rg); entry.glow.push(ring)
          const rd = p.rad
          const rad = kit.radiatorFins(mats, [rd.size[1], rd.size[0], rd.size[2]]); rad.rotation.z = Math.PI / 2; rad.position.set(...rd.pos); world.add(rad)
          world.add(kit.aioTubes(mats, p.pos, [rd.pos[0] - rd.size[0] / 2 + 0.1, rd.pos[1] - 0.33, rd.pos[2]]))
          break
        }
        case 'air': {
          g.add(kit.airCoolerStack(mats, p.size))
          const ring = glowMat(0.5)
          const { group } = kit.fan(mats, Math.min(p.size[0], p.size[1]) * 0.42, { frame: false, ringMat: ring.mat })
          group.position.z = p.size[2] / 2 + 0.07; g.add(group); entry.glow.push(ring)
          break
        }
        case 'ram-slot': {
          const led = glowMat(0.8)
          g.add(kit.ramStick(mats, p.size, [accentColor.r, accentColor.g, accentColor.b], { ledMat: led.mat })); entry.glow.push(led)
          break
        }
        case 'ram-slot-flat': {
          const mat = p.slot && p.slot.stick ? mats.chrome : mats.satin
          g.add(kit.shade(new T.Mesh(kit.rbox(...p.size, 0.03), mat)))
          break
        }
        case 'gpu': {
          g.add(kit.gpuShroud(mats, p.size))
          const L = kit.gpuFanLayout(p.size)
          const ring = glowMat(1); entry.glow.push(ring)
          // shroud fans: always drawn (showcase); spin only follows the one real fan reading the GPU reports
          for (const x of L.xs) {
            const { group, spin } = kit.fan(mats, L.r * 0.99, { frame: false, ringMat: ring.mat })
            group.position.set(x, 0, L.z)
            g.add(group)
            gpuFans.push({ spinGroup: spin })
          }
          const edge = glowMat(1); const strip = new T.Mesh(new T.BoxGeometry(p.size[0] * 0.5, 0.035, 0.03), edge.mat); strip.position.set(0, p.size[1] / 2 - 0.12, p.size[2] / 2 + 0.02); g.add(strip); entry.glow.push(edge)
          break
        }
        case 'gpu-laptop': g.add(kit.shade(new T.Mesh(kit.rbox(...p.size, 0.02), mats.anodised))); break
        case 'nvme': g.add(kit.nvmeStick(mats, p.size)); break
        case 'sata': g.add(kit.sataDrive(mats, p.size)); break
        default: g.add(kit.shade(new T.Mesh(new T.BoxGeometry(...p.size), mats.satin)))
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
          let level = 1, col = accent
          if (st) {
            if (st.heat != null) { col = M.heatColor(st.heat, accent); level = 0.6 + (st.load != null ? st.load : 0.3) * 0.9 }
            else if (st.load != null) level = 0.7 + st.load * 0.8
            else if (st.fill != null) level = 0.7 + st.fill * 0.6
          }
          g.target = level * AMB * g.strength
          g.color.setRGB(...col)
        }
      }
      // decorative case fans: steady ambient ring; surge and spin only for the indexes we actually have a reading for
      const caseReal = (state && state.caseFans) || []
      for (const f of decorFans) {
        const lv = caseReal[f.index]
        f.ring.target = AMB * (lv != null ? 1 + lv * 0.5 : 1) * f.ring.strength
        if (!reducedMotion() && lv != null) f.spinGroup.rotation.z -= dt * (1 + lv * 14)
      }
      // GPU shroud fans: one real reading drives all three
      const gpuFan = state && state.gpu && state.gpu.fan
      if (!reducedMotion() && gpuFan != null) for (const f of gpuFans) f.spinGroup.rotation.z -= dt * (1 + gpuFan * 16)
      let sum = 0
      for (const g of glowMats) {
        g.level += (g.target - g.level) * k
        g.mat.emissive.copy(g.color); g.mat.emissiveIntensity = g.level * (quality === 'full' ? 1 : 0.85)
        sum += g.level / Math.max(g.strength, 0.01)
      }
      // spill light follows the average glow, so a hot or busy rig lights its interior harder
      const avg = glowMats.length ? sum / glowMats.length / AMB : 1
      const heatCol = state && state.gpu && state.gpu.heat != null ? M.heatColor(state.gpu.heat, accent) : accent
      spills.forEach((s, i) => { s.light.intensity = s.i * Math.min(1.8, avg); if (i === 1) s.light.color.setRGB(...heatCol) })
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

    // ── camera ────────────────────────────────────────────────────────────────────────────────────────────────────────
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

    // ── picking ───────────────────────────────────────────────────────────────────────────────────────────────────────
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
      for (const [pid, e] of parts) for (const g of e.glow) g.strength = pid === id ? g.base * 1.5 : g.base
    }

    // ── frame ─────────────────────────────────────────────────────────────────────────────────────────────────────────
    let lastSize = ''
    function resize(w, h, dpr) {
      const pr = quality === 'full' ? Math.min(dpr || 1, 1.5) : 1, key = w + 'x' + h + '@' + pr
      if (key === lastSize) return   // re-attaching to a same-sized slot must not rebuild the MSAA/bloom targets
      lastSize = key
      renderer.setPixelRatio(pr)
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
    function setAccent(rgb) {
      accent = rgb; accentColor.setRGB(...rgb)
      for (const s of spills) s.light.color.setRGB(...rgb)
      if (scene.background) scene.background.dispose(); scene.background = backdrop(rgb)
    }
    function dispose() { disposeWorld(); try { composer && composer.dispose?.() } catch {} pmrem.dispose(); envTex.dispose(); renderer.dispose(); renderer.forceContextLoss?.() }

    setupComposer()
    return { domElement: dom, rendererName, build, setReveal, partIds: () => [...parts.keys()], setState, setView, focus, pick, setHover, resize, render, setAccent, dispose, settled,
      nudge(dyaw, dpitch) { user.yaw = Math.max(-0.5, Math.min(0.5, user.yaw + dyaw)); user.pitch = Math.max(-0.25, Math.min(0.25, user.pitch + dpitch)) },
      release() { user.yaw = user.pitch = 0 }, get focusId() { return focusId }, parts: () => [...parts.keys()] }
  }

  root.JylliTwinEngine = { create }
})(typeof window !== 'undefined' ? window : globalThis)
