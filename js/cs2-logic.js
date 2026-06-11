'use strict'

// ─── CS2 Page State ───────────────────────────────────────────────────────────
const CS2_SERVERS = {
  'EU West':  '162.254.197.40',
  'EU East':  '185.25.182.40',
  'US East':  '208.64.200.40',
  'US West':  '192.69.96.40',
  'Asia':     '103.28.54.40'
}
const CS2_SERVER_COLORS = {
  'EU West': '#3b82f6', 'EU East': '#a855f7',
  'US East': '#22c55e', 'US West': '#f59e0b', 'Asia': '#ef4444'
}
let _cs2PingHistory   = {}     // { name: number|null[] }  rolling 120 points
let _cs2PingStats     = {}     // { name: { min, max, samples[] } }
let _cs2PingInterval  = null   // setTimeout handle or true (running sentinel)
let _cs2RafId         = null   // requestAnimationFrame handle
let _cs2ChartDirty    = false
let _cs2MaxSmooth     = 100    // lerped Y-axis ceiling
let _cs2FrameInterval = null
let _cs2FrameBuffer   = []
let _cs2ActivePanel   = null
let _cs2Sections      = null  // kept for cache-restore score refresh

const _vmPresets = {
  desktop: { x: -1.5, y: 0.1,  z: -1.4 },
  couch:   { x: 2.5,  y: 1.5,  z: -1.5 },
  pro:     { x: -2.5, y: 0.0,  z: -1.5 },
}

// ─── Page: CS2 ───────────────────────────────────────────────────────────────
async function buildCS2(c) {
  if (!settings.isPremium) { await buildPremiumBanner(c, 'cs2'); return }

  // ── Tip banner ────────────────────────────────────────────────────────────
  c.appendChild(makeTip(tUI('cs2TipTitle'), 'info'))

  // ── Not-detected banner ────────────────────────────────────────────────────
  if (!sysInfo?.cs2Installed) {
    const nb = document.createElement('div')
    nb.className = 'cs2-not-detected-banner'
    nb.innerHTML = `
      <div class="cs2-ndb-icon"><i class="fa fa-triangle-exclamation"></i></div>
      <div class="cs2-ndb-text">
        <div class="cs2-ndb-title">${tUI('cs2NotDetectedTitle')}</div>
        <div class="cs2-ndb-desc">${tUI('cs2NotDetected')}</div>
      </div>
    `
    c.appendChild(nb)
  }

  // ── Dismissible order banner ───────────────────────────────────────────────
  if (!localStorage.getItem('cs2_order_dismissed')) {
    const banner = document.createElement('div')
    banner.id = 'cs2-order-banner'
    banner.className = 'cs2-order-banner'
    banner.innerHTML = `
      <div class="cs2-ob-icon"><i class="fa fa-route"></i></div>
      <div class="cs2-ob-steps">
        <div class="cs2-ob-label">${tUI('cs2OrderBannerLabel')}</div>
        <div class="cs2-ob-flow">
          <span class="cs2-ob-step">1 System</span>
          <i class="fa fa-chevron-right cs2-ob-arrow"></i>
          <span class="cs2-ob-step">2 Network</span>
          <i class="fa fa-chevron-right cs2-ob-arrow"></i>
          <span class="cs2-ob-step">3 Launch Options</span>
          <i class="fa fa-chevron-right cs2-ob-arrow"></i>
          <span class="cs2-ob-step">4 Autoexec</span>
          <i class="fa fa-chevron-right cs2-ob-arrow"></i>
          <span class="cs2-ob-step cs2-ob-step-reboot">5 Reboot</span>
        </div>
      </div>
      <button class="cs2-ob-dismiss" onclick="localStorage.setItem('cs2_order_dismissed','1');document.getElementById('cs2-order-banner').remove()" title="Dismiss"><i class="fa fa-xmark"></i></button>
    `
    c.appendChild(banner)
  }

  // ── Sections definition ────────────────────────────────────────────────────
  const sections = [
    {
      get title() { return tUI('cs2SectionSystem') },
      icon: 'fa-microchip', color: 'blue',
      rows: [
        { id: 'cs2-mmcss',              reboot: false },
        { id: 'cs2-timer',              reboot: true  },
        { id: 'cs2-audio-latency',      reboot: false },
        { id: 'cs2-hpet-off',           reboot: true  },
        { id: 'cs2-power-throttle-off', reboot: false },
        { id: 'cs2-affinity',           reboot: true  },
      ]
    },
    {
      get title() { return tUI('cs2SectionNetwork') },
      icon: 'fa-network-wired', color: 'teal',
      rows: [
        { id: 'cs2-network',          reboot: false },
        { id: 'cs2-network-recv-buf', reboot: false },
      ]
    },
    {
      get title() { return tUI('cs2SectionGraphics') },
      icon: 'fa-display', color: 'purple',
      rows: [
        { id: 'cs2-gpu-prerender',   reboot: false },
        { id: 'cs2-fullscreen-opti', reboot: false },
        { id: 'cs2-gpu-scheduling',  reboot: true  },
      ]
    },
    {
      get title() { return tUI('cs2SectionProcess') },
      icon: 'fa-bolt', color: 'orange',
      rows: [
        { id: 'cs2-priority',             reboot: false },
        { id: 'cs2-input-responsiveness', reboot: false },
      ]
    },
  ]

  // ── Hero card: Optimization Score + feature cards ─────────────────────────
  const totalTweaks = sections.reduce((n, s) => n + s.rows.length, 0)

  const heroWrap = document.createElement('div')
  heroWrap.className = 'cs2-hero-wrap'

  // Score card (left column)
  const scoreCard = document.createElement('div')
  scoreCard.className = 'cs2-score-card'
  scoreCard.innerHTML = `
    <div class="cs2-score-ring-wrap">
      <svg class="cs2-score-svg" viewBox="0 0 80 80">
        <defs>
          <linearGradient id="cs2RingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stop-color="#f59e0b"/>
            <stop offset="100%" stop-color="#ef4444"/>
          </linearGradient>
        </defs>
        <circle class="cs2-ring-track" cx="40" cy="40" r="32"/>
        <circle class="cs2-ring-fill"  id="cs2-opti-ring" cx="40" cy="40" r="32"/>
      </svg>
      <div class="cs2-score-center">
        <div class="cs2-score-num" id="cs2-opti-score-num">0%</div>
        <div class="cs2-score-lbl">Score</div>
      </div>
    </div>
    <div class="cs2-score-meta">
      <div class="cs2-score-tier" id="cs2-opti-tier">${tUI('cs2OptiTierNone')}</div>
      <div class="cs2-score-bar-wrap">
        <div class="cs2-score-bar" id="cs2-opti-bar"></div>
      </div>
      <div class="cs2-score-count" id="cs2-opti-subtitle">0 / ${totalTweaks} ${tUI('cs2TweaksUnit')}</div>
    </div>
    <div class="cs2-score-actions">
      <button class="cs2-apply-all-btn" id="cs2-apply-all-btn" onclick="cs2ApplyAllSafe(this)">
        <i class="fa fa-bolt"></i>
        <span>${tUI('cs2ApplyAllSafeBtn')}</span>
      </button>
      <button class="cs2-score-reset-btn" onclick="cs2ResetAllTweaks(this)" title="${tUI('cs2ResetAllTitle')}">
        <i class="fa fa-arrow-rotate-left"></i>
      </button>
    </div>
  `
  heroWrap.appendChild(scoreCard)

  // Feature cards grid (right column)
  const featureGrid = document.createElement('div')
  featureGrid.className = 'cs2-feature-grid'
  const cards = [
    { cls: 'fhc-cs2-system',   icon: 'fa-microchip',    titleKey: 'cs2HeroSystemTitle',   descKey: 'cs2HeroSystemDesc',   action: "cs2ScrollToSystem()",    actionIcon: 'fa-arrow-down',    actionKey: 'cs2HeroGoToSection', badge: null },
    { cls: 'fhc-cs2-network',  icon: 'fa-network-wired',titleKey: 'cs2HeroNetworkTitle',  descKey: 'cs2HeroNetworkDesc',  action: "cs2ScrollToNetwork()",   actionIcon: 'fa-arrow-down',    actionKey: 'cs2HeroGoToSection', badge: null },
    { cls: 'fhc-cs2-launch',   icon: 'fa-rocket',       titleKey: 'cs2HeroLaunchTitle',   descKey: 'cs2HeroLaunchDesc',   action: "cs2OpenLaunchPanel()",   actionIcon: 'fa-play',          actionKey: 'cs2HeroOpenTool',    badge: 'BUILDER' },
    { cls: 'fhc-cs2-autoexec', icon: 'fa-file-code',    titleKey: 'cs2HeroAutoexecTitle', descKey: 'cs2HeroAutoexecDesc', action: "cs2OpenAutoexecPanel()", actionIcon: 'fa-pen-to-square', actionKey: 'cs2HeroOpenTool',    badge: 'GENERATOR' },
    { cls: 'fhc-cs2-ping',     icon: 'fa-chart-line',   titleKey: 'cs2HeroPingTitle',     descKey: 'cs2HeroPingDesc',     action: "cs2OpenPingPanel()",     actionIcon: 'fa-play',          actionKey: 'cs2HeroOpenTool',    badge: 'LIVE' },
    { cls: 'fhc-cs2-frame',    icon: 'fa-gauge-high',   titleKey: 'cs2HeroFrameTitle',    descKey: 'cs2HeroFrameDesc',    action: "cs2OpenFramePanel()",    actionIcon: 'fa-play',          actionKey: 'cs2HeroOpenTool',    badge: 'LIVE' },
    { cls: 'fhc-cs2-profiles', icon: 'fa-layer-group',  titleKey: 'cs2HeroProfilesTitle', descKey: 'cs2HeroProfilesDesc', action: "cs2OpenProfilesPanel()", actionIcon: 'fa-pen-to-square', actionKey: 'cs2HeroOpenTool',    badge: 'NEW' },
  ]
  featureGrid.innerHTML = cards.map(({ cls, icon, titleKey, descKey, action, actionIcon, actionKey, badge }) => `
    <div class="cs2-feat-card ${cls}" onclick="${action}" role="button" tabindex="0">
      ${badge ? `<span class="cs2-feat-badge">${badge}</span>` : ''}
      <div class="cs2-feat-icon"><i class="fa ${icon}"></i></div>
      <div class="cs2-feat-body">
        <div class="cs2-feat-title">${tUI(titleKey)}</div>
        <div class="cs2-feat-desc">${tUI(descKey)}</div>
      </div>
      <div class="cs2-feat-action"><i class="fa ${actionIcon}"></i> ${tUI(actionKey)}</div>
    </div>
  `).join('')
  heroWrap.appendChild(featureGrid)
  c.appendChild(heroWrap)

  // Store sections for cache-restore refresh, then animate score ring
  _cs2Sections = sections
  setTimeout(() => cs2RefreshScore(sections), 350)

  // ── Panels ─────────────────────────────────────────────────────────────────
  c.appendChild(_cs2BuildLaunchPanel())
  c.appendChild(_cs2BuildAutoexecPanel())
  c.appendChild(_cs2BuildPingPanel())
  c.appendChild(_cs2BuildFramePanel())
  c.appendChild(_cs2BuildProfilesPanel())

  // ── Search bar ─────────────────────────────────────────────────────────────
  const searchWrap = document.createElement('div')
  searchWrap.className = 'cs2-search-bar'
  searchWrap.id = 'cs2-search-wrap'
  searchWrap.innerHTML = `
    <i class="fa fa-magnifying-glass cs2-search-icon"></i>
    <input class="cs2-search-input" id="cs2-search-input"
      placeholder="${tUI('cs2SearchPlaceholder')}"
      oninput="cs2SearchHandler(this)"
      autocomplete="off" spellcheck="false">
    <span class="cs2-search-count" id="cs2-search-count"></span>
    <button class="cs2-search-clear" id="cs2-search-clear" onclick="cs2SearchClear()" style="display:none" title="Clear">
      <i class="fa fa-xmark"></i>
    </button>
  `
  c.appendChild(searchWrap)

  // ── Section label ──────────────────────────────────────────────────────────
  const sectionLabel = document.createElement('div')
  sectionLabel.className = 'cs2-tweaks-label'
  sectionLabel.innerHTML = `
    <div class="cs2-tweaks-label-line"></div>
    <span><i class="fa fa-sliders"></i> ${tUI('cs2SectionLabel')}</span>
    <div class="cs2-tweaks-label-line"></div>
  `
  c.appendChild(sectionLabel)

  // ── Tweak sections ─────────────────────────────────────────────────────────
  const collapsed = JSON.parse(localStorage.getItem('cs2_sec_collapsed') || '[]')
  sections.forEach((sec, idx) => {
    const card = _cs2BuildSection(sec, idx, collapsed)
    c.appendChild(card)
  })

  // ── Footer tips ────────────────────────────────────────────────────────────
  const tipWrap = document.createElement('div')
  tipWrap.className = 'cs2-tip-row'
  tipWrap.innerHTML = `
    <div class="cs2-tip-item cs2-tip-warning">
      <i class="fa fa-rotate-right"></i>
      <span>${tUI('cs2RebootTip')}</span>
    </div>
    <div class="cs2-tip-item cs2-tip-info">
      <i class="fa fa-shield-halved"></i>
      <span>${tUI('cs2SafetyTip')}</span>
    </div>
  `
  c.appendChild(tipWrap)
}

