'use strict'
// Home "Helm": mounted by buildDashboard (js/pages/home.js). One snapshot (home2-snapshot: Jylli Index, facts, Proof Ledger) drives the hero,
// the Next Best Move and the ledger. The Timeline loads on its own (telemetry backfill, 7-day history, journal) so nothing waits for the
// slowest source. Remembered state paints first (home2-cached) and is verified in place. Copy: LANG group `home2` (js/lang/home-*.js).
;(function (root) {
  if (typeof document === 'undefined') return
  const V = root.JylliHomeViews, P = root.JylliHomePure, TR = root.JylliHomeTrace, PR = root.JylliHomeProcesses
  const { esc, ic } = V
  const T = (k, v) => tG('home2', k, v)
  const A = () => root.api
  const DAY = 86400000
  const RING_MS = 610000
  const reduced = () => document.documentElement.classList.contains('motion-reduced') || document.body.classList.contains('motion-reduced') || (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v } catch { return d } },
    set(k, v) { try { localStorage.setItem(k, v) } catch { /* private window */ } },
  }
  // legend labels per telemetry key (the unit comes from js/telemetry.js)
  const LABEL = { 'cpu.load': 'trLoad', 'cpu.temp.package': 'trTemp', 'cpu.power': 'trPower', 'gpu0.load': 'trLoad', 'gpu0.temp.core': 'trTemp', 'gpu0.vram.pct': 'trVram', 'gpu0.power': 'trPower',
    'gpu0.clock.core': 'trClock', 'ram.load': 'trLoad', 'ram.used': 'trUsed', 'ram.total': 'trTotal', 'disk.load': 'trActive', 'disk0.temp': 'trDriveTemp', 'disk.read': 'trRead', 'disk.write': 'trWrite', 'net.rx': 'trRx', 'net.tx': 'trTx' }

  let current = null
  function mount(c) {
    const S = { snap: null, remembered: false, ai: [], entries: [], samples: [], strip: null, disposed: false, off: [], timers: [], busy: null, whyOpen: false, shownScore: null,
      tab: store.get('hm_tl_tab', 'cpu'), win: store.get('hm_tl_win', '10m'), rings: {}, events: [], lastSpike: {}, base: {}, hover: null, view: null, narr: { at: 0, key: '' } }
    if (!TR.TABS[S.tab]) S.tab = 'cpu'
    if (!TR.WINDOWS[S.win]) S.win = '10m'
    if (S.win === '7d' && !TR.TABS[S.tab].history) S.tab = 'cpu'
    for (const k of TR.allKeys()) S.rings[k] = []
    const si = (typeof sysInfo !== 'undefined' && sysInfo) || {}   // a global let in index.html, so not on window
    const el = document.createElement('div')
    el.className = 'jk hm'
    el.id = 'home-root'
    const wn = root._whatsNew && root._whatsNew[0]
    const wnKey = wn ? 'wn_dismissed_' + String(wn.version).replace(/[^\w.-]/g, '') : null
    const showWn = !!(wn && !store.get(wnKey, ''))

    el.innerHTML = `
      <section class="hm-hero" id="db-hero" data-tone="idle" data-verify="1">
        <div class="j-twin-stage hm-stage" id="home-twin-stage" data-tour="home-rig">
          <div class="j-twin-slot" id="home-twin-slot" data-twin-view="rig:home"></div>
          <div class="j-twin-hint" id="twin-hint">${tUI('twinHint')}</div>
          <div class="j-twin-inspector" id="twin-inspector" role="region" aria-label="${esc(tUI('twinInspector'))}" aria-live="polite" hidden></div>
          <ul class="j-twin-parts" id="twin-parts" aria-label="${esc(tUI('twinPartsList'))}"></ul>
          <div class="hm-cap" id="db-identity-card"></div>
          <div class="hm-pop hm-pop-cap" id="hm-notes" role="region" aria-label="${esc(T('notesTitle'))}" hidden></div>
        </div>
        <div class="hm-core">
          <div class="hm-dialrow">
            <div class="hm-dial" data-tour="home-ring" role="img" aria-label="${esc(T('dialAria'))}">${V.dialSvg()}
              <div class="hm-dial-c"><span class="hm-score hm-num" id="hm-score">–</span><small>/100</small></div></div>
            <ul class="hm-pillars" id="hm-pillars"></ul>
          </div>
          <div class="hm-verdict">
            <div class="hm-eyebrow"><span class="hm-dot"></span><span id="hm-eyebrow">${esc(T('verifying'))}</span></div>
            <h2 id="hm-verdict">${esc(T('verdictLoading'))}</h2>
            <p id="hm-lead"></p>
            <div class="hm-meta" id="hm-meta"></div>
            ${showWn ? `<button type="button" class="hm-chip hm-wn" id="db-changelog-feed" data-act="wn" aria-expanded="false" aria-controls="hm-wn-pop">${ic('wand-magic-sparkles')} ${esc(T('whatsNewChip', { v: wn.version }))}</button>
            <div class="hm-pop" id="hm-wn-pop" role="region" aria-label="${esc(T('whatsNewTitle', { v: wn.version }))}" hidden>
              <h4>${esc(T('whatsNewTitle', { v: wn.version }))}</h4>
              <ul>${wn.items.slice(0, 6).map(i => `<li>${esc(String(i).replace(/^[A-Za-zÄÖäö]+ — /, ''))}</li>`).join('')}</ul>
              <button type="button" class="j-btn j-btn-sm" data-act="wn-close">${esc(T('dismiss'))}</button></div>` : ''}
          </div>
          <div class="hm-move" id="hm-move" data-tour="home-moves" aria-live="polite"></div>
          <ul class="hm-next" id="hm-next" aria-label="${esc(T('upNext'))}"></ul>
        </div>
      </section>
      <section class="hm-why" id="hm-why" hidden aria-label="${esc(T('whyTitle'))}"></section>
      <section class="hm-sec hm-tlc" id="panel-util" aria-label="${esc(T('trTitle'))}">
        <header class="hm-sec-h"><div><h3>${esc(T('trTitle'))}</h3><p>${esc(T('trLead'))}</p></div></header>
        ${V.timelineHead(T)}
        <div class="hm-lgs" id="hm-tl-lg"></div>
        <div class="hm-tl" id="hm-tl"></div>
        <p class="hm-tl-n" id="hm-tl-n" aria-live="polite"></p>
        <div class="hm-rw-d" id="hm-tl-d"></div>
      </section>
      <section class="hm-sec hm-ledger" id="hm-ledger-s"><header class="hm-sec-h"><div><h3>${esc(T('proofTitle'))}</h3><p>${esc(T('proofLead'))}</p></div></header><div id="hm-ledger"></div></section>
      <div class="hm-games-row" id="hm-games-row"><div id="hm-games"></div><div id="hm-last" class="hm-last" hidden></div></div>
      <section class="aria-panel j-card" style="display:none" id="db-aria-panel">
        <div class="j-card-head"><div><h3 class="j-card-title">${tUI('ariaTitle')} <span class="aria-pulse" id="aria-pulse-dot"></span></h3><p class="j-card-sub">${tUI('ariaSubtitle')}</p></div></div>
        <div class="j-card-body">
          <div id="aria-fps-counter" class="j-stack" style="display:none">
            <div class="j-home-fps-row">${[['ariaAvgFps', 'aria-fps-avg', 'ok'], ['ariaLow1Fps', 'aria-fps-low1', 'warn'], ['ariaFpsStab', 'aria-fps-stab', 'info']].map(([k, id, tn]) => `<div class="j-stat j-home-fps"><div class="j-stat-label">${tUI(k)}</div><div class="j-stat-value j-stat-${tn}" id="${id}">—</div></div>`).join('')}</div>
            <canvas id="aria-fps-sparkline" class="j-home-fps-spark" width="300" height="28"></canvas>
          </div>
          <div id="aria-anomaly-feed" class="j-home-feed-scroll"></div>
          <div id="aria-session-summary" class="j-callout j-callout-info" style="display:none"><div class="j-grow">
            <div class="j-hstack"><b>${tUI('ariaSessionSummaryTitle')}</b>${settings.isPremium ? `<button class="j-btn j-btn-sm" type="button" onclick="ariaShowSessionCoach()">${ic('brain')}${tUI('ariaSessionCoachBtn')}</button>` : ''}</div>
            <div id="aria-session-summary-body" class="j-home-chips"></div></div></div>
          <div class="j-stat-label">${tUI('ariaInsightTitle')}</div><div id="aria-insight-feed" class="j-home-feed-scroll"></div>
          <div id="aria-journal-panel" style="display:none"><div class="j-stat-label">${ic('book-open')} ${tUI('ariaJournalTitle')}</div><div id="aria-journal-entries" class="j-stack"></div></div>
        </div>
      </section>
      <section id="db-frame-session-panel" class="j-card" style="display:none">
        <div class="j-card-head"><h3 class="j-card-title">${ic('chart-line')} ${tUI('dashFrameSession')} <span id="db-frame-session-game" class="j-badge"></span></h3>
          <button class="j-btn j-btn-ghost j-btn-sm j-btn-icon" type="button" aria-label="${esc(tUI('ttDismiss'))}" onclick="document.getElementById('db-frame-session-panel').style.display='none'">${ic('xmark')}</button></div>
        <div class="j-card-body"><div id="db-frame-session-stats" class="j-home-chips"></div><canvas id="db-frame-session-canvas" class="j-home-fps-spark" width="600" height="60"></canvas></div>
      </section>
      <div class="hm-dock-w"><div class="hm-dock" id="quick-actions-row">${V.dock(T, si.isAdmin)}</div><p class="hm-hint">${esc(T('dockLead'))}</p></div>`
    c.appendChild(el)
    const q = s => el.querySelector(s)
    current = null
    const on = (target, ev, fn, o) => { target.addEventListener(ev, fn, o); S.off.push(() => target.removeEventListener(ev, fn, o)) }
    const agoText = a => (a ? T(a.key, { n: a.n }) : '')

    // ── paint: hero ──
    function animateScore(to) {
      const n = q('#hm-score')
      if (!n) return
      if (to == null) { n.textContent = '–'; S.shownScore = null; return }
      const from = S.shownScore == null || reduced() ? to : S.shownScore
      S.shownScore = to
      if (from === to) { n.textContent = String(to); return }
      const t0 = performance.now(), dur = 900
      const step = t => { if (S.disposed) return; const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); n.textContent = String(Math.round(from + (to - from) * e)); if (k < 1) requestAnimationFrame(step) }
      requestAnimationFrame(step)
    }

    function pillarDetail(k, snap) {
      const f = snap.facts, p = snap.index.pillars[k]
      if (p.pct == null) return k === 'tuned' && !f.profiled && (S.profTries || 0) <= 8 ? T('pdWaitProfile') : T('pdNone')
      if (k === 'health') { const a = f.diag ? P.ago(f.diag.takenAt, f.now) : null; return f.diag ? T('pdVitals', { ago: agoText(a) }) : T('pdQuick') }
      if (k === 'tuned') return T('pdTuned', { a: f.tuned.applied, o: f.tuned.open })
      const lvl = f.restore ? f.restore.level : null
      return (lvl ? T('rp_' + lvl) : T('rp_unknown')) + (f.isAdmin === false ? ' · ' + T('noAdmin') : '')
    }

    function paintHero() {
      const snap = S.snap
      if (!snap) return
      const idx = snap.index, f = snap.facts
      const hero = q('#db-hero')
      hero.dataset.tone = idx.tone
      hero.dataset.verify = S.remembered ? '1' : '0'
      const bands = P.dial(idx)
      requestAnimationFrame(() => bands.forEach(b => { const a = q(`.hm-arc[data-pillar="${b.key}"]`); if (a) { a.dataset.tone = b.tone; a.setAttribute('stroke-dasharray', b.dash) } }))
      animateScore(idx.score)
      q('#hm-pillars').innerHTML = V.PILLARS.map(k => V.pillarRow(T, k, idx, pillarDetail(k, snap))).join('')
      q('#hm-verdict').textContent = T(idx.verdictKey)
      const used = idx.used.length
      q('#hm-lead').textContent = idx.score == null ? T('leadNone') : idx.pillars.health.source === 'quick' ? T('leadQuick') : idx.pillars.health.stale ? T('leadStale') : used < 3 ? T('leadPartial', { n: used }) : T('leadFull')
      q('#hm-eyebrow').textContent = S.remembered ? T('verifying') : T('eyebrowLive', { ago: agoText(P.ago(snap.ts, snap.ts)) || T('agoNow') })
      const tr = snap.trend
      const chips = []
      if (tr) chips.push(`<span class="hm-chip" data-trend="${tr.delta > 0 ? 'up' : tr.delta < 0 ? 'down' : 'flat'}">${ic(tr.delta > 0 ? 'arrow-trend-up' : tr.delta < 0 ? 'arrow-trend-down' : 'minus')} ${esc(T(tr.delta > 0 ? 'trendUp' : tr.delta < 0 ? 'trendDown' : 'trendFlat', { n: Math.abs(tr.delta), d: tr.days }))}</span>`)
      if (f.drift) chips.push(`<span class="hm-chip" data-tone="warn">${ic('rotate-left')} ${esc(T('driftChip', { n: f.drift.count }))}</span>`)
      q('#hm-meta').innerHTML = chips.join('')
      root._lastHealthScore = idx.score == null ? 0 : idx.score
      paintNavDot(idx)
      if (S.whyOpen) paintWhy()
    }

    // the sidebar dot the old health ring set: shown while the Index is below 70
    function paintNavDot(idx) {
      const nav = document.querySelector('[data-page="dashboard"]')
      if (!nav) return
      const ex = nav.querySelector('.health-score-badge')
      if (idx.score == null || idx.score >= 70) { if (ex) ex.remove(); return }
      if (!ex) {
        const b = document.createElement('span'); b.className = 'health-score-badge'
        b.style.cssText = 'display:inline-block;width:7px;height:7px;border-radius:50%;margin-left:5px;vertical-align:middle;flex-shrink:0;background:var(--' + (idx.score < 55 ? 'c-danger' : 'c-warning') + ')';
        (nav.querySelector('.nav-label') || nav.querySelector('span'))?.appendChild(b)
      }
    }

    // ── paint: Next Best Move ──
    function movesNow() {
      const f = S.snap && S.snap.facts
      if (!f) return null
      const cg = settings.concierge || {}
      const conc = cg.hidden ? [] : (cg.moves || []).filter(m => !JylliConcierge.isDone(m, settings)).map(m => ({ ...m, kind: 'concierge' }))
      const snooze = settings.homeSnooze || {}, now = Date.now()
      const dismissed = [...(cg.dismissed || []), ...Object.keys(snooze).filter(id => snooze[id] > now)]
      return JylliHomeMoves.rank({ ...f, now, ai: S.ai, concierge: conc, dismissed, done: cg.done || [] })
    }
    const copyOf = m => {
      const c0 = P.moveCopy(m), vars = P.moveVars(m)
      if (!c0.group) return { title: c0.title, why: c0.why }
      return { title: tG(c0.group, c0.titleKey, vars), why: tG(c0.group, c0.whyKey, vars) }
    }
    function paintMoves() {
      const r = movesNow()
      const host = q('#hm-move'), next = q('#hm-next')
      if (!r) { host.innerHTML = ''; next.innerHTML = ''; return }
      S.moves = r
      if (S.justDone) {
        host.innerHTML = `<article class="hm-move-c hm-clear" data-done="1"><div class="hm-eyebrow"><span class="hm-dot" data-tone="ok"></span>${esc(T('moveDoneEyebrow'))}</div><h3 class="hm-move-t">${esc(T('moveDoneTitle'))}</h3></article>`
        S.justDone = null
        S.timers.push(setTimeout(() => { if (!S.disposed) paintMoves() }, 1800))
        next.innerHTML = ''
        return
      }
      if (!r.primary) {
        const last = S.snap.proof && S.snap.proof.lastRunTs ? T('clearLast', { ago: agoText(P.ago(S.snap.proof.lastRunTs, Date.now())) }) : ''
        host.innerHTML = V.allClear(T, last)
        next.innerHTML = ''
        return
      }
      host.innerHTML = V.moveCard(T, r.primary, copyOf(r.primary), S.busy === r.primary.id)
      next.innerHTML = r.next.map(m => V.nextRow(T, m, copyOf(m))).join('')
    }

    // ── Why this number (the Vitals grades live in its Health column: they are what Health is made of) ──
    function paintWhy() {
      const snap = S.snap, why = q('#hm-why')
      if (!snap) return
      const f = snap.facts, idx = snap.index
      const rows = {
        health: { items: [
          { label: T('wyVitals'), value: f.diag ? f.diag.score + ' · ' + agoText(P.ago(f.diag.takenAt, f.now)) : T('notMeasured'), state: f.diag ? 'ok' : 'idle' },
          { label: T('wyQuick'), value: f.legacy ? String(f.legacy.score) : T('notMeasured'), state: f.legacy ? 'ok' : 'idle' },
          { label: T('wyFindings'), value: f.diag ? String((f.diag.stats && f.diag.stats.findings) || 0) : '–', state: f.diag && f.diag.stats && f.diag.stats.urgent ? 'warn' : 'ok' },
        ], extra: f.diag ? V.gradesMini(T, f.diag.grades, T('gradesFrom', { ago: agoText(P.ago(f.diag.takenAt, f.now)) })) : '', action: { act: 'why-checkup', label: T(f.diag ? 'btn_checkupAgain' : 'btn_checkup') } },
        tuned: { items: f.tuned ? [
          { label: T('wyApplied'), value: String(f.tuned.applied), state: 'ok' },
          { label: T('wyOpen'), value: String(f.tuned.open), state: f.tuned.open ? 'warn' : 'ok' },
          { label: T('wyDrifted'), value: f.drift ? String(f.drift.count) : f.tuned.drifted ? String(f.tuned.drifted) : T('wyNotChecked'), state: f.drift && f.drift.count ? 'warn' : 'idle' },
        ] : [{ label: T('wyProfile'), value: T('pdWaitProfile'), state: 'idle' }], action: { act: 'why-drift', label: T('btn_checkDrift') } },
        protected: { items: [
          { label: T('wyRestore'), value: f.restore ? T('rp_' + f.restore.level) + (f.restore.at ? ' · ' + agoText(P.ago(f.restore.at, f.now)) : '') : T('notMeasured'), state: f.restore ? (f.restore.level === 'fresh' ? 'ok' : 'warn') : 'idle' },
          { label: T('wyAdmin'), value: f.isAdmin == null ? T('notMeasured') : T(f.isAdmin ? 'yes' : 'no'), state: f.isAdmin ? 'ok' : f.isAdmin === false ? 'warn' : 'idle' },
        ], action: { act: 'why-rp', label: T('btn_restore') } },
      }
      const tr = snap.trend
      why.innerHTML = V.whyDrawer(T, idx, rows, tr ? T('whyTrend', { n: Math.abs(tr.delta), d: tr.days, dir: T(tr.delta >= 0 ? 'up' : 'down') }) : '')
    }
    function toggleWhy(force, focus) {
      S.whyOpen = force != null ? force : !S.whyOpen
      const why = q('#hm-why')
      why.hidden = !S.whyOpen
      el.querySelectorAll('.hm-pillar').forEach(b => b.setAttribute('aria-expanded', String(S.whyOpen)))
      if (S.whyOpen) { paintWhy(); why.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' }); if (focus) { const t = q('#hm-why-' + focus); if (t) t.dataset.focus = '1' } }
    }

    // ── paint: the caption on the rig (name, parts, uptime, notes), ledger ──
    function notesNow() {
      const w = (k, v) => tG('specWarn', k, v), notes = []
      if (si.ramGB > 0 && si.ramGB < 8) notes.push(['danger', w('ramLow', { n: si.ramGB })])
      else if (si.ramGB > 0 && si.ramGB < 16) notes.push(['warn', w('ramMid', { n: si.ramGB })])
      if (si.isWifi) notes.push(['warn', w('wifi')])
      if (si.isLaptop) notes.push(['warn', w('laptop')])
      if (si.nvme === false) notes.push(['info', w('noNvme')])
      return notes
    }
    function paintCaption() {
      const cpuShort = (si.cpu || '').replace(/\(R\)|\(TM\)|Intel Core |AMD Ryzen /gi, '').replace(/\s+/g, ' ').trim().split('@')[0].trim()
      const gpuShort = (si.gpu || '').replace(/NVIDIA |AMD |GeForce |Radeon /gi, '').trim()
      const rows = [cpuShort && ['fa fa-microchip', cpuShort], gpuShort && ['fa fa-display', gpuShort], si.ramGB && ['fa fa-memory', si.ramGB + ' GB']].filter(Boolean)
      const notes = notesNow()
      const last = S.snap && S.snap.facts.autoOpti.lastAt
      q('#db-identity-card').innerHTML = `<div class="hm-cap-main"><span class="hm-cap-i">${ic(si.isLaptop ? 'laptop' : 'desktop')}</span><b>${esc(si.computerName || T('myPc'))}</b></div>
        <div class="hm-chips">${rows.map(([i, t]) => `<span class="hm-chip"><i class="${i}" aria-hidden="true"></i> ${esc(t)}</span>`).join('')}</div>
        <div class="hm-cap-meta"><span>${esc(T('uptime'))} <b class="hm-num" id="db-identity-uptime">–</b></span><span>${esc(T('lastOpt'))} <b class="hm-num">${last ? esc(agoText(P.ago(last, Date.now()))) : esc(T('never'))}</b></span>
        ${notes.length ? `<button type="button" class="hm-chip" data-act="notes" data-tone="warn" aria-expanded="false" aria-controls="hm-notes">${ic('circle-info')} ${esc(T('notesChip', { n: notes.length }))}</button>` : ''}</div>`
      q('#hm-notes').innerHTML = `<h4>${esc(T('notesTitle'))}</h4><ul>${notes.map(([t, x]) => `<li data-tone="${t}">${ic('circle-info')} <span>${esc(x)}</span></li>`).join('')}</ul>`
    }

    function lastBatchUndoable() {
      const b = S.snap && S.snap.proof && S.snap.proof.lastBatchId
      const id = b || (settings.aom_last_run && settings.aom_last_run.batchId)
      if (!id) return null
      const es = S.entries.filter(e => e.batchId === id)
      return es.length && !es.some(e => e.undoneBy) ? id : null
    }
    function paintLedger() {
      const L = S.snap && S.snap.proof, host = q('#hm-ledger')
      if (!L) { host.innerHTML = ''; return }
      host.innerHTML = L.hasProof ? V.ledger(T, L, Date.now(), !!lastBatchUndoable()) : V.ledgerEmpty(T)
    }

    function paintAll() { paintHero(); paintMoves(); paintCaption(); paintLedger(); syncEvents(); try { JylliTelemetry.applyToDom() } catch {} }

    function paintFail() {
      q('#db-hero').dataset.verify = '0'
      q('#hm-eyebrow').textContent = T('failEyebrow')
      q('#hm-verdict').textContent = T('verdictFail')
      q('#hm-lead').textContent = T('failLead')
      q('#hm-move').innerHTML = `<article class="hm-move-c hm-clear"><div class="hm-move-a"><button type="button" class="j-btn j-btn-primary" data-act="retry">${ic('rotate-right')}<span>${esc(T('retry'))}</span></button></div></article>`
    }

    // ── data ──
    let refreshing = false, again = false
    async function refresh() {
      if (refreshing) { again = true; return }
      refreshing = true
      try {
        const r = await A().home2Snapshot()
        if (S.disposed) return
        if (r && r.ok) { S.snap = r; S.remembered = false; paintAll(); followUps() }
        else if (!S.snap) paintFail()
      } catch { if (!S.snap && !S.disposed) paintFail() }
      refreshing = false
      if (again && !S.disposed) { again = false; refresh() }
    }
    // Things that complete the picture in the background: the hardware profile (Tuned) and a drift check (are the applied tweaks still there?).
    function followUps() {
      const f = S.snap.facts
      if (!f.profiled && (S.profTries = (S.profTries || 0) + 1) <= 8) S.timers.push(setTimeout(() => { if (!S.disposed) refresh() }, 15000))
      const applied = f.tuned ? f.tuned.applied : 0
      if (!S.driftAsked && !f.game && (f.tuned ? applied : Object.keys(settings).some(k => k.startsWith('tweak_') && settings[k] === 'applied')) && (!f.driftCheckedAt || f.now - f.driftCheckedAt > DAY)) {
        S.driftAsked = true
        A().home2Drift().then(() => { if (!S.disposed) refresh() }).catch(() => {})
      }
    }
    const refreshSoon = (() => { let t = null; return () => { clearTimeout(t); t = setTimeout(() => { if (!S.disposed) refresh() }, 1200); S.timers.push(t) } })()

    async function loadAi() {
      try {
        const st = await A().aiGetStatus()
        if (!st || !st.loaded || S.disposed) return
        const r = await A().aiGetRecommendations()
        if (S.disposed || !r || !r.ok || !Array.isArray(r.recommendations)) return
        S.ai = r.recommendations.filter(x => x.score >= 0.7 && settings['tweak_' + x.id] !== 'applied').slice(0, 3)
          .map(x => ({ id: x.id, title: x.name || x.id, why: T('aiWhy', { pct: Math.round(x.score * 100) }) }))
        paintMoves()
      } catch { /* the model is optional */ }
    }

    // ═══ Timeline ═══════════════════════════════════════════════════════════════════
    const tab = () => TR.TABS[S.tab]
    const caps = key => (root.JylliTelemetry && JylliTelemetry.state.caps && JylliTelemetry.state.caps[key]) || null
    /** Text for a telemetry value in the formatter's own units, or null when there is no reading. */
    function fmtKey(key, v) {
      if (v == null || !root.JylliTelemetry) return null
      const r = JylliTelemetry.fmt(key, [v, 0, 'os'], caps(key), tUI)
      return r.ok ? r.text + (r.unit ? (r.unit === '%' || r.unit === '°C' ? '' : ' ') + r.unit : '') : null
    }
    const liveV = key => (root.JylliTelemetry ? JylliTelemetry.value(key) : null)
    const whyNA = key => { const c = caps(key); return T('nar_why_' + String((c && c.reason) || 'no-sensor').replace(/-/g, '_')) }
    const agoWords = ms => { const s = Math.max(0, Math.round(ms / 1000)); return s < 90 ? T('trAgo', { n: s }) : s < 5400 ? T('trAgoMin', { n: Math.round(s / 60) }) : s < 129600 ? T('trAgoHour', { n: Math.round(s / 3600) }) : T('trAgoDay', { n: Math.round(s / 86400) }) }
    const amountText = (metric, v) => {
      if (metric === 'cpu') return T('amountCpu', { n: Math.round(v) })
      if (metric === 'ram') return T('amountRam', { n: v >= 1024 ? (v / 1024).toFixed(1) + ' GB' : Math.round(v) + ' MB' })
      const b = P.bytes(v); return T('amountDisk', { n: b ? b.n + ' ' + b.u + '/s' : '–' })
    }

    function bandFor(t) { const b = t.baseline && S.base[t.history]; return b ? { p25: b.p25, p75: b.p75 } : null }
    function applyTab() {
      const t = tab()
      el.querySelectorAll('.hm-tab').forEach(b => {
        const id = b.dataset.tab, off = S.win === '7d' && !TR.TABS[id].history
        b.setAttribute('aria-selected', String(id === S.tab)); b.tabIndex = id === S.tab ? 0 : -1
        b.disabled = off; b.title = off ? T('trWinOnly7d') : ''
      })
      el.querySelectorAll('.hm-seg-b').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.win === S.win)))
      if (S.view) { S.view.setTab(t); S.view.setWindow(S.win); S.view.setBand(S.win === '7d' ? null : bandFor(t)); refreshPins() }
      paintLegend(); paintNarr(true); paintDetail(null)
    }
    function setTab(id) { if (!TR.TABS[id] || (S.win === '7d' && !TR.TABS[id].history)) return; S.tab = id; store.set('hm_tl_tab', id); applyTab() }
    function setWin(w) {
      if (!TR.WINDOWS[w]) return
      S.win = w; store.set('hm_tl_win', w)
      if (w === '7d' && !tab().history) { S.tab = 'cpu'; store.set('hm_tl_tab', 'cpu') }
      applyTab()
    }

    // legend: what each line is, with its value now (or at the hovered moment)
    function paintLegend(values) {
      const t = tab(), host = q('#hm-tl-lg')
      if (S.win === '7d') { host.innerHTML = `<span class="hm-lg" data-role="primary"><i></i>${esc(T('trLoad'))}</span><span class="hm-lg" data-role="mark"><i></i>${esc(T('trLegendChange'))}</span>`; return }
      const val = key => (values ? values[key] : liveV(key))
      const items = []
      for (const l of t.lines) {
        const v = val(l.key), txt = fmtKey(l.key, v)
        items.push(`<span class="hm-lg" data-role="${l.role === 'primary' ? 'primary' : (l.axis === 'right' ? 'secondary' : 'tertiary')}"><i></i>${esc(T(LABEL[l.key]))} ${txt ? `<b class="hm-num">${esc(txt)}</b>` : `<em title="${esc(whyNA(l.key))}">${esc(T('trNA'))}</em>`}</span>`)
      }
      for (const e of t.extras) {
        const v = val(e.key), txt = fmtKey(e.key, v)
        if (txt) items.push(`<span class="hm-lg" data-role="extra">${esc(T(LABEL[e.key]))} <b class="hm-num">${esc(txt)}</b></span>`)
      }
      const band = bandFor(t)
      if (band) items.push(`<span class="hm-lg" data-role="band" title="${esc(T('trNormalTip'))}"><i></i>${esc(T('trNormal'))} <b class="hm-num">${band.p25}–${band.p75} %</b></span>`)
      const lim = t.lines.find(l => l.ceiling)
      if (lim && root.JylliPulseAttribution) items.push(`<span class="hm-lg" data-role="limit"><i></i>${esc(T('trLimit'))} <b class="hm-num">${JylliPulseAttribution.THERMAL_LIMIT[lim.ceiling]}°C</b></span>`)
      host.innerHTML = items.join('')
    }

    // the sentence under the chart: what the last seconds mean. Spikes are shown at once, anything else at most every 5 s.
    function narrState() {
      const t = tab(), pk = t.lines[0].key, sk = (t.lines.find(l => l.role === 'secondary') || {}).key
      const v = liveV(pk)
      const st = { tab: S.tab, now: { primary: v, secondary: sk ? liveV(sk) : null }, unavailable: null, spike: null, cmp: null, ceiling: null }
      const sec = t.lines.find(l => l.ceiling)
      if (sec && root.JylliPulseAttribution) st.ceiling = JylliPulseAttribution.THERMAL_LIMIT[sec.ceiling]
      if (v == null && root.JylliTelemetry && JylliTelemetry.state.snap) st.unavailable = { reason: String((caps(pk) && caps(pk).reason) || 'no-sensor') }
      const pin = S.events.filter(e => e.kind === 'spike' && e.tab === S.tab && Date.now() - e.t <= 30000 && !e.unrecorded).pop()
      if (pin) st.spike = { ageS: Math.max(5, Math.round((Date.now() - pin.t) / 5000) * 5), v: pin.v, flag: pin.flag }   // 5 s steps: the sentence stays true without being rewritten every second
      const b = t.baseline && S.base[t.history]
      if (b && v != null) st.cmp = TR.compare(v, b)
      return st
    }
    function narrText() {
      if (S.win === '7d') return { key: 'nar_week', text: T('nar_week') }
      const n = TR.narrate(narrState()), v = { ...n.vars }
      if (n.key === 'nar_na') v.why = T('nar_why_' + String(v.reason).replace(/-/g, '_'))
      if (n.key === 'nar_spikeBy') { v.who = v.id ? T('pn_' + v.id) : v.who; v.amount = amountText(tab().culprit, v.share); v.what = v.id ? T('pr_' + v.id) : '' }
      const text = T(n.key, v).trim()
      return { key: n.key + '|' + text, text }
    }
    function paintNarr(force) {
      if (S.hover) return
      const n = narrText(), now = Date.now(), el2 = q('#hm-tl-n')
      const urgent = /spike/.test(n.key)
      if (!force && n.key !== S.narr.key && !urgent && now - S.narr.at < 5000) return
      if (n.key !== S.narr.key || force) { el2.textContent = n.text; S.narr = { at: now, key: n.key } }
    }

    // pins: Jylli changes, game start and end, restore points, spikes
    function pinText(p) {
      if (p.kind === 'change') return T('rwChange', { n: p.n }) + ' · ' + (T('via_' + (p.via || 'manual')) || p.via)
      if (p.kind === 'game') return T(p.started ? 'pinGameStart' : 'pinGameEnd', { name: p.name || '' })
      if (p.kind === 'restore') return T('pinRestore')
      const f = p.flag || { type: 'pending' }
      const head = T('pinSpike', { v: Math.round(p.v) })
      if (p.unrecorded) return head + ' — ' + T('pinSpikeUnrecorded')
      if (f.type === 'process') return head + ' — ' + T('pinSpikeBy', { who: f.id ? T('pn_' + f.id) : f.name, amount: amountText(p.metric, f.value) })
      if (f.type === 'spread') return head + ' — ' + T('pinSpikeSpread')
      if (f.type === 'game') return head + ' — ' + T('pinSpikeGame')
      if (f.type === 'none') return head + ' — ' + T('pinSpikeNone')
      return head + ' — ' + T('pinSpikePending')
    }
    function refreshPins() {
      if (!S.view) return
      S.view.setPins(S.events.filter(e => e.kind !== 'spike' || e.tab === S.tab))
    }
    function syncEvents() {   // journal batches and the newest restore point become pins
      S.events = S.events.filter(e => e.kind !== 'change' && !(e.kind === 'restore' && e.fromSnap))
      for (const m of JylliChronoPure.marks(S.entries)) if (m.via !== 'undo') S.events.push({ kind: 'change', t: m.ts, n: m.n, via: m.via, key: m.key })
      const at = S.snap && S.snap.facts.restore && S.snap.facts.restore.at
      if (at) S.events.push({ kind: 'restore', t: at, fromSnap: true })
      refreshPins()
    }

    // spikes: found in the live rings once a second, then explained by a single per-process read
    function handleSpike(id, sp) {
      const t = TR.TABS[id]
      const pin = { kind: 'spike', t: sp.t, v: sp.v, tab: id, metric: t.culprit, flag: { type: 'pending' } }
      S.events.push(pin); refreshPins()
      // two seconds in: the per-process counters need a full interval, and a read at the very first sample would see a ramp, not the cause
      if (t.culprit) S.timers.push(setTimeout(() => { if (!S.disposed) readCulprit(pin, t.culprit, 0) }, 2000))
    }
    async function readCulprit(pin, metric, attempt) {
      let res
      try { res = await A().home2Culprit({ metric }) } catch { res = { ok: false } }
      if (S.disposed) return
      if (res && res.reason === 'throttled' && attempt < 1) { S.timers.push(setTimeout(() => readCulprit(pin, metric, 1), 6500)); return }
      if (res && res.ok && !res.game && res.at && res.at - pin.t > 12000) res = { ok: false }   // too late to say what caused it
      pin.flag = PR.flagFor(metric, res)
      refreshPins(); paintNarr(true)
    }
    function checkSpikes() {
      const now = Date.now()
      for (const id of TR.TAB_IDS) {
        const t = TR.TABS[id]
        if (!t.spike) continue
        const recent = S.rings[t.lines[0].key].filter(p => p.t >= now - 25000)
        for (const sp of TR.spikes(recent, t.spike)) {
          const last = S.lastSpike[id] || 0
          if (sp.t > last + 20000 || (!last && sp.t > last)) { S.lastSpike[id] = sp.t; handleSpike(id, sp) }
        }
      }
    }

    // backfill the last 10 minutes at once, then follow the push
    async function backfill() {
      try {
        const r = await A().telemetrySeries({ keys: TR.allKeys(), seconds: 600 })
        if (S.disposed || !r || !r.ok) return
        for (const k of Object.keys(r.series || {})) {
          const live = S.rings[k] || []
          const old = r.series[k].map(([t, v]) => ({ t, v })).filter(p => !live.length || p.t < live[0].t)
          S.rings[k] = old.concat(live)
        }
        if (S.view) S.view.setRings(S.rings)
        for (const id of TR.TAB_IDS) {       // spikes from before Home was opened: pinned, but their cause was not recorded
          const t = TR.TABS[id]; if (!t.spike) continue
          for (const sp of TR.spikes(S.rings[t.lines[0].key], t.spike)) { S.events.push({ kind: 'spike', t: sp.t, v: sp.v, tab: id, metric: t.culprit, unrecorded: true, flag: { type: 'none' } }); S.lastSpike[id] = sp.t }
        }
        refreshPins()
      } catch { /* the chart fills live instead */ }
    }
    function ingest(snap) {
      if (!snap || !snap.s) return
      for (const k of Object.keys(S.rings)) {
        const e = snap.s[k]
        if (!e || typeof e[0] !== 'number') continue
        const ring = S.rings[k], last = ring[ring.length - 1]
        if (!last || snap.t - last.t >= 450) TR.pushRing(ring, { t: snap.t, v: e[0] }, RING_MS)
      }
    }

    // 7 days: the recorded history (CPU and RAM) with every change marked
    async function loadHistory() {
      let samples = [], entries = []
      try { samples = await A().getMetricsHistory({ hours: 168 }) } catch {}
      try { entries = await A().journalList({ limit: 600 }) } catch {}
      if (S.disposed) return
      S.samples = Array.isArray(samples) ? samples : []
      S.entries = Array.isArray(entries) ? entries : []
      S.strip = JylliHomeRewind.strip({ samples: S.samples, entries: S.entries, now: Date.now(), hours: 168 })
      S.base = { cpu: TR.baseline(S.samples, 'cpu', Date.now()), ram: TR.baseline(S.samples, 'ram', Date.now()) }
      if (S.view) { S.view.setStrip(S.strip); S.view.setBand(S.win === '7d' ? null : bandFor(tab())) }
      syncEvents(); paintLedger(); paintLegend(); paintNarr(true)
    }

    // hover / pinned crosshair
    const fmtTime = ts => new Date(ts).toLocaleString(settings.language === 'fi' ? 'fi-FI' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    function onHover(info) {
      S.hover = info
      const n = q('#hm-tl-n')
      if (!info) { paintLegend(); paintNarr(true); paintDetail(null); return }
      if (info.mode === '7d') { paintLegend(); n.textContent = ''; paintDetail(info.x); return }
      paintLegend(info.values)
      const pins = (info.pins || []).filter(p => p.kind !== 'spike' || p.tab === S.tab).map(pinText)
      n.textContent = agoWords(Date.now() - info.t) + (pins.length ? ' · ' + pins.join(' · ') : '')
    }
    function markNames(m) {
      const names = S.entries.filter(e => (e.batchId || 'single:' + e.id) === m.key).map(e => (root._tweakMeta && root._tweakMeta[e.tweakId] && root._tweakMeta[e.tweakId].name) || e.tweakId || String(e.control || '').replace(/^[a-z-]+:/, '')).filter(Boolean)
      return [...new Set(names)]
    }
    function paintDetail(x) {
      const d = q('#hm-tl-d')
      if (S.win !== '7d' || !S.strip || x == null) { d.innerHTML = S.win === '7d' ? `<p class="hm-rw-h">${esc(S.strip && S.strip.marks.length ? T('rwHint') : T('rwEmpty'))}</p>` : ''; return }
      const hit = JylliHomeRewind.at(S.strip, x)
      if (!hit) return
      const b = hit.bucket, f = tab().history
      const val = b && b[f] != null ? `${esc(T('trTab_' + S.tab))} <b class="hm-num">${b[f]}%</b>` : esc(T('rwNoData'))
      d.innerHTML = `<div class="hm-rw-t"><b>${esc(fmtTime(hit.ts))}</b><span>${val}</span></div>` + (hit.marks.length ? hit.marks.map(m => {
        const names = markNames(m)
        const via = T('via_' + (m.via || 'manual')) || m.via
        return `<div class="hm-rw-m" data-undone="${m.undone ? 1 : 0}"><div><b>${esc(T('rwChange', { n: m.n }))}</b> <span class="hm-chip">${esc(via)}</span>${m.undone ? ` <span class="hm-chip">${esc(T('rwUndone'))}</span>` : ''}
          <p>${esc(names.slice(0, 4).join(', '))}${names.length > 4 ? esc(' +' + (names.length - 4)) : ''}</p></div>
          ${!m.undone ? `<button type="button" class="j-btn j-btn-sm" data-act="rw-undo" data-key="${esc(m.key)}">${ic('rotate-left')}<span>${esc(T('undo'))}</span></button>` : ''}</div>`
      }).join('') : `<p class="hm-rw-h">${esc(T('rwNoChange'))}</p>`)
    }

    // ── actions ──
    async function confirmIt(o) { try { return !!(await showConfirm(o)) } catch { return false } }
    async function runMove(id) {
      const m = S.moves && S.moves.all.find(x => x.id === id)
      if (!m || S.busy) return
      const a = m.action
      S.busy = id; paintMoves()
      let done = false
      try {
        if (a.type === 'restore') { const r = await quickCreateRP(); done = !!(r && r.ok) }
        else if (a.type === 'autoOpti') { if (a.useCase) settings.aom_use_case = a.useCase; S.busy = null; paintMoves(); runAutoOpti(); return }
        else if (a.type === 'tab') { S.busy = null; showPage(a.page, a.tab); return }
        else if (a.type === 'admin') { S.busy = null; A().relaunchAdmin(); return }
        else if (a.type === 'batch') {
          const ok = await confirmIt({ title: copyOf(m).title, body: tG('concierge', 'confirmBatch', { n: a.ids.length }), okText: T('btn_batch'), okStyle: 'primary', icon: 'fa-circle-check' })
          if (ok) { await applyTweakBatch(a.ids, 'apply'); if (m.kind === 'concierge') conciergeMark(m.id, 'done'); done = true }
        } else if (a.type === 'drift' || a.type === 'ai') {
          const ids = a.type === 'drift' ? a.ids : [a.id]
          const ok = await confirmIt({ title: copyOf(m).title, body: T('confirmApply', { n: ids.length }), okText: T(a.type === 'drift' ? 'btn_drift' : 'btn_ai'), okStyle: 'primary', icon: 'fa-circle-check' })
          if (ok) { await applyTweakBatch(ids, 'apply'); if (a.type === 'drift') await A().home2Drift(); else S.ai = S.ai.filter(x => x.id !== a.id); done = true }
        }
      } catch { /* the flow reports its own errors */ }
      S.busy = null
      S.justDone = done ? id : null
      await refresh(); loadHistory()
      if (!done) paintMoves()
    }
    function later(id) {
      settings.homeSnooze = settings.homeSnooze || {}
      settings.homeSnooze[id] = Date.now() + 3 * DAY
      for (const k of Object.keys(settings.homeSnooze)) if (settings.homeSnooze[k] < Date.now()) delete settings.homeSnooze[k]
      A().saveSettings(settings)
      paintMoves()
    }
    async function undoMark(key) {
      const m = S.strip && S.strip.marks.find(x => x.key === key)
      if (!m) return
      const ok = await confirmIt({ title: T('undoTitle'), body: T('undoBody', { n: m.n }), okText: T('undo'), okStyle: 'warning', icon: 'fa-rotate-left' })
      if (!ok) return
      let r = null
      try { r = m.batchId ? (m.via === 'auto-opti' ? await A().aoUndo({ batchId: m.batchId }) : await A().journalUndo({ target: { batchId: m.batchId } })) : await A().journalUndo({ target: { entryId: m.entryId } }) } catch {}
      if (!r || !r.ok) { const d = q('#hm-tl-d'); if (d) d.insertAdjacentHTML('afterbegin', `<p class="hm-rw-err" role="alert">${esc(T(r && r.conflict ? 'undoConflict' : 'undoFailed'))}</p>`); return }
      await refresh(); await loadHistory()
    }
    async function undoLast() {
      const id = lastBatchUndoable()
      if (!id) return
      const ok = await confirmIt({ title: T('undoTitle'), body: T('undoLastBody'), okText: T('undo'), okStyle: 'warning', icon: 'fa-rotate-left' })
      if (!ok) return
      try { await A().aoUndo({ batchId: id }) } catch {}
      await refresh(); await loadHistory()
    }
    function togglePop(id, btn, force) {
      const pop = q(id); if (!pop) return
      const open = force != null ? force : pop.hidden
      pop.hidden = !open
      if (btn) btn.setAttribute('aria-expanded', String(open))
    }

    on(el, 'click', async e => {
      const b = e.target.closest('[data-act],[data-pillar].hm-pillar')
      if (!b || !el.contains(b)) { if (!e.target.closest('.hm-pop')) { q('#hm-notes').hidden = true; const w = q('#hm-wn-pop'); if (w) w.hidden = true } return }
      if (b.classList.contains('hm-pillar')) { toggleWhy(!S.whyOpen || false, b.dataset.pillar); return }
      const act = b.dataset.act
      switch (act) {
        case 'run': runMove(b.dataset.move); break
        case 'later': later(b.dataset.move); break
        case 'tl-tab': setTab(b.dataset.tab); break
        case 'tl-win': setWin(b.dataset.win); break
        case 'notes': togglePop('#hm-notes', b); break
        case 'wn': togglePop('#hm-wn-pop', b); break
        case 'wn-close': store.set(wnKey, '1'); q('#db-changelog-feed')?.remove(); q('#hm-wn-pop')?.remove(); break
        case 'why-close': toggleWhy(false); break
        case 'why-checkup': case 'open-diag': case 'checkup': showPage('preflight'); break
        case 'why-rp': await quickCreateRP(); refresh(); break
        case 'why-drift': {
          b.disabled = true; b.textContent = T('checking')
          await A().home2Drift(); await refresh(); b.disabled = false; break
        }
        case 'retry': q('#hm-eyebrow').textContent = T('verifying'); refresh(); break
        case 'rw-undo': undoMark(b.dataset.key); break
        case 'undo-last': undoLast(); break
        case 'dns': quickFlushDNS(); break
        case 'temp': quickClearTemp(); break
        case 'ram': quickCleanRam(); break
        case 'games': showPage('game-opti'); break
        case 'fivem': showPage('fivem'); break
        case 'specs': refreshSpecs(); break
        case 'admin': A().relaunchAdmin(); break
        case 'open-last': showPage('pulse'); break
      }
    })
    on(el, 'keydown', e => {
      if (e.key === 'Escape') { if (S.whyOpen) toggleWhy(false); q('#hm-notes').hidden = true; const w = q('#hm-wn-pop'); if (w) w.hidden = true }
      const tb = e.target.closest && e.target.closest('.hm-tab')   // roving tabs: arrows move between the enabled ones
      if (tb && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        const list = [...el.querySelectorAll('.hm-tab:not(:disabled)')], i = list.indexOf(tb)
        const n = list[(i + (e.key === 'ArrowRight' ? 1 : list.length - 1)) % list.length]
        if (n) { e.preventDefault(); n.focus(); setTab(n.dataset.tab) }
      }
    })

    // ── 1 Hz: tab values, uptime, spikes, the sentence ──
    function tick() {
      if (S.disposed || document.hidden) return
      const up = liveV('sys.uptime'), upEl = q('#db-identity-uptime')
      if (upEl && typeof up === 'number') upEl.textContent = fmtUptime(Math.floor(up))
      for (const id of TR.TAB_IDS) {
        const t = TR.TABS[id], v = liveV(t.lines[0].key), b = q(`.hm-tab[data-tab="${id}"]`)
        if (!b) continue
        const txt = fmtKey(t.lines[0].key, v)
        b.querySelector('[data-tab-v]').textContent = txt || '–'
        const sk = t.lines.find(l => l.role === 'secondary'), sv = sk ? fmtKey(sk.key, liveV(sk.key)) : (id === 'ram' ? fmtKey('ram.used', liveV('ram.used')) : '')
        b.querySelector('[data-tab-s]').textContent = sv ? (id === 'net' ? '↑ ' : '') + sv : ''
        b.dataset.tone = v == null || t.lines[0].unit === 'bps' ? (v == null ? 'idle' : 'ok') : v >= 90 ? 'danger' : v >= 70 ? 'warn' : 'ok'
      }
      checkSpikes()
      if (!S.hover) { paintLegend(); paintNarr(false) }
    }
    S.timers.push(setInterval(tick, 1000))

    // ── start ──
    twinInit()
    ariaInitPanel()
    if (root._pendingFrameSession) showFrameSession(root._pendingFrameSession)
    buildGameCarousel(q('#hm-games'))
    paintCaption()
    paintMoves()
    try { JylliTelemetry.applyToDom() } catch {}
    S.view = JylliHomeTraceView.mount(q('#hm-tl'), { label: T('trAria'), nowLabel: T('trNow'), onHover })
    S.view.setRings(S.rings)
    applyTab()
    backfill()
    ;(async () => {                      // remembered values first, verified in place when the fresh snapshot lands
      try { const r = await A().home2Cached(); if (!S.disposed && !S.snap && r && r.last) { S.snap = r.last; S.remembered = true; paintAll() } } catch {}
    })()
    refresh().then(() => {
      if (S.disposed || !S.snap) return
      if (!S.snap.facts.diag && !S.snap.facts.legacy) A().home2Legacy().then(() => { if (!S.disposed) refresh() }).catch(() => {})
    })
    loadHistory(); loadAi()
    A().listSessions().then(list => {
      const s = Array.isArray(list) && list.length ? list.slice().sort((a, b) => b.startedAt - a.startedAt)[0] : null
      const host = q('#hm-last'); if (!s || !host || S.disposed || !s.summary) return
      const m = Math.round((s.durationSec || 0) / 60)
      host.hidden = false
      host.innerHTML = `<button type="button" class="hm-last-b" data-act="open-last"><span class="hm-k">${esc(T('lastSession'))}</span><b>${esc(s.game || '')}</b>
        <span class="hm-last-s">${esc(T('lastSessionLine', { m, fps: Math.round(s.summary.avgFps || 0), low: Math.round(s.summary.low1Fps || 0) }))}</span></button>`
    }).catch(() => {})

    const api = A()
    for (const [name, fn] of [['onSettingsPatch', refreshSoon], ['onAutoSnapshotDone', () => { S.events.push({ kind: 'restore', t: Date.now() }); refreshPins(); refreshSoon() }], ['onSessionSaved', refreshSoon],
      ['onGameDetected', d => { S.events.push({ kind: 'game', t: Date.now(), started: true, name: d && d.name }); refreshPins(); refreshSoon() }],
      ['onGameExited', d => { S.events.push({ kind: 'game', t: Date.now(), started: false, name: d && d.name }); refreshPins(); refreshSoon() }], ['onTierUpdate', refreshSoon], ['onTwinTelemetry', ingest]]) {
      try { if (typeof api[name] === 'function') { const off = api[name](fn); if (typeof off === 'function') S.off.push(off) } } catch {}
    }
    on(document, 'visibilitychange', () => { if (!document.hidden) refreshSoon() })

    current = { refresh: () => { if (!S.disposed) refreshSoon() } }
    registerPageCleanup('dashboard', () => {
      S.disposed = true
      current = null
      S.timers.forEach(t => { clearTimeout(t); clearInterval(t) })
      S.off.forEach(f => { try { f() } catch {} })
      try { S.view && S.view.destroy() } catch {}
    })
  }

  root.JylliHomePage = { mount, refresh: () => current && current.refresh() }
})(typeof window !== 'undefined' ? window : globalThis)
