// Secondary windows (Pulse, FiveM/Arma/FPS HUD settings): apply the accent colour chosen in the main window.
// Surfaces come from css/tokens.css; themes only change the accent (keep in sync with THEMES in index.html).
(function () {
  const ACCENTS = { jylli: '#8B7CF6', midnight: '#3B82F6', forest: '#22C55E', violet: '#9B59FF', slate: '#06B6D4', amber: '#F59E0B', rose: '#FB7185', neon: '#22D3EE' }
  function apply(hex) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
    const s = document.documentElement.style
    const set = (k, v) => s.setProperty(k, v)
    set('--pink', hex); set('--pink-rgb', `${r},${g},${b}`)
    set('--pink-dim', `rgba(${r},${g},${b},0.18)`); set('--pink-glow', `rgba(${r},${g},${b},0.35)`)
    set('--c-accent', hex); set('--c-accent-rgb', `${r},${g},${b}`)
    set('--c-accent-muted', `rgba(${r},${g},${b},0.18)`); set('--c-accent-ring', `rgba(${r},${g},${b},0.22)`)
    set('--c-accent-glow', `rgba(${r},${g},${b},0.35)`)
    set('--cyan', hex); set('--cyan-rgb', `${r},${g},${b}`)
  }
  async function init() {
    try {
      const st = await window.api.getSettings()
      apply(st?.accentColor || ACCENTS[st?.theme] || ACCENTS.jylli)
    } catch { /* bridge unavailable: tokens.css defaults apply */ }
  }
  init()
})()
