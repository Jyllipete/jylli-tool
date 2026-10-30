'use strict'
// System > Diagnostics: pre-flight scan, driver update check and benchmark. Element ids used by the scan code are kept:
// #pf-scan-btn #pf-status #pf-scan-bar #pf-results #driver-scan-btn #driver-status #driver-last-scan #driver-results
// #bench-run-btn #bench-status #bench-progress #bench-bar #bench-results.
function buildPreflight(c) {
  const { html, raw } = ui
  c.innerHTML = String(html`
    <p class="j-lede">${tUI('preflightHeroSub')}</p>
    <div class="j-toolbar j-diag-bar">
      ${ui.button({ label: tUI('preflightRunScan'), icon: 'magnifying-glass', variant: 'primary', id: 'pf-scan-btn', onclick: 'runPreflightScan(this)' })}
      <span id="pf-status" class="j-muted">${tUI('preflightReady')}</span>
    </div>
    <div class="pf-scan-bar-wrap"><div id="pf-scan-bar"></div></div>
    <div id="pf-results"></div>
    <div class="j-gap"></div>
    ${ui.card({ title: tUI('pfDriverTitle'), sub: tUI('pfDriverDesc'), body: html`
      <div class="j-toolbar">
        ${ui.button({ label: tUI('pfDriverScanBtn'), icon: 'magnifying-glass', size: 'sm', id: 'driver-scan-btn', onclick: 'doDriverScan()' })}
        <span id="driver-status" class="j-muted">${tUI('pfDriverReady')}</span>
        <span id="driver-last-scan" class="j-muted j-push"></span>
      </div>
      <div id="driver-results"></div>` })}
    <div class="j-gap"></div>
    ${ui.card({ title: tUI('pfBenchTitle'), sub: tUI('pfBenchDesc'), body: html`
      <div class="j-toolbar">
        ${ui.button({ label: tUI('pfBenchRunBtn'), icon: 'play', size: 'sm', id: 'bench-run-btn', onclick: 'doBenchmark()' })}
        <span id="bench-status" class="j-muted">${tUI('pfBenchTime')}</span>
      </div>
      <div id="bench-progress" style="display:none"><div class="j-meter"><span id="bench-bar" style="width:0%"></span></div></div>
      <div id="bench-results"></div>` })}`)

  // Pre-populate last-scan timestamp from localStorage if available
  const ts = parseInt(localStorage.getItem('pf_driver_scan_ts') || '0')
  if (ts > 0) {
    const min = Math.round((Date.now() - ts) / 60000)
    const label = min < 60 ? `${min}m` : `${Math.round(min / 60)}h`
    const el = document.getElementById('driver-last-scan')
    if (el) el.textContent = tUI('pfDriverLastScan').replace('{t}', label)
  }
}
