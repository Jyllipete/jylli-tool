'use strict'

// ─── Modal open/close helpers ─────────────────────────────────────────────────
const _closeTimers = new WeakMap()

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
}
function _closeModal(id) {
  const el = document.getElementById(id)
  if (!el) return
  el.classList.remove('open')
  el.classList.add('closing')
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
  const wRgb  = getComputedStyle(document.documentElement).getPropertyValue('--warning-rgb').trim() || '243,156,18'
  const iRgb  = getComputedStyle(document.documentElement).getPropertyValue('--info-rgb').trim()    || '52,152,219'
  const styles = {
    danger:  { bg: `rgba(var(--pink-rgb),0.12)`,   border: `rgba(var(--pink-rgb),0.3)`,   color: 'var(--pink)',    btnBg: 'var(--pink)',             btnColor: 'var(--c-bg-base)' },
    warning: { bg: `rgba(${wRgb},0.12)`,            border: `rgba(${wRgb},0.3)`,           color: 'var(--warning)', btnBg: 'var(--warning)',          btnColor: 'var(--c-bg-base)' },
    info:    { bg: `rgba(${iRgb},0.12)`,            border: `rgba(${iRgb},0.3)`,           color: 'var(--info)',    btnBg: 'var(--info)',             btnColor: '#fff' },
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
  _openModal('confirm-modal')
  return new Promise((res, rej) => { _confirmResolve = res; _confirmReject = rej })
}
function _confirmModalResolve() { _closeModal('confirm-modal'); if (_confirmResolve) { _confirmResolve(); _confirmResolve = null } }
function _confirmModalReject()  { _closeModal('confirm-modal'); if (_confirmReject)  { _confirmReject();  _confirmReject  = null } }

// ─── Prompt dialog (text input) ───────────────────────────────────────────────
let _promptResolve = null
function showPrompt({ title, body = '', placeholder = '', okText = 'OK', icon = 'fa-pencil' }) {
  const iRgb = getComputedStyle(document.documentElement).getPropertyValue('--info-rgb').trim() || '52,152,219'
  const iconEl = document.getElementById('confirm-modal-icon')
  iconEl.style.cssText = `width:36px;height:36px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;background:rgba(${iRgb},0.12);border:1px solid rgba(${iRgb},0.3);color:var(--info)`
  iconEl.innerHTML = `<i class="fa ${icon}"></i>`
  document.getElementById('confirm-modal-title').textContent = title
  document.getElementById('confirm-modal-body').innerHTML = `${body ? `<div style="margin-bottom:10px">${body}</div>` : ''}<input id="_prompt-input" type="text" placeholder="${placeholder}" maxlength="48" style="width:100%;box-sizing:border-box;background:var(--c-bg-base);border:1px solid var(--c-border-default);border-radius:7px;padding:7px 11px;color:var(--white);font-size:11px;font-family:inherit;outline:none;transition:border-color var(--dur-short),box-shadow var(--dur-short)" onfocus="this.style.borderColor='var(--c-accent)';this.style.boxShadow='0 0 0 3px var(--c-accent-ring)'" onblur="this.style.borderColor='';this.style.boxShadow=''" onkeydown="if(event.key==='Enter')_promptModalResolve()"><div id="_prompt-err" style="font-size:9.5px;color:var(--danger);margin-top:4px;display:none"></div>`
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
    document.getElementById('wn-ver').textContent   = `Version ${v.version} · ${v.date}`
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
function showUndoSnackbar(id, name) {
  _lastAppliedTweak = id
  const bar = document.getElementById('undo-snackbar')
  const label = document.getElementById('undo-snackbar-label')
  if (!bar) return
  if (label) label.textContent = `${tUI('undoApplied')}: ${name}`
  bar.classList.add('visible')
  clearTimeout(_undoTimer)
  _undoTimer = setTimeout(() => bar.classList.remove('visible'), 8000)
}
function hideUndoSnackbar() {
  document.getElementById('undo-snackbar')?.classList.remove('visible')
  clearTimeout(_undoTimer)
}
async function undoLastTweak() {
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
function toast(title, msg = '', type = 'ok', duration = 3500) {
  const typeMap = { success: 'ok', error: 'err' }
  const t_type = typeMap[type] || type
  const validTypes = { ok: 1, err: 1, warn: 1, info: 1 }
  const safeType = validTypes[t_type] ? t_type : 'info'
  const icons = { ok: 'fa-circle-check', err: 'fa-circle-xmark', warn: 'fa-triangle-exclamation', info: 'fa-circle-info' }
  const t = document.createElement('div')
  t.className = `toast ${safeType}`
  t.innerHTML = `
    <span class="toast-icon-wrap"><i class="fa ${icons[safeType]}"></i></span>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      ${msg ? `<div class="toast-msg">${msg}</div>` : ''}
      <div class="toast-bar"></div>
    </div>
    <button class="toast-close" onclick="this.closest('.toast').remove()" aria-label="${tUI('ttDismiss')}"><i class="fa fa-xmark"></i></button>
  `
  t.querySelector('.toast-bar').style.animationDuration = `${duration}ms`
  document.getElementById('toast-container').appendChild(t)
  setTimeout(() => {
    t.classList.add('out')
    setTimeout(() => t.remove(), 160)
  }, duration)
}