// ─── Score ring refresh ───────────────────────────────────────────────────────
function cs2RefreshScore(sections) {
  if (!sections) return
  const allIds = sections.flatMap(s => s.rows.map(r => r.id))
  const total   = allIds.length
  const applied = allIds.filter(id => settings[`tweak_${id}`] === 'applied').length
  const pct     = total > 0 ? Math.round(applied / total * 100) : 0
  const circ    = 2 * Math.PI * 32  // r=32

  const ring = document.getElementById('cs2-opti-ring')
  const num  = document.getElementById('cs2-opti-score-num')
  const bar  = document.getElementById('cs2-opti-bar')
  const tier = document.getElementById('cs2-opti-tier')
  const sub  = document.getElementById('cs2-opti-subtitle')

  if (ring) {
    ring.style.strokeDasharray  = `${circ}`
    ring.style.strokeDashoffset = `${circ - (circ * pct / 100)}`
  }
  if (num) num.textContent = pct + '%'
  if (bar) bar.style.width = pct + '%'
  if (tier) {
    if (pct >= 90)      { tier.textContent = tUI('cs2OptiTierFull');    tier.dataset.tier = 'full' }
    else if (pct >= 60) { tier.textContent = tUI('cs2OptiTierGood');    tier.dataset.tier = 'good' }
    else if (pct >= 30) { tier.textContent = tUI('cs2OptiTierPartial'); tier.dataset.tier = 'partial' }
    else                { tier.textContent = tUI('cs2OptiTierNone');    tier.dataset.tier = 'none' }
  }
  if (sub) sub.textContent = `${applied} / ${total} ${tUI('cs2TweaksUnit')}`
}

// ─── Section builder ──────────────────────────────────────────────────────────
function _cs2BuildSection(sec, idx, collapsed) {
  const isCollapsed = collapsed.includes(idx)
  const count = sec.rows.length
  const wrapper = document.createElement('div')
  wrapper.className = `cs2-section cs2-section-${sec.color || 'blue'}`
  wrapper.id = `cs2-section-${idx}`

  const hdr = document.createElement('div')
  hdr.className = 'cs2-section-header'
  hdr.setAttribute('role', 'button')
  hdr.setAttribute('aria-expanded', String(!isCollapsed))
  hdr.setAttribute('tabindex', '0')
  hdr.innerHTML = `
    <div class="cs2-section-accent"></div>
    <i class="fa ${sec.icon || 'fa-gears'} cs2-section-icon"></i>
    <span class="cs2-section-title">${sec.title}</span>
    <span class="cs2-section-count">${count}</span>
    <div class="cs2-section-spacer"></div>
    <i class="fa fa-chevron-down cs2-section-chev" id="cs2-sec-${idx}-chevron" style="${isCollapsed ? 'transform:rotate(-90deg)' : ''}"></i>
  `
  hdr.onclick = () => cs2ToggleSection(idx)
  hdr.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cs2ToggleSection(idx) } }
  wrapper.appendChild(hdr)

  const body = document.createElement('div')
  body.id = `cs2-sec-${idx}-body`
  body.className = 'cs2-section-body'
  body.style.display = isCollapsed ? 'none' : ''
  sec.rows.forEach(row => body.appendChild(makeRow(row)))
  wrapper.appendChild(body)

  return wrapper
}

