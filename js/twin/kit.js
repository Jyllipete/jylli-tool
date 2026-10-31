'use strict'
// Procedural model kit shared by the rig twin (js/twin/engine.js) and the network scene. Everything here is built from primitives
// and canvas textures at runtime: no downloaded assets, no vendor logos. Pure "how to build a believable part" — it holds no
// telemetry and no honesty rules; those stay in js/twin/mapping.js and the callers that decide what to show.
;(function (root) {
  let T = null, cache = null

  function init(THREE) {
    if (T === THREE && cache) return cache
    T = THREE
    cache = { tex: {}, mats: null }
    return cache
  }

  // ── canvas textures (built once per engine instance, cached by key) ────────────────────────────────────────────────────────
  function tex(key, build) {
    if (cache.tex[key]) return cache.tex[key]
    const t = build()
    cache.tex[key] = t
    return t
  }
  function mkCanvas(size) { const c = document.createElement('canvas'); c.width = c.height = size; return c }
  function toTex(c, { srgb = false, repeat = null } = {}) {
    const t = new T.CanvasTexture(c)
    if (srgb) t.colorSpace = T.SRGBColorSpace
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(...repeat) }
    t.needsUpdate = true
    return t
  }
  let rngSeed = 7
  function rng() { rngSeed = (rngSeed * 16807) % 2147483647; return rngSeed / 2147483647 }

  function brushedAluminium() {
    return tex('alu', () => {
      const c = mkCanvas(256), x = c.getContext('2d')
      x.fillStyle = '#3a3a42'; x.fillRect(0, 0, 256, 256)
      for (let i = 0; i < 900; i++) { const y = Math.random() * 256; x.strokeStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.05})`; x.beginPath(); x.moveTo(0, y); x.lineTo(256, y + (Math.random() - 0.5) * 2); x.stroke() }
      return toTex(c, { srgb: true, repeat: [2, 2] })
    })
  }
  function meshAlpha() {
    return tex('mesh', () => {
      const c = mkCanvas(128), x = c.getContext('2d')
      x.fillStyle = '#000'; x.fillRect(0, 0, 128, 128)
      x.fillStyle = '#fff'
      const r = 7, gap = 17
      for (let yy = 0; yy < 128 + gap; yy += gap) for (let xx = 0; xx < 128 + gap; xx += gap) { x.beginPath(); x.arc(xx + (Math.floor(yy / gap) % 2 ? gap / 2 : 0), yy, r, 0, 7); x.fill() }
      return toTex(c, { repeat: [5, 7] })
    })
  }
  function pcbTexture() {
    return tex('pcb', () => {
      const c = mkCanvas(512), x = c.getContext('2d')
      x.fillStyle = '#121218'; x.fillRect(0, 0, 512, 512)
      x.strokeStyle = 'rgba(140,150,255,.1)'; x.lineWidth = 1.4
      let seed = 11; const r2 = () => (seed = (seed * 16807) % 2147483647) / 2147483647
      for (let i = 0; i < 220; i++) { let px = r2() * 512, py = r2() * 512; x.beginPath(); x.moveTo(px, py); for (let j = 0; j < 4; j++) { if (j % 2) py += (r2() - 0.5) * 90; else px += (r2() - 0.5) * 110; x.lineTo(px, py) } x.stroke() }
      x.fillStyle = 'rgba(255,215,120,.18)'; for (let i = 0; i < 90; i++) { const px = r2() * 512, py = r2() * 512; x.beginPath(); x.arc(px, py, 2.4, 0, 7); x.fill() }
      x.strokeStyle = 'rgba(255,255,255,.1)'; x.font = '9px sans-serif'; x.fillStyle = 'rgba(255,255,255,.08)'
      for (let i = 0; i < 10; i++) x.fillText('J' + (i + 1), r2() * 480, r2() * 500)
      return toTex(c, { srgb: true, repeat: [1.4, 1.6] })
    })
  }
  function heatspreaderTex(rgb) {
    return tex('ram-' + rgb.join(','), () => {
      const c = mkCanvas(64), x = c.getContext('2d')
      const g = x.createLinearGradient(0, 0, 64, 0)
      g.addColorStop(0, `rgb(${rgb.map(v => Math.round(v * 255 * 0.5)).join(',')})`)
      g.addColorStop(0.5, `rgb(${rgb.map(v => Math.round(v * 255)).join(',')})`)
      g.addColorStop(1, `rgb(${rgb.map(v => Math.round(v * 255 * 0.5)).join(',')})`)
      x.fillStyle = g; x.fillRect(0, 0, 64, 64)
      x.strokeStyle = 'rgba(0,0,0,.25)'; for (let i = 4; i < 64; i += 7) { x.beginPath(); x.moveTo(0, i); x.lineTo(64, i); x.stroke() }
      return toTex(c, { srgb: true, repeat: [1, 6] })
    })
  }
  function shadowTex() {
    return tex('shadow', () => {
      const c = mkCanvas(128), x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64)
      gr.addColorStop(0, 'rgba(0,0,0,.85)'); gr.addColorStop(1, 'rgba(0,0,0,0)')
      x.fillStyle = gr; x.fillRect(0, 0, 128, 128)
      return toTex(c)
    })
  }
  function floorTex() {
    return tex('floor', () => {
      const c = mkCanvas(256), x = c.getContext('2d')
      x.fillStyle = '#0b0b0e'; x.fillRect(0, 0, 256, 256)
      const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, 'rgba(255,255,255,.04)'); g.addColorStop(1, 'rgba(255,255,255,0)')
      x.fillStyle = g; x.fillRect(0, 0, 256, 256)
      return toTex(c, { srgb: true })
    })
  }

  // ── studio environment: small dark room with two softbox panels, used instead of RoomEnvironment for believable glass/metal ──
  function studioScene() {
    const s = new T.Scene()
    s.background = new T.Color(0x060608)
    const room = new T.Mesh(new T.BoxGeometry(30, 20, 30), new T.MeshStandardMaterial({ color: 0x0c0c10, side: T.BackSide, roughness: 1 }))
    s.add(room)
    const softbox = (x, y, z, w, h, intensity) => {
      const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: 0xffffff }))
      m.position.set(x, y, z); m.lookAt(0, 2, 0)
      s.add(m)
      const l = new T.PointLight(0xffffff, intensity, 24); l.position.set(x, y, z); s.add(l)
      return m
    }
    softbox(10, 9, 4, 8, 10, 60)
    softbox(-9, 5, -6, 6, 8, 28)
    const strip = new T.Mesh(new T.PlaneGeometry(1, 14), new T.MeshBasicMaterial({ color: 0x8b7cf6 }))
    strip.position.set(-11, 2, 2); strip.lookAt(0, 2, 0); s.add(strip)
    const stripLight = new T.PointLight(0x8b7cf6, 14, 20); stripLight.position.set(-11, 2, 2); s.add(stripLight)
    return s
  }

  // ── materials (built per engine instance so accent tint/env can vary) ──────────────────────────────────────────────────────
  function materials(accentColor) {
    const alu = brushedAluminium(), mesh = meshAlpha(), pcb = pcbTexture(), floor = floorTex()
    return {
      anodised: new T.MeshStandardMaterial({ color: 0x3a3a44, roughness: 0.4, metalness: 0.55, map: alu }),
      gunmetal: new T.MeshStandardMaterial({ color: 0x45454f, roughness: 0.45, metalness: 0.55, map: alu }),
      satin: new T.MeshStandardMaterial({ color: 0x24242b, roughness: 0.55, metalness: 0.25 }),
      pcb: new T.MeshStandardMaterial({ color: 0xffffff, map: pcb, roughness: 0.78, metalness: 0.25 }),
      glass: new T.MeshPhysicalMaterial({ color: 0x14141c, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.28, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 2.2, side: T.DoubleSide }),
      chrome: new T.MeshStandardMaterial({ color: 0xdadde2, roughness: 0.12, metalness: 1 }),
      meshPanel: new T.MeshStandardMaterial({ color: 0x1c1c24, roughness: 0.45, metalness: 0.65, alphaMap: mesh, transparent: true, side: T.DoubleSide }),
      floor: new T.MeshStandardMaterial({ color: 0x0b0b0e, roughness: 0.35, metalness: 0.3, map: floor, envMapIntensity: 0.6 }),
      accentPlastic: new T.MeshStandardMaterial({ color: 0x101014, roughness: 0.4, metalness: 0.1, emissive: accentColor.clone(), emissiveIntensity: 0.25 }),
    }
  }

  // ── geometry helpers ────────────────────────────────────────────────────────────────────────────────────────────────────
  function rbox(w, h, d, r = 0.06, segs = 3) { return new T.Addons.RoundedBoxGeometry(w, h, d, segs, Math.max(0.001, Math.min(r, w / 2.1, h / 2.1, d / 2.1))) }
  function merge(entries) {
    // entries: [{ geo, mat }] grouped by material identity -> one Mesh per material (keeps draw calls low)
    const byMat = new Map()
    for (const e of entries) { if (!byMat.has(e.mat)) byMat.set(e.mat, []); byMat.get(e.mat).push(e.geo) }
    const meshes = []
    for (const [mat, geos] of byMat) { const g = T.Addons.mergeGeometries(geos, false); meshes.push(new T.Mesh(g, mat)) }
    return meshes
  }
  function at(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    const m = new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new T.Vector3(sx, sy, sz))
    geo.applyMatrix4(m); return geo
  }

  // ── fan: frame + swept blades + hub + optional LED ring. `ringMat` is supplied by the caller (engine.glowMat) so the state
  // logic that drives emissive level stays in one place; pass null for a fan with no ring. ─────────────────────────────────
  function fan(mats, r, { frame = true, ringMat = null } = {}) {
    const g = new T.Group(), spin = new T.Group(); g.add(spin)
    if (frame) {
      const corner = new T.Mesh(rbox(r * 2.3, r * 2.3, 0.14, 0.14), mats.satin)
      g.add(corner)
    }
    const bladeGeos = []
    for (let i = 0; i < 9; i++) { const b = rbox(r * 0.42, r * 0.86, 0.04, 0.02, 1); at(b, 0, r * 0.46, 0, 0, 0.55, 0); const piv = new T.Matrix4().makeRotationZ((i / 9) * Math.PI * 2); b.applyMatrix4(piv); bladeGeos.push({ geo: b, mat: mats.satin }) }
    const hub = new T.CylinderGeometry(r * 0.2, r * 0.22, 0.12, 20).rotateX(Math.PI / 2)
    bladeGeos.push({ geo: hub, mat: mats.gunmetal })
    merge(bladeGeos).forEach(m => spin.add(m))
    if (ringMat) { const rg = new T.Mesh(new T.TorusGeometry(r * 1.0, 0.045, 10, 56), ringMat); g.add(rg) }
    g.userData.spin = spin
    return { group: g, spin }
  }

  // ── case tower: aluminium frame, glass side + top, perforated front, PSU shroud ────────────────────────────────────────────
  function caseTower(mats, size) {
    const [w, h, d] = size, g = new T.Group()
    const wallT = 0.1
    const frameParts = [
      { geo: rbox(w, wallT, d, 0.04), mat: mats.anodised, y: h / 2 },     // top rail
      { geo: rbox(w, wallT, d, 0.04), mat: mats.anodised, y: -h / 2 },    // bottom rail
      { geo: rbox(wallT, h, d, 0.04), mat: mats.anodised, x: -w / 2 },    // left post
      { geo: rbox(wallT, h, wallT, 0.03), mat: mats.anodised, x: w / 2, z: d / 2 - wallT / 2 },  // right-front post
      { geo: rbox(wallT, h, wallT, 0.03), mat: mats.anodised, x: w / 2, z: -d / 2 + wallT / 2 }, // right-rear post
    ]
    merge(frameParts.map(p => ({ geo: at(p.geo, p.x || 0, p.y || 0, p.z || 0), mat: p.mat }))).forEach(m => g.add(m))
    // glass side panel (right) and top strip
    const side = new T.Mesh(new T.PlaneGeometry(d * 0.94, h * 0.94), mats.glass); side.rotation.y = Math.PI / 2; side.position.set(w / 2 - 0.01, 0, 0); g.add(side)
    const top = new T.Mesh(new T.PlaneGeometry(w * 0.9, d * 0.5), mats.glass); top.rotation.x = Math.PI / 2; top.position.set(0, h / 2 - 0.01, d * 0.1); g.add(top)
    // perforated front mesh panel
    const front = new T.Mesh(new T.PlaneGeometry(w * 0.92, h * 0.86), mats.meshPanel); front.position.set(0, -0.1, d / 2 + 0.01); g.add(front)
    // a thin bezel border around the mesh, not a solid cover: 4 slim bars, not a filled panel
    const bezelZ = d / 2 + 0.03, bezelT = 0.07
    const bezel = []
    bezel.push({ geo: at(rbox(w * 0.98, bezelT, 0.05, 0.02), 0, -0.1 + h * 0.47, bezelZ), mat: mats.anodised })
    bezel.push({ geo: at(rbox(w * 0.98, bezelT, 0.05, 0.02), 0, -0.1 - h * 0.47, bezelZ), mat: mats.anodised })
    bezel.push({ geo: at(rbox(bezelT, h * 0.94, 0.05, 0.02), -w * 0.49, -0.1, bezelZ), mat: mats.anodised })
    bezel.push({ geo: at(rbox(bezelT, h * 0.94, 0.05, 0.02), w * 0.49, -0.1, bezelZ), mat: mats.anodised })
    merge(bezel).forEach(m => g.add(m))
    // feet
    const feetGeo = []
    for (const fx of [-w / 2 + 0.5, w / 2 - 0.5]) for (const fz of [-d / 2 + 0.4, d / 2 - 0.4]) feetGeo.push({ geo: at(new T.CylinderGeometry(0.16, 0.2, 0.22, 10), fx, -h / 2 - 0.1, fz), mat: mats.gunmetal })
    merge(feetGeo).forEach(m => g.add(m))
    return g
  }

  function psuShroud(mats, size) {
    const [w, h, d] = size, g = new T.Group()
    g.add(new T.Mesh(rbox(w, h, d, 0.1), mats.satin))
    const vent = new T.Mesh(new T.PlaneGeometry(w * 0.8, d * 0.6), mats.meshPanel); vent.rotation.x = -Math.PI / 2; vent.position.y = h / 2 + 0.005; g.add(vent)
    return g
  }

  // ── motherboard: PCB + VRM heatsinks + I/O shroud + chipset heatsink + DIMM latches + M.2 heatsinks + headers ──────────────
  function board(mats, size) {
    const [w, h, d = 0.16] = size, g = new T.Group(), z = d / 2
    g.add(new T.Mesh(new T.BoxGeometry(w, h, d), mats.pcb))
    const metal = []
    // VRM heatsink along the top (near CPU socket, which sits ~upper-left in rig space)
    metal.push({ geo: at(rbox(w * 0.32, 0.5, 0.22, 0.04), -w * 0.18, h * 0.33, z - 0.02), mat: mats.gunmetal })
    metal.push({ geo: at(rbox(0.5, h * 0.3, 0.22, 0.04), -w * 0.02, h * 0.35, z - 0.02), mat: mats.gunmetal })
    // chipset heatsink lower-centre
    metal.push({ geo: at(rbox(w * 0.22, h * 0.14, 0.1, 0.03), 0, -h * 0.1, z - 0.05), mat: mats.anodised })
    // I/O shield at the left edge
    metal.push({ geo: at(rbox(0.3, h * 0.5, 0.4, 0.04), -w / 2 + 0.1, h * 0.25, z + 0.04), mat: mats.gunmetal })
    // capacitors, scattered near the socket
    for (let i = 0; i < 10; i++) metal.push({ geo: at(new T.CylinderGeometry(0.045, 0.045, 0.12, 8), -w * 0.1 + (i % 5) * 0.09, h * 0.2 + Math.floor(i / 5) * 0.1, z - 0.02), mat: mats.chrome })
    // 24-pin + 8-pin headers (right edge)
    metal.push({ geo: at(rbox(0.16, 0.6, 0.18, 0.02), w / 2 - 0.12, h * 0.1, z - 0.06), mat: mats.satin })
    metal.push({ geo: at(rbox(0.16, 0.2, 0.18, 0.02), -w * 0.22, h * 0.42, z - 0.06), mat: mats.satin })
    merge(metal).forEach(m => g.add(m))
    return g
  }

  function m2Heatsink(mats, size) {
    const [w, , d] = size, g = new T.Group()
    g.add(new T.Mesh(rbox(w * 1.04, 0.06, d * 1.1, 0.02), mats.gunmetal))
    return g
  }

  // ── cooler: AIO pump/radiator and air tower ─────────────────────────────────────────────────────────────────────────────
  function aioPump(mats, size) {
    const g = new T.Group()
    const body = new T.Mesh(new T.CylinderGeometry(size[0] / 2, size[0] / 2, size[2] * 0.6, 40).rotateX(Math.PI / 2), mats.gunmetal)
    g.add(body)
    const cap = new T.Mesh(new T.CylinderGeometry(size[0] / 2 - 0.05, size[0] / 2 - 0.05, 0.06, 40).rotateX(Math.PI / 2), mats.chrome)
    cap.position.z = size[2] / 2 - 0.02; g.add(cap)
    return g
  }
  function radiatorFins(mats, size) {
    const [w, h, d] = size, g = new T.Group()
    g.add(new T.Mesh(rbox(w, h, d, 0.04), mats.anodised))
    const fin = new T.Mesh(new T.PlaneGeometry(w * 0.96, h * 0.82), mats.meshPanel); fin.position.z = d / 2 + 0.01; g.add(fin)
    return g
  }
  function airCoolerStack(mats, size) {
    const [w, h, d] = size, g = new T.Group()
    const fins = []
    const n = 14
    for (let i = 0; i < n; i++) fins.push({ geo: at(new T.PlaneGeometry(w * 0.95, h * 0.9), 0, 0, -d / 2 + (d / n) * i, 0, 0, 0), mat: mats.gunmetal })
    merge(fins).forEach(m => g.add(m))
    const pipes = []
    for (const dx of [-w * 0.3, -w * 0.1, w * 0.1, w * 0.3]) pipes.push({ geo: at(new T.CylinderGeometry(0.06, 0.06, d, 10).rotateX(Math.PI / 2), dx, h * 0.25, 0), mat: mats.chrome })
    merge(pipes).forEach(m => g.add(m))
    return g
  }

  // ── RAM: heatspreader with fin texture + LED diffuser strip (strip's material comes from the caller as a glow handle) ──────
  function ramStick(mats, size, rgbTint) {
    const g = new T.Group()
    const hs = new T.MeshStandardMaterial({ color: 0x2c2c34, roughness: 0.3, metalness: 0.65, map: heatspreaderTex(rgbTint || [0.3, 0.3, 0.34]) })
    g.add(new T.Mesh(rbox(size[0] * 0.82, size[1] - 0.08, 0.28, 0.035), hs))
    return g
  }

  // ── GPU: faceted shroud, 3 fan cutouts, backplate, bracket, power connector; fans built separately by caller ─────────────
  function gpuShroud(mats, size) {
    const [w, h, d] = size, g = new T.Group()
    g.add(new T.Mesh(rbox(w, h, d, 0.12), mats.anodised))
    const back = new T.Mesh(rbox(w * 0.98, h * 0.94, 0.05, 0.03), mats.gunmetal); back.position.z = -d / 2 - 0.03; g.add(back)
    const bracket = new T.Mesh(rbox(0.14, h * 0.7, 0.4, 0.02), mats.satin); bracket.position.set(-w / 2 - 0.05, 0, -d * 0.2); g.add(bracket)
    const vents = []
    for (let i = 0; i < 7; i++) vents.push({ geo: at(new T.BoxGeometry(0.02, h * 0.55, 0.3), bracket.position.x, 0, bracket.position.z - 0.15 + i * 0.05), mat: mats.satin })
    merge(vents).forEach(m => g.add(m))
    const conn = new T.Mesh(rbox(0.5, 0.18, 0.18, 0.03), mats.satin); conn.position.set(0, h / 2 + 0.05, -d * 0.25); g.add(conn)
    return g
  }

  // ── storage ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
  function nvmeStick(mats, size) {
    const g = new T.Group()
    g.add(new T.Mesh(rbox(...size, 0.02), mats.pcb))
    g.add(m2Heatsink(mats, size))
    return g
  }
  function sataDrive(mats, size) {
    const g = new T.Group()
    g.add(new T.Mesh(rbox(...size, 0.03), mats.satin))
    const label = new T.Mesh(new T.PlaneGeometry(size[0] * 0.01, size[1] * 0.6), mats.gunmetal); g.add(label)
    return g
  }

  // ── laptop ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
  function laptopBody(mats, size) {
    const g = new T.Group()
    g.add(new T.Mesh(rbox(...size, 0.1), mats.anodised))
    return g
  }

  // ── network scene props: mini tower, router, server rack. `ledMat` is supplied by the caller (engine.glowMat). ──────────────
  function miniTower(mats, ledMat) {
    const g = caseTower(mats, [1.6, 2.4, 1.1])
    const led = new T.Mesh(new T.BoxGeometry(0.06, 1.8, 0.03), ledMat); led.position.set(-0.78, 0, 0.3); g.add(led)
    return g
  }
  function router(mats, ledMat) {
    const g = new T.Group()
    g.add(new T.Mesh(rbox(1.6, 0.26, 1.0, 0.1), mats.satin))
    const dots = []
    for (let i = 0; i < 4; i++) dots.push({ geo: at(new T.CylinderGeometry(0.025, 0.025, 0.02, 10), -0.5 + i * 0.34, 0.14, 0.42), mat: ledMat })
    merge(dots).forEach(m => g.add(m))
    const antGeo = []
    for (const ax of [-0.55, -0.18, 0.18, 0.55]) antGeo.push({ geo: at(new T.CylinderGeometry(0.025, 0.03, 0.9, 10), ax, 0.58, -0.3, 0.26, 0, 0), mat: mats.satin })
    merge(antGeo).forEach(m => g.add(m))
    const vent = new T.Mesh(new T.PlaneGeometry(1.3, 0.8), mats.meshPanel); vent.rotation.x = -Math.PI / 2; vent.position.y = 0.135; g.add(vent)
    return g
  }
  function serverRack(mats, ledMat) {
    const g = new T.Group()
    const units = [], leds = []
    for (let i = 0; i < 5; i++) {
      units.push({ geo: at(rbox(1.5, 0.3, 1.5, 0.03), 0, -1.1 + i * 0.36, 0), mat: i % 2 ? mats.gunmetal : mats.satin })
      for (let j = 0; j < 5; j++) leds.push({ geo: at(new T.BoxGeometry(0.05, 0.03, 0.02), -0.6 + j * 0.06, -1.1 + i * 0.36, 0.76), mat: ledMat })
    }
    merge(units).forEach(m => g.add(m))
    merge(leds).forEach(m => g.add(m))
    const doorMesh = new T.Mesh(new T.PlaneGeometry(1.5, 2.0), mats.meshPanel); doorMesh.position.set(0, -0.3, 0.78); g.add(doorMesh)
    return g
  }

  // ── ground ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
  function groundPlane(mats, w, d) {
    const floor = new T.Mesh(new T.PlaneGeometry(w, d), mats.floor); floor.rotation.x = -Math.PI / 2
    const sh = new T.Mesh(new T.PlaneGeometry(w * 0.7, d * 0.7), new T.MeshBasicMaterial({ map: shadowTex(), transparent: true, opacity: 0.5, depthWrite: false }))
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.01
    const g = new T.Group(); g.add(floor); g.add(sh)
    return g
  }

  const api = {
    init, materials, studioScene, groundPlane,
    fan, caseTower, psuShroud, board, m2Heatsink, aioPump, radiatorFins, airCoolerStack, ramStick, gpuShroud, nvmeStick, sataDrive, laptopBody,
    miniTower, router, serverRack,
    rbox, merge, at,
  }
  root.JylliTwinKit = api
})(typeof window !== 'undefined' ? window : globalThis)
