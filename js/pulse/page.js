'use strict'
// Pulse tab: mounted from js/shell.js. One live subscription (pulse2-live, 4 Hz) feeds the hero, the Frame River, the Limiter,
// the vitals and the boost receipt; Sessions, Rules and Pre-flight load on demand. Copy: LANG group `pulse2` (js/lang/pulse-*.js).
// The launch rules keep the ids that the global launchRule*/gs* handlers in index.html find their elements by.
;(function (root) {
  const isNode = typeof module !== 'undefined' && module.exports
  const UI = isNode ? require('./ui') : root.JylliPulseUI

  // pure: which segment a deep link or a game event asks for, and the label of the primary action
  const VIEWS = ['live', 'sessions', 'rules', 'preflight']
  const ICONS = { fortnite: 'gamepad', valorant: 'crosshairs', csgo: 'crosshairs', fivem: 'car', warzone: 'skull', apex: 'shield', minecraft: 'cube', arma: 'helmet-safety', tarkov: 'suitcase', rocketleague: 'futbol', rust: 'fire', r6: 'shield-halved', overwatch: 'bolt' }
  function ctaState(boost, selectedName, busy) {
    if (busy) return { key: 'ctaWorking', disabled: true, icon: 'circle-notch' }
    if (boost && boost.active) return { key: 'ctaEnd', disabled: false, icon: 'stop' }
    if (!selectedName) return { key: 'ctaChoose', disabled: true, icon: 'bolt' }
    return { key: 'ctaBoost', disabled: false, icon: 'bolt', vars: { game: selectedName } }
  }
  const api = { VIEWS, ICONS, ctaState }
  root.JylliPulsePage = api
  if (isNode) { module.exports = api; return }
  if (typeof document === 'undefined') return

  const A = () => root.api
  const T = (k, v) => tG('pulse2', k, v)
  const { esc, n0, n1 } = UI
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v } catch { return d } },
    set(k, v) { try { localStorage.setItem(k, v) } catch { /* private window */ } },
  }

  api.mount = function mount(c) {
    const S = { view: 'live', live: null, boost: { active: false, steps: [] }, presets: [], selected: store.get('pulse_preset', ''), killBg: store.get('pulse_kill_bg', '1') !== '0',
      busy: false, sessions: null, deb: null, pf: null, prefs: null, disposed: false, unsub: [], limKey: '', recvKey: '', river: null, debRiver: null }
    const el = document.createElement('div')
    el.className = 'jk pu'
    el.innerHTML = `<div class="tk-hero" id="pulse-hero-host"></div><div class="pu-bar" id="pu-bar"></div>
      <div class="pu-view" data-view="live"></div><div class="pu-view" data-view="sessions" hidden></div>
      <div class="pu-view" data-view="rules" hidden></div><div class="pu-view" data-view="preflight" hidden></div>`
    c.innerHTML = ''; c.appendChild(el)
    const q = s => el.querySelector(s)
    const views = {}; for (const v of VIEWS) views[v] = q(`[data-view="${v}"]`)
    const presetName = id => { const p = S.presets.find(x => x.id === id); return p ? p.name : '' }

    // ── hero ──
    const hero = JylliHero.mount(q('#pulse-hero-host'), {
      id: 'pulse-hero', title: 'Pulse', lead: T('lead'), dial: { label: T('dial'), unit: '' }, ledgerMax: 4,
      stats: [{ k: 'fps', label: T('statFps') }, { k: 'low', label: T('statLow') }, { k: 'rules', label: T('statRules') }],
      cta: { id: 'pulse-cta', icon: 'bolt', label: T('ctaChoose'), onClick: () => toggleBoost() },
      secondary: { id: 'pulse-live-btn', icon: 'window-restore', label: T('openCockpit'), onClick: () => A().pulse2OpenCockpit() },
    })
    const armed = () => ['pulse-ug-check', 'pulse-gs-check', 'pulse-gw-check', 'pulse-ap-check'].filter(id => { const b = document.getElementById(id); return b && b.checked }).length
    function paintHero() {
      const L = S.live, sc = L ? L.score : null
      const cta = ctaState(S.boost, presetName(S.selected), S.busy)
      const eyebrow = S.boost.active ? T('stBoosted', { game: S.boost.name || presetName(S.selected) }) : L && L.fresh ? T('stPlaying', { game: (L.game && L.game.name) || '' }) : T('stReady')
      const ledger = (L ? L.scoreParts : []).map(p => ({ id: p.key, label: T('part_' + p.key), n: p.value == null ? '–' : Math.round(p.value * 100), total: p.value == null ? null : 100 }))
      const upd = { eyebrow, ledger, stats: { fps: L && L.fps ? n0(L.fps.avg) : null, low: L && L.fps ? n0(L.fps.low1) : null, rules: armed() + '/4' },
        cta: { label: T(cta.key, cta.vars), icon: cta.icon, disabled: cta.disabled }, tone: root.JylliPulseScore.tone(sc) }
      if (sc == null) { upd.value = null; upd.pct = null } else { upd.pct = sc / 10 }
      hero.update(upd)
      if (sc != null) hero.update({ value: sc })
      el.classList.toggle('pu-boosted', !!S.boost.active)
    }

    // ── live view ──
    views.live.innerHTML = `<div class="pu-live">
      <section class="pu-stage" id="pu-stage"><div class="pu-stage-h"><div class="pu-eyebrow"><span class="pu-dot" id="pu-state-dot" data-tone="idle"></span><span id="pu-state"></span></div>
        <div class="pu-stage-a"><button type="button" class="pu-ghost" data-act="mark"><i class="fa fa-flag" aria-hidden="true"></i><span>${esc(T('mark'))}</span></button>
        <button type="button" class="pu-ghost" data-act="hud"><i class="fa fa-display" aria-hidden="true"></i><span>${esc(T('hud'))}</span></button></div></div>
        <div class="pu-river" id="pu-river" role="img" aria-label="${esc(T('riverAria'))}" data-hint="${esc(T('riverHint'))}"></div><dl class="pu-fps" id="pu-fps"></dl></section>
      <aside class="pu-limiter" id="pu-limiter" data-tone="idle" aria-live="polite"></aside></div>
      <div class="pu-vitals" id="pu-vitals">${UI.vitalsHtml(T)}</div>
      <div class="pu-pick"><section class="pu-card"><div class="pu-stage-h"><h3 class="pu-h">${esc(T('pickTitle'))}</h3>
        <label class="pu-check"><input type="checkbox" id="pulse-kill-bg"${S.killBg ? ' checked' : ''}><span>${esc(T('killBg'))}</span></label></div><div class="pu-games" id="pu-games"></div></section>
        <section class="pu-card"><h3 class="pu-h">${esc(T('receiptTitle'))}</h3><div id="pu-receipt"></div><button type="button" class="pu-ghost" data-act="fix-mouse"><i class="fa fa-computer-mouse" aria-hidden="true"></i><span>${esc(T('fixMouse'))}</span></button></section></div>`
    S.river = JylliPulseRiverView.mount(q('#pu-river'), { mode: 'live', label: (col, i, n) => {
      const sec = ((n - 1 - i) * 0.25)
      const base = T('tip', { ago: sec.toFixed(1), med: n1(col.med), worst: n1(col.hi), fps: n0(1000 / col.med) })
      return col.cause ? base + ' · ' + UI.causeName(col.cause, T) : base
    } })
    function paintGames() {
      q('#pu-games').innerHTML = S.presets.map(p => `<button type="button" class="pu-game" data-act="pick" data-id="${esc(p.id)}" aria-pressed="${p.id === S.selected}"${S.live && S.live.game && S.live.game.id === p.id ? ' data-live="1"' : ''}><i class="fa fa-${ICONS[p.id] || 'gamepad'}" aria-hidden="true"></i><span>${esc(p.name)}</span></button>`).join('')
    }
    function paintLive() {
      const L = S.live; if (!L) return
      q('#pu-state').textContent = L.fresh ? T('stPlaying', { game: (L.game && L.game.name) || '' }) : S.boost.active ? T('stBoostedIdle') : T('stWait')
      q('#pu-state-dot').dataset.tone = L.fresh ? 'ok' : 'idle'
      q('#pu-fps').innerHTML = UI.fpsStrip(L.fps, T)
      S.river.update(JylliPulseRiverView.fromLive(L))
      UI.paintVitals(q('#pu-vitals'), L.vitals, T)
      const lk = JSON.stringify([L.limiter.id, L.limiter.evidence])
      const hk = lk + JSON.stringify(UI.hitLog(L, 5))
      if (hk !== S.limKey) { S.limKey = hk; const lim = q('#pu-limiter'); lim.dataset.tone = L.limiter.tone; lim.innerHTML = UI.limiterHtml(L.limiter, T) + UI.hitLogHtml(L, T) }
      paintHero()
    }
    function paintReceipt() {
      const k = JSON.stringify(S.boost)
      if (k === S.recvKey) return
      S.recvKey = k
      q('#pu-receipt').innerHTML = (S.boost.active || S.boost.steps.length ? '' : `<p class="pu-muted">${esc(T('receiptIdle'))}</p>`) + UI.receiptHtml(S.boost, T)
    }

    // ── sessions ──
    async function loadSessions() {
      const r = await A().pulse2Sessions().catch(() => null); if (S.disposed) return
      S.sessions = r && r.ok ? r.sessions : []
      paintSessions()
    }
    function paintSessions() {
      if (S.deb) {
        views.sessions.innerHTML = `<div class="pu-bar"><button type="button" class="pu-ghost" data-act="back"><i class="fa fa-arrow-left" aria-hidden="true"></i><span>${esc(T('back'))}</span></button><div class="pu-eyebrow"><span>${esc(S.deb.session.game ? S.deb.session.game.name : '')} · ${esc(UI.when(S.deb.session.startedAt, T))}</span></div></div>${UI.debriefHtml(S.deb.debrief, T)}`
        if (S.debRiver) S.debRiver.destroy()
        const host = views.sessions.querySelector('[data-river="session"]')
        S.debRiver = JylliPulseRiverView.mount(host, { mode: 'session', label: (col, i, n) => T('tipSession', { at: UI.clock(i / Math.max(1, n - 1) * S.deb.debrief.durationSec), fps: col.med > 0 ? n0(1000 / col.med) : '–', worst: n1(col.hi) }) + (col.cause ? ' · ' + UI.causeName(col.cause, T) : '') })
        S.debRiver.update(JylliPulseRiverView.fromDebrief(S.deb.debrief))
        return
      }
      if (S.debRiver) { S.debRiver.destroy(); S.debRiver = null }
      views.sessions.innerHTML = S.sessions == null ? JylliTab.skeleton('rows', 4) : UI.sessionsHtml(S.sessions, T)
    }

    // ── rules (same ids the index.html handlers use) ──
    function buildRules() {
      const t3 = settings.gameShieldTier3Threshold ?? 70, t2 = settings.gameShieldMidSessionThreshold ?? 80
      const shield = String(ui.html`<div class="j-pu-shield"><div id="gs-manifest" class="j-pu-manifest" style="display:none"></div>
        <div class="j-pu-sub-block"><div class="j-pu-label"><i class="fa fa-heart" aria-hidden="true"></i>${tUI('gsExclusionsLabel')}</div><div id="gs-exclusions-row" class="j-pu-excl"><div id="gs-exclusion-pills" class="j-pu-pills"></div>
        <input id="gs-exclusion-input" class="pu-in" type="text" placeholder="${tUI('gsExclusionsPlaceholder')}" aria-label="${tUI('gsExclusionsLabel')}" onkeydown="gsExclusionInputKey(event)"></div></div>
        <div class="j-pu-sub-block"><div class="j-pu-label"><i class="fa fa-gauge-high" aria-hidden="true"></i>${tUI('gsSettingsLabel')}</div><div class="j-pu-sliders">
        ${_puSlider({ id: 'gs-tier3-threshold', valId: 'gs-tier3-val', label: tUI('gsThresholdTier3'), hint: tUI('gsThresholdTier3Hint'), min: 50, max: 95, value: t3, kind: 'tier3', tone: 'accent' })}
        ${_puSlider({ id: 'gs-midsession-threshold', valId: 'gs-midsession-val', label: tUI('gsThresholdMidSession'), hint: tUI('gsThresholdMidSessionHint'), min: 50, max: 95, value: t2, kind: 'midSession', tone: 'accent' })}</div></div></div>`)
      const ap = String(ui.html`<div id="auto-pulse-badge" class="j-pu-ap" style="display:none"><i class="fa fa-wand-magic-sparkles" aria-hidden="true"></i><span>${tUI('autoPulseActiveLabel')}</span><strong class="apb-game"></strong>
        <select id="ap-preset-override" class="pu-in" onchange="applyAutoPulsePresetOverride(this.value)" aria-label="${tUI('autoPulseOverrideTitle')}"></select>
        <button type="button" class="pu-ghost" onclick="doAutoPulseManualStop()" aria-label="${tUI('pulseDeactivate')}"><i class="fa fa-xmark" aria-hidden="true"></i></button></div>`)
      const rule = o => _puRule(o)
      views.rules.innerHTML = `<div class="pu-rules" id="pulse-launch-rules"><div class="pu-stage-h"><h3 class="pu-h">${esc(tUI('launchRulesTitle'))}</h3><div id="pulse-launch-rules-armed" class="pu-muted"></div></div>
        ${rule({ card: 'lr-card-ug', dot: 'pulse-ug-dot', check: 'pulse-ug-check', icon: 'shield-halved', title: tUI('settingsUpdateGuard'), desc: tUI('settingsUpdateGuardDesc'), rule: 'updateGuard', extra: 'id="ug-status-sub"', badge: '<span id="ug-block-count" class="pu-chip" data-tone="danger" style="display:none"></span>' })}
        ${rule({ card: 'lr-card-gs', dot: 'pulse-gs-dot', check: 'pulse-gs-check', icon: 'bolt', title: tUI('settingsGameShield'), desc: tUI('settingsGameShieldDesc'), rule: 'gameShield', body: shield })}
        ${rule({ card: 'lr-card-gw', dot: 'pulse-gw-dot', check: 'pulse-gw-check', icon: 'eye', title: tUI('settingsGameWatcher'), desc: tUI('settingsGameWatcherDesc'), rule: 'gameWatcher' })}
        ${rule({ card: 'lr-card-ap', dot: 'pulse-ap-dot', check: 'pulse-ap-check', icon: 'wand-magic-sparkles', title: tUI('settingsAutoPulse'), desc: tUI('settingsAutoPulseDesc'), rule: 'autoPulse', body: ap })}</div>
        <section class="pu-card" id="pu-prefs"></section>`
    }
    function paintPrefs() {
      const p = S.prefs, host = q('#pu-prefs'); if (!p) return
      const seg = (name, vals, cur) => `<div class="pu-seg" role="group" aria-label="${esc(T('hud' + name[0].toUpperCase() + name.slice(1)))}">${vals.map(v => `<button type="button" data-act="pref" data-name="${name}" data-val="${v}" aria-pressed="${v === cur}">${esc(T(name + '_' + v))}</button>`).join('')}</div>`
      host.innerHTML = `<h3 class="pu-h">${esc(T('hudTitle'))}</h3><p class="pu-muted">${esc(T('hudWhy'))}</p><div class="pu-rules">
        <div class="pu-rule-row"><div class="pu-rule-main"><h4>${esc(T('hudLayout'))}</h4></div>${seg('layout', ['minimal', 'standard', 'full'], p.hud.layout)}</div>
        <div class="pu-rule-row"><div class="pu-rule-main"><h4>${esc(T('hudCorner'))}</h4></div>${seg('corner', ['tl', 'tr', 'bl', 'br'], p.hud.corner)}</div>
        <div class="pu-rule-row"><div class="pu-rule-main"><h4>${esc(T('hudOpacity'))}</h4></div><input type="range" class="gs-slider" min="30" max="100" step="5" value="${Math.round(p.hud.opacity * 100)}" data-act="opacity" aria-label="${esc(T('hudOpacity'))}"><span class="pu-mono" id="pu-op-val">${Math.round(p.hud.opacity * 100)}%</span></div>
        <div class="pu-rule-row"><div class="pu-rule-main"><h4>${esc(T('pinCockpit'))}</h4><p class="pu-muted">${esc(T('pinWhy'))}</p></div><label class="pu-check"><input type="checkbox" data-act="pin"${p.pin ? ' checked' : ''}><span>${esc(T('pinOn'))}</span></label></div>
        <div class="pu-rule-row"><div class="pu-rule-main"><h4>${esc(T('hotkeys'))}</h4><p class="pu-muted">${esc(T('hotkeysWhy'))}</p></div><div class="pu-keys">
          <label>${esc(T('keyHud'))}<input class="pu-in" data-act="key" data-name="hud" value="${esc(p.keys.hud)}" spellcheck="false"></label>
          <label>${esc(T('keyMark'))}<input class="pu-in" data-act="key" data-name="mark" value="${esc(p.keys.mark)}" spellcheck="false"></label></div></div></div>`
    }

    // ── pre-flight ──
    async function runPreflight() {
      views.preflight.innerHTML = `<div class="pu-bar"><div class="pu-muted">${esc(T('pfRunning'))}</div></div>` + JylliTab.skeleton('rows', 5)
      const r = await A().pulse2Preflight().catch(() => null); if (S.disposed) return
      S.pf = r && r.ok ? r : null
      views.preflight.innerHTML = `<div class="pu-bar"><div><h3 class="pu-h">${esc(T('pfTitle'))}</h3><p class="pu-muted">${esc(T('pfLead'))}</p></div><button type="button" class="pu-sec" data-act="pf-run"><i class="fa fa-rotate" aria-hidden="true"></i><span>${esc(T('pfRun'))}</span></button></div>${S.pf ? UI.preflightHtml(S.pf, T) : `<div class="pu-empty"><h3>${esc(T('pfFailed'))}</h3></div>`}`
    }

    // ── actions ──
    async function toggleBoost() {
      if (S.busy) return
      if (!S.boost.active && !S.selected) return
      S.busy = true; paintHero()
      const r = S.boost.active ? await A().pulse2Unboost().catch(() => null) : await A().pulse2Boost({ presetId: S.selected, name: presetName(S.selected), killBg: S.killBg }).catch(() => null)
      S.busy = false
      if (S.disposed) return
      if (!r || r.ok === false) toast(T(S.boost.active ? 'endFail' : 'boostFail'), r && r.reason === 'premium_required' ? tUI('premiumLockTitle') : '', 'err')
      else if (r.boost) { S.boost = r.boost; paintReceipt() }
      paintHero()
    }
    function openSession(id) {
      A().pulse2Session(id).then(r => { if (S.disposed || !r || !r.ok) return; S.deb = r; show('sessions'); paintSessions() })
    }
    const doFix = (kind, target) => {
      if (kind === 'boost') { show('live'); return toggleBoost() }
      if (kind === 'rule') { show('rules'); const id = { gameshield: 'lr-card-gs', updateguard: 'lr-card-ug' }[target]; const n = id && document.getElementById(id); if (n) { n.scrollIntoView({ block: 'center' }); n.classList.add('pu-flash'); setTimeout(() => n.classList.remove('pu-flash'), 1600) } }
    }
    const goSuggest = (kind, target) => {
      if (kind === 'rule') return doFix('rule', target)
      if (target === 'thermal') { A().pulse2OpenCockpit(); return }
      if (target === 'boost') { show('live'); return toggleBoost() }
    }
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'INPUT') return
      const act = b.dataset.act
      if (act === 'pick') { S.selected = b.dataset.id; store.set('pulse_preset', S.selected); paintGames(); paintHero() }
      else if (act === 'mark') A().pulse2Mark('').then(r => { if (r && r.ok) toast(T('marked'), '', 'ok', 1800) })
      else if (act === 'hud') A().pulse2Hud()
      else if (act === 'suggest') goSuggest(b.dataset.kind, b.dataset.target)
      else if (act === 'fix') doFix(b.dataset.kind, b.dataset.target)
      else if (act === 'pf-run') runPreflight()
      else if (act === 'fix-mouse') A().pulseFixMouse().then(r => toast(T(r && r.ok ? 'fixMouseDone' : 'fixMouseFail'), '', r && r.ok ? 'ok' : 'err')).catch(() => toast(T('fixMouseFail'), '', 'err'))
      else if (act === 'open-session') openSession(b.dataset.id)
      else if (act === 'back') { S.deb = null; paintSessions() }
      else if (act === 'pref') A().pulse2SetPrefs(b.dataset.name === 'layout' ? { hud: { layout: b.dataset.val } } : { hud: { corner: b.dataset.val } }).then(r => { if (r && r.ok) { S.prefs = r.prefs; paintPrefs() } })
    })
    el.addEventListener('change', e => {
      const t = e.target
      if (t.id === 'pulse-kill-bg') { S.killBg = t.checked; store.set('pulse_kill_bg', t.checked ? '1' : '0') }
      else if (t.dataset && t.dataset.act === 'pin') A().pulse2SetPrefs({ pin: t.checked }).then(r => { if (r && r.ok) S.prefs = r.prefs })
      else if (t.dataset && t.dataset.act === 'key') A().pulse2SetPrefs({ keys: { [t.dataset.name]: t.value.trim() } }).then(r => { if (r && r.ok) { S.prefs = r.prefs; paintPrefs() } })
      else if (t.dataset && t.dataset.act === 'opacity') A().pulse2SetPrefs({ hud: { opacity: Number(t.value) / 100 } }).then(r => { if (r && r.ok) S.prefs = r.prefs })
    })
    el.addEventListener('input', e => { if (e.target.dataset && e.target.dataset.act === 'opacity') q('#pu-op-val').textContent = e.target.value + '%' })

    // ── segments ──
    const bar = JylliTab.seg([{ id: 'live', label: T('seg_live'), icon: 'wave-square' }, { id: 'sessions', label: T('seg_sessions'), icon: 'clock-rotate-left' }, { id: 'rules', label: T('seg_rules'), icon: 'sliders' }, { id: 'preflight', label: T('seg_preflight'), icon: 'list-check' }], 'live', id => show(id))
    q('#pu-bar').appendChild(bar.el)
    function show(id) {
      S.view = id; bar.set(id)
      for (const v of VIEWS) views[v].hidden = v !== id
      if (id === 'sessions' && S.sessions == null) loadSessions(); else if (id === 'sessions') paintSessions()
      if (id === 'preflight' && !S.pf) runPreflight()
      if (id === 'live' && S.river) S.river.update(JylliPulseRiverView.fromLive(S.live))
    }

    // ── events from the engine ──
    function onEvent(m) {
      if (S.disposed || !m) return
      if (m.type === 'state' || m.type === 'boost-step') {
        S.boost = m.boost; if (m.boost && m.boost.presetId) { S.selected = m.boost.presetId; paintGames() }
        paintReceipt(); paintHero()
        if (typeof syncPulseUIState === 'function') syncPulseUIState()
      } else if (m.type === 'game-end') {
        S.sessions = null
        if (S.view === 'sessions' && !S.deb) loadSessions()
        if (m.debrief) toast(T('sessionSaved'), T('sessionSavedWhy', { game: (m.game && m.game.name) || '' }), 'ok', 6000, { action: { label: T('openDebrief'), run: () => { S.sessions = null; openSession(m.debrief.id) } } })
      } else if (m.type === 'game-start') { S.live = S.live ? { ...S.live, game: m.game } : S.live; paintGames() }
    }

    // ── boot ──
    buildRules(); paintGames(); paintReceipt(); paintHero(); paintSessions()
    syncLaunchRuleChecks(); gsExclusionInit()
    if (typeof updateLaunchRulesArmedCount === 'function') updateLaunchRulesArmedCount()
    S.unsub.push(A().onPulse2Live(l => { S.live = l; S.boost = l.boost; paintLive(); paintReceipt() }))
    S.unsub.push(A().onPulse2Event(onEvent))
    ;(async () => {
      const [pr, sub, prefs] = await Promise.all([A().pulseGetPresets().catch(() => []), A().pulse2Subscribe().catch(() => null), A().pulse2Prefs().catch(() => null)])
      if (S.disposed) return
      S.presets = Array.isArray(pr) ? pr : []
      if (!S.presets.some(p => p.id === S.selected)) S.selected = ''
      if (prefs && prefs.ok) { S.prefs = prefs.prefs; paintPrefs() }
      if (sub && sub.ok) { S.live = sub.live; S.boost = sub.live.boost; if (sub.live.boost.presetId) S.selected = sub.live.boost.presetId }
      paintGames(); paintReceipt(); paintLive()
      try { const ctx = await A().getSystemContext(); if (!S.disposed && ctx && ctx.gameRunning && typeof setLaunchRuleDots === 'function') setLaunchRuleDots(true) } catch { /* no context */ }
    })()

    root.registerPageCleanup('pulse', () => {
      S.disposed = true
      for (const u of S.unsub) { try { u() } catch { /* gone */ } }
      try { A().pulse2Unsubscribe() } catch { /* gone */ }
      if (S.river) S.river.destroy(); if (S.debRiver) S.debRiver.destroy()
      hero.destroy()
    })
    root.JylliPulsePage._active = { show, S }
  }
})(typeof window !== 'undefined' ? window : globalThis)
