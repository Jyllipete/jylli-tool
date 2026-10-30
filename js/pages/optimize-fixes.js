'use strict'
// Optimize > Fixes: one dense list per category. Element ids/classes used by runFix() and _fixBadgeRecommended() are kept:
// #fix-search-input, #fix-card-<id>, .fix-card, .fix-badge-slot, .fix-applied-badge, .fix-rec-badge, #fix-btn-<id>, .fix-run-btn.
async function buildFixes(c) {
  const { html, raw } = ui
  const settings = await api.loadSettings().catch(() => ({}))
  const CATS = [
    { key: 'gaming', label: tUI('fixCatGaming'), icon: 'gamepad' },
    { key: 'hardware', label: tUI('fixCatHardware'), icon: 'microchip' },
    { key: 'system', label: tUI('fixCatSystem'), icon: 'gear' },
  ]

  const row = fix => {
    const applied = settings[`fix_${fix.id}`] === 'applied'
    const name = LANG[currentLang]?.fixNames?.[fix.id] || fix.name
    const desc = tFixDesc(fix.id) || fix.desc
    return html`<div class="j-row fix-card" id="fix-card-${fix.id}" data-name="${name.toLowerCase()}" data-desc="${desc.toLowerCase()}" data-cat="${fix.category}">
      <div class="j-fix-ico" aria-hidden="true">${raw(fix.icon)}</div>
      <div class="j-row-main">
        <div class="j-row-title"><span>${name}</span><span class="j-row-badges fix-badge-slot">${applied ? html`<span class="j-badge j-badge-ok fix-applied-badge">✓ ${tUI('fixApplied')}</span>` : ''}</span></div>
        <div class="j-row-sub j-fix-desc" title="${desc}">${desc}</div>
      </div>
      <div class="j-row-control">${raw(String(ui.button({ label: tUI('runFix'), variant: applied ? 'ghost' : 'secondary', size: 'sm', id: `fix-btn-${fix.id}`, onclick: `runFix('${fix.id}',this)` })).replace('class="j-btn', 'class="fix-run-btn j-btn'))}</div>
    </div>`
  }

  c.innerHTML = String(html`
    <p class="j-lede">${tUI('fixesHero')}</p>
    <div class="j-toolbar"><label class="j-search"><i class="fa fa-magnifying-glass" aria-hidden="true"></i><input id="fix-search-input" class="j-input" type="text" placeholder="${tUI('fixSearchPlaceholder')}" aria-label="${tUI('fixSearchPlaceholder')}"></label></div>
    ${CATS.map(cat => html`<section class="fix-cat-section fix-cat-${cat.key}">
      <div class="j-group-label fix-cat-header fix-cat-header-${cat.key}"><i class="fa fa-${cat.icon}" aria-hidden="true"></i><span>${cat.label}</span></div>
      <div class="j-group-rows fix-grid fix-grid-${cat.key}">${FIXES_DEFS.filter(f => f.category === cat.key).map(row)}</div>
    </section>`)}
    <div id="fix-empty" class="j-hidden">${ui.empty({ icon: 'magnifying-glass', title: tUI('fixNoResults'), sub: tUI('fixNoResultsSub') })}</div>`)

  document.getElementById('fix-search-input')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase().trim()
    let total = 0
    c.querySelectorAll('.fix-cat-section').forEach(section => {
      let any = false
      section.querySelectorAll('.fix-card').forEach(card => {
        const match = !q || card.dataset.name.includes(q) || card.dataset.desc.includes(q)
        card.hidden = !match
        if (match) any = true
      })
      section.hidden = !any
      if (any) total++
    })
    document.getElementById('fix-empty')?.classList.toggle('j-hidden', total > 0)
  })

  // LG G HUB warning (async)
  api.checkLghub?.().then(r => {
    if (!r?.present) return
    const toolbar = c.querySelector('.j-toolbar')
    if (toolbar) toolbar.insertAdjacentHTML('afterend', String(html`<div class="j-callout j-callout-danger" role="alert"><i class="fa fa-triangle-exclamation" aria-hidden="true"></i><div><b>${tUI('fixLghubTitle')}</b> — ${tUI('fixLghubDesc')}</div></div>`))
  }).catch(() => {})

  _fixBadgeRecommended(settings)
}
