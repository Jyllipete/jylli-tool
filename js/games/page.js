'use strict'
// Games tab "Library": the real list of every game on this PC (Steam / Epic / Xbox / your own), with covers, Play, per-game tuning
// that is read back after it is written, and play history from sessions Jylli recorded. Engine: lib/games (main.js `// ─── Games`).
// Four views (Library, Play history, Automation, History). Free: library, Play, history. Premium: per-game changes, settings sheets, automation.
// Root carries `jk nt ga`: .jk keeps the legacy #page-content resets out, .nt reuses the shared button / chip / card / banner styles.
;(function (root) {
  const P = root.JylliGamesPure || (typeof require === 'function' ? require('./pure') : null)
  const api = { mount() {}, reveal() {} }
  root.JylliGamesPage = api
  if (typeof document === 'undefined') return

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
  const lsGet = k => { try { return localStorage.getItem(k) } catch (e) { return null } }
  const lsSet = (k, v) => { try { localStorage.setItem(k, v) } catch (e) { /* storage may be unavailable */ } }
  const toast = (...a) => { try { root.toast(...a) } catch (e) { /* toast is optional */ } }
  const hasKey = k => { try { const L = LANG; return !!((L[currentLang] && L[currentLang].games2 && k in L[currentLang].games2) || (L.en.games2 && k in L.en.games2)) } catch (e) { return false } }
  // one / many: a call with n = 1 uses the key plus _1 when that key exists
  const T = (k, v) => root.tG('games2', v && v.n === 1 && hasKey(k + '_1') ? k + '_1' : k, v)
  const covers = new Map()     // library id -> data URL | null (asked, none)
  const SCAN_EVERY = 30000, KEYS = ['library', 'play', 'auto', 'history']
  let current = null, pendingReveal = null

  function mount(c) {
    if (current) current.destroy()
    const host = el('div', 'jk nt ga')
    c.appendChild(host)
    const S = { snap: null, failed: false, loading: true, view: 'library', chip: lsGet('ga_chip') || 'all', q: '', sort: P.SORTS.includes(lsGet('ga_sort')) ? lsGet('ga_sort') : 'recent', layout: lsGet('ga_layout') === 'list' ? 'list' : 'grid',
      sel: null, tab: 'tune', drawer: false, busy: null, history: null, profiles: null, bundles: null, ready: [], flash: null, disposed: false }
    if (!P.CHIPS.includes(S.chip)) S.chip = 'all'
    const unsubs = []
    let timer = null, qTimer = null, coverQ = [], coverRun = 0

    // ── frame ──
    const bannerSlot = el('div', 'nt-banner-slot')
    const stage = el('section', 'ga-stage'); stage.dataset.tour = 'ga-stage'
    const bar = el('div', 'nt-bar'); bar.dataset.tour = 'ga-views'
    const seg = root.JylliTab.seg(P.VIEWS.map(v => ({ id: v, label: T('seg_' + v), icon: P.VIEW_ICON[v] })), S.view, id => show(id))
    bar.appendChild(seg.el)
    const views = {}
    for (const k of P.VIEWS) { views[k] = el('div', 'nt-view ga-view'); views[k].hidden = k !== S.view }
    host.append(bannerSlot, stage, bar, ...P.VIEWS.map(v => views[v]))

    // library view skeleton: toolbar + (grid | detail)
    const tools = el('div', 'nt-tools ga-tools')
    tools.innerHTML = `<label class="nt-search"><i class="fa fa-magnifying-glass" aria-hidden="true"></i><input type="search" data-q placeholder="${esc(T('search'))}" aria-label="${esc(T('search'))}"></label><div class="nt-chips-bar" role="group" aria-label="${esc(T('chips'))}"></div>
      <div class="ga-tools-r"><select class="ga-sel" data-sort aria-label="${esc(T('sortBy'))}">${P.SORTS.map(s => `<option value="${s}">${esc(T('sort_' + s))}</option>`).join('')}</select>
      <div class="ga-layout" role="group" aria-label="${esc(T('layout'))}"><button type="button" data-layout="grid" aria-label="${esc(T('layoutGrid'))}"><i class="fa fa-table-cells-large" aria-hidden="true"></i></button><button type="button" data-layout="list" aria-label="${esc(T('layoutList'))}"><i class="fa fa-list" aria-hidden="true"></i></button></div>
      <button type="button" class="nt-sec sm" data-act="add"><i class="fa fa-plus" aria-hidden="true"></i>${esc(T('add'))}</button></div>`
    const lib = el('div', 'ga-lib')
    const gridWrap = el('div', 'ga-grid-wrap'), detail = el('aside', 'ga-detail'); detail.setAttribute('aria-label', T('detailLabel'))
    gridWrap.dataset.tour = 'ga-grid'; detail.dataset.tour = 'ga-detail'
    lib.append(gridWrap, detail)
    views.library.append(tools, lib)
    const chipsEl = tools.querySelector('.nt-chips-bar'), qIn = tools.querySelector('[data-q]'), sortEl = tools.querySelector('[data-sort]')
    sortEl.value = S.sort
    qIn.addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(() => { S.q = qIn.value; paintGrid() }, 120) })
    sortEl.addEventListener('change', () => { S.sort = sortEl.value; lsSet('ga_sort', S.sort); paintGrid() })

    const snap = () => S.snap
    const gameOf = id => (S.snap ? S.snap.games.find(g => g.id === id) : null)
    const premium = () => !!(S.snap ? S.snap.premium : root.settings && root.settings.isPremium)
    const watcher = () => { try { return !!gameWatcherRunning } catch (e) { return false } }
    const autoPulse = () => { try { return !!autoPulseEnabled } catch (e) { return false } }
    const ctx = { T, esc, P, S, snap, premium, watcher, autoPulse, reason: k => (hasKey('r_' + k) ? T('r_' + k) : T('r_failed')) }

    function show(id) {
      if (!KEYS.includes(id)) return
      S.view = id; seg.set(id)
      for (const k of KEYS) views[k].hidden = k !== id
      paintView(id)
    }
    function paintView(id) {
      const V = root.JylliGamesViews
      if (id === 'library') { paintTools(); paintGrid(); paintDetail() }
      else if (id === 'play') V.play(views.play, ctx)
      else if (id === 'history') { V.history(views.history, ctx); if (!S.history) loadHistory() }
      else if (id === 'auto') { V.auto(views.auto, ctx); loadAuto() }
    }

    // ── data ──
    async function load({ refresh = false, quiet = false } = {}) {
      if (S.disposed) return
      if (!quiet && !S.snap) { S.loading = true; paintAll() }
      let r = null
      try { r = await root.api.games2Scan({ refresh }) } catch (e) { r = null }
      if (S.disposed) return
      if (!r || r.ok === false || !r.games) { S.failed = !S.snap; S.loading = false; if (!quiet) toast(T('title'), T('scanFailed'), 'warn'); paintAll(); return }
      S.snap = r; S.failed = false; S.loading = false
      if (pendingReveal && gameOf(pendingReveal)) { S.sel = pendingReveal; S.view = 'library'; S.drawer = true; pendingReveal = null; seg.set('library'); for (const k of KEYS) views[k].hidden = k !== 'library' }
      if (!S.sel || !gameOf(S.sel)) S.sel = defaultSel()
      paintAll()
    }
    function defaultSel() {
      const s = S.snap; if (!s || !s.games.length) return null
      const run = s.games.find(g => g.running); if (run) return run.id
      return P.sortGames(s.games.filter(g => !g.hidden), 'recent', s.stats, s.lastPlayed)[0]?.id || s.games[0].id
    }
    async function loadHistory() { try { S.history = await root.api.games2History() } catch (e) { S.history = { runs: [] } } if (S.view === 'history') root.JylliGamesViews.history(views.history, ctx) }
    async function loadAuto() {
      try { const p = await root.api.listProfiles(); S.profiles = p && typeof p === 'object' ? p : {} } catch (e) { S.profiles = {} }
      try { const b = await root.api.listGameBundles(); S.bundles = Object.values(b || {}).filter(x => x && typeof x === 'object' && x.name).map(x => ({ ...x, gameName: gameNameOf(x.gameId) })) } catch (e) { S.bundles = [] }
      S.ready = await loadReady()
      if (S.view === 'auto') root.JylliGamesViews.auto(views.auto, ctx)
    }
    const gameNameOf = id => { const g = S.snap && S.snap.games.find(g => g.id === id || g.knownId === id || g.aliases.includes(id)); return g ? g.name : (id || '') }
    async function loadReady() {
      const out = []
      let items = []
      try { const w = await root.api.win2Cached(); items = (w && w.model && w.model.items) || [] } catch (e) { /* unread stays unknown */ }
      const st = id => { const i = items.find(x => x.id === id); return i ? (i.status === 'on' || i.status === 'native' ? 'ok' : i.status === 'unknown' ? 'unknown' : 'open') : 'unknown' }
      out.push({ id: 'gamemode', tab: 'windows', state: st('game-mode-on') }, { id: 'gamedvr', tab: 'windows', state: st('game-dvr') })
      return out
    }

    // ── paint ──
    function paintAll() { if (S.disposed) return; paintBanner(); paintStage(); paintView(S.view) }

    function paintBanner() {
      const s = S.snap, rows = []
      if (S.failed) rows.push({ tone: 'warn', icon: 'plug-circle-exclamation', t: T('bnFailT'), s: T('bnFailS'), act: 'rescan', label: T('retry') })
      if (s && s.games.some(g => g.legacy)) rows.push({ tone: 'warn', icon: 'rotate-left', t: T('bnLegacyT', { n: s.games.filter(g => g.legacy).length }), s: T('bnLegacyS'), act: 'migrate', label: T('bnLegacyCta') })
      if (s && s.premium && !s.throttleRead && s.read) rows.push({ tone: 'info', icon: 'user-shield', t: T('bnAdminT'), s: T('bnAdminS'), act: '', label: '' })
      bannerSlot.innerHTML = rows.map(r => `<div class="nt-banner" data-tone="${r.tone}"><span class="nt-banner-ico"><i class="fa fa-${r.icon}" aria-hidden="true"></i></span><span class="nt-banner-t"><b>${esc(r.t)}</b><span>${esc(r.s)}</span></span>${r.act ? `<button type="button" class="nt-sec sm" data-act="${r.act}">${esc(r.label)}</button>` : ''}</div>`).join('')
    }

    function paintStage() {
      const s = S.snap
      stage.dataset.state = S.busy ? 'run' : S.loading ? 'scan' : 'ready'
      let tone = 'idle', eyebrow, title, lead, actions = ''
      const btn = (act, label, cls, icon, extra) => `<button type="button" class="${cls}" data-act="${act}"${extra || ''}>${icon ? `<i class="fa fa-${icon}" aria-hidden="true"></i>` : ''}${esc(label)}</button>`
      if (S.busy) {
        tone = 'accent'; eyebrow = T('eyeRun'); title = T('vRun'); lead = T('vRunS', { what: S.busy })
        actions = `<button type="button" class="nt-cta" disabled><i class="fa fa-circle-notch fa-spin" aria-hidden="true"></i>${esc(T('working'))}</button>`
      } else if (!s) {
        eyebrow = T('eyeScan'); title = S.failed ? T('vFail') : T('vScan'); lead = S.failed ? T('vFailS') : T('vScanS'); tone = S.failed ? 'warn' : 'idle'
        if (S.failed) actions = btn('rescan', T('retry'), 'nt-cta', 'arrows-rotate')
      } else {
        const v = s.verdict; tone = v.tone
        eyebrow = T('eyeLib', { n: s.totals.games })
        if (v.kind === 'finding') { title = T('fT_' + v.id, v.vars); lead = T('fS_' + v.id, v.vars) }
        else { title = T('v_' + v.kind, v.vars); lead = T('vS_' + v.kind, v.vars) }
        const last = lastPlayedGame()
        if (v.kind === 'todo') actions += btn('tuneall', T('ctaTune', { n: v.vars.n }), 'nt-cta', 'wand-magic-sparkles')
        else if (v.kind === 'free') actions += btn('premium', T('unlock'), 'nt-cta', 'lock')
        else if (v.kind === 'empty') actions += btn('add', T('add'), 'nt-cta', 'plus')
        else if (v.kind === 'finding' && v.act) actions += btn(v.act.kind === 'migrate' ? 'migrate' : 'open', v.act.kind === 'migrate' ? T('bnLegacyCta') : T('review'), 'nt-cta', v.act.kind === 'migrate' ? 'rotate-left' : 'magnifying-glass', v.act.id ? ` data-id="${esc(v.act.id)}"` : '')
        if (last && !(v.kind === 'running') && last.launchable) actions += btn('play', T('ctaPlay', { name: last.name }), actions ? 'nt-sec' : 'nt-cta', 'play', ` data-id="${esc(last.id)}"`)
        actions += btn('rescan', T('rescan'), 'nt-sec', 'arrows-rotate')
      }
      stage.dataset.tone = tone
      const strip = s ? recentGames().slice(0, 8).map(g => `<button type="button" class="ga-thumb" data-act="open" data-id="${esc(g.id)}" data-cover="${esc(g.id)}" style="--h:${P.hue(g.id)}" title="${esc(g.name)}" aria-label="${esc(g.name)}">${coverInner(g, true)}</button>`).join('') : ''
      const wOn = watcher()
      stage.innerHTML = `<div class="ga-stage-main"><div class="nt-eyebrow"><span class="nt-dot"></span>${esc(eyebrow)}<button type="button" class="ga-pill" data-act="watcher" aria-pressed="${wOn}" title="${esc(T('autoWatchS'))}"><i class="fa fa-robot" aria-hidden="true"></i>${esc(wOn ? T('pillOn') : T('pillOff'))}</button></div>
        <h2 class="nt-title" data-tone="${tone}">${esc(title)}</h2><p class="nt-lead">${esc(lead)}</p><div class="nt-actions">${actions}</div></div>${strip ? `<div class="ga-strip" role="list">${strip}</div>` : ''}`
      queueCovers(stage)
    }
    const lastPlayedGame = () => { const s = S.snap; return s ? P.sortGames(s.games.filter(g => !g.hidden), 'recent', s.stats, s.lastPlayed).find(g => (s.stats[g.id] && s.stats[g.id].last) || (s.lastPlayed && s.lastPlayed[g.id])) || null : null }
    const recentGames = () => { const s = S.snap; return P.sortGames(s.games.filter(g => !g.hidden), 'recent', s.stats, s.lastPlayed) }

    function coverInner(g, small) {
      const url = covers.get(g.id)
      if (url) return `<img src="${esc(url)}" alt="" draggable="false">`
      const ico = g.icon ? `<img class="ga-ico" src="assets/games/${esc(g.icon)}" alt="" draggable="false">` : ''
      return ico || `<span class="ga-init">${esc(P.initial(g.name))}</span>`
    }
    function queueCovers(scope) {
      for (const n of scope.querySelectorAll('[data-cover]')) {
        const id = n.dataset.cover
        if (covers.has(id)) { applyCover(n, id); continue }
        if (!coverQ.includes(id)) coverQ.push(id)
      }
      pumpCovers()
    }
    function applyCover(n, id) { const url = covers.get(id); if (url && !n.dataset.has) { n.dataset.has = '1'; n.style.backgroundImage = `url("${url}")`; n.classList.add('has-cover') } }
    function pumpCovers() {
      while (coverRun < 4 && coverQ.length) {
        const id = coverQ.shift(); if (covers.has(id)) continue
        coverRun++; covers.set(id, null)
        Promise.resolve().then(() => root.api.getGameCover(id)).catch(() => null).then(url => {
          coverRun--; covers.set(id, url || null)
          if (!S.disposed) for (const n of host.querySelectorAll(`[data-cover="${CSS.escape(id)}"]`)) applyCover(n, id)
          pumpCovers()
        })
      }
    }

    function paintTools() {
      const s = S.snap, counts = s ? P.chipCounts(s.games.filter(g => !g.hidden)) : {}
      chipsEl.innerHTML = P.CHIPS.map(ch => (ch !== 'all' && s && !counts[ch] && ch !== S.chip ? '' : `<button type="button" class="nt-chip" data-chip="${ch}" aria-pressed="${S.chip === ch}">${esc(T('chip_' + ch))}<b>${counts[ch] == null ? 0 : counts[ch]}</b></button>`)).join('')
      for (const b of tools.querySelectorAll('[data-layout]')) b.setAttribute('aria-pressed', String(b.dataset.layout === S.layout))
    }

    function paintGrid() {
      const s = S.snap
      gridWrap.dataset.layout = S.layout
      if (!s) {
        gridWrap.innerHTML = S.failed ? `<div class="nt-empty ga-empty"><i class="fa fa-plug-circle-exclamation" aria-hidden="true"></i><b>${esc(T('vFail'))}</b><span>${esc(T('vFailS'))}</span><button type="button" class="nt-sec sm" data-act="rescan">${esc(T('retry'))}</button></div>`
          : `<div class="ga-grid" aria-busy="true">${Array.from({ length: 10 }, () => '<div class="ga-cardw sk"></div>').join('')}</div>`
        return
      }
      const list = P.sortGames(s.games.filter(g => !g.hidden && P.chipMatch(g, S.chip) && P.matches(g, S.q)), S.sort, s.stats, s.lastPlayed)
      if (!s.games.filter(g => !g.hidden).length) {
        gridWrap.innerHTML = `<div class="nt-empty ga-empty"><i class="fa fa-gamepad" aria-hidden="true"></i><b>${esc(T('emptyT'))}</b><span>${esc(T('emptyS'))}</span><div class="ga-empty-act"><button type="button" class="nt-cta sm" data-act="add">${esc(T('add'))}</button><button type="button" class="nt-sec sm" data-act="rescan">${esc(T('rescan'))}</button></div></div>`
        return
      }
      if (!list.length) { gridWrap.innerHTML = `<div class="nt-empty ga-empty"><i class="fa fa-magnifying-glass" aria-hidden="true"></i><b>${esc(T('noMatchT'))}</b><span>${esc(T('noMatchS', { q: S.q || T('chip_' + S.chip) }))}</span><button type="button" class="nt-sec sm" data-act="clear">${esc(T('clearFilters'))}</button></div>`; return }
      const focusId = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.id : null
      gridWrap.innerHTML = `<div class="ga-grid" role="listbox" aria-label="${esc(T('listLabel'))}" data-n="${list.length}">${list.map(g => card(g, s)).join('')}</div>`
      if (focusId) { const f = gridWrap.querySelector(`.ga-card[data-id="${CSS.escape(focusId)}"]`); if (f && gridWrap.contains(document.activeElement) === false && host.contains(document.activeElement)) f.focus({ preventScroll: true }) }
      queueCovers(gridWrap)
    }
    function card(g, s) {
      const dot = P.dotOf(g), st = s.stats[g.id], when = st ? P.ago(st.last) : null
      const sub = g.running ? T('st_running') : when ? T('playedAgo', { when: T('ago_' + when.k, { n: when.n }) }) : T('src_' + P.storeOf(g))
      return `<div class="ga-cardw" data-fav="${g.favorite ? 1 : 0}"><button type="button" class="ga-card" role="option" aria-selected="${g.id === S.sel}" data-act="select" data-id="${esc(g.id)}" data-dot="${dot}">
        <span class="ga-cover" data-cover="${esc(g.id)}" style="--h:${P.hue(g.id)}">${coverInner(g)}</span>
        <span class="ga-card-b"><b>${esc(g.name)}</b><i>${esc(sub)}</i></span><span class="ga-dot" data-k="${dot}" title="${esc(T('dot_' + dot))}" aria-label="${esc(T('dot_' + dot))}"></span></button>
        <button type="button" class="ga-fav" data-act="fav" data-id="${esc(g.id)}" aria-pressed="${g.favorite ? 'true' : 'false'}" aria-label="${esc(T(g.favorite ? 'unfav' : 'fav'))}"><i class="fa fa-star" aria-hidden="true"></i></button></div>`
    }

    // ── detail ──
    function paintDetail() {
      const s = S.snap, g = s && S.sel ? gameOf(S.sel) : null
      detail.dataset.open = S.drawer ? '1' : '0'
      if (!g) { detail.innerHTML = `<div class="nt-empty ga-empty"><i class="fa fa-hand-pointer" aria-hidden="true"></i><b>${esc(T('pickT'))}</b><span>${esc(T('pickS'))}</span></div>`; return }
      const st = s.stats[g.id], dot = P.dotOf(g)
      const tabs = ['tune', 'perf', ...(g.gamecfg && g.install ? ['cfg'] : []), 'tips']
      if (!tabs.includes(S.tab)) S.tab = 'tune'
      detail.innerHTML = `<header class="ga-d-hero" style="--h:${P.hue(g.id)}"><div class="ga-d-bg" data-cover="${esc(g.id)}"></div>
        <button type="button" class="ga-d-close" data-act="close" aria-label="${esc(T('close'))}"><i class="fa fa-xmark" aria-hidden="true"></i></button>
        <div class="ga-d-id"><span class="ga-d-art" data-cover="${esc(g.id)}" style="--h:${P.hue(g.id)}">${coverInner(g)}</span><div class="ga-d-name"><h3>${esc(g.name)}</h3><span>${esc([g.dev, T('src_' + P.storeOf(g))].filter(Boolean).join(' · '))}</span>
        <span class="ga-d-status" data-k="${dot}"><i></i>${esc(T('dot_' + dot))}</span></div></div>
        <div class="ga-d-actions">${g.launchable ? `<button type="button" class="nt-cta sm" data-act="play" data-id="${esc(g.id)}"><i class="fa fa-play" aria-hidden="true"></i>${esc(T('play'))}</button>` : ''}
          ${g.launchable ? `<button type="button" class="nt-sec sm" data-act="compete" data-id="${esc(g.id)}" title="${esc(T('competeS'))}"><i class="fa fa-bolt" aria-hidden="true"></i>${esc(T('compete'))}</button>` : ''}
          ${g.install ? `<button type="button" class="nt-sec sm" data-act="folder" data-id="${esc(g.id)}" aria-label="${esc(T('folder'))}" title="${esc(T('folder'))}"><i class="fa fa-folder-open" aria-hidden="true"></i></button>` : ''}
          <button type="button" class="nt-sec sm" data-act="hide" data-id="${esc(g.id)}" aria-label="${esc(g.custom ? T('removeGame') : T('hideGame'))}" title="${esc(g.custom ? T('removeGame') : T('hideGame'))}"><i class="fa fa-${g.custom ? 'trash' : 'eye-slash'}" aria-hidden="true"></i></button></div></header>
        <div class="ga-d-tabs" role="tablist">${tabs.map(t => `<button type="button" role="tab" data-act="tab" data-tab="${t}" aria-selected="${S.tab === t}">${esc(T('tab_' + t))}</button>`).join('')}</div>
        <div class="ga-d-body" data-tab="${S.tab}">${S.tab === 'tune' ? tuneHtml(g, s) : S.tab === 'perf' ? perfHtml(g, s, st) : S.tab === 'cfg' ? `<div id="ga-cfg"></div>` : tipsHtml(g)}</div>`
      queueCovers(detail)
      if (S.tab === 'cfg') mountCfg(g)
    }

    function exeHtml(g) {
      const list = g.model.exes || [], trusted = list.filter(e => e.source !== 'guess'), guess = list.find(e => e.source === 'guess')
      const head = `<div class="ga-exe-h"><b>${esc(T('exeT'))}</b><button type="button" class="nt-sec sm" data-act="pick" data-id="${esc(g.id)}">${esc(T('exePick'))}</button></div>`
      if (trusted.length) return `<div class="ga-exe">${head}<ul>${trusted.map(e => `<li><code title="${esc(e.path)}">${esc(e.exe)}</code><em data-src="${e.source}">${esc(T('exeSrc_' + e.source))}</em></li>`).join('')}</ul></div>`
      if (guess) return `<div class="ga-exe" data-state="guess">${head}<p>${esc(T('exeGuess', { exe: guess.exe }))}</p><button type="button" class="nt-sec sm" data-act="useexe" data-id="${esc(g.id)}" data-path="${esc(guess.path)}">${esc(T('exeUse', { exe: guess.exe }))}</button></div>`
      return `<div class="ga-exe" data-state="none">${head}<p>${esc(T('exeNone'))}</p></div>`
    }
    function tuneHtml(g, s) {
      const m = g.model, prem = s.premium
      const rec = m.recIds.length
      const rows = m.rows.map(r => {
        const sw = P.canSwitch(r, prem), set = P.isSet(r), tone = P.rowTone(r)
        let why = ''
        if (r.status === 'noexe') why = T('whyNoExe'); else if (r.status === 'elsewhere') why = T('whyElsewhere'); else if (r.status === 'unknown') why = T('whyUnknown'); else if (r.status === 'drifted') why = T('whyDrift')
        const lock = !prem
        return `<div class="ga-row" data-status="${r.status}" data-tone="${tone}" data-rec="${r.rec ? 1 : 0}"><span class="ga-row-ico"><i class="fa fa-${esc(P.ROW_ICON[r.id] || 'sliders')}" aria-hidden="true"></i></span>
          <div class="ga-row-t"><b>${esc(T('row_' + r.id))}${r.rec ? `<em class="ga-rec">${esc(T('recommended'))}</em>` : ''}</b><span>${esc(T('rowS_' + r.id))}</span>${why ? `<span class="ga-why">${esc(why)}</span>` : ''}</div>
          <span class="nt-chip-s" data-tone="${tone}">${esc(T('st_' + r.status))}</span>
          ${lock ? `<button type="button" class="ga-lock" data-act="premium" aria-label="${esc(T('unlock'))}" title="${esc(T('lockedS'))}"><i class="fa fa-lock" aria-hidden="true"></i></button>`
            : `<button type="button" class="ga-sw" role="switch" aria-checked="${set}" data-act="row" data-id="${esc(g.id)}" data-row="${r.id}" ${sw || set ? '' : 'disabled'} aria-label="${esc(T('row_' + r.id))}"><i></i></button>`}</div>`
      }).join('')
      const legacy = g.legacy ? `<div class="ga-note" data-tone="warn"><i class="fa fa-triangle-exclamation" aria-hidden="true"></i><span>${esc(T('legacyNote'))}</span><button type="button" class="nt-sec sm" data-act="migrate">${esc(T('bnLegacyCta'))}</button></div>` : ''
      return `${legacy}${exeHtml(g)}<div class="ga-rows-h"><b>${esc(T('rowsT'))}</b>${rec && prem ? `<button type="button" class="nt-cta sm" data-act="tunegame" data-id="${esc(g.id)}"><i class="fa fa-wand-magic-sparkles" aria-hidden="true"></i>${esc(T('ctaTuneOne', { n: rec }))}</button>` : ''}</div>
        <div class="ga-rows">${rows}</div><p class="ga-foot">${esc(T('rowsFoot'))}</p>`
    }
    function perfHtml(g, s, st) {
      if (!st) return `<div class="nt-empty ga-empty"><i class="fa fa-chart-line" aria-hidden="true"></i><b>${esc(T('perfNoneT'))}</b><span>${esc(T(g.pulse ? 'perfNoneS' : 'perfNoneNoPreset'))}</span></div>`
      const imp = s.impacts[g.id] || { state: 'none' }, f = P.fmtHours(st.seconds), a = P.ago(st.last)
      const fps = n => (n ? Math.round(n) : '–')
      let impact = ''
      if (imp.state === 'ok') impact = `<div class="ga-impact" data-v="${imp.verdict}"><b>${esc(T('imp_' + imp.verdict))}</b><span>${esc(T('impS', { lows: imp.lowPct == null ? '–' : (imp.lowPct > 0 ? '+' : '') + imp.lowPct, avg: imp.avgPct == null ? '–' : (imp.avgPct > 0 ? '+' : '') + imp.avgPct, b: imp.before, a: imp.after }))}</span></div>`
      else if (imp.state === 'need') impact = `<div class="ga-impact" data-v="need"><b>${esc(T('impNeedT'))}</b><span>${esc(T('impNeedS', { min: imp.min, b: imp.before, a: imp.after }))}</span></div>`
      return `<div class="ga-stats"><div><b>${esc(T('dur_' + f.k, { n: f.n }))}</b><span>${esc(T('totTime'))}</span></div><div><b>${esc(String(st.sessions))}</b><span>${esc(T('totSessions'))}</span></div><div><b>${fps(st.avgFps)}</b><span>${esc(T('colAvg'))}</span></div><div><b>${fps(st.low1Fps)}</b><span>${esc(T('colLow'))}</span></div></div>
        ${st.trend && st.trend.length > 1 ? `<div class="ga-trend"><span>${esc(T('colTrend'))}</span>${sparkSvg(st.trend)}</div>` : ''}${impact}<p class="ga-foot">${esc(a ? T('lastSession', { when: T('ago_' + a.k, { n: a.n }) }) : '')} ${esc(T('perfFoot'))}</p>`
    }
    const sparkSvg = vals => { const d = P.spark(vals, 300, 56); return d ? `<svg class="ga-spark big" viewBox="0 0 300 56" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>` : '' }
    function tipsHtml(g) {
      const key = 'tip_' + String(g.knownId || '').replace(/-/g, '_')
      const tip = g.knownId && hasKey(key) ? T(key) : T('tip_generic')
      return `<div class="ga-tip"><i class="fa fa-lightbulb" aria-hidden="true"></i><p>${esc(tip)}</p></div>
        <dl class="ga-facts"><dt>${esc(T('fStore'))}</dt><dd>${esc(T('src_' + P.storeOf(g)))}</dd>${g.install ? `<dt>${esc(T('fPath'))}</dt><dd><code>${esc(g.install)}</code></dd>` : ''}<dt>${esc(T('fId'))}</dt><dd><code>${esc(g.id)}</code></dd>${(g.model.exes || []).length ? `<dt>${esc(T('fExes'))}</dt><dd>${g.model.exes.map(e => `<code>${esc(e.exe)}</code>`).join(' ')}</dd>` : ''}</dl>`
    }
    function mountCfg(g) {
      const h = detail.querySelector('#ga-cfg'); if (!h) return
      if (!premium()) { h.innerHTML = `<div class="ga-locked"><i class="fa fa-lock" aria-hidden="true"></i><span>${esc(T('lockedS'))}</span><button type="button" class="nt-sec sm" data-act="premium">${esc(T('unlock'))}</button></div>`; return }
      if (root.JylliGameCfg && root.JylliGameCfg.mount) root.JylliGameCfg.mount(h, g.gamecfg)
    }

    // ── actions ──
    async function execute(items, what) {
      if (S.busy || !items.length) return null
      S.busy = what; paintStage()
      let r = null
      try { r = await root.api.games2Run({ items }) } catch (e) { r = { ok: false, error: 'failed' } }
      S.busy = null
      if (!r || !r.run) { toast(T('title'), r && r.error === 'premium_required' ? T('lockedS') : T('runFailed'), 'err'); paintAll(); return r }
      if (r.snapshot) S.snap = r.snapshot
      S.history = null
      const ok = r.run.items.filter(i => i.ok).length, bad = r.run.items.length - ok
      const why = bad ? r.run.items.find(i => !i.ok) : null
      const reason = k => (hasKey('r_' + k) ? T('r_' + k) : T('r_failed'))
      toast(T('title'), bad ? T('doneSome', { ok, bad, why: why ? reason(why.reason) : '' }) : T('doneAll', { n: ok }), bad ? 'warn' : 'ok', 5000, ok ? { action: { label: T('undo'), onClick: () => undoRun(r.run.id) } } : undefined)
      paintAll()
      return r
    }
    async function undoRun(id) {
      if (S.busy) return
      S.busy = T('undoing'); paintStage()
      let r = null; try { r = await root.api.games2UndoRun({ runId: id }) } catch (e) { r = null }
      S.busy = null
      if (r && r.snapshot) S.snap = r.snapshot
      S.history = null
      toast(T('title'), r && r.ok ? T('undone') : T('undoFailed'), r && r.ok ? 'info' : 'warn')
      paintAll()
    }
    async function tuneAll() {
      const s = S.snap; if (!s) return
      const items = s.games.flatMap(g => g.model.recIds.map(row => ({ gameId: g.id, row, action: 'apply' })))
      if (!items.length) return
      const games = new Set(items.map(i => i.gameId)).size
      try { await root.showConfirm({ title: T('ctaTune', { n: games }), body: esc(T('confirmBody', { n: items.length, games })), okText: T('apply'), okStyle: 'primary', icon: 'fa-wand-magic-sparkles' }) } catch (e) { return }
      execute(items, T('whatAll', { n: games }))
    }
    function afterEdit(r) { if (r && r.snapshot) S.snap = r.snapshot; if (r && r.ok === false && r.error && !r.canceled) toast(T('title'), hasKey('e_' + r.error) ? T('e_' + r.error) : T('runFailed'), 'warn'); paintAll() }

    host.addEventListener('click', async e => {
      const chip = e.target.closest('[data-chip]')
      if (chip) { S.chip = chip.dataset.chip; lsSet('ga_chip', S.chip); paintTools(); paintGrid(); return }
      const lay = e.target.closest('button[data-layout]')   // not the grid wrapper, which also carries data-layout (it styles the grid)
      if (lay) { S.layout = lay.dataset.layout; lsSet('ga_layout', S.layout); paintTools(); paintGrid(); return }
      const b = e.target.closest('[data-act]'); if (!b || b.disabled) return
      const id = b.dataset.id, act = b.dataset.act
      switch (act) {
        case 'select': case 'open': S.sel = id; S.drawer = true; if (act === 'open' && S.view !== 'library') show('library'); else { paintGrid(); paintDetail() } if (act === 'open') { const n = gridWrap.querySelector(`.ga-card[data-id="${CSS.escape(id)}"]`); if (n && n.scrollIntoView) n.scrollIntoView({ block: 'nearest' }) } break
        case 'close': S.drawer = false; paintDetail(); break
        case 'tab': S.tab = b.dataset.tab; paintDetail(); break
        case 'fav': { const g = gameOf(id); if (g) { g.favorite = !g.favorite; try { await root.api.games2Favorite({ id, on: g.favorite }) } catch (er) { /* kept locally */ } paintTools(); paintGrid() } break }
        case 'rescan': S.loading = !S.snap; load({ refresh: true }); break
        case 'add': afterEdit(await root.api.games2AddCustom().catch(() => null)); break
        case 'pick': afterEdit(await root.api.games2PickExe({ gameId: id }).catch(() => null)); break
        case 'useexe': afterEdit(await root.api.games2UseExe({ gameId: id, path: b.dataset.path }).catch(() => null)); break
        case 'hide': { const g = gameOf(id); if (!g) break
          if (g.custom) afterEdit(await root.api.games2RemoveCustom({ id }).catch(() => null))
          else { afterEdit(await root.api.games2Hide({ id, on: true }).catch(() => null)); toast(T('title'), T('hidden', { name: g.name }), 'info', 6000, { action: { label: T('undo'), onClick: async () => afterEdit(await root.api.games2Hide({ id, on: false }).catch(() => null)) } }) }
          S.sel = defaultSel(); paintAll(); break }
        case 'play': { const r = await root.api.games2Launch({ gameId: id }).catch(() => null); toast(T('title'), r && r.ok ? T('launching', { name: (gameOf(id) || {}).name || '' }) : T('launchFailed'), r && r.ok ? 'ok' : 'warn'); if (r && r.ok) setTimeout(() => load({ quiet: true }), 12000); break }
        case 'compete': { const p = root.__gaCompete; if (p && p.select) p.select(id); break }
        case 'folder': root.api.games2OpenFolder({ gameId: id }); break
        case 'row': { const g = gameOf(id), r = g && g.model.rows.find(x => x.id === b.dataset.row); if (g && r) execute([{ gameId: id, row: r.id, action: P.isSet(r) ? 'restore' : 'apply' }], g.name); break }
        case 'tunegame': { const g = gameOf(id); if (g) execute(g.model.recIds.map(row => ({ gameId: id, row, action: 'apply' })), g.name); break }
        case 'tuneall': tuneAll(); break
        case 'migrate': { const r = await root.api.games2Migrate().catch(() => null); if (r && r.snapshot) S.snap = r.snapshot; toast(T('title'), r && r.ok ? T('migrated', { n: r.migrated || 0 }) : T('runFailed'), r && r.ok ? 'ok' : 'warn'); paintAll(); break }
        case 'undorun': undoRun(b.dataset.run); break
        case 'premium': try { root.JylliPremium.open() } catch (er) { /* pitch is optional */ } break
        case 'clear': S.q = ''; S.chip = 'all'; qIn.value = ''; paintTools(); paintGrid(); break
        case 'journal': root.showPage('changelog'); break
        case 'gopulse': root.showPage('pulse'); break
        case 'watcher': case 'autoWatcher': await root.toggleGameWatcher(); paintAll(); break
        case 'autopulse': root.toggleAutoPulse(); setTimeout(() => paintView('auto'), 50); break
        case 'reveal': { root.showPage(b.dataset.tab === 'gpu' ? 'hardware' : 'windows-opti', b.dataset.tab); const m = { gamemode: 'game-mode-on', gamedvr: 'game-dvr' }[b.dataset.id]; setTimeout(() => { try { root.JylliWindowsPage.reveal(m) } catch (er) { /* tab opens anyway */ } }, 400); break }
        case 'bundle-new': await bundleNew(); break
        case 'bundle-go': await bundleGo(b.dataset.name); break
        case 'bundle-del': await bundleDel(b.dataset.name); break
        default: break
      }
    })
    host.addEventListener('change', async e => {
      const s = e.target.closest('[data-act="assign"]'); if (!s) return
      root.settings['gameProfile_' + s.dataset.id] = s.value || ''
      await root.api.saveSettings(root.settings)
      toast(T('title'), s.value ? T('assigned', { name: s.value }) : T('unassigned'), s.value ? 'ok' : 'info')
    })
    // arrow keys move through the grid (rows of equal width)
    host.addEventListener('keydown', e => {
      const c = e.target.closest && e.target.closest('.ga-card'); if (!c || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
      const all = [...gridWrap.querySelectorAll('.ga-card')], i = all.indexOf(c); if (i < 0) return
      const cols = Math.max(1, all.filter(n => n.offsetTop === all[0].offsetTop).length)
      const next = { ArrowLeft: i - 1, ArrowRight: i + 1, ArrowUp: i - cols, ArrowDown: i + cols }[e.key]
      if (next >= 0 && next < all.length) { e.preventDefault(); all[next].focus() }
    })
    document.addEventListener('keydown', onEsc)
    function onEsc(e) { if (e.key === 'Escape' && S.drawer && window.innerWidth < 1100 && host.isConnected) { S.drawer = false; paintDetail() } }

    // ── bundles (saved setups: a Pulse preset + a tweak profile for one game) ──
    async function bundleNew() {
      const g = gameOf(S.sel)
      let name; try { name = await root.showPrompt({ title: T('bundT'), body: T('bundPrompt'), placeholder: T('bundPlaceholder'), okText: T('bundNew'), icon: 'fa-layer-group' }) } catch (e) { return }
      if (!name || !name.trim()) return
      const bundle = { name: name.trim(), gameId: g ? (g.knownId || g.id) : null, pulsePreset: (() => { try { return pulseIsActive ? pulseSelectedPreset : (g && g.pulse) || null } catch (e) { return (g && g.pulse) || null } })(), tweakProfileName: (g && root.settings['gameProfile_' + g.id]) || null, createdAt: Date.now() }
      const r = await root.api.saveGameBundle(bundle).catch(() => null)
      toast(T('bundT'), r && r.ok ? T('bundSaved', { name: bundle.name }) : T('runFailed'), r && r.ok ? 'ok' : 'warn')
      loadAuto()
    }
    async function bundleGo(name) {
      const r = await root.api.loadGameBundle(name).catch(e => ({ ok: false, error: e && e.message }))
      if (!r || !r.ok) { toast(name, T('runFailed'), 'err'); return }
      const failed = (r.results && r.results.tweakProfile && r.results.tweakProfile.failed) || []
      toast(T('bundT'), failed.length ? T('bundSome', { n: failed.length }) : T('bundOn', { name }), failed.length ? 'warn' : 'ok')
      try { if (r.bundle && r.bundle.pulsePreset && !pulseIsActive) await root.api.pulseStart({ presetId: r.bundle.pulsePreset }) } catch (e) { /* pulse start is best effort */ }
    }
    async function bundleDel(name) {
      try { await root.showConfirm({ title: T('bundDel'), body: esc(T('bundDelBody', { name })), okText: T('bundDel'), okStyle: 'danger', icon: 'fa-trash' }) } catch (e) { return }
      const r = await root.api.deleteGameBundle(name).catch(() => null)
      if (r && r.ok) { toast(T('bundT'), T('bundGone', { name }), 'info'); loadAuto() }
    }

    // ── lifecycle ──
    unsubs.push(root.api.onGames2Changed ? root.api.onGames2Changed(() => { clearTimeout(qTimer); qTimer = setTimeout(() => load({ quiet: true }), 400) }) : null)
    timer = setInterval(() => { if (!document.hidden && !S.busy && host.isConnected) load({ quiet: true }) }, SCAN_EVERY)
    paintTools(); paintAll()
    root.api.games2State().then(r => { if (!S.snap && r && r.snapshot) { S.snap = r.snapshot; S.loading = false; if (!S.sel) S.sel = defaultSel(); paintAll() } }).catch(() => {})
    load()

    current = {
      destroy() { S.disposed = true; clearInterval(timer); clearTimeout(qTimer); document.removeEventListener('keydown', onEsc); unsubs.forEach(f => { try { typeof f === 'function' && f() } catch (er) { /* already gone */ } }); host.remove(); if (current && current.host === host) current = null },
      host, reveal(id) { const g = gameOf(id) || (S.snap && S.snap.games.find(x => x.aliases.includes(id))); if (!g) { pendingReveal = id; return } S.sel = g.id; S.drawer = true; show('library') },
    }
    return current
  }

  api.mount = mount
  api.reveal = id => { if (current) current.reveal(id); else pendingReveal = id }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
