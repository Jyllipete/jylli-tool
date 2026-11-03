'use strict'
// Concierge on Home: the "Your first moves" card and the per-tab hint. js/concierge.js ranks; this file applies moves through the existing
// flows (showPage, applyTweakBatch, runAutoOpti). State: settings.concierge = { moves: [snapshot…], done: [ids], dismissed: [ids], hidden, hinted: [ids] }.
// Moves are stored as snapshots so a move that is done (and so no longer recommended) still shows as done.

function conciergeCardShown() {
  const cg = settings.concierge
  return !!(cg && !cg.hidden && cg.moves && cg.moves.length)
}

function conciergeMoveText(m, key) { return tG('concierge', m[key], m.vars) }

function conciergeCardHtml() {
  const { html } = ui
  const cg = settings.concierge
  const resume = settings.arrival && settings.arrival.deferred && !settings.arrival.completedAt
  if (!conciergeCardShown() && !resume) return ''
  let body = ''
  if (resume) body += html`<div class="j-row"><div class="j-row-main"><div class="j-row-title">${tG('arrival', 'resumeCard')}</div></div><div class="j-row-control">${ui.button({ label: tG('arrival', 'begin'), size: 'sm', variant: 'primary', onclick: 'startOnboarding()' })}</div></div>`
  let n = 0, done = 0
  if (conciergeCardShown()) {
    const rows = cg.moves.filter(m => !(cg.dismissed || []).includes(m.id)).map(m => {
      const isDone = JylliConcierge.isDone(m, settings)
      n++; if (isDone) done++
      const actions = isDone ? ui.badge(tG('concierge', 'markDone'), 'ok')
        : html`${ui.button({ label: tG('concierge', 'doThis'), size: 'sm', variant: 'primary', onclick: `conciergeDo('${m.id}')` })}${ui.button({ label: tG('concierge', 'markDone'), size: 'sm', variant: 'ghost', onclick: `conciergeMark('${m.id}','done')` })}${ui.button({ label: tG('concierge', 'notForMe'), size: 'sm', variant: 'ghost', onclick: `conciergeMark('${m.id}','dismissed')` })}`
      return html`<div class="j-row"><div class="j-row-main"><div class="j-row-title">${conciergeMoveText(m, 'titleKey')}</div><div class="j-row-sub j-muted">${conciergeMoveText(m, 'whyKey')}</div></div><div class="j-row-control j-hstack">${actions}</div></div>`
    })
    body += rows.join('')
  }
  const sub = n ? tG('concierge', 'cardProgress', { done, n }) : ''
  const meter = n ? ui.meter(Math.round(done / n * 100), 'accent') : ''
  return html`<section class="j-card" id="concierge-card" data-tour="home-moves"><header class="j-card-head"><div class="j-card-titles"><h3 class="j-card-title">${tG('concierge', 'cardTitle')}</h3><div class="j-card-sub j-muted">${sub}</div></div>${ui.button({ iconOnly: true, icon: 'xmark', variant: 'ghost', size: 'sm', title: tG('concierge', 'dismiss'), onclick: 'conciergeHide()' })}</header><div class="j-card-body">${meter}${ui.raw(body)}</div></section>`
}

function conciergeRefresh() {
  const el = document.getElementById('concierge-card')
  if (!el) return
  const h = String(conciergeCardHtml())
  if (h) el.outerHTML = h; else el.remove()
}

function conciergeSave() { settings.concierge = settings.concierge || { moves: [], done: [], dismissed: [] }; api.saveSettings(settings) }

/** Store ranked moves as the user's first moves (called by Arrival). */
function conciergeAdopt(moves) {
  settings.concierge = { moves: (moves || []).map(m => ({ id: m.id, tab: m.tab, titleKey: m.titleKey, whyKey: m.whyKey, vars: m.vars, impact: m.impact, risk: m.risk, minutes: m.minutes, reversible: m.reversible, action: m.action })), done: [], dismissed: [], hinted: [] }
  api.saveSettings(settings)
}

