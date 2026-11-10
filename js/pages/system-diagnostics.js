'use strict'
// System > Diagnostics: pre-flight scan, driver update check and benchmark. Element ids used by the scan code are kept:
// #pf-scan-btn #pf-status #pf-scan-bar #pf-results #driver-scan-btn #driver-status #driver-last-scan #driver-results
// #bench-run-btn #bench-status #bench-progress #bench-bar #bench-results.
function buildPreflight(c) {
  const { html, raw } = ui
  c.innerHTML = String(html`
    <div class="tk-hero" id="pf-hero-host"></div>
    <div class="j-toolbar j-diag-bar" data-tour="diagnostics-scan">
      <span id="pf-status" class="j-muted">${tUI('preflightReady')}</span>
    </div>
    <div class="pf-scan-bar-wrap"><div id="pf-scan-bar"></div></div>
    <div id="pf-results" data-tour="diagnostics-results"></div>
    <div class="j-gap"></div>
    ${ui.card({ title: tUI('pfDriverTitle'), sub: tUI('pfDriverDesc'), body: html`
      <div class="j-toolbar" data-tour="diagnostics-drivers">
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

  // ── Hero: the safety score of the last scan (kept between visits, with its age) and the one Scan action ──
  const T = (k, v) => tG('pfHero', k, v)
  const hero = JylliHero.mount(c.querySelector('#pf-hero-host'), {
    id: 'pf-hero', eyebrow: '', title: T('title'), lead: tUI('preflightHeroSub'), dial: { label: T('dial'), unit: '/100' },
    stats: [{ k: 'os', label: T('statOs') }, { k: 'conf', label: T('statConf') }, { k: 'active', label: T('statActive') }],
    cta: { id: 'pf-scan-btn', icon: 'magnifying-glass', label: tUI('preflightRunScan'), onClick: () => runPreflightScan(document.getElementById('pf-scan-btn')) },
  })
  const paint = s => {
    if (!s) { hero.update({ value: '–', tone: 'idle', eyebrow: T('never'), stats: { os: '–', conf: '–', active: '–' }, cta: { label: tUI('preflightRunScan') } }); return }
    hero.update({
      value: String(s.score), tone: JylliHero.tone(s.score),
      eyebrow: T('last', { t: _rpRelAge(Math.max(0, Date.now() - s.ts)) }),
      stats: { os: s.os, conf: s.conflicts, active: s.active },
      cta: { label: tUI('pfBtnRerun'), icon: 'arrows-rotate' },
    })
  }
  let saved = null
  try { saved = JSON.parse(localStorage.getItem('pf_summary') || 'null') } catch { saved = null }
  paint(saved && typeof saved.score === 'number' ? saved : null)
  window._pfHero = result => {
    const s = { score: result.safetyScore, os: result.osType, conflicts: (result.conflicts || []).length, active: Object.values(result.tweakStates || {}).filter(Boolean).length, ts: Date.now() }
    try { localStorage.setItem('pf_summary', JSON.stringify(s)) } catch { /* storage blocked: the hero still updates */ }
    hero.scanning(false); paint(s)
  }
  window._pfHeroScanning = on => hero.scanning(on)
  registerPageCleanup('preflight', () => { window._pfHero = null; window._pfHeroScanning = null; hero.destroy() })

  // Pre-populate last-scan timestamp from localStorage if available
  const ts = parseInt(localStorage.getItem('pf_driver_scan_ts') || '0')
  if (ts > 0) {
    const min = Math.round((Date.now() - ts) / 60000)
    const label = min < 60 ? `${min}m` : `${Math.round(min / 60)}h`
    const el = document.getElementById('driver-last-scan')
    if (el) el.textContent = tUI('pfDriverLastScan').replace('{t}', label)
  }
}
