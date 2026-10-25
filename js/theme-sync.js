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
  window.JylliTheme = { ACCENTS, applyAccent }

  async function init() {
    if (document.documentElement.dataset.themeSync === 'manual') return
    // Main passes ?accent=/?theme= in the window URL, which also covers windows whose preload has no getSettings
    const q = new URLSearchParams(location.search)
    if (applyAccent(q.get('accent')) || applyAccent(ACCENTS[q.get('theme')])) return
    try {
      const st = await window.api.getSettings()
      applyAccent(st?.accentColor || ACCENTS[st?.theme] || ACCENTS.jylli)
    } catch { /* bridge unavailable: tokens.css defaults apply */ }
  }
  init()
})()
