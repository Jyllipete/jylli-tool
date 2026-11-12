'use strict'
// Cleanup, Reclaim view: the Core, a verdict, three lanes (Safe / Worth a look / Permanent), in-place run, receipt, Autopilot.
// Everything on screen comes from the scan (lib/cleanup) or from a real run event; nothing is estimated here.
// Pure helpers are exported for node tests (test/cleanup-ui.test.js); the DOM part is guarded by `typeof document`.
;(function (root) {
  const GROUP_ICON = { system: 'window-maximize', browsers: 'globe', gpu: 'microchip', apps: 'layer-group', games: 'gamepad', dev: 'code', permanent: 'triangle-exclamation' }
  const LANE_ORDER = ['safe', 'review', 'permanent']
  const HOLD_MS = 1200

  // ── pure ──
  function parts(b) { return b >= 1073741824 ? { v: (b / 1073741824).toFixed(1), u: 'GB' } : b >= 1048576 ? { v: String(Math.round(b / 1048576)), u: 'MB' } : b > 0 ? { v: String(Math.max(1, Math.round(b / 1024))), u: 'KB' } : { v: '0', u: 'MB' } }
  const fmt = b => { const p = parts(b); return p.v + ' ' + p.u }
  /** Items worth showing: they hold bytes now, or cannot be measured without asking (component store). */
  const shown = m => ((m && m.items) || []).filter(i => i.bytes > 0 || i.unknown)
  const lane = (m, l) => shown(m).filter(i => i.lane === l).sort((a, b) => b.bytes - a.bytes)
  /** What starts ticked: the whole safe lane, minus anything with nothing to free. */
  const defaultSelection = m => new Set(lane(m, 'safe').filter(i => i.bytes > 0).map(i => i.id))
  const selectionBytes = (m, sel) => shown(m).filter(i => sel.has(i.id) && i.lane !== 'permanent').reduce((a, i) => a + i.bytes, 0)
  const laneBytes = (m, l) => lane(m, l).reduce((a, i) => a + i.bytes, 0)
  /** { id: bytes } per group, optionally limited to lanes. */
  function groupBytes(m, lanes) {
    const out = {}
    for (const i of shown(m)) if (!lanes || lanes.includes(i.lane)) out[i.group] = (out[i.group] || 0) + i.bytes
    return out
  }
  const appName = exe => String(exe).replace(/\.exe$/i, '')
  const lockedNames = i => [...new Set((i.lockedBy || []).map(appName))].slice(0, 3).join(', ')
  /** Receipt row ordering and the one-line reason for anything that was kept. */
  function skippedReasons(sk) {
    const out = []
    if (sk && sk.inUse) out.push(['inUse', sk.inUse])
    if (sk && sk.access) out.push(['access', sk.access])
    if (sk && sk.personal) out.push(['personal', sk.personal])
    if (sk && sk.tooNew) out.push(['tooNew', sk.tooNew])
    return out
  }

  const api = { parts, fmt, shown, lane, defaultSelection, selectionBytes, laneBytes, groupBytes, lockedNames, skippedReasons, GROUP_ICON, HOLD_MS }
  root.JylliCleanupPage = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  const T = (k, v) => root.tG('cleanup2', k, v)
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const still = () => document.documentElement.classList.contains('motion-reduced') || document.body.classList.contains('game-live')
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
  const sizeHtml = b => { const p = parts(b); return `<b>${p.v}</b><small>${p.u}</small>` }

  // Autopilot finished while the app was open: say so wherever the user is
  if (root.api && root.api.onCleanup2Autopilot) root.api.onCleanup2Autopilot(d => { try { root.toast(T('autoDoneTitle'), T('autoDoneBody', { size: fmt(d.freed), n: d.count }), 'ok', 6000) } catch (e) { /* toast not ready */ } })

  function mount(c) {
    const host = el('div', 'jk cu')
    c.appendChild(host)
    const S = { model: null, sel: new Set(), phase: 'scan', receipt: null, open: new Set(), live: {}, remain: {}, gone: new Set(), unsub: null, disposed: false }
    let view = 'reclaim'

    // ── frame: switch + three views ──
    const bar = el('div', 'cu-bar-top')
    const sw = root.JylliTab.seg([
      { id: 'reclaim', label: T('segReclaim'), icon: 'broom' },
      { id: 'map', label: T('segMap'), icon: 'chart-pie' },
      { id: 'history', label: T('segHistory'), icon: 'clock-rotate-left' },
    ], view, id => show(id))
    bar.appendChild(sw.el)
    host.appendChild(bar)
    const views = { reclaim: el('div', 'cu-view'), map: el('div', 'cu-view'), history: el('div', 'cu-view') }
    for (const k of Object.keys(views)) { views[k].dataset.view = k; host.appendChild(views[k]) }
    const built = {}
    function show(id) {
      view = id
      sw.set(id)
      for (const k of Object.keys(views)) views[k].hidden = k !== id
      if (id !== 'reclaim' && !built[id] && root.JylliCleanupExtras) { built[id] = true; root.JylliCleanupExtras[id](views[id], { T, esc, el, fmt, parts }) }
    }

    // ── Reclaim ──
    const rv = views.reclaim
    const stage = el('section', 'cu-stage')
    const coreHost = el('div', 'cu-core-host')
    const core = root.JylliCleanupCore.mount(coreHost, { label: T('scanning') })
    const verdict = el('div', 'cu-verdict')
    stage.append(coreHost, verdict)
    const receiptSlot = el('div', 'cu-receipt-slot')
    const lanesEl = el('div', 'cu-lanes')
    const autoSlot = el('div', 'cu-auto-slot')
    rv.append(stage, receiptSlot, lanesEl, autoSlot)
    core.onArc(g => highlight(g))
    function highlight(g) { core.highlight(g); lanesEl.querySelectorAll('.cu-card').forEach(card => card.classList.toggle('hl', !!g && card.dataset.g === g)) }

    function paintVerdict() {
      const m = S.model, ph = S.phase
      let eyebrow = T('eyScan'), title = T('tScan'), lead = T('lScan'), tone = 'idle', stats = '', btns = ''
      if (ph === 'ready' && m) {
        const safe = laneBytes(m, 'safe'), review = laneBytes(m, 'review'), sel = selectionBytes(m, S.sel)
        const any = shown(m).some(i => i.lane !== 'permanent' && i.bytes > 0)
        if (!any) { eyebrow = T('eyClean'); title = T('tClean'); lead = T('lClean'); tone = 'ok' }
        else {
          eyebrow = T('eyReady'); tone = 'accent'
          title = sel > 0 ? T('tReady', { size: fmt(sel) }) : T('tNone')
          lead = review > 0 ? T('lReady', { review: fmt(review) }) : T('lReadyOnly')
          btns = `<button type="button" class="cu-cta" data-act="clean"${sel > 0 ? '' : ' disabled'}><i class="fa fa-broom" aria-hidden="true"></i><span>${esc(T('cleanBtn', { size: fmt(sel) }))}</span></button>`
        }
        const locked = m.locked || 0, personal = m.personalFiles || 0
        stats = `<dl class="cu-stats">
          <div><dt>${esc(T('stItems'))}</dt><dd>${shown(m).filter(i => i.bytes > 0).length}</dd></div>
          <div><dt>${esc(T('stOpen'))}</dt><dd>${locked}</dd></div>
          <div><dt>${esc(T('stKept'))}</dt><dd>${personal}</dd></div></dl>`
        void safe
      } else if (ph === 'running') {
        eyebrow = T('eyRun'); title = T('tRun'); lead = T('lRun'); tone = 'accent'
        btns = `<button type="button" class="cu-cta cu-stop" data-act="stop"><i class="fa fa-stop" aria-hidden="true"></i><span>${esc(T('stop'))}</span></button>`
      } else if (ph === 'done') {
        eyebrow = T('eyDone'); title = T('tDone', { size: fmt(S.receipt ? S.receipt.total : 0) }); lead = T('lDone'); tone = 'ok'
      } else if (ph === 'failed') {
        eyebrow = T('eyFail'); title = T('tFail'); lead = T('lFail'); tone = 'danger'
      }
      verdict.dataset.tone = tone
      verdict.innerHTML = `<div class="cu-eyebrow"><span class="cu-dot"></span><span>${esc(eyebrow)}</span></div>
        <h2 class="cu-title">${esc(title)}</h2><p class="cu-lead">${esc(lead)}</p>${stats}
        <div class="cu-actions">${btns}<button type="button" class="cu-sec" data-act="scan"${ph === 'running' || ph === 'scan' ? ' disabled' : ''}><i class="fa fa-rotate" aria-hidden="true"></i><span>${esc(T('rescan'))}</span></button></div>`
    }

    // ── cards ──
    function chips(i) {
      const out = []
      if (i.lockedBy && i.lockedBy.length) out.push(`<span class="cu-chip warn"><i class="fa fa-lock" aria-hidden="true"></i>${esc(T('locked', { apps: lockedNames(i) }))}</span>`)
      if (i.rebuild && i.rebuild !== 'none') out.push(`<span class="cu-chip${i.rebuild === 'shaderRecompile' ? ' warn' : ''}">${esc(T('rb_' + i.rebuild))}</span>`)
      if (i.personalFiles) out.push(`<span class="cu-chip keep"><i class="fa fa-shield-halved" aria-hidden="true"></i>${esc(T('keptPersonal', { n: i.personalFiles }))}</span>`)
      if (i.recentBytes > 1048576) out.push(`<span class="cu-chip keep">${esc(T('keptNew', { size: fmt(i.recentBytes) }))}</span>`)
      if (i.lane === 'permanent') out.push(`<span class="cu-chip bad"><i class="fa fa-ban" aria-hidden="true"></i>${esc(T('noUndo'))}</span>`)
      if (i.slow) out.push(`<span class="cu-chip">${esc(T('slow'))}</span>`)
      return out.join('')
    }
    function card(i, max) {
      const open = S.open.has(i.id), perm = i.lane === 'permanent'
      const on = S.sel.has(i.id)
      const w = i.unknown ? 0 : Math.max(2, Math.round((i.bytes / (max || 1)) * 100))
      const roots = (i.roots || []).map(r => `<li><span title="${esc(r.path)}">${esc(r.path)}</span><b>${esc(fmt(r.bytes))}</b></li>`).join('')
      const size = i.unknown ? `<button type="button" class="cu-measure" data-act="measure">${esc(T('measure'))}</button>` : sizeHtml(i.bytes)
      const ctrl = perm
        ? `<button type="button" class="cu-hold" data-hold="${esc(i.id)}" aria-label="${esc(T('holdAria', { name: T('n_' + i.id) }))}"><span class="cu-hold-fill"></span><span class="cu-hold-t">${esc(T('hold'))}</span></button>`
        : `<label class="cu-check"><input type="checkbox" data-sel="${esc(i.id)}"${on ? ' checked' : ''}${i.bytes > 0 ? '' : ' disabled'} aria-label="${esc(T('n_' + i.id))}"><span></span></label>`
      return `<article class="cu-card cu-g-${esc(i.group)}${on ? ' on' : ''}${open ? ' open' : ''}" data-id="${esc(i.id)}" data-g="${esc(i.group)}" data-lane="${esc(i.lane)}">
        ${ctrl}
        <div class="cu-ico cu-g-${esc(i.group)}"><i class="fa fa-${esc(i.icon || GROUP_ICON[i.group])}" aria-hidden="true"></i></div>
        <div class="cu-main"><div class="cu-name">${esc(T('n_' + i.id))}</div><div class="cu-desc">${esc(T('d_' + i.id))}</div><div class="cu-chips">${chips(i)}</div>
          <div class="cu-more"><p>${esc(T('i_' + i.id))}</p>${roots ? `<ul class="cu-roots">${roots}</ul>` : ''}</div></div>
        <div class="cu-size"><div class="cu-num" data-size>${size}</div><div class="cu-meter"><i style="width:${w}%"></i></div><div class="cu-state" data-state></div></div>
        <button type="button" class="cu-exp" data-act="expand" aria-expanded="${open}" aria-label="${esc(T('details'))}"><i class="fa fa-chevron-down" aria-hidden="true"></i></button>
      </article>`
    }
    function paintLanes() {
      const m = S.model
      if (!m || S.phase === 'scan') { lanesEl.innerHTML = skeleton(); return }
      let html = ''
      for (const l of LANE_ORDER) {
        const list = lane(m, l)
        if (!list.length) continue
        const max = list.reduce((a, i) => Math.max(a, i.bytes), 1)
        html += `<section class="cu-lane" data-lane="${l}"><header class="cu-lane-h"><div><h3>${esc(T('lane_' + l))}</h3><p>${esc(T('laneSub_' + l))}</p></div><span class="cu-lane-n">${esc(fmt(laneBytes(m, l)))}</span></header><div class="cu-cards">${list.map(i => card(i, max)).join('')}</div></section>`
      }
      const clean = (m.items || []).filter(i => !(i.bytes > 0 || i.unknown)).length
      if (clean) html += `<p class="cu-clean-n"><i class="fa fa-circle-check" aria-hidden="true"></i>${esc(T('alreadyClean', { n: clean }))}</p>`
      lanesEl.innerHTML = html
    }
    function skeleton() { return `<div class="cu-skel">${'<i></i>'.repeat(5)}</div>` }

    function refreshSelectionUi() {
      lanesEl.querySelectorAll('.cu-card').forEach(card => { const on = S.sel.has(card.dataset.id); card.classList.toggle('on', on); const cb = card.querySelector('input[data-sel]'); if (cb) cb.checked = on })
      paintVerdict()
    }

    // ── events ──
    lanesEl.addEventListener('change', e => {
      const cb = e.target.closest('input[data-sel]'); if (!cb) return
      if (cb.checked) S.sel.add(cb.dataset.sel); else S.sel.delete(cb.dataset.sel)
      refreshSelectionUi()
    })
    lanesEl.addEventListener('click', e => {
      const x = e.target.closest('[data-act]'); if (!x) return
      const card = x.closest('.cu-card')
      if (x.dataset.act === 'expand' && card) { const id = card.dataset.id; if (S.open.has(id)) S.open.delete(id); else S.open.add(id); card.classList.toggle('open', S.open.has(id)); x.setAttribute('aria-expanded', String(S.open.has(id))) }
      if (x.dataset.act === 'measure') doScan({ analyzeDism: true })
    })
    lanesEl.addEventListener('mouseover', e => { const card = e.target.closest('.cu-card'); highlight(card ? card.dataset.g : null) })
    lanesEl.addEventListener('mouseleave', () => highlight(null))
    verdict.addEventListener('click', e => {
      const x = e.target.closest('[data-act]'); if (!x || x.disabled) return
      if (x.dataset.act === 'clean') cleanSelected()
      if (x.dataset.act === 'stop') { x.disabled = true; root.api.cleanup2Abort() }
      if (x.dataset.act === 'scan') doScan({})
    })

    // hold to confirm: a permanent item only runs after the button has been held for HOLD_MS
    let holdRaf = 0, holdBtn = null, holdT0 = 0
    function holdStop(reset) { cancelAnimationFrame(holdRaf); if (holdBtn && reset) { holdBtn.style.setProperty('--hold', '0'); holdBtn.classList.remove('holding') } holdBtn = null }
    function holdStart(btn) {
      if (S.phase !== 'ready' || holdBtn) return
      holdBtn = btn; holdT0 = performance.now(); btn.classList.add('holding')
      const step = now => {
        if (!holdBtn) return
        const k = Math.min(1, (now - holdT0) / HOLD_MS); holdBtn.style.setProperty('--hold', String(k))
        if (k >= 1) { const id = holdBtn.dataset.hold; holdStop(true); runPermanent(id); return }
        holdRaf = requestAnimationFrame(step)
      }
      holdRaf = requestAnimationFrame(step)
    }
    lanesEl.addEventListener('pointerdown', e => { const b = e.target.closest('.cu-hold'); if (b) { e.preventDefault(); holdStart(b) } })
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) lanesEl.addEventListener(ev, e => { if (holdBtn && (ev !== 'pointerleave' || e.target.closest('.cu-hold'))) holdStop(true) })
    lanesEl.addEventListener('keydown', e => { const b = e.target.closest('.cu-hold'); if (b && (e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); holdStart(b) } })
    lanesEl.addEventListener('keyup', e => { if (holdBtn && (e.key === ' ' || e.key === 'Enter')) holdStop(true) })

    // ── scan ──
    async function doScan(o) {
      if (S.disposed || S.phase === 'running') return
      const quiet = !!(o && o.quiet)
      if (!quiet) { S.phase = 'scan'; S.receipt = null; receiptSlot.innerHTML = ''; core.state('scan'); core.label(T('scanning')); core.groups({}); core.empty(); paintVerdict(); paintLanes() }
      const acc = {}
      const unsub = root.api.onCleanup2Progress(p => {
        if (p.kind !== 'scan' || quiet || S.disposed) return
        if (p.lane !== 'permanent') { acc[p.group] = (acc[p.group] || 0) + p.bytes; core.groups(acc); core.value(Object.values(acc).reduce((a, b) => a + b, 0)) }
      })
      let res
      try { res = await root.api.cleanup2Scan({ analyzeDism: !!(o && o.analyzeDism) }) } catch (e) { res = null }
      unsub()
      if (S.disposed) return
      if (!res || !res.ok) { S.phase = 'failed'; core.state('idle'); core.label(T('failedLbl')); core.empty(); paintVerdict(); paintLanes(); return }
      S.model = res.model; S.sel = defaultSelection(S.model)
      if (quiet && S.phase === 'done') { paintLanes(); return }
      S.phase = 'ready'; showFound()
    }
    function showFound() {
      const m = S.model
      core.state('ready'); core.label(T('safeToClear'))
      core.groups(groupBytes(m, ['safe', 'review']))   // the ring is what the cleaner can take; permanent items have their own lane
      core.value(laneBytes(m, 'safe'))
      if (m.disk) core.drive(m.disk.totalBytes, m.disk.usedBytes, laneBytes(m, 'safe') + laneBytes(m, 'review'))
      paintVerdict(); paintLanes()
    }

    // ── run ──
    function ids2(list) { return list.filter(id => shown(S.model).some(i => i.id === id)) }
    async function cleanSelected() {
      const m = S.model, ids = ids2([...S.sel]).filter(id => shown(m).find(i => i.id === id).lane !== 'permanent')
      if (!ids.length) return
      const needsReview = ids.some(id => shown(m).find(i => i.id === id).lane === 'review')
      if (needsReview) { try { await root.showConfirm({ title: T('confirmTitle'), body: T('confirmReview'), okText: T('confirmOk'), okStyle: 'warning', icon: 'fa-broom' }) } catch (e) { return } }
      await runIds(ids, [])
    }
    async function runPermanent(id) {
      const i = shown(S.model).find(x => x.id === id); if (!i) return
      await runIds([id], [id])
    }
    function finishCard(id, p) {
      const card = lanesEl.querySelector(`.cu-card[data-id="${id}"]`); if (!card) return
      card.classList.remove('running'); card.classList.add(p.error ? 'failed' : 'done')
      const st = card.querySelector('[data-state]')
      const note = skippedReasons(p.skipped).map(([k, n]) => T('sk_' + k, { n })).join(' · ')
      st.innerHTML = p.error ? `<i class="fa fa-triangle-exclamation" aria-hidden="true"></i>${esc(T('failedItem'))}` : `<i class="fa fa-check" aria-hidden="true"></i>${esc(T('freedItem', { size: fmt(p.freed) }))}${note ? `<em>${esc(note)}</em>` : ''}`
      card.querySelector('[data-size]').innerHTML = sizeHtml(p.freed)
    }
    async function runIds(ids, confirmed) {
      if (S.phase === 'running') return
      const m = S.model
      S.phase = 'running'; S.live = {}; S.gone = new Set()
      S.remain = groupBytes(m, ['safe', 'review'])
      const done = {}
      core.state('run'); core.label(T('freedSoFar'))
      paintVerdict()
      lanesEl.querySelectorAll('.cu-card').forEach(card => { const sel = ids.includes(card.dataset.id); card.classList.toggle('queued', sel); card.classList.toggle('dim', !sel); const cb = card.querySelector('input'); if (cb) cb.disabled = true })
      lanesEl.querySelectorAll('.cu-hold').forEach(b => { b.disabled = true })
      const total = () => Object.values(done).reduce((a, b) => a + b, 0) + Object.entries(S.live).filter(([k]) => !(k in done)).reduce((a, [, b]) => a + b, 0)
      const unsub = root.api.onCleanup2Progress(p => {
        if (p.kind !== 'run' || S.disposed) return
        const item = shown(m).find(i => i.id === p.id), card = lanesEl.querySelector(`.cu-card[data-id="${p.id}"]`)
        if (p.phase === 'start' && card) { card.classList.remove('queued'); card.classList.add('running'); card.scrollIntoView({ block: 'nearest', behavior: still() ? 'auto' : 'smooth' }) }
        if (p.phase === 'bytes') { S.live[p.id] = p.freed; core.value(total()); if (card) card.querySelector('[data-size]').innerHTML = sizeHtml(p.freed) }
        if (p.phase === 'done') {
          done[p.id] = p.freed; core.value(total()); core.ripple()
          if (item) { S.remain[item.group] = Math.max(0, (S.remain[item.group] || 0) - Math.max(p.freed, 0)); core.groups(S.remain) }
          finishCard(p.id, p)
        }
      })
      let out = null
      try { out = await root.api.cleanup2Run({ ids, confirmed }) } catch (e) { out = null }
      unsub()
      if (S.disposed) return
      lanesEl.querySelectorAll('.cu-hold').forEach(b => { b.disabled = false })
      if (!out || !out.ok) { S.phase = 'ready'; try { root.toast('', T('runFailed'), 'warn', 4000) } catch (e) { /* ignore */ } paintVerdict(); doScan({}); return }
      S.receipt = out.receipt; S.phase = 'done'
      core.state('done'); core.label(T('freed')); core.value(out.receipt.total); core.ripple()
      try { if (root.JylliWorld && out.receipt.total > 0) { root.JylliWorld.freedBurst(out.receipt.total); root.JylliWorld.driveFreed(out.receipt.total) } } catch (e) { /* world off */ }
      paintVerdict(); paintReceipt()
      doScan({ quiet: true })
    }

    // ── receipt ──
    function paintReceipt() {
      const r = S.receipt; if (!r) { receiptSlot.innerHTML = ''; return }
      const rows = r.rows.filter(x => x.freed > 0 || x.error || skippedReasons(x.skipped).length)
      const disk = r.delta != null && r.disk ? `<div class="cu-r-disk"><span>${esc(T('rDisk'))}</span><b>${esc(fmt(r.disk.before))} → ${esc(fmt(r.disk.after))}</b></div>` : ''
      receiptSlot.innerHTML = `<section class="cu-receipt">
        <header><div><span class="cu-r-k">${esc(T('rTitle'))}</span><div class="cu-r-big">${sizeHtml(r.total)}</div></div>
          <div class="cu-r-meta">${disk}<div><span>${esc(T('rTime'))}</span><b>${esc((r.ms / 1000).toFixed(1))} s</b></div>${r.aborted ? `<div><span></span><b>${esc(T('rStopped'))}</b></div>` : ''}</div></header>
        <ul class="cu-r-rows">${rows.map(x => {
          const sk = skippedReasons(x.skipped).map(([k, n]) => T('sk_' + k, { n })).join(' · ')
          return `<li><span>${esc(T('n_' + x.id))}${sk ? `<em>${esc(sk)}</em>` : ''}</span><b>${x.error ? esc(T('failedItem')) : esc(fmt(x.freed))}</b></li>`
        }).join('') || `<li><span>${esc(T('rNothing'))}</span><b>0 MB</b></li>`}</ul>
        <p class="cu-r-note">${esc(T('rNote'))}</p>
        <footer>${r.retry.length ? `<button type="button" class="cu-sec" data-r="retry"><i class="fa fa-rotate-right" aria-hidden="true"></i><span>${esc(T('rRetry', { n: r.retry.length }))}</span></button>` : ''}
          <button type="button" class="cu-sec" data-r="share"><i class="fa fa-image" aria-hidden="true"></i><span>${esc(T('rShare'))}</span></button>
          <button type="button" class="cu-cta" data-r="done"><i class="fa fa-check" aria-hidden="true"></i><span>${esc(T('rDone'))}</span></button></footer></section>`
      if (!still()) receiptSlot.firstElementChild.classList.add('enter')
    }
    receiptSlot.addEventListener('click', e => {
      const b = e.target.closest('[data-r]'); if (!b) return
      if (b.dataset.r === 'done') { S.receipt = null; S.phase = 'ready'; receiptSlot.innerHTML = ''; if (S.model) showFound() }
      if (b.dataset.r === 'retry' && S.receipt) { const ids = S.receipt.retry.slice(); S.phase = 'ready'; receiptSlot.innerHTML = ''; runIds(ids, []) }
      if (b.dataset.r === 'share' && S.receipt) shareImage(S.receipt)
    })
    function shareImage(r) {
      const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 630
      const x = cv.getContext('2d'), cs = getComputedStyle(document.documentElement)
      const tok = n => cs.getPropertyValue(n).trim(), accent = tok('--c-accent'), ink = tok('--c-text-primary')
      const g = x.createLinearGradient(0, 0, 1200, 630); g.addColorStop(0, tok('--c-bg-base')); g.addColorStop(1, tok('--c-bg-raised'))
      x.fillStyle = g; x.fillRect(0, 0, 1200, 630)
      x.strokeStyle = accent; x.globalAlpha = 0.9; x.lineWidth = 18; x.beginPath(); x.arc(930, 315, 190, -Math.PI / 2, Math.PI * 1.5); x.stroke(); x.globalAlpha = 1
      x.fillStyle = ink; x.font = '600 34px sans-serif'; x.fillText(T('shareTitle'), 80, 130)
      const p = parts(r.total)
      x.font = '700 150px sans-serif'; x.fillStyle = accent; x.fillText(p.v, 80, 330); const w = x.measureText(p.v).width
      x.font = '600 56px sans-serif'; x.fillStyle = ink; x.fillText(p.u, 100 + w, 330)
      x.font = '400 30px sans-serif'; x.fillStyle = 'rgba(237,237,240,0.72)'
      x.fillText(T('shareLine', { n: r.rows.filter(z => z.freed > 0).length, s: (r.ms / 1000).toFixed(1) }), 80, 400)
      x.fillText(new Date(r.endedAt).toLocaleDateString(root.settings && root.settings.language === 'fi' ? 'fi-FI' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), 80, 450)
      x.font = '600 28px sans-serif'; x.fillStyle = ink; x.fillText('Jylli Tool', 80, 560)
      cv.toBlob(b => { if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'jylli-cleanup.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000) }, 'image/png')
    }

    // ── autopilot (Premium) ──
    async function paintAuto() {
      const prem = !!(root.settings && root.settings.isPremium)
      let rule = { mode: 'off', thresholdBytes: 2 * 1073741824 }
      try { const g = await root.api.cleanup2AutopilotGet(); if (g && g.ok) rule = g.rule } catch (e) { /* default */ }
      const modes = ['off', 'weekly', 'threshold']
      autoSlot.innerHTML = `<section class="cu-auto${prem ? '' : ' locked'}"><div class="cu-auto-t"><span class="cu-auto-ico"><i class="fa fa-wand-magic-sparkles" aria-hidden="true"></i></span>
        <div><h3>${esc(T('autoTitle'))}${prem ? '' : `<span class="cu-prem">${esc(T('premium'))}</span>`}</h3><p>${esc(T('autoSub'))}</p></div></div>
        <div class="cu-auto-c">${prem ? `<div class="j-seg tk-seg jk" role="tablist">${modes.map(k => `<button type="button" class="j-seg-item${rule.mode === k ? ' j-seg-active' : ''}" data-mode="${k}" role="tab" aria-selected="${rule.mode === k}"><span>${esc(T('auto_' + k, { gb: Math.round(rule.thresholdBytes / 1073741824) }))}</span></button>`).join('')}</div>`
          : `<button type="button" class="cu-sec" data-unlock><i class="fa fa-unlock" aria-hidden="true"></i><span>${esc(T('unlock'))}</span></button>`}</div></section>`
    }
    autoSlot.addEventListener('click', async e => {
      const u = e.target.closest('[data-unlock]'); if (u) { try { root.premiumStoreAction().run() } catch (x) { /* ignore */ } return }
      const b = e.target.closest('[data-mode]'); if (!b) return
      const r = await root.api.cleanup2AutopilotSet({ mode: b.dataset.mode })
      if (r && r.ok) { paintAuto(); try { root.toast('', T('autoSaved'), 'ok', 2500) } catch (x) { /* ignore */ } }
    })

    // ── start ──
    paintVerdict(); paintLanes(); paintAuto()
    show(view)
    doScan({})
    if (root.registerPageCleanup) root.registerPageCleanup('cleanup', () => { S.disposed = true; holdStop(true); core.destroy() })
    return { rescan: () => doScan({}), state: S }
  }
  api.mount = mount
})(typeof window !== 'undefined' ? window : globalThis)
