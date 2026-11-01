'use strict'

// ─── Modal open/close helpers ─────────────────────────────────────────────────
const _closeTimers = new WeakMap()
const _modalReturnFocus = new WeakMap()
const _FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
// Dialog semantics + focus management shared by every modal that goes through _openModal/_closeModal
function _modalDialogEl(el) { return el.querySelector('[role="dialog"], .modal, .j-modal') || el }
function _modalA11yOpen(el) {
  const dlg = _modalDialogEl(el)
  dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true')
  if (!dlg.getAttribute('aria-label') && !dlg.getAttribute('aria-labelledby')) {
    const t = dlg.querySelector('.modal-title, .j-modal-title, h1, h2, h3, [id$="-title"]')
    if (t) { if (!t.id) t.id = 'mt-' + (el.id || Math.random().toString(36).slice(2, 7)); dlg.setAttribute('aria-labelledby', t.id) }
  }
  _modalReturnFocus.set(el, document.activeElement)
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (dlg.contains(document.activeElement) && document.activeElement !== dlg) return
    const first = dlg.querySelector('[autofocus]') || [...dlg.querySelectorAll(_FOCUSABLE)].find(n => n.offsetParent !== null)
    if (first) first.focus(); else { dlg.setAttribute('tabindex', '-1'); dlg.focus() }
  }))
}
function _modalA11yClose(el) {
  const back = _modalReturnFocus.get(el)
  _modalReturnFocus.delete(el)
  if (back && document.contains(back) && typeof back.focus === 'function') back.focus()
}
// Keep Tab inside the topmost open modal
document.addEventListener('keydown', e => {
  if (e.key !== 'Tab') return
  const open = [...document.querySelectorAll('.modal-overlay.open, .j-modal-backdrop.j-open')].filter(m => m.style.display !== 'none')
  const top = open[open.length - 1]
  if (!top) return
  const items = [...top.querySelectorAll(_FOCUSABLE)].filter(n => n.offsetParent !== null)
  if (!items.length) return
  const first = items[0], last = items[items.length - 1]
  if (!top.contains(document.activeElement)) { e.preventDefault(); first.focus() }
  else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
})

function _openModal(id) {
  const el = document.getElementById(id)
  if (!el) return
  // Cancel any pending close animation so a rapid open doesn't get hidden by
  // the previous modal's 160ms setTimeout (race condition with sequential dialogs)
  if (_closeTimers.has(el)) {
    clearTimeout(_closeTimers.get(el))
    _closeTimers.delete(el)
  }
  el.classList.remove('closing')
  el.style.display = 'flex'
  // Double-rAF guarantees a paint boundary so the CSS animation fires reliably
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')))
  _modalA11yOpen(el)
}
function _closeModal(id) {
  const el = document.getElementById(id)
  if (!el) return
  el.classList.remove('open')
  el.classList.add('closing')
  _modalA11yClose(el)
  const t = setTimeout(() => {
    el.style.display = 'none'
    el.classList.remove('closing')
    _closeTimers.delete(el)
  }, 160)
  _closeTimers.set(el, t)
}

