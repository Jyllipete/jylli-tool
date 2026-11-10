'use strict'
// Auto-Optimize 2.0. A full-window flow (scan -> diagnosis -> plan -> run -> result, plus "welcome back" after the restart) built on the
// engine in lib/auto-opti. The renderer never names a tweak: it sends finding ids and choices, main rebuilds the plan from its own
// cached scan. Every number on screen is a detected or measured value.
// Pure helpers are exported for node tests (test/auto-opti-ui.test.js); the DOM part is guarded by `typeof document`.
;(function (root) {
  const PROBE_ORDER = ['hw', 'display', 'power', 'gpu', 'storage', 'windows', 'startup', 'security', 'net']
  const MODULE_ORDER = ['display', 'power', 'gpu', 'input', 'windows', 'network', 'startup', 'storage', 'fivem', 'cleanup']
  const TRAIL = ['scan', 'diagnosis', 'plan', 'run', 'result']
  const IMPACT_RANK = { high: 3, medium: 2, low: 1 }

  // ── pure ──
  function groupFindings(list) {
    const l = list || []
    return { weFix: l.filter(f => f.kind === 'fix'), needsYou: l.filter(f => f.kind === 'manual'), info: l.filter(f => f.kind === 'info') }
  }

  /** Counts for the diagnosis headline. "holding back" = things we can fix or that need the user, never info cards. */
  function headline(list) {
    const g = groupFindings(list)
    const real = [...g.weFix, ...g.needsYou]
    const by = k => real.filter(f => f.impact === k).length
    return { n: real.length, high: by('high'), medium: by('medium'), low: by('low'), fix: g.weFix.length, manual: g.needsYou.length, healthy: real.filter(f => f.impact !== 'low').length === 0 }
  }

  /** Which fix findings start ticked: the engine's defaultOn. */
  function initialOn(list) { return new Map((list || []).filter(f => f.kind === 'fix').map(f => [f.id, !!f.defaultOn])) }

  /** The user's ticks as the include/exclude lists main understands (only the differences from the defaults travel). */
  function selection(list, on) {
    const include = [], exclude = []
    for (const f of list || []) {
      if (f.kind !== 'fix') continue
      const want = on.get(f.id)
      if (want && !f.defaultOn) include.push(f.id)
      if (!want && f.defaultOn) exclude.push(f.id)
    }
    return { include, exclude }
  }

  /** Plan-scene rows: fix findings grouped by module, in module order, with their tick state. */
  function moduleViews(list, on) {
    const by = new Map()
    for (const f of (list || []).filter(x => x.kind === 'fix' && !(x.risk >= 3))) {   // expert rows live in their own section
      if (!by.has(f.module)) by.set(f.module, [])
      by.get(f.module).push({ ...f, on: !!on.get(f.id) })
    }
    return MODULE_ORDER.filter(m => by.has(m)).map(m => {
      const items = by.get(m)
      return { id: m, items, onCount: items.filter(i => i.on).length, total: items.length, on: items.some(i => i.on) }
    })
  }

  /** Tier 3 rows: shown apart, never ticked by a module switch, each needs the typed word. */
  function expertViews(list) { return (list || []).filter(f => f.kind === 'fix' && f.risk >= 3) }

  function newRun(plan) {
    const steps = new Map(), order = []
    for (const s of (plan && plan.steps) || []) { steps.set(s.stepId, { stepId: s.stepId, module: s.module, findingId: s.findingId, status: 'pending', changes: [], error: null }); order.push(s.stepId) }
    const modules = new Map(((plan && plan.modules) || []).map(m => [m.id, { id: m.id, state: 'planned', total: m.steps, done: 0 }]))
    return { phase: 'measure', steps, order, modules, counters: { settingsChanged: 0, startupRemoved: 0, tasksDisabled: 0, bytesReclaimed: 0 }, confirm: null, current: null, shield: null, finished: null }
  }

  /** Folds one auto-opti-event into the run state. Mutates and returns it. */
  function applyEvent(run, ev) {
    if (!run || !ev) return run
    switch (ev.phase) {
      case 'measure': run.phase = 'measure'; break
      case 'restore-point': run.phase = ev.state === 'done' ? 'steps' : 'restore-point'; break
      case 'module-start': { const m = run.modules.get(ev.module); if (m) m.state = 'running'; run.phase = 'steps'; break }
      case 'module-done': { const m = run.modules.get(ev.module); if (m) m.state = 'done'; break }
      case 'step-start': { const s = run.steps.get(ev.stepId); if (s) s.status = 'running'; run.current = ev.stepId; break }
      case 'step-done': {
        const s = run.steps.get(ev.stepId)
        if (s) { s.status = ev.status || 'ok'; s.changes = ev.changes || []; s.error = ev.error || null }
        const m = run.modules.get(ev.module); if (m) m.done++
        if (ev.counters) run.counters = { ...run.counters, ...ev.counters }
        if (run.current === ev.stepId) run.current = null
        break
      }
      case 'counter': if (ev.counters) run.counters = { ...run.counters, ...ev.counters }; break
      case 'confirm-request': run.confirm = { stepId: ev.stepId, device: ev.device, from: ev.from, to: ev.to, deadline: ev.deadline }; break
      case 'shield-verified': run.shield = { ok: ev.ok, checked: ev.checked, changed: ev.changed || [] }; break
      case 'done': run.phase = 'done'; run.finished = { ok: ev.ok, aborted: !!ev.aborted, reason: ev.reason || null, rebootRequired: !!ev.rebootRequired, stopped: !!ev.stopped }; run.confirm = null; break
    }
    if (ev.phase === 'step-done' && run.confirm && run.confirm.stepId === ev.stepId) run.confirm = null
    return run
  }

  /** 0..1 progress for the reactor core: finished steps over all steps. */
  function progress(run) {
    if (!run || !run.order.length) return 0
    let done = 0
    for (const id of run.order) { const s = run.steps.get(id); if (s && s.status !== 'pending' && s.status !== 'running') done++ }
    return done / run.order.length
  }

  function fmtBytes(b) {
    const n = Number(b)
    if (!Number.isFinite(n) || n <= 0) return '0 MB'
    if (n >= 1024 ** 3) return (n / 1024 ** 3).toFixed(n >= 10 * 1024 ** 3 ? 0 : 1) + ' GB'
    return Math.max(1, Math.round(n / 1024 ** 2)) + ' MB'
  }
  function fmtDuration(sec) {
    const s = Math.max(0, Math.round(sec))
    return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60 ? (s % 60) + ' s' : ''}`.trim() : `${s} s`
  }
  /** Close is allowed everywhere except while changes are being applied. */
  const canClose = (scene, run) => !(scene === 'run' && run && run.phase !== 'done')
  const trailState = (scene, i) => { const cur = TRAIL.indexOf(scene === 'welcome' ? 'result' : scene); return i < cur ? 'done' : i === cur ? 'active' : 'todo' }
  /** Failure copy key for a scan/run refusal. */
  const reasonKey = r => ({ 'game-running': 'rGame', 'run-active': 'rBusy', 'scan-active': 'rBusy', 'not-admin': 'rAdmin', 'scan-expired': 'rExpired', 'already-running': 'rBusy', 'empty-plan': 'rEmpty', 'scan-failed': 'rScan', 'restore-point-failed': 'rRestore', 'not_admin': 'rAdmin', 'rRestore': 'rRestore' }[r] || 'rGeneric')

  const pure = { PROBE_ORDER, MODULE_ORDER, TRAIL, IMPACT_RANK, groupFindings, headline, initialOn, selection, moduleViews, expertViews, newRun, applyEvent, progress, fmtBytes, fmtDuration, canClose, trailState, reasonKey }
  if (typeof module !== 'undefined' && module.exports) module.exports = pure
  if (typeof document === 'undefined') return

  // ── DOM ──
  const g = (k, v) => root.tG('autoOpti', k, v)
  const esc = s => root.escHtml(String(s == null ? '' : s))
  const sleep = ms => new Promise(r => setTimeout(r, ms))
  const scale = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--motion-scale')) || 1
  const play = n => { try { root.JylliSound && root.JylliSound.play(n) } catch {} }
  const $ = s => document.querySelector(s)
  const rootEl = () => document.getElementById('auto-opti')
  const gx = (k, fb, v) => { const t = g(k, v); return t === k ? fb : t }

  let A = null   // the open session
  const state = { active: false }

  function fresh() {
    return { scene: 'scan', scanId: null, intensity: 'safe', expertOk: new Set(), maxExtra: 0, profile: null, findings: [], plan: null, useCase: null, on: new Map(), startupOn: null, modsOff: {}, answers: {}, expanded: new Set(),
      run: null, result: null, verify: null, probes: {}, reactor: null, unsub: [], busy: false, token: 0, undoBusy: false }
  }

  const value = (v, unit) => {
    if (!v || v.v == null) return '–'
    if (v.fmt === 'onoff') return g(v.v === 'on' ? 'on' : 'off')
    if (unit === 'bytes') return fmtBytes(v.v)
    return unit && unit !== 'bytes' ? `${esc(v.v)} ${esc(unit)}` : esc(v.v)
  }
  const pv = (v, unit) => (v == null ? '–' : unit === 'bytes' ? fmtBytes(v) : unit ? `${esc(v)} ${esc(unit)}` : esc(v))

  // ── shell ──
  function build() {
    const el = rootEl()
    el.innerHTML =
      `<div class="ao-bg" aria-hidden="true"></div>
       <header class="ao-head">
         <div class="ao-brand"><span class="ao-brand-mark"><i class="fa fa-bolt"></i></span><span id="ao-title">${esc(g('brand'))}</span></div>
         <ol class="ao-trail" aria-label="${esc(g('trailLabel'))}">${TRAIL.map((s, i) => `<li data-s="${s}" data-state="todo">${esc(g('trail_' + s))}</li>`).join('')}</ol>
         <button type="button" class="j-btn j-btn-ghost ao-x" id="ao-close" aria-label="${esc(g('close'))}"><i class="fa fa-xmark"></i></button>
       </header>
       <div class="ao-body">
         <section class="ao-left"><div id="ao-reactor"></div><div class="ao-live" id="ao-live" aria-live="polite"></div></section>
         <section class="ao-right" id="ao-right" tabindex="-1"></section>
       </div>`
    $('#ao-close').addEventListener('click', () => close())
    A.reactor = root.JylliReactor.mount($('#ao-reactor'), { modules: MODULE_ORDER, probes: PROBE_ORDER })
  }

  const live = (t, s) => { const el = $('#ao-live'); if (el) el.innerHTML = `<div class="ao-live-t">${esc(t || '')}</div>${s ? `<div class="ao-live-s">${esc(s)}</div>` : ''}` }
  const right = html => { const r = $('#ao-right'); if (!r) return null; r.innerHTML = html; r.scrollTop = 0; return r }
  function setScene(scene) {
    A.scene = scene
    const el = rootEl(); el.dataset.scene = scene
    el.querySelectorAll('.ao-trail li').forEach((li, i) => { li.dataset.state = trailState(scene, i) })
    const x = $('#ao-close'); if (x) x.style.visibility = canClose(scene, A.run) ? '' : 'hidden'
  }

  // ── lifecycle ──
  async function open(opts) {
    if (state.active) return
    if (root.sysInfo && root.sysInfo.isAdmin === false) { root.toast(root.tUI('tkAdminReq'), root.tUI('tkAdminReqMsg'), 'err'); return }
    state.active = true
    A = fresh()
    A.useCase = (opts && opts.useCase) || null
    const el = rootEl()
    el.style.display = 'flex'
    build()
    void el.offsetWidth
    el.classList.add('open')
    A.keydown = e => onKey(e)
    document.addEventListener('keydown', A.keydown, true)
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'ao-title')
    A.prevFocus = document.activeElement
    $('#ao-right').focus()
    await startScan(false)
  }

  function close(force) {
    if (!state.active) return
    if (!force && !canClose(A.scene, A.run)) return
    A.token++
    for (const u of A.unsub) { try { u() } catch {} }
    document.removeEventListener('keydown', A.keydown, true)
    const el = rootEl()
    el.classList.remove('open')
    const prev = A.prevFocus
    setTimeout(() => { el.style.display = 'none'; el.innerHTML = ''; try { prev && prev.focus && prev.focus() } catch {} }, 260 * scale())
    try { A.reactor && A.reactor.destroy() } catch {}
    state.active = false; A = null
    
  }

  function onKey(e) {
    if (e.key === 'Escape') { if (A.run && A.run.confirm) return; e.preventDefault(); close(); return }
    if (e.key !== 'Tab') return
    const f = [...rootEl().querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex="0"], a[href]')].filter(n => n.offsetParent !== null)
    if (!f.length) return
    const first = f[0], last = f[f.length - 1]
    if (e.shiftKey && (document.activeElement === first || !rootEl().contains(document.activeElement))) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  // ── scene 1: scan ──
  function probeRow(id, st) {
    const s = st || { state: 'idle' }
    const chips = (s.chips || []).filter(c => c.valueText || c.subText).map(c =>
      `<span class="ao-chip" data-status="${esc(c.status)}"><span>${esc(c.valueText)}</span>${c.subText ? `<small>${esc(c.subText)}</small>` : ''}</span>`).join('')
    return `<div class="ao-probe" data-probe="${id}" data-state="${s.state}">
      <span class="ao-pi"></span><div class="ao-probe-t">${esc(g('probe_' + id))}</div>
      <span class="ao-probe-ms">${s.state === 'done' || s.state === 'fail' ? esc(s.ms) + ' ms' : s.state === 'start' ? '…' : ''}</span>
      ${chips ? `<div class="ao-chips">${chips}</div>` : s.state === 'fail' ? `<div class="ao-chips ao-muted">${esc(g('probeFail'))}</div>` : ''}</div>`
  }

  async function startScan(force) {
    const token = ++A.token
    setScene('scan'); A.probes = {}; A.reactor.phase('scan'); A.reactor.scanning(true); A.reactor.allModules('idle'); A.reactor.level(.15)
    A.reactor.center('0/' + PROBE_ORDER.length, g('probesLabel'))
    live(g('scanLive'), g('scanLiveSub'))
    right(`<div class="ao-scene ao-enter"><div><div class="ao-eyebrow">${esc(g('trail_scan'))}</div><h1 class="ao-title">${esc(g('scanTitle'))}</h1></div>
      <p class="ao-lead">${esc(g('scanLead'))}</p><div class="ao-probes" id="ao-probes">${PROBE_ORDER.map(id => probeRow(id)).join('')}</div></div>`)
    const off = root.api.onAoScanProgress(ev => {
      if (!A || token !== A.token || !ev || !PROBE_ORDER.includes(ev.probe)) return
      A.probes[ev.probe] = { state: ev.state, ms: ev.ms, chips: ev.chips }
      const row = $(`.ao-probe[data-probe="${ev.probe}"]`)
      if (row) row.outerHTML = probeRow(ev.probe, A.probes[ev.probe])
      A.reactor.probe(ev.probe, ev.state)
      const done = Object.values(A.probes).filter(p => p.state === 'done' || p.state === 'fail').length
      A.reactor.center(`${done}/${PROBE_ORDER.length}`, g('probesLabel')); A.reactor.level(.15 + .6 * done / PROBE_ORDER.length)
      if (ev.state === 'done') A.reactor.pulse()
    })
    A.unsub.push(off)
    const r = await root.api.aoScan({ force: !!force, useCase: A.useCase || undefined, intensity: wantedIntensity() }).catch(e => ({ ok: false, reason: 'scan-failed', error: String(e) }))
    try { off() } catch {}
    if (!A || token !== A.token) return
    A.reactor.scanning(false)
    if (!r || !r.ok) return showError(r && r.reason, () => startScan(true))
    A.scanId = r.scanId; A.profile = r.profile; A.findings = r.findings; A.useCase = r.useCase; A.intensity = r.intensity || 'safe'; A.maxExtra = r.maxExtra || 0
    for (const p of PROBE_ORDER) if (!A.probes[p]) A.reactor.probe(p, (r.profile.probes[p] || {}).ok ? 'done' : 'fail')
    A.on = initialOn(A.findings)
    await sleep(500 * scale())
    if (A && token === A.token) showDiagnosis()
  }

  function showError(reason, retry) {
    A.reactor.phase('idle'); A.reactor.center('!', ''); A.reactor.level(.1)
    live(g('errTitle'), '')
    const r = right(`<div class="ao-scene ao-enter"><h1 class="ao-title">${esc(g('errTitle'))}</h1><p class="ao-lead">${esc(g(reasonKey(reason)))}</p>
      <div class="ao-actions"><button class="j-btn j-btn-ghost" id="ao-e-close">${esc(g('close'))}</button>${retry ? `<button class="j-btn j-btn-primary" id="ao-e-retry">${esc(g('retry'))}</button>` : ''}</div></div>`)
    r.querySelector('#ao-e-close').onclick = () => close(true)
    const b = r.querySelector('#ao-e-retry'); if (b) b.onclick = retry
  }

  // ── scene 2: diagnosis ──
  const impactBadge = f => `<span class="ao-badge" data-k="${f.impact}">${esc(g('impact_' + f.impact))}</span>${riskLabel(f)}`
  function baStrip(f) {
    if (!f.before || !f.expectedAfter) return ''
    return `<div class="ao-ba"><span class="from">${pv(f.before.v, f.before.unit)}</span><span class="arrow">→</span><span class="to">${pv(f.expectedAfter.v, f.expectedAfter.unit)}</span></div>`
  }
  function findCard(f) {
    const v = { ...(f.vars || {}) }
    if (v.gb != null) v.gb = String(v.gb)
    const conf = f.confidence === 'likely' ? `<span class="ao-badge" data-k="warn">${esc(g('likely'))}</span>` : ''
    return `<article class="ao-find" data-impact="${f.impact}"><div class="ao-find-t">${esc(g(f.titleKey, v))}</div><div>${conf} ${f.kind === 'info' ? '' : impactBadge(f)}</div>
      <div class="ao-find-w">${esc(g(f.whyKey, v))}</div>${baStrip(f)}
      ${f.link ? `<button type="button" class="j-btn j-btn-ghost j-btn-sm ao-find-link" data-link="${esc(f.link)}"><i class="fa fa-arrow-up-right-from-square"></i> ${esc(g('openLink'))}</button>` : ''}
      ${f.optIn === 'hvci' ? `<button type="button" class="j-btn j-btn-ghost j-btn-sm ao-find-link" data-hvci="1"><i class="fa fa-shield-halved"></i> ${esc(g('hvciBtn'))}</button>` : ''}
      ${f.undoable === false ? `<div class="ao-find-w ao-muted">${esc(g('notUndoable'))}</div>` : ''}</article>`
  }
  function shieldHtml(profile) {
    const s = (profile && profile.security) || {}
    const av = (s.thirdPartyAv || [])[0]
    const row = (ok, text) => `<li data-ok="${ok !== false}">${esc(text)}</li>`
    return `<aside class="ao-shield"><div class="ao-shield-t"><i class="fa fa-shield-halved"></i>${esc(g('shieldTitle'))}</div><ul>
      ${row(av ? true : s.defenderRtp, av ? g('shieldAv', { name: av }) : g('shieldDefender'))}${row(s.firewallOn, g('shieldFirewall'))}${row(s.smartScreen !== 'off', g('shieldSmart'))}${row(s.windowsUpdate !== 'disabled', g('shieldUpdate'))}${row(s.uac !== 'off', g('shieldUac'))}</ul>
      <div class="ao-muted">${esc(g('shieldNote'))}</div></aside>`
  }

  function showDiagnosis() {
    setScene('diagnosis'); const h = headline(A.findings), gr = groupFindings(A.findings)
    A.reactor.phase('diagnosis'); A.reactor.level(.55); A.reactor.allModules('idle')
    const mods = new Set(gr.weFix.map(f => f.module)); MODULE_ORDER.forEach(m => A.reactor.module(m, mods.has(m) ? 'planned' : 'idle'))
    A.reactor.center(String(h.n), g('foundLabel'))
    live(h.healthy ? g('diagHealthyLive') : g('diagLive', { n: h.n }), g('diagLiveSub', { fix: h.fix, manual: h.manual }))
    const r = right(`<div class="ao-scene ao-enter">
      <div><div class="ao-eyebrow">${esc(g('trail_diagnosis'))}</div>
        <h1 class="ao-title">${esc(h.n === 0 ? g('diagNone') : h.healthy ? g('diagMinor', { n: h.n }) : g('diagTitle', { n: h.n }))}</h1></div>
      <p class="ao-lead">${esc(h.n === 0 ? g('diagNoneLead') : g('diagLead', { fix: h.fix, manual: h.manual }))}</p>
      ${gr.weFix.length ? `<h2 class="ao-h2">${esc(g('weFix'))} <b>${gr.weFix.length}</b></h2><div class="ao-cols">${gr.weFix.map(findCard).join('')}</div>` : ''}
      ${gr.needsYou.length ? `<h2 class="ao-h2">${esc(g('needsYou'))} <b>${gr.needsYou.length}</b></h2><div class="ao-cols">${gr.needsYou.map(findCard).join('')}</div>` : ''}
      ${gr.info.length ? `<h2 class="ao-h2">${esc(g('goodToKnow'))}</h2><div class="ao-cols">${gr.info.map(findCard).join('')}</div>` : ''}
      ${shieldHtml(A.profile)}
      ${maxHintHtml()}
      <div class="ao-actions"><span class="ao-spacer ao-muted">${esc(g('scanTook', { ms: A.profile.scanMs || 0 }))}</span>
        <button class="j-btn j-btn-ghost" id="ao-rescan">${esc(g('rescan'))}</button>
        <button class="j-btn j-btn-primary" id="ao-next" ${gr.weFix.length ? '' : 'disabled'}>${esc(g('toPlan'))} <i class="fa fa-arrow-right"></i></button></div></div>`)
    r.querySelectorAll('[data-link]').forEach(b => { b.onclick = () => root.api.openExternal(b.dataset.link) })
    r.querySelectorAll('[data-hvci]').forEach(b => { b.onclick = () => hvciOptIn(b) })
    r.querySelector('#ao-rescan').onclick = () => startScan(true)
    const mg = r.querySelector('#ao-max-go'); if (mg) mg.onclick = () => setIntensity('max', showDiagnosis)
    const mb = r.querySelector('#ao-max-buy'); if (mb) mb.onclick = () => { try { root.JylliPremium.open() } catch {} }
    r.querySelector('#ao-next').onclick = () => showPlan()
    const nx = r.querySelector('#ao-next'); if (!nx.disabled) nx.focus()
  }

  // Memory Integrity: never part of a run. A separate, explicit choice that reuses the manual tweak (which makes its own restore point).
  async function hvciOptIn(btn) {
    const ok = await root.confirmTier('hvci-offload')
    if (!ok) return
    btn.disabled = true
    const r = await root.api.runTweak('hvci-offload', 'apply').catch(() => null)
    root.toast(g(r && r.ok !== false ? 'hvciDoneT' : 'hvciFailT'), g(r && r.ok !== false ? 'hvciDoneM' : 'hvciFailM'), r && r.ok !== false ? 'ok' : 'err')
    btn.disabled = false
  }

  // ── intensity: Safe (default) or Maximum (Premium) ──
  const premiumOn = () => !!(root.settings && root.settings.isPremium)
  function wantedIntensity() { return root.settings && root.settings.aom_intensity === 'max' && premiumOn() ? 'max' : 'safe' }
  /** Every aoPlan / aoRun request goes through here, so intensity and the typed confirmations can never be dropped by one call site. */
  function planReq(withSelection) {
    return { scanId: A.scanId, useCase: A.useCase, answers: A.answers, intensity: A.intensity, expertOk: [...A.expertOk],
      ...(withSelection ? { ...selection(A.findings, A.on), modules: A.modsOff, startupItems: A.startupOn ? [...A.startupOn] : undefined } : {}) }
  }
  async function setIntensity(mode, then) {
    if (mode === 'max' && !premiumOn()) { root.toast(g('maxLockedT'), g('maxLockedM'), 'warn', 8000, { action: { label: root.tUI('premiumLockCta'), run: () => root.JylliPremium && root.JylliPremium.open() } }); return }
    if (A.intensity === mode) return
    A.intensity = mode; A.expertOk.clear()
    const s = root.settings; if (s) { s.aom_intensity = mode; try { root.api.saveSettings(s) } catch {} }
    const res = await root.api.aoPlan(planReq(false))
    if (!A || !res || !res.ok) return showError(res && res.reason, () => startScan(true))
    A.findings = res.findings; A.on = initialOn(A.findings); A.startupOn = null; A.modsOff = {}; A.intensity = res.intensity || mode
    if (A.scene === 'plan') { await refreshPlan(); if (A && A.scene === 'plan') renderPlan() } else if (then) then()
  }
  const riskLabel = f => (f.risk >= 2 ? `<span class="ao-badge" data-k="risk${f.risk}">${esc(g('risk_' + f.risk))}</span>` : '')
  const riskBlock = f => { const id = f.steps && f.steps[0] && f.steps[0].id; const h = id && root.tRisk ? root.tRisk(id) : ''; return h ? `<div class="ao-risk">${h}</div>` : '' }
  function modeSwitchHtml() {
    const b = (id, k, locked) => `<button type="button" class="ao-tile" role="radio" aria-checked="${A.intensity === id}" data-intensity="${id}"><b>${esc(g(k))}${locked ? ' <i class="fa fa-lock"></i>' : ''}</b><span>${esc(g(k + 'S'))}</span></button>`
    return `<div class="ao-tiles ao-modes" role="radiogroup" aria-label="${esc(g('modeLabel'))}">${b('safe', 'modeSafe', false)}${b('max', 'modeMax', !premiumOn())}</div>`
  }
  function expertHtml() {
    if (A.intensity !== 'max') return ''
    const ex = expertViews(A.findings); if (!ex.length) return ''
    return `<div class="ao-expert"><h2 class="ao-h2">${esc(g('expertTitle'))} <b>${ex.length}</b></h2><p class="ao-item-s">${esc(g('expertLead'))}</p>
      ${ex.map(f => `<div class="ao-item"><input type="checkbox" id="ao-x-${f.id}" data-expert="${f.id}" ${A.expertOk.has(f.id) ? 'checked' : ''}>
        <div><label for="ao-x-${f.id}" class="ao-item-t">${esc(g(f.titleKey, f.vars || {}))}</label><div class="ao-item-s">${esc(g(f.whyKey, f.vars || {}))}</div>${riskBlock(f)}</div>${riskLabel(f)}</div>`).join('')}</div>`
  }
  function maxHintHtml() {
    if (A.intensity === 'max' || !(A.maxExtra > 0)) return ''
    return `<aside class="ao-note"><i class="fa fa-gauge-high"></i><span>${esc(g(premiumOn() ? 'maxHint' : 'maxHintLocked', { n: A.maxExtra }))}</span>${premiumOn() ? `<button type="button" class="j-btn j-btn-ghost j-btn-sm" id="ao-max-go">${esc(g('maxHintBtn'))}</button>` : `<button type="button" class="j-btn j-btn-primary j-btn-sm" id="ao-max-buy">${esc(g('maxBuyBtn'))}</button>`}</aside>`
  }

  // ── scene 3: plan ──
  const USE = [['fps', 'useFps'], ['open', 'useOpen'], ['stream', 'useStream'], ['mix', 'useMix']]
  async function refreshPlan() {
    const token = A.token
    const r = await root.api.aoPlan(planReq(true))
    if (!A || token !== A.token) return
    if (!r || !r.ok) return showError(r && r.reason, () => startScan(true))
    A.plan = r.plan
    return r
  }

  function itemSub(f) {
    if (f.id === 'startup-apps') {
      const items = (f.detail && f.detail.items) || []
      if (!A.startupOn) A.startupOn = new Set(items.filter(i => i.defaultOn).map(i => i.name))
      return `<div class="ao-sub-list">${items.map(i => `<label><input type="checkbox" data-startup="${esc(i.name)}" ${A.startupOn.has(i.name) ? 'checked' : ''}> ${esc(i.name)} <span class="ao-count">${esc(g('cat_' + i.category))}</span></label>`).join('')}</div>`
    }
    if (f.id === 'hibernate') return `<div class="ao-sub-list"><label><input type="checkbox" data-answer="useHibernate" ${A.answers.useHibernate ? 'checked' : ''}> ${esc(g('keepHibernate'))}</label></div>`
    if (f.id === 'display-refresh' && f.detail) return `<div class="ao-sub-list">${f.detail.targets.map(t => `<span>${esc(t.monitor || t.device)}: ${esc(t.from)} → ${esc(t.hz)} Hz</span>`).join('')}</div>`
    return ''
  }

  function planBody() {
    const views = moduleViews(A.findings, A.on)
    const p = A.plan
    return `${views.map(m => `<div class="ao-mod" data-mod="${m.id}" data-on="${m.on}" data-open="${A.expanded.has(m.id)}">
        <div class="ao-mod-h" data-toggle-open="${m.id}"><label class="j-switch" data-stop="1"><input type="checkbox" data-mod-on="${m.id}" ${m.on ? 'checked' : ''} aria-label="${esc(g('mod_' + m.id))}"><span class="j-switch-track"></span></label>
          <b>${esc(g('mod_' + m.id))}</b><span class="ao-count">${m.onCount}/${m.total}</span><i class="fa fa-chevron-right ao-chev"></i></div>
        ${A.expanded.has(m.id) ? `<div class="ao-mod-items">${m.items.map(f => `<div class="ao-item"><input type="checkbox" id="ao-i-${f.id}" data-find="${f.id}" ${f.on ? 'checked' : ''}>
          <div><label for="ao-i-${f.id}" class="ao-item-t">${esc(g(f.titleKey, f.vars || {}))}</label><div class="ao-item-s">${esc(g(f.whyKey, f.vars || {}))}</div>${f.intensity === 'max' ? riskBlock(f) : ''}${f.on || f.id === 'hibernate' ? itemSub(f) : ''}
            ${f.undoable === false ? `<div class="ao-item-s">${esc(g('notUndoable'))}</div>` : ''}</div>${impactBadge(f)}</div>`).join('')}</div>` : ''}</div>`).join('')}
      ${expertHtml()}
      <div class="ao-summary"><span>${esc(g('sumSteps'))} <b>${p ? p.steps.length : 0}</b></span><span>${esc(g('sumTime'))} <b>${p ? fmtDuration(p.estSeconds) : '–'}</b></span>
        <span>${esc(g('sumReboot'))} <b>${esc(g(p && p.rebootRequired ? 'yes' : 'no'))}</b></span></div>`
  }

  async function showPlan() {
    setScene('plan'); A.reactor.phase('plan'); A.reactor.level(.7)
    await refreshPlan(); if (!A || A.scene !== 'plan') return
    renderPlan()
  }

  function renderPlan() {
    const p = A.plan, steps = p ? p.steps.length : 0
    const modsInPlan = p ? p.modules.map(m => m.id) : []
    MODULE_ORDER.forEach(m => A.reactor.module(m, modsInPlan.includes(m) ? 'planned' : 'idle'))
    A.reactor.center(String(steps), g('stepsLabel'))
    live(g('planLive'), g('planLiveSub'))
    const r = right(`<div class="ao-scene ao-enter">
      <div><div class="ao-eyebrow">${esc(g('trail_plan'))}</div><h1 class="ao-title">${esc(g('planTitle'))}</h1></div>
      <p class="ao-lead">${esc(g('planLead'))}</p>
      ${modeSwitchHtml()}
      <div class="ao-tiles" role="radiogroup" aria-label="${esc(g('goalLabel'))}">${USE.map(([id, k]) => `<button type="button" class="ao-tile" role="radio" aria-checked="${A.useCase === id}" data-use="${id}"><b>${esc(g(k))}</b><span>${esc(g(k + 'S'))}</span></button>`).join('')}</div>
      <div class="ao-mods" id="ao-mods">${planBody()}</div>
      <div class="ao-note"><i class="fa fa-life-ring"></i><span>${esc(g('safetyNote'))}</span></div>
      <div class="ao-actions"><button class="j-btn j-btn-ghost" id="ao-back"><i class="fa fa-arrow-left"></i> ${esc(g('back'))}</button><span class="ao-spacer"></span>
        <button class="j-btn j-btn-primary" id="ao-go" ${steps ? '' : 'disabled'}><i class="fa fa-bolt"></i> ${esc(g('go', { n: steps }))}</button></div></div>`)
    wirePlan(r)
    const go = r.querySelector('#ao-go'); if (!go.disabled) go.focus()
  }

  function wirePlan(r) {
    r.querySelector('#ao-back').onclick = () => showDiagnosis()
    r.querySelector('#ao-go').onclick = () => startRun()
    r.querySelectorAll('[data-intensity]').forEach(b => { b.onclick = () => setIntensity(b.dataset.intensity) })
    r.querySelectorAll('.ao-tile[data-use]').forEach(b => { b.onclick = async () => {
      if (A.useCase === b.dataset.use) return
      A.useCase = b.dataset.use; A.expertOk.clear()   // a typed confirmation belongs to the plan it was given for
      const s = root.settings; if (s) { s.aom_use_case = A.useCase; try { root.api.saveSettings(s) } catch {} }
      const res = await root.api.aoPlan(planReq(false))
      if (!A || !res || !res.ok) return
      A.findings = res.findings; A.on = initialOn(A.findings); A.startupOn = null; A.modsOff = {}
      await refreshPlan(); if (A && A.scene === 'plan') renderPlan()
    } })
    const redraw = async () => { await refreshPlan(); if (!A || A.scene !== 'plan') return; const m = $('#ao-mods'); if (m) m.innerHTML = planBody(); wireMods(); renderCounts() }
    const renderCounts = () => { const p = A.plan; A.reactor.center(String(p ? p.steps.length : 0), g('stepsLabel')); const go = $('#ao-go'); if (go) { go.disabled = !(p && p.steps.length); go.innerHTML = `<i class="fa fa-bolt"></i> ${esc(g('go', { n: p ? p.steps.length : 0 }))}` }
      const modsInPlan = p ? p.modules.map(m => m.id) : []; MODULE_ORDER.forEach(m => A.reactor.module(m, modsInPlan.includes(m) ? 'planned' : 'idle')) }
    const wireMods = () => {
      const box = $('#ao-mods'); if (!box) return
      box.querySelectorAll('[data-toggle-open]').forEach(h => { h.onclick = e => {
        if (e.target.closest('[data-stop]')) return
        const id = h.dataset.toggleOpen; A.expanded.has(id) ? A.expanded.delete(id) : A.expanded.add(id)
        const m = $('#ao-mods'); m.innerHTML = planBody(); wireMods()
      } })
      box.querySelectorAll('[data-mod-on]').forEach(c => { c.onchange = () => { for (const f of A.findings) if (f.kind === 'fix' && f.module === c.dataset.modOn && !(f.risk >= 3)) A.on.set(f.id, c.checked); redraw() } })
      box.querySelectorAll('[data-find]').forEach(c => { c.onchange = () => { A.on.set(c.dataset.find, c.checked); redraw() } })
      box.querySelectorAll('[data-expert]').forEach(c => { c.onchange = async () => {
        const f = A.findings.find(x => x.id === c.dataset.expert); if (!f) return
        if (c.checked) {
          const ok = await root.confirmTier(f.steps[0].id)   // the same typed confirmation the manual tabs use
          if (!A) return
          if (!ok) { c.checked = false; return }
          A.expertOk.add(f.id); A.on.set(f.id, true)
        } else { A.expertOk.delete(f.id); A.on.set(f.id, false) }
        redraw()
      } })
      box.querySelectorAll('[data-startup]').forEach(c => { c.onchange = () => { c.checked ? A.startupOn.add(c.dataset.startup) : A.startupOn.delete(c.dataset.startup); redraw() } })
      box.querySelectorAll('[data-answer]').forEach(c => { c.onchange = async () => {
        A.answers[c.dataset.answer] = c.checked
        const res = await root.api.aoPlan(planReq(false))
        if (!A || !res || !res.ok) return
        A.findings = res.findings; A.on = initialOn(A.findings); redraw()
      } })
    }
    wireMods()
  }

  // ── scene 4: run ──
  const stepTitle = (stepId, plan) => {
    const s = plan.steps.find(x => x.stepId === stepId); if (!s) return stepId
    const f = A.findings.find(x => x.id === s.findingId)
    return f ? g(f.titleKey, f.vars || {}) : (s.tweakId || s.control)
  }

  function laneHtml(m) {
    const steps = A.plan.steps.filter(s => s.module === m.id)
    return `<div class="ao-lane" data-lane="${m.id}" data-state="${m.state}"><div class="ao-lane-h"><span>${esc(g('mod_' + m.id))}</span><span class="ao-count" data-lane-count="${m.id}">${m.done}/${m.total}</span></div>
      ${steps.map(s => `<div class="ao-step" data-step="${esc(s.stepId)}" data-status="pending"><span class="ao-st"></span><span>${esc(stepTitle(s.stepId, A.plan))}</span><div class="ao-chgs"></div></div>`).join('')}</div>`
  }

  function counterHtml(key, label) { return `<div class="ao-counter"><div class="ao-counter-n" data-counter="${key}">0</div><div class="ao-counter-l">${esc(label)}</div></div>` }
  function setCounters(c) {
    const set = (k, text) => { const el = $(`[data-counter="${k}"]`); if (!el) return; if (el.textContent !== text) el.textContent = text }
    set('settingsChanged', String(c.settingsChanged || 0)); set('startupRemoved', String(c.startupRemoved || 0)); set('tasksDisabled', String(c.tasksDisabled || 0)); set('bytesReclaimed', fmtBytes(c.bytesReclaimed || 0))
  }

  async function startRun() {
    if (A.busy) return
    A.busy = true
    const token = ++A.token
    const run = A.run = newRun(A.plan)
    setScene('run'); A.reactor.phase('run'); A.reactor.level(.2); A.reactor.allModules('idle', A.plan.modules.map(m => m.id))
    A.plan.modules.forEach(m => A.reactor.module(m.id, 'planned'))
    A.reactor.center('0%', g('progressLabel')); A.reactor.scanning(false)
    live(g('runMeasure'), g('runMeasureSub'))
    right(`<div class="ao-scene"><div><div class="ao-eyebrow">${esc(g('trail_run'))}</div><h1 class="ao-title">${esc(g('runTitle'))}</h1></div>
      <div class="ao-counters">${counterHtml('settingsChanged', g('cSettings'))}${counterHtml('startupRemoved', g('cStartup'))}${counterHtml('tasksDisabled', g('cTasks'))}${counterHtml('bytesReclaimed', g('cBytes'))}</div>
      <div class="ao-lanes" id="ao-lanes">${[...run.modules.values()].map(laneHtml).join('')}</div>
      <div class="ao-actions"><span class="ao-spacer ao-muted" id="ao-run-note">${esc(g('runNote'))}</span><button class="j-btn j-btn-ghost" id="ao-stop">${esc(g('stopAfter'))}</button></div></div>`)
    $('#ao-stop').onclick = () => { root.api.aoStop(); const b = $('#ao-stop'); b.disabled = true; b.textContent = g('stopping') }
    const off = root.api.onAoEvent(ev => { if (A && token === A.token) onRunEvent(ev) })
    A.unsub.push(off)
    const req = { expertOk: [...A.expertOk], intensity: A.intensity, scanId: A.scanId, useCase: A.useCase, answers: A.answers, ...selection(A.findings, A.on), modules: A.modsOff, startupItems: A.startupOn ? [...A.startupOn] : undefined }
    const res = await root.api.aoRun(req).catch(e => ({ ok: false, aborted: true, reason: 'generic', error: String(e) }))
    try { off() } catch {}
    A.busy = false
    if (!A || token !== A.token) return
    A.result = res
    try { root.updateAomNavBadges && root.updateAomNavBadges((res.results || []).filter(r => r.status === 'ok').map(r => (A.plan.steps.find(x => x.stepId === r.stepId) || {}).tweakId).filter(Boolean)) } catch {}
    if (!res || res.aborted || (res.ok === false && !res.results)) { A.run = null; setScene('plan'); return showError(res && res.reason === 'restore-point-failed' ? 'rRestore' : res && res.reason, null) }
    await sleep(700 * scale())
    if (A && token === A.token) showResult()
  }

  function onRunEvent(ev) {
    const run = A.run; applyEvent(run, ev)
    const r = A.reactor
    switch (ev.phase) {
      case 'measure': live(g('runMeasure'), g('runMeasureSub')); r.center('0%', g('progressLabel')); break
      case 'restore-point': live(ev.state === 'done' ? g('runStart') : g('runRestore'), g(ev.state === 'done' ? 'runStartSub' : 'runRestoreSub')); if (ev.state === 'done') r.pulse(); break
      case 'module-start': r.module(ev.module, 'running'); { const l = $(`[data-lane="${ev.module}"]`); if (l) l.dataset.state = 'running' } break
      case 'module-done': r.module(ev.module, 'done'); { const l = $(`[data-lane="${ev.module}"]`); if (l) l.dataset.state = 'done' } break
      case 'step-start': { const el = $(`[data-step="${CSS.escape(ev.stepId)}"]`); if (el) { el.dataset.status = 'running'; el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }
        live(stepTitle(ev.stepId, A.plan), g('mod_' + ev.module)); break }
      case 'step-done': {
        const el = $(`[data-step="${CSS.escape(ev.stepId)}"]`)
        if (el) {
          el.dataset.status = ev.status
          const st = el.querySelector('.ao-st'); st.textContent = ev.status === 'ok' || ev.status === 'already' ? '✓' : ev.status === 'failed' ? '✕' : ev.status === 'partial' || ev.status === 'reverted' ? '!' : ''
          el.querySelector('.ao-chgs').innerHTML = (ev.status === 'already' ? `<div class="ao-chg"><span class="k">${esc(g('alreadyDone'))}</span></div>` : '') +
            (ev.status === 'reverted' ? `<div class="ao-chg"><span class="k">${esc(g('revertedNote'))}</span></div>` : '') +
            (ev.changes || []).slice(0, 8).map(c => `<div class="ao-chg"><span class="k">${esc(chgLabel(c))}</span><span class="v from">${value(c.before, c.unit)}</span><span>→</span><span class="v to">${value(c.after, c.unit)}</span></div>`).join('') +
            (ev.error ? `<div class="ao-err">${esc(ev.error)}</div>` : '')
        }
        const lc = $(`[data-lane-count="${ev.module}"]`); const m = run.modules.get(ev.module); if (lc && m) lc.textContent = `${m.done}/${m.total}`
        if (ev.status === 'ok') play('apply'); r.pulse()
        break }
      case 'counter': break
      case 'confirm-request': showConfirm(ev); break
      case 'shield-verified': break
      case 'done': r.phase('done'); break
    }
    if (ev.counters) setCounters(run.counters)
    const p = progress(run)
    r.level(.2 + .8 * p); if (ev.phase !== 'done') r.center(Math.round(p * 100) + '%', g('progressLabel'))
    else { r.center('✓', g('doneLabel')); live(g('runDone'), '') }
  }

  function chgLabel(c) {
    const base = c.labelKey ? gx('chg_' + c.labelKey, c.label || c.labelKey) : (c.label || '')
    if (c.label && ['startupItem', 'task', 'service'].includes(c.labelKey)) return `${base}: ${c.label}`
    return c.labelKey === 'refreshRate' || !c.labelKey ? (c.labelKey === 'refreshRate' ? base : c.label) : base
  }

  function showConfirm(ev) {
    const b = $('.ao-body'); if (!b || $('.ao-sheet')) return
    const ms = Math.max(1000, ev.deadline - Date.now())
    const sheet = document.createElement('div')
    sheet.className = 'ao-sheet'
    sheet.innerHTML = `<div class="ao-sheet-card" role="alertdialog" aria-labelledby="ao-cf-t"><div class="ao-count-ring" style="--ao-dur:${ms}ms"><svg viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="46"/><circle class="fg" cx="50" cy="50" r="46"/></svg><span id="ao-cf-n">${Math.ceil(ms / 1000)}</span></div>
      <h2 id="ao-cf-t" class="ao-live-t">${esc(g('cfTitle', { from: ev.from, to: ev.to }))}</h2><p class="ao-muted">${esc(g('cfBody', { from: ev.from, to: ev.to }))}</p>
      <div class="ao-actions is-static"><button class="j-btn j-btn-ghost" id="ao-cf-no">${esc(g('cfRevert'))}</button><button class="j-btn j-btn-primary" id="ao-cf-yes">${esc(g('cfKeep', { to: ev.to }))}</button></div></div>`
    b.appendChild(sheet)
    const n = sheet.querySelector('#ao-cf-n')
    const tick = setInterval(() => { const left = Math.max(0, Math.ceil((ev.deadline - Date.now()) / 1000)); n.textContent = left; if (!document.body.contains(sheet)) clearInterval(tick) }, 250)
    const answer = keep => { clearInterval(tick); root.api.aoConfirm({ stepId: ev.stepId, keep }); sheet.remove() }
    sheet.querySelector('#ao-cf-yes').onclick = () => answer(true)
    sheet.querySelector('#ao-cf-no').onclick = () => answer(false)
    sheet.querySelector('#ao-cf-yes').focus()
    const poll = setInterval(() => { if (!A || !A.run || !A.run.confirm) { clearInterval(poll); clearInterval(tick); sheet.remove() } }, 400)
  }

  // ── scene 5: result ──
  function rowHtml(r) {
    const label = r.key === 'refresh' ? g('rowRefresh', { monitor: r.label || '' }) : g('row_' + r.key)
    const fmt = v => (r.unit === 'GB' ? `${v} GB` : r.unit ? `${v} ${r.unit}` : String(v))
    return `<tr><td>${esc(label)}</td><td class="n">${esc(fmt(r.before))}</td><td class="n ${r.better}">${esc(fmt(r.after))}</td></tr>`
  }
  function recapRows(res) {
    const c = res.counters || {}, out = []
    if (c.bytesReclaimed) out.push(['rowBytes', fmtBytes(c.bytesReclaimed)])
    if (c.startupRemoved) out.push(['rowStartup', String(c.startupRemoved)])
    if (c.tasksDisabled) out.push(['rowTasks', String(c.tasksDisabled)])
    out.push(['rowSettings', String(c.settingsChanged || 0)])
    return out
  }

  function showResult() {
    const res = A.result; setScene('result')
    A.reactor.phase('done'); A.reactor.level(1); A.reactor.center('✓', g('doneLabel')); A.reactor.allModules('done', (A.plan.modules || []).map(m => m.id))
    const rs = res.results || []
    const ok = rs.filter(r => r.status === 'ok' || r.status === 'already').length, bad = rs.filter(r => r.status === 'failed' || r.status === 'partial')
    const needs = (res.needsYou || []).map(id => A.findings.find(f => f.id === id)).filter(Boolean)
    live(g('resLive', { n: ok }), res.rebootRequired ? g('resLiveReboot') : '')
    play('apply')
    const r = right(`<div class="ao-scene ao-enter">
      <div><div class="ao-eyebrow">${esc(g('trail_result'))}</div><h1 class="ao-title">${esc(g('resTitle', { n: ok }))}</h1></div>
      <p class="ao-lead">${esc(res.rebootRequired ? g('resLeadReboot') : g('resLead'))}</p>
      <div class="ao-counters">${recapRows(res).map(([k, v]) => `<div class="ao-counter"><div class="ao-counter-n">${esc(v)}</div><div class="ao-counter-l">${esc(g(k))}</div></div>`).join('')}</div>
      ${(res.rows || []).length ? `<h2 class="ao-h2">${esc(g('beforeAfter'))}</h2><table class="ao-table"><thead><tr><th>${esc(g('metric'))}</th><th>${esc(g('before'))}</th><th>${esc(g('after'))}</th></tr></thead><tbody>${res.rows.map(rowHtml).join('')}</tbody></table>
        <div class="ao-muted">${esc(g('afterRestartNote'))}</div>` : ''}
      ${res.shield && res.shield.checked ? `<div class="ao-shield"><div class="ao-shield-t"><i class="fa fa-shield-halved"></i>${esc(res.shield.ok ? g('shieldOk') : g('shieldChanged'))}</div></div>` : ''}
      ${bad.length ? `<h2 class="ao-h2">${esc(g('didntApply'))} <b>${bad.length}</b></h2>${bad.map(b => `<article class="ao-find"><div class="ao-find-t">${esc(stepTitle(b.stepId, A.plan))}</div><div class="ao-find-w">${esc(b.error || g('rGeneric'))}</div></article>`).join('')}` : ''}
      ${needs.length ? `<h2 class="ao-h2">${esc(g('needsYou'))} <b>${needs.length}</b></h2><div class="ao-cols">${needs.map(findCard).join('')}</div>` : ''}
      <div class="ao-actions">${res.batchId ? `<button class="j-btn j-btn-ghost" id="ao-undo">${esc(g('undo'))}</button><button class="j-btn j-btn-ghost" id="ao-history">${esc(g('history'))}</button>` : ''}<span class="ao-spacer"></span>
        <button class="j-btn j-btn-ghost" id="ao-later">${esc(res.rebootRequired || ok ? g('later') : g('done'))}</button>
        ${ok ? `<button class="j-btn j-btn-primary ao-restart" id="ao-restart"><i class="fa fa-power-off"></i> ${esc(g('restartNow'))}</button>` : ''}</div></div>`)
    r.querySelectorAll('[data-link]').forEach(b => { b.onclick = () => root.api.openExternal(b.dataset.link) })
    r.querySelector('#ao-later').onclick = () => close(true)
    const rb = r.querySelector('#ao-restart'); if (rb) { rb.onclick = () => confirmRestart(); rb.focus() }
    const hb = r.querySelector('#ao-history'); if (hb) hb.onclick = () => { close(true); try { root.showPage('changelog') } catch {} }
    const ub = r.querySelector('#ao-undo'); if (ub) ub.onclick = () => undoRun(res.batchId, false)
  }

  async function confirmRestart() {
    const ok = await root.showConfirm({ title: g('rsTitle'), body: g('rsBody'), okText: g('restartNow'), okStyle: 'warning', icon: 'fa-power-off' })
    if (ok) { await root.api.reboot() }
  }

  async function undoRun(batchId, force) {
    if (A.undoBusy) return
    const ok = await root.showConfirm({ title: g('undoTitle'), body: g('undoBody'), okText: g('undo'), okStyle: 'warning', icon: 'fa-rotate-left' })
    if (!ok) return
    A.undoBusy = true
    const res = await root.api.aoUndo({ batchId, force: !!force }).catch(e => ({ ok: false, error: String(e) }))
    A.undoBusy = false
    if (res && res.ok) { root.toast(g('undoneT'), g('undoneM'), 'ok'); try { root.settings = await root.api.loadSettings() } catch {} close(true); return }
    if (res && res.conflicts && res.conflicts.length && !force) {
      const f = await root.showConfirm({ title: g('undoConflictT'), body: g('undoConflictB', { n: res.conflicts.length }), okText: g('undoForce'), okStyle: 'warning', icon: 'fa-triangle-exclamation' })
      if (f) { A.undoBusy = false; return undoRunForce(batchId) }
      return
    }
    root.toast(g('undoFailT'), (res && res.error) || g('rGeneric'), 'err')
  }
  async function undoRunForce(batchId) {
    A.undoBusy = true
    const res = await root.api.aoUndo({ batchId, force: true }).catch(e => ({ ok: false, error: String(e) }))
    A.undoBusy = false
    if (res && res.ok) { root.toast(g('undoneT'), g('undoneM'), 'ok'); close(true) } else root.toast(g('undoFailT'), (res && res.error) || g('rGeneric'), 'err')
  }

  // ── scene 6: welcome back (after the restart) ──
  async function welcomeBack() {
    if (state.active) return
    const s = root.settings
    if (!s || !s.aom_pending_verify) return
    const v = await root.api.aoVerify().catch(() => null)
    if (!v || !v.pending) return
    if (!v.rebooted) {
      if (v.ageMs > 24 * 3600 * 1000) { root.api.aoDismissVerify(); return }
      if (v.rebootRequired && root.toast) root.toast(g('nudgeT'), g('nudgeM'), 'info', 9000)
      return
    }
    state.active = true; A = fresh(); A.verify = v
    const el = rootEl(); el.style.display = 'flex'; build(); void el.offsetWidth; el.classList.add('open')
    A.keydown = e => onKey(e); document.addEventListener('keydown', A.keydown, true)
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'ao-title')
    A.prevFocus = document.activeElement
    renderWelcome(v)
    if (v.boot && v.boot.waiting) pollBoot()
  }

  function bootHtml(b) {
    if (!b) return ''
    if (b.waiting) return `<div class="ao-find"><div class="ao-find-t">${esc(g('bootTitle'))}</div><div class="ao-find-w">${esc(g('bootWaiting'))}</div></div>`
    if (b.unavailable) return `<div class="ao-find"><div class="ao-find-t">${esc(g('bootTitle'))}</div><div class="ao-find-w">${esc(g('bootUnavailable'))}</div></div>`
    const s = ms => (ms / 1000).toFixed(1) + ' s'
    return `<div class="ao-find"><div class="ao-find-t">${esc(g('bootTitle'))}</div>
      <div class="ao-boot">${b.beforeMs ? `<span class="from">${s(b.beforeMs)}</span><span>→</span>` : ''}<span class="to">${s(b.afterMs)}</span>${b.deltaMs != null ? `<small>${esc(g(b.deltaMs <= 0 ? 'bootFaster' : 'bootSlower', { s: (Math.abs(b.deltaMs) / 1000).toFixed(1) }))}</small>` : ''}</div></div>`
  }

  function renderWelcome(v) {
    setScene('welcome'); const p = v.persisted || { total: 0, same: 0, drifted: [] }
    A.reactor.phase('done'); A.reactor.level(1); A.reactor.center(`${p.same}/${p.total}`, g('stillLabel')); A.reactor.allModules('done'); A.reactor.scanning(false)
    live(g('wbLive'), '')
    const r = right(`<div class="ao-scene ao-enter">
      <div><div class="ao-eyebrow">${esc(g('wbEyebrow'))}</div><h1 class="ao-title">${esc(p.drifted.length ? g('wbTitleDrift') : g('wbTitle'))}</h1></div>
      <p class="ao-lead">${esc(g('wbLead', { same: p.same, total: p.total }))}</p>
      ${bootHtml(v.boot)}
      ${(v.rows || []).length ? `<h2 class="ao-h2">${esc(g('beforeAfter'))}</h2><table class="ao-table"><thead><tr><th>${esc(g('metric'))}</th><th>${esc(g('before'))}</th><th>${esc(g('after'))}</th></tr></thead><tbody>${v.rows.map(rowHtml).join('')}</tbody></table>` : ''}
      ${p.drifted.length ? `<h2 class="ao-h2">${esc(g('drifted'))} <b>${p.drifted.length}</b></h2>${p.drifted.map(d => `<article class="ao-find"><div class="ao-find-t">${esc(d.label || d.tweakId || d.control || '')}</div><div class="ao-find-w">${esc((d.items || []).join(', '))}</div></article>`).join('')}<div class="ao-muted">${esc(g('driftHint'))}</div>` : ''}
      <div class="ao-actions">${p.drifted.length ? `<button class="j-btn j-btn-ghost" id="ao-again">${esc(g('runAgain'))}</button>` : ''}<span class="ao-spacer"></span><button class="j-btn j-btn-primary" id="ao-wb-done">${esc(g('done'))}</button></div></div>`)
    r.querySelector('#ao-wb-done').onclick = async () => { await root.api.aoDismissVerify(); try { delete root.settings.aom_pending_verify } catch {} close(true) }
    const again = r.querySelector('#ao-again'); if (again) again.onclick = async () => { await root.api.aoDismissVerify(); try { delete root.settings.aom_pending_verify } catch {} close(true); setTimeout(() => open(), 300) }
    r.querySelector('#ao-wb-done').focus()
  }

  async function pollBoot() {
    for (let i = 0; i < 20 && A && A.scene === 'welcome'; i++) {
      await sleep(30000)
      if (!A || A.scene !== 'welcome') return
      const v = await root.api.aoVerify().catch(() => null)
      if (v && v.boot && !v.boot.waiting) { A.verify = v; renderWelcome(v); return }
    }
  }

  root.JylliAutoOpti = Object.assign({ open, close, welcomeBack, get active() { return state.active } }, pure)
  root.runAutoOpti = (o) => open(o)
})(typeof window !== 'undefined' ? window : globalThis)