// ─── Panel builders ───────────────────────────────────────────────────────────
function _cs2BuildLaunchPanel() {
  const el = document.createElement('div')
  el.id = 'cs2-launch-panel'
  el.className = 'cs2-tool-panel cs2-panel-launch'
  el.style.display = 'none'
  el.setAttribute('role', 'region')
  el.innerHTML = `
    <div class="cs2-tp-accent"></div>
    <div class="cs2-tp-header">
      <div class="cs2-tp-icon cs2-tp-icon-launch"><i class="fa fa-rocket"></i></div>
      <div class="cs2-tp-meta">
        <div class="cs2-tp-title">${tUI('cs2LaunchPanelTitle')}</div>
        <div class="cs2-tp-subtitle">${tUI('cs2LaunchPanelDesc')}</div>
      </div>
      <button class="cs2-tp-close" onclick="cs2CloseLaunchPanel()" aria-label="Close"><i class="fa fa-xmark"></i></button>
    </div>
    <div class="cs2-tp-body">
      <div class="cs2-launch-layout">
        <div class="cs2-launch-flags">

          <div class="cs2-flag-group">
            <div class="cs2-fg-title"><i class="fa fa-bolt"></i> Performance</div>
            <label class="cs2-flag-row" data-flag="-novid">
              <div class="cs2-fr-check"><input type="checkbox" id="lo-novid" checked onchange="cs2UpdateLaunchString()"></div>
              <div class="cs2-fr-body">
                <code class="cs2-fr-flag">-novid</code>
                <span class="cs2-fr-desc">Skip intro video</span>
              </div>
            </label>
            <label class="cs2-flag-row" data-flag="-nojoy">
              <div class="cs2-fr-check"><input type="checkbox" id="lo-nojoy" checked onchange="cs2UpdateLaunchString()"></div>
              <div class="cs2-fr-body">
                <code class="cs2-fr-flag">-nojoy</code>
                <span class="cs2-fr-desc">Disable joystick input subsystem</span>
              </div>
            </label>
            <label class="cs2-flag-row" data-flag="+fps_max 0">
              <div class="cs2-fr-check"><input type="checkbox" id="lo-fpsmax" checked onchange="cs2UpdateLaunchString()"></div>
              <div class="cs2-fr-body">
                <code class="cs2-fr-flag">+fps_max 0</code>
                <span class="cs2-fr-desc">Uncap frame rate</span>
              </div>
            </label>
            <label class="cs2-flag-row" data-flag="+mat_queue_mode 2">
              <div class="cs2-fr-check"><input type="checkbox" id="lo-matqueue" checked onchange="cs2UpdateLaunchString()"></div>
              <div class="cs2-fr-body">
                <code class="cs2-fr-flag">+mat_queue_mode 2</code>
                <span class="cs2-fr-desc">Multi-threaded rendering</span>
              </div>
            </label>
            <label class="cs2-flag-row" data-flag="-high">
              <div class="cs2-fr-check"><input type="checkbox" id="lo-high" onchange="cs2UpdateLaunchString()"></div>
              <div class="cs2-fr-body">
                <code class="cs2-fr-flag">-high</code>
                <span class="cs2-fr-desc">HIGH process priority <span class="cs2-fr-note">(redundant if cs2-priority tweak applied)</span></span>
              </div>
            </label>
            <div class="cs2-flag-row" data-flag="-threads">
              <div class="cs2-fr-check"><input type="checkbox" id="lo-threads" onchange="cs2UpdateLaunchString()"></div>
              <div class="cs2-fr-body cs2-fr-body-inline">
                <code class="cs2-fr-flag">-threads</code>
                <select id="lo-threads-val" class="cs2-inline-select" onchange="cs2UpdateLaunchString()">
                  <option value="auto">auto</option>
                  <option value="2">2</option><option value="4">4</option>
                  <option value="6">6</option><option value="8">8</option>
                  <option value="10">10</option><option value="12">12</option>
                </select>
                <span class="cs2-fr-desc">CPU thread count override</span>
              </div>
            </div>
          </div>

          <div class="cs2-flag-group">
            <div class="cs2-fg-title"><i class="fa fa-display"></i> Display</div>
            <label class="cs2-flag-row" data-flag="-fullscreen">
              <div class="cs2-fr-check"><input type="checkbox" id="lo-fullscreen" onchange="cs2UpdateLaunchString()"></div>
              <div class="cs2-fr-body">
                <code class="cs2-fr-flag">-fullscreen</code>
                <span class="cs2-fr-desc">True exclusive fullscreen (lowest latency)</span>
              </div>
            </label>
            <div class="cs2-flag-row" data-flag="-w -h">
              <div class="cs2-fr-check"><input type="checkbox" id="lo-res" onchange="cs2UpdateLaunchString()"></div>
              <div class="cs2-fr-body cs2-fr-body-inline">
                <code class="cs2-fr-flag">-w</code>
                <input type="number" id="lo-w" placeholder="1920" min="640" max="7680" class="cs2-inline-num" oninput="cs2UpdateLaunchString()">
                <code class="cs2-fr-flag">-h</code>
                <input type="number" id="lo-h" placeholder="1080" min="480" max="4320" class="cs2-inline-num" oninput="cs2UpdateLaunchString()">
                <span class="cs2-fr-desc">Resolution override</span>
              </div>
            </div>
            <div class="cs2-flag-row" data-flag="-refresh">
              <div class="cs2-fr-check"><input type="checkbox" id="lo-refresh" onchange="cs2UpdateLaunchString()"></div>
              <div class="cs2-fr-body cs2-fr-body-inline">
                <code class="cs2-fr-flag">-refresh</code>
                <input type="number" id="lo-refresh-val" placeholder="144" min="60" max="360" class="cs2-inline-num" oninput="cs2UpdateLaunchString()">
                <span class="cs2-fr-desc">Refresh rate override</span>
              </div>
            </div>
          </div>

          <div class="cs2-flag-group">
            <div class="cs2-fg-title"><i class="fa fa-volume-xmark"></i> Audio</div>
            <label class="cs2-flag-row" data-flag="-nosound">
              <div class="cs2-fr-check"><input type="checkbox" id="lo-nosound" onchange="cs2UpdateLaunchString()"></div>
              <div class="cs2-fr-body">
                <code class="cs2-fr-flag">-nosound</code>
                <span class="cs2-fr-desc">Disable all audio <span class="cs2-fr-note">(benchmark / CPU testing mode)</span></span>
              </div>
            </label>
          </div>

          <div class="cs2-flag-group cs2-fg-collapsible" id="lo-debug-group">
            <div class="cs2-fg-title cs2-fg-title-toggle" onclick="cs2ToggleDebugFlags()">
              <i class="fa fa-bug"></i> Debug
              <i class="fa fa-chevron-down cs2-fg-chev" id="lo-debug-chev"></i>
            </div>
            <div id="lo-debug-flags" class="cs2-fg-collapsible-body" style="display:none">
              <label class="cs2-flag-row" data-flag="-console">
                <div class="cs2-fr-check"><input type="checkbox" id="lo-console" onchange="cs2UpdateLaunchString()"></div>
                <div class="cs2-fr-body">
                  <code class="cs2-fr-flag">-console</code>
                  <span class="cs2-fr-desc">Open developer console on launch</span>
                </div>
              </label>
              <label class="cs2-flag-row" data-flag="-condebug">
                <div class="cs2-fr-check"><input type="checkbox" id="lo-condebug" onchange="cs2UpdateLaunchString()"></div>
                <div class="cs2-fr-body">
                  <code class="cs2-fr-flag">-condebug</code>
                  <span class="cs2-fr-desc">Log console output to console.log file</span>
                </div>
              </label>
            </div>
          </div>

        </div>

        <div class="cs2-launch-output">
          <div class="cs2-lo-label"><i class="fa fa-terminal"></i> Generated Launch String</div>
          <div class="cs2-lo-string-wrap">
            <input id="cs2-launch-string" readonly class="cs2-lo-input" value="-novid -nojoy +fps_max 0 +mat_queue_mode 2" spellcheck="false">
          </div>
          <div class="cs2-lo-actions">
            <button class="cs2-lo-btn cs2-lo-btn-copy" onclick="cs2CopyLaunchString()">
              <i class="fa fa-copy"></i> ${tUI('cs2LaunchCopyBtn')}
            </button>
            <button class="cs2-lo-btn cs2-lo-btn-steam" onclick="cs2ApplyToSteam()">
              <i class="fa fa-upload"></i> ${tUI('cs2LaunchApplyBtn')}
            </button>
            <button class="cs2-lo-btn cs2-lo-btn-reset" onclick="cs2ResetLaunchOpts()" title="Reset to defaults">
              <i class="fa fa-rotate-left"></i>
            </button>
          </div>
          <div id="cs2-lo-status" class="cs2-tool-status"></div>
        </div>
      </div>
    </div>
  `
  return el
}

function _cs2BuildAutoexecPanel() {
  const el = document.createElement('div')
  el.id = 'cs2-autoexec-panel'
  el.className = 'cs2-tool-panel cs2-panel-autoexec'
  el.style.display = 'none'
  el.setAttribute('role', 'region')
  el.innerHTML = `
    <div class="cs2-tp-accent"></div>
    <div class="cs2-tp-header">
      <div class="cs2-tp-icon cs2-tp-icon-autoexec"><i class="fa fa-file-code"></i></div>
      <div class="cs2-tp-meta">
        <div class="cs2-tp-title">${tUI('cs2AutoexecPanelTitle')}</div>
        <div class="cs2-tp-subtitle">${tUI('cs2AutoexecPanelDesc')}</div>
      </div>
      <button class="cs2-tp-close" onclick="cs2CloseAutoexecPanel()" aria-label="Close"><i class="fa fa-xmark"></i></button>
    </div>
    <div class="cs2-tp-body cs2-ae-layout">

      <div class="cs2-ae-controls">

        <div class="cs2-ae-group">
          <div class="cs2-ae-group-title"><i class="fa fa-computer-mouse"></i> Mouse</div>
          <div class="cs2-ae-row">
            <label class="cs2-ae-lbl">sensitivity</label>
            <div class="cs2-ae-slider-wrap">
              <input type="range" id="ae-sens" min="0.1" max="5.0" step="0.05" value="2.0"
                class="cs2-slider cs2-slider-orange"
                oninput="document.getElementById('ae-sens-val').textContent=parseFloat(this.value).toFixed(2);cs2UpdateAutoexecPreview()">
              <span id="ae-sens-val" class="cs2-ae-val">2.00</span>
            </div>
          </div>
          <div class="cs2-ae-row cs2-ae-row-toggle">
            <label class="cs2-ae-lbl">m_rawinput</label>
            <label class="toggle-switch cs2-ae-toggle">
              <input type="checkbox" id="ae-rawinput" checked onchange="cs2UpdateAutoexecPreview()">
              <span class="toggle-slider"></span>
            </label>
            <span class="cs2-ae-hint">Raw input (bypasses OS acceleration)</span>
          </div>
          <div class="cs2-ae-row cs2-ae-row-toggle">
            <label class="cs2-ae-lbl">m_customaccel</label>
            <label class="toggle-switch cs2-ae-toggle">
              <input type="checkbox" id="ae-customaccel" onchange="cs2UpdateAutoexecPreview()">
              <span class="toggle-slider"></span>
            </label>
            <span class="cs2-ae-hint">Custom mouse acceleration</span>
          </div>
        </div>

        <div class="cs2-ae-group">
          <div class="cs2-ae-group-title"><i class="fa fa-eye"></i> Viewmodel</div>
          <div class="cs2-ae-row">
            <label class="cs2-ae-lbl">viewmodel_fov</label>
            <div class="cs2-ae-slider-wrap">
              <input type="range" id="ae-vmfov" min="54" max="68" step="1" value="60"
                class="cs2-slider cs2-slider-purple"
                oninput="document.getElementById('ae-vmfov-val').textContent=this.value;cs2UpdateAutoexecPreview()">
              <span id="ae-vmfov-val" class="cs2-ae-val">60</span>
            </div>
          </div>
          <div class="cs2-ae-row">
            <label class="cs2-ae-lbl">offset preset</label>
            <div class="cs2-ae-presets">
              <button class="cs2-preset-btn active" id="vm-preset-desktop" onclick="cs2VmPreset('desktop')">
                <i class="fa fa-desktop"></i> Desktop
              </button>
              <button class="cs2-preset-btn" id="vm-preset-couch" onclick="cs2VmPreset('couch')">
                <i class="fa fa-couch"></i> Couch
              </button>
              <button class="cs2-preset-btn" id="vm-preset-pro" onclick="cs2VmPreset('pro')">
                <i class="fa fa-trophy"></i> Pro
              </button>
            </div>
          </div>
        </div>

        <div class="cs2-ae-group">
          <div class="cs2-ae-group-title"><i class="fa fa-network-wired"></i> Network</div>
          <div class="cs2-ae-row">
            <label class="cs2-ae-lbl">rate</label>
            <select id="ae-rate" class="cs2-ae-select" onchange="cs2UpdateAutoexecPreview()">
              <option value="786432" selected>786432 · 128-tick</option>
              <option value="512000">512000 · 64-tick</option>
              <option value="196608">196608 · Matchmaking</option>
            </select>
          </div>
          <div class="cs2-ae-row">
            <label class="cs2-ae-lbl">cl_interp_ratio</label>
            <select id="ae-interp-ratio" class="cs2-ae-select" onchange="cs2UpdateAutoexecPreview()">
              <option value="1" selected>1 — minimum lag</option>
              <option value="2">2 — more buffer</option>
            </select>
          </div>
          <div class="cs2-ae-row">
            <label class="cs2-ae-lbl">cl_interp</label>
            <input type="number" id="ae-interp" value="0" min="0" max="1" step="0.01" class="cs2-ae-num-input" oninput="cs2UpdateAutoexecPreview()">
          </div>
          <div class="cs2-ae-row">
            <label class="cs2-ae-lbl">cl_cmdrate</label>
            <select id="ae-cmdrate" class="cs2-ae-select" onchange="cs2UpdateAutoexecPreview()">
              <option value="128" selected>128</option><option value="64">64</option>
            </select>
          </div>
          <div class="cs2-ae-row">
            <label class="cs2-ae-lbl">cl_updaterate</label>
            <select id="ae-updaterate" class="cs2-ae-select" onchange="cs2UpdateAutoexecPreview()">
              <option value="128" selected>128</option><option value="64">64</option>
            </select>
          </div>
        </div>

        <div class="cs2-ae-group">
          <div class="cs2-ae-group-title"><i class="fa fa-volume-high"></i> Audio</div>
          <div class="cs2-ae-row">
            <label class="cs2-ae-lbl">snd_mixahead</label>
            <div class="cs2-ae-slider-wrap">
              <input type="range" id="ae-mixahead" min="0.02" max="0.1" step="0.01" value="0.05"
                class="cs2-slider cs2-slider-teal"
                oninput="document.getElementById('ae-mixahead-val').textContent=parseFloat(this.value).toFixed(2);cs2UpdateAutoexecPreview()">
              <span id="ae-mixahead-val" class="cs2-ae-val">0.05</span>
            </div>
          </div>
          <div class="cs2-ae-row cs2-ae-row-toggle">
            <label class="cs2-ae-lbl">voice_enable</label>
            <label class="toggle-switch cs2-ae-toggle">
              <input type="checkbox" id="ae-voice" checked onchange="cs2UpdateAutoexecPreview()">
              <span class="toggle-slider"></span>
            </label>
            <span class="cs2-ae-hint">In-game voice chat</span>
          </div>
        </div>

        <div class="cs2-ae-group">
          <div class="cs2-ae-group-title"><i class="fa fa-circle-half-stroke"></i> HUD / Radar</div>
          <div class="cs2-ae-row">
            <label class="cs2-ae-lbl">cl_hud_radar_scale</label>
            <div class="cs2-ae-slider-wrap">
              <input type="range" id="ae-radar" min="0.8" max="1.3" step="0.05" value="1.0"
                class="cs2-slider cs2-slider-blue"
                oninput="document.getElementById('ae-radar-val').textContent=parseFloat(this.value).toFixed(2);cs2UpdateAutoexecPreview()">
              <span id="ae-radar-val" class="cs2-ae-val">1.00</span>
            </div>
          </div>
          <div class="cs2-ae-row">
            <label class="cs2-ae-lbl">hud_scaling</label>
            <div class="cs2-ae-slider-wrap">
              <input type="range" id="ae-hud" min="0.5" max="0.95" step="0.05" value="0.85"
                class="cs2-slider cs2-slider-blue"
                oninput="document.getElementById('ae-hud-val').textContent=parseFloat(this.value).toFixed(2);cs2UpdateAutoexecPreview()">
              <span id="ae-hud-val" class="cs2-ae-val">0.85</span>
            </div>
          </div>
        </div>

      </div>

      <div class="cs2-ae-preview">
        <div class="cs2-ae-preview-header">
          <span class="cs2-ae-preview-label"><i class="fa fa-code"></i> autoexec.cfg</span>
          <div class="cs2-ae-preview-actions">
            <button class="cs2-ae-copy-btn" onclick="cs2CopyAutoexec()" title="Copy to clipboard">
              <i class="fa fa-copy"></i>
            </button>
          </div>
        </div>
        <pre id="cs2-autoexec-pre" class="cs2-ae-pre"></pre>
        <div class="cs2-ae-footer">
          <button class="cs2-ae-btn cs2-ae-btn-secondary" onclick="cs2CopyAutoexec()">
            <i class="fa fa-copy"></i> ${tUI('cs2AutoexecCopyBtn')}
          </button>
          <button class="cs2-ae-btn cs2-ae-btn-primary" onclick="cs2DeployAutoexec()">
            <i class="fa fa-upload"></i> ${tUI('cs2AutoexecDeployBtn')}
          </button>
        </div>
        <div id="cs2-ae-status" class="cs2-tool-status"></div>
      </div>

    </div>
  `
  return el
}

