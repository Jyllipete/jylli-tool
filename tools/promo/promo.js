// Jylli Tool 1.6.0 release video stage. Everything on screen is a pure function of t (see timeline.js), so the live player and the
// frame-by-frame renderer (render.js -> window.__seek) draw identical pictures.
//   promo.html            player (hover for controls; space = play/pause, arrows = +-1 bar)
//   ?debug=1              bar.beat / scene overlay          ?motion=reduce  no camera, parallax, flash or count-up
//   ?t=12.5               start paused at 12.5 s            ?render=1       no controls, used by render.js
;(() => {
  const q = new URLSearchParams(location.search)
  const RENDER = q.has('render'), DEBUG = q.has('debug')
  const REDUCE = q.get('motion') === 'reduce' || (!RENDER && q.get('motion') !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  const $ = id => document.getElementById(id)
  const { ease, clamp, lerp } = PromoTimeline
  const C = PromoCopy
  const W = 1280, H = 750
  if (RENDER) document.body.classList.add('render')

  const state = { tl: null, beats: null, shots: {}, facts: {}, nodes: new Map(), imgs: new Map(), t: 0 }
  const j = u => fetch(u).then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json() })
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
  const rich = s => String(s).replace(/[&<]/g, c => ({ '&': '&amp;', '<': '&lt;' }[c])).replace(/\*(.+?)\*/g, '<em>$1</em>')
  const copy = k => C.t[k] || { h: k }
  const shotUrl = id => state.shots[id] || ''

  function fit() {
    const s = RENDER ? 1 : Math.min(innerWidth / 1920, innerHeight / 1080)   // the renderer draws the stage 1:1 whatever the window chrome is
    const st = $('stage')
    st.style.transform = `translate(${(RENDER ? 0 : (innerWidth - 1920 * s) / 2)}px, ${(RENDER ? 0 : (innerHeight - 1080 * s) / 2)}px) scale(${s})`
  }

  // ---- node builders (one DOM subtree per scene, created lazily, reused) ----
  function windowEl(shotId, cls) {
    const w = el('div', 'win' + (cls ? ' ' + cls : ''))
    w.append(el('div', 'glow'))
    const inn = el('div', 'in'); const img = el('img'); img.src = shotUrl(shotId); img.alt = ''; img.decoding = 'async'; img.draggable = false
    inn.append(img, el('div', 'gloss')); w.append(inn)
    return { w, img }
  }
  function build(s) {
    const root = el('div', 'scene'); if (s.compact) root.classList.add('compact')
    const n = { root, s }
    if (s.kind === 'shot') {
      n.sides = (s.side || []).map(d => { const x = windowEl(d.shot, 'side'); root.append(x.w); return Object.assign({ d }, x) })
      const m = windowEl(s.shot); n.win = m.w; n.img = m.img; root.append(m.w)
    } else if (s.kind === 'proof') {
      n.row = el('div', 'proof'); n.stats = (s.counters || []).map(c => { const b = el('b', null, '0'), l = el('span', null, c.label || (C.proof[c.fact] || {}).label || ''); const d = el('div', 'stat'); d.append(b, l); n.row.append(d); return { c, d, b } }); root.append(n.row)
    } else if (s.kind === 'wall') {
      n.wall = el('div', 'wall'); const ids = s.wall || []; const cols = s.cols || 5
      n.cells = ids.map((id, i) => { const x = windowEl(id); const cx = (i % cols - (cols - 1) / 2) * 640, cy = (Math.floor(i / cols) - 1) * 420; x.w.style.transform = `translate3d(${cx - 280}px, ${cy - 175}px, 0)`; x.pos = [cx - 280, cy - 175]; n.wall.append(x.w); return x })
      root.append(n.wall)
    } else if (s.kind === 'logo') {
      n.logo = el('div', 'logo'); const im = el('img'); im.src = '../../assets/icon.png'; im.alt = 'Jylli Tool'; n.logo.append(im)
      n.word = el('div', 'word', C.brand); n.ver = el('div', 'ver', C.version); n.kick = el('div', 'kicker', s.kicker || C.kicker)
      root.append(n.logo, n.word, n.ver, n.kick)
    }
    if (s.head) { n.head = el('div', 'head', rich(copy(s.head).h)); root.append(n.head) }
    if (s.sub !== false && s.head && copy(s.head).s) { n.sub = el('div', 'sub', rich(copy(s.head).s)); root.append(n.sub) }
    $('scenes').append(root)
    return n
  }
  const node = s => { let n = state.nodes.get(s.i); if (!n) { n = build(state.tl.scenes[s.i]); state.nodes.set(s.i, n) } return n }

  // ---- per-frame update ----
  function update(n, ss, st) {
    const s = n.s, bt = ss.bt, red = REDUCE
    n.root.style.opacity = ss.alpha.toFixed(4)
    n.root.style.display = 'block'
    const enterK = s.hit ? 0.5 : 1
    if (n.head) { const p = red ? 1 : ease.expo(clamp(bt / enterK)); n.head.style.opacity = p; n.head.style.transform = red ? '' : `translate3d(0,${((1 - p) * 30).toFixed(2)}px,0)` }
    if (n.sub) { const p = red ? 1 : ease.out(clamp((bt - (s.subAt != null ? s.subAt : 2)) / 1)); n.sub.style.opacity = p; n.sub.style.transform = red ? '' : `translate3d(0,${((1 - p) * 16).toFixed(2)}px,0)` }
    const c = ss.cam
    if (n.win) {
      const sc = c.scale * (1 + st.pulse)
      n.win.style.transform = `translate3d(${c.dx.toFixed(2)}px,${c.dy.toFixed(2)}px,0) rotateY(${c.tiltY.toFixed(3)}deg) rotateX(${c.tiltX.toFixed(3)}deg) scale(${sc.toFixed(4)})`
      const z = c.z, tx = W / 2 - z * c.x * W, ty = H / 2 - z * c.y * H
      n.img.style.transform = `translate(${tx.toFixed(2)}px,${ty.toFixed(2)}px) scale(${z.toFixed(4)})`
      n.win.firstChild.style.opacity = (0.42 + 0.3 * st.mood + st.pulse * 3).toFixed(3)
      for (const sd of n.sides || []) {
        const p = red ? 1 : ease.out(clamp((bt - (sd.d.at || 1)) / 1.5)), d = sd.d
        const px = (c.x - 0.5) * -90 * (d.depth || 1), py = (c.y - 0.5) * -50 * (d.depth || 1)
        sd.w.style.opacity = (0.55 * p).toFixed(3)
        sd.w.style.transform = `translate3d(${(d.x + px + (1 - p) * (d.x < 0 ? -80 : 80)).toFixed(1)}px,${(d.y + py).toFixed(1)}px,${d.z || -240}px) rotateY(${d.ry || (d.x < 0 ? 16 : -16)}deg) scale(${d.sc || 0.62})`
      }
    }
    if (n.stats) {
      n.stats.forEach((x, i) => {
        const p = red ? 1 : ease.expo(clamp((bt - i * 0.5) / 1.2))
        const f = x.c.fact ? (state.facts[x.c.fact] || {}).value : x.c.value
        const k = red ? 1 : ease.out(clamp((bt - (x.c.from != null ? x.c.from : 1)) / ((x.c.to != null ? x.c.to : 3.5) - (x.c.from != null ? x.c.from : 1))))
        x.b.textContent = Math.round(lerp(0, +f || 0, k)).toLocaleString('fi-FI') + (x.c.suffix || '')
        const land = red ? 0 : (bt - (x.c.to != null ? x.c.to : 3.5))
        const pop = land > 0 ? 1 + 0.05 * Math.exp(-land * 6) : 1
        x.d.style.opacity = p; x.d.style.transform = `translate3d(0,${((1 - p) * 40).toFixed(1)}px,0) scale(${pop.toFixed(4)})`
      })
    }
    if (n.wall) {
      const life = red ? 0.5 : ss.life, ex = lerp(220, -220, ease.soft(life)), ey = lerp(40, -30, life)
      n.wall.style.transform = `translate3d(${ex.toFixed(1)}px,${ey.toFixed(1)}px,-120px) rotateX(${red ? 0 : 20}deg) rotateZ(${red ? 0 : -7}deg) rotateY(${red ? 0 : 6}deg)`
      n.cells.forEach((x, i) => { const p = red ? 1 : ease.out(clamp((bt - i * 0.18) / 1.2)); x.w.style.opacity = p.toFixed(3); x.img.style.transform = '' })
    }
    if (n.logo) {
      const p = ease.out(clamp(bt / (s.enter || 2))), pop = (at, dur) => ease.expo(clamp((bt - at) / dur))
      n.logo.style.opacity = p; n.logo.style.transform = red ? '' : `scale(${(0.92 + 0.08 * p + st.pulse * 2).toFixed(4)})`
      const wa = s.wordAt != null ? s.wordAt : 4, va = s.verAt != null ? s.verAt : 8, ka = s.kickAt != null ? s.kickAt : 10
      const pw = pop(wa, 1), pv = pop(va, 0.75), pk = ease.out(clamp((bt - ka) / 1.5))
      n.word.style.opacity = pw; n.word.style.transform = red ? '' : `translate3d(0,${((1 - pw) * 26).toFixed(1)}px,0)`
      n.ver.style.opacity = pv; n.ver.style.transform = red ? '' : `scale(${(1 + (1 - pv) * 0.25).toFixed(3)})`
      n.kick.style.opacity = pk
    }
  }

  function render(t) {
    state.t = t
    const st = state.tl.sample(t, { reduce: REDUCE })
    // background mood: slow drift, brighter on loud bars; the pulse breathes on the beat
    const m = st.mood, P = 1 + st.pulse * 3
    const B = document.querySelectorAll('.blob')
    const pos = [[-260 + 240 * Math.sin(t * 0.07), -520 + 140 * Math.cos(t * 0.05), 0.25 + 0.5 * m], [900 + 200 * Math.cos(t * 0.06), 380 + 120 * Math.sin(t * 0.08), 0.18 + 0.4 * m], [380 + 260 * Math.sin(t * 0.045 + 1), 760 + 90 * Math.cos(t * 0.07), 0.12 + 0.35 * m]]
    B.forEach((b, i) => { const [x, y, o] = REDUCE ? [pos[i][0] * 0 + (i * 500 - 200), 200 + i * 150, 0.2 + 0.3 * m] : pos[i]; b.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${P.toFixed(4)})`; b.style.opacity = o.toFixed(3) })
    let black = 0, shown = new Set()
    for (const ss of st.scenes) {
      if (ss.kind === 'black') { black = Math.max(black, ss.alpha); continue }
      const n = node(ss); shown.add(ss.i); update(n, ss, st)
    }
    for (const [i, n] of state.nodes) if (!shown.has(i)) n.root.style.display = 'none'
    const key = [...shown].join(','); state.fresh = key !== state.shownKey; state.shownKey = key   // a scene that just appeared needs a moment to rasterise (see __seek)
    $('blackout').style.opacity = black.toFixed(4)
    $('flash').style.opacity = (st.flash * 0.9).toFixed(4)
    if (DEBUG) {
      const a = st.scenes.filter(x => x.kind !== 'black' || true).map(x => `${x.id}${x.tail ? '~' : ''}`).join(' + ')
      $('dbg').textContent = `t ${t.toFixed(3)}s   bar ${st.bar}.${Math.floor(st.inBar)}   energy ${st.mood.toFixed(2)}   pulse ${st.pulse.toFixed(3)}   flash ${st.flash.toFixed(2)}\n${a}`
    }
  }

  async function init() {
    const [beats, shots, facts] = await Promise.all([j('beats.json'), j('shots/manifest.json').catch(() => ({})), j('facts.json').catch(() => ({}))])
    state.beats = beats; state.shots = shots; state.facts = facts
    state.tl = PromoTimeline.build(beats, PromoScenes.scenes)
    window.__tl = state.tl; window.__state = state
    fit(); addEventListener('resize', fit)
    if (DEBUG) $('dbg').hidden = false
    // decode every still up front so a rendered frame never shows a half-loaded image
    for (const s of state.tl.scenes) node({ i: s.i })
    await Promise.all([...document.images].map(i => i.decode().catch(() => {})))
    for (const [i, n] of state.nodes) n.root.style.display = 'none'
    render(+q.get('t') || 0)
    window.__duration = beats.duration
    window.__seek = async t => { render(t); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return state.fresh }
    window.__ready = true
    if (!RENDER) player(beats)
  }

  // ---- live player: the audio element is the clock ----
  function player(beats) {
    const audio = new Audio(); audio.preload = 'auto'
    let url = ''
    fetch('media/after-us.mp3').then(r => r.blob()).then(b => { url = URL.createObjectURL(b); audio.src = url; if (state.t) audio.currentTime = state.t }).catch(() => {})
    const play = $('play'), seek = $('seek'), time = $('time'), mute = $('mute')
    let playing = false, t0 = 0, base = state.t
    const clock = () => (audio.src && !audio.paused ? audio.currentTime : playing ? base + (performance.now() - t0) / 1000 : state.t)
    const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`
    function go(p) { playing = p; play.textContent = p ? '❚❚' : '▶'; if (p) { base = state.t >= beats.duration ? 0 : state.t; t0 = performance.now(); audio.currentTime = base; audio.play().catch(() => {}) } else audio.pause() }
    function to(t) { t = clamp(t, 0, beats.duration); state.t = t; base = t; t0 = performance.now(); if (audio.src) audio.currentTime = t; render(t) }
    play.onclick = () => go(!playing)
    seek.oninput = () => to(seek.value / 1000 * beats.duration)
    mute.onclick = () => { audio.muted = !audio.muted; mute.style.opacity = audio.muted ? .4 : 1 }
    addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); go(!playing) } else if (e.code === 'ArrowRight') { to(state.t + beats.bar) } else if (e.code === 'ArrowLeft') { to(state.t - beats.bar) } })
    const tick = () => {
      if (playing) { const t = clock(); if (t >= beats.duration) { go(false); to(beats.duration) } else { state.t = t; render(t) } }
      seek.value = Math.round(state.t / beats.duration * 1000); time.textContent = fmt(state.t)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    if (q.has('autoplay')) go(true)
    window.__play = go; window.__to = to
  }
  init().catch(e => { console.error(e); document.body.textContent = 'promo: ' + e.message })
})()