// ─── Custom confirm dialog ────────────────────────────────────────────────────
let _confirmResolve = null, _confirmReject = null
function showConfirm({ title, body, okText = 'Confirm', okStyle = 'danger', icon = 'fa-triangle-exclamation' }) {
  _supersedePendingDialog()
  const styles = {
    danger:  { bg: 'var(--c-danger-muted)',  border: 'var(--c-danger-ring)',  color: 'var(--c-danger)',  btnBg: 'var(--c-danger)',  btnColor: '#fff' },
    warning: { bg: 'var(--c-warning-muted)', border: 'var(--c-warning-ring)', color: 'var(--c-warning)', btnBg: 'var(--c-warning)', btnColor: 'var(--on-accent)' },
    info:    { bg: 'var(--c-info-muted)',    border: 'var(--c-info-ring)',    color: 'var(--c-info)',    btnBg: 'var(--c-info)',    btnColor: '#fff' },
  }
  const s = styles[okStyle] || styles.danger
  const iconEl = document.getElementById('confirm-modal-icon')
  iconEl.style.cssText = `width:36px;height:36px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;background:${s.bg};border:1px solid ${s.border};color:${s.color}`
  iconEl.innerHTML = `<i class="fa ${icon}"></i>`
  document.getElementById('confirm-modal-title').textContent = title
  document.getElementById('confirm-modal-body').innerHTML = body
  const okBtn = document.getElementById('confirm-modal-ok')
  okBtn.textContent = okText
  okBtn.style.cssText = `background:${s.btnBg};color:${s.btnColor};border:none`
  okBtn.onclick = _confirmModalResolve   // a previous prompt may have replaced it
  _openModal('confirm-modal')
  return new Promise((res, rej) => { _confirmResolve = res; _confirmReject = rej })
}
function _confirmModalResolve() { _closeModal('confirm-modal'); if (_confirmResolve) { _confirmResolve(true); _confirmResolve = null } }
// showConfirm resolves true when confirmed and rejects on Cancel
function _confirmModalReject()  {
  _closeModal('confirm-modal')
  document.getElementById('confirm-modal-ok').onclick = _confirmModalResolve   // Cancel on a prompt must not leave the prompt handler behind
  if (_promptResolve) { _promptResolve(''); _promptResolve = null }             // a cancelled prompt resolves empty instead of hanging
  if (_confirmReject)  { _confirmReject();  _confirmReject  = null }
}
// Opening a dialog while another is still waiting would orphan the first caller's promise forever; settle it as cancelled.
function _supersedePendingDialog() {
  if (_promptResolve) { _promptResolve(''); _promptResolve = null }
  if (_confirmReject) { const r = _confirmReject; _confirmReject = null; _confirmResolve = null; r() }
}

// ─── Prompt dialog (text input) ───────────────────────────────────────────────
let _promptResolve = null
function showPrompt({ title, body = '', placeholder = '', okText = 'OK', icon = 'fa-pencil' }) {
  _supersedePendingDialog()
  const iRgb = getComputedStyle(document.documentElement).getPropertyValue('--info-rgb').trim() || '52,152,219'
  const iconEl = document.getElementById('confirm-modal-icon')
  iconEl.style.cssText = `width:36px;height:36px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;background:rgba(${iRgb},0.12);border:1px solid rgba(${iRgb},0.3);color:var(--info)`
  iconEl.innerHTML = `<i class="fa ${icon}"></i>`
  document.getElementById('confirm-modal-title').textContent = title
  document.getElementById('confirm-modal-body').innerHTML = `${body ? `<div style="margin-bottom:10px">${body}</div>` : ''}<input id="_prompt-input" type="text" placeholder="${escAttr(placeholder)}" maxlength="48" style="width:100%;box-sizing:border-box;background:var(--c-bg-base);border:1px solid var(--c-border-default);border-radius:7px;padding:7px 11px;color:var(--white);font-size:11px;font-family:inherit;outline:none;transition:border-color var(--dur-short),box-shadow var(--dur-short)" onfocus="this.style.borderColor = 'var(--c-accent)';this.style.boxShadow='0 0 0 3px var(--c-accent-ring)'" onblur="this.style.borderColor = '';this.style.boxShadow=''" onkeydown="if(event.key==='Enter')_promptModalResolve()"><div id="_prompt-err" style="font-size:9.5px;color:var(--danger);margin-top:4px;display:none"></div>`
  const okBtn = document.getElementById('confirm-modal-ok')
  okBtn.textContent = okText
  okBtn.style.cssText = 'background:var(--info);color:#fff;border:none'
  okBtn.onclick = _promptModalResolve
  _openModal('confirm-modal')
  setTimeout(() => { const el = document.getElementById('_prompt-input'); if (el) { el.value = placeholder; el.select() } }, 80)
  return new Promise(res => { _promptResolve = res })
}
function _promptModalResolve() {
  const val = document.getElementById('_prompt-input')?.value?.trim() || ''
  _closeModal('confirm-modal')
  document.getElementById('confirm-modal-ok').onclick = _confirmModalResolve
  if (_promptResolve) { _promptResolve(val); _promptResolve = null }
}
function _promptModalCancel() {
  _closeModal('confirm-modal')
  document.getElementById('confirm-modal-ok').onclick = _confirmModalResolve
  if (_promptResolve) { _promptResolve(null); _promptResolve = null }
}

