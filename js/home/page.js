'use strict'
// Home "Helm": mounted by buildDashboard (js/pages/home.js). One snapshot (home2-snapshot: Jylli Index, facts, Proof Ledger) drives the hero,
// the Next Best Move and the ledger; the rewind strip and the live instruments load on their own so nothing waits for the slowest source.
// Remembered state paints first (home2-cached) and is verified in place. Copy: LANG group `home2` (js/lang/home-*.js).
;(function (root) {
  if (typeof document === 'undefined') return
  const V = root.JylliHomeViews, P = root.JylliHomePure
  const { esc, ic } = V
  const T = (k, v) => tG('home2', k, v)
  const A = () => root.api
  const DAY = 86400000
  const reduced = () => document.documentElement.classList.contains('motion-reduced') || document.body.classList.contains('motion-reduced') || (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches)

  let current = null
  function mount(c) {
    const S = { snap: null, remembered: false, ai: [], entries: [], strip: null, rw: null, disposed: false, off: [], timers: [], busy: null, whyOpen: false, scrub: null, rings: {}, shownScore: null }
    const si = (typeof sysInfo !== 'undefined' && sysInfo) || {}   // a global let in index.html, so not on window
    const el = document.createElement('div')
    el.className = 'jk hm'
    el.id = 'home-root'
    const wn = root._whatsNew && root._whatsNew[0]
    const wnKey = wn ? 'wn_dismissed_' + String(wn.version).replace(/[^\w.-]/g, '') : null
    const showWn = wn && !localStorage.getItem(wnKey)

    el.innerHTML = `
      ${showWn ? `<div class="hm-ribbon" id="db-changelog-feed"><span class="hm-chip" data-accent="1">${esc(T('whatsNew'))} v${esc(wn.version)}</span>
        <span class="hm-ribbon-t">${wn.items.slice(0, 3).map(i => esc(String(i).replace(/^[A-Za-zÄÖäö]+ — /, '').slice(0, 60))).join(' · ')}</span>
        <button type="button" class="j-btn j-btn-ghost j-btn-sm j-btn-icon" data-act="wn-close" aria-label="${esc(tUI('ttDismiss'))}">${ic('xmark')}</button></div>` : ''}
      <section class="hm-hero" id="db-hero" data-tone="idle" data-verify="1">
        <div class="j-twin-stage hm-stage" id="home-twin-stage" data-tour="home-rig">
          <div class="j-twin-slot" id="home-twin-slot" data-twin-view="rig:home"></div>
          <div class="j-twin-hint" id="twin-hint">${tUI('twinHint')}</div>
          <div class="j-twin-inspector" id="twin-inspector" role="region" aria-label="${esc(tUI('twinInspector'))}" aria-live="polite" hidden></div>
          <ul class="j-twin-parts" id="twin-parts" aria-label="${esc(tUI('twinPartsList'))}"></ul>
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
          </div>
          <div class="hm-move" id="hm-move" data-tour="home-moves" aria-live="polite"></div>
          <ul class="hm-next" id="hm-next" aria-label="${esc(T('upNext'))}"></ul>
        </div>
      </section>
      <section class="hm-why" id="hm-why" hidden aria-label="${esc(T('whyTitle'))}"></section>
      <section class="hm-sec hm-pc" id="db-identity-card"></section>
      <section class="hm-sec hm-ledger" id="hm-ledger-s"><header class="hm-sec-h"><div><h3>${esc(T('proofTitle'))}</h3><p>${esc(T('proofLead'))}</p></div></header><div id="hm-ledger"></div></section>
      <section class="hm-sec hm-rewind" id="hm-rewind-s"><header class="hm-sec-h"><div><h3>${esc(T('rwTitle'))}</h3><p>${esc(T('rwLead'))}</p></div>
        <div class="hm-legend"><span data-k="cpu">CPU</span><span data-k="ram">RAM</span><span data-k="mark">${esc(T('rwMark'))}</span></div></header>
        <div class="hm-rw" id="hm-rw"></div><div class="hm-rw-d" id="hm-rw-d" aria-live="polite"></div></section>
      <section class="hm-sec" id="panel-util"><header class="hm-sec-h"><div><h3>${esc(T('instTitle'))}</h3></div></header><ul class="hm-insts" id="hm-insts">${V.instruments(T)}</ul></section>
      <section class="hm-sec" id="hm-grades-s"><header class="hm-sec-h"><div><h3>${esc(T('gradesTitle'))}</h3><p id="hm-grades-lead">${esc(T('gradesLead'))}</p></div></header><div id="hm-grades"></div></section>
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
      <section class="hm-sec hm-dock-s"><header class="hm-sec-h"><div><h3>${esc(T('dockTitle'))}</h3><p>${esc(T('dockLead'))}</p></div></header><div class="hm-dock" id="quick-actions-row">${V.dock(T, si.isAdmin)}</div></section>`
    c.appendChild(el)
    const q = s => el.querySelector(s)
    current = null
    const on = (target, ev, fn, o) => { target.addEventListener(ev, fn, o); S.off.push(() => target.removeEventListener(ev, fn, o)) }

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
    const agoText = a => (a ? T(a.key, { n: a.n }) : '')

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
        const id = S.justDone; S.justDone = null
        S.timers.push(setTimeout(() => { if (!S.disposed) paintMoves() }, 1800)); void id
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

    // ── Why this number ──
    function paintWhy() {
      const snap = S.snap, why = q('#hm-why')
      if (!snap) return
      const f = snap.facts, idx = snap.index
      const rows = {
        health: { items: [
          { label: T('wyVitals'), value: f.diag ? f.diag.score + ' · ' + agoText(P.ago(f.diag.takenAt, f.now)) : T('notMeasured'), state: f.diag ? 'ok' : 'idle' },
          { label: T('wyQuick'), value: f.legacy ? String(f.legacy.score) : T('notMeasured'), state: f.legacy ? 'ok' : 'idle' },
          { label: T('wyFindings'), value: f.diag ? String((f.diag.stats && f.diag.stats.findings) || 0) : '–', state: f.diag && f.diag.stats && f.diag.stats.urgent ? 'warn' : 'ok' },
        ], action: { act: 'why-checkup', label: T(f.diag ? 'btn_checkupAgain' : 'btn_checkup') } },
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

    // ── paint: identity strip, ledger, grades ──
    function paintPc() {
      const cpuShort = (si.cpu || '').replace(/\(R\)|\(TM\)|Intel Core |AMD Ryzen /gi, '').replace(/\s+/g, ' ').trim().split('@')[0].trim()
      const gpuShort = (si.gpu || '').replace(/NVIDIA |AMD |GeForce |Radeon /gi, '').trim()
      const rows = [si.winVer && ['fab fa-windows', si.winVer.replace(' (Build', ' B').replace(')', '')], cpuShort && ['fa fa-microchip', cpuShort], gpuShort && ['fa fa-display', gpuShort], si.ramGB && ['fa fa-memory', si.ramGB + ' GB RAM']].filter(Boolean)
      const w = (k, v) => tG('specWarn', k, v), notes = []
      if (si.ramGB > 0 && si.ramGB < 8) notes.push(['danger', w('ramLow', { n: si.ramGB })])
      else if (si.ramGB > 0 && si.ramGB < 16) notes.push(['warn', w('ramMid', { n: si.ramGB })])
      if (si.isWifi) notes.push(['warn', w('wifi')])
      if (si.isLaptop) notes.push(['warn', w('laptop')])
      if (si.nvme === false) notes.push(['info', w('noNvme')])
      q('#db-identity-card').innerHTML = `<div class="hm-pc-main"><span class="hm-pc-i">${ic(si.isLaptop ? 'laptop' : 'desktop')}</span>
        <div><h3>${esc(si.computerName || T('myPc'))}</h3><div class="hm-chips">${rows.map(([i, t]) => `<span class="hm-chip"><i class="${i}" aria-hidden="true"></i> ${esc(t)}</span>`).join('')}</div></div></div>
        <div class="hm-pc-meta"><div><span class="hm-k">${esc(T('uptime'))}</span><b class="hm-num" id="db-identity-uptime">–</b></div>
        <div><span class="hm-k">${esc(T('lastOpt'))}</span><b class="hm-num">${S.snap && S.snap.facts.autoOpti.lastAt ? esc(agoText(P.ago(S.snap.facts.autoOpti.lastAt, Date.now()))) : esc(T('never'))}</b></div></div>
        ${notes.length ? `<ul class="hm-notes">${notes.map(([t, x]) => `<li data-tone="${t}">${ic('circle-info')} <span>${esc(x)}</span></li>`).join('')}</ul>` : ''}`
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
    function paintGrades() {
      const d = S.snap && S.snap.facts.diag
      q('#hm-grades').innerHTML = d ? V.grades(T, d.grades) : `<div class="hm-empty">${ic('stethoscope')}<div><b>${esc(T('gradesEmptyT'))}</b><p>${esc(T('gradesEmptyB'))}</p></div><button type="button" class="j-btn" data-act="open-diag">${esc(T('btn_checkup'))}</button></div>`
      q('#hm-grades-lead').textContent = d ? T('gradesFrom', { ago: agoText(P.ago(d.takenAt, Date.now())) }) : T('gradesLead')
    }

    function paintAll() { paintHero(); paintMoves(); paintPc(); paintLedger(); paintGrades(); try { JylliTelemetry.applyToDom() } catch {} }

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

    async function loadRewind() {
      let samples = [], entries = []
      try { samples = await A().getMetricsHistory({ hours: 168 }) } catch {}
      try { entries = await A().journalList({ limit: 600 }) } catch {}
      if (S.disposed) return
      S.entries = Array.isArray(entries) ? entries : []
      S.strip = JylliHomeRewind.strip({ samples: Array.isArray(samples) ? samples : [], entries: S.entries, now: Date.now(), hours: 168 })
      if (S.rw) S.rw.set(S.strip)
      paintRwDetail(null)
      paintLedger()
    }

    // ── rewind detail ──
    const fmtTime = ts => new Date(ts).toLocaleString(settings.language === 'fi' ? 'fi-FI' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    function markNames(m) {
      const names = S.entries.filter(e => (e.batchId || 'single:' + e.id) === m.key).map(e => (root._tweakMeta && root._tweakMeta[e.tweakId] && root._tweakMeta[e.tweakId].name) || e.tweakId || String(e.control || '').replace(/^[a-z-]+:/, '')).filter(Boolean)
      return [...new Set(names)]
    }
    function paintRwDetail(x) {
      const d = q('#hm-rw-d')
      if (!S.strip || x == null) {
        const n = S.strip ? S.strip.marks.length : 0
        d.innerHTML = `<p class="hm-rw-h">${esc(n ? T('rwHint') : T('rwEmpty'))}</p>`
        return
      }
      const hit = JylliHomeRewind.at(S.strip, x)
      if (!hit) return
      const b = hit.bucket
      const val = b && (b.cpu != null || b.ram != null) ? `CPU <b class="hm-num">${b.cpu == null ? '–' : b.cpu + '%'}</b> · RAM <b class="hm-num">${b.ram == null ? '–' : b.ram + '%'}</b>` : esc(T('rwNoData'))
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
      await refresh(); loadRewind()
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
      if (!r || !r.ok) { const d = q('#hm-rw-d'); if (d) d.insertAdjacentHTML('afterbegin', `<p class="hm-rw-err" role="alert">${esc(T(r && r.conflict ? 'undoConflict' : 'undoFailed'))}</p>`); return }
      await refresh(); await loadRewind()
    }
    async function undoLast() {
      const id = lastBatchUndoable()
      if (!id) return
      const ok = await confirmIt({ title: T('undoTitle'), body: T('undoLastBody'), okText: T('undo'), okStyle: 'warning', icon: 'fa-rotate-left' })
      if (!ok) return
      try { await A().aoUndo({ batchId: id }) } catch {}
      await refresh(); await loadRewind()
    }

    on(el, 'click', async e => {
      const b = e.target.closest('[data-act],[data-pillar].hm-pillar')
      if (!b || !el.contains(b)) return
      if (b.classList.contains('hm-pillar')) { toggleWhy(!S.whyOpen || false, b.dataset.pillar); return }
      const act = b.dataset.act
      switch (act) {
        case 'run': runMove(b.dataset.move); break
        case 'later': later(b.dataset.move); break
        case 'wn-close': try { localStorage.setItem(wnKey, '1') } catch {} q('#db-changelog-feed')?.remove(); break
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
        case 'inst': { const li = b.closest('.hm-inst'), d = li.querySelector('.hm-inst-d'), open = d.hidden; d.hidden = !open; b.setAttribute('aria-expanded', String(open)); break }
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
    on(el, 'keydown', e => { if (e.key === 'Escape' && S.whyOpen) toggleWhy(false) })

    // ── live instruments: 1 Hz sampling of the telemetry hub, sparkline per tile ──
    const KEYS = { cpu: 'cpu.load', gpu: 'gpu0.load', ram: 'ram.load', net: 'net.rx', disk: 'disk.c.pct' }
    for (const id of Object.keys(KEYS)) S.rings[id] = []
    function sample() {
      if (!root.JylliTelemetry) return
      const up = JylliTelemetry.value('sys.uptime'), upEl = q('#db-identity-uptime')
      if (upEl && typeof up === 'number') upEl.textContent = fmtUptime(Math.floor(up))
      for (const id of Object.keys(KEYS)) {
        const v = JylliTelemetry.value(KEYS[id]), r = S.rings[id]
        r.push(typeof v === 'number' ? v : null); if (r.length > 60) r.shift()
        const li = q(`.hm-inst[data-inst="${id}"]`); if (!li) continue
        const vals = r.filter(x => x != null)
        const scale = id === 'net' ? Math.max(1, ...vals) : 100
        const norm = r.map(x => (x == null ? null : id === 'net' ? (x / scale) * 100 : x))
        const d = P.spark(norm, 120, 26)
        li.querySelector('.hm-spark-l').setAttribute('d', d)
        li.querySelector('.hm-spark-a').setAttribute('d', d ? d + ' L 120 28 L 0 28 Z' : '')
        const last = vals.length ? vals[vals.length - 1] : null
        li.dataset.tone = last == null || id === 'net' ? (last == null ? 'idle' : 'ok') : last >= 90 ? 'danger' : last >= 70 ? 'warn' : 'ok'
        const det = li.querySelector('.hm-inst-d')
        if (det && !det.hidden && vals.length) {
          const f = x => (id === 'net' ? JylliTelemetry.fmtBytes(x).n + ' ' + JylliTelemetry.fmtBytes(x).u + '/s' : Math.round(x) + '%')
          det.querySelector('[data-stat="now"]').textContent = f(last)
          det.querySelector('[data-stat="avg"]').textContent = f(vals.reduce((a, b) => a + b, 0) / vals.length)
          det.querySelector('[data-stat="peak"]').textContent = f(Math.max(...vals))
        }
      }
    }
    const tick = setInterval(sample, 1000); S.timers.push(tick)

    // ── start ──
    twinInit()
    ariaInitPanel()
    if (root._pendingFrameSession) showFrameSession(root._pendingFrameSession)
    buildGameCarousel(q('#hm-games'))
    paintPc()
    paintMoves()
    try { JylliTelemetry.applyToDom() } catch {}   // bind the instruments now instead of at the next push
    S.rw = JylliHomeRewindView.mount(q('#hm-rw'), { label: T('rwAria'), onScrub: x => { S.scrub = x; paintRwDetail(x) } })
    paintRwDetail(null)
    ;(async () => {                      // remembered values first, verified in place when the fresh snapshot lands
      try { const r = await A().home2Cached(); if (!S.disposed && !S.snap && r && r.last) { S.snap = r.last; S.remembered = true; paintAll() } } catch {}
    })()
    refresh().then(() => {
      if (S.disposed || !S.snap) return
      if (!S.snap.facts.diag && !S.snap.facts.legacy) A().home2Legacy().then(() => { if (!S.disposed) refresh() }).catch(() => {})
    })
    loadRewind(); loadAi()
    A().listSessions().then(list => {
      const s = Array.isArray(list) && list.length ? list.slice().sort((a, b) => b.startedAt - a.startedAt)[0] : null
      const host = q('#hm-last'); if (!s || !host || S.disposed || !s.summary) return
      const m = Math.round((s.durationSec || 0) / 60)
      host.hidden = false
      host.innerHTML = `<button type="button" class="hm-last-b" data-act="open-last"><span class="hm-k">${esc(T('lastSession'))}</span><b>${esc(s.game || '')}</b>
        <span class="hm-last-s">${esc(T('lastSessionLine', { m, fps: Math.round(s.summary.avgFps || 0), low: Math.round(s.summary.low1Fps || 0) }))}</span></button>`
    }).catch(() => {})

    const api = A()
    for (const [name, fn] of [['onSettingsPatch', refreshSoon], ['onAutoSnapshotDone', refreshSoon], ['onSessionSaved', refreshSoon], ['onGameDetected', refreshSoon], ['onGameExited', refreshSoon], ['onTierUpdate', refreshSoon]]) {
      try { if (typeof api[name] === 'function') { const off = api[name](fn); if (typeof off === 'function') S.off.push(off) } } catch {}
    }
    on(document, 'visibilitychange', () => { if (!document.hidden) refreshSoon() })

    current = { refresh: () => { if (!S.disposed) refreshSoon() } }
    registerPageCleanup('dashboard', () => {
      S.disposed = true
      current = null
      S.timers.forEach(t => { clearTimeout(t); clearInterval(t) })
      S.off.forEach(f => { try { f() } catch {} })
      try { S.rw && S.rw.destroy() } catch {}
    })
  }

  root.JylliHomePage = { mount, refresh: () => current && current.refresh() }
})(typeof window !== 'undefined' ? window : globalThis)
