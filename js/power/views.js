'use strict'
// Power tab views: Overview cards (what this PC does, battery, power mode, drives), Plans (the plan in use, the others, comparison, timeouts, tidy),
// Sleep & wake and Energy. page.js owns state, the engine calls and the live feed, and passes `ctx`.
// Every value printed here was read from this PC; what was not read prints "–" with a reason.
;(function (root) {
  const V = {}
  root.JylliPowerViews = V
  if (typeof module !== 'undefined' && module.exports) module.exports = V
  if (typeof document === 'undefined') return

  const Pl = () => root.JylliPowerPlans
  const fmtDate = ts => { try { return new Date(ts).toLocaleString(root.currentLang === 'fi' ? 'fi-FI' : undefined, { dateStyle: 'medium', timeStyle: 'short' }) } catch (e) { return '' } }
  const head = (ctx, title, sub, right) => `<header class="nt-card-h"><div><b>${ctx.esc(title)}</b>${sub ? `<span>${ctx.esc(sub)}</span>` : ''}</div>${right || ''}</header>`
  const sk = () => '<div class="gp-sk"></div>'
  const note = (ctx, icon, text) => `<p class="gp-note"><i class="fa fa-${icon}" aria-hidden="true"></i>${ctx.esc(text)}</p>`
  const tail = n => { const s = String(n || ''); const i = s.lastIndexOf('\\'); return i >= 0 && i < s.length - 1 ? s.slice(i + 1) : s }
  const unread = (ctx, key) => note(ctx, 'circle-question', ctx.T(key || 'unreadFact'))
  const spin = '<i class="fa fa-circle-notch fa-spin" aria-hidden="true"></i>'

  // ── Overview: what this PC does ─────────────────────────────────────────────────────────────
  V.facts = function (card, ctx) {
    const { T, esc, S, P } = ctx, f = S.facts
    if (!f || !f.read) { card.innerHTML = head(ctx, T('factsT'), T('factsS')) + sk(); return }
    const a = id => Pl().byAnat[id], v = (id, side) => Pl().valuesOf(f.idx, f.activeGuid, a(id))[side]
    const t = (id, side) => P.descText(T, Pl().describe(a(id), v(id, side)))
    const yn = x => (x == null ? '–' : T(x ? 'yes' : 'no'))
    const modes = { [Pl().OVERLAY.efficiency]: 'modeEfficiency', [Pl().OVERLAY.balanced]: 'modeBalanced', [Pl().OVERLAY.performance]: 'modePerformance', [Pl().OVERLAY.max]: 'modeMax' }
    const two = id => t(id, 'ac') + (f.laptop ? ' · ' + t(id, 'dc') : '')
    const rows = [
      ['display', 'factDisplay', two('display')], ['moon', 'factSleep', two('sleep')], ['bolt', 'factMode', f.overlayAc ? T(modes[f.overlayAc] || 'modeOther') : '–'],
      ['power-off', 'factFast', yn(f.fastStartup)], ['bed', 'factHibernate', yn(f.hibernate)], ['moon', 'factModern', yn(f.modernStandby)], ['hard-drive', 'factTrim', f.trim == null ? '–' : T(f.trim === 0 ? 'trimOn' : 'trimOff')],
    ]
    card.innerHTML = head(ctx, T('factsT'), T('factsS')) + `<dl class="pw-facts">${rows.map(r => `<div><dt><i class="fa fa-${r[0]}" aria-hidden="true"></i>${esc(T(r[1]))}</dt><dd class="mono">${esc(r[2])}</dd></div>`).join('')}</dl>`
  }

  // ── Overview: battery (laptops) ─────────────────────────────────────────────────────────────
  V.battery = function (card, ctx) {
    const { T, esc, S, P } = ctx, f = S.facts
    if (!f || !f.read) { card.innerHTML = head(ctx, T('batT'), T('batS')) + sk(); return }
    const b = f.battery
    if (!b) { card.innerHTML = head(ctx, T('batT'), T('batS')) + note(ctx, 'plug', T('batNone')); return }
    const wear = b.wear ? `<span class="nt-chip-s" data-wear="${b.wear}">${esc(T('wear_' + b.wear))}</span>` : ''
    card.innerHTML = head(ctx, T('batT'), T('batS'), wear) + (b.healthPct == null ? unread(ctx, 'batUnread')
      : `<div class="pw-health"><div class="pw-health-v"><b class="mono">${b.healthPct}</b><small>%</small><span>${esc(T('batHealth'))}</span></div><div class="pw-health-bar" data-wear="${b.wear}" role="img" aria-label="${esc(T('batHealth') + ' ' + b.healthPct + '%')}"><i style="--p:${b.healthPct}"></i></div></div>
        <dl class="pw-facts"><div><dt>${esc(T('batDesign'))}</dt><dd class="mono">${b.designWh == null ? '–' : b.designWh + ' Wh'}</dd></div><div><dt>${esc(T('batFull'))}</dt><dd class="mono">${b.fullWh == null ? '–' : b.fullWh + ' Wh'}</dd></div><div><dt>${esc(T('batNow'))}</dt><dd class="mono">${P.fmtPct(b.percent)}</dd></div></dl>`)
  }

  // ── Overview: Windows power mode (a real radio group: arrow keys move and select) ───────────
  V.mode = function (card, ctx) {
    const { T, esc, S } = ctx, f = S.facts
    if (!f || !f.read || !f.overlayAc) { card.hidden = true; return }
    card.hidden = false
    const O = Pl().OVERLAY, opts = [[O.efficiency, 'modeEfficiency', 'leaf', 'modeEfficiencyS'], [O.balanced, 'modeBalanced', 'scale-balanced', 'modeBalancedS'], [O.performance, 'modePerformance', 'gauge-high', 'modePerformanceS']]
    const cur = f.overlayAc, known = opts.some(o => o[0] === cur)
    card.innerHTML = head(ctx, T('modeT'), T('modeS')) + `<div class="pw-modes" role="radiogroup" aria-label="${esc(T('modeT'))}">${opts.map((o, i) => `<button type="button" role="radio" class="pw-mode" aria-checked="${cur === o[0]}" tabindex="${cur === o[0] || (!known && i === 0) ? 0 : -1}" data-act="mode" data-overlay="${o[0]}"${S.busy ? ' disabled' : ''}><i class="fa fa-${o[2]}" aria-hidden="true"></i><b>${esc(T(o[1]))}</b><small>${esc(T(o[3]))}</small>${S.pending === 'mode:' + o[0] ? spin : ''}</button>`).join('')}</div>`
    card.querySelector('.pw-modes').onkeydown = e => {
      const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }
      if (!(e.key in keys)) return
      e.preventDefault()
      const b = [...card.querySelectorAll('.pw-mode')], i = b.indexOf(document.activeElement)
      const n = b[(i + keys[e.key] + b.length) % b.length]; n.focus(); ctx.modeSet(n.dataset.overlay)
    }
  }

  // ── Overview: drives (what Windows reports) ─────────────────────────────────────────────────
  V.drives = async function (card, ctx) {
    const { T, esc, S } = ctx
    card.innerHTML = head(ctx, T('drvT'), T('drvS')) + sk()
    let rig = null
    try { const r = await root.api.getHardwareInventory(); rig = r && r.ok ? r.rig : null } catch (e) { rig = null }
    if (S.disposed) return
    const drives = (rig && rig.drives) || []
    const trim = S.facts && S.facts.read ? S.facts.trim : null
    card.innerHTML = head(ctx, T('drvT'), T('drvS'), trim == null ? '' : `<span class="nt-chip-s${trim === 0 ? ' rec' : ''}">${esc(T('trim') + ' · ' + T(trim === 0 ? 'trimOn' : 'trimOff'))}</span>`)
      + (drives.length ? `<ul class="pw-drives">${drives.map(d => `<li><i class="fa fa-hard-drive" aria-hidden="true"></i><span class="pw-dn">${esc(d.name)}</span><span class="pw-dm">${esc([d.bus, d.media, d.sizeGB ? d.sizeGB + ' GB' : ''].filter(Boolean).join(' · '))}</span>${d.health ? `<span class="nt-chip-s" data-ok="${d.health === 'Healthy' ? 1 : 0}">${esc(d.health)}</span>` : ''}</li>`).join('')}</ul>` : note(ctx, 'circle-question', T('drvNone')))
  }

  // ── Plans ───────────────────────────────────────────────────────────────────────────────────
  V.plans = function (slot, ctx) {
    const { T, esc, S, P } = ctx
    let compare = null
    const ex = id => Pl().byAnat[id]
    const val = (idx, g, id, side) => Pl().valuesOf(idx, g, ex(id))[side || 'ac']
    const txt = (id, n) => P.descText(T, Pl().describe(ex(id), n))
    let dup = new Set()
    const tags = p => [p.active ? `<span class="nt-chip-s rec">${esc(T('planActive'))}</span>` : '', p.builtin ? `<span class="nt-chip-s">${esc(T('planBuiltin'))}</span>` : '', p.own ? `<span class="nt-chip-s">${esc(T('planOwn'))}</span>` : '',
      !p.builtin && dup.has(String(p.name).toLowerCase()) ? `<span class="nt-chip-s mono" title="${esc(p.guid)}">${esc(P.shortId(p.guid))}</span>` : ''].join('')
    const profile = (f, p) => {
      const r = P.planProfile(f, p.guid)
      if (!r) return `<div class="pw-profrow"><div class="pw-prof" data-none="1" aria-hidden="true"><i></i></div><span class="pw-prof-t mono">–</span></div>`
      return `<div class="pw-profrow"><div class="pw-prof" role="img" aria-label="${esc(T('stCpuRange') + ' ' + r.min + '–' + r.max + '%')}"><i style="--a:${r.min};--b:${r.max}"></i></div><span class="pw-prof-t mono">${r.min === r.max ? r.max + '%' : r.min + '–' + r.max + '%'}</span></div>`
    }
    const stat = (f, p, id, k) => `<div><dt>${esc(T(k))}</dt><dd class="mono">${esc(txt(id, val(f.idx, p.guid, id)))}</dd></div>`

    function heroCard(p, f) {
      const stats = [['boost', 'stBoost'], ['epp', 'an_epp'], ['parking', 'an_parking'], ['aspm', 'stAspm'], ['display', 'an_display'], ['sleep', 'an_sleep']].map(([id, k]) => stat(f, p, id, k)).join('')
      return `<article class="pw-hero" data-guid="${esc(p.guid)}" data-flash="${S.flash['plan:' + p.guid] || ''}">
        <header><div><span class="pw-eyebrow"><i class="fa fa-circle-check" aria-hidden="true"></i>${esc(T('planInUse'))}</span><h3>${esc(p.name || p.guid)}</h3><p>${esc(T('char_' + p.character.kind))}</p></div><span class="pw-tags">${tags({ ...p, active: false })}</span></header>
        <div class="pw-hero-prof"><span>${esc(T('stCpuRange'))}</span>${profile(f, p)}</div>
        <dl class="pw-stats pw-stats-6">${stats}</dl></article>`
    }
    function planCard(p, f) {
      const pend = S.pending === 'plan:' + p.guid
      return `<article class="pw-plan" data-guid="${esc(p.guid)}" data-picked="${compare === p.guid ? 1 : 0}" data-flash="${S.flash['plan:' + p.guid] || ''}">
        <header><b title="${esc(p.name || p.guid)}">${esc(p.name || p.guid)}</b><span class="pw-tags">${tags(p)}</span></header>
        <p class="pw-plan-ch">${esc(T('char_' + p.character.kind))}</p>
        ${profile(f, p)}
        <dl class="pw-stats">${stat(f, p, 'boost', 'stBoost')}${stat(f, p, 'aspm', 'stAspm')}${stat(f, p, 'sleep', 'an_sleep')}</dl>
        <footer><button type="button" class="nt-sec sm" data-act="plan-set" data-guid="${esc(p.guid)}"${S.busy ? ' disabled' : ''}>${pend ? spin : '<i class="fa fa-check" aria-hidden="true"></i>'}${esc(T(pend ? 'planSwitching' : 'planUse'))}</button>
          <button type="button" class="pw-ghost" data-act="plan-compare" data-guid="${esc(p.guid)}" aria-pressed="${compare === p.guid}" title="${esc(T('planCompare'))}"><i class="fa fa-code-compare" aria-hidden="true"></i><span>${esc(T('planCompare'))}</span></button></footer>
      </article>`
    }

    function compareCard(f) {
      const groups = P.compareRows(f, compare)
      const a = f.plans.find(p => p.guid === f.activeGuid), b = f.plans.find(p => p.guid === compare)
      if (!a || !b) return ''
      const cols = f.laptop ? ['ac', 'dc'] : ['ac']
      const cell = (id, g, side) => esc(txt(id, val(f.idx, g, id, side)))
      const nDiff = groups.reduce((n, g) => n + g.rows.filter(r => r.differs).length, 0)
      return `<section class="nt-card pw-compare" id="pw-compare">${head(ctx, T('cmpT', { a: a.name, b: b.name }), (nDiff ? ctx.Tn('cmpDiff', { n: nDiff }) : T('cmpSame')), `<button type="button" class="nt-sec sm" data-act="plan-compare" data-guid="${esc(compare)}"><i class="fa fa-xmark" aria-hidden="true"></i>${esc(T('close'))}</button>`)}
        <div class="pw-cmp-wrap"><table class="pw-cmp"><thead><tr><th></th>${cols.map(c => `<th colspan="2">${esc(T(c === 'ac' ? 'sideAc' : 'sideDc'))}</th>`).join('')}</tr><tr><th></th>${cols.map(() => `<th>${esc(a.name)}</th><th>${esc(b.name)}</th>`).join('')}</tr></thead><tbody>
        ${groups.map(g => `<tr class="pw-cmp-g"><th colspan="${1 + cols.length * 2}">${esc(T('grp_' + g.group))}</th></tr>${g.rows.map(r => `<tr data-diff="${r.differs ? 1 : 0}"><th>${esc(T('an_' + r.id))}</th>${cols.map(c => `<td class="mono">${cell(r.id, f.activeGuid, c)}</td><td class="mono">${cell(r.id, compare, c)}</td>`).join('')}</tr>`).join('')}`).join('')}
        </tbody></table></div></section>`
    }

    function timeoutsCard(f) {
      const sides = f.laptop ? ['ac', 'dc'] : ['ac']
      const row = id => `<div class="pw-to"><span>${esc(T('an_' + id))}</span><span class="pw-to-c">${sides.map(side => {
        const cur = val(f.idx, f.activeGuid, id, side), key = 'to:' + id + side
        const list = cur != null && !P.TIMEOUTS.includes(cur) ? [...P.TIMEOUTS, cur].sort((x, y) => (x || 1e9) - (y || 1e9)) : P.TIMEOUTS
        const sel = `<select data-act="timeout" data-id="${id}" data-side="${side}" aria-label="${esc(T('an_' + id) + ' · ' + T(side === 'ac' ? 'sideAc' : 'sideDc'))}"${cur == null || S.busy ? ' disabled' : ''}>${cur == null ? `<option>–</option>` : list.map(s => `<option value="${s}"${s === cur ? ' selected' : ''}>${esc(txt(id, s))}</option>`).join('')}</select>`
        return `<label data-flash="${S.flash[key] || ''}">${f.laptop ? `<small>${esc(T(side === 'ac' ? 'sideAc' : 'sideDc'))}</small>` : ''}${sel}<i class="fa fa-circle-check pw-saved" aria-hidden="true"></i></label>`
      }).join('')}</span></div>`
      return `<section class="nt-card pw-timeouts">${head(ctx, T('toT', { plan: f.activeName || '' }), T('toS'))}${row('display')}${row('sleep')}<p class="gp-note"><i class="fa fa-circle-info" aria-hidden="true"></i>${esc(T('toNote'))}</p></section>`
    }

    function paint() {
      const f = S.facts
      if (!f || !f.read) { slot.innerHTML = `<section class="nt-card">${head(ctx, T('plansT'), T('plansS'))}${sk()}</section>`; return }
      const cards = P.planCards(f), act = cards.find(p => p.active), others = cards.filter(p => !p.active)
      dup = new Set(Pl().duplicates(f.plans).map(d => d.name))
      const tidy = others.filter(p => p.tidy).length
      slot.innerHTML = (act ? heroCard(act, f) : note(ctx, 'circle-question', T('plansNone')))
        + `<section class="nt-card">${head(ctx, T('othersT'), T('othersS', { n: others.length }), tidy ? `<button type="button" class="nt-sec sm" data-act="tidy"><i class="fa fa-broom" aria-hidden="true"></i>${esc(ctx.Tn('planTidy', { n: tidy }))}</button>` : '')}
          ${others.length ? `<div class="pw-plans">${others.map(p => planCard(p, f)).join('')}</div>` : note(ctx, 'circle-info', T('othersNone'))}</section>`
        + (compare ? compareCard(f) : '') + timeoutsCard(f)
    }
    slot.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b || !slot.contains(b)) return
      if (b.dataset.act === 'plan-compare') {
        compare = compare === b.dataset.guid ? null : b.dataset.guid; paint()
        if (compare) { const c = slot.querySelector('#pw-compare'); if (c) c.scrollIntoView({ behavior: ctx.still() ? 'auto' : 'smooth', block: 'start' }) }
      } else if (b.dataset.act === 'plan-set') ctx.planSet(b.dataset.guid)
      else if (b.dataset.act === 'tidy') V.tidySheet(ctx)
    })
    slot.addEventListener('change', e => {
      const s = e.target.closest('select[data-act="timeout"]'); if (s) ctx.timeoutSet(s.dataset.id, s.dataset.side, Number(s.value))
    })
    return { paint }
  }

  // Which plans to remove. Duplicates (all but the first of a name) and Jylli's own leftovers start ticked; nothing else does.
  V.tidySheet = async function (ctx) {
    const { T, esc, S, P } = ctx, f = S.facts, VV = root.JylliNetworkViews
    if (!f || !VV || !VV.openSheet) return
    const list = P.planCards(f).filter(p => p.tidy)
    const dupes = new Set(); for (const d of Pl().duplicates(f.plans)) d.guids.slice(1).forEach(g => dupes.add(g))
    const pre = p => dupes.has(p.guid) || p.own
    const { wrap, p } = VV.openSheet(ctx, `<header class="nt-sheet-h"><h3>${esc(T('tidyT'))}</h3><p>${esc(T('tidyS'))}</p></header>
      <ul class="pw-tidy">${list.map(x => `<li><label><input type="checkbox" data-g="${esc(x.guid)}"${pre(x) ? ' checked' : ''}><span><b>${esc(x.name || x.guid)}</b><small>${esc(T('char_' + x.character.kind))}${dupes.has(x.guid) ? ' · ' + esc(T('tidyDupe')) : ''} · <span class="mono">${esc(P.shortId(x.guid))}</span></small></span></label></li>`).join('')}</ul>
      <footer class="nt-sheet-f"><button type="button" class="nt-sec" data-close>${esc(T('cancel'))}</button><button type="button" class="nt-cta" data-go><i class="fa fa-broom" aria-hidden="true"></i><span data-n></span></button></footer>`, T('tidyT'))
    const go = wrap.querySelector('[data-go]'), count = () => wrap.querySelectorAll('input:checked').length
    const upd = () => { go.disabled = !count(); go.querySelector('[data-n]').textContent = ctx.Tn('tidyGo', { n: count() }) }
    wrap.addEventListener('change', upd); upd()
    go.addEventListener('click', () => VV.closeSheet([...wrap.querySelectorAll('input:checked')].map(i => i.dataset.g)))
    const chosen = await p
    if (chosen && chosen.length) ctx.tidy(chosen)
  }

  // ── Sleep & wake ────────────────────────────────────────────────────────────────────────────
  V.sleep = function (slot, ctx) {
    const { T, esc, S } = ctx
    const HID = root.JylliPowerFindings ? root.JylliPowerFindings.HID : /keyboard|mouse/i
    function paint() {
      const f = S.facts
      if (!f || !f.read) { slot.innerHTML = `<div class="gp-ov">${[1, 2].map(() => `<div class="gp-col"><section class="nt-card">${sk()}</section></div>`).join('')}</div>`; return }
      const lastLines = (f.lastWake && f.lastWake.lines.join('\n')) || ''
      const rq = f.requests
      const awake = `<section class="nt-card">${head(ctx, T('awakeT'), T('awakeS'))}${
        !rq ? unread(ctx, 'awakeUnread') : !rq.keepsAwake.length ? `<div class="gp-clear"><i class="fa fa-circle-check" aria-hidden="true"></i><div><b>${esc(T('awakeNoneT'))}</b><span>${esc(T('awakeNoneS'))}</span></div></div>`
          : `<ul class="pw-list">${rq.keepsAwake.map(i => `<li><span class="nt-chip-s">${esc(T('rq_' + i.section))}</span><span class="pw-li-n mono" title="${esc(i.name)}">${esc(tail(i.name))}</span><em>${esc(i.type)}</em></li>`).join('')}</ul><p class="gp-note"><i class="fa fa-circle-info" aria-hidden="true"></i>${esc(T('awakeNote'))}</p>`}</section>`
      const lw = f.lastWake
      const last = `<section class="nt-card">${head(ctx, T('lastT'), T('lastS'))}${!lw ? unread(ctx, 'lastUnread') : lw.count === 0 ? note(ctx, 'circle-check', T('lastNone')) : `<p class="gp-note">${esc(ctx.Tn('lastCount', { n: lw.count }))}</p><pre class="pw-pre mono">${esc(lw.lines.join('\n'))}</pre>`}</section>`
      const wd = f.wakeDevices
      const devs = `<section class="nt-card">${head(ctx, T('devT'), T('devS'))}${wd == null ? unread(ctx, 'devUnread') : !wd.length ? note(ctx, 'circle-check', T('devNone'))
        : `<ul class="pw-list">${wd.map(n => {
          const hid = HID.test(n), woke = lastLines && lastLines.includes(n), busy = S.pending === 'wake:' + n
          return `<li data-woke="${woke ? 1 : 0}"><span class="pw-li-n" title="${esc(n)}">${esc(n)}<small>${esc(woke ? T('devWoke') : hid ? T('devHid') : T('devOther'))}</small></span>${busy ? spin : ''}<button type="button" role="switch" class="nt-sw" aria-checked="true" aria-label="${esc(T('devAllow', { name: n }))}" data-act="wake" data-device="${esc(n)}"${S.busy ? ' disabled' : ''}><i></i></button></li>`
        }).join('')}</ul>`}</section>`
      const wt = f.wakeTimers
      const timers = `<section class="nt-card">${head(ctx, T('timersT'), T('timersS'))}${wt == null ? unread(ctx, 'timersUnread') : !wt.length ? note(ctx, 'circle-check', T('timersNone')) : `<ul class="pw-list">${wt.map(i => `<li><span class="nt-chip-s">${esc(i.type)}</span><span class="pw-li-n mono" title="${esc(i.name)}">${esc(tail(i.name))}</span></li>`).join('')}</ul>`}</section>`
      slot.innerHTML = `<div class="gp-ov"><div class="gp-col">${devs}${timers}</div><div class="gp-col">${awake}${last}</div></div>`
    }
    slot.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b || !slot.contains(b)) return
      if (b.dataset.act === 'rescan') ctx.rescan(); else if (b.dataset.act === 'wake') ctx.wakeOff(b.dataset.device)
    })
    return { paint }
  }

  // ── Energy ──────────────────────────────────────────────────────────────────────────────────
  V.energy = function (slot, ctx) {
    const { T, esc, S, P } = ctx
    const TR = 60, trace = { cpu: [], gpu: [], bat: [], tot: [] }
    let built = false, refs = {}
    const push = (k, v) => { trace[k].push(v == null ? null : v); if (trace[k].length > TR) trace[k].shift() }
    const spark = (values, w, h, floor) => { const d = P.areaPaths(values, w, h, floor); return d.line ? `<svg class="pw-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path class="pw-area-fill" d="${d.area}"/><path class="pw-area-line" d="${d.line}"/></svg>` : '<div class="pw-spark" data-empty="1"></div>' }
    function build() {
      slot.innerHTML = `<div class="gp-ov"><div class="gp-col">
        <section class="nt-card pw-meter">${head(ctx, T('meterT'), T('meterS'))}<div data-hero></div><div class="pw-meter-rows" data-rows></div><p class="gp-note" data-why></p></section>
        </div><div class="gp-col">
        <section class="nt-card pw-session">${head(ctx, T('sessT'), T('sessS'))}<div data-session></div></section>
        <section class="nt-card">${head(ctx, T('histT2'), T('histS2'), '<span data-clear></span>')}<div data-list></div></section>
        </div></div>`
      refs = { hero: slot.querySelector('[data-hero]'), rows: slot.querySelector('[data-rows]'), why: slot.querySelector('[data-why]'), session: slot.querySelector('[data-session]'), list: slot.querySelector('[data-list]'), clear: slot.querySelector('[data-clear]') }
      built = true
      paintSession(); paintList(); paintRows()
    }
    function paintRows() {
      if (!built) return
      const w = P.wattsRow(S.frame), f = S.facts, lap = f && f.read && f.laptop
      const bat = S.frame && S.frame.bat && S.frame.bat.rateW != null ? (S.frame.bat.discharging ? -S.frame.bat.rateW : S.frame.bat.charging ? S.frame.bat.rateW : 0) : null
      const price = f && f.price
      refs.hero.innerHTML = `<div class="pw-eh"><div class="pw-mh-v"><b class="mono">${esc(P.fmtW(w.total))}</b><small>${w.total == null ? '' : 'W'}</small></div><div class="pw-eh-t"><span>${esc(T({ both: 'meterHeroK', gpu: 'meterHeroGpu', cpu: 'meterHeroCpu' }[P.totalKind(w)] || 'meterHeroK'))}</span>${w.total != null && price && price.perKwh != null ? `<span>${esc(T('meterCostHr', { c: P.fmtCost(w.total / 1000 * price.perKwh, price.currency) }))}</span>` : ''}</div></div>${spark(trace.tot, 360, 84, 60)}`
      const rows = [['microchip', 'cpuK', w.cpuW, w.cpuSrc, 'cpu', w.cpuW == null ? T(S.live === 'on' ? 'cpuNoSensor' : 'flowNoLive') : '', 200], ['display', 'gpuK', w.gpuW, w.gpuSrc, 'gpu', w.gpuW == null ? T(S.live === 'on' ? 'gpuNoReading' : 'flowNoLive') : '', 450]]
      if (lap) rows.push(['battery-three-quarters', 'batFlowK', bat, bat == null ? null : 'wmi', 'bat', bat == null ? T('batFlowNone') : '', 60])
      refs.rows.innerHTML = rows.map(r => {
        const val = r[4] === 'bat' && r[2] != null ? (r[2] > 0 ? '+' : r[2] < 0 ? '−' : '') + P.fmtW(Math.abs(r[2])) : P.fmtW(r[2])
        const fillv = r[2] == null ? null : P.wattFill(Math.abs(r[2]), r[6])
        return `<div class="pw-mr" data-k="${r[4]}"><span class="pw-mr-k"><i class="fa fa-${r[0]}" aria-hidden="true"></i>${esc(T(r[1]))}</span><span class="pw-mr-v"><b class="mono">${esc(val)}</b><small>W</small></span><span class="pw-bar" data-on="${fillv == null ? 0 : 1}" aria-hidden="true"><i style="--p:${fillv == null ? 0 : fillv}"></i></span><span class="pw-mr-s">${esc(r[3] ? T('src_' + r[3]) : r[5])}</span></div>`
      }).join('')
      refs.why.innerHTML = w.total == null ? '' : `<i class="fa fa-circle-info" aria-hidden="true"></i>${esc(T('meterNote'))}`
    }
    function paintSession() {
      if (!built) return
      const f = S.facts, price = (f && f.price) || { perKwh: null, currency: 'EUR' }, s = S.session
      const priceRow = `<div class="pw-price"><label><span>${esc(T('priceK'))}</span><input type="number" min="0" max="10" step="0.001" inputmode="decimal" data-price value="${price.perKwh == null ? '' : price.perKwh}" placeholder="0.00" aria-label="${esc(T('priceK'))}"></label><label><span>${esc(T('currencyK'))}</span><input type="text" maxlength="4" data-cur value="${esc(price.currency || 'EUR')}" aria-label="${esc(T('currencyK'))}"></label></div>`
      if (s) {
        const wh = s.whTotal, cost = wh != null && price.perKwh != null ? (wh / 1000) * price.perKwh : null
        refs.session.innerHTML = `<div class="pw-sess-run"><div class="pw-sess-big"><b class="mono" data-s="wh">${esc(P.fmtWh(wh))}</b><span><i class="pw-rec" aria-hidden="true"></i>${esc(T('sessRecording'))}</span></div><dl class="pw-facts"><div><dt>${esc(T('sessTime'))}</dt><dd class="mono" data-s="t">${esc(P.fmtDur(s.ms))}</dd></div><div><dt>${esc(T('sessCost'))}</dt><dd class="mono" data-s="c">${esc(P.fmtCost(cost, price.currency))}</dd></div><div><dt>${esc(T('sessAvg'))}</dt><dd class="mono" data-s="a">${esc(s.cpu || s.gpu ? P.fmtW(((s.cpu ? s.cpu.avgW : 0) + (s.gpu ? s.gpu.avgW : 0))) + ' W' : '–')}</dd></div></dl>${s.game ? `<p class="gp-note"><i class="fa fa-gamepad" aria-hidden="true"></i>${esc(T('sessGame', { game: s.game }))}</p>` : ''}<div class="nt-actions"><button type="button" class="nt-cta" data-act="session-stop"><i class="fa fa-stop" aria-hidden="true"></i>${esc(T('sessStop'))}</button></div></div>`
      } else {
        const can = S.live === 'on' || S.live === 'paused'
        refs.session.innerHTML = `<p class="gp-note">${esc(T('sessIntro'))}</p>${priceRow}<div class="nt-actions"><button type="button" class="nt-cta" data-act="session-start"${can ? '' : ' disabled'}><i class="fa fa-play" aria-hidden="true"></i>${esc(T('sessStart'))}</button></div>${can ? '' : `<p class="gp-note">${esc(T('sessNeedLive'))}</p>`}`
      }
    }
    function tickSession() {
      const s = S.session; if (!built || !s) return
      const price = (S.facts && S.facts.price) || {}, set = (k, v) => { const n = refs.session.querySelector(`[data-s="${k}"]`); if (n && n.textContent !== v) n.textContent = v }
      set('wh', P.fmtWh(s.whTotal)); set('t', P.fmtDur(s.ms)); set('c', P.fmtCost(s.whTotal != null && price.perKwh != null ? (s.whTotal / 1000) * price.perKwh : null, price.currency))
      set('a', s.cpu || s.gpu ? P.fmtW((s.cpu ? s.cpu.avgW : 0) + (s.gpu ? s.gpu.avgW : 0)) + ' W' : '–')
    }
    function paintList() {
      if (!built) return
      const rows = P.sessionRows((S.facts && S.facts.sessions) || [])
      refs.clear.innerHTML = rows.length ? `<button type="button" class="nt-sec sm" data-act="sessions-clear">${esc(T('sessClear'))}</button>` : ''
      refs.list.innerHTML = rows.length ? `<ul class="pw-sessions">${rows.map(r => `<li><div><b>${esc(r.game || r.label || T('sessUnnamed'))}</b><span>${esc(fmtDate(r.at))} · ${esc(P.fmtDur(r.ms))}</span></div><div class="pw-sess-n"><b class="mono">${esc(P.fmtWh(r.whTotal))}</b><span class="mono">${esc(r.avgW == null ? '–' : P.fmtW(r.avgW) + ' W')}${r.cost != null ? ' · ' + esc(P.fmtCost(r.cost, r.currency)) : ''}</span></div></li>`).join('')}</ul>` : note(ctx, 'circle-info', T('sessNone'))
    }
    slot.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b || !slot.contains(b)) return
      if (b.dataset.act === 'session-start') ctx.sessionStart(); else if (b.dataset.act === 'session-stop') ctx.sessionStop(); else if (b.dataset.act === 'sessions-clear') ctx.sessionsClear()
    })
    slot.addEventListener('change', e => {
      if (e.target.matches('[data-price],[data-cur]')) ctx.priceSet(slot.querySelector('[data-price]').value, slot.querySelector('[data-cur]').value)
    })
    return {
      paint() { if (!built) build(); else { paintRows(); paintSession(); paintList() } },
      update(frame) {
        const w = P.wattsRow(frame)
        push('cpu', w.cpuW); push('gpu', w.gpuW); push('tot', w.total)
        push('bat', frame && frame.bat && frame.bat.rateW != null ? (frame.bat.discharging ? -frame.bat.rateW : frame.bat.charging ? frame.bat.rateW : 0) : null)
        if (built && !slot.hidden) { paintRows(); tickSession() }
      },
      sessionChanged() { if (built) { paintSession(); paintList() } },
      reset() { for (const k of Object.keys(trace)) trace[k].length = 0; if (built && !slot.hidden) paintRows() },
    }
  }
})(typeof window !== 'undefined' ? window : globalThis)