function _cs2BuildPingPanel() {
  const serverCheckboxes = Object.entries(CS2_SERVERS).map(([name]) => {
    const key = name.replace(/ /g, '-')
    const color = CS2_SERVER_COLORS[name]
    return `
      <label class="cs2-server-chip" data-server="${name}">
        <input type="checkbox" class="cs2-ping-chk" data-server="${name}" checked>
        <span class="cs2-server-dot" style="background:${color}"></span>
        <span class="cs2-server-name">${name}</span>
        <span class="cs2-server-ping" id="cs2-chip-ping-${key}" style="color:${color}">—</span>
      </label>
    `
  }).join('')

  const statsRows = Object.keys(CS2_SERVERS).map(name => {
    const key = name.replace(/ /g, '-')
    const color = CS2_SERVER_COLORS[name]
    return `
      <div class="cs2-stat-row" id="cs2-stat-${key}">
        <span class="cs2-stat-server" style="color:${color}">
          <span class="cs2-stat-dot" style="background:${color}"></span>
          ${name}
        </span>
        <div class="cs2-stat-metrics">
          <span class="cs2-stat-metric"><span class="cs2-stat-label">avg</span> <b id="cs2-ps-avg-${key}">—</b><span class="cs2-stat-unit">ms</span></span>
          <span class="cs2-stat-metric"><span class="cs2-stat-label">min</span> <b id="cs2-ps-min-${key}">—</b><span class="cs2-stat-unit">ms</span></span>
          <span class="cs2-stat-metric"><span class="cs2-stat-label">max</span> <b id="cs2-ps-max-${key}">—</b><span class="cs2-stat-unit">ms</span></span>
          <span class="cs2-stat-metric"><span class="cs2-stat-label">jitter</span> <b id="cs2-ps-jit-${key}">—</b><span class="cs2-stat-unit">ms</span></span>
          <span class="cs2-stat-loss" id="cs2-ps-loss-${key}"></span>
        </div>
      </div>
    `
  }).join('')

  const el = document.createElement('div')
  el.id = 'cs2-ping-panel'
  el.className = 'cs2-tool-panel cs2-panel-ping'
  el.style.display = 'none'
  el.setAttribute('role', 'region')
  el.innerHTML = `
    <div class="cs2-tp-accent"></div>
    <div class="cs2-tp-header">
      <div class="cs2-tp-icon cs2-tp-icon-ping"><i class="fa fa-chart-line"></i></div>
      <div class="cs2-tp-meta">
        <div class="cs2-tp-title">${tUI('cs2PingPanelTitle')}</div>
        <div class="cs2-tp-subtitle">${tUI('cs2PingPanelDesc')}</div>
      </div>
      <div class="cs2-ping-controls">
        <button class="cs2-ping-btn cs2-ping-btn-start" id="cs2-ping-start-btn" onclick="cs2StartPing(this)">
          <i class="fa fa-play"></i> Start
        </button>
        <button class="cs2-ping-btn cs2-ping-btn-stop" id="cs2-ping-stop-btn" onclick="cs2StopPing()" style="display:none">
          <i class="fa fa-stop"></i> Stop
        </button>
      </div>
      <button class="cs2-tp-close" onclick="cs2ClosePingPanel()" aria-label="Close"><i class="fa fa-xmark"></i></button>
    </div>
    <div class="cs2-tp-body">
      <div class="cs2-servers-row">${serverCheckboxes}</div>
      <div class="cs2-chart-wrap" id="cs2-ping-chart-wrap">
        <canvas id="cs2-ping-canvas" class="cs2-chart-canvas" width="800" height="140"></canvas>
        <div class="cs2-chart-overlay" id="cs2-ping-placeholder">
          <i class="fa fa-chart-line"></i>
          <span>Press Start to begin plotting</span>
        </div>
      </div>
      <div class="cs2-stats-table">${statsRows}</div>
    </div>
  `
  return el
}

function _cs2BuildFramePanel() {
  const el = document.createElement('div')
  el.id = 'cs2-frametime-panel'
  el.className = 'cs2-tool-panel cs2-panel-frame'
  el.style.display = 'none'
  el.setAttribute('role', 'region')
  el.innerHTML = `
    <div class="cs2-tp-accent"></div>
    <div class="cs2-tp-header">
      <div class="cs2-tp-icon cs2-tp-icon-frame"><i class="fa fa-gauge-high"></i></div>
      <div class="cs2-tp-meta">
        <div class="cs2-tp-title">${tUI('cs2FramePanelTitle')}</div>
        <div class="cs2-tp-subtitle">${tUI('cs2FramePanelDesc')}</div>
      </div>
      <button class="cs2-tp-close" onclick="cs2CloseFramePanel()" aria-label="Close"><i class="fa fa-xmark"></i></button>
    </div>
    <div class="cs2-tp-body">
      <div id="cs2-frame-placeholder" class="cs2-frame-idle">
        <div class="cs2-frame-idle-icon"><i class="fa fa-gauge-high"></i></div>
        <div class="cs2-frame-idle-title">${tUI('cs2FrameNotRunning')}</div>
        <div class="cs2-frame-idle-hint">${tUI('cs2FrameIdleHint')}</div>
        <button class="cs2-frame-retry-btn" onclick="cs2StartFrameMonitor()">
          <i class="fa fa-rotate"></i> ${tUI('cs2FrameRetry')}
        </button>
      </div>
      <div id="cs2-frame-live" style="display:none">
        <div class="cs2-fps-stats">
          <div class="cs2-fps-stat cs2-fps-primary">
            <div class="cs2-fps-val" id="cs2-fps-avg">—</div>
            <div class="cs2-fps-lbl">Avg FPS</div>
          </div>
          <div class="cs2-fps-stat">
            <div class="cs2-fps-val" id="cs2-fps-1low">—</div>
            <div class="cs2-fps-lbl">1% Low</div>
          </div>
          <div class="cs2-fps-stat">
            <div class="cs2-fps-val" id="cs2-fps-01low">—</div>
            <div class="cs2-fps-lbl">0.1% Low</div>
          </div>
          <div class="cs2-fps-stat cs2-fps-ms">
            <div class="cs2-fps-val" id="cs2-ft-ms">—</div>
            <div class="cs2-fps-lbl">Frame Time</div>
          </div>
        </div>
        <div class="cs2-chart-wrap">
          <canvas id="cs2-frame-canvas" class="cs2-chart-canvas" width="800" height="110"></canvas>
        </div>
        <div class="cs2-frame-footer">
          <div class="cs2-frame-legend">
            <span class="cs2-legend-item"><span class="cs2-legend-dot" style="background:#22c55e"></span>Smooth &lt;8ms</span>
            <span class="cs2-legend-item"><span class="cs2-legend-dot" style="background:#f59e0b"></span>Mild 8–16ms</span>
            <span class="cs2-legend-item"><span class="cs2-legend-dot" style="background:#ef4444"></span>Heavy &gt;16ms</span>
          </div>
          <button class="cs2-frame-export" onclick="cs2ExportFrameCsv()">
            <i class="fa fa-download"></i> Export CSV
          </button>
        </div>
      </div>
    </div>
  `
  return el
}

