'use strict'
// Games tab "Library": the secondary views (Play history, Automation, History). Each takes the page context `x` and paints into its own host.
// Numbers come from recorded sessions only; nothing here is estimated. Buttons carry data-act and are handled by page.js (one delegated listener).
;(function (root) {
  const api = {}
  root.JylliGamesViews = api
  if (typeof document === 'undefined') return

  const spark = (P, vals, w, h) => { const d = P.spark(vals, w, h); return d ? `<svg class="ga-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true" focusable="false"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>` : '' }
  const agoText = (x, ms) => { const a = x.P.ago(ms); return a ? x.T('ago_' + a.k, { n: a.n }) : x.T('never') }
  const dur = (x, sec) => { const f = x.P.fmtHours(sec); return x.T('dur_' + f.k, { n: f.n }) }
  const fps = n => (n ? String(Math.round(n)) : '–')

  // ── Play history ──
  api.play = function (host, x) {
    const { T, esc, P } = x, snap = x.snap()
    if (!snap) { host.innerHTML = `<div class="ga-sk-block"></div>`; return }
    const rows = snap.games.filter(g => snap.stats[g.id]).sort((a, b) => snap.stats[b.id].last - snap.stats[a.id].last)
    const total = rows.reduce((s, g) => s + snap.stats[g.id].seconds, 0), sessions = rows.reduce((s, g) => s + snap.stats[g.id].sessions, 0)
    if (!rows.length) {
      host.innerHTML = `<div class="nt-empty ga-empty"><i class="fa fa-chart-line" aria-hidden="true"></i><b>${esc(T('playEmptyT'))}</b><span>${esc(T('playEmptyS'))}</span><button type="button" class="nt-sec sm" data-act="gopulse">${esc(T('playEmptyCta'))}</button></div>`
      return
    }
    host.innerHTML = `
      <section class="nt-card ga-totals"><div class="ga-tot"><b>${esc(String(sessions))}</b><span>${esc(T('totSessions'))}</span></div><div class="ga-tot"><b>${esc(dur(x, total))}</b><span>${esc(T('totTime'))}</span></div><div class="ga-tot"><b>${esc(String(rows.length))}</b><span>${esc(T('totGames'))}</span></div></section>
      <section class="nt-card ga-table"><div class="ga-th"><span>${esc(T('colGame'))}</span><span>${esc(T('colPlayed'))}</span><span>${esc(T('colAvg'))}</span><span>${esc(T('colLow'))}</span><span>${esc(T('colTrend'))}</span></div>
      ${rows.map(g => { const s = snap.stats[g.id]; return `<button type="button" class="ga-tr" data-act="open" data-id="${esc(g.id)}"><span class="ga-td-name"><b>${esc(g.name)}</b><i>${esc(agoText(x, s.last))}</i></span><span class="ga-num">${esc(dur(x, s.seconds))}<i>${esc(T('sessionsN', { n: s.sessions }))}</i></span><span class="ga-num">${fps(s.avgFps)}</span><span class="ga-num">${fps(s.low1Fps)}</span><span class="ga-td-spark">${spark(P, s.trend, 96, 28)}</span></button>` }).join('')}
      </section>
      <p class="nt-foot">${esc(T('playFoot'))}</p>`
  }

  // ── History (this tab's own runs; the full journal lives in System > History) ──
  api.history = function (host, x) {
    const { T, esc } = x, h = x.S.history
    if (!h) { host.innerHTML = `<div class="ga-sk-block"></div>`; return }
    if (!h.runs.length) { host.innerHTML = `<div class="nt-empty ga-empty"><i class="fa fa-clock-rotate-left" aria-hidden="true"></i><b>${esc(T('histEmptyT'))}</b><span>${esc(T('histEmptyS'))}</span></div>`; return }
    const name = id => { const g = x.snap() && x.snap().games.find(g => g.id === id); return g ? g.name : id }
    host.innerHTML = h.runs.map(r => {
      const ok = r.items.filter(i => i.ok).length, bad = r.items.length - ok
      const undoable = r.items.some(i => i.ok && i.action === 'apply')
      return `<section class="nt-card ga-run"><header class="nt-card-h"><div><b>${esc(T('runTitle', { n: r.items.length }))}</b><span>${esc(new Date(r.at).toLocaleString())} · ${esc(T('runOk', { n: ok }))}${bad ? ' · ' + esc(T('runBad', { n: bad })) : ''}</span></div>${undoable ? `<button type="button" class="nt-sec sm" data-act="undorun" data-run="${esc(r.id)}"><i class="fa fa-rotate-left" aria-hidden="true"></i>${esc(T('undo'))}</button>` : ''}</header>
        <ul class="ga-run-list">${r.items.map(i => `<li data-ok="${i.ok ? 1 : 0}"><i class="fa fa-${i.ok ? (i.verified === null ? 'circle-question' : 'circle-check') : 'circle-xmark'}" aria-hidden="true"></i><span><b>${esc(i.name || name(i.gameId))}</b> · ${esc(T('row_' + i.row))} · ${esc(T(i.action === 'apply' ? 'did_apply' : 'did_restore'))}${i.ok ? (i.verified === null ? ' · ' + esc(T('unverified')) : '') : ' · ' + esc(x.reason(i.reason))}</span></li>`).join('')}</ul></section>`
    }).join('') + `<button type="button" class="nt-sec sm ga-journal" data-act="journal">${esc(T('openJournal'))}</button>`
  }

  // ── Automation ──
  api.auto = function (host, x) {
    const { T, esc, S } = x, snap = x.snap()
    const on = x.watcher(), pulse = x.autoPulse()
    const sw = (act, checked, label) => `<button type="button" class="ga-sw" role="switch" aria-checked="${checked}" data-act="${act}" aria-label="${esc(label)}"><i></i></button>`
    const watchable = snap ? snap.games.filter(x2 => x2.pulse) : []
    const profiles = S.profiles || {}
    const names = Object.keys(profiles).filter(n => profiles[n] && profiles[n].type !== 'gameBundle').sort()
    const assigned = id => (root.settings && root.settings['gameProfile_' + id]) || ''
    const prof = watchable.map(w => `<div class="ga-arow"><span class="ga-arow-n">${esc(w.name)}</span><select class="ga-sel" data-act="assign" data-id="${esc(w.id)}" aria-label="${esc(T('assignFor', { name: w.name }))}"><option value="">${esc(T('noProfile'))}</option>${names.map(n => `<option value="${esc(n)}"${assigned(w.id) === n ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div>`).join('')
    const rd = S.ready || []
    host.innerHTML = `
      <section class="nt-card"><header class="nt-card-h"><div><b>${esc(T('autoWatchT'))}</b><span>${esc(on ? T('autoWatchOn') : T('autoWatchOff'))}</span></div>${sw('watcher', on, T('autoWatchT'))}</header>
        <p class="ga-p">${esc(T('autoWatchS'))}</p>
        <div class="ga-arow"><span class="ga-arow-n"><b>${esc(T('autoPulseT'))}</b><i>${esc(T('autoPulseS'))}</i></span>${sw('autopulse', pulse, T('autoPulseT'))}</div></section>
      <section class="nt-card"><header class="nt-card-h"><div><b>${esc(T('profT'))}</b><span>${esc(T('profS'))}</span></div></header>
        ${!x.snap() ? '<div class="ga-sk-block"></div>' : !x.premium() ? `<div class="ga-locked"><i class="fa fa-lock" aria-hidden="true"></i><span>${esc(T('lockedS'))}</span><button type="button" class="nt-sec sm" data-act="premium">${esc(T('unlock'))}</button></div>` : !watchable.length ? `<p class="ga-p">${esc(T('profNone'))}</p>` : !names.length ? `<p class="ga-p">${esc(T('profNoSaved'))}</p>${prof}` : prof}</section>
      <section class="nt-card"><header class="nt-card-h"><div><b>${esc(T('bundT'))}</b><span>${esc(T('bundS'))}</span></div><button type="button" class="nt-sec sm" data-act="bundle-new"><i class="fa fa-plus" aria-hidden="true"></i>${esc(T('bundNew'))}</button></header>
        ${(S.bundles || []).length ? `<div class="ga-bundles">${S.bundles.map(b => `<div class="ga-bundle"><b>${esc(b.name)}</b><span>${esc(b.gameName || '–')}</span><div class="ga-bundle-tags">${b.pulsePreset ? `<em>${esc(T('bundPulse'))}</em>` : ''}${b.tweakProfileName ? `<em>${esc(b.tweakProfileName)}</em>` : ''}</div><div class="ga-bundle-act"><button type="button" class="nt-sec sm" data-act="bundle-go" data-name="${esc(b.name)}"><i class="fa fa-play" aria-hidden="true"></i>${esc(T('bundGo'))}</button><button type="button" class="nt-sec sm" data-act="bundle-del" data-name="${esc(b.name)}" aria-label="${esc(T('bundDel'))}"><i class="fa fa-trash" aria-hidden="true"></i></button></div></div>`).join('')}</div>` : `<p class="ga-p">${esc(T('bundEmpty'))}</p>`}</section>
      <section class="nt-card"><header class="nt-card-h"><div><b>${esc(T('readyT'))}</b><span>${esc(T('readyS'))}</span></div></header>
        <ul class="ga-ready">${rd.map(r => `<li data-state="${esc(r.state)}"><i class="fa fa-${r.state === 'ok' ? 'circle-check' : r.state === 'open' ? 'circle-exclamation' : 'circle-question'}" aria-hidden="true"></i><span><b>${esc(T('rd_' + r.id))}</b><i>${esc(T('rdS_' + r.id))}</i></span><button type="button" class="nt-sec sm" data-act="reveal" data-tab="${esc(r.tab)}" data-id="${esc(r.id)}">${esc(T('rdGo'))}</button></li>`).join('')}</ul></section>`
  }
})(typeof window !== 'undefined' ? window : globalThis)
