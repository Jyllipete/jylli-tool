'use strict'
// Toasts (4.0): the one place for "something happened, here is the way back". Same call as before, toast(title, msg, type, ms), plus
// an optional 5th argument { action: { label, run }, tag, part } so Undo lives inside the toast (the old undo snackbar is gone).
// Newest on top, at most three visible ("and 2 more" for the rest), the lifetime pauses while the pointer or focus is on a toast,
// long names are shortened in the middle, confirmations stay quiet while a game is in front, errors never do.
// The pure parts (shorten, quiet, visibleSplit) are unit-tested.
;(function (root) {
  const MAX_VISIBLE = 3

  /** Shorten the middle of long text (tweak, process and file names stay recognisable at both ends). */
  function shorten(s, max = 64) {
    s = s == null ? '' : String(s)
    if (s.length <= max) return s
    const keep = max - 1, head = Math.ceil(keep * 0.6), tail = keep - head
    return s.slice(0, head).trimEnd() + '…' + s.slice(s.length - tail).trimStart()
  }
  /** Confirmations ("done") are the only toasts a running game silences; info, warnings and errors still show. */
  const quiet = (type, gameRunning) => !!gameRunning && type === 'ok'
  /** n toasts, newest first -> how many are shown and how many are folded into "and N more". */
  const visibleSplit = n => ({ shown: Math.min(n, MAX_VISIBLE), hidden: Math.max(0, n - MAX_VISIBLE) })

  const api = { shorten, quiet, visibleSplit, MAX_VISIBLE }
  root.JylliToastPure = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  const ICON = { ok: 'fa-circle-check', err: 'fa-circle-xmark', warn: 'fa-triangle-exclamation', info: 'fa-circle-info' }
  const TYPES = { ok: 'ok', err: 'err', warn: 'warn', info: 'info', success: 'ok', error: 'err' }
  const box = () => document.getElementById('toast-container')

  function layout() {
    const c = box(); if (!c) return
    const live = [...c.querySelectorAll('.toast:not(.out)')]   // DOM order is newest first
    const { hidden } = visibleSplit(live.length)
    live.forEach((el, i) => { el.hidden = i >= MAX_VISIBLE })
    let more = c.querySelector('#toast-more')
    if (!hidden) { if (more) more.remove(); return }
    if (!more) { more = document.createElement('div'); more.id = 'toast-more'; c.appendChild(more) }
    more.textContent = typeof tUIf === 'function' ? tUIf('toastMore', { n: hidden }) : `+${hidden}`
  }

  function show(title, msg = '', type = 'ok', duration = 3500, opts = {}) {
    const c = box(); if (!c) return null
    const safeType = TYPES[type] || 'info'
    const game = !!(root._gameRunning || (root._systemContext && root._systemContext.gameRunning))
    if (quiet(safeType, game)) return null
    const heading = shorten(title, 72), detail = msg ? shorten(msg, 140) : ''
    // an identical toast that is still showing is replaced, so a repeated action restarts one toast instead of stacking five
    c.querySelectorAll('.toast').forEach(o => { if (o._jt && o._jt.key === heading + '\n' + detail + '\n' + safeType) o._jt.close(true) })

    const t = document.createElement('div')
    t.className = `toast ${safeType}`
    t.setAttribute('role', safeType === 'err' || safeType === 'warn' ? 'alert' : 'status')
    if (opts.tag) t.dataset.tag = opts.tag
    t.innerHTML = `<span class="toast-icon-wrap"><i class="fa ${ICON[safeType]}" aria-hidden="true"></i></span>
      <div class="toast-body"><div class="toast-title"></div><div class="toast-msg"></div><div class="toast-actions"></div><div class="toast-bar"></div></div>
      <button type="button" class="toast-close" aria-label="${typeof escAttr === 'function' ? escAttr(tUI('ttDismiss')) : 'Dismiss'}"><i class="fa fa-xmark" aria-hidden="true"></i></button>`
    t.querySelector('.toast-title').textContent = heading
    t.querySelector('.toast-title').title = String(title == null ? '' : title)
    const msgEl = t.querySelector('.toast-msg'); if (detail) msgEl.textContent = detail; else msgEl.remove()
    const acts = t.querySelector('.toast-actions')
    if (opts.action && opts.action.label) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'toast-action'; b.textContent = opts.action.label
      b.onclick = () => { try { opts.action.run && opts.action.run() } finally { close() } }
      acts.appendChild(b)
    }
    if (opts.part && root.JylliTwin) {
      const p = document.createElement('button'); p.type = 'button'; p.className = 'toast-part'; p.innerHTML = '<i class="fa fa-microchip" aria-hidden="true"></i>'
      p.setAttribute('aria-label', typeof tUI === 'function' ? tUI('toastShowPart') : 'Show the part')
      const flash = () => { try { JylliTwin.pulse(opts.part) } catch {} }
      p.onmouseenter = flash; p.onfocus = flash; p.onclick = () => { try { JylliTwin.select(opts.part) } catch {} }
      acts.appendChild(p)
    }
    if (!acts.children.length) acts.remove()
    const bar = t.querySelector('.toast-bar'); bar.style.animationDuration = `${duration}ms`

    let left = duration, started = 0, timer = 0, closed = false
    function arm() { started = Date.now(); clearTimeout(timer); timer = setTimeout(close, Math.max(200, left)) }
    function hold() { clearTimeout(timer); left -= Date.now() - started; bar.style.animationPlayState = 'paused' }
    function release() { bar.style.animationPlayState = 'running'; arm() }
    function close(instant) {
      if (closed) return; closed = true; clearTimeout(timer)
      t.classList.add('out')
      setTimeout(() => { t.remove(); layout() }, instant === true ? 0 : 180)
      layout()
    }
    t._jt = { key: heading + '\n' + detail + '\n' + safeType, close }
    t.querySelector('.toast-close').onclick = () => close()
    t.addEventListener('mouseenter', hold); t.addEventListener('mouseleave', release)
    t.addEventListener('focusin', hold); t.addEventListener('focusout', release)

    c.insertBefore(t, c.firstChild)   // newest on top
    layout(); arm()
    return { close }
  }

  /** Close every toast with this tag (the undo toast, once the change was undone another way). */
  function dismissTag(tag) { document.querySelectorAll(`#toast-container .toast[data-tag="${tag}"]`).forEach(el => el._jt && el._jt.close()) }
  function dismissNewest() { const el = document.querySelector('#toast-container .toast:not(.out)'); if (el && el._jt) { el._jt.close(); return true } return false }

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || e.defaultPrevented) return
    if (document.querySelector('.modal-overlay.open, #cmd-palette-overlay.open')) return   // Esc belongs to the dialog first
    if (dismissNewest()) e.preventDefault()
  })

  root.JylliToast = { show, dismissTag, dismissNewest, layout }
})(typeof window !== 'undefined' ? window : globalThis)
