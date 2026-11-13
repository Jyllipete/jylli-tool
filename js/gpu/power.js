'use strict'
// GPU tab, the power card: live draw against the limit, and the one GPU write the app offers (NVIDIA desktop power limit). The rules live in
// lib/gpu-power-limit.js and main.js (integer watts inside the driver's range, above-default needs a confirmation, read back after the write,
// thermal guard, restored on quit unless "keep"). This card only shows them and asks. Free users see the numbers; changing the limit is Premium.
;(function (root) {
  const api = { mount() { return null } }
  root.JylliGpuPower = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  const WHY = { laptop: 'plWhyLaptop', 'no-nvidia-gpu': 'plWhyNoNvidia', 'form-factor-unknown': 'plWhyForm', 'limits-unavailable': 'plWhyLimits', 'limits-inconsistent': 'plWhyLimits' }

  function mount(card, ctx) {
    const { T, esc, ui, S, root: R } = ctx
    let st = null, busy = false, msg = '', liveW = null, gone = false

    function paintLive() {
      const el = card.querySelector('[data-live]')
      if (!el || !st || !st.supported) return
      el.textContent = liveW == null ? '–' : Math.round(liveW) + ' W'
      const bar = card.querySelector('[data-pbar]')
      if (bar && liveW != null) bar.style.setProperty('--p', Math.max(0, Math.min(100, liveW / st.max * 100)))
    }
    function paint() {
      const head = `<header class="nt-card-h"><div><b>${esc(ui('plTitle'))}</b><span>${esc(st && st.name ? st.name : T('pwrSub'))}</span></div>${st && st.supported ? `<span class="nt-chip-s${st.current !== st.default ? ' rec' : ''}">${esc(ui(st.current !== st.default ? 'plCustom' : 'plStock'))}</span>` : ''}</header>`
      if (!st) { card.innerHTML = head + `<div class="gp-sk"></div>`; return }
      if (st.error) { card.innerHTML = head + `<p class="gp-note">${esc(ui('plUnavailable'))}</p>`; return }
      if (!st.supported) { card.innerHTML = head + `<p class="gp-note"><i class="fa fa-circle-info" aria-hidden="true"></i>${esc(ui(WHY[st.reason] || 'plUnsupported'))}</p>`; return }
      const cur = st.current
      const free = !S.premium
      card.innerHTML = head + `<p class="gp-note">${esc(ui('plDesc'))}</p>
        <div class="gp-pwr"><div class="gp-pwr-now"><span>${esc(T('pwrNow'))}</span><b class="mono" data-live>–</b></div><div class="gp-pwr-track" aria-hidden="true"><i data-pbar style="--p:0"></i><u style="left:${Math.round((st.default - st.min) / (st.max - st.min) * 100)}%"></u></div></div>
        <div class="gp-pl-row"><input type="range" data-range min="${st.min}" max="${st.max}" step="1" value="${cur}" aria-label="${esc(ui('plTitle'))}"${free || busy ? ' disabled' : ''}><output class="mono" data-out>${cur} W</output></div>
        <div class="gp-pl-scale mono"><span>${st.min} W</span><span>${esc(ui('plDefault'))}: ${st.default} W</span><span>${st.max} W</span></div>
        ${st.needsAdmin ? `<p class="gp-warn"><i class="fa fa-triangle-exclamation" aria-hidden="true"></i>${esc(ui('plNeedsAdmin'))} <a href="#" data-admin>${esc(ui('dashRelaunchAdmin'))}</a></p>` : ''}
        <div class="nt-actions">${free
    ? `<button type="button" class="nt-sec" data-p="premium"><i class="fa fa-crown" aria-hidden="true"></i>${esc(T('unlock'))}</button>`
    : `<button type="button" class="nt-cta" data-p="apply"${busy ? ' disabled' : ''}>${esc(ui('plApply'))}</button><button type="button" class="nt-sec" data-p="reset"${busy || cur === st.default ? ' disabled' : ''}>${esc(ui('plReset'))}</button>`}</div>
        <div class="gp-pl-pol"><span>${esc(ui('plPolicy'))}</span><span class="j-seg">${['session', 'persist'].map(v => `<button type="button" data-pol="${v}" class="j-seg-item${(R.settings.gpuPowerLimitPolicy || 'session') === v ? ' j-seg-active' : ''}">${esc(ui('plPolicy_' + v))}</button>`).join('')}</span></div>
        <p class="gp-note" data-msg aria-live="polite">${esc(msg)}</p>`
      const range = card.querySelector('[data-range]'), out = card.querySelector('[data-out]')
      if (range) range.oninput = () => { out.textContent = range.value + ' W' }
      paintLive()
    }
    async function refresh() {
      let r = null
      try { r = await R.api.gpuPowerLimitGet() } catch (e) { r = null }
      if (gone) return
      st = r || { error: true }
      paint()
    }
    async function apply() {
      const range = card.querySelector('[data-range]'); if (!st || !range) return
      const watts = Number(range.value)
      let above = false
      if (watts > st.default) {
        try { await R.showConfirm({ title: ui('plAboveTitle'), body: esc(ui('plAboveBody').replace('{w}', watts).replace('{d}', st.default)), okText: ui('plApply'), okStyle: 'warning' }); above = true } catch (e) { return }
      }
      busy = true; msg = ''; paint()
      const r = await R.api.gpuPowerLimitSet({ watts, confirmAboveDefault: above })
      busy = false
      if (r && r.ok) { try { R.JylliSound.play('apply') } catch (e) { /* no sound */ } ctx.toast(ui('plDone').replace('{w}', r.after), '', 'ok'); msg = ''; ctx.rescan() }
      else { try { R.JylliSound.play('warning') } catch (e) { /* no sound */ } msg = ui('plErr_' + ((r && r.reason) || 'write-failed')) || ui('plErr_write-failed'); if (r && r.reason === 'premium_required' && R.JylliPremium) R.JylliPremium.open() }
      await refresh()
    }
    async function reset() {
      busy = true; paint()
      const r = await R.api.gpuPowerLimitReset()
      busy = false
      if (r && r.ok) { ctx.toast(ui('plResetDone'), '', 'ok'); msg = ''; ctx.rescan() } else msg = ui('plErr_' + ((r && r.reason) || 'write-failed'))
      await refresh()
    }
    card.addEventListener('click', e => {
      const a = e.target.closest('[data-p],[data-pol],[data-admin]'); if (!a) return
      if (a.dataset.admin !== undefined) { e.preventDefault(); R.api.relaunchAdmin(); return }
      if (a.dataset.pol) { R.settings.gpuPowerLimitPolicy = a.dataset.pol === 'persist' ? 'persist' : 'session'; R.api.saveSettings(R.settings); card.querySelectorAll('[data-pol]').forEach(b => b.classList.toggle('j-seg-active', b.dataset.pol === R.settings.gpuPowerLimitPolicy)); return }
      if (a.dataset.p === 'apply') apply(); else if (a.dataset.p === 'reset') reset(); else if (a.dataset.p === 'premium' && R.JylliPremium) R.JylliPremium.open()
    })
    paint(); refresh()
    return { refresh, paint, update(frame) { liveW = frame && frame.smi && frame.smi.power != null ? frame.smi.power : frame && frame.sensor && frame.sensor.power != null ? frame.sensor.power : null; paintLive() }, destroy() { gone = true; card.innerHTML = '' } }
  }

  api.mount = mount
})(typeof window !== 'undefined' ? window : globalThis)
