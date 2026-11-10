'use strict'
// Gaming > Latency: verdict hero (kit), live DPC/ISR charts, spike log and guidance. Element ids used by the polling code are kept:
// #canvas-dpc, #canvas-isr, #dpc-spike-log. The hero is fed by pollLatency() through window._latHero / window._latHeroFail.
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
    <div class="tk-hero" id="lat-hero-host"></div>
    ${ui.card({ title: tUI('latencyTitle'), sub: tUI('latencySubtitle'), body: html`
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

  // ── Hero: the one number that matters (DPC + ISR share of CPU time), its verdict, and the peaks ──
  const T = (k, v) => tG('latHero', k, v)
  const hero = JylliHero.mount(c.querySelector('#lat-hero-host'), {
    id: 'lat-hero', eyebrow: T('waiting'), title: T('title'), lead: T('waitingLead'), dial: { label: 'DPC + ISR', unit: '%' },
    stats: [{ k: 'dpc', label: T('statDpc') }, { k: 'isr', label: T('statIsr') }, { k: 'timer', label: T('statTimer') }],
  })
  hero.scanning(true)
  hero.update({ value: '–', tone: 'idle' })
  let fails = 0
  window._latHero = (dpc, isr, dpcPeak, isrPeak, timerUs, text, sub, combined) => {
    fails = 0
    hero.scanning(false)
    hero.update({
      value: combined.toFixed(2), tone: combined < 1 ? 'ok' : combined < 3 ? 'warn' : 'danger',
      eyebrow: text, lead: sub,
      stats: { dpc: dpcPeak.toFixed(2) + '%', isr: isrPeak.toFixed(2) + '%', timer: timerUs > 0 ? timerUs.toFixed(0) + ' µs' : '–' },
    })
  }
  // A sampler that keeps failing is an error, not a calm zero: say so and offer Retry
  window._latHeroFail = () => {
    if (++fails < 3) return
    hero.scanning(false)
    hero.update({ value: '–', tone: 'idle', eyebrow: T('failed'), lead: T('failedLead') })
  }
  registerPageCleanup('latency-monitor', () => { window._latHero = null; window._latHeroFail = null; hero.destroy() })

  _latencyHistory.dpc = []
  _latencyHistory.isr = []
  if (typeof renderSpikeLog === 'function' && _dpcSpikeLog.length) renderSpikeLog()
  startLatencyPolling()
}
