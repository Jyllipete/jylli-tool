'use strict'
// Restore points tab "Lifeline": am I covered, and what exactly would rolling back do? Engine: lib/restore (main.js `// ─── Restore (Lifeline)`).
// One page: verdict stage, a 30-day lifeline, the points, protection / storage / schedule. Root carries `jk nt rs` (reuses the shared nt- buttons / chips / banners / sheet).
;(function (root) {
  const api = { mount() {}, reveal() {} }
  root.JylliRestorePage = api
  if (typeof document === 'undefined') return

  const P = root.JylliRestorePure, RV = root.JylliRestoreViews
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
  const lsGet = k => { try { return localStorage.getItem(k) } catch (e) { return null } }
  const lsSet = (k, v) => { try { localStorage.setItem(k, v) } catch (e) { /* storage may be unavailable */ } }
  const toast = (...a) => { try { root.toast(...a) } catch (e) { /* toast is optional */ } }
  // LANG / currentLang are page-level lets, not window properties: read them as globals.
  const hasKey = k => { try { const D = LANG[currentLang] && LANG[currentLang].restore2; return !!((D && k in D) || (LANG.en.restore2 && k in LANG.en.restore2)) } catch (e) { return false } }
  const T = (k, v) => root.tG('restore2', v && v.n === 1 && hasKey(k + '_1') ? k + '_1' : k, v)
  const AGE_EVERY = 60000
  let current = null, pendingReveal = null

  function mount(c) {
    if (current) current.destroy()
    const host = el('div', 'jk nt rs')
    c.appendChild(host)
    const S = { snap: null, failed: false, filter: lsGet('rs_filter') || 'all', creating: null, busy: null, sel: null, made: null, rebooting: null, disposed: false }
    if (!P.FILTERS.includes(S.filter)) S.filter = 'all'
    const unsubs = []
    let reloadTimer = null, ageTimer = null, madeTimer = null, pressing = false
    const ctx = { T, esc, P, S }
    const setHtml = (n, h) => { if (n.__h === h) return false; n.__h = h; n.innerHTML = h; return true }

    const bannerSlot = el('div', 'nt-banner-slot')
    const stage = el('section', 'rs-stage'); stage.id = 'rs-stage'
    const stageMain = el('div', 'rs-stage-main'), stageSide = el('div', 'rs-stage-side')
    stage.append(stageMain, stageSide)
    const line = el('section', 'rs-line'); line.setAttribute('aria-label', T('lnTitle'))
    const finds = el('div', 'rs-finds')
    const body = el('div', 'rs-body')
    const listCard = el('section', 'rs-listcard')
    const head = el('header', 'rs-list-h')
    head.innerHTML = `<div class="rs-list-t"><b>${esc(T('listT'))}</b><div class="nt-chips-bar rs-filters" role="group" aria-label="${esc(T('filterLabel'))}"></div></div>
      <form class="rs-compose" novalidate><label class="rs-label"><i class="fa fa-pen" aria-hidden="true"></i><input type="text" data-label maxlength="40" autocomplete="off" spellcheck="false" placeholder="${esc(T('labelPh'))}" aria-label="${esc(T('labelAria'))}"></label>
        <button type="submit" class="nt-cta sm" data-create><i class="fa fa-life-ring" aria-hidden="true"></i>${esc(T('ctaCreate'))}</button></form>`
    const listWrap = el('div', 'rs-list-wrap'); listWrap.id = 'rs-list'
    const tools = el('footer', 'rs-tools')
    tools.innerHTML = `<button type="button" class="nt-sec sm" data-act="rescan"><i class="fa fa-arrows-rotate" aria-hidden="true"></i>${esc(T('rescan'))}</button>
      <button type="button" class="nt-sec sm" data-act="export"><i class="fa fa-file-export" aria-hidden="true"></i>${esc(T('export'))}</button>
      <button type="button" class="nt-sec sm" data-act="open-rstrui"><i class="fa fa-arrow-up-right-from-square" aria-hidden="true"></i>${esc(T('openRstrui'))}</button>`
    listCard.append(head, listWrap, tools)
    const side = el('aside', 'rs-side'); side.setAttribute('aria-label', T('sideLabel'))
    body.append(listCard, side)
    const live = el('div', 'rs-sr'); live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite')
    host.append(bannerSlot, stage, line, finds, body, live)
    const labelIn = head.querySelector('[data-label]'), form = head.querySelector('.rs-compose'), filtersEl = head.querySelector('.rs-filters')
    const say = msg => { live.textContent = ''; setTimeout(() => { live.textContent = msg }, 30) }
    const reason = k => (hasKey('r_' + k) ? T('r_' + k) : T('r_failed'))

    // ── paint ──
    function paintAll() { if (S.disposed) return; paintBanner(); paintStage(); paintLine(); paintFinds(); paintFilters(); paintList(); paintSide() }
    const paintBanner = () => setHtml(bannerSlot, RV.banner(ctx))
    function paintStage() {
      const r = RV.stage(ctx)
      stage.dataset.tone = r.tone
      stage.dataset.state = S.creating || S.busy || S.rebooting ? 'run' : !S.snap ? 'scan' : 'ready'
      setHtml(stageMain, r.html)
      const f = S.snap && !S.creating && !S.rebooting ? RV.facts(ctx) : ''
      stageSide.hidden = !f
      setHtml(stageSide, f)
      const working = !!(S.creating || S.busy || S.rebooting)
      form.querySelector('[data-create]').disabled = working || !S.snap || S.snap.admin === false
    }
    const paintLine = () => { line.hidden = !S.snap && !S.failed; setHtml(line, S.snap || S.failed ? RV.lifeline(ctx) : '') }
    function paintFinds() { const h = RV.finds(ctx); finds.hidden = !h; setHtml(finds, h) }
    function paintFilters() {
      const counts = S.snap ? P.counts(S.snap.points) : { all: 0, jylli: 0, windows: 0 }
      filtersEl.innerHTML = P.FILTERS.map(f => `<button type="button" class="nt-chip" data-filter="${f}" aria-pressed="${S.filter === f}">${esc(T('chip_' + f))}<b>${S.snap && S.snap.read ? counts[f] : ''}</b></button>`).join('')
    }
    function paintList() {
      const focusSeq = document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('rs-row') ? document.activeElement.dataset.seq : null
      const changed = setHtml(listWrap, RV.list(ctx))
      if (changed && focusSeq) { const f = listWrap.querySelector(`.rs-row[data-seq="${CSS.escape(focusSeq)}"]`); if (f) f.focus({ preventScroll: true }) }
    }
    const paintSide = () => setHtml(side, RV.protection(ctx) + RV.schedule(ctx) + RV.know(ctx))

    // ── data ──
    async function load({ quiet = false } = {}) {
      if (S.disposed) return
      if (!quiet && !S.snap) paintAll()
      let r = null
      try { r = await root.api.restore2Scan() } catch (e) { r = null }
      if (S.disposed) return
      if (!r || r.ok === false || !r.verdict) { S.failed = !S.snap; if (!quiet) toast(T('title'), T('scanFailed'), 'warn'); paintAll(); return }
      S.snap = r; S.failed = false
      if (S.rebooting && !r.pending) S.rebooting = null   // the request finished (or never ran): the receipt banner says which
      if (S.sel != null && !r.points.some(p => p.seq === S.sel)) S.sel = null
      if (pendingReveal != null && r.points.some(p => p.seq === pendingReveal)) { const q = pendingReveal; pendingReveal = null; paintAll(); openPoint(q); return }
      paintAll()
    }
    async function loadCached() {
      let r = null; try { r = await root.api.restore2Cached() } catch (e) { r = null }
      if (!S.disposed && r && r.verdict && !S.snap) { S.snap = r; paintAll() }
    }
    const adopt = r => { if (r && r.snapshot && r.snapshot.verdict) S.snap = r.snapshot }

    // ── actions ──
    async function create() {
      if (S.creating || S.busy || S.rebooting) return
      S.creating = { phase: 'check' }; S.made = null; paintStage()
      let r = null
      try { r = await root.api.restore2Create({ label: labelIn.value }) } catch (e) { r = { ok: false, code: 'error', reason: String((e && e.message) || e) } }
      S.creating = null
      if (r && r.ok) {
        adopt(r); labelIn.value = ''; S.made = r.seq
        clearTimeout(madeTimer); madeTimer = setTimeout(() => { S.made = null; paintStage() }, 9000)
        toast(T('title'), T('made', { seq: r.seq }), 'ok'); say(T('made', { seq: r.seq }))
      } else {
        const why = r && r.guidance ? r.guidance : r && r.reason ? r.reason : reason(r && r.code)
        toast(T('title'), T('makeFailed') + ' ' + why, 'err', 8000); say(T('makeFailed'))
      }
      paintAll()
    }
    async function openPoint(seq) {
      let pv = null
      try { pv = await root.api.restore2Preview({ seq }) } catch (e) { pv = null }
      if (S.disposed) return
      if (!pv || !pv.ok) { toast(T('title'), T('previewFailed'), 'warn'); load({ quiet: true }); return }
      S.sel = seq; paintList(); paintLine()
      const N = root.JylliNetworkViews
      if (!N || !N.openSheet) return
      const { wrap, p } = N.openSheet({ el, T, esc }, RV.sheet(ctx, pv), RV.nameOf(ctx, pv.point))
      const go = wrap.querySelector('[data-go]'), ack = wrap.querySelector('[data-ack]')
      ack.addEventListener('change', () => { go.disabled = !ack.checked })
      go.addEventListener('click', () => { if (ack.checked) N.closeSheet({ act: 'restore' }) })
      wrap.querySelector('[data-del]').addEventListener('click', () => N.closeSheet({ act: 'delete' }))
      const res = await p
      if (S.disposed || !res) return
      if (res.act === 'restore') doRestore(pv.point)
      else if (res.act === 'delete') doDelete(pv.point)
    }
    async function doRestore(point) {
      if (S.busy || S.creating || S.rebooting) return
      S.busy = T('vRestoring'); paintStage()
      let r = null
      try { r = await root.api.restore2Restore({ seq: point.seq }) } catch (e) { r = null }
      S.busy = null
      if (r && r.ok) { S.rebooting = point.seq; paintStage(); say(T('vReboot')); return }
      toast(T('title'), r && r.fallback ? T('restoreFallback') : T('restoreFailed') + ' ' + reason(r && r.error), r && r.fallback ? 'info' : 'err', 8000)
      paintAll()
    }
    async function doDelete(point) {
      try { await root.showConfirm({ title: T('delT', { seq: point.seq }), body: esc(T('delB')), okText: T('delOk'), okStyle: 'danger', icon: 'fa-trash' }) } catch (e) { return }
      if (S.busy || S.creating) return
      S.busy = T('vDeleting'); paintStage()
      let r = null
      try { r = await root.api.restore2Delete({ seq: point.seq }) } catch (e) { r = null }
      S.busy = null
      if (r) adopt(r)
      if (r && r.ok) { if (S.sel === point.seq) S.sel = null; toast(T('title'), T('deleted', { seq: point.seq }), 'ok'); say(T('deleted', { seq: point.seq })) }
      else toast(T('title'), T('deleteFailed') + ' ' + (r && r.error && hasKey('r_' + r.error) ? reason(r.error) : (r && r.error) || ''), 'err', 8000)
      paintAll()
    }
    async function protect(on) {
      if (S.busy || S.creating || S.rebooting) return
      if (!on) { try { await root.showConfirm({ title: T('offT'), body: esc(T('offB')), okText: T('offOk'), okStyle: 'danger', icon: 'fa-shield-halved' }) } catch (e) { paintSide(); return } }
      S.busy = T(on ? 'vProtecting' : 'vUnprotecting'); paintStage()
      let r = null
      try { r = await root.api.restore2Protect({ on }) } catch (e) { r = null }
      S.busy = null
      if (r) adopt(r)
      toast(T('title'), r && r.ok ? T(on ? 'protDoneOn' : 'protDoneOff') : T('protFailed') + ' ' + reason(r && r.error), r && r.ok ? 'ok' : 'err', r && r.ok ? 4000 : 8000)
      paintAll()
    }
    async function storage(pct) {
      if (S.busy || S.creating || S.rebooting) return
      S.busy = T('vCap'); paintStage()
      let r = null
      try { r = await root.api.restore2Storage({ pct }) } catch (e) { r = null }
      S.busy = null
      if (r) adopt(r)
      toast(T('title'), r && r.ok ? T('capDone', { pct }) : T('capFailed') + ' ' + reason(r && r.error), r && r.ok ? 'ok' : 'err')
      paintAll()
    }
    async function schedule(days) {
      let r = null
      try { r = await root.api.restore2Schedule({ days }) } catch (e) { r = null }
      if (r && r.ok) { adopt(r); toast(T('title'), T('schSaved'), 'ok', 2000) } else toast(T('title'), T('schFailed'), 'warn')
      paintSide()
    }
    async function exportList() {
      let r = null
      try { r = await root.api.restore2Export() } catch (e) { r = null }
      if (!r || !r.ok || !r.count) { toast(T('title'), T('exportEmpty'), 'info'); return }
      let w = null
      try { w = await root.api.saveTextFile({ filename: r.filename, content: r.content }) } catch (e) { w = null }
      if (w && w.ok) toast(T('title'), T('exported', { n: r.count }), 'ok')
    }
    const openTool = which => root.api.restore2Open({ which }).then(r => { if (!r || !r.ok) toast(T('title'), T('openFailed'), 'warn') }).catch(() => toast(T('title'), T('openFailed'), 'warn'))

    form.addEventListener('submit', e => { e.preventDefault(); create() })
    host.addEventListener('click', e => {
      const chip = e.target.closest('[data-filter]')
      if (chip) { S.filter = chip.dataset.filter; lsSet('rs_filter', S.filter); paintFilters(); paintList(); return }
      const b = e.target.closest('[data-act]'); if (!b || b.disabled) return
      switch (b.dataset.act) {
        case 'open': openPoint(Number(b.dataset.seq)); break
        case 'create': create(); break
        case 'rescan': S.failed = false; load(); break
        case 'protect': protect(true); break
        case 'protect-toggle': protect(b.getAttribute('aria-checked') !== 'true'); break
        case 'storage': storage(Number(b.dataset.pct)); break
        case 'schedule': schedule(Number(b.dataset.days)); break
        case 'relaunch': root.api.relaunchAdmin && root.api.relaunchAdmin(); break
        case 'export': exportList(); break
        case 'open-rstrui': openTool('rstrui'); break
        case 'protection-open': openTool('protection'); break
        case 'history': root.showPage('changelog'); break
        case 'clear-filter': S.filter = 'all'; lsSet('rs_filter', 'all'); paintFilters(); paintList(); break
        case 'ack': root.api.restore2Ack().then(r => { adopt(r); paintAll() }).catch(() => {}); break
        default: break
      }
    })
    host.addEventListener('keydown', e => {
      const r = e.target.closest && e.target.closest('.rs-row')
      if (r && e.target === r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openPoint(Number(r.dataset.seq)); return }
      if (!r || !['ArrowUp', 'ArrowDown'].includes(e.key)) return
      const all = [...listWrap.querySelectorAll('.rs-row')], i = all.indexOf(r), next = e.key === 'ArrowUp' ? i - 1 : i + 1
      if (next >= 0 && next < all.length) { e.preventDefault(); all[next].focus() }
    })
    host.addEventListener('pointerdown', () => { pressing = true })
    const release = () => setTimeout(() => { pressing = false }, 0)
    document.addEventListener('pointerup', release); document.addEventListener('pointercancel', release)

    // ── lifecycle ──
    unsubs.push(root.api.onRestore2Changed ? root.api.onRestore2Changed(() => { clearTimeout(reloadTimer); reloadTimer = setTimeout(() => { if (!pressing) load({ quiet: true }); else reloadTimer = setTimeout(() => load({ quiet: true }), 600) }, 400) }) : null)
    unsubs.push(root.api.onRestore2Phase ? root.api.onRestore2Phase(d => { if (S.creating && d && d.phase) { S.creating.phase = d.phase; paintStage() } }) : null)
    // Ages ("3 days ago") move with the clock without asking Windows again.
    ageTimer = setInterval(() => { if (!document.hidden && host.isConnected && S.snap && !pressing) { paintStage(); paintList() } }, AGE_EVERY)
    try { root.JylliRestoreUI && root.JylliRestoreUI.onRestoreOpen() } catch (e) { /* the nav dot is optional */ }
    const obj = {
      destroy() {
        S.disposed = true
        clearTimeout(reloadTimer); clearInterval(ageTimer); clearTimeout(madeTimer)
        for (const u of unsubs) { try { u && u() } catch (e) { /* already gone */ } }
        document.removeEventListener('pointerup', release); document.removeEventListener('pointercancel', release)
        host.remove()
        if (current === obj) current = null
      },
      reveal(seq) { if (S.snap && S.snap.points.some(p => p.seq === seq)) openPoint(seq); else pendingReveal = seq },
    }
    current = obj
    paintAll()
    loadCached()
    load()
    return obj
  }

  api.mount = mount
  api.reveal = seq => { if (current) current.reveal(seq); else pendingReveal = seq }
})(typeof window !== 'undefined' ? window : globalThis)
