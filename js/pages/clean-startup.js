'use strict'
// Clean > Startup. State lives in the three globals below; every change re-renders the list from that state, so there is no DOM surgery.
// Ids/classes other code relies on: #startup-list #startup-search #startup-search-count #startup-search-wrap, .startup-row[data-item].
let _startupItems = []
let _startupBootImpact = {}
let _startupLoaded = false   // true after first successful fetch; prevents re-fetch on tab revisit

const _SU_TIERS = { clean: 'ok', moderate: 'warn', heavy: 'danger' }
const _SU_SRC = () => [
  { key: 'HKCU Registry', label: tUI('startupGroupHkcu') },
  { key: 'HKLM Registry', label: tUI('startupGroupHklm') },
  { key: 'Task Scheduler', label: tUI('startupGroupTasks') },
]
const _suImpactLevel = i => ({ High: 3, Medium: 2 })[i] || 1
const _suImpactLabel = i => ({ High: tUI('startupImpHigh'), Medium: tUI('startupImpMed'), Low: tUI('startupImpLow') })[i] || i
const _suSame = (a, b) => a.Name === b.Name && a.Source === b.Source

function buildStartupManager(c) {
  const { html } = ui
  const body = html`
    <div class="j-su-hero" id="startup-hero" data-tone="ok">
      <div id="startup-hero-ring">${ui.ring(0, '—', 'ok', 84)}</div>
      <div class="j-su-hero-main">
        <div class="j-su-hero-title">${tUI('startupHeroTitle')} <span class="j-badge j-badge-ok" id="startup-hero-tier">—</span></div>
        <div class="j-su-hero-sub" id="startup-hero-sub"></div>
        <div id="startup-hero-meter">${ui.meter(0, 'ok')}</div>
      </div>
      <div class="j-su-hero-actions">
        ${ui.button({ label: tUI('startupRecommended'), icon: 'wand-sparkles', variant: 'primary', onclick: 'applyStartupRecommended()' })}
        ${ui.button({ label: tUI('startupRefresh'), icon: 'arrows-rotate', variant: 'ghost', size: 'sm', onclick: 'loadStartupItems(this)' })}
      </div>
    </div>
    <div class="j-legend">
      <span class="j-legend-label">${tUI('startupLegendImpact')}</span>
      <span class="j-legend-item">${ui.impact(3, tUI('startupImpHigh'))}<span>${tUI('startupLegendHigh')}</span></span>
      <span class="j-legend-item">${ui.impact(2, tUI('startupImpMed'))}<span>${tUI('startupLegendMed')}</span></span>
      <span class="j-legend-item">${ui.impact(1, tUI('startupImpLow'))}<span>${tUI('startupLegendLow')}</span></span>
    </div>
    <div class="j-su-search" id="startup-search-wrap">
      <label class="j-search"><i class="fa fa-magnifying-glass" aria-hidden="true"></i><input class="j-input" id="startup-search" type="search" autocomplete="off" placeholder="${tUI('startupSearchPh')}" aria-label="${tUI('startupSearchPh')}" oninput="startupFilter(this.value)" onkeydown="if(event.key==='Escape'){startupClearSearch()}"></label>
      <span class="j-muted" id="startup-search-count" role="status"></span>
      ${ui.button({ iconOnly: true, icon: 'xmark', variant: 'ghost', size: 'sm', title: tUI('startupClearSearch'), id: 'startup-search-clear', onclick: 'startupClearSearch()' })}
    </div>
    <div id="startup-list" aria-busy="true">${[60, 75, 55, 70, 65].map(w => html`<div class="j-su-skel">${ui.skeleton(28, 28)}<div>${ui.skeleton(w + '%', 12)}${ui.skeleton('35%', 10)}</div></div>`)}</div>`
  c.innerHTML = String(ui.card({ title: tUI('startupTitle'), sub: tUI('startupSub'), body }))
  c.appendChild(makeTip(tUI('startupTip'), 'warning'))
  if (_startupLoaded && _startupItems.length > 0) updateStartupHero(_startupItems)
  loadStartupItems()
}

