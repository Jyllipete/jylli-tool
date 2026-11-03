'use strict'
// Guided tours. Pure helpers (nextIndex, shouldShow, isStale, holeRect, placeCard) are unit-tested; the DOM engine below them draws one
// non-modal spotlight layer (#jt-tour) per tour. Definitions live in js/tours.js (JylliTours). State: settings.toursEnabled / toursSeen.
;(function (root) {
  const PAD = 8, GAP = 14, MARGIN = 12
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))

  /** A tour is stale (shows again) when it was never seen or its definition version was raised. */
  function isStale(seenV, defV) { return seenV == null || seenV < defV }
  function shouldShow({ enabled, seen, key, v }) { return !!enabled && isStale(seen && seen[key], v) }

  /** Index of the next stop in direction dir (+1/-1) whose target exists, or -1. */
  function nextIndex(stops, from, dir, exists) {
    for (let i = from + dir; i >= 0 && i < stops.length; i += dir) if (exists(stops[i], i)) return i
    return -1
  }

  /** Spotlight rect around a target rect {left,top,width,height}, padded and clamped to the viewport. */
  function holeRect(r, vw, vh, pad = PAD) {
    const x = clamp(r.left - pad, 0, vw), y = clamp(r.top - pad, 0, vh)
    const x2 = clamp(r.left + r.width + pad, 0, vw), y2 = clamp(r.top + r.height + pad, 0, vh)
    return { x, y, w: Math.max(0, x2 - x), h: Math.max(0, y2 - y) }
  }

  /** Card position for a hole: below if it fits, else above, else beside, else pinned to the bottom edge. Always inside the viewport. */
  function placeCard(hole, card, vw, vh, gap = GAP, margin = MARGIN) {
    const cx = clamp(hole.x + hole.w / 2 - card.w / 2, margin, Math.max(margin, vw - card.w - margin))
    if (vh - (hole.y + hole.h) - gap - margin >= card.h) return { side: 'bottom', x: cx, y: hole.y + hole.h + gap }
    if (hole.y - gap - margin >= card.h) return { side: 'top', x: cx, y: hole.y - gap - card.h }
    const cy = clamp(hole.y, margin, Math.max(margin, vh - card.h - margin))
    if (vw - (hole.x + hole.w) - gap - margin >= card.w) return { side: 'right', x: hole.x + hole.w + gap, y: cy }
    if (hole.x - gap - margin >= card.w) return { side: 'left', x: hole.x - gap - card.w, y: cy }
    return { side: 'over', x: cx, y: Math.max(margin, vh - card.h - margin) }
  }

  const api = { isStale, shouldShow, nextIndex, holeRect, placeCard }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  // ── DOM engine ──
  let S = null   // active tour: { key, def, stops, idx, token, layer, prevFocus, paused, timers, ro }
  const lang = () => (root.currentLang === 'fi' ? 'fi' : 'en')
  const g = (k, v) => (root.tG ? root.tG('tour', k, v) : k)
  const scale = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--motion-scale')) || 1
  const sleep = ms => new Promise(r => setTimeout(r, ms))
  const save = () => { try { root.api && root.api.saveSettings(root.settings) } catch {} }
  const visible = el => !!el && (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0)
  // Tours may map a data-tour name to an existing stable element (def.tag: { name: cssSelector }); the attribute is set on first sight.
  let tags = {}
  function applyTags() {
    for (const [name, css] of Object.entries(tags)) {
      try { const el = [...document.querySelectorAll(css)].find(visible); if (el && el.dataset.tour !== name) el.dataset.tour = name } catch {}
    }
  }
  const find = sel => { applyTags(); try { return [...document.querySelectorAll(sel)].find(visible) || null } catch { return null } }
  const gaming = () => !!(root._systemContext && root._systemContext.gameRunning)

  /** Something else owns the screen: Arrival, the splash, a modal, the palette or shortcut sheet, a running game, a hidden window. */
  function blocked() {
    if (document.hidden || gaming()) return true
    if (root.JylliArrival && root.JylliArrival.active) return true
    const boot = document.getElementById('loading')
    if (boot && boot.style.display !== 'none') return true
    if (document.querySelector('.modal-overlay.open, .j-modal-backdrop.j-open, #cmd-palette-overlay.open')) return true
    const ao = document.getElementById('auto-opti-modal')
    return !!ao && ao.style.display !== 'none'
  }

  function waitFor(sel, ms) {
    return new Promise(resolve => {
      const hit = find(sel)
      if (hit) return resolve(hit)
      let done = false
      const fin = el => { if (done) return; done = true; mo.disconnect(); clearTimeout(t); resolve(el) }
      const mo = new MutationObserver(() => { const el = find(sel); if (el) fin(el) })
      mo.observe(document.body, { childList: true, subtree: true, attributes: true })
      const t = setTimeout(() => fin(null), ms)
    })
  }

  function build() {
    const el = document.createElement('div')
    el.id = 'jt-tour'; el.className = 'jt'
    el.innerHTML = `<svg class="jt-svg" aria-hidden="true"><defs><mask id="jt-mask"><rect class="jt-m-all" width="100%" height="100%"/><rect class="jt-m-hole" rx="10"/></mask></defs><rect class="jt-dim" width="100%" height="100%" mask="url(#jt-mask)"/><rect class="jt-ring" rx="10"/></svg>
<div class="jt-card" role="group" aria-labelledby="jt-title">
  <div class="jt-count" aria-live="polite"></div>
  <h3 class="jt-title" id="jt-title"></h3>
  <p class="jt-body"></p>
  <div class="jt-actions"><button type="button" class="j-btn j-btn-ghost j-btn-sm" data-act="skip"></button><span class="jt-spacer"></span><button type="button" class="j-btn j-btn-sm" data-act="back"></button><button type="button" class="j-btn j-btn-primary j-btn-sm" data-act="next"></button></div>
  <button type="button" class="jt-off" data-act="off"></button>
</div>`
    el.addEventListener('click', e => {
      const act = e.target.closest && e.target.closest('[data-act]'); if (!act) return
      ({ next: () => go(1), back: () => go(-1), skip: () => end(true), off: turnOff })[act.dataset.act]()
    })
    document.body.appendChild(el)
    return el
  }

  function place(stop, target) {
    const L = S.layer, card = L.querySelector('.jt-card')
    const vw = innerWidth, vh = innerHeight
    const hole = holeRect(target.getBoundingClientRect(), vw, vh)
    for (const sel of ['.jt-m-hole', '.jt-ring']) {
      const r = L.querySelector(sel); r.setAttribute('x', hole.x); r.setAttribute('y', hole.y); r.setAttribute('width', hole.w); r.setAttribute('height', hole.h)
    }
    const p = placeCard(hole, { w: card.offsetWidth, h: card.offsetHeight }, vw, vh)
    card.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`
    card.dataset.side = p.side
  }

  function fill(stop, i) {
    const L = S.layer, t = stop[lang()] || stop.en
    L.querySelector('.jt-count').textContent = g('of', { i: i + 1, n: S.stops.length })
    L.querySelector('.jt-title').textContent = t.t
    L.querySelector('.jt-body').textContent = t.b
    const last = nextIndex(S.stops, i, 1, s => !!find(s.sel)) < 0
    const q = a => L.querySelector(`[data-act="${a}"]`)
    q('skip').textContent = g('skip'); q('back').textContent = g('back'); q('off').textContent = g('turnOff')
    q('next').textContent = last ? g('done') : g('next')
    q('back').style.display = nextIndex(S.stops, i, -1, s => !!find(s.sel)) < 0 ? 'none' : ''
  }

  async function show(i, dir) {
    const stop = S.stops[i], tok = ++S.showTok
    const target = await waitFor(stop.sel, 1500)
    if (!S || tok !== S.showTok) return
    if (!target) {   // gone while waiting: move on, or finish if this was the last one
      const n = nextIndex(S.stops, i, dir || 1, s => !!find(s.sel))
      return n < 0 ? end(false) : show(n, dir)
    }
    S.idx = i
    const L = S.layer, still = gaming() || scale() < 0.05
    L.classList.add('jt-fade')
    if (!still && L.classList.contains('jt-on')) await sleep(120 * scale())
    if (!S || tok !== S.showTok) return
    target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' })
    fill(stop, i); place(stop, target)
    if (S.ro) S.ro.disconnect()
    if ('ResizeObserver' in root) { S.ro = new ResizeObserver(() => reflow()); S.ro.observe(target) }
    S.target = target
    L.classList.add('jt-on'); L.classList.remove('jt-fade')
    const nb = L.querySelector('[data-act="next"]'); if (nb) nb.focus({ preventScroll: true })
  }

  let raf = 0
  function reflow() {
    if (!S || !S.target || raf) return
    raf = requestAnimationFrame(() => { raf = 0; if (S && S.target && S.target.isConnected) place(S.stops[S.idx], S.target) })
  }

  function go(dir) {
    if (!S) return
    const n = nextIndex(S.stops, S.idx, dir, s => !!find(s.sel))
    if (n < 0) { if (dir > 0) end(true); return }
    try { root.JylliSound && root.JylliSound.play('tick') } catch {}
    show(n, dir)
  }

  function onKey(e) {
    if (!S || S.paused) return
    const inBtn = e.target.closest && e.target.closest('#jt-tour button')
    if (e.key === 'ArrowRight' || (e.key === 'Enter' && !inBtn)) go(1)
    else if (e.key === 'ArrowLeft') go(-1)
    else if (e.key === 'Escape') end(true)
    else return
    e.preventDefault(); e.stopPropagation()
  }

  function end(markSeen) {
    if (!S) return
    const s = S; S = null
    clearInterval(s.watch); if (s.ro) s.ro.disconnect()
    document.removeEventListener('keydown', onKey, true)
    removeEventListener('resize', reflow); removeEventListener('scroll', reflow, true)
    if (markSeen) {
      root.settings.toursSeen = Object.assign({}, root.settings.toursSeen, { [s.key]: s.def.v })
      save()
    }
    s.layer.classList.remove('jt-on')
    setTimeout(() => s.layer.remove(), 160 * scale())
    try { s.prevFocus && s.prevFocus.isConnected && s.prevFocus.focus({ preventScroll: true }) } catch {}
    document.dispatchEvent(new CustomEvent('jylli:tour-end', { detail: { key: s.key, completed: !!markSeen } }))
  }

  function turnOff() { root.settings.toursEnabled = false; save(); end(true) }

  /** Start a tour by key. force replays it; otherwise it respects toursEnabled / toursSeen. Nothing is marked seen if no stop is found. */
  async function start(key, opts = {}) {
    const def = root.JylliTours && root.JylliTours[key]
    if (!def || S) return false
    tags = def.tag || {}
    if (!opts.force && !shouldShow({ enabled: root.settings.toursEnabled, seen: root.settings.toursSeen, key, v: def.v })) return false
    // Pages fill in asynchronously: give the first stops up to 1.5 s to appear. No stop at all = not shown, not marked seen.
    if (nextIndex(def.stops, -1, 1, s => !!find(s.sel)) < 0) {
      const hits = await Promise.all(def.stops.map(s => waitFor(s.sel, 1500)))
      if (!hits.some(Boolean)) return false
    }
    if (S) return false
    S = { key, def, stops: def.stops, idx: 0, token: opts.token, showTok: 0, prevFocus: document.activeElement, paused: false, layer: build() }
    document.addEventListener('keydown', onKey, true)
    addEventListener('resize', reflow); addEventListener('scroll', reflow, true)
    // pause under a blocker; cancel (unseen) when the user navigates away
    S.watch = setInterval(() => {
      if (!S) return
      if (S.token != null && root._navToken !== S.token) return end(false)
      const b = blocked()
      if (b !== S.paused) { S.paused = b; S.layer.classList.toggle('jt-paused', b) }
    }, 500)
    show(Math.max(0, nextIndex(def.stops, -1, 1, s => !!find(s.sel))), 1)
    return true
  }

  /** Called by showPage once a tab is built. Waits (up to 20 s) for blockers to clear, then starts the tab's tour if it is due. */
  function keyFor(route, c) { return c && c.querySelector('.tab-premium-lock') ? 'prolock' : route.tab }
  /** Whether this page's tour will show (enabled, defined, not yet seen at this version). */
  function due(route, c) {
    const key = keyFor(route, c), def = root.JylliTours && root.JylliTours[key]
    return !!def && shouldShow({ enabled: root.settings.toursEnabled, seen: root.settings.toursSeen, key, v: def.v })
  }
  function onPage(route, c) {
    if (!route || S) return
    const key = keyFor(route, c)
    if (!due(route, c)) return
    const token = root._navToken, t0 = Date.now()
    const poll = () => {
      if (root._navToken !== token || S) return
      if (!blocked()) return void start(key, { token })
      if (Date.now() - t0 < 20000) setTimeout(poll, 500)
    }
    poll()
  }

  function currentKey() {
    const R = root.JylliRoutes; if (!R) return null
    const page = typeof currentPage === 'string' ? currentPage : 'dashboard'   // top-level `let` in index.html: shared scope, not on window
    const r0 = R.resolve(page), r = r0 && R.resolve(page, (root._activeTab || {})[r0.section])
    if (!r) return null
    return document.querySelector('#page-content .tab-premium-lock') ? 'prolock' : r.tab
  }

  /** Replay the tour of the page on screen (help button, F1). */
  function replay() {
    if (S) return
    const key = currentKey()
    if (!key || !(root.JylliTours && root.JylliTours[key])) { try { root.toast(g('noTour'), '', 'info') } catch {} ; return }
    start(key, { force: true, token: root._navToken })
  }

  function reset() { root.settings.toursSeen = {}; save(); try { root.toast(g('resetDone'), '', 'ok') } catch {} }

  document.addEventListener('keydown', e => { if (e.key === 'F1' && !S) { e.preventDefault(); replay() } })

  root.JylliTour = Object.assign(api, { start, onPage, due, keyFor, replay, reset, blocked, get active() { return !!S } })
})(typeof window !== 'undefined' ? window : globalThis)
