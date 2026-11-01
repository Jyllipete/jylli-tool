'use strict'
// Procedural model kit shared by the rig twin (js/twin/engine.js) and the network scene. Everything here is built from
// primitives and canvas textures at runtime: no downloaded assets, no vendor logos. Pure "how to build a believable part": it holds no
// telemetry and no honesty rules; those stay in js/twin/mapping.js and the callers that decide what to show.
// Units are the rig's "case units" (a tower is ~8.4 x 10.4 x 4.6). Parts face +z (the viewer's side); the board sits at the back.
;(function (root) {
  let T = null, cache = null

  /** `anisotropy` (from the renderer's capabilities) keeps grazing-angle surfaces such as the GPU top and board from shimmering. */
  function init(THREE, { anisotropy = 1 } = {}) {
    if (T === THREE && cache) {
      cache.aniso = Math.max(cache.aniso, anisotropy)
      for (const t of Object.values(cache.tex)) t.anisotropy = cache.aniso
      return cache
    }
    T = THREE
    cache = { tex: {}, mats: null, aniso: anisotropy }
    return cache
  }

  // ── canvas textures (built once per engine instance, cached by key) ────────────────────────────────────────────────────────
  function tex(key, build) {
    if (cache.tex[key]) return cache.tex[key]
    const t = build()
    cache.tex[key] = t
    return t
  }
  function mkCanvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
  function toTex(c, { srgb = false, repeat = null } = {}) {
    const t = new T.CanvasTexture(c)
    if (srgb) t.colorSpace = T.SRGBColorSpace
    t.anisotropy = cache.aniso
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(...repeat) }
    t.needsUpdate = true
    return t
  }

  function brushedAluminium() {
    return tex('alu', () => {
      const c = mkCanvas(256), x = c.getContext('2d')
      x.fillStyle = '#3a3a42'; x.fillRect(0, 0, 256, 256)
      for (let i = 0; i < 250; i++) { const y = Math.random() * 256; x.strokeStyle = `rgba(255,255,255,${0.015 + Math.random() * 0.025})`; x.beginPath(); x.moveTo(0, y); x.lineTo(256, y + (Math.random() - 0.5) * 2); x.stroke() }
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
  // Matte board with a few long, straight, 45-degree trace bundles: large soft features that survive minification.
  function pcbTexture() {
    return tex('pcb', () => {
      const c = mkCanvas(1024), x = c.getContext('2d')
      const g = x.createLinearGradient(0, 0, 0, 1024); g.addColorStop(0, '#2c2c36'); g.addColorStop(1, '#22222a')
      x.fillStyle = g; x.fillRect(0, 0, 1024, 1024)
      x.lineCap = 'round'; x.lineJoin = 'round'
      const bundle = (pts, n) => {
        for (let i = 0; i < n; i++) {
          x.strokeStyle = 'rgba(170,180,255,.09)'; x.lineWidth = 4; x.beginPath()
          pts.forEach(([px, py], j) => { const o = i * 14; j ? x.lineTo(px + o, py) : x.moveTo(px + o, py) })
          x.stroke()
        }
      }
      void bundle   // trace bundles removed: at close range they read as light streaks
      return toTex(c, { srgb: true, repeat: [1, 1] })
    })
  }
  function heatspreaderTex(rgb) {
    return tex('ram-' + rgb.join(','), () => {
      const c = mkCanvas(64), x = c.getContext('2d')
      const g = x.createLinearGradient(0, 0, 64, 0)
      g.addColorStop(0, `rgb(${rgb.map(v => Math.round(v * 255 * 0.35)).join(',')})`)
      g.addColorStop(0.5, `rgb(${rgb.map(v => Math.round(v * 255 * 0.7)).join(',')})`)
      g.addColorStop(1, `rgb(${rgb.map(v => Math.round(v * 255 * 0.35)).join(',')})`)
      x.fillStyle = g; x.fillRect(0, 0, 64, 64)
      x.strokeStyle = 'rgba(0,0,0,.3)'; for (let i = 4; i < 64; i += 7) { x.beginPath(); x.moveTo(0, i); x.lineTo(64, i); x.stroke() }
      return toTex(c, { srgb: true, repeat: [1, 6] })
    })
  }
  // soft contact shadow blob
  function shadowTex() {
    return tex('shadow', () => {
      const c = mkCanvas(128), x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64)
      gr.addColorStop(0, 'rgba(0,0,0,.9)'); gr.addColorStop(0.55, 'rgba(0,0,0,.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)')
      x.fillStyle = gr; x.fillRect(0, 0, 128, 128)
      return toTex(c)
    })
  }
  // radial pool of light on the ground (white, tinted by the material colour)
  function poolTex() {
    return tex('pool', () => {
      const c = mkCanvas(128), x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64)
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)')
      x.fillStyle = gr; x.fillRect(0, 0, 128, 128)
      return toTex(c)
    })
  }
  // fine diagonal weave, used as a bump map on cable sleeves (u runs along the tube)
  function braidTex() {
    return tex('braid', () => {
      const c = mkCanvas(64), x = c.getContext('2d')
      x.fillStyle = '#808080'; x.fillRect(0, 0, 64, 64)
      x.strokeStyle = '#f0f0f0'; x.lineWidth = 5
      for (let i = -64; i < 128; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 64, 64); x.stroke() }
      x.strokeStyle = '#202020'
      for (let i = -64; i < 128; i += 16) { x.beginPath(); x.moveTo(i + 8, 64); x.lineTo(i + 72, 0); x.stroke() }
      return toTex(c, { repeat: [60, 2] })
    })
  }

  // ── studio environment: dark room, a ceiling panel and tall thin strip lights, so glass and metal pick up crisp product-shot
  // reflection lines instead of a grey wash. Basic (unlit) materials above 1.0 give HDR highlights in the PMREM. ────────────────
  function studioScene() {
    const s = new T.Scene()
    s.background = new T.Color(0x040406)
    const wall = new T.MeshBasicMaterial({ color: 0x07070a, side: T.BackSide })
    s.add(new T.Mesh(new T.BoxGeometry(34, 22, 34), wall))
    const panel = (w, h, pos, rgb, k) => {
      const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(rgb[0] * k, rgb[1] * k, rgb[2] * k), side: T.DoubleSide, toneMapped: false }))
      m.position.set(...pos); m.lookAt(0, 0, 0); s.add(m); return m
    }
    panel(16, 3, [0, 10.5, 2], [1, 1, 1], 3.2)          // long ceiling softbox
    panel(1.6, 16, [11, 2, 7], [1, 1, 1], 3.2)          // tall key strip, front right
    panel(1.2, 16, [-12, 2, 5], [0.85, 0.88, 1], 3.0)   // tall cool strip, front left
    panel(6, 10, [-4, 1, -14], [1, 1, 1], 1.2)          // dim back fill
    panel(1.4, 14, [14, 2, -4], [0.55, 0.49, 0.96], 4.5) // accent strip, right-back (tinted reflections)
    return s
  }

  // ── materials (built per engine instance so accent tint/env can vary) ──────────────────────────────────────────────────────
  function materials(accentColor) {
    const alu = brushedAluminium(), mesh = meshAlpha(), pcb = pcbTexture(), braid = braidTex()
    return {
      frame: new T.MeshStandardMaterial({ color: 0x2c2c34, roughness: 0.38, metalness: 0.65 }),
      anodised: new T.MeshStandardMaterial({ color: 0x585863, roughness: 0.38, metalness: 0.6, map: alu }),
      gunmetal: new T.MeshStandardMaterial({ color: 0x70707c, roughness: 0.38, metalness: 0.6, map: alu }),
      satin: new T.MeshStandardMaterial({ color: 0x34343e, roughness: 0.5, metalness: 0.3 }),
      plastic: new T.MeshStandardMaterial({ color: 0x23232a, roughness: 0.42, metalness: 0.08 }),
      rubber: new T.MeshStandardMaterial({ color: 0x121217, roughness: 0.92, metalness: 0 }),
      blade: new T.MeshStandardMaterial({ color: 0x5a5a68, roughness: 0.5, metalness: 0.15, side: T.DoubleSide }),
      pcb: new T.MeshStandardMaterial({ color: 0xffffff, map: pcb, roughness: 0.78, metalness: 0.25 }),
      // additive "glass": black base, so it only ever ADDS reflections (never washes the interior out or draws white edges)
      glass: new T.MeshStandardMaterial({ color: 0x000000, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.4, blending: T.AdditiveBlending, depthWrite: false, envMapIntensity: 1.0, side: T.FrontSide }),
      chrome: new T.MeshStandardMaterial({ color: 0xdadde2, roughness: 0.14, metalness: 1 }),
      nickel: new T.MeshStandardMaterial({ color: 0xc4c7ce, roughness: 0.3, metalness: 1 }),
      mirror: new T.MeshStandardMaterial({ color: 0x70758a, roughness: 0.14, metalness: 1 }),
      meshPanel: new T.MeshStandardMaterial({ color: 0x1c1c24, roughness: 0.45, metalness: 0.65, alphaMap: mesh, transparent: true, side: T.DoubleSide }),
      sleeve: new T.MeshStandardMaterial({ color: 0x0f0f13, roughness: 0.82, metalness: 0, bumpMap: braid, bumpScale: 1.6 }),
      floor: new T.MeshStandardMaterial({ color: 0x0b0b0e, roughness: 0.35, metalness: 0.3 }),
      accentPlastic: new T.MeshStandardMaterial({ color: 0x101014, roughness: 0.4, metalness: 0.1, emissive: accentColor.clone(), emissiveIntensity: 0.25 }),
      // x-ray body for parts that were not detected: faint frosted volume with a bright fresnel rim (no dashed lines)
      ghost: new T.ShaderMaterial({
        uniforms: { uColor: { value: new T.Color(0.74, 0.76, 0.84) } }, transparent: true, depthWrite: false, side: T.DoubleSide,
        vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform vec3 uColor; varying vec3 vN; varying vec3 vV; void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); gl_FragColor = vec4(uColor * (0.45 + f * 0.9), 0.05 + pow(f, 2.3) * 0.5); }',
      }),
    }
  }

  // ── geometry helpers ────────────────────────────────────────────────────────────────────────────────────────────────────
  function rbox(w, h, d, r = 0.06, segs = 3) { return new T.Addons.RoundedBoxGeometry(w, h, d, segs, Math.max(0.001, Math.min(r, w / 2.1, h / 2.1, d / 2.1))) }
  function merge(entries) {
    // entries: [{ geo, mat }] grouped by material identity -> one Mesh per material (keeps draw calls low)
    const byMat = new Map()
    for (const e of entries) { if (!byMat.has(e.mat)) byMat.set(e.mat, []); byMat.get(e.mat).push(e.geo) }
    const meshes = []
    for (const [mat, geos] of byMat) {
      const mixed = geos.some(g => !g.index) && geos.some(g => g.index)
      const list = mixed ? geos.map(g => (g.index ? g.toNonIndexed() : g)) : geos
      const g = list.length === 1 ? list[0] : T.Addons.mergeGeometries(list, false)
      if (g) meshes.push(new T.Mesh(g, mat))
    }
    return meshes
  }
  function at(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    const m = new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new T.Vector3(sx, sy, sz))
    geo.applyMatrix4(m); return geo
  }
  /** Shadow flags for every mesh below `o`. Glass and light cards pass cast=false. */
  function shade(o, cast = true, receive = true) { o.traverse(m => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = receive } }); return o }
  function addAll(g, entries) { merge(entries).forEach(m => g.add(m)); return g }
  function roundedRectShape(w, h, c) {
    const s = new T.Shape(), x = w / 2, y = h / 2
    c = Math.min(c, x, y)
    s.moveTo(-x + c, -y); s.lineTo(x - c, -y); s.absarc(x - c, -y + c, c, -Math.PI / 2, 0, false)
    s.lineTo(x, y - c); s.absarc(x - c, y - c, c, 0, Math.PI / 2, false)
    s.lineTo(-x + c, y); s.absarc(-x + c, y - c, c, Math.PI / 2, Math.PI, false)
    s.lineTo(-x, -y + c); s.absarc(-x + c, -y + c, c, Math.PI, Math.PI * 1.5, false)
    return s
  }
  function hole(s, x, y, r) { const p = new T.Path(); p.absarc(x, y, r, 0, Math.PI * 2, true); s.holes.push(p); return s }
  function extrude(shape, depth, bevel = 0.02) {
    const g = new T.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 32 })
    g.translate(0, 0, -depth / 2); return g
  }

  // ── fan: square frame with a round aperture, 9 swept blades, hub, two LED rings (outer + hub). `ringMat` is supplied by the caller
  // (engine.glowMat) so the state logic that drives emissive level stays in one place; pass null for a fan with no ring. ─────
  function bladeGeo(r, n = 9) {
    const parts = [], nu = 6, nv = 4
    for (let k = 0; k < n; k++) {
      const pos = [], uv = [], idx = []
      for (let iu = 0; iu <= nu; iu++) {
        const u = iu / nu
        for (let iv = 0; iv <= nv; iv++) {
          const v = (iv / nv) * 2 - 1
          const rad = r * (0.2 + 0.77 * u)
          const hw = 0.36 * (0.5 + 0.5 * Math.sin(Math.PI * (0.12 + 0.8 * u)))
          const a = (k / n) * Math.PI * 2 + 0.75 * u * u + v * hw
          pos.push(Math.cos(a) * rad, Math.sin(a) * rad, v * 0.055 * (0.4 + u))
          uv.push(u, (v + 1) / 2)
        }
      }
      for (let iu = 0; iu < nu; iu++) for (let iv = 0; iv < nv; iv++) {
        const a = iu * (nv + 1) + iv, b = a + 1, c = a + nv + 1, d = c + 1
        idx.push(a, c, b, b, c, d)
      }
      const g = new T.BufferGeometry()
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2))
      g.setIndex(idx); g.computeVertexNormals(); parts.push(g)
    }
    return T.Addons.mergeGeometries(parts, false)
  }
  function fan(mats, r, { frame = true, ringMat = null } = {}) {
    const g = new T.Group(), spin = new T.Group(); g.add(spin)
    if (frame) {
      const half = r * 1.17, depth = 0.12
      const shape = roundedRectShape(half * 2, half * 2, half * 0.2); hole(shape, 0, 0, r * 1.02)
      const entries = [{ geo: extrude(shape, depth, 0.02), mat: mats.plastic }]
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) entries.push({ geo: at(new T.CylinderGeometry(half * 0.09, half * 0.09, depth + 0.03, 10).rotateX(Math.PI / 2), sx * half * 0.84, sy * half * 0.84, 0), mat: mats.plastic })
      addAll(g, entries)
    }
    const hubEntries = [
      { geo: bladeGeo(r), mat: mats.blade },
      { geo: new T.CylinderGeometry(r * 0.2, r * 0.22, 0.1, 24).rotateX(Math.PI / 2), mat: mats.blade },
      { geo: at(new T.CylinderGeometry(r * 0.15, r * 0.15, 0.02, 24).rotateX(Math.PI / 2), 0, 0, 0.055), mat: mats.blade },
    ]
    addAll(spin, hubEntries)
    if (ringMat) {
      addAll(g, [{ geo: new T.TorusGeometry(r * 0.985, 0.04, 8, 64), mat: ringMat }, { geo: at(new T.TorusGeometry(r * 0.3, 0.028, 8, 40), 0, 0, 0.03), mat: ringMat }])
    }
    g.userData.spin = spin
    shade(g, false, true)   // fans are small and busy: they receive shadow but never cast it (halves their draw calls)
    return { group: g, spin }
  }

  // ── case tower: slim black frame, panoramic glass on the viewer side and the front, solid back/rear/top, feet ──────────────
  // `rearFan` = { y, z, r } cuts the exhaust-fan opening into the rear (-x) wall.
  function caseTower(mats, size, { accentMat = null, rearFan = null } = {}) {
    const [w, h, d] = size, g = new T.Group()
    const t = Math.min(0.16, w * 0.04), wall = 0.08
    const E = []
    // twelve frame edges
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) E.push({ geo: at(rbox(t, h, t, 0.04), sx * (w / 2 - t / 2), 0, sz * (d / 2 - t / 2)), mat: mats.frame })
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) E.push({ geo: at(rbox(w, t, t, 0.04), 0, sy * (h / 2 - t / 2), sz * (d / 2 - t / 2)), mat: mats.frame })
      for (const sx of [-1, 1]) E.push({ geo: at(rbox(t, t, d, 0.04), sx * (w / 2 - t / 2), sy * (h / 2 - t / 2), 0), mat: mats.frame })
    }
    // solid panels: back, top, bottom
    E.push({ geo: at(rbox(w - t, h - t, wall, 0.02, 1), 0, 0, -d / 2 + wall / 2 + 0.01), mat: mats.rubber })
    E.push({ geo: at(rbox(w - t, wall, d - t, 0.02, 1), 0, h / 2 - wall / 2, 0), mat: mats.satin })
    E.push({ geo: at(rbox(w - t, wall, d - t, 0.02, 1), 0, -h / 2 + wall / 2, 0), mat: mats.satin })
    // rear (-x) wall with the exhaust fan opening
    const rs = roundedRectShape(d - t, h - t, 0.05)
    if (rearFan) hole(rs, -rearFan.z, rearFan.y, rearFan.r * 1.05)
    E.push({ geo: at(extrude(rs, wall, 0).rotateY(Math.PI / 2), -w / 2 + wall / 2 + 0.01, 0, 0), mat: mats.rubber })
    addAll(g, E)
    // feet
    const F = []
    for (const fx of [-w / 2 + 0.5, w / 2 - 0.5]) for (const fz of [-d / 2 + 0.4, d / 2 - 0.4]) {
      F.push({ geo: at(new T.CylinderGeometry(0.16, 0.2, 0.22, 12), fx, -h / 2 - 0.1, fz), mat: mats.gunmetal })
      F.push({ geo: at(new T.TorusGeometry(0.19, 0.025, 8, 20), fx, -h / 2 - 0.2, fz, Math.PI / 2), mat: mats.chrome })
    }
    addAll(g, F)
    shade(g, false, true)   // the shell never casts: it would put the whole interior in shadow
    // glass: viewer side (+z) and front (+x), full panoramic; additive, so it never casts or receives shadow
    const front = new T.Mesh(new T.PlaneGeometry(w - t, h - t), mats.glass); front.position.z = d / 2 - 0.01; g.add(front)
    const side = new T.Mesh(new T.PlaneGeometry(d - t, h - t), mats.glass); side.rotation.y = Math.PI / 2; side.position.x = w / 2 - 0.01; g.add(side)
    shade(front, false, false); shade(side, false, false)
    front.renderOrder = side.renderOrder = 5
    // slim accent light strips along the front-corner edges of the top and bottom rails (only when the caller supplies a glow material)
    if (accentMat) {
      const A = []
      for (const sy of [h / 2 - t - 0.03, -h / 2 + t + 0.03]) A.push({ geo: at(new T.BoxGeometry(w - 2 * t, 0.035, 0.035), 0, sy, d / 2 - t - 0.02), mat: accentMat })
      addAll(g, A)
    }
    return g
  }

  function psuShroud(mats, size) {
    const [w, h, d] = size, g = new T.Group()
    g.add(new T.Mesh(rbox(w, h, d, 0.14), mats.frame))
    const E = []
    E.push({ geo: at(rbox(w * 0.92, h * 0.62, 0.03, 0.02), 0, 0, d / 2 + 0.004), mat: mats.plastic })
    for (let i = 0; i < 22; i++) E.push({ geo: at(new T.BoxGeometry(0.035, h * 0.38, 0.02), -w * 0.4 + i * (w * 0.8 / 21), 0, d / 2 + 0.02), mat: mats.frame })
    E.push({ geo: at(new T.BoxGeometry(w * 0.9, 0.025, 0.03), 0, h / 2 - 0.05, d / 2 + 0.01), mat: mats.gunmetal })
    addAll(g, E)
    return shade(g)
  }

  // ── motherboard: matte PCB + rear I/O shroud + VRM heatsink bar + chipset heatsink + headers. The DIMM slots belong to the RAM
  // parts (dimmSlot/ramStick) and the M.2 plates to nvmeStick, so empty and filled slots are drawn the same way. ─────────────
  function board(mats, size) {
    const [w, h, d = 0.16] = size, g = new T.Group(), z = d / 2, top = h / 2
    g.add(new T.Mesh(new T.BoxGeometry(w, h, d), mats.pcb))
    const E = []
    // rear I/O shroud (top-left) with a thin accent line down its edge
    const sw = 0.95, sh = 3.3
    E.push({ geo: at(rbox(sw, sh, 0.55, 0.07), -w / 2 + sw / 2 + 0.03, top - sh / 2 - 0.06, z + 0.27), mat: mats.frame })
    E.push({ geo: at(new T.BoxGeometry(0.05, sh * 0.78, 0.03), -w / 2 + sw - 0.12, top - sh / 2 - 0.06, z + 0.55), mat: mats.accentPlastic })
    // VRM heatsink bar along the top, with fin grooves
    const bw = w * 0.55, bx = -w / 2 + sw + 0.1 + bw / 2
    E.push({ geo: at(rbox(bw, 0.62, 0.36, 0.05), bx, top - 0.4, z + 0.18), mat: mats.gunmetal })
    for (let i = 0; i < 18; i++) E.push({ geo: at(new T.BoxGeometry(0.035, 0.5, 0.03), bx - bw * 0.46 + i * (bw * 0.92 / 17), top - 0.4, z + 0.37), mat: mats.frame })
    // chipset heatsink (below the GPU)
    E.push({ geo: at(rbox(2.0, 0.7, 0.16, 0.04), 0.7, -h / 2 + 0.7, z + 0.08), mat: mats.anodised })
    for (let i = 0; i < 6; i++) E.push({ geo: at(new T.BoxGeometry(1.8, 0.025, 0.03), 0.7, -h / 2 + 0.5 + i * 0.075, z + 0.165), mat: mats.frame })
    // 24-pin (right edge) and 8-pin CPU power (top-left) headers
    E.push({ geo: at(rbox(0.28, 1.6, 0.3, 0.03), w / 2 - 0.22, top - 1.8, z + 0.15), mat: mats.plastic })
    E.push({ geo: at(rbox(0.9, 0.22, 0.28, 0.03), -w * 0.1, top - 0.1, z + 0.14), mat: mats.plastic })
    // a few capacitors beside the socket
    for (let i = 0; i < 6; i++) E.push({ geo: at(new T.CylinderGeometry(0.07, 0.07, 0.2, 10).rotateX(Math.PI / 2), -w * 0.05 + (i % 3) * 0.2, top - 1.4 - Math.floor(i / 3) * 0.2, z + 0.1), mat: mats.chrome })
    addAll(g, E)
    return shade(g)
  }

  function dimmSlot(mats, w, h) {
    const g = new T.Group()
    const E = [
      { geo: rbox(w, h, 0.24, 0.03), mat: mats.frame },
      { geo: at(new T.BoxGeometry(w * 0.4, h * 0.95, 0.02), 0, 0, 0.12), mat: mats.rubber },
      { geo: at(rbox(w * 0.9, 0.14, 0.3, 0.03), 0, h / 2 + 0.02, 0.03), mat: mats.satin },
      { geo: at(rbox(w * 0.9, 0.14, 0.3, 0.03), 0, -h / 2 - 0.02, 0.03), mat: mats.satin },
    ]
    return shade(addAll(g, E))
  }

  function cpuSocket(mats, size) {
    const [w, h] = size, g = new T.Group()
    const E = [
      { geo: at(rbox(w * 1.5, h * 1.5, 0.08, 0.05), 0, 0, -0.04), mat: mats.frame },
      { geo: at(rbox(w * 1.1, h * 1.1, 0.06, 0.03), 0, 0, 0.01), mat: mats.satin },
      { geo: rbox(w, h, 0.1, 0.04), mat: mats.nickel },
      { geo: at(rbox(w * 0.72, h * 0.72, 0.02, 0.02), 0, 0, 0.06), mat: mats.chrome },
    ]
    return shade(addAll(g, E))
  }

  // ── cooler: AIO pump + sleeved tubes + radiator, and the air tower ──────────────────────────────────────────────────────
  function aioPump(mats, size) {
    const g = new T.Group(), R = size[0] / 2
    const E = [
      { geo: new T.CylinderGeometry(R, R * 1.02, 0.62, 56).rotateX(Math.PI / 2), mat: mats.frame },
      { geo: at(new T.CylinderGeometry(R * 0.94, R * 0.94, 0.05, 56).rotateX(Math.PI / 2), 0, 0, 0.32), mat: mats.plastic },
      { geo: at(new T.CylinderGeometry(R * 0.76, R * 0.76, 0.03, 56).rotateX(Math.PI / 2), 0, 0, 0.34), mat: mats.mirror },
      { geo: at(new T.CylinderGeometry(R * 0.5, R * 0.5, 0.02, 40).rotateX(Math.PI / 2), 0, 0, 0.355), mat: mats.plastic },
      { geo: at(new T.TorusGeometry(R * 0.5, 0.015, 6, 48), 0, 0, 0.365), mat: mats.chrome },
    ]
    // fittings on the upper side where the hoses leave
    for (const dx of [-0.38, 0.38]) E.push({ geo: at(new T.CylinderGeometry(0.11, 0.11, 0.36, 12), dx, R * 0.92, -0.04), mat: mats.chrome })
    addAll(g, E)
    g.userData.topZ = 0.37
    return shade(g)
  }
  /** Sleeved hoses from the pump to the radiator, in the caller's (world) coordinates. */
  function aioTubes(mats, from, to) {
    const g = new T.Group()
    for (const [i, dx] of [-0.38, 0.38].entries()) {
      const p = [
        new T.Vector3(from[0] + dx, from[1] + 0.9, from[2] - 0.04),
        new T.Vector3(from[0] + dx * 1.5, from[1] + 1.6, from[2] + 0.15 + i * 0.1),
        new T.Vector3((from[0] + to[0]) / 2, Math.max(from[1], to[1]) + 0.5, from[2] + 0.35 + i * 0.12),
        new T.Vector3(to[0] - 0.9, to[1] + 0.25 - i * 0.18, to[2] + 0.1 + i * 0.22),
        new T.Vector3(to[0], to[1] - i * 0.2, to[2] + 0.1 + i * 0.22),
      ]
      g.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(p, false, 'catmullrom', 0.5), 48, 0.1, 10), mats.sleeve))
    }
    return shade(g)
  }
  /** Radiator slab: size = [thickness (x), height (y), depth (z)]. Mounted behind the front fans; the fans themselves are decor. */
  function radiatorFins(mats, size) {
    const [tx, ty, tz] = size, g = new T.Group()
    const E = [{ geo: rbox(tx, ty, tz, 0.05), mat: mats.frame }]
    const n = Math.floor(ty / 0.17)
    for (let i = 0; i < n; i++) E.push({ geo: at(new T.BoxGeometry(tx * 1.02, 0.045, tz * 0.94), 0, -ty / 2 + 0.3 + i * ((ty - 0.6) / (n - 1)), 0), mat: mats.satin })
    E.push({ geo: at(rbox(tx * 1.1, 0.4, tz, 0.05), 0, ty / 2 - 0.1, 0), mat: mats.gunmetal })
    E.push({ geo: at(rbox(tx * 1.1, 0.4, tz, 0.05), 0, -ty / 2 + 0.1, 0), mat: mats.gunmetal })
    for (const dz of [-0.5, 0.5]) E.push({ geo: at(new T.CylinderGeometry(0.11, 0.11, 0.3, 12), -tx * 0.3, ty / 2 + 0.12, dz), mat: mats.chrome })
    return shade(addAll(g, E))
  }
  function airCoolerStack(mats, size) {
    const [w, h, d] = size, g = new T.Group()
    const E = [], n = 22
    for (let i = 0; i < n; i++) E.push({ geo: at(new T.BoxGeometry(w * 0.96, h * 0.92, 0.025), 0, 0, -d / 2 + (d / (n - 1)) * i), mat: mats.gunmetal })
    for (const dx of [-w * 0.3, -w * 0.1, w * 0.1, w * 0.3]) E.push({ geo: at(new T.CylinderGeometry(0.06, 0.06, d, 10).rotateX(Math.PI / 2), dx, h * 0.3, 0), mat: mats.chrome })
    E.push({ geo: at(rbox(w * 1.0, 0.1, d * 1.02, 0.04), 0, h / 2 - 0.02, 0), mat: mats.nickel })
    E.push({ geo: at(rbox(w * 1.0, 0.1, d * 1.02, 0.04), 0, -h / 2 + 0.04, 0), mat: mats.nickel })
    return shade(addAll(g, E))
  }

  // ── RAM: seated in its DIMM slot, tall heatspreader with a chamfered look and an optional light bar on the viewer-facing edge.
  // size = [thickness (x), length (y), height above the board (z)]. `ledMat` comes from the caller (engine.glowMat). ─────────
  function ramStick(mats, size, rgbTint, { ledMat = null } = {}) {
    const [w, h, d] = size, g = new T.Group()
    const hs = new T.MeshStandardMaterial({ color: 0x2c2c34, roughness: 0.3, metalness: 0.7, map: heatspreaderTex(rgbTint || [0.3, 0.3, 0.34]) })
    const slot = dimmSlot(mats, w, h - 0.2); slot.position.z = -d / 2 + 0.12; g.add(slot)
    const body = new T.Mesh(rbox(w * 0.9, h - 0.2, d - 0.22, 0.04), hs); body.position.z = 0.11; g.add(body)
    const cap = new T.Mesh(rbox(w * 0.96, h - 0.1, 0.09, 0.03), mats.frame); cap.position.z = d / 2 - 0.05; g.add(cap)
    if (ledMat) { const bar = new T.Mesh(rbox(w * 0.62, h - 0.7, 0.05, 0.02), ledMat); bar.position.z = d / 2 + 0.005; g.add(bar) }
    return shade(g)
  }

  // ── GPU: shroud plate with three round fan openings (the fans are built by the caller), fin stack, backplate, bracket, 12V connector
  /** Where the three fans sit relative to the card centre: shared with the engine so the fans always land in their openings. */
  function gpuFanLayout(size) {
    const [w, h, d] = size, r = h * 0.4, xs = []
    for (let i = 0; i < 3; i++) xs.push(-w / 2 + (w / 3) * (i + 0.5))
    return { r, xs, z: d / 2 - 0.07 }
  }
  function gpuShroud(mats, size) {
    const [w, h, d] = size, g = new T.Group(), L = gpuFanLayout(size), pd = 0.14
    const plate = roundedRectShape(w, h, 0.16)
    for (const x of L.xs) hole(plate, x, 0, L.r * 1.02)
    const E = [
      { geo: at(extrude(plate, pd, 0.02), 0, 0, d / 2 - pd / 2), mat: mats.gunmetal },
      { geo: at(rbox(w * 0.99, h * 0.95, d - pd, 0.08), 0, 0, -pd / 2), mat: mats.frame },
      { geo: at(rbox(w * 0.98, h * 0.94, 0.05, 0.03), 0, 0, -d / 2 - 0.03), mat: mats.gunmetal },
      { geo: at(rbox(0.1, h * 0.82, d * 0.9, 0.02), -w / 2 - 0.06, 0, -0.05), mat: mats.satin },
      { geo: at(rbox(0.6, 0.22, 0.42, 0.03), w / 2 - 0.8, h / 2 + 0.08, -d * 0.1), mat: mats.plastic },
    ]
    for (const dy of [h / 2 - 0.05, -h / 2 + 0.05]) E.push({ geo: at(new T.BoxGeometry(w * 0.9, 0.022, 0.03), 0, dy, d / 2 + 0.02), mat: mats.chrome })
    for (const x of L.xs) E.push({ geo: at(new T.TorusGeometry(L.r * 1.03, 0.03, 8, 56), x, 0, d / 2 + 0.01), mat: mats.gunmetal })
    for (let i = 0; i < 7; i++) E.push({ geo: at(new T.BoxGeometry(0.02, h * 0.55, 0.3), -w / 2 - 0.06, 0, -0.05 - 0.15 + i * 0.05), mat: mats.frame })
    // fin stack, seen through the openings
    const n = Math.floor((w - 0.5) / 0.1)
    for (let i = 0; i < n; i++) E.push({ geo: at(new T.BoxGeometry(0.03, h * 0.82, 0.36), -w / 2 + 0.25 + i * 0.1, 0, d / 2 - pd - 0.2), mat: mats.gunmetal })
    addAll(g, E)
    return shade(g)
  }

  // ── storage ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
  function nvmeStick(mats, size) {
    const [w, h, d] = size, g = new T.Group()
    const E = [{ geo: rbox(w, h, d, 0.03), mat: mats.gunmetal }, { geo: at(rbox(w * 0.14, h, d * 1.1, 0.02), w / 2 - w * 0.07, 0, 0), mat: mats.nickel }]
    for (let i = 0; i < 4; i++) E.push({ geo: at(new T.BoxGeometry(w * 0.7, 0.022, 0.03), -w * 0.08, -h * 0.3 + i * h * 0.2, d / 2 + 0.01), mat: mats.frame })
    return shade(addAll(g, E))
  }
  function sataDrive(mats, size) {
    const g = new T.Group()
    g.add(new T.Mesh(rbox(...size, 0.03), mats.satin))
    const label = new T.Mesh(new T.PlaneGeometry(size[0] * 0.01, size[1] * 0.6), mats.gunmetal); g.add(label)
    return shade(g)
  }

  // ── laptop ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
  function laptopBody(mats, size) {
    const g = new T.Group()
    g.add(new T.Mesh(rbox(...size, 0.1), mats.anodised))
    return shade(g)
  }

  // ── sleeved cables: a tube through the given world-space points ─────────────────────────────────────────────────────────
  function sleeve(mats, points, radius = 0.12) {
    const curve = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)), false, 'catmullrom', 0.4)
    return shade(new T.Mesh(new T.TubeGeometry(curve, 64, radius, 10), mats.sleeve))
  }

  // ── network scene props: mini tower, router, server rack. `ledMat` is supplied by the caller (engine.glowMat). ──────────────
  function miniTower(mats, ledMat) {
    const g = new T.Group()
    g.add(new T.Mesh(rbox(1.6, 2.4, 1.1, 0.09), mats.frame))
    const front = new T.Mesh(new T.PlaneGeometry(1.4, 2.2), mats.satin); front.position.z = 0.555; g.add(front)
    // two intake fans behind a perforated front, lit by the node's LED material
    for (const y of [-0.58, 0.58]) { const f = fan(mats, 0.5, { frame: false, ringMat: ledMat }); f.group.position.set(0, y, 0.57); g.add(f.group) }
    const mesh = new T.Mesh(new T.PlaneGeometry(1.4, 2.2), mats.meshPanel); mesh.position.z = 0.6; g.add(mesh)
    const led = new T.Mesh(new T.BoxGeometry(0.06, 1.8, 0.03), ledMat); led.position.set(-0.78, 0, 0.3); g.add(led)
    return shade(g)
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

  // ── ground: no visible floor, only a soft contact shadow and a faint pool of accent light underneath ────────────────────
  function groundPlane(mats, w, d, accent = null) {
    const g = new T.Group()
    const sh = new T.Mesh(new T.PlaneGeometry(w * 0.85, d * 0.85), new T.MeshBasicMaterial({ map: shadowTex(), transparent: true, opacity: 0.8, depthWrite: false }))
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.01; g.add(sh)
    const pool = new T.Mesh(new T.PlaneGeometry(w * 1.1, d * 1.1), new T.MeshBasicMaterial({ map: poolTex(), color: accent || new T.Color(0.55, 0.49, 0.96), transparent: true, opacity: 0.07, blending: T.AdditiveBlending, depthWrite: false }))
    pool.rotation.x = -Math.PI / 2; pool.position.y = 0.02; g.add(pool)
    return g
  }

  const api = {
    init, materials, studioScene, groundPlane,
    fan, caseTower, psuShroud, board, dimmSlot, cpuSocket, aioPump, aioTubes, radiatorFins, airCoolerStack, ramStick, gpuShroud, gpuFanLayout, nvmeStick, sataDrive, laptopBody, sleeve,
    miniTower, router, serverRack,
    rbox, merge, at, shade,
  }
  root.JylliTwinKit = api
})(typeof window !== 'undefined' ? window : globalThis)
