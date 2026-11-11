'use strict'
// JylliPremium: the one pitch shown on every Premium tab a free user opens. Each tab gets a headline written for its feature, three
// benefits, facts read from THIS PC (never guessed), an animated example of the feature, the price, and chips for the rest of Premium.
// Pure parts (TABS, factsFor, previewHtml) are unit-tested; build() touches the DOM. Copy lives in LANG group `premium`.
;(function (root) {
  // tab id -> legacy page + tab id (for the chips), icon, which facts apply. Order = order of the chips.
  const TABS = {
    pulse:     { page: 'pulse',           icon: 'bolt',          facts: ['gpu', 'cpu', 'games'] },
    games:     { page: 'game-opti',       icon: 'gamepad',       facts: ['games', 'gpu'] },
    fivem:     { page: 'fivem',           icon: 'car-side',      facts: ['gpu', 'cpu'] },
    latency:   { page: 'latency-monitor', icon: 'wave-square',   facts: ['cpu', 'gpu'] },
    bios:      { page: 'bios-tuner',      icon: 'microchip',     facts: ['cpu', 'form'] },
    scheduler: { page: 'scheduler',       icon: 'calendar-check', facts: ['form'] },
    cpumem:    { page: 'hardware',        icon: 'memory',        facts: ['cpu', 'ram'] },
    gpu:       { page: 'hardware',        icon: 'display',       facts: ['gpu', 'vram'] },
    power:     { page: 'hardware',        icon: 'plug-circle-bolt', facts: ['form', 'disk'] },
  }
  const ORDER = Object.keys(TABS)
  const STORE_FALLBACK = 'https://jyllitool.netlify.app/'

  const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').replace(/\(R\)|\(TM\)|®|™/g, '').trim()

  /** Facts about this PC for a tab: [{ k, v }]. A value that is missing, zero or not a string/number yields no fact. */
  function factsFor(tab, ctx) {
    const def = TABS[tab]; if (!def) return []
    const c = ctx || {}, out = []
    for (const k of def.facts) {
      let v = null
      if (k === 'cpu' && c.cpu) v = clean(c.cpu).replace(/\s+\d+-Core Processor$/i, '')
      else if (k === 'gpu' && c.gpu) v = clean(c.gpu)
      else if (k === 'ram' && Number(c.ramGB) > 0) v = `${Math.round(Number(c.ramGB))} GB${c.ramType ? ' ' + clean(c.ramType) : ''}`
      else if (k === 'vram' && Number(c.vramMB) > 0) v = `${Math.round(Number(c.vramMB) / 1024)} GB VRAM`
      else if (k === 'disk' && c.diskType) v = clean(c.diskType)
      else if (k === 'games' && Number(c.games) > 0) v = Number(c.games)
      else if (k === 'form' && typeof c.isLaptop === 'boolean') v = c.isLaptop ? 'laptop' : 'desktop'
      if (v !== null && v !== '') out.push({ k, v })
    }
    return out
  }

  // ── animated examples: HTML/SVG only, text is neutral (product terms) or comes from `t`; only transform and opacity animate ──
  const row = (label, val, i, tone) => `<div class="jp-r" style="--i:${i}"><span>${label}</span><b${tone ? ` class="jp-${tone}"` : ''}>${val}</b></div>`
  const bar = (pct, i) => `<span class="jp-bar" style="--i:${i}"><i style="--w:${pct / 100}"></i></span>`

  function previewHtml(tab, t) {
    const T = t || (k => k)
    switch (tab) {
      case 'pulse': return `<div class="jp-pv"><div class="jp-chips"><span class="jp-chip jp-on">FiveM</span><span class="jp-chip">CS2</span><span class="jp-chip">Valorant</span></div>
        ${row('Timer', '0.5 ms', 1, 'ok')}${row('Priority', 'High', 2, 'ok')}${row('CPU cores', '8 / 8', 3, 'ok')}${row('Background apps', T('pvPulseBg'), 4)}
        <div class="jp-foot"><i class="fa fa-rotate-left"></i>${T('pvPulseRestore')}</div></div>`
      case 'games': return `<div class="jp-pv jp-cards">${['FiveM', 'CS2', 'Rust'].map((g, i) => `<div class="jp-card" style="--i:${i + 1}"><div class="jp-card-t">${g}</div>${bar([86, 64, 72][i], i + 1)}<div class="jp-card-s">${[12, 9, 7][i]} ${T('pvTweaks')}</div></div>`).join('')}</div>`
      case 'fivem': return `<div class="jp-pv jp-split"><svg viewBox="0 0 80 80" class="jp-ring" aria-hidden="true"><circle cx="40" cy="40" r="32" class="jp-ring-bg"/><circle cx="40" cy="40" r="32" class="jp-ring-fg" pathLength="100"/></svg>
        <div class="jp-col">${row(T('pvFivemRow1'), T('pvFivemTier'), 1, 'ok')}${row(T('pvFivemRow2'), T('pvFivemTweaks'), 2)}${row(T('pvFivemRow3'), T('pvFivemCache'), 3)}</div></div>`
      case 'latency': return `<div class="jp-pv"><svg viewBox="0 0 220 70" class="jp-graph" aria-hidden="true" preserveAspectRatio="none"><path class="jp-gridl" d="M0 55H220M0 35H220M0 15H220"/>
        <polyline class="jp-line" pathLength="100" points="0,52 20,50 40,53 60,49 80,51 95,12 105,48 125,52 150,50 170,53 190,49 220,51"/><circle class="jp-spot" cx="95" cy="12" r="3.5"/></svg>
        ${row('nvlddmkm.sys', T('pvLatSpike'), 1, 'bad')}${row('ndis.sys', 'OK', 2, 'ok')}</div>`
      case 'bios': return `<div class="jp-pv">${row('XMP / EXPO', T('pvBiosLow'), 1, 'ok')}${row('Hyper-V', T('pvBiosLow'), 2, 'ok')}${row('C-States', T('pvBiosMid'), 3, 'warn')}${row('Resizable BAR', T('pvBiosMid'), 4, 'warn')}
        <div class="jp-foot"><i class="fa fa-shield-halved"></i>${T('pvBiosVerify')}</div></div>`
      case 'scheduler': return `<div class="jp-pv"><div class="jp-week">${[0, 1, 2, 3, 4, 5, 6].map(d => `<span class="${d === 6 ? 'jp-day jp-on' : 'jp-day'}" style="--i:${d}"></span>`).join('')}</div>
        ${row(T('pvSchedClean'), T('pvSchedWeekly'), 1, 'ok')}${row(T('pvSchedRestore'), T('pvSchedMonthly'), 2)}</div>`
      case 'cpumem': return `<div class="jp-pv"><div class="jp-cores">${Array.from({ length: 16 }, (_, i) => `<span style="--i:${i}"></span>`).join('')}</div>${row('RAM', 'DDR5', 1, 'ok')}${row('Standby list', T('pvMemFlush'), 2)}</div>`
      case 'gpu': return `<div class="jp-pv jp-split"><svg viewBox="0 0 80 50" class="jp-gauge" aria-hidden="true"><path class="jp-ring-bg" d="M8 44A32 32 0 0 1 72 44" pathLength="100"/><path class="jp-ring-fg" d="M8 44A32 32 0 0 1 72 44" pathLength="100"/></svg>
        <div class="jp-col">${row(T('pvGpuPower'), '100 %', 1, 'ok')}${row('VRAM', '4.1 / 12 GB', 2)}${row(T('pvGpuTemp'), '58 °C', 3)}</div></div>`
      case 'power': return `<div class="jp-pv">${row(T('pvPowerPlan'), 'Ultimate', 1, 'ok')}${row('NVMe', T('pvPowerTrim'), 2, 'ok')}${row(T('pvPowerSleep'), T('pvPowerSleepVal'), 3)}<div class="jp-drive">${bar(46, 4)}</div></div>`
      default: return ''
    }
  }

  const tg = key => (root.tG ? root.tG('premium', key) : key)
  const esc = s => (root.ui && root.ui.esc ? root.ui.esc(s) : String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]))

  function factLabel(k) { return tg('fact_' + k) }
  function factValue(f) {
    if (f.k === 'form') return tg('form_' + f.v)
    if (f.k === 'games') return tg('factGamesN').replace('{n}', f.v)
    return esc(f.v)
  }

  async function open() {
    let url = STORE_FALLBACK
    try { const u = await root.api.getPremiumUrl(); if (/^https:\/\//.test(u)) url = u } catch {}
    try { root.api.openExternal(url) } catch {}
  }

  function go(tab) { const d = TABS[tab]; if (d && root.showPage) root.showPage(d.page, tab) }

  /** Fills `c` with the pitch for `tab`. Safe to call for any tab id; unknown ids fall back to a plain panel. */
  async function build(c, tab) {
    if (!TABS[tab]) tab = 'pulse'
    const def = TABS[tab]
    const sys = (typeof sysInfo !== 'undefined' && sysInfo) || {}   // top-level `let` in index.html: shared scope, not on window
    const facts = factsFor(tab, sys)
    const pc = facts.map(f => `<span class="jp-fact"><em>${factLabel(f.k)}</em>${factValue(f)}</span>`).join('')
    const wantGames = def.facts.includes('games') && !facts.some(f => f.k === 'games')
    const el = document.createElement('section')
    el.className = 'tab-premium-lock jp'
    el.dataset.tour = 'prolock-card'
    el.dataset.jpTab = tab
    el.innerHTML = `
      <div class="jp-hero">
        <div class="jp-copy">
          <span class="jp-badge"><i class="fa fa-crown" aria-hidden="true"></i>${tg('badge')}</span>
          <h2 class="jp-title">${tg('head_' + tab)}</h2>
          <p class="jp-lead">${tg('lead_' + tab)}</p>
          <ul class="jp-points">${[1, 2, 3].map(n => `<li><i class="fa fa-check" aria-hidden="true"></i>${tg('b' + n + '_' + tab)}</li>`).join('')}</ul>
          <div class="jp-pc" ${pc || wantGames ? '' : 'hidden'}><span class="jp-pc-h">${tg('onYourPc')}</span><span class="jp-facts">${pc}<span id="jp-games-slot"></span></span></div>
          <div class="jp-cta-row">
            <button type="button" class="jp-cta" data-tour="prolock-cta"><i class="fa fa-crown" aria-hidden="true"></i><span>${tg('cta').replace('{name}', tg('name_' + tab))}</span></button>
            <div class="jp-price"><b>${tg('price')}</b><span>${tg('priceNote')}</span></div>
          </div>
          <p class="jp-note"><i class="fa fa-lock-open" aria-hidden="true"></i>${tg('freeStays')} ${tg('deliveryNote')}</p>
        </div>
        <div class="jp-stage" aria-hidden="true">${previewHtml(tab, tg)}<span class="jp-ex">${tg('example')}</span></div>
      </div>
      <div class="jp-bundle">
        <div class="jp-bundle-h"><b>${tg('bundleTitle')}</b><span>${tg('bundleSub')}</span></div>
        <div class="jp-bundle-chips">${ORDER.filter(t => t !== tab).map(t => `<button type="button" class="jp-bchip" data-go="${t}"><i class="fa fa-${TABS[t].icon}" aria-hidden="true"></i>${tg('name_' + t)}</button>`).join('')}</div>
        <div class="jp-perks">${['perkMax', 'perkAria', 'perkHud', 'perkAuto'].map(k => `<span><i class="fa fa-crown" aria-hidden="true"></i>${tg(k)}</span>`).join('')}</div>
      </div>`
    c.appendChild(el)
    el.querySelector('.jp-cta').addEventListener('click', open)
    el.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)))
    if (wantGames && root.api && root.api.detectGames) {
      root.api.detectGames().then(r => {
        const n = (Array.isArray(r) ? r : (r && r.games) || []).length
        const slot = el.querySelector('#jp-games-slot')
        if (!slot || !el.isConnected || !(n > 0)) { const box = el.querySelector('.jp-pc'); if (box && !el.querySelector('.jp-fact')) box.hidden = true; return }
        slot.outerHTML = `<span class="jp-fact"><em>${factLabel('games')}</em>${factValue({ k: 'games', v: n })}</span>`
        const box = el.querySelector('.jp-pc'); if (box) box.hidden = false
      }).catch(() => {})
    }
    return el
  }

  const api = { TABS, ORDER, factsFor, previewHtml, build, open }
  root.JylliPremium = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
