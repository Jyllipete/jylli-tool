'use strict'
// Gaming > Pulse. Markup only: the state, timers and IPC live in the pulse*/launchRule*/gs* functions in index.html, which find
// their targets by id. Every id and every class those functions toggle (pulse-hero--active, .selected, lr-off, lr-dot-active,
// pulse-thermal-*, .apb-game, hero-empty) is kept. Elements JS shows/hides start with an inline display:none, as before.
function _puRule({ id, card, dot, check, icon, title, desc, rule, extra = '', badge = '', body = '' }) {
  const { html, raw } = ui
  return html`<div id="${card}" class="lr-card j-pu-rule">
    <div class="j-pu-rule-row">
      <span id="${dot}" class="lr-dot" aria-hidden="true"></span>
      <div class="j-pu-rule-main">
        <div class="j-pu-rule-title"><i class="fa fa-${icon}" aria-hidden="true"></i>${title}${raw(badge)}</div>
        <div class="j-pu-rule-desc" ${raw(extra)}>${desc}</div>
      </div>
      ${ui.switch({ id: check, onchange: `launchRuleToggle('${rule}', this.checked)`, label: title })}
    </div>${raw(body)}
  </div>`
}

function _puSlider({ id, valId, label, hint, min, max, value, kind, tone }) {
  const { html } = ui
  const fill = Math.round((value - min) / (max - min) * 100)
  return html`<div class="j-pu-slider">
    <div class="j-pu-slider-head"><span class="j-pu-slider-label">${label}</span><span class="j-muted">${hint}</span></div>
    <div class="j-pu-slider-row">
      <input id="${id}" type="range" min="${min}" max="${max}" step="5" value="${value}" class="gs-slider j-pu-range-${tone}" style="--gs-fill-pct:${fill}%" aria-label="${label}" oninput="gsUpdateThreshold('${kind}', this.value)">
      <span id="${valId}" class="j-pu-val j-pu-val-${tone}">${value}%</span>
    </div>
  </div>`
}

