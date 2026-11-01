'use strict'
// Stage -> Apply: with Settings "Apply changes: Review first", toggles on the hero pages and the Windows tab are collected here
// instead of running at once. The dock (an in-flow row above the status bar) shows the count; the review sheet lists each change
// with main's risk tier and the state it will go from and to; Apply runs the whole set as ONE journaled batch (apply-batch).
// Single toggles elsewhere, and everything in "Immediately" mode, behave as before. The pure helpers are unit-tested.
;(function (root) {
  const EXCLUDE = /^(fix-|clean-|reboot-now|winsock-reset|remove-|debloat|delete-|disable-ipv6)/
  const PAGES = ['dashboard', 'windows-opti', 'hardware', 'network']

  /** Toggle semantics: staging the same action twice un-stages it; staging what is already in effect is a no-op. */
  function nextStaged(staged, id, action, currentState) {
    const m = new Map(staged)
    if (m.get(id) === action) { m.delete(id); return { staged: m, change: 'removed' } }
    if ((action === 'apply' && currentState === 'applied') || (action === 'restore' && currentState !== 'applied')) { m.delete(id); return { staged: m, change: 'noop' } }
    m.set(id, action)
    return { staged: m, change: 'added' }
  }

  /** Rows for the review sheet. meta: { id: {name, safetyTier, ...} }; stateOf(id) -> 'applied'|'restored'|'default'. */
  function summarize(staged, meta, stateOf) {
    return [...staged].map(([id, action]) => {
      const m = meta[id] || {}
      const from = stateOf(id) === 'applied' ? 'applied' : 'default'
      return { id, action, name: m.name || id, tier: m.safetyTier ?? null, from, to: action === 'apply' ? 'applied' : 'default', reboot: !!m.reboot, touches: m.touches ?? null, fidelity: m.fidelity || 'unknown' }
    }).sort((a, b) => (b.tier ?? 0) - (a.tier ?? 0) || a.name.localeCompare(b.name))
  }

  const api = { EXCLUDE, PAGES, nextStaged, summarize }
  root.JylliStagePure = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  // ── runtime ──────────────────────────────────────────────────────────────────────
  const staged = new Map()
  const t = (k, v) => (typeof tUIf === 'function' && v ? tUIf(k, v) : tUI(k))
  const esc = s => (typeof escHtml === 'function' ? escHtml(s) : String(s))

  function shouldStage(id, action) {
    return !!(root.settings && root.settings.applyMode === 'review') && !EXCLUDE.test(id) && PAGES.includes(root.currentPage)
  }

  function dock() {
    let d = document.getElementById('stage-dock')
    if (!d) {
      d = document.createElement('div')
      d.id = 'stage-dock'; d.className = 'j-stage-dock'; d.setAttribute('role', 'region'); d.setAttribute('aria-label', tUI('stageDock'))
      const bar = document.getElementById('j-statusbar')
      bar.parentNode.insertBefore(d, bar)
    }
    return d
  }

  function render() {
    const d = dock()
    const n = staged.size
    d.hidden = n === 0
    document.body.classList.toggle('has-stage', n > 0)
    if (!n) { d.innerHTML = ''; return }
    d.innerHTML = `<span class="j-stage-count"><i class="fa fa-layer-group" aria-hidden="true"></i> ${esc(t(n === 1 ? 'stageOne' : 'stageMany', { n }))}</span>
      <span class="j-grow"></span>
      <button type="button" class="j-btn j-btn-ghost j-btn-sm" id="stage-discard">${esc(tUI('stageDiscard'))}</button>
      <button type="button" class="j-btn j-btn-sm" id="stage-review">${esc(tUI('stageReview'))}</button>
      <button type="button" class="j-btn j-btn-primary j-btn-sm" id="stage-apply">${esc(tUI('stageApply'))}</button>`
    d.querySelector('#stage-discard').onclick = discard
    d.querySelector('#stage-review').onclick = review
    d.querySelector('#stage-apply').onclick = () => apply()
    if (root.JylliHold) JylliHold.attach(d.querySelector('#stage-apply'), 650, () => apply())   // 4.0: hold to apply (a plain click still works in Classic)
  }

  function mark(id) {
    const badge = document.getElementById(`badge-${id}`)
    if (!badge) return
    if (staged.has(id)) { badge.innerHTML = `<i class="fa fa-layer-group"></i> ${esc(tUI('stageStaged'))}`; badge.className = 'tweak-badge staged' }
    else { badge.innerHTML = typeof badgeText === 'function' ? badgeText(id) : ''; badge.className = 'tweak-badge ' + (typeof badgeClass === 'function' ? badgeClass(id) : '') }
  }

  function add(id, action) {
    const r = nextStaged(staged, id, action, typeof tweakState === 'function' ? tweakState(id) : 'default')
    staged.clear(); r.staged.forEach((v, k) => staged.set(k, v))
    mark(id); render()
    return r.change
  }

  function discard() { const ids = [...staged.keys()]; staged.clear(); ids.forEach(mark); render() }

  let meta = {}
  async function loadMetaFor(ids) { try { const l = await root.api.getTweakMeta(ids); meta = Object.fromEntries((l || []).map(m => [m.id, m])) } catch {} }
  async function loadMeta() { try { const l = await root.api.getTweakMeta([...staged.keys()]); meta = Object.fromEntries((l || []).map(m => [m.id, m])) } catch {} }

  async function review() {
    await loadMeta()
    const rows = summarize(staged, meta, id => (typeof tweakState === 'function' ? tweakState(id) : 'default'))
    let m = document.getElementById('stage-modal')
    if (!m) {
      m = document.createElement('div'); m.id = 'stage-modal'; m.className = 'modal-overlay'; m.style.cssText = 'display:none;z-index:9000'
      document.body.appendChild(m)
    }
    const tier = x => x == null ? '' : `<span class="j-badge j-badge-${x >= 3 ? 'danger' : x === 2 ? 'warning' : 'neutral'}">${esc(tUI('stageTier' + Math.min(3, x)))}</span>`
    const label = s => tUI(s === 'applied' ? 'stageStateOn' : 'stageStateDefault')
    m.innerHTML = `<div class="modal"><div class="modal-title" id="stage-modal-title">${esc(tUI('stageReviewTitle'))}</div>
      <div class="j-stage-list">${rows.map(r => `<div class="j-stage-row"><div class="j-stage-name">${esc(tName(r.id) || r.name)} ${tier(r.tier)}</div><div class="j-stage-change j-muted">${esc(label(r.from))} → <b>${esc(label(r.to))}</b>${r.touches ? ' · ' + esc(t('stageTouches', { n: r.touches })) : ''}${r.fidelity === 'partial' ? ' · ' + esc(tUI('stagePartial')) : ''}</div></div>`).join('')}</div>
      <div class="jx-93"><button class="btn btn-ghost btn-sm" id="stage-modal-close">${esc(tUI('close'))}</button><button class="btn btn-primary btn-sm" id="stage-modal-apply">${esc(tUI('stageApply'))} <kbd>Ctrl+Enter</kbd></button></div></div>`
    m.querySelector('#stage-modal-close').onclick = () => _closeModal('stage-modal')
    m.querySelector('#stage-modal-apply').onclick = () => { _closeModal('stage-modal'); apply() }
    if (root.JylliHold) JylliHold.attach(m.querySelector('#stage-modal-apply'), 650, () => { _closeModal('stage-modal'); apply() })
    _openModal('stage-modal')
  }

  let applying = false, lastParts = []
  /** Taskbar overlay "restart needed": an amber dot with a "!", drawn here so no image asset is shipped. It lasts until the app is restarted. */
  function markRebootNeeded() {
    try {
      const c = document.createElement('canvas'); c.width = c.height = 32
      const x = c.getContext('2d'); x.fillStyle = '#F5A524'; x.beginPath(); x.arc(16, 16, 15, 0, Math.PI * 2); x.fill()
      x.fillStyle = '#111'; x.font = '700 22px Segoe UI, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('!', 16, 17)
      root.api.setOverlay && root.api.setOverlay(c.toDataURL('image/png'), tUI('stageRebootNeeded'))
    } catch {}
  }
  async function apply() {
    if (applying || !staged.size) return
    applying = true
    const items = [...staged].map(([tweakId, action]) => ({ tweakId, action }))
    const d = dock(); d.querySelectorAll('button').forEach(b => { b.disabled = true })
    const btn = d.querySelector('#stage-apply'); if (btn) btn.textContent = tUI('stageApplying')
    // the light leaves the button for the part each change touches while the batch runs
    lastParts = root.JylliWorld ? JylliWorld.partsFor(items.map(i => i.tweakId)) : []
    const lit = root.JylliWorld ? JylliWorld.pulseTo(btn, JylliWorld.partsFor(items.map(i => i.tweakId))) : Promise.resolve()
    try { root.api.setProgress && root.api.setProgress(2) } catch {}   // taskbar: indeterminate while the batch runs
    let res = null
    try { res = await root.api.applyBatch({ items, via: 'stage', restorePoint: 'auto', label: 'staged' }) } catch (e) { res = { ok: false, error: String(e && e.message || e) } }
    applying = false
    try { root.api.setProgress && root.api.setProgress(-1) } catch {}
    if (res && res.aborted) { toast(tUI('stageAborted'), '', 'err'); render(); return }
    if (!items.every(i => meta[i.tweakId])) await loadMetaFor(items.map(i => i.tweakId))
    const okIds = new Set(((res && res.items) || []).filter(i => i.status === 'ok').map(i => i.id))
    const failed = ((res && res.items) || []).filter(i => i.status === 'failed')
    for (const id of okIds) staged.delete(id)
    const touched = (res && res.items || []).map(i => i.id)
    if (res && res.settingsPatch) Object.assign(root.settings, res.settingsPatch)
    touched.forEach(mark); render()
    if ([...okIds].some(id => meta[id] && meta[id].reboot)) markRebootNeeded()
    try { invalidatePageCache(currentPage) } catch {}
    try { root.JylliSound && JylliSound.play(okIds.size ? 'apply' : 'warning') } catch {}
    if (okIds.size && root.JylliChrono) { await lit; try { JylliChrono.noteApplied({ batchId: res.batchId, n: okIds.size, parts: JylliWorld.partsFor([...okIds]) }) } catch {} }
    if (okIds.size) {
      const extra = failed.length ? t('stageFailedSome', { n: failed.length }) : '', extraType = failed.length ? 'warn' : 'ok'
      if (res.batchId) showBatchUndo(res.batchId, okIds.size, extra, extraType)   // the Undo lives inside this one toast
      else toast(t('stageDone', { n: okIds.size }), extra, extraType)
    }
    else toast(tUI('stageNothing'), '', 'warn')
  }

  function showBatchUndo(batchId, n, extra, extraType) {
    root._journalUndoTarget = { batchId }
    root._lastUndoParts = root.JylliWorld ? lastParts : null
    if (root.JylliToast) JylliToast.dismissTag('undo')
    toast(t('stageDone', { n }), extra || '', extraType || 'ok', 12000, { tag: 'undo', part: lastParts[0] || null, action: { label: tUI('chronoUndo'), run: () => root.undoLastTweak && root.undoLastTweak() } })
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && staged.size && !applying) { e.preventDefault(); apply() }
  })

  root.JylliStage = { shouldStage, add, discard, apply, review, get count() { return staged.size }, has: id => staged.has(id) }
})(typeof window !== 'undefined' ? window : globalThis)
