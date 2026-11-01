'use strict'
// Optimize > GPU hero: the card isolated in the 3D rig, a live strip where every value is capability-gated, and the one GPU write
// the app offers (NVIDIA power limit, validated in main). No clock offsets, fan writes or presets. Free users see the twin read-only.
const GPU_STRIP = [
  ['gpu0.load', 'sensorKey_gpu0.load'], ['gpu0.temp.core', 'sensorKey_gpu0.temp.core'], ['gpu0.temp.hotspot', 'sensorKey_gpu0.temp.hotspot'],
  ['gpu0.power', 'sensorKey_gpu0.power'], ['gpu0.power.pct', 'gpuStripPowerPct'], ['gpu0.clock.core', 'sensorKey_gpu0.clock.core'],
  ['gpu0.clock.mem', 'gpuStripClockMem'], ['gpu0.vram.used', 'sensorKey_gpu0.vram.used'], ['gpu0.fan.rpm', 'sensorKey_gpu0.fan.rpm'], ['gpu0.fan.pct', 'sensorKey_gpu0.fan.pct'],
]

function buildGpuHero(c, { readOnly = false } = {}) {
  const { html } = ui
  const strip = GPU_STRIP.map(([key, label]) => html`<div class="j-gpu-cell"><div class="j-stat-label">${tUI(label)}</div><div class="j-gpu-val j-num" data-odo data-metric="${key}">—</div></div>`)
  const el = document.createElement('section')
  el.id = 'gpu-hero'
  el.className = 'j-card j-gpu-hero'
  el.innerHTML = String(html`
    <div class="j-twin-stage j-gpu-stage"><div class="j-twin-slot" id="gpu-twin-slot" data-twin-view="rig:gpu"></div></div>
    <div class="j-gpu-side">
      <div class="j-gpu-strip" role="group" aria-label="${tUI('gpuStripAria')}">${strip}</div>
      <div id="gpu-power-limit" class="j-gpu-pl">${readOnly ? '' : ui.callout(tUI('plChecking'), 'info')}</div>
    </div>`)
  c.prepend(el)
  const slot = el.querySelector('#gpu-twin-slot')
  if (window.JylliTwin) JylliTwin.attach(slot)
  try { JylliTelemetry.applyToDom() } catch {}
  if (!readOnly) gpuPowerLimitRender(el.querySelector('#gpu-power-limit'))
  return el
}

const PL_REASON = { laptop: 'plWhyLaptop', 'no-nvidia-gpu': 'plWhyNoNvidia', 'form-factor-unknown': 'plWhyForm', 'limits-unavailable': 'plWhyLimits', 'limits-inconsistent': 'plWhyLimits' }

async function gpuPowerLimitRender(box) {
  if (!box) return
  const { html } = ui
  let st = null
  try { st = await api.gpuPowerLimitGet() } catch {}
  if (!st) { box.innerHTML = String(ui.callout(tUI('plUnavailable'), 'warn')); return }
  if (!st.supported) { box.innerHTML = String(ui.callout(tUI(PL_REASON[st.reason] || 'plUnsupported'), 'info')); return }
  const cur = st.current, changed = cur !== st.default
  box.innerHTML = String(html`
    <div class="j-gpu-pl-head"><b>${tUI('plTitle')}</b><span class="j-muted">${st.name || ''}</span></div>
    <p class="j-muted j-settings-hint">${tUI('plDesc')}</p>
    <div class="j-gpu-pl-row">
      <input type="range" id="pl-range" min="${st.min}" max="${st.max}" step="1" value="${cur}" aria-label="${tUI('plTitle')}">
      <output id="pl-out" class="j-num">${cur} W</output>
    </div>
    <div class="j-muted j-gpu-pl-scale"><span>${st.min} W</span><span>${tUI('plDefault')}: ${st.default} W</span><span>${st.max} W</span></div>
    ${st.needsAdmin ? ui.callout(html`${tUI('plNeedsAdmin')} <a href="#" onclick="api.relaunchAdmin();return false">${tUI('dashRelaunchAdmin')}</a>`, 'warn') : ''}
    <div class="j-hstack">
      ${ui.button({ id: 'pl-apply', label: tUI('plApply'), size: 'sm', onclick: 'gpuPowerLimitApply()' })}
      ${ui.button({ id: 'pl-reset', label: tUI('plReset'), size: 'sm', onclick: 'gpuPowerLimitReset()' })}
      ${ui.badge(changed ? tUI('plCustom') : tUI('plStock'), changed ? 'accent' : 'neutral')}
    </div>
    <div class="j-muted j-settings-hint">${tUI('plPolicy')}:
      <span class="j-seg">${['session', 'persist'].map(v => html`<button type="button" data-plpolicy="${v}" class="${ui.cls('j-seg-item', (settings.gpuPowerLimitPolicy || 'session') === v && 'j-seg-active')}" onclick="gpuPowerLimitPolicy('${v}')">${tUI('plPolicy_' + v)}</button>`)}</span>
    </div>
    <div id="pl-msg" class="j-muted j-settings-hint" aria-live="polite"></div>`)
  const range = box.querySelector('#pl-range'), out = box.querySelector('#pl-out')
  range.oninput = () => { out.textContent = range.value + ' W' }
  box._pl = st
}

async function gpuPowerLimitApply() {
  const box = document.getElementById('gpu-power-limit'), st = box && box._pl
  if (!st) return
  const watts = Number(document.getElementById('pl-range').value)
  let confirmAboveDefault = false
  if (watts > st.default) {
    try { await showConfirm({ title: tUI('plAboveTitle'), body: escHtml(tUI('plAboveBody').replace('{w}', watts).replace('{d}', st.default)), okText: tUI('plApply'), okStyle: 'warning' }); confirmAboveDefault = true } catch { return }
  }
  const msg = document.getElementById('pl-msg')
  const r = await api.gpuPowerLimitSet({ watts, confirmAboveDefault })
  if (r && r.ok) { try { JylliSound.play('apply') } catch {} toast(tUI('plDone').replace('{w}', r.after), '', 'ok'); gpuPowerLimitRender(box) }
  else { try { JylliSound.play('warning') } catch {} if (msg) msg.textContent = tUI('plErr_' + ((r && r.reason) || 'write-failed')) || tUI('plErr_write-failed') }
}

async function gpuPowerLimitReset() {
  const box = document.getElementById('gpu-power-limit')
  const r = await api.gpuPowerLimitReset()
  if (r && r.ok) { toast(tUI('plResetDone'), '', 'ok'); gpuPowerLimitRender(box) }
  else { const msg = document.getElementById('pl-msg'); if (msg) msg.textContent = tUI('plErr_' + ((r && r.reason) || 'write-failed')) }
}

function gpuPowerLimitPolicy(v) {
  settings.gpuPowerLimitPolicy = v === 'persist' ? 'persist' : 'session'
  api.saveSettings(settings)
  document.querySelectorAll('[data-plpolicy]').forEach(b => b.classList.toggle('j-seg-active', b.dataset.plpolicy === settings.gpuPowerLimitPolicy))
}
