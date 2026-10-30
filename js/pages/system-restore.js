'use strict'
// System > Restore points. Ids and rp-v2-* classes that loadRPList/loadRPDiskUsage/rpSelectRow/doCreateRP touch are kept.
function buildRestorePoints(c) {
  const { html, raw } = ui
  const autoSnapshotDays = settings.autoSnapshotDays || '0'
  const lastAuto = settings.lastAutoSnapshot ? new Date(settings.lastAutoSnapshot).toLocaleString() : tUI('rpLastAutoNever')
  const rpDefaultDesc = `JylliTool_Manual_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`
  const stat = (id, label) => html`<div class="j-stat j-rp-stat" id="${id}"><div class="j-stat-label">${label}</div><div class="j-stat-value"><span class="rp-v2-stat-pill__value" data-v>—</span></div></div>`
  const chips = [['0', 'rpScheduleOff'], ['1', 'rpScheduleDay'], ['3', 'rpSchedule3Days'], ['7', 'rpScheduleWeek']]
  const cards = LANG[currentLang]?.rpCards || LANG.en.rpCards

  c.innerHTML = String(html`
    <div id="rp-admin-banner" class="j-callout j-callout-danger j-rp-banner" role="alert" style="display:none"><i class="fa fa-shield-exclamation" aria-hidden="true"></i><div class="j-grow">${tUI('rpAdminWarn')}</div>${ui.button({ label: tUI('rpRelaunchAdmin'), variant: 'danger', size: 'sm', onclick: 'api.relaunchAdmin()' })}</div>
    <div id="rp-stale-banner" class="j-callout j-callout-warn j-rp-banner" role="status" style="display:none"><i class="fa fa-clock-rotate-left" aria-hidden="true"></i><div class="j-grow">${tUI('rpStaleWarn')}</div>${ui.button({ label: tUI('rpCreate'), variant: 'ghost', size: 'sm', onclick: 'doCreateRP()' })}</div>

    ${ui.card({ title: tUI('rpHeroTitle'), sub: tUI('rpHeroDesc'), body: html`
      <div class="j-rp-stats">${stat('rp-stat-count', tUI('rpStatSnapshots'))}${stat('rp-stat-disk', tUI('rpStatDisk'))}${stat('rp-stat-age', tUI('rpStatLatest'))}</div>
      <div class="rp-v2-create-input-wrap j-rp-create">
        <label class="j-search"><i class="fa fa-tag" aria-hidden="true"></i><input type="text" class="j-input" id="rp-desc" value="${rpDefaultDesc}" placeholder="${tUI('rpDescPlaceholder')}" aria-label="${tUI('rpDescPlaceholder')}"></label>
        ${ui.button({ label: tUI('rpCreate'), icon: 'shield-halved', variant: 'primary', id: 'rp-create-btn', onclick: 'doCreateRP()' })}
      </div>
      <div class="j-rp-meta"><span class="rp-v2-status j-muted" id="rp-status">${tUI('rpNoSession')}</span>${ui.button({ label: tUI('rpEnableSR'), icon: 'power-off', variant: 'ghost', size: 'sm', onclick: 'rpEnableSR()' })}</div>` })}

    <div class="j-rp-body">
      <div class="j-rp-main">
        <div class="j-toolbar">
          ${ui.button({ label: tUI('rpRefresh'), icon: 'arrows-rotate', variant: 'ghost', size: 'sm', id: 'rp-refresh-btn', onclick: 'loadRPList()' })}
          ${ui.button({ label: tUI('rpExportList'), icon: 'file-export', variant: 'ghost', size: 'sm', onclick: 'rpExportList()' })}
          ${ui.button({ label: tUI('rpOpenRstrui'), icon: 'screwdriver-wrench', variant: 'ghost', size: 'sm', onclick: 'openRstrui()' })}
        </div>
        <div class="rp-v2-table-wrap" id="rp-table-wrap">
          <table class="rp-v2-table" id="rp-table">
            <thead><tr>
              <th class="rp-v2-th rp-v2-th--seq">${tUI('rpTableSeq')}</th><th class="rp-v2-th">${tUI('rpTableDesc')}</th><th class="rp-v2-th">${tUI('rpTableDate')}</th><th class="rp-v2-th rp-v2-th--del"><span class="sr-only">${tUI('abDelete')}</span></th>
            </tr></thead>
            <tbody id="rp-tbody"><tr><td colspan="4" class="rp-v2-loading-cell"><span class="rp-v2-skeleton"></span></td></tr></tbody>
          </table>
          <div id="rp-empty" class="j-hidden">${raw(String(ui.empty({ icon: 'shield-halved', title: tUI('rpNotFound'), sub: tUI('rpEmptySub'), action: ui.button({ label: tUI('rpCreate'), icon: 'plus', variant: 'primary', onclick: 'doCreateRP()' }) })).replace('class="j-empty-title"', 'class="j-empty-title rp-v2-empty__title"'))}</div>
        </div>
      </div>
      <div class="j-rp-side">
        ${ui.card({ title: tUI('rpDiskLabel'), id: 'rp-disk-bar-wrap', body: html`
          <div class="rp-v2-disk-bar-track j-rp-bar"><div class="rp-v2-disk-bar-fill low" id="rp-disk-fill" style="width:0%"></div><span class="rp-v2-disk-pct" id="rp-disk-pct">0%</span></div>
          <div class="j-muted" id="rp-disk-info">…</div>` })}
        ${ui.card({ title: tUI('rpScheduleLabel'), body: html`
          <div class="rp-v2-schedule-chips j-rp-chips">${chips.map(([d, k]) => html`<button type="button" class="rp-v2-chip${autoSnapshotDays === d ? ' active' : ''}" data-days="${d}" onclick="rpSetSchedule('${d}')">${tUI(k)}</button>`)}</div>
          <div class="j-rp-meta"><span class="j-muted" id="rp-last-auto">${tUI('rpLastAuto')} ${lastAuto}</span><span id="rp-schedule-saved" class="rp-v2-schedule-saved"></span></div>` })}
        ${ui.card({ title: tUI('rpRestoreLabel'), id: 'rp-restore-card', body: html`
          <div class="j-muted" id="rp-no-sel"><i class="fa fa-hand-pointer" aria-hidden="true"></i> ${tUI('rpNoSelection')}</div>
          <div class="rp-v2-selected-preview j-rp-sel" id="rp-selected-preview" style="display:none">
            <span class="rp-v2-sp-seq" id="rp-sp-seq"></span>
            <div class="j-rp-sel-body"><span id="rp-sp-desc" class="rp-v2-sp-desc"></span><span id="rp-sp-date" class="j-muted"></span><span id="rp-sp-type"></span></div>
          </div>
          <button type="button" class="j-btn j-btn-danger rp-v2-restore-btn" id="rp-restore-btn" style="display:none" onclick="doRestoreToPoint()"><i class="fa fa-triangle-exclamation" aria-hidden="true"></i> ${tUI('rpRestoreBtn')}</button>
          <p class="j-muted">${tUI('rpRestoreWarn')}</p>` })}
        ${ui.card({ body: html`<div class="j-rp-info">${cards.map(({ title, body }, i) => html`<div><b class="j-rp-info-t${i}">${title}</b><div class="j-muted">${raw(body)}</div></div>`)}</div>` })}
      </div>
    </div>`)

  // ── Init ──
  api.checkIsAdmin().then(({ isAdmin }) => {
    if (!isAdmin) document.getElementById('rp-admin-banner').style.display = 'flex'
  }).catch(() => {})
  loadRPDiskUsage()
  loadRPList()

  if (!_rpAutoSnapshotListenerRegistered) {
    _rpAutoSnapshotListenerRegistered = true
    api.onAutoSnapshotDone(({ ts }) => {
      settings.lastAutoSnapshot = ts
      const el = document.getElementById('rp-last-auto')
      if (el) el.textContent = `${tUI('rpLastAuto')} ${new Date(ts).toLocaleString()}`
      loadRPList()
    })
  }
}
