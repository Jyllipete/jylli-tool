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
    <div class="tk-hero" id="fix-hero-host"></div>
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

  await _fixBadgeRecommended(settings)

  // ── Hero: how many fixes are applied, by category, plus the fixes recommended for this PC ──
  const T = (k, v) => tG('fixHero', k, v)
  const tracked = FIXES_DEFS.filter(f => f.id !== 'fix-fullscreen-flicker')   // that one only minimises the app, it is never "applied"
  const isApplied = f => settings['fix_' + f.id] === 'applied' || !!document.querySelector('#fix-card-' + f.id + ' .fix-applied-badge')
  const hero = JylliHero.mount(c.querySelector('#fix-hero-host'), {
    id: 'fixes-hero', eyebrow: '', title: T('title'), lead: tUI('fixesHero'), dial: { label: T('dial') },
    stats: [{ k: 'applied', label: T('statApplied') }, { k: 'rec', label: T('statRec') }],
    cta: { id: 'fixes-show-rec', icon: 'star', label: T('cta'), onClick: () => goto('#fix-rec-section') },
    onLedger: key => goto('.fix-cat-' + key),
  })
  function goto(sel) {
    const el = c.querySelector(sel); if (!el) return
    el.scrollIntoView({ behavior: document.documentElement.classList.contains('motion-reduced') ? 'auto' : 'smooth', block: 'start' })
    el.classList.remove('jh-flash'); void el.offsetWidth; el.classList.add('jh-flash'); setTimeout(() => el.classList.remove('jh-flash'), 1400)
  }

  // "Recommended for this PC": the rows move (ids stay unique, runFix keeps finding them) into one section at the top
  const recCards = [...c.querySelectorAll('.fix-card')].filter(el => el.querySelector('.fix-rec-badge') && !el.querySelector('.fix-applied-badge'))
  if (recCards.length) {
    const sec = document.createElement('section')
    sec.className = 'fix-cat-section fix-cat-rec'; sec.id = 'fix-rec-section'
    sec.innerHTML = String(html`<div class="j-group-label fix-cat-header"><i class="fa fa-star" aria-hidden="true"></i><span>${T('recTitle')}</span></div><div class="j-group-rows fix-grid fix-grid-rec"></div>`)
    const rows = sec.querySelector('.fix-grid-rec')
    recCards.forEach(el => rows.appendChild(el))
    const first = c.querySelector('.fix-cat-section')
    first.parentNode.insertBefore(sec, first)
  }

  function refreshHero() {
    const applied = tracked.filter(isApplied).length
    const open = [...c.querySelectorAll('.fix-card')].filter(el => el.querySelector('.fix-rec-badge') && !el.querySelector('.fix-applied-badge')).length
    hero.update({
      pct: tracked.length ? Math.round(applied / tracked.length * 100) : null, tone: 'accent',
      eyebrow: T('eyebrow', { a: applied, n: tracked.length }),
      ledger: CATS.map(cat => { const list = tracked.filter(f => f.category === cat.key); return { id: cat.key, label: cat.label, n: list.filter(isApplied).length, total: list.length } }).filter(r => r.total > 0),
      stats: { applied, rec: open },
      cta: { hidden: open === 0, badge: open },
    })
  }
  window._fixesRefresh = refreshHero
  refreshHero()
  registerPageCleanup('fixes', () => { window._fixesRefresh = null; hero.destroy() })
}
