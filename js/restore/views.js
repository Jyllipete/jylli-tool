'use strict'
// Restore points tab "Lifeline": HTML builders (stage, lifeline, rows, cards, sheet, receipt). Pure string functions of the snapshot; page.js owns state and events.
;(function (root) {
  const V = {}
  root.JylliRestoreViews = V
  if (typeof module !== 'undefined' && module.exports) module.exports = V

  const dateOf = ts => { try { return new Date(ts).toLocaleString(typeof currentLang !== 'undefined' && currentLang === 'fi' ? 'fi-FI' : undefined, { dateStyle: 'medium', timeStyle: 'short' }) } catch (e) { return '' } }
  const dayOf = ts => { try { return new Date(ts).toLocaleDateString(typeof currentLang !== 'undefined' && currentLang === 'fi' ? 'fi-FI' : undefined, { dateStyle: 'medium' }) } catch (e) { return '' } }
  const ageText = (c, ms) => { const a = c.P.age(ms); return c.T(a.key, { n: a.n }) }
  V.dateOf = dateOf

  /** The name a row shows: the app's own points are decoded, Windows' descriptions are shown as Windows wrote them. */
  V.nameOf = (c, p) => {
    if (c.P.NAMED_BY_APP.includes(p.origin) || p.origin === 'jylli') {
      const arg = p.origin === 'beforeTweak' ? (p.argName || p.arg) : p.arg
      const k = p.origin === 'manual' ? (arg ? 'n_manual_l' : 'n_manual') : 'n_' + p.origin
      return c.T(k, { arg })
    }
    if (p.origin === 'restoreOp') return c.T('n_restoreOp')
    return p.desc || c.T('n_unnamed')
  }

  const btn = (act, label, cls, icon, extra) => `<button type="button" class="${cls}" data-act="${act}"${extra || ''}>${icon ? `<i class="fa fa-${icon}" aria-hidden="true"></i>` : ''}${c0(label)}</button>`
  const c0 = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))

  // ── stage ──
  V.stage = function (c) {
    const { T, esc, S } = c, s = S.snap
    let tone = 'idle', eyebrow, title, lead, actions = '', steps = ''
    if (S.rebooting) {
      tone = 'accent'; eyebrow = T('eyeReboot'); title = T('vReboot'); lead = T('vRebootS', { seq: S.rebooting })
    } else if (S.creating) {
      tone = 'accent'; eyebrow = T('eyeCreate'); title = T('vCreate'); lead = T('vCreateS')
      const order = ['check', 'snapshot', 'verify'], at = Math.max(0, order.indexOf(S.creating.phase))
      steps = `<ol class="rs-steps" aria-label="${esc(T('vCreate'))}">${order.map((k, i) => `<li data-state="${i < at ? 'done' : i === at ? 'now' : 'next'}"><i class="fa fa-${i < at ? 'check' : i === at ? 'circle-notch fa-spin' : 'circle'}" aria-hidden="true"></i>${esc(T('step_' + k))}</li>`).join('')}</ol>`
      actions = `<button type="button" class="nt-cta" disabled><i class="fa fa-circle-notch fa-spin" aria-hidden="true"></i>${esc(T('working'))}</button>`
    } else if (S.busy) {
      tone = 'accent'; eyebrow = T('eyeBusy'); title = S.busy; lead = T('busyS')
      actions = `<button type="button" class="nt-cta" disabled><i class="fa fa-circle-notch fa-spin" aria-hidden="true"></i>${esc(T('working'))}</button>`
    } else if (!s) {
      eyebrow = T('eyeScan'); title = S.failed ? T('vFail') : T('vScan'); lead = S.failed ? T('vFailS') : T('vScanS'); tone = S.failed ? 'warn' : 'idle'
      if (S.failed) actions = btn('rescan', T('retry'), 'nt-cta', 'arrows-rotate')
    } else {
      const v = s.verdict
      tone = { ok: 'ok', warn: 'warn', danger: 'danger' }[v.tone] || 'idle'
      const a = s.newestAt != null ? c.P.age(Date.now() - s.newestAt) : null
      const vars = { ...v.vars, age: a ? T(a.key, { n: a.n }) : '' }
      eyebrow = T('eyeReady')
      title = T('v_' + v.kind, vars)
      lead = T('vS_' + v.kind + (v.kind === 'off' && v.vars.policy ? '_policy' : ''), vars)
      if (s.since > 0 && (v.kind === 'covered' || v.kind === 'stale')) lead += ' ' + T('vSAfter', { n: s.since })
      if (S.made) lead = T('madeLead', { seq: S.made })
      const ctaLabel = { create: v.kind === 'none' ? T('ctaFirst') : v.kind === 'stale' ? T('ctaRefresh') : T('ctaCreate'), protect: T('ctaOn'), relaunch: T('ctaRelaunch'), rescan: T('retry') }[v.cta]
      const icon = { create: 'life-ring', protect: 'shield-halved', relaunch: 'user-shield', rescan: 'arrows-rotate' }[v.cta]
      actions = btn(v.cta === 'create' ? 'create' : v.cta, ctaLabel, 'nt-cta', icon)
      if (v.cta !== 'rescan') actions += btn('rescan', T('rescan'), 'nt-sec', 'arrows-rotate')
    }
    return { tone, html: `<div class="nt-eyebrow"><span class="nt-dot"></span>${esc(eyebrow)}</div><h2 class="nt-title" data-tone="${tone}">${esc(title)}</h2><p class="nt-lead">${esc(lead)}</p>${steps}<div class="nt-actions">${actions}</div>` }
  }

  // ── facts (side of the stage) ──
  V.facts = function (c) {
    const { T, esc, P, S } = c, s = S.snap
    if (!s || !s.read) return ''
    const st = s.storage
    const newest = s.newestAt != null ? ageText(c, Date.now() - s.newestAt) : '–'
    const cap = st && st.has ? (st.unbounded ? T('capNone') : P.fmtBytes(st.max)) : '–'
    const used = st && st.has ? P.fmtBytes(st.used) : '–'
    const room = s.room == null ? '–' : T('roomN', { n: s.room })
    const share = P.usedShare(st)
    return `<div class="rs-facts" role="list">
      <div role="listitem"><b>${s.points.length}</b><span>${esc(T('fPoints'))}</span></div>
      <div role="listitem"><b>${esc(newest)}</b><span>${esc(T('fNewest'))}</span></div>
      <div role="listitem"><b>${esc(used)}</b><span>${esc(T('fUsed', { cap }))}</span>${share != null ? `<i class="rs-bar" role="img" aria-label="${esc(T('fUsedAria', { pct: Math.round(share * 100) }))}"><u style="width:${Math.round(share * 100)}%" data-hi="${share >= 0.85 ? 1 : 0}"></u></i>` : ''}</div>
      <div role="listitem"><b>${esc(room)}</b><span>${esc(T('fRoom'))}</span><em>${esc(T('fRoomNote'))}</em></div></div>`
  }

  // ── lifeline ──
  V.lifeline = function (c) {
    const { T, esc, P, S } = c, s = S.snap
    if (!s || !s.read) return `<div class="rs-line-sk" aria-busy="true"></div>`
    const L = s.line
    const ticks = L.ticks.map(t => {
      const tip = `${T('tickTip', { n: t.n })}: ${t.names.join(', ')}${t.n > t.names.length ? '…' : ''}`
      return `<span class="rs-tick" data-since="${t.since > 0 ? 1 : 0}" data-old="${t.old === t.n ? 1 : 0}" style="left:${P.pct(t.x)}%;height:${P.tickHeight(t.n)}px" title="${esc(tip)}"></span>`
    }).join('')
    const pts = L.points.map(p => {
      const full = s.points.find(x => x.seq === p.seq)
      const nm = full ? V.nameOf(c, full) : '#' + p.seq
      return `<button type="button" class="rs-pt" data-group="${p.group}" data-act="open" data-seq="${p.seq}" aria-selected="${S.sel === p.seq}" style="left:${P.pct(p.x)}%" title="${esc(nm)}" aria-label="${esc(nm + ', ' + (full && full.at != null ? dateOf(full.at) : ''))}"></button>`
    }).join('')
    const gap = L.since && L.sinceFrom != null ? `<span class="rs-gap"${1 - L.sinceFrom < 0.3 ? ' data-out' : ''} style="left:${P.pct(L.sinceFrom)}%"><em>${esc(T('lnSince'))}</em></span>` : ''
    const empty = !L.points.length && !L.ticks.length ? `<span class="rs-line-empty">${esc(T('lnEmpty'))}</span>` : ''
    return `<div class="rs-line-h"><b>${esc(T('lnTitle'))}</b>
        <span class="rs-legend"><span data-k="jylli">${esc(T('lgJylli'))}</span><span data-k="windows">${esc(T('lgWindows'))}</span><span data-k="tick">${esc(T('lgChange'))}</span>${L.since ? `<span data-k="gap">${esc(T('lgSince'))}</span>` : ''}</span></div>
      <div class="rs-track" role="group" aria-label="${esc(T('lnTitle'))}">${gap}<span class="rs-base"></span>${ticks}${pts}${empty}</div>
      <div class="rs-axis"><span>${esc(dayOf(L.from))}${L.older ? ` <i>${esc(T('lnOlder', { n: L.older }))}</i>` : ''}</span><span>${esc(T('lnToday'))}</span></div>`
  }

  // ── findings ──
  V.finds = function (c) {
    const { T, esc, S } = c, s = S.snap
    const list = s ? s.findings.slice(0, 4) : []
    return list.map(f => {
      const act = { none: 'create', stale: 'create', policy: 'protect', vss: 'protection-open', unprotected: 'history' }[f.kind]
      const label = { create: T('ctaCreate'), protect: T('ctaOn'), 'protection-open': T('openProtection'), history: T('openHistory') }[act]
      return `<div class="rs-find" data-tone="${f.tone}"><span class="rs-find-i"><i class="fa fa-${f.tone === 'warn' ? 'triangle-exclamation' : 'circle-info'}" aria-hidden="true"></i></span>
        <span class="rs-find-t"><b>${esc(T('fT_' + f.kind, f.vars))}</b><span>${esc(T('fS_' + f.kind, f.vars))}</span></span>${act ? `<button type="button" class="nt-sec sm" data-act="${act}">${esc(label)}</button>` : ''}</div>`
    }).join('')
  }

  // ── points ──
  V.row = function (c, p) {
    const { T, esc, P, S } = c
    const ic = P.ORIGIN_ICON[p.origin] || 'life-ring'
    const nm = V.nameOf(c, p)
    const after = P.afterLabel(p)
    return `<div class="rs-row" role="option" tabindex="0" data-act="open" data-seq="${p.seq}" data-group="${p.group}" aria-selected="${S.sel === p.seq}">
      <span class="rs-ico" data-group="${p.group}"><i class="fa fa-${ic}" aria-hidden="true"></i></span>
      <span class="rs-nm"><b>${esc(nm)}</b><i>${esc(T('o_' + p.origin))} · #${p.seq}</i></span>
      <span class="rs-when"><b>${esc(p.at != null ? dateOf(p.at) : '–')}</b><i>${esc(p.at != null ? ageText(c, Date.now() - p.at) : '')}</i></span>
      <span class="rs-after">${after ? `<em title="${esc(T('afterTip'))}">${esc(T('afterN', { n: after }))}</em>` : ''}</span>
      <span class="rs-go" aria-hidden="true"><i class="fa fa-chevron-right"></i></span></div>`
  }
  V.list = function (c) {
    const { T, esc, P, S } = c, s = S.snap
    if (!s) return S.failed
      ? `<div class="nt-empty rs-empty"><i class="fa fa-plug-circle-exclamation" aria-hidden="true"></i><b>${esc(T('vFail'))}</b><span>${esc(T('vFailS'))}</span><button type="button" class="nt-sec sm" data-act="rescan">${esc(T('retry'))}</button></div>`
      : `<div class="rs-list" aria-busy="true">${Array.from({ length: 5 }, () => '<div class="rs-rowsk"></div>').join('')}</div>`
    if (!s.read) return `<div class="nt-empty rs-empty"><i class="fa fa-circle-question" aria-hidden="true"></i><b>${esc(T('unreadT'))}</b><span>${esc(T(s.admin === false ? 'unreadAdminS' : 'unreadS'))}</span><button type="button" class="nt-sec sm" data-act="rescan">${esc(T('retry'))}</button></div>`
    if (!s.points.length) return `<div class="nt-empty rs-empty"><i class="fa fa-life-ring" aria-hidden="true"></i><b>${esc(T('emptyT'))}</b><span>${esc(T('emptyS'))}</span></div>`
    const rows = P.filterPoints(s.points, S.filter)
    if (!rows.length) return `<div class="nt-empty rs-empty"><i class="fa fa-filter" aria-hidden="true"></i><b>${esc(T('noMatchT'))}</b><span>${esc(T('noMatchS', { f: T('chip_' + S.filter) }))}</span><button type="button" class="nt-sec sm" data-act="clear-filter">${esc(T('clearFilter'))}</button></div>`
    return `<div class="rs-list" role="listbox" aria-label="${esc(T('listLabel'))}">${rows.map(p => V.row(c, p)).join('')}</div>`
  }

  // ── side cards ──
  V.protection = function (c) {
    const { T, esc, P, S } = c, s = S.snap
    if (!s || !s.read) return ''
    const on = s.protection === 'on', st = s.storage
    const cap = P.capPercent(st, s.volume), near = P.nearestPct(cap, s.capPcts)
    const chips = (s.capPcts || []).map(n => `<button type="button" class="nt-chip" data-act="storage" data-pct="${n}" aria-pressed="${near === n}" ${on ? '' : 'disabled'}>${n}%</button>`).join('')
    const share = P.usedShare(st)
    const note = s.policy && s.policy.blocked ? T('protPolicy') : s.vss && s.vss.disabled ? T('protVss') : ''
    return `<section class="rs-card" aria-label="${esc(T('protT'))}"><header><b>${esc(T('protT'))}</b><span class="rs-pill" data-on="${on ? 1 : 0}">${esc(T(on ? 'protOn' : s.protection === 'off' ? 'protOff' : 'protUnknown'))}</span></header>
      <div class="rs-sw-row"><p>${esc(T('protS', { drive: s.drive || 'C:' }))}</p>
        <button type="button" class="rs-sw" role="switch" aria-checked="${on}" data-act="protect-toggle" aria-label="${esc(T('protT'))}"><i></i></button></div>
      ${note ? `<p class="rs-note" data-tone="warn">${esc(note)}</p>` : ''}
      <div class="rs-cap"><div class="rs-cap-h"><span>${esc(T('capT'))}</span><b>${esc(st && st.has ? (st.unbounded ? T('capNone') : P.fmtBytes(st.max) + (cap != null ? ` (${Math.round(cap)}%)` : '')) : '–')}</b></div>
        ${share != null ? `<i class="rs-bar" role="img" aria-label="${esc(T('fUsedAria', { pct: Math.round(share * 100) }))}"><u style="width:${Math.round(share * 100)}%" data-hi="${share >= 0.85 ? 1 : 0}"></u></i>` : ''}
        <div class="nt-chips-bar rs-chips" role="group" aria-label="${esc(T('capT'))}">${chips}</div>
        <p class="rs-note">${esc(T(st && st.unbounded ? 'capNoneS' : 'capS'))}</p></div></section>`
  }
  V.schedule = function (c) {
    const { T, esc, P, S } = c, s = S.snap
    if (!s || !s.read) return ''
    const sc = s.schedule
    const chips = P.SCHEDULE.map(([d, k]) => `<button type="button" class="nt-chip" data-act="schedule" data-days="${d}" aria-pressed="${sc.days === d}">${esc(T('sch_' + k))}</button>`).join('')
    const last = sc.lastAt ? T('schLast', { when: dateOf(sc.lastAt) }) : T('schNever')
    const next = sc.days > 0 && sc.nextAt ? T(sc.nextAt <= Date.now() ? 'schDue' : 'schNext', { when: dateOf(sc.nextAt) }) : ''
    return `<section class="rs-card" aria-label="${esc(T('schT'))}"><header><b>${esc(T('schT'))}</b></header><p>${esc(T('schS'))}</p>
      <div class="nt-chips-bar rs-chips" role="group" aria-label="${esc(T('schT'))}">${chips}</div>
      <p class="rs-note">${esc(last)}${next ? ' · ' + esc(next) : ''}</p><p class="rs-note">${esc(T('schRules'))}</p></section>`
  }
  V.know = function (c) {
    const { T, esc } = c
    return `<section class="rs-card rs-know" aria-label="${esc(T('knowT'))}"><header><b>${esc(T('knowT'))}</b></header>
      ${[1, 2, 3].map(i => `<div><b>${esc(T('know' + i + 'T'))}</b><span>${esc(T('know' + i + 'B'))}</span></div>`).join('')}</section>`
  }

  // ── banner: pending / receipt of the last restore ──
  V.banner = function (c) {
    const { T, esc, S } = c, s = S.snap
    if (!s) return ''
    const rows = []
    if (s.pending) rows.push({ tone: 'info', icon: 'hourglass-half', t: T('bnPendingT', { seq: s.pending.seq }), s: T('bnPendingS', { when: dateOf(s.pending.at) }) })
    const lr = s.lastRestore
    if (lr) {
      const ok = lr.status === 'succeeded'
      rows.push({ tone: ok ? 'ok' : 'warn', icon: ok ? 'circle-check' : 'triangle-exclamation', t: T('rc_' + lr.status + 'T', { seq: lr.seq }), s: T('rc_' + lr.status + 'S', { n: lr.marked, tweaks: lr.tweaks }), act: 'ack', label: T('dismiss') })
    }
    return rows.map(r => `<div class="nt-banner" data-tone="${r.tone}"><span class="nt-banner-ico"><i class="fa fa-${r.icon}" aria-hidden="true"></i></span><span class="nt-banner-t"><b>${esc(r.t)}</b><span>${esc(r.s)}</span></span>${r.act ? `<button type="button" class="nt-sec sm" data-act="${r.act}">${esc(r.label)}</button>` : ''}</div>`).join('')
  }

  // ── the point sheet ──
  V.sheet = function (c, pv) {
    const { T, esc } = c, p = pv.point
    const nm = V.nameOf(c, p)
    const list = (items, fn, more) => (items.length ? `<ul class="rs-ul">${items.map(fn).join('')}</ul>${more > 0 ? `<p class="rs-more">${esc(T('shMore', { n: more }))}</p>` : ''}` : '')
    const chg = pv.changeCount
      ? list(pv.changes.slice(0, 8), x => `<li><i class="fa fa-sliders" aria-hidden="true"></i><span>${esc(x.name)}</span><em>${esc(dateOf(x.ts))}</em></li>`, pv.changeCount - Math.min(8, pv.changes.length))
      : `<p class="rs-none">${esc(T('shNoChanges'))}</p>`
    const later = pv.programsLaterCount ? list(pv.programsLater.slice(0, 8), x => `<li><i class="fa fa-box-open" aria-hidden="true"></i><span>${esc(x.name)}</span><em>${esc(dayOf(x.day))}</em></li>`, pv.programsLaterCount - Math.min(8, pv.programsLater.length)) : `<p class="rs-none">${esc(T('shNoPrograms'))}</p>`
    const same = pv.programsSameCount ? `<p class="rs-sub">${esc(T('shSame', { n: pv.programsSameCount }))}</p>${list(pv.programsSame.slice(0, 5), x => `<li><i class="fa fa-box-open" aria-hidden="true"></i><span>${esc(x.name)}</span></li>`, pv.programsSameCount - Math.min(5, pv.programsSame.length))}` : ''
    const r = pv.ready
    const checks = [
      [r.admin, T('chkAdmin'), T('chkAdminBad')],
      [!r.onBattery, T('chkPower'), T('chkPowerBad', { pct: r.batteryPct == null ? '' : r.batteryPct })],
      [!r.diskLow, T('chkDisk'), T('chkDiskBad')],
    ].map(x => `<li data-ok="${x[0] ? 1 : 0}"><i class="fa fa-${x[0] ? 'circle-check' : 'triangle-exclamation'}" aria-hidden="true"></i><span>${esc(x[0] ? x[1] : x[2])}</span></li>`).join('')
    return `<header class="nt-sheet-h rs-sh"><span class="rs-ico big" data-group="${p.group}"><i class="fa fa-${c.P.ORIGIN_ICON[p.origin] || 'life-ring'}" aria-hidden="true"></i></span>
        <div><h3>${esc(nm)}</h3><p>${esc(T('o_' + p.origin))} · #${p.seq} · ${esc(p.at != null ? dateOf(p.at) : '–')}</p></div></header>
      <div class="rs-sh-body">
        <section><h4>${esc(T('shWhat'))}</h4><p class="rs-sub">${esc(T('shChanges', { n: pv.changeCount }))}</p>${chg}
          <p class="rs-sub">${esc(T('shPrograms'))}</p>${later}${same}</section>
        <section><h4>${esc(T('shFacts'))}</h4><ul class="rs-ul plain"><li><i class="fa fa-file-shield" aria-hidden="true"></i><span>${esc(T('shF1'))}</span></li><li><i class="fa fa-gears" aria-hidden="true"></i><span>${esc(T('shF2'))}</span></li><li><i class="fa fa-power-off" aria-hidden="true"></i><span>${esc(T('shF3'))}</span></li></ul></section>
        <section><h4>${esc(T('shReady'))}</h4><ul class="rs-ul checks">${checks}</ul></section>
      </div>
      <label class="rs-ack"><input type="checkbox" data-ack><span>${esc(T('shAck'))}</span></label>
      <footer class="nt-sheet-f rs-sh-f"><button type="button" class="nt-sec warn" data-del><i class="fa fa-trash" aria-hidden="true"></i>${esc(T('shDelete'))}</button><span class="rs-grow"></span><button type="button" class="nt-sec" data-close>${esc(T('cancel'))}</button><button type="button" class="nt-cta" data-go disabled><i class="fa fa-rotate-left" aria-hidden="true"></i>${esc(T('shRestore'))}</button></footer>`
  }
})(typeof window !== 'undefined' ? window : globalThis)
