'use strict'
// BIOS workstation (read-only phase): machine strip, subsystem tree, virtualised parameter grid, inspector and a deck for staged
// changes / doctor / console. Staging works; committing stays locked until an engine is proven on real hardware (policy.WRITES_VERIFIED).
// Depends on globals from index.html (api, tG, settings, toast) and js/ui.js, js/bios/category.js.
;(function (root) {
  const { html, raw } = root.ui
  const T = (k, v) => root.tG('bios', k, v)
  const CAT = root.JylliBiosCategory
  const ROW_H = 34

  const S = { info: null, engines: [], findings: [], engine: null, settings: [], loading: false, view: 'purpose', cat: 'all', q: '',
    changed: false, sel: null, staged: new Map(), deck: 'changes', log: [], confirmScewin: false, error: null, snaps: [], busy: false, trial: null, mode: 'easy' }
  let el = null

  const log = m => { S.log.push(`${new Date().toLocaleTimeString()}  ${m}`); if (S.log.length > 200) S.log.shift() }
  const labelOf = (s, v) => (s.options.find(o => o.value === v) || {}).label || v
  const tone = t => (t === 'critical' ? 'danger' : t === 'moderate' ? 'warn' : 'neutral')
  const byKey = new Map()
  const writable = () => { const e = S.engines.find(x => x.id === S.engine); return !!(e && e.writable) }
  const errText = k => { const t = T('err_' + k); return t === 'err_' + k ? T('err_generic') : t }

  function visible() {
    const q = S.q.trim().toLowerCase()
    return S.settings.filter(s => {
      if (S.cat !== 'all' && S.cat !== 'hidden' && S.view === 'purpose' && CAT.categoryOf(s) !== S.cat) return false
      if (S.view === 'menu' && S.cat !== 'all' && (s.path[0] || '') !== S.cat) return false
      if (S.changed && !S.staged.has(s.key)) return false
      return !q || s.name.toLowerCase().includes(q) || s.path.join(' ').toLowerCase().includes(q)
    })
  }

  function treeItems() {
    const counts = new Map()
    for (const s of S.settings) {
      const k = S.view === 'purpose' ? CAT.categoryOf(s) : (s.path[0] || T('menuOther'))
      counts.set(k, (counts.get(k) || 0) + 1)
    }
    const keys = S.view === 'purpose' ? CAT.ORDER.filter(k => counts.has(k)) : [...counts.keys()].sort()
    return keys.map(k => ({ id: k, label: S.view === 'purpose' ? T('cat_' + k) : k, n: counts.get(k) }))
  }

  // ── rendering ──
  function shell() {
    el.innerHTML = String(html`
      <div class="bw bw-mode-${S.mode}" id="bw">
        <div class="bw-strip" id="bw-strip"></div>
        <div class="bw-easy" id="bw-easy"></div>
        <div class="bw-main">
          <nav class="bw-tree" id="bw-tree" aria-label="${T('treeLabel')}"></nav>
          <section class="bw-grid-wrap">
            <div class="bw-grid-head" role="row"><span>${T('colSetting')}</span><span>${T('colNow')}</span><span>${T('colSet')}</span><span>${T('colRisk')}</span></div>
            <div class="bw-grid" id="bw-grid" tabindex="0" role="grid"><div class="bw-spacer" id="bw-spacer"></div><div class="bw-rows" id="bw-rows"></div></div>
          </section>
          <aside class="bw-inspector" id="bw-inspector" aria-live="polite"></aside>
        </div>
        <div class="bw-deck" id="bw-deck"></div>
      </div>`)
    el.querySelector('#bw-grid').addEventListener('scroll', drawRows)
    el.querySelector('#bw-grid').addEventListener('keydown', onGridKey)
  }

  function drawStrip() {
    const i = S.info || {}
    const eng = S.engines.find(e => e.id === S.engine)
    const staged = S.staged.size
    el.querySelector('#bw-strip').innerHTML = String(html`
      <div class="bw-seg bw-modeseg" role="tablist" aria-label="${T('easy_modeLabel')}"><button type="button" role="tab" aria-selected="${String(S.mode === 'easy')}" data-mode="easy">${T('easy_modeEasy')}</button><button type="button" role="tab" aria-selected="${String(S.mode === 'workstation')}" data-mode="workstation">${T('easy_modeWs')}</button></div>
      <div class="bw-id">
        <i class="fa fa-microchip" aria-hidden="true"></i>
        <div class="bw-id-text"><strong>${i.board || T('boardUnknown')}</strong><span class="bw-mono">${[i.vendor, i.biosVersion, i.biosDate].filter(Boolean).join(' · ')}</span></div>
      </div>
      ${eng ? html`<span class="bw-chip">${T('engine_' + eng.id)}${eng.verified ? '' : html` <em>${T('unverified')}</em>`}</span>` : html`<span class="bw-chip bw-chip-off">${T('noEngine')}</span>`}
      <label class="bw-search"><i class="fa fa-magnifying-glass" aria-hidden="true"></i><input id="bw-q" type="search" value="${S.q}" placeholder="${T('searchPlaceholder', { n: S.settings.length })}" aria-label="${T('search')}" ${S.settings.length ? '' : 'disabled'}></label>
      <label class="bw-toggle"><input id="bw-changed" type="checkbox" ${S.changed ? 'checked' : ''}> ${T('changedOnly')}</label>
      <span class="bw-staged bw-mono">${T('staged', { n: staged })}</span>
      ${trialBanner()}<button class="j-btn j-btn-primary j-btn-sm" id="bw-commit" type="button" ${staged ? '' : 'disabled'}><i class="fa ${writable() ? 'fa-pen-to-square' : 'fa-lock'}" aria-hidden="true"></i> ${T('commit')}</button>`)
    const q = el.querySelector('#bw-q')
    q.addEventListener('input', () => { S.q = q.value; S.sel = null; refreshGrid() })
    el.querySelector('#bw-changed').addEventListener('change', e => { S.changed = e.target.checked; refreshGrid() })
    el.querySelector('#bw-commit').addEventListener('click', openCommit)
    el.querySelectorAll('#bw-strip [data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)))
    const dis = el.querySelector('#bw-disarm'); if (dis) dis.addEventListener('click', async () => { await api.bios2TrialDisarm(); log('boot trial disarmed'); await loadTrial() })
    const dismiss = el.querySelector('#bw-trial-ok'); if (dismiss) dismiss.addEventListener('click', async () => { await api.bios2TrialDisarm(); await loadTrial() })
  }

  function drawTree() {
    const items = treeItems()
    el.querySelector('#bw-tree').innerHTML = String(html`
      <div class="bw-seg" role="tablist">
        <button type="button" role="tab" aria-selected="${String(S.view === 'purpose')}" data-view="purpose">${T('viewPurpose')}</button>
        <button type="button" role="tab" aria-selected="${String(S.view === 'menu')}" data-view="menu">${T('viewMenu')}</button>
      </div>
      <button type="button" class="bw-tree-item ${S.cat === 'all' ? 'bw-on' : ''}" data-cat="all"><span>${T('all')}</span><span class="bw-mono">${S.settings.length}</span></button>
      ${items.map(i => html`<button type="button" class="bw-tree-item ${S.cat === i.id ? 'bw-on' : ''}" data-cat="${i.id}"><span>${i.label}</span><span class="bw-mono">${i.n}</span></button>`)}`)
    el.querySelectorAll('#bw-tree [data-view]').forEach(b => b.addEventListener('click', () => { S.view = b.dataset.view; S.cat = 'all'; drawTree(); refreshGrid() }))
    el.querySelectorAll('#bw-tree [data-cat]').forEach(b => b.addEventListener('click', () => { S.cat = b.dataset.cat; drawTree(); refreshGrid() }))
  }

  function control(s) {
    const staged = S.staged.get(s.key)
    const val = staged != null ? staged : s.current
    if (s.tier === 'readonly') return html`<span class="bw-lock"><i class="fa fa-lock" aria-hidden="true"></i> ${T('readonly')}</span>`
    if (s.kind === 'option') return html`<select class="bw-input ${staged != null ? 'bw-dirty' : ''}" data-key="${s.key}" aria-label="${s.name}">${s.options.map(o => html`<option value="${o.value}" ${o.value === val ? 'selected' : ''}>${o.label}</option>`)}</select>`
    if (s.kind === 'number') return html`<input class="bw-input bw-mono ${staged != null ? 'bw-dirty' : ''}" data-key="${s.key}" value="${val}" aria-label="${s.name}" spellcheck="false">`
    return html`<span class="bw-mono">${s.current}</span>`
  }

  function drawRows() {
    const grid = el.querySelector('#bw-grid'), rows = el.querySelector('#bw-rows'), sp = el.querySelector('#bw-spacer')
    const list = S._list || []
    sp.style.height = list.length * ROW_H + 'px'
    const first = Math.max(0, Math.floor(grid.scrollTop / ROW_H) - 4)
    const last = Math.min(list.length, first + Math.ceil(grid.clientHeight / ROW_H) + 8)
    rows.style.transform = `translateY(${first * ROW_H}px)`
    rows.innerHTML = list.slice(first, last).map(s => String(html`
      <div class="bw-row ${S.sel === s.key ? 'bw-sel' : ''} ${S.staged.has(s.key) ? 'bw-changed' : ''}" data-row="${s.key}" role="row">
        <span class="bw-name" title="${s.name}">${s.name}</span>
        <span class="bw-mono bw-now">${labelOf(s, s.current)}</span>
        <span class="bw-ctl">${control(s)}</span>
        <span>${s.tier === 'normal' ? '' : html`<span class="j-badge j-badge-${tone(s.tier)}">${T('tier_' + s.tier)}</span>`}</span>
      </div>`)).join('')
    rows.querySelectorAll('[data-row]').forEach(r => r.addEventListener('click', e => { if (!e.target.closest('.bw-input')) select(r.dataset.row) }))
    rows.querySelectorAll('.bw-input').forEach(i => i.addEventListener('change', () => stage(i.dataset.key, i.value)))
    if (!list.length) rows.innerHTML = ''
  }

  function refreshGrid() {
    S._list = visible()
    el.querySelector('#bw-grid').scrollTop = 0
    drawEmpty(); drawRows(); drawStrip(); drawDeck()
  }

  function drawEmpty() {
    const wrap = el.querySelector('.bw-grid-wrap')
    let e = wrap.querySelector('.bw-empty'); if (e) e.remove()
    if (S._list.length) return
    const div = document.createElement('div'); div.className = 'bw-empty'
    div.innerHTML = String(S.loading ? html`<i class="fa fa-spinner fa-spin" aria-hidden="true"></i><p>${T('loading')}</p>`
      : S.settings.length ? html`<i class="fa fa-filter" aria-hidden="true"></i><h4>${T('emptyFilter')}</h4><p>${T('emptyFilterSub')}</p>`
      : S.error ? html`<i class="fa fa-triangle-exclamation" aria-hidden="true"></i><h4>${T('err_' + S.error) === 'err_' + S.error ? T('err_generic') : T('err_' + S.error)}</h4><p>${T('errSub')}</p>${S.error === 'confirm_required' ? '' : html`<button class="j-btn j-btn-secondary j-btn-sm" id="bw-retry" type="button">${T('retry')}</button>`}`
      : S.engines.length ? html`<i class="fa fa-microchip" aria-hidden="true"></i><h4>${T('emptyReady')}</h4>`
      : html`<i class="fa fa-plug-circle-xmark" aria-hidden="true"></i><h4>${T('emptyNoEngine')}</h4><p>${T('emptyNoEngineSub')}</p>`)
    wrap.appendChild(div)
    const r = div.querySelector('#bw-retry'); if (r) r.addEventListener('click', () => load(S.engine))
  }

  function select(key) { S.sel = key; drawRows(); drawInspector() }

  function drawInspector() {
    const s = S.settings.find(x => x.key === S.sel)
    const box = el.querySelector('#bw-inspector')
    if (!s) { box.innerHTML = String(html`<div class="bw-insp-empty"><i class="fa fa-arrow-pointer" aria-hidden="true"></i><p>${T('inspectHint')}</p></div>`); return }
    const kv = (k, v, mono) => v == null || v === '' ? '' : html`<dt>${k}</dt><dd class="${mono ? 'bw-mono' : ''}">${v}</dd>`
    box.innerHTML = String(html`
      <h4>${s.name}</h4>
      <p class="bw-muted">${s.path.join('  ›  ') || T('noPath')}</p>
      <div class="bw-insp-tier"><span class="j-badge j-badge-${tone(s.tier)}">${T('tier_' + s.tier)}</span><span class="bw-muted">${T('tierWhy_' + s.tier)}</span></div>
      ${s.help ? html`<p>${s.help}</p>` : html`<p class="bw-muted">${T('noExplanation')}</p>`}
      <dl>
        ${kv(T('kvNow'), labelOf(s, s.current), true)}${kv(T('kvDefault'), s.def, true)}${kv(T('kvEngine'), T('engine_' + s.engine))}
        ${s.raw ? html`${kv(T('kvToken'), s.raw.token, true)}${kv(T('kvOffset'), s.raw.offset, true)}${kv(T('kvWidth'), s.raw.width, true)}` : ''}
        ${s.range ? kv(T('kvRange'), `${s.range.min ?? '?'} – ${s.range.max ?? '?'}`, true) : ''}
      </dl>`)
  }

  function stage(key, value) {
    const s = S.settings.find(x => x.key === key); if (!s) return
    if (String(value) === String(s.current)) S.staged.delete(key); else S.staged.set(key, String(value))
    log(`stage ${s.name}: ${labelOf(s, s.current)} -> ${labelOf(s, String(value))}`)
    drawRows(); drawStrip(); drawDeck()
  }

  function drawDeck() {
    const tabs = ['changes', 'timeline', 'doctor', 'console']
    const body = S.deck === 'changes'
      ? (S.staged.size ? html`<ul class="bw-changes">${[...S.staged].map(([k, v]) => { const s = S.settings.find(x => x.key === k); return html`<li><span>${s.name}</span><span class="bw-mono">${labelOf(s, s.current)} → ${labelOf(s, v)}</span><button type="button" class="j-btn j-btn-ghost j-btn-sm" data-unstage="${k}">${T('undo')}</button></li>` })}</ul><p class="bw-muted bw-pad">${T('commitLockedBody')}</p>` : html`<p class="bw-muted bw-pad">${T('noChanges')}</p>`)
      : S.deck === 'timeline'
        ? (S.snaps.length ? html`<ul class="bw-changes">${S.snaps.map(n => html`<li><span>${new Date(n.ts).toLocaleString()} · ${n.reason === 'restore' ? T('reasonRestore') : T('reasonCommit')}</span><span class="bw-mono">${T('snapshotChanges', { n: (n.changes || []).length })}</span><button type="button" class="j-btn j-btn-ghost j-btn-sm" data-restore="${n.id}" ${writable() ? '' : 'disabled'}>${T('restore')}</button></li>`)}</ul>` : html`<p class="bw-muted bw-pad">${T('noSnapshots')}</p>`)
      : S.deck === 'doctor'
        ? html`<ul class="bw-doctor">${S.findings.map(f => html`<li class="bw-f bw-f-${f.level}"><i class="fa ${f.level === 'ok' ? 'fa-circle-check' : f.level === 'block' ? 'fa-circle-xmark' : 'fa-circle-info'}" aria-hidden="true"></i><div><strong>${T('doctor_' + f.id + '_title')}</strong><span>${T('doctor_' + f.id + '_fix')}</span></div></li>`)}</ul>${S.engines.some(e => e.id === 'scewin') || (S.findings.some(f => /^scewin_/.test(f.id))) ? html`<div class="bw-pad"><button class="j-btn j-btn-secondary j-btn-sm" id="bw-import" type="button"><i class="fa fa-folder-open" aria-hidden="true"></i> ${T('importScewin')}</button></div>` : ''}`
        : html`<pre class="bw-console bw-mono">${S.log.join('\n') || T('consoleEmpty')}</pre>`
    el.querySelector('#bw-deck').innerHTML = String(html`
      <div class="bw-tabs" role="tablist">${tabs.map(t => html`<button type="button" role="tab" aria-selected="${String(S.deck === t)}" data-deck="${t}">${T('deck_' + t)}${t === 'changes' && S.staged.size ? html` <span class="bw-mono">${S.staged.size}</span>` : ''}</button>`)}</div>
      <div class="bw-deck-body">${body}</div>`)
    el.querySelectorAll('#bw-deck [data-restore]').forEach(b => b.addEventListener('click', () => openRestore(b.dataset.restore)))
    el.querySelectorAll('#bw-deck [data-deck]').forEach(b => b.addEventListener('click', () => { S.deck = b.dataset.deck; if (S.deck === 'timeline') loadSnaps(); else drawDeck() }))
    el.querySelectorAll('#bw-deck [data-unstage]').forEach(b => b.addEventListener('click', () => { S.staged.delete(b.dataset.unstage); drawRows(); drawStrip(); drawDeck() }))
    const imp = el.querySelector('#bw-import'); if (imp) imp.addEventListener('click', importScewin)
  }

  function onGridKey(e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const list = S._list || []; if (!list.length) return
    let i = list.findIndex(s => s.key === S.sel)
    i = Math.max(0, Math.min(list.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))
    S.sel = list[i].key
    const g = el.querySelector('#bw-grid')
    if (i * ROW_H < g.scrollTop) g.scrollTop = i * ROW_H
    else if ((i + 1) * ROW_H > g.scrollTop + g.clientHeight) g.scrollTop = (i + 1) * ROW_H - g.clientHeight
    drawRows(); drawInspector()
  }

  // ── mode (Easy / Workstation) ──
  function setMode(m) {
    if (m === S.mode) return
    S.mode = m
    try { const st = root.settings; if (st) { st.biosView = m; root.api.saveSettings(st) } } catch {}
    const bw = el.querySelector('#bw'); bw.classList.toggle('bw-mode-easy', m === 'easy'); bw.classList.toggle('bw-mode-workstation', m === 'workstation')
    el.querySelectorAll('#bw-strip [data-mode]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === m)))
    if (m === 'easy') renderEasy(); else { drawRows() }
  }
  function renderEasy() { if (root.JylliBiosEasy) root.JylliBiosEasy.render(el.querySelector('#bw-easy')) }

  // ── boot trial ──
  function trialBanner() {
    const t = S.trial
    if (!t) return ''
    if (t.status === 'armed') return html`<div class="bw-trial bw-trial-armed"><i class="fa fa-shield-halved" aria-hidden="true"></i><span>${T('trialArmed')}</span><button type="button" class="j-btn j-btn-ghost j-btn-sm" id="bw-disarm">${T('trialDisarm')}</button></div>`
    if (t.status === 'reverted') return html`<div class="bw-trial bw-trial-bad"><i class="fa fa-rotate-left" aria-hidden="true"></i><span>${T('trialReverted', { names: (t.names || []).join(', ') })}</span><button type="button" class="j-btn j-btn-ghost j-btn-sm" id="bw-trial-ok">${T('trialOk')}</button></div>`
    if (t.status === 'revert_failed') return html`<div class="bw-trial bw-trial-bad"><i class="fa fa-triangle-exclamation" aria-hidden="true"></i><span>${T('trialRevertFailed', { names: (t.names || []).join(', ') })}</span><button type="button" class="j-btn j-btn-ghost j-btn-sm" id="bw-trial-ok">${T('trialOk')}</button></div>`
    return ''
  }
  async function loadTrial() {
    const r = await api.bios2Trial()
    S.trial = r && r.ok ? r.trial : null
    drawStrip()
  }

  // ── commit / restore ──
  function dialog({ title, rows, critical, confirmLabel, onConfirm, typedFirst, note }) {
    const bd = document.createElement('div')
    bd.className = 'j-modal-backdrop'
    bd.innerHTML = String(html`<div class="j-modal j-modal-md" role="dialog" aria-modal="true" aria-label="${title}">
      <div class="j-modal-head"><h3 class="j-modal-title">${title}</h3></div>
      <div class="j-modal-body">
        ${rows.length ? '' : ''}<ul class="bw-changes bw-dlg-list" ${rows.length ? '' : 'hidden'}>${rows.map(r => html`<li><span>${r.name}</span><span class="bw-mono">${r.from} → ${r.to}</span>${r.tier && r.tier !== 'normal' ? html`<span class="j-badge j-badge-${tone(r.tier)}">${T('tier_' + r.tier)}</span>` : html`<span></span>`}</li>`)}</ul>
        <p>${note || T('restartNote')}</p>
        ${critical || typedFirst ? html`<div class="bw-recovery"><strong>${T('recoveryTitle')}</strong><p>${T('recoveryBody')}</p><label>${T('typeToConfirm', { word: 'WRITE' })}<input id="bw-typed" class="bw-input bw-mono" autocomplete="off" spellcheck="false"></label></div>` : ''}
      </div>
      <div class="bw-dlg-foot"><button type="button" class="j-btn j-btn-ghost" id="bw-cancel">${T('cancel')}</button><button type="button" class="j-btn j-btn-primary" id="bw-go2"><i class="fa fa-pen-to-square" aria-hidden="true"></i> ${confirmLabel}</button></div>
    </div>`)
    document.body.appendChild(bd)
    requestAnimationFrame(() => bd.classList.add('j-open'))
    const close = () => { bd.classList.remove('j-open'); setTimeout(() => bd.remove(), 200); document.removeEventListener('keydown', onKey) }
    const onKey = e => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    bd.querySelector('#bw-cancel').addEventListener('click', close)
    const go = bd.querySelector('#bw-go2')
    const typedEl = bd.querySelector('#bw-typed')
    const run = () => {
      if (typedEl && typedEl.value.trim() !== 'WRITE') { typedEl.focus(); root.toast(T('typedWrong'), T('typeToConfirm', { word: 'WRITE' }), 'warn'); return }
      const typed = typedEl ? typedEl.value.trim() : ''
      close(); onConfirm(typed)
    }
    if (root.JylliHold) root.JylliHold.attach(go, 650, run)
    go.addEventListener('click', () => { if (!(root.JylliWorld && root.JylliWorld.holdToApply())) run() })
    ;(typedEl || go).focus()
  }

  function rowsFromStaged() {
    return [...S.staged].map(([k, v]) => { const s = S.settings.find(x => x.key === k); return { id: s.id, name: s.name, from: labelOf(s, s.current), to: labelOf(s, v), tier: s.tier, value: v } })
  }

  function openCommit() {
    if (!S.staged.size) return
    if (!writable()) { root.toast(T('commitLocked'), T('commitLockedBody'), 'warn'); return }
    const rows = rowsFromStaged()
    dialog({ title: T('commitTitle', { n: rows.length }), rows, critical: rows.some(r => r.tier === 'critical'), confirmLabel: T('holdToWrite'), onConfirm: typed => doCommit(rows, typed) })
  }

  async function doCommit(rows, typed) {
    if (S.busy) return
    S.busy = true; log(`commit ${rows.length} change(s)`)
    const r = await api.bios2Commit({ engine: S.engine, changes: rows.map(x => ({ id: x.id, value: x.value })), typed })
    S.busy = false
    if (r.ok) {
      log(`written and verified, snapshot ${r.snapshotId}`)
      root.toast(T('committedTitle'), T('committedBody', { n: r.applied }) + (r.trial === 'armed' ? ' ' + T('trialNote') : r.trial === 'failed' ? ' ' + T('trialFailedNote') : ''), 'success')
      await load(S.engine); loadSnaps(); loadTrial()
      if (root.JylliBiosEasy) root.JylliBiosEasy.onCommitted(r)
    } else {
      log(`commit failed: ${r.error}${r.reverted ? ', reverted ' + r.reverted : ''}`)
      root.toast(T('failedTitle'), errText(r.error) + (r.reverted ? ' ' + T('revertedNote') : ''), 'error')
      S.deck = 'console'; drawDeck()
    }
  }

  async function loadSnaps() {
    const r = await api.bios2Snapshots()
    S.snaps = r.ok ? r.snapshots : []
    drawDeck()
  }

  function openRestore(id) {
    const n = S.snaps.find(x => String(x.id) === String(id)); if (!n) return
    const rows = (n.changes || []).map(c => ({ name: c.name, from: c.to, to: c.from }))
    dialog({ title: T('restoreTitle', { when: new Date(n.ts).toLocaleString() }), rows, typedFirst: true, confirmLabel: T('holdToWrite'), onConfirm: async typed => {
      S.busy = true; log('restore snapshot ' + id)
      const r = await api.bios2Restore({ id, typed })
      S.busy = false
      if (r.ok) { root.toast(T('restoredTitle'), T('committedBody', { n: r.applied }), 'success'); await load(S.engine); loadSnaps() }
      else { log('restore failed: ' + r.error); root.toast(T('failedTitle'), errText(r.error) + (r.reverted ? ' ' + T('revertedNote') : ''), 'error') }
    } })
  }

  // ── data ──
  async function importScewin() {
    const r = await api.bios2ScewinImport()
    if (r.ok) { log('SCEWIN imported'); root.toast(T('importedTitle'), r.signedByAmi ? T('importedSigned') : T('importedUnsigned'), r.signedByAmi ? 'success' : 'warn'); await open() }
    else if (r.error !== 'cancelled') root.toast(T('importFailed'), r.error === 'files_missing' ? T('importMissing', { files: (r.missing || []).join(', ') }) : T('err_generic'), 'error')
  }

  async function load(engine, confirmUnverified) {
    S.loading = true; S.error = null; S.engine = engine; refreshGrid()
    log(`read via ${engine}`)
    const r = await api.bios2Read({ engine, confirmUnverified })
    S.loading = false
    if (!r.ok) { S.error = r.error || 'read_failed'; if (r.findings) S.findings = r.findings; log(`read failed: ${S.error}`); S.settings = []; drawTree(); refreshGrid(); return }
    S.settings = r.settings; S.staged.clear(); byKey.clear(); for (const s of r.settings) byKey.set(s.key, s)
    log(`${r.settings.length} settings read`)
    drawTree(); refreshGrid(); drawInspector()
  }

  async function open() {
    const st = await api.bios2Status()
    if (!st.ok) { el.innerHTML = String(html`<div class="bw-empty"><i class="fa fa-lock" aria-hidden="true"></i><h4>${T('proOnly')}</h4></div>`); return }
    S.info = st.info; S.engines = st.engines; S.findings = st.findings
    try { const tr = await api.bios2Trial(); S.trial = tr && tr.ok ? tr.trial : null } catch { S.trial = null }
    const ready = st.engines.find(e => e.state === 'ready')
    drawStrip(); drawTree(); S._list = []; drawInspector(); drawDeck()
    if (ready && ready.id === 'hp-wmi') await load('hp-wmi')
    else if (ready && ready.id === 'scewin') { S.engine = 'scewin'; S.error = 'confirm_required'; refreshGrid(); offerScewin() }
    else { S.engine = null; S.deck = 'doctor'; refreshGrid() }
  }

  function offerScewin() {
    const wrap = el.querySelector('.bw-grid-wrap .bw-empty'); if (!wrap) return
    wrap.innerHTML = String(html`<i class="fa fa-shield-halved" aria-hidden="true"></i><h4>${T('scewinConfirmTitle')}</h4><p>${T('scewinConfirmBody')}</p><button class="j-btn j-btn-primary j-btn-sm" id="bw-go" type="button">${T('scewinConfirmGo')}</button>`)
    wrap.querySelector('#bw-go').addEventListener('click', () => load('scewin', true))
  }

  async function build(container) {
    el = container
    Object.assign(S, { settings: [], staged: new Map(), sel: null, q: '', cat: 'all', error: null, deck: 'changes', mode: root.settings && root.settings.biosView === 'workstation' ? 'workstation' : 'easy' })
    shell()
    if (S.mode === 'easy') renderEasy()
    await open()
    if (S.mode === 'easy') renderEasy()
  }

  root.JylliBios = { build, _state: S, _api: { dialog, doCommit, openRestore, loadSnaps, load, labelOf, log, tone } }
})(typeof window !== 'undefined' ? window : globalThis)
