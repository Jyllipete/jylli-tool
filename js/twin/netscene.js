'use strict'
// Small self-contained Three.js scene for the Network hero: This PC -> Router -> Internet. Reuses the model kit (js/twin/kit.js)
// and the three bundle loaded by js/twin/host.js (or loads it itself if the Home page has not). Holds no telemetry of its own:
// the caller (js/pages/network-hero.js) passes link traffic in, exactly as the old 2D canvas did. Not unit-tested (needs WebGL);
// it draws nothing it cannot justify from real data (particles only flow on a link that has a real rx/tx reading).
;(function (root) {
  const Kit = () => root.JylliTwinKit

  function loadBundle() {
    if (root.THREE && root.THREE.Addons) return Promise.resolve(true)
    return new Promise(res => {
      const s = document.createElement('script')
      s.src = root.JYLLI_TWIN_BUNDLE || 'js/vendor/three.bundle.js'
      s.onload = () => res(!!(root.THREE && root.THREE.Addons))
      s.onerror = () => res(false)
      document.head.appendChild(s)
    })
  }

  function webglAvailable() {
    try {
      const c = document.createElement('canvas')
      const gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: true }) || c.getContext('webgl', { failIfMajorPerformanceCaveat: true })
      if (!gl) return false
      const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext()
      return true
    } catch { return false }
  }

  /** create(container, { accent }) -> controller, or null if WebGL is unavailable. Caller keeps the 2D canvas as its fallback. */
  async function create(container, { accent = [0.55, 0.49, 0.96] } = {}) {
    if (!webglAvailable()) return null
    if (!(await loadBundle())) return null
    const T = root.THREE, A = T.Addons
    const kit = Kit(); kit.init(T)
    const renderer = new T.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'low-power' })
    renderer.toneMapping = T.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.7
    renderer.setClearColor(0x000000, 0)
    const dom = renderer.domElement
    dom.className = 'j-twin-canvas'
    dom.setAttribute('aria-hidden', 'true')
    container.appendChild(dom)

    const scene = new T.Scene()
    const camera = new T.PerspectiveCamera(38, 1, 0.1, 100)
    camera.position.set(0, 3.2, 13); camera.lookAt(0, 0, 0)

    const accentColor = new T.Color(...accent)
    const mats = kit.materials(accentColor)
    const pmrem = new T.PMREMGenerator(renderer)
    const envTex = pmrem.fromScene(kit.studioScene(), 0.04).texture
    scene.environment = envTex; scene.environmentIntensity = 1.0

    const key = new T.DirectionalLight(0xffffff, 3.2); key.position.set(4, 7, 7); scene.add(key)
    const beauty = new T.DirectionalLight(0xffffff, 2.2); beauty.position.set(0, 2, 10); scene.add(beauty)
    scene.add(new T.HemisphereLight(0xb8b8ff, 0x16161c, 1.0))
    const rim = new T.PointLight(accentColor, 16, 24, 2); rim.position.set(-4, 2, 3); scene.add(rim)

    const NODE_X = { pc: -5.2, router: 0, internet: 5.2 }
    const world = new T.Group(); scene.add(world)
    world.add(kit.groundPlane(mats, 20, 8).translateY(-1.3))

    function glow(intensity = 0.9) {
      return new T.MeshStandardMaterial({ color: 0x060608, roughness: 0.4, metalness: 0.1, emissive: accentColor.clone(), emissiveIntensity: intensity })
    }
    const pcLed = glow(), routerLed = glow(), netLed = glow(0.7)
    const pc = kit.miniTower(mats, pcLed); pc.position.set(NODE_X.pc, -0.1, 0); pc.rotation.y = 0.5; world.add(pc)
    const rtr = kit.router(mats, routerLed); rtr.position.set(NODE_X.router, -1.0, 0); world.add(rtr)
    const srv = kit.serverRack(mats, netLed); srv.position.set(NODE_X.internet, 0, 0); world.add(srv)

    // ── links: one curved tube per up adapter, an emissive core that brightens with real traffic, plus flowing particles ──────
    const linkGroup = new T.Group(); world.add(linkGroup)
    let links = []   // { curve, core:Mesh, mat, particles:[{t,dir,speed}], mesh:InstancedMesh }
    const MAX_PARTICLES = 48

    function buildLinks(n) {
      linkGroup.clear(); links = []
      const count = Math.max(1, n)
      for (let i = 0; i < count; i++) {
        const off = (i - (count - 1) / 2) * 0.55
        const p0 = new T.Vector3(NODE_X.pc + 0.9, -0.1 + off * 0.4, 0.3)
        const p1 = new T.Vector3(NODE_X.router - 0.9, -0.8 + off * 0.2, 0.3)
        const p2 = new T.Vector3(NODE_X.router + 0.9, -0.8, 0.3)
        const p3 = new T.Vector3(NODE_X.internet - 0.9, -0.2, 0.3)
        const curveA = new T.CatmullRomCurve3([p0, new T.Vector3((p0.x + p1.x) / 2, Math.max(p0.y, p1.y) + 0.6, 0.3), p1])
        const curveB = new T.CatmullRomCurve3([p2, new T.Vector3((p2.x + p3.x) / 2, Math.max(p2.y, p3.y) + 0.8, 0.3), p3])
        const mat = new T.MeshStandardMaterial({ color: 0x0a0a10, roughness: 0.5, metalness: 0.2, emissive: accentColor.clone(), emissiveIntensity: 0.12, transparent: true, opacity: 0.55 })
        const coreA = new T.Mesh(new T.TubeGeometry(curveA, 24, 0.025, 6), mat)
        const coreB = new T.Mesh(new T.TubeGeometry(curveB, 24, 0.025, 6), mat)
        linkGroup.add(coreA); linkGroup.add(coreB)
        const dotGeo = new T.SphereGeometry(0.045, 8, 8)
        const dotMat = new T.MeshBasicMaterial({ color: accentColor })
        const mesh = new T.InstancedMesh(dotGeo, dotMat, MAX_PARTICLES)
        mesh.count = 0
        linkGroup.add(mesh)
        links.push({ curveA, curveB, mat, mesh, particles: [], level: 0, target: 0 })
      }
    }
    buildLinks(1)

    const dummy = new T.Object3D()
    function stepLinks(dt, linkLevels) {
      // linkLevels[i] = { rx, tx } in bytes/sec or null; spawn rate follows a log scale of the real rate, same curve as the old 2D canvas
      for (let i = 0; i < links.length; i++) {
        const l = links[i], lv = linkLevels[i] || {}
        const active = (lv.rx != null && lv.rx > 1024) || (lv.tx != null && lv.tx > 1024)
        l.target = active ? 1 : 0.1
        l.level += (l.target - l.level) * (1 - Math.exp(-dt / 0.4))
        l.mat.emissiveIntensity = 0.1 + l.level * 1.1
        for (const [dir, bps] of [[-1, lv.rx], [1, lv.tx]]) {
          if (bps == null || bps < 1024) continue
          const rate = Math.min(10, 1.2 + Math.log10(bps / 1024) * 2.6)
          if (Math.random() < rate * dt && l.particles.length < MAX_PARTICLES) l.particles.push({ dir, t: dir > 0 ? 0 : 1, speed: 0.3 + Math.random() * 0.2 })
        }
        l.particles = l.particles.filter(p => { p.t += p.dir * p.speed * dt; return p.t >= -0.02 && p.t <= 1.02 })
        let idx = 0
        for (const p of l.particles) {
          const t = Math.min(1, Math.max(0, p.t))
          const pos = t < 0.5 ? l.curveA.getPoint(Math.min(1, t * 2)) : l.curveB.getPoint(Math.min(1, (t - 0.5) * 2))
          dummy.position.copy(pos); dummy.updateMatrix()
          l.mesh.setMatrixAt(idx++, dummy.matrix)
        }
        l.mesh.count = idx
        l.mesh.instanceMatrix.needsUpdate = true
      }
    }

    function resize(w, h, dpr) {
      renderer.setPixelRatio(Math.min(dpr || 1, 1.5))
      renderer.setSize(w, h, false)
      camera.aspect = w / Math.max(h, 1); camera.updateProjectionMatrix()
    }
    let raf = 0, last = 0
    function render(now) {
      raf = requestAnimationFrame(render)
      if (document.visibilityState !== 'visible' || !document.body.contains(dom)) return
      const dt = Math.min(0.1, (now - last) / 1000 || 0.016); last = now
      stepLinks(dt, state.linkLevels)
      renderer.render(scene, camera)
    }
    const state = { linkLevels: [] }
    function setTraffic(levels) {
      if (levels.length !== links.length) buildLinks(levels.length)
      state.linkLevels = levels
    }
    function projectAnchors() {
      const toScreen = (v) => { const p = v.clone().project(camera); return { x: (p.x * 0.5 + 0.5) * dom.clientWidth, y: (-p.y * 0.5 + 0.5) * dom.clientHeight } }
      return { pc: toScreen(new T.Vector3(NODE_X.pc, -1.3, 0)), router: toScreen(new T.Vector3(NODE_X.router, -1.3, 0)), internet: toScreen(new T.Vector3(NODE_X.internet, -1.3, 0)) }
    }
    function dispose() {
      cancelAnimationFrame(raf)
      scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose && m.dispose()) })
      pmrem.dispose(); envTex.dispose(); renderer.dispose(); renderer.forceContextLoss?.()
      if (dom.parentElement) dom.parentElement.removeChild(dom)
    }
    raf = requestAnimationFrame(render)
    return { domElement: dom, resize, setTraffic, projectAnchors, dispose }
  }

  root.JylliTwinNet = { create }
})(typeof window !== 'undefined' ? window : globalThis)
