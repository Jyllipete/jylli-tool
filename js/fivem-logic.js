'use strict'

let _fivemHudOpen = false

// ─── Page: FiveM ──────────────────────────────────────────────────────────────
async function buildFiveM(c) {
  if (!settings.isPremium) { await buildPremiumBanner(c, 'fivem'); return }
  c.appendChild(makeTip(tUI('fivemTipTitle'), 'info'))
  // ── Not-detected banner ────────────────────────────────────────────────────
  if (!sysInfo?.fivemInstalled) {
    const nb = document.createElement('div')
    nb.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(243,156,18,0.07);border:1px solid rgba(243,156,18,0.25);border-radius:8px;margin-bottom:4px;font-size:11px;color:#c0a060'
    nb.innerHTML = `<i class="fa fa-triangle-exclamation" style="color:#f39c12;flex-shrink:0"></i><span>${tUI('fivemNotDetected')}</span>`
    c.appendChild(nb)
  }

  // ── Dismissible order banner ───────────────────────────────────────────────
  if (!localStorage.getItem('fivem_order_dismissed')) {
    const banner = document.createElement('div')
    banner.id = 'fivem-order-banner'
    banner.style.cssText = 'background:rgba(255,46,99,0.07);border:1px solid rgba(255,46,99,0.2);border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:11px;color:var(--fg);display:flex;align-items:flex-start;gap:8px'
    banner.innerHTML = `
      <i class="fa fa-lightbulb" style="color:var(--pink);margin-top:1px;flex-shrink:0"></i>
      <span style="flex:1">${tUI('fivemOrderTip')}</span>
      <button onclick="localStorage.setItem('fivem_order_dismissed','1');document.getElementById('fivem-order-banner').remove()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:13px;line-height:1;flex-shrink:0">✕</button>
    `
    c.appendChild(banner)
  }

  // ── Hero banner: two entry points ────────────────────────────────────────────
  const sections = [
    {
      get title() { return tUI('fivemAutoOptiTitle') }, rows: [
        { id:'fivem-auto-opti', get name() { return tUI('fivemAutoOptiRowName') }, get desc() { return tUI('fivemAutoOptiRowDesc') }, sinceVersion:'1.5.0' },
      ]
    },
    {
      get title() { return tUI('fivemSecCacheShaders') }, rows: [
        { id:'fivem-clear-cache-btn', name:'Clear FiveM App Cache + NVIDIA DXCache (fix FPS drops & texture loss)', desc:'Wipes all FiveM data cache, server-cache, shader cache, and NVIDIA DXCache. FiveM rebuilds on next launch.', restore:false },
      ]
    },
    {
      get title() { return tUI('fivemSecCpuIo') }, rows: [
        { id:'fivem-priority', name:'Set FiveM.exe + GTA5.exe → HIGH CPU Priority (IFEO registry)', desc:'Writes CpuPriorityClass=3 for FiveM.exe, GTA5.exe, and CitizenFX.exe. Higher CPU scheduling priority.' },
        { id:'fivem-io-priority', name:'Set FiveM.exe + GTA5.exe → HIGH I/O Priority', desc:'Boosts disk read scheduling priority for faster asset and texture streaming.' },
      ]
    },
    {
      get title() { return tUI('fivemSecDvr') }, rows: [
        { id:'fivem-mmcss', name:'Apply MMCSS top-priority game scheduling (GPU Priority=8, Clock=10000)', desc:'Configures MMCSS to give FiveM the highest game scheduling category with Clock Rate=10000.' },
        { id:'fivem-fso', name:'Disable Fullscreen Optimizations for FiveM.exe + GTA5.exe', desc:'FSO adds latency overhead in exclusive fullscreen mode. Disabling it reduces input lag noticeably.' },
        { id:'fivem-gamebar', name:'Disable Xbox Game Bar & Game DVR Recording', desc:'Stops Xbox Game Bar background recording for GTA V / FiveM. GameDVR causes frame-time spikes during high-action scenes — especially on lower-end systems.', sinceVersion:'1.4.6' },
      ]
    },
    {
      get title() { return tUI('fivemSecGpu') }, rows: [
        { id:'fivem-gpu', name:'NVIDIA Max Performance + Ultra Low-Latency + GPU Hardware Scheduling', desc:'PowerMizerLevel=1 (max clocks), D3PCLatency=1 (ULL mode), HwSchMode=2 (HWSCH). Reboot required.' },
      ]
    },
    {
      get title() { return tUI('fivemSecNetwork') }, rows: [
        { id:'fivem-network', name:'FiveM network tweaks: Nagle off, TcpAckFrequency=1, no TCP delay', desc:'Nagle\'s algorithm batches packets — terrible for real-time games. Disabling it reduces ping spikes immediately.' },
      ]
    },
    {
      get title() { return tUI('fivemSecMemory') }, rows: [
        { id:'fivem-vm', name:'Optimise virtual memory: keep kernel in RAM, reduce paging', desc:'DisablePagingExecutive=1 keeps kernel code in physical RAM. LargeSystemCache=0 gives more RAM to game processes.' },
        { id:'fivem-streaming-mem', name:'Increase FiveM streaming memory to 1 GB', desc:'Raises CitizenFX StreamingMemory to 1024 MB so FiveM pre-loads more assets — reduces texture pop-in and stutter.' },
      ]
    },
    {
      get title() { return tUI('fivemSecLaunch') }, rows: [
        { id:'fivem-commandline', name:'Write optimised GTA V commandline.txt', desc:'Forces DX11, fullscreen mode, and disables texture budget cap — fewer micro-stutters and better GPU utilisation.' },
      ]
    },
    {
      get title() { return tUI('fivemSecCfx') }, rows: [
        { id:'fivem-worker-threads',          name:'Set Worker Threads to CPU core count', desc:'Increases the number of background threads FiveM uses for asset streaming. Defaults to 2 — setting it to your core count speeds up world loading significantly.' },
        { id:'fivem-disable-crash-reporter',  name:'Disable Crash Reporter', desc:'Stops FiveM uploading crash reports to Cfx.re servers. Removes a background process that runs even during normal gameplay.' },
        { id:'fivem-disable-anticheat-upload',name:'Disable Steam Achievements & Telemetry Upload', desc:'Prevents FiveM from sending Steam achievement and Rockstar analytics data. Reduces background network traffic during sessions.' },
        { id:'fivem-disable-update-checks',   name:'Suppress FiveM Update Nags', desc:'Sets UpdateChannel=canary in CitizenFX.ini. Stops the "new update available" popup interrupting your session startup.' },
        { id:'fivem-preload-ipl',             name:'Disable Grass (MaximumGrass=0)', desc:'Removes all grass draw calls via CitizenFX.ini. One of the single biggest FPS gains in open areas and during car chases — no visual impact on most RP servers.' },
        { id:'fivem-reduce-draw-distance',    name:'Reduce LOD Draw Distance', desc:'Sets MaxLodDistance and MaxObjectLodDistance to 30 (default 100). Fewer distant objects rendered per frame — noticeable FPS boost in dense server environments.' },
      ]
    },
    {
      get title() { return tUI('fivemSecSystem') }, rows: [
        { id:'fivem-defender', name:'Add FiveM folder to Windows Defender exclusions', desc:'Prevents Defender from scanning FiveM files on every load — eliminates scan-related stutters and load time.' },
        { id:'fivem-hang-fix', name:'Fix FiveM disconnect hang + fullscreen flicker (HungAppTimeout)', desc:'Removes the HungAppTimeout registry override so Windows uses its built-in default. Fixes desktop flash / peek-through on mouse clicks in fullscreen FiveM, and eliminates the disconnect hang.' },
        { id:'fivem-mouse-accel', name:'Disable Mouse Acceleration (Enhance Pointer Precision)', desc:'Sets MouseSpeed=0 and MouseThreshold to 0. Disables Windows mouse acceleration for precise, 1:1 aiming in FiveM. Affects the whole system — restore if you prefer standard Windows behaviour.', sinceVersion:'1.4.6' },
        { id:'fivem-power-plan', name:'Set Power Plan → High Performance', desc:'Switches Windows power plan to High Performance. Prevents CPU clock throttling mid-game — especially impactful on laptops running on Balanced plan.', sinceVersion:'1.4.6' },
      ]
    },
  ]
  const hero = document.createElement('div')
  hero.className = 'fivem-hero'
  hero.innerHTML = `
    <div class="fivem-hero-card fivem-hero-graphics" onclick="api.openFivemSettings()">
      <div class="fhc-icon"><i class="fa fa-sliders"></i></div>
      <div class="fhc-body">
        <div class="fhc-title">${tUI('fivemHeroGraphics')}</div>
        <div class="fhc-desc">${tUI('fivemHeroGraphicsDesc')}</div>
        <div class="fhc-open"><i class="fa fa-arrow-up-right-from-square"></i> ${tUI('fivemHeroGraphicsOpen')}</div>
      </div>
    </div>
    <div class="fivem-hero-card fhc-variant-blue" onclick="fivemOpenServerHealth()">
      <div class="fhc-icon"><i class="fa fa-tower-broadcast"></i></div>
      <div class="fhc-body">
        <div class="fhc-title">${tUI('fivemHeroHealth')}</div>
        <div class="fhc-desc">${tUI('fivemHeroHealthDesc')}</div>
        <div class="fhc-open"><i class="fa fa-play"></i> ${tUI('fivemHeroHealthRun')}</div>
      </div>
    </div>
    <div class="fivem-hero-card fhc-variant-purple" onclick="fivemOpenSmartCache()">
      <div class="fhc-icon"><i class="fa fa-database"></i></div>
      <div class="fhc-body">
        <div class="fhc-title">${tUI('fivemHeroSmartCache')}</div>
        <div class="fhc-desc">${tUI('fivemHeroSmartCacheDesc')}</div>
        <div class="fhc-open"><i class="fa fa-magnifying-glass"></i> ${tUI('fivemHeroSmartCacheOpen')}</div>
      </div>
    </div>
    <div class="fivem-hero-card fhc-variant-blue" onclick="fivemOpenIniEditor()" style="border-color:rgba(46,204,113,0.3)">
      <div class="fhc-icon" style="color:#2ecc71"><i class="fa fa-file-pen"></i></div>
      <div class="fhc-body">
        <div class="fhc-title">${tUI('fivemHeroIniEditor')}</div>
        <div class="fhc-desc">${tUI('fivemHeroIniEditorDesc')}</div>
        <div class="fhc-open" style="color:#2ecc71"><i class="fa fa-pen-to-square"></i> ${tUI('fivemHeroIniEditorOpen')}</div>
      </div>
    </div>
    <div class="fivem-hero-card fhc-variant-blue" onclick="fivemOpenBookmarks()" style="border-color:rgba(52,152,219,0.3)">
      <div class="fhc-icon" style="color:#3498db"><i class="fa fa-server"></i></div>
      <div class="fhc-body">
        <div class="fhc-title">${tUI('fivemHeroBookmarks')}</div>
        <div class="fhc-desc">${tUI('fivemHeroBookmarksDesc')}</div>
        <div class="fhc-open" style="color:#3498db"><i class="fa fa-bookmark"></i> ${tUI('fivemHeroBookmarksOpen')}</div>
      </div>
    </div>
    <div class="fivem-hero-card fhc-variant-purple" onclick="fivemHudToggle()">
      <div class="fhc-icon"><i class="fa fa-display"></i></div>
      <div class="fhc-body">
        <div class="fhc-title">${tUI('fivemHeroHud')}</div>
        <div class="fhc-desc">${tUI('fivemHeroHudDesc')}</div>
        <div class="fhc-open" id="fivem-hud-toggle-label"><i class="fa fa-circle-play"></i> ${tUI('fivemHeroHudOpen')}</div>
        <div style="display:flex;align-items:center;gap:7px;margin-top:6px" onclick="event.stopPropagation()">
          <label class="toggle-switch" style="flex-shrink:0">
            <input type="checkbox" id="fivem-hud-auto" ${settings.fivemHudEnabled ? 'checked' : ''} onchange="fivemHudAutoToggle(this.checked)">
            <span class="toggle-slider"></span>
          </label>
          <span style="font-size:9px;color:var(--muted);cursor:pointer" onclick="document.getElementById('fivem-hud-auto').click()">${tUI('fivemHudAutoLabel')}</span>
        </div>
      </div>
    </div>
  `
  c.appendChild(hero)

  // ── Server Health panel (hidden until opened) ─────────────────────────────
  const healthPanel = document.createElement('div')
  healthPanel.id = 'fivem-health-panel'
  healthPanel.style.display = 'none'
  healthPanel.className = 'section-card'
  healthPanel.style.cssText = 'display:none;margin-bottom:10px;border:1px solid rgba(52,152,219,0.25)'
  healthPanel.innerHTML = `
    <div class="section-header" style="display:flex;align-items:center;justify-content:space-between">
      <span style="display:flex;align-items:center;gap:8px"><span class="section-accent" style="background:#3498db"></span><span class="section-title" style="color:#3498db"><i class="fa fa-tower-broadcast"></i> ${tUI('fivemHealthTitle')}</span></span>
      <div style="display:flex;gap:6px">
        <button class="btn btn-ghost btn-sm fhc-health-btn" id="fivem-health-run-btn" onclick="fivemRunServerHealth()"><i class="fa fa-play"></i> ${tUI('fivemHealthRunBtn')}</button>
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('fivem-health-panel').style.display='none'" style="font-size:9px"><i class="fa fa-xmark"></i></button>
      </div>
    </div>
    <div style="padding:0 18px 12px;font-size:9.5px;color:var(--muted)">${tUI('fivemHealthDesc')}</div>
    <div id="fivem-health-body" style="padding:0 18px 14px"></div>
  `
  c.appendChild(healthPanel)

  // ── Smart Cache panel (hidden until opened) ───────────────────────────────
  const cachePanel = document.createElement('div')
  cachePanel.id = 'fivem-cache-panel'
  cachePanel.style.cssText = 'display:none;margin-bottom:10px;border:1px solid rgba(155,89,182,0.25)'
  cachePanel.className = 'section-card'
  cachePanel.innerHTML = `
    <div class="section-header" style="display:flex;align-items:center;justify-content:space-between">
      <span style="display:flex;align-items:center;gap:8px"><span class="section-accent" style="background:#9b59b6"></span><span class="section-title" style="color:#9b59b6"><i class="fa fa-database"></i> ${tUI('fivemSmartCacheTitle')}</span></span>
      <button class="btn btn-ghost btn-sm" onclick="document.getElementById('fivem-cache-panel').style.display='none'" style="font-size:9px"><i class="fa fa-xmark"></i></button>
    </div>
    <div style="padding:0 18px 12px;font-size:9.5px;color:var(--muted)">${tUI('fivemSmartCacheDesc')}</div>
    <div id="fivem-cache-body" style="padding:0 18px 14px">
      <div style="color:var(--muted);font-size:10px"><i class="fa fa-spinner fa-spin"></i> ${tUI('fivemSmartCacheScanning')}</div>
    </div>
  `
  c.appendChild(cachePanel)

  // ── CitizenFX.ini Full Editor panel (hidden until opened) ────────────────
  const iniEditorPanel = document.createElement('div')
  iniEditorPanel.id = 'fivem-ini-editor-panel'
  iniEditorPanel.style.cssText = 'display:none;margin-bottom:10px;border:1px solid rgba(46,204,113,0.25)'
  iniEditorPanel.className = 'section-card'
  iniEditorPanel.innerHTML = `
    <div class="section-header" style="display:flex;align-items:center;justify-content:space-between">
      <span style="display:flex;align-items:center;gap:8px"><span class="section-accent" style="background:#2ecc71"></span><span class="section-title" style="color:#2ecc71"><i class="fa fa-file-pen"></i> ${tUI('fivemIniEditorTitle')}</span></span>
      <div style="display:flex;gap:6px">
        <button class="btn btn-ghost btn-sm" id="fivem-ini-reload-btn" onclick="fivemIniEditorLoad()" style="font-size:9px"><i class="fa fa-rotate"></i> ${tUI('fivemIniReload')}</button>
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('fivem-ini-editor-panel').style.display='none'" style="font-size:9px"><i class="fa fa-xmark"></i></button>
      </div>
    </div>
    <div style="padding:0 18px 6px;font-size:9.5px;color:var(--muted)">${tUI('fivemIniEditorDesc')}</div>
    <div id="fivem-ini-editor-body" style="padding:0 18px 14px">
      <div style="color:var(--muted);font-size:10px"><i class="fa fa-spinner fa-spin"></i> ${tUI('fivemIniLoading')}</div>
    </div>
  `
  c.appendChild(iniEditorPanel)

  // ── Server Bookmarks panel (hidden until opened) ─────────────────────────
  const bookmarksPanel = document.createElement('div')
  bookmarksPanel.id = 'fivem-bookmarks-panel'
  bookmarksPanel.style.cssText = 'display:none;margin-bottom:10px;border:1px solid rgba(52,152,219,0.25)'
  bookmarksPanel.className = 'section-card'
  bookmarksPanel.innerHTML = `
    <div class="section-header" style="display:flex;align-items:center;justify-content:space-between">
      <span style="display:flex;align-items:center;gap:8px"><span class="section-accent" style="background:#3498db"></span><span class="section-title" style="color:#3498db"><i class="fa fa-server"></i> ${tUI('fivemBookmarksTitle')}</span></span>
      <button class="btn btn-ghost btn-sm" onclick="document.getElementById('fivem-bookmarks-panel').style.display='none';fivemBookmarksClearRefresh()" style="font-size:9px"><i class="fa fa-xmark"></i></button>
    </div>
    <div style="padding:0 18px 6px;font-size:9.5px;color:var(--muted)">${tUI('fivemBookmarksDesc')}</div>
    <div style="padding:0 18px 10px;display:flex;gap:7px;align-items:center">
      <input id="fivem-bm-input" type="text" placeholder="${tUI('fivemBookmarksAddPlaceholder')}" style="flex:1;padding:5px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card2,#1a1a1a);color:var(--fg);font-size:11px" onkeydown="if(event.key==='Enter')fivemBookmarkAdd()">
      <button class="btn btn-primary btn-sm" onclick="fivemBookmarkAdd()" style="font-size:10px;white-space:nowrap"><i class="fa fa-plus"></i> ${tUI('fivemBookmarksAddBtn')}</button>
    </div>
    <div id="fivem-bookmarks-list" style="padding:0 18px 14px"></div>
  `
  c.appendChild(bookmarksPanel)

  // ── Search bar ────────────────────────────────────────────────────────────
  const searchWrap = document.createElement('div')
  searchWrap.className = 'search-bar-wrap'
  searchWrap.innerHTML = `<i class="fa fa-magnifying-glass"></i><input class="search-bar-input" placeholder="${tUI('genSearchPlaceholder')}" oninput="fivemFilterTweaks(this.value)">`
  c.appendChild(searchWrap)

  // ── System Tweaks sections ─────────────────────────────────────────────────
  const sectionLabel = document.createElement('div')
  sectionLabel.className = 'fivem-section-label'
  sectionLabel.innerHTML = `<i class="fa fa-gears"></i> ${tUI('fivemSectionLabel')}`
  c.appendChild(sectionLabel)

  sections.forEach((sec, idx) => {
    const card = makeSection(sec.title)
    // wrap content in a collapsible body div
    const bodyWrap = document.createElement('div')
    bodyWrap.id = `fivem-sec-${idx}-body`
    // move rows into the body wrap; we'll insert them below
    sec.rows.forEach(row => {
      if (row.id === 'fivem-clear-cache-btn') {
        const r = document.createElement('div')
        r.className = 'tweak-row'
        r.innerHTML = `
          <div class="tweak-info"><div class="tweak-name">${tName(row.id) || row.name}</div><div class="tweak-desc">${tDesc(row.id) || row.desc}</div></div>
          <div class="tweak-right">
            <button class="btn btn-primary btn-sm" onclick="doFivemClearCache(this)">${tUI('apply')}</button>
          </div>
          <div class="tweak-progress" id="prog-fivem-cache"><div class="tweak-progress-bar indeterminate" id="prog-bar-fivem-cache" style="display:none"></div></div>
        `
        bodyWrap.appendChild(r)
      } else {
        bodyWrap.appendChild(makeRow(row))
      }
    })
    card.appendChild(bodyWrap)
    // add chevron toggle to section header
    const hdr = card.querySelector('.section-header')
    if (hdr) {
      hdr.style.cursor = 'pointer'
      hdr.style.userSelect = 'none'
      const chev = document.createElement('i')
      chev.className = 'fa fa-chevron-down'
      chev.id = `fivem-sec-${idx}-chevron`
      chev.style.cssText = 'margin-left:auto;font-size:10px;transition:transform 0.2s;color:var(--muted)'
      hdr.appendChild(chev)
      hdr.onclick = () => toggleFivemSection(idx)
    }
    c.appendChild(card)
  })

  c.appendChild(makeTip(tUI('fivemGpuRebootTip'), 'warning'))
  c.appendChild(makeTip(tUI('fivemCfgTip'), 'warning'))

  // ── Mod Conflict Detector ────────────────────────────────────────────────────
  const modCard = makeSection(`<i class="fa fa-triangle-exclamation"></i> ${tUI('fivemModConflictTitle')}`, tUI('fivemModSectionSub'))
  const modActions = document.createElement('div')
  modActions.style.cssText = 'padding:8px 18px 4px;display:flex;gap:8px;align-items:center'
  modActions.innerHTML = `
    <button class="btn btn-info btn-sm" id="fivem-mod-scan-btn" onclick="doFivemModScan(this)"><i class="fa fa-magnifying-glass"></i> ${tUI('fivemModScanBtn')}</button>
    <span id="fivem-mod-status" style="font-size:10px;color:var(--muted)">${tUI('fivemModScanStatus')}</span>
  `
  modCard.appendChild(modActions)
  const modList = document.createElement('div')
  modList.id = 'fivem-mod-list'
  modCard.appendChild(modList)
  c.appendChild(modCard)

  // ── CitizenFX Log Viewer ───────────────────────────────────────────────────
  const logCard = makeSection(`<i class="fa fa-file-lines"></i> ${tUI('fivemLogTitle')}`)
  const logBody = document.createElement('div')
  logBody.id = 'fivem-sec-99-body'
  logBody.style.display = 'none'
  logBody.innerHTML = `
    <div style="padding:0 18px 8px;display:flex;gap:8px;align-items:center">
      <button class="btn btn-secondary btn-sm" onclick="loadFivemLog()"><i class="fa fa-rotate"></i> ${tUI('fivemLogRefresh')}</button>
      <button class="btn btn-ghost btn-sm" id="fivem-log-classify-btn" onclick="fivemClassifyLog()" style="color:#9b59b6;border-color:rgba(155,89,182,0.3)" onmouseenter="this.style.background='rgba(155,89,182,0.08)'" onmouseleave="this.style.background=''"><i class="fa fa-magnifying-glass-chart"></i> ${tUI('fivemLogClassify')}</button>
      <input id="fivem-log-filter" type="text" placeholder="${tUI('fivemLogFilter')}" oninput="filterFivemLog()" style="flex:1;padding:5px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card2,#1a1a1a);color:var(--fg);font-size:11px">
    </div>
    <div id="fivem-log-diagnose-out" style="display:none;margin:0 18px 8px;background:rgba(155,89,182,0.07);border:1px solid rgba(155,89,182,0.2);border-radius:8px;padding:10px 12px;font-size:10.5px;color:#c0c0c0;line-height:1.6"></div>
    <div id="fivem-log-box" style="margin:0 18px 14px;background:var(--bg-card2,#1a1a1a);border:1px solid var(--border);border-radius:8px;padding:10px;font-family:monospace;font-size:10px;color:var(--muted);max-height:280px;overflow-y:auto;white-space:pre-wrap;line-height:1.5">${tUI('fivemLogLoading')}</div>
  `
  const logHdr = logCard.querySelector('.section-header')
  if (logHdr) {
    logHdr.style.cursor = 'pointer'
    logHdr.style.userSelect = 'none'
    const logChev = document.createElement('i')
    logChev.className = 'fa fa-chevron-down'
    logChev.id = 'fivem-sec-99-chevron'
    logChev.style.cssText = 'margin-left:auto;font-size:10px;transition:transform 0.2s;color:var(--muted);transform:rotate(-90deg)'
    logHdr.appendChild(logChev)
    logHdr.onclick = () => toggleFivemSection(99)
  }
  logCard.appendChild(logBody)
  c.appendChild(logCard)

  // ── Session History ───────────────────────────────────────────────────────
  const sessionHistCard = makeSection(`<i class="fa fa-clock-rotate-left"></i> ${tUI('fivemSessionHistoryTitle')}`)
  const sessionHistBody = document.createElement('div')
  sessionHistBody.id = 'fivem-sec-98-body'
  sessionHistBody.style.display = 'none'
  sessionHistBody.innerHTML = `
    <div style="padding:0 18px 6px;font-size:9.5px;color:var(--muted)">${tUI('fivemSessionHistoryDesc')}</div>
    <div id="fivem-session-hist-list" style="padding:0 18px 14px"></div>
    <div style="padding:0 18px 10px">
      <button class="btn btn-ghost btn-sm" style="font-size:9px;color:var(--danger)" onclick="fivemSessionHistClear()"><i class="fa fa-trash"></i> ${tUI('fivemSessionHistoryClear')}</button>
    </div>
  `
  const sessionHistHdr = sessionHistCard.querySelector('.section-header')
  if (sessionHistHdr) {
    sessionHistHdr.style.cursor = 'pointer'
    sessionHistHdr.style.userSelect = 'none'
    const sessionChev = document.createElement('i')
    sessionChev.className = 'fa fa-chevron-down'
    sessionChev.id = 'fivem-sec-98-chevron'
    sessionChev.style.cssText = 'margin-left:auto;font-size:10px;transition:transform 0.2s;color:var(--muted);transform:rotate(-90deg)'
    sessionHistHdr.appendChild(sessionChev)
    sessionHistHdr.onclick = () => toggleFivemSection(98)
  }
  sessionHistCard.appendChild(sessionHistBody)
  c.appendChild(sessionHistCard)

  // Render initial session history
  fivemSessionHistRender()

  // Listen for ARIA session summaries (fires when FiveM/GTA5 exits)
  api.onAriaSessionSummary(summary => {
    const game = (summary.game || '').toLowerCase()
    if (!game.includes('fivem') && !game.includes('gta') && !game.includes('citizen')) return
    fivemSessionHistRecord(summary)
    // Refresh display if the session history section is visible
    if (document.getElementById('fivem-sec-98-body')?.style.display !== 'none') {
      fivemSessionHistRender()
    }
  })

  // ── Restore collapsed sections + initial progress ─────────────────────────
  const collapsed = JSON.parse(localStorage.getItem('fivem_sec_collapsed') || '[]')
  collapsed.forEach(idx => {
    const body = document.getElementById(`fivem-sec-${idx}-body`)
    const chev = document.getElementById(`fivem-sec-${idx}-chevron`)
    if (body) body.style.display = 'none'
    if (chev) chev.style.transform = 'rotate(-90deg)'
  })
}