// Hero score: the share of heavy startup entries that are still switched on.
function updateStartupHero(items) {
  const hero = document.getElementById('startup-hero')
  if (!hero) return
  const total = items.length
  const enabled = items.filter(i => i.Enabled).length
  const highOn = items.filter(i => i.Impact === 'High' && i.Enabled).length
  const medOn = items.filter(i => i.Impact === 'Medium' && i.Enabled).length
  const score = total > 0 ? Math.max(0, Math.round(100 - (highOn + medOn * 0.5) / total * 100)) : 100
  const tier = score >= 80 ? 'clean' : score >= 50 ? 'moderate' : 'heavy'
  const tone = _SU_TIERS[tier]
  hero.dataset.tone = tone
  document.getElementById('startup-hero-ring').innerHTML = String(ui.ring(score, score, tone, 84))
  document.getElementById('startup-hero-meter').innerHTML = String(ui.meter(score, tone))
  const badge = document.getElementById('startup-hero-tier')
  badge.textContent = { clean: tUI('startupTierClean'), moderate: tUI('startupTierModerate'), heavy: tUI('startupTierHeavy') }[tier]
  badge.className = 'j-badge j-badge-' + tone
  document.getElementById('startup-hero-sub').textContent = tUI('startupActiveOf').replace('{enabled}', enabled).replace('{total}', total)
}

// Called by showPage() when this page is served from _PAGE_CACHE: the cached HTML may predate the async fetch, so redraw from state.
function _startupRewireAfterCacheRestore() {
  if (_startupLoaded && _startupItems.length > 0) _renderStartupList(_startupItems)
}

function startupClearSearch() {
  const input = document.getElementById('startup-search')
  if (!input) return
  input.value = ''
  startupFilter('')
  input.focus()
}

async function _startupBulk(items, enable) {
  const results = await Promise.allSettled(items.map(item => api.toggleStartupItem({ name: item.Name, source: item.Source, key: item.Key, enable })))
  let ok = 0
  results.forEach((r, idx) => {
    if (r.status === 'fulfilled' && r.value?.ok) {
      const stored = _startupItems.find(i => _suSame(i, items[idx]))
      if (stored) stored.Enabled = enable
      ok++
    }
  })
  return ok
}

async function startupReEnableAll() {
  const disabled = _startupItems.filter(i => !i.Enabled)
  if (!disabled.length) return
  await _startupBulk(disabled, true)
  _renderStartupList(_startupItems)
}

async function applyStartupRecommended() {
  if (!_startupItems.length) return
  const { isLaptop } = pcTier()
  const alwaysKeep = ['realtek', 'nvidia', 'amd', 'intel', 'steam', 'discord', 'logitech ghub', 'corsair icue', 'razer synapse']
  const laptopKeep = ['battery', 'power', 'asus', 'lenovo', 'dell', 'hp', 'acer', 'msi ec']
  // Candidates come from the in-memory store, so rows hidden by the search filter are still considered.
  const toDisable = _startupItems.filter(item => {
    if (!item.Enabled) return false
    const name = (item.Name || '').toLowerCase()
    if (item.Impact !== 'High' && !STARTUP_RECOMMENDED_DISABLE.some(n => name.includes(n.toLowerCase()))) return false
    if (alwaysKeep.some(k => name.includes(k))) return false
    if (isLaptop && laptopKeep.some(k => name.includes(k))) return false
    return true
  })
  if (toDisable.length === 0) {
    toast(tUI('startupAlreadyOptimized'), tUI('startupAlreadyOptimizedMsg'), 'info')
    return
  }
  try {
    await showConfirm({
      title: tUI('startupRecommendConfirmTitle'),
      body: tUI('startupRecommendConfirmBody').replace('{n}', toDisable.length),
      okText: tUI('startupRecommendConfirmOk').replace('{n}', toDisable.length),
      okStyle: 'warning',
      icon: 'fa-wand-sparkles'
    })
  } catch { return }
  await _startupBulk(toDisable, false)
  toast(tUI('startupDisabledToast'), tUI('startupDisabledMsg').replace('{n}', toDisable.length) + (isLaptop ? ' ' + tUI('startupLaptopSafe') : ''), 'ok')
  _renderStartupList(_startupItems)
}

