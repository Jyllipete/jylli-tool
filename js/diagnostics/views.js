'use strict'
// Diagnostics secondary views, built the first time they are opened: Timeline, Drivers, Benchmarks, Report.
// Each builder is (host, ctx) -> { refresh() }; ctx comes from page.js ({ T, esc, el, ago, S, api, show, rescan, runFix }).
;(function (root) {
  const DAY = 86400000
  const SPIKE = { critical: 84, high: 58, medium: 36, low: 18 }

  // ── pure ──
  /** Time -> x on the 30-day axis. */
  const xOf = (t, from, to, w) => Math.max(0, Math.min(w, (t - from) / (to - from) * w))
  /** Incidents (sorted) -> groups; a gap over `gap` ms starts a new one. */
  function group(list, gap = 6 * 3600000) {
    const out = []
    for (const i of list.slice().sort((a, b) => a.ts - b.ts)) {
      const g = out[out.length - 1]
      if (g && i.ts - g.end <= gap) { g.items.push(i); g.end = i.ts } else out.push({ start: i.ts, end: i.ts, items: [i] })
    }
    return out
  }
  const worst = items => items.reduce((m, i) => (SPIKE[i.severity] || 0) > (SPIKE[m] || 0) ? i.severity : m, 'low')
  /** Driver age in days from a ms timestamp, null when unknown. */
  const driverAge = (t, now) => t ? Math.floor((now - t) / DAY) : null
  const driverStatus = d => d == null ? 'unknown' : d > 548 ? 'old' : d > 365 ? 'aging' : 'ok'
  /** Points of a run vs the baseline, per kind: { kind: percent|null }. */
  function deltas(run, base) {
    const out = {}
    for (const k of Object.keys((run && run.points) || {})) { const b = base && base.points && base.points[k]; out[k] = b ? Math.round((run.points[k] - b) / b * 1000) / 10 : null }
    return out
  }
  /** Polyline points for a sparkline in a w x h box; null values break nothing (skipped). */
  function spark(vals, w, h, lo, hi) {
    const v = vals.filter(x => x != null)
    if (v.length < 2) return ''
    const a = lo != null ? lo : Math.min(...v), b = hi != null ? hi : Math.max(...v), span = b - a || 1
    return vals.map((x, i) => x == null ? null : `${(i / (vals.length - 1) * w).toFixed(1)},${(h - (x - a) / span * (h - 4) - 2).toFixed(1)}`).filter(Boolean).join(' ')
  }

  const views = {}
  root.JylliDiagViews = views
  const api = { xOf, group, worst, driverAge, driverStatus, deltas, spark, SPIKE, views }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  const SUBS = () => root.JylliDiagLattice.SUBS
  const driverLinks = { nvidia: 'https://www.nvidia.com/drivers', amd: 'https://www.amd.com/support', intel: 'https://www.intel.com/content/www/us/en/download-center/home.html', realtek: 'https://www.realtek.com/en/downloads' }
  const fmtDate = t => t ? new Date(t).toLocaleDateString() : '–'
  const fmtDay = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  // ═══════════════ Timeline ═══════════════
  views.timeline = (host, ctx) => {
    const { T, esc, el, S } = ctx
    const stage = el('section', 'dx-panel dx-tl')
    const detail = el('section', 'dx-panel dx-tl-detail')
    host.append(stage, detail)
    let sel = null

    function incText(i) {
      const bc = i.kind === 'bugcheck' && i.code ? T('bc_' + i.code) : ''
      const base = T('inc_' + i.kind)
      return { title: base + (i.n > 1 ? ' ×' + i.n : ''), body: bc && bc !== 'bc_' + i.code ? bc : (i.detail || ''), code: i.code ? (i.kind === 'bugcheck' ? '0x' + String(i.code).toUpperCase() : 'ID ' + i.code) : '' }
    }

    function paint() {
      const r = S.report
      if (!r) { stage.innerHTML = `<div class="dx-empty"><i class="fa fa-wave-square" aria-hidden="true"></i><b>${esc(T('tlNone'))}</b><span>${esc(T('tlNoneSub'))}</span></div>`; detail.innerHTML = ''; return }
      const to = r.takenAt, from = to - 30 * DAY, W = 960
      const serious = r.incidents.filter(i => i.kind !== 'app-crash' && i.kind !== 'app-hang' && i.ts >= from)
      const apps = r.incidents.filter(i => (i.kind === 'app-crash' || i.kind === 'app-hang') && i.ts >= from)
      const groups = group(serious)
      const ticks = Array.from({ length: 5 }, (_, i) => { const t = from + i * 7.5 * DAY; return `<g><line class="dx-gl" x1="${xOf(t, from, to, W)}" x2="${xOf(t, from, to, W)}" y1="14" y2="262"/><text class="dx-axis" x="${xOf(t, from, to, W) + 4}" y="272">${esc(fmtDay(t))}</text></g>` }).join('')
      const spikes = groups.map((g, gi) => { const x = xOf(g.start, from, to, W), h = SPIKE[worst(g.items)] || 18; return `<g class="dx-spike${sel === gi ? ' on' : ''}" data-g="${gi}" data-sev="${worst(g.items)}" tabindex="0" role="button" aria-label="${esc(T('tlSpikeLabel', { n: g.items.length, d: fmtDay(g.start) }))}"><line x1="${x}" x2="${x}" y1="${72 - h}" y2="${72 + h}"/><circle cx="${x}" cy="${72 - h}" r="3.5"/><rect class="hit" x="${x - 9}" y="${72 - 90}" width="18" height="180"/></g>` }).join('')
      const appTicks = apps.map(i => `<line class="dx-apptick" x1="${xOf(i.ts, from, to, W)}" x2="${xOf(i.ts, from, to, W)}" y1="68" y2="76"/>`).join('')
      const idx = r.index || []
      const line = idx.length >= 2 ? `<polyline class="dx-idx" points="${idx.map(p => `${xOf(p.t, from, to, W).toFixed(1)},${(200 - p.v / 10 * 52).toFixed(1)}`).join(' ')}"/>` : `<text class="dx-axis" x="8" y="176">${esc(T('tlNoIndex'))}</text>`
      const changes = (r.changes || []).filter(c => c.ts >= from).map(c => { const x = xOf(c.ts, from, to, W); return `<g class="dx-chg" data-k="${c.kind}"><title>${esc(c.label)}</title><rect x="${x - 3.5}" y="236" width="7" height="7" transform="rotate(45 ${x} 239.5)"/></g>` }).join('')
      stage.innerHTML = `<div class="dx-panel-h"><h3>${esc(T('tlTitle'))}</h3><div class="dx-legend"><span data-k="inc">${esc(T('tlLegInc'))}</span><span data-k="idx">${esc(T('tlLegIdx'))}</span><span data-k="driver">${esc(T('tlLegDriver'))}</span><span data-k="update">${esc(T('tlLegUpdate'))}</span><span data-k="tweak">${esc(T('tlLegTweak'))}</span></div></div>
        <svg class="dx-seis" viewBox="0 0 ${W} 280" preserveAspectRatio="none" role="img" aria-label="${esc(T('tlTitle'))}">${ticks}<line class="dx-centre-l" x1="0" x2="${W}" y1="72" y2="72"/>${appTicks}${spikes}<text class="dx-axis" x="8" y="130">${esc(T('tlBandIdx'))}</text>${line}<text class="dx-axis" x="8" y="232">${esc(T('tlBandChg'))}</text>${changes}</svg>
        ${groups.length ? '' : `<p class="dx-calm"><i class="fa fa-circle-check" aria-hidden="true"></i> ${esc(T('tlCalm'))}</p>`}`
      stage.querySelectorAll('.dx-spike').forEach(s => { const pick = () => { sel = +s.dataset.g; paint(); paintDetail(groups) }; s.addEventListener('click', pick); s.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick() } }) })
      if (sel == null && groups.length) sel = groups.length - 1
      paintDetail(groups)
    }

    function paintDetail(groups) {
      const r = S.report; const g = groups && groups[sel]
      if (!g) { detail.innerHTML = ''; return }
      const cause = (r.causes || []).find(c => c.at.some(a => a.ts >= g.start - 3600000 && a.ts <= g.end + 3600000))
      const rows = g.items.map(i => { const t = incText(i); return `<li data-sev="${i.severity}"><span class="dx-sev">${esc(T('sev_' + i.severity))}</span><div><b>${esc(t.title)}${t.code ? ` <code>${esc(t.code)}</code>` : ''}</b><span>${esc(t.body)}</span>${i.file ? `<small>${esc(i.file)}</small>` : ''}<small>${esc(new Date(i.ts).toLocaleString())}</small></div></li>` }).join('')
      let causeHtml = ''
      if (cause) {
        const k = cause.change.kind
        const btn = k === 'tweak' && cause.change.id ? `<button type="button" class="dx-fix primary" data-undo="${esc(cause.change.id)}"><i class="fa fa-rotate-left" aria-hidden="true"></i><span>${esc(T('f_suspect-change'))}</span></button>` : k === 'driver' ? `<button type="button" class="dx-fix" data-view="drivers"><i class="fa fa-arrow-right" aria-hidden="true"></i><span>${esc(T('fv_drivers'))}</span></button>` : ''
        causeHtml = `<div class="dx-cause" data-c="${cause.confidence}"><div class="dx-cause-h"><i class="fa fa-magnifying-glass-chart" aria-hidden="true"></i><b>${esc(T('causeTitle'))}</b><span class="dx-conf">${esc(T('conf_' + cause.confidence))}</span></div><p>${esc(T('t_suspect-change', { what: cause.change.label, h: Math.max(1, Math.round(cause.gapMs / 3600000)), n: cause.count, c: T('conf_' + cause.confidence) }))}</p>${btn}</div>`
      }
      detail.innerHTML = `<div class="dx-panel-h"><h3>${esc(T('tlDetail', { d: fmtDay(g.start) }))}</h3></div>${causeHtml}<ul class="dx-inc">${rows}</ul>`
      detail.querySelectorAll('[data-undo]').forEach(b => b.addEventListener('click', () => ctx.runFix({ fix: { kind: 'undo', id: b.dataset.undo } }, b)))
      detail.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => ctx.show(b.dataset.view)))
    }
    paint()
    return { refresh() { sel = null; paint() } }
  }

  // ═══════════════ Drivers ═══════════════
  views.drivers = (host, ctx) => {
    const { T, esc, el, S } = ctx
    const body = el('div', 'dx-drv')
    host.appendChild(body)
    function paint() {
      const r = S.report
      if (!r) { body.innerHTML = `<div class="dx-empty"><i class="fa fa-plug" aria-hidden="true"></i><b>${esc(T('drNone'))}</b><span>${esc(T('drNoneSub'))}</span><button type="button" class="dx-cta" data-run><i class="fa fa-stethoscope" aria-hidden="true"></i><span>${esc(T('runCheckup'))}</span></button></div>`; body.querySelector('[data-run]').onclick = () => ctx.rescan('quick'); return }
      const now = r.takenAt
      const dev = r.facts.devices || []
      const list = (r.facts.drivers || []).map(d => ({ ...d, age: driverAge(d.t, now) })).sort((a, b) => (b.age == null ? -1 : b.age) - (a.age == null ? -1 : a.age))
      const miss = (r.facts.runtimes && r.facts.runtimes.missing) || []
      const gpuIssue = r.findings.some(f => f.id === 'gpu-driver-old' || f.id === 'crash-gpu-reset')
      const devHtml = dev.length ? `<section class="dx-panel"><div class="dx-panel-h"><h3>${esc(T('drDevices'))}</h3><span class="dx-count" data-tone="danger">${dev.length}</span></div><ul class="dx-dev">${dev.map(d => `<li><i class="fa fa-triangle-exclamation" aria-hidden="true"></i><div><b>${esc(d.n || T('drUnknown'))}</b><span>${esc(T('drCode', { c: d.code }))}</span></div></li>`).join('')}</ul></section>` : ''
      const rows = list.map(d => {
        const st = driverStatus(d.age), mfr = String(d.m || '').toLowerCase(), k = Object.keys(driverLinks).find(x => mfr.includes(x))
        const url = k ? driverLinks[k] : 'https://www.google.com/search?q=' + encodeURIComponent((d.m || '') + ' ' + (d.n || '') + ' driver download')
        const pct = d.age == null ? 0 : Math.min(100, Math.round(d.age / 730 * 100))
        return `<div class="dx-drow" data-st="${st}"><div class="dx-dname"><b>${esc(d.n)}</b><span>${esc(d.m)} · v${esc(d.v || '?')}</span></div><div class="dx-dage"><i style="width:${pct}%"></i></div><div class="dx-ddate">${esc(fmtDate(d.t))}</div><div class="dx-dst">${esc(T('drSt_' + st))}</div><button type="button" class="dx-link" data-url="${esc(url)}">${esc(T('drFind'))}</button></div>`
      }).join('')
      const drvHtml = `<section class="dx-panel"><div class="dx-panel-h"><h3>${esc(T('drTitle'))}</h3><button type="button" class="dx-sec sm" data-run><i class="fa fa-rotate" aria-hidden="true"></i><span>${esc(T('drRescan'))}</span></button></div>${rows ? `<div class="dx-dlist">${rows}</div>` : `<p class="dx-muted">${esc(T('drNoList'))}</p>`}</section>`
      const rtHtml = miss.length ? `<section class="dx-panel"><div class="dx-panel-h"><h3>${esc(T('rtTitle'))}</h3></div><p class="dx-muted">${esc(T('rtSub'))}</p><div class="dx-pills">${miss.map(m => `<span class="dx-pill">${esc(m)}</span>`).join('')}</div><div class="dx-f-foot"><button type="button" class="dx-fix primary" data-rt><i class="fa fa-box-open" aria-hidden="true"></i><span>${esc(T('f_runtimes-missing'))}</span></button></div></section>` : ''
      const dduHtml = gpuIssue ? `<section class="dx-panel pf-action-card"><div class="dx-panel-h"><h3>${esc(tUI('pfDriverReinstallTitle'))}</h3></div><p class="dx-muted">${esc(tUI('pfDriverReinstallDesc'))}</p><div class="pf-action-footer"><button type="button" class="dx-fix primary" id="pf-ddu-btn" onclick="beginDduReinstall()"><i class="fa fa-play" aria-hidden="true"></i><span>${esc(tUI('pfDriverReinstallBtn'))}</span></button></div></section>` : ''
      body.innerHTML = devHtml + drvHtml + rtHtml + dduHtml
      body.querySelectorAll('[data-run]').forEach(b => b.addEventListener('click', () => ctx.rescan('quick')))
      body.querySelectorAll('[data-url]').forEach(b => b.addEventListener('click', () => ctx.api.openExternal(b.dataset.url)))
      const rt = body.querySelector('[data-rt]'); if (rt) rt.addEventListener('click', () => ctx.runFix({ fix: { kind: 'repair', id: 'runtimes' } }, rt))
    }
    paint()
    return { refresh: paint }
  }

  // ═══════════════ Benchmarks ═══════════════
  views.bench = (host, ctx) => {
    const { T, esc, el, S } = ctx
    const KINDS = ['cpu1', 'cpuN', 'mem', 'disk']
    const ICON = { cpu1: 'microchip', cpuN: 'layer-group', mem: 'memory', disk: 'hard-drive' }
    const head = el('section', 'dx-panel dx-bench-h')
    const grid = el('div', 'dx-tiles')
    const foot = el('p', 'dx-muted dx-bench-note')
    host.append(head, grid, foot)
    let running = null, unsub = null
    const state = () => S.bench || { runs: [], baseline: null }

    function paint() {
      const b = state(), last = b.runs[b.runs.length - 1] || null, d = last ? deltas(last, b.baseline) : {}
      head.innerHTML = `<div><h3>${esc(T('bnTitle'))}</h3><p class="dx-muted">${esc(T('bnSub'))}</p></div><div class="dx-actions"><button type="button" class="dx-cta" data-run ${running ? 'disabled' : ''}><i class="fa fa-${running ? 'spinner fa-spin' : 'play'}" aria-hidden="true"></i><span>${esc(running ? T('bnRunning') : last ? T('bnAgain') : T('bnRun'))}</span></button>${b.runs.length ? `<button type="button" class="dx-sec" data-pin><span>${esc(T('bnPin'))}</span></button><button type="button" class="dx-sec" data-reset><span>${esc(T('bnReset'))}</span></button>` : ''}</div>`
      grid.innerHTML = KINDS.map(k => {
        const pts = last && last.points[k], hist = b.runs.map(r => r.points[k] == null ? null : r.points[k]), dl = d[k]
        const live = running && running.kind === k
        const chip = dl == null ? '' : `<span class="dx-delta" data-tone="${dl > 1 ? 'ok' : dl < -1 ? 'danger' : 'idle'}">${dl > 0 ? '+' : ''}${dl}%</span>`
        const poly = spark(hist, 160, 36)
        return `<article class="dx-tile${live ? ' live' : ''}" data-k="${k}"><div class="dx-tile-h"><i class="fa fa-${ICON[k]}" aria-hidden="true"></i><b>${esc(T('bn_' + k))}</b>${chip}</div><div class="dx-tile-v">${pts != null ? pts.toLocaleString() : '–'}<small>${esc(T('bnPts'))}</small></div>${poly ? `<svg class="dx-spark" viewBox="0 0 160 36" preserveAspectRatio="none" aria-hidden="true"><polyline points="${poly}"/></svg>` : '<div class="dx-spark-empty"></div>'}<span class="dx-tile-s">${esc(T('bnd_' + k))}</span></article>`
      }).join('')
      foot.textContent = b.baseline ? T('bnBase', { d: new Date(b.baseline.ts).toLocaleDateString() }) + ' ' + T('bnRef') : T('bnRef')
      if (last && last.detail && last.detail.disk && last.detail.disk.cached) foot.textContent += ' ' + T('bnCached')
    }
    head.addEventListener('click', async e => {
      const t = e.target.closest('[data-run],[data-pin],[data-reset]'); if (!t) return
      if (t.dataset.pin !== undefined) { const r = await ctx.api.diag2BenchBaseline({ pin: true }); S.bench = { runs: r.runs, baseline: r.baseline }; return paint() }
      if (t.dataset.reset !== undefined) { const r = await ctx.api.diag2BenchBaseline({ reset: true }); S.bench = { runs: r.runs, baseline: r.baseline }; return paint() }
      if (running) return
      running = { kind: KINDS[0] }; paint()
      unsub = ctx.api.onDiag2Progress(p => { if (p && p.kind === 'bench' && p.phase === 'start') { running = { kind: p.bench }; paint() } })
      let r; try { r = await ctx.api.diag2Bench(KINDS) } catch { r = { ok: false, error: 'failed' } }
      try { unsub() } catch { /* gone */ }
      running = null
      if (r && r.ok) S.bench = { runs: r.runs, baseline: r.baseline }
      else root.toast(T('bnFailTitle'), r && r.error === 'game-running' ? T('lGame') : T('bnFail'), 'err')
      paint()
    })
    paint()
    return { refresh: paint }
  }

  // ═══════════════ Report ═══════════════
  /** Plain-text summary (Discord / support). */
  function textReport(r, T) {
    const subs = SUBS()
    const lines = [`Jylli Tool – ${T('rpTitle')}`, new Date(r.takenAt).toLocaleString(), '', `${T('score')}: ${r.score == null ? '–' : r.score + '/100'}`, '']
    for (const s of subs) lines.push(`${T('sub_' + s)}: ${r.grades[s] == null ? T('notMeasured') : r.grades[s]}`)
    if (r.findings.length) { lines.push('', T('rpFindings') + ':'); for (const f of r.findings) lines.push(`- [${T('sev_' + f.severity)}] ${T('t_' + f.id, f.vars)}`) }
    else lines.push('', T('clearAll'))
    return lines.join('\n')
  }
  /** Self-contained HTML document; colours are read from the app's tokens at export time. */
  function htmlReport(r, T) {
    const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim()
    const e = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
    const tc = g => g == null ? 'n' : g >= 80 ? 'ok' : g >= 50 ? 'w' : 'd'
    const subs = SUBS().map(s => `<div class="c"><span>${e(T('sub_' + s))}</span><b class="${tc(r.grades[s])}">${r.grades[s] == null ? '–' : r.grades[s]}</b></div>`).join('')
    const fs = r.findings.map(f => `<li><b>${e(T('sev_' + f.severity))}</b> ${e(T('t_' + f.id, f.vars))}<br><small>${e(T('w_' + f.id, f.vars))}${f.evidence ? ' — ' + e(f.evidence.value) + ' ' + e(f.evidence.unit || '') + ' (' + e(f.evidence.source) + ')' : ''}</small></li>`).join('')
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(T('rpTitle'))}</title><style>
body{margin:0;padding:32px 16px;background:${v('--surface-0')};color:${v('--c-text-primary')};font:14px/1.5 system-ui,sans-serif}main{max-width:760px;margin:0 auto}
h1{font-size:24px;margin:0 0 4px}.m{color:${v('--c-text-tertiary')};margin:0 0 20px}.big{font:600 56px/1 ui-monospace,monospace;color:${v('--c-text-primary')}}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin:20px 0}.c{background:${v('--surface-1')};border:1px solid ${v('--hairline-strong')};border-radius:10px;padding:10px 12px;display:flex;justify-content:space-between}
ul{padding:0;list-style:none}li{background:${v('--surface-1')};border:1px solid ${v('--hairline-strong')};border-radius:10px;padding:10px 12px;margin:8px 0}small{color:${v('--c-text-secondary')}}</style></head><body><main>
<h1>${e(T('rpTitle'))}</h1><p class="m">${e(new Date(r.takenAt).toLocaleString())}</p><div class="big ${tc(r.score)}">${r.score == null ? '–' : r.score}<small> /100</small></div><div class="g">${subs}</div><h2>${e(T('rpFindings'))}</h2>${fs ? `<ul>${fs}</ul>` : `<p>${e(T('clearAll'))}</p>`}</main></body></html>`
  }
  api.textReport = textReport

  views.report = (host, ctx) => {
    const { T, esc, el, S } = ctx
    const top = el('section', 'dx-panel dx-rp-h')
    const grid = el('div', 'dx-spark-grid')
    host.append(top, grid)
    function paint() {
      const h = S.history || [], r = S.report
      top.innerHTML = `<div><h3>${esc(T('rpTitle'))}</h3><p class="dx-muted">${esc(r ? T('rpSub', { n: h.length }) : T('rpNone'))}</p></div><div class="dx-actions"><button type="button" class="dx-cta" data-exp ${r ? '' : 'disabled'}><i class="fa fa-file-export" aria-hidden="true"></i><span>${esc(T('rpExport'))}</span></button><button type="button" class="dx-sec" data-copy ${r ? '' : 'disabled'}><i class="fa fa-copy" aria-hidden="true"></i><span>${esc(T('rpCopy'))}</span></button></div>`
      const series = [{ id: 'score', vals: h.map(x => x.score) }, ...SUBS().map(s => ({ id: s, vals: h.map(x => x.grades && x.grades[s] != null ? x.grades[s] : null) }))]
      grid.innerHTML = series.map(s => {
        const last = [...s.vals].reverse().find(x => x != null), poly = spark(s.vals, 200, 44, 0, 100)
        return `<article class="dx-spark-card" data-tone="${ctx.toneOf(last == null ? null : last)}"><div class="dx-tile-h"><b>${esc(s.id === 'score' ? T('score') : T('sub_' + s.id))}</b><span class="dx-sc">${last == null ? '–' : last}</span></div>${poly ? `<svg viewBox="0 0 200 44" preserveAspectRatio="none" class="dx-spark" aria-hidden="true"><polyline points="${poly}"/></svg>` : `<div class="dx-spark-empty">${esc(T('rpNeedTwo'))}</div>`}</article>`
      }).join('')
    }
    top.addEventListener('click', async e => {
      const b = e.target.closest('[data-exp],[data-copy]'); if (!b || !S.report) return
      if (b.dataset.copy !== undefined) { try { await navigator.clipboard.writeText(textReport(S.report, T)); root.toast(T('rpCopied'), '', 'ok') } catch { root.toast(T('rpCopyFail'), '', 'err') } return }
      const r = await ctx.api.diag2ExportSave({ name: 'jylli-health-report', html: htmlReport(S.report, T) })
      if (r && r.ok) root.toast(T('rpSaved'), r.path, 'ok')
      else if (r && !r.canceled) root.toast(T('rpSaveFail'), '', 'err')
    })
    paint()
    return { refresh: paint }
  }
})(typeof window !== 'undefined' ? window : globalThis)
