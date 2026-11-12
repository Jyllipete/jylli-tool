'use strict'
// FiveM "Uplink": the frame and the Uplink view (servers, Route Radar, verdict, pre-flight). The other four views (Sessions,
// Graphics, Client, Crash lab) live in js/fivem/views.js. Everything shown comes from lib/fivem (scan report, measured route rounds,
// recorded sessions); nothing is estimated here. Pure helpers are exported for node tests.
;(function (root) {
  const TONE = { measuring: 'idle', clean: 'ok', 'no-replies': 'danger', unreachable: 'danger', 'loss-home': 'danger', 'loss-isp': 'danger', 'loss-transit': 'danger', 'loss-server': 'danger',
    'jitter-home': 'warn', 'jitter-path': 'warn', spikes: 'warn', far: 'warn' }
  const VIEWS = ['uplink', 'sessions', 'graphics', 'client', 'crash']

  // ── pure ──
  const toneOf = id => TONE[id] || 'idle'
  // Numbers follow the app language (1,2 ms in Finnish). No setting, as in node tests, means English.
const fmt = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString(typeof root.settings !== 'undefined' && root.settings && root.settings.language === 'fi' ? 'fi-FI' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false }) : null)
  /** "12 / 64" players, or null when the server did not report them. */
  const players = (n, max) => (n == null ? null : max ? `${n} / ${max}` : String(n))
  function age(ms) { const m = Math.max(0, Math.round(ms / 60000)); return m < 1 ? { k: 'now', n: 0 } : m < 60 ? { k: 'min', n: m } : m < 2880 ? { k: 'hour', n: Math.round(m / 60) } : { k: 'day', n: Math.round(m / 1440) } }
  /** Numbers for the stat row from an analysis (null = not measured, shown as a dash). */
  function statRow(a, mtu) {
    const e = a && a.end, t = a && a.tcp && a.tcp.got ? a.tcp : null
    const ref = e && e.got ? e : t
    return { icmp: e && e.got ? fmt(e.avg, 1) : null, tcp: t ? fmt(t.avg, 1) : null, jitter: ref ? fmt(ref.jitter, 1) : null, loss: ref && ref.lossPct != null ? fmt(ref.lossPct, 1) : null, hops: a ? a.hops.length : 0, mtu: mtu || null }
  }

  const api = { TONE, VIEWS, toneOf, fmt, players, age, statRow }
  root.JylliFivemPage = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  const T = (k, v) => root.tG('fivem2', k, v)
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
  const ago = ms => { const a = age(ms); return T('ago_' + a.k, { n: a.n }) }
  const A = () => root.api
  const dash = '<span class="fv-na" aria-label="—">–</span>'

  async function mount(c) {
    if (!root.settings || !root.settings.isPremium) { await root.JylliPremium.build(c, 'fivem'); return }
    const Route = root.JylliFivemRoute
    const host = el('div', 'jk fv')
    c.appendChild(host)
    const S = { view: 'uplink', report: null, servers: [], active: null, route: null, meta: null, tracing: false, live: {}, mtu: null, adding: false, addError: null, disposed: false, unsub: [], paintT: 0 }
    const ctx = { T, esc, el, ago, A, S, show: id => show(id), rescan: () => scan(), toast: (a, b, c2) => { try { root.toast(a, b || '', c2 || 'ok') } catch { /* not ready */ } }, confirm: o => root.showConfirm(o) }

    // ── frame ──
    const bar = el('div', 'fv-bar')
    const sw = root.JylliTab.seg(VIEWS.map(id => ({ id, label: T('seg_' + id), icon: { uplink: 'satellite-dish', sessions: 'chart-line', graphics: 'sliders', client: 'screwdriver-wrench', crash: 'bug' }[id] })), S.view, id => show(id))
    const chips = el('div', 'fv-chips')
    bar.append(sw.el, chips)
    host.appendChild(bar)
    const views = {}
    for (const k of VIEWS) { views[k] = el('div', 'fv-view'); views[k].dataset.view = k; host.appendChild(views[k]) }
    const built = {}
    function show(id) {
      S.view = id; sw.set(id)
      for (const k of VIEWS) views[k].hidden = k !== id
      if (id !== 'uplink' && root.JylliFivemViews && root.JylliFivemViews[id]) {
        if (!built[id]) built[id] = root.JylliFivemViews[id](views[id], ctx) || {}
        else if (built[id].refresh) built[id].refresh()
      }
    }
    function paintChips() {
      const r = S.report
      if (!r) { chips.innerHTML = ''; return }
      const cs = []
      cs.push(r.loc.installed ? `<span class="fv-chip" data-tone="ok">${esc(T('chInstalled'))}</span>` : `<span class="fv-chip" data-tone="idle">${esc(T('chNotInstalled'))}</span>`)
      if (r.running) cs.push(`<span class="fv-chip" data-tone="warn">${esc(T('chRunning'))}</span>`)
      if (!r.admin) cs.push(`<span class="fv-chip" data-tone="idle" title="${esc(T('chNoAdminWhy'))}">${esc(T('chNoAdmin'))}</span>`)
      chips.innerHTML = cs.join('')
    }

    // ── Uplink ──
    const uv = views.uplink
    const stage = el('section', 'fv-stage')
    const rail = el('aside', 'fv-rail')
    const main = el('div', 'fv-main')
    const radarHost = el('div', 'fv-radar')
    const verdict = el('div', 'fv-verdict')
    const stats = el('dl', 'fv-stats')
    const hopsBox = el('details', 'fv-hops')
    main.append(radarHost, verdict, stats, hopsBox)
    stage.append(rail, main)
    const findings = el('div', 'fv-findings')
    uv.append(stage, findings)

    const radar = root.JylliFivemRadar.mount(radarHost, {
      ariaLabel: T('radarAria'), youLabel: T('you'), serverLabel: T('server'), label: seg => T('seg_' + seg),
      tip: n => (n.you ? T('you') : `${n.ip || T('hiddenHop')} · ${n.stats && n.stats.avg != null ? Math.round(n.stats.avg) + ' ms' : '–'} · ${n.stats && n.stats.lossPct != null ? n.stats.lossPct + '%' : '–'}`),
    })

    const activeServer = () => S.servers.find(s => s.id === S.active) || null
    const analysis = () => (S.route ? Route.analyze(S.route) : null)

    function paintRail() {
      const rows = S.servers.map(s => {
        const lv = S.live[s.id] || {}
        const pl = players(lv.players, lv.max)
        return `<div class="fv-srv" data-active="${s.id === S.active}"><button type="button" class="fv-srv-main" data-act="use" data-id="${esc(s.id)}" aria-pressed="${s.id === S.active}">` +
          `<span class="fv-srv-name">${esc(s.name || s.host)}</span><span class="fv-srv-sub">${esc(s.host)}:${s.port}${pl ? ' · ' + esc(pl) : ''}</span></button>` +
          `<button type="button" class="fv-x" data-act="remove" data-id="${esc(s.id)}" aria-label="${esc(T('removeServer', { name: s.name || s.host }))}"><i class="fa fa-xmark" aria-hidden="true"></i></button></div>`
      }).join('')
      rail.innerHTML = `<h3 class="fv-h">${esc(T('servers'))}</h3><div class="fv-srvs">${rows || `<p class="fv-muted">${esc(T('noServers'))}</p>`}</div>` +
        `<form class="fv-add" data-act="add"><label class="fv-lbl" for="fv-add-in">${esc(T('addLabel'))}</label><div class="fv-add-row"><input id="fv-add-in" class="fv-in" type="text" autocomplete="off" spellcheck="false" maxlength="300" placeholder="${esc(T('addPlaceholder'))}"${S.adding ? ' disabled' : ''}>` +
        `<button type="submit" class="fv-sec"${S.adding ? ' disabled' : ''}>${esc(S.adding ? T('adding') : T('add'))}</button></div>` +
        `<p class="fv-err" role="status">${S.addError ? esc(T('addErr_' + S.addError)) : ''}</p></form>`
    }

    function paintVerdict() {
      const a = analysis(), sv = activeServer()
      let tone = 'idle', eyebrow, title, lead
      if (!sv) { eyebrow = T('eyNone'); title = T('tNone'); lead = T('lNone') }
      else if (!S.tracing || !a) { eyebrow = `${sv.host}:${sv.port}`; title = T('tReady'); lead = T('lReady') }
      else {
        const v = a.verdict
        tone = toneOf(v.id)
        eyebrow = `${sv.name || sv.host} · ${S.meta && S.meta.ip ? S.meta.ip : sv.host}:${sv.port}`
        title = T('v_' + v.id)
        const e = v.ev || {}
        lead = T('vd_' + v.id, { ip: e.ip || '', ttl: e.ttl != null ? e.ttl : '', loss: fmt(e.loss, 1) || '', endLoss: fmt(e.endLoss, 1) || '', jitter: fmt(e.jitter, 1) || '', avg: fmt(e.avg, 0) || '', p95: fmt(e.p95, 0) || '', via: e.via ? T('via_' + e.via) : '', n: e.rounds != null ? e.rounds : '', need: e.need != null ? e.need : '' })
      }
      verdict.dataset.tone = tone
      const primary = sv ? `<button type="button" class="fv-cta" data-act="connect"><i class="fa fa-rocket" aria-hidden="true"></i><span>${esc(T('connect'))}</span></button>` : ''
      const trace = sv ? `<button type="button" class="fv-sec" data-act="trace" aria-pressed="${S.tracing}"><i class="fa fa-${S.tracing ? 'stop' : 'play'}" aria-hidden="true"></i><span>${esc(S.tracing ? T('stopTrace') : T('startTrace'))}</span></button>` : ''
      const mtu = sv ? `<button type="button" class="fv-sec" data-act="mtu"${S.mtu === 'busy' ? ' disabled' : ''}><i class="fa fa-ruler-horizontal" aria-hidden="true"></i><span>${esc(S.mtu === 'busy' ? T('mtuBusy') : T('mtuRun'))}</span></button>` : ''
      verdict.innerHTML = `<div class="fv-eyebrow"><span class="fv-dot"></span><span>${esc(eyebrow)}</span></div><h2 class="fv-title">${esc(title)}</h2><p class="fv-lead">${esc(lead)}</p><div class="fv-actions">${primary}${trace}${mtu}</div>`
    }

    function paintStats() {
      const a = analysis(), r = statRow(a, typeof S.mtu === 'number' ? S.mtu : null)
      const cell = (k, v, unit) => `<div><dt>${esc(T('st_' + k))}</dt><dd>${v == null ? dash : esc(v) + (unit ? `<small>${esc(unit)}</small>` : '')}</dd></div>`
      stats.innerHTML = cell('icmp', r.icmp, 'ms') + cell('tcp', r.tcp, 'ms') + cell('jitter', r.jitter, 'ms') + cell('loss', r.loss, '%') + cell('hops', a ? String(r.hops) : null, '') + cell('mtu', r.mtu != null ? String(r.mtu) : null, '')
    }

    function paintHops() {
      const a = analysis(), open = hopsBox.open
      if (!a || !a.hops.length) { hopsBox.hidden = true; return }
      hopsBox.hidden = false
      if (!open && hopsBox.dataset.built === '1') return                       // closed: nothing to keep fresh
      const rows = a.hops.map(h => {
        const s = h.stats
        return `<tr data-hidden="${h.hidden}"><td>${h.ttl}</td><td class="fv-mono">${esc(h.ip || T('hiddenHop'))}</td><td>${esc(T('seg_' + h.seg))}</td><td class="fv-num">${s.avg != null ? fmt(s.avg, 1) : '–'}</td><td class="fv-num">${s.jitter != null ? fmt(s.jitter, 1) : '–'}</td><td class="fv-num">${s.lossPct != null ? fmt(s.lossPct, 1) : '–'}</td></tr>`
      }).join('')
      hopsBox.innerHTML = `<summary>${esc(T('hopTable', { n: a.hops.length }))}</summary><div class="fv-tw"><table class="fv-table"><thead><tr><th scope="col">#</th><th scope="col">${esc(T('th_addr'))}</th><th scope="col">${esc(T('th_seg'))}</th><th scope="col">${esc(T('th_avg'))}</th><th scope="col">${esc(T('th_jitter'))}</th><th scope="col">${esc(T('th_loss'))}</th></tr></thead><tbody>${rows}</tbody></table></div><p class="fv-muted">${esc(T('hopNote'))}</p>`
      hopsBox.dataset.built = '1'
    }
    hopsBox.addEventListener('toggle', () => { if (hopsBox.open) { hopsBox.dataset.built = '0'; paintHops() } })

    function paintFindings() {
      const r = S.report
      if (!r) { findings.innerHTML = ''; return }
      const list = r.findings.filter(f => f.id !== 'route')
      const items = list.map(f => `<article class="fv-find" data-sev="${esc(f.sev)}"><div class="fv-find-t"><h4>${esc(T('t_' + f.id, f.vars))}</h4><p>${esc(T('w_' + f.id, f.vars))}</p></div>${f.action ? `<button type="button" class="fv-sec" data-act="${esc(f.action)}">${esc(T('a_' + f.id))}</button>` : ''}</article>`).join('')
      const ok = r.passed.filter(id => id !== 'route').length
      findings.innerHTML = `<h3 class="fv-h">${esc(T('preflight'))}</h3>${items || `<p class="fv-muted">${esc(T('allClear'))}</p>`}${items && ok ? `<p class="fv-muted">${esc(T('passedN', { n: ok }))}</p>` : ''}`
    }

    function paintLive() { radar.update({ analysis: analysis() }); paintVerdict(); paintStats(); paintHops() }
    function schedule() { if (S.paintT || S.disposed) return; S.paintT = setTimeout(() => { S.paintT = 0; if (!S.disposed) paintLive() }, 400) }
    function paintAll() { paintChips(); paintRail(); paintLive(); paintFindings() }

    // ── events ──
    uv.addEventListener('click', async e => {
      const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'FORM') return
      const act = b.dataset.act, id = b.dataset.id
      if (act === 'use') return useServer(id)
      if (act === 'remove') return removeServer(id)
      if (act === 'connect') return connect()
      if (act === 'trace') return S.tracing ? stopTrace() : startTrace()
      if (act === 'mtu') return runMtu()
      const go = { 'open-client': 'client', 'open-graphics': 'graphics', 'open-crash': 'crash', 'open-uplink': 'uplink' }[act]
      if (go) show(go)
    })
    rail.addEventListener('submit', async e => {
      e.preventDefault()
      const inp = rail.querySelector('#fv-add-in'); const v = inp && inp.value.trim(); if (!v) return
      S.adding = true; S.addError = null; paintRail()
      const r = await A().fivem2ServerAdd({ input: v }).catch(() => ({ ok: false, error: 'network' }))
      S.adding = false
      if (S.disposed) return
      if (r && r.ok) { S.servers = r.servers; S.active = r.active; S.live[r.server.id] = r.live || {}; paintRail(); if (!S.tracing) startTrace(); else switchTarget() }
      else { S.addError = ['bad-input', 'bad-code', 'unresolved', 'too-many', 'network'].includes(r && r.error) ? r.error : 'network'; paintRail() }
    })

    async function useServer(id) {
      if (id === S.active) return
      const r = await A().fivem2ServerUse({ id }); if (S.disposed) return
      S.servers = r.servers; S.active = r.active; S.mtu = null; paintRail()
      if (S.tracing) switchTarget(); else paintLive()
      refreshLive(id)
    }
    async function removeServer(id) {
      const sv = S.servers.find(s => s.id === id); if (!sv) return
      try { await ctx.confirm({ title: T('rm_title'), body: T('rm_body', { name: sv.name || sv.host }), okText: T('rm_ok'), okStyle: 'warning', icon: 'trash' }) } catch { return }
      const r = await A().fivem2ServerRemove({ id }); if (S.disposed) return
      S.servers = r.servers; S.active = r.active
      if (S.tracing && (!S.active || id === S.meta?.id)) { await stopTrace(); if (S.active) startTrace() }
      paintRail(); paintLive()
    }
    async function refreshLive(id) {
      const r = await A().fivem2ServerLive({ id }).catch(() => null)
      if (S.disposed || !r || !r.ok) return
      S.live[id] = { players: r.players, max: r.max, httpMs: r.httpMs }; paintRail()
    }
    async function startTrace() {
      const sv = activeServer(); if (!sv) return
      const r = await A().fivem2RouteStart({ id: sv.id }); if (S.disposed) return
      if (!r || !r.ok) { S.tracing = false; paintVerdict(); ctx.toast(T('traceFail'), T('traceFail_' + ((r && r.error) || 'x')), 'err'); return }
      S.route = Route.create(); S.meta = { id: sv.id, ip: r.ip }; S.tracing = true; paintLive()
    }
    async function stopTrace() { S.tracing = false; await A().fivem2RouteStop().catch(() => {}); S.meta = null; paintLive() }
    async function switchTarget() { await stopTrace(); startTrace() }
    async function runMtu() {
      const sv = activeServer(); if (!sv) return
      S.mtu = 'busy'; paintVerdict()
      const r = await A().fivem2Mtu({ id: sv.id }).catch(() => null); if (S.disposed) return
      S.mtu = r && r.ok ? r.mtu : null; paintVerdict(); paintStats()
      if (r && r.ok) ctx.toast(T('mtuDone', { n: r.mtu }), r.mtu < 1400 ? T('mtuLow') : T('mtuOk'), r.mtu < 1400 ? 'warn' : 'ok')
      else ctx.toast(T('mtuFail'), '', 'err')
    }
    async function connect() {
      const sv = activeServer(); if (!sv) return
      const r = await A().fivem2Connect({ id: sv.id }).catch(() => null)
      ctx.toast(r && r.ok ? T('connecting', { name: sv.name || sv.host }) : T('connectFail'), '', r && r.ok ? 'ok' : 'err')
    }

    async function scan() {
      const r = await A().fivem2Scan().catch(() => null); if (S.disposed) return
      if (!r || !r.ok) { if (r && r.reason === 'premium_required') return; ctx.toast(T('scanFail'), '', 'err'); return }
      S.report = r.report; S.servers = r.servers; S.active = r.active
      paintAll()
      for (const k of Object.keys(built)) if (built[k].refresh) built[k].refresh()
    }

    // ── boot ──
    S.unsub.push(A().onFivem2Route(m => {
      if (S.disposed || !S.tracing || !S.route || !S.meta || m.id !== S.meta.id) return
      Route.ingest(S.route, m.round); schedule()
    }))
    paintAll()
    ;(async () => {
      try { const raw = localStorage.getItem('fivem_bookmarks'); if (raw) { const list = JSON.parse(raw); if (Array.isArray(list) && list.length) { const r = await A().fivem2ImportBookmarks({ list }); if (r && r.ok) { S.servers = r.servers; S.active = r.active } } } } catch { /* nothing to import */ }
      const snap = await A().fivem2RouteSnapshot().catch(() => null)
      if (S.disposed) return
      if (snap && snap.ok && snap.running && snap.state) { S.route = snap.state; S.meta = snap.meta; S.tracing = true }
      await scan()
      if (S.disposed) return
      if (!S.tracing && activeServer()) startTrace()
      if (activeServer()) refreshLive(S.active)
    })()

    root.registerPageCleanup('fivem', () => {
      S.disposed = true
      clearTimeout(S.paintT)
      for (const u of S.unsub) { try { u() } catch { /* gone */ } }
      try { A().fivem2RouteStop() } catch { /* gone */ }
      radar.destroy()
    })
  }
  api.mount = mount
})(typeof window !== 'undefined' ? window : globalThis)
