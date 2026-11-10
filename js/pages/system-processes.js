'use strict'
// System > Processes: CPU hog rail (ProcessFreeze) and the live process table.
// The data/logic (loadProcesses, sortProcesses, filterProcesses, freeze handlers) stays in index.html; this file owns the markup.

function buildProcessManager(c) {
  const { html } = ui
  const th = (key, labelKey, width) => html`<th id="th-${key}" class="j-sortable" ${ui.raw(width ? `style="width:${width}px"` : '')} onclick="sortProcesses('${key}')">${tUI(labelKey)}<span class="sort-arrow" id="sa-${key}">▼</span></th>`
  c.innerHTML = String(html`
    ${ui.card({
      title: html`<i class="fa fa-snowflake" aria-hidden="true"></i> ${tG('procx', 'hogTitle')}`,
      sub: tG('procx', 'hogSub'),
      body: html`<div id="pf-hog-cards" class="j-hog-cards"><div class="j-muted">${tUI('pmScanning')}</div></div>
        <div id="pf-session-report" class="j-callout j-callout-ok" style="display:none"></div>`,
      id: 'pf-hog-rail',
    })}
    ${ui.card({
      title: tUI('pmRunningProcesses'),
      actions: html`<input id="proc-filter" class="j-input" type="text" placeholder="${tUI('pmFilter')}" oninput="filterProcesses(this.value)">${ui.button({ label: tUI('startupRefresh'), icon: 'arrows-rotate', size: 'sm', onclick: 'loadProcesses(this)' })}<span id="proc-count" class="j-muted"></span>`,
      flush: true,
      body: html`<div class="j-table-wrap j-proc-wrap"><table class="process-table j-table" id="proc-table">
        <thead><tr>${th('name', 'pmColProcess')}${th('cpu', 'pmColCpu', 110)}${th('ram', 'pmColRam', 130)}<th style="width:60px">${tUI('pmColPid')}</th><th style="width:44px"></th></tr></thead>
        <tbody id="proc-tbody"><tr><td colspan="5" class="j-center j-muted">${tUI('pmLoading')}</td></tr></tbody>
      </table></div>`,
    })}`)

  loadProcesses()
  startPfHogRail()

}

// One card of the hog rail. `frozen` cards get the info tone; `savings` is already formatted text or ''.
function pfHogCardHtml(p, frozen, savings) {
  const { html } = ui
  return String(html`<div class="${ui.cls('j-hog', frozen && 'j-hog-frozen')}">
    <div class="j-hog-name" title="${p.Name}">${p.Name}</div>
    <div class="j-hog-sub">${frozen ? html`<span class="j-hog-state">❄ ${tUI('pmFrozen')}</span>` : `CPU ${p.CPU?.toFixed(1) || '0.0'}%`}${savings}</div>
    <button class="j-btn j-btn-sm" type="button" onclick="pfToggleFreeze(${Number(p.Id) || 0},${ui.raw(jsArg(p.Name))},${Number(p.CPU) || 0})"><i class="fa ${frozen ? 'fa-play' : 'fa-snowflake'}" aria-hidden="true"></i>${frozen ? tUI('pmDefrost') : tUI('pmFreeze')}</button>
  </div>`)
}

function renderProcessTable(data) {
  const { html } = ui
  const tbody = document.getElementById('proc-tbody')
  if (!tbody) return
  const sorted = [...data].sort((a, b) => {
    const va = procSort.key === 'name' ? (a.Name || '') : procSort.key === 'cpu' ? (a.CPU || 0) : (a.RAM || 0)
    const vb = procSort.key === 'name' ? (b.Name || '') : procSort.key === 'cpu' ? (b.CPU || 0) : (b.RAM || 0)
    return procSort.key === 'name' ? va.localeCompare(vb) * procSort.dir : (va - vb) * procSort.dir
  })
  const maxRam = Math.max(...sorted.map(p => p.RAM || 0), 1)
  const maxCpu = Math.max(...sorted.map(p => p.CPU || 0), 1)
  tbody.innerHTML = sorted.slice(0, 60).map(p => {
    const ramPct = Math.round((p.RAM || 0) / maxRam * 100)
    const cpuPct = Math.min(100, Math.round((p.CPU || 0) / maxCpu * 100))
    const ramTone = ramPct > 70 ? 'danger' : ramPct > 40 ? 'warn' : 'accent'
    return String(html`<tr>
      <td>${p.Name || '?'}</td>
      <td class="cpu-bar-cell">${ui.meter(cpuPct)}<div class="j-proc-val j-num">${p.CPU || 0}%</div></td>
      <td>${ui.meter(ramPct, ramTone)}<div class="j-proc-val j-num">${(p.RAM || 0).toFixed(0)} MB</div></td>
      <td class="j-num j-muted">${p.Id || '?'}</td>
      <td><button class="kill-btn j-btn j-btn-ghost j-btn-icon j-btn-sm" type="button" aria-label="${tG('procx', 'kill')}" onclick="doKillProcess(${Number(p.Id) || 0},${ui.raw(jsArg(String(p.Name || '')))})"><i class="fa fa-xmark" aria-hidden="true"></i></button></td>
    </tr>`)
  }).join('')
  _updateSortIndicators()
}
