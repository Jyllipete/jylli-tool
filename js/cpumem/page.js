'use strict'
// CPU & Memory tab "Silicon": one stage (the die map + a verdict), four views (Overview, Tune, Lab, History).
// Engine in lib/cpumem (main.js `// ─── CPU & Memory`), pure helpers in js/cpumem/pure.js, die map in die-view.js, memory strata in mem-view.js, Lab in lab.js.
// Every number on the die map and the strata comes from performance counters; every switch shows its live state and is verified after each change.
// Shared pieces (sheets, receipt, row details) come from js/network/views.js and its `net2` strings: T() asks `cpumem2` first, then `net2`.
// Root carries `jk nt cm`: .jk keeps the legacy #page-content resets out, .nt reuses the shared stage / row / sheet styles (css/network.css).
;(function (root) {
  const P = root.JylliCpuMemPure || (typeof require === 'function' ? require('./pure') : null)
  const api = { mount() {}, sync() {}, reveal() {} }
  root.JylliCpuMemPage = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  const hasKey = k => { try { const L = LANG; return !!((L[root.currentLang] && L[root.currentLang].cpumem2 && k in L[root.currentLang].cpumem2) || (L.en.cpumem2 && k in L.en.cpumem2)) } catch (e) { return false } }
  const T = (k, v) => root.tG(hasKey(k) ? 'cpumem2' : 'net2', k, v)
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const still = () => document.documentElement.classList.contains('motion-reduced') || document.body.classList.contains('game-live')
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
  const ui = k => root.tUI(k)
  const nameOf = id => (root.tName && root.tName(id)) || (root._tweakMeta && root._tweakMeta[id] && root._tweakMeta[id].name) || id
  const descOf = id => (root.tDesc && root.tDesc(id)) || ''
  const lsGet = k => { try { return localStorage.getItem(k) } catch (e) { return null } }
  const lsSet = (k, v) => { try { localStorage.setItem(k, v) } catch (e) { /* storage may be unavailable */ } }
  const fk = id => String(id).replace(/-/g, '_')   // finding ids use hyphens, LANG keys underscores
  const BEAT_MS = 20000, WATCH_MS = 4000
  const FRAMES_MAX = 60, FINDS_EVERY = 5

  let current = null

  function mount(c) {
    if (current) current.destroy()
    const host = el('div', 'jk nt cm')
    c.appendChild(host)
    const S = { model: null, facts: null, rules: { rules: {}, pinned: {}, priority: {} }, premium: false, stale: false, when: null, read: false, phase: 'scan', reading: true, q: '', chip: 'all',
      open: new Set(), receipt: null, history: null, lastBatch: null, progress: null, runIds: new Set(), flash: {}, disposed: false, view: 'overview', failed: false,
      live: 'off', frame: null, frames: [], liveFinds: [], findKey: '', consumers: null, consumersBusy: false, preview: null }
    const unsubs = []
    let rescanTimer = null, qTimer = null, beatTimer = null, watchTimer = null, die = null, mem = null, lab = null, frameN = 0, builtKey = '', liveUnsub = null
    const model = () => S.model
    const item = id => (S.model ? S.model.items.find(i => i.id === id) : null)
    const base = () => (S.facts && S.facts.baseMHz) || 0
    const finds = () => [...S.liveFinds, ...((S.facts && S.facts.findings) || [])].sort((a, b) => ({ bad: 0, warn: 1, info: 2 }[a.tone] - { bad: 0, warn: 1, info: 2 }[b.tone]))

    // ── frame ──
    const bar = el('div', 'nt-bar'); bar.dataset.tour = 'cm-views'
    const seg = root.JylliTab.seg(P.VIEWS.map(v => ({ id: v, label: T('seg_' + v), icon: { overview: 'gauge-high', tune: 'sliders', lab: 'flask-vial', history: 'clock-rotate-left' }[v] })), S.view, id => show(id))
    bar.appendChild(seg.el)
    const views = { overview: el('div', 'nt-view'), tune: el('div', 'nt-view'), lab: el('div', 'nt-view'), history: el('div', 'nt-view') }
    for (const k of Object.keys(views)) views[k].hidden = k !== S.view
    const bannerSlot = el('div', 'nt-banner-slot')
    const stage = el('section', 'nt-stage cm-stage'); stage.dataset.tour = 'cm-stage'
    stage.setAttribute('aria-live', 'polite')
    const pkgEl = el('div', 'cm-pkg'), dieHost = el('div', 'cm-die'), verdictEl = el('div', 'nt-verdict')
    dieHost.dataset.tour = 'cm-die'
    stage.append(pkgEl, dieHost, verdictEl)
    const receiptSlot = el('div', 'nt-receipt-slot')
    host.append(bar, bannerSlot, stage, receiptSlot, views.overview, views.tune, views.lab, views.history)
    die = root.JylliCpuMemDie.mount(dieHost, { T })

    const ovGrid = el('div', 'cm-ov')
    const memCard = el('section', 'nt-card cm-mem'); memCard.dataset.tour = 'cm-mem'
    const sideCol = el('div', 'cm-side')
    const findCard = el('section', 'nt-card cm-finds'); findCard.dataset.tour = 'cm-finds'
    const consCard = el('section', 'nt-card cm-cons')
    sideCol.append(findCard, consCard)
    ovGrid.append(memCard, sideCol)
    views.overview.appendChild(ovGrid)
    mem = root.JylliCpuMemMem.mount(memCard, { T, onFree: () => root.api.cpumem2FreeStandby() })

    const tools = el('div', 'nt-tools')
    tools.innerHTML = `<label class="nt-search"><i class="fa fa-magnifying-glass" aria-hidden="true"></i><input type="search" data-q placeholder="${esc(T('search'))}" aria-label="${esc(T('search'))}"></label><div class="nt-chips-bar" role="group" aria-label="${esc(T('chips'))}"></div>`
    const lanesEl = el('div', 'nt-lanes'), footEl = el('p', 'nt-foot nt-unavail'); footEl.hidden = true
    views.tune.append(tools, lanesEl, footEl)
    const chipsEl = tools.querySelector('.nt-chips-bar'), qIn = tools.querySelector('[data-q]')
    qIn.addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(() => { S.q = qIn.value; paintLanes() }, 120) })

    const ctx = {
      T, esc, el, ui, S, still, nameOf, descOf, P, host, model, item, api: root.api,
      toast: (...a) => { try { root.toast(...a) } catch (e) { /* toast is optional */ } },
      refreshAll: () => paintAll(), loadHistory, undo, execute, rescan, setPreview, applyRules: r => { S.rules = r; paintOverview(); if (lab) lab.refresh() },
    }
    function show(id) {
      S.view = id
      seg.set(id)
      stage.dataset.compact = id === 'overview' ? '0' : '1'; stage.dataset.view = id
      for (const k of Object.keys(views)) views[k].hidden = k !== id
      if (id === 'history') paintHistory()
      if (id === 'tune') paintTune()
      if (id === 'lab') { if (!lab) lab = root.JylliCpuMemLab.mount(views.lab, ctx); lab.refresh() }
      if (id !== 'lab') setPreview(null)
    }
    function setPreview(cpus) { S.preview = cpus; if (die) die.highlight(cpus) }

    // ── paint ──
    function paintAll() {
      if (S.disposed) return
      paintBanner(); paintStage(); paintOverview()
      if (S.view === 'tune') paintTune()
      const V = root.JylliNetworkViews
      if (V) V.receipt(receiptSlot, ctx)
      if (S.view === 'history') paintHistory()
    }
    const agoText = ms => { const a = P.ago(ms); return a ? T('ago_' + a.k, { n: a.n }) : '' }

    function paintBanner() {
      const m = model(), rows = []
      if (S.model && !S.read) rows.push({ tone: 'warn', icon: 'plug-circle-exclamation', t: T('bnUnreadT'), s: T('bnUnreadS'), act: 'rescan', label: T('retry') })
      else if (S.stale) rows.push({ tone: 'warn', icon: 'clock', t: T('bnStaleT', { when: agoText(S.when) }), s: T('bnStaleS'), act: 'rescan', label: T('retry') })
      if (m && m.drifted.length) rows.push({ tone: 'warn', icon: 'rotate-left', t: T('bnDriftT', { n: m.drifted.length }), s: T('bnDriftS'), act: 'putback', label: T('ctaPutBack', { n: m.drifted.length }) })
      if (m && m.pendingRestart.length) rows.push({ tone: 'info', icon: 'rotate-right', t: T('bnRestartT', { n: m.pendingRestart.length }), s: T('bnRestartS'), act: 'reboot', label: T('restartNow') })
      bannerSlot.innerHTML = rows.map(r => `<div class="nt-banner" data-tone="${r.tone}"><span class="nt-banner-ico"><i class="fa fa-${r.icon}" aria-hidden="true"></i></span><span class="nt-banner-t"><b>${esc(r.t)}</b><span>${esc(r.s)}</span></span><button type="button" class="nt-sec sm" data-act="${r.act}">${esc(r.label)}</button></div>`).join('')
    }

    function paintPackage() {
      const r = P.packageRead(S.frame, base())
      const t = root.JylliTelemetry && root.JylliTelemetry.value ? root.JylliTelemetry.value('cpu.temp.package') : null
      const w = root.JylliTelemetry && root.JylliTelemetry.value ? root.JylliTelemetry.value('cpu.power') : null
      const cell = (k, v, tone) => `<div class="cm-pk" data-tone="${tone || ''}"><span>${esc(T(k))}</span><b class="mono">${v}</b></div>`
      const cpu = S.facts && S.facts.cpu
      pkgEl.innerHTML = `<div class="cm-pkg-name"><i class="fa fa-microchip" aria-hidden="true"></i><span>${esc(cpu ? cpu.name.replace(/\(R\)|\(TM\)|CPU /g, '').replace(/\s+/g, ' ').trim() : T('cpuUnknown'))}</span></div>`
        + `<div class="cm-pkg-cells">${cell('pkgLoad', r.util == null ? '–' : r.util + '<small>%</small>')}${cell('pkgClock', r.mhz ? P.fmtGHz(r.mhz) + '<small>GHz</small>' : '–')}${cell('pkgParked', S.frame ? String(r.parked) : '–')}${t != null ? cell('pkgTemp', Math.round(t) + '<small>°C</small>', t >= 95 ? 'bad' : t >= 85 ? 'warn' : '') : ''}${w != null ? cell('pkgPower', Math.round(w) + '<small>W</small>') : ''}</div>`
    }

    function paintStage() {
      const m = model()
      const busy = S.phase === 'running'
      stage.dataset.compact = S.view === 'overview' ? '0' : '1'
      stage.dataset.state = busy ? 'run' : S.reading ? 'scan' : 'ready'
      stage.dataset.live = S.live === 'on' ? '1' : '0'
      paintPackage()
      let tone = 'idle', eyebrow = '', title = '', lead = '', actions = '', chips = ''
      if (busy) {
        const p = S.progress
        tone = 'accent'; eyebrow = T('eyeRun'); title = T('vRun'); lead = p && p.id ? T('leadRun', { name: nameOf(p.id), step: p.step || 1, total: p.total || S.runIds.size }) : T('leadRunRp')
        actions = `<button type="button" class="nt-cta" disabled><i class="fa fa-circle-notch fa-spin" aria-hidden="true"></i>${esc(T('working'))}</button>`
      } else if (!m) {
        eyebrow = T('eyeScan'); title = T('vScan'); lead = T('leadScan')
      } else {
        const v = P.stageVerdict(m, finds(), S.live === 'paused')
        tone = v.tone
        eyebrow = S.live === 'on' ? T('eyeLive') : S.live === 'paused' ? T('eyePaused') : !m.live ? T('eyeNever') : T('eyeStatic')
        if (v.kind === 'finding') { title = T('fT_' + fk(v.id), v.vars); lead = T('fS_' + fk(v.id), v.vars) }
        else { const k = { unread: 'vUnread', drift: 'vDrift', open: 'vOpen', paused: 'vPaused', clean: 'vClean' }[v.kind]; title = T(k, v.vars); lead = T(k + 'S', v.vars) }
        const f = S.facts
        if (f && f.cpu) chips += `<span class="nt-fact"><i class="fa fa-microchip" aria-hidden="true"></i>${esc(T('factCores', { c: f.cpu.cores || '?', t: f.cpu.threads || '?' }))}</span>`
        if (f && f.mods && f.mods.list.length) { const gb = f.mods.list.reduce((a, x) => a + x.capGB, 0); chips += `<span class="nt-fact"><i class="fa fa-memory" aria-hidden="true"></i>${esc(gb + ' GB' + (f.mods.list[0].type ? ' ' + f.mods.list[0].type : ''))}</span>` }
        if (f && f.scheme) chips += `<span class="nt-fact"><i class="fa fa-battery-full" aria-hidden="true"></i>${esc(T('plan_' + f.scheme))}</span>`
        const put = m.drifted.length ? `<button type="button" class="nt-sec warn" data-act="putback"><i class="fa fa-rotate-left" aria-hidden="true"></i>${esc(T('ctaPutBack', { n: m.drifted.length }))}</button>` : ''
        const rec = m.recommendedIds.length ? `<button type="button" class="nt-cta" data-act="recommended" data-tour="cm-recommended"><i class="fa fa-wand-magic-sparkles" aria-hidden="true"></i>${esc(T('ctaApply', { n: m.recommendedIds.length }))}</button>` : ''
        actions = rec + put + `<button type="button" class="nt-sec" data-act="rescan"><i class="fa fa-arrows-rotate" aria-hidden="true"></i>${esc(T('rescan'))}</button>` + (S.lastBatch ? `<button type="button" class="nt-sec" data-act="undolast" data-tour="cm-undo"><i class="fa fa-rotate-left" aria-hidden="true"></i>${esc(T('undoLast'))}</button>` : '')
      }
      verdictEl.dataset.tone = tone
      verdictEl.innerHTML = `<div class="nt-eyebrow"><span class="nt-dot"></span>${esc(eyebrow)}</div><h2 class="nt-title">${esc(title)}</h2><p class="nt-lead">${esc(lead)}</p>${chips ? `<div class="nt-facts-row">${chips}</div>` : ''}<div class="nt-actions">${actions}</div>`
    }

    function paintOverview() {
      const f = S.facts
      if (f && f.topo) { const key = f.topo.ok ? JSON.stringify(f.topo.groups.map(g => [g.id, g.l3MB, g.vcache, g.cores])) : 'none'; if (key !== builtKey) { builtKey = key; die.setTopo(f.topo) } }
      if (f && f.mods) mem.setModules(f.mods)
      paintFinds(); paintConsumers()
    }

    function paintFinds() {
      const list = finds()
      const head = `<header class="nt-card-h"><div><b>${esc(T('findTitle'))}</b><span>${esc(S.live === 'on' ? T('findSubLive') : T('findSub'))}</span></div><span class="cm-count" data-n="${list.length}">${list.length}</span></header>`
      if (!S.facts) { findCard.innerHTML = head + `<div class="cm-sk"></div>`; return }
      if (!list.length) { findCard.innerHTML = head + `<div class="cm-clear"><i class="fa fa-circle-check" aria-hidden="true"></i><div><b>${esc(T('findNoneT'))}</b><span>${esc(T('findNoneS'))}</span></div></div>`; return }
      findCard.innerHTML = head + `<ul class="cm-find-list">${list.map(f => {
        const a = P.actionOf(f)
        const act = a ? `<button type="button" class="nt-sec sm" data-act="find" data-fid="${esc(f.id)}">${esc(T(a.label))}</button>` : ''
        return `<li class="cm-find" data-tone="${f.tone}" data-kind="${f.kind}"><span class="cm-find-ico"><i class="fa fa-${f.tone === 'bad' ? 'circle-exclamation' : f.tone === 'warn' ? 'triangle-exclamation' : 'circle-info'}" aria-hidden="true"></i></span><div class="cm-find-t"><b>${esc(T('fT_' + fk(f.id), f.vars))}</b><span>${esc(T('fS_' + fk(f.id), f.vars))}</span></div>${act}</li>`
      }).join('')}</ul>`
    }

    function paintConsumers() {
      const k = S.consumers
      const head = `<header class="nt-card-h"><div><b>${esc(T('consTitle'))}</b><span>${esc(T('consSub'))}</span></div><button type="button" class="nt-sec sm" data-act="consumers"${S.consumersBusy ? ' disabled' : ''}><i class="fa fa-${S.consumersBusy ? 'circle-notch fa-spin' : 'arrows-rotate'}" aria-hidden="true"></i>${esc(T(k ? 'consRefresh' : 'consShow'))}</button></header>`
      if (!k) { consCard.innerHTML = head + `<p class="cm-cons-hint">${esc(T('consHint'))}</p>`; return }
      if (k.game) { consCard.innerHTML = head + `<p class="cm-cons-hint">${esc(T('consGame'))}</p>`; return }
      const col = (title, list, unit, max) => `<div class="cm-cons-col"><h4>${esc(title)}</h4><ul>${list.slice(0, 6).map(x => `<li><span class="cm-cons-n" title="${esc(x.name)}">${esc(P.progName(x.name))}</span><span class="cm-cons-bar"><i style="width:${Math.max(3, Math.round((unit === 'cpu' ? x.cpu : x.mb) / max * 100))}%"></i></span><b class="mono">${unit === 'cpu' ? x.cpu + '%' : esc(P.fmtMB(x.mb))}</b></li>`).join('') || `<li class="cm-cons-none">${esc(T('consNone'))}</li>`}</ul></div>`
      const mc = Math.max(1, ...k.cpu.map(x => x.cpu)), mm = Math.max(1, ...k.ram.map(x => x.mb))
      consCard.innerHTML = head + `<div class="cm-cons-cols">${col(T('consCpu'), k.cpu, 'cpu', mc)}${col(T('consRam'), k.ram, 'ram', mm)}</div>`
    }

    // ── Tune ──
    function paintChips() {
      const m = model(), counts = m ? P.chipCounts(m.items) : {}
      chipsEl.innerHTML = P.CHIPS.map(ch => {
        if (!m || (ch === 'drifted' && !counts[ch])) return ''
        return `<button type="button" class="nt-chip" data-chip="${ch}" aria-pressed="${S.chip === ch}">${esc(T('chip_' + ch))}<b>${counts[ch] || 0}</b></button>`
      }).join('')
    }
    function paintTune() { paintChips(); paintLanes() }
    function laneCollapsed(id) { const v = lsGet('sec_col_cm_' + id); return v == null ? id === 'retired' : v === '1' }

    function paintLanes() {
      const m = model()
      if (!m) { lanesEl.innerHTML = Array.from({ length: 2 }, () => `<div class="nt-lane sk"><div class="nt-lane-h"></div>${'<div class="nt-row sk"></div>'.repeat(3)}</div>`).join(''); return }
      const focusRow = document.activeElement && document.activeElement.closest ? document.activeElement.closest('.nt-row') : null
      const focusId = focusRow && lanesEl.contains(focusRow) ? focusRow.dataset.tweakId : null
      const focusAct = focusId ? document.activeElement.dataset.act : null
      const searching = !!S.q.trim()
      let shown = 0, first = true
      const html = m.lanes.map(l => {
        const rows = l.ids.map(id => item(id)).filter(it => P.chipMatch(it, S.chip) && P.matches(it, S.q, nameOf(it.id) + ' ' + descOf(it.id)))
        if (!rows.length) return ''
        shown += rows.length
        const col = !searching && S.chip === 'all' && laneCollapsed(l.id)
        const pct = l.total ? Math.round((l.on / l.total) * 100) : 0
        const body = col ? '' : rows.map(it => { const h = rowHtml(it, first); first = false; return h }).join('')
        return `<section class="nt-lane" data-lane="${l.id}" data-collapsed="${col ? '1' : '0'}"><button type="button" class="nt-lane-h" data-act="lane" data-lane="${l.id}" aria-expanded="${!col}"><span class="nt-lane-ico"><i class="fa fa-${P.LANE_ICON[l.id] || 'circle'}" aria-hidden="true"></i></span><span class="nt-lane-t"><b>${esc(T('lane_' + l.id))}</b><span>${esc(T('laneSub_' + l.id))}</span></span>${l.premium ? `<span class="nt-chip-s"><i class="fa fa-crown" aria-hidden="true"></i>${esc(T('tagPremium'))}</span>` : ''}<span class="nt-lane-n mono">${l.on}/${l.total}</span><span class="nt-lane-bar" aria-hidden="true"><i style="width:${pct}%"></i></span><i class="fa fa-chevron-down nt-lane-chev" aria-hidden="true"></i></button><div class="nt-lane-b"${col ? ' hidden' : ''}>${body}</div></section>`
      }).join('')
      lanesEl.innerHTML = html || `<div class="nt-empty"><i class="fa fa-magnifying-glass" aria-hidden="true"></i><b>${esc(T('noMatchT'))}</b><span>${esc(T('noMatchS', { q: S.q }))}</span><button type="button" class="nt-sec sm" data-act="clear">${esc(T('clearFilters'))}</button></div>`
      if (focusId) { const f = lanesEl.querySelector(`#tcw-${CSS.escape(focusId)} [data-act="${focusAct}"]`) || lanesEl.querySelector(`#tcw-${CSS.escape(focusId)} .nt-head`); if (f) f.focus({ preventScroll: true }) }
      for (const id of S.open) { const row = lanesEl.querySelector('#tcw-' + CSS.escape(id)); if (row) buildDetails(row, item(id)) }
      void shown
      const na = m.items.filter(i => i.status === 'unknown' && !i.retired)
      footEl.hidden = !na.length
      if (na.length) { footEl.innerHTML = `<i class="fa fa-circle-info" aria-hidden="true"></i>${esc(T('unreadN', { n: na.length }))}`; footEl.title = na.map(i => nameOf(i.id)).join(', ') }
    }

    function statusText(it) {
      if (it.locked) return T('st_locked')
      if (it.status === 'unknown') return T(it.remembered === 'applied' ? 'st_unknownApplied' : 'st_unknown')
      return T('st_' + it.status)
    }

    function rowHtml(it, isFirst) {
      const id = it.id, look = P.statusLook(it.status), on = P.isOn(it), busy = S.runIds.has(id), open = S.open.has(id)
      const chips = []
      if (it.rec) chips.push(`<span class="nt-chip-s rec"><i class="fa fa-thumbs-up" aria-hidden="true"></i>${esc(T('tagRec'))}</span>`)
      if (it.premium) chips.push(`<span class="nt-chip-s"><i class="fa fa-crown" aria-hidden="true"></i>${esc(T('tagPremium'))}</span>`)
      if (it.reboot) chips.push(`<span class="nt-chip-s"><i class="fa fa-rotate-right" aria-hidden="true"></i>${esc(T('tagRestart'))}</span>`)
      if (it.tier >= 2) chips.push(`<span class="nt-chip-s risk2"><i class="fa fa-circle-exclamation" aria-hidden="true"></i>${esc(T('tagCaution'))}</span>`)
      const notes = []
      if (it.caution) notes.push(ui('applic_' + it.caution))
      if (root.JylliWindowsPure) { const si = (typeof sysInfo !== 'undefined' && sysInfo) || {}; for (const w of root.JylliWindowsPure.warnsFor(it, { laptop: !!si.isLaptop, ramGB: si.ramGB || 0 })) notes.push(w.vars.n ? ui(w.key).replace('{n}', w.vars.n) : ui(w.key)) }
      let ctl
      if (it.locked) ctl = `<button type="button" class="nt-sec sm" data-act="premium"><i class="fa fa-crown" aria-hidden="true"></i>${esc(T('unlock'))}</button>`
      else if (it.retired) ctl = it.remembered === 'applied' ? `<button type="button" class="nt-sec sm" data-act="flip" data-id="${esc(id)}"${busy ? ' disabled' : ''}>${esc(T('restore'))}</button>` : ''
      else if (it.status === 'drifted') ctl = `<button type="button" class="nt-sec sm warn" data-act="flip" data-id="${esc(id)}"${busy ? ' disabled' : ''}>${esc(T('putBack'))}</button>`
      else ctl = `<button type="button" role="switch" class="nt-sw${busy ? ' busy' : ''}" aria-checked="${on}" aria-label="${esc(nameOf(id))}" data-act="flip" data-id="${esc(id)}"${busy || P.isLocked(it) ? ' disabled' : ''}${P.isLocked(it) ? ` title="${esc(T('lockedWhy'))}"` : ''}><i></i></button>`
      return `<article class="nt-row" id="tcw-${esc(id)}" data-tweak-id="${esc(id)}" data-status="${it.status}" data-tier="${it.tier}" data-applied="${on ? '1' : '0'}"${S.flash[id] ? ` data-flash="${S.flash[id]}"` : ''}${isFirst ? ' data-tour="tweak-card"' : ''}${open ? ' data-open' : ''}>
        <div class="nt-main"><button type="button" class="nt-head" data-act="open" data-id="${esc(id)}" aria-expanded="${open}" aria-controls="ntd-${esc(id)}"><span class="nt-glyph" data-tone="${look.tone}"><i class="fa fa-${look.glyph}" aria-hidden="true"></i></span><span class="nt-txt"><span class="nt-name">${esc(nameOf(id))}</span><span class="nt-desc">${esc(descOf(id))}</span>${notes.length ? `<span class="nt-note"><i class="fa fa-triangle-exclamation" aria-hidden="true"></i>${esc(notes[0])}</span>` : ''}</span></button>
        <span class="nt-chips">${chips.join('')}</span><span class="nt-state" data-tone="${look.tone}">${esc(statusText(it))}</span><div class="nt-ctl">${ctl}</div></div>
        <div class="nt-details" id="ntd-${esc(id)}"${open ? '' : ' hidden'}></div></article>`
    }
    function buildDetails(row, it) { const V = root.JylliNetworkViews, d = row.querySelector('.nt-details'); if (V && d && it) V.details(d, it, ctx) }

    // ── History ──
    function paintHistory() {
      const slot = views.history
      if (!S.history) { slot.innerHTML = `<div class="nt-hist-empty"><i class="fa fa-spinner fa-spin" aria-hidden="true"></i>${esc(T('loading'))}</div>`; loadHistory().then(() => { if (!S.disposed && S.view === 'history') paintHistory() }); return }
      const h = S.history, m = model()
      const restorable = m ? m.items.filter(i => i.remembered === 'applied').map(i => i.id) : []
      if (!h.batches.length) { slot.innerHTML = `<div class="nt-hist-empty"><i class="fa fa-clock-rotate-left" aria-hidden="true"></i><b>${esc(T('histEmptyT'))}</b><span>${esc(T('histEmptyS'))}</span></div>`; return }
      const fmtDate = ts => { try { return new Date(ts).toLocaleString(root.currentLang === 'fi' ? 'fi-FI' : undefined, { dateStyle: 'medium', timeStyle: 'short' }) } catch (e) { return '' } }
      const label = e => (e.tweakId ? nameOf(e.tweakId) : T('histPriority', { exe: String(e.control || '').replace('cpumem:priority:', '') }))
      slot.innerHTML = `<div class="nt-hist-h"><div><b>${esc(T('histTitle'))}</b><span>${esc(T('histSub'))}</span></div>${restorable.length ? `<button type="button" class="nt-sec sm" data-h="all"><i class="fa fa-rotate-left" aria-hidden="true"></i>${esc(T('histRestoreAll', { n: restorable.length }))}</button>` : ''}</div>`
        + h.batches.map(b => {
          const live = b.entries.filter(x => !x.undone && x.via !== 'undo')
          return `<section class="nt-hist-b"><header><span class="nt-hist-when">${esc(fmtDate(b.ts))}</span><span class="nt-chip-s">${esc(T('via_' + b.via))}</span>${live.length ? `<button type="button" class="nt-sec sm" data-h="undo" data-batch="${esc(b.batchId)}">${esc(T('histUndo'))}</button>` : `<span class="nt-hist-undone">${esc(T('histUndone'))}</span>`}</header><ul>${b.entries.map(e => `<li data-undone="${e.undone || e.via === 'undo' ? '1' : '0'}"><span>${esc(label(e))}</span><em>${esc(T(e.action === 'restore' ? 'histRestore' : 'histApply'))}</em></li>`).join('')}</ul></section>`
        }).join('')
      slot.onclick = async e => {
        const b = e.target.closest('[data-h]'); if (!b) return
        if (b.dataset.h === 'undo') {
          try { await root.showConfirm({ title: T('histUndoT'), body: esc(T('histUndoS')), okText: T('histUndo'), okStyle: 'warning', icon: 'fa-rotate-left' }) } catch (x) { return }
          undo({ batchId: b.dataset.batch })
        } else if (b.dataset.h === 'all') {
          try { await root.showConfirm({ title: T('genRestoreAllT'), body: esc(T('genRestoreAllS', { n: restorable.length })), okText: T('histRestoreAllOk'), okStyle: 'danger', icon: 'fa-rotate-left' }) } catch (x) { return }
          execute(restorable, 'restore', { single: false })
        }
      }
    }

    // ── events ──
    host.addEventListener('click', e => {
      const t = e.target.closest('[data-act],[data-chip]')
      if (!t || !host.contains(t)) return
      if (t.dataset.chip) { S.chip = S.chip === t.dataset.chip ? 'all' : t.dataset.chip; paintChips(); paintLanes(); return }
      const id = t.dataset.id
      switch (t.dataset.act) {
        case 'open': toggleOpen(id); break
        case 'flip': flip(id); break
        case 'premium': if (root.JylliPremium) root.JylliPremium.open(); break
        case 'lane': { const l = t.dataset.lane; lsSet('sec_col_cm_' + l, laneCollapsed(l) ? '0' : '1'); paintLanes(); break }
        case 'clear': S.q = ''; S.chip = 'all'; qIn.value = ''; paintChips(); paintLanes(); break
        case 'rescan': rescan(); break
        case 'recommended': batch(model().recommendedIds, 'apply', 'pvRecTitle'); break
        case 'putback': batch(model().drifted, 'apply', 'pvPutTitle'); break
        case 'reboot': if (root.genRebootNow) root.genRebootNow(); break
        case 'undolast': undoLast(); break
        case 'consumers': loadConsumers(); break
        case 'find': doFind(t.dataset.fid); break
        default: break
      }
    })

    function doFind(fid) {
      const f = finds().find(x => x.id === fid), a = f && P.actionOf(f)
      if (!a) return
      if (a.kind === 'tab') { if (root.showPage) root.showPage('bios-tuner', a.tab) }
      else if (a.kind === 'consumers') { loadConsumers(); consCard.scrollIntoView({ behavior: still() ? 'auto' : 'smooth', block: 'center' }) }
      else if (a.kind === 'switch') flip(a.id)
      else if (a.kind === 'reveal') reveal(a.id)
      else if (a.kind === 'url') { try { root.api.openExternal(a.url) } catch (e) { /* no browser */ } }
    }

    async function loadConsumers() {
      if (S.consumersBusy) return
      S.consumersBusy = true; paintConsumers()
      let r = null
      try { r = await root.api.cpumem2Consumers() } catch (e) { r = null }
      S.consumersBusy = false
      if (S.disposed) return
      if (!r || !r.ok) ctx.toast(T('consFailT'), T('consFailS'), 'err')
      else S.consumers = r
      paintConsumers()
      // a snapshot can name a program that is hogging the CPU: re-run the live rules with it
      computeLive(true)
    }

    function toggleOpen(id) {
      const row = host.querySelector('#tcw-' + CSS.escape(id)); if (!row) return
      const open = !S.open.has(id)
      if (open) S.open.add(id); else S.open.delete(id)
      row.toggleAttribute('data-open', open)
      row.querySelector('.nt-head').setAttribute('aria-expanded', String(open))
      const d = row.querySelector('.nt-details'); d.hidden = !open
      if (open) buildDetails(row, item(id))
    }

    function reveal(id) {
      const it = item(id)
      if (!model()) { S.pendingReveal = id; return }
      if (!it) return
      show('tune')
      S.q = ''; qIn.value = ''; S.chip = 'all'
      lsSet('sec_col_cm_' + it.lane, '0')
      S.open.add(id)
      paintTune()
      const row = host.querySelector('#tcw-' + CSS.escape(id)); if (!row) return
      row.scrollIntoView({ behavior: still() ? 'auto' : 'smooth', block: 'center' })
      row.classList.remove('nt-flash'); void row.offsetWidth; row.classList.add('nt-flash')
      setTimeout(() => row.classList.remove('nt-flash'), 1600)
    }

    // ── changing things ──
    async function gate(ids) {
      for (const id of ids) {
        const cf = root.checkSmartConflict ? await root.checkSmartConflict(id) : null
        if (cf) { try { await root.showConfirm({ title: cf.title, body: cf.body, okText: ui('conflictEngineApplyAnyway'), okStyle: cf.severity || 'warning', icon: cf.icon || 'fa-triangle-exclamation' }) } catch (e) { return false } }
        if (root.confirmTier && !(await root.confirmTier(id))) return false
      }
      return true
    }
    async function flip(id) {
      const it = item(id); if (!it || S.phase !== 'ready') return
      if (it.locked) { if (root.JylliPremium) root.JylliPremium.open(); return }
      const action = P.flipAction(it)
      if (it.status === 'drifted' || action === 'apply') {
        if (!(await gate([id]))) { paintTune(); return }
        if (root.JylliStage && root.JylliStage.shouldStage(id, 'apply')) { root.JylliStage.add(id, 'apply'); return }
        return execute([id], 'apply', { single: true })
      }
      return execute([id], 'restore', { single: true })
    }
    async function batch(ids, action, titleKey) {
      const m = model(); if (!m || !ids || !ids.length || S.phase !== 'ready') return
      const chosen = await root.JylliNetworkViews.preview(ctx, { ids, action, titleKey })
      if (!chosen || !chosen.length) return
      if (!(await gate(chosen))) return
      return execute(chosen, action, { single: false })
    }
    function takeSnap(res) {
      S.model = res.model; S.facts = res.facts || S.facts; S.when = res.when; S.stale = !!res.stale; S.read = !!res.read || !!res.when
      if (res.rules) S.rules = res.rules
      if (typeof res.premium === 'boolean') S.premium = res.premium
      computeLive(true)
    }
    async function execute(ids, action, o = {}) {
      if (S.phase !== 'ready' || !ids.length) return null
      S.phase = 'running'; S.runIds = new Set(ids); S.progress = null; S.receipt = null
      paintAll()
      const unsub = root.api.onBatchProgress ? root.api.onBatchProgress(p => { if (p && p.label === 'cpumem' && !S.disposed) { S.progress = p; paintStage() } }) : null
      let res
      try { res = await root.api.cpumem2Run({ ids, action }) } catch (e) { res = { ok: false, error: String((e && e.message) || e) } }
      if (typeof unsub === 'function') unsub()
      S.phase = 'ready'; S.runIds = new Set()
      if (S.disposed) return res
      if (!res || !res.ok) {
        if (res && res.aborted) ctx.toast(T('rpFailT'), res.guidance || T('rpFailS'), 'err', 9000)
        else if (res && res.error === 'premium_required') { ctx.toast(T('premiumT'), T('premiumS'), 'info'); if (root.JylliPremium) root.JylliPremium.open() }
        else ctx.toast(T('runFailT'), (res && res.error) || T('runFailS'), 'err')
        paintAll(); return res
      }
      takeSnap(res)
      const r = res.receipt
      for (const i of r.items) if (i.status === 'ok') S.flash[i.id] = i.verified === false ? 'warn' : 'ok'
      setTimeout(() => { S.flash = {}; if (!S.disposed) paintTune() }, 2200)
      const name = nameOf(r.items[0] && r.items[0].id)
      if (o.single) {
        const i = r.items[0]
        if (!i || i.status !== 'ok') ctx.toast(T('failedName', { name }), (i && i.error) || T('runFailS'), 'err')
        else if (i.verified === false) ctx.toast(T('mismatchT', { name }), T('mismatchS'), 'warn', 8000)
        else if (action === 'apply' && root.showUndoSnackbar && i.journalId) root.showUndoSnackbar(i.id, name, i.journalId)
        else ctx.toast(T('restoredName', { name }), '', 'info')
      } else S.receipt = r
      await loadHistory()
      paintAll()
      if (!still() && !o.single) { const rs = receiptSlot.firstElementChild; if (rs) rs.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }
      return res
    }
    async function loadHistory() {
      try {
        const h = await root.api.cpumem2History()
        if (S.disposed || !h || !h.ok) return
        S.history = h
        S.lastBatch = h.batches.find(b => b.via !== 'undo' && b.entries.some(x => !x.undone && x.via !== 'undo')) || null
      } catch (e) { /* history is optional */ }
    }
    async function undo(target, force) {
      let r = await root.api.cpumem2Undo({ target, force: !!force })
      if (r && !r.ok && r.conflict && !force) {
        try { await root.showConfirm({ title: T('conflictT'), body: esc(T('conflictS')), okText: T('conflictOk'), okStyle: 'warning', icon: 'fa-triangle-exclamation' }) } catch (e) { return r }
        r = await root.api.cpumem2Undo({ target, force: true })
      }
      if (r && r.model) takeSnap({ ...r, read: true })
      if (r && r.ok) { S.receipt = null; ctx.toast(T('undoneT'), '', 'ok') } else ctx.toast(T('undoFailT'), (r && r.error) || '', 'err')
      await loadHistory(); paintAll()
      if (lab) lab.refresh()
      return r
    }
    async function undoLast() {
      const b = S.lastBatch; if (!b) return
      try { await root.showConfirm({ title: T('undoLastT'), body: esc(T('undoLastS', { n: b.entries.filter(x => !x.undone).length })), okText: T('undoLast'), okStyle: 'warning', icon: 'fa-rotate-left' }) } catch (e) { return }
      await undo({ batchId: b.batchId })
    }

    // ── live: one frame a second while this tab is open and visible; findings re-run on the rolling window ──
    function onLive(msg) {
      if (S.disposed || !msg) return
      if (msg.paused) { S.live = 'paused'; paintStage(); return }
      if (msg.resumed) { S.live = 'on'; paintStage(); return }
      if (msg.ended) { S.live = 'off'; paintStage(); return }
      const f = msg.frame; if (!f) return
      if (S.live !== 'on') { S.live = 'on'; paintStage() }
      S.frame = f; S.frames.push(f); if (S.frames.length > FRAMES_MAX) S.frames.shift()
      die.update(f, base())
      mem.update(root.JylliCpuMemMemory.strata(f.mem))
      paintPackage()
      if (++frameN % FINDS_EVERY === 0) computeLive(false)
    }
    function computeLive(force) {
      const F = root.JylliCpuMemFindings
      if (!F) return
      const temp = root.JylliTelemetry && root.JylliTelemetry.value ? root.JylliTelemetry.value('cpu.temp.package') : null
      S.liveFinds = F.live(S.frames, { base: base(), cpuTemp: temp, consumers: S.consumers && S.consumers.cpu ? S.consumers.cpu : null })
      const key = S.liveFinds.map(f => f.id).join(',')
      if (force || key !== S.findKey) { S.findKey = key; paintFinds(); paintStage() }
    }
    function liveStart() {
      if (S.disposed || !root.api.cpumem2LiveStart) return
      if (!liveUnsub && root.api.onCpumem2Live) liveUnsub = root.api.onCpumem2Live(onLive)
      root.api.cpumem2LiveStart().then(r => { if (S.disposed) return; S.live = r && r.ok ? (r.paused ? 'paused' : 'on') : 'off'; paintStage() }).catch(() => {})
      clearInterval(beatTimer); beatTimer = setInterval(() => { try { root.api.cpumem2LiveBeat() } catch (e) { /* main process gone */ } }, BEAT_MS)
    }
    function liveStop() {
      clearInterval(beatTimer); beatTimer = null
      try { root.api.cpumem2LiveStop() } catch (e) { /* already stopped */ }
      if (S.live === 'on') S.live = 'off'
    }
    const onVis = () => { if (S.disposed) return; if (document.hidden) liveStop(); else liveStart() }
    document.addEventListener('visibilitychange', onVis)

    // ── scan ──
    function takeScan(r) { takeSnap(r); S.failed = false }
    async function rescan() {
      if (S.disposed || (S.phase !== 'ready' && S.phase !== 'scan')) return
      S.reading = true; paintStage()
      let r = null
      try { r = await root.api.cpumem2Scan() } catch (e) { r = null }
      if (S.disposed) return
      S.reading = false
      if (r && r.ok) takeScan(r)
      else { S.failed = true; ctx.toast(T('scanFailT'), T('scanFailS'), 'err') }
      paintAll()
      if (S.pendingReveal && model()) { const id = S.pendingReveal; S.pendingReveal = null; reveal(id) }
      if (lab) lab.refresh()
    }
    function scheduleRescan() {
      if (S.disposed || S.phase !== 'ready') return
      clearTimeout(rescanTimer)
      rescanTimer = setTimeout(() => { if (!S.disposed && S.phase === 'ready') rescan() }, 900)
    }

    // ── start ──
    S.phase = 'ready'
    paintAll()
    ;(async () => {
      try { const warm = await root.api.cpumem2Cached(); if (!S.disposed && warm && warm.ok && !S.model) { takeScan(warm); S.stale = true; paintAll() } } catch (e) { /* no warm start */ }
      loadHistory().then(() => { if (!S.disposed) paintStage() })
      liveStart()
      await rescan()
    })()
    if (root.api.onSettingsPatch) { const u = root.api.onSettingsPatch(() => scheduleRescan()); if (typeof u === 'function') unsubs.push(u) }
    // The legacy hardware page shares one cleanup with the GPU and Power tabs, which does not run on a tab change: stop on our own when this tab is gone.
    watchTimer = setInterval(() => { if (!S.disposed && !host.isConnected) inst.destroy() }, WATCH_MS)
    const inst = {
      S, reveal, scheduleRescan,
      destroy() {
        if (S.disposed) return
        S.disposed = true; clearTimeout(rescanTimer); clearTimeout(qTimer); clearInterval(watchTimer)
        document.removeEventListener('visibilitychange', onVis)
        liveStop()
        if (typeof liveUnsub === 'function') { try { liveUnsub() } catch (e) { /* already gone */ } }
        unsubs.forEach(u => { try { u() } catch (e) { /* already gone */ } })
        if (lab && lab.destroy) lab.destroy()
        if (die) die.destroy(); if (mem) mem.destroy()
        const V = root.JylliNetworkViews; if (V && V.closeSheet) V.closeSheet()
        host.remove(); if (current === inst) current = null
      },
    }
    current = inst
    root.registerPageCleanup('hardware', () => inst.destroy())
    return inst
  }

  api.mount = mount
  api.sync = () => { if (current) current.scheduleRescan() }
  api.reveal = id => { if (current) current.reveal(id) }
  api.current = () => current
})(typeof window !== 'undefined' ? window : globalThis)
