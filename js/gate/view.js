'use strict'
// Discord gate ("Keyring"): the screen Jylli Tool shows until a Discord session is verified. Pure rules in js/gate/pure.js, styles in
// css/gate.css (prefix gt-), strings in LANG group `gate`. Auth itself stays in the main process (api.authStart / authPoll / authVerify):
// this file only shows what is really happening. JylliGate.show({ mode, onUnlock }) is called by js/boot-logic.js.
;(function (root) {
  const P = root.JylliGatePure
  const INVITE = 'https://discord.gg/jylligraffat'
  const NS = 'http://www.w3.org/2000/svg'
  const T = (k, v) => tG('gate', k, v)

  // Dial geometry (viewBox 320): 120 ticks on the outer ring, four arcs in the middle, the Jylli mark in the centre.
  const C = 160, R_OUT = 148, TICK_LEN = 9, R_ARC = 118
  const polar = (r, deg) => { const a = (deg - 90) * Math.PI / 180; return [C + r * Math.cos(a), C + r * Math.sin(a)] }
  const f = n => n.toFixed(2)
  const ticksSvg = () => Array.from({ length: P.TICKS }, (_, i) => {
    const deg = i * 360 / P.TICKS, [x1, y1] = polar(R_OUT, deg), [x2, y2] = polar(R_OUT - (i % 10 === 0 ? TICK_LEN + 4 : TICK_LEN), deg)
    return `<line class="gt-tick${i % 10 === 0 ? ' gt-tick-major' : ''}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`
  }).join('')
  const arcsSvg = () => [0, 1, 2, 3].map(i => {
    const a0 = i * 90 + 5, a1 = i * 90 + 85, [x0, y0] = polar(R_ARC, a0), [x1, y1] = polar(R_ARC, a1)
    return `<path class="gt-arc" d="M${f(x0)} ${f(y0)} A${R_ARC} ${R_ARC} 0 0 1 ${f(x1)} ${f(y1)}"/>`
  }).join('')
  const sweepSvg = () => { const [x0, y0] = polar(R_OUT + 1, -14), [x1, y1] = polar(R_OUT + 1, 14); return `<path class="gt-sweep-arc" d="M${f(x0)} ${f(y0)} A${R_OUT + 1} ${R_OUT + 1} 0 0 1 ${f(x1)} ${f(y1)}"/>` }

  const WIN_ICONS = {
    min: '<svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" aria-hidden="true"><path d="M1.5 5.5h8"/></svg>',
    close: '<svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" aria-hidden="true"><path d="M2 2l7 7M9 2L2 9"/></svg>',
  }

  function show({ mode, onUnlock } = {}) {
    const existing = document.getElementById('lock-screen')
    if (existing) return existing
    const { html, raw, esc } = ui
    const el = document.createElement('div')
    el.id = 'lock-screen'
    el.className = 'gt'
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Jylli Tool')
    const appVer = typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''
    const g = k => html`<span data-g="${k}">${T(k)}</span>`

    el.innerHTML = String(html`
      <div class="gt-bar">
        <div class="gt-bar-brand"><svg class="gt-mark-sm" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30"/><path d="M38 16v21a8 8 0 0 1-8 8h-2a8 8 0 0 1-8-8"/></svg><span>Jylli Tool</span></div>
        <div class="gt-bar-sp"></div>
        <div class="gt-lang" role="group" aria-label="${T('b_lang')}" data-gl="b_lang" data-gl-attr="aria-label">
          <button type="button" class="gt-lang-btn" data-lang="en">EN</button><button type="button" class="gt-lang-btn" data-lang="fi">FI</button>
        </div>
        <div class="j-winbtns gt-win">
          <button class="j-winbtn" type="button" data-win="min" aria-label="${T('b_min')}" data-gl="b_min" data-gl-attr="aria-label">${raw(WIN_ICONS.min)}</button>
          <button class="j-winbtn j-winbtn-close" type="button" data-win="close" aria-label="${T('b_close')}" data-gl="b_close" data-gl-attr="aria-label">${raw(WIN_ICONS.close)}</button>
        </div>
      </div>
      <div class="gt-stage">
        <section class="gt-copy" id="gt-copy">
          <h1 class="gt-title" data-g="h_title">${T('h_title')}</h1>
          <p class="gt-sub" data-g="h_sub">${T('h_sub')}</p>
          <ul class="gt-values">
            <li><i class="fa fa-gauge-high" aria-hidden="true"></i>${g('v_1')}</li>
            <li><i class="fa fa-rotate-left" aria-hidden="true"></i>${g('v_2')}</li>
            <li><i class="fa fa-house-lock" aria-hidden="true"></i>${g('v_3')}</li>
          </ul>
          <ul class="gt-trust">
            <li><i class="fab fa-discord" aria-hidden="true"></i>${g('tr_1')}</li>
            <li><i class="fa fa-lock" aria-hidden="true"></i>${g('tr_2')}</li>
            <li><i class="fa fa-calendar-check" aria-hidden="true"></i>${g('tr_3')}</li>
          </ul>
        </section>
        <section class="gt-core">
          <div class="gt-dial" id="gt-dial" role="img" aria-label="${T('aria_dial')}" data-gl="aria_dial" data-gl-attr="aria-label">
            <svg viewBox="0 0 320 320" aria-hidden="true">
              <circle class="gt-halo" cx="160" cy="160" r="186"/><circle class="gt-halo" cx="160" cy="160" r="224"/>
              <g class="gt-sweep">${raw(sweepSvg())}</g>
              <g id="gt-ticks">${raw(ticksSvg())}</g>
              <g id="gt-arcs">${raw(arcsSvg())}</g>
              <circle class="gt-core-ring" cx="160" cy="160" r="84"/>
              <g class="gt-mark" transform="translate(160 160) scale(1.05) translate(-32 -32)"><path d="M38 16v21a8 8 0 0 1-8 8h-2a8 8 0 0 1-8-8" vector-effect="non-scaling-stroke"/></g>
            </svg>
            <img class="gt-avatar" id="gt-avatar" alt="" hidden>
            <div class="gt-count" id="gt-count" aria-hidden="true"></div>
          </div>
          <ol class="gt-stages" id="gt-stages">
            <li data-i="0"><i></i><span data-g="st_browser">${T('st_browser')}</span></li>
            <li data-i="1"><i></i><span data-g="st_approve">${T('st_approve')}</span></li>
            <li data-i="2"><i></i><span data-g="st_verify">${T('st_verify')}</span></li>
            <li data-i="3"><i></i><span data-g="st_unlocked">${T('st_unlocked')}</span></li>
          </ol>
          <div class="gt-status" id="gt-status" role="status" aria-live="polite"></div>
          <div class="gt-substatus" id="gt-substatus"></div>
          <div class="gt-actions" id="gt-actions"></div>
        </section>
      </div>
      <div class="gt-ver">${appVer ? 'v' + appVer : ''}</div>`)
    document.body.appendChild(el)

    const $ = id => el.querySelector('#' + id)
    const status = $('gt-status'), substatus = $('gt-substatus'), actions = $('gt-actions'), count = $('gt-count')
    const tickEls = [...el.querySelectorAll('.gt-tick')], arcEls = [...el.querySelectorAll('.gt-arc')], stageEls = [...el.querySelectorAll('#gt-stages li')]
    const avatar = $('gt-avatar')

    let state = mode === 'expired' ? 'expired' : 'idle', reason = '', url = '', deadline = 0
    let run = 0, wake = null, lastLit = -1, closed = false, copied = false, slow = false, slowTimer = null, tickTimer = null, granted = null

    const sleep = ms => new Promise(r => { const t = setTimeout(r, ms); wake = () => { clearTimeout(t); r() } })

    // ── render: one function paints the whole screen from (state, reason, url) ──
    function setState(s, extra) { state = s; if (extra && 'reason' in extra) reason = extra.reason; render() }

    function lightTicks() {
      const waiting = state === 'waiting' || state === 'browserFailed'
      const lit = waiting ? P.ticksLeft(deadline, Date.now()) : (state === 'timeout' ? 0 : P.TICKS)
      if (lit === lastLit) return
      lastLit = lit
      tickEls.forEach((t, i) => t.classList.toggle('is-off', i >= lit))
      count.textContent = waiting ? T('left', { n: lit > 0 ? Math.ceil(lit) : 0 }) : ''
    }

    function btn(act, label, kind, icon) {
      return `<button type="button" class="j-btn ${kind === 'primary' ? 'j-btn-primary gt-cta' : kind === 'ghost' ? 'j-btn-ghost' : 'j-btn-secondary'}" data-act="${act}">${icon ? `<i class="${icon}" aria-hidden="true"></i> ` : ''}${esc(label)}</button>`
    }

    function actionsFor() {
      const out = []
      const primary = P.primaryAction(state, reason)
      if (primary === 'link') out.push(btn('start', T('b_link'), 'primary', 'fab fa-discord'))
      if (primary === 'again') out.push(btn('start', T('b_again'), 'primary', 'fa fa-rotate-right'))
      if (primary === 'join') out.push(btn('join', T('b_join'), 'primary', 'fab fa-discord'), btn('start', T('b_joined'), 'secondary'))
      if (primary === 'reopen') out.push(btn('reopen', T('b_reopen'), 'primary', 'fa fa-arrow-up-right-from-square'), btn('copy', copied ? T('b_copied') : T('b_copy'), 'secondary', 'fa fa-copy'))
      if (state === 'waiting' && slow && url) out.push(btn('reopen', T('b_reopen'), 'secondary', 'fa fa-arrow-up-right-from-square'), btn('copy', copied ? T('b_copied') : T('b_copy'), 'secondary', 'fa fa-copy'))
      if (state === 'opening' || state === 'waiting' || state === 'browserFailed') out.push(btn('cancel', T('b_cancel'), 'ghost'))
      if (['idle', 'expired', 'noSession', 'timeout', 'offline', 'denied'].includes(state)) out.push(`<div class="gt-saved">${esc(T('hasAccess'))} <button type="button" class="j-link" data-act="saved">${esc(T('b_saved'))}</button></div>`)
      return out.join('')
    }

    function render() {
      if (closed) return
      el.dataset.state = state
      const key = state === 'denied' ? 'd_' + P.reasonKey(reason) : state === 'granted' ? 'g_welcome' : 's_' + state
      status.textContent = state === 'granted' ? P.welcomeLine(T('g_welcome'), granted && granted.profile) : T(key)
      status.classList.toggle('is-bad', state === 'denied' || state === 'offline' || state === 'timeout')
      substatus.textContent = state === 'granted' ? T(granted && granted.isPremium ? 'g_premium' : 'g_free') : ''
      const n = P.stageOf(state)
      arcEls.forEach((a, i) => { a.classList.toggle('is-on', i < n); a.classList.toggle('is-live', i === n - 1 && state !== 'granted') })
      stageEls.forEach((s, i) => { s.classList.toggle('is-on', i < n); s.classList.toggle('is-live', i === n - 1 && state !== 'granted') })
      const prevActs = actions.dataset.sig
      const html2 = actionsFor()
      if (prevActs !== html2) { actions.innerHTML = html2; actions.dataset.sig = html2; const first = actions.querySelector('.gt-cta, [data-act]'); if (first && state !== 'granted') first.focus({ preventScroll: true }) }
      lastLit = -1; lightTicks()
      clearInterval(tickTimer); tickTimer = null
      if (state === 'waiting' || state === 'browserFailed') tickTimer = setInterval(lightTicks, 250)
    }

    // ── sign-in run ──
    function cancelRun() { run++; if (wake) wake(); clearTimeout(slowTimer); slow = false }

    async function start() {
      cancelRun(); const token = run
      copied = false; url = ''
      setState('opening')
      let r
      try { r = await api.authStart() } catch (e) { if (token === run) setState(P.isOffline(e) ? 'offline' : 'offline'); return }
      if (token !== run) return
      if (!r || !r.ok) { setState('offline'); return }
      url = r.url || ''
      deadline = Date.now() + P.WINDOW_MS
      slow = false; clearTimeout(slowTimer)
      slowTimer = setTimeout(() => { slow = true; if (state === 'waiting') render() }, 4000)
      setState(r.browserFailed ? 'browserFailed' : 'waiting')
      pollLoop(token, r.state)
    }

    async function pollLoop(token, authState) {
      let fails = 0
      while (token === run && !closed) {
        if (Date.now() >= deadline) { setState('timeout'); return }
        let p = null
        try { p = await api.authPoll(authState); fails = 0 } catch { fails++ }
        if (token !== run || closed) return
        if (p && p.status === 'ok') { grant(p); return }
        if (p && p.status === 'denied') { setState('denied', { reason: p.reason || '' }); return }
        if (fails >= 3) { setState('offline'); return }
        await sleep(P.POLL_MS)
      }
    }

    async function checkSaved() {
      cancelRun(); const token = run
      setState('checking')
      let r = null, failed = null
      try { r = await api.authVerify() } catch (e) { failed = e }
      if (token !== run) return
      if (r && r.ok) { grant({ isPremium: r.isPremium === true, profile: r.profile, discordUserId: r.discordUserId }); return }
      setState(failed && P.isOffline(failed) ? 'offline' : 'noSession')
    }

    function grant(p) {
      cancelRun()
      granted = { isPremium: p.isPremium === true, profile: p.profile || null }
      if (p.discordUserId) { try { settings.discordUserId = p.discordUserId } catch {} }
      const uid = p.discordUserId || (typeof settings !== 'undefined' && settings.discordUserId)
      avatar.hidden = false
      avatar.onerror = () => { avatar.onerror = () => { avatar.hidden = true }; avatar.src = P.avatarUrl(uid, null) }   // own picture failed to load: Discord's default one, then nothing
      avatar.src = P.avatarUrl(uid, p.profile)
      setState('granted')
      el.classList.add('gt-granted')
      setTimeout(reveal, 1500)
    }

    function reveal() {
      if (closed) return
      const d = $('gt-dial').getBoundingClientRect()
      el.style.setProperty('--gt-cx', Math.round(d.left + d.width / 2) + 'px')
      el.style.setProperty('--gt-cy', Math.round(d.top + d.height / 2) + 'px')
      el.classList.add('gt-open')
      let done = false
      const finish = () => { if (done) return; done = true; close() }
      el.addEventListener('animationend', e => { if (e.target === el) finish() })
      setTimeout(finish, 900)
      try { onUnlock && onUnlock(granted && granted.isPremium === true) } catch (e) { try { api.startupTrace?.('gate onUnlock threw: ' + (e && e.message)) } catch {} }
    }

    // ── events ──
    async function copyLink() {
      if (!url) return
      try { await navigator.clipboard.writeText(url); copied = true; render(); setTimeout(() => { copied = false; if (!closed) render() }, 1600) } catch {}
    }

    el.addEventListener('click', e => {
      const w = e.target.closest('[data-win]')
      if (w) { w.dataset.win === 'min' ? api.minimize() : api.close(); return }
      const lg = e.target.closest('[data-lang]')
      if (lg) { setLang(lg.dataset.lang); return }
      const b = e.target.closest('[data-act]')
      if (!b) return
      switch (b.dataset.act) {
        case 'start': start(); break
        case 'cancel': cancelRun(); setState(mode === 'expired' ? 'expired' : 'idle'); break
        case 'join': try { api.openExternal(INVITE) } catch {} break
        case 'reopen': if (url) { try { api.openExternal(url) } catch {} } break
        case 'copy': copyLink(); break
        case 'saved': checkSaved(); break
      }
    })

    function onKey(e) {
      if (e.key === 'Escape' && (state === 'opening' || state === 'waiting' || state === 'browserFailed')) { e.preventDefault(); cancelRun(); setState(mode === 'expired' ? 'expired' : 'idle') }
      else if (e.key === 'Enter' && !e.target.closest('button, a') && actions.querySelector('.gt-cta')) { e.preventDefault(); actions.querySelector('.gt-cta').click() }
    }
    const onFocus = () => { if (wake && (state === 'waiting' || state === 'browserFailed')) wake() }
    const onVis = () => { el.classList.toggle('is-hidden', document.hidden); if (!document.hidden) onFocus() }
    const onOnline = () => { if (state === 'offline') start() }
    document.addEventListener('keydown', onKey)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', onOnline)

    function setLang(lang) {
      if (lang === currentLang) return
      currentLang = lang
      try { settings.language = lang; document.documentElement.lang = lang; api.saveSettings(settings).catch(() => {}) } catch {}
      relang()
    }
    function relang() {
      el.querySelectorAll('[data-g]').forEach(n => { n.textContent = T(n.dataset.g) })
      el.querySelectorAll('[data-gl]').forEach(n => { n.setAttribute(n.dataset.glAttr || 'aria-label', T(n.dataset.gl)) })
      el.querySelectorAll('.gt-lang-btn').forEach(b => { b.classList.toggle('is-on', b.dataset.lang === currentLang); b.setAttribute('aria-pressed', String(b.dataset.lang === currentLang)) })
      actions.dataset.sig = ''
      render()
    }

    function close() {
      if (closed) return
      closed = true; run++
      clearInterval(tickTimer); clearTimeout(slowTimer)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('online', onOnline)
      el.remove()
    }

    relang()
    requestAnimationFrame(() => el.classList.add('gt-in'))
    el.__gate = { close, start, state: () => state }
    return el
  }

  root.JylliGate = { show }
})(typeof globalThis !== 'undefined' ? globalThis : this)
