'use strict'

// ─── Auth Lock Screen ─────────────────────────────────────────────────────────
// The screen itself is js/gate/view.js (JylliGate); this only says what happens once a session is verified.
function showLockScreen() {
  JylliGate.show({ mode: window._inited ? 'expired' : 'idle', onUnlock: isPremium => init(isPremium === true) })
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
