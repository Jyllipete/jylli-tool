'use strict'
// Home (dashboard) page. Layout rebuilt on ui.* in the 2.0 UI; every element id that live-update code looks up
// (updateMetrics, initHealthScoreRing, ARIA, weekly report, quick health, ...) is unchanged.
function buildDashboard(c) {
  const { html, raw } = ui
  const si = sysInfo
  const put = h => c.insertAdjacentHTML('beforeend', String(h))
  const dismissBtn = (onclick, title) => ui.button({ iconOnly: true, icon: 'xmark', variant: 'ghost', size: 'sm', title, onclick })

  // What's New teaser
  const wn = window._whatsNew?.[0]
  if (wn && !localStorage.getItem(`wn_dismissed_${wn.version}`)) {
    const items = wn.items.slice(0, 4).map(item => { const body = String(item).replace(/^[A-Za-zÄÖäö]+ — /, ''); return body.length > 52 ? body.slice(0, 50) + '…' : body })
    put(html`<div id="db-changelog-feed" class="j-card j-home-feed">
      <div class="j-home-feed-main">
        <div class="j-hstack">${ui.badge(tUI('dashWhatsNew'), 'accent')}${ui.badge('v' + wn.version)}</div>
        <div class="j-home-chips">${items.map(t => ui.badge(t))}${wn.items.length > 4 ? html`<span class="j-muted">+${wn.items.length - 4} more</span>` : ''}</div>
      </div>
      ${dismissBtn(`localStorage.setItem('wn_dismissed_${String(wn.version).replace(/[^\w.-]/g, '')}','1');document.getElementById('db-changelog-feed')?.remove()`, tUI('ttDismiss'))}
    </div>`)
  }

  // Spec warnings are inserted here by buildSpecWarnings()
  put(html`<div id="spec-warnings"></div>`)

  // Hero: health ring, verdict, main actions
  put(html`<section id="db-hero" class="j-card j-home-hero j-home-hero-twin">
    <div class="j-twin-stage" id="home-twin-stage">
      <div class="j-twin-slot" id="home-twin-slot" data-twin-view="rig:home"></div>
      <div class="j-twin-hint" id="twin-hint">${tUI('twinHint')}</div>
      <div class="j-twin-inspector" id="twin-inspector" role="region" aria-label="${tUI('twinInspector')}" aria-live="polite" hidden></div>
      <ul class="j-twin-parts" id="twin-parts" aria-label="${tUI('twinPartsList')}"></ul>
    </div>
    <div class="j-home-hero-side">
    <div class="j-home-hero-main">
    <div class="j-home-ring">
      <svg width="104" height="104" viewBox="0 0 88 88" aria-hidden="true">
        <circle class="j-ring-bg" cx="44" cy="44" r="34"/>
        <circle class="j-ring-fg j-health-arc" id="health-ring-arc" cx="44" cy="44" r="34" stroke-dasharray="213.6" stroke-dashoffset="213.6"/>
      </svg>
      <div class="j-ring-label"><span id="health-score-num">—</span></div>
    </div>
    <div class="j-home-hero-text">
      <div class="j-stat-label">${tUI('dashPcHealth')}</div>
      <div id="health-score-msg" class="j-home-verdict">—</div>
      <div id="health-score-factors" class="j-home-factors"></div>
      <div id="db-streak-row" class="j-hstack" style="display:none">
        <div id="db-streak-chip" class="db-streak-chip"></div>
        <div id="db-lastrun-chip" class="db-streak-chip db-streak-chip-muted"></div>
      </div>
      <div id="aom-last-run-badge" class="j-muted" style="display:none"></div>
      <div id="game-watch-indicator" class="j-hstack j-muted" style="display:${gameWatcherRunning ? 'flex' : 'none'}"><span class="j-dot j-dot-ok"></span>${tUI('watchingForGames')}</div>
    </div>
    </div>
    <div class="j-home-hero-actions">
      ${ui.button({ id: 'auto-opti-btn', label: tUI('dashAutoOptimize'), icon: 'rocket', variant: 'primary', onclick: 'runAutoOpti()' })}
      <div class="j-hstack">
        ${ui.button({ label: tWizard('spwTitle'), icon: 'wand-sparkles', size: 'sm', onclick: 'spwOpen()' })}
        ${ui.button({ label: tUI('dashRestorePoint'), icon: 'shield-halved', size: 'sm', variant: 'ghost', onclick: 'quickCreateRP()' })}
      </div>
      <div class="auto-opti-progress-bar-track"><div class="auto-opti-progress-bar" id="auto-opti-bar"></div></div>
      <div class="auto-opti-status j-muted" id="auto-opti-status"></div>
    </div>
    </div>
  </section>`)

  // Live tiles
  const tile = (id, label, valId, trendId, sparkId, footer, unitless) => html`<div class="db-metric-tile j-stat" id="${id}">
    <div class="j-stat-label">${label}</div>
    <div class="j-stat-value"><span class="${unitless ? 'dmt-val-sm' : ''}" id="${valId}">—</span><span class="dmt-trend" id="${trendId}"></span></div>
    <div class="j-stat-sub">${footer}</div>
    <canvas class="dmt-spark j-stat-spark" id="${sparkId}" width="120" height="36"></canvas>
  </div>`
  put(html`<div id="panel-util" class="j-home-tiles">
    ${tile('mtile-cpu', 'CPU', 'db-util-cpu', 'trend-cpu', 'spark-cpu', html`<span id="db-uptime">—</span> ${tUI('dashUptime')}`)}
    ${tile('mtile-gpu', 'GPU', 'db-util-gpu', 'trend-gpu', 'spark-gpu', html`<span id="db-processes">—</span> ${tUI('dashProcs')}`)}
    ${tile('mtile-ram', 'RAM', 'db-util-memory', 'trend-ram', 'spark-ram', `${si.ramGB > 0 ? si.ramGB + ' GB' : '—'} total`)}
    ${tile('mtile-net', 'NET ↓', 'db-net-speed', 'trend-net', 'spark-net', html`<span id="db-net-up">↑ —</span>`, true)}
    <div class="j-home-tiles-foot j-muted">
      <span><i class="fa fa-hard-drive" aria-hidden="true"></i> <span id="db-util-disk">—</span>% ${tUI('dashDisk')}</span>
      <span><i class="fa fa-arrow-down" aria-hidden="true"></i> <span id="db-net-down2">—</span></span>
      <span><i class="fa fa-arrow-up" aria-hidden="true"></i> <span id="db-net-up2">—</span></span>
    </div>
  </div>`)

  buildGameCarousel(c)

  // Temperatures
  const temp = (w, labelKey) => html`<section class="j-card temp-panel" id="panel-${w}-temp">
    <div class="j-card-head"><h3 class="j-card-title">${tUI(labelKey)}</h3><span class="temp-value j-num" id="db-${w}-temp">—</span></div>
    <div class="j-card-body">
      <div class="temp-canvas-wrap">
        <canvas class="temp-canvas" id="canvas-${w}-temp" width="340" height="90"></canvas>
        <div class="temp-y-labels" id="ylabels-${w}-temp"><span class="temp-y-label" id="yl-${w}-hi">—</span><span class="temp-y-label" id="yl-${w}-mid">—</span><span class="temp-y-label" id="yl-${w}-lo">—</span></div>
      </div>
      <div class="temp-footer j-muted">
        <div class="temp-stat">${tUI('dashTempAvg')} <span id="db-${w}-avg">—</span></div>
        <div class="temp-stat">${tUI('dashTempMin')} <span id="db-${w}-min">—</span></div>
        <div class="temp-stat peak">${tUI('dashTempPeak')} <span id="db-${w}-peak">—</span></div>
      </div>
    </div>
  </section>`
  put(html`<div class="db-grid-top j-home-temps">${temp('cpu', 'dashCpuTemp')}${temp('gpu', 'dashGpuTemp')}</div>`)

  // Quick health
  const qh = [
    { id: 'bloat-services', label: tUI('dashBloatServices'), btn: tUI('view'), action: "showPage('debloater')", icon: 'trash', tip: tUI('qhTipBloatServices') },
    { id: 'bloat-tasks', label: tUI('dashBloatTasks'), btn: tUI('view'), action: "showPage('startup-manager')", icon: 'rocket', tip: tUI('qhTipBloatTasks') },
    { id: 'tweaks-applied', label: tUI('dashTweaksApplied'), btn: tUI('apply'), action: "showPage('windows-opti')", icon: 'bolt', tip: tUI('qhTipTweaksApplied') },
    { id: 'unused-devices', label: tUI('dashUnusedDevices'), btn: tUI('manage'), action: "showPage('debloater')", icon: 'microchip', tip: tUI('qhTipUnusedDevices') },
    { id: 'removable-apps', label: tUI('dashRemovableApps'), btn: tUI('remove'), action: "showPage('debloater')", icon: 'box-open', tip: tUI('qhTipRemovableApps') },
    { id: 'temp-data', label: tUI('dashTempData'), btn: tUI('clear'), action: 'quickClearTemp()', icon: 'broom', tip: tUI('qhTipTempData') },
  ]
  put(html`<div class="db-grid-bottom">${ui.card({
    title: tUI('dashQuickHealth'),
    actions: ui.button({ id: 'win-health-btn', label: tUI('dashWindowsHealth'), icon: 'heart-pulse', size: 'sm', onclick: 'runWindowsHealthDash(this)' }),
    body: html`<div id="win-health-banner" class="j-home-banner" style="display:none"></div>
      <div id="qh-body">${qh.map(r => html`<div class="qh-row" id="qh-row-${r.id}" onclick="${r.action}" role="button" tabindex="0" title="${r.tip}">
        <div class="qh-left"><div class="qh-name">${r.label}</div><div class="qh-val j-num" id="qh-val-${r.id}">—</div></div>
        <div class="qh-track"><div class="qh-bar" id="qh-bar-${r.id}"></div></div>
        <button class="qh-btn j-btn j-btn-sm" type="button" title="${r.tip}" onclick="event.stopPropagation();${r.action}"><i class="fa fa-${r.icon}" aria-hidden="true"></i>${r.btn}</button>
      </div>`)}</div>`,
  })}</div>`)

  // This PC
  const cpuShort = (si.cpu || '').replace(/\(R\)|\(TM\)|Intel Core |AMD Ryzen /gi, '').replace(/\s+/g, ' ').trim().split('@')[0].trim()
  const gpuShort = (si.gpu || '').replace(/NVIDIA |AMD |GeForce |Radeon /gi, '').trim()
  const pcRows = [
    si.winVer && ['fab fa-windows', si.winVer.replace(' (Build', ' B').replace(')', '')],
    cpuShort && ['fa fa-microchip', cpuShort],
    gpuShort && ['fa fa-display', gpuShort],
    si.ramGB && ['fa fa-memory', `${si.ramGB} GB RAM`],
  ].filter(Boolean)
  put(html`<section id="db-identity-card" class="j-card j-home-pc">
    <div class="j-home-pc-main">
      <div class="j-home-pc-icon"><i class="fa ${si.isLaptop ? 'fa-laptop' : 'fa-desktop'}" aria-hidden="true"></i></div>
      <div>
        <h3 class="j-card-title">${si.computerName || 'My PC'}</h3>
        <div class="j-home-chips">${pcRows.map(([ic, t]) => html`<span class="j-badge"><i class="${ic}" aria-hidden="true"></i>&nbsp;${t}</span>`)}</div>
      </div>
    </div>
    <div class="j-home-pc-meta">
      <div><div class="j-stat-label">${tUI('dashIdentityUptime')}</div><div class="j-num" id="db-identity-uptime">—</div></div>
      <div><div class="j-stat-label">${tUI('dashLastOptimized')}</div><div class="j-num" id="db-last-optimized">—</div></div>
    </div>
  </section>`)

  // Uptime live tick — seed from first metrics reading, update every second
  window._dashUptimeBase = null
  window._dashUptimeStart = null
  clearInterval(window._dashUptimeTick)
  window._dashUptimeTick = setInterval(() => {
    const el = document.getElementById('db-identity-uptime')
    if (!el) { clearInterval(window._dashUptimeTick); return }
    if (window._dashUptimeBase != null && window._dashUptimeStart != null) {
      const elapsed = Math.floor((Date.now() - window._dashUptimeStart) / 1000)
      el.textContent = fmtUptime(window._dashUptimeBase + elapsed)
    } else if (window._lastMetrics?.uptime) {
      window._dashUptimeBase = window._lastMetrics.uptime
      window._dashUptimeStart = Date.now()
      el.textContent = fmtUptime(window._dashUptimeBase)
    }
  }, 1000)

  // ARIA panel (populated by ariaInitPanel / game events)
  const fpsCell = (label, id, tone) => html`<div class="j-stat j-home-fps"><div class="j-stat-label">${label}</div><div class="j-stat-value j-stat-${tone}" id="${id}">—</div></div>`
  put(html`<section class="aria-panel j-card" style="display:none" id="db-aria-panel">
    <div class="j-card-head"><div><h3 class="j-card-title">${tUI('ariaTitle')} <span class="aria-pulse" id="aria-pulse-dot"></span></h3><p class="j-card-sub">${tUI('ariaSubtitle')}</p></div></div>
    <div class="j-card-body">
      <div id="aria-fps-counter" class="j-stack" style="display:none">
        <div class="j-home-fps-row">${fpsCell(tUI('ariaAvgFps'), 'aria-fps-avg', 'ok')}${fpsCell(tUI('ariaLow1Fps'), 'aria-fps-low1', 'warn')}${fpsCell(tUI('ariaFpsStab'), 'aria-fps-stab', 'info')}</div>
        <canvas id="aria-fps-sparkline" class="j-home-fps-spark" width="300" height="28"></canvas>
      </div>
      <div id="aria-anomaly-feed" class="j-home-feed-scroll"></div>
      <div id="aria-session-summary" class="j-callout j-callout-info" style="display:none">
        <div class="j-grow">
          <div class="j-hstack"><b>${tUI('ariaSessionSummaryTitle')}</b>${settings.isPremium ? ui.button({ label: tUI('ariaSessionCoachBtn'), icon: 'brain', size: 'sm', onclick: 'ariaShowSessionCoach()' }) : ''}</div>
          <div id="aria-session-summary-body" class="j-home-chips"></div>
        </div>
      </div>
      <div class="j-stat-label">${tUI('ariaInsightTitle')}</div>
      <div id="aria-insight-feed" class="j-home-feed-scroll"></div>
      <div id="aria-journal-panel" class="" style="display:none">
        <div class="j-stat-label"><i class="fa fa-book-open" aria-hidden="true"></i> ${tUI('ariaJournalTitle')}</div>
        <div id="aria-journal-entries" class="j-stack"></div>
      </div>
    </div>
  </section>`)

  // Frame session (shown after a game exits with PresentMon data)
  put(html`<section id="db-frame-session-panel" class="j-card" style="display:none">
    <div class="j-card-head"><h3 class="j-card-title"><i class="fa fa-chart-line" aria-hidden="true"></i> ${tUI('dashFrameSession')} <span id="db-frame-session-game" class="j-badge"></span></h3>
      ${dismissBtn("document.getElementById('db-frame-session-panel').style.display='none'", tUI('ttDismiss'))}</div>
    <div class="j-card-body"><div id="db-frame-session-stats" class="j-home-chips"></div><canvas id="db-frame-session-canvas" class="j-home-fps-spark" width="600" height="60"></canvas></div>
  </section>`)

  // All-clear banner
  put(html`<div id="db-ambient-banner" class="j-callout j-callout-ok" style="display:none"><i class="fa fa-shield-check" aria-hidden="true"></i><div>${tUI('dashAmbientNominal')}</div></div>`)

  // Quick actions
  put(html`<div class="j-stat-label j-home-label">${tUI('dashQuickActions')}</div>
    <div class="quick-actions j-home-actions" id="quick-actions-row">
      ${ui.button({ label: tUI('dashFlushDns'), icon: 'trash', onclick: 'quickFlushDNS()' })}
      ${ui.button({ label: tUI('dashClearTemp'), icon: 'broom', onclick: 'quickClearTemp()' })}
      ${ui.button({ id: 'btn-ram-clean', label: tUI('dashCleanRam'), icon: 'memory', onclick: 'quickCleanRam()' })}
      ${ui.button({ label: tUI('dashFivemTweaks'), icon: 'car-side', onclick: "showPage('fivem')" })}
      ${ui.button({ label: tUI('dashGameOpti'), icon: 'gamepad', onclick: "showPage('game-opti')" })}
      ${ui.button({ label: tUI('dashRefreshSpecs'), icon: 'arrows-rotate', onclick: 'refreshSpecs()' })}
      ${!si.isAdmin ? ui.button({ id: 'btn-relaunch-admin', label: tUI('dashRelaunchAdmin'), icon: 'lock', variant: 'danger', onclick: 'api.relaunchAdmin()' }) : ''}
    </div>`)

  // AI advisor (populated async, hidden until a model answers)
  put(html`<section id="ai-advisor-card" class="j-card" style="display:none">
    <div class="j-card-head"><div><h3 class="j-card-title"><i class="fa fa-brain" aria-hidden="true"></i> ${tUI('aiTitle')}</h3><p class="j-card-sub">${tUI('aiSubtitle')}</p></div>
      <div class="j-card-actions"><span id="ai-provider-chip" class="j-badge j-badge-accent" title="${tUI('aiProviderTip')}"></span><span id="ai-last-ts" class="j-muted"></span></div></div>
    <div class="j-card-body">
      <div id="ai-loading" class="" style="display:none">${ui.spinner(tUI('aiLoading'))}</div>
      <div id="ai-unavail" class="j-muted" style="display:none"><i class="fa fa-lock" aria-hidden="true"></i> ${tUI('aiUnavail')}</div>
      <div id="ai-recs-list" class="j-stack"></div>
    </div>
  </section>`)

  // Weekly report (populated async)
  put(html`<section id="db-weekly-report" class="j-card" style="display:none">
    <div class="j-card-head"><h3 class="j-card-title"><i class="fa fa-calendar-week" aria-hidden="true"></i> ${tUI('weeklyReportTitle')}</h3>
      ${dismissBtn("document.getElementById('db-weekly-report').style.display='none';localStorage.setItem('weekly_report_dismissed_ts',Date.now())", tUI('ttDismiss'))}</div>
    <div class="j-card-body"><div id="db-weekly-stats" class="j-home-weekly"></div></div>
  </section>`)

  twinInit()
  buildSpecWarnings()
  initRadar()
  initQuickHealth()
  initHealthScoreRing()
  showHealthNudgeIfNeeded()
  drawTempCanvas('cpu', [])
  drawTempCanvas('gpu', [])
  ariaInitPanel()
  buildWeeklyReport()

  // Restore pending frame session card if data arrived while on another page
  if (window._pendingFrameSession) showFrameSession(window._pendingFrameSession)

  loadAiAdvisor()
}

