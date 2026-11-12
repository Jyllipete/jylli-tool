'use strict'
// Network tab secondary views: the sheet (custom DNS, batch preview), the receipt card, row details, History. page.js owns state and passes `ctx`.
;(function (root) {
  const V = { details() {}, preview() {}, receipt() {}, history() {}, dnsSheet() {}, closeSheet() {} }
  root.JylliNetworkViews = V
  if (typeof module !== 'undefined' && module.exports) module.exports = V
  if (typeof document === 'undefined') return

  const fmtDate = ts => { try { return new Date(ts).toLocaleString(root.currentLang === 'fi' ? 'fi-FI' : undefined, { dateStyle: 'medium', timeStyle: 'short' }) } catch (e) { return '' } }

  // ── sheet: one modal at a time, Esc / backdrop closes, Tab stays inside ──
  let sheet = null
  function closeSheet(result) {
    if (!sheet) return
    const s = sheet; sheet = null
    document.removeEventListener('keydown', s.key, true)
    s.el.classList.add('out')
    setTimeout(() => s.el.remove(), 160)
    if (s.prev && s.prev.focus) { try { s.prev.focus({ preventScroll: true }) } catch (e) { /* element gone */ } }
    s.done(result === undefined ? null : result)
  }
  function openSheet(ctx, html, label) {
    closeSheet()
    const { el, T } = ctx
    const wrap = el('div', 'jk nt-sheet-wrap')
    wrap.innerHTML = `<div class="nt-sheet-back" data-close></div><div class="nt-sheet" role="dialog" aria-modal="true" aria-label="${ctx.esc(label || T('sheetLabel'))}">${html}</div>`
    document.body.appendChild(wrap)
    let done
    const p = new Promise(r => { done = r })
    const key = e => {
      if (e.key === 'Escape') { e.stopPropagation(); closeSheet(null) }
      else if (e.key === 'Tab') {
        const f = [...wrap.querySelectorAll('button:not([disabled]),input:not([disabled])')]
        if (!f.length) return
        const first = f[0], last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    sheet = { el: wrap, key, done, prev: document.activeElement }
    document.addEventListener('keydown', key, true)
    wrap.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(null) })
    return { wrap, p }
  }
  V.closeSheet = () => closeSheet(null)

  // ── custom resolver ──
  V.dnsSheet = function (ctx, cur) {
    const { T, esc, P } = ctx
    const { wrap, p } = openSheet(ctx, `<header class="nt-sheet-h"><h3>${esc(T('dnsCustomT'))}</h3><p>${esc(T('dnsCustomS'))}</p></header>
      <form class="nt-form" novalidate>
        <label><span>${esc(T('dnsPrimary'))}</span><input type="text" inputmode="decimal" autocomplete="off" spellcheck="false" data-f="primary" placeholder="1.1.1.1" value="${esc((cur && cur.primary) || '')}"></label>
        <label><span>${esc(T('dnsSecondary'))}</span><input type="text" inputmode="decimal" autocomplete="off" spellcheck="false" data-f="secondary" placeholder="1.0.0.1" value="${esc((cur && cur.secondary) || '')}"></label>
        <p class="nt-form-err" role="alert" data-err hidden></p>
      </form>
      <footer class="nt-sheet-f"><button type="button" class="nt-sec" data-close>${esc(T('cancel'))}</button><button type="button" class="nt-cta" data-go><i class="fa fa-check" aria-hidden="true"></i>${esc(T('dnsUse'))}</button></footer>`, T('dnsCustomT'))
    const f = k => wrap.querySelector(`[data-f="${k}"]`), err = wrap.querySelector('[data-err]')
    const check = () => {
      const v = P.dnsInput(f('primary').value, f('secondary').value)
      err.hidden = v.ok || !f('primary').value.trim()
      if (!v.ok) err.textContent = T('dnsErr_' + v.error)
      return v
    }
    wrap.addEventListener('input', check)
    const go = () => { const v = check(); if (!v.ok) { err.hidden = false; err.textContent = T('dnsErr_' + v.error); (v.error.startsWith('sec') ? f('secondary') : f('primary')).focus(); return }; closeSheet({ primary: v.primary, secondary: v.secondary }) }
    wrap.querySelector('[data-go]').addEventListener('click', go)
    wrap.querySelector('form').addEventListener('submit', e => { e.preventDefault(); go() })
    wrap.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); go() } })
    f('primary').focus()
    return p
  }

  // ── preview before a batch ──
  V.preview = function (ctx, { ids, action, titleKey }) {
    const { T, esc, P, nameOf, model } = ctx
    const m = model(); if (!m) return Promise.resolve(null)
    const g = P.previewGroups(m, ids)
    const rows = g.groups.map(gr => `<div class="nt-pv-lane"><div class="nt-pv-lane-t"><i class="fa fa-${P.LANE_ICON[gr.lane] || 'circle'}" aria-hidden="true"></i>${esc(T('lane_' + gr.lane))}</div>${gr.ids.map(id => {
      const it = m.items.find(i => i.id === id)
      return `<label class="nt-pv-row"><input type="checkbox" data-pv="${esc(id)}" checked><span class="nt-pv-name">${esc(nameOf(id))}</span>${it.reboot ? `<span class="nt-chip-s"><i class="fa fa-rotate-right" aria-hidden="true"></i>${esc(T('tagRestart'))}</span>` : ''}</label>`
    }).join('')}</div>`).join('')
    const notes = []
    if (g.restorePoint) notes.push(['shield-halved', T('pvRp')])
    if (g.restart) notes.push(['rotate-right', T('pvRestart', { n: g.restart })])
    notes.push(['clock-rotate-left', T('pvUndo')])
    const { wrap, p } = openSheet(ctx, `<header class="nt-sheet-h"><h3>${esc(T(titleKey, { n: g.n }))}</h3><p>${esc(T('pvLead'))}</p></header><div class="nt-pv">${rows}</div><ul class="nt-pv-notes">${notes.map(n => `<li><i class="fa fa-${n[0]}" aria-hidden="true"></i>${esc(n[1])}</li>`).join('')}</ul><footer class="nt-sheet-f"><button type="button" class="nt-sec" data-close>${esc(T('cancel'))}</button><button type="button" class="nt-cta" data-go></button></footer>`)
    const go = wrap.querySelector('[data-go]')
    const picked = () => [...wrap.querySelectorAll('[data-pv]')].filter(x => x.checked).map(x => x.dataset.pv)
    const upd = () => { const n = picked().length; go.disabled = !n; go.innerHTML = `<i class="fa fa-check" aria-hidden="true"></i>${esc(T(action === 'restore' ? 'pvGoRestore' : 'pvGo', { n }))}` }
    wrap.addEventListener('change', upd); upd()
    go.addEventListener('click', () => closeSheet(picked()))
    go.focus()
    return p
  }

  // ── receipt card ──
  V.receipt = function (slot, ctx) {
    const { S, T, esc, P, nameOf } = ctx
    const r = S.receipt
    if (!r) { slot.innerHTML = ''; return }
    const n = P.receiptNumbers(r)
    const tone = n.failed || n.mismatch ? 'warn' : 'ok'
    const bad = r.items.filter(i => i.status !== 'ok' || i.verified === false)
    const rp = r.restorePoint && r.restorePoint.ok
    slot.innerHTML = `<section class="nt-receipt" data-tone="${tone}" role="status"><div class="nt-rc-h"><span class="nt-rc-ico"><i class="fa fa-${tone === 'ok' ? 'check' : 'triangle-exclamation'}" aria-hidden="true"></i></span><div><b>${esc(T(r.action === 'restore' ? 'rcTitleRestore' : 'rcTitle', { n: n.ok }))}</b><span>${esc(T('rcSub', { v: n.verified, n: n.ok }))}</span></div><button type="button" class="nt-x" data-r="close" aria-label="${esc(T('dismiss'))}"><i class="fa fa-xmark" aria-hidden="true"></i></button></div>
      <dl class="nt-rc-stats"><div><dt>${esc(T('rcChanged'))}</dt><dd>${n.ok}</dd></div><div><dt>${esc(T('rcVerified'))}</dt><dd>${n.verified}</dd></div><div><dt>${esc(T('rcMismatch'))}</dt><dd>${n.mismatch}</dd></div><div><dt>${esc(T('rcFailed'))}</dt><dd>${n.failed}</dd></div><div><dt>${esc(T('rcRestart'))}</dt><dd>${n.restart}</dd></div></dl>
      ${bad.length ? `<ul class="nt-rc-bad">${bad.map(i => `<li><b>${esc(nameOf(i.id))}</b><span>${esc(i.status !== 'ok' ? (i.error || T('runFailS')) : T('mismatchS'))}</span></li>`).join('')}</ul>` : ''}
      ${rp ? `<p class="nt-rc-rp"><i class="fa fa-shield-halved" aria-hidden="true"></i>${esc(T('rcRp'))}</p>` : ''}
      <div class="nt-rc-act">${r.batchId && n.ok ? `<button type="button" class="nt-sec sm" data-r="undo"><i class="fa fa-rotate-left" aria-hidden="true"></i>${esc(T('rcUndo'))}</button>` : ''}${n.restart ? `<button type="button" class="nt-cta sm" data-r="reboot"><i class="fa fa-rotate-right" aria-hidden="true"></i>${esc(T('restartNow'))}</button>` : ''}</div></section>`
    slot.onclick = e => {
      const b = e.target.closest('[data-r]'); if (!b) return
      if (b.dataset.r === 'close') { S.receipt = null; slot.innerHTML = '' }
      else if (b.dataset.r === 'undo') ctx.undo({ batchId: r.batchId })
      else if (b.dataset.r === 'reboot' && root.genRebootNow) root.genRebootNow()
    }
  }

  // ── details of one row (built when it is first opened) ──
  V.details = function (d, it, ctx) {
    const { S, T, esc } = ctx
    const parts = []
    if (it.retired) parts.push(`<div class="nt-d-sec"><b>${esc(T('dRetired'))}</b><p>${esc(it.retiredWhy || T('retiredWarn'))}</p></div>`)
    if (it.values && it.values.length) {
      parts.push(`<div class="nt-d-sec"><b>${esc(T('dChanges'))}</b><table class="nt-d-tab"><thead><tr><th>${esc(T('dWhat'))}</th><th>${esc(T('dWant'))}</th><th>${esc(T('dNow'))}</th><th></th></tr></thead><tbody>${it.values.map(v =>
        `<tr><td class="mono">${esc(v.what)}</td><td class="mono">${esc(v.want)}</td><td class="mono">${v.now == null || v.now === '' ? esc(T('dNotSet')) : esc(v.now)}</td><td><i class="fa fa-${v.ok === true ? 'check' : v.ok === false ? 'xmark' : 'minus'} nt-d-ok" data-ok="${String(v.ok)}" aria-label="${esc(v.ok === true ? T('dMatch') : v.ok === false ? T('dDiffers') : T('dNa'))}"></i></td></tr>`).join('')}</tbody></table></div>`)
    } else if (!it.hasProbe && !it.once) parts.push(`<div class="nt-d-sec"><b>${esc(T('dChanges'))}</b><p>${esc(T('dNoProbe'))}</p></div>`)
    if (it.tier >= 2 && root.tRisk) { const r = root.tRisk(it.id, { avoid: false }); if (r) parts.push(`<div class="nt-d-sec nt-d-risk">${r}</div>`) }
    if (it.rec) parts.push(`<div class="nt-d-sec"><b>${esc(T('dWhy'))}</b><p>${esc(T('dWhyPc'))}</p></div>`)
    if (it.status === 'native') parts.push(`<div class="nt-d-sec"><p>${esc(T('lockedWhy'))}</p></div>`)
    if (it.status === 'drifted') parts.push(`<div class="nt-d-sec"><p>${esc(T('dDrifted'))}</p></div>`)
    const ent = S.history && S.history.batches.flatMap(b => b.entries).find(e => e.tweakId === it.id && e.action === 'apply' && !e.undone && e.via !== 'undo')
    if (ent && !it.once) parts.push(`<div class="nt-d-sec nt-d-last"><span><i class="fa fa-clock-rotate-left" aria-hidden="true"></i>${esc(T('dLast', { when: fmtDate(ent.ts), via: T('via_' + ent.via) }))}</span><button type="button" class="nt-sec sm" data-d="undo" data-entry="${esc(ent.id)}">${esc(T('dUndo'))}</button></div>`)
    d.innerHTML = parts.join('')
    d.onclick = e => { const b = e.target.closest('[data-d="undo"]'); if (b) ctx.undo({ entryId: b.dataset.entry }) }
  }

  // ── history: checkups (with a trend) and the journal ──
  V.history = async function (slot, ctx) {
    const { S, T, esc, nameOf, P } = ctx
    if (!S.history) { slot.innerHTML = `<div class="nt-hist-empty"><i class="fa fa-spinner fa-spin" aria-hidden="true"></i>${esc(T('loading'))}</div>`; await ctx.loadHistory() }
    if (S.disposed) return
    const h = S.history
    const m = ctx.model()
    const restorable = m ? m.items.filter(i => i.remembered === 'applied' && !i.once).map(i => i.id) : []
    const cks = (h && h.checkups) || []
    if (!h || (!h.batches.length && !cks.length)) {
      slot.innerHTML = `<div class="nt-hist-empty"><i class="fa fa-clock-rotate-left" aria-hidden="true"></i><b>${esc(T('histEmptyT'))}</b><span>${esc(T('histEmptyS'))}</span></div>`
      return
    }
    let html = ''
    if (cks.length) {
      const series = cks.slice().reverse().map(c => (c.ms ? c.ms.internet : null))
      const pts = P.sparkPoints(series, 220, 44)
      html += `<section class="nt-card nt-ck"><header class="nt-card-h"><div><b>${esc(T('ckTitle'))}</b><span>${esc(T('ckSub'))}</span></div>${pts ? `<svg class="nt-spark" viewBox="0 0 220 44" role="img" aria-label="${esc(T('ckTrend'))}"><polyline points="${pts}" fill="none"/></svg>` : ''}</header><ul class="nt-ck-list">${cks.map(c => {
        const bad = (c.findings || []).length
        return `<li><span class="nt-hist-when">${esc(fmtDate(c.at))}</span><span class="nt-ck-v" data-tone="${c.verdict === 'clean' ? 'ok' : c.verdict === 'measuring' || c.verdict === 'idle' ? 'idle' : 'warn'}">${esc(T('ck_' + c.verdict))}</span><span class="nt-ck-n mono">${c.ms && c.ms.internet != null ? esc(P.fmtMs(c.ms.internet)) + ' ms' : '–'}</span><span class="nt-ck-f">${esc(T(bad === 1 ? 'ckFinding1' : 'ckFindings', { n: bad }))}</span></li>`
      }).join('')}</ul></section>`
    }
    if (h.batches.length) {
      html += `<div class="nt-hist-h"><div><b>${esc(T('histTitle'))}</b><span>${esc(T('histSub'))}</span></div>${restorable.length ? `<button type="button" class="nt-sec sm" data-h="all"><i class="fa fa-rotate-left" aria-hidden="true"></i>${esc(T('histRestoreAll', { n: restorable.length }))}</button>` : ''}</div>`
        + h.batches.map(b => {
          const live = b.entries.filter(x => !x.undone && x.via !== 'undo')
          return `<section class="nt-hist-b"><header><span class="nt-hist-when">${esc(fmtDate(b.ts))}</span><span class="nt-chip-s">${esc(T('via_' + b.via))}</span>${live.length ? `<button type="button" class="nt-sec sm" data-h="undo" data-batch="${esc(b.batchId)}">${esc(T('histUndo'))}</button>` : `<span class="nt-hist-undone">${esc(T('histUndone'))}</span>`}</header><ul>${b.entries.map(x => `<li data-undone="${x.undone ? '1' : '0'}"><span class="nt-hist-act" data-a="${x.action}">${esc(T('act_' + x.action))}</span><span>${esc(nameOf(x.tweakId))}</span>${x.result && x.result !== 'ok' ? `<span class="nt-chip-s risk2">${esc(T('histPartial'))}</span>` : ''}</li>`).join('')}</ul></section>`
        }).join('')
    }
    slot.innerHTML = html
    slot.onclick = async e => {
      const b = e.target.closest('[data-h]'); if (!b) return
      if (b.dataset.h === 'undo') {
        try { await root.showConfirm({ title: T('histUndoT'), body: esc(T('histUndoS')), okText: T('histUndo'), okStyle: 'warning', icon: 'fa-rotate-left' }) } catch (x) { return }
        ctx.undo({ batchId: b.dataset.batch })
      } else if (b.dataset.h === 'all') {
        try { await root.showConfirm({ title: T('genRestoreAllT'), body: esc(T('genRestoreAllS', { n: restorable.length })), okText: T('histRestoreAllOk'), okStyle: 'danger', icon: 'fa-rotate-left' }) } catch (x) { return }
        ctx.execute(restorable, 'restore', { single: false })
      }
    }
  }
})(typeof window !== 'undefined' ? window : globalThis)