// ─── What's New ───────────────────────────────────────────────────────────────
let _wnData = null

function _wnParseTag(item) {
  const m = item.match(/^(New Fix|New|Fix|Update)\s*[—\-]\s*/i)
  if (!m) return { tag: 'default', label: null, rest: item }
  const raw = m[1].toLowerCase()
  const tag = (raw === 'fix') ? 'fix' : (raw === 'update') ? 'update' : 'new'
  return { tag, label: raw === 'new fix' ? 'New' : m[1], rest: item.slice(m[0].length) }
}

function _wnRenderItems(items) {
  return items.map(item => {
    const { tag, label, rest } = _wnParseTag(item)
    const badge = label
      ? `<span class="wn-tag wn-tag-${tag}">${label}</span>`
      : `<span class="wn-tag wn-tag-default">✦</span>`
    return `<div class="wn-item">${badge}<span class="wn-item-text">${rest}</span></div>`
  }).join('')
}

function _wnRenderSidebar(data, activeVersion) {
  return data.map((v, i) => `
    <button class="wn-sidebar-item${v.version === activeVersion ? ' active' : ''}" onclick="wnSelectVersion('${v.version}')">
      <span class="wn-sidebar-dot"></span>
      <span class="wn-sidebar-label">v${v.version}</span>
    </button>`).join('')
}

function wnSelectVersion(version) {
  if (!_wnData) return
  const v = _wnData.find(e => e.version === version) || _wnData[0]
  document.getElementById('wn-ver').textContent = `Version ${v.version} · ${v.date}`
  document.getElementById('wn-items').innerHTML = _wnRenderItems(v.items)
  document.querySelectorAll('.wn-sidebar-item').forEach(btn => {
    btn.classList.toggle('active', btn.querySelector('.wn-sidebar-label')?.textContent === `v${version}`)
  })
}

function _wnUpdateStaticText() {
  const title    = document.getElementById('wn-title')
  const subtitle = document.getElementById('wn-subtitle')
  const closeBtn = document.getElementById('wn-close-btn')
  if (title)    title.textContent    = tUI('whatsNewTitle')
  if (subtitle) subtitle.textContent = tUI('whatsNewSubtitle')
  if (closeBtn) closeBtn.innerHTML   = `<i class="fa fa-xmark"></i> ${tUI('whatsNewClose')}`
}