// ── 3D twin on Home ─────────────────────────────────────────────────────────────────────────────────
// The stage shows the real rig (JylliTwin). Hover/click a part for its inspector; a keyboard-reachable list mirrors the canvas.
const TWIN_PART_LABEL = { cpu: 'twinPartCpu', gpu: 'twinPartGpu', ram: 'twinPartRam', storage: 'twinPartStorage', board: 'twinPartBoard', cooler: 'twinPartCooler' }
function twinInit() {
  const slot = document.getElementById('home-twin-slot')
  if (!slot || !window.JylliTwin) return
  JylliTwin.attach(slot)
  const list = document.getElementById('twin-parts')
  const wire = () => {
    const lay = JylliTwin.layout
    if (!lay || !list) return false
    const seen = new Set()
    list.innerHTML = lay.parts.filter(p => !p.decor && !(p.kind === 'ram-slot' && !p.slot.stick && p.id !== 'ram0')).map(p => {
      const k = p.label || p.id
      if (seen.has(k) && k !== 'storage') return ''
      seen.add(k)
      return `<li><button type="button" class="j-btn j-btn-ghost j-btn-sm" data-twin-part="${escAttr(p.id)}">${escHtml(tUI(TWIN_PART_LABEL[k] || 'twinPartBoard'))}${p.ghost ? ' · ' + escHtml(tUI('twinNotDetected')) : ''}</button></li>`
    }).join('')
    list.querySelectorAll('[data-twin-part]').forEach(b => { b.onclick = () => JylliTwin.select(b.dataset.twinPart) })
    return true
  }
  let tries = 0
  const t = setInterval(() => { if (wire() || ++tries > 20) clearInterval(t) }, 250)
  JylliTwin.on('select', id => twinInspect(id))
  JylliTwin.on('assemble', () => { try { JylliSound.play('click') } catch {} })
  if (!settings.assemblyDone) twinFirstRun(slot)
  document.getElementById('home-twin-stage')?.addEventListener('keydown', e => { if (e.key === 'Escape') JylliTwin.back() })
}