function renderStartupRow(item) {
  const { html, raw } = ui
  const impact = item.Impact || 'Low'
  const cmd = item.Command || ''
  let shown = cmd
  if (shown.length > 60) {
    const stripped = shown.startsWith('"') ? shown.replace(/^"([^"]+)".*/, '$1') : shown.replace(/^(\S+).*/, '$1')   // quoted paths may contain spaces
    const parts = stripped.replace(/\\/g, '/').split('/')
    if (parts.length >= 2) shown = `…\\${parts.slice(-2).join('\\')}`
  }
  const hasPath = /^["A-Za-z]/.test(cmd.trim())
  let boot = ''
  if (item._bootMs != null) {
    const ms = item._bootMs
    boot = html`<span class="${'j-badge j-badge-' + (ms > 3000 ? 'danger' : ms > 1000 ? 'warn' : 'neutral')}" title="${tUI('startupBootImpactTitle')}"><i class="fa fa-stopwatch" aria-hidden="true"></i> ${ms >= 1000 ? (ms / 1000).toFixed(1) + 's' : ms + 'ms'}</span>`
  }
  const name = item.Name || tUI('startupUnknown')
  const canDelay = item.Enabled && item.Source === 'HKCU Registry'   // a per-user delay task can't stand in for a machine-wide entry
  return html`<div class="${'j-row startup-row' + (item.Enabled ? '' : ' row-disabled')}" data-item="${JSON.stringify(item)}">
    <span class="j-su-ico" aria-hidden="true">${((name).trim().charAt(0) || '?').toUpperCase()}</span>
    <div class="j-row-main">
      <div class="j-row-title">${name} ${boot}</div>
      <div class="j-row-sub j-su-cmd" title="${cmd}">${shown}</div>
    </div>
    <div class="j-row-control">
      ${hasPath ? ui.button({ iconOnly: true, icon: 'folder-open', variant: 'ghost', size: 'sm', title: tUI('startupOpenLocation'), onclick: 'startupOpenLocation(this)' }) : ''}
      ${canDelay ? ui.button({ iconOnly: true, icon: 'clock', variant: 'ghost', size: 'sm', title: tUI('startupDelayTitle'), onclick: 'delayStartup(this)' }) : ''}
      ${ui.impact(_suImpactLevel(impact), _suImpactLabel(impact))}
      ${ui.switch({ checked: item.Enabled, onchange: 'toggleStartup(this)', label: `${name}: ${item.Enabled ? tUI('startupToastDisabled') : tUI('startupToastEnabled')}` })}
    </div>
  </div>`
}

function _renderStartupList(items) {
  const list = document.getElementById('startup-list')
  if (!list) return
  list.removeAttribute('aria-busy')
  updateStartupHero(items)
  if (!items.length) {
    list.innerHTML = String(ui.empty({ icon: 'power-off', title: tUI('startupEmptyTitle'), sub: tUI('startupEmptySub'), action: ui.button({ label: tUI('startupRefresh'), icon: 'arrows-rotate', size: 'sm', onclick: 'loadStartupItems(this)' }) }))
    return
  }
  const { html } = ui
  const order = { High: 0, Medium: 1, Low: 2 }
  const sorted = arr => arr.slice().sort((a, b) => ((order[a.Impact] ?? 2) - (order[b.Impact] ?? 2)) || (a.Name || '').localeCompare(b.Name || ''))
  const on = items.filter(i => i.Enabled)
  const off = items.filter(i => !i.Enabled)
  const highActive = on.filter(i => i.Impact === 'High').length
  const withBoot = on.filter(i => i._bootMs != null)
  const bootMs = withBoot.reduce((s, i) => s + i._bootMs, 0)

  const groups = _SU_SRC().map(g => ({ g, rows: sorted(on.filter(i => i.Source === g.key)) })).filter(x => x.rows.length)
  const disabled = off.length ? html`<details class="j-su-disabled">
    <summary><i class="fa fa-chevron-right j-su-chev" aria-hidden="true"></i> ${tUI('startupDisabledSection')} <span class="j-badge j-badge-neutral">${off.length}</span>
      ${off.length > 3 ? ui.button({ label: tUI('startupReEnableAll'), variant: 'ghost', size: 'sm', onclick: 'event.preventDefault();event.stopPropagation();startupReEnableAll()' }) : ''}</summary>
    <div class="j-su-group-rows">${sorted(off).map(renderStartupRow)}</div>
  </details>` : ''

  list.innerHTML = String(html`
    <div class="j-su-summary" id="startup-summary">
      ${ui.badge(`${items.length} ${tUI('startupTotal')}`)}
      ${ui.badge(`${on.length} ${tUI('startupEnabled2')}`, 'ok')}
      ${ui.badge(`${off.length} ${tUI('startupDisabled2')}`)}
      ${withBoot.length ? html`<span class="j-badge j-badge-info"><i class="fa fa-stopwatch" aria-hidden="true"></i> ${tUI('startupBootDelay').replace('{s}', bootMs >= 1000 ? (bootMs / 1000).toFixed(1) : bootMs)}</span>` : ''}
      ${highActive ? ui.badge(`${highActive} ${tUI('startupHighEnabled')}`, 'warn') : ''}
    </div>
    ${highActive ? ui.callout(tUI('startupWarnBanner').replace('{n}', highActive), 'warn') : ''}
    ${groups.map(({ g, rows }) => html`<div class="j-su-grp" data-group="${g.key}"><div class="j-su-group-head">${g.label} <span class="j-badge j-badge-neutral">${rows.length}</span></div><div class="j-su-group-rows">${rows.map(renderStartupRow)}</div></div>`)}
    ${disabled}`)

  // Keep an active search applied across refreshes and toggles.
  const q = document.getElementById('startup-search')?.value.trim()
  if (q) startupFilter(q)
}

