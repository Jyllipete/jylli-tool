'use strict'
// Network tab cards: Overview (checkup progress, findings), the resolver card, and the Measure view (speed, game servers, live trace).
// page.js owns state and passes `ctx` ({ S, T, esc, el, P, api, nameOf, model, toast, ... }); everything here is drawn from that state, nothing is invented.
;(function (root) {
  const C = { overview() {}, resolver() {}, measure() {} }
  root.JylliNetworkCards = C
  if (typeof module !== 'undefined' && module.exports) module.exports = C
  if (typeof document === 'undefined') return

  const FIND_ICON = { drifted: 'rotate-left', tune: 'wand-magic-sparkles', restart: 'rotate-right', 'wifi-path': 'wifi', 'wifi-weak': 'wifi', 'wifi-band': 'wifi', 'link-slow': 'ethernet', 'dns-down': 'globe', 'dns-slow': 'globe', bufferbloat: 'gauge-high' }
  const SNAP_KEY = 'jt_net2_games'
  const readSnap = () => { try { const v = JSON.parse(localStorage.getItem(SNAP_KEY)); return v && v.rows ? v : null } catch (e) { return null } }
  const fmtAgo = (ctx, ms) => { const a = ctx.P.ago(ms); return a ? ctx.T('ago_' + a.k, { n: a.n }) : '' }

  // ───────────────────────── Overview ─────────────────────────
  C.overview = function (slot, ctx) {
    const { S, T, esc, P } = ctx
    if (S.phase === 'checkup') {
      const ck = S.ck || {}
      const order = ['switches', 'path', 'dns']
      const at = order.indexOf(ck.phase)
      const step = (id, ico, sub) => {
        const i = order.indexOf(id), st = i < at ? 'done' : i === at ? 'on' : 'wait'
        return `<li data-s="${st}"><span class="nt-step-ico"><i class="fa fa-${st === 'done' ? 'check' : st === 'on' ? 'circle-notch fa-spin' : ico}" aria-hidden="true"></i></span><span class="nt-step-t"><b>${esc(T('ckStep_' + id))}</b><span>${esc(sub)}</span></span></li>`
      }
      const pathSub = ck.phase === 'path' && ck.total ? T('ckPathProg', { n: ck.done || 0, total: ck.total }) : T('ckStepS_path')
      slot.innerHTML = `<section class="nt-card nt-run" role="status" aria-live="polite"><header class="nt-card-h"><div><b>${esc(T('ckRunT'))}</b><span>${esc(T('ckRunS'))}</span></div></header>
        <ol class="nt-steps">${step('switches', 'toggle-on', T('ckStepS_switches'))}${step('path', 'route', pathSub)}${step('dns', 'globe', T('ckStepS_dns'))}</ol>
        ${ck.phase === 'path' && ck.total ? `<div class="nt-bar-prog" aria-hidden="true"><i style="width:${Math.round(((ck.done || 0) / ck.total) * 100)}%"></i></div>` : ''}</section>`
      return
    }
    const last = S.last
    if (!last) {
      slot.innerHTML = `<section class="nt-card nt-intro"><div class="nt-intro-ico"><i class="fa fa-route" aria-hidden="true"></i></div><div class="nt-intro-t"><b>${esc(T('introT'))}</b><p>${esc(T('introS'))}</p>
        <ul class="nt-intro-list"><li><i class="fa fa-toggle-on" aria-hidden="true"></i>${esc(T('introA'))}</li><li><i class="fa fa-route" aria-hidden="true"></i>${esc(T('introB'))}</li><li><i class="fa fa-globe" aria-hidden="true"></i>${esc(T('introC'))}</li></ul>
        <button type="button" class="nt-cta" data-act="checkup"><i class="fa fa-stethoscope" aria-hidden="true"></i>${esc(T('ctaCheckup'))}</button></div></section>`
      return
    }
    const nameOf = ctx.nameOf
    const finds = last.findings || []
    const head = []
    if (last.healthy) {
      const n = (last.path && last.path.nodes) || []
      const rt = n.find(x => x.id === 'router'), net = n.find(x => x.id === 'internet')
      const dns = last.bench && last.bench.current && !last.bench.current.fail ? last.bench.current.median : null
      head.push(`<section class="nt-card nt-healthy" data-tone="ok"><span class="nt-find-ico"><i class="fa fa-check" aria-hidden="true"></i></span><div class="nt-find-t"><b>${esc(T('healthyT'))}</b><span>${esc(T('healthyS'))}</span></div>
        <dl class="nt-facts">${rt && rt.ms != null ? `<div><dt>${esc(T('nd_router'))}</dt><dd>${esc(P.fmtMs(rt.ms))}<small>ms</small></dd></div>` : ''}${net && net.ms != null ? `<div><dt>${esc(T('nd_internet'))}</dt><dd>${esc(P.fmtMs(net.ms))}<small>ms</small></dd></div>` : ''}${dns != null ? `<div><dt>${esc(T('factDns'))}</dt><dd>${esc(P.fmtMs(dns))}<small>ms</small></dd></div>` : ''}</dl></section>`)
    } else if (!last.measured) {
      head.push(`<section class="nt-card nt-warnbox" data-tone="warn"><span class="nt-find-ico"><i class="fa fa-plug-circle-exclamation" aria-hidden="true"></i></span><div class="nt-find-t"><b>${esc(T('noTraceT'))}</b><span>${esc(T('noTraceS'))}</span></div></section>`)
    }
    const rows = finds.map(f => {
      const v = P.findingVars(f, nameOf)
      if (v.best) v.best = T('preset_' + v.best)
      const icon = f.id.startsWith('path-') ? 'route' : FIND_ICON[f.id] || 'circle-info'
      const a = f.action || {}
      let btn = ''
      if (S.doneFinds && S.doneFinds.has(f.id) && (a.kind === 'tweak' || a.kind === 'dns')) btn = `<span class="nt-done"><i class="fa fa-check" aria-hidden="true"></i>${esc(T('done'))}</span>`
      else if (a.kind === 'tweak') btn = `<button type="button" class="nt-cta sm" data-act="find-tweak" data-id="${esc(f.id)}"><i class="fa fa-${f.id === 'drifted' ? 'rotate-left' : 'wand-magic-sparkles'}" aria-hidden="true"></i>${esc(T(f.id === 'drifted' ? 'ctaPutBack' : 'ctaApply', { n: v.n }))}</button>`
      else if (a.kind === 'dns') btn = `<button type="button" class="nt-cta sm" data-act="find-dns" data-preset="${esc(a.preset)}"><i class="fa fa-globe" aria-hidden="true"></i>${esc(T('ctaUseDns', { best: T('preset_' + a.preset) }))}</button>`
      else if (a.kind === 'view') btn = `<button type="button" class="nt-sec sm" data-act="find-view" data-view="${esc(a.view)}"><i class="fa fa-chart-line" aria-hidden="true"></i>${esc(T('ctaWatch'))}</button>`
      return `<article class="nt-find" data-tone="${f.tone}" data-id="${esc(f.id)}"><span class="nt-find-ico"><i class="fa fa-${icon}" aria-hidden="true"></i></span><div class="nt-find-t"><b>${esc(T('fT_' + f.id, v))}</b><span>${esc(T('fS_' + f.id, v))}</span></div><div class="nt-find-act">${btn}</div></article>`
    }).join('')
    slot.innerHTML = `${head.join('')}${rows ? `<div class="nt-finds">${rows}</div>` : ''}<p class="nt-foot"><i class="fa fa-clock" aria-hidden="true"></i>${esc(T('ckWhen', { when: fmtAgo(ctx, last.at) }))}${S.outdated ? `<span>${esc(T('ckOutdated'))}</span><button type="button" class="nt-link" data-act="checkup">${esc(T('ckAgain'))}</button>` : ''}</p>`
  }

  // ───────────────────────── Resolver ─────────────────────────
  C.resolver = function (slot, ctx, rowHtml) {
    const { S, T, esc, P } = ctx
    const m = ctx.model()
    if (!m) { slot.innerHTML = `<section class="nt-card nt-resolver sk"><div class="nt-sk" style="height:130px"></div></section>`; return }
    const rs = m.resolver
    const bench = S.bench || {}
    const busy = S.phase === 'running'
    const presets = [{ id: 'auto', servers: rs.current === 'auto' ? rs.servers : [] }].concat(rs.presets.map(p => ({ id: p.id, servers: p.servers })), [{ id: 'custom', servers: rs.custom.primary ? [rs.custom.primary, rs.custom.secondary].filter(Boolean) : [] }])
    const card = p => {
      const on = rs.known && rs.current === p.id
      const b = bench[p.id]
      const ms = b && !b.fail && b.median != null ? `<span class="nt-ms mono">${esc(P.fmtMs(b.median))}<small>ms</small></span>` : b && b.fail ? `<span class="nt-ms mono down">${esc(T('dnsDown'))}</span>` : ''
      return `<button type="button" role="radio" aria-checked="${on}" class="nt-preset${on ? ' on' : ''}" data-act="preset" data-preset="${p.id}"${busy ? ' disabled' : ''}>
        <span class="nt-preset-h"><b>${esc(T('preset_' + p.id))}</b>${ms}</span><span class="nt-preset-s">${esc(T('presetS_' + p.id))}</span><span class="nt-preset-ip mono">${esc(p.servers.join(' · ') || (p.id === 'custom' ? T('dnsNotSet') : ''))}</span>${on ? `<i class="nt-preset-tick fa fa-check" aria-hidden="true"></i>` : ''}</button>`
    }
    const now = !rs.known ? T('dnsUnknown') : rs.current === 'other' ? T('dnsOther', { ip: rs.servers.join(', ') }) : T('dnsNow', { name: T('preset_' + rs.current), ip: rs.servers.join(', ') })
    slot.innerHTML = `<section class="nt-card nt-resolver" data-tour="net-resolver"><header class="nt-card-h"><div><b>${esc(T('resolverT'))}</b><span>${esc(rs.adapter ? T('resolverS', { adapter: rs.adapter }) : T('resolverS0'))}</span></div>
      <button type="button" class="nt-sec sm" data-act="bench"${S.benching || busy ? ' disabled' : ''}><i class="fa fa-${S.benching ? 'circle-notch fa-spin' : 'stopwatch'}" aria-hidden="true"></i>${esc(T(S.benching ? 'benching' : 'ctaBench'))}</button></header>
      <div class="nt-presets" role="radiogroup" aria-label="${esc(T('resolverT'))}">${presets.map(card).join('')}</div>
      <p class="nt-now"><i class="fa fa-circle-info" aria-hidden="true"></i>${esc(now)}</p>
      ${rs.differs.length ? `<p class="nt-now warn"><i class="fa fa-triangle-exclamation" aria-hidden="true"></i>${esc(T('dnsDiffers', { n: rs.differs.length, names: rs.differs.slice(0, 2).join(', ') }))}</p>` : ''}
      ${rowHtml ? `<div class="nt-rows nt-doh">${rowHtml}</div>` : ''}</section>`
  }

  // ───────────────────────── Measure ─────────────────────────
  C.measure = function (slot, ctx) {
    const { S, T, esc, el, P } = ctx
    const api = ctx.api
    const M = S.m || (S.m = { speed: { state: 'idle', phase: null, mbps: null, res: null, hist: [] }, games: { state: 'idle', rows: [], done: 0, total: 0 }, live: { state: 'idle', host: '1.1.1.1', series: [], hops: [], rounds: 0 } })
    const sp = el('section', 'nt-card nt-speed'), gm = el('section', 'nt-card nt-games'), lv = el('section', 'nt-card nt-live')
    sp.dataset.tour = 'net-speed'; lv.dataset.tour = 'net-live'
    slot.append(sp, gm, lv)
    let offSpeed = null, offPing = null

    // ── speed ──
    function paintSpeed() {
      const s = M.speed
      const last = s.res || (s.hist[0] ? { downMbps: s.hist[0].downMbps, upMbps: s.hist[0].upMbps, latency: { ms: s.hist[0].latencyMs, jitterMs: s.hist[0].jitterMs }, loadedLatency: { ms: s.hist[0].loadedLatencyMs }, colo: s.hist[0].colo, t: s.hist[0].t } : null)
      const run = s.state === 'run'
      let body = ''
      if (run) {
        body = `<div class="nt-gauge" role="status" aria-live="polite"><span class="nt-gauge-k">${esc(T(s.phase === 'up' ? 'spUp' : 'spDown'))}</span><b class="mono">${s.mbps ? Math.round(s.mbps) : '…'}</b><small>Mbps</small></div>`
      } else if (last) {
        const extra = last.loadedLatency && last.loadedLatency.ms != null && last.latency && last.latency.ms != null ? Math.round(last.loadedLatency.ms - last.latency.ms) : null
        const g = P.bloatGrade(extra)
        body = `<dl class="nt-big"><div><dt>${esc(T('spDown'))}</dt><dd>${last.downMbps != null ? Math.round(last.downMbps) : '–'}<small>Mbps</small></dd></div><div><dt>${esc(T('spUp'))}</dt><dd>${last.upMbps != null ? Math.round(last.upMbps) : '–'}<small>Mbps</small></dd></div><div><dt>${esc(T('spLat'))}</dt><dd>${esc(P.fmtMs(last.latency && last.latency.ms))}<small>ms</small></dd></div><div><dt>${esc(T('spJit'))}</dt><dd>${esc(P.fmtMs(last.latency && last.latency.jitterMs))}<small>ms</small></dd></div>
          <div data-tone="${P.gradeTone(g)}"><dt>${esc(T('spBloat'))}</dt><dd>${g ? esc(g) : '–'}${extra != null ? `<small>+${extra} ms</small>` : ''}</dd></div></dl>
          ${g ? `<p class="nt-hint">${esc(T('bloat_' + g.replace('+', 'p')))}</p>` : ''}`
        const hist = s.hist.slice(0, 12).reverse().map(h => h.downMbps)
        const pts = P.sparkPoints(hist, 220, 40)
        if (pts) body += `<div class="nt-trend"><span>${esc(T('spTrend', { n: hist.length }))}</span><svg class="nt-spark" viewBox="0 0 220 40" role="img" aria-label="${esc(T('spTrend', { n: hist.length }))}"><polyline points="${pts}" fill="none"/></svg></div>`
      } else if (s.state === 'fail') {
        body = `<p class="nt-hint warn">${esc(T(s.reason === 'already-running' ? 'spBusy' : 'spFail'))}</p>`
      } else body = `<p class="nt-hint">${esc(T('spIntro'))}</p>`
      sp.innerHTML = `<header class="nt-card-h"><div><b>${esc(T('spT'))}</b><span>${esc(last && !run ? T('spMeta', { when: fmtAgo(ctx, last.t || last.startedAt), colo: last.colo || '–' }) : T('spS'))}</span></div><button type="button" class="nt-cta sm" data-m="speed"${run ? ' disabled' : ''}><i class="fa fa-${run ? 'circle-notch fa-spin' : 'gauge-high'}" aria-hidden="true"></i>${esc(T(run ? 'spRunning' : last ? 'spAgain' : 'spRun'))}</button></header>${body}`
    }
    async function runSpeed() {
      const s = M.speed
      if (s.state === 'run') return
      try { await root.showConfirm({ title: T('spConfirmT'), body: esc(T('spConfirmS')), okText: T('spRun'), okStyle: 'info', icon: 'fa-gauge-high' }) } catch (e) { return }
      s.state = 'run'; s.phase = 'down'; s.mbps = null; paintSpeed()
      offSpeed = api.onSpeedTestProgress ? api.onSpeedTestProgress(p => { if (ctx.S.disposed) return; s.phase = p.phase; s.mbps = p.mbps; paintSpeed() }) : null
      let r = null
      try { r = await api.runSpeedTest() } catch (e) { r = null }
      try { offSpeed && offSpeed() } catch (e) { /* gone */ }
      offSpeed = null
      if (ctx.S.disposed) return
      if (r && r.ok) { s.state = 'done'; s.res = { ...r, t: r.startedAt }; try { s.hist = (await api.getSpeedHistory()) || s.hist } catch (e) { /* keep */ } }
      else { s.state = 'fail'; s.reason = r && r.reason; s.res = null }
      paintSpeed()
    }

    // ── game servers ──
    function paintGames() {
      const g = M.games, run = g.state === 'run'
      const rows = g.rows.slice().sort((a, b) => (a.avg == null || a.avg < 0 ? 1e9 : a.avg) - (b.avg == null || b.avg < 0 ? 1e9 : b.avg))
      const list = rows.map(r => {
        const tone = P.pingTone(r), ok = r.avg != null && r.avg >= 0, d = P.pingDelta(r, g.prev && g.prev.rows)
        return `<li data-tone="${tone}"><span class="nt-g-name"><b>${esc(r.name)}</b><span>${esc(r.category || '')}</span></span><span class="nt-g-bar" aria-hidden="true"><i style="width:${ok ? Math.max(4, Math.min(100, Math.round((r.avg / 200) * 100))) : 100}%"></i></span><span class="nt-g-v mono">${ok ? esc(P.fmtMs(r.avg)) + '<small>ms</small>' : esc(T('gDown'))}</span><span class="nt-g-d mono" data-d="${d.k}"${d.t ? ' title="' + esc(d.t) + '"' : ''}>${esc(d.v)}</span><span class="nt-g-j mono">${ok ? esc(T('gJit', { v: P.fmtMs(r.jitter) })) + ' · ' + esc(T('gLoss', { v: r.packetLoss || 0 })) : ''}</span></li>`
      }).join('')
      gm.innerHTML = `<header class="nt-card-h"><div><b>${esc(T('gmT'))}</b><span>${esc(g.state === 'idle' ? (readSnap() ? T('gmLast', { when: fmtAgo(ctx, readSnap().t) }) : T('gmS')) : run ? T('gmRun', { n: g.done, total: g.total || '…' }) : g.prev ? T('gmVs', { when: fmtAgo(ctx, g.prev.t) }) : T('gmDone'))}</span></div><button type="button" class="nt-sec sm" data-m="games"${run ? ' disabled' : ''}><i class="fa fa-${run ? 'circle-notch fa-spin' : 'satellite-dish'}" aria-hidden="true"></i>${esc(T(run ? 'gmRunning' : g.rows.length ? 'gmAgain' : 'gmRun2'))}</button></header>
        ${list ? `<ul class="nt-games-list">${list}</ul>` : `<p class="nt-hint">${esc(T('gmIntro'))}</p>`}`
    }
    async function runGames() {
      const g = M.games
      if (g.state === 'run') return
      g.prev = g.snap || readSnap()
      g.state = 'run'; g.rows = []; g.done = 0; g.total = 12; paintGames()   // main.js run-ping-tests-v2 pings 12 targets
      offPing = api.onPingResultV2 ? api.onPingResultV2(r => { if (ctx.S.disposed) return; g.rows.push(r); g.done = g.rows.length; paintGames() }) : null
      try { await api.runPingTestsV2({ mode: 'quick', bufferbloat: false }) } catch (e) { /* the rows already shown stay */ }
      try { offPing && offPing() } catch (e) { /* gone */ }
      offPing = null
      if (ctx.S.disposed) return
      g.state = 'done'
      const snap = { t: Date.now(), rows: Object.fromEntries(g.rows.filter(r => r.avg != null && r.avg >= 0).map(r => [r.name, r.avg])) }
      if (Object.keys(snap.rows).length) { g.snap = snap; try { localStorage.setItem(SNAP_KEY, JSON.stringify(snap)) } catch (e) { /* storage may be unavailable */ } }
      paintGames()
    }

    // ── live trace ──
    function paintLive() {
      const l = M.live, run = l.state === 'run'
      const pts = P.sparkPoints(l.series, 320, 56)
      const hops = l.hops.map(h => `<li data-seg="${esc(h.seg)}" data-hidden="${h.hidden ? '1' : '0'}"><span class="nt-h-n mono">${h.ttl}</span><span class="nt-h-ip mono">${esc(h.ip || '*')}</span><span class="nt-h-seg">${esc(T('seg_' + h.seg))}</span><span class="nt-h-v mono">${h.hidden ? esc(T('hopHidden')) : esc(P.fmtMs(h.avg)) + ' ms'}</span><span class="nt-h-l mono">${h.hidden ? '' : esc(T('gLoss', { v: h.loss == null ? 0 : h.loss }))}</span></li>`).join('')
      lv.innerHTML = `<header class="nt-card-h"><div><b>${esc(T('lvT'))}</b><span>${esc(run ? T('lvRun', { host: l.host, n: l.rounds }) : T('lvS'))}</span></div>
        <div class="nt-live-ctl"><select data-m="host" aria-label="${esc(T('lvTarget'))}"${run ? ' disabled' : ''}>${['1.1.1.1', '8.8.8.8', '9.9.9.9'].map(h => `<option value="${h}"${l.host === h ? ' selected' : ''}>${h}</option>`).join('')}<option value="custom"${!['1.1.1.1', '8.8.8.8', '9.9.9.9'].includes(l.host) ? ' selected' : ''}>${esc(T('lvCustom'))}</option></select>
        ${!['1.1.1.1', '8.8.8.8', '9.9.9.9'].includes(l.host) ? `<input type="text" data-m="custom" value="${esc(l.host)}" placeholder="example.com" aria-label="${esc(T('lvTarget'))}" spellcheck="false" autocomplete="off"${run ? ' disabled' : ''}>` : ''}
        <button type="button" class="nt-cta sm" data-m="live"><i class="fa fa-${run ? 'stop' : 'play'}" aria-hidden="true"></i>${esc(T(run ? 'lvStop' : 'lvStart'))}</button></div></header>
        ${run || l.hops.length ? `<div class="nt-live-chart">${pts ? `<svg class="nt-live-svg" viewBox="0 0 320 56" preserveAspectRatio="none" role="img" aria-label="${esc(T('lvChart'))}"><polyline points="${pts}" fill="none"/></svg>` : `<span class="nt-hint">${esc(T('lvWait'))}</span>`}</div>
        <ul class="nt-hops">${hops}</ul>` : `<p class="nt-hint">${esc(T('lvIntro'))}</p>`}${l.err ? `<p class="nt-hint warn">${esc(T('lvErr_' + l.err) || T('lvErr_x'))}</p>` : ''}`
    }
    async function toggleLive() {
      const l = M.live
      if (l.state === 'run') { await ctx.liveStop(); return }
      l.err = null
      const r = await ctx.liveStart(l.host)
      if (!r || !r.ok) { l.err = (r && r.error) === 'dns' ? 'dns' : 'x'; l.state = 'idle'; paintLive() }
    }
    function onFrame(f) {
      const l = M.live
      if (!f || !f.target || f.target.checkup) return
      l.state = 'run'; l.rounds = f.rounds; l.hops = f.hops || []
      const net = f.path && f.path.nodes ? f.path.nodes.find(n => n.id === 'internet') : null
      l.series.push(net && net.ms != null ? net.ms : null)
      if (l.series.length > 60) l.series.shift()
      paintLive()
    }

    slot.addEventListener('click', e => {
      const b = e.target.closest('[data-m]'); if (!b || b.matches('select,input')) return
      if (b.dataset.m === 'speed') runSpeed(); else if (b.dataset.m === 'games') runGames(); else if (b.dataset.m === 'live') toggleLive()
    })
    slot.addEventListener('change', e => {
      const t = e.target.closest('[data-m]'); if (!t) return
      if (t.dataset.m === 'host') { M.live.host = t.value === 'custom' ? '' : t.value; paintLive(); if (t.value === 'custom') { const i = lv.querySelector('[data-m="custom"]'); if (i) i.focus() } }
      else if (t.dataset.m === 'custom') M.live.host = t.value.trim()
    })
    slot.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-m="custom"]')) { M.live.host = e.target.value.trim(); toggleLive() } })

    paintSpeed(); paintGames(); paintLive()
    ;(async () => { try { const h = await api.getSpeedHistory(); if (!ctx.S.disposed && Array.isArray(h) && h.length) { M.speed.hist = h; paintSpeed() } } catch (e) { /* no history */ } })()
    return { onFrame, paintLive, stopped() { M.live.state = 'idle'; paintLive() }, destroy() { try { offSpeed && offSpeed() } catch (e) { /* gone */ } try { offPing && offPing() } catch (e) { /* gone */ } } }
  }
})(typeof window !== 'undefined' ? window : globalThis)
