'use strict'
// Apps tab "Backstage": the Game time and History views (js/apps/page.js mounts them). Everything is rendered from the service snapshot; nothing here decides anything.
;(function (root) {
  const V = {}
  root.JylliAppsViews = V
  if (typeof document === 'undefined') return

  const icoHtml = (P, esc, id, cls) => {
    const f = P.ICONS[id]
    return `<span class="${cls || 'ap-ico'}" data-id="${esc(id)}" style="--h:${P.hue(id)}">${f ? `<img src="assets/apps/${esc(f)}" alt="" draggable="false">` : `<b>${esc(P.initial(id))}</b>`}</span>`
  }
  V.icon = icoHtml

  /** The level picker used on the Game time view and in the app panel. */
  V.levels = (ctx, a) => {
    const { T, esc, S } = ctx
    const premium = !!(S.snap && S.snap.premium)
    if (a.levels.length < 2) return `<span class="ap-fixed"><i class="fa fa-lock" aria-hidden="true"></i>${esc(T('gtWhy_' + a.role))}</span>`
    return `<div class="ap-lv" role="group" aria-label="${esc(T('lvLabel'))}">${a.levels.map(l => `<button type="button" data-act="level" data-id="${esc(a.id)}" data-level="${l.id}" aria-pressed="${a.level === l.id}"${l.locked ? ' data-locked="1"' : ''} title="${esc(T('lvS_' + l.id))}">${l.locked ? '<i class="fa fa-lock" aria-hidden="true"></i>' : ''}${esc(T('lv_' + l.id))}</button>`).join('')}</div>${premium ? '' : ''}`
  }

  V.gametime = function (host, ctx) {
    const { T, esc, P, S } = ctx
    const s = S.snap
    if (!s) { host.innerHTML = `<div class="ap-skel" aria-busy="true"><span></span><span></span><span></span></div>`; return }
    const g = s.gametime, on = g.enabled
    const stepping = g.preview.length
    const sess = g.active, last = g.lastSession
    let status
    if (sess) status = `<div class="ap-gt-live"><span class="ap-live-dot"></span><b>${esc(T('gtActiveT', { name: sess.name || T('gtAGame') }))}</b><span>${esc(T('gtActiveS', { n: sess.procs, apps: sess.apps }))}</span><button type="button" class="nt-sec sm" data-act="gt-end">${esc(T('gtPutBack'))}</button></div>`
    else if (last) {
      const a = P.ago(last.at), d = P.fmtDur(last.seconds)
      status = `<div class="ap-gt-last"><b>${esc(T('gtLastT', { name: last.name || T('gtAGame') }))}</b><span>${esc(T('gtLastS', { when: a ? T('ago_' + a.k, { n: a.n }) : '', dur: T('dur_' + d.k, { n: d.n }), n: last.procs, apps: last.apps }))}</span>${last.cpuBefore > 0 ? `<span class="ap-gt-delta">${esc(T('gtLastCpu', { before: P.fmtPct(last.cpuBefore), during: P.fmtPct(last.cpuDuring) }))}</span>` : ''}${last.left ? `<span class="ap-gt-left">${esc(T('gtLastLeft', { n: last.left }))}</span>` : ''}</div>`
    } else status = `<div class="ap-gt-last"><span>${esc(T('gtNone'))}</span></div>`
    const apps = P.sortApps(s.apps)
    const rows = apps.map(a => `<div class="ap-gr" data-step="${a.stepping ? 1 : 0}" data-running="${a.running ? 1 : 0}">${V.icon(P, esc, a.id)}<span class="ap-nm"><b>${esc(P.nameOf(a.id))}</b><i>${esc(T('role_' + a.role))}${a.running ? ' · ' + esc(T('st_running', { n: a.cost ? a.cost.n : 0 })) : ''}</i></span>${V.levels(ctx, a)}</div>`).join('')
    host.innerHTML = `
      <section class="ap-card ap-gt-head" data-on="${on ? 1 : 0}">
        <div class="ap-gt-t"><h3>${esc(T('gtT'))}</h3><p>${esc(T('gtLead'))}</p></div>
        <button type="button" class="ap-sw" role="switch" aria-checked="${on}" data-act="gt-toggle" aria-label="${esc(T('gtT'))}"><i></i></button>
        ${status}
        <p class="ap-foot">${esc(on ? T(stepping === 1 ? 'gtNow_1' : 'gtNow', { n: stepping }) : T('gtOffNote'))}</p>
      </section>
      <section class="ap-card"><div class="ap-card-h"><b>${esc(T('gtListT'))}</b><span>${esc(T('gtListS'))}</span></div>
        <div class="ap-gl">${rows || `<div class="nt-empty"><i class="fa fa-grid-2" aria-hidden="true"></i><b>${esc(T('emptyT'))}</b><span>${esc(T('emptyS'))}</span></div>`}</div></section>
      <section class="ap-card ap-how"><div class="ap-card-h"><b>${esc(T('gtHowT'))}</b></div>
        <ol><li>${esc(T('gtHow1'))}</li><li>${esc(T('gtHow2'))}</li><li>${esc(T('gtHow3'))}</li></ol>
        <p class="ap-foot">${esc(T('gtProtected'))}</p></section>`
  }

  V.history = function (host, ctx) {
    const { T, esc, P, S } = ctx
    const h = S.history
    if (!h) { host.innerHTML = `<div class="ap-skel" aria-busy="true"><span></span><span></span></div>`; return }
    const when = ms => { const a = P.ago(ms); return a ? T('ago_' + a.k, { n: a.n }) : '' }
    const runs = (h.runs || []).slice(0, 12).map(r => {
      const ok = r.items.filter(i => i.ok && !i.noop), undoable = ok.some(i => i.action === 'apply')
      const names = [...new Set(r.items.map(i => P.nameOf(i.app)))].slice(0, 3).join(', ')
      return `<div class="ap-hr"><span class="ap-hr-i"><i class="fa fa-${undoable ? 'wand-magic-sparkles' : 'rotate-left'}" aria-hidden="true"></i></span><span class="ap-nm"><b>${esc(T('hRun', { ok: ok.length, total: r.items.length }))}</b><i>${esc(names)} · ${esc(when(r.at))}</i></span>${undoable ? `<button type="button" class="nt-sec sm" data-act="undorun" data-run="${esc(r.id)}">${esc(T('undo'))}</button>` : ''}</div>`
    }).join('')
    const sessions = (h.sessions || []).slice(0, 10).map(x => {
      const d = P.fmtDur(x.seconds)
      return `<div class="ap-hr"><span class="ap-hr-i"><i class="fa fa-gamepad" aria-hidden="true"></i></span><span class="ap-nm"><b>${esc(x.name || T('gtAGame'))}</b><i>${esc(T('hSess', { n: x.procs, apps: x.apps, dur: T('dur_' + d.k, { n: d.n }) }))} · ${esc(when(x.at))}</i></span>${x.cpuBefore > 0 ? `<span class="ap-hr-v">${esc(P.fmtPct(x.cpuBefore))} → ${esc(P.fmtPct(x.cpuDuring))}</span>` : ''}</div>`
    }).join('')
    const drift = (h.drift || []).slice(0, 8).map(x => `<div class="ap-hr"><span class="ap-hr-i" data-tone="warn"><i class="fa fa-triangle-exclamation" aria-hidden="true"></i></span><span class="ap-nm"><b>${esc(T('row_' + x.row))}</b><i>${esc(P.nameOf(x.app))} · ${esc(when(x.at))}</i></span></div>`).join('')
    const sec = (title, sub, body, empty) => `<section class="ap-card"><div class="ap-card-h"><b>${esc(title)}</b><span>${esc(sub)}</span></div>${body || `<div class="ap-hist-empty">${esc(empty)}</div>`}</section>`
    host.innerHTML = sec(T('hRunsT'), T('hRunsS'), runs, T('hRunsNone')) + sec(T('hSessT'), T('hSessS'), sessions, T('hSessNone')) + sec(T('hDriftT'), T('hDriftS'), drift, T('hDriftNone')) +
      `<p class="ap-foot"><button type="button" class="nt-sec sm" data-act="journal"><i class="fa fa-book" aria-hidden="true"></i>${esc(T('journal'))}</button></p>`
  }
})(typeof window !== 'undefined' ? window : globalThis)