// ─── Panel Open/Close ─────────────────────────────────────────────────────────
function cs2OpenLaunchPanel()    { _cs2OpenPanel('cs2-launch-panel',    'launch',    cs2UpdateLaunchString) }
function cs2CloseLaunchPanel()   { _cs2ClosePanel('cs2-launch-panel') }
function cs2OpenAutoexecPanel()  { _cs2OpenPanel('cs2-autoexec-panel',  'autoexec',  cs2UpdateAutoexecPreview) }
function cs2CloseAutoexecPanel() { _cs2ClosePanel('cs2-autoexec-panel') }
function cs2OpenPingPanel()      { _cs2OpenPanel('cs2-ping-panel',      'ping') }
function cs2ClosePingPanel()     { cs2StopPing(); _cs2ClosePanel('cs2-ping-panel') }
function cs2OpenFramePanel()     { _cs2OpenPanel('cs2-frametime-panel', 'frame',     cs2StartFrameMonitor) }
function cs2CloseFramePanel()    { cs2StopFrameMonitor(); _cs2ClosePanel('cs2-frametime-panel') }
function cs2OpenProfilesPanel()  { _cs2OpenPanel('cs2-profiles-panel',  'profiles',  cs2RenderProfiles) }
function cs2CloseProfilesPanel() { _cs2ClosePanel('cs2-profiles-panel') }

function _cs2OpenPanel(id, name, onOpen) {
  // Close currently open panel with animation
  if (_cs2ActivePanel && _cs2ActivePanel !== id) {
    const prev = document.getElementById(_cs2ActivePanel)
    if (prev) _cs2animateClose(prev)
    if (_cs2ActivePanel === 'cs2-ping-panel') cs2StopPing()
    if (_cs2ActivePanel === 'cs2-frametime-panel') cs2StopFrameMonitor()
  }
  _cs2ActivePanel = id
  const panel = document.getElementById(id)
  if (!panel) return
  panel.style.display = ''
  panel.style.opacity = '0'
  panel.style.transform = 'translateY(-6px)'
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      panel.style.transition = 'opacity 0.2s ease, transform 0.2s ease'
      panel.style.opacity = '1'
      panel.style.transform = 'translateY(0)'
    })
  })
  if (onOpen) setTimeout(onOpen, 80)
}

function _cs2ClosePanel(id) {
  const panel = document.getElementById(id)
  if (!panel) return
  _cs2animateClose(panel)
  if (_cs2ActivePanel === id) _cs2ActivePanel = null
}

function _cs2animateClose(panel) {
  panel.style.transition = 'opacity 0.15s ease, transform 0.15s ease'
  panel.style.opacity = '0'
  panel.style.transform = 'translateY(-4px)'
  setTimeout(() => { panel.style.display = 'none'; panel.style.transition = '' }, 160)
}

