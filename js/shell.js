'use strict'
// Main-window shell for the UI: sidebar sections, section header with tabs, breadcrumb, status bar and the activity drawer.
// Page content is still built by the legacy builders; this file decides which builder a tab runs (see TAB_BUILDERS) and draws the chrome.
// Depends on globals from index.html (settings, tUI, showPage, build*), js/ui.js and js/routes.js.
;(function (root) {
  const { html, raw } = root.ui
  const R = root.JylliRoutes

  // LANG ui keys. Labels are looked up at render time so a language switch only needs a re-render.
  const SECTION_KEYS = { home: 'navHome', optimize: 'navOptimize', gaming: 'navGaming', clean: 'navClean', system: 'navSystem', settings: 'navSettings' }
  const SECTION_SUB_KEYS = { home: 'navHomeSub', optimize: 'navOptimizeSub', gaming: 'navGamingSub', clean: 'navCleanSub', system: 'navSystemSub', settings: 'navSettingsSub' }
  const TAB_KEYS = {
    windows: 'tabWindows', qol: 'tabQoL', cpumem: 'tabCPUMem', gpu: 'tabGPU', power: 'tabPower', network: 'tabNetwork', fixes: 'tabFixes',
    pulse: 'tabPulse', games: 'tabGames', apps: 'tabApps', fivem: 'tabFiveM', latency: 'tabLatency', replay: 'tabReplay',
    cleanup: 'tabCleanup', debloat: 'tabDebloater', startup: 'tabStartup',
    diagnostics: 'tabDiagnostics', processes: 'tabProcesses', bios: 'tabBios', scheduler: 'tabScheduler', restore: 'tabRestore', history: 'tabHistory',
  }
  // Tabs that were behind the "Advanced mode" switch in the old sidebar
  const ADVANCED_TABS = new Set(['latency', 'processes', 'bios'])

  // tab id -> async (container) builder. Each runs exactly what the matching legacy page ran, so behaviour is unchanged.
  const TAB_BUILDERS = {
    home: c => buildDashboard(c),
    windows: c => buildWindowsOpti(c, 'full'),
    qol: c => buildWindowsOpti(c, 'qol'),
    cpumem: c => JylliCpuMemPage.mount(c),   // js/cpumem: die map, memory strata, Tune, Lab, History (free for everyone; its Premium switches lock inline)
    gpu: c => JylliGpuPage.mount(c),   // js/gpu: Headroom stage, Overview / Tune / Display / History (free for everyone; its Premium parts lock inline)
    power: c => JylliPowerPage.mount(c),   // js/power: Current stage, Overview / Plans / Sleep & wake / Energy / Tune / History (free for everyone; its Premium switches lock inline)
    network: c => JylliNetworkPage.mount(c),   // js/network: the Path stage, Overview / Tune / Measure / History
    fixes: c => buildFixes(c),
    pulse: c => buildPulse(c),
    games: async c => { if (!settings.isPremium) await JylliPremium.build(c, 'games'); else await buildGameOpti(c) },
    apps: c => buildAppOptimizer(c),
    fivem: c => JylliFivemPage.mount(c),
    latency: c => buildLatencyMonitor(c),
    replay: c => { registerPageCleanup('replay', replayClose); return buildReplay(c) },
    cleanup: c => buildCleanup(c),
    debloat: c => buildDebloater(c),
    startup: c => buildStartupManager(c),
    diagnostics: c => buildPreflight(c),
    processes: c => buildProcessManager(c),
    bios: async c => { if (!settings.isPremium) { await JylliPremium.build(c, 'bios'); return } await JylliBios.build(c) },
    scheduler: c => buildScheduler(c),
    restore: c => buildRestorePoints(c),
    history: c => buildChangelog(c),
    settings: c => buildSettings(c),
  }

  const sectionLabel = id => tUI(SECTION_KEYS[id])
  const tabLabel = id => tUI(TAB_KEYS[id] || id)

  function navItem(s) {
    const e = R.entry(s.id, (root._activeTab || {})[s.id])
    return html`<button class="j-nav-item" type="button" data-section="${s.id}" data-page="${e.page}" title="${sectionLabel(s.id)}" onclick="Shell.go('${s.id}')"><i class="fa fa-${s.icon}" aria-hidden="true"></i><span>${sectionLabel(s.id)}</span>${s.id === 'system' ? html`<span class="j-nav-dot" id="badge-restore" style="display:none" aria-hidden="true"></span><span class="j-nav-count" id="badge-preflight" style="display:none">!</span><span class="j-nav-count" id="badge-boost" style="display:none">LIVE</span>` : ''}</button>`
  }

  // Built once per language; afterwards only the active item changes, so badge state set elsewhere survives page changes.
  function renderNav(active) {
    const nav = document.getElementById('j-nav')
    if (!nav) return
    if (nav.dataset.lang !== currentLang) {
      const keep = ['badge-preflight', 'badge-boost', 'badge-restore'].map(id => { const el = document.getElementById(id); return el && [id, el.style.display, el.textContent, el.className] })
      const main = R.SECTIONS.filter(s => s.id !== 'settings')
      nav.innerHTML = String(html`${main.map(navItem)}<div class="j-nav-spacer"></div>${navItem(R.section('settings'))}<button class="j-nav-item" type="button" id="sidebar-toggle-btn" onclick="toggleSidebar()" title="${tUI('sidebarCollapse')}"><i class="fa fa-angles-left" id="sidebar-toggle-icon" aria-hidden="true"></i><span id="sidebar-toggle-label">${tUI('sidebarCollapse')}</span></button>`)
      keep.forEach(k => { const el = k && document.getElementById(k[0]); if (el) { el.style.display = k[1]; el.textContent = k[2]; if (k[3]) el.className = k[3] } })
      nav.dataset.lang = currentLang
    }
    nav.querySelectorAll('.j-nav-item[data-section]').forEach(b => {
      const on = b.dataset.section === active
      b.classList.toggle('j-nav-active', on)
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current')
    })
  }

  function visibleTabs(s, activeTab) {
    return s.tabs.filter(t => !ADVANCED_TABS.has(t.id) || settings.advancedMode || t.id === activeTab)
  }

  function renderHead(route) {
    const head = document.getElementById('j-head')
    if (!head) return
    const s = R.section(route.section)
    const single = s.tabs.length === 1
    const tabs = single ? '' : root.ui.tabs(visibleTabs(s, route.tab).map(t => ({ id: t.id, label: tabLabel(t.id), pro: t.premium && !settings.isPremium && tG('premium', 'badge') })), route.tab, "Shell.tab('{id}')")
    const rp = route.section === 'home' ? root.ui.button({ label: tUI('createRp'), icon: 'shield-halved', variant: 'secondary', size: 'sm', id: 'create-rp-btn', onclick: 'quickCreateRP()' }) : ''
    const help = root.ui.button({ iconOnly: true, icon: 'circle-question', variant: 'ghost', size: 'sm', id: 'tour-help-btn', title: tG('tour', 'help') + ' (F1)', onclick: 'JylliTour.replay()' })
    const actions = root.ui.html`${rp}${help}`
    head.innerHTML = String(root.ui.section({ title: sectionLabel(route.section), sub: tUI(SECTION_SUB_KEYS[route.section]), actions, tabs }))
    const crumb = document.getElementById('j-crumb')
    if (crumb) crumb.innerHTML = String(single ? html`<b>${sectionLabel(route.section)}</b>` : html`<span>${sectionLabel(route.section)}</span><span>/</span><b>${tabLabel(route.tab)}</b>`)
  }

  // Called by showPage once the destination is known.
  function render(route) {
    root._activeTab = root._activeTab || {}
    root._activeTab[route.section] = route.tab
    renderNav(route.section)
    renderHead(route)
    if (root.JylliRestoreUI) root.JylliRestoreUI.paint()
  }

  const Shell = {
    TAB_BUILDERS,
    render,
    renderHead,
    // Sidebar click: open the section on the tab last used there.
    go(sectionId) {
      const e = R.entry(sectionId, (root._activeTab || {})[sectionId])
      if (e) showPage(e.page, e.tab)
    },
    // Tab click inside the current section.
    tab(tabId) {
      const cur = R.resolve(currentPage, (root._activeTab || {})[R.resolve(currentPage)?.section])
      const s = cur && R.section(cur.section)
      const t = s && s.tabs.find(x => x.id === tabId)
      if (t) showPage(t.page, t.id)
    },
    // Re-draw header/tabs only (Advanced mode toggled, tier changed).
    refresh() {
      const r = R.resolve(currentPage, (root._activeTab || {})[(R.resolve(currentPage) || {}).section])
      if (r) { renderNav(r.section); renderHead(r); if (root.JylliRestoreUI) root.JylliRestoreUI.paint() }
    },
    // Live status bar. Values only arrive while metrics polling runs (Home / Processes); otherwise the last known ones stay.
    metrics(m) {
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v }
      if (m.cpu != null) set('sb-cpu', `CPU ${m.cpu}%`)
      if (m.ram != null) set('sb-ram', `RAM ${m.ram}%`)
      if (m.gpu != null) set('sb-gpu', `GPU ${m.gpu}%`)
    },
    // state: idle | game | pulse
    state(s) {
      const pill = document.getElementById('j-state')
      if (!pill) return
      const key = { idle: 'shellStatusIdle', game: 'shellStatusGame', pulse: 'shellStatusPulse' }[s] || 'shellStatusIdle'
      pill.innerHTML = String(html`<span class="${'j-dot ' + (s === 'pulse' ? 'j-dot-accent' : s === 'game' ? 'j-dot-ok' : '')}"></span>${tUI(key)}`)
      pill.dataset.state = s
    },
  }

  root.Shell = Shell
  if (typeof module !== 'undefined' && module.exports) module.exports = Shell
})(typeof window !== 'undefined' ? window : globalThis)
