'use strict'
// Navigation model for the 2.0 UI: 5 sections + Settings, every old page is a tab. Pure data + lookups (no DOM), unit-tested.
// `page` is the legacy page id of a tab. showPage(page) keeps driving all lifecycle logic (metrics, polling, cleanup), so deep
// links, the command palette and internal showPage('windows-opti') calls keep working unchanged.
;(function (root) {
  // key = tab id (unique inside its section); page = legacy id; titleKey/subKey = LANG ids for the label
  const SECTIONS = [
    { id: 'home', icon: 'house', page: 'dashboard', tabs: [{ id: 'home', page: 'dashboard' }] },
    { id: 'optimize', icon: 'gauge-high', tabs: [
      { id: 'windows', page: 'windows-opti' },
      { id: 'cpumem', page: 'hardware', premium: true },
      { id: 'gpu', page: 'hardware', premium: true },
      { id: 'power', page: 'hardware', premium: true },
      { id: 'network', page: 'network' },
      { id: 'fixes', page: 'fixes' },
    ] },
    { id: 'gaming', icon: 'gamepad', tabs: [
      { id: 'pulse', page: 'pulse' },
      { id: 'games', page: 'game-opti' },
      { id: 'apps', page: 'app-optimizer' },
      { id: 'fivem', page: 'fivem' },
      { id: 'latency', page: 'latency-monitor' },
    ] },
    { id: 'clean', icon: 'broom', tabs: [
      { id: 'cleanup', page: 'cleanup' },
      { id: 'debloat', page: 'debloater' },
      { id: 'startup', page: 'startup-manager' },
    ] },
    { id: 'system', icon: 'sliders', tabs: [
      { id: 'diagnostics', page: 'preflight' },
      { id: 'processes', page: 'process-manager' },
      { id: 'bios', page: 'bios-tuner' },
      { id: 'scheduler', page: 'scheduler' },
      { id: 'restore', page: 'restore-points' },
      { id: 'history', page: 'changelog' },
    ] },
    { id: 'settings', icon: 'gear', page: 'settings', tabs: [{ id: 'settings', page: 'settings' }] },
  ]

  // Old wrapper pages and aliases that are not a tab of their own -> tab they open on
  const ALIASES = {
    performance: ['optimize', 'windows'],
    gaming: ['gaming', 'pulse'],
    'privacy-cleanup': ['clean', 'cleanup'],
  }

  const byPage = {}
  for (const s of SECTIONS) for (const t of s.tabs) if (!byPage[t.page]) byPage[t.page] = { section: s.id, tab: t.id }
  const section = id => SECTIONS.find(s => s.id === id) || null

  // page (+ optional tab id) -> { section, tab, page } or null. `page` is the legacy id to run lifecycle logic for.
  function resolve(page, tabId) {
    let hit = ALIASES[page] ? { section: ALIASES[page][0], tab: ALIASES[page][1] } : byPage[page]
    if (!hit) return null
    const s = section(hit.section)
    if (tabId) {
      const t = s.tabs.find(x => x.id === tabId)
      if (t) hit = { section: s.id, tab: t.id }
    }
    const t = s.tabs.find(x => x.id === hit.tab)
    return { section: s.id, tab: t.id, page: t.page, premium: !!t.premium }
  }

  // Where a sidebar click on a section lands, given the last tab used there.
  function entry(sectionId, lastTab) {
    const s = section(sectionId)
    if (!s) return null
    const t = s.tabs.find(x => x.id === lastTab) || s.tabs[0]
    return { section: s.id, tab: t.id, page: t.page }
  }

  const api = { SECTIONS, ALIASES, resolve, entry, section }
  root.JylliRoutes = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
