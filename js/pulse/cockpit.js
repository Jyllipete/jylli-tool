'use strict'
// Pulse Cockpit: the standalone window (pulse.html). The same engine, river and copy as the tab, laid out as a cockpit, plus the
// tools that only make sense next to a running game: per-core load, the thermal audit and the process lens.
;(function () {
  if (typeof document === 'undefined') return
  const A = window.api
  const UI = window.JylliPulseUI
  const lang = new URLSearchParams(location.search).get('lang') === 'fi' ? 'fi' : 'en'
  const dict = () => (window.LANG[lang] && window.LANG[lang].pulse2) || {}
  const T = (k, v) => {
    let s = dict()[k]; if (s == null) s = window.LANG.en.pulse2[k]; if (s == null) return k
    return v ? s.replace(/\{(\w+)\}/g, (m, n) => (v[n] == null ? m : v[n])) : s
  }
  document.documentElement.lang = lang
  const { esc, n0, n1 } = UI
  const $ = id => document.getElementById(id)
  const S = { live: null, boost: { active: false, steps: [] }, presets: [], selected: '', busy: false, prefs: null, limKey: '', recvKey: '', thermal: null, procs: [], procSort: 'cpu', confirmPid: null, audit: false, marks: [] }

  // static copy for the titlebar and the keep-running prompt
  $('ck-hud').title = T('ck_hud'); $('ck-hud').setAttribute('aria-label', T('ck_hud'))
  $('ck-pin').title = T('pinCockpit'); $('ck-pin').setAttribute('aria-label', T('pinCockpit'))
  $('ck-min').title = T('ck_min'); $('ck-min').setAttribute('aria-label', T('ck_min'))
  $('ck-close').title = T('ck_close'); $('ck-close').setAttribute('aria-label', T('ck_close'))
  $('ck-keep-t').textContent = T('ck_keepAsk')
  $('ck-keep-yes').textContent = T('ck_keepYes'); $('ck-keep-no').textContent = T('ck_keepNo'); $('ck-keep-cancel').textContent = T('ck_keepCancel')

  const root = $('ck-root')
  root.innerHTML = `<section class="pu-ck-hero" id="ck-hero">
      <div class="pu-ck-big"><div class="pu-ck-fps"><b id="ck-fps">–</b><small>FPS</small></div><div class="pu-ck-lows"><span id="ck-low1"></span><span id="ck-score"></span></div></div>
      <div class="pu-ck-ctl"><label class="pu-ck-sel"><span>${esc(T('ck_game'))}</span><select id="ck-game" class="pu-in"></select></label>
        <label class="pu-check"><input type="checkbox" id="ck-killbg" checked><span>${esc(T('killBg'))}</span></label>
        <button type="button" class="pu-cta" id="ck-boost"><i class="fa fa-bolt" aria-hidden="true"></i><span></span></button></div></section>
    <div class="pu-ck-grid"><div class="pu-ck-main">
      <section class="pu-stage"><div class="pu-stage-h"><div class="pu-eyebrow"><span class="pu-dot" id="ck-sdot" data-tone="idle"></span><span id="ck-sstate"></span></div>
        <div class="pu-stage-a"><button type="button" class="pu-ghost" id="ck-mark"><i class="fa fa-flag" aria-hidden="true"></i><span>${esc(T('mark'))}</span></button></div></div>
        <div class="pu-river" id="ck-river" role="img" aria-label="${esc(T('riverAria'))}" data-hint="${esc(T('riverHint'))}"></div><dl class="pu-fps" id="ck-fpsdl"></dl></section>
      <aside class="pu-limiter" id="ck-lim" data-tone="idle" aria-live="polite"></aside>
      <div class="pu-vitals" id="ck-vitals">${UI.vitalsHtml(T)}</div></div>
    <div class="pu-ck-side">
      <section class="pu-card"><h3 class="pu-h">${esc(T('receiptTitle'))}</h3><div id="ck-recv"></div><button type="button" class="pu-ghost" id="ck-fixmouse"><i class="fa fa-computer-mouse" aria-hidden="true"></i><span>${esc(T('fixMouse'))}</span></button></section>
      <section class="pu-card"><h3 class="pu-h">${esc(T('ck_cores'))}</h3><div class="pu-cores" id="ck-cores"></div><p class="pu-muted" id="ck-cores-n"></p></section>
      <section class="pu-card"><div class="pu-stage-h"><h3 class="pu-h">${esc(T('ck_thermal'))}</h3><button type="button" class="pu-sec" id="ck-audit"><i class="fa fa-temperature-half" aria-hidden="true"></i><span>${esc(T('ck_auditRun'))}</span></button></div><div id="ck-thermal"><p class="pu-muted">${esc(T('ck_auditWhy'))}</p></div></section>
      <section class="pu-card"><div class="pu-stage-h"><h3 class="pu-h">${esc(T('ck_procs'))}</h3><button type="button" class="pu-ghost" id="ck-proc-refresh"><i class="fa fa-rotate" aria-hidden="true"></i><span>${esc(T('ck_refresh'))}</span></button></div><div id="ck-procs"></div></section>
    </div></div>`

  const river = window.JylliPulseRiverView.mount($('ck-river'), { mode: 'live', label: (col, i, n) => {
    const base = T('tip', { ago: ((n - 1 - i) * 0.25).toFixed(1), med: n1(col.med), worst: n1(col.hi), fps: n0(1000 / col.med) })
    return col.cause ? base + ' · ' + UI.causeName(col.cause, T) : base
  } })
  const presetName = id => { const p = S.presets.find(x => x.id === id); return p ? p.name : '' }

  // ── paint ──
  function paintTitle() {
    const L = S.live
    const playing = !!(L && L.fresh)
    $('ck-state-t').textContent = S.boost.active ? T('stBoosted', { game: S.boost.name || presetName(S.selected) }) : playing ? T('stPlaying', { game: (L.game && L.game.name) || '' }) : T('stReady')
    $('ck-dot').dataset.tone = S.boost.active ? 'ok' : playing ? 'ok' : 'idle'
    $('ck-hud').setAttribute('aria-pressed', String(!!S.hudOn))
    $('ck-pin').setAttribute('aria-pressed', String(!!(S.prefs && S.prefs.pin)))
  }
  function paintCta() {
    const b = $('ck-boost')
    const active = S.boost.active
    b.disabled = S.busy || (!active && !S.selected)
    b.querySelector('span').textContent = S.busy ? T('ctaWorking') : active ? T('ctaEnd') : S.selected ? T('ctaBoost', { game: presetName(S.selected) }) : T('ctaChoose')
    b.querySelector('i').className = 'fa fa-' + (S.busy ? 'circle-notch' : active ? 'stop' : 'bolt')
  }
  function paintLive() {
    const L = S.live; if (!L) return
    $('ck-fps').textContent = L.fps ? n0(L.fps.avg) : '–'
    $('ck-low1').textContent = L.fps ? T('ck_low1', { n: n0(L.fps.low1) }) : T('limw_idle')
    $('ck-score').textContent = L.score == null ? '' : T('ck_score', { n: L.score })
    $('ck-hero').dataset.tone = window.JylliPulseScore.tone(L.score)
    $('ck-sstate').textContent = L.fresh ? T('stPlaying', { game: (L.game && L.game.name) || '' }) : T('stWait')
    $('ck-sdot').dataset.tone = L.fresh ? 'ok' : 'idle'
    $('ck-fpsdl').innerHTML = UI.fpsStrip(L.fps, T)
    river.update(window.JylliPulseRiverView.fromLive(L))
    UI.paintVitals($('ck-vitals'), L.vitals, T)
    const lk = JSON.stringify([L.limiter.id, L.limiter.evidence])
    const hk = lk + JSON.stringify(UI.hitLog(L, 5))
    if (hk !== S.limKey) { S.limKey = hk; const lim = $('ck-lim'); lim.dataset.tone = L.limiter.tone; lim.innerHTML = UI.limiterHtml(L.limiter, T) + UI.hitLogHtml(L, T) }
    paintTitle(); paintCta()
  }
  function paintReceipt() {
    const k = JSON.stringify(S.boost); if (k === S.recvKey) return; S.recvKey = k
    $('ck-recv').innerHTML = (S.boost.active || S.boost.steps.length ? '' : `<p class="pu-muted">${esc(T('receiptIdle'))}</p>`) + UI.receiptHtml(S.boost, T)
  }
  function paintGames() {
    $('ck-game').innerHTML = `<option value="">${esc(T('ctaChoose'))}</option>` + S.presets.map(p => `<option value="${esc(p.id)}"${p.id === S.selected ? ' selected' : ''}>${esc(p.name)}</option>`).join('')
  }

  // ── boost, marks, window ──
  async function toggleBoost() {
    if (S.busy) return
    S.busy = true; paintCta()
    const wasActive = S.boost.active
    const r = wasActive ? await A.pulse2Unboost().catch(() => null) : await A.pulse2Boost({ presetId: S.selected, name: presetName(S.selected), killBg: $('ck-killbg').checked }).catch(() => null)
    S.busy = false
    if (r && r.ok !== false && r.boost) S.boost = r.boost
    else $('ck-state-t').textContent = T(wasActive ? 'endFail' : 'boostFail')
    paintReceipt(); paintCta(); paintTitle()
  }
  $('ck-boost').addEventListener('click', toggleBoost)
  $('ck-game').addEventListener('change', e => { S.selected = e.target.value; paintCta() })
  $('ck-mark').addEventListener('click', () => A.pulse2Mark(''))
  $('ck-fixmouse').addEventListener('click', async () => { const r = await A.pulseFixMouse().catch(() => null); $('ck-fixmouse').querySelector('span').textContent = T(r && r.ok ? 'fixMouseDone' : 'fixMouseFail'); setTimeout(() => { $('ck-fixmouse').querySelector('span').textContent = T('fixMouse') }, 2500) })
  $('ck-hud').addEventListener('click', () => A.pulse2Hud().then(() => { S.hudOn = !S.hudOn; paintTitle() }))
  $('ck-pin').addEventListener('click', () => A.pulse2SetPrefs({ pin: !(S.prefs && S.prefs.pin) }).then(r => { if (r && r.ok) { S.prefs = r.prefs; paintTitle() } }))
  $('ck-min').addEventListener('click', () => A.minimize())
  $('ck-close').addEventListener('click', () => { if (S.boost.active) { $('ck-keep').hidden = false; $('ck-keep-yes').focus() } else A.pulse2CloseCockpit() })
  $('ck-keep-yes').addEventListener('click', () => A.pulse2CloseCockpit())
  $('ck-keep-no').addEventListener('click', async () => { await A.pulse2Unboost().catch(() => null); A.pulse2CloseCockpit() })
  $('ck-keep-cancel').addEventListener('click', () => { $('ck-keep').hidden = true })
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('ck-keep').hidden) $('ck-keep').hidden = true })

  // ── per-core load (every 3 s while the window is visible) ──
  async function paintCores() {
    if (document.hidden) return
    const r = await A.pulseGetCoreLoads().catch(() => null)
    const host = $('ck-cores')
    if (!r || typeof r !== 'object') { host.innerHTML = ''; $('ck-cores-n').textContent = T('notMeasured'); return }
    const ids = Object.keys(r).filter(k => /^\d+$/.test(k)).sort((a, b) => a - b)
    host.innerHTML = ids.map(k => { const v = Math.max(0, Math.min(100, Number(r[k]) || 0)); return `<div class="pu-core" data-hot="${v >= 90 ? 1 : 0}" title="${esc(T('ck_core', { n: k, v: Math.round(v) }))}"><i style="--w:${Math.round(v)}%"></i><span>${k}</span></div>` }).join('')
    $('ck-cores-n').textContent = T('ck_coresN', { n: ids.length })
  }

  // ── thermal audit ──
  function paintThermal() {
    const host = $('ck-thermal'), t = S.thermal
    if (S.audit) { host.innerHTML = `<p class="pu-muted" id="ck-audit-p">${esc(T('ck_auditRunning', { n: 0, of: 10 }))}</p><div class="pu-prog"><i id="ck-audit-bar" style="--w:0%"></i></div>`; return }
    if (!t) { host.innerHTML = `<p class="pu-muted">${esc(T('ck_auditWhy'))}</p>`; return }
    if (!t.ok) { host.innerHTML = `<p class="pu-muted">${esc(T('ck_auditFail'))}</p>`; return }
    const sev = { none: 'ok', light: 'ok', moderate: 'warn', heavy: 'danger' }[t.severity] || 'idle'
    const rec = t.recommendation ? `<p class="pu-muted">${esc(T('ck_rec_' + t.recommendation))}</p>` : ''
    const cause = t.throttleCause ? esc(T('ck_cause_' + t.throttleCause)) : esc(T('ck_causeNone'))
    host.innerHTML = `<div class="pu-eyebrow"><span class="pu-chip" data-tone="${sev}">${esc(T('ck_sev_' + t.severity))}</span><span>${cause}</span></div>
      <dl class="pu-vs"><div><dt>${esc(T('ck_throttle'))}</dt><dd>${esc(n0(t.throttlePct))}%</dd></div><div><dt>${esc(T('ck_temp'))}</dt><dd>${t.avgTempC == null ? '–' : esc(n0(t.avgTempC)) + '°'}</dd></div>
      <div><dt>${esc(T('ck_clock'))}</dt><dd>${t.avgCurMhz == null ? '–' : esc(n0(t.avgCurMhz))}</dd></div><div><dt>${esc(T('ck_boostScore'))}</dt><dd>${t.boostScore == null ? '–' : esc(n0(t.boostScore))}</dd></div></dl>
      ${t.trend ? `<p class="pu-muted">${esc(T('ck_trend', { d: (t.trend.throttleDelta > 0 ? '+' : '') + n0(t.trend.throttleDelta) }))}</p>` : ''}${rec}`
  }
  $('ck-audit').addEventListener('click', async () => {
    if (S.audit) return
    S.audit = true; $('ck-audit').disabled = true; paintThermal()
    const off = A.onThermalProgress(p => { const bar = $('ck-audit-bar'), tx = $('ck-audit-p'); if (bar && p && p.of) bar.style.setProperty('--w', Math.round(p.sample / p.of * 100) + '%'); if (tx && p) tx.textContent = T('ck_auditRunning', { n: p.sample, of: p.of }) })
    S.thermal = await A.pulseThermalAudit().catch(() => ({ ok: false }))
    try { off() } catch { /* gone */ }
    S.audit = false; $('ck-audit').disabled = false; paintThermal()
  })

  // ── process lens ──
  async function loadProcs() {
    const r = await A.getProcesses().catch(() => null)
    S.procs = Array.isArray(r) ? r : []
    paintProcs()
  }
  function paintProcs() {
    const rows = S.procs.slice().sort((a, b) => (S.procSort === 'ram' ? (b.RAM || 0) - (a.RAM || 0) : (b.CPU || 0) - (a.CPU || 0))).slice(0, 12)
    const th = (k, label) => `<th scope="col"><button type="button" class="pu-ghost" data-sort="${k}" aria-pressed="${S.procSort === k}">${esc(label)}</button></th>`
    $('ck-procs').innerHTML = rows.length ? `<table class="pu-table pu-procs"><thead><tr><th scope="col">${esc(T('ck_name'))}</th>${th('cpu', 'CPU')}${th('ram', 'RAM')}<th></th></tr></thead><tbody>${rows.map(p => `<tr><th scope="row" title="${esc(p.Path || '')}">${esc(p.Name)}</th><td>${p.CPU == null ? '–' : esc(n1(p.CPU))}</td><td>${p.RAM == null ? '–' : esc(n0(p.RAM))} MB</td><td><button type="button" class="pu-ghost" data-kill="${esc(p.Id)}">${esc(S.confirmPid === p.Id ? T('ck_killSure') : T('ck_kill'))}</button></td></tr>`).join('')}</tbody></table>` : `<p class="pu-muted">${esc(T('notMeasured'))}</p>`
  }
  $('ck-procs').addEventListener('click', async e => {
    const s = e.target.closest('[data-sort]'); if (s) { S.procSort = s.dataset.sort; return paintProcs() }
    const k = e.target.closest('[data-kill]'); if (!k) return
    const pid = Number(k.dataset.kill)
    if (S.confirmPid !== pid) { S.confirmPid = pid; paintProcs(); setTimeout(() => { if (S.confirmPid === pid) { S.confirmPid = null; paintProcs() } }, 3000); return }
    S.confirmPid = null
    await A.killProcess(pid).catch(() => null)
    loadProcs()
  })
  $('ck-proc-refresh').addEventListener('click', loadProcs)

  // ── engine ──
  A.onPulse2Live(l => { S.live = l; S.boost = l.boost; paintLive(); paintReceipt() })
  A.onPulse2Event(m => {
    if (!m) return
    if (m.type === 'state' || m.type === 'boost-step') { S.boost = m.boost; if (m.boost && m.boost.presetId) { S.selected = m.boost.presetId; paintGames() } paintReceipt(); paintCta(); paintTitle() }
  })
  ;(async () => {
    const [pr, sub, prefs] = await Promise.all([A.pulseGetPresets().catch(() => []), A.pulse2Subscribe().catch(() => null), A.pulse2Prefs().catch(() => null)])
    S.presets = Array.isArray(pr) ? pr : []
    if (prefs && prefs.ok) S.prefs = prefs.prefs
    if (sub && sub.ok) { S.live = sub.live; S.boost = sub.live.boost; if (sub.live.boost.presetId) S.selected = sub.live.boost.presetId }
    paintGames(); paintReceipt(); paintLive(); paintTitle(); paintCta(); paintThermal(); paintCores(); loadProcs()
    setInterval(paintCores, 3000)
  })()
  window.addEventListener('beforeunload', () => { try { A.pulse2Unsubscribe() } catch { /* gone */ } })
})()
