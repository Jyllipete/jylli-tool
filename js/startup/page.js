'use strict'
// Startup tab "Ignition": everything that starts with Windows through Windows' own on/off switch (so Task Manager always agrees), what each program
// costs (Windows' own boot events, memory now), safe changes that are read back and undoable, and boot times with a before/after comparison.
// Engine: lib/startup (main.js `// ─── Startup`). Three views: Programs, Boot, History. Root carries `jk nt su` (reuses the shared nt- buttons / chips / banners).
;(function (root) {
  const P = root.JylliStartupPure || (typeof require === 'function' ? require('./pure') : null)
  const api = { mount() {}, reveal() {} }
  root.JylliStartupPage = api
  if (typeof document === 'undefined') return

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
  const lsGet = k => { try { return localStorage.getItem(k) } catch (e) { return null } }
  const lsSet = (k, v) => { try { localStorage.setItem(k, v) } catch (e) { /* storage may be unavailable */ } }
  const toast = (...a) => { try { root.toast(...a) } catch (e) { /* toast is optional */ } }
  // LANG / currentLang are page-level lets, not window properties: read them as globals.
  const hasKey = k => { try { const D = LANG[currentLang] && LANG[currentLang].startup2; return !!((D && k in D) || (LANG.en.startup2 && k in LANG.en.startup2)) } catch (e) { return false } }
  const T = (k, v) => root.tG('startup2', v && (v.n === 1 || v.worth === 1) && hasKey(k + '_1') ? k + '_1' : k, v)
  const LIVE_EVERY = 15000
  let current = null, pendingReveal = null

  function mount(c) {
    if (current) current.destroy()
    const host = el('div', 'jk nt su')
    c.appendChild(host)
    const S = { snap: null, failed: false, loading: true, view: 'programs', chip: lsGet('su_chip') || 'all', q: '', sel: null, drawer: false, busy: null, history: null, icons: {}, laneOpen: { off: lsGet('su_off') === '1' }, disposed: false }
    const unsubs = []
    let liveTimer = null, qTimer = null, polling = false, pressing = false

    const bannerSlot = el('div', 'nt-banner-slot')
    const stage = el('section', 'su-stage'); stage.id = 'su-stage'
    const stageMain = el('div', 'su-stage-main'), stageSide = el('div', 'su-stage-side')
    stage.append(stageMain, stageSide)
    // Live refreshes rewrite a node only when its markup changed, and never while a button is held down (a click must not land on a replaced node).
    const setHtml = (n, h) => { if (n.__h === h) return false; n.__h = h; n.innerHTML = h; return true }
    const bar = el('div', 'nt-bar')
    const seg = root.JylliTab.seg(P.VIEWS.map(v => ({ id: v, label: T('seg_' + v), icon: P.VIEW_ICON[v] })), S.view, id => show(id))
    bar.appendChild(seg.el)
    const views = {}
    for (const k of P.VIEWS) { views[k] = el('div', 'nt-view su-view'); views[k].hidden = k !== S.view }
    host.append(bannerSlot, stage, bar, ...P.VIEWS.map(v => views[v]))
    const live = el('div', 'su-sr'); live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite'); host.appendChild(live)

    const finds = el('div', 'su-finds')
    const tools = el('div', 'nt-tools su-tools'); tools.id = 'su-tools'
    tools.innerHTML = `<label class="nt-search"><i class="fa fa-magnifying-glass" aria-hidden="true"></i><input type="search" data-q placeholder="${esc(T('search'))}" aria-label="${esc(T('search'))}"></label><div class="nt-chips-bar" role="group" aria-label="${esc(T('chipsLabel'))}"></div>`
    const lib = el('div', 'su-lib')
    const listWrap = el('div', 'su-list-wrap'); listWrap.id = 'su-list'; const  detail = el('aside', 'su-detail'); detail.setAttribute('aria-label', T('detailLabel'))
    lib.append(listWrap, detail)
    views.programs.append(finds, tools, lib)
    const chipsEl = tools.querySelector('.nt-chips-bar'), qIn = tools.querySelector('[data-q]')
    qIn.addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(() => { S.q = qIn.value; paintList() }, 120) })

    const entryOf = id => (S.snap ? S.snap.entries.find(e => e.id === id) : null)
    const premium = () => !!(S.snap ? S.snap.premium : root.settings && root.settings.isPremium)
    const ctx = { T, esc, P, S }
    const reason = k => (hasKey('r_' + k) ? T('r_' + k) : T('r_failed'))
    const say = msg => { live.textContent = ''; setTimeout(() => { live.textContent = msg }, 30) }

    function show(id) {
      if (!P.VIEWS.includes(id)) return
      S.view = id; seg.set(id)
      for (const k of P.VIEWS) views[k].hidden = k !== id
      paintView(id)
    }
    function paintView(id) {
      const V = root.JylliStartupViews
      if (id === 'programs') { paintFinds(); paintTools(); paintList(); paintDetail() }
      else if (id === 'boot') V.boot(views.boot, ctx)
      else if (id === 'history') { V.history(views.history, ctx); if (!S.history) loadHistory() }
    }

    // ── data ──
    async function load({ quiet = false, forceBoot = false } = {}) {
      if (S.disposed) return
      if (!quiet && !S.snap) { S.loading = true; paintAll() }
      let r = null
      try { r = await root.api.startup2Scan({ forceBoot }) } catch (e) { r = null }
      if (S.disposed) return
      if (!r || r.ok === false || !r.entries) { S.failed = !S.snap; S.loading = false; if (!quiet) toast(T('title'), T('scanFailed'), 'warn'); paintAll(); return }
      S.snap = r; S.failed = false; S.loading = false
      if (pendingReveal && entryOf(pendingReveal)) { S.sel = pendingReveal; S.drawer = true; pendingReveal = null; show('programs') }
      if (S.sel && !entryOf(S.sel)) S.sel = null
      paintAll()
      loadIcons()
    }
    async function loadIcons() {
      let m = null; try { m = await root.api.startup2Icons() } catch (e) { m = null }
      if (S.disposed || !m || !Object.keys(m).length) return
      S.icons = { ...S.icons, ...m }
      if (S.view === 'programs') { paintList(); paintDetail() }
    }
    async function loadHistory() { try { S.history = await root.api.startup2History() } catch (e) { S.history = { runs: [], guard: [], fresh: [], cameBack: [], boots: [] } } if (S.view === 'history') root.JylliStartupViews.history(views.history, ctx) }
    async function liveTick() {
      if (S.disposed || polling || S.busy || document.hidden || !host.isConnected || !S.snap || S.view !== 'programs') return
      polling = true
      try {
        const r = await root.api.startup2Live()
        if (!r || !r.running || S.disposed || !S.snap) return
        let changed = false
        for (const e of S.snap.entries) { const n = r.running[e.id] || null; if (JSON.stringify(n) !== JSON.stringify(e.running || null)) { e.running = n; changed = true } }
        if (changed && !pressing) { paintList(); paintNow() }
      } catch (e) { /* the next tick tries again */ } finally { polling = false }
    }

    // ── paint ──
    function paintAll() { if (S.disposed) return; paintBanner(); paintStage(); paintView(S.view) }

    function paintBanner() {
      const s = S.snap, rows = []
      if (S.failed) rows.push({ tone: 'warn', icon: 'plug-circle-exclamation', t: T('bnFailT'), s: T('bnFailS'), act: 'rescan', label: T('retry') })
      if (s && s.legacy && s.legacy.length) rows.push({ tone: 'warn', icon: 'rotate-left', t: T('bnLegacyT', { n: s.legacy.length }), s: T('bnLegacyS'), act: 'migrate', label: T('bnLegacyCta') })
      if (s && s.read && s.admin === false) rows.push({ tone: 'info', icon: 'user-shield', t: T('bnAdminT'), s: T('bnAdminS') })
      bannerSlot.innerHTML = rows.map(r => `<div class="nt-banner" data-tone="${r.tone}"><span class="nt-banner-ico"><i class="fa fa-${r.icon}" aria-hidden="true"></i></span><span class="nt-banner-t"><b>${esc(r.t)}</b><span>${esc(r.s)}</span></span>${r.act ? `<button type="button" class="nt-sec sm" data-act="${r.act}">${esc(r.label)}</button>` : ''}</div>`).join('')
    }

    function paintStage() {
      const s = S.snap
      stage.dataset.state = S.busy ? 'run' : S.loading ? 'scan' : 'ready'
      let tone = 'idle', eyebrow, title, lead, actions = ''
      const btn = (act, label, cls, icon) => `<button type="button" class="${cls}" data-act="${act}">${icon ? `<i class="fa fa-${icon}" aria-hidden="true"></i>` : ''}${esc(label)}</button>`
      if (S.busy) {
        tone = 'accent'; eyebrow = T('eyeRun'); title = T('vRun'); lead = T('vRunS', { what: S.busy })
        actions = `<button type="button" class="nt-cta" disabled><i class="fa fa-circle-notch fa-spin" aria-hidden="true"></i>${esc(T('working'))}</button>`
      } else if (!s) {
        eyebrow = T('eyeScan'); title = S.failed ? T('vFail') : T('vScan'); lead = S.failed ? T('vFailS') : T('vScanS'); tone = S.failed ? 'warn' : 'idle'
        if (S.failed) actions = btn('rescan', T('retry'), 'nt-cta', 'arrows-rotate')
      } else {
        const v = s.verdict
        const vr = { on: v.vars.on, total: v.vars.total, worth: v.vars.worth, mb: v.vars.mb != null ? P.fmtMem(v.vars.mb) : '', boot: v.vars.boot != null ? P.fmtBoot(v.vars.boot) : '' }
        tone = { worth: 'warn', lean: 'ok', unread: 'warn', empty: 'idle' }[v.kind] || 'idle'
        eyebrow = T('eyeReady', { n: s.counts.total })
        title = T('v_' + v.kind, vr)
        lead = T('vS_' + v.kind + (v.kind === 'lean' && !vr.mb ? '_nomem' : ''), vr)
        const rec = s.rec.length
        if (s.legacy && s.legacy.length) actions += btn('migrate', T('bnLegacyCta'), 'nt-cta', 'rotate-left')
        else if (rec > 0) actions += btn('tune', T('ctaTune', { n: rec }), 'nt-cta', 'wand-magic-sparkles')
        actions += btn('rescan', T('rescan'), actions ? 'nt-sec' : 'nt-cta', 'arrows-rotate')
      }
      stage.dataset.tone = tone
      setHtml(stageMain, `<div class="nt-eyebrow"><span class="nt-dot"></span>${esc(eyebrow)}${s && s.live ? `<span class="su-live" title="${esc(T('liveS'))}"><i></i>${esc(T('live'))}</span>` : ''}</div>
        <h2 class="nt-title" data-tone="${tone}">${esc(title)}</h2><p class="nt-lead">${esc(lead)}</p><div class="nt-actions">${actions}</div>`)
      const showSide = !!(s && s.read && s.entries.length)
      stageSide.hidden = !showSide
      setHtml(stageSide, showSide ? side(s) : '')
    }

    function side(s) {
      const b = s.boot, sum = b.summary
      let boot
      if (sum && sum.last) {
        const last = sum.last
        const main = last.mainMs != null && last.mainMs <= last.ms ? Math.round((last.mainMs / last.ms) * 1000) / 10 : null
        const trend = sum.trend && Math.abs(sum.trend.deltaMs) >= 2000 ? `<i class="su-trend" data-dir="${sum.trend.deltaMs < 0 ? 'down' : 'up'}">${esc(T(sum.trend.deltaMs < 0 ? 'trendFasterShort' : 'trendSlowerShort', { s: P.fmtBoot(Math.abs(sum.trend.deltaMs)) }))}</i>` : ''
        boot = `<div class="su-meter"><div class="su-meter-h"><span>${esc(T('sideBoot'))}</span><b>${esc(P.fmtBoot(last.ms))}</b></div>
          <div class="su-phase" role="img" aria-label="${esc(T('sideBoot') + ' ' + P.fmtBoot(last.ms))}"><span class="su-phase-main" style="width:${main != null ? main : 100}%"></span></div>
          <div class="su-phase-l"><span>${esc(main != null ? T('bt_desktop') + ' ' + P.fmtBoot(last.mainMs) : T('bt_total'))}</span>${trend}</div></div>`
      } else {
        const why = b.status === 'denied' ? T('bootDenied') : b.status === 'error' ? T('bootError') : T('bootNone')
        boot = `<div class="su-meter"><div class="su-meter-h"><span>${esc(T('sideBoot'))}</span><b>–</b></div><i class="su-meter-n">${esc(why)}</i></div>`
      }
      const parts = P.stack(s.entries.filter(e => e.enabled))
      const stackBar = parts.length ? parts.map(p => {
        const e = entryOf(p.id)
        const nm = e ? P.display(e) : ''
        return p.pct < 14 ? `<span class="su-seg tiny" data-lane="${esc(p.lane)}" style="flex-grow:${p.pct}" title="${esc(nm)}"></span>`
          : `<button type="button" class="su-seg" data-lane="${esc(p.lane)}" data-measured="${p.measured ? 1 : 0}" data-act="open" data-id="${esc(p.id)}" style="flex-grow:${p.pct}" title="${esc(nm)}" aria-label="${esc(nm)}"></button>`
      }).join('') : `<span class="su-seg empty" style="flex-grow:1"></span>`
      const c = s.counts
      const stack = `<div class="su-meter"><div class="su-meter-h"><span>${esc(T('stackT'))}</span><b>${esc(T('stackN', { n: c.on }))}</b></div>
        <div class="su-stack" role="img" aria-label="${esc(T('stackT'))}">${stackBar}</div>
        <div class="su-legend"><span data-lane="worth">${esc(T('lg_worth'))}</span><span data-lane="call">${esc(T('lg_call'))}</span><span data-lane="keep">${esc(T('lg_keep'))}</span></div>
        <i class="su-meter-n">${esc(T(c.measured ? 'stackNoteM' : 'stackNoteT'))}</i></div>`
      const mini = `<div class="su-mini"><span><b>${c.on}</b>${esc(T('mn_on'))}</span><span><b>${c.delayed}</b>${esc(T('mn_delayed'))}</span><span><b>${c.off}</b>${esc(T('mn_off'))}</span></div>`
      return `<div class="su-meters" aria-label="${esc(T('metersLabel'))}">${boot}${stack}</div>${mini}`
    }

    function paintFinds() {
      const s = S.snap
      const list = s ? s.findings.filter(f => f.kind !== 'legacy' && f.kind !== 'noAdmin').slice(0, 4) : []
      finds.hidden = !list.length
      setHtml(finds, list.map(f => {
        const v = { ...f.vars }
        const act = f.act === 'open' && f.ids[0] ? `<button type="button" class="nt-sec sm" data-act="open" data-id="${esc(f.ids[0])}">${esc(T('review'))}</button>` : ''
        const e = f.ids[0] ? entryOf(f.ids[0]) : null
        if (e) v.name = P.display(e)
        return `<div class="su-find" data-tone="${f.tone}"><span class="su-find-i"><i class="fa fa-${f.tone === 'warn' ? 'triangle-exclamation' : 'circle-info'}" aria-hidden="true"></i></span><span class="su-find-t"><b>${esc(T('fT_' + f.kind, v))}</b><span>${esc(T('fS_' + f.kind, v))}</span></span>${act}</div>`
      }).join(''))
    }

    function paintTools() {
      const s = S.snap, counts = s ? P.chipCounts(s.entries) : {}
      if (!P.CHIPS.includes(S.chip)) S.chip = 'all'
      chipsEl.innerHTML = P.CHIPS.map(ch => (ch !== 'all' && s && !counts[ch] && ch !== S.chip ? '' : `<button type="button" class="nt-chip" data-chip="${ch}" aria-pressed="${S.chip === ch}">${esc(T('chip_' + ch))}<b>${counts[ch] != null ? counts[ch] : ''}</b></button>`)).join('')
    }

    const stateChips = e => {
      const out = []
      if (e.cameBack) out.push(`<span class="su-chip" data-k="warn">${esc(T('ch_back'))}</span>`)
      if (e.broken && e.enabled) out.push(`<span class="su-chip" data-k="warn">${esc(T('ch_broken'))}</span>`)
      if (e.isNew) out.push(`<span class="su-chip" data-k="new">${esc(T('ch_new'))}</span>`)
      if (e.delayed && e.delay) out.push(`<span class="su-chip" data-k="delay">${esc(T('ch_delayed', { s: e.delay.sec }))}</span>`)
      if (e.pinned) out.push(`<span class="su-chip" data-k="keep">${esc(T('ch_pinned'))}</span>`)
      if (e.running && (e.enabled || e.delayed)) out.push(`<span class="su-chip" data-k="run">${esc(T('ch_running', { mb: P.fmtMem(e.running.mb) }))}</span>`)
      if (e.policy) out.push(`<span class="su-chip">${esc(T('ch_policy'))}</span>`)
      return out.join('')
    }
    const impactCell = e => {
      const i = e.impact || { basis: 'none' }
      if (i.basis === 'measured') return `<span class="su-imp" data-level="${i.level}" data-b="measured" title="${esc(T('impHint_measured', { n: i.count }))}"><i></i><i></i><i></i><em>${esc(P.signed(i.ms))}</em></span>`
      if (i.basis === 'clear') return `<span class="su-imp" data-level="low" data-b="clear" title="${esc(T('impHint_clear'))}"><i></i><i></i><i></i><em>${esc(T('imp_clear'))}</em></span>`
      if (i.basis === 'typical') return `<span class="su-imp" data-level="${i.level}" data-b="typical" title="${esc(T('impHint_typical'))}"><i></i><i></i><i></i><em>${esc(T('impTyp_' + i.level))}</em></span>`
      return `<span class="su-imp" data-b="none" title="${esc(T('impHint_none'))}"><em>–</em></span>`
    }

    function paintList() {
      const s = S.snap
      if (!s) {
        setHtml(listWrap, S.failed ? `<div class="nt-empty su-empty"><i class="fa fa-plug-circle-exclamation" aria-hidden="true"></i><b>${esc(T('vFail'))}</b><span>${esc(T('vFailS'))}</span><button type="button" class="nt-sec sm" data-act="rescan">${esc(T('retry'))}</button></div>`
          : `<div class="su-list" aria-busy="true">${Array.from({ length: 7 }, () => '<div class="su-rowsk"></div>').join('')}</div>`)
        return
      }
      if (!s.entries.length) { setHtml(listWrap, `<div class="nt-empty su-empty"><i class="fa fa-rocket" aria-hidden="true"></i><b>${esc(s.read ? T('emptyT') : T('unreadT'))}</b><span>${esc(s.read ? T('emptyS') : T('unreadS'))}</span><button type="button" class="nt-sec sm" data-act="rescan">${esc(T('rescan'))}</button></div>`); return }
      const filtered = s.entries.filter(e => P.chipMatch(e, S.chip) && P.matches(e, S.q))
      if (!filtered.length) { setHtml(listWrap, `<div class="nt-empty su-empty"><i class="fa fa-magnifying-glass" aria-hidden="true"></i><b>${esc(T('noMatchT'))}</b><span>${esc(T('noMatchS', { q: S.q || T('chip_' + S.chip) }))}</span><button type="button" class="nt-sec sm" data-act="clear">${esc(T('clearFilter'))}</button></div>`); return }
      const focusId = document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('su-row') ? document.activeElement.dataset.id : null
      const by = P.byLane(filtered)
      const filtering = S.chip !== 'all' || !!S.q.trim()
      const body = P.LANES.filter(l => by[l].length).map(l => {
        const open = l !== 'off' || filtering || S.laneOpen.off
        const bulk = l === 'worth' && s.rec.length ? `<button type="button" class="nt-sec sm" data-act="tune">${esc(T('laneAll', { n: s.rec.length }))}</button>` : l === 'off' && !filtering ? `<button type="button" class="nt-sec sm" data-act="lane-toggle" data-lane="off" aria-expanded="${open}">${esc(T(open ? 'laneHide' : 'laneShow'))}</button>` : ''
        return `<div class="su-lane" data-lane="${l}"><span class="su-lane-i"><i class="fa fa-${P.LANE_ICON[l]}" aria-hidden="true"></i></span><span class="su-lane-t"><b>${esc(T('lane_' + l))}</b><i>${esc(T('laneS_' + l))}</i></span><span class="su-lane-n">${by[l].length}</span>${bulk}</div>${open ? by[l].map(rowHtml).join('') : ''}`
      }).join('')
      const changed = setHtml(listWrap, `<div class="su-list" role="listbox" aria-label="${esc(T('listLabel'))}"><div class="su-th" aria-hidden="true"><span></span><span>${esc(T('colName'))}</span><span class="su-th-c"></span><span>${esc(T('colImpact'))}</span><span></span></div>${body}</div>`)
      if (changed && focusId) { const f = listWrap.querySelector(`.su-row[data-id="${CSS.escape(focusId)}"]`); if (f) f.focus({ preventScroll: true }) }
    }
    function rowHtml(e) {
      const on = e.enabled || e.delayed
      const name = P.display(e)
      return `<div class="su-row" role="option" tabindex="0" aria-selected="${e.id === S.sel}" data-act="select" data-id="${esc(e.id)}" data-lane="${e.lane}">
        ${root.JylliStartupViews.icon(ctx, e)}<span class="su-nm"><b>${esc(name)}</b><i>${esc(P.sub(e) || T('src_' + e.src))}</i></span>
        <span class="su-chips">${stateChips(e)}</span>${impactCell(e)}
        <button type="button" class="su-sw" role="switch" aria-checked="${on}" data-act="toggle" data-id="${esc(e.id)}" ${e.canToggle ? '' : 'disabled'} title="${esc(e.canToggle ? '' : T(e.kind === 'appx' ? 'dManageWin' : 'dAdminNote'))}" aria-label="${esc(name + ': ' + T(on ? 'swOnLabel' : 'swOffLabel'))}"><i></i></button></div>`
    }

    // ── detail ──
    function paintNow() {
      const e = S.sel ? entryOf(S.sel) : null, n = detail.querySelector('.su-now')
      if (e && n) n.innerHTML = nowHtml(e)
    }
    function nowHtml(e) {
      const i = e.impact || { basis: 'none' }
      const slow = i.basis === 'measured' ? P.signed(i.ms) : i.basis === 'clear' ? T('imp_clear') : i.basis === 'typical' ? T('impTyp_' + i.level) : '–'
      const slowNote = i.basis === 'measured' ? T('impHint_measured', { n: i.count }) : T('impHint_' + i.basis)
      return `<div class="su-stats"><div><b>${esc(slow)}</b><span>${esc(T('dSlowdown'))}</span></div><div><b>${esc(e.running ? P.fmtMem(e.running.mb) : '–')}</b><span>${esc(T('dMemory'))}</span></div><div><b>${esc(e.running ? String(e.running.n) : '0')}</b><span>${esc(T('dProcs'))}</span></div></div>
        <p class="su-foot">${esc(slowNote)}${e.running ? '' : ' ' + esc(T('dNotRunning'))}</p>`
    }
    function paintDetail() {
      const s = S.snap, e = s && S.sel ? entryOf(S.sel) : null
      detail.dataset.open = S.drawer ? '1' : '0'
      if (!e) { detail.innerHTML = `<div class="nt-empty su-empty"><i class="fa fa-hand-pointer" aria-hidden="true"></i><b>${esc(T('pickT'))}</b><span>${esc(T('pickS'))}</span></div>`; return }
      const on = e.enabled || e.delayed, name = P.display(e)
      const stateLine = e.kind === 'appx' ? T('dStartsAppx') : e.delayed ? T('dStartsDelayed', { s: e.delay.sec }) : e.enabled ? T('dStartsOn') : T('dStartsOff', { when: e.offAt ? T('dSince', { date: new Date(e.offAt).toLocaleDateString() }) : '' })
      const why = e.lane === 'off' || e.lane === 'delayed' ? '' : T('why_' + e.why)
      const delayBtns = e.canDelay ? `<div class="su-lv" role="group" aria-label="${esc(T('dDelayT'))}">${P.DELAYS.map(sec => `<button type="button" data-act="delay" data-id="${esc(e.id)}" data-sec="${sec}">${esc(T('dDelay', { s: sec }))}</button>`).join('')}</div>`
        : e.delayed ? `<div class="su-lv" role="group" aria-label="${esc(T('dDelayT'))}">${P.DELAYS.map(sec => `<button type="button" data-act="delay" data-id="${esc(e.id)}" data-sec="${sec}" aria-pressed="${sec === e.delay.sec}">${esc(T('dDelay', { s: sec }))}</button>`).join('')}<button type="button" data-act="undelay" data-id="${esc(e.id)}">${esc(T('dUndelay'))}</button></div>` : ''
      const keepBlock = e.kind === 'appx' ? '' : `<section><div class="su-sec-h"><b>${esc(T('dKeepT'))}</b></div><p class="su-p">${esc(T('dKeepS'))}</p>
          <button type="button" class="su-sw" role="switch" aria-checked="${e.pinned}" data-act="keep" data-id="${esc(e.id)}" aria-label="${esc(T('dKeepT'))}" ${e.canToggle ? '' : 'disabled'}><i></i></button>${premium() ? '' : `<span class="su-lock"><i class="fa fa-lock" aria-hidden="true"></i>${esc(T('dKeepLocked'))}</span>`}</section>`
      const appBtn = e.appId ? `<button type="button" class="nt-sec sm" data-act="goto" data-page="app-optimizer"><i class="fa fa-table-cells-large" aria-hidden="true"></i>${esc(T('dShowApps'))}</button>` : ''
      const fileBtn = e.file || e.exe ? `<button type="button" class="nt-sec sm" data-act="reveal" data-id="${esc(e.id)}"><i class="fa fa-folder-open" aria-hidden="true"></i>${esc(T('dOpenFile'))}</button>` : ''
      const winBtn = e.kind === 'appx' ? `<button type="button" class="nt-sec sm" data-act="winsettings"><i class="fa fa-gear" aria-hidden="true"></i>${esc(T('dManageWin'))}</button>` : ''
      detail.innerHTML = `<header class="su-d-hero" style="--h:${P.hue(e.id)}"><button type="button" class="su-d-close" data-act="close" aria-label="${esc(T('close'))}"><i class="fa fa-xmark" aria-hidden="true"></i></button>
          <div class="su-d-id">${root.JylliStartupViews.icon(ctx, e, 'su-ico big')}<div class="su-d-name"><h3>${esc(name)}</h3><span>${esc(P.sub(e) ? P.sub(e) + ' · ' : '')}${esc(T('src_' + e.src))}</span></div></div>
          <div class="su-chips">${stateChips(e)}</div>${e.isNew ? `<button type="button" class="nt-sec sm su-ack" data-act="ack" data-id="${esc(e.id)}">${esc(T('dAck'))}</button>` : ''}</header>
        <div class="su-d-body">
          <section><div class="su-sec-h"><b>${esc(T('dStartsTitle'))}</b></div>
            <div class="su-d-sw"><p class="su-p">${esc(stateLine)}</p>
            <button type="button" class="su-sw" role="switch" aria-checked="${on}" data-act="toggle" data-id="${esc(e.id)}" ${e.canToggle ? '' : 'disabled'} aria-label="${esc(name + ': ' + T(on ? 'swOnLabel' : 'swOffLabel'))}"><i></i></button></div>
            ${why ? `<p class="su-why">${esc(why)}</p>` : ''}${e.needsAdmin ? `<p class="su-foot">${esc(T('dAdminNote'))}</p>` : ''}${e.kind === 'appx' ? `<p class="su-foot">${esc(T('dAppxNote'))}</p>` : ''}</section>
          ${delayBtns ? `<section><div class="su-sec-h"><b>${esc(T('dDelayT'))}</b></div><p class="su-p">${esc(T('dDelayS'))}</p>${delayBtns}</section>` : ''}
          <section><div class="su-sec-h"><b>${esc(T('dMeasured'))}</b></div><div class="su-now">${nowHtml(e)}</div></section>
          ${keepBlock}
          <section><div class="su-sec-h"><b>${esc(T('dWhere'))}</b></div>
            <dl class="su-kv"><dt>${esc(T('dSource'))}</dt><dd>${esc(T('src_' + e.src))}</dd>
              ${e.cmd ? `<dt>${esc(T('dCommand'))}</dt><dd><code>${esc(e.cmd)}</code> <button type="button" class="su-link" data-act="copy" data-id="${esc(e.id)}">${esc(T('dCopy'))}</button></dd>` : ''}
              ${e.exists === false ? `<dt>${esc(T('dFile'))}</dt><dd class="su-bad">${esc(T('dMissing'))}</dd>` : ''}
              ${e.desc ? `<dt>${esc(T('dDesc'))}</dt><dd>${esc(e.desc)}</dd>` : ''}</dl>
            <div class="su-btns">${fileBtn}${appBtn}${winBtn}</div></section>
        </div>`
    }

    // ── actions ──
    async function execute(items, what) {
      if (S.busy || !items.length) return null
      S.busy = what; paintStage()
      let r = null
      try { r = await root.api.startup2Run({ items }) } catch (e) { r = { ok: false, error: 'failed' } }
      S.busy = null
      if (!r || !r.run) { toast(T('title'), T('runFailed'), 'err'); paintAll(); return r }
      if (r.snapshot) S.snap = r.snapshot
      S.history = null
      const real = r.run.items.filter(i => !i.noop), ok = real.filter(i => i.ok).length, bad = real.length - ok
      const why = bad ? real.find(i => !i.ok) : null
      const msg = bad ? T('doneSome', { ok, bad, why: why ? reason(why.reason) : '' }) : ok ? T('doneAll', { n: ok }) : T('doneNone')
      toast(T('title'), msg, bad ? 'warn' : 'ok', 5000, ok ? { action: { label: T('undo'), onClick: () => undoRun(r.run.id) } } : undefined)
      say(msg)
      paintAll()
      loadIcons()
      return r
    }
    async function undoRun(id) {
      if (S.busy) return
      S.busy = T('undoing'); paintStage()
      let r = null; try { r = await root.api.startup2UndoRun({ runId: id }) } catch (e) { r = null }
      S.busy = null
      if (r && r.snapshot) S.snap = r.snapshot
      S.history = null
      toast(T('title'), r && r.ok ? T('undone') : T('undoFailed'), r && r.ok ? 'info' : 'warn')
      paintAll()
    }
    async function tuneAll() {
      const s = S.snap; if (!s || !s.rec.length) return
      const n = s.rec.length
      try { await root.showConfirm({ title: T('ctaTune', { n }), body: esc(T('confirmBody', { n })), okText: T('apply'), okStyle: 'primary', icon: 'fa-wand-magic-sparkles' }) } catch (e) { return }
      execute(s.rec.map(id => ({ id, action: 'off' })), T('whatAll', { n }))
    }
    async function toggle(id) {
      const e = entryOf(id); if (!e || !e.canToggle) return
      const turningOff = e.enabled || e.delayed
      if (turningOff && !e.delayed && e.lane === 'keep') {
        try { await root.showConfirm({ title: T('confirmKeepT', { name: P.display(e) }), body: esc(T('confirmKeepB')), okText: T('confirmKeepOk'), okStyle: 'warning', icon: 'fa-shield-halved' }) } catch (er) { paintList(); return }
      }
      execute([{ id, action: turningOff ? 'off' : 'on' }], P.display(e))
    }
    async function keep(id) {
      const e = entryOf(id); if (!e) return
      if (!premium()) { try { root.JylliPremium.open() } catch (er) { /* the pitch is optional */ } return }
      const on = !e.pinned
      let r = null; try { r = await root.api.startup2Keep({ id, on }) } catch (er) { r = null }
      if (!r || r.ok === false) { toast(T('title'), r && r.error === 'premium_required' ? T('dKeepLocked') : T('runFailed'), 'warn'); return }
      if (r.snapshot) S.snap = r.snapshot
      S.history = null
      toast(T('title'), on ? T('keepOn', { name: P.display(e) }) : T('keepOff', { name: P.display(e) }), 'ok')
      paintAll()
    }
    async function switchRow(id) {
      const row = S.snap && S.snap.switches.find(x => x.id === id); if (!row || S.busy) return
      const on = row.state !== 'set'
      S.busy = T('sw_' + id); paintStage()
      let r = null; try { r = await root.api.startup2Switch({ id, on }) } catch (er) { r = null }
      S.busy = null
      if (r && r.snapshot) S.snap = r.snapshot
      S.history = null
      toast(T('title'), r && r.ok ? T(on ? 'swDoneOn' : 'swDoneOff') : T('runFailed'), r && r.ok ? 'ok' : 'warn')
      paintAll()
    }
    async function migrate() {
      if (S.busy) return
      S.busy = T('whatMigrate'); paintStage()
      let r = null; try { r = await root.api.startup2Migrate() } catch (er) { r = null }
      S.busy = null
      if (r && r.snapshot) S.snap = r.snapshot
      S.history = null
      toast(T('title'), r && r.ok ? T('migrated', { n: r.migrated || 0 }) : T('migrateFailed'), r && r.ok ? 'ok' : 'warn')
      paintAll()
    }

    host.addEventListener('click', async e => {
      const chip = e.target.closest('[data-chip]')
      if (chip) { S.chip = chip.dataset.chip; lsSet('su_chip', S.chip); paintTools(); paintList(); return }
      const b = e.target.closest('[data-act]'); if (!b || b.disabled) return
      const id = b.dataset.id, act = b.dataset.act
      switch (act) {
        case 'select': case 'open': {
          S.sel = id; S.drawer = true
          if (act === 'open' && S.view !== 'programs') show('programs')
          else { paintList(); paintDetail() }
          if (act === 'open') { const n = listWrap.querySelector(`.su-row[data-id="${CSS.escape(id)}"]`); if (n) n.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }
          break
        }
        case 'open-stem': { const t = S.snap && S.snap.entries.find(x => x.stem === b.dataset.stem); if (t) { S.sel = t.id; S.drawer = true; show('programs') } break }
        case 'close': S.drawer = false; paintDetail(); break
        case 'rescan': S.loading = !S.snap; load(); break
        case 'reboot-read': load({ forceBoot: true }); break
        case 'clear': S.q = ''; S.chip = 'all'; qIn.value = ''; paintTools(); paintList(); break
        case 'lane-toggle': S.laneOpen.off = !S.laneOpen.off; lsSet('su_off', S.laneOpen.off ? '1' : '0'); paintList(); break
        case 'toggle': toggle(id); break
        case 'delay': execute([{ id, action: 'delay', sec: Number(b.dataset.sec) }], P.display(entryOf(id) || { name: '' })); break
        case 'undelay': execute([{ id, action: 'undelay' }], P.display(entryOf(id) || { name: '' })); break
        case 'keep': keep(id); break
        case 'tune': tuneAll(); break
        case 'undorun': undoRun(b.dataset.run); break
        case 'switch': switchRow(b.dataset.sw); break
        case 'migrate': migrate(); break
        case 'ack': { const r = await root.api.startup2Ack({ id }).catch(() => null); if (r && r.snapshot) S.snap = r.snapshot; paintAll(); break }
        case 'reveal': { const r = await root.api.startup2Reveal({ id }).catch(() => null); if (!r || !r.ok) toast(T('title'), T('revealFailed'), 'warn'); break }
        case 'winsettings': root.api.startup2OpenSettings().catch(() => {}); break
        case 'copy': { const t = entryOf(id); if (t) { try { await navigator.clipboard.writeText(t.cmd); toast(T('title'), T('dCopied'), 'ok', 2000) } catch (er) { toast(T('title'), T('runFailed'), 'warn') } } break }
        case 'goto': root.showPage(b.dataset.page, b.dataset.tab || undefined); break
        case 'journal': root.showPage('changelog'); break
        default: break
      }
    })
    host.addEventListener('keydown', e => {
      const r = e.target.closest && e.target.closest('.su-row')
      if (r && e.target === r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); S.sel = r.dataset.id; S.drawer = true; paintList(); paintDetail(); return }
      if (!r || !['ArrowUp', 'ArrowDown'].includes(e.key)) return
      const all = [...listWrap.querySelectorAll('.su-row')], i = all.indexOf(r)
      const next = e.key === 'ArrowUp' ? i - 1 : i + 1
      if (next >= 0 && next < all.length) { e.preventDefault(); all[next].focus() }
    })
    host.addEventListener('pointerdown', () => { pressing = true })
    const release = () => setTimeout(() => { pressing = false }, 0)
    document.addEventListener('pointerup', release); document.addEventListener('pointercancel', release)
    document.addEventListener('keydown', onEsc)
    function onEsc(e) { if (e.key === 'Escape' && S.drawer && window.innerWidth < 1100 && host.isConnected) { S.drawer = false; paintDetail() } }

    // ── lifecycle ──
    unsubs.push(root.api.onStartup2Changed ? root.api.onStartup2Changed(() => { clearTimeout(qTimer); qTimer = setTimeout(() => load({ quiet: true }), 400) }) : null)
    liveTimer = setInterval(liveTick, LIVE_EVERY)
    const obj = {
      destroy() {
        S.disposed = true
        clearInterval(liveTimer); clearTimeout(qTimer)
        for (const u of unsubs) { try { u && u() } catch (e) { /* already gone */ } }
        document.removeEventListener('pointerup', release); document.removeEventListener('pointercancel', release); document.removeEventListener('keydown', onEsc)
        host.remove()
        if (current === obj) current = null
      },
      reveal(id) { if (entryOf(id)) { S.sel = id; S.drawer = true; show('programs') } else pendingReveal = id },
    }
    current = obj
    paintAll()
    load()
    return obj
  }

  api.mount = mount
  api.reveal = id => { if (current) current.reveal(id); else pendingReveal = id }
  api.pending = () => pendingReveal
})(typeof window !== 'undefined' ? window : globalThis)
