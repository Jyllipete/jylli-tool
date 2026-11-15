'use strict'
// Gaming > Pulse. The tab itself is Pulse (js/pulse/page.js); this file keeps the premium gate. The Rules view is the game automation
// panel (js/gameauto): Game Watcher, Update Guard, Game Shield and Auto-Pulse.
async function buildPulse(c) {
  if (!settings.isPremium) { await JylliPremium.build(c, 'pulse'); return }
  JylliPulsePage.mount(c)
}