// ─── Section Scroll ───────────────────────────────────────────────────────────
function cs2ScrollToSystem()  { document.getElementById('cs2-section-0')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
function cs2ScrollToNetwork() { document.getElementById('cs2-section-1')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }

// ─── Section Collapse ─────────────────────────────────────────────────────────
function cs2ToggleSection(idx) {
  const body = document.getElementById(`cs2-sec-${idx}-body`)
  const chev = document.getElementById(`cs2-sec-${idx}-chevron`)
  const hdr  = body?.previousElementSibling
  if (!body) return
  const isNowCollapsed = body.style.display !== 'none'
  const collapsed = JSON.parse(localStorage.getItem('cs2_sec_collapsed') || '[]')
  if (isNowCollapsed) {
    body.style.display = 'none'
    if (chev) chev.style.transform = 'rotate(-90deg)'
    if (hdr) hdr.setAttribute('aria-expanded', 'false')
    if (!collapsed.includes(idx)) collapsed.push(idx)
  } else {
    body.style.display = ''
    if (chev) chev.style.transform = ''
    if (hdr) hdr.setAttribute('aria-expanded', 'true')
    const i = collapsed.indexOf(idx); if (i !== -1) collapsed.splice(i, 1)
  }
  localStorage.setItem('cs2_sec_collapsed', JSON.stringify(collapsed))
}

// ─── Search ───────────────────────────────────────────────────────────────────
function cs2SearchHandler(input) {
  const q = (input.value || '').trim().toLowerCase()
  const rows = document.querySelectorAll('#cs2-search-wrap ~ * .tweak-row')
  let visible = 0
  rows.forEach(row => {
    const name = row.querySelector('.tweak-name')?.textContent || ''
    const desc = row.querySelector('.tweak-desc')?.textContent || ''
    const show = !q || name.toLowerCase().includes(q) || desc.toLowerCase().includes(q)
    row.style.display = show ? '' : 'none'
    if (show) visible++
  })
  const cnt = document.getElementById('cs2-search-count')
  const clr = document.getElementById('cs2-search-clear')
  if (cnt) cnt.textContent = q ? `${visible}` : ''
  if (clr) clr.style.display = q ? '' : 'none'
  // Show/hide empty sections
  document.querySelectorAll('.cs2-section').forEach(sec => {
    const bodyEl = sec.querySelector('.cs2-section-body')
    if (!bodyEl) return
    const anyVisible = [...bodyEl.querySelectorAll('.tweak-row')].some(r => r.style.display !== 'none')
    sec.style.display = q && !anyVisible ? 'none' : ''
  })
}
function cs2SearchClear() {
  const inp = document.getElementById('cs2-search-input')
  if (inp) { inp.value = ''; cs2SearchHandler(inp); inp.focus() }
}

// ─── Apply All Safe ───────────────────────────────────────────────────────────
async function cs2ApplyAllSafe(btn) {
  const safeIds = ['cs2-network','cs2-mmcss','cs2-priority','cs2-fullscreen-opti',
                   'cs2-timer','cs2-gpu-prerender','cs2-audio-latency','cs2-input-responsiveness',
                   'cs2-gpu-scheduling','cs2-network-recv-buf','cs2-hpet-off','cs2-power-throttle-off']
  const btn$ = btn || document.getElementById('cs2-apply-all-btn')
  if (btn$) { btn$.disabled = true; btn$.innerHTML = '<i class="fa fa-spinner fa-spin"></i><span>Applying…</span>' }
  for (const id of safeIds) {
    if (settings[`tweak_${id}`] !== 'applied') {
      const toggle = document.querySelector(`[data-id="${id}"] input[type=checkbox], #tcw-${id} input[type=checkbox]`)
      if (toggle && !toggle.checked) toggle.click()
      await new Promise(r => setTimeout(r, 450))
    }
  }
  if (btn$) {
    btn$.disabled = false
    btn$.innerHTML = '<i class="fa fa-check"></i><span>All Applied</span>'
    setTimeout(() => { if (btn$) btn$.innerHTML = `<i class="fa fa-bolt"></i><span>${tUI('cs2ApplyAllSafeBtn')}</span>` }, 2500)
  }
}

async function cs2ResetAllTweaks(btn) {
  const allIds = ['cs2-network','cs2-mmcss','cs2-priority','cs2-fullscreen-opti',
                  'cs2-timer','cs2-gpu-prerender','cs2-audio-latency','cs2-input-responsiveness','cs2-affinity',
                  'cs2-gpu-scheduling','cs2-network-recv-buf','cs2-hpet-off','cs2-power-throttle-off']
  if (btn) { btn.disabled = true }
  for (const id of allIds) {
    if (settings[`tweak_${id}`] === 'applied') {
      const restoreBtn = document.querySelector(`[data-id="${id}"] .tc-restore-btn, #tcw-${id} .tc-restore-btn`)
      if (restoreBtn) restoreBtn.click()
      await new Promise(r => setTimeout(r, 350))
    }
  }
  if (btn) { btn.disabled = false }
}

// ─── Launch Options Builder ───────────────────────────────────────────────────
function cs2UpdateLaunchString() {
  const parts = []
  if (document.getElementById('lo-novid')?.checked)     parts.push('-novid')
  if (document.getElementById('lo-nojoy')?.checked)     parts.push('-nojoy')
  if (document.getElementById('lo-fpsmax')?.checked)    parts.push('+fps_max 0')
  if (document.getElementById('lo-matqueue')?.checked)  parts.push('+mat_queue_mode 2')
  if (document.getElementById('lo-high')?.checked)      parts.push('-high')
  if (document.getElementById('lo-threads')?.checked) {
    const v = document.getElementById('lo-threads-val')?.value
    if (v && v !== 'auto') parts.push(`-threads ${v}`)
  }
  if (document.getElementById('lo-fullscreen')?.checked) parts.push('-fullscreen')
  if (document.getElementById('lo-res')?.checked) {
    const w = document.getElementById('lo-w')?.value
    const h = document.getElementById('lo-h')?.value
    if (w && h) parts.push(`-w ${w} -h ${h}`)
  }
  if (document.getElementById('lo-refresh')?.checked) {
    const r = document.getElementById('lo-refresh-val')?.value
    if (r) parts.push(`-refresh ${r}`)
  }
  if (document.getElementById('lo-nosound')?.checked)   parts.push('-nosound')
  if (document.getElementById('lo-console')?.checked)   parts.push('-console')
  if (document.getElementById('lo-condebug')?.checked)  parts.push('-condebug')
  const out = document.getElementById('cs2-launch-string')
  if (out) out.value = parts.join(' ')
}

function cs2ToggleDebugFlags() {
  const fl = document.getElementById('lo-debug-flags')
  const ch = document.getElementById('lo-debug-chev')
  if (!fl) return
  const open = fl.style.display !== 'none'
  fl.style.display = open ? 'none' : ''
  if (ch) ch.style.transform = open ? '' : 'rotate(180deg)'
}

function cs2ResetLaunchOpts() {
  const checks = { 'lo-novid': true, 'lo-nojoy': true, 'lo-fpsmax': true, 'lo-matqueue': true,
                   'lo-high': false, 'lo-threads': false, 'lo-fullscreen': false,
                   'lo-res': false, 'lo-nosound': false, 'lo-refresh': false,
                   'lo-console': false, 'lo-condebug': false }
  Object.entries(checks).forEach(([id, val]) => {
    const el = document.getElementById(id)
    if (el) el.checked = val
  })
  ;['lo-w','lo-h','lo-refresh-val'].forEach(id => { const el = document.getElementById(id); if (el) el.value = '' })
  cs2UpdateLaunchString()
}

function cs2CopyLaunchString() {
  const val = document.getElementById('cs2-launch-string')?.value || ''
  navigator.clipboard.writeText(val).then(() => {
    const s = document.getElementById('cs2-lo-status')
    if (s) { s.className = 'cs2-tool-status cs2-status-ok'; s.textContent = '✓ Copied to clipboard' }
    setTimeout(() => { if (s) s.textContent = '' }, 2500)
  })
}

async function cs2ApplyToSteam() {
  const val = document.getElementById('cs2-launch-string')?.value || ''
  const s   = document.getElementById('cs2-lo-status')
  if (s) { s.className = 'cs2-tool-status cs2-status-muted'; s.textContent = '↑ Writing to Steam config…' }
  try {
    const r = await window.api.cs2ApplyLaunchOpts(val)
    if (s) {
      if (r?.ok) {
        s.className = 'cs2-tool-status cs2-status-ok'
        s.textContent = `✓ Written to Steam config`
      } else if (r?.reason === 'localconfig_not_found' || r?.reason === 'steam_not_found') {
        navigator.clipboard.writeText(val)
        s.className = 'cs2-tool-status cs2-status-warn'
        s.textContent = '⚠ Steam config not found — copied to clipboard. Paste in Steam → CS2 → Properties → Launch Options'
      } else {
        navigator.clipboard.writeText(val)
        s.className = 'cs2-tool-status cs2-status-warn'
        s.textContent = '⚠ Copied to clipboard — paste in Steam → CS2 → Properties → Launch Options'
      }
    }
  } catch {
    navigator.clipboard.writeText(val)
    if (s) { s.className = 'cs2-tool-status cs2-status-warn'; s.textContent = '⚠ Copied to clipboard — paste manually in Steam' }
  }
}

// ─── Autoexec Generator ───────────────────────────────────────────────────────
let _cs2VmPresetActive = 'desktop'

function cs2VmPreset(name) {
  _cs2VmPresetActive = name
  document.querySelectorAll('.cs2-preset-btn').forEach(b => b.classList.remove('active'))
  const btn = document.getElementById(`vm-preset-${name}`)
  if (btn) btn.classList.add('active')
  cs2UpdateAutoexecPreview()
}

function cs2UpdateAutoexecPreview() {
  const sens       = parseFloat(document.getElementById('ae-sens')?.value       || '2.0')
  const rawInput   = document.getElementById('ae-rawinput')?.checked   ? 1 : 0
  const customAccel= document.getElementById('ae-customaccel')?.checked? 1 : 0
  const vmFov      = parseInt(document.getElementById('ae-vmfov')?.value        || '60')
  const preset     = _vmPresets[_cs2VmPresetActive] || _vmPresets.desktop
  const rate       = document.getElementById('ae-rate')?.value         || '786432'
  const rateNum    = parseInt(rate, 10)
  const interpR    = document.getElementById('ae-interp-ratio')?.value || '1'
  const interp     = parseFloat(document.getElementById('ae-interp')?.value     || '0')
  const cmdrate    = document.getElementById('ae-cmdrate')?.value      || '128'
  const updaterate = document.getElementById('ae-updaterate')?.value   || '128'
  const mixahead   = parseFloat(document.getElementById('ae-mixahead')?.value   || '0.05')
  const voice      = document.getElementById('ae-voice')?.checked      ? 1 : 0
  const radar      = parseFloat(document.getElementById('ae-radar')?.value      || '1.0')
  const hud        = parseFloat(document.getElementById('ae-hud')?.value        || '0.85')

  const lines = [
    '// Generated by Jylli Tool — CS2 Autoexec Generator',
    `// Preset: ${_cs2VmPresetActive} viewmodel, ${rateNum >= 786432 ? '128-tick' : rateNum >= 512000 ? '64-tick' : 'matchmaking'} net`,
    '',
    '// ── Mouse ──────────────────────────────────',
    `sensitivity          ${sens.toFixed(2)}`,
    `m_rawinput           ${rawInput}`,
    `m_customaccel        ${customAccel}`,
    '',
    '// ── Viewmodel ───────────────────────────────',
    `viewmodel_fov        ${vmFov}`,
    `viewmodel_offset_x   ${preset.x}`,
    `viewmodel_offset_y   ${preset.y}`,
    `viewmodel_offset_z   ${preset.z}`,
    '',
    '// ── Network ─────────────────────────────────',
    `rate                 ${rate}`,
    `cl_interp_ratio      ${interpR}`,
    `cl_interp            ${interp}`,
    `cl_cmdrate           ${cmdrate}`,
    `cl_updaterate        ${updaterate}`,
    '',
    '// ── Audio ───────────────────────────────────',
    `snd_mixahead         ${mixahead.toFixed(2)}`,
    `voice_enable         ${voice}`,
    '',
    '// ── HUD / Radar ─────────────────────────────',
    `cl_hud_radar_scale   ${radar.toFixed(2)}`,
    `hud_scaling          ${hud.toFixed(2)}`,
  ]
  const pre = document.getElementById('cs2-autoexec-pre')
  if (pre) pre.textContent = lines.join('\n')
}

function cs2CopyAutoexec() {
  const txt = document.getElementById('cs2-autoexec-pre')?.textContent || ''
  navigator.clipboard.writeText(txt).then(() => {
    const s = document.getElementById('cs2-ae-status')
    if (s) { s.className = 'cs2-tool-status cs2-status-ok'; s.textContent = '✓ Copied to clipboard' }
    setTimeout(() => { if (s) s.textContent = '' }, 2500)
  })
}

async function cs2DeployAutoexec() {
  const txt = document.getElementById('cs2-autoexec-pre')?.textContent || ''
  const s = document.getElementById('cs2-ae-status')
  if (s) { s.className = 'cs2-tool-status cs2-status-muted'; s.textContent = '↑ Deploying…' }
  try {
    const r = await window.api.cs2DeployAutoexec(txt)
    if (s) {
      if (r?.ok) {
        s.className = 'cs2-tool-status cs2-status-ok'
        s.textContent = `✓ Deployed → ${r.path} — CS2 loads it automatically on next launch`
      } else {
        s.className = 'cs2-tool-status cs2-status-err'
        s.textContent = r?.error || '✗ Deploy failed — CS2 cfg folder not found'
      }
    }
  } catch(e) {
    if (s) { s.className = 'cs2-tool-status cs2-status-err'; s.textContent = `✗ ${e.message}` }
  }
}

// ─── Live Ping Plotter ────────────────────────────────────────────────────────
async function cs2StartPing(btn) {
  if (_cs2PingInterval) return
  document.getElementById('cs2-ping-placeholder')?.style.setProperty('display', 'none')
  if (btn) { btn.style.display = 'none'; document.getElementById('cs2-ping-stop-btn').style.display = '' }
  _cs2PingHistory = {}; _cs2PingStats = {}; _cs2MaxSmooth = 100; _cs2ChartDirty = false
  _cs2PingInterval = true  // running sentinel before first setTimeout is set
  cs2StartChartRaf()
  cs2PingLoop()
}

async function cs2PingLoop() {
  if (!_cs2PingInterval) return
  await cs2DoPing()
  // Chain next call only after current completes — no overlap possible
  if (_cs2PingInterval) _cs2PingInterval = setTimeout(cs2PingLoop, 600)
}

async function cs2DoPing() {
  const servers = {}
  document.querySelectorAll('.cs2-ping-chk:checked').forEach(c => {
    if (CS2_SERVERS[c.dataset.server]) servers[c.dataset.server] = CS2_SERVERS[c.dataset.server]
  })
  if (!Object.keys(servers).length) return
  try {
    const r = await window.api.cs2PingServers(servers)
    if (!r?.ok || !Array.isArray(r.results)) return
    r.results.forEach(({ name, avg, min, max, jitter, loss }) => {
      const key = name.replace(/ /g, '-')

      // Rolling 120-point history (~2 min at ~1s cadence)
      if (!_cs2PingHistory[name]) _cs2PingHistory[name] = []
      _cs2PingHistory[name].push(avg < 900 ? avg : null)
      if (_cs2PingHistory[name].length > 120) _cs2PingHistory[name].shift()

      // Session stats + 10-sample rolling avg for "current" display
      if (!_cs2PingStats[name]) _cs2PingStats[name] = { min: avg, max: 0, samples: [] }
      const st = _cs2PingStats[name]
      if (avg < 900) {
        st.samples.push(avg)
        if (st.samples.length > 10) st.samples.shift()
        if (avg < st.min) st.min = avg
        if (avg > st.max) st.max = avg
      }
      const rollingAvg = st.samples.length
        ? Math.round(st.samples.reduce((a, b) => a + b, 0) / st.samples.length) : avg

      // Live chip — color-coded by quality
      const chipPing = document.getElementById(`cs2-chip-ping-${key}`)
      if (chipPing) {
        chipPing.textContent = avg < 900 ? `${avg}ms` : 'T/O'
        chipPing.className = `cs2-server-ping ${avg < 50 ? 'cs2-ping-good' : avg < 100 ? 'cs2-ping-ok' : 'cs2-ping-bad'}`
      }

      // Stats table: rolling avg shown as "avg", session min/max
      const setEl = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = (typeof val === 'number' && val < 900) ? val : '—' }
      setEl(`cs2-ps-avg-${key}`, rollingAvg)
      setEl(`cs2-ps-min-${key}`, st.min < 900 ? st.min : 999)
      setEl(`cs2-ps-max-${key}`, st.max)
      setEl(`cs2-ps-jit-${key}`, jitter)

      const lossEl = document.getElementById(`cs2-ps-loss-${key}`)
      if (lossEl) {
        lossEl.textContent = loss > 0 ? `${loss}%` : ''
        lossEl.className = `cs2-stat-loss${loss > 2 ? ' cs2-loss-high' : ''}`
      }
    })
    _cs2ChartDirty = true
  } catch { /* network error — next loop will retry */ }
}

