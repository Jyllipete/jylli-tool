// Single source for the accent colour, shared by the main window and every secondary window.
// Themes only change the accent: surfaces come from css/tokens.css. Muted/ring/glow tints derive from --c-accent-rgb there.
// Secondary windows apply the saved accent on load; the main window sets <html data-theme-sync="manual"> and calls JylliTheme.applyAccent itself.
(function () {
  const ACCENTS = { jylli: '#8B7CF6', midnight: '#3B82F6', forest: '#22C55E', violet: '#9B59FF', slate: '#06B6D4', amber: '#F59E0B', rose: '#FB7185', neon: '#22D3EE' }
  function applyAccent(hex) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return false
    const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(',')
    const s = document.documentElement.style
    s.setProperty('--c-accent', hex)
    s.setProperty('--c-accent-rgb', rgb)
    // Legacy aliases still read by canvas/legacy code until style.css is removed.
    s.setProperty('--pink-rgb', rgb)
    s.setProperty('--cyan-rgb', rgb)
    return true
  }
  // Colour scheme: pref is 'dark' (default), 'light' or 'system' (follows the OS). Sets <html data-scheme> which css/tokens.css reads.
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null
  let pref = 'dark'
  function resolveScheme() { return pref === 'light' || (pref === 'system' && mq && mq.matches) ? 'light' : 'dark' }
  function applyScheme(p) {
    pref = p === 'light' || p === 'system' ? p : 'dark'
    const s = resolveScheme()
    document.documentElement.dataset.scheme = s
    window.dispatchEvent(new CustomEvent('jylli-scheme', { detail: { scheme: s, pref } }))
    return s
  }
  if (mq) mq.addEventListener('change', () => { if (pref === 'system') applyScheme('system') })
  window.JylliTheme = { ACCENTS, applyAccent, applyScheme, scheme: () => resolveScheme() }

  // Canvas/SVG code reads token values at draw time through this
  window.cssVar = (name, fallback) => (getComputedStyle(document.documentElement).getPropertyValue(name) || '').trim() || fallback || ''

  async function init() {
    const q = new URLSearchParams(location.search)
    // Game overlays (fps-hud, fivem-hud) sit on top of games and stay dark: they opt out with data-scheme-lock
    if (!document.documentElement.hasAttribute('data-scheme-lock')) applyScheme(q.get('scheme') || 'dark')
    if (document.documentElement.dataset.themeSync === 'manual') return
    // Main passes ?accent=/?theme= in the window URL, which also covers windows whose preload has no getSettings
    if (applyAccent(q.get('accent')) || applyAccent(ACCENTS[q.get('theme')])) return
    try {
      const st = await window.api.getSettings()
      applyAccent(st?.accentColor || ACCENTS[st?.theme] || ACCENTS.jylli)
      if (!q.get('scheme') && !document.documentElement.hasAttribute('data-scheme-lock')) applyScheme(st?.colorScheme)
    } catch { /* bridge unavailable: tokens.css defaults apply */ }
  }
  init()
})()
