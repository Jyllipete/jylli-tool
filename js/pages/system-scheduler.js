'use strict'
// System > Scheduler: create scheduled maintenance tasks and manage the active ones (list rendering lives in index.html).
async function buildScheduler(c) {
  if (!settings.isPremium) { await buildPremiumBanner(c, 'scheduler'); return }
  const { html } = ui
  const field = (labelKey, control, id) => html`<div class="j-field" ${ui.raw(id ? `id="${id}"` : '')}><label class="j-field-label">${tUI(labelKey)}</label>${control}</div>`
  const opt = (v, key) => html`<option value="${v}">${tUI(key)}</option>`
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  c.innerHTML = String(html`
    ${ui.card({
      title: html`<i class="fa fa-clock" aria-hidden="true"></i> ${tUI('schedHeroTitle')}`,
      sub: tUI('schedHeroSub'),
      body: html`<div class="j-sched-form">
        <div class="j-sched-grid">
          ${field('schedTaskLabel', html`<select class="j-select styled-select" id="sched-action" onchange="schedUpdateActionDesc()">
            <optgroup label="${tUI('schedCatCleaning')}">${opt('clean-temp', 'schedOptCleanTemp')}${opt('clean-nvidia', 'schedOptNvidiaCache')}${opt('clean-downloads', 'schedClearDownloads')}</optgroup>
            <optgroup label="${tUI('schedCatPerformance')}">${opt('defrag-c', 'schedOptDefrag')}${opt('clean-ram', 'schedFreeRam')}</optgroup>
            <optgroup label="${tUI('schedCatSystem')}">${opt('flush-dns', 'schedOptFlushDns')}${opt('windows-update', 'schedCheckUpdates')}</optgroup>
          </select><div class="sched-action-desc j-field-hint" id="sched-action-desc"></div>`)}
          ${field('schedWhenLabel', html`<select class="j-select styled-select" id="sched-when" onchange="schedUpdateWhenRows()">
            ${opt('startup', 'schedOptStartup')}${opt('logon', 'schedOptLogin')}${opt('hourly', 'schedOptHourly')}${opt('daily-3am', 'schedOptDaily')}${opt('daily-custom', 'schedOptDailyCustom')}${opt('weekly-sun', 'schedOptWeekly')}${opt('weekly-custom', 'schedOptWeeklyCustom')}
          </select>`)}
        </div>
        <div class="sched-time-row" id="sched-time-row">${field('schedTimeLabel', html`<input type="time" class="j-input styled-select" id="sched-time" value="03:00">`)}</div>
        <div class="sched-day-row" id="sched-day-row">${field('schedDayLabel', html`<div class="j-hstack j-wrap">${days.map((d, i) => html`<button type="button" class="${ui.cls('j-btn j-btn-sm sched-day-chip', i === 0 && 'sched-day-active')}" data-day="${dayNames[i]}" onclick="schedSelectDay(this)">${tUI('schedOpt' + d)}</button>`)}</div>`)}</div>
        ${field('schedLabelLabel', html`<input type="text" class="j-input styled-select" id="sched-label" placeholder="${tUI('schedLabelPlaceholder')}" maxlength="255">`)}
        <div class="j-sched-submit">${ui.button({ label: tUI('schedAdd'), variant: 'primary', onclick: 'doScheduleTask()' })}</div>
      </div>`,
    })}
    ${ui.card({
      title: tUI('schedActiveTasks'),
      flush: true,
      body: html`<div class="sched-bulk-bar j-hstack" id="sched-bulk-bar" style="display:none">
        ${ui.button({ label: tUI('schedBulkEnableAll'), icon: 'circle-check', size: 'sm', onclick: 'schedBulkToggle(true)' })}
        ${ui.button({ label: tUI('schedBulkDisableAll'), icon: 'ban', size: 'sm', onclick: 'schedBulkToggle(false)' })}
        ${ui.button({ label: tUI('schedBulkDeleteAll'), icon: 'trash', size: 'sm', variant: 'danger', onclick: 'schedBulkDelete()' })}
      </div>
      <div id="sched-task-list" class="j-muted j-sched-loading">${tUI('schedLoading')}</div>`,
    })}`)

  c.appendChild(makeTip(tUI('schedTip'), 'info'))

  schedUpdateActionDesc()
  loadScheduledTasks()
  registerPageCleanup('scheduler', () => {
    if (window._schedTicker) { clearInterval(window._schedTicker); window._schedTicker = null }
  })
}
