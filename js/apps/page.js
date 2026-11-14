'use strict'
// Apps tab "Backstage": what every background program costs right now (CPU, memory, video memory), the few documented changes that are worth
// making (each read back after it is written, each undoable) and Game time (programs step back while a game runs, then come back).
// Engine: lib/apps (main.js `// ─── Apps`). Three views: Apps, Game time, History. Root carries `jk nt ap` (reuses the shared nt- buttons / chips / banners).
;(function (root) {
  const P = root.JylliAppsPure || (typeof require === 'function' ? require('./pure') : null)
  const api = { mount() {}, reveal() {} }
  root.JylliAppsPage = api
  if (typeof document === 'undefined') return

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
  const lsGet = k => { try { return localStorage.getItem(k) } catch (e) { return null } }
  const lsSet = (k, v) => { try { localStorage.setItem(k, v) } catch (e) { /* storage may be unavailable */ } }
  const toast = (...a) => { try { root.toast(...a) } catch (e) { /* toast is optional */ } }
  // LANG / currentLang are page-level lets, not window properties: read them as globals.
  const hasKey = k => { try { const D = LANG[currentLang] && LANG[currentLang].apps2; return !!((D && k in D) || (LANG.en.apps2 && k in LANG.en.apps2)) } catch (e) { return false } }
  const T = (k, v) => root.tG('apps2', v && v.n === 1 && hasKey(k + '_1') ? k + '_1' : k, v)
  const COST_EVERY = 10000, SCAN_EVERY = 90000
  let current = null, pendingReveal = null

  function mount(c) {
    if (current) current.destroy()
    const host = el('div', 'jk nt ap')
    c.appendChild(host)
    const S = { snap: null, failed: false, loading: true, view: 'apps', chip: lsGet('ap_chip') || 'all', q: '', sel: null, drawer: false, busy: null, history: null, disposed: false }
    const unsubs = []
    let costTimer = null, scanTimer = null, qTimer = null, polling = false

    const bannerSlot = el('div', 'nt-banner-slot')
    const stage = el('section', 'ap-stage')
    const stageMain = el('div', 'ap-stage-main'), stageSide = el('div', 'ap-stage-side')
    stage.append(stageMain, stageSide)
    // Live refreshes rewrite a node only when its markup changed, and never while a button is held down (a click must not land on a replaced node).
    const setHtml = (n, h) => { if (n.__h === h) return false; n.__h = h; n.innerHTML = h; return true }
    let pressing = false
    const bar = el('div', 'nt-bar')
    const seg = root.JylliTab.seg(P.VIEWS.map(v => ({ id: v, label: T('seg_' + v), icon: P.VIEW_ICON[v] })), S.view, id => show(id))
    bar.appendChild(seg.el)
    const views = {}
    for (const k of P.VIEWS) { views[k] = el('div', 'nt-view ap-view'); views[k].hidden = k !== S.view }
    host.append(bannerSlot, stage, bar, ...P.VIEWS.map(v => views[v]))

    const finds = el('div', 'ap-finds')
    const tools = el('div', 'nt-tools ap-tools')
    tools.innerHTML = `<label class="nt-search"><i class="fa fa-magnifying-glass" aria-hidden="true"></i><input type="search" data-q placeholder="${esc(T('search'))}" aria-label="${esc(T('search'))}"></label><div class="nt-chips-bar" role="group" aria-label="${esc(T('chipsLabel'))}"></div>`
    const lib = el('div', 'ap-lib')
    const listWrap = el('div', 'ap-list-wrap'), detail = el('aside', 'ap-detail'); detail.setAttribute('aria-label', T('detailLabel'))
    lib.append(listWrap, detail)
    views.apps.append(finds, tools, lib)
    const chipsEl = tools.querySelector('.nt-chips-bar'), qIn = tools.querySelector('[data-q]')
    qIn.addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(() => { S.q = qIn.value; paintList() }, 120) })

    const appOf = id => (S.snap ? S.snap.apps.find(a => a.id === id) : null)
    const premium = () => !!(S.snap ? S.snap.premium : root.settings && root.settings.isPremium)
    const ctx = { T, esc, P, S }
    const reason = k => (hasKey('r_' + k) ? T('r_' + k) : T('r_failed'))

    function show(id) {
      if (!P.VIEWS.includes(id)) return
      S.view = id; seg.set(id)
      for (const k of P.VIEWS) views[k].hidden = k !== id
      paintView(id)
    }
    function paintView(id) {
      const V = root.JylliAppsViews
      if (id === 'apps') { paintFinds(); paintTools(); paintList(); paintDetail() }
      else if (id === 'gametime') V.gametime(views.gametime, ctx)
      else if (id === 'history') { V.history(views.history, ctx); if (!S.history) loadHistory() }
    }

    // ── data ──
    async function load({ quiet = false, cheap = false } = {}) {
      if (S.disposed) return
      if (!quiet && !S.snap) { S.loading = true; paintAll() }
      let r = null
      try { r = await (cheap ? root.api.apps2Cost() : root.api.apps2Scan()) } catch (e) { r = null }
      if (S.disposed) return
      if (!r || r.ok === false || !r.apps) { S.failed = !S.snap; S.loading = false; if (!quiet) toast(T('title'), T('scanFailed'), 'warn'); paintAll(); return }
      S.snap = r; S.failed = false; S.loading = false
      if (pendingReveal && appOf(pendingReveal)) { S.sel = pendingReveal; S.drawer = true; pendingReveal = null; show('apps') }
      if (S.sel && !appOf(S.sel)) S.sel = null
      if (cheap) paintLive(); else paintAll()
    }
    async function loadHistory() { try { S.history = await root.api.apps2History() } catch (e) { S.history = { runs: [], sessions: [], drift: [] } } if (S.view === 'history') root.JylliAppsViews.history(views.history, ctx) }

    // ── paint ──
    function paintAll() { if (S.disposed) return; paintBanner(); paintStage(); paintView(S.view) }
    /** The 10 s refresh: numbers only, no scroll or focus is lost. */
    function paintLive() { if (S.disposed || pressing) return; paintStage(); if (S.view === 'apps') { paintFinds(); paintList(); paintNow() } else if (S.view === 'gametime') root.JylliAppsViews.gametime(views.gametime, ctx) }

    function paintBanner() {
      const s = S.snap, rows = []
      if (S.failed) rows.push({ tone: 'warn', icon: 'plug-circle-exclamation', t: T('bnFailT'), s: T('bnFailS'), act: 'rescan', label: T('retry') })
      if (s && s.legacy && s.legacy.length) rows.push({ tone: 'warn', icon: 'rotate-left', t: T('bnLegacyT', { n: s.legacy.length }), s: T('bnLegacyS'), act: 'migrate', label: T('bnLegacyCta') })
      bannerSlot.innerHTML = rows.map(r => `<div class="nt-banner" data-tone="${r.tone}"><span class="nt-banner-ico"><i class="fa fa-${r.icon}" aria-hidden="true"></i></span><span class="nt-banner-t"><b>${esc(r.t)}</b><span>${esc(r.s)}</span></span>${r.act ? `<button type="button" class="nt-sec sm" data-act="${r.act}">${esc(r.label)}</button>` : ''}</div>`).join('')
    }

    const vars = s => {
      const t = s.totals || { cpu: 0, ram: 0, vram: null, apps: 0 }
      return { n: s.verdict.vars.n != null ? s.verdict.vars.n : t.apps, name: s.verdict.vars.name || '', ram: P.fmtMem(t.ram), cpu: P.fmtPct(t.cpu), vram: P.fmtVram(t.vram), apps: t.apps }
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
        const v = s.verdict, vr = vars(s)
        tone = { game: 'accent', attention: 'warn', busy: 'warn', quiet: 'ok', unknown: 'idle', empty: 'idle' }[v.kind] || 'idle'
        eyebrow = T('eyeApps', { n: s.apps.length })
        title = T('v_' + v.kind, vr)
        const leadKey = v.kind === 'game' ? (vr.n > 0 ? 'vS_game' : 'vS_game0') : v.kind === 'busy' && s.totals && s.totals.vram == null ? 'vS_busy_nv' : v.kind === 'quiet' && s.totals && s.totals.vram == null ? 'vS_quiet_nv' : 'vS_' + v.kind
        lead = T(leadKey, vr)
        const rec = s.counts.rec
        if (s.legacy && s.legacy.length) actions += btn('migrate', T('bnLegacyCta'), 'nt-cta', 'rotate-left')
        else if (rec > 0 && v.kind !== 'game') actions += btn('tune', T('ctaTune', { n: rec }), 'nt-cta', 'wand-magic-sparkles')
        else if (!s.gametime.enabled && s.gametime.preview.length) actions += btn('gt-toggle', T('ctaGameOn'), 'nt-cta', 'gamepad')
        actions += btn('rescan', T('rescan'), actions ? 'nt-sec' : 'nt-cta', 'arrows-rotate')
      }
      stage.dataset.tone = tone
      setHtml(stageMain, `<div class="nt-eyebrow"><span class="nt-dot"></span>${esc(eyebrow)}${s && s.measured ? `<span class="ap-live" title="${esc(T('liveS'))}"><i></i>${esc(T('live'))}</span>` : ''}</div>
        <h2 class="nt-title" data-tone="${tone}">${esc(title)}</h2><p class="nt-lead">${esc(lead)}</p><div class="nt-actions">${actions}</div>`)
      const showSide = !!(s && s.measured && s.apps.length)
      stageSide.hidden = !showSide
      setHtml(stageSide, showSide ? meters(s) : '')
    }

    function meters(s) {
      const t = s.totals || { cpu: 0, ram: 0, vram: null }
      const metric = (key, label, value, segs, note) => {
        const parts = P.barParts(segs)
        const bar = parts.length ? parts.map(p => p.id === '_rest'
          ? `<span class="ap-seg rest" style="flex-grow:${p.pct}" title="${esc(T('segRest', { n: p.n }))}"></span>`
          : p.pct < 6 ? `<span class="ap-seg tiny" style="flex-grow:${p.pct};--h:${P.hue(p.id)}" title="${esc(P.nameOf(p.id))}"></span>`      // too narrow to be a 24 px target: still named on hover, the list opens it
          : `<button type="button" class="ap-seg" data-act="open" data-id="${esc(p.id)}" style="flex-grow:${p.pct};--h:${P.hue(p.id)}" title="${esc(P.nameOf(p.id))}" aria-label="${esc(P.nameOf(p.id))}"></button>`).join('') : `<span class="ap-seg empty" style="flex-grow:1"></span>`
        return `<div class="ap-meter"><div class="ap-meter-h"><span>${esc(label)}</span><b>${esc(value)}</b></div><div class="ap-bar" role="img" aria-label="${esc(label + ' ' + value)}">${bar}</div>${note ? `<i class="ap-meter-n">${esc(note)}</i>` : ''}</div>`
      }
      const g = s.gametime
      return `<div class="ap-meters" aria-label="${esc(T('metersLabel'))}">
          ${metric('cpu', T('m_cpu'), P.fmtPct(t.cpu), s.segments.cpu)}${metric('ram', T('m_ram'), P.fmtMem(t.ram), s.segments.ram)}${metric('vram', T('m_vram'), P.fmtVram(t.vram), s.segments.vram, s.gpu ? '' : T('mNoVram'))}</div>
        <div class="ap-gtmini" data-on="${g.enabled ? 1 : 0}"><span class="ap-gtmini-t"><b>${esc(T('gtT'))}</b><i>${esc(g.active ? T('gtActiveS', { n: g.active.procs, apps: g.active.apps }) : g.enabled ? T(g.preview.length === 1 ? 'gtNow_1' : 'gtNow', { n: g.preview.length }) : T('gtOffShort'))}</i></span>
          <button type="button" class="ap-sw" role="switch" aria-checked="${g.enabled}" data-act="gt-toggle" aria-label="${esc(T('gtT'))}"><i></i></button></div>`
    }

    function paintFinds() {
      const s = S.snap
      const list = s ? s.findings.filter(f => f.kind !== 'legacy').slice(0, 4) : []
      finds.hidden = !list.length
      setHtml(finds, list.map(f => {
        const name = f.apps.length === 1 ? P.nameOf(f.apps[0]) : ''
        const v = { ...f.vars, name, mem: f.vars.mb != null ? P.fmtMem(f.vars.mb) : '', pct: f.vars.pct != null ? P.fmtPct(f.vars.pct) : '' }
        const act = f.act === 'open' && f.apps[0] ? `<button type="button" class="nt-sec sm" data-act="open" data-id="${esc(f.apps[0])}">${esc(T('review'))}</button>` : f.act === 'startup' ? `<button type="button" class="nt-sec sm" data-act="startup">${esc(T('openStartup'))}</button>` : f.act === 'gametime' ? `<button type="button" class="nt-sec sm" data-act="gt-toggle">${esc(T('ctaGameOn'))}</button>` : ''
        return `<div class="ap-find" data-tone="${f.tone}"><span class="ap-find-i"><i class="fa fa-${f.tone === 'warn' ? 'triangle-exclamation' : 'circle-info'}" aria-hidden="true"></i></span><span class="ap-find-t"><b>${esc(T('fT_' + f.kind.replace(/-/g, '_'), v))}</b><span>${esc(T('fS_' + f.kind.replace(/-/g, '_'), v))}</span></span>${act}</div>`
      }).join(''))
    }

    function paintTools() {
      const s = S.snap, counts = s ? P.chipCounts(s.apps) : {}
      const chips = ['all', 'running', 'attention', ...P.CATS]
      if (!chips.includes(S.chip)) S.chip = 'all'
      chipsEl.innerHTML = chips.map(ch => (ch !== 'all' && s && !counts[ch] && ch !== S.chip ? '' : `<button type="button" class="nt-chip" data-chip="${ch}" aria-pressed="${S.chip === ch}">${esc(T('chip_' + ch))}<b>${counts[ch] != null ? counts[ch] : ''}</b></button>`)).join('')
    }

    /** short = the list row: running and changes only (startup and Game time live in the panel), so every row is one line. */
    function chipsOf(a, short) {
      const out = []
      if (a.running) out.push(`<span class="ap-chip" data-k="run">${esc(T('st_running', { n: a.cost.n }))}</span>`)
      if (a.drift) out.push(`<span class="ap-chip" data-k="warn">${esc(T('st_drift'))}</span>`)
      else if (a.rows.length) { const on = a.rows.filter(P.isSet).length; out.push(`<span class="ap-chip" data-k="${a.rec.length ? 'rec' : on ? 'ok' : ''}">${esc(a.rec.length ? T('st_rec', { n: a.rec.length }) : T('st_changes', { on, total: a.rows.length }))}</span>`) }
      if (short) return out.join('')
      if (a.startup && a.startup.on) out.push(`<span class="ap-chip" data-k="start">${esc(T('st_startup'))}</span>`)
      if (a.stepping && S.snap && S.snap.gametime.enabled) out.push(`<span class="ap-chip" data-k="gt">${esc(T('lv_' + a.level))}</span>`)
      return out.join('')
    }
    function paintList() {
      const s = S.snap
      if (!s) {
        setHtml(listWrap, S.failed ? `<div class="nt-empty ap-empty"><i class="fa fa-plug-circle-exclamation" aria-hidden="true"></i><b>${esc(T('vFail'))}</b><span>${esc(T('vFailS'))}</span><button type="button" class="nt-sec sm" data-act="rescan">${esc(T('retry'))}</button></div>`
          : `<div class="ap-list" aria-busy="true">${Array.from({ length: 7 }, () => '<div class="ap-rowsk"></div>').join('')}</div>`)
        return
      }
      if (!s.apps.length) { setHtml(listWrap, `<div class="nt-empty ap-empty"><i class="fa fa-box-open" aria-hidden="true"></i><b>${esc(T('emptyT'))}</b><span>${esc(T('emptyS'))}</span><button type="button" class="nt-sec sm" data-act="rescan">${esc(T('rescan'))}</button></div>`); return }
      const list = P.sortApps(s.apps.filter(a => P.chipMatch(a, S.chip) && P.matches(a, S.q)))
      if (!list.length) { setHtml(listWrap, `<div class="nt-empty ap-empty"><i class="fa fa-magnifying-glass" aria-hidden="true"></i><b>${esc(T('noMatchT'))}</b><span>${esc(T('noMatchS', { q: S.q || T('chip_' + S.chip) }))}</span><button type="button" class="nt-sec sm" data-act="clear">${esc(T('clear'))}</button></div>`); return }
      const focusId = document.activeElement && document.activeElement.dataset && document.activeElement.classList.contains('ap-row') ? document.activeElement.dataset.id : null
      const sp = s.spark || {}
      const changed = setHtml(listWrap, `<div class="ap-list" role="listbox" aria-label="${esc(T('listLabel'))}"><div class="ap-th" aria-hidden="true"><span></span><span>${esc(T('colApp'))}</span><span class="ap-th-c"></span><span>${esc(T('m_cpu'))}</span><span>${esc(T('m_ram'))}</span><span>${esc(T('colVram'))}</span></div>${list.map(a => row(a, sp[a.id])).join('')}</div>`)
      if (changed && focusId) { const f = listWrap.querySelector(`.ap-row[data-id="${CSS.escape(focusId)}"]`); if (f) f.focus({ preventScroll: true }) }
    }
    function row(a, hist) {
      const c = a.cost, d = P.spark(hist, 64, 20)
      return `<button type="button" class="ap-row" role="option" aria-selected="${a.id === S.sel}" data-act="select" data-id="${esc(a.id)}" data-running="${a.running ? 1 : 0}" data-tone="${a.drift ? 'warn' : ''}">
        ${root.JylliAppsViews.icon(P, esc, a.id)}<span class="ap-nm"><b>${esc(P.nameOf(a.id))}</b><i>${esc(a.vendor)} · ${esc(T('role_' + a.role))}</i></span>
        <span class="ap-chips">${chipsOf(a, true)}</span>
        <span class="ap-c" data-m="cpu">${a.running ? esc(P.fmtPct(c.cpu)) : '–'}${d && a.running ? `<svg class="ap-spark" viewBox="0 0 64 20" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''}</span>
        <span class="ap-c" data-m="ram">${a.running ? esc(P.fmtMem(c.ram)) : '–'}</span><span class="ap-c" data-m="vram">${a.running ? esc(P.fmtVram(c.vram)) : '–'}</span></button>`
    }

    // ── detail ──
    function nowHtml(a) {
      if (!a.running) return `<p class="ap-p">${esc(T('notRunning'))}</p>`
      const c = a.cost, procs = c.procs.slice(0, 6)
      return `<div class="ap-stats"><div><b>${esc(P.fmtPct(c.cpu))}</b><span>${esc(T('m_cpu'))}</span></div><div><b>${esc(P.fmtMem(c.ram))}</b><span>${esc(T('m_ram'))}</span></div><div><b>${esc(P.fmtVram(c.vram))}</b><span>${esc(T('m_vram'))}</span></div><div><b>${c.n}</b><span>${esc(T('procs'))}</span></div></div>
        <div class="ap-procs">${procs.map(p => `<div class="ap-proc"><code>${esc(p.name)}</code><span>${esc(P.fmtPct(p.cpu))}</span><span>${esc(P.fmtMem(p.ram))}</span><span>${esc(p.cls ? T('cls_' + p.cls) : '–')}</span></div>`).join('')}${c.procs.length > procs.length ? `<p class="ap-foot">${esc(T('procsMore', { n: c.procs.length - procs.length }))}</p>` : ''}</div>`
    }
    function paintNow() {
      const a = S.sel ? appOf(S.sel) : null, n = detail.querySelector('.ap-now'); if (a && n) n.innerHTML = nowHtml(a)
    }
    function rowsHtml(a) {
      if (!a.rows.length) return `<p class="ap-p">${esc(T('noChanges'))}</p>`
      const policy = a.rows.some(r => r.kind === 'policy')
      const items = a.rows.map(r => {
        const set = P.isSet(r), tone = P.rowTone(r), sw = P.canSwitch(r)
        let why = ''
        if (r.status === 'elsewhere') why = T('whyElsewhere'); else if (r.status === 'unknown') why = T('whyUnknown'); else if (r.status === 'drifted') why = T('whyDrift')
        else if (r.restart && set && r.remembered === 'applied') why = T('whyRestart', { name: P.nameOf(a.id) })
        return `<div class="ap-rw" data-status="${r.status}" data-tone="${tone}"><span class="ap-rw-i"><i class="fa fa-${esc(P.ROW_ICON[r.id] || 'sliders')}" aria-hidden="true"></i></span>
          <div class="ap-rw-t"><b>${esc(T('row_' + r.id))}${a.rec.includes(r.id) ? `<em class="ap-rec">${esc(T('recommended'))}</em>` : ''}</b><span>${esc(T('rowS_' + r.id))}</span>${why ? `<span class="ap-why">${esc(why)}</span>` : ''}</div>
          <span class="nt-chip-s" data-tone="${tone}">${esc(T('st_' + r.status))}</span>
          <button type="button" class="ap-sw" role="switch" aria-checked="${set}" data-act="row" data-row="${r.id}" ${sw || set ? '' : 'disabled'} aria-label="${esc(T('row_' + r.id))}"><i></i></button></div>`
      }).join('')
      return `<div class="ap-rws">${items}</div>${policy ? `<p class="ap-foot">${esc(T('managedNote'))}</p>` : ''}`
    }
    function paintDetail() {
      const s = S.snap, a = s && S.sel ? appOf(S.sel) : null
      detail.dataset.open = S.drawer ? '1' : '0'
      if (!a) { detail.innerHTML = `<div class="nt-empty ap-empty"><i class="fa fa-hand-pointer" aria-hidden="true"></i><b>${esc(T('pickT'))}</b><span>${esc(T('pickS'))}</span></div>`; return }
      const start = a.startup
      detail.innerHTML = `<header class="ap-d-hero" style="--h:${P.hue(a.id)}"><button type="button" class="ap-d-close" data-act="close" aria-label="${esc(T('close'))}"><i class="fa fa-xmark" aria-hidden="true"></i></button>
          <div class="ap-d-id">${root.JylliAppsViews.icon(P, esc, a.id, 'ap-ico big')}<div class="ap-d-name"><h3>${esc(P.nameOf(a.id))}</h3><span>${esc(a.vendor)} · ${esc(T('role_' + a.role))}</span></div></div>
          <div class="ap-chips">${chipsOf(a)}</div></header>
        <div class="ap-d-body">
          <section><div class="ap-sec-h"><b>${esc(T('dNow'))}</b></div><div class="ap-now">${nowHtml(a)}</div></section>
          <section><div class="ap-sec-h"><b>${esc(T('dChanges'))}</b>${a.rec.length ? `<button type="button" class="nt-cta sm" data-act="tuneapp" data-id="${esc(a.id)}"><i class="fa fa-wand-magic-sparkles" aria-hidden="true"></i>${esc(T('applyRec', { n: a.rec.length }))}</button>` : ''}</div>${rowsHtml(a)}</section>
          <section><div class="ap-sec-h"><b>${esc(T('dGame'))}</b></div><p class="ap-p">${esc(T('gtWhy_' + a.role + '_long'))}</p>${root.JylliAppsViews.levels(ctx, a)}
            ${S.snap.gametime.enabled ? '' : `<p class="ap-foot">${esc(T('dGameOff'))}</p>`}</section>
          ${start ? `<section><div class="ap-sec-h"><b>${esc(T('dStartup'))}</b></div><p class="ap-p">${esc(T(start.on ? 'dStartupOn' : 'dStartupOff', { name: P.nameOf(a.id) }))}</p><button type="button" class="nt-sec sm" data-act="startup"><i class="fa fa-power-off" aria-hidden="true"></i>${esc(T('openStartup'))}</button></section>` : ''}
        </div>`
    }

    // ── actions ──
    async function execute(items, what) {
      if (S.busy || !items.length) return null
      S.busy = what; paintStage()
      let r = null
      try { r = await root.api.apps2Run({ items }) } catch (e) { r = { ok: false, error: 'failed' } }
      S.busy = null
      if (!r || !r.run) { toast(T('title'), T('runFailed'), 'err'); paintAll(); return r }
      if (r.snapshot) S.snap = r.snapshot
      S.history = null
      const real = r.run.items.filter(i => !i.noop), ok = real.filter(i => i.ok).length, bad = real.length - ok
      const why = bad ? real.find(i => !i.ok) : null
      toast(T('title'), bad ? T('doneSome', { ok, bad, why: why ? reason(why.reason) : '' }) : T('doneAll', { n: ok }), bad ? 'warn' : 'ok', 5000, ok ? { action: { label: T('undo'), onClick: () => undoRun(r.run.id) } } : undefined)
      paintAll()
      return r
    }
    async function undoRun(id) {
      if (S.busy) return
      S.busy = T('undoing'); paintStage()
      let r = null; try { r = await root.api.apps2UndoRun({ runId: id }) } catch (e) { r = null }
      S.busy = null
      if (r && r.snapshot) S.snap = r.snapshot
      S.history = null
      toast(T('title'), r && r.ok ? T('undone') : T('undoFailed'), r && r.ok ? 'info' : 'warn')
      paintAll()
    }
    async function tuneAll() {
      const s = S.snap; if (!s) return
      const items = s.apps.flatMap(a => a.rec.map(row => ({ row, action: 'apply' })))
      if (!items.length) return
      try { await root.showConfirm({ title: T('ctaTune', { n: items.length }), body: esc(T('confirmBody', { n: items.length })), okText: T('apply'), okStyle: 'primary', icon: 'fa-wand-magic-sparkles' }) } catch (e) { return }
      execute(items, T('whatAll', { n: items.length }))
    }
    async function rules(req) {
      let r = null; try { r = await root.api.apps2RulesSet(req) } catch (e) { r = null }
      if (!r || r.ok === false) { toast(T('title'), T('runFailed'), 'warn'); return false }
      if (r.snapshot) S.snap = r.snapshot
      paintAll()
      return true
    }

    host.addEventListener('click', async e => {
      const chip = e.target.closest('[data-chip]')
      if (chip) { S.chip = chip.dataset.chip; lsSet('ap_chip', S.chip); paintTools(); paintList(); return }
      const b = e.target.closest('[data-act]'); if (!b || b.disabled) return
      const id = b.dataset.id, act = b.dataset.act
      switch (act) {
        case 'select': case 'open': S.sel = id; S.drawer = true; if (S.view !== 'apps') show('apps'); else { paintList(); paintDetail() } if (act === 'open') { const n = listWrap.querySelector(`.ap-row[data-id="${CSS.escape(id)}"]`); if (n) n.scrollIntoView({ block: 'nearest' }) } break
        case 'close': S.drawer = false; paintDetail(); break
        case 'rescan': S.loading = !S.snap; load(); break
        case 'clear': S.q = ''; S.chip = 'all'; qIn.value = ''; paintTools(); paintList(); break
        case 'row': { const a = appOf(S.sel), r = a && a.rows.find(x => x.id === b.dataset.row); if (a && r) execute([{ row: r.id, action: P.isSet(r) ? 'restore' : 'apply' }], P.nameOf(a.id)); break }
        case 'tuneapp': { const a = appOf(id); if (a) execute(a.rec.map(row => ({ row, action: 'apply' })), P.nameOf(a.id)); break }
        case 'tune': tuneAll(); break
        case 'undorun': undoRun(b.dataset.run); break
        case 'level': {
          if (b.dataset.locked) { try { root.JylliPremium.open() } catch (er) { /* pitch is optional */ } break }
          await rules({ picks: { [id]: b.dataset.level } }); break
        }
        case 'gt-toggle': { const on = !(S.snap && S.snap.gametime.enabled); if (await rules({ enabled: on })) toast(T('gtT'), on ? T('gtTurnedOn') : T('gtTurnedOff'), on ? 'ok' : 'info'); break }
        case 'gt-end': { const r = await root.api.apps2GameEnd().catch(() => null); toast(T('gtT'), r && r.ok ? T('gtEnded') : T('runFailed'), r && r.ok ? 'ok' : 'warn'); load({ quiet: true, cheap: true }); break }
        case 'migrate': { S.busy = T('whatMigrate'); paintStage(); const r = await root.api.apps2Migrate().catch(() => null); S.busy = null; if (r && r.snapshot) S.snap = r.snapshot; toast(T('title'), r && r.ok ? T('migrated', { n: r.migrated || 0 }) : T('migrateSome', { n: (r && r.failed) || 0 }), r && r.ok ? 'ok' : 'warn'); paintAll(); break }
        case 'startup': root.showPage('startup-manager'); break
        case 'journal': root.showPage('changelog'); break
        default: break
      }
    })
    host.addEventListener('keydown', e => {
      const r = e.target.closest && e.target.closest('.ap-row'); if (!r || !['ArrowUp', 'ArrowDown'].includes(e.key)) return
      const all = [...listWrap.querySelectorAll('.ap-row')], i = all.indexOf(r)
      const next = e.key === 'ArrowUp' ? i - 1 : i + 1
      if (next >= 0 && next < all.length) { e.preventDefault(); all[next].focus() }
    })
    host.addEventListener('pointerdown', () => { pressing = true })
    const release = () => setTimeout(() => { pressing = false }, 0)
    document.addEventListener('pointerup', release); document.addEventListener('pointercancel', release)
    document.addEventListener('keydown', onEsc)
    function onEsc(e) { if (e.key === 'Escape' && S.drawer && window.innerWidth < 1100 && host.isConnected) { S.drawer = false; paintDetail() } }

    // ── lifecycle ──
    unsubs.push(root.api.onApps2Changed ? root.api.onApps2Changed(() => { clearTimeout(qTimer); qTimer = setTimeout(() => load({ quiet: true, cheap: true }), 400) }) : null)
    const tick = () => document.hidden || S.busy || polling || !host.isConnected || S.disposed || (S.snap && S.snap.gametime.active)
    costTimer = setInterval(async () => { if (tick()) return; polling = true; try { await load({ quiet: true, cheap: true }) } finally { polling = false } }, COST_EVERY)
    scanTimer = setInterval(() => { if (!tick()) load({ quiet: true }) }, SCAN_EVERY)
    paintTools(); paintAll()
    root.api.apps2State().then(r => { if (!S.snap && r && r.snapshot) { S.snap = r.snapshot; S.loading = false; paintAll() } }).catch(() => {})
    load()

    current = {
      destroy() { S.disposed = true; clearInterval(costTimer); clearInterval(scanTimer); clearTimeout(qTimer); document.removeEventListener('keydown', onEsc); document.removeEventListener('pointerup', release); document.removeEventListener('pointercancel', release); unsubs.forEach(f => { try { typeof f === 'function' && f() } catch (er) { /* already gone */ } }); host.remove(); if (current && current.host === host) current = null },
      host, reveal(id) { if (!appOf(id)) { pendingReveal = id; return } S.sel = id; S.drawer = true; show('apps') },
    }
    return current
  }

  api.mount = mount
  api.reveal = id => { if (current) current.reveal(id); else pendingReveal = id }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
