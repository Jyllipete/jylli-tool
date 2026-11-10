'use strict'
// Gaming > Latency: live DPC/ISR monitor, spike log and guidance. Element ids used by the polling code are kept:
// #lat-{dpc,isr}-{card,val,peak}, #lat-timer-{val,sub}, #lat-status-{val,sub}, #canvas-dpc, #canvas-isr, #dpc-spike-log.
async function buildLatencyMonitor(c) {
  if (!settings.isPremium) { await JylliPremium.build(c, 'latency'); return }
  const { html, raw } = ui
  const tile = (label, valId, subId, sub, cardId, small) => html`<div class="j-stat j-lat-tile" ${raw(cardId ? `id="${cardId}"` : '')}>
    <div class="j-stat-label">${label}</div>
    <div class="j-stat-value ${small ? 'j-lat-small' : ''}" id="${valId}">—</div>
    <div class="j-stat-sub" id="${subId}">${sub}</div></div>`
  const chart = (label, id) => html`<div class="j-lat-chart"><span class="j-lat-chart-label">${label}</span><div class="j-lat-canvas"><canvas id="${id}"></canvas></div></div>`
  const dot = (tone, text) => html`<li><span class="j-lat-dot ${tone}"></span><span>${text}</span></li>`

  c.innerHTML = String(html`
    <p class="j-lede">${tUI('latencySubtitle')}</p>
    ${ui.card({ title: tUI('latencyTitle'), body: html`
      <div class="j-lat-tiles">
        ${tile('DPC %', 'lat-dpc-val', 'lat-dpc-peak', 'Peak: —', 'lat-dpc-card')}
        ${tile('ISR %', 'lat-isr-val', 'lat-isr-peak', 'Peak: —', 'lat-isr-card')}
        ${tile('Timer Resolution', 'lat-timer-val', 'lat-timer-sub', 'Current (µs)')}
        ${tile('Status', 'lat-status-val', 'lat-status-sub', '—', null, true)}
      </div>
      ${chart('DPC', 'canvas-dpc')}${chart('ISR', 'canvas-isr')}` })}
    <div class="j-gap"></div>
    ${ui.card({ title: tUI('latencySpikeLogTitle'), sub: tUI('latencySpikeLogDesc'),
      actions: html`${ui.button({ label: tUI('latencySpikeExport'), icon: 'file-export', variant: 'ghost', size: 'sm', onclick: 'exportSpikeLog()' })}${ui.button({ icon: 'trash', iconOnly: true, variant: 'ghost', size: 'sm', title: tUI('abDelete'), onclick: 'clearSpikeLog()' })}`,
      body: html`<div id="dpc-spike-log" class="j-lat-log"><div class="j-lat-log-empty">${tUI('latencySpikeLogEmpty')}</div></div>` })}
    <div class="j-gap"></div>
    <div class="j-lat-two">
      ${ui.card({ title: tUI('latencyWhatTitle'), body: html`<ul class="j-lat-list">${dot('good', tUI('latencyRow1'))}${dot('warn', tUI('latencyRow2'))}${dot('bad', tUI('latencyRow3'))}${dot('', tUI('latencyRow4'))}</ul>` })}
      ${ui.card({ title: tUI('latencyFixTitle'), body: html`<ul class="j-lat-list j-lat-fixes">${[1, 2, 3, 4].map(n => html`<li><i class="fa fa-arrow-right" aria-hidden="true"></i><span>${tUI('latencyFix' + n)}</span></li>`)}</ul>` })}
    </div>`)

  _latencyHistory.dpc = []
  _latencyHistory.isr = []
  startLatencyPolling()
}