function twinInspect(id) {
  const box = document.getElementById('twin-inspector')
  const hint = document.getElementById('twin-hint')
  if (!box) return
  if (!id) { box.hidden = true; box.innerHTML = ''; if (hint) hint.hidden = false; return }
  const info = JylliTwin.partInfo(id)
  if (!info) return
  if (hint) hint.hidden = true
  const key = TWIN_PART_LABEL[info.label] || 'twinPartBoard'
  const facts = twinFacts(info).map(([k, v]) => `<div class="j-twin-row"><span>${escHtml(k)}</span><span>${escHtml(v)}</span></div>`).join('')
  const metrics = info.metrics.map(m => `<div class="j-twin-row"><span>${escHtml(tUI('sensorKey_' + m))}</span><span class="j-num" data-metric="${escAttr(m)}">—</span></div>`).join('')
  const openGpu = id === 'gpu' && !info.ghost ? `<button type="button" class="j-btn j-btn-sm" onclick="twinOpenGpu()">${escHtml(tUI('twinOpenGpu'))}</button>` : ''
  const ghost = info.ghost ? `<div class="j-twin-ghost-note">${escHtml(tUI(info.note === 'integrated-only' ? 'twinIntegratedOnly' : 'twinNotDetected'))}${twinSetIt(info)}</div>` : ''
  box.innerHTML = `<div class="j-twin-insp-head"><b>${escHtml(tUI(key))}</b><button type="button" class="j-btn j-btn-ghost j-btn-sm j-btn-icon" id="twin-back" aria-label="${escAttr(tUI('twinBack'))}"><i class="fa fa-xmark" aria-hidden="true"></i></button></div>${ghost}${facts}${metrics}${openGpu}`
  box.hidden = false
  document.getElementById('twin-back').onclick = () => JylliTwin.back()
  try { JylliTelemetry.applyToDom() } catch {}
}

