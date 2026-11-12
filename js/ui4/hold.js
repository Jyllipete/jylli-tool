'use strict'
// Hold to apply: anything that changes the system is confirmed by holding the button while a fill crosses it. Releasing
// early cancels. Pointer, Space and Enter all work. Without the world (Classic) or with reduced motion a plain click still runs it,
// so nothing is ever reachable only by a long press. `progress` is the pure part (unit-tested).
;(function (root) {
  /** elapsed/duration -> 0..1 */
  const progress = (elapsedMs, durationMs) => (durationMs <= 0 ? 1 : Math.max(0, Math.min(1, elapsedMs / durationMs)))

  function attach(btn, ms, done) {
    if (!btn || btn._jxHold) return
    btn._jxHold = true
    const needHold = () => !!(root.JylliWorld && root.JylliWorld.holdToApply())
    btn.classList.add('jx-hold')
    let raf = 0, t0 = 0, on = false, fired = false
    const set = p => btn.style.setProperty('--p', p)
    const end = ok => {
      if (!on) return
      on = false; cancelAnimationFrame(raf); btn.classList.remove('jx-holding')
      if (ok) { fired = true; set(1); setTimeout(() => set(0), 400); try { root.JylliSound && JylliSound.play('apply') } catch {} done(btn) } else set(0)
    }
    const tick = () => { const p = progress(performance.now() - t0, ms); set(p); if (p >= 1) end(true); else raf = requestAnimationFrame(tick) }
    const start = () => { if (on || btn.disabled || !needHold()) return; on = true; fired = false; t0 = performance.now(); btn.classList.add('jx-holding'); try { root.JylliSound && JylliSound.play('click') } catch {} tick() }
    btn.addEventListener('pointerdown', e => { if (e.button) return; try { btn.setPointerCapture(e.pointerId) } catch {} start() })
    btn.addEventListener('pointerup', () => end(false)); btn.addEventListener('pointercancel', () => end(false)); btn.addEventListener('lostpointercapture', () => end(false))
    btn.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && needHold()) { e.preventDefault(); start() } })
    btn.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') end(false) })
    // without hold mode the original click behaviour is untouched; in hold mode a quick click only explains itself
    btn.addEventListener('click', e => {
      if (!needHold()) return
      e.stopImmediatePropagation(); e.preventDefault()
      if (!fired && typeof toast === 'function') toast(typeof tUI === 'function' ? tUI('holdHint') : 'Hold to apply', '', 'info')
      fired = false
    }, true)
    if (!btn.title) btn.title = typeof tUI === 'function' ? tUI('holdHint') : 'Hold to apply'
  }

  const api = { progress, attach }
  root.JylliHold = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
