'use strict'
// Home: installed games as cover cards (Steam covers come from Steam's own cache on this PC, nothing is downloaded; other games
// fall back to the executable's icon, and last to a generated card). Click opens the Games tab.
async function buildGameCarousel(parent) {
  const { html } = ui
  const sec = document.createElement('section')
  sec.id = 'home-games'
  sec.className = 'j-home-games'
  sec.hidden = true
  sec.innerHTML = String(html`<div class="j-stat-label j-home-label">${tUI('homeGamesTitle')}</div><ul class="j-game-row" id="game-row" aria-label="${tUI('homeGamesTitle')}"></ul>`)
  parent.appendChild(sec)
  let res = null
  try { res = await api.getGamesRegistry() } catch {}
  const games = res && res.ok && Array.isArray(res.games) ? res.games.slice(0, 14) : []
  const row = sec.querySelector('#game-row')
  if (!games.length || !row) return
  sec.hidden = false
  row.innerHTML = games.map(g => {
    const hue = [...g.id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 360, 7)
    return `<li><button type="button" class="j-game-card" data-game="${escAttr(g.id)}" title="${escAttr(g.name)}" style="--gh:${hue}"><span class="j-game-fallback" aria-hidden="true">${escHtml((g.name.match(/[A-Za-z0-9]/) || ['?'])[0])}</span><span class="j-game-name">${escHtml(g.name)}</span></button></li>`
  }).join('')
  row.querySelectorAll('[data-game]').forEach(b => { b.onclick = () => showPage('game-opti') })
  for (const g of games) {   // covers arrive one by one, so the row never waits on image decoding
    api.getGameCover(g.id).then(url => {
      if (!url) return
      const btn = row.querySelector(`[data-game="${CSS.escape(g.id)}"]`)
      if (btn) { btn.style.backgroundImage = `url("${url}")`; btn.classList.add('has-cover') }
    }).catch(() => {})
  }
}