function twinFacts(info) {
  const i = info.info || {}, rows = []
  const add = (k, v) => { if (v != null && v !== '' && v !== false) rows.push([tUI(k), String(v)]) }
  if (info.label === 'cpu') { add('twinFactModel', i.name); if (i.cores) add('twinFactCores', i.cores + ' / ' + (i.threads || '?')) }
  else if (info.label === 'gpu') { add('twinFactModel', i.name); add('twinFactDriver', i.driver) }
  else if (info.label === 'ram') { add('twinFactModel', i.part); if (i.sizeGB) add('twinFactSize', i.sizeGB + ' GB'); if (i.ratedMT) add('twinFactRated', i.ratedMT + ' MT/s'); if (i.speedMT) add('twinFactRunning', i.speedMT + ' MT/s'); if (i.channel) add('twinFactSlot', i.channel + ' (' + tUI('twinSlotUnknown') + ')') }
  else if (info.label === 'storage') { add('twinFactModel', i.name); if (i.sizeGB) add('twinFactSize', i.sizeGB + ' GB'); add('twinFactBus', i.bus); add('twinFactHealth', i.health) }
  else if (info.label === 'board') { add('twinFactModel', [i.vendor, i.model].filter(Boolean).join(' ')) }
  else if (info.label === 'cooler') { add('twinFactType', i.type && i.type !== 'unknown' ? tUI(i.type === 'aio' ? 'twinCoolerAio' : 'twinCoolerAir') : ''); add('twinFactSource', i.source === 'user' ? tUI('twinSourceUser') : '') }
  return rows
}

