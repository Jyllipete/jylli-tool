'use strict'

// ─── Auth Lock Screen ─────────────────────────────────────────────────────────
function showLockScreen(deniedMsg) {
  const el = document.createElement('div')
  el.id = 'lock-screen'
  el.className = 'j-lockscreen'
  const appVer = typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''
  const { html } = ui
  const point = (ic, key) => html`<li><i class="fa fa-${ic}" aria-hidden="true"></i>${tUI(key)}</li>`
  el.innerHTML = String(html`
    <div class="j-lock-wrap">
      <div class="j-lock-mark"><i class="fa fa-bolt" aria-hidden="true"></i></div>
      <div class="j-lock-brand">Jylli Tool</div>
      <p class="j-lock-lead">${tUI('lsSubtitle')}</p>
      <ul class="j-lock-points">${point('gauge-high', 'lsPoint1')}${point('shield-halved', 'lsPoint2')}${point('rotate-left', 'lsPoint3')}</ul>

      <div class="j-lock-card" id="lock-card">
        <div class="j-lock-row" id="lock-row-idle">
          <button class="j-btn j-btn-primary j-lock-cta" id="lock-link-btn" type="button"><i class="fab fa-discord" aria-hidden="true"></i> ${tUI('lsLinkBtn')}</button>
        </div>
        <div class="j-lock-row j-lock-auth" id="lock-row-auth" hidden>
          <i class="fa fa-rotate fa-spin j-lock-spin" id="lock-spinner-icon" aria-hidden="true"></i>
          <div class="j-lock-auth-text">
            <div id="lock-status" class="j-lock-status"></div>
            <div id="lock-denied-hint" class="j-lock-hint" hidden></div>
          </div>
          <button class="j-btn j-btn-ghost j-btn-sm" id="lock-cancel-btn" type="button" hidden>${tUI('lsCancel')}</button>
        </div>
      </div>

      <div class="j-lock-foot">
        <div id="lock-manual-url" hidden>${tUI('lsBrowserFallback')} <a id="lock-open-url" href="#">${tUI('lsClickHere')}</a></div>
        <div>${tUI('lsAlreadyHave')} <button class="j-link" id="lock-retry" type="button">${tUI('lsRetry')}</button></div>
        <div class="j-lock-ver">${appVer ? 'v' + appVer : ''}</div>
      </div>
    </div>`)
  document.body.appendChild(el)
  requestAnimationFrame(() => { el.classList.add('j-lockscreen-in') })

  const rowIdle = document.getElementById('lock-row-idle')
  const rowAuth = document.getElementById('lock-row-auth')

  const btn       = document.getElementById('lock-link-btn')
  const cancelBtn = document.getElementById('lock-cancel-btn')
  const status    = document.getElementById('lock-status')
  const retry     = document.getElementById('lock-retry')
  let pollTimer     = null
  let countdownTimer = null

  function showAuthRow() {
    rowIdle.classList.add('j-lock-dim')
    rowAuth.hidden = false
    rowAuth.classList.remove('j-lock-auth-in')
    void rowAuth.offsetWidth
    rowAuth.classList.add('j-lock-auth-in')
  }

  function hideAuthRow() {
    rowIdle.classList.remove('j-lock-dim')
    rowAuth.hidden = true
    status.textContent = ''; status.classList.remove('j-lock-status-danger')
    document.getElementById('lock-denied-hint').hidden = true
    cancelBtn.hidden = true
  }

  function resetToIdle() {
    clearInterval(pollTimer); clearInterval(countdownTimer)
    pollTimer = null; countdownTimer = null
    btn.disabled = false
    btn.innerHTML = `<i class="fab fa-discord" aria-hidden="true"></i> ${tUI('lsLinkBtn')}`
    document.getElementById('lock-manual-url').hidden = true
    hideAuthRow()
  }

  cancelBtn.addEventListener('click', resetToIdle)

  async function startAuth() {
    btn.disabled = true
    status.textContent = tUI('lsOpeningBrowser')
    status.classList.remove('j-lock-status-danger')
    showAuthRow()
    try {
      const r = await api.authStart()
      if (!r?.ok) {
        status.textContent = tUI('lsNoServer')
        resetToIdle()
        return
      }

      const manualDiv  = document.getElementById('lock-manual-url')
      const manualLink = document.getElementById('lock-open-url')
      if (r.url && manualDiv && manualLink) {
        manualLink.onclick = (e) => { e.preventDefault(); api.openExternal(r.url) }
        if (r.browserFailed) {
          manualDiv.hidden = false
          status.textContent = tUI('lsBrowserFailed')
        } else {
          setTimeout(() => { if (document.getElementById('lock-manual-url')) manualDiv.hidden = false }, 4000)
        }
      }

      cancelBtn.hidden = false
      status.textContent = r.browserFailed ? tUI('lsBrowserFailed') : tUI('lsAuthorize')

      let secsLeft = 120
      countdownTimer = setInterval(() => {
        secsLeft--
        if (secsLeft >= 0 && document.getElementById('lock-status'))
          status.textContent = `${tUI('lsWaiting')} (${secsLeft}${tUI('lsSecsLeft')})`
      }, 1000)

      let attempts = 0
      pollTimer = setInterval(async () => {
        attempts++
        if (attempts > 60) {
          clearInterval(pollTimer); clearInterval(countdownTimer)
          status.textContent = tUI('lsTimedOut')
          resetToIdle()
          return
        }
        try {
          const p = await api.authPoll(r.state)
          if (p.status === 'ok') {
            clearInterval(pollTimer); clearInterval(countdownTimer)
            if (p.discordUserId) settings.discordUserId = p.discordUserId
            // Avatar reveal — use Discord's default avatar via userId % 6
            const uid = p.discordUserId || settings.discordUserId
            let avatarIdx = 0
            try { avatarIdx = uid ? Number(BigInt(uid) % 6n) : 0 } catch {}   // a malformed id must not leave the lock screen stuck
            const avatarUrl = `https://cdn.discordapp.com/embed/avatars/${avatarIdx}.png`
            const card = document.getElementById('lock-card')
            if (card) {
              card.innerHTML = `
                <div class="j-lock-row j-lock-granted">
                  <img src="${avatarUrl}" class="j-lock-avatar" alt="">
                  <div class="j-lock-ok">${tUI('lsGranted')}</div>
                </div>`
            }
            setTimeout(() => {
              cancelBtn.removeEventListener('click', resetToIdle)
              btn.removeEventListener('click', startAuth)
              document.getElementById('lock-screen')?.remove()
              init(p.isPremium === true)
            }, 1200)
          } else if (p.status === 'denied') {
            clearInterval(pollTimer); clearInterval(countdownTimer)
            status.classList.add('j-lock-status-danger')
            status.textContent = tUI('lsDenied')
            const hint = document.getElementById('lock-denied-hint')
            if (hint) { hint.textContent = tUI('lsDeniedHint'); hint.hidden = false }
            cancelBtn.hidden = true
            btn.disabled = false
          }
        } catch {}
      }, 2000)
    } catch (e) {
      status.textContent = 'Error: ' + e.message
      resetToIdle()
    }
  }

  btn.addEventListener('click', startAuth)
  retry.addEventListener('click', async () => {
    retry.textContent = tUI('lsChecking')
    const r = await api.authVerify().catch(() => ({ ok: false }))
    if (r.ok) {
      cancelBtn.removeEventListener('click', resetToIdle)
      btn.removeEventListener('click', startAuth)
      document.getElementById('lock-screen')?.remove()
      init(r.isPremium === true)
    }
    else { retry.textContent = tUI('lsRetry') }
  })
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
// Primary gate: main process sends 'auth-required' if token is missing/invalid.
// The renderer starts locked and only unlocks when main says ok.
let _authCleared = false
api.onAuthRequired(() => {
  // Always honour the main process: a session that expires or is revoked while the app is open must lock it again.
  if (!document.getElementById('lock-screen')) showLockScreen()
})

async function _bootAuth() {
  api.startupTrace?.('_bootAuth entered')
  try {
    const authTimeout = new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })), 6000))
    api.startupTrace?.('authVerify invoked')
    const r = await Promise.race([api.authVerify(), authTimeout])
    api.startupTrace?.(`authVerify resolved: ok=${r?.ok} reason=${r?.reason}`)
    if (r?.ok) { _authCleared = true; api.startupTrace?.('calling init()'); init(r?.isPremium === true) } else { api.startupTrace?.('calling showLockScreen()'); showLockScreen() }
  } catch (e) {
    api.startupTrace?.(`_bootAuth catch: code=${e?.code} msg=${e?.message} → calling init()`)
    // Network error or DNS timeout → proceed to app (offline tolerance), use cached tier
    // Only grant cached premium if the settings HMAC is intact (prevents tampered settings bypass)
    const cachedTier = await api.getCachedTier().catch(() => false)
    init(cachedTier === true)
  }
}

