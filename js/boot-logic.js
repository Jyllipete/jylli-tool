'use strict'

// ─── Auth Lock Screen ─────────────────────────────────────────────────────────
function showLockScreen(deniedMsg) {
  const el = document.createElement('div')
  el.id = 'lock-screen'
  el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:var(--c-bg-base);opacity:0;transition:opacity 0.2s'
  const appVer = typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''
  el.innerHTML = `
    <div id="lock-left">
      <div id="lock-left-logo">
        <div style="width:56px;height:56px;background:var(--c-accent-muted);border:1.5px solid var(--c-accent);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:26px;box-shadow:0 0 0 1px var(--c-accent-ring)">⚡</div>
        <div>
          <div style="font-size:20px;font-weight:700;color:var(--c-text-primary);margin-bottom:4px">Jylli Tool</div>
          <div style="font-size:12px;color:var(--c-text-secondary);line-height:1.5;max-width:200px">${tUI('lsSubtitle')}</div>
        </div>
      </div>
      <div id="lock-left-footer">${appVer ? 'v' + appVer : ''}</div>
    </div>

    <div id="lock-right">
      <span class="ls-welcome-pill">${tUI('lsWelcomeTo')}</span>
      <div class="ls-title">Jylli Tool</div>

      <div class="ls-card" id="lock-card">
        <div class="ls-card-row" id="lock-row-idle">
          <div class="ls-icon-circle"><i class="fa-regular fa-user"></i></div>
          <div style="flex:1;font-size:14px;font-weight:600;color:var(--c-text-primary)">${tUI('lsLinkBtn')}</div>
          <button id="lock-link-btn" style="background:var(--c-accent);color:var(--c-bg-base);border:none;border-radius:8px;padding:9px 18px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:7px;transition:filter .15s;white-space:nowrap"
            onmouseenter="if(!this.disabled)this.style.filter='brightness(1.12)'"
            onmouseleave="if(!this.disabled)this.style.filter=''">
            <i class="fab fa-discord"></i> ${tUI('lsLinkBtn')}
          </button>
        </div>
        <div class="ls-card-row ls-card-row-auth" id="lock-row-auth" style="display:none">
          <div class="ls-icon-circle"><i class="fa fa-rotate fa-spin" id="lock-spinner-icon"></i></div>
          <div style="flex:1">
            <div id="lock-status" style="font-size:13px;color:var(--c-text-secondary)"></div>
            <div id="lock-denied-hint" style="display:none;font-size:11px;color:var(--c-text-secondary);margin-top:3px;line-height:1.5"></div>
          </div>
          <button id="lock-cancel-btn" style="display:none;background:transparent;color:var(--c-text-secondary);border:1px solid var(--c-border-default);border-radius:7px;padding:6px 13px;font-size:12px;cursor:pointer;white-space:nowrap;transition:border-color .15s,color .15s"
            onmouseenter="this.style.borderColor='var(--c-border-strong)';this.style.color='var(--c-text-primary)'"
            onmouseleave="this.style.borderColor='var(--c-border-default)';this.style.color='var(--c-text-secondary)'">
            ${tUI('lsCancel')}
          </button>
        </div>
      </div>

      <div class="ls-footer">
        <div id="lock-manual-url" style="display:none;margin-bottom:6px">${tUI('lsBrowserFallback')} <a id="lock-open-url" href="#">${tUI('lsClickHere')}</a></div>
        <div>${tUI('lsAlreadyHave')} <span id="lock-retry">${tUI('lsRetry')}</span></div>
      </div>
    </div>
  `
  document.body.appendChild(el)
  requestAnimationFrame(() => { el.style.opacity = '1' })

  const rowIdle = document.getElementById('lock-row-idle')
  const rowAuth = document.getElementById('lock-row-auth')

  const btn       = document.getElementById('lock-link-btn')
  const cancelBtn = document.getElementById('lock-cancel-btn')
  const status    = document.getElementById('lock-status')
  const retry     = document.getElementById('lock-retry')
  let pollTimer     = null
  let countdownTimer = null

  function showAuthRow() {
    rowIdle.style.opacity = '0.35'
    rowIdle.style.pointerEvents = 'none'
    rowAuth.style.display = 'flex'
    rowAuth.classList.remove('ls-card-row-auth')
    void rowAuth.offsetWidth
    rowAuth.classList.add('ls-card-row-auth')
  }

  function hideAuthRow() {
    rowIdle.style.opacity = ''
    rowIdle.style.pointerEvents = ''
    rowAuth.style.display = 'none'
    status.textContent = ''; status.style.color = ''
    document.getElementById('lock-denied-hint').style.display = 'none'
    cancelBtn.style.display = 'none'
  }

  function resetToIdle() {
    clearInterval(pollTimer); clearInterval(countdownTimer)
    pollTimer = null; countdownTimer = null
    btn.disabled = false
    btn.innerHTML = `<i class="fab fa-discord"></i> ${tUI('lsLinkBtn')}`
    btn.style.background = 'var(--c-accent)'
    document.getElementById('lock-manual-url').style.display = 'none'
    hideAuthRow()
  }

  cancelBtn.addEventListener('click', resetToIdle)

  async function startAuth() {
    btn.disabled = true
    status.textContent = tUI('lsOpeningBrowser')
    status.style.color = ''
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
          manualDiv.style.display = 'block'
          status.textContent = tUI('lsBrowserFailed')
        } else {
          setTimeout(() => { if (document.getElementById('lock-manual-url')) manualDiv.style.display = 'block' }, 4000)
        }
      }

      cancelBtn.style.display = 'flex'
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
            const avatarIdx = uid ? Number(BigInt(uid) % 6n) : 0
            const avatarUrl = `https://cdn.discordapp.com/embed/avatars/${avatarIdx}.png`
            const card = document.getElementById('lock-card')
            if (card) {
              card.innerHTML = `
                <div class="ls-card-row" style="justify-content:center;flex-direction:column;gap:10px;padding:28px 24px;text-align:center">
                  <img src="${avatarUrl}" class="ls-avatar-reveal" style="width:52px;height:52px;border-radius:50%;border:2px solid var(--c-accent);margin:0 auto">
                  <div style="color:var(--success);font-size:13px;font-weight:600">${tUI('lsGranted')}</div>
                </div>`
            }
            setTimeout(() => { document.getElementById('lock-screen')?.remove(); init(p.isPremium === true) }, 1200)
          } else if (p.status === 'denied') {
            clearInterval(pollTimer); clearInterval(countdownTimer)
            status.style.color = 'var(--danger)'
            status.textContent = tUI('lsDenied')
            const hint = document.getElementById('lock-denied-hint')
            if (hint) { hint.textContent = tUI('lsDeniedHint'); hint.style.display = 'block' }
            cancelBtn.style.display = 'none'
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
    retry.style.color = 'var(--c-text-secondary)'
    retry.textContent = tUI('lsChecking')
    const r = await api.authVerify().catch(() => ({ ok: false }))
    if (r.ok) { document.getElementById('lock-screen')?.remove(); init(r.isPremium === true) }
    else { retry.style.color = 'var(--c-accent)'; retry.textContent = tUI('lsRetry') }
  })
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
// Primary gate: main process sends 'auth-required' if token is missing/invalid.
// The renderer starts locked and only unlocks when main says ok.
let _authCleared = false
api.onAuthRequired(() => {
  if (!_authCleared && !document.getElementById('lock-screen')) showLockScreen()
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
    const cached = await api.loadSettings().catch(() => ({}))
    init(cached?.isPremium === true)
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