function fivemFilterTweaks(query) {
  const q = query.trim().toLowerCase()
  const content = document.getElementById('page-content')
  if (!content) return
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  content.querySelectorAll('.tweak-row').forEach(row => {
    const visible = !q || row.textContent.toLowerCase().includes(q)
    row.style.display = visible ? '' : 'none'
    if (visible) {
      const nameEl = row.querySelector('.tweak-name')
      const descEl = row.querySelector('.tweak-desc')
      const highlight = el => {
        if (!el) return
        const text = el.textContent
        if (!q) { el.innerHTML = text; return }
        el.innerHTML = text.replace(new RegExp(`(${esc(q)})`, 'gi'), '<mark style="background:rgba(255,46,99,0.3);color:inherit;border-radius:2px">$1</mark>')
      }
      highlight(nameEl)
      highlight(descEl)
    }
  })
  content.querySelectorAll('.section-card').forEach(sec => {
    const anyVisible = [...sec.querySelectorAll('.tweak-row')].some(r => r.style.display !== 'none')
    sec.style.display = anyVisible ? '' : 'none'
  })
}

function toggleFivemSection(idx) {
  const body = document.getElementById(`fivem-sec-${idx}-body`)
  const chev = document.getElementById(`fivem-sec-${idx}-chevron`)
  if (!body) return
  const collapsed = JSON.parse(localStorage.getItem('fivem_sec_collapsed') || '[]')
  const isCollapsed = collapsed.includes(idx)
  if (isCollapsed) {
    body.style.display = ''
    if (chev) chev.style.transform = ''
    localStorage.setItem('fivem_sec_collapsed', JSON.stringify(collapsed.filter(i => i !== idx)))
  } else {
    body.style.display = 'none'
    if (chev) chev.style.transform = 'rotate(-90deg)'
    localStorage.setItem('fivem_sec_collapsed', JSON.stringify([...collapsed, idx]))
  }
}