function conciergeMark(id, how) {
  conciergeSave()
  const list = settings.concierge[how] = settings.concierge[how] || []
  if (!list.includes(id)) list.push(id)
  api.saveSettings(settings)
  conciergeRefresh()
}

function conciergeHide() { conciergeSave(); settings.concierge.hidden = true; api.saveSettings(settings); conciergeRefresh() }

async function conciergeDo(id) {
  const m = ((settings.concierge || {}).moves || []).find(x => x.id === id)
  if (!m) return
  const a = m.action
  if (a.type === 'tab') return showPage(a.page, a.tab)
  if (a.type === 'autoOpti') { if (a.useCase) settings.aom_use_case = a.useCase; return runAutoOpti() }
  if (a.type === 'batch') {
    const ok = await showConfirm({ title: conciergeMoveText(m, 'titleKey'), body: tG('concierge', 'confirmBatch', { n: a.ids.length }), okText: tG('concierge', 'doThis'), okStyle: 'primary', icon: 'fa-circle-check' })
    if (!ok) return
    await applyTweakBatch(a.ids, 'apply')
    conciergeMark(id, 'done')
  }
}

/** Gather everything the ranking needs from the app's existing state. */
async function conciergeInput() {
  const [games, startupItems] = await Promise.all([api.detectGames().catch(() => []), api.getStartupItems().catch(() => [])])
  let pf = {}; try { pf = JSON.parse(localStorage.getItem('pf_tweak_states') || '{}') } catch {}
  const hc = localStorage.getItem('health_check_ok')
  const ss = parseInt(localStorage.getItem('pf_safety_score') || '', 10)
  const profile = (settings.arrival && settings.arrival.profile) || { useCase: settings.aom_use_case || 'mix', priorities: [], comfort: 'balanced' }
  return {
    sysInfo, profile, pfStates: pf, safetyScore: isNaN(ss) ? null : ss, osType: localStorage.getItem('pf_os_type') || '',
    health: { checked: hc !== null, ok: hc === '1', restorePoint: settings.arrival && settings.arrival.restorePoint },
    games: Array.isArray(games) ? games : (games && games.games) || [], startupItems: Array.isArray(startupItems) ? startupItems : [],
    isPremium: !!settings.isPremium, settings,
  }
}

async function conciergeCompute() {
  const input = await conciergeInput()
  let plan = []
  try { plan = (await api.buildRunPlan({ runMode: input.profile.runMode || 'smart', sysInfo })).plan || [] } catch {}
  return JylliConcierge.recommend(input, { tier: pcTier(), plan, meta: window._tweakMeta, conflicts: TWEAK_CONFLICTS, startupRecommended: STARTUP_RECOMMENDED_DISABLE })
}

/** One "Recommended for you" callout at the top of a tab, once: after its tour ends, or on first visit when tours are off. */
async function conciergeHint(route, c, token) {
  const cg = settings.concierge
  if (!cg || cg.hidden || !(cg.moves || []).length || route.tab === 'home') return
  const m = JylliConcierge.hintFor(route.tab, cg.moves, settings)
  if (!m || (cg.hinted || []).includes(m.id)) return
  const show = () => {
    if (window._navToken !== token || !c.isConnected || c.querySelector('#concierge-hint')) return
    cg.hinted = (cg.hinted || []).concat(m.id); api.saveSettings(settings)
    c.insertAdjacentHTML('afterbegin', String(ui.html`<div id="concierge-hint">${ui.callout(ui.html`<b>${tG('concierge', 'hintTitle')}</b> ${conciergeMoveText(m, 'titleKey')}. ${conciergeMoveText(m, 'whyKey')}`, 'info', 'wand-magic-sparkles')}</div>`))
  }
  if (JylliTour.due(route, c)) {
    const key = JylliTour.keyFor(route, c)
    const onEnd = e => { if (e.detail.key === key) { document.removeEventListener('jylli:tour-end', onEnd); setTimeout(show, 200) } }
    document.addEventListener('jylli:tour-end', onEnd)
    setTimeout(() => document.removeEventListener('jylli:tour-end', onEnd), 120000)
  } else show()
}
