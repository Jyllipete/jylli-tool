'use strict'
// Devices tab: everything Windows and the devices themselves can tell about what is connected, each fact with its source and how sure it is.
// Engine: lib/devices (main.js `// ─── Devices`). One stage (counts, rescan, polling-rate test), findings, filter chips, then the devices in groups.
// Root carries `jk nt dv` (reuses the shared nt- buttons / chips / banners). Read-only, except the keyboard repeat setting (journaled, read back, undoable).
;(function (root) {
  const P = root.JylliDevicesPure || (typeof require === 'function' ? require('./pure') : null)
  const api = { mount() {} }
  root.JylliDevicesPage = api
  if (typeof document === 'undefined') return

  const V = () => root.JylliDevicesViews
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
  const lsGet = k => { try { return localStorage.getItem(k) } catch (e) { return null } }
  const lsSet = (k, v) => { try { localStorage.setItem(k, v) } catch (e) { /* storage may be unavailable */ } }
  const toast = (...a) => { try { root.toast(...a) } catch (e) { /* toast is optional */ } }
  // LANG / currentLang are page-level lets, not window properties: read them as globals.
  const hasKey = k => { try { const D = LANG[currentLang] && LANG[currentLang].devices2; return !!((D && k in D) || (LANG.en.devices2 && k in LANG.en.devices2)) } catch (e) { return false } }
  const T = (k, v) => root.tG('devices2', v && v.n === 1 && hasKey(k + '_1') ? k + '_1' : k, v)
  const POLL_SECONDS = 4
  let current = null

  function mount(c) {
    if (current) current.destroy()
    const host = el('div', 'jk nt dv')
    c.appendChild(host)
    const S = { snap: null, failed: false, loading: true, chip: lsGet('dv_chip') || 'all', q: '', open: new Set(), busy: null, kbdDraft: null, pollNote: {}, pollBanner: null, count: 0, disposed: false }
    const ctx = { T, P, S }
    let qTimer = null, countTimer = null

    const bannerSlot = el('div', 'nt-banner-slot')
    const stage = el('section', 'dv-stage'); stage.id = 'dv-stage'
    const tools = el('div', 'nt-bar dv-tools')
    tools.innerHTML = `<label class="nt-search"><i class="fa fa-magnifying-glass" aria-hidden="true"></i><input type="search" data-q placeholder="${esc(T('search'))}" aria-label="${esc(T('search'))}"></label><div class="nt-chips-bar" role="group" aria-label="${esc(T('chipsLabel'))}"></div>`
    const finds = el('div', 'dv-finds')
    const list = el('div', 'dv-list-wrap'); list.setAttribute('aria-live', 'polite')
    host.append(bannerSlot, stage, tools, finds, list)
    const qIn = tools.querySelector('[data-q]'), chipsEl = tools.querySelector('.nt-chips-bar')
    const setHtml = (n, h) => { if (n.__h === h) return false; n.__h = h; n.innerHTML = h; return true }

    // ── data ──
    async function load(force) {
      S.loading = !S.snap
      S.failed = false
      render()
      let r = null
      try { r = await root.api.devices2Scan({ force: !!force }) } catch (e) { r = null }
      if (S.disposed) return
      S.loading = false
      if (!r || !r.ok) { S.failed = true; if (r && r.error === 'unsupported_platform') S.unsupported = true } else { S.snap = r.snap; if (!S.kbdDraft && r.snap.kbd) S.kbdDraft = { delay: r.snap.kbd.delay, speed: r.snap.kbd.speed } }
      render()
    }

    // ── render ──
    function renderStage() {
      const s = S.snap
      const unread = !!s && !s.read   // the probe itself failed: say so instead of "no devices"
      const tone = S.loading ? 'idle' : S.failed || unread ? 'danger' : P.tone(s)
      let eyebrow, title, lead = '', actions = ''
      if (S.loading) { eyebrow = T('eyeScan'); title = T('vScan'); lead = T('vScanS') }
      else if (S.failed || unread) { eyebrow = T('eyeFail'); title = T(S.unsupported ? 'vUnsupported' : 'vFail'); lead = T(S.unsupported ? 'vUnsupportedS' : 'vFailS'); actions = S.unsupported ? '' : `<button type="button" class="nt-cta" data-act="retry">${esc(T('retry'))}</button>` }
      else {
        const n = s.devices.length
        eyebrow = T('eyeReady', { n })
        title = n ? T('vFound', { n }) : T('vNone')
        const parts = P.summary(s).map(x => T('catN_' + x.cat, { n: x.n }))
        lead = (parts.length ? parts.join(' · ') + '. ' : '') + (!n ? '' : s.unknown ? T('vUnknown', { n: s.unknown }) : T('vAllKnown'))
        const mice = (s.counts && s.counts.mouse) || 0
        const busy = S.busy === 'poll'
        actions = `${mice ? `<button type="button" class="nt-cta" data-act="poll" ${S.busy ? 'disabled' : ''}><i class="fa fa-gauge-high" aria-hidden="true"></i>${esc(busy ? T('pollRunning', { n: S.count }) : T('pollBtn'))}</button>` : ''}<button type="button" class="nt-sec" data-act="rescan" ${S.busy ? 'disabled' : ''}><i class="fa fa-rotate" aria-hidden="true"></i>${esc(T('rescan'))}</button>`
      }
      stage.dataset.tone = tone
      setHtml(stage, `<div class="dv-stage-main"><div class="nt-eyebrow"><span class="nt-dot"></span>${esc(eyebrow)}</div>
        <h2 class="nt-title" data-tone="${tone}">${esc(title)}</h2><p class="nt-lead">${esc(lead)}</p><div class="nt-actions">${actions}</div>${S.busy === 'poll' ? `<p class="dv-move" role="status">${esc(T('pollMove'))}</p>` : ''}</div>
        ${S.snap && !S.failed && S.snap.read ? `<div class="dv-stage-side"><div class="dv-mini"><span><b>${S.snap.devices.length}</b>${esc(T('miniDevices'))}</span><span><b>${S.snap.problems || 0}</b>${esc(T('miniProblems'))}</span><span><b>${S.snap.unknown || 0}</b>${esc(T('miniUnknown'))}</span></div>
          <div class="dv-legend" aria-label="${esc(T('legendT'))}"><span data-c="high">${esc(T('conf_high'))}</span><span data-c="medium">${esc(T('conf_medium'))}</span><span data-c="low">${esc(T('conf_low'))}</span><span data-c="none">${esc(T('unknown'))}</span></div></div>` : ''}`)
    }

    function renderBanners() {
      const b = []
      const s = S.snap
      if (S.failed && !S.unsupported) b.push(`<div class="nt-banner" role="alert"><span class="nt-banner-ico"><i class="fa fa-triangle-exclamation" aria-hidden="true"></i></span><div><b>${esc(T('bnFailT'))}</b><div>${esc(T('bnFailS'))}</div></div></div>`)
      if (s && s.error === 'probe_failed') b.push(`<div class="nt-banner" role="alert"><span class="nt-banner-ico"><i class="fa fa-triangle-exclamation" aria-hidden="true"></i></span><div><b>${esc(T('bnProbeT'))}</b><div>${esc(T('bnProbeS'))}</div></div><button type="button" class="nt-sec sm" data-act="rescan">${esc(T('retry'))}</button></div>`)
      const failed = s && s.read ? P.failedSections(s) : []
      if (failed.length) b.push(`<div class="nt-banner" role="status"><span class="nt-banner-ico"><i class="fa fa-lock" aria-hidden="true"></i></span><div><b>${esc(T('bnSecT', { n: failed.length }))}</b><div>${esc(T('bnSecS', { sections: failed.map(x => T('sec_' + x)).join(', ') }))}</div></div></div>`)
      if (S.pollBanner) b.push(`<div class="nt-banner" data-tone="info" role="status"><span class="nt-banner-ico"><i class="fa fa-gauge-high" aria-hidden="true"></i></span><div><b>${esc(S.pollBanner.title)}</b><div>${esc(S.pollBanner.body)}</div></div><button type="button" class="nt-sec sm" data-act="dismiss">${esc(T('dismiss'))}</button></div>`)
      setHtml(bannerSlot, b.join(''))
    }

    function renderChips() {
      const counts = P.chipCounts(S.snap)
      setHtml(chipsEl, P.CHIPS.map(ch => (ch !== 'all' && !counts[ch] && ch !== S.chip ? '' : `<button type="button" class="nt-chip" data-chip="${ch}" aria-pressed="${S.chip === ch}">${esc(T('chip_' + ch))}<b>${counts[ch] != null ? counts[ch] : ''}</b></button>`)).join(''))
    }

    function renderList() {
      if (S.loading && !S.snap) { setHtml(list, `<div class="dv-skel" aria-hidden="true"><span></span><span></span><span></span></div>`); return }
      if (!S.snap) { setHtml(list, ''); return }
      const secs = P.layout(S.snap, S.chip, S.q)
      if (!secs.length) { setHtml(list, `<div class="nt-empty dv-empty"><i class="fa fa-plug-circle-xmark" aria-hidden="true"></i><b>${esc(S.q ? T('noMatch') : T('emptyT'))}</b><span>${esc(S.q ? T('noMatchS') : T('emptyS'))}</span>${S.q ? `<button type="button" class="nt-sec sm" data-act="clear">${esc(T('clearFilter'))}</button>` : ''}</div>`); return }
      setHtml(list, secs.map(sec => V().section(ctx, sec, S.open)).join(''))
    }

    function render() {
      if (S.disposed) return
      renderStage(); renderBanners()
      setHtml(finds, S.snap && S.snap.read ? (S.snap.findings || []).filter(f => f.id !== 'section_failed').map(f => V().finding(ctx, f)).join('') : '')
      finds.hidden = !finds.innerHTML
      renderChips(); renderList()
    }

    // ── actions ──
    function openCard(id) {
      S.open.add(id)
      render()
      const n = list.querySelector('.dv-card[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]')
      if (n) { try { n.scrollIntoView({ block: 'center', behavior: 'smooth' }) } catch (e) { n.scrollIntoView() } }
    }

    async function poll() {
      if (S.busy) return
      S.busy = 'poll'; S.count = POLL_SECONDS; S.pollBanner = null
      render()
      countTimer = setInterval(() => { S.count = Math.max(1, S.count - 1); renderStage() }, 1000)
      let r = null
      try { r = await root.api.devices2Poll({ seconds: POLL_SECONDS }) } catch (e) { r = null }
      clearInterval(countTimer); countTimer = null
      if (S.disposed) return
      S.busy = null
      if (!r || !r.ok) { toast(T('title'), T(r && r.error === 'busy' ? 'pollBusy' : 'pollFail'), 'warn'); S.pollBanner = null }
      else {
        S.pollNote = {}
        const ok = r.results.filter(x => x.estimate.ok)
        for (const x of r.results) if (!x.estimate.ok) S.pollNote[x.id] = x.estimate.reason === 'no_movement' ? 'none' : 'few'
        if (!r.results.length) S.pollBanner = { title: T('pollNoneT'), body: T('pollNoneS') }
        else if (!ok.length) S.pollBanner = { title: T('pollFewT'), body: T('pollFewS') }
        else S.pollBanner = { title: T('pollDoneT'), body: ok.map(x => x.title + ': ' + x.estimate.hz + ' Hz (' + T('conf_' + x.estimate.confidence) + ')').join(' · ') + (r.synthetic ? ' · ' + T('pollSynthetic', { n: r.synthetic }) : '') }
        for (const x of ok) S.open.add(x.id)
      }
      await load(true)
    }

    async function kbdApply() {
      if (S.busy) return
      const d = S.kbdDraft; if (!d) return
      S.busy = 'kbd'; render()
      let r = null
      try { r = await root.api.devices2KbdSet({ delay: d.delay, speed: d.speed }) } catch (e) { r = null }
      S.busy = null
      if (r && r.ok) toast(T('title'), T('kbdDone'), 'ok'); else toast(T('title'), T(r && r.error === 'verify_failed' ? 'kbdVerify' : 'kbdFail'), 'err')
      S.kbdDraft = null
      await load(true)
    }
    async function kbdUndo() {
      if (S.busy) return
      S.busy = 'kbd'; render()
      let r = null
      try { r = await root.api.devices2KbdUndo() } catch (e) { r = null }
      S.busy = null
      if (r && r.ok && r.found) toast(T('title'), T('kbdUndone'), 'ok'); else toast(T('title'), T(r && r.ok ? 'kbdNothing' : 'kbdFail'), r && r.ok ? 'ok' : 'err')
      S.kbdDraft = null
      await load(true)
    }
    async function forget(id) {
      try { await root.api.devices2Forget({ id }) } catch (e) { /* the next scan shows the truth */ }
      S.open.delete(id)
      await load(true)
    }
    async function openApp(id) {
      let r = null
      try { r = await root.api.devices2OpenApp({ id }) } catch (e) { r = null }
      if (!r || !r.ok) toast(T('title'), T('openFail'), 'err')
    }
    // The two mouse switches belong to the Windows tab: open it and point at the row (it may still be loading, so try twice).
    function openWin(winId) {
      try { root.showPage('windows-opti', 'windows') } catch (e) { return }
      for (const ms of [500, 1500]) setTimeout(() => { try { root.JylliWindowsPage && root.JylliWindowsPage.reveal(winId) } catch (e) { /* best effort */ } }, ms)
    }

    // ── events ──
    const onClick = e => {
      const chip = e.target.closest('[data-chip]')
      if (chip) { S.chip = chip.dataset.chip; lsSet('dv_chip', S.chip); render(); return }
      const b = e.target.closest('[data-act]')
      if (!b || !host.contains(b)) return
      const act = b.dataset.act, id = b.dataset.id
      switch (act) {
        case 'toggle': { if (S.open.has(id)) S.open.delete(id); else S.open.add(id); renderList(); const nb = list.querySelector('.dv-card-h[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]'); if (nb) nb.focus(); break }
        case 'retry': case 'rescan': load(true); break
        case 'poll': poll(); break
        case 'kbd-apply': kbdApply(); break
        case 'kbd-undo': kbdUndo(); break
        case 'forget': forget(id); break
        case 'openapp': openApp(b.dataset.app); break
        case 'openwin': openWin(b.dataset.win); break
        case 'reveal': S.chip = 'all'; S.q = ''; qIn.value = ''; openCard(id); break
        case 'dismiss': S.pollBanner = null; render(); break
        case 'clear': S.q = ''; qIn.value = ''; S.chip = 'all'; render(); break
      }
    }
    const onInput = e => {
      const t = e.target
      if (t === qIn) { clearTimeout(qTimer); qTimer = setTimeout(() => { S.q = qIn.value; renderList() }, 150); return }
      if (t.matches && (t.matches('[data-kbd-delay]') || t.matches('[data-kbd-speed]'))) {
        const wrap = t.closest('[data-kbd]')
        const d = Number(wrap.querySelector('[data-kbd-delay]').value), s = Number(wrap.querySelector('[data-kbd-speed]').value)
        S.kbdDraft = { delay: d, speed: s }
        wrap.querySelector('[data-kbd-delay-t]').textContent = T('kbdMs', { n: P.repeatDelayMs(d) })
        wrap.querySelector('[data-kbd-speed-t]').textContent = T('kbdCps', { n: P.repeatCps(s) })
      }
    }
    host.addEventListener('click', onClick)
    host.addEventListener('input', onInput)

    load(false)

    const inst = {
      destroy() {
        S.disposed = true
        clearTimeout(qTimer); clearInterval(countTimer)
        host.removeEventListener('click', onClick); host.removeEventListener('input', onInput)
        host.remove()
        if (current === inst) current = null
      },
    }
    current = inst
    if (typeof root.registerPageCleanup === 'function') root.registerPageCleanup('devices', () => inst.destroy())
    return inst
  }

  api.mount = mount
})(typeof window !== 'undefined' ? window : globalThis)