function twinSetIt(info) {
  if (info.label !== 'cooler') return ''
  return ` <button type="button" class="j-btn j-btn-sm" onclick="twinDeclare('aio')">${escHtml(tUI('twinCoolerAio'))}</button> <button type="button" class="j-btn j-btn-sm" onclick="twinDeclare('air')">${escHtml(tUI('twinCoolerAir'))}</button>`
}
async function twinDeclare(kind) {
  await api.setDeclaredRig({ cooler: kind })
  await JylliTwin.setRigDeclared()
  JylliTwin.back()
}

// First run: the rig assembles itself from what was detected, then offers Auto-Optimize. It never runs anything by itself.
function twinFirstRun(slot) {
  let tries = 0
  const wait = setInterval(async () => {
    if (JylliTwin.bootActive) return           // the boot stage still owns the canvas; wait for the handoff
    if (JylliTwin.state === 'live') {
      clearInterval(wait)
      const stage = document.getElementById('home-twin-stage')
      if (!stage) return
      const bar = document.createElement('div')
      bar.className = 'j-twin-assembly'
      // the loading screen already built the rig from the detection results: no second assembly, only the Auto-Optimize offer below
      if (!JylliTwin.bootAssembled) {
        bar.innerHTML = `<span>${escHtml(tUI('twinAssembling'))}</span><button type="button" class="j-btn j-btn-ghost j-btn-sm" id="twin-skip">${escHtml(tUI('twinSkip'))}</button>`
        stage.appendChild(bar)
        const skip = bar.querySelector('#twin-skip'); if (skip) skip.onclick = () => JylliTwin.skipAssembly()
        await JylliTwin.assemble({ reduced: document.body.classList.contains('motion-reduced') || matchMedia('(prefers-reduced-motion: reduce)').matches })
      } else stage.appendChild(bar)
      settings.assemblyDone = true; api.saveSettings(settings)
      if (!bar.isConnected) return          // the user left Home during the animation
      bar.innerHTML = `<span>${escHtml(tUI('twinAssembled'))}</span><button type="button" class="j-btn j-btn-primary j-btn-sm" onclick="runAutoOpti()">${escHtml(tUI('dashAutoOptimize'))}</button><button type="button" class="j-btn j-btn-ghost j-btn-sm" id="twin-assembly-close">${escHtml(tUI('close'))}</button>`
      bar.querySelector('#twin-assembly-close').onclick = () => bar.remove()
    } else if (JylliTwin.state === 'static' || ++tries > 40) { clearInterval(wait); settings.assemblyDone = true; api.saveSettings(settings) }
  }, 300)
}

// "Open GPU": the stage morphs into the GPU hero's stage (View Transitions; plain navigation when unsupported or motion is reduced).
function twinOpenGpu() {
  const go = () => { window._activeTab = window._activeTab || {}; window._activeTab.optimize = 'gpu'; showPage('hardware') }
  const stage = document.getElementById('home-twin-stage')
  const reduced = document.body.classList.contains('motion-reduced') || matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!document.startViewTransition || reduced || !stage) return go()
  stage.style.viewTransitionName = 'part-gpu'
  const vt = document.startViewTransition(async () => {
    go()
    await new Promise(r => setTimeout(r, 450))
    const s2 = document.getElementById('gpu-hero')?.querySelector('.j-twin-stage')
    if (s2) s2.style.viewTransitionName = 'part-gpu'
  })
  vt.finished.finally(() => { document.querySelectorAll('.j-twin-stage').forEach(e => { e.style.viewTransitionName = '' }) })
}