async function buildPulse(c) {
  if (!settings.isPremium) { await JylliPremium.build(c, 'pulse'); return }
  const { html, raw } = ui
  const t3 = settings.gameShieldTier3Threshold ?? 70
  const t2 = settings.gameShieldMidSessionThreshold ?? 80

  const gameShieldBody = html`
    <div class="j-pu-shield">
      <div id="gs-manifest" class="j-pu-manifest" style="display:none"></div>
      <div class="j-pu-sub-block">
        <div class="j-pu-label"><i class="fa fa-heart" aria-hidden="true"></i>${tUI('gsExclusionsLabel')}</div>
        <div id="gs-exclusions-row" class="j-pu-excl">
          <div id="gs-exclusion-pills" class="j-pu-pills"></div>
          <input id="gs-exclusion-input" class="j-input" type="text" placeholder="${tUI('gsExclusionsPlaceholder')}" aria-label="${tUI('gsExclusionsLabel')}" onkeydown="gsExclusionInputKey(event)">
        </div>
      </div>
      <div class="j-pu-sub-block">
        <div class="j-pu-label"><i class="fa fa-gauge-high" aria-hidden="true"></i>${tUI('gsSettingsLabel')}</div>
        <div class="j-pu-sliders">
          ${_puSlider({ id: 'gs-tier3-threshold', valId: 'gs-tier3-val', label: tUI('gsThresholdTier3'), hint: tUI('gsThresholdTier3Hint'), min: 50, max: 95, value: t3, kind: 'tier3', tone: 'accent' })}
          ${_puSlider({ id: 'gs-midsession-threshold', valId: 'gs-midsession-val', label: tUI('gsThresholdMidSession'), hint: tUI('gsThresholdMidSessionHint'), min: 50, max: 95, value: t2, kind: 'midSession', tone: 'danger' })}
        </div>
      </div>
    </div>`

  const autoPulseBody = html`
    <div id="auto-pulse-badge" class="j-pu-ap" style="display:none">
      <i class="fa fa-wand-magic-sparkles" aria-hidden="true"></i>
      <span>${tUI('autoPulseActiveLabel')}</span>
      <strong class="apb-game"></strong>
      <span class="j-pu-grow"></span>
      <select id="ap-preset-override" class="j-select" aria-label="${tUI('autoPulseDefaultPreset')}" onchange="applyAutoPulsePresetOverride(this)">
        <option value="">${tUI('autoPulseDefaultPreset')}</option>
        ${PULSE_PRESET_LIST.map(p => html`<option value="${p.id}">${p.name}</option>`)}
      </select>
      ${ui.button({ iconOnly: true, icon: 'xmark', variant: 'ghost', size: 'sm', title: tUI('pulseDeactivate'), onclick: 'doAutoPulseManualStop()' })}
    </div>`

  c.innerHTML = String(html`
  <div id="pulse-panel" class="j-pu">
    <div id="pulse-hero" class="pulse-hero j-pu-hero">
      <div class="pulse-hero-badge"><i class="fa fa-bolt" aria-hidden="true"></i></div>
      <div class="j-pu-grow">
        <div class="j-pu-title">Pulse</div>
        <div class="j-muted">${tUI('pulseSubtitle')}</div>
      </div>
      <span id="pulse-status-badge" class="pulse-status-badge j-badge j-badge-ok" style="display:none">${tUI('pulseActive')}</span>
      ${ui.button({ label: tUI('pulseLiveMonitor'), icon: 'arrow-up-right-from-square', variant: 'ghost', size: 'sm', onclick: 'openPulseLive()' })}
    </div>

    <div id="pulse-score-row" class="j-pu-score" style="display:none">
      <div class="j-pu-score-top">
        <div class="j-pu-grow">
          <div class="j-pu-label"><i class="fa fa-star" aria-hidden="true"></i>${tUI('pulseScoreLabel')}</div>
          <div class="j-pu-score-num"><span id="pulse-score-val">—</span><span class="j-muted">/1000</span></div>
        </div>
        <div id="pulse-score-breakdown" class="j-pu-chips"></div>
      </div>
      <div class="j-pu-bar"><div id="pulse-score-bar"></div></div>
    </div>

    <div id="gw-session-strip" class="gw-strip j-pu-strip" style="display:none">
      <span class="gw-strip-dot"></span>
      <div class="j-pu-grow">
        <div class="gw-strip-label">${tUI('nowGamingLabel')}</div>
        <div class="j-pu-strip-meta">
          <span id="gw-strip-game" class="j-pu-strip-game"></span>
          <span id="gw-strip-timer" class="j-muted j-num"></span>
          <span id="gw-strip-fps" class="j-pu-strip-fps" style="display:none"></span>
        </div>
      </div>
      <button type="button" id="pulse-ba-toggle" class="j-btn j-btn-sm j-btn-ghost" style="display:none" onclick="togglePulseBeforeAfter(this)">${tUI('pulseBeforeAfterBtn')}</button>
      <button type="button" class="gw-strip-stop j-btn j-btn-sm j-btn-danger" onclick="gwStripStopAll()">${tUI('nowGamingStopAll')}</button>
    </div>
    <div id="pulse-ba-panel" class="j-pu-ba" style="display:none"></div>

    <div id="pulse-launch-rules" class="j-pu-section">
      <div class="j-pu-section-head">
        <div class="pulse-section-label"><i class="fa fa-bolt" aria-hidden="true"></i>${tUI('launchRulesTitle')}</div>
        <div id="pulse-launch-rules-armed" class="j-pu-armed"></div>
      </div>
      <div class="j-pu-rules">
        ${_puRule({ card: 'lr-card-ug', dot: 'pulse-ug-dot', check: 'pulse-ug-check', icon: 'shield-halved', title: tUI('settingsUpdateGuard'), desc: tUI('settingsUpdateGuardDesc'), rule: 'updateGuard', extra: 'id="ug-status-sub"', badge: '<span id="ug-block-count" class="j-badge j-badge-danger" style="display:none"></span>' })}
        ${_puRule({ card: 'lr-card-gs', dot: 'pulse-gs-dot', check: 'pulse-gs-check', icon: 'bolt', title: tUI('settingsGameShield'), desc: tUI('settingsGameShieldDesc'), rule: 'gameShield', body: String(gameShieldBody) })}
        ${_puRule({ card: 'lr-card-gw', dot: 'pulse-gw-dot', check: 'pulse-gw-check', icon: 'eye', title: tUI('settingsGameWatcher'), desc: tUI('settingsGameWatcherDesc'), rule: 'gameWatcher' })}
        ${settings.isPremium ? _puRule({ card: 'lr-card-ap', dot: 'pulse-ap-dot', check: 'pulse-ap-check', icon: 'wand-magic-sparkles', title: tUI('settingsAutoPulse'), desc: tUI('settingsAutoPulseDesc'), rule: 'autoPulse', body: String(autoPulseBody) }) : ''}
      </div>
    </div>

    <div id="game-history-panel" class="j-pu-section" style="display:none">
      <div class="pulse-section-label"><i class="fa fa-clock-rotate-left" aria-hidden="true"></i>${tUI('recentSessionsTitle')}</div>
      <div id="game-history-table"></div>
    </div>

    <div id="pulse-thermal-card" style="display:none">
      <i id="pulse-thermal-icon" class="fa fa-thermometer-half" aria-hidden="true"></i>
      <div class="j-pu-min0">
        <div id="pulse-thermal-label" class="j-pu-thermal-label"></div>
        <div id="pulse-thermal-sub" class="j-muted"></div>
      </div>
    </div>

    <div class="j-pu-section">
      <div class="pulse-section-label j-pu-mb">${tUI('pulseSelectGame')}</div>
      <div id="pulse-selected-hero" class="pulse-selected-hero hero-empty">
        <span class="pulse-hero-empty-icon"><i class="fa fa-gamepad" aria-hidden="true"></i></span>
        <span class="pulse-hero-empty-text">${tUI('pulseChooseGame')}</span>
      </div>
      <div id="pulse-preset-grid" class="j-pu-grid">
        ${PULSE_PRESET_LIST.map(p => html`<button type="button" class="pulse-preset-card" id="pp-${p.id}" onclick="selectPulsePreset('${p.id}')" title="${p.name}"><i class="fa ${p.icon}" aria-hidden="true"></i><div>${p.name}</div></button>`)}
      </div>
    </div>

    <div class="j-pu-actions">
      <label class="j-pu-check"><input type="checkbox" id="pulse-kill-bg" checked> ${tUI('pulseKillBg')}</label>
      <div class="j-pu-grow"></div>
      <div id="pulse-active-label" class="j-muted" style="display:none">${tUI('pulseActiveLabel')} <strong id="pulse-active-name"></strong></div>
      <button type="button" id="pulse-start-btn" class="j-btn j-btn-primary j-btn-sm" onclick="doPulseStart(this)" disabled><i class="fa fa-bolt" aria-hidden="true"></i> ${tUI('pulseActivate')}</button>
      <button type="button" id="pulse-stop-btn" class="j-btn j-btn-ghost j-btn-sm" onclick="doPulseStop(this)" disabled style="display:none"><i class="fa fa-stop" aria-hidden="true"></i> ${tUI('pulseDeactivate')}</button>
    </div>

    <div id="pulse-log" class="j-pu-log" style="display:none" role="log">
      <div id="pulse-feed-chips" class="jx-49"></div>
    </div>
  </div>`)

  syncPulseUIState()
  syncLaunchRuleChecks()
  gsExclusionInit()
  loadGameHistory()
  api.getSystemContext().then(ctx => { if (ctx?.gameRunning) setLaunchRuleDots(true) }).catch(() => {})
  _pulseThermalUpdate()
}