function copyFivemReport() {
  const allIds = [
    'fivem-priority','fivem-io-priority','fivem-mmcss','fivem-fso','fivem-gamebar',
    'fivem-gpu','fivem-network','fivem-vm','fivem-streaming-mem','fivem-commandline',
    'fivem-worker-threads','fivem-disable-crash-reporter','fivem-disable-anticheat-upload',
    'fivem-disable-update-checks','fivem-preload-ipl','fivem-reduce-draw-distance',
    'fivem-defender','fivem-hang-fix','fivem-mouse-accel','fivem-power-plan',
  ]
  const s = settings || {}
  const applied = allIds.filter(id => s[`tweak_${id}`] === 'applied')
  const score = calcOptScore(s)
  const text = `Jylli Tool — FiveM Optimization Report\nApplied tweaks: ${applied.join(', ') || 'none'}\nOptimization score: ${score}\nGenerated: ${new Date().toLocaleString()}`
  navigator.clipboard.writeText(text).then(() => toast('', tUI('fivemReportCopied'), 'success', 2500))
}

let _fivemLogLines = []
async function loadFivemLog() {
  const box = document.getElementById('fivem-log-box')
  if (!box) return
  box.textContent = tUI('fivemLogLoading')
  const res = await api.fivemReadLog()
  if (!res.ok) { box.textContent = res.error || 'Error reading log'; return }
  _fivemLogLines = res.lines
  filterFivemLog()
}
function filterFivemLog() {
  const box = document.getElementById('fivem-log-box')
  if (!box) return
  const q = (document.getElementById('fivem-log-filter')?.value || '').toLowerCase()
  const filtered = q ? _fivemLogLines.filter(l => l.toLowerCase().includes(q)) : _fivemLogLines
  box.innerHTML = filtered.map(l => {
    const safe = l.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    const style = /\[error\]|error:/i.test(l) ? 'color:var(--danger)' : /\[warn\]|warning:/i.test(l) ? 'color:var(--warning)' : ''
    return `<span style="${style}">${safe}</span>`
  }).join('\n') || '<span style="color:var(--muted)">No lines to show</span>'
}

