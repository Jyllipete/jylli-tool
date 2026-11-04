'use strict'
// BIOS Easy mode: what is worth changing on THIS PC, with presets and one-step apply. All advice comes from lib/bios/advisor.js
// (main process); this file only draws it. Every write still goes through the workstation's commit dialog (diff, hold to write,
// snapshot, read-back, boot trial). Depends on js/bios/workstation.js (JylliBios._api), js/ui.js and index.html globals.
;(function (root) {
  const { html } = root.ui
  const T = (k, v) => root.tG('bios', k, v)
  const has = k => root.tG('bios', k) !== k          // a missing key renders as itself: treat as absent
  const tx = (k, v) => (has(k) ? T(k, v) : '')
  const WS = () => root.JylliBios._api

  const ST = { advice: null, loading: false, box: null, applied: null, token: 0 }

  const bullets = text => String(text || '').split('|').map(x => x.trim()).filter(Boolean)
  const tone = s => (s === 'do' ? 'accent' : s === 'good' ? 'ok' : s === 'check' ? 'warn' : 'neutral')

  function varsOf(s) {
    const v = Object.assign({}, s.vars || {})
    for (const k of Object.keys(v)) if (v[k] == null) v[k] = ''
    return v
  }

  function textFor(s) {
    const v = varsOf(s)
    if (s.status === 'good') return tx('easy_' + s.id + '_good', v)
    if (s.reason && has('easy_' + s.id + '_why_' + s.reason)) return T('easy_' + s.id + '_why_' + s.reason, v)
    return tx('easy_' + s.id + '_why', v)
  }

  function suggestionCard(a, s) {
    const v = varsOf(s)
    const gain = s.status === 'do' || s.status === 'leave' ? tx('easy_' + s.id + '_gain', v) : ''
    const trade = s.status === 'do' || s.status === 'leave' ? tx('easy_' + s.id + '_trade', v) : ''
    const steps = s.manual && s.status === 'do' ? bullets(tx('easy_' + s.id + '_steps', v)) : []
    const canApply = s.changes.length && a.writable
    const btn = canApply ? html`<button type="button" class="j-btn j-btn-secondary j-btn-sm" data-apply="${s.id}">${s.status === 'leave' ? T('easy_putback') : T('easy_apply')}</button>` : ''
    const bios = s.status !== 'good' && (steps.length || s.id === 'raptor' || s.id === 'biosage' || s.id === 'secureboot' || s.reason === 'early-am5')
      ? html`<button type="button" class="j-btn j-btn-ghost j-btn-sm" data-bios><i class="fa fa-arrow-rotate-right" aria-hidden="true"></i> ${T('easy_restartBios')}</button>` : ''
    return html`<article class="bw-sug bw-sug-${s.status}">
      <div class="bw-sug-head"><span class="j-badge j-badge-${tone(s.status)}">${T('easy_status_' + s.status)}</span><h4>${T('easy_' + s.id + '_title', v)}</h4></div>
      <p class="bw-sug-why">${textFor(s)}</p>
      ${gain ? html`<p class="bw-sug-gain"><i class="fa fa-circle-up" aria-hidden="true"></i> ${gain}</p>` : ''}
      ${trade ? html`<p class="bw-sug-trade"><i class="fa fa-scale-balanced" aria-hidden="true"></i> ${trade}</p>` : ''}
      ${s.changes.length && a.writable ? html`<ul class="bw-sug-changes">${s.changes.map(c => html`<li><span>${c.name}</span><span class="bw-mono">${c.fromLabel} → ${c.toLabel}</span></li>`)}</ul>` : ''}
      ${steps.length ? html`<ol class="bw-sug-steps">${steps.map(t => html`<li>${t}</li>`)}</ol>${v.where ? html`<p class="bw-muted">${T('easy_where', v)}</p>` : ''}` : ''}
      <div class="bw-sug-actions">${btn}${bios}</div>
    </article>`
  }

  function presetCard(a, p) {
    const n = p.count
    const stateText = p.state === 'available' ? T('easy_state_available', { n }) : p.state === 'manual' ? T('easy_state_manual', { n }) : T('easy_state_' + p.state)
    const can = p.state === 'available'
    return html`<div class="bw-preset ${p.id === 'best' ? 'bw-preset-best' : ''}">
      <h4>${T('easy_preset_' + p.id)}</h4>
      <p class="bw-muted">${T('easy_preset_' + p.id + '_d')}</p>
      <p class="bw-preset-state">${stateText}</p>
      ${can ? html`<button type="button" class="j-btn ${p.id === 'best' ? 'j-btn-primary' : 'j-btn-secondary'} j-btn-sm" data-preset="${p.id}">${T('easy_btn_review')}</button>` : ''}
    </div>`
  }

  function factsBlock(a) {
    const f = a.facts || {}
    const row = (k, v) => (v ? html`<div class="bw-fact"><span>${k}</span><span class="bw-mono">${v}</span></div>` : '')
    const ram = f.ramType ? (f.ramNow ? (f.ramRated && f.ramRated > f.ramNow + 200 ? T('easy_ram_both', { type: f.ramType, now: f.ramNow, rated: f.ramRated }) : T('easy_ram_now', { type: f.ramType, now: f.ramNow })) : f.ramType) : ''
    const can = a.engine && a.writable ? T('easy_cap_apply') : a.engine === 'scewin' ? T('easy_cap_scewin') : T('easy_cap_manual')
    return html`<div class="bw-facts">${row('CPU', f.cpu)}${row('GPU', f.gpu)}${row('RAM', ram)}${row('BIOS', f.biosDate)}${row(T('easy_cap_label'), can)}</div>`
  }

  function draw() {
    const box = ST.box; if (!box) return
    const a = ST.advice
    if (!a) { box.innerHTML = String(html`<div class="bw-empty bw-empty-flow"><i class="fa ${ST.loading ? 'fa-spinner fa-spin' : 'fa-triangle-exclamation'}" aria-hidden="true"></i><p>${ST.loading ? T('easy_loading') : T('easy_failed')}</p></div>`); return }
    const show = a.suggestions.filter(s => s.status !== 'good'), good = a.suggestions.filter(s => s.status === 'good')
    box.innerHTML = String(html`
      ${ST.applied ? html`<section class="bw-done"><i class="fa fa-circle-check" aria-hidden="true"></i><div><strong>${T('easy_appliedTitle')}</strong><span>${T('easy_appliedBody')}</span></div>
        <button type="button" class="j-btn j-btn-primary j-btn-sm" data-restart>${T('easy_restartNow')}</button><button type="button" class="j-btn j-btn-ghost j-btn-sm" data-undo>${T('easy_undo')}</button></section>` : ''}
      <section class="bw-easy-sec"><h3>${T('easy_pcTitle')}</h3>${factsBlock(a)}</section>
      <section class="bw-easy-sec"><h3>${T('easy_presetsTitle')}</h3><div class="bw-presets">${a.presets.map(p => presetCard(a, p))}</div></section>
      <section class="bw-easy-sec"><h3>${T('easy_sugTitle')}</h3>
        ${show.length ? show.map(s => suggestionCard(a, s)) : html`<p class="bw-muted">${T('easy_none')}</p>`}
        ${good.length ? html`<details class="bw-more"><summary>${T('easy_goodTitle', { n: good.length })}</summary>${good.map(s => suggestionCard(a, s))}</details>` : ''}
      </section>
      <section class="bw-easy-sec"><details class="bw-more"><summary>${T('easy_mythsTitle')}</summary><ul class="bw-myths">${a.myths.map(m => html`<li>${T('easy_myth_' + m)}</li>`)}</ul></details></section>`)
    wire(a)
  }

  function rowsOf(changes) { return changes.map(c => ({ id: c.id, name: c.name, from: c.fromLabel, to: c.toLabel, tier: c.tier, value: c.value })) }

  function review(title, changes) {
    const rows = rowsOf(changes)
    WS().dialog({ title, rows, critical: false, confirmLabel: T('holdToWrite'), onConfirm: typed => WS().doCommit(rows, typed) })
  }

  function wire(a) {
    const box = ST.box
    box.querySelectorAll('[data-apply]').forEach(b => b.addEventListener('click', () => {
      const s = a.suggestions.find(x => x.id === b.dataset.apply); if (s) review(T('commitTitle', { n: s.changes.length }), s.changes)
    }))
    box.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => {
      const p = a.presets.find(x => x.id === b.dataset.preset); if (p) review(T('easy_presetReview', { name: T('easy_preset_' + p.id), n: p.count }), p.changes)
    }))
    box.querySelectorAll('[data-bios]').forEach(b => b.addEventListener('click', () => restart(true)))
    const r = box.querySelector('[data-restart]'); if (r) r.addEventListener('click', () => restart(false))
    const u = box.querySelector('[data-undo]'); if (u) u.addEventListener('click', async () => { await WS().loadSnaps(); if (ST.applied) WS().openRestore(ST.applied.snapshotId) })
  }

  function restart(toBios) {
    WS().dialog({ title: T(toBios ? 'easy_restartBios' : 'easy_restartNow'), rows: [], note: T(toBios ? 'easy_restartBiosNote' : 'easy_restartNote'), confirmLabel: T('easy_holdRestart'), onConfirm: async () => {
      const r = await root.api.bios2Restart({ toBios, confirm: true })
      if (!r.ok) root.toast(T('failedTitle'), r.error === 'legacy_bios' ? T('doctor_legacy_bios_fix') : T('easy_restartFailed'), 'error')
    } })
  }

  async function render(box) {
    ST.box = box
    const my = ++ST.token
    ST.loading = true; if (!ST.advice) draw()
    let a = null
    try { const r = await root.api.bios2Advise(); a = r && r.ok ? r : null } catch {}
    if (my !== ST.token) return
    ST.loading = false; ST.advice = a; draw()
  }

  /** The workstation tells us a commit succeeded: show the restart/undo panel and refresh the advice. */
  function onCommitted(r) {
    ST.applied = { snapshotId: r.snapshotId }
    if (ST.box) render(ST.box)
  }

  root.JylliBiosEasy = { render, onCommitted, _state: ST }
})(typeof window !== 'undefined' ? window : globalThis)