async function showWhatsNew(version) {
  _wnUpdateStaticText()
  try {
    const data = await api.getWhatsNew(currentLang)
    if (!data?.length) return
    _wnData = data
    const v = (version ? data.find(e => e.version === String(version)) : null) || data[0]
    document.getElementById('wn-sidebar').innerHTML = _wnRenderSidebar(data, v.version)
    document.getElementById('wn-ver').textContent   = `Version ${v.version}${v.date ? " · " + v.date : ""}`
    document.getElementById('wn-items').innerHTML   = _wnRenderItems(v.items)
    _openModal('wn-overlay')
  } catch(e) {
    // api not ready yet — show static version
    const _wnItemsEn = [
      'Brand new app — faster, lighter, and no setup required',
      'Live CPU, RAM and disk meters on the dashboard',
      'PC Health Score — see how optimised your PC is at a glance',
      'Game Profiles — detects your installed games and applies per-game tweaks',
      'Auto-Profiles — tweaks are applied automatically when you launch a game',
      'App Optimizer — cut background resource usage from browsers, Discord, Spotify and more',
      'Process Manager — see what\'s running and boost your game with one click',
      'Startup Manager — control what launches when your PC boots',
      'Ping Test — check your latency to gaming servers around the world',
      'Tweak Scheduler — automatically clean temp files and run maintenance on a schedule',
      'Tweak History — a full log of every change made to your system',
      'Search — find any tweak instantly from anywhere in the app',
    ]
    const _wnItemsFi = [
      'Täysin uusi sovellus — nopeampi, kevyempi, ei asennusta',
      'Reaaliaikaiset CPU, RAM ja levy -mittarit kojelaudalla',
      'PC-terveyspistemäärä — näe yhdellä silmäyksellä kuinka optimoitu tietokoneesi on',
      'Peliprofiilit — tunnistaa asennetut pelisi ja soveltaa pelikohtaiset säädöt',
      'Auto-profiilit — säädöt aktivoituvat automaattisesti kun käynnistät pelin',
      'Sovellusoptimoija — vähennä taustakäyttöä selaimilla, Discord, Spotify ja muut',
      'Prosessinhallinta — näe mitä ajossa on ja tehosta peliäsi yhdellä klikkauksella',
      'Käynnistyksenhallinnat — hallitse mitä käynnistyy PC:n käynnistyessä',
      'Ping-testi — tarkista viiveesi pelipalvelimille ympäri maailmaa',
      'Säätöajastin — puhdista automaattisesti väliaikaiset tiedostot aikataulun mukaan',
      'Säätöhistoria — täydellinen loki kaikista järjestelmään tehdyistä muutoksista',
      'Haku — löydä mikä tahansa säätö välittömästi mistä tahansa sovelluksesta',
    ]
    const items = (typeof currentLang !== 'undefined' && currentLang === 'fi') ? _wnItemsFi : _wnItemsEn
    _wnData = [{ version: '6.0', date: 'May 2026', items }]
    document.getElementById('wn-sidebar').innerHTML = _wnRenderSidebar(_wnData, '6.0')
    document.getElementById('wn-ver').textContent   = 'Version 6.0 · May 2026'
    document.getElementById('wn-items').innerHTML   = _wnRenderItems(items)
    _openModal('wn-overlay')
  }
}
function closeWhatsNew() { _closeModal('wn-overlay') }

// ─── Bug Report ───────────────────────────────────────────────────────────────
function showBugReport() {
  document.getElementById('br-title').value = ''
  document.getElementById('br-desc').value = ''
  document.getElementById('br-steps').value = ''
  document.getElementById('br-title-count').textContent = '0 / 120'
  document.getElementById('br-desc-count').textContent = '0 / 1800'
  document.getElementById('br-steps-count').textContent = '0 / 900'
  document.getElementById('br-submit-btn').disabled = false
  document.getElementById('br-submit-btn').innerHTML = `<i class="fa fa-paper-plane"></i> <span>${tUI('brSendReport')}</span>`
  // Apply i18n to static labels
  document.querySelectorAll('#br-overlay [data-i18n]').forEach(el => { const k = el.dataset.i18n; if (k) el.textContent = tUI(k) })
  document.querySelectorAll('#br-overlay [data-i18n-placeholder]').forEach(el => { const k = el.dataset.i18nPlaceholder; if (k) el.placeholder = tUI(k) })
  _openModal('br-overlay')
  document.getElementById('br-title').focus()
}
function closeBugReport() { _closeModal('br-overlay') }

function closeAdvancedIntro() {
  const cb = document.getElementById('adv-intro-dont-show')
  if (cb?.checked) { settings.advIntroSeen = true; saveSettingsDebounced() }
  document.querySelectorAll('[data-advanced="true"]').forEach(el => {
    el.classList.add('adv-pulse')
    el.addEventListener('animationend', () => el.classList.remove('adv-pulse'), { once: true })
  })
  _closeModal('advanced-intro-overlay')
}

