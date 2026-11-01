'use strict'
// JylliWorld (4.0 "Through the glass"): the director of the persistent 3D stage behind the whole app. It decides whether the world
// is on (quality tier, dark scheme, 3D not off), gives pages without a hero slot a camera shot, projects the one light onto
// every glass edge, and runs the light pulses that connect an action to the part it changed. Pure lookups are unit-tested.
;(function (root) {
  const MODES = ['cinematic', 'balanced', 'light', 'classic']

  // tab id -> part the camera looks at on pages that have no hero slot of their own (null = the whole rig as ambient depth)
  const SHOTS = { windows: 'board', fixes: 'board', cleanup: 'drive0', debloat: 'drive0', startup: 'drive0', diagnostics: 'board', processes: 'cpu', bios: 'board', scheduler: 'board', restore: 'drive0', history: 'board' }
  const shotFor = tab => (Object.prototype.hasOwnProperty.call(SHOTS, tab) ? SHOTS[tab] : null)

  // tweak id -> the part of the rig it changes (used for the light pulse after a batch). Order matters: first match wins.
  const PART_RULES = [
    [/^(clean-|fivem-clear|ntfs|sysmain|hibernate|nvme|disable-auto-maintenance|disable-delivery)/, 'drive0'],
    [/(memory|ram|standby|compression)/, 'ram0'],
    [/(gpu|nvidia|tdr|hdcp|hwsch|game-dvr|disable-fso|xbox|vrr)/, 'gpu'],
    [/(cpu|mmcss|priority|timer|throttl|cstate|parking|speed-shift|amd-power|intel-power|spectre|hpet|tsc|msi|power-plan)/, 'cpu'],
  ]
  const partFor = id => { for (const [re, part] of PART_RULES) if (re.test(String(id))) return part; return 'board' }
  const partsFor = ids => [...new Set((ids || []).map(partFor))]

  const S = { mode: 'balanced', scheme: 'dark' }
  const mode = () => (MODES.includes(root.settings && root.settings.uiMode) ? root.settings.uiMode : 'balanced')
  const reduced = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches) || (root.settings && root.settings.motionMode === 'none') || (typeof document !== 'undefined' && document.body.classList.contains('motion-reduced'))
  const scheme = () => (root.JylliTheme ? root.JylliTheme.scheme() : 'dark')
  const enabled = () => mode() !== 'classic' && scheme() === 'dark' && !(root.settings && root.settings.visuals3d === 'off')
  const rolling = () => enabled() && !reduced()
  const holdToApply = () => enabled()

  /** Re-read settings and scheme: body classes drive every CSS tier. Called at startup and after the related settings change. */
  function apply() {
    if (typeof document === 'undefined') return
    const b = document.body, on = enabled()
    b.classList.toggle('world-on', on)
    MODES.forEach(m => b.classList.toggle('q-' + m, m === mode()))
    S.mode = mode()
    if (on) { try { root.JylliTwin && JylliTwin.attach(null) } catch {} }   // starts the world: the host mounts the canvas in #world-slot before any page has a window
    else { try { root.JylliTwin && JylliTwin.exitWorld() } catch {} }
    startLight(on)
    if (on && root.JylliChrono) { try { JylliChrono.init() } catch {} }
    if (root.JylliCalloutsRT) { if (on) JylliCalloutsRT.start(); else JylliCalloutsRT.stop() }
  }

  /** A page was opened. Pages with a hero slot take their own view when they attach; the rest get a shot of the part they are about. */
  function route(r) {
    if (!enabled() || !root.JylliTwin) return
    // the Network tab brings its own 3D scene: the rig steps aside (faded and not rendered) instead of two scenes competing
    const away = !!(r && r.tab === 'network'), el = document.getElementById('world')
    if (el) el.classList.toggle('away', away)
    try { JylliTwin.pause(away) } catch {}
    try { JylliTwin.shot(shotFor(r && r.tab)) } catch {}
  }

  // ── shared light ───────────────────────────────────────────────────────────────────────────
  // One light for every glass edge: its viewport position drifts slowly and leans toward the pointer. Written at ~15 Hz and only
  // while the world is visible, because changing a root variable restyles the page.
  let lightT = 0, ptr = null, lastLx = -999, lastLy = -999
  if (typeof document !== 'undefined') document.addEventListener('pointermove', e => { ptr = { x: e.clientX, y: e.clientY } }, { passive: true })
  function startLight(on) {
    clearInterval(lightT); lightT = 0
    if (!on) return
    lightT = setInterval(() => {
      const gameLive = !!(root._gameRunning || (root._systemContext && root._systemContext.gameRunning))
      document.body.classList.toggle('game-live', gameLive)
      if (gameLive || document.visibilityState !== 'visible' || reduced()) return
      const t = performance.now() / 1000
      const bx = innerWidth * (0.5 + Math.sin(t * 0.11) * 0.32), by = innerHeight * (0.12 + Math.cos(t * 0.09) * 0.08)
      const x = ptr ? bx + (ptr.x - bx) * 0.5 : bx, y = ptr ? by + (ptr.y - by) * 0.45 : by
      // every write restyles and repaints each card edge, so only move the light when it has travelled far enough to be seen
      if (Math.abs(x - lastLx) < 28 && Math.abs(y - lastLy) < 28) return
      lastLx = x; lastLy = y
      const s = document.documentElement.style
      s.setProperty('--lx', x.toFixed(0) + 'px'); s.setProperty('--ly', y.toFixed(0) + 'px')
    }, 66)
  }

  // ── pulses: a light travels from the control to the part it changed (and back on undo) ──────────────
  const NS = 'http://www.w3.org/2000/svg'
  function fxLayer() {
    let s = document.getElementById('jx-fx')
    if (!s) { s = document.createElementNS(NS, 'svg'); s.id = 'jx-fx'; s.setAttribute('aria-hidden', 'true'); s.innerHTML = '<defs><linearGradient id="jx-fxg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100%" y2="0"><stop offset="0" stop-color="var(--c-accent)" stop-opacity=".1"/><stop offset="1" stop-color="#fff"/></linearGradient></defs>'; document.body.appendChild(s) }
    return s
  }
  const centerOf = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }
  const anchor = id => { try { return JylliTwin.anchor(id) } catch { return null } }
  function travel(a, b, ms = 800) {
    return new Promise(res => {
      if (!a || !b || reduced() || !enabled()) { res(); return }
      const fx = fxLayer(), path = document.createElementNS(NS, 'path'), dot = document.createElementNS(NS, 'circle'), halo = document.createElementNS(NS, 'circle')
      path.setAttribute('d', `M${a.x},${a.y} Q${(a.x + b.x) / 2},${Math.min(a.y, b.y) - 90} ${b.x},${b.y}`)
      path.setAttribute('fill', 'none'); path.setAttribute('stroke', 'url(#jx-fxg)'); path.setAttribute('stroke-width', '2.2'); path.setAttribute('stroke-linecap', 'round')
      dot.setAttribute('r', '5'); dot.setAttribute('fill', '#fff'); halo.setAttribute('r', '16'); halo.setAttribute('fill', 'var(--c-accent)'); halo.setAttribute('opacity', '.4'); halo.setAttribute('style', 'filter:blur(5px)')
      fx.append(path, halo, dot)
      const len = path.getTotalLength(), t0 = performance.now()
      const step = now => {
        const p = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - p, 3), q = path.getPointAtLength(len * e)
        dot.setAttribute('cx', q.x); dot.setAttribute('cy', q.y); halo.setAttribute('cx', q.x); halo.setAttribute('cy', q.y)
        path.setAttribute('stroke-dasharray', `${len * e} ${len}`)
        if (p < 1) requestAnimationFrame(step)
        else { res(); for (const n of [path, dot, halo]) n.style.transition = 'opacity 500ms', n.style.opacity = 0; setTimeout(() => { path.remove(); dot.remove(); halo.remove() }, 520) }
      }
      requestAnimationFrame(step)
    })
  }
  /** from: an element or {x,y}; parts: ids of the rig. Resolves when the light has landed and the parts have flashed. */
  async function pulseTo(from, parts) {
    const a = from && from.getBoundingClientRect ? centerOf(from) : from
    const list = (parts || []).filter(Boolean)
    const b = list.length ? anchor(list[0]) : null
    await travel(a, b)
    list.forEach(p => { try { JylliTwin.pulse(p) } catch {} })
    return b
  }

  // scheme switch: the world only exists in the dark scheme
  if (typeof window !== 'undefined') window.addEventListener('jylli-scheme', () => { const was = document.body.classList.contains('world-on'); apply(); const app = document.getElementById('app'), ready = app && !app.classList.contains('hidden') && !(root.JylliBootStage && JylliBootStage.active)   // never during start-up: a page rebuild would take the canvas from the boot stage
    if (ready && was !== enabled() && typeof showPage === 'function' && typeof currentPage !== 'undefined') { try { showPage(currentPage) } catch {} } })

  /** A single tweak was applied: the light leaves the button for the part it changed. */
  function pulseTweak(id, from) { return pulseTo(from || null, [partFor(id)]) }
  /** Undo plays the same path backwards: from the part to the control that took the change back. */
  async function undoPulse(parts, toEl) {
    const list = (parts && parts.length ? parts : ['board']).filter(Boolean)
    const a = anchor(list[0]), b = toEl && toEl.getBoundingClientRect ? centerOf(toEl) : toEl
    list.forEach(p => { try { JylliTwin.pulse(p) } catch {} })
    await travel(a, b)
  }

  // ── scan sweep: a light plane crosses the screen while Diagnostics runs and each part flashes as the sweep passes its stage ──
  const SCAN_PARTS = [[12, 'board'], [32, 'cpu'], [52, 'ram0'], [72, 'gpu'], [90, 'drive0']]
  let scanOn = false, scanPct = 0, scanTimer = 0
  function scanStart() {
    if (!enabled()) return
    scanOn = true; scanPct = 0; clearTimeout(scanTimer); scanTimer = setTimeout(scanEnd, 90000)
    try { JylliTwin.shot(null) } catch {}
    let el = document.getElementById('jx-sweep'); if (!el) { el = document.createElement('div'); el.id = 'jx-sweep'; el.setAttribute('aria-hidden', 'true'); document.body.appendChild(el) }
    el.classList.toggle('still', reduced()); el.style.left = '-200px'; el.style.opacity = '1'
  }
  function scanProgress(pct) {
    if (!scanOn) return
    const el = document.getElementById('jx-sweep'); if (el) el.style.left = (Math.max(0, Math.min(100, pct)) / 100 * innerWidth - 80) + 'px'
    for (const [at, part] of SCAN_PARTS) if (scanPct < at && pct >= at) { try { JylliTwin.pulse(part) } catch {} }
    scanPct = Math.max(scanPct, pct)
  }
  function scanEnd() {
    if (!scanOn) return
    scanOn = false; clearTimeout(scanTimer)
    const el = document.getElementById('jx-sweep'); if (el) { el.style.opacity = '0'; el.style.left = innerWidth + 'px' }
  }

  // ── Clean: the bytes just freed rise out of the drive ──
  function fmtBytes(b) { return b >= 1073741824 ? (b / 1073741824).toFixed(1) + ' GB' : b >= 1048576 ? Math.round(b / 1048576) + ' MB' : Math.round(b / 1024) + ' KB' }
  function freedBurst(bytes) {
    if (!enabled() || !(bytes > 0)) return
    try { JylliTwin.pulse('drive0') } catch {}
    const p = anchor('drive0') || { x: innerWidth / 2, y: innerHeight / 2 }
    const el = document.createElement('div'); el.className = 'jx-burst'; el.textContent = '+' + fmtBytes(bytes)
    el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; document.body.appendChild(el)
    setTimeout(() => el.remove(), 2600)
  }

  const api = { fmtBytes, scanStart, scanProgress, scanEnd, freedBurst, pulseTweak, undoPulse, MODES, shotFor, partFor, partsFor, mode, enabled, rolling, holdToApply, apply, route, travel, pulseTo, anchor, centerOf, reduced }
  root.JylliWorld = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
