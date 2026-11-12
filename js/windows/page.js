'use strict'
// Windows tab "Plumb": every switch shows its live state, read from Windows and verified after each change.
// Engine in lib/windows (main.js `// ─── Windows`), pure helpers in js/windows/pure.js, sheets/receipt/history in js/windows/views.js. Root carries .jk so legacy resets stay out.
// One page for both tabs: mount(c, 'windows') and mount(c, 'qol') differ only by scope.
;(function (root) {
  const P = root.JylliWindowsPure || (typeof require === 'function' ? require('./pure') : null)
  const api = { mount() {}, sync() {}, reveal() {} }
  root.JylliWindowsPage = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  const T = (k, v) => root.tG('windows2', k, v)
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const still = () => document.documentElement.classList.contains('motion-reduced') || document.body.classList.contains('game-live')
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
  const ui = k => root.tUI(k)
  const nameOf = id => (root.tName && root.tName(id)) || (root._tweakMeta && root._tweakMeta[id] && root._tweakMeta[id].name) || id
  const descOf = id => (root.tDesc && root.tDesc(id)) || ''
  const facts = () => { const si = root.sysInfo || {}; return { laptop: !!si.isLaptop, ramGB: si.ramGB || 0 } }
  const lsGet = k => { try { return localStorage.getItem(k) } catch (e) { return null } }
  const lsSet = (k, v) => { try { localStorage.setItem(k, v) } catch (e) { /* storage may be unavailable */ } }

  let current = null

  function mount(c, scope) {
    if (current) current.destroy()
    scope = scope === 'qol' ? 'qol' : 'windows'
    const host = el('div', 'jk wn')
    host.dataset.scope = scope
    c.appendChild(host)
    const S = { scope, models: null, stale: false, when: null, read: false, phase: 'scan', reading: true, q: '', chip: 'all', open: new Set(), receipt: null, history: null, lastBatch: null,
      progress: null, runIds: new Set(), flash: {}, disposed: false, view: 'switches', failed: false }
    const unsubs = []
    let rescanTimer = null, scanToken = 0
    const model = () => (S.models ? S.models[S.scope] : null)
    const item = id => { const m = model(); return m ? m.items.find(i => i.id === id) : null }

    // ── frame ──
    const bar = el('div', 'wn-bar')
    const seg = root.JylliTab.seg([{ id: 'switches', label: T('segSwitches'), icon: 'toggle-on' }, { id: 'history', label: T('segHistory'), icon: 'clock-rotate-left' }], S.view, id => show(id))
    bar.appendChild(seg.el)
    const views = { switches: el('div', 'wn-view'), history: el('div', 'wn-view') }
    views.history.hidden = true
    host.append(bar, views.switches, views.history)
    const sw = views.switches
    const bannerSlot = el('div', 'wn-banner-slot')
    const stage = el('section', 'wn-stage')
    stage.setAttribute('aria-live', 'polite')
    const boardEl = el('div', 'wn-board')
    const verdictEl = el('div', 'wn-verdict')
    stage.append(boardEl, verdictEl)
    const receiptSlot = el('div', 'wn-receipt-slot')
    const tools = el('div', 'wn-tools')
    tools.innerHTML = `<label class="wn-search" data-tour="windows-search"><i class="fa fa-magnifying-glass" aria-hidden="true"></i><input type="search" data-q placeholder="${esc(T('search'))}" aria-label="${esc(T('search'))}"></label><div class="wn-chips-bar" role="group" aria-label="${esc(T('filterBy'))}"></div>`
    const lanesEl = el('div', 'wn-lanes')
    sw.append(bannerSlot, stage, receiptSlot, tools, lanesEl)
    const chipsEl = tools.querySelector('.wn-chips-bar'), qIn = tools.querySelector('[data-q]')
    let qTimer = null
    qIn.addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(() => { S.q = qIn.value; paintLanes() }, 120) })

    const ctx = {
      T, esc, el, ui, S, still, nameOf, descOf, P, host, model, item,
      toast: (...a) => { try { root.toast(...a) } catch (e) { /* toast is optional */ } },
      refreshAll: () => paintAll(), loadHistory, undo, execute, rescan,
    }
    function show(id) {
      S.view = id
      seg.set(id)
      for (const k of Object.keys(views)) views[k].hidden = k !== id
      if (id === 'history') { const V = root.JylliWindowsViews; if (V) V.history(views.history, ctx) }
    }

    // ── paint ──
    function paintAll() {
      if (S.disposed) return
      paintBanner(); paintStage(); paintChips(); paintLanes()
      const V = root.JylliWindowsViews
      if (V) V.receipt(receiptSlot, ctx)
      if (S.view === 'history' && V) V.history(views.history, ctx)
    }

    function agoText(ms) {
      const a = P.ago(ms)
      return a ? T('ago_' + a.k, { n: a.n }) : ''
    }

    function paintBanner() {
      const m = model()
      const rows = []
      if (S.models && !S.read) rows.push({ tone: 'warn', icon: 'plug-circle-exclamation', t: T('bnUnreadT'), s: T('bnUnreadS'), act: 'rescan', label: T('retry') })
      else if (S.stale) rows.push({ tone: 'warn', icon: 'clock', t: T('bnStaleT', { when: agoText(S.when) }), s: T('bnStaleS'), act: 'rescan', label: T('retry') })
      if (m && m.drifted.length) rows.push({ tone: 'warn', icon: 'rotate-left', t: T('bnDriftT', { n: m.drifted.length }), s: T('bnDriftS'), act: 'putback', label: T('ctaPutBack', { n: m.drifted.length }) })
      if (m && m.pendingRestart.length) rows.push({ tone: 'info', icon: 'rotate-right', t: T('bnRestartT', { n: m.pendingRestart.length }), s: T('bnRestartS'), act: 'reboot', label: T('restartNow') })
      bannerSlot.innerHTML = rows.map(r => `<div class="wn-banner" data-tone="${r.tone}"><span class="wn-banner-ico"><i class="fa fa-${r.icon}" aria-hidden="true"></i></span><span class="wn-banner-t"><b>${esc(r.t)}</b><span>${esc(r.s)}</span></span><button type="button" class="wn-sec sm" data-act="${r.act}">${esc(r.label)}</button></div>`).join('')
    }

    function paintStage() {
      const m = model()
      stage.dataset.state = S.phase === 'running' ? 'run' : S.reading ? 'scan' : 'ready'
      // switchboard
      if (!m) {
        boardEl.innerHTML = Array.from({ length: 6 }, () => `<div class="wn-col">${'<i class="wn-cell sk"></i>'.repeat(5)}</div>`).join('')
        boardEl.setAttribute('aria-hidden', 'true')
      } else {
        boardEl.removeAttribute('aria-hidden')
        boardEl.innerHTML = P.board(m).map(col => `<div class="wn-col" role="group" aria-label="${esc(T('lane_' + col.lane))}"><span class="wn-col-ico" title="${esc(T('lane_' + col.lane))}"><i class="fa fa-${col.icon}" aria-hidden="true"></i></span>${col.cells.map(cell =>
          `<button type="button" class="wn-cell${S.runIds.has(cell.id) ? ' run' : ''}${cell.rec ? ' rec' : ''}" data-act="jump" data-id="${esc(cell.id)}" data-status="${cell.status}" data-tone="${P.statusLook(cell.status).tone}" aria-label="${esc(nameOf(cell.id) + ' — ' + T('st_' + cell.status))}" title="${esc(nameOf(cell.id) + ' · ' + T('st_' + cell.status))}"></button>`).join('')}</div>`).join('')
      }
      // verdict
      let tone = 'idle', eyebrow = '', title = '', lead = '', stats = '', actions = ''
      if (S.phase === 'running') {
        const p = S.progress
        tone = 'accent'; eyebrow = T('eyeRun')
        title = T('vRun'); lead = p && p.id ? T('leadRun', { name: nameOf(p.id), step: p.step || 1, total: p.total || S.runIds.size }) : T('leadRunRp')
        actions = `<button type="button" class="wn-cta" disabled><i class="fa fa-spinner fa-spin" aria-hidden="true"></i>${esc(T('working'))}</button>`
      } else if (!m) {
        eyebrow = T('eyeScan'); title = T('vScan'); lead = T('leadScan')
      } else {
        const v = P.verdict(m, S.stale)
        tone = v.tone
        eyebrow = !m.live ? T('eyeNever') : S.stale ? T('eyeStale', { when: agoText(S.when) }) : T('eyeLive', { when: agoText(S.when) })
        title = T(v.key, v.vars)
        lead = !m.live ? T('leadUnread') : v.key === 'vDrift' ? T('leadDrift') : S.stale ? T('leadStale') : v.key === 'vOpen' ? T('leadOpen', v.vars) : T('leadClean', { native: m.verdict.native, jylli: m.verdict.jylli })
        const vd = m.verdict
        stats = `<dl class="wn-stats"><div><dt>${esc(T('statSet'))}</dt><dd>${m.live ? vd.set : '–'}<small>/${vd.total}</small></dd></div><div><dt>${esc(T('statRec'))}</dt><dd>${vd.rec}</dd></div><div><dt>${esc(T('statRestart'))}</dt><dd>${vd.restart}</dd></div></dl>`
        const prim = m.drifted.length ? `<button type="button" class="wn-cta" data-act="putback"><i class="fa fa-rotate-left" aria-hidden="true"></i>${esc(T('ctaPutBack', { n: m.drifted.length }))}</button>`
          : m.recommendedIds.length ? `<button type="button" class="wn-cta" data-act="recommended"><i class="fa fa-wand-magic-sparkles" aria-hidden="true"></i>${esc(T('ctaApply', { n: m.recommendedIds.length }))}</button>` : ''
        const second = m.drifted.length && m.recommendedIds.length ? `<button type="button" class="wn-sec" data-act="recommended">${esc(T('ctaApply', { n: m.recommendedIds.length }))}</button>` : ''
        actions = prim + second + `<button type="button" class="wn-sec" data-act="rescan"${S.reading ? ' disabled' : ''}><i class="fa fa-arrows-rotate${S.reading ? ' fa-spin' : ''}" aria-hidden="true"></i>${esc(T('recheck'))}</button>`
          + (S.lastBatch ? `<button type="button" class="wn-sec" data-act="undolast" data-tour="windows-undo"><i class="fa fa-rotate-left" aria-hidden="true"></i>${esc(T('undoLast'))}</button>` : '')
      }
      verdictEl.dataset.tone = tone
      verdictEl.innerHTML = `<div class="wn-eyebrow"><span class="wn-dot"></span>${esc(eyebrow)}</div><h2 class="wn-title">${esc(title)}</h2><p class="wn-lead">${esc(lead)}</p>${stats}<div class="wn-actions">${actions}</div>`
    }

    function paintChips() {
      const m = model()
      const counts = m ? P.chipCounts(m.items) : {}
      chipsEl.innerHTML = P.CHIPS.map(ch => {
        if (!m) return ''
        if ((ch === 'drifted' || ch === 'restart') && !counts[ch]) return ''
        return `<button type="button" class="wn-chip" data-chip="${ch}" aria-pressed="${S.chip === ch}">${esc(T('chip_' + ch))}<b>${counts[ch] || 0}</b></button>`
      }).join('')
    }

    function laneCollapsed(id) { const v = lsGet('sec_col_wn_' + id); return v == null ? (id === 'expert' || id === 'retired') : v === '1' }

    function paintLanes() {
      const m = model()
      if (!m) { lanesEl.innerHTML = Array.from({ length: 3 }, () => `<div class="wn-lane sk"><div class="wn-lane-h"></div>${'<div class="wn-row sk"></div>'.repeat(3)}</div>`).join(''); return }
      const focusId = document.activeElement && document.activeElement.closest && document.activeElement.closest('.wn-row') ? document.activeElement.closest('.wn-row').dataset.tweakId : null
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
        return `<section class="wn-lane" data-lane="${l.id}" data-collapsed="${col ? '1' : '0'}"><button type="button" class="wn-lane-h" data-act="lane" data-lane="${l.id}" aria-expanded="${!col}"><span class="wn-lane-ico"><i class="fa fa-${P.LANE_ICON[l.id] || 'circle'}" aria-hidden="true"></i></span><span class="wn-lane-t"><b>${esc(T('lane_' + l.id))}</b><span>${esc(T('laneSub_' + l.id))}</span></span><span class="wn-lane-n">${l.on}<small>/${l.total}</small></span><span class="wn-lane-bar" aria-hidden="true"><i style="width:${pct}%"></i></span><i class="fa fa-chevron-down wn-lane-chev" aria-hidden="true"></i></button>${l.id === 'expert' && !col ? `<div class="wn-lane-warn"><i class="fa fa-triangle-exclamation" aria-hidden="true"></i>${esc(T('expertWarn'))}</div>` : ''}${l.id === 'retired' && !col ? `<div class="wn-lane-warn"><i class="fa fa-box-archive" aria-hidden="true"></i>${esc(T('retiredWarn'))}</div>` : ''}<div class="wn-rows">${body}</div></section>`
      }).join('')
      lanesEl.innerHTML = html || `<div class="wn-empty"><i class="fa fa-magnifying-glass" aria-hidden="true"></i><b>${esc(T('noMatchT'))}</b><span>${esc(T('noMatchS', { q: S.q }))}</span><button type="button" class="wn-sec sm" data-act="clear">${esc(T('clearFilter'))}</button></div>`
      if (focusId) { const f = lanesEl.querySelector(`#tcw-${CSS.escape(focusId)} [data-act="${focusAct}"]`) || lanesEl.querySelector(`#tcw-${CSS.escape(focusId)} .wn-head`); if (f) f.focus({ preventScroll: true }) }
      for (const id of S.open) { const row = lanesEl.querySelector('#tcw-' + CSS.escape(id)); if (row) buildDetails(row, item(id)) }
    }

    function statusText(it) {
      if (it.status === 'unknown') return T(it.remembered === 'applied' ? 'st_unknownApplied' : 'st_unknown')
      return T('st_' + it.status)
    }

    function rowHtml(it, isFirst) {
      const id = it.id, look = P.statusLook(it.status), on = P.isOn(it), busy = S.runIds.has(id), open = S.open.has(id)
      const chips = []
      if (it.rec) chips.push(`<span class="wn-chip-s rec"><i class="fa fa-thumbs-up" aria-hidden="true"></i>${esc(T('tagRec'))}</span>`)
      if (it.reboot) chips.push(`<span class="wn-chip-s"><i class="fa fa-rotate-right" aria-hidden="true"></i>${esc(T('tagRestart'))}</span>`)
      if (it.tier >= 3) chips.push(`<span class="wn-chip-s risk3"><i class="fa fa-triangle-exclamation" aria-hidden="true"></i>${esc(T('tagExpert'))}</span>`)
      else if (it.tier === 2) chips.push(`<span class="wn-chip-s risk2"><i class="fa fa-circle-exclamation" aria-hidden="true"></i>${esc(T('tagCaution'))}</span>`)
      if (it.impact === 'high') chips.push(`<span class="wn-chip-s"><i class="fa fa-gauge-high" aria-hidden="true"></i>${esc(T('tagImpact'))}</span>`)
      const notes = []
      if (it.caution) notes.push(ui('applic_' + it.caution))
      for (const w of P.warnsFor(it, facts())) notes.push(w.vars.n ? ui(w.key).replace('{n}', w.vars.n) : ui(w.key))
      let ctl
      if (it.retired) ctl = it.remembered === 'applied' ? `<button type="button" class="wn-sec sm" data-act="flip" data-id="${esc(id)}"${busy ? ' disabled' : ''}>${esc(T('restore'))}</button>` : ''
      else if (it.status === 'drifted') ctl = `<button type="button" class="wn-sec sm warn" data-act="flip" data-id="${esc(id)}"${busy ? ' disabled' : ''}>${esc(T('putBack'))}</button>`
      else if (it.tier >= 3 && !on) ctl = `<button type="button" class="wn-sec sm" data-act="review" data-id="${esc(id)}"${busy ? ' disabled' : ''}>${esc(T('review'))}</button>`
      else ctl = `<button type="button" role="switch" class="wn-sw${busy ? ' busy' : ''}" aria-checked="${on}" aria-label="${esc(nameOf(id))}" data-act="flip" data-id="${esc(id)}"${busy || P.isLocked(it) ? ' disabled' : ''}${P.isLocked(it) ? ` title="${esc(T('lockedWhy'))}"` : ''}><span class="wn-knob"></span></button>`
      return `<article class="wn-row" id="tcw-${esc(id)}" data-tweak-id="${esc(id)}" data-status="${it.status}" data-tier="${it.tier}" data-applied="${on ? '1' : '0'}"${S.flash[id] ? ` data-flash="${S.flash[id]}"` : ''}${isFirst ? ' data-tour="tweak-card"' : ''}${open ? ' data-open="1"' : ''}>
        <div class="wn-main"><button type="button" class="wn-head" data-act="open" data-id="${esc(id)}" aria-expanded="${open}" aria-controls="wnd-${esc(id)}"><span class="wn-glyph" data-tone="${look.tone}"><i class="fa fa-${look.glyph}" aria-hidden="true"></i></span><span class="wn-txt"><span class="wn-name">${esc(nameOf(id))}</span><span class="wn-desc">${esc(descOf(id))}</span>${notes.length ? `<span class="wn-note"><i class="fa fa-triangle-exclamation" aria-hidden="true"></i>${esc(notes[0])}</span>` : ''}</span></button>
        <span class="wn-chips">${chips.join('')}</span><span class="wn-state" data-tone="${look.tone}">${esc(statusText(it))}</span><div class="wn-ctl">${ctl}</div></div>
        <div class="wn-details" id="wnd-${esc(id)}"${open ? '' : ' hidden'}></div></article>`
    }

    function buildDetails(row, it) {
      const V = root.JylliWindowsViews, d = row.querySelector('.wn-details')
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
        case 'review': flip(id); break
        case 'lane': { const l = t.dataset.lane; lsSet('sec_col_wn_' + l, laneCollapsed(l) ? '0' : '1'); paintLanes(); break }
        case 'jump': reveal(id); break
        case 'clear': S.q = ''; S.chip = 'all'; qIn.value = ''; paintChips(); paintLanes(); break
        case 'rescan': rescan(); break
        case 'recommended': batch(model().recommendedIds, 'apply', 'pvRecTitle'); break
        case 'putback': batch(model().drifted, 'apply', 'pvPutTitle'); break
        case 'reboot': if (root.genRebootNow) root.genRebootNow(); break
        case 'undolast': undoLast(); break
        default: break
      }
    })

    function toggleOpen(id) {
      const row = lanesEl.querySelector('#tcw-' + CSS.escape(id)); if (!row) return
      const open = !S.open.has(id)
      if (open) S.open.add(id); else S.open.delete(id)
      row.toggleAttribute('data-open', open)
      row.querySelector('.wn-head').setAttribute('aria-expanded', String(open))
      const d = row.querySelector('.wn-details'); d.hidden = !open
      if (open) buildDetails(row, item(id))
    }

    function reveal(id) {
      const m = model(), it = item(id)
      if (!m) { S.pendingReveal = id; return }
      if (!it) return
      if (S.view !== 'switches') show('switches')
      S.q = ''; qIn.value = ''; S.chip = 'all'
      lsSet('sec_col_wn_' + it.lane, '0')
      S.open.add(id)
      paintChips(); paintLanes()
      const row = lanesEl.querySelector('#tcw-' + CSS.escape(id)); if (!row) return
      row.scrollIntoView({ behavior: still() ? 'auto' : 'smooth', block: 'center' })
      row.classList.remove('wn-flash'); void row.offsetWidth; row.classList.add('wn-flash')
      setTimeout(() => row.classList.remove('wn-flash'), 1600)
    }

    // ── changing things: one path for toggle, batch and put-back ──
    async function gate(ids) {
      for (const id of ids) {
        const cf = root.checkSmartConflict ? await root.checkSmartConflict(id) : null
        if (cf) { try { await root.showConfirm({ title: cf.title, body: cf.body, okText: ui('conflictEngineApplyAnyway'), okStyle: cf.severity || 'warning', icon: cf.icon || 'fa-triangle-exclamation' }) } catch (e) { return false } }
        if (root.confirmTier && !(await root.confirmTier(id))) return false
        if (root._guardLghubCheck && !(await root._guardLghubCheck(id, 'apply'))) return false
      }
      return true
    }

    async function flip(id) {
      const it = item(id); if (!it || S.phase === 'running') return
      const action = P.flipAction(it)
      if (it.status === 'drifted' || action === 'apply') {
        if (!(await gate([id]))) { paintLanes(); return }
        if (root.JylliStage && root.JylliStage.shouldStage(id, 'apply')) { root.JylliStage.add(id, 'apply'); return }
        return execute([id], 'apply', { single: true })
      }
      return execute([id], 'restore', { single: true })
    }

    async function batch(ids, action, titleKey) {
      const m = model(); if (!m || !ids || !ids.length || S.phase === 'running') return
      const V = root.JylliWindowsViews
      const chosen = await V.preview(ctx, { ids, action, titleKey })
      if (!chosen || !chosen.length) return
      for (const id of chosen) { const it = item(id); if (it && it.tier >= 3 && root.confirmTier && !(await root.confirmTier(id))) return }
      if (root._guardLghubCheck) for (const id of chosen) if (!(await root._guardLghubCheck(id, action))) return
      return execute(chosen, action, { single: false })
    }

    async function execute(ids, action, o = {}) {
      if (S.phase === 'running' || !ids.length) return null
      S.phase = 'running'; S.runIds = new Set(ids); S.progress = null; S.receipt = null
      paintAll()
      const unsub = root.api.onBatchProgress ? root.api.onBatchProgress(p => { if (p && p.label === 'windows' && !S.disposed) { S.progress = p; paintStage() } }) : null
      let res
      try { res = await root.api.win2Run({ ids, action }) } catch (e) { res = { ok: false, error: String((e && e.message) || e) } }
      if (typeof unsub === 'function') unsub()
      S.phase = 'ready'; S.runIds = new Set()
      if (S.disposed) return res
      if (!res || !res.ok) {
        if (res && res.aborted) ctx.toast(T('rpFailT'), res.guidance || T('rpFailS'), 'err', 9000)
        else ctx.toast(T('runFailT'), (res && res.error) || T('runFailS'), 'err')
        paintAll(); return res
      }
      S.models = res.models; S.when = res.when; S.stale = !!res.stale; S.read = !!res.when
      const r = res.receipt
      for (const i of r.items) if (i.status === 'ok') S.flash[i.id] = i.verified === false ? 'warn' : 'ok'
      setTimeout(() => { S.flash = {}; if (!S.disposed) paintLanes() }, 2200)
      if (o.single) {
        const i = r.items[0]
        if (!i || i.status !== 'ok') ctx.toast(T('failedName', { name: nameOf(ids[0]) }), (i && i.error) || T('runFailS'), 'err')
        else if (i.verified === false) ctx.toast(T('mismatchT', { name: nameOf(ids[0]) }), T('mismatchS'), 'warn', 8000)
        else if (action === 'apply' && root.showUndoSnackbar) root.showUndoSnackbar(ids[0], nameOf(ids[0]), i.journalId)
        else ctx.toast(T('restoredName', { name: nameOf(ids[0]) }), '', 'info')
      } else { S.receipt = r; if (S.view !== 'switches') show('switches') }
      await loadHistory()
      paintAll()
      if (!still() && !o.single) { const rs = receiptSlot.firstElementChild; if (rs) rs.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }
      return res
    }

    async function loadHistory() {
      try {
        const h = await root.api.win2History()
        if (S.disposed || !h || !h.ok) return
        S.history = h
        S.lastBatch = h.batches.find(b => b.via !== 'undo' && b.entries.some(x => !x.undone && x.via !== 'undo')) || null
      } catch (e) { /* history is optional */ }
    }

    async function undo(target, force) {
      let r = await root.api.win2Undo({ target, force: !!force })
      if (r && !r.ok && r.conflict && !force) {
        try { await root.showConfirm({ title: T('conflictT'), body: esc(T('conflictS')), okText: T('conflictOk'), okStyle: 'warning', icon: 'fa-triangle-exclamation' }) } catch (e) { return r }
        r = await root.api.win2Undo({ target, force: true })
      }
      if (r && r.models) { S.models = r.models; S.when = r.when; S.stale = false; S.read = true }
      if (r && r.ok) { S.receipt = null; ctx.toast(T('undoneT'), '', 'ok') } else ctx.toast(T('undoFailT'), (r && r.error) || '', 'err')
      await loadHistory(); paintAll()
      return r
    }

    async function undoLast() {
      const b = S.lastBatch; if (!b) return
      try { await root.showConfirm({ title: T('undoLastT'), body: esc(T('undoLastS', { n: b.entries.filter(x => !x.undone).length })), okText: T('undoLast'), okStyle: 'warning', icon: 'fa-rotate-left' }) } catch (e) { return }
      await undo({ batchId: b.batchId })
    }

    // ── scan ──
    async function rescan(o = {}) {
      const token = ++scanToken
      S.reading = true
      paintStage()
      let r
      try { r = await root.api.win2Scan() } catch (e) { r = null }
      if (S.disposed || token !== scanToken) return
      S.reading = false
      if (r && r.ok) { S.models = r.models; S.when = r.when; S.stale = !!r.stale; S.read = !!r.read; S.failed = false }
      else { S.failed = true; ctx.toast(T('scanFailT'), T('scanFailS'), 'err') }
      paintAll()
      if (S.pendingReveal && model()) { const id = S.pendingReveal; S.pendingReveal = null; reveal(id) }
    }

    function scheduleRescan() {
      if (S.disposed || S.phase === 'running') return
      clearTimeout(rescanTimer)
      rescanTimer = setTimeout(() => { if (!S.disposed && S.phase !== 'running' && S.view) rescan({ quiet: true }) }, 900)
    }

    // ── start ──
    paintAll()
    ;(async () => {
      try { const warm = await root.api.win2Cached(); if (!S.disposed && warm && warm.ok && !S.models) { S.models = warm.models; S.when = warm.when; S.stale = true; S.read = !!warm.read; paintAll() } } catch (e) { /* no warm start */ }
      loadHistory().then(() => { if (!S.disposed) paintStage() })
      rescan({ quiet: true })
    })()
    if (root.api.onSettingsPatch) { const u = root.api.onSettingsPatch(() => scheduleRescan()); if (typeof u === 'function') unsubs.push(u) }
    const inst = {
      scope: S.scope, S, reveal, scheduleRescan,
      destroy() { S.disposed = true; clearTimeout(rescanTimer); clearTimeout(qTimer); unsubs.forEach(u => { try { u() } catch (e) { /* already gone */ } }); const V = root.JylliWindowsViews; if (V && V.closeSheet) V.closeSheet(); host.remove(); if (current === inst) current = null },
    }
    current = inst
    root.registerPageCleanup('windows-opti', () => inst.destroy())
    return inst
  }

  api.mount = mount
  api.sync = () => { if (current) current.scheduleRescan() }
  api.reveal = id => { if (current) current.reveal(id) }
  api.current = () => current
})(typeof window !== 'undefined' ? window : globalThis)
