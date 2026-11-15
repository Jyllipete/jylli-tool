'use strict'
// Game automation panel, mounted in Pulse > Rules and Games > Automation (JylliGameAuto.mount). One state object from the main process
// (lib/gameauto snapshot) drives everything; a switch only changes when the main process says the change really happened.
// Repainting is per slot and skipped when nothing changed, so typing in the "always keep alive" box is never interrupted.
;(function (root) {
  const api = { last: null, mount() { return { destroy() {}, refresh() {} } }, armedText() { return '–' } }
  root.JylliGameAuto = api
  if (typeof document === 'undefined') return

  const V = root.JylliGameAutoViews, M = root.JylliGameAutoModel
  const A = () => root.api
  const T = (k, v) => root.tG('gameauto', k, v)
  // LANG and currentLang are script-scope globals of index.html (not window properties), so they are read by name
  const has = k => { try { const L = LANG; return !!((L[currentLang] && L[currentLang].gameauto && k in L[currentLang].gameauto) || (L.en.gameauto && k in L.en.gameauto)) } catch (e) { return false } }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const toast = (...a) => { try { root.toast(...a) } catch (e) { /* toast is optional */ } }
  const lsGet = k => { try { return localStorage.getItem(k) } catch (e) { return null } }
  const lsSet = (k, v) => { try { localStorage.setItem(k, v) } catch (e) { /* storage may be unavailable */ } }

  api.armedText = function () {
    const s = api.last; if (!s) return '–'
    const a = M.armed(s); return a.n + '/' + a.total
  }

  api.mount = function mount(host, opts) {
    opts = opts || {}
    const S = { st: null, loading: true, failed: false, busy: {}, exMsg: null, open: new Set((lsGet('gx_open') || '').split(',').filter(Boolean)), drag: false, disposed: false }
    const el = document.createElement('div')
    el.className = 'jk nt gx'
    el.dataset.where = opts.where || 'pulse'
    el.innerHTML = '<div data-slot="body"></div>'
    host.appendChild(el)
    const slots = { body: el.querySelector('[data-slot="body"]') }
    const cache = {}
    const unsubs = []
    let tick = null

    const X = () => ({ T, esc, M, has, now: Date.now(), busy: S.busy, exMsg: S.exMsg, open: S.open })

    function setHtml(node, key, html) {
      if (cache[key] === html) return
      cache[key] = html
      const a = document.activeElement
      const keep = a && node.contains(a) && a.name === 'exe' ? { v: a.value, s: a.selectionStart, e: a.selectionEnd } : null
      node.innerHTML = html
      if (keep) { const n = node.querySelector('input[name="exe"]'); if (n) { n.value = keep.v; n.focus(); try { n.setSelectionRange(keep.s, keep.e) } catch (e) { /* not selectable */ } } }
    }

    function paint() {
      if (S.disposed) return
      const x = X()
      if (S.loading) return setHtml(slots.body, 'body', V.loading(x))
      if (S.failed || !S.st) return setHtml(slots.body, 'body', V.failed(x))
      if (S.drag) return
      const st = S.st
      setHtml(slots.body, 'body', `<div class="gx-stack">${V.strip(st, x)}${V.flow(st, x)}<div class="gx-cards">${V.cardUg(st, x)}${V.cardAp(st, x)}${V.cardGs(st, x)}</div>${V.ledger(st, x)}</div>`)
    }
    const setState = st => { S.st = st; api.last = st; paint(); try { if (root.JylliPulsePage && root.JylliPulsePage._active && root.JylliPulsePage._active.armedChanged) root.JylliPulsePage._active.armedChanged() } catch (e) { /* pulse page not open */ } }

    async function load() {
      S.loading = !S.st; S.failed = false; paint()
      let r = null
      try { r = await A().gameautoState() } catch (e) { r = null }
      if (S.disposed) return
      S.loading = false
      if (r && r.ok && r.state) setState(r.state); else { S.failed = !S.st; paint() }
    }

    const errText = r => {
      const code = (r && (r.reason || r.error)) || 'failed'
      return has('err_' + code) ? T('err_' + code) : T('err_failed')
    }
    /** Runs one change. The panel shows the new state only when the main process confirms it; a refusal is told, not hidden. */
    async function change(act, patch) {
      S.busy[act] = true; paint()
      let r = null
      try { r = await A().gameautoSet(patch) } catch (e) { r = { ok: false, error: 'failed' } }
      delete S.busy[act]
      if (S.disposed) return r
      if (r && r.ok) { if (r.state) setState(r.state); else paint() }
      else { paint(); toast(T('changeFailed'), errText(r), 'err', 7000) }
      return r
    }

    async function addExclusion(form) {
      const input = form.querySelector('input[name="exe"]')
      const raw = input.value
      S.busy['ex-add'] = true; S.exMsg = null; paint()
      let r = null
      try { r = await A().gameautoExclusion({ add: raw }) } catch (e) { r = { ok: false, error: 'failed' } }
      delete S.busy['ex-add']
      if (S.disposed) return
      if (r && r.ok) {
        S.exMsg = { tone: 'ok', text: T('exAdded', { name: String(raw).trim().toLowerCase().replace(/\.exe$/, '') + '.exe' }) + ' ' + T('cov_' + (r.coverage || 'none')) }
        input.value = ''
        await load()
      } else {
        const code = (r && (r.reason || r.error)) || 'failed'
        S.exMsg = { tone: 'bad', text: has('ex_' + code) ? T('ex_' + code) : T('ex_save') }
        paint()
      }
      const n = el.querySelector('input[name="exe"]'); if (n) { n.value = r && r.ok ? '' : raw; n.focus() }
    }

    async function removeExclusion(exe) {
      S.busy['ex-del'] = true; S.exMsg = null
      let r = null
      try { r = await A().gameautoExclusion({ remove: exe }) } catch (e) { r = { ok: false, error: 'failed' } }
      delete S.busy['ex-del']
      if (r && r.ok) await load()
      else { S.exMsg = { tone: 'bad', text: T('ex_save') }; paint() }
    }

    async function retry(what) {
      S.busy['retry-' + what] = true; paint()
      let r = null
      try { r = await A().gameautoRetry(what === 'gs' ? 'shield' : 'updateGuard') } catch (e) { r = { ok: false } }
      delete S.busy['retry-' + what]
      if (!(r && r.ok)) toast(T('retryFailed'), T(what === 'gs' ? 'retryFailedGs' : 'retryFailedUg'), 'err', 8000)
      await load()
    }

    const cur = () => S.st
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b || b.disabled) return
      const act = b.dataset.act, st = cur(); if (!st) return
      if (act === 'watcher') change(act, { watcher: !st.settings.watcher })
      else if (act === 'watcher-on') change(act, { watcher: true })
      else if (act === 'sw-updateGuard') change(act, { updateGuard: !st.settings.updateGuard })
      else if (act === 'sw-shield') change(act, { shield: !st.settings.shield })
      else if (act === 'sw-autoPulse') change(act, { autoPulse: !st.settings.autoPulse })
      else if (act === 'lib') change(act, { libraryDetect: !st.settings.libraryDetect })
      else if (act === 'pulse-game') change(act + ':' + b.dataset.id, { pulseOff: { gameId: b.dataset.id, off: b.getAttribute('aria-checked') === 'true' } })
      else if (act === 'pulse-reset') change(act, { pulseReset: true })
      else if (act === 'dismiss-legacy') change(act, { dismissLegacy: true })
      else if (act === 'ex-del') removeExclusion(b.dataset.exe)
      else if (act === 'retry-ug') retry('ug')
      else if (act === 'retry-gs') retry('gs')
      else if (act === 'reload') load()
      else if (act === 'premium') { try { root.JylliPremium.open() } catch (er) { /* pitch is optional */ } }
      else if (act === 'open-pulse') { try { root.showPage('pulse') } catch (er) { /* navigation is optional */ } }
      else if (act === 'open-games') { try { root.showPage('game-opti') } catch (er) { /* navigation is optional */ } }
    })
    el.addEventListener('submit', e => { const f = e.target.closest('[data-form="ex"]'); if (f) { e.preventDefault(); addExclusion(f) } })
    el.addEventListener('toggle', e => {
      const d = e.target.closest && e.target.closest('details[data-key]'); if (!d) return
      if (d.open) S.open.add(d.dataset.key); else S.open.delete(d.dataset.key)
      lsSet('gx_open', [...S.open].join(','))
      cache.body = null   // the stored markup no longer matches the DOM's open state
    }, true)
    // sliders: the pair moves together while dragging (mid always >= launch + 5); one save when the user lets go
    el.addEventListener('input', e => {
      const r = e.target.closest('[data-slider]'); if (!r || !cur()) return
      S.drag = true
      const t3 = el.querySelector('[data-slider="tier3"]'), mid = el.querySelector('[data-slider="mid"]')
      const p = M.clampPair(t3.value, mid.value, r.dataset.slider)
      t3.value = p.tier3; mid.value = p.mid
      for (const [k, v] of [['tier3', p.tier3], ['mid', p.mid]]) {
        const n = el.querySelector('[data-slider="' + k + '"]'); n.style.setProperty('--p', Math.round((v - 50) / 45 * 100) + '%')
        const o = el.querySelector('[data-out="' + k + '"]'); if (o) o.textContent = v + '%'
      }
    })
    el.addEventListener('change', async e => {
      const r = e.target.closest('[data-slider]'); if (!r || !cur()) return
      const t3 = el.querySelector('[data-slider="tier3"]'), mid = el.querySelector('[data-slider="mid"]')
      const p = M.clampPair(t3.value, mid.value, r.dataset.slider)
      S.drag = false
      await change('slider', { tier3: p.tier3, mid: p.mid })
    })

    // live updates from the main process
    try { unsubs.push(A().onGameautoEvent(ev => { if (ev && ev.type === 'state' && ev.state) { S.loading = false; S.failed = false; setState(ev.state) } })) } catch (e) { /* api missing in tests */ }
    tick = setInterval(() => { if (S.st && S.st.session && !S.drag) { cache.body = null; paint() } }, 30000)   // keeps "playing for N min" honest

    paint(); load()
    return {
      refresh: load,
      destroy() { S.disposed = true; clearInterval(tick); for (const u of unsubs) { try { u() } catch (e) { /* gone */ } }; el.remove() },
    }
  }
})(typeof window !== 'undefined' ? window : globalThis)