// ── CitizenFX.log Error Pattern Classifier ────────────────────────────────────
const CITIZENFX_ERROR_PATTERNS = [
  { pattern: /StreamingMemory exhausted|streaming memory/i,       fix: 'Increase StreamingMemory in CitizenFX.ini (try 1024–1536 MB). Open the ini editor above.' },
  { pattern: /DXGI.*device removed|device hung|DXGI_ERROR_DEVICE_REMOVED/i, fix: 'GPU driver crash detected. Update to latest GPU driver. If already updated, check GPU temperatures — may indicate thermal throttling.' },
  { pattern: /Citizen\.GameLoad.*timed out|game load.*timed out/i, fix: 'Game load timeout — likely a mod conflict or corrupted resource. Disable all extra resources and re-enable one by one.' },
  { pattern: /ERR_GFX_D3D_INIT|d3d init/i,                        fix: 'DirectX initialization failed. Run DirectX Diagnostic (dxdiag.exe), verify .NET and VC++ redistributables are installed.' },
  { pattern: /connection to the server timed out|lost connection/i, fix: 'Connection timeout — check server status. If issue persists, try applying FiveM network tweaks in the Network section.' },
  { pattern: /failed to load .+\.dll/i,                            fix: 'Missing DLL dependency. Re-run the FiveM installer or reinstall Visual C++ 2019/2022 redistributables.' },
  { pattern: /out of memory|not enough memory/i,                   fix: 'Out of memory — lower StreamingMemory or close background apps. Consider increasing Windows page file size.' },
  { pattern: /breakpad.*crash|unhandled exception/i,               fix: 'Client crash detected. Check if a recent mod or CitizenFX.ini change coincides. Try verifying FiveM cache.' },
  { pattern: /hitch.*warn|hitch.*ms/i,                             fix: 'Frame hitches detected — world loading stutter. Increase StreamingMemory and reduce MaxLodDistance in CitizenFX.ini.' },
  { pattern: /can't open pack file|pack file.*failed/i,            fix: 'Asset pack failed to load — FiveM install may be corrupt. Clear game cache from the FiveM Cache section.' },
  { pattern: /network thread.*blocked|network packet.*dropped/i,   fix: 'Network thread issue detected. Apply FiveM network tweaks or check for background bandwidth usage.' },
  { pattern: /shader.*compilation|shader.*failed/i,                fix: 'Shader compilation error — delete the shader cache (fivem-data/cache/dx11 folder) and relaunch FiveM.' },
]

async function fivemClassifyLog() {
  const btn   = document.getElementById('fivem-log-classify-btn')
  const out   = document.getElementById('fivem-log-diagnose-out')
  if (!out) return

  if (!_fivemLogLines || _fivemLogLines.length === 0) {
    await loadFivemLog()
  }
  if (!_fivemLogLines || _fivemLogLines.length === 0) {
    out.style.display = ''
    out.innerHTML = `<span style="color:var(--muted)">${tUI('fivemLogNoErrors')}</span>`
    return
  }

  if (btn) { btn.disabled = true; btn.innerHTML = `<i class="fa fa-spinner fa-spin"></i> ${tUI('fivemLogClassifying')}` }
  out.style.display = ''
  out.innerHTML = `<i class="fa fa-spinner fa-spin" style="color:#9b59b6;margin-right:6px"></i>${tUI('fivemLogClassifying')}`

  // 1. Local pattern scan
  const last200 = _fivemLogLines.slice(-200)
  const matches = []
  for (const { pattern, fix } of CITIZENFX_ERROR_PATTERNS) {
    const matchingLines = last200.filter(l => pattern.test(l))
    if (matchingLines.length > 0) {
      matches.push({ sample: matchingLines[matchingLines.length - 1].slice(0, 120), fix })
    }
  }

  if (matches.length > 0) {
    const items = matches.map(m =>
      `<div style="margin-bottom:8px;padding:7px 10px;background:rgba(255,255,255,0.03);border-left:3px solid #9b59b6;border-radius:0 6px 6px 0">
        <div style="font-size:9px;color:var(--muted);margin-bottom:3px;font-family:monospace">${m.sample.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
        <div style="font-size:11px;color:#c0c0c0"><i class="fa fa-wrench" style="color:#9b59b6;margin-right:5px;font-size:9px"></i>${m.fix}</div>
      </div>`
    ).join('')
    out.innerHTML = `<div style="font-size:9px;font-weight:700;color:#9b59b6;text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px"><i class="fa fa-triangle-exclamation" style="margin-right:5px"></i>${matches.length} known pattern${matches.length > 1 ? 's' : ''} detected</div>${items}`
  } else {
    out.innerHTML = `<span style="color:var(--muted)">${tUI('fivemLogNoErrors')}</span>`
  }

  if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fa fa-magnifying-glass-chart"></i> ${tUI('fivemLogClassify')}` }
}

async function doFivemModScan(btn) {
  btn.disabled = true
  btn.innerHTML = `<i class="fa fa-spinner fa-spin"></i> ${tUI('fivemScanningStatus')}`
  const status = document.getElementById('fivem-mod-status')
  const list = document.getElementById('fivem-mod-list')
  if (status) status.textContent = tUI('fivemScanningStatus')
  if (list) list.innerHTML = ''

  const r = await api.fivemScanMods()
  btn.disabled = false
  btn.innerHTML = `<i class="fa fa-magnifying-glass"></i> ${tUI('fivemScanAgain')}`

  if (!r.ok) {
    if (status) status.textContent = tUI('fivemScanFailed')
    return
  }

  const cachedNote = r.cached ? ' (cached)' : ''
  const scannedText = r.scanned.length ? `${r.scanned.length} ${tUI('fivemScannedFolders')}` : tUI('fivemNoFolders')
  if (status) status.textContent = r.found.length ? `${r.found.length} ${tUI('fivemIssuesFound')} · ${scannedText}${cachedNote}` : `${tUI('fivemNoConflicts')} · ${scannedText}${cachedNote}`

  if (!list) return

  const sevColor = { high: 'var(--danger)', medium: 'var(--warning)', low: 'var(--muted)' }
  const sevIcon  = { high: 'fa-circle-xmark', medium: 'fa-triangle-exclamation', low: 'fa-circle-info' }

  const html = !r.found.length
    ? `<div style="padding:14px 18px;font-size:11px;color:var(--success)"><i class="fa fa-circle-check"></i> ${tUI('fivemCleanResult')}</div>`
    : r.found.map(item => `
        <div class="mod-conflict-row">
          <i class="fa ${sevIcon[item.severity] || 'fa-circle-info'}" style="color:${sevColor[item.severity] || 'var(--muted)'};font-size:13px;flex-shrink:0"></i>
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;font-weight:700;color:var(--white)">${item.name} <span style="font-size:9px;color:var(--muted);font-weight:400">· ${item.file}</span></div>
            <div style="font-size:10px;color:var(--muted);margin-top:2px">${item.reason}</div>
            <div style="font-size:9px;color:#333;margin-top:1px;font-style:italic">${item.dir}</div>
          </div>
          <span class="mod-sev-badge sev-${item.severity}">${item.severity.toUpperCase()}</span>
        </div>`).join('')
  requestAnimationFrame(() => { list.innerHTML = html })
}

async function doFivemClearCache(btn) {
  btn.disabled = true
  btn.innerHTML = `<i class="fa fa-spinner fa-spin"></i> ${tUI('fivemScanningStatus')}`
  const r = await api.fivemClearCache()
  btn.disabled = false
  if (!r.ok && r.gameRunning) {
    btn.innerHTML = `<i class="fa fa-triangle-exclamation"></i> ${tUI('apply')}`
    toast(tUI('fivemCacheErrorGameRunning'), '', 'warn')
    return
  }
  btn.innerHTML = r.ok ? `<i class="fa fa-check"></i> ${tUI('fivemCacheCleared')}` : `<i class="fa fa-xmark"></i> ${tUI('fivemCacheError')}`
}

// ── HUD open/close toggle ─────────────────────────────────────────────────────
function fivemHudToggle() {
  if (_fivemHudOpen) {
    api.closeFivemHud()
    _fivemHudOpen = false
  } else {
    api.openFivemHud()
    _fivemHudOpen = true
  }
  const lbl = document.getElementById('fivem-hud-toggle-label')
  if (lbl) lbl.innerHTML = _fivemHudOpen
    ? `<i class="fa fa-circle-stop"></i> ${tUI('fivemHeroHudClose')}`
    : `<i class="fa fa-circle-play"></i> ${tUI('fivemHeroHudOpen')}`
}

// ── HUD auto-show toggle ──────────────────────────────────────────────────────
async function fivemHudAutoToggle(enabled) {
  settings.fivemHudEnabled = enabled
  await api.saveSettings(settings).catch(() => {})
}

// ── 2i: Session History ───────────────────────────────────────────────────────
function fivemSessionHistLoad() {
  try { return JSON.parse(localStorage.getItem('fivem_session_history') || '[]') } catch { return [] }
}
function fivemSessionHistSave(sessions) {
  localStorage.setItem('fivem_session_history', JSON.stringify(sessions.slice(-10)))
}

function fivemSessionHistRecord(summary) {
  const sessions = fivemSessionHistLoad()
  sessions.push({
    ts: Date.now(),
    game: summary.game || 'FiveM',
    durationMs: summary.durationMs || 0,
    peaks: summary.peaks || {},
    anomalyCount: Object.values(summary.anomalyCounts || {}).reduce((a, b) => a + b, 0),
  })
  fivemSessionHistSave(sessions)
}

function fivemSessionHistClear() {
  localStorage.removeItem('fivem_session_history')
  fivemSessionHistRender()
}

function fivemSessionHistRender() {
  const list = document.getElementById('fivem-session-hist-list')
  if (!list) return
  const sessions = fivemSessionHistLoad()
  if (!sessions.length) {
    list.innerHTML = `<div style="font-size:10.5px;color:var(--muted);padding:4px 0">${tUI('fivemSessionHistoryEmpty')}</div>`
    return
  }
  const fmt = ms => `${Math.round(ms / 60000)} ${tUI('fivemSessionHistoryMin')}`
  const date = ts => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  list.innerHTML = [...sessions].reverse().map((s, i) => {
    const p = s.peaks || {}
    const peakItems = [
      p.cpu  != null ? `CPU ${p.cpu}%`  : null,
      p.gpu  != null ? `GPU ${p.gpu}%`  : null,
      p.ram  != null ? `RAM ${p.ram}%`  : null,
    ].filter(Boolean).join(' · ')
    const anomalyBadge = s.anomalyCount > 0
      ? `<span style="font-size:9px;padding:1px 6px;border-radius:3px;background:rgba(243,156,18,0.15);color:#f39c12">${s.anomalyCount} ${tUI('fivemSessionHistoryAnomalies')}</span>`
      : `<span style="font-size:9px;color:#2ecc71"><i class="fa fa-circle-check"></i> Clean</span>`
    return `
      <div style="padding:8px 0;border-bottom:1px solid #111;display:flex;align-items:center;gap:10px">
        <div style="width:32px;height:32px;border-radius:6px;background:rgba(255,46,99,0.1);display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i class="fa fa-gamepad" style="color:var(--pink);font-size:13px"></i>
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
            <span style="font-size:10.5px;font-weight:700;color:#c0c0c0">${s.game}</span>
            ${anomalyBadge}
          </div>
          <div style="font-size:9.5px;color:var(--muted)">${date(s.ts)} · ${fmt(s.durationMs)}${peakItems ? ` · ${tUI('fivemSessionHistoryPeaks')}: ${peakItems}` : ''}</div>
        </div>
      </div>`
  }).join('')
}

// ── 2g: Share My Setup — Export / Import .jyt packs ──────────────────────────
async function fivemExportPack(btn) {
  btn.disabled = true
  btn.innerHTML = `<i class="fa fa-spinner fa-spin"></i> ${tUI('fivemShareExporting')}`
  const r = await api.fivemExportPack().catch(() => null)
  btn.disabled = false
  btn.innerHTML = `<i class="fa fa-upload"></i> ${tUI('fivemHeroShareExport')}`
  if (!r || r.canceled) return
  if (!r.ok) { toast('', tUI('fivemShareExportFail'), 'error'); return }
  toast('', tUI('fivemShareExportOk'), 'success', 4000)
}

async function fivemImportPack(btn) {
  btn.disabled = true
  btn.innerHTML = `<i class="fa fa-spinner fa-spin"></i> ${tUI('fivemShareImporting')}`
  const r = await api.fivemImportPack().catch(() => null)
  btn.disabled = false
  btn.innerHTML = `<i class="fa fa-download"></i> ${tUI('fivemHeroShareImport')}`
  if (!r || r.canceled) return
  if (!r.ok) {
    const msg = r.error === 'invalid_schema' ? tUI('fivemShareImportBadSchema') : tUI('fivemShareImportFail')
    toast('', msg, 'error')
    return
  }
  const n = r.results?.tweaks?.length ?? 0
  toast('', tUI('fivemShareImportOk').replace('{n}', n), 'success', 4000)
  settings = await api.loadSettings().catch(() => settings)
}

// ── 2f: Server Bookmarks & Quick-Connect ─────────────────────────────────────
let _bmRefreshInterval = null

function fivemBookmarksClearRefresh() {
  clearInterval(_bmRefreshInterval)
  _bmRefreshInterval = null
}

async function fivemOpenBookmarks() {
  const panel = document.getElementById('fivem-bookmarks-panel')
  if (!panel) return
  panel.style.display = ''
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  fivemBookmarksRender()
  fivemBookmarksRefreshAll()
  fivemBookmarksClearRefresh()
  _bmRefreshInterval = setInterval(() => {
    if (document.getElementById('fivem-bookmarks-panel')?.style.display === 'none') {
      fivemBookmarksClearRefresh(); return
    }
    fivemBookmarksRefreshAll()
  }, 60000)
}

function fivemBookmarksLoad() {
  try { return JSON.parse(localStorage.getItem('fivem_bookmarks') || '[]') } catch { return [] }
}
function fivemBookmarksSave(bms) {
  localStorage.setItem('fivem_bookmarks', JSON.stringify(bms))
}

async function fivemBookmarksRender() {
  const list = document.getElementById('fivem-bookmarks-list')
  if (!list) return
  const bms = fivemBookmarksLoad()
  if (!bms.length) {
    list.innerHTML = `<div style="font-size:10.5px;color:var(--muted);padding:4px 0">${tUI('fivemBookmarksEmpty')}</div>`
    return
  }
  // Load available game bundles for link dropdown
  const bundles = await api.listGameBundles().catch(() => ({}))
  const bundleNames = Object.keys(bundles).filter(k => bundles[k]?.type === 'gameBundle')

  list.innerHTML = bms.map((bm, i) => {
    const statusDot = bm.online === false
      ? `<span style="width:8px;height:8px;border-radius:50%;background:#e74c3c;display:inline-block;flex-shrink:0"></span>`
      : bm.online === true
      ? `<span style="width:8px;height:8px;border-radius:50%;background:#2ecc71;display:inline-block;flex-shrink:0"></span>`
      : `<span style="width:8px;height:8px;border-radius:50%;background:#888;display:inline-block;flex-shrink:0"></span>`
    const nameStr  = bm.name  || `${bm.host}:${bm.port}`
    const countStr = bm.online === true
      ? `${bm.players}/${bm.maxClients} ${tUI('fivemBookmarksPlayers')} · ${bm.pingMs}ms`
      : bm.online === false ? tUI('fivemBookmarksOffline') : tUI('fivemBookmarksPinging')
    const mapStr   = bm.mapName ? `<span style="font-size:9px;color:var(--muted)"> · ${bm.mapName}</span>` : ''
    const linkedStr = bm.linkedBundle
      ? `<span style="font-size:9px;color:#9b59b6"><i class="fa fa-layer-group"></i> ${tUI('fivemBookmarksLinked')} ${bm.linkedBundle}</span>`
      : ''
    const bundleOpts = bundleNames.length
      ? `<option value="">${tUI('fivemBookmarksLinkProfile')}</option>` + bundleNames.map(n => `<option value="${n}" ${bm.linkedBundle === n ? 'selected' : ''}>${n}</option>`).join('')
      : `<option value="">${tUI('fivemBookmarksNoProfiles')}</option>`
    return `
      <div style="padding:8px 0;border-bottom:1px solid #111" id="fivem-bm-row-${i}">
        <div style="display:flex;align-items:center;gap:10px">
          ${statusDot}
          <div style="flex:1;min-width:0">
            <div style="font-size:10.5px;font-weight:700;color:#c0c0c0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nameStr}${mapStr}</div>
            <div style="font-size:9.5px;color:var(--muted)">${bm.host}:${bm.port} · ${countStr}</div>
            ${linkedStr}
          </div>
          <button class="btn btn-primary btn-sm" style="font-size:9px;padding:3px 10px" id="fivem-bm-connect-${i}" onclick="fivemBookmarkConnect(${i}, this)"><i class="fa fa-play"></i> ${tUI('fivemBookmarksConnect')}</button>
          <button class="btn btn-ghost btn-sm" style="font-size:9px;color:var(--danger)" onclick="fivemBookmarkRemove(${i})"><i class="fa fa-trash"></i></button>
        </div>
        <div style="margin-top:5px;padding-left:18px">
          <select style="font-size:9px;padding:2px 6px;border-radius:4px;border:1px solid var(--border);background:var(--bg-card2,#1a1a1a);color:var(--muted)" onchange="fivemBookmarkSetBundle(${i},this.value)">
            ${bundleOpts}
          </select>
        </div>
      </div>`
  }).join('')
}

async function fivemBookmarksRefreshAll() {
  const bms = fivemBookmarksLoad()
  if (!bms.length) return
  await Promise.all(bms.map(async (bm, i) => {
    let r = null
    if (bm.cfxCode) {
      r = await api.fivemCfxServerInfo(bm.cfxCode).catch(() => null)
    }
    if (!r?.ok) {
      r = await api.fivemServerPing({ host: bm.host, port: bm.port }).catch(() => null)
    }
    if (r?.ok) {
      bm.online = true
      bm.name = r.name; bm.mapName = r.mapName
      bm.players = r.players; bm.maxClients = r.maxClients
      if (r.pingMs != null) bm.pingMs = r.pingMs
    } else {
      bm.online = false
    }
    bms[i] = bm
  }))
  fivemBookmarksSave(bms)
  fivemBookmarksRender()
}

async function fivemBookmarkConnect(idx, btn) {
  const bms = fivemBookmarksLoad()
  const bm = bms[idx]
  if (!bm) return
  // Apply linked bundle profile before connecting
  if (bm.linkedBundle) {
    if (btn) { btn.disabled = true; btn.innerHTML = `<i class="fa fa-spinner fa-spin"></i> ${tUI('fivemBookmarksApplyingProfile')}` }
    await api.loadGameBundle(bm.linkedBundle).catch(() => null)
    toast('', tUI('fivemBookmarksProfileApplied'), 'ok', 2500)
    if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fa fa-play"></i> ${tUI('fivemBookmarksConnect')}` }
  }
  api.openExternal(`fivem://connect/${bm.host}:${bm.port}`)
}

function fivemBookmarkSetBundle(idx, bundleName) {
  const bms = fivemBookmarksLoad()
  if (!bms[idx]) return
  bms[idx].linkedBundle = bundleName || null
  fivemBookmarksSave(bms)
}

function fivemBookmarkRemove(idx) {
  const bms = fivemBookmarksLoad()
  bms.splice(idx, 1)
  fivemBookmarksSave(bms)
  fivemBookmarksRender()
}

async function fivemBookmarkAdd() {
  const input = document.getElementById('fivem-bm-input')
  if (!input) return
  let raw = input.value.trim()

  // Resolve cfx.re shortlinks → fetch IP:port + server info from FiveM servers API
  let cfxMeta = null
  const cfxMatch = raw.match(/cfx\.re\/join\/([A-Za-z0-9]+)/i)
  if (cfxMatch) {
    const addBtn = document.querySelector('#fivem-bookmarks-panel .btn-primary')
    const origHtml = addBtn?.innerHTML
    if (addBtn) { addBtn.disabled = true; addBtn.innerHTML = `<i class="fa fa-spinner fa-spin"></i>` }
    const r = await api.fivemResolveShortlink(cfxMatch[1]).catch(() => null)
    if (addBtn) { addBtn.disabled = false; addBtn.innerHTML = origHtml }
    if (!r?.ok) {
      toast('', tUI('fivemBookmarksShortlinkFail'), 'error', 3500)
      shakeInput(input)
      return
    }
    raw = `${r.host}:${r.port}`
    cfxMeta = { cfxCode: cfxMatch[1], name: r.name, mapName: r.mapName, players: r.players, maxClients: r.maxClients }
  }

  const portMatch = raw.match(/^([A-Za-z0-9.\-]+):(\d+)$/)
  if (!portMatch) { toast('', tUI('fivemBookmarksInvalid'), 'warn', 3000); shakeInput(input); return }
  const [, host, port] = portMatch

  const bms = fivemBookmarksLoad()
  if (bms.length >= 5) { toast('', tUI('fivemBookmarksMaxServers'), 'warn', 3000); return }
  if (bms.some(b => b.host === host && b.port === port)) { toast('', tUI('fivemBookmarksDupe'), 'warn', 3000); return }

  bms.push({
    host, port,
    online:     cfxMeta ? true : null,
    name:       cfxMeta?.name       ?? null,
    mapName:    cfxMeta?.mapName    ?? null,
    players:    cfxMeta?.players    ?? 0,
    maxClients: cfxMeta?.maxClients ?? 0,
    pingMs:     null,
    cfxCode:    cfxMeta?.cfxCode    ?? null,
  })
  fivemBookmarksSave(bms)
  input.value = ''
  fivemBookmarksRender()
  fivemBookmarksRefreshAll()
}

// ── 2a: CFX Server Health ────────────────────────────────────────────────────
function fivemOpenServerHealth() {
  const panel = document.getElementById('fivem-health-panel')
  if (!panel) return
  panel.style.display = ''
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

async function fivemRunServerHealth() {
  const btn = document.getElementById('fivem-health-run-btn')
  const body = document.getElementById('fivem-health-body')
  if (!body) return
  if (btn) { btn.disabled = true; btn.innerHTML = `<i class="fa fa-spinner fa-spin"></i>` }
  body.innerHTML = `<div style="color:var(--muted);font-size:10px;padding:8px 0"><i class="fa fa-spinner fa-spin"></i> Pinging CFX endpoints (5 pings × 3 hosts)…</div>`

  const r = await api.fivemServerHealth().catch(() => null)
  if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fa fa-play"></i> ${tUI('fivemHealthRunBtn')}` }
  if (!r || !r.ok) { body.innerHTML = `<div style="color:var(--danger);font-size:10px">Test failed — check your internet connection.</div>`; return }

  const statusColor = { good: '#2ecc71', medium: '#f39c12', high: '#e74c3c', timeout: '#888', loss: '#e74c3c' }
  const statusLabel = { good: tUI('fivemHealthGood'), medium: tUI('fivemHealthMedium'), high: tUI('fivemHealthHigh'), timeout: tUI('fivemHealthTimeout'), loss: tUI('fivemHealthLoss') }

  let tips = []
  const rows = r.results.map(h => {
    const col = statusColor[h.status] || '#888'
    const lbl = statusLabel[h.status] || h.status
    const stats = h.avg !== null
      ? `${tUI('fivemHealthMin')} ${h.min}ms · ${tUI('fivemHealthAvg')} ${h.avg}ms · ${tUI('fivemHealthMax')} ${h.max}ms · ${tUI('fivemHealthJitter')} ${h.jitter}ms`
      : '—'
    if (h.packetLoss > 0) tips.push('loss')
    if (h.avg !== null && h.avg > 80) tips.push('dns')
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid #111;font-size:10px">
        <div style="width:9px;height:9px;border-radius:50%;background:${col};flex-shrink:0"></div>
        <div style="flex:1">
          <div style="font-weight:700;color:#c0c0c0">${h.name}</div>
          <div style="color:var(--muted)">${stats}</div>
        </div>
        <div style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:4px;background:${col}22;color:${col}">${lbl}${h.packetLoss > 0 ? ` · ${h.packetLoss}% loss` : ''}</div>
      </div>`
  }).join('')

  const uniqueTips = [...new Set(tips)]
  const tipHtml = uniqueTips.map(t => `
    <div style="margin-top:8px;padding:7px 10px;background:rgba(243,156,18,0.06);border:1px solid rgba(243,156,18,0.2);border-radius:7px;font-size:9.5px;color:#c0a060">
      <i class="fa fa-lightbulb" style="margin-right:6px;color:#f39c12"></i>${tUI(t === 'loss' ? 'fivemHealthTipLoss' : 'fivemHealthTipDns')}
    </div>`).join('')

  requestAnimationFrame(() => { body.innerHTML = rows + tipHtml })
}

// ── 2c: Smart Cache Manager ───────────────────────────────────────────────────
async function fivemOpenSmartCache() {
  const panel = document.getElementById('fivem-cache-panel')
  if (!panel) return
  panel.style.display = ''
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  await fivemRefreshCacheInfo()
}

async function fivemRefreshCacheInfo() {
  const body = document.getElementById('fivem-cache-body')
  if (!body) return
  body.innerHTML = `<div style="color:var(--muted);font-size:10px"><i class="fa fa-spinner fa-spin"></i> ${tUI('fivemSmartCacheScanning')}</div>`
  const r = await api.fivemCacheInfo().catch(() => null)
  if (!r || !r.ok) { body.innerHTML = `<div style="color:var(--danger);font-size:10px">Could not read cache info.</div>`; return }

  const CACHE_LABELS = {
    cache:             'Shader / App Cache',
    'server-cache':    'Server Cache',
    'server-cache-priv': 'Server Cache (Private)',
    DXCache:           'NVIDIA DXCache',
  }
  const CACHE_DESC = {
    cache:             'FiveM shader & application data. Safe to clear — rebuilds on next launch (fast).',
    'server-cache':    'Cached server assets. Clearing forces re-download of assets on next server join.',
    'server-cache-priv': 'Private server cache. Clearing may invalidate session tokens.',
    DXCache:           'DirectX driver shader cache. Safe to clear — rebuilds automatically.',
  }

  const rows = Object.entries(r.info).map(([key, info]) => {
    const label = CACHE_LABELS[key] || key
    const desc = CACHE_DESC[key] || ''
    if (!info.exists) return `
      <div style="padding:8px 0;border-bottom:1px solid #111;font-size:10px;color:var(--muted)">
        <span style="font-weight:600">${label}</span> — ${tUI('fivemSmartCacheEmpty')}
      </div>`
    const ageDays = info.lastWrite ? Math.round((Date.now() - info.lastWrite) / 86400000) : null
    const ageStr = ageDays !== null ? `${ageDays}d ${tUI('fivemSmartCacheAge')}` : ''
    const sizeColor = info.sizeMB > 2000 ? '#e74c3c' : info.sizeMB > 500 ? '#f39c12' : '#2ecc71'
    return `
      <div style="padding:9px 0;border-bottom:1px solid #111">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px">
          <span style="font-size:10.5px;font-weight:700;color:#c0c0c0">${label}</span>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:10px;font-weight:700;color:${sizeColor}">${info.sizeMB} MB</span>
            ${ageStr ? `<span style="font-size:9px;color:var(--muted)">${ageStr}</span>` : ''}
            <button class="btn btn-ghost btn-sm" style="font-size:9px;padding:2px 8px" onclick="fivemSmartClear('${key}', this)">${tUI('fivemSmartCacheClearBtn')}</button>
          </div>
        </div>
        <div style="font-size:9.5px;color:var(--muted)">${desc}</div>
      </div>`
  }).join('')

  requestAnimationFrame(() => { body.innerHTML = rows })
}

async function fivemSmartClear(target, btn) {
  btn.disabled = true
  btn.innerHTML = `<i class="fa fa-spinner fa-spin"></i>`
  const r = await api.fivemClearCache({ targets: [target] })
  if (!r.ok && r.gameRunning) {
    btn.disabled = false; btn.innerHTML = tUI('fivemSmartCacheClearBtn')
    toast(tUI('fivemCacheErrorGameRunning'), '', 'warn')
    return
  }
  await fivemRefreshCacheInfo()
}

// ── 2d: CitizenFX.ini Full Visual Editor ─────────────────────────────────────
async function fivemOpenIniEditor() {
  const panel = document.getElementById('fivem-ini-editor-panel')
  if (!panel) return
  panel.style.display = ''
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  await fivemIniEditorLoad()
}

async function fivemIniEditorLoad() {
  const body = document.getElementById('fivem-ini-editor-body')
  if (!body) return
  body.innerHTML = `<div style="color:var(--muted);font-size:10px"><i class="fa fa-spinner fa-spin"></i> ${tUI('fivemIniLoading')}</div>`
  const r = await api.fivemIniReadAll().catch((e) => ({ ok: false, reason: e?.message || String(e) }))
  if (!r || !r.ok) {
    const msg = r?.reason === 'premium_required'
      ? tUI('fivemIniPremiumRequired')
      : (r?.reason || tUI('fivemIniReadError'))
    body.innerHTML = `<div style="color:var(--danger);font-size:10px;padding:8px 0"><i class="fa fa-triangle-exclamation"></i> ${msg}</div>`
    return
  }
  const { values, defs, ramMB } = r
  const catLabels = { performance: tUI('fivemIniCatPerf'), networking: tUI('fivemIniCatNet'), stability: tUI('fivemIniCatStab'), visual: tUI('fivemIniCatVisual'), advanced: tUI('fivemIniCatAdv') }
  const catOrder = ['performance','networking','stability','visual','advanced']
  const byCategory = {}
  for (const def of defs) {
    if (!byCategory[def.category]) byCategory[def.category] = []
    byCategory[def.category].push(def)
  }
  let html = ''
  for (const cat of catOrder) {
    const catDefs = byCategory[cat]
    if (!catDefs?.length) continue
    html += `<div style="font-size:9.5px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:0.06em;margin:12px 0 6px;padding-left:2px">${catLabels[cat] || cat}</div>`
    for (const def of catDefs) {
      const cur = values[def.key]
      const curDisplay = cur !== null ? cur : `<span style="color:var(--muted);font-style:italic">${tUI('fivemIniNotSet')}</span>`
      const recVal = def.recommended !== null && def.recommended !== undefined && def.recommended !== '' ? def.recommended : null
      const isDiff = cur !== null && recVal !== null && String(cur) !== String(recVal)
      const rowBg = isDiff ? 'background:rgba(243,156,18,0.05);border-color:rgba(243,156,18,0.15)' : ''
      const dangerWarn = def.dangerHint || null
      html += `
        <div class="cfx-ini-row" style="padding:8px 0;border-bottom:1px solid #111;${rowBg}">
          <div style="display:flex;align-items:flex-start;gap:8px">
            <div style="flex:1;min-width:0">
              <div style="font-size:10.5px;font-weight:700;color:#c0c0c0">${def.label}
                ${dangerWarn ? `<i class="fa fa-triangle-exclamation" style="color:var(--danger);font-size:9px;margin-left:4px" title="${dangerWarn}"></i>` : ''}
              </div>
              <div style="font-size:9.5px;color:var(--muted);margin-top:2px">${def.desc}</div>
              <div style="font-size:9px;color:#555;margin-top:3px;font-family:monospace">${def.key} = ${cur !== null ? `<span style="color:#aaa">${cur}</span>` : `<span style="color:var(--muted);font-style:italic">${tUI('fivemIniNotSet')}</span>`}${recVal !== null ? ` <span style="color:#2ecc71;margin-left:6px">${tUI('fivemIniRecommended')}: ${recVal}</span>` : ''}</div>
              ${dangerWarn ? `<div style="font-size:9px;color:var(--danger);margin-top:3px"><i class="fa fa-shield-halved"></i> ${dangerWarn}</div>` : ''}
            </div>
            <div style="display:flex;gap:5px;flex-shrink:0;align-items:flex-start;margin-top:2px">
              ${def.type === 'boolean'
                ? `<button class="btn btn-sm ${cur == 1 || cur === 'true' ? 'btn-success' : 'btn-ghost'}" style="font-size:9px;min-width:52px" onclick="fivemIniToggleBool('${def.key}', ${cur == 1 || cur === 'true' ? 0 : 1})">${cur == 1 || cur === 'true' ? tUI('fivemIniOn') : tUI('fivemIniOff')}</button>`
                : def.type === 'number'
                ? `<input type="number" id="cfx-ini-input-${def.key}" value="${cur !== null ? cur : (def.recommended ?? def.default ?? '')}" min="${def.min ?? ''}" max="${def.max ?? ''}" step="1" style="width:75px;padding:3px 6px;border-radius:5px;border:1px solid var(--border);background:var(--bg-card2,#1a1a1a);color:var(--fg);font-size:10px;text-align:right" onkeydown="if(event.key==='Enter')fivemIniWriteNumber('${def.key}')">
                   <button class="btn btn-primary btn-sm" style="font-size:9px" onclick="fivemIniWriteNumber('${def.key}')">${tUI('apply')}</button>`
                : `<input type="text" id="cfx-ini-input-${def.key}" value="${cur !== null ? cur : ''}" placeholder="${def.default ?? ''}" style="width:100px;padding:3px 6px;border-radius:5px;border:1px solid var(--border);background:var(--bg-card2,#1a1a1a);color:var(--fg);font-size:10px" onkeydown="if(event.key==='Enter')fivemIniWriteText('${def.key}')">
                   <button class="btn btn-primary btn-sm" style="font-size:9px" onclick="fivemIniWriteText('${def.key}')">${tUI('apply')}</button>`
              }
              ${recVal !== null && String(cur) !== String(recVal) ? `<button class="btn btn-ghost btn-sm" style="font-size:9px;color:#2ecc71;border-color:rgba(46,204,113,0.3)" onclick="fivemIniApplyRecommended('${def.key}', ${JSON.stringify(recVal)})" title="${tUI('fivemIniApplyRec')}"><i class="fa fa-bolt"></i></button>` : ''}
            </div>
          </div>
        </div>`
    }
  }
  requestAnimationFrame(() => { body.innerHTML = html })
}

async function fivemIniWriteKey(key, value, force = false) {
  const r = await api.fivemIniWriteKey({ key, value, force }).catch(() => null)
  if (!r) { toast('', tUI('fivemIniWriteFailed'), 'error'); return false }
  if (!r.ok && r.needsConfirm) {
    const confirmed = await showConfirm({ title: tUI('fivemIniDangerTitle'), body: r.reason, okText: tUI('fivemIniDangerConfirm'), okStyle: 'danger', icon: 'fa-triangle-exclamation' })
    if (!confirmed) return false
    return fivemIniWriteKey(key, value, true)
  }
  if (!r.ok) { toast('', r.reason || tUI('fivemIniWriteFailed'), 'error'); return false }
  toast('', `${key} = ${value}`, 'success', 2000)
  await fivemIniEditorLoad()
  return true
}

async function fivemIniToggleBool(key, newVal) {
  await fivemIniWriteKey(key, newVal)
}

async function fivemIniWriteNumber(key) {
  const el = document.getElementById(`cfx-ini-input-${key}`)
  if (!el) return
  const v = parseInt(el.value, 10)
  if (isNaN(v)) { shakeInput(el); return }
  await fivemIniWriteKey(key, v)
}

async function fivemIniWriteText(key) {
  const el = document.getElementById(`cfx-ini-input-${key}`)
  if (!el) return
  await fivemIniWriteKey(key, el.value.trim())
}

async function fivemIniApplyRecommended(key, recVal) {
  await fivemIniWriteKey(key, recVal)
}
