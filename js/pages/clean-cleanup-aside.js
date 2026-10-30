'use strict'
// Clean > Cleanup side cards. Ids used by loadDiskUsage / loadPhantomApps / loadCleanupTimeline are kept:
// #disk-usage-results #phantom-scan-btn #phantom-results #timeline-refresh-btn #timeline-results.
// Each function returns a DOM element (the Cleanup builder appends it).
function _asideCard({ icon, title, sub, button, body }) {
  const { html } = ui
  const wrap = document.createElement('div')
  wrap.innerHTML = String(ui.card({ title: html`<span class="j-aside-ico"><i class="fa fa-${icon}" aria-hidden="true"></i></span>${title}`, sub, actions: button, body }))
  return wrap.firstElementChild
}

function _buildDiskUsageCard() {
  const { html } = ui
  return _asideCard({ icon: 'chart-bar', title: tUI('diskUsageTitle'), sub: tUI('diskUsageSub'),
    button: ui.button({ label: tUI('diskUsageScan'), icon: 'magnifying-glass', size: 'sm', onclick: 'loadDiskUsage(this)' }),
    body: html`<div id="disk-usage-results" style="display:none"></div>` })
}

function _buildPhantomCard() {
  const { html } = ui
  return _asideCard({ icon: 'ghost', title: tUI('phantomTitle'), sub: tUI('phantomSub'),
    button: ui.button({ label: tUI('phantomScan'), icon: 'magnifying-glass', size: 'sm', id: 'phantom-scan-btn', onclick: 'loadPhantomApps(this)' }),
    body: html`<div id="phantom-results" style="display:none"></div>` })
}

function _buildTimelineCard() {
  const { html } = ui
  return _asideCard({ icon: 'chart-line', title: tUI('timelineTitle'), sub: tUI('timelineSub'),
    button: ui.button({ label: tUI('timelineRefresh'), icon: 'rotate', size: 'sm', id: 'timeline-refresh-btn', onclick: 'loadCleanupTimeline(this)' }),
    body: html`<div id="timeline-results">${ui.spinner(tUI('timelineLoading'))}</div>` })
}
