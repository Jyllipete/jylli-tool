'use strict'
// Network tab "Signal": one stage (the Path strip + a verdict), four views (Overview, Tune, Measure, History).
// Engine in lib/network (main.js `// ─── Network`), pure helpers in js/network/pure.js, strip in path-view.js, cards in cards.js, sheets/receipt/history in views.js.
// Every switch shows its live state read from Windows and verified after each change. Root carries .jk so legacy resets stay out.
;(function (root) {
  const P = root.JylliNetworkPure || (typeof require === 'function' ? require('./pure') : null)
  const api = { mount() {}, sync() {}, reveal() {} }
  root.JylliNetworkPage = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  const T = (k, v) => root.tG('net2', k, v)
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const still = () => document.documentElement.classList.contains('motion-reduced') || document.body.classList.contains('game-live')
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
  const ui = k => root.tUI(k)
  const nameOf = id => (root.tName && root.tName(id)) || (root._tweakMeta && root._tweakMeta[id] && root._tweakMeta[id].name) || id
  const descOf = id => (root.tDesc && root.tDesc(id)) || ''
  const lsGet = k => { try { return localStorage.getItem(k) } catch (e) { return null } }
  const lsSet = (k, v) => { try { localStorage.setItem(k, v) } catch (e) { /* storage may be unavailable */ } }
  const PRESET_OF = { 'dns-cloudflare': 'cloudflare', 'dns-google': 'google', 'dns-quad9': 'quad9', 'dns-adguard': 'adguard' }

  let current = null

  function mount(c) {
    if (current) current.destroy()
    const host = el('div', 'jk nt')
    c.appendChild(host)
    const S = { model: null, stale: false, when: null, read: false, phase: 'scan', reading: true, q: '', chip: 'all', open: new Set(), receipt: null, history: null, lastBatch: null,
      progress: null, runIds: new Set(), flash: {}, disposed: false, view: 'overview', failed: false, last: null, ck: null, doneFinds: new Set(), outdated: false,
      livePath: null, cuPath: null, live: { running: false, host: '1.1.1.1' }, bench: null, benching: false, m: null }
    const unsubs = []
    let rescanTimer = null, scanToken = 0, measure = null, pathView = null
    const model = () => S.model
    const item = id => (S.model ? S.model.items.find(i => i.id === id) : null)

    // ── frame ──
    const bar = el('div', 'nt-bar'); bar.dataset.tour = 'net-views'
    const seg = root.JylliTab.seg(P.VIEWS.map(v => ({ id: v, label: T('seg_' + v), icon: { overview: 'stethoscope', tune: 'sliders', measure: 'gauge-high', history: 'clock-rotate-left' }[v] })), S.view, id => show(id))
    bar.appendChild(seg.el)
    const views = { overview: el('div', 'nt-view'), tune: el('div', 'nt-view'), measure: el('div', 'nt-view'), history: el('div', 'nt-view') }
    for (const k of Object.keys(views)) views[k].hidden = k !== S.view
    const bannerSlot = el('div', 'nt-banner-slot')
    const stage = el('section', 'nt-stage'); stage.dataset.tour = 'net-stage'
    stage.setAttribute('aria-live', 'polite')
    const pathHost = el('div', 'nt-path'), verdictEl = el('div', 'nt-verdict')
    stage.append(pathHost, verdictEl)
    const receiptSlot = el('div', 'nt-receipt-slot')
    host.append(bar, bannerSlot, stage, receiptSlot, views.overview, views.tune, views.measure, views.history)
    pathView = root.JylliNetPath.mount(pathHost)

    const ovSlot = el('div', 'nt-ov'); views.overview.appendChild(ovSlot)
    const resolverSlot = el('div', 'nt-resolver-slot')
    const tools = el('div', 'nt-tools')
    tools.innerHTML = `<label class="nt-search"><i class="fa fa-magnifying-glass" aria-hidden="true"></i><input type="search" data-q placeholder="${esc(T('search'))}" aria-label="${esc(T('search'))}"></label><div class="nt-chips-bar" role="group" aria-label="${esc(T('filterBy'))}"></div>`
    const lanesEl = el('div', 'nt-lanes')
    const footEl = el('p', 'nt-foot nt-unavail'); footEl.hidden = true
    views.tune.append(resolverSlot, tools, lanesEl, footEl)
    const chipsEl = tools.querySelector('.nt-chips-bar'), qIn = tools.querySelector('[data-q]')
    let qTimer = null
    qIn.addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(() => { S.q = qIn.value; paintLanes() }, 120) })

    const ctx = {
      T, esc, el, ui, S, still, nameOf, descOf, P, host, model, item, api: root.api,
      toast: (...a) => { try { root.toast(...a) } catch (e) { /* toast is optional */ } },
      refreshAll: () => paintAll(), loadHistory, undo, execute, rescan, liveStart, liveStop,
    }
    function show(id) {
      S.view = id
      seg.set(id)
      stage.dataset.compact = id === 'overview' ? '0' : '1'
      for (const k of Object.keys(views)) views[k].hidden = k !== id
      if (id === 'history') { const V = root.JylliNetworkViews; if (V) V.history(views.history, ctx) }
      if (id === 'measure' && !measure) measure = root.JylliNetworkCards.measure(views.measure, ctx)
      if (id === 'tune') paintTune()
    }

    // ── paint ──
    function paintAll() {
      if (S.disposed) return
      paintBanner(); paintStage(); paintOverview()
      if (S.view === 'tune') paintTune()
      const V = root.JylliNetworkViews
      if (V) V.receipt(receiptSlot, ctx)
      if (S.view === 'history' && V) V.history(views.history, ctx)
    }
    function paintTune() { paintResolver(); paintChips(); paintLanes() }
    function paintOverview() { root.JylliNetworkCards.overview(ovSlot, ctx) }
    function paintResolver() {
      const m = model(), doh = m ? item('dns-doh') : null
      root.JylliNetworkCards.resolver(resolverSlot, ctx, doh ? rowHtml(doh, false) : '')
      if (doh && S.open.has('dns-doh')) { const row = resolverSlot.querySelector('#tcw-dns-doh'); if (row) buildDetails(row, doh) }
    }
    const agoText = ms => { const a = P.ago(ms); return a ? T('ago_' + a.k, { n: a.n }) : '' }

    function paintBanner() {
      const m = model()
      const rows = []
      if (S.model && !S.read) rows.push({ tone: 'warn', icon: 'plug-circle-exclamation', t: T('bnUnreadT'), s: T('bnUnreadS'), act: 'rescan', label: T('retry') })
      else if (S.stale) rows.push({ tone: 'warn', icon: 'clock', t: T('bnStaleT', { when: agoText(S.when) }), s: T('bnStaleS'), act: 'rescan', label: T('retry') })
      if (m && m.drifted.length) rows.push({ tone: 'warn', icon: 'rotate-left', t: T('bnDriftT', { n: m.drifted.length }), s: T('bnDriftS'), act: 'putback', label: T('ctaPutBack', { n: m.drifted.length }) })
      if (m && m.pendingRestart.length) rows.push({ tone: 'info', icon: 'rotate-right', t: T('bnRestartT', { n: m.pendingRestart.length }), s: T('bnRestartS'), act: 'reboot', label: T('restartNow') })
      bannerSlot.innerHTML = rows.map(r => `<div class="nt-banner" data-tone="${r.tone}"><span class="nt-banner-ico"><i class="fa fa-${r.icon}" aria-hidden="true"></i></span><span class="nt-banner-t"><b>${esc(r.t)}</b><span>${esc(r.s)}</span></span><button type="button" class="nt-sec sm" data-act="${r.act}">${esc(r.label)}</button></div>`).join('')
    }

    // The path the stage shows: a live trace beats a checkup in progress beats the last checkup beats "nothing measured yet" (the link and PC nodes always come from the latest read).
    function stagePath() {
      const m = model(), idle = m && m.path
      if (S.live.running && S.livePath) return S.livePath
      if (S.phase === 'checkup' && S.cuPath) return S.cuPath
      if (S.last && S.last.path) {
        if (!idle) return S.last.path
        return { ...S.last.path, nodes: S.last.path.nodes.map(n => (n.id === 'pc' || n.id === 'link') && idle.nodes ? idle.nodes.find(x => x.id === n.id) || n : n) }
      }
      return idle || null
    }

    function paintStage() {
      const m = model()
      const busy = S.phase === 'running' || S.phase === 'checkup'
      stage.dataset.compact = S.view === 'overview' ? '0' : '1'
      stage.dataset.state = S.phase === 'checkup' ? 'run' : S.phase === 'running' ? 'run' : S.reading ? 'scan' : 'ready'
      const path = stagePath()
      pathView.update(path, { live: (S.live.running && !!S.livePath) || S.phase === 'checkup', busy })
      let tone = 'idle', eyebrow = '', title = '', lead = '', actions = '', chips = ''
      if (S.phase === 'checkup') {
        tone = 'accent'; eyebrow = T('eyeCk'); title = T('vCk'); lead = T('leadCk')
        actions = `<button type="button" class="nt-cta" disabled><i class="fa fa-circle-notch fa-spin" aria-hidden="true"></i>${esc(T('working'))}</button>`
      } else if (S.phase === 'running') {
        const p = S.progress
        tone = 'accent'; eyebrow = T('eyeRun'); title = T('vRun'); lead = p && p.id ? T('leadRun', { name: nameOf(p.id), step: p.step || 1, total: p.total || S.runIds.size }) : T('leadRunRp')
        actions = `<button type="button" class="nt-cta" disabled><i class="fa fa-circle-notch fa-spin" aria-hidden="true"></i>${esc(T('working'))}</button>`
      } else if (!m) {
        eyebrow = T('eyeScan'); title = T('vScan'); lead = T('leadScan')
      } else {
        const v = P.stageVerdict(path, m, S.last)
        tone = v.tone
        const liveOn = S.live.running && S.livePath
        eyebrow = liveOn ? T('eyeLive', { host: S.live.host }) : !m.live ? T('eyeNever') : S.last && path && path.verdict && path.verdict.id !== 'idle' ? T('eyeChecked', { when: agoText(S.last.at) }) : S.stale ? T('eyeStale', { when: agoText(S.when) }) : T('eyeIdle')
        title = T(v.key, v.vars)
        lead = liveOn ? T('leadLive', { host: S.live.host }) : S.last ? T('leadLast') : T('leadNone')
        const f = m.facts
        if (f && f.adapter) {
          const w = f.wlan
          chips += `<span class="nt-fact"><i class="fa fa-${f.adapter.wifi ? 'wifi' : 'ethernet'}" aria-hidden="true"></i>${esc(f.adapter.wifi && w && w.ssid ? w.ssid : f.adapter.name)}</span>`
          if (f.gateway) chips += `<span class="nt-fact"><i class="fa fa-tower-broadcast" aria-hidden="true"></i>${S.router ? esc(S.router) + ' · ' : ''}<span class="mono">${esc(f.gateway)}</span></span>`
        }
        if (m.resolver && m.resolver.known && m.resolver.current) chips += `<span class="nt-fact"><i class="fa fa-globe" aria-hidden="true"></i>${esc(T('preset_' + m.resolver.current))}</span>`
        const prim = `<button type="button" class="nt-cta" data-act="checkup" data-tour="net-checkup"><i class="fa fa-stethoscope" aria-hidden="true"></i>${esc(T(S.last ? 'ctaCheckupAgain' : 'ctaCheckup'))}</button>`
        const put = m.drifted.length ? `<button type="button" class="nt-sec warn" data-act="putback"><i class="fa fa-rotate-left" aria-hidden="true"></i>${esc(T('ctaPutBack', { n: m.drifted.length }))}</button>` : ''
        const rec = m.recommendedIds.length ? `<button type="button" class="nt-sec" data-act="recommended"><i class="fa fa-wand-magic-sparkles" aria-hidden="true"></i>${esc(T('ctaApply', { n: m.recommendedIds.length }))}</button>` : ''
        actions = prim + put + rec + (S.lastBatch ? `<button type="button" class="nt-sec" data-act="undolast" data-tour="net-undo"><i class="fa fa-rotate-left" aria-hidden="true"></i>${esc(T('undoLast'))}</button>` : '')
      }
      verdictEl.dataset.tone = tone
      verdictEl.innerHTML = `<div class="nt-eyebrow"><span class="nt-dot"></span>${esc(eyebrow)}</div><h2 class="nt-title">${esc(title)}</h2><p class="nt-lead">${esc(lead)}</p>${chips ? `<div class="nt-facts-row">${chips}</div>` : ''}<div class="nt-actions">${actions}</div>`
    }

    function paintChips() {
      const m = model()
      const counts = m ? P.chipCounts(m.items) : {}
      chipsEl.innerHTML = P.CHIPS.map(ch => {
        if (!m) return ''
        if (ch === 'drifted' && !counts[ch]) return ''
        return `<button type="button" class="nt-chip" data-chip="${ch}" aria-pressed="${S.chip === ch}">${esc(T('chip_' + ch))}<b>${counts[ch] || 0}</b></button>`
      }).join('')
    }

    function laneCollapsed(id) { const v = lsGet('sec_col_nt_' + id); return v == null ? id === 'retired' : v === '1' }

    function paintLanes() {
      const m = model()
      if (!m) { lanesEl.innerHTML = Array.from({ length: 2 }, () => `<div class="nt-lane sk"><div class="nt-lane-h"></div>${'<div class="nt-row sk"></div>'.repeat(3)}</div>`).join(''); return }
      const focusRow = document.activeElement && document.activeElement.closest ? document.activeElement.closest('.nt-row') : null
      const focusId = focusRow && lanesEl.contains(focusRow) ? focusRow.dataset.tweakId : null
      const focusAct = focusId ? document.activeElement.dataset.act : null
      const searching = !!S.q.trim()
      let shown = 0, first = true
      const html = m.lanes.filter(l => l.id !== 'resolver').map(l => {
        const rows = l.ids.map(id => item(id)).filter(it => P.chipMatch(it, S.chip) && P.matches(it, S.q, nameOf(it.id) + ' ' + descOf(it.id)))
        if (!rows.length) return ''
        shown += rows.length
        const col = !searching && S.chip === 'all' && laneCollapsed(l.id)
        const pct = l.total ? Math.round((l.on / l.total) * 100) : 0
        const body = col ? '' : rows.map(it => { const h = rowHtml(it, first); first = false; return h }).join('')
        const once = l.id === 'repair'
        return `<section class="nt-lane" data-lane="${l.id}" data-collapsed="${col ? '1' : '0'}"><button type="button" class="nt-lane-h" data-act="lane" data-lane="${l.id}" aria-expanded="${!col}"><span class="nt-lane-ico"><i class="fa fa-${P.LANE_ICON[l.id] || 'circle'}" aria-hidden="true"></i></span><span class="nt-lane-t"><b>${esc(T('lane_' + l.id))}</b><span>${esc(T('laneSub_' + l.id))}</span></span>${once ? '<span></span><span></span>' : `<span class="nt-lane-n">${l.on}<small>/${l.total}</small></span><span class="nt-lane-bar" aria-hidden="true"><i style="width:${pct}%"></i></span>`}<i class="fa fa-chevron-down nt-lane-chev" aria-hidden="true"></i></button>${l.id === 'retired' && !col ? `<div class="nt-lane-warn"><i class="fa fa-box-archive" aria-hidden="true"></i>${esc(T('retiredWarn'))}</div>` : ''}<div class="nt-rows">${body}</div></section>`
      }).join('')
      lanesEl.innerHTML = html || `<div class="nt-empty"><i class="fa fa-magnifying-glass" aria-hidden="true"></i><b>${esc(T('noMatchT'))}</b><span>${esc(T('noMatchS', { q: S.q }))}</span><button type="button" class="nt-sec sm" data-act="clear">${esc(T('clearFilter'))}</button></div>`
      if (focusId) { const f = lanesEl.querySelector(`#tcw-${CSS.escape(focusId)} [data-act="${focusAct}"]`) || lanesEl.querySelector(`#tcw-${CSS.escape(focusId)} .nt-head`); if (f) f.focus({ preventScroll: true }) }
      for (const id of S.open) { const row = lanesEl.querySelector('#tcw-' + CSS.escape(id)); if (row) buildDetails(row, item(id)) }
      footEl.hidden = !m.unavailable.length
      if (m.unavailable.length) { footEl.innerHTML = `<i class="fa fa-circle-info" aria-hidden="true"></i>${esc(T('unavailable', { n: m.unavailable.length }))}`; footEl.title = m.unavailable.map(nameOf).join(', ') }
    }

    function statusText(it) {
      if (it.once) return it.lastRun ? T('lastRun', { when: agoText(it.lastRun) }) : T('neverRun')
      if (it.status === 'unknown') return T(it.remembered === 'applied' ? 'st_unknownApplied' : 'st_unknown')
      return T('st_' + it.status)
    }

    function rowHtml(it, isFirst) {
      const id = it.id, look = P.statusLook(it.status), on = P.isOn(it), busy = S.runIds.has(id), open = S.open.has(id)
      const chips = []
      if (it.rec) chips.push(`<span class="nt-chip-s rec"><i class="fa fa-thumbs-up" aria-hidden="true"></i>${esc(T('tagRec'))}</span>`)
      if (it.reboot) chips.push(`<span class="nt-chip-s"><i class="fa fa-rotate-right" aria-hidden="true"></i>${esc(T('tagRestart'))}</span>`)
      if (it.tier >= 2) chips.push(`<span class="nt-chip-s risk2"><i class="fa fa-circle-exclamation" aria-hidden="true"></i>${esc(T('tagCaution'))}</span>`)
      const notes = []
      if (it.caution) notes.push(ui('applic_' + it.caution))
      let ctl
      if (it.once) ctl = `<button type="button" class="nt-sec sm" data-act="once" data-id="${esc(id)}"${busy || S.phase !== 'ready' ? ' disabled' : ''}><i class="fa fa-play" aria-hidden="true"></i>${esc(T('runOnce'))}</button>`
      else if (it.retired) ctl = it.remembered === 'applied' ? `<button type="button" class="nt-sec sm" data-act="flip" data-id="${esc(id)}"${busy ? ' disabled' : ''}>${esc(T('restore'))}</button>` : ''
      else if (it.status === 'drifted') ctl = `<button type="button" class="nt-sec sm warn" data-act="flip" data-id="${esc(id)}"${busy ? ' disabled' : ''}>${esc(T('putBack'))}</button>`
      else ctl = `<button type="button" role="switch" class="nt-sw${busy ? ' busy' : ''}" aria-checked="${on}" aria-label="${esc(nameOf(id))}" data-act="flip" data-id="${esc(id)}"${busy || P.isLocked(it) ? ' disabled' : ''}${P.isLocked(it) ? ` title="${esc(T('lockedWhy'))}"` : ''}><span class="nt-knob"></span></button>`
      return `<article class="nt-row" id="tcw-${esc(id)}" data-tweak-id="${esc(id)}" data-status="${it.status}" data-tier="${it.tier}" data-applied="${on ? '1' : '0'}"${S.flash[id] ? ` data-flash="${S.flash[id]}"` : ''}${isFirst ? ' data-tour="tweak-card"' : ''}${open ? ' data-open="1"' : ''}>
        <div class="nt-main"><button type="button" class="nt-head" data-act="open" data-id="${esc(id)}" aria-expanded="${open}" aria-controls="ntd-${esc(id)}"><span class="nt-glyph" data-tone="${look.tone}"><i class="fa fa-${look.glyph}" aria-hidden="true"></i></span><span class="nt-txt"><span class="nt-name">${esc(nameOf(id))}</span><span class="nt-desc">${esc(descOf(id))}</span>${notes.length ? `<span class="nt-note"><i class="fa fa-triangle-exclamation" aria-hidden="true"></i>${esc(notes[0])}</span>` : ''}</span></button>
        <span class="nt-chips">${chips.join('')}</span><span class="nt-state" data-tone="${look.tone}">${esc(statusText(it))}</span><div class="nt-ctl">${ctl}</div></div>
        <div class="nt-details" id="ntd-${esc(id)}"${open ? '' : ' hidden'}></div></article>`
    }

    function buildDetails(row, it) {
      const V = root.JylliNetworkViews, d = row.querySelector('.nt-details')
      if (V && d && it) V.details(d, it, ctx)
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
        case 'once': runOnce(id); break
        case 'lane': { const l = t.dataset.lane; lsSet('sec_col_nt_' + l, laneCollapsed(l) ? '0' : '1'); paintLanes(); break }
        case 'clear': S.q = ''; S.chip = 'all'; qIn.value = ''; paintChips(); paintLanes(); break
        case 'rescan': rescan(); break
        case 'checkup': checkup(); break
        case 'recommended': batch(model().recommendedIds, 'apply', 'pvRecTitle'); break
        case 'putback': batch(model().drifted, 'apply', 'pvPutTitle'); break
        case 'reboot': if (root.genRebootNow) root.genRebootNow(); break
        case 'undolast': undoLast(); break
        case 'preset': pickPreset(t.dataset.preset); break
        case 'bench': bench(); break
        case 'find-tweak': { const f = S.last && S.last.findings.find(x => x.id === t.dataset.id); if (f && f.action.ids) { S.doneFinds.add(f.id); batch(f.action.ids, 'apply', f.id === 'drifted' ? 'pvPutTitle' : 'pvRecTitle') } break }
        case 'find-dns': S.doneFinds.add('dns-slow'); S.doneFinds.add('dns-down'); pickPreset(t.dataset.preset); break
        case 'find-view': show('measure'); if (t.dataset.view === 'live' && !S.live.running) { const b = views.measure.querySelector('[data-m="live"]'); if (b) b.click() } break
        default: break
      }
    })

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
      const m = model(), it = item(id)
      if (!m) { S.pendingReveal = id; return }
      if (PRESET_OF[id] || id === 'dns-custom') { show('tune'); const r = resolverSlot.querySelector('.nt-resolver'); if (r) { r.scrollIntoView({ behavior: still() ? 'auto' : 'smooth', block: 'center' }); r.classList.remove('nt-flash'); void r.offsetWidth; r.classList.add('nt-flash') } return }
      if (!it) return
      show('tune')
      S.q = ''; qIn.value = ''; S.chip = 'all'
      lsSet('sec_col_nt_' + it.lane, '0')
      S.open.add(id)
      paintTune()
      const row = host.querySelector('#tcw-' + CSS.escape(id)); if (!row) return
      row.scrollIntoView({ behavior: still() ? 'auto' : 'smooth', block: 'center' })
      row.classList.remove('nt-flash'); void row.offsetWidth; row.classList.add('nt-flash')
      setTimeout(() => row.classList.remove('nt-flash'), 1600)
    }

    // ── changing things: one path for a switch, a batch, a repair and a resolver choice ──
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
      const action = P.flipAction(it)
      if (it.status === 'drifted' || action === 'apply') {
        if (!(await gate([id]))) { paintTune(); return }
        if (root.JylliStage && root.JylliStage.shouldStage(id, 'apply')) { root.JylliStage.add(id, 'apply'); return }
        return execute([id], 'apply', { single: true })
      }
      return execute([id], 'restore', { single: true })
    }
    async function runOnce(id) {
      const it = item(id); if (!it || S.phase !== 'ready') return
      if (!(await gate([id]))) return
      return execute([id], 'apply', { single: true, once: true })
    }

    async function batch(ids, action, titleKey) {
      const m = model(); if (!m || !ids || !ids.length || S.phase !== 'ready') return
      const V = root.JylliNetworkViews
      const chosen = await V.preview(ctx, { ids, action, titleKey })
      if (!chosen || !chosen.length) return
      if (!(await gate(chosen))) return
      return execute(chosen, action, { single: false })
    }

    async function pickPreset(preset) {
      const m = model(); if (!m || S.phase !== 'ready') return
      if (m.resolver.known && m.resolver.current === preset && preset !== 'custom') return
      let custom = null
      if (preset === 'custom') {
        custom = await root.JylliNetworkViews.dnsSheet(ctx, m.resolver.custom)
        if (!custom) return
      }
      const ids = preset === 'auto' ? [] : [preset === 'custom' ? 'dns-custom' : 'dns-' + preset]
      if (ids.length && !(await gate(ids))) return
      return execute(ids, 'apply', { single: true, run: () => root.api.net2DnsSet({ preset, custom }), dns: preset })
    }

    async function execute(ids, action, o = {}) {
      if (S.phase !== 'ready' || (!ids.length && !o.run)) return null
      S.phase = 'running'; S.runIds = new Set(ids); S.progress = null; S.receipt = null
      paintAll()
      const unsub = root.api.onBatchProgress ? root.api.onBatchProgress(p => { if (p && p.label === 'network' && !S.disposed) { S.progress = p; paintStage() } }) : null
      let res
      try { res = o.run ? await o.run() : await root.api.net2Run({ ids, action }) } catch (e) { res = { ok: false, error: String((e && e.message) || e) } }
      if (typeof unsub === 'function') unsub()
      S.phase = 'ready'; S.runIds = new Set()
      if (S.disposed) return res
      if (!res || !res.ok) {
        if (res && res.aborted) ctx.toast(T('rpFailT'), res.guidance || T('rpFailS'), 'err', 9000)
        else if (res && res.error && T('err_' + res.error) !== 'err_' + res.error) ctx.toast(T('runFailT'), T('err_' + res.error), 'err')
        else ctx.toast(T('runFailT'), (res && res.error) || T('runFailS'), 'err')
        paintAll(); return res
      }
      S.model = res.model; S.when = res.when; S.stale = !!res.stale; S.read = !!res.when
      const r = res.receipt
      S.outdated = true
      for (const i of r.items) if (i.status === 'ok') S.flash[i.id] = i.verified === false ? 'warn' : 'ok'
      setTimeout(() => { S.flash = {}; if (!S.disposed) paintTune() }, 2200)
      const name = o.dns ? T('preset_' + o.dns) : nameOf(r.items[0] && r.items[0].id)
      if (o.single) {
        const i = r.items[0]
        if (!i || i.status !== 'ok') ctx.toast(T('failedName', { name }), (i && i.error) || T('runFailS'), 'err')
        else if (i.verified === false) ctx.toast(T('mismatchT', { name }), T('mismatchS'), 'warn', 8000)
        else if (o.once) ctx.toast(T('onceDone', { name }), '', 'ok')
        else if (action === 'apply' && root.showUndoSnackbar && i.journalId) root.showUndoSnackbar(i.id, name, i.journalId)
        else ctx.toast(T('restoredName', { name }), '', 'info')
      } else { S.receipt = r }
      await loadHistory()
      paintAll()
      if (!still() && !o.single) { const rs = receiptSlot.firstElementChild; if (rs) rs.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }
      return res
    }

    async function loadHistory() {
      try {
        const h = await root.api.net2History()
        if (S.disposed || !h || !h.ok) return
        S.history = h
        S.lastBatch = h.batches.find(b => b.via !== 'undo' && b.entries.some(x => !x.undone && x.via !== 'undo')) || null
      } catch (e) { /* history is optional */ }
    }

    async function undo(target, force) {
      let r = await root.api.net2Undo({ target, force: !!force })
      if (r && !r.ok && r.conflict && !force) {
        try { await root.showConfirm({ title: T('conflictT'), body: esc(T('conflictS')), okText: T('conflictOk'), okStyle: 'warning', icon: 'fa-triangle-exclamation' }) } catch (e) { return r }
        r = await root.api.net2Undo({ target, force: true })
      }
      if (r && r.model) { S.model = r.model; S.when = r.when; S.stale = false; S.read = true; S.outdated = true }
      if (r && r.ok) { S.receipt = null; ctx.toast(T('undoneT'), '', 'ok') } else ctx.toast(T('undoFailT'), (r && r.error) || '', 'err')
      await loadHistory(); paintAll()
      return r
    }

    async function undoLast() {
      const b = S.lastBatch; if (!b) return
      try { await root.showConfirm({ title: T('undoLastT'), body: esc(T('undoLastS', { n: b.entries.filter(x => !x.undone).length })), okText: T('undoLast'), okStyle: 'warning', icon: 'fa-rotate-left' }) } catch (e) { return }
      await undo({ batchId: b.batchId })
    }

    // ── DNS speed test (the four public resolvers, TCP connect to port 53) ──
    async function bench() {
      if (S.benching || S.phase !== 'ready') return
      S.benching = true; paintResolver()
      let r = null
      try { r = await root.api.benchmarkDns() } catch (e) { r = null }
      S.benching = false
      if (S.disposed) return
      if (r && r.ok) { S.bench = {}; for (const x of r.results) { const p = PRESET_OF[x.tweak]; if (p) S.bench[p] = { median: x.fail ? null : x.median, fail: !!x.fail } } }
      else ctx.toast(T('benchFailT'), T('benchFailS'), 'err')
      paintResolver()
    }

    // ── checkup ──
    async function checkup() {
      if (S.phase !== 'ready') return
      if (S.live.running) await liveStop()
      S.phase = 'checkup'; S.ck = { phase: 'switches' }; S.cuPath = null; S.receipt = null
      if (S.view !== 'overview') show('overview')
      paintAll()
      const unsub = root.api.onNet2Progress ? root.api.onNet2Progress(p => { if (p && p.kind === 'checkup' && !S.disposed) { S.ck = p; paintOverview() } }) : null
      let res
      try { res = await root.api.net2Checkup() } catch (e) { res = { ok: false, error: String((e && e.message) || e) } }
      if (typeof unsub === 'function') unsub()
      S.phase = 'ready'; S.cuPath = null
      if (S.disposed) return
      if (!res || !res.ok) {
        ctx.toast(T('ckFailT'), res && res.error === 'busy' ? T('err_busy') : T('ckFailS'), 'err')
        paintAll(); return
      }
      S.last = { at: res.at, path: res.path, hops: res.hops, findings: res.findings, healthy: res.healthy, measured: res.measured, bench: res.bench }
      S.doneFinds = new Set(); S.outdated = false
      if (res.model) { S.model = res.model; S.when = res.model.when; S.stale = false; S.read = !!res.model.live }
      if (res.bench && res.bench.results) { S.bench = {}; for (const x of res.bench.results) S.bench[x.preset] = { median: x.median, fail: !!x.fail } }
      await loadHistory()
      paintAll()
      try { root.JylliSound && root.JylliSound.play('apply') } catch (e) { /* sound is optional */ }
    }

    // ── live trace ──
    async function liveStart(hostName) {
      if (S.phase === 'checkup') return { ok: false, error: 'busy' }
      const r = await root.api.net2RouteStart({ host: hostName })
      if (S.disposed) return r
      if (r && r.ok) { S.live = { running: true, host: r.host || hostName }; S.livePath = null; paintStage() }
      return r
    }
    async function liveStop() {
      try { await root.api.net2RouteStop() } catch (e) { /* already stopped */ }
      S.live.running = false; S.livePath = null
      if (measure) measure.stopped()
      if (!S.disposed) paintStage()
    }
    if (root.api.onNet2Route) unsubs.push(root.api.onNet2Route(f => {
      if (S.disposed || !f) return
      if (f.target && f.target.checkup) { S.cuPath = f.path; paintStage(); return }
      if (!S.live.running) return
      S.livePath = f.path
      paintStage()
      if (measure) measure.onFrame(f)
    }))

    // The router's own name (UPnP, cached 10 minutes in main.js), shown next to its address when it answers.
    async function loadRouter() {
      if (S.router !== undefined || S.disposed || !root.api.netTopology) return
      S.router = null
      try { const t = await root.api.netTopology(); const id = t && t.ok ? t.identity : null; if (!S.disposed && id) { S.router = id.friendlyName || [id.manufacturer, id.model].filter(Boolean).join(' ') || null; paintStage() } } catch (e) { /* the router name is a nicety */ }
    }

    // ── scan ──
    function takeScan(r) {
      S.model = r.model; S.when = r.when; S.stale = !!r.stale; S.read = !!r.read; S.failed = false
      if (r.last && !S.last) { S.last = r.last; S.outdated = false }
    }
    async function rescan() {
      const token = ++scanToken
      S.reading = true
      paintStage()
      let r
      try { r = await root.api.net2Scan() } catch (e) { r = null }
      if (S.disposed || token !== scanToken) return
      S.reading = false
      if (r && r.ok) takeScan(r)
      else { S.failed = true; ctx.toast(T('scanFailT'), T('scanFailS'), 'err') }
      paintAll()
      if (S.pendingReveal && model()) { const id = S.pendingReveal; S.pendingReveal = null; reveal(id) }
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
      try { const warm = await root.api.net2Cached(); if (!S.disposed && warm && warm.ok && !S.model) { takeScan(warm); S.stale = true; paintAll() } } catch (e) { /* no warm start */ }
      loadHistory().then(() => { if (!S.disposed) paintStage() })
      await rescan()
      loadRouter()
    })()
    if (root.api.onSettingsPatch) { const u = root.api.onSettingsPatch(() => scheduleRescan()); if (typeof u === 'function') unsubs.push(u) }
    const inst = {
      S, reveal, scheduleRescan,
      destroy() {
        S.disposed = true; clearTimeout(rescanTimer); clearTimeout(qTimer)
        unsubs.forEach(u => { try { u() } catch (e) { /* already gone */ } })
        if (S.live.running) { try { root.api.net2RouteStop() } catch (e) { /* already stopped */ } }
        if (measure && measure.destroy) measure.destroy()
        if (pathView) pathView.destroy()
        const V = root.JylliNetworkViews; if (V && V.closeSheet) V.closeSheet()
        host.remove(); if (current === inst) current = null
      },
    }
    current = inst
    root.registerPageCleanup('network', () => inst.destroy())
    return inst
  }

  api.mount = mount
  api.sync = () => { if (current) current.scheduleRescan() }
  api.reveal = id => { if (current) current.reveal(id) }
  api.current = () => current
})(typeof window !== 'undefined' ? window : globalThis)
