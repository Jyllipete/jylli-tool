'use strict'
// Settings page: category rail + grouped setting rows. Element ids and handlers are those of the 1.x page.
function buildSettings(c) {
  const { html, raw } = ui
  const theme = settings.theme || 'jylli'
  const lang = currentLang
  const premium = !!settings.isPremium
  const sw = (id, onchange, label) => ui.switch({ id, onchange, label })
  const row = (title, sub, control, extra = {}) => ui.row({ title, sub, control, ...extra })
  const seg = (items, active, on) => ui.segmented(items, active, on)

  const CATS = [
    ['general', 'settingsCatGeneral', 'sliders'],
    ['appearance', 'settingsAppearance', 'palette'],
    ['gaming', 'settingsCatGaming', 'gamepad'],
    ['privacy', 'settingsCatPrivacy', 'user-shield'],
    ['account', 'settingsDiscordAccount', 'circle-user'],
    ['about', 'settingsAbout', 'circle-info'],
  ]
  const section = (id, titleKey, body) => html`<section class="j-settings-sec" id="set-sec-${id}"><h2 class="j-settings-h">${tUI(titleKey)}</h2>${body}</section>`

  const motionBtns = ['snappy', 'default', 'smooth', 'reduced'].map(m => html`<button id="motion-${m}-btn" type="button" class="${ui.cls('j-seg-item', (settings.motionMode || 'default') === m && 'j-seg-active')}" onclick="settingsSetMotionMode('${m}')">${tUI('motion' + m.charAt(0).toUpperCase() + m.slice(1))}</button>`)

  const out = html`<div class="j-settings">
    <nav class="j-settings-nav" aria-label="Settings">${CATS.map(([id, key, ic]) => html`<button class="j-nav-item" type="button" onclick="document.getElementById('set-sec-${id}').scrollIntoView({behavior:'smooth',block:'start'})"><i class="fa fa-${ic}" aria-hidden="true"></i><span>${tUI(key)}</span></button>`)}</nav>
    <div class="j-settings-main">

    <div id="fingerprint-banner" class="j-callout j-callout-warn" style="display:none">
      <i class="fa fa-triangle-exclamation" aria-hidden="true"></i>
      <div class="j-grow"><b id="fingerprint-banner-title"></b><div class="j-muted" id="fingerprint-banner-desc"></div></div>
      <div class="j-hstack"><button class="j-btn j-btn-sm" id="fingerprint-banner-review" type="button"></button>${ui.button({ iconOnly: true, icon: 'xmark', variant: 'ghost', size: 'sm', title: tUI('fingerprintDismiss'), onclick: 'fingerprintDismiss()' })}</div>
    </div>

    ${section('general', 'settingsCatGeneral', html`
      ${ui.group('', [
        row(html`${tUI('language')} / Kieli`, '', html`<div class="j-seg"><button type="button" class="${ui.cls('j-seg-item', lang === 'en' && 'j-seg-active')}" onclick="setLanguage('en')">EN</button><button type="button" class="${ui.cls('j-seg-item', lang === 'fi' && 'j-seg-active')}" onclick="setLanguage('fi')">FI</button></div>`),
        row(tUI('settingsStartup'), tUI('settingsStartupDesc'), sw('settings-startup-check', 'settingsToggleStartup(this.checked)', tUI('settingsStartup'))),
        row(tUI('settingsAdvanced'), tUI('settingsAdvancedDesc'), html`<span id="settings-adv-pill">${sw('settings-adv-check', 'toggleAdvancedMode()', tUI('settingsAdvanced'))}</span>`),
        row(tUI('settingsDiscordRpc'), tUI('settingsDiscordRpcDesc'), sw('settings-rpc-check', 'settingsToggleDiscordRpc(this.checked)', tUI('settingsDiscordRpc'))),
        row(tUI('settingsUiSounds'), tUI('settingsUiSoundsDesc'), sw('settings-sounds-check', 'settingsToggleUiSounds(this.checked)', tUI('settingsUiSounds'))),
      ])}`)}

    ${section('appearance', 'settingsAppearance', html`
      <p class="j-muted j-settings-hint">${tUI('settingsThemeHint')}</p>
      <div class="j-stat-label">${tUI('settingsThemePresetsLabel')}</div>
      <div class="j-theme-grid" id="theme-grid"></div>
      ${ui.group('', [
        row(tUI('settingsCustomAccent'), tUI('settingsAccentHint'), html`<div class="tc-accent-row" id="accent-row"><div class="tc-accent-swatch-wrap" id="accent-swatch-wrap"><div class="tc-accent-swatch-circle" id="accent-swatch-circle"></div><input type="color" id="accent-color-picker"></div>${ui.button({ label: tUI('settingsReset'), size: 'sm', onclick: 'resetAccentColor()' })}</div>`),
        row(tUI('colorScheme'), tUI('colorSchemeDesc'), html`<div class="j-seg">${['system', 'dark', 'light'].map(v => html`<button type="button" data-scheme="${v}" class="${ui.cls('j-seg-item', (settings.colorScheme || 'dark') === v && 'j-seg-active')}" onclick="settingsSetScheme('${v}')">${tUI('scheme' + v.charAt(0).toUpperCase() + v.slice(1))}</button>`)}</div>`),
        row(tUI('motionMode'), tUI('motionModeDesc'), html`<div class="j-seg">${motionBtns}</div>`),
      ])}`)}

    ${section('gaming', 'settingsCatGaming', html`
      ${ui.callout(html`${tUI('launchRulesManaged')} <a href="#" onclick="showPage('pulse');return false">${tUI('launchRulesTitle')} →</a>`, 'info')}
      ${ui.group('', [
        row(tUI('settingsSilentMode'), tUI('settingsSilentModeDesc'), sw('settings-silent-check', 'settingsToggleSilentMode(this.checked)', tUI('settingsSilentMode'))),
        row(tUI('settingsLowResourceMode'), tUI('settingsLowResourceModeDesc'), sw('settings-low-resource-check', 'settingsToggleLowResourceMode(this.checked)', tUI('settingsLowResourceMode'))),
        row(tUI('settingsThermalGuard'), tUI('settingsThermalGuardDesc'), sw('settings-thermal-guard-check', 'settingsToggleThermalGuard(this.checked)', tUI('settingsThermalGuard'))),
        premium ? row(tUI('ariaEnableLabel'), tUI('ariaEnableDesc'), sw('settings-aria-check', 'settingsToggleAria(this.checked)', tUI('ariaEnableLabel'))) : '',
        premium ? row(tUI('ariaFpsHud'), tUI('ariaFpsHudDesc'), html`${ui.button({ label: tUI('ariaFpsHudConfigure'), size: 'sm', onclick: 'api.openFpsHudSettings().catch(()=>{})' })}${sw('settings-fps-hud-check', 'settingsToggleFpsHud(this.checked)', tUI('ariaFpsHud'))}`) : '',
      ])}`)}

    ${section('privacy', 'settingsCatPrivacy', html`
      ${ui.group('', [
        row(tUI('settingsAnalytics'), tUI('settingsAnalyticsDesc'), sw('settings-analytics-check', 'settingsToggleAnalytics(this.checked)', tUI('settingsAnalytics'))),
        row(tUI('exportReportLabel'), tUI('exportReportDesc'), ui.button({ label: tUI('exportReportBtn'), icon: 'file-arrow-down', size: 'sm', onclick: 'doExportReport(this)' })),
      ])}`)}

    ${section('account', 'settingsDiscordAccount', html`
      ${ui.group('', [
        row(tUI('settingsLinkedAccount'), html`<span id="settings-discord-label">${tUI('settingsNotLinked')}</span>`, html`<button class="j-btn j-btn-sm" id="settings-discord-unlink-btn" type="button" onclick="settingsUnlinkDiscord()"><i class="fa-brands fa-discord" aria-hidden="true"></i>${tUI('settingsUnlink')}</button>`),
      ])}`)}

    ${section('about', 'settingsAbout', html`
      ${ui.group('', [
        row('Jylli Tool', html`${tUI('settingsVersion')} <span id="settings-ver-label" class="j-num">…</span>`, html`<button class="j-btn j-btn-primary j-btn-sm" id="settings-check-update-btn" type="button" onclick="runUpdateCheck()"><i class="fa fa-rotate" aria-hidden="true"></i>${tUI('settingsCheckUpdate')}</button>${ui.button({ label: html`<i class="fa-brands fa-discord" aria-hidden="true"></i> Discord`, size: 'sm', onclick: "api.openExternal('https://discord.gg/jylligraffat')" })}`),
      ])}
      <div id="settings-health-result" class="j-settings-health" style="display:none"></div>`)}
    </div>
  </div>`
  c.innerHTML = String(out)

  // Theme presets: swatch cards (preview on hover, apply on click)
  const grid = c.querySelector('#theme-grid')
  Object.entries(THEMES).forEach(([key, t]) => {
    const card = document.createElement('button')
    card.type = 'button'
    card.className = 'j-theme' + (key === theme ? ' j-theme-active' : '')
    card.style.setProperty('--swatch', t.accent)
    card.innerHTML = String(html`<span class="j-theme-dot"></span><span class="j-theme-name">${t.label}</span><span class="j-theme-desc">${t.desc}</span>`)
    card.onclick = () => {
      document.querySelectorAll('.j-theme').forEach(x => x.classList.remove('j-theme-active'))
      card.classList.add('j-theme-active')
      settings.theme = key
      delete settings.accentColor
      api.saveSettings(settings)
      applyTheme(key)
      const picker = document.getElementById('accent-color-picker')
      const swatch = document.getElementById('accent-swatch-circle')
      if (picker) picker.value = t.accent
      if (swatch) swatch.style.background = t.accent
    }
    let _previewRaf = null
    card.addEventListener('mouseenter', () => {
      if (_previewRaf) cancelAnimationFrame(_previewRaf)
      _previewRaf = requestAnimationFrame(() => applyTheme(key, { animate: false }))
    })
    card.addEventListener('mouseleave', () => {
      if (_previewRaf) cancelAnimationFrame(_previewRaf)
      _previewRaf = requestAnimationFrame(() => {
        applyTheme(settings.theme || 'jylli', { animate: false })
        if (settings.accentColor) applyAccentColor(settings.accentColor)
      })
    })
    grid.appendChild(card)
  })

  // Accent picker — syncs hidden input + visible swatch circle
  const picker = document.getElementById('accent-color-picker')
  const swatch = document.getElementById('accent-swatch-circle')
  const initialAccent = settings.accentColor || THEMES[settings.theme || 'jylli'].accent
  if (picker) picker.value = initialAccent
  if (swatch) swatch.style.background = initialAccent
  if (picker) picker.addEventListener('input', e => {
    const hex = e.target.value
    applyAccentColor(hex)
    settings.accentColor = hex
    if (swatch) swatch.style.background = hex
    saveSettingsDebounced()
  })

  // Initial switch states
  const setChecked = (id, v) => { const el = document.getElementById(id); if (el) el.checked = v }
  setChecked('settings-rpc-check', settings.discordRpcEnabled !== false)
  setChecked('settings-sounds-check', !!settings.uiSounds)
  setChecked('settings-aria-check', settings.ariaEnabled === true)
  setChecked('settings-fps-hud-check', !!settings.ariaFpsHudEnabled)
  setChecked('settings-silent-check', !!settings.silentModeEnabled)
  setChecked('settings-low-resource-check', !!settings.lowResourceMode)
  setChecked('settings-thermal-guard-check', !!settings.thermalGuardEnabled)
  setChecked('settings-adv-check', !!settings.advancedMode)
  setChecked('settings-analytics-check', settings.analyticsConsent === true)
  setChecked('settings-startup-check', !!settings.startAtLogin)

  const verLabel = document.getElementById('settings-ver-label')
  if (verLabel) verLabel.textContent = appVersion || '…'

  // Discord account label — read from in-memory settings (kept in sync with every save)
  const discordLabel = document.getElementById('settings-discord-label')
  if (discordLabel) discordLabel.textContent = settings.discordUserId ? `Discord ID: ${settings.discordUserId}` : tUI('settingsNotLinked')

  // Tweak Fingerprint — evaluate hardware mismatches and show banner if needed
  const fpBanner = document.getElementById('fingerprint-banner')
  if (fpBanner) {
    const dismissedTs = settings.fingerprintDismissedTs || 0
    const dismissedRecently = Date.now() - dismissedTs < 7 * 86400000
    if (!dismissedRecently) {
      const mismatches = scanFingerprintMismatches()
      if (mismatches.length > 0) {
        fpBanner.style.display = 'flex'
        const s = mismatches.length === 1 ? '' : 's'
        document.getElementById('fingerprint-banner-title').textContent = tUI('fingerprintBannerTitle')
        document.getElementById('fingerprint-banner-desc').textContent = tUI('fingerprintBannerDesc').replace('{n}', mismatches.length).replace('{s}', s)
        const reviewBtn = document.getElementById('fingerprint-banner-review')
        if (reviewBtn) {
          reviewBtn.textContent = tUI('fingerprintBannerReview')
          reviewBtn.onclick = () => {
            // Navigate to the first mismatched tweak's category page
            const firstId = mismatches[0].id
            const catMap = { 'gpu-hwsch': 'performance', 'intel-power-plan': 'performance', 'amd-power-plan': 'performance',
              'sysmain': 'memory', 'power-throttling': 'performance', 'usb-suspend': 'performance', 'pcie-power': 'performance',
              'nic-interrupt-mod': 'network', 'nic-flow-control': 'network', 'nic-energy-efficient': 'network',
              'nic-offloads': 'network', 'nic-rss-affinity': 'network', 'nic-ndis-poll': 'network',
              'fivem-gpu': 'fivem', 'fivem-streaming-mem': 'fivem', 'fivem-worker-threads': 'fivem', 'fivem-vm': 'fivem' }
            const page = catMap[firstId] || 'performance'
            showPage(page)
            setTimeout(() => {
              const el = document.getElementById(`tcw-${firstId}`)
              if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('highlight-pulse'); setTimeout(() => el.classList.remove('highlight-pulse'), 2000) }
            }, 300)
          }
        }
      }
    }
  }
}
