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
function _wnRenderItems(items) {
  return items.map(item => `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:11px;color:var(--gray)">
      <span style="color:var(--pink);font-size:8px;margin-top:3px;flex-shrink:0">✦</span>
      <span>${item}</span>
    </div>`).join('')
}
function _wnUpdateStaticText() {
  const title = document.getElementById('wn-title')
  const closeBtn = document.getElementById('wn-close-btn')
  if (title) title.innerHTML = `<i class="fa fa-star"></i> ${tUI('whatsNewTitle')}`
  if (closeBtn) closeBtn.innerHTML = `<i class="fa fa-xmark"></i> ${tUI('whatsNewClose')}`
}
async function showWhatsNew(version) {
  _wnUpdateStaticText()
  try {
    const data = await api.getWhatsNew(currentLang)
    if (!data?.length) return
    const v = (version ? data.find(e => e.version === String(version)) : null) || data[0]
    document.getElementById('wn-ver').textContent = `Version ${v.version} · ${v.date}`
    document.getElementById('wn-items').innerHTML = _wnRenderItems(v.items)
    _openModal('wn-overlay')
  } catch(e) {
    // api not ready yet — show static version
    document.getElementById('wn-ver').textContent = 'Version 1.5.3 · May 2026'
    const _wnItemsEn = [
      'Pulse — FPS Command Center with Avg FPS, 1% Low, Stability % tiles and 90-sample sparkline',
      'Pulse — SMOOTHNESS score (0–100) from frame time variance; Session History saves last 5 sessions',
      'Pulse — ARIA Predictive Mode: predicts CPU/GPU/RAM spikes 8 s ahead using linear regression',
      'Pulse — Per-core CPU heatmap and GPU temp row in Live Monitor; System Threat Meter (OPTIMAL → CRITICAL)',
      'Pulse — Session debrief card after every session; activation cinematic; active-game hero bar',
      'Debloat — UWP removal also purges provisioned OS image; Bloat Score card (0–100)',
      'Debloat — Windows Ads panel with "Kill All Ads" button; Developer PC & Streamer PC presets',
      'Debloat — Context menu scanner, Windows Optional Features manager, OEM bloatware detection',
      'Scheduler — Rich task cards with state badge, next-run countdown, Run Now and History actions',
      'Home — System Identity hero card, trend arrows on metric tiles, optimization streak counter',
      'Smart Conflict Engine — blocks harmful tweak combinations (Wi-Fi + network, video call + MMCSS, etc.)',
      'App Optimizer — LIVE badge on currently running unoptimized apps; "Optimize All Running" one-click',
      'FiveM — Settings pack export/import (.jyt); Smart Recommend 4-tier logic; VRAM-adaptive graphics',
      'Auto-Optimize — Smart / Gaming / Safe mode selector; idle scheduling; real before/after report',
      'ARIA — Performance Journal, DPC Spike Log, and Tweak Impact Tracker (before/after per tweak)',
      'BIOS — Side-by-side profile comparison; Restore Point diff shows which tweaks would revert',
    ]
    const _wnItemsFi = [
      'Pulse — FPS Command Center: Avg FPS, 1% Low, Vakaus-% ja 90-näytteen sparkline',
      'Pulse — SULAVUUS-pistytys (0–100) ruutuaikojen vaihtelusta; istuntohistoria tallentaa 5 viimeistä sessiota',
      'Pulse — ARIA ennakoiva tila: ennustaa CPU/GPU/RAM-piikkejä 8 s etukäteen lineaarisella regressiolla',
      'Pulse — Per-ydin CPU-lämpökartta ja GPU-lämpötila Live-monitorissa; järjestelmäuhkamittari (OPTIMAL → KRIITTINEN)',
      'Pulse — Istunnon yhteenvetokortti session jälkeen; aktivointianimaatio; peliherobiitti',
      'Debloat — UWP-poisto puhdistaa myös provisioidun OS-kuvan; Bloat Score -kortti (0–100)',
      'Debloat — Windows-mainospaneeli "Tapa kaikki mainokset" -napilla; Kehittäjä-PC ja Striimaaja-PC -esiasetukset',
      'Debloat — Pikavalikkoskanneri, Windowsin valinnaiset ominaisuudet (DISM), OEM-turvottamistunnistus',
      'Ajastin — Rikkaat tehtäväkortit: tila, seuraava ajo, Aja nyt ja Historia-toiminnot',
      'Kotinäkymä — Järjestelmäidentiteettikortti, trendinuolet mittareissa, optimointiputki-laskuri',
      'Älykäs konfliktimoottori — estää haitalliset säätöyhdistelmät (Wi-Fi + verkko, videopuhelu + MMCSS jne.)',
      'Sovellusoptimoija — LIVE-merkki käynnissä oleville optimoimattomille sovelluksille; "Optimoi kaikki käynnissä olevat"',
      'FiveM — Asetuspaketti (.jyt vienti/tuonti); Smart Recommend 4-tason logiikalla; VRAM-mukautuva grafiikka',
      'Auto-Optimize — Älytila / Pelitila / Turvallinen tila; tyhjäkäyntiaikataulu; todellinen ennen/jälkeen-raportti',
      'ARIA — Suorituspäiväkirja, DPC-piikkikirjanpito ja säätövaikutusmittari (ennen/jälkeen jokaiselle säädölle)',
      'BIOS — Profiilien rinnakkainen vertailu; palautuspisteen diff näyttää mitkä säädöt peruuntuisivat',
    ]
    const _wnItems = (typeof currentLang !== 'undefined' && currentLang === 'fi') ? _wnItemsFi : _wnItemsEn
    document.getElementById('wn-items').innerHTML = _wnItems.map(item => `<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:11px;color:var(--gray)"><span style="color:var(--pink);font-size:8px;margin-top:3px;flex-shrink:0">✦</span><span>${item}</span></div>`).join('')
    _openModal('wn-overlay')
  }
}
function closeWhatsNew() { _closeModal('wn-overlay') }

// ─── Bug Report ───────────────────────────────────────────────────────────────
function showBugReport() {
  document.getElementById('br-title').value = ''
  document.getElementById('br-desc').value = ''
  document.getElementById('br-steps').value = ''
  document.getElementById('br-submit-btn').disabled = false
  document.getElementById('br-submit-btn').innerHTML = `<i class="fa fa-paper-plane"></i> ${tUI('brSendReport')}`
  _openModal('br-overlay')
  document.getElementById('br-title').focus()
}
function closeBugReport() { _closeModal('br-overlay') }

async function submitBugReport() {
  const title = document.getElementById('br-title').value.trim()
  const description = document.getElementById('br-desc').value.trim()
  const steps = document.getElementById('br-steps').value.trim()
  if (!title) { shakeInput(document.getElementById('br-title')); document.getElementById('br-title').focus(); return }
  if (!description) { shakeInput(document.getElementById('br-desc')); document.getElementById('br-desc').focus(); return }

  const btn = document.getElementById('br-submit-btn')
  btn.disabled = true
  btn.innerHTML = `<i class="fa fa-spinner fa-spin"></i> ${tUI('brSending')}`

  await api.submitBugReport({ title, description, steps: steps || null, page: currentPage })
  closeBugReport()
  toast(tUI('bugReportSent'), tUI('bugReportThanks'), 'ok')
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
