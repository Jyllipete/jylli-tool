'use strict'
// Startup tab "Ignition": the Boot and History views and the small shared pieces (js/startup/page.js mounts them).
// Everything is rendered from the service snapshot; nothing here decides anything.
;(function (root) {
  const api = {}
  root.JylliStartupViews = api
  if (typeof document === 'undefined') return

  /** The program's own icon when it has been read, else a coloured monogram. */
  api.icon = (ctx, e, cls) => {
    const { P, esc, S } = ctx
    const img = S.icons && S.icons[e.id]
    return `<span class="${cls || 'su-ico'}" style="--h:${P.hue(e.id)}" aria-hidden="true">${img ? `<img src="${esc(img)}" alt="" width="32" height="32" loading="lazy">` : `<b>${esc(P.initial(e))}</b>`}</span>`
  }

  const when = (ctx, ts) => {
    const { T, P } = ctx
    const a = P.ago(ts, Date.now())
    return a ? T('ago_' + a.k, { n: a.n }) : '–'
  }
  const dateOf = ts => { try { return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch (e) { return '' } }

  // ── Boot ──────────────────────────────────────────────────────────────
  api.boot = (host, ctx) => {
    const { T, esc, P, S } = ctx
    const s = S.snap
    if (!s) { host.innerHTML = `<div class="su-skel"><span></span><span></span></div>`; return }
    const b = s.boot, sum = b.summary
    const cards = []

    // boots on file
    let bars = ''
    if (b.boots && b.boots.length) {
      const rows = P.bootBars(b.boots)
      bars = `<div class="su-bars" role="list">${rows.map(r => `<div class="su-bar-r" role="listitem">
          <span class="su-bar-d">${esc(dateOf(r.at))}</span>
          <span class="su-bar-t" title="${esc(T('bt_total') + ' ' + P.fmtBoot(r.ms) + (r.mainMs != null ? ' · ' + T('bt_desktop') + ' ' + P.fmtBoot(r.mainMs) : ''))}"><i class="su-bar-fill" style="width:${r.pct}%">${r.mainPct != null ? `<em style="width:${r.mainPct}%"></em>` : ''}</i></span>
          <b>${esc(P.fmtBoot(r.ms))}</b></div>`).join('')}</div>
        <p class="su-foot">${esc(T('bt_legend'))}</p>`
    }
    const none = b.status === 'denied' ? T('bootDenied') : b.status === 'error' ? T('bootError') : b.status === 'unread' ? T('bootUnread') : T('bootNone')
    const med = sum && sum.median != null ? `<div class="su-stats">
        <div><b>${esc(P.fmtBoot(sum.median))}</b><span>${esc(T('bt_median'))}</span></div>
        <div><b>${esc(sum.mainMedian != null ? P.fmtBoot(sum.mainMedian) : '–')}</b><span>${esc(T('bt_desktop'))}</span></div>
        <div><b>${esc(sum.postMedian != null ? P.fmtBoot(sum.postMedian) : '–')}</b><span>${esc(T('bt_settle'))}</span></div>
        <div><b>${esc(sum.last && sum.last.apps != null ? String(sum.last.apps) : '–')}</b><span>${esc(T('bt_apps'))}</span></div></div>
      ${sum.trend ? `<p class="su-p">${esc(T(sum.trend.deltaMs <= -2000 ? 'trendFaster' : sum.trend.deltaMs >= 2000 ? 'trendSlower' : 'trendSame', { s: P.fmtBoot(Math.abs(sum.trend.deltaMs)) }))}</p>` : ''}` : ''
    cards.push(`<section class="su-card"><div class="su-card-h"><b>${esc(T('bootT'))}</b><span>${esc(T('bootS'))}</span></div>${bars ? med + bars : `<p class="su-empty-p"><i class="fa fa-stopwatch" aria-hidden="true"></i>${esc(none)}</p>`}
      <div class="su-card-f"><button type="button" class="nt-sec sm" data-act="reboot-read"><i class="fa fa-arrows-rotate" aria-hidden="true"></i>${esc(T('bootReread'))}</button></div></section>`)

    // after your changes
    const c = b.compare
    if (c) {
      let head, body
      if (c.state === 'restart') { head = T('cmpT'); body = T('cmp_restart', { n: c.n }) }
      else if (c.state === 'waiting') { head = T('cmpT'); body = T('cmp_waiting') }
      else if (c.state === 'unavailable') { head = T('cmpT'); body = T('cmp_unavailable') }
      else {
        head = T('cmpT')
        const d = c.deltaMs
        body = d == null ? T('cmp_nobase', { after: P.fmtBoot(c.afterMs) }) : T(d <= -2000 ? 'cmp_faster' : d >= 2000 ? 'cmp_slower' : 'cmp_same', { s: P.fmtBoot(Math.abs(d)), before: P.fmtBoot(c.beforeMs), after: P.fmtBoot(c.afterMs) })
      }
      cards.push(`<section class="su-card su-cmp" data-state="${esc(c.state)}"><div class="su-card-h"><b>${esc(head)}</b><span>${esc(T('cmpWhen', { when: dateOf(c.at) }))}</span></div><p class="su-p">${esc(body)}</p>${c.state === 'done' ? `<p class="su-foot">${esc(T('cmpFoot'))}</p>` : ''}</section>`)
    }

    // slow starters
    const slow = b.slow || []
    cards.push(`<section class="su-card"><div class="su-card-h"><b>${esc(T('slowT'))}</b><span>${esc(T('slowS'))}</span></div>
      ${slow.length ? `<div class="su-slow">${slow.map(x => `<div class="su-sl" data-level="${esc(x.level)}"><span class="su-sl-n">${x.inList ? `<button type="button" class="su-link" data-act="open-stem" data-stem="${esc(x.stem)}">${esc(x.name)}</button>` : `<b>${esc(x.name)}</b>`}<i>${esc(T('slowRow', { n: x.count }))}</i></span><span class="su-sl-v">${esc(P.signed(x.medianMs))}</span></div>`).join('')}</div>` : `<p class="su-empty-p"><i class="fa fa-circle-check" aria-hidden="true"></i>${esc(b.status === 'ok' ? T('slowNone') : T('slowUnknown'))}</p>`}</section>`)

    // behaviour
    const sw = (s.switches || []).map(x => {
      const set = x.state === 'set'
      return `<div class="su-rw" data-tone="${set ? 'ok' : x.state === 'drifted' ? 'warn' : ''}"><span class="su-rw-i"><i class="fa fa-${esc(x.icon)}" aria-hidden="true"></i></span>
        <div class="su-rw-t"><b>${esc(T('sw_' + x.id))}</b><span>${esc(T('swS_' + x.id))}</span><span class="su-why">${esc(T('swState_' + x.state))}</span></div>
        <button type="button" class="su-sw" role="switch" aria-checked="${set}" data-act="switch" data-sw="${esc(x.id)}" ${x.state === 'unknown' ? 'disabled' : ''} aria-label="${esc(T('sw_' + x.id))}"><i></i></button></div>`
    }).join('')
    const rel = [['explorer', 'windows-opti', 'qol', 'bolt'], ['fast', 'hardware', 'power', 'power-off'], ['edge', 'app-optimizer', '', 'globe']]
    cards.push(`<section class="su-card"><div class="su-card-h"><b>${esc(T('behaveT'))}</b><span>${esc(T('behaveS'))}</span></div><div class="su-rws">${sw}</div>
      <div class="su-rel">${rel.map(r => `<button type="button" class="su-rel-b" data-act="goto" data-page="${r[1]}" data-tab="${r[2]}"><i class="fa fa-${r[3]}" aria-hidden="true"></i><span><b>${esc(T('rel_' + r[0]))}</b><i>${esc(T('relS_' + r[0]))}</i></span><i class="fa fa-arrow-right su-rel-go" aria-hidden="true"></i></button>`).join('')}</div></section>`)
    host.innerHTML = cards.join('')
  }

  // ── History ───────────────────────────────────────────────────────────
  api.history = (host, ctx) => {
    const { T, esc, P, S } = ctx
    const h = S.history
    if (!h) { host.innerHTML = `<div class="su-skel"><span></span><span></span></div>`; return }
    const nameOf = id => { const e = S.snap && S.snap.entries.find(x => x.id === id); return e ? P.display(e) : id.split('|').slice(1).join(' ') }
    const list = (items, row) => (items.length ? items.map(row).join('') : `<p class="su-hist-empty">${esc(T('hEmpty'))}</p>`)
    const runRow = (r, i) => {
      const real = r.items.filter(x => !x.noop), ok = real.filter(x => x.ok), bad = real.length - ok.length
      const undoable = ok.some(x => x.was)
      return `<div class="su-hr"><span class="su-hr-i" data-tone="${bad ? 'warn' : ''}"><i class="fa fa-${bad ? 'triangle-exclamation' : 'rocket'}" aria-hidden="true"></i></span>
        <span class="su-hr-t"><b>${esc(T(bad ? 'hRunSome' : 'hRun', { n: ok.length, bad }))}</b><i>${esc(ok.slice(0, 4).map(x => T('act_' + x.action) + ' ' + (x.name || nameOf(x.id))).join(' · '))}${ok.length > 4 ? ' …' : ''}</i></span>
        <span class="su-hr-v">${esc(when(ctx, r.at))}${undoable && i === 0 ? `<button type="button" class="nt-sec sm" data-act="undorun" data-run="${esc(r.id)}">${esc(T('undoRun'))}</button>` : ''}</span></div>`
    }
    const logRow = icon => x => `<div class="su-hr"><span class="su-hr-i"><i class="fa fa-${icon}" aria-hidden="true"></i></span><span class="su-hr-t"><b>${esc(x.name || nameOf(x.id))}</b></span><span class="su-hr-v">${esc(when(ctx, x.at))}</span></div>`
    host.innerHTML = `<section class="su-card"><div class="su-card-h"><b>${esc(T('hT_runs'))}</b><span>${esc(T('hS_runs'))}</span></div>${list(h.runs.slice(0, 12), runRow)}
        <div class="su-card-f"><button type="button" class="nt-sec sm" data-act="journal"><i class="fa fa-book-open" aria-hidden="true"></i>${esc(T('openJournal'))}</button></div></section>
      <section class="su-card"><div class="su-card-h"><b>${esc(T('hT_back'))}</b><span>${esc(T('hS_back'))}</span></div>${list(h.cameBack.slice(0, 8), logRow('rotate-left'))}</section>
      ${S.snap && S.snap.premium ? `<section class="su-card"><div class="su-card-h"><b>${esc(T('hT_guard'))}</b><span>${esc(T('hS_guard'))}</span></div>${list(h.guard.slice(0, 8), logRow('shield-halved'))}</section>` : ''}
      <section class="su-card"><div class="su-card-h"><b>${esc(T('hT_new'))}</b><span>${esc(T('hS_new'))}</span></div>${list(h.fresh.slice(0, 8), logRow('sparkles'))}</section>`
  }
})(typeof window !== 'undefined' ? window : globalThis)
