'use strict'
// Gaming > Pulse. The tab itself is Pulse 2.0 (js/pulse/page.js); this file keeps the two builders its Rules view reuses
// (_puRule, _puSlider) and the premium gate. Every id these builders emit is one the launchRule*/gs* handlers in index.html find by id.
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
  JylliPulsePage.mount(c)
}