async function submitBugReport() {
  const title = document.getElementById('br-title').value.trim()
  const description = document.getElementById('br-desc').value.trim()
  const steps = document.getElementById('br-steps').value.trim()
  if (!title) { shakeInput(document.getElementById('br-title')); document.getElementById('br-title').focus(); return }
  if (!description) { shakeInput(document.getElementById('br-desc')); document.getElementById('br-desc').focus(); return }

  const btn = document.getElementById('br-submit-btn')
  btn.disabled = true
  btn.innerHTML = `<i class="fa fa-spinner fa-spin"></i> <span>${tUI('brSending')}</span>`

  try {
    await api.submitBugReport({ title, description, steps: steps || null, page: currentPage })
    closeBugReport()
    toast(tUI('bugReportSent'), tUI('bugReportThanks'), 'ok')
  } finally {
    btn.disabled = false
    btn.innerHTML = `<i class="fa fa-paper-plane"></i> <span>${tUI('brSendReport')}</span>`
  }
}

// ─── Undo last tweak ─────────────────────────────────────────────────────────
let _lastAppliedTweak = null
let _undoTimer = null
let _lastJournalId = null
function showUndoSnackbar(id, name, journalId) {
  _lastAppliedTweak = id
  _lastJournalId = journalId || null
  window._journalUndoTarget = journalId ? { entryId: journalId } : null
  window._lastUndoParts = window.JylliWorld ? [JylliWorld.partFor(id)] : null
  if (window.JylliToast) JylliToast.dismissTag('undo')
  toast(`${tUI('undoApplied')}: ${name}`, '', 'ok', 8000, { tag: 'undo', part: window.JylliWorld ? JylliWorld.partFor(id) : null, action: { label: tUI('chronoUndo'), run: () => undoLastTweak() } })
}
function hideUndoSnackbar() {
  if (window.JylliToast) JylliToast.dismissTag('undo')
  clearTimeout(_undoTimer)
}
// Undo goes through the change journal when the apply was recorded (it writes the real before-values back and asks first if
// something changed since); otherwise it falls back to the tweak's own Restore.
async function undoLastTweak() {
  const target = window._journalUndoTarget
  if (target) {
    hideUndoSnackbar()
    window._journalUndoTarget = null
    let res = await api.journalUndo({ target })
    if (res && res.conflict) {
      let ok = false
      try { await showConfirm({ title: tUI('undoConflictTitle'), body: escHtml(tUI('undoConflictBody')), okText: tUI('undoOverwrite'), okStyle: 'warning' }); ok = true } catch {}
      if (ok) res = await api.journalUndo({ target, force: true })
      else return
    }
    if (res && res.ok && window.JylliWorld) { try { JylliWorld.undoPulse(window._lastUndoParts, document.getElementById('page-content')) } catch {} }
    if (res && res.ok) { try { JylliSound.play('undo') } catch {} toast(tUI('undoDone'), '', 'ok'); try { invalidatePageCache(currentPage); showPage(currentPage) } catch {} }
    else toast(tUI('undoFailed'), '', 'err')
    _lastAppliedTweak = null
    return
  }
  if (!_lastAppliedTweak) return
  hideUndoSnackbar()
  await applyTweak(_lastAppliedTweak, 'restore')
  _lastAppliedTweak = null
}

// ─── Input shake (validation error feedback) ─────────────────────────────────
function shakeInput(el) {
  if (!el) return
  el.classList.remove('input-error')
  void el.offsetWidth // force reflow to restart animation
  el.classList.add('input-error')
  setTimeout(() => el.classList.remove('input-error'), 420)
}

// ─── Theme color helpers ──────────────────────────────────────────────────────
function pinkRgb() { return getComputedStyle(document.documentElement).getPropertyValue('--pink-rgb').trim() || '124,110,248' }
function pinkHex() { return getComputedStyle(document.documentElement).getPropertyValue('--pink').trim() || '#7C6EF8' }
function pinkA(a) { return `rgba(${pinkRgb()},${a})` }