async function loadStartupItems(btn) {
  const isRefresh = !!btn
  if (isRefresh) _startupLoaded = false   // explicit refresh: force re-fetch
  // Tab revisit: draw from memory so a fresh fetch can't overwrite toggles made meanwhile.
  if (!isRefresh && _startupLoaded && _startupItems.length > 0) { _renderStartupList(_startupItems); return }

  if (btn) { btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>'; btn.disabled = true }
  // Boot impact can be slow or empty, so it never blocks the list.
  const [rawItems, bootImpact] = await Promise.all([api.getStartupItems().catch(() => []), api.getBootImpact().catch(() => ({}))])
  const list = document.getElementById('startup-list')
  if (!list) return
  if (btn) { btn.innerHTML = `<i class="fa fa-arrows-rotate"></i> ${tUI('startupRefresh')}`; btn.disabled = false }
  if (rawItems && !Array.isArray(rawItems) && rawItems.error) {
    toast(tUI('startupRefresh'), rawItems.error, 'err')
    list.removeAttribute('aria-busy')
    list.innerHTML = String(ui.error({ title: tUI('startupErrorTitle'), sub: rawItems.error, action: ui.button({ label: tUI('startupRetry'), icon: 'arrows-rotate', size: 'sm', onclick: 'loadStartupItems(this)' }) }))
    return
  }
  const items = Array.isArray(rawItems) ? rawItems : []
  // Attach boot impact ms by exe name and fold it into Impact, so counts, filter and the recommended action all agree.
  for (const item of items) {
    const exe = (item.Command || '').replace(/^"?([^" ]+)"?.*/, '$1').split(/[/\\]/).pop().replace(/\.exe$/i, '').toLowerCase()
    item._bootMs = bootImpact[exe] ?? null
    if (item._bootMs != null) {
      if (item._bootMs > 3000) item.Impact = 'High'
      else if (item._bootMs > 1000 && item.Impact !== 'High') item.Impact = 'Medium'   // <= 1000 never downgrades a static High
    }
  }
  _startupItems = items
  _startupBootImpact = bootImpact
  _startupLoaded = true
  _renderStartupList(_startupItems)
}

async function toggleStartup(cb) {
  const item = JSON.parse(cb.closest('.startup-row')?.dataset.item || 'null')
  if (!item) { appendLog('[Startup] toggleStartup ERROR: no data-item on row', 'err'); return }
  const enable = cb.checked
  const r = await api.toggleStartupItem({ name: item.Name, source: item.Source, key: item.Key, enable })
  if (!r?.ok) {
    cb.checked = !cb.checked
    toast(tUI('startupToggleFailed'), r?.error || '', 'err')
    return
  }
  toast(enable ? `${tUI('startupToastEnabled')}: ${item.Name}` : `${tUI('startupToastDisabled')}: ${item.Name}`, '', 'ok')
  const stored = _startupItems.find(i => _suSame(i, item))
  if (stored) stored.Enabled = enable
  _renderStartupList(_startupItems)
  // Re-render replaced the switch; put focus back on it so keyboard users stay in place.
  const again = [...document.querySelectorAll('#startup-list .startup-row')].find(row => { try { return _suSame(JSON.parse(row.dataset.item), item) } catch { return false } })
  again?.querySelector('input[type=checkbox]')?.focus()
  // A row that moved into the closed "disabled" section can't take focus; land on that section's summary instead.
  if (document.activeElement === document.body) document.querySelector('#startup-list .j-su-disabled > summary')?.focus()
  invalidatePageCache('startup-manager')
}