function cs2StartChartRaf() {
  if (_cs2RafId) cancelAnimationFrame(_cs2RafId)
  const tick = () => {
    if (!_cs2PingInterval) return
    if (_cs2ChartDirty) { cs2DrawPingChart(); _cs2ChartDirty = false }
    _cs2RafId = requestAnimationFrame(tick)
  }
  _cs2RafId = requestAnimationFrame(tick)
}

function cs2DrawPingChart() {
  const canvas = document.getElementById('cs2-ping-canvas')
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  // clientWidth is 0 before first layout; offsetWidth/parentElement fallback ensures correct size
  const W = canvas.clientWidth || canvas.offsetWidth || canvas.parentElement?.clientWidth || 800
  const H = canvas.clientHeight || canvas.offsetHeight || 160
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H }

  const ML = 44, MR = 8, MT = 10, MB = 22
  const CW = W - ML - MR, CH = H - MT - MB
  const TOTAL = 120

  // Smoothly lerp Y-axis ceiling — prevents jarring rescales on ping spikes
  const allVals = Object.values(_cs2PingHistory).flat().filter(v => v !== null && v < 900)
  const rawMax  = allVals.length ? Math.max(...allVals) : 60
  const target  = Math.max(Math.ceil(rawMax * 1.3 / 10) * 10, 30)
  _cs2MaxSmooth += (target - _cs2MaxSmooth) * 0.06
  const maxPing = _cs2MaxSmooth

  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#080610'
  ctx.fillRect(0, 0, W, H)

  // Grid lines + Y-axis labels (left margin)
  const gridN = 4
  ctx.font = '9px monospace'
  ctx.textAlign = 'right'
  for (let i = 0; i <= gridN; i++) {
    const frac = i / gridN
    const y = Math.round(MT + CH * frac) + 0.5
    const val = Math.round(maxPing * (1 - frac))
    ctx.strokeStyle = i === gridN ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(ML, y); ctx.lineTo(W - MR, y); ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.22)'
    ctx.fillText(`${val}ms`, ML - 4, y + 3)
  }

  // X-axis time markers (bottom margin)
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.font = '8px monospace'
  for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
    const x = ML + CW * frac
    const sAgo = Math.round(TOTAL * (1 - frac) * 0.85)
    ctx.fillText(frac === 1 ? 'now' : `-${sAgo}s`, x, H - 5)
  }

  const toX = i => ML + CW * (i / (TOTAL - 1))
  const toY = v => MT + CH * (1 - Math.min(v, maxPing * 1.05) / maxPing)

  const selected = new Set()
  document.querySelectorAll('.cs2-ping-chk:checked').forEach(c => selected.add(c.dataset.server))

  selected.forEach(name => {
    const raw  = _cs2PingHistory[name] || []
    // Right-align: pad left with nulls so latest point is always at the right edge
    const hist = [...Array(Math.max(0, TOTAL - raw.length)).fill(null), ...raw]
    const color = CS2_SERVER_COLORS[name] || '#fff'

    // Count non-null points to decide render path
    const nonNullCount = hist.filter(v => v !== null).length

    // Area fill (skip for single point — dot conveys same info)
    if (nonNullCount >= 2) {
      const grad = ctx.createLinearGradient(0, MT, 0, MT + CH)
      grad.addColorStop(0, color + '22')
      grad.addColorStop(1, color + '03')
      ctx.beginPath()
      let inArea = false
      for (let i = 0; i < TOTAL; i++) {
        if (hist[i] === null) {
          if (inArea) {
            ctx.lineTo(toX(i - 1), MT + CH)
            ctx.closePath(); ctx.fillStyle = grad; ctx.fill()
            ctx.beginPath(); inArea = false
          }
          continue
        }
        if (!inArea) { ctx.moveTo(toX(i), MT + CH); ctx.lineTo(toX(i), toY(hist[i])); inArea = true }
        else ctx.lineTo(toX(i), toY(hist[i]))
      }
      if (inArea) { ctx.lineTo(toX(TOTAL - 1), MT + CH); ctx.closePath(); ctx.fillStyle = grad; ctx.fill() }
    }

    // Line stroke (needs 2+ points)
    if (nonNullCount >= 2) {
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round'
      ctx.beginPath()
      let ls = false
      for (let i = 0; i < TOTAL; i++) {
        if (hist[i] === null) { ls = false; continue }
        if (!ls) { ctx.moveTo(toX(i), toY(hist[i])); ls = true }
        else ctx.lineTo(toX(i), toY(hist[i]))
      }
      ctx.stroke()
    }

    // Glowing live dot at the rightmost data point
    const revIdx = [...hist].reverse().findIndex(v => v !== null)
    if (revIdx !== -1) {
      const lastIdx = TOTAL - 1 - revIdx
      const lastVal = hist[lastIdx]
      const lx = toX(lastIdx), ly = toY(lastVal)
      // Outer glow halo
      ctx.beginPath(); ctx.arc(lx, ly, 7, 0, Math.PI * 2)
      ctx.fillStyle = color + '20'; ctx.fill()
      // Solid dot
      ctx.beginPath(); ctx.arc(lx, ly, 3.5, 0, Math.PI * 2)
      ctx.fillStyle = color; ctx.fill()
      ctx.strokeStyle = '#080610'; ctx.lineWidth = 1.5; ctx.stroke()
    }
  })
}

function cs2StopPing() {
  if (typeof _cs2PingInterval === 'number') clearTimeout(_cs2PingInterval)
  _cs2PingInterval = null
  if (_cs2RafId) { cancelAnimationFrame(_cs2RafId); _cs2RafId = null }
  const start = document.getElementById('cs2-ping-start-btn')
  const stop  = document.getElementById('cs2-ping-stop-btn')
  if (start) start.style.display = ''
  if (stop)  stop.style.display  = 'none'
}

// ─── Frame Consistency Meter ──────────────────────────────────────────────────
async function cs2StartFrameMonitor() {
  const ph    = document.getElementById('cs2-frame-placeholder')
  const live  = document.getElementById('cs2-frame-live')
  const title = ph?.querySelector('.cs2-frame-idle-title')
  const hint  = ph?.querySelector('.cs2-frame-idle-hint')
  if (!ph || !live) return

  // Reset to default idle text in case a previous run changed it
  if (title) title.textContent = tUI('cs2FrameNotRunning')
  if (hint)  hint.textContent  = tUI('cs2FrameIdleHint')

  try {
    const proc = await window.api.cs2CheckProcess('cs2.exe')
    if (!proc?.running) {
      ph.style.display = ''; live.style.display = 'none'
      return
    }
    const r = await window.api.cs2PresentmonStart('cs2.exe')
    if (!r?.ok) {
      if (title) title.textContent = r?.reason === 'presentmon_not_found'
        ? 'PresentMon not found'
        : `Failed to start capture${r?.error ? ': ' + r.error : ''}`
      if (hint) hint.textContent = 'Try relaunching the app.'
      ph.style.display = ''; live.style.display = 'none'
      return
    }
    ph.style.display = 'none'; live.style.display = ''
    _cs2FrameBuffer = []
    if (_cs2FrameInterval) clearInterval(_cs2FrameInterval)
    _cs2FrameInterval = setInterval(cs2PollFrameData, 500)
  } catch(e) {
    if (title) title.textContent = 'Error starting monitor'
    if (hint)  hint.textContent  = e?.message || 'Unknown error'
    ph.style.display = ''; live.style.display = 'none'
  }
}

async function cs2PollFrameData() {
  try {
    const r = await window.api.cs2PresentmonSnapshot()
    if (!r?.ok || !r.data) return
    const { avgFps, low1Fps, low01Fps, frameTimes } = r.data
    // frameTimes is the last 360 raw frame times from main — store only the newest batch
    // by tracking how many we already have from the main buffer (avoid double-accumulation)
    if (frameTimes?.length) {
      _cs2FrameBuffer = frameTimes.slice()  // replace with current snapshot window
    }
    const setEl = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val }
    setEl('cs2-fps-avg',   avgFps   ? Math.round(avgFps)   + ' FPS' : '—')
    setEl('cs2-fps-1low',  low1Fps  ? Math.round(low1Fps)  + ' FPS' : '—')
    setEl('cs2-fps-01low', low01Fps ? Math.round(low01Fps) + ' FPS' : '—')
    setEl('cs2-ft-ms',     avgFps   ? (1000 / avgFps).toFixed(1) + ' ms' : '—')
    if (frameTimes?.length) cs2DrawFrameChart(frameTimes.slice(-240))
  } catch { /* presentmon settling */ }
}

function cs2DrawFrameChart(frameTimes) {
  const canvas = document.getElementById('cs2-frame-canvas')
  if (!canvas || !frameTimes.length) return
  const ctx = canvas.getContext('2d')
  const W = canvas.clientWidth || canvas.offsetWidth || 800
  const H = canvas.clientHeight || canvas.offsetHeight || 110
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H }
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = 'rgba(13,11,20,0.95)'; ctx.fillRect(0, 0, W, H)

  // Grid
  const gridMs = [8, 16, 33.3]
  const maxFt  = Math.max(...frameTimes, 33.3)
  gridMs.forEach(ms => {
    if (ms > maxFt * 1.1) return
    const y = Math.round(H - (ms / maxFt) * (H - 4)) + 0.5
    ctx.strokeStyle = ms === 8 ? 'rgba(34,197,94,0.15)' : ms === 16 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 4])
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = ms === 8 ? 'rgba(34,197,94,0.4)' : ms === 16 ? 'rgba(245,158,11,0.4)' : 'rgba(239,68,68,0.4)'
    ctx.font = '8px monospace'; ctx.textAlign = 'left'
    ctx.fillText(`${ms}ms`, 3, y - 2)
  })

  const barW = Math.max(W / frameTimes.length, 1)
  frameTimes.forEach((ft, i) => {
    const bh    = Math.max((ft / maxFt) * (H - 4), 1)
    const color = ft < 8 ? '#22c55e' : ft < 16 ? '#f59e0b' : '#ef4444'
    ctx.fillStyle = color
    ctx.fillRect(i * barW, H - bh, Math.max(barW - 0.5, 0.5), bh)
  })
}

