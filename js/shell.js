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

  const HW_TAB_SECTIONS = {
    cpumem: new Set(['hw-mem', 'hw-audio', 'hw-tool-topo', 'hw-tool-lat']),
    gpu: new Set(['hw-nvidia', 'hw-amd', 'hw-gpu-adv', 'hw-tool-thermal']),
    power: new Set(['hw-power', 'hw-storage', 'hw-tool-eff']),
  }

  // tab id -> async (container) builder. Each runs exactly what the matching legacy page ran, so behaviour is unchanged.
  const TAB_BUILDERS = {
    home: c => buildDashboard(c),
    windows: c => buildWindowsOpti(c, 'full'),
    qol: c => buildWindowsOpti(c, 'qol'),
    cpumem: c => hardwareTab(c, 'cpumem'),
    gpu: c => hardwareTab(c, 'gpu'),
    power: c => hardwareTab(c, 'power'),
    network: async c => { await buildNetwork(c); const live = buildNetworkHero(c); const host = c.querySelector('.tk-hero'); if (host) host.after(live) },   // score hero first, the live scene under it
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

  async function hardwareTab(c, tab) {
    if (!settings.isPremium) { await JylliPremium.build(c, tab); if (tab === 'gpu') { const h = buildGpuHero(c, { readOnly: true }); c.appendChild(h) } return }   // the live read-only hero sits below the pitch, so the offer stays above the fold
    await buildHardware(c)
    if (tab === 'gpu') buildGpuHero(c)
    else if (tab === 'cpumem') await buildCpuMemHero(c)
    else if (tab === 'power') await buildStorageHero(c)
    const allowed = HW_TAB_SECTIONS[tab] || new Set()
    c.querySelectorAll('.section-card[data-sec-id]').forEach(el => {
      const mine = allowed.has(el.dataset.secId)
      // a tweak section with no cards (Audio, or Power on a PC where none of its tweaks apply) is never shown
      const empty = !!el.querySelector('.tweak-card-grid') && !el.querySelector('.tweak-card')
      el.dataset.tabOff = (mine && !empty) ? '' : '1'
      if (!el.dataset.tabOff) delete el.dataset.tabOff
      el.style.display = (mine && !empty) ? '' : 'none'
    })
    const tb = c.querySelector('.tk-toolbar')
    if (tb && root.JylliFilter) {
      if (root._hwFilter) root._hwFilter.destroy()
      root._hwFilter = JylliFilter.mount(c, {
        item: '.tweak-card', section: '.section-card[data-sec-id]', skip: '[data-tab-off]', input: tb.querySelector('input'), chipsEl: tb.querySelector('.tk-chips'),
        expand: q => String((typeof HW_SEARCH_SYNONYMS !== 'undefined' && HW_SEARCH_SYNONYMS[q]) || '').split(' ').filter(Boolean),
        onResult: r => {
          let nm = c.querySelector('.tk-nomatch')
          if (r.total > 0 && r.shown === 0) { if (!nm) { nm = JylliTab.noMatch(r.q, () => root._hwFilter.set({ q: '', chip: 'all' })); c.appendChild(nm) } else nm.querySelector('.j-empty-sub').textContent = tG('tab', 'noMatchSub', { q: r.q }) }
          else if (nm) nm.remove()
        },
      })
      registerPageCleanup('hardware', () => { if (root._hwFilter) root._hwFilter.destroy(); root._hwFilter = null })
      hwRefreshCounters()
    }
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