// ─── Toast Notification System ────────────────────────────────────────────────
function toast(title, msg = '', type = 'ok', duration = 3500, opts) {
  if (window.JylliToast) return JylliToast.show(title, msg, type, duration, opts || {})   // 4.0 toast (js/ui4/toast.js); everything below is the fallback
  const typeMap = { success: 'ok', error: 'err' }
  const t_type = typeMap[type] || type
  const validTypes = { ok: 1, err: 1, warn: 1, info: 1 }
  const safeType = validTypes[t_type] ? t_type : 'info'
  const icons = { ok: 'fa-circle-check', err: 'fa-circle-xmark', warn: 'fa-triangle-exclamation', info: 'fa-circle-info' }
  const t = document.createElement('div')
  t.className = `toast ${safeType}`
  // title / msg are plain text — callers routinely pass process names, error messages and API data
  t.innerHTML = `
    <span class="toast-icon-wrap"><i class="fa ${icons[safeType]}"></i></span>
    <div class="toast-body">
      <div class="toast-title"></div>
      <div class="toast-msg"></div>
      <div class="toast-bar"></div>
    </div>
    <button class="toast-close" onclick="this.closest('.toast').remove()" aria-label="${escAttr(tUI('ttDismiss'))}"><i class="fa fa-xmark"></i></button>
  `
  t.querySelector('.toast-title').textContent = title == null ? '' : String(title)
  const msgEl = t.querySelector('.toast-msg')
  if (msg) msgEl.textContent = String(msg); else msgEl.remove()
  t.querySelector('.toast-bar').style.animationDuration = `${duration}ms`
  document.getElementById('toast-container').appendChild(t)
  setTimeout(() => {
    t.classList.add('out')
    setTimeout(() => t.remove(), 160)
  }, duration)
}

// Icon-only buttons get an accessible name from their tooltip (title) so screen readers don't announce a bare "button".
function _labelIconButtons(root) {
  const scope = root && root.querySelectorAll ? root : document
  // Known handlers get a translated name; anything else falls back to its tooltip (title).
  scope.querySelectorAll('button:not([aria-label]), button[data-auto-label], a.btn[title]:not([aria-label])').forEach(b => {
    if (b.textContent.trim()) return
    const h = (b.getAttribute('onclick') || '') + ' ' + b.id
    const key = /Close|closeBugReport|tweak-diff-modal/.test(h) ? 'abClose' : /toggleAdvancedMode/.test(h) ? 'abAdvanced' : /showWhatsNew/.test(h) ? 'abWhatsNew'
      : /showBugReport/.test(h) ? 'abBugReport' : /toggleLogPane/.test(h) ? 'abToggleLog' : /DeleteBundle/.test(h) ? 'abDelete' : /genRebootNow/.test(h) ? 'abRebootNow' : null
    const label = key ? tUI(key) : b.getAttribute('title')
    if (label) { b.setAttribute('aria-label', label); b.setAttribute('data-auto-label', '1') }
  })
}
// Legacy pages: give unlabelled form controls a name, and make clickable non-buttons reachable from the keyboard.
function _a11yEnhance(root) {
  const scope = root && root.querySelectorAll ? root : document
  scope.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([aria-label]):not([aria-labelledby]), select:not([aria-label]):not([aria-labelledby]), textarea:not([aria-label])').forEach(el => {
    if (el.labels && el.labels.length) return
    let label = el.getAttribute('placeholder') || el.getAttribute('title')
    if (!label) {
      const row = el.closest('.j-row, .gs-slider-row, .slider-row, .form-row, .setting-row, label') || el.parentElement
      const t = row && row.querySelector('.j-row-title, label, .slider-label, .gs-slider-label, .label, span, b')
      label = t && t !== el && t.textContent.trim().slice(0, 80)
    }
    if (label) el.setAttribute('aria-label', label)
  })
  scope.querySelectorAll('[onclick]:not(button):not(a):not(input):not(select):not(label):not([tabindex])').forEach(el => {
    el.setAttribute('tabindex', '0')
    if (el.tagName !== 'TR' && el.tagName !== 'TH' && !el.getAttribute('role')) el.setAttribute('role', 'button')
  })
}
document.addEventListener('keydown', e => {
  if ((e.key !== 'Enter' && e.key !== ' ') || e.target.matches('input, textarea, select, button, a, [contenteditable]')) return
  const el = e.target.closest && e.target.closest('[onclick][tabindex]')
  if (el && el === e.target) { e.preventDefault(); el.click() }
})
document.addEventListener('DOMContentLoaded', () => {
  _labelIconButtons(document); _a11yEnhance(document)
  // Only newly added elements are rescanned (the old version re-queried the whole document on every telemetry text write).
  const pending = new Set()
  let queued = false
  new MutationObserver(muts => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1 || n.closest('#jx-callouts, #jx-fx, [data-odo]')) continue   // live overlays and odometer digits need no labels
        pending.add(n.parentElement || n)
      }
    }
    if (queued || !pending.size) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      const list = [...pending]; pending.clear()
      // a parent that is already inside another queued parent is covered by that scan
      for (const el of list) if (el.isConnected && !list.some(o => o !== el && o.contains(el))) { _labelIconButtons(el); _a11yEnhance(el) }
    })
  }).observe(document.body, { childList: true, subtree: true })
})

