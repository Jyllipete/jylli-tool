'use strict'
// Arrival: the first-launch flow. A concierge-voiced sequence (welcome, about you, your PC, first moves, one question, ready) while the
// prep work (restore point, health check, preflight) runs in the background. Pure helpers are unit-tested (test/arrival.test.js).
// State is saved to settings.arrival on every scene change so an elevated relaunch resumes where the user was.
;(function (root) {
  const SCENES = 6

  // ── pure ──
  function greetingKey(hour) {
    const h = ((hour % 24) + 24) % 24
    return h >= 5 && h < 11 ? 'greetMorning' : h >= 11 && h < 17 ? 'greetDay' : h >= 17 && h < 22 ? 'greetEvening' : 'greetNight'
  }

  /** Prep steps and what each waits for. adminOnly steps are skipped (with a reason) without administrator rights. */
  function prepSteps(isAdmin) {
    const defs = [
      { id: 'admin', after: [] },
      { id: 'hardware', after: ['admin'] },
      { id: 'restore', after: ['hardware'], adminOnly: true },
      ...['preflight', 'health', 'games', 'profile', 'startup', 'score'].map(id => ({ id, after: ['restore'], adminOnly: id === 'health' })),
    ]
    return defs.map(d => ({ id: d.id, after: d.after, skip: !!d.adminOnly && !isAdmin, reason: d.adminOnly && !isAdmin ? 'reasonNoAdmin' : null }))
  }

  /** Scene (1..6) to open on: a saved, unfinished, not-deferred run resumes where it stopped. */
  function resumeScene(a) {
    if (!a || a.completedAt || a.deferred) return 1
    const s = Math.floor(a.scene)
    return s >= 1 && s <= SCENES ? s : 1
  }

  /** Use case answer -> the existing Auto-Optimize preset (settings.aom_use_case) and run mode. */
  function useCaseMap(useCase) {
    return { fps: { aom_use_case: 'fps', runMode: 'gaming' }, open: { aom_use_case: 'open', runMode: 'gaming' }, stream: { aom_use_case: 'stream', runMode: 'smart' },
      work: { aom_use_case: 'mix', runMode: 'smart' }, mix: { aom_use_case: 'mix', runMode: 'smart' } }[useCase] || { aom_use_case: 'mix', runMode: 'smart' }
  }
  function comfortSettings(comfort) {
    return { safe: { maxTier: 1, advancedMode: false }, balanced: { maxTier: 2, advancedMode: false }, expert: { maxTier: 3, advancedMode: true } }[comfort] || { maxTier: 2, advancedMode: false }
  }
  /** Toggle a priority, keeping at most max of them (the oldest drops out). */
  function togglePriority(list, id, max = 2) {
    const l = (list || []).slice(), i = l.indexOf(id)
    if (i >= 0) { l.splice(i, 1); return l }
    l.push(id); return l.length > max ? l.slice(l.length - max) : l
  }

  const api = { greetingKey, prepSteps, resumeScene, useCaseMap, comfortSettings, togglePriority, SCENES }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  // ── DOM ──
  const g = (k, v) => root.tG('arrival', k, v)
  const esc = s => root.escHtml(String(s == null ? '' : s))
  const sleep = ms => new Promise(r => setTimeout(r, ms))
  const scale = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--motion-scale')) || 1
  const play = n => { try { root.JylliSound && root.JylliSound.play(n) } catch {} }
  const save = () => Promise.resolve(root.api.saveSettings(root.settings)).catch(() => {})

  const USE = [['fps', 'useFps'], ['open', 'useOpen'], ['stream', 'useStream'], ['work', 'useWork'], ['mix', 'useMix']]
  const PRIO = [['performance', 'prioPerformance'], ['latency', 'prioLatency'], ['quiet', 'prioQuiet'], ['battery', 'prioBattery'], ['privacy', 'prioPrivacy'], ['startup', 'prioStartup']]
  const COMFORT = [['safe', 'comfortSafe', 'comfortSafeSub'], ['balanced', 'comfortBalanced', 'comfortBalancedSub'], ['expert', 'comfortExpert', 'comfortExpertSub']]
  const PREP_LABEL = { admin: 'prepAdmin', hardware: 'prepHardware', restore: 'prepRestore', preflight: 'prepPreflight', health: 'prepHealth', games: 'prepGames', profile: 'prepProfile', startup: 'prepStartup', score: 'prepScore' }
  const MONOGRAM = '<svg class="ar-mark" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30"/><path d="M38 16v21a8 8 0 0 1-8 8h-2a8 8 0 0 1-8-8"/></svg>'

  let A = null   // active run
  const state = { active: false }
  const rootEl = () => document.getElementById('arrival')

  function fresh(saved, isAdmin, rerun) {
    const resume = saved && !rerun && !saved.completedAt && !saved.deferred
    return {
      isAdmin, rerun: !!rerun, scene: resume ? resumeScene(saved) : 1, q: 0,
      profile: Object.assign({ useCase: null, games: null, priorities: [], comfort: 'balanced' }, resume ? saved.profile : {}),
      rows: Object.fromEntries(prepSteps(isAdmin).map(s => [s.id, { state: 'waiting', reason: null, sub: '' }])),
      prepStarted: false, P: {}, data: {}, moves: [], sel: new Set(), waitingAdmin: false, declined: !!(resume && saved.resumeAfterAdmin && !isAdmin), esc: false,
    }
  }

  function setRow(id, st, reason, sub) {
    if (!A) return
    A.rows[id] = { state: st, reason: reason || null, sub: sub || '' }
    const ledger = document.getElementById('ar-ledger'); if (ledger) ledger.innerHTML = ledgerHtml()
    const pill = document.getElementById('ar-pill'); if (pill) pill.textContent = pillText()
    if (A.scene === 3) refreshDossier()
  }
  const settled = r => r.state === 'done' || r.state === 'attention' || r.state === 'skipped'

  // ── prep (idempotent: a resumed run repeats it) ──
  function startPrep() {
    if (A.prepStarted) return
    A.prepStarted = true
    const steps = prepSteps(A.isAdmin), api_ = root.api
    const impl = {
      admin: async () => ({ state: A.isAdmin ? 'done' : 'attention', reason: A.isAdmin ? null : 'reasonNoAdmin' }),
      hardware: async () => { if (!sysInfo || !sysInfo.cpu) { try { sysInfo = await api_.getSystemInfo() } catch {} } return { state: 'done' } },
      restore: async () => {
        const recent = root.settings.lastRestorePointAt && Date.now() - root.settings.lastRestorePointAt < 86400000
        if (recent) { A.data.restorePoint = true; return { state: 'done', reason: 'reasonRecent' } }
        const r = await api_.createRestorePoint('JylliTool_v1_FirstRun').catch(e => ({ ok: false, error: String(e && e.message || e) }))
        if (r.ok) { A.data.restorePoint = true; return { state: 'done', sub: g('restoreDone') } }
        if (/24|frequen|already|too soon/i.test(String(r.error || r.reason || ''))) { A.data.restorePoint = true; return { state: 'done', reason: 'reasonRecent' } }
        A.data.restorePoint = false
        return { state: 'attention', sub: String(r.error || r.reason || '') }
      },
      preflight: async () => {
        const r = await api_.runPreflightScan()
        root.storePreflightResult(r)
        A.data.pf = r
        return { state: 'done' }
      },
      health: async () => {
        const r = await api_.runWindowsHealth().catch(() => ({ ok: false }))
        localStorage.setItem('health_check_ts', Date.now()); localStorage.setItem('health_check_ok', r && r.ok ? '1' : '0')
        A.data.health = r
        if (!state.active) { try { root.conciergeRefresh && root.conciergeRefresh(); root.toast(g(r && r.ok ? 'healthOk' : 'healthLate'), '', r && r.ok ? 'ok' : 'warn') } catch {} }
        return { state: r && r.ok ? 'done' : 'attention' }
      },
      games: async () => { const r = await api_.detectGames().catch(() => []); A.data.games = Array.isArray(r) ? r : (r && r.games) || []; if (A.profile.games == null) A.profile.games = A.data.games.map(x => x.id || x.name); return { state: 'done' } },
      profile: async () => {
        A.data.aom = await api_.autodetectAomAnswers().catch(() => ({}))
        const av = await api_.detectAv().catch(() => null)
        A.data.av = Array.isArray(av) ? av[0] : av
        return { state: 'done' }
      },
      startup: async () => { const r = await api_.getStartupItems().catch(() => []); A.data.startup = Array.isArray(r) ? r : []; return { state: 'done' } },
      score: async () => { A.data.score = await api_.getHealthScore(root.settings).catch(() => null); return { state: 'done' } },
    }
    const run = s => {
      if (A.P[s.id]) return A.P[s.id]
      return A.P[s.id] = Promise.all(s.after.map(id => run(steps.find(x => x.id === id)))).then(async () => {
        if (s.skip) return setRow(s.id, 'skipped', s.reason)
        setRow(s.id, 'working')
        try { const r = await impl[s.id](); setRow(s.id, r.state, r.reason, r.sub) } catch (e) { setRow(s.id, 'attention', null, String(e && e.message || e)) }
      })
    }
    // Progress sub-lines come from the existing progress channels; this run adds its own listeners and never removes anyone else's
    try { api_.onPreflightProgress(p => { if (A && A.rows.preflight.state === 'working' && p && typeof p.pct === 'number') updateSub('preflight', p.pct) }) } catch {}
    try { api_.onWindowsHealthProgress(p => { if (A && A.rows.health.state === 'working' && p && typeof p.pct === 'number') updateSub('health', p.pct) }) } catch {}
    steps.forEach(run)
  }
  function updateSub(id, pct) {
    const r = A.rows[id]; r.sub = pct < 34 ? g('stWorking') : g('stillChecking')
    const el = document.querySelector(`[data-row="${id}"] .ar-sub`); if (el) el.textContent = r.sub
  }

  // ── rendering ──
  const ST_LABEL = { waiting: 'stWaiting', working: 'stWorking', done: 'stDone', attention: 'stAttention', skipped: 'stSkipped' }
  function ledgerHtml() {
    return Object.entries(A.rows).map(([id, r]) => `<li class="ar-row" data-row="${id}" data-state="${r.state}"><span class="ar-dot" aria-hidden="true"></span><span class="ar-row-name">${esc(g(PREP_LABEL[id]))}</span><span class="ar-row-state">${esc(g(ST_LABEL[r.state]))}</span><span class="ar-sub">${esc(r.reason ? g(r.reason) : r.sub)}</span></li>`).join('')
  }
  function pillText() { const vals = Object.values(A.rows); return g('prepPill', { done: vals.filter(settled).length, n: vals.length }) }

  const btn = (act, label, cls = '', extra = '') => `<button type="button" class="j-btn ${cls}" data-act="${act}" ${extra}>${esc(label)}</button>`
  const tile = (kind, q, v, label, sub, on, idx) => `<button type="button" class="ar-tile" role="${kind}" aria-${kind === 'radio' ? 'checked' : 'checked'}="${on}" data-act="pick" data-q="${q}" data-v="${v}"><span class="ar-key">${idx}</span><span class="ar-tile-t">${esc(label)}</span>${sub ? `<span class="ar-tile-s">${esc(sub)}</span>` : ''}</button>`

  function eyebrow(key) { return `<div class="ar-eyebrow">${esc(g(key))}</div>` }

  function sceneWelcome() {
    const hr = new Date().getHours()
    const admin = A.isAdmin ? '' : `<div class="ar-card ar-admin" role="group"><div class="ar-card-t">${esc(g('adminTitle'))}</div><div class="ar-muted">${esc(A.declined ? g('adminDeclined') : g('adminBody'))}</div><div class="ar-actions">${btn('restart', g('adminRestart'), 'j-btn-primary j-btn-sm', A.waitingAdmin ? 'disabled' : '')}${btn('limited', g('adminLimited'), 'j-btn-ghost j-btn-sm')}</div>${A.waitingAdmin ? `<div class="ar-muted" role="status">${esc(g('adminWaiting'))}</div>` : ''}</div>`
    return `<div class="ar-center ar-enter">${MONOGRAM}<h1 class="ar-display" id="ar-title">${esc(g(greetingKey(hr)))}</h1><p class="ar-lead">${esc(g('welcomeLead'))}</p>
      <label class="ar-switch"><input type="checkbox" id="ar-sounds" ${root.settings.uiSounds ? 'checked' : ''}><span>${esc(g('soundsLabel'))}</span><small>${esc(g('soundsHint'))}</small></label>
      ${admin}<div class="ar-actions">${btn('begin', g('begin'), 'j-btn-primary j-btn-lg')}</div><button type="button" class="ar-link" data-act="later">${esc(g('later'))}</button></div>`
  }

  function questionHtml() {
    const p = A.profile, si = sysInfo || {}
    if (A.q === 0) return { t: g('q1'), body: USE.map(([v, k], i) => tile('radio', 0, v, g(k), '', p.useCase === v, i + 1)).join(''), ok: !!p.useCase }
    if (A.q === 1) {
      const games = A.data.games || []
      const body = games.length ? games.map((x, i) => { const id = x.id || x.name; return tile('checkbox', 1, id, x.name || id, '', (p.games || []).includes(id), i + 1) }).join('') : `<p class="ar-muted">${esc(A.rows.games.state === 'done' ? g('noGames') : g('stillChecking'))}</p>`
      return { t: g('q2'), body, ok: true }
    }
    if (A.q === 2) {
      const opts = PRIO.filter(([v]) => v !== 'battery' || si.isLaptop)
      return { t: g('q3'), body: opts.map(([v, k], i) => tile('checkbox', 2, v, g(k), '', p.priorities.includes(v), i + 1)).join(''), ok: true }
    }
    return { t: g('q4'), body: COMFORT.map(([v, k, s], i) => tile('radio', 3, v, g(k), g(s), p.comfort === v, i + 1)).join(''), ok: true }
  }
  function sceneAbout() {
    const q = questionHtml()
    return `<div class="ar-split ar-enter"><div class="ar-main">${eyebrow('eyebrowAbout')}<h2 class="ar-hero" id="ar-title">${esc(g('aboutTitle'))}</h2>
      <div class="ar-step">${esc(g('stepOf', { i: A.q + 1, n: 4 }))}</div><p class="ar-lead">${esc(q.t)}</p>
      <div class="ar-tiles" role="${A.q === 0 || A.q === 3 ? 'radiogroup' : 'group'}" aria-label="${esc(q.t)}">${q.body}</div>
      <div class="ar-actions">${btn('back', g('back'), 'j-btn-ghost')}${btn('next', g('continue'), 'j-btn-primary', q.ok ? '' : 'disabled')}</div></div>
      <aside class="ar-rail" aria-label="${esc(g('prepTitle'))}"><div class="ar-rail-t">${esc(g('prepTitle'))}</div><ul id="ar-ledger" class="ar-ledger" role="status" aria-live="polite">${ledgerHtml()}</ul></aside></div>`
  }

  function dossier() {
    const si = sysInfo || {}, d = A.data, R = A.rows
    let pf = {}; try { pf = JSON.parse(localStorage.getItem('pf_tweak_states') || '{}') } catch {}
    const cards = []
    const tier = root.pcTier ? root.pcTier().tier : 'mid'
    cards.push({ shot: 'cpu', t: g('dossierHardware'), lines: [g('tier' + tier[0].toUpperCase() + tier.slice(1)), si.cpu, si.gpu, si.ramGB ? si.ramGB + ' GB RAM' : ''].filter(Boolean) })
    let h
    if (R.health.state === 'skipped') h = { lines: [g('reasonNoAdmin')] }
    else if (R.health.state === 'done') h = { lines: [g('healthOk')] }
    else if (R.health.state === 'attention') h = { lines: [g('healthBad')], warn: true }
    else h = { lines: [g('stillChecking')], pending: true }
    cards.push(Object.assign({ shot: 'drive0', t: g('dossierHealth') }, h))
    const n = Object.values(pf).filter(Boolean).length
    const os = (localStorage.getItem('pf_os_type') || '').toLowerCase()
    cards.push(R.preflight.state === 'done'
      ? { shot: 'ram0', t: g('dossierOptimized'), lines: [n ? g('optimizedCount', { n }) : g('optimizedNone'), os ? g(os === 'stock' ? 'stockOs' : 'customOs') : ''].filter(Boolean) }
      : { shot: 'ram0', t: g('dossierOptimized'), lines: [g('stillChecking')], pending: true })
    const notes = []
    if (si.isLaptop) notes.push(g('noteBattery'))
    if (si.ramGB && si.ramGB < 16) notes.push(g('noteLowRam'))
    if (si.isWifi) notes.push(g('noteWifi'))
    const ss = parseInt(localStorage.getItem('pf_safety_score') || '', 10)
    if (!isNaN(ss) && ss < 50) notes.push(g('noteScore'))
    if (d.av && d.av.name) notes.push(g('noteAv', { name: d.av.name }))
    cards.push({ shot: 'gpu', t: g('dossierConsiderations'), lines: notes.length ? notes : [g('dossierNone')] })
    return cards
  }
  const dossierHtml = () => dossier().map(c => `<div class="ar-card ${c.warn ? 'is-warn' : ''} ${c.pending ? 'is-pending' : ''}" tabindex="0" data-shot="${c.shot}"><div class="ar-card-t">${esc(c.t)}</div>${c.lines.map(l => `<div class="ar-line">${esc(l)}</div>`).join('')}</div>`).join('')
  function refreshDossier() { const el = document.getElementById('ar-dossier'); if (el) el.innerHTML = dossierHtml() }
  function sceneDossier() {
    return `<div class="ar-wide ar-enter"><div class="ar-bar">${eyebrow('eyebrowPc')}<span class="ar-pill" id="ar-pill" role="status">${esc(pillText())}</span></div><h2 class="ar-hero" id="ar-title">${esc(g('pcTitle'))}</h2>
      <div class="ar-cards" id="ar-dossier">${dossierHtml()}</div><div class="ar-actions">${btn('back', g('back'), 'j-btn-ghost')}${btn('next', g('continue'), 'j-btn-primary')}</div></div>`
  }

  const IMPACT = { high: 'impactHigh', medium: 'impactMedium', low: 'impactLow' }, RISK = { 1: 'riskSafe', 2: 'riskReview', 3: 'riskAdvanced' }
  function moveCard(m) {
    const on = A.sel.has(m.id), title = root.tG('concierge', m.titleKey, m.vars), why = root.tG('concierge', m.whyKey, m.vars)
    const detail = m.action.type === 'batch' ? `<details class="ar-more"><summary>${esc(g('showTweaks'))}</summary><ul>${m.action.ids.map(id => `<li>${esc((root.tName && root.tName(id)) || id)}</li>`).join('')}</ul></details>` : ''
    return `<div class="ar-move ${on ? 'is-on' : ''}"><label class="ar-move-main"><input type="checkbox" data-act="toggle" data-id="${m.id}" ${on ? 'checked' : ''}><span class="ar-move-t">${esc(title)}</span><span class="ar-move-w">${esc(why)}</span></label>
      <div class="ar-chips"><span>${esc(g(IMPACT[m.impact] || 'impactLow'))}</span><span>${esc(g(RISK[m.risk] || 'riskSafe'))}</span><span>${esc(g('minutes', { n: m.minutes }))}</span><span>${esc(g('undoAnytime'))}</span></div>${detail}</div>`
  }
  function sceneSuggest() {
    if (A.loadingMoves) return `<div class="ar-center ar-enter">${eyebrow('eyebrowSuggest')}<h2 class="ar-hero" id="ar-title">${esc(g('suggestTitle'))}</h2><p class="ar-lead" role="status">${esc(g('waitingChecks'))}</p></div>`
    const n = A.sel.size
    return `<div class="ar-wide ar-enter">${eyebrow('eyebrowSuggest')}<h2 class="ar-hero" id="ar-title">${esc(g('suggestTitle'))}</h2><p class="ar-muted">${esc(g('suggestNothing'))}</p>
      <div class="ar-moves">${A.moves.map(moveCard).join('')}</div>
      <div class="ar-actions">${btn('look', g('suggestLook'), 'j-btn-ghost')}${btn('keep', g('suggestKeep', { n }), 'j-btn-primary', n ? '' : 'disabled')}</div></div>`
  }
  function sceneAsk() {
    return `<div class="ar-center ar-enter">${eyebrow('eyebrowAsk')}<h2 class="ar-hero" id="ar-title">${esc(g('askTitle'))}</h2><p class="ar-lead">${esc(g('askBody'))}</p>
      <div class="ar-actions ar-equal">${btn('consent-no', g('askNo'), 'j-btn-lg', 'data-autofocus')}${btn('consent-yes', g('askYes'), 'j-btn-lg')}</div></div>`
  }
  function sceneReady() {
    const rp = A.data.restorePoint === true, planned = (root.settings.concierge && root.settings.concierge.moves || []).length, tours = root.settings.toursEnabled !== false
    const li = (ok, t) => `<li class="${ok ? 'is-ok' : ''}">${esc(t)}</li>`
    return `<div class="ar-center ar-enter ar-ready">${MONOGRAM}${eyebrow('eyebrowReady')}<h2 class="ar-display" id="ar-title">${esc(g('readyTitle'))}</h2>
      <ul class="ar-summary">${li(rp, rp ? g('readyRestore') : A.isAdmin ? g('prepRestore') + ' · ' + g('stAttention') : g('reasonNoAdmin'))}${li(planned > 0, g('readyMoves', { n: planned }))}${li(tours, g(tours ? 'toursOn' : 'toursOff'))}</ul>
      <div class="ar-actions">${btn('open', g('readyOpen'), 'j-btn-primary j-btn-lg', 'data-autofocus')}</div></div>`
  }
  const SCENE_FN = { 1: sceneWelcome, 2: sceneAbout, 3: sceneDossier, 4: sceneSuggest, 5: sceneAsk, 6: sceneReady }

  function escSheet() {
    return `<div class="ar-sheet" role="alertdialog" aria-labelledby="ar-esc-t"><div class="ar-card"><div class="ar-card-t" id="ar-esc-t">${esc(g('escTitle'))}</div><div class="ar-muted">${esc(g('escBody'))}</div><div class="ar-actions">${btn('esc-stay', g('escStay'), 'j-btn-ghost', 'data-autofocus')}${btn('esc-later', g('escLater'), 'j-btn-primary')}</div></div></div>`
  }

  async function render(first) {
    const el = rootEl(); if (!el || !A) return
    el.innerHTML = `<div class="ar-stage" data-scene="${A.scene}">${SCENE_FN[A.scene]()}</div>${A.esc ? escSheet() : ''}`
    el.setAttribute('aria-labelledby', 'ar-title')
    const af = el.querySelector('[data-autofocus]') || el.querySelector('.ar-actions .j-btn-primary:not([disabled])') || el.querySelector('button')
    if (af && !first) af.focus({ preventScroll: true })
  }

  async function goto(n, sound = true) {
    if (!A) return
    const el = rootEl()
    if (n === 5 && root.settings.analyticsConsent !== undefined) n = 6
    A.scene = n
    root.settings.arrival = Object.assign({}, root.settings.arrival, { v: 1, scene: n, profile: A.profile, restorePoint: A.data.restorePoint })
    save()
    if (sound) play(n === 6 ? 'ready' : 'step')
    if (el) { el.classList.add('is-swap'); await sleep(180 * scale()); }
    await render()
    if (el) el.classList.remove('is-swap')
    if (n === 2 || n === 3) startPrep()
    if (n === 4) { loadMoves() }
  }

  async function loadMoves() {
    A.loadingMoves = true; render()
    root.settings.arrival.profile = A.profile
    try { await Promise.race([A.P.preflight || Promise.resolve(), sleep(90000)]) } catch {}
    try { A.moves = await root.conciergeCompute() } catch { A.moves = [] }
    A.sel = new Set(A.moves.slice(0, 3).map(m => m.id))
    A.loadingMoves = false
    if (A && A.scene === 4) { if (!A.moves.length) return goto(5, false); render() }
  }

  async function complete(deferred) {
    const s = root.settings, p = A.profile, m = useCaseMap(p.useCase), cs = comfortSettings(p.comfort), rerun = A.rerun
    s.onboardingDone = true
    if (s.toursEnabled === undefined) s.toursEnabled = true   // a new install gets the tours, also after "Later"
    if (!deferred) {
      if (p.useCase) s.aom_use_case = m.aom_use_case
      if (cs.advancedMode) s.advancedMode = true
    }
    s.arrival = Object.assign({}, s.arrival, { v: 1, scene: A.scene, profile: p, restorePoint: A.data.restorePoint, startedAt: (s.arrival && s.arrival.startedAt) || Date.now(), completedAt: deferred ? null : Date.now(), deferred: !!(deferred && !rerun), resumeAfterAdmin: false })
    await save()
    const el = rootEl(); el.classList.add('is-leaving')
    await sleep(520 * scale())
    el.classList.remove('open', 'is-leaving'); el.innerHTML = ''; el.style.display = 'none'
    document.removeEventListener('keydown', onKey, true)
    state.active = false; A = null
    try { root.Shell.refresh() } catch {}
    root.showPage('dashboard')
  }

  async function restartAsAdmin() {
    A.waitingAdmin = true; A.declined = false; render()
    root.settings.arrival = Object.assign({}, root.settings.arrival, { v: 1, scene: A.scene, profile: A.profile, resumeAfterAdmin: true })
    await save()
    try { root.api.relaunchAdmin() } catch {}
    setTimeout(() => { if (A && !A.isAdmin) { A.waitingAdmin = false; A.declined = true; root.settings.arrival.resumeAfterAdmin = false; save(); render() } }, 8000)
  }

  function pick(q, v) {
    const p = A.profile
    if (q === 0) p.useCase = v
    else if (q === 1) { const l = new Set(p.games || []); l.has(v) ? l.delete(v) : l.add(v); p.games = [...l] }
    else if (q === 2) p.priorities = togglePriority(p.priorities, v)
    else p.comfort = v
    root.settings.arrival = Object.assign({}, root.settings.arrival, { v: 1, scene: A.scene, profile: p })
    save()
    render()
  }

  const ACTS = {
    begin: () => { startPrep(); goto(2) },
    later: () => complete(true),
    restart: restartAsAdmin,
    limited: () => { A.declined = false; render() },
    back: () => { if (A.scene === 2 && A.q > 0) { A.q--; render() } else goto(Math.max(1, A.scene - 1), false) },
    next: () => { if (A.scene === 2 && A.q < 3) { A.q++; play('step'); render() } else goto(A.scene + 1) },
    keep: () => { root.conciergeAdopt(A.moves.filter(m => A.sel.has(m.id))); goto(5) },
    look: () => { root.conciergeAdopt([]); goto(5) },
    'consent-yes': () => { root.settings.analyticsConsent = true; goto(6) },
    'consent-no': () => { root.settings.analyticsConsent = false; goto(6) },
    open: () => complete(false),
    'esc-stay': () => { A.esc = false; render() },
    'esc-later': () => complete(true),
  }

  function onClick(e) {
    if (!A) return
    const t = e.target.closest('[data-act]'); if (!t) return
    if (t.dataset.act === 'pick') return pick(+t.dataset.q, t.dataset.v)
    if (t.dataset.act === 'toggle') { A.sel.has(t.dataset.id) ? A.sel.delete(t.dataset.id) : A.sel.add(t.dataset.id); return render() }
    if (ACTS[t.dataset.act]) ACTS[t.dataset.act]()
  }
  function onChange(e) {
    if (e.target.id !== 'ar-sounds') return
    root.settings.uiSounds = e.target.checked; save()
    if (e.target.checked) play('welcome')
  }
  function onOver(e) {
    const c = e.target.closest && e.target.closest('[data-shot]'); if (!c || !root.JylliWorld || !root.JylliTwin) return
    try { root.JylliWorld.enabled() && root.JylliTwin.shot(c.dataset.shot) } catch {}
  }

  function onKey(e) {
    if (!A) return
    const el = rootEl()
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); A.esc = !A.esc; render(); return }
    if (e.key === 'Tab') {   // keep focus inside the dialog
      const f = [...el.querySelectorAll('button:not([disabled]), input, summary, [tabindex="0"]')].filter(x => x.offsetParent !== null)
      if (!f.length) return
      const first = f[0], last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      return
    }
    if (A.scene === 2 && /^[1-9]$/.test(e.key) && !(e.target.matches && e.target.matches('input[type=text]'))) {
      const tiles = el.querySelectorAll('.ar-tile'), t = tiles[+e.key - 1]
      if (t) { e.preventDefault(); t.click() }
    }
  }

  async function start(opts = {}) {
    if (state.active) return
    const el = rootEl(); if (!el) return
    state.active = true
    const isAdmin = await root.api.isAdmin().catch(() => false)
    const saved = root.settings.arrival
    A = fresh(saved, isAdmin, opts.rerun)
    // the elevated instance after a requested restart: the flag has done its job
    if (isAdmin && saved && saved.resumeAfterAdmin) { saved.resumeAfterAdmin = false }
    root.settings.arrival = Object.assign({}, saved, { v: 1, scene: A.scene, profile: A.profile, startedAt: (saved && saved.startedAt) || Date.now(), completedAt: opts.rerun ? null : (saved && saved.completedAt) || null })
    save()
    el.style.display = 'flex'; el.classList.add('open'); el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true')
    if (!el._wired) { el.addEventListener('click', onClick); el.addEventListener('change', onChange); el.addEventListener('mouseover', onOver); el.addEventListener('focusin', onOver); el._wired = true }
    document.addEventListener('keydown', onKey, true)
    if (A.scene >= 2) startPrep()
    await render(true)
    if (A.scene === 4) loadMoves()
    if (A.scene === 1) play('welcome')
  }

  function maybeStart() { if (!root.settings.onboardingDone && !state.active) start({}) }

  root.JylliArrival = Object.assign(api, { start, maybeStart, get active() { return state.active } })
})(typeof window !== 'undefined' ? window : globalThis)
