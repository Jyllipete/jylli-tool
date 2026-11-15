'use strict'
// Game automation panel (Game Watcher, Update Guard, Game Shield, Auto-Pulse): HTML builders. Pure: state + helpers in, string out.
// State comes from lib/gameauto (snapshot()), phases from lib/gameauto/model.js. Copy: LANG group `gameauto` (js/lang/gameauto-*.js).
// x = { T(key, vars), esc, M (model), now, busy: {act: true}, exMsg: { tone, text }|null, open: Set }
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory()
  else root.JylliGameAutoViews = factory()
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const ICON = { watcher: 'eye', updateGuard: 'shield-halved', shield: 'bolt', autoPulse: 'wand-magic-sparkles' }
  const EV_ICON = { applied: 'circle-dot', restored: 'rotate-left', failed: 'circle-xmark', skipped: 'minus', info: 'circle-info' }
  const pct = v => Math.round((v - 50) / 45 * 100)

  const sw = (x, act, on, label, extra) => `<button type="button" class="gx-sw" role="switch" aria-checked="${on ? 'true' : 'false'}" data-act="${act}" aria-label="${x.esc(label)}"${x.busy[act] || (extra && extra.disabled) ? ' disabled' : ''}><i></i></button>`
  const chip = (x, tone, text) => `<span class="gx-chip" data-tone="${tone}">${x.esc(text)}</span>`
  const btn = (x, act, label, cls, attrs) => `<button type="button" class="${cls || 'nt-sec sm'}" data-act="${act}"${attrs || ''}${x.busy[act] ? ' disabled' : ''}>${x.esc(label)}</button>`
  const details = (x, key, title, body) => `<details class="gx-more" data-key="${key}"${x.open && x.open.has(key) ? ' open' : ''}><summary>${x.esc(title)}</summary><p>${x.esc(body)}</p></details>`

  function dur(ms, x) {
    const m = Math.max(0, Math.round(ms / 60000))
    if (m < 1) return x.T('durNow')
    return m < 60 ? x.T('durMin', { m }) : x.T('durHour', { h: Math.floor(m / 60), m: String(m % 60).padStart(2, '0') })
  }
  const clock = ms => { const s = Math.max(0, Math.round(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0') }
  const list = a => (a || []).join(', ')

  /** Which phase of Game Shield would close this program, from the lists in the state (the browser has no lib/gameshield). */
  function coverageOf(exe, lists) {
    const n = String(exe || '').toLowerCase().replace(/\.exe$/, '')
    if ((lists.tier1 || []).includes(n)) return 'launch'
    if ((lists.tier3 || []).includes(n)) return 'tier3'
    if ((lists.browsers || []).includes(n)) return 'mid'
    return null
  }

  // ── strip: is it watching, what is playing ──
  function strip(st, x) {
    const { T, esc, M } = x
    const wv = M.view('watcher', st), g = st.session && st.session.game
    const wp = wv.phase
    const eyebrow = T('wph_' + wp)
    const title = g ? g.name : wp === 'off' ? T('stripOffT') : wp === 'paused' ? T('stripPausedT') : wp === 'degraded' ? T('stripDegradedT') : T('stripWatchT')
    const arm = M.armed(st)
    const sub = g ? T('stripPlaying', { since: dur(x.now - st.session.startedAt, x), armed: arm.n, total: arm.total })
      : wp === 'off' ? T('stripOffS') : wp === 'paused' ? T('stripPausedS') : wp === 'degraded' ? T('stripDegradedS') : T('stripWatchS', { n: st.watcher.targets })
    const det = (st.detected || []).map(d => `<li><span>${esc(d.name)}</span>${d.pulse ? `<em title="${esc(T('detPulseTip'))}">Pulse</em>` : ''}${d.source === 'custom' ? `<em>${esc(T('detCustom'))}</em>` : d.source === 'library' ? `<em>${esc(T('detLibrary'))}</em>` : ''}</li>`).join('')
    return `<section class="gx-strip" data-tone="${wv.tone}" data-phase="${wp}" aria-live="polite">
      <div class="gx-strip-main"><div class="nt-eyebrow"><span class="nt-dot" aria-hidden="true"></span><span>${esc(eyebrow)}</span></div>
        <h3 class="gx-title">${esc(title)}</h3><p class="gx-sub">${esc(sub)}</p></div>
      <div class="gx-strip-sw"><span class="gx-sw-l">${esc(T('watcherT'))}</span>${sw(x, 'watcher', !!st.settings.watcher, T('watcherT'))}</div>
      <details class="gx-more gx-det" data-key="detected"${x.open && x.open.has('detected') ? ' open' : ''}><summary>${esc(T('detTitle', { n: (st.detected || []).length }))}</summary>
        <p>${esc(T('detBody'))}</p>
        <ul class="gx-det-list">${det}</ul>
        <div class="gx-arow"><span class="gx-arow-n"><b>${esc(T('libT'))}</b><i>${esc(T('libS'))}</i></span>${sw(x, 'lib', !!st.settings.libraryDetect, T('libT'))}</div>
        <p class="gx-fine">${esc(T('detLimits'))}</p>
        <div class="gx-row-act">${btn(x, 'open-games', T('openGames'))}</div>
      </details></section>`
  }

  // ── flow: what will happen ──
  function flow(st, x) {
    const { T, esc, M } = x
    const p = M.plan(st)
    const col = (k, items) => `<div class="gx-col"><h4>${esc(T('flow_' + k))}</h4>${items.length ? `<ul>${items.map(i => `<li data-f="${i.feature}"><i class="fa fa-${ICON[i.feature] || 'circle'}" aria-hidden="true"></i><span>${esc(T(i.key, i.vars || {}))}</span></li>`).join('')}</ul>` : `<p class="gx-none">${esc(T('flowNone'))}</p>`}</div>`
    const any = p.start.length + p.playing.length + p.exit.length > 1
    return `<section class="nt-card gx-flow"><header class="nt-card-h"><div><b>${esc(T('flowT'))}</b><span>${esc(T('flowS'))}</span></div></header>
      ${any ? `<div class="gx-cols">${col('start', p.start)}${col('playing', p.playing)}${col('exit', p.exit)}</div>` : `<p class="gx-empty">${esc(T('flowEmpty'))}</p>`}</section>`
  }

  // ── cards ──
  function cardFrame(name, id, st, x, bodyHtml) {
    const { T, esc, M } = x
    const v = M.view(name, st), locked = v.phase === 'locked'
    const on = !!st.settings[name]
    return `<section class="nt-card gx-card" id="${id}" data-phase="${v.phase}" data-tone="${v.tone}">
      <header class="nt-card-h"><div><b><i class="fa fa-${ICON[name]}" aria-hidden="true"></i>${esc(T(name + 'T'))}</b><span>${esc(T(name + 'S'))}</span></div>
        <div class="gx-head-r">${chip(x, v.tone, T('ph_' + v.phase))}${locked ? '' : sw(x, 'sw-' + name, on, T(name + 'T'))}</div></header>
      ${locked ? `<div class="gx-locked"><i class="fa fa-lock" aria-hidden="true"></i><span>${esc(T('lockedS'))}</span>${btn(x, 'premium', T('unlock'), 'nt-cta sm')}</div>` : bodyHtml}
      ${details(x, name + '-not', T('notT'), T(name + 'Not'))}</section>`
  }
  const needsWatcher = (st, x, name) => M2(st, name, x) === 'needsWatcher' ? `<div class="gx-note" data-tone="warn"><span>${x.esc(x.T('needsWatcher'))}</span>${btn(x, 'watcher-on', x.T('turnOnWatcher'))}</div>` : ''
  const M2 = (st, name, x) => x.M.phaseOf(name, st)
  const lineFor = (x, key, vars) => `<p class="gx-line" role="status">${x.esc(x.T(key, vars || {}))}</p>`

  function cardUg(st, x) {
    const { T, esc } = x, f = (st.features || {}).updateGuard || {}, ph = x.M.phaseOf('updateGuard', st)
    let body = needsWatcher(st, x, 'updateGuard')
    if (f.restoreFailed) body += `<div class="gx-note" data-tone="bad"><span>${esc(T('ugRestoreFail'))}</span>${btn(x, 'retry-ug', T('retry'), 'nt-cta sm')}</div>`
    else if (st.session && f.status === 'holding') body += lineFor(x, 'ugL_holding')
    else if (st.session && f.status === 'skipped') body += lineFor(x, 'ugL_skipped')
    else if (st.session && f.status === 'failed') body += lineFor(x, 'ugL_failed')
    else if (ph === 'restored') body += lineFor(x, f.reenabled ? 'ugL_restoredRe' : 'ugL_restored')
    else if (ph === 'armed') body += lineFor(x, 'ugL_armed')
    else if (ph === 'off') body += lineFor(x, 'ugL_off')
    if (st.session && f.pending) {
      const c = f.pending.count
      body += `<p class="gx-fine">${esc(c == null ? T('ugPendUnknown') : c === 0 ? T('ugPend0') : T('ugPendN', { n: c }))}</p>`
    }
    return cardFrame('updateGuard', 'lr-card-ug', st, x, body)
  }

  function exEditor(st, x) {
    const { T, esc } = x, ex = st.settings.exclusions || [], lists = st.lists || {}
    const chips = ex.map(e => { const cv = coverageOf(e, lists); return `<span class="gx-ex" data-cov="${cv || 'none'}" title="${esc(T('cov_' + (cv || 'none')))}"><span>${esc(e)}</span><button type="button" data-act="ex-del" data-exe="${esc(e)}" aria-label="${esc(T('exRemove', { name: e }))}">×</button></span>` }).join('')
    const m = x.exMsg
    return `<div class="gx-sub-b"><h4>${esc(T('exT'))}</h4><p class="gx-fine">${esc(T('exS'))}</p>
      <div class="gx-ex-row">${chips || `<span class="gx-none">${esc(T('exNone'))}</span>`}</div>
      <form class="gx-ex-add" data-form="ex"><input class="gx-in" type="text" name="exe" maxlength="64" autocomplete="off" spellcheck="false" placeholder="${esc(T('exPlaceholder'))}" aria-label="${esc(T('exT'))}" aria-describedby="gx-ex-msg">
        <button type="submit" class="nt-sec sm"${x.busy['ex-add'] ? ' disabled' : ''}>${esc(T('exAdd'))}</button></form>
      <p class="gx-ex-msg" id="gx-ex-msg" role="status" data-tone="${m ? m.tone : 'idle'}">${m ? esc(m.text) : ''}</p></div>`
  }

  function cardGs(st, x) {
    const { T, esc } = x, f = (st.features || {}).shield || {}, L = st.lists || {}, s = st.settings
    let body = needsWatcher(st, x, 'shield')
    if (f.restoreFailed && f.restoreFailed.length) {
      body += `<div class="gx-note" data-tone="bad"><span><b>${esc(T('gsRestoreFail'))}</b></span><ul class="gx-fails">${f.restoreFailed.map(r => `<li><code>${esc(r.name)}</code> — ${esc(T('v_' + r.verdict))}</li>`).join('')}</ul>${btn(x, 'retry-gs', T('gsRetry'), 'nt-cta sm')}</div>`
    } else if (st.session && f.status === 'active') {
      const n = (f.stopped || []).length
      body += lineFor(x, n ? 'gsL_active' : 'gsL_none', { n, list: list(f.stopped || []) })
    } else if (st.session && f.status === 'failed') body += lineFor(x, 'gsL_failed')
    else if (x.M.phaseOf('shield', st) === 'restored') body += lineFor(x, 'gsL_restored', { n: (f.summary && f.summary.killed) || 0, mb: (f.summary && f.summary.freedMB) || 0 })
    else if (x.M.phaseOf('shield', st) === 'armed') body += lineFor(x, 'gsL_armed')
    else if (x.M.phaseOf('shield', st) === 'off') body += lineFor(x, 'gsL_off')
    const slider = (k, label, hint, min, max, v) => `<div class="gx-slider"><div class="gx-slider-h"><span>${esc(label)}</span><output data-out="${k}">${v}%</output></div>
      <input type="range" class="gx-range" min="${min}" max="${max}" step="5" value="${v}" data-slider="${k}" aria-label="${esc(label)}" style="--p:${pct(v)}%"><p class="gx-fine">${esc(hint)}</p></div>`
    body += `<div class="gx-gs">
      <div class="gx-cols gx-cols2"><div class="gx-col"><h4>${esc(T('gsAtLaunch'))}</h4>
          <p><b>${esc(T('gsAlways'))}</b> ${esc(list(L.tier1))}</p><p><b>${esc(T('gsIfRam', { n: s.tier3 }))}</b> ${esc(list(L.tier3))}</p></div>
        <div class="gx-col"><h4>${esc(T('gsDuring'))}</h4><p><b>${esc(T('gsIfRam', { n: s.mid }))}</b> ${esc(list([...(L.tier3 || []), ...(L.browsers || [])]))}</p><p class="gx-fine">${esc(T('gsDuringNote'))}</p></div></div>
      <div class="gx-scale" aria-hidden="true"><div class="gx-bar"><span class="gx-mk" data-k="tier3" style="left:${pct(s.tier3)}%"><b>${esc(T('mkLaunch'))}</b></span><span class="gx-mk" data-k="mid" style="left:${pct(s.mid)}%"><b>${esc(T('mkDuring'))}</b></span></div><div class="gx-ticks"><span>50%</span><span>70%</span><span>95%</span></div></div>
      <div class="gx-sliders">${slider('tier3', T('gsSliderLaunch'), T('gsSliderLaunchHint'), 50, 90, s.tier3)}${slider('mid', T('gsSliderMid'), T('gsSliderMidHint'), 55, 95, s.mid)}</div>
      ${exEditor(st, x)}
      <p class="gx-fine">${esc(T('gsTasks'))}</p></div>`
    return cardFrame('shield', 'lr-card-gs', st, x, body)
  }

  function cardAp(st, x) {
    const { T, esc } = x, f = (st.features || {}).autoPulse || {}, ph = x.M.phaseOf('autoPulse', st), g = st.session && st.session.game
    let body = needsWatcher(st, x, 'autoPulse')
    if (st.session && ph !== 'off' && ph !== 'needsWatcher' && ph !== 'locked') {
      const key = { active: 'apL_active', starting: 'apL_starting', failed: 'apL_failed', manual: 'apL_manual', snoozed: 'apL_snoozed', unavailable: 'apL_unavailable', skipped: 'apL_off-for-game' }[ph]
      if (key) body += ph === 'failed'
        ? `<div class="gx-note" data-tone="bad"><span>${esc(T('apL_failed', { reason: f.reason || '' }))}</span>${btn(x, 'open-pulse', T('openPulse'))}</div>`
        : lineFor(x, key, { game: g ? g.name : '' })
    } else if (ph === 'armed') body += lineFor(x, 'apL_armed')
    else if (ph === 'restored') body += lineFor(x, 'apL_restored')
    else if (ph === 'off') body += lineFor(x, 'apL_off')
    const rows = (st.detected || []).filter(d => d.pulse)
    const off = st.settings.pulseOff || []
    body += `<div class="gx-sub-b"><h4>${esc(T('apPerGame'))}</h4><p class="gx-fine">${esc(T('apPerGameS'))}</p>
      <div class="gx-games">${rows.map(d => `<label class="gx-game"><span>${esc(d.name)}</span><button type="button" class="gx-sw" role="switch" aria-checked="${off.includes(d.id) ? 'false' : 'true'}" data-act="pulse-game" data-id="${esc(d.id)}" aria-label="${esc(T('apGameAria', { name: d.name }))}"${x.busy['pulse-game:' + d.id] ? ' disabled' : ''}><i></i></button></label>`).join('')}</div>
      <div class="gx-row-act">${off.length ? btn(x, 'pulse-reset', T('apReset')) : ''}</div>
      <p class="gx-fine">${esc(T('apNoPreset'))}</p></div>`
    if (st.legacyOverrides) body += `<div class="gx-note" data-tone="info"><span>${esc(T('apLegacy', { n: st.legacyOverrides }))}</span>${btn(x, 'dismiss-legacy', T('dismiss'))}</div>`
    return cardFrame('autoPulse', 'lr-card-ap', st, x, body)
  }

  // ── ledger ──
  function evText(e, x) {
    const { T } = x
    const base = 'ev_' + e.feature + '_' + e.kind + (e.kind === 'restored' && e.ok === false ? '_fail' : '')
    const key = [base + '_' + e.detail, base].find(k => x.has(k)) || 'ev_generic'
    return T(key, { key: e.key || '', detail: e.detail || '', name: (e.vars && e.vars.name) || '', verdict: e.kind === 'restored' && e.detail && x.has('v_' + e.detail) ? T('v_' + e.detail) : (e.detail || ''), feature: e.feature, kind: e.kind })
  }
  const evTone = e => (e.ok === false || e.kind === 'failed' ? 'bad' : e.kind === 'restored' ? 'ok' : e.kind === 'applied' ? 'info' : 'idle')

  function ledger(st, x) {
    const { T, esc } = x
    const cur = st.session, last = st.lastSession
    const s = cur || last
    if (!s) return `<section class="nt-card gx-ledger"><header class="nt-card-h"><div><b>${esc(T('ledgerT'))}</b><span>${esc(T('ledgerS'))}</span></div></header><p class="gx-empty">${esc(T('ledgerEmpty'))}</p></section>`
    const sum = cur ? null : last.summary
    const rows = (s.events || []).map(e => `<li data-tone="${evTone(e)}"><i class="fa fa-${EV_ICON[e.kind] || 'circle'}" aria-hidden="true"></i><span>${esc(evText(e, x))}</span><time>+${clock(e.at - s.startedAt)}</time></li>`).join('')
    const head = cur ? T('ledgerNow', { game: s.game ? s.game.name : '' }) : T('ledgerLast', { game: s.game ? s.game.name : '' })
    const subl = cur ? T('ledgerSince', { since: dur(x.now - s.startedAt, x) }) : T('ledgerEnded', { why: T('end_' + (last.endReason || 'exit')), dur: dur((last.endedAt || s.startedAt) - s.startedAt, x) })
    const chips = sum ? chip(x, sum.clean ? 'ok' : 'bad', sum.clean ? T('allRestored') : T('needsAttention', { n: sum.pending.length + sum.failedRestores.length })) : ''
    const hist = (st.history || []).filter(h => !cur ? h.id !== last.id : true).slice(0, 4)
    return `<section class="nt-card gx-ledger"><header class="nt-card-h"><div><b>${esc(head)}</b><span>${esc(subl)}</span></div><div class="gx-head-r">${chips}</div></header>
      ${rows ? `<ul class="gx-ev">${rows}</ul>` : `<p class="gx-empty">${esc(T('ledgerNoEvents'))}</p>`}
      ${hist.length ? `<details class="gx-more" data-key="hist"${x.open && x.open.has('hist') ? ' open' : ''}><summary>${esc(T('histT'))}</summary><ul class="gx-hist">${hist.map(h => `<li><span>${esc(h.game ? h.game.name : '–')}</span><em>${esc(h.summary.clean ? T('allRestored') : T('needsAttention', { n: h.summary.pending.length + h.summary.failedRestores.length }))}</em><time>${esc(new Date(h.startedAt).toLocaleString())}</time></li>`).join('')}</ul></details>` : ''}</section>`
  }

  const loading = x => `<div class="gx-load" role="status" aria-label="${x.esc(x.T('loading'))}"><span class="j-skeleton gx-sk1"></span><span class="j-skeleton gx-sk2"></span><span class="j-skeleton gx-sk3"></span></div>`
  const failed = x => `<section class="nt-card gx-fail"><i class="fa fa-triangle-exclamation" aria-hidden="true"></i><div><b>${x.esc(x.T('failT'))}</b><p>${x.esc(x.T('failS'))}</p></div>${btn(x, 'reload', x.T('retry'), 'nt-cta sm')}</section>`

  return { strip, flow, cardUg, cardGs, cardAp, ledger, loading, failed, evText, coverageOf, dur, ICON }
})