// Arrow / Home / End move between the tabs of a tablist (and activate the focused one), as in the WAI-ARIA tabs pattern
document.addEventListener('keydown', e => {
  if (!/^(ArrowLeft|ArrowRight|Home|End)$/.test(e.key)) return
  const tab = e.target.closest && e.target.closest('[role="tablist"] > button')
  if (!tab) return
  const tabs = [...tab.parentElement.querySelectorAll(':scope > button')].filter(b => !b.disabled && b.offsetParent !== null)
  const i = tabs.indexOf(tab)
  if (i < 0) return
  const next = e.key === 'Home' ? tabs[0] : e.key === 'End' ? tabs[tabs.length - 1] : tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]
  e.preventDefault()
  next.focus(); next.click()
  // the click re-renders the tab row in the shell: put focus back on the matching tab
  requestAnimationFrame(() => { const t = [...document.querySelectorAll('[role="tablist"] > button')].find(b => b.textContent === next.textContent); if (t) t.focus() })
})

// ─── Keyboard shortcut sheet (Ctrl+/) ─────────────────────────────────────────
function openShortcutSheet() {
  let el = document.getElementById('shortcuts-modal')
  if (!el) {
    el = document.createElement('div')
    el.id = 'shortcuts-modal'
    el.className = 'j-modal-backdrop'
    el.style.display = 'none'
    el.addEventListener('click', e => { if (e.target === el) closeShortcutSheet() })
    document.body.appendChild(el)
  }
  const { html } = ui
  const keys = k => html`<span class="j-keys">${k.split('+').map(x => html`<kbd class="j-kbd">${x}</kbd>`)}</span>`
  const rows = [['Ctrl+K', 'scPalette'], ['Ctrl+1…5', 'scSections'], ['Ctrl+,', 'scSettings'], ['Ctrl+Shift+L', 'scActivity'], ['Ctrl+/', 'scSheet'], ['Esc', 'scClose']]
  el.innerHTML = String(html`<div class="j-modal j-modal-md" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
    <div class="j-modal-head"><h2 class="j-modal-title" id="shortcuts-title">${tUI('shortcutsTitle')}</h2>${ui.button({ iconOnly: true, icon: 'xmark', variant: 'ghost', size: 'sm', title: tUI('scClose'), onclick: 'closeShortcutSheet()' })}</div>
    <div class="j-modal-body">${rows.map(([k, label]) => html`<div class="j-row"><div class="j-row-main"><div class="j-row-title">${tUI(label)}</div></div><div class="j-row-control">${keys(k)}</div></div>`)}</div>
  </div>`)
  _openModal('shortcuts-modal')
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('j-open')))
}
function closeShortcutSheet() {
  const el = document.getElementById('shortcuts-modal')
  if (!el || el.style.display === 'none') return
  el.classList.remove('j-open')
  _closeModal('shortcuts-modal')
}
