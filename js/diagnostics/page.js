'use strict'
// Diagnostics 2.0, Checkup view + the frame for Timeline / Drivers / Benchmarks / Report (js/diagnostics/views.js).
// Everything shown comes from lib/diagnostics (scan events, the report) - nothing is estimated here. Pure helpers are exported for node tests.
;(function (root) {
  // Which probes feed which lattice arc. Kept equal to lib/diagnostics PROBE_SUBS by test/diagnostics-ui.test.js.
  const PROBE_SUBS = {
    reliability: ['stability'], events: ['stability'], minidumps: ['stability'], storage: ['storage'], battery: ['storage'], memory: ['memory'], ram: ['memory'],
    cpu: ['cpu'], thermal: ['cpu'], temps: ['cpu'], devices: ['drivers'], drivers: ['drivers'], runtimes: ['drivers'], updates: ['windows'], health: ['windows'],
    tpm: ['security'], net: ['network'], profile: ['gpu', 'security', 'memory'], preflight: ['config'],
  }
  const DEEP_ONLY = ['health', 'thermal', 'ram']
  const SEV_ORDER = ['critical', 'high', 'medium', 'low', 'info']

  // ── pure ──
  /** Probes a mode runs, per subsystem: { sub: [probe ids] }. */
  function feeds(mode) {
    const out = {}
    for (const [p, subs] of Object.entries(PROBE_SUBS)) {
      if (mode !== 'deep' && DEEP_ONLY.includes(p)) continue
      for (const s of subs) (out[s] = out[s] || []).push(p)
    }
    return out
  }
  /** Fraction of a subsystem's probes finished, given the set of finished probe ids. */
  const progress = (list, doneSet) => list && list.length ? list.filter(p => doneSet.has(p)).length / list.length : 0
  /** ms -> { k: 'now'|'min'|'hour'|'day', n } */
  function age(ms) {
    const m = Math.max(0, Math.round(ms / 60000))
    return m < 1 ? { k: 'now', n: 0 } : m < 60 ? { k: 'min', n: m } : m < 2880 ? { k: 'hour', n: Math.round(m / 60) } : { k: 'day', n: Math.round(m / 1440) }
  }
  const sevRank = s => { const i = SEV_ORDER.indexOf(s); return i < 0 ? SEV_ORDER.length : i }
  /** Findings for the active subsystem filter, most severe first. */
  const visible = (findings, sub) => (findings || []).filter(f => !sub || f.subsystem === sub).slice().sort((a, b) => sevRank(a.severity) - sevRank(b.severity) || b.penalty - a.penalty)
  const toneOf = s => s == null ? 'idle' : s >= 80 ? 'ok' : s >= 50 ? 'warn' : 'danger'

  const api = { PROBE_SUBS, DEEP_ONLY, SEV_ORDER, feeds, progress, age, sevRank, visible, toneOf }
  root.JylliDiagPage = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  const T = (k, v) => root.tG('diag2', k, v)
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
  const ago = ms => { const a = age(ms); return T('ago_' + a.k, { n: a.n }) }
  const A = () => root.api

  function mount(c) {
    const host = el('div', 'jk dx')
    c.appendChild(host)
    const S = { phase: 'idle', mode: 'quick', report: null, history: [], diff: null, filter: null, done: new Set(), fixing: null, unsub: null, disposed: false, bench: null }
    let view = 'checkup'

    // ── frame ──
    const bar = el('div', 'dx-bar')
    const sw = root.JylliTab.seg([
      { id: 'checkup', label: T('segCheckup'), icon: 'stethoscope' },
      { id: 'timeline', label: T('segTimeline'), icon: 'wave-square' },
      { id: 'drivers', label: T('segDrivers'), icon: 'plug' },
      { id: 'bench', label: T('segBench'), icon: 'gauge-high' },
      { id: 'report', label: T('segReport'), icon: 'file-lines' },
    ], view, id => show(id))
    const drvBtn = sw.el.querySelector('[data-id="drivers"]'); if (drvBtn) drvBtn.dataset.tour = 'diagnostics-drivers'
    bar.appendChild(sw.el)
    host.appendChild(bar)
    const views = {}
    for (const k of ['checkup', 'timeline', 'drivers', 'bench', 'report']) { views[k] = el('div', 'dx-view'); views[k].dataset.view = k; host.appendChild(views[k]) }
    const built = {}
    const ctx = { T, esc, el, ago, S, api: null, show: id => show(id), rescan: m => startScan(m || 'quick'), runFix: (f, btn) => runFix(f, btn), toneOf }
    function show(id) {
      view = id; sw.set(id)
      for (const k of Object.keys(views)) views[k].hidden = k !== id
      if (id !== 'checkup' && root.JylliDiagViews && root.JylliDiagViews[id]) {
        if (!built[id]) { ctx.api = A(); built[id] = root.JylliDiagViews[id](views[id], ctx) || {} }
        else if (built[id].refresh) built[id].refresh()
      }
    }

    // ── Checkup ──
    const cv = views.checkup
    const stage = el('section', 'dx-stage')
    const latHost = el('div', 'dx-lat-host')
    const names = {}
    for (const s of root.JylliDiagLattice.SUBS) names[s] = T('sub_' + s)
    const lat = root.JylliDiagLattice.mount(latHost, { names, label: T('scanning') })
    const verdict = el('div', 'dx-verdict')
    stage.append(latHost, verdict)
    const diffSlot = el('div', 'dx-diff-slot')
    const notes = el('div', 'dx-notes')
    const chips = el('div', 'dx-chips')
    const list = el('div', 'dx-findings'); list.dataset.tour = 'diagnostics-results'
    const passedSlot = el('div', 'dx-passed-slot')
    cv.append(stage, diffSlot, notes, chips, list, passedSlot)
    lat.onSeg(sub => setFilter(sub))

    function setFilter(sub) { S.filter = sub; lat.select(sub); paintChips(); paintFindings() }

    function paintVerdict() {
      const r = S.report, ph = S.phase
      let eyebrow = T('eyIdle'), title = T('tIdle'), lead = T('lIdle'), tone = 'idle', stats = '', btns = ''
      const run = `<button type="button" class="dx-cta" data-act="scan" id="pf-scan-btn"><i class="fa fa-stethoscope" aria-hidden="true"></i><span>${esc(r ? T('runAgain') : T('runCheckup'))}</span></button>`
      const modeSw = `<div class="dx-mode" role="group" aria-label="${esc(T('modeLabel'))}"><button type="button" data-mode="quick" aria-pressed="${S.mode === 'quick'}">${esc(T('modeQuick'))}</button><button type="button" data-mode="deep" aria-pressed="${S.mode === 'deep'}">${esc(T('modeDeep'))}</button></div>`
      if (ph === 'scan') {
        eyebrow = T('eyScan'); title = T('tScan'); lead = S.mode === 'deep' ? T('lScanDeep') : T('lScan'); tone = 'idle'
        btns = `<button type="button" class="dx-sec" data-act="stop"><i class="fa fa-stop" aria-hidden="true"></i><span>${esc(T('stop'))}</span></button>`
      } else if (ph === 'failed') {
        eyebrow = T('eyFail'); title = T('tFail'); lead = S.error === 'game-running' ? T('lGame') : T('lFail'); tone = 'danger'
        btns = run + modeSw
      } else if (r) {
        tone = r.tone === 'idle' ? 'accent' : r.tone
        eyebrow = T('eyLast', { t: ago(Date.now() - r.takenAt) })
        title = r.score == null ? T('tNone') : tone === 'ok' ? T('tOk') : tone === 'warn' ? T('tWarn') : T('tDanger')
        lead = r.stats.urgent > 0 ? T('lUrgent', { n: r.stats.urgent }) : r.stats.findings > 0 ? T('lSome', { n: r.stats.findings }) : T('lClear', { n: r.stats.passed })
        const measured = r.used ? r.used.length : 0
        stats = `<dl class="dx-stats"><div><dt>${esc(T('stFindings'))}</dt><dd>${r.stats.findings}</dd></div><div><dt>${esc(T('stPassed'))}</dt><dd>${r.stats.passed}</dd></div><div><dt>${esc(T('stMeasured'))}</dt><dd>${measured}<small>/10</small></dd></div></dl>`
        btns = run + modeSw
      } else { btns = run + modeSw }
      verdict.dataset.tone = tone
      verdict.innerHTML = `<div class="dx-eyebrow"><span class="dx-dot"></span><span>${esc(eyebrow)}</span></div><h2 class="dx-title">${esc(title)}</h2><p class="dx-lead">${esc(lead)}</p>${stats}<div class="dx-actions" data-tour="diagnostics-scan">${btns}</div>`
      lat.label(ph === 'scan' ? T('scanning') : r && r.score != null ? T('score') : '')
    }

    verdict.addEventListener('click', e => {
      const b = e.target.closest('[data-act],[data-mode]'); if (!b) return
      if (b.dataset.mode) { S.mode = b.dataset.mode; paintVerdict(); return }
      if (b.dataset.act === 'scan') startScan(S.mode)
      else if (b.dataset.act === 'stop') A().diag2Abort()
    })

    function paintChips() {
      const r = S.report
      if (!r) { chips.innerHTML = ''; return }
      const counts = {}
      for (const f of r.findings) counts[f.subsystem] = (counts[f.subsystem] || 0) + 1
      chips.innerHTML = `<button type="button" class="dx-chip${S.filter ? '' : ' on'}" data-s="">${esc(T('all'))}<b>${r.findings.length}</b></button>` +
        root.JylliDiagLattice.SUBS.map(s => {
          const g = r.grades[s]
          return `<button type="button" class="dx-chip${S.filter === s ? ' on' : ''}" data-s="${s}" data-tone="${toneOf(g)}"><span>${esc(names[s])}</span><b>${g == null ? '–' : g}</b></button>`
        }).join('')
    }
    chips.addEventListener('click', e => { const b = e.target.closest('.dx-chip'); if (b) setFilter(b.dataset.s || null) })

    function fixButton(f) {
      const x = f.fix; if (!x) return ''
      const label = x.kind === 'repair' || x.kind === 'undo' ? T('f_' + f.id) : x.kind === 'external' ? T('f_' + f.id) : x.kind === 'view' ? T('fv_' + x.id) : T('open')
      const icon = x.kind === 'repair' ? 'wrench' : x.kind === 'undo' ? 'rotate-left' : x.kind === 'external' ? 'arrow-up-right-from-square' : 'arrow-right'
      return `<button type="button" class="dx-fix${x.kind === 'repair' || x.kind === 'undo' ? ' primary' : ''}" data-fix="${esc(f.id)}"><i class="fa fa-${icon}" aria-hidden="true"></i><span>${esc(label)}</span></button>`
    }

    function paintFindings() {
      const r = S.report
      if (!r) { list.innerHTML = ''; passedSlot.innerHTML = ''; return }
      const vis = visible(r.findings, S.filter)
      if (!vis.length) list.innerHTML = `<div class="dx-clear"><i class="fa fa-circle-check" aria-hidden="true"></i><div><b>${esc(S.filter ? T('clearSub', { sub: names[S.filter] }) : T('clearAll'))}</b><span>${esc(T('clearSub2'))}</span></div></div>`
      else list.innerHTML = vis.map(f => {
        const e = f.evidence
        const evHtml = e ? `<dl class="dx-ev" hidden><div><dt>${esc(T('evMeasured'))}</dt><dd>${esc(e.value)}${e.unit ? ' <small>' + esc(e.unit) + '</small>' : ''}</dd></div>${e.limit != null ? `<div><dt>${esc(T('evLimit'))}</dt><dd>${esc(e.limit)}</dd></div>` : ''}<div class="wide"><dt>${esc(T('evSource'))}</dt><dd>${esc(e.source)}</dd></div></dl>` : ''
        return `<article class="dx-f" data-sev="${f.severity}" data-s="${f.subsystem}" data-id="${esc(f.id)}">
          <div class="dx-f-head"><span class="dx-sev">${esc(T('sev_' + f.severity))}</span><span class="dx-fsub">${esc(names[f.subsystem])}</span></div>
          <h3>${esc(T('t_' + f.id, f.vars))}</h3><p>${esc(T('w_' + f.id, f.vars))}</p>${evHtml}
          <div class="dx-f-foot">${fixButton(f)}${e ? `<button type="button" class="dx-link" data-ev>${esc(T('evidence'))}</button>` : ''}</div></article>`
      }).join('')
      list.querySelectorAll('.dx-fix').forEach(b => {
        const f = r.findings.find(x => x.id === b.dataset.fix)
        if (f && f.fix && f.fix.kind === 'repair' && root.JylliHold) {
          A().diag2RepairMeta(f.fix.id).then(m => { if (m && m.risk === 'hold' && !S.disposed) { b.dataset.hold = '1'; root.JylliHold.attach(b, 650, () => runFix(f, b)) } }).catch(() => {})
        }
      })
      const n = r.passed.length
      passedSlot.innerHTML = n ? `<button type="button" class="dx-passed" aria-expanded="false"><i class="fa fa-circle-check" aria-hidden="true"></i><span>${esc(T('passedN', { n }))}</span><i class="fa fa-chevron-down dx-chev" aria-hidden="true"></i></button><div class="dx-passed-list" hidden>${r.passed.map(p => `<span class="dx-pill" data-s="${p.subsystem}">${esc(T('t_' + p.id + '_ok'))}</span>`).join('')}</div>` : ''
    }
    list.addEventListener('click', e => {
      const ev = e.target.closest('[data-ev]')
      if (ev) { const d = ev.closest('.dx-f').querySelector('.dx-ev'); if (d) d.hidden = !d.hidden; return }
      const b = e.target.closest('.dx-fix'); if (!b || b.dataset.hold === '1') return
      const f = S.report && S.report.findings.find(x => x.id === b.dataset.fix); if (f) runFix(f, b)
    })
    passedSlot.addEventListener('click', e => {
      const b = e.target.closest('.dx-passed'); if (!b) return
      const l = passedSlot.querySelector('.dx-passed-list'); l.hidden = !l.hidden; b.setAttribute('aria-expanded', String(!l.hidden))
    })

    function paintDiff() {
      const d = S.diff
      if (!d || (!d.appeared.length && !d.resolved.length && !Object.keys(d.deltas).length && !d.score)) { diffSlot.innerHTML = ''; return }
      const chip = (txt, t) => `<span class="dx-dchip" data-tone="${t}">${esc(txt)}</span>`
      const parts = []
      if (d.score) parts.push(chip(T('dScore', { d: (d.score > 0 ? '+' : '') + d.score }), d.score > 0 ? 'ok' : 'danger'))
      for (const [s, v] of Object.entries(d.deltas)) parts.push(chip(`${names[s]} ${v > 0 ? '+' : ''}${v}`, v > 0 ? 'ok' : 'danger'))
      if (d.resolved.length) parts.push(chip(T('dResolved', { n: d.resolved.length }), 'ok'))
      if (d.appeared.length) parts.push(chip(T('dAppeared', { n: d.appeared.length }), 'warn'))
      diffSlot.innerHTML = `<div class="dx-diff"><span class="dx-diff-t"><i class="fa fa-code-compare" aria-hidden="true"></i> ${esc(T('dTitle', { t: ago(Date.now() - d.since) }))}</span>${parts.join('')}</div>`
    }

    function paintNotes() {
      const r = S.report; const out = []
      if (r) {
        if (!r.admin) out.push(['user-shield', T('noAdmin')])
        if (r.probes.thermal && r.probes.thermal.error === 'skipped') out.push(['crown', T('proSkipped')])
        const failed = Object.entries(r.probes).filter(([, p]) => !p.ok && p.error !== 'skipped').length
        if (failed) out.push(['circle-question', T('unmeasured', { n: failed })])
      }
      notes.innerHTML = out.map(([i, t]) => `<div class="dx-note"><i class="fa fa-${i}" aria-hidden="true"></i><span>${esc(t)}</span></div>`).join('')
    }

    function badge(r) {
      const b = document.getElementById('badge-preflight'); if (!b) return
      if (r && r.stats.urgent > 0) { b.style.display = ''; b.textContent = String(r.stats.urgent) } else b.style.display = 'none'
    }

    function applyReport(r, diff, history) {
      S.report = r; S.diff = diff || null; if (history) S.history = history
      S.phase = 'ready'
      lat.state(r.tone === 'danger' ? 'bad' : 'done')
      for (const s of root.JylliDiagLattice.SUBS) lat.sub(s, { grade: r.grades[s], measured: r.grades[s] != null })
      lat.score(r.score, r.tone); lat.ripple()
      paintVerdict(); paintChips(); paintFindings(); paintDiff(); paintNotes(); badge(r)
      for (const k of Object.keys(built)) if (built[k].refresh) built[k].refresh()
    }

    // ── scan ──
    async function startScan(mode) {
      if (S.phase === 'scan') return
      S.mode = mode; S.phase = 'scan'; S.done = new Set(); S.error = null
      lat.reset(); lat.state('scan'); lat.select(null); S.filter = null
      const feed = feeds(mode)
      paintVerdict(); diffSlot.innerHTML = ''; list.innerHTML = ''; chips.innerHTML = ''; passedSlot.innerHTML = ''; notes.innerHTML = ''
      for (const s of root.JylliDiagLattice.SUBS) lat.sub(s, { progress: 0, grade: null, measured: !!feed[s] })
      const unsub = A().onDiag2Progress(p => {
        if (S.disposed || !p || p.kind !== 'scan') return
        if (p.state === 'done' || p.state === 'fail' || p.state === 'skip') S.done.add(p.probe)
        for (const s of (p.subs || [])) if (feed[s]) lat.sub(s, { progress: progress(feed[s], S.done), grade: null })
      })
      let r = null
      try { r = await A().diag2Scan({ mode }) } catch { r = { ok: false, error: 'scan-failed' } }
      try { unsub() } catch { /* already gone */ }
      if (S.disposed) return
      if (r && r.ok) { applyReport(r.report, r.diff, r.history); return }
      S.phase = S.report ? 'ready' : 'failed'; S.error = r && r.error
      if (r && r.aborted) { S.phase = S.report ? 'ready' : 'idle'; if (S.report) applyReport(S.report, null) }
      else if (S.report) { applyReport(S.report, null); try { root.toast(T('tFail'), r && r.error === 'game-running' ? T('lGame') : T('lFail'), 'err') } catch { /* toast not ready */ } }
      lat.state('idle'); paintVerdict()
    }

    // ── fixes ──
    async function runFix(f, btn) {
      const x = f.fix; if (!x || S.fixing) return
      if (x.kind === 'view') return show(x.id)
      if (x.kind === 'jump') return root.showPage(x.page, x.tab)
      if (x.kind === 'external') return A().openExternal(x.url)
      if (x.kind === 'undo') {
        const r = await A().runTweak(x.id, 'restore')
        root.toast(r && r.ok === false ? T('fixFailed', { why: r.error || '' }) : T('undoDone'), '', r && r.ok === false ? 'err' : 'ok')
        return startScan('quick')
      }
      const meta = await A().diag2RepairMeta(x.id)
      if (!meta) return
      if (meta.risk === 'confirm') {
        try { await root.showConfirm({ title: T('cf_title'), body: T('cb_' + x.id), okText: T('cf_ok'), okStyle: 'warning', icon: 'wrench' }) } catch { return }
      }
      S.fixing = x.id
      const label = btn && btn.querySelector('span'), old = label && label.textContent
      if (btn) btn.disabled = true
      if (label) label.textContent = T('fixing')
      const unsub = A().onDiag2Progress(p => { if (p && p.kind === 'fix' && label) label.textContent = p.phase === 'rp' ? T('fixRp') : p.step ? T('fixStep_' + p.step) : T('fixing') })
      let r
      try { r = await A().diag2Fix({ id: x.id, missing: (S.report && S.report.facts.runtimes && S.report.facts.runtimes.missing) || [] }) } catch { r = { ok: false, error: 'failed' } }
      try { unsub() } catch { /* gone */ }
      S.fixing = null
      if (S.disposed) return
      if (btn) btn.disabled = false
      if (label && old) label.textContent = old
      if (r && r.ok) {
        root.toast(T('fixDone'), T('fd_' + x.id), 'ok')
        if (r.restart && x.id !== 'restart') {
          try { await root.showConfirm({ title: T('rs_title'), body: T('rs_body'), okText: T('rs_ok'), okStyle: 'warning', icon: 'power-off' }); A().diag2Fix({ id: 'restart' }); return } catch { /* later */ }
        }
        if (x.id !== 'restart') startScan('quick')
      } else root.toast(T('fixFailed', { why: r && (r.reason === 'premium_required' ? T('proNeeded') : r.reason || r.error) || '' }), '', 'err')
    }

    // ── boot: show the last checkup straight away ──
    paintVerdict(); lat.reset()
    A().diag2Cached().then(c => {
      if (S.disposed || S.phase === 'scan' || !c || !c.ok) return
      S.history = c.history || []; S.bench = c.bench || null
      if (c.report) applyReport(c.report, null, c.history)
    }).catch(() => {})

    show('checkup')
    root.registerPageCleanup('preflight', () => { S.disposed = true; try { lat.destroy() } catch { /* gone */ } })
    return { rescan: startScan, state: S }
  }

  api.mount = mount
})(typeof window !== 'undefined' ? window : globalThis)
