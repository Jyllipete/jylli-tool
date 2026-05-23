'use strict'

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

  // ── Sticky progress header ─────────────────────────────────────────────────
  const progHeader = document.createElement('div')
  progHeader.className = 'fivem-progress-header'
  progHeader.innerHTML = `
    <span class="fivem-progress-label" id="fivem-prog-label">0 / 0</span>
    <div class="fivem-progress-bar-track">
      <div class="fivem-progress-bar-fill" id="fivem-prog-fill" style="width:0%"></div>
    </div>
    <span style="font-size:11px;font-weight:700;color:var(--pink);white-space:nowrap" id="fivem-fps-badge">Score: 0</span>
    <button class="btn btn-primary" style="font-size:10px;padding:4px 12px;white-space:nowrap" onclick="genApplySafeDefaults()">
      <i class="fa fa-bolt"></i> ${tUI('fivemApplyAllSafe')}
    </button>
  `
  c.appendChild(progHeader)

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
  const totalTweaks = sections.reduce((n, s) => n + s.rows.length, 0)

  const hero = document.createElement('div')
  hero.className = 'fivem-hero'
  hero.innerHTML = `
    <div class="fivem-hero-card fivem-hero-tweaks">
      <div class="fhc-icon"><i class="fa fa-gears"></i></div>
      <div class="fhc-body">
        <div class="fhc-title">${tUI('fivemHeroTweaks')}</div>
        <div class="fhc-desc">${tUI('fivemHeroTweaksDesc')}</div>
        <div class="fhc-count"><i class="fa fa-bolt"></i> ${totalTweaks} ${tUI('fivemHeroTweaksCountLabel')}</div>
      </div>
    </div>
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
    <div class="fivem-hero-card fhc-variant-pink" id="fivem-opt-score-card">
      <div class="fhc-icon"><i class="fa fa-gauge-high"></i></div>
      <div class="fhc-body" style="flex:1;min-width:0">
        <div class="opt-tier-label opt-tier-unoptimized" id="fivem-opt-tier">${tUI('fivemOptTierUnoptimized')}</div>
        <div class="fhc-title" id="fivem-fps-card-val" style="line-height:1">0<span style="font-size:13px;font-weight:500;color:var(--muted)" id="fivem-opt-max-label"></span></div>
        <div class="opt-score-bar-track"><div class="opt-score-bar-fill" id="fivem-opt-bar"></div></div>
        <canvas id="fivem-fps-sparkline" width="80" height="18" style="display:block;margin-bottom:4px"></canvas>
        <div class="opt-cta" id="fivem-opt-cta"></div>
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

  // ── Restore collapsed sections + initial progress ─────────────────────────
  const collapsed = JSON.parse(localStorage.getItem('fivem_sec_collapsed') || '[]')
  collapsed.forEach(idx => {
    const body = document.getElementById(`fivem-sec-${idx}-body`)
    const chev = document.getElementById(`fivem-sec-${idx}-chevron`)
    if (body) body.style.display = 'none'
    if (chev) chev.style.transform = 'rotate(-90deg)'
  })
  refreshFivemProgress()
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

// FiveM-specific tweak IDs and their weights (mirrors TWEAK_OPT_WEIGHTS for fivem-* keys)
const FIVEM_SCORE_IDS = [
  'fivem-priority','fivem-io-priority','fivem-mmcss','fivem-fso','fivem-gamebar',
  'fivem-gpu','fivem-network','fivem-vm','fivem-streaming-mem','fivem-commandline',
  'fivem-worker-threads','fivem-disable-crash-reporter','fivem-disable-anticheat-upload',
  'fivem-disable-update-checks','fivem-preload-ipl','fivem-reduce-draw-distance',
  'fivem-defender','fivem-hang-fix','fivem-mouse-accel','fivem-power-plan',
]
const FIVEM_SCORE_WEIGHTS = {
  'fivem-priority':1,'fivem-io-priority':1,'fivem-mmcss':1,'fivem-fso':1,'fivem-gamebar':1,
  'fivem-gpu':2,'fivem-network':0,'fivem-vm':1,'fivem-streaming-mem':1,'fivem-commandline':1,
  'fivem-worker-threads':1,'fivem-disable-crash-reporter':0,'fivem-disable-anticheat-upload':0,
  'fivem-disable-update-checks':0,'fivem-preload-ipl':1,'fivem-reduce-draw-distance':1,
  'fivem-defender':1,'fivem-hang-fix':0,'fivem-mouse-accel':0,'fivem-power-plan':1,
}
const FIVEM_SCORE_MAX = Object.values(FIVEM_SCORE_WEIGHTS).reduce((a, b) => a + b, 0)

function calcFivemScore(s) {
  return FIVEM_SCORE_IDS.reduce((sum, id) => {
    return s[`tweak_${id}`] === 'applied' ? sum + (FIVEM_SCORE_WEIGHTS[id] || 0) : sum
  }, 0)
}

function refreshFivemProgress() {
  const allIds = FIVEM_SCORE_IDS
  const s = settings || {}
  const applied = allIds.filter(id => s[`tweak_${id}`] === 'applied').length
  const total = allIds.length
  const score = calcFivemScore(s)
  const globalScore = calcOptScore(s)

  const label = document.getElementById('fivem-prog-label')
  const fill = document.getElementById('fivem-prog-fill')
  const badge = document.getElementById('fivem-fps-badge')
  const card = document.getElementById('fivem-fps-card-val')
  if (label) label.textContent = `${applied} / ${total}`
  if (fill) fill.style.width = `${Math.round(applied / total * 100)}%`
  if (badge) badge.textContent = tUI('fivemProgFps').replace('{n}', globalScore)
  if (card) {
    // Update only the score number, leaving the max-label span intact
    const maxLabel = document.getElementById('fivem-opt-max-label')
    card.childNodes[0].textContent = `${score}`
    if (maxLabel) maxLabel.textContent = ` / ${FIVEM_SCORE_MAX}`
  }

  // Score bar inside the card
  const optBar = document.getElementById('fivem-opt-bar')
  if (optBar) optBar.style.width = `${Math.round(score / FIVEM_SCORE_MAX * 100)}%`

  // Tier label
  const tierEl = document.getElementById('fivem-opt-tier')
  if (tierEl) {
    let tierClass, tierText
    if (score <= 3)                      { tierClass = 'opt-tier-unoptimized'; tierText = tUI('fivemOptTierUnoptimized') }
    else if (score <= 7)                 { tierClass = 'opt-tier-partial';     tierText = tUI('fivemOptTierPartial') }
    else if (score < FIVEM_SCORE_MAX)    { tierClass = 'opt-tier-good';        tierText = tUI('fivemOptTierGood') }
    else                                 { tierClass = 'opt-tier-full';         tierText = tUI('fivemOptTierFull') }
    tierEl.className = `opt-tier-label ${tierClass}`
    tierEl.textContent = tierText
  }

  // CTA nudge
  const ctaEl = document.getElementById('fivem-opt-cta')
  if (ctaEl) {
    if (score < FIVEM_SCORE_MAX) {
      const left = FIVEM_SCORE_MAX - score
      ctaEl.innerHTML = `<i class="fa fa-bolt" style="color:var(--pink)"></i> ${tUI('fivemOptCtaBoost').replace('{n}', left)}`
    } else {
      ctaEl.innerHTML = `<i class="fa fa-file-pen" style="color:var(--cyan)"></i> <span style="cursor:pointer;color:var(--cyan);text-decoration:underline" onclick="fivemOpenIniEditor()">${tUI('fivemOptCtaFull')}</span>`
    }
  }

  // Pulse ring on card when score is very low
  const scoreCard = document.getElementById('fivem-opt-score-card')
  if (scoreCard) {
    if (score <= 3) scoreCard.classList.add('opt-pulse')
    else scoreCard.classList.remove('opt-pulse')
  }

  const hist = JSON.parse(localStorage.getItem('fivem_opt_history') || '[]')
  hist.push(score)
  if (hist.length > 20) hist.shift()
  localStorage.setItem('fivem_opt_history', JSON.stringify(hist))
  drawSparkline('fivem-fps-sparkline', hist, pinkHex(), pinkHex())
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