function startupFilter(query) {
  const q = query.trim().toLowerCase()
  const list = document.getElementById('startup-list')
  if (!list) return
  const rows = [...list.querySelectorAll('.startup-row')]
  let visible = 0
  rows.forEach(row => {
    const show = !q || row.textContent.toLowerCase().includes(q)
    row.hidden = !show
    if (show) visible++
  })
  const countEl = document.getElementById('startup-search-count')
  if (countEl) countEl.textContent = q ? tUI('startupSearchCount').replace('{n}', visible).replace('{t}', rows.length) : ''
  document.getElementById('startup-search-wrap')?.classList.toggle('has-query', !!q)
  list.querySelectorAll('.j-su-grp').forEach(g => { g.hidden = !!q && ![...g.querySelectorAll('.startup-row')].some(r => !r.hidden) })
  const details = list.querySelector('.j-su-disabled')
  if (details) details.hidden = !!q && ![...details.querySelectorAll('.startup-row')].some(r => !r.hidden)
  let none = list.querySelector('.startup-no-results')
  if (q && visible === 0) {
    if (!none) { none = document.createElement('div'); none.className = 'startup-no-results'; list.appendChild(none) }
    none.innerHTML = String(ui.empty({ icon: 'magnifying-glass', title: tUI('emptySearch'), sub: tUI('emptySearchSub') }))
    none.hidden = false
  } else if (none) none.hidden = true
}

function startupOpenLocation(btn) {
  const cmd = JSON.parse(btn.closest('.startup-row')?.dataset.item || 'null')?.Command || ''
  // Prefer a quoted path (handles spaces); otherwise split before a flag character
  const quoted = cmd.match(/^"([^"]+)"/)
  const path = quoted ? quoted[1] : cmd.split(/\s+(?=[/-]|$)/)[0]
  const folder = path.includes('\\') ? path.substring(0, path.lastIndexOf('\\')) : path
  if (folder) api.openPath(folder)
}

function delayStartup(btn) {
  const rowEl = btn.closest('.startup-row')
  const item = JSON.parse(rowEl?.dataset.item || 'null')
  if (!item) return
  if (!rowEl) { toast(tUI('startupDelayTitle'), tUI('startupDelayFail'), 'err'); return }
  if (rowEl.querySelector('.delay-picker')) return   // already open
  const { html } = ui
  const picker = document.createElement('div')
  picker.className = 'delay-picker j-su-delay'
  picker.innerHTML = String(html`<span class="j-muted"><i class="fa fa-clock" aria-hidden="true"></i> ${tUI('startupDelayTitle')}:</span>
    ${[30, 60, 120].map(s => ui.button({ label: s + 's', variant: 'ghost', size: 'sm', onclick: `doDelay(${jsArg(JSON.stringify(item))},${s},this)` }))}
    ${ui.button({ iconOnly: true, icon: 'xmark', variant: 'ghost', size: 'sm', title: tUI('btnCancel'), onclick: "this.closest('.delay-picker').remove()" })}`)
  rowEl.appendChild(picker)
  picker.querySelector('button')?.focus()
}

async function doDelay(itemJson, delaySec, btn) {
  const item = JSON.parse(itemJson)
  if (!item.Command || !/^["A-Za-z]/.test(item.Command.trim())) {
    toast(tUI('startupDelayTitle'), tUI('startupDelayFail'), 'err')
    return
  }
  btn.disabled = true
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>'
  const r = await api.delayStartupItem({ name: item.Name, command: item.Command, delaySec, key: item.Key })
  if (r?.ok) {
    btn.closest('.delay-picker')?.remove()
    toast(tUI('startupDelayTitle'), tUI('startupDelayOk').replace('{name}', item.Name).replace('{s}', delaySec), 'ok')
    loadStartupItems()
  } else {
    btn.disabled = false; btn.textContent = `${delaySec}s`
    toast(tUI('startupDelayTitle'), tUI('startupDelayFail'), 'err')
  }
}