function cs2StopFrameMonitor() {
  if (_cs2FrameInterval) { clearInterval(_cs2FrameInterval); _cs2FrameInterval = null }
  try { window.api.cs2PresentmonStop() } catch { /* ignore */ }
}

function cs2ExportFrameCsv() {
  if (!_cs2FrameBuffer.length) { showToast && showToast('No frame data to export.', 'warn'); return }
  const csv = 'frame_time_ms\n' + _cs2FrameBuffer.map(v => v.toFixed(3)).join('\n')
  navigator.clipboard.writeText(csv).then(() => { if (typeof showToast === 'function') showToast('Frame data copied as CSV.', 'ok') })
}

// ─── Config Profiles Panel ────────────────────────────────────────────────────
const CS2_ALL_TWEAK_IDS = [
  'cs2-network','cs2-mmcss','cs2-priority','cs2-fullscreen-opti','cs2-timer',
  'cs2-gpu-prerender','cs2-audio-latency','cs2-input-responsiveness','cs2-affinity',
  'cs2-gpu-scheduling','cs2-network-recv-buf','cs2-hpet-off','cs2-power-throttle-off'
]
const CS2_BUILTIN_PROFILES = {
  'Competitive (Safe)': {
    desc: 'All Tier-1 tweaks. No reboot required for most. Best for daily use.',
    ids: ['cs2-network','cs2-mmcss','cs2-priority','cs2-fullscreen-opti','cs2-audio-latency',
          'cs2-gpu-prerender','cs2-input-responsiveness','cs2-power-throttle-off','cs2-network-recv-buf']
  },
  'Max Performance': {
    desc: 'Every tweak including HPET, HAGS, and CPU affinity. Requires reboots.',
    ids: CS2_ALL_TWEAK_IDS
  },
  'Network Only': {
    desc: 'Pure latency reduction — only network-layer tweaks. Safest option.',
    ids: ['cs2-network','cs2-network-recv-buf']
  },
}

function _cs2BuildProfilesPanel() {
  const el = document.createElement('div')
  el.id = 'cs2-profiles-panel'
  el.className = 'cs2-tool-panel cs2-panel-profiles'
  el.style.display = 'none'
  el.setAttribute('role', 'region')
  el.innerHTML = `
    <div class="cs2-tp-accent"></div>
    <div class="cs2-tp-header">
      <div class="cs2-tp-icon cs2-tp-icon-profiles"><i class="fa fa-layer-group"></i></div>
      <div class="cs2-tp-meta">
        <div class="cs2-tp-title">${tUI('cs2ProfilesPanelTitle')}</div>
        <div class="cs2-tp-subtitle">${tUI('cs2ProfilesPanelDesc')}</div>
      </div>
      <button class="cs2-tp-close" onclick="cs2CloseProfilesPanel()" aria-label="Close"><i class="fa fa-xmark"></i></button>
    </div>
    <div class="cs2-tp-body">
      <div class="cs2-profiles-layout">
        <div class="cs2-profiles-left">
          <div class="cs2-profiles-section-label">${tUI('cs2ProfilesBuiltinLabel')}</div>
          <div class="cs2-profiles-builtin" id="cs2-profiles-builtin"></div>
          <div class="cs2-profiles-section-label" style="margin-top:12px">${tUI('cs2ProfilesSavedLabel')}</div>
          <div class="cs2-profiles-saved" id="cs2-profiles-saved"></div>
          <button class="cs2-profile-save-btn" onclick="cs2SaveCurrentProfile()">
            <i class="fa fa-floppy-disk"></i> ${tUI('cs2ProfilesSaveBtn')}
          </button>
        </div>
        <div class="cs2-profiles-right">
          <div class="cs2-profiles-section-label">${tUI('cs2ProfilesPreviewLabel')}</div>
          <div class="cs2-profile-preview" id="cs2-profile-preview">
            <div class="cs2-profile-preview-empty"><i class="fa fa-layer-group"></i><span>${tUI('cs2ProfilesSelectHint')}</span></div>
          </div>
        </div>
      </div>
      <div id="cs2-profiles-status" class="cs2-tool-status"></div>
    </div>
  `
  return el
}

// Profiles data store keyed by a numeric index for safe HTML embedding
let _cs2ProfilesData = {}

function cs2RenderProfiles() {
  const builtinEl = document.getElementById('cs2-profiles-builtin')
  const savedEl   = document.getElementById('cs2-profiles-saved')
  if (!builtinEl) return

  _cs2ProfilesData = {}
  let idx = 0

  // Built-in profiles
  builtinEl.innerHTML = Object.entries(CS2_BUILTIN_PROFILES).map(([name, p]) => {
    const key = `b${idx++}`
    _cs2ProfilesData[key] = { name, ...p }
    return `
    <div class="cs2-profile-card cs2-profile-builtin" onclick="cs2PreviewProfileByKey('${key}', this)">
      <div class="cs2-pc-name">${name}</div>
      <div class="cs2-pc-desc">${p.desc}</div>
      <div class="cs2-pc-count"><i class="fa fa-sliders"></i> ${p.ids.length} tweaks</div>
    </div>`
  }).join('')

  // Saved profiles from settings
  const saved = _cs2GetSavedProfiles()
  if (savedEl) {
    if (!saved.length) {
      savedEl.innerHTML = `<div class="cs2-profiles-empty-hint">${tUI('cs2ProfilesNoSaved')}</div>`
    } else {
      savedEl.innerHTML = saved.map((p, i) => {
        const key = `s${i}`
        _cs2ProfilesData[key] = p
        return `
        <div class="cs2-profile-card cs2-profile-saved" onclick="cs2PreviewProfileByKey('${key}', this)">
          <div class="cs2-pc-name">${p.name}</div>
          <div class="cs2-pc-count"><i class="fa fa-sliders"></i> ${p.ids.length} tweaks</div>
          <button class="cs2-pc-delete" onclick="event.stopPropagation();cs2DeleteProfile(${i})" title="Delete"><i class="fa fa-trash"></i></button>
        </div>`
      }).join('')
    }
  }
}

function cs2PreviewProfileByKey(key, cardEl) {
  document.querySelectorAll('.cs2-profile-card').forEach(c => c.classList.remove('cs2-profile-selected'))
  if (cardEl) cardEl.classList.add('cs2-profile-selected')
  const profile = _cs2ProfilesData[key]
  if (!profile) return
  cs2PreviewProfile(profile.name, profile)
}

function cs2PreviewProfile(name, profile) {
  const el = document.getElementById('cs2-profile-preview')
  if (!el) return

  const rows = profile.ids.map(id => {
    const applied = settings[`tweak_${id}`] === 'applied'
    const label = tName(id) || id
    return `<div class="cs2-pv-row ${applied ? 'cs2-pv-applied' : ''}">
      <i class="fa ${applied ? 'fa-check' : 'fa-circle-dot'}" style="color:${applied ? 'var(--c-hw-ram)' : 'var(--c-text-tertiary)'}"></i>
      <span>${label}</span>
      ${applied ? `<span class="cs2-pv-badge">Applied</span>` : ''}
    </div>`
  }).join('')

  // Store ids on the button via data attribute to avoid JSON-in-onclick quote issues
  el.innerHTML = `
    <div class="cs2-pv-title">${name}</div>
    ${profile.desc ? `<div class="cs2-pv-desc">${profile.desc}</div>` : ''}
    <div class="cs2-pv-rows">${rows}</div>
    <div class="cs2-pv-actions">
      <button class="cs2-pv-apply-btn" id="cs2-pv-apply-btn">
        <i class="fa fa-bolt"></i> ${tUI('cs2ProfilesApplyBtn')}
      </button>
    </div>
  `
  const applyBtn = el.querySelector('#cs2-pv-apply-btn')
  if (applyBtn) applyBtn.addEventListener('click', () => cs2ApplyProfile(profile.ids))
}

async function cs2ApplyProfile(ids) {
  const s = document.getElementById('cs2-profiles-status')
  if (s) { s.className = 'cs2-tool-status cs2-status-muted'; s.textContent = '↑ Applying profile…' }
  let applied = 0
  for (const id of ids) {
    if (settings[`tweak_${id}`] !== 'applied') {
      const toggle = document.querySelector(`#tcw-${id} input[type=checkbox]`)
      if (toggle && !toggle.checked) { toggle.click(); await new Promise(r => setTimeout(r, 500)) }
      applied++
    }
  }
  if (s) {
    s.className = 'cs2-tool-status cs2-status-ok'
    s.textContent = applied > 0 ? `✓ Applied ${applied} tweak${applied > 1 ? 's' : ''}` : '✓ All tweaks in profile already applied'
    setTimeout(() => { if (s) s.textContent = '' }, 3000)
  }
}

function cs2SaveCurrentProfile() {
  const applied = CS2_ALL_TWEAK_IDS.filter(id => settings[`tweak_${id}`] === 'applied')
  if (!applied.length) {
    const s = document.getElementById('cs2-profiles-status')
    if (s) { s.className = 'cs2-tool-status cs2-status-warn'; s.textContent = '⚠ No CS2 tweaks are currently applied' }
    return
  }
  const name = `My Profile ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`
  const saved = _cs2GetSavedProfiles()
  saved.push({ name, ids: applied, savedAt: Date.now() })
  settings['cs2_profiles'] = JSON.stringify(saved)
  if (typeof saveSettings === 'function') saveSettings()
  cs2RenderProfiles()
  const s = document.getElementById('cs2-profiles-status')
  if (s) {
    s.className = 'cs2-tool-status cs2-status-ok'
    s.textContent = `✓ Saved "${name}" with ${applied.length} tweaks`
    setTimeout(() => { if (s) s.textContent = '' }, 3000)
  }
}

function cs2DeleteProfile(idx) {
  const saved = _cs2GetSavedProfiles()
  saved.splice(idx, 1)
  settings['cs2_profiles'] = JSON.stringify(saved)
  if (typeof saveSettings === 'function') saveSettings()
  cs2RenderProfiles()
}

function _cs2GetSavedProfiles() {
  try { return JSON.parse(settings['cs2_profiles'] || '[]') } catch { return [] }
}