async function selectLanguage(lang) {
  currentLang = lang
  settings.language = lang
  await api.saveSettings(settings).catch(() => {})
  document.getElementById('lang-picker').style.display = 'none'
  await _bootAuth()
}

;(async () => {
  api.startupTrace?.('renderer IIFE entered')
  try {
    const s = await api.loadSettings().catch(() => ({}))
    api.startupTrace?.('loadSettings resolved')
    settings = s || {}
    api.startupTrace?.('calling initLanguage()')
    initLanguage()
    api.startupTrace?.('initLanguage done')
    if (!settings.language) {
      api.startupTrace?.('no language — showing picker')
      try {   // the doorstep greets in both languages, by time of day
        const k = JylliArrival.greetingKey(new Date().getHours()), gr = document.getElementById('lang-picker-greeting')
        if (gr) gr.textContent = LANG.en.arrival[k] + ' ' + LANG.fi.arrival[k]
      } catch {}
      document.getElementById('lang-picker').style.display = 'flex'
      return
    }
    api.startupTrace?.(`language="${settings.language}" — calling _bootAuth()`)
    await _bootAuth()
  } catch (e) {
    api.startupTrace?.(`IIFE CRASHED: ${e?.message} @ ${e?.stack?.split('\n')[1]?.trim()}`)
    try { init() } catch {}
  }
})()
