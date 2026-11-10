'use strict'
// System > Scheduler: hero (task count, paused, next run), the create form and the active tasks (list rendering lives in index.html).

/** tasks: [{ TaskName, Description, State, NextRunTime }] -> { total, active, paused, next: { name, at } | null }. Disabled tasks never count as "next". */
function schedSummary(tasks, now = Date.now()) {
  const list = Array.isArray(tasks) ? tasks : []
  const isOff = t => String(t.State || '').toLowerCase() === 'disabled'
  const active = list.filter(t => !isOff(t))
  let next = null
  for (const t of active) {
    const at = t.NextRunTime ? new Date(t.NextRunTime).getTime() : NaN
    if (Number.isNaN(at)) continue
    if (!next || at < next.at) next = { name: (t.Description && String(t.Description).trim()) || String(t.TaskName || '').replace(/^JT_/, ''), at }
  }
  return { total: list.length, active: active.length, paused: list.length - active.length, next, overdue: !!(next && next.at <= now) }
}
async function buildScheduler(c) {
  if (!settings.isPremium) { await JylliPremium.build(c, 'scheduler'); return }
  const { html } = ui
  const field = (labelKey, control, id) => html`<div class="j-field" ${ui.raw(id ? `id="${id}"` : '')}><label class="j-field-label">${tUI(labelKey)}</label>${control}</div>`
  const opt = (v, key) => html`<option value="${v}">${tUI(key)}</option>`
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  c.innerHTML = String(html`
    <div class="tk-hero" id="sched-hero-host"></div>
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

  const T = (k, v) => tG('schedx', k, v)
  const hero = JylliHero.mount(c.querySelector('#sched-hero-host'), {
    id: 'sched-hero', eyebrow: T('loading'), title: tUI('schedHeroTitle'), lead: tUI('schedHeroSub'), dial: { label: T('dial'), unit: '' },
    stats: [{ k: 'active', label: T('statActive') }, { k: 'paused', label: T('statPaused') }, { k: 'next', label: T('statNext') }],
  })
  hero.scanning(true); hero.update({ value: '–', tone: 'idle' })
  window._schedHero = tasks => {
    hero.scanning(false)
    if (!Array.isArray(tasks)) { hero.update({ value: '–', tone: 'idle', eyebrow: T('failed'), stats: { active: '–', paused: '–', next: '–' } }); return }
    const s = schedSummary(tasks)
    hero.update({
      value: String(s.total), tone: s.total ? 'accent' : 'idle',
      eyebrow: s.total === 0 ? T('none') : s.next ? T('nextUp', { name: s.next.name }) : T('noneActive'),
      stats: { active: s.active, paused: s.paused, next: s.next ? (schedFormatCountdown(new Date(s.next.at).toISOString()) || '–') : '–' },
    })
  }

  schedUpdateActionDesc()
  loadScheduledTasks()
  registerPageCleanup('scheduler', () => {
    window._schedHero = null; hero.destroy()
    if (window._schedTicker) { clearInterval(window._schedTicker); window._schedTicker = null }
  })
}

if (typeof module !== 'undefined' && module.exports) module.exports = { schedSummary }
