'use strict'
// GPU tab, the Display view: every monitor with its current mode, the refresh rates it offers at that resolution, and a safe way to change one.
// A change is tested, applied for this session, then Jylli asks; Keep saves it (and journals it so History can undo it), no answer puts the old rate back
// after 15 seconds (so a black screen fixes itself). Only modes Windows lists for this monitor are ever offered; the resolution never changes.
;(function (root) {
  const api = { mount() { return null } }
  root.JylliGpuDisplay = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  function mount(slot, ctx) {
    const { T, esc, P, S, root: R } = ctx
    let busy = null, tick = null

    function paint() {
      const f = S.facts
      if (!f) { slot.innerHTML = `<div class="gp-sk"></div><div class="gp-sk"></div>`; return }
      const rows = P.displayRows(f.displays)
      if (!rows.length) { slot.innerHTML = `<div class="nt-empty"><i class="fa fa-display" aria-hidden="true"></i><b>${esc(T('dispNoneT'))}</b><span>${esc(T('dispNoneS'))}</span></div>`; return }
      const head = `<div class="nt-hist-h"><div><b>${esc(T('dispTitle'))}</b><span>${esc(T('dispSub'))}</span></div></div>`
      const remote = f.remote ? `<div class="nt-banner" data-tone="info"><span class="nt-banner-ico"><i class="fa fa-network-wired" aria-hidden="true"></i></span><span class="nt-banner-t"><b>${esc(T('dispRemoteT'))}</b><span>${esc(T('dispRemoteS'))}</span></span></div>` : ''
      slot.innerHTML = head + remote + `<div class="gp-mons">${rows.map(r => card(r, !!f.remote)).join('')}</div>`
    }
    function card(r, remote) {
      const chips = r.hzs.map(hz => `<button type="button" class="gp-hz${hz === r.hz ? ' on' : ''}${hz === r.best ? ' best' : ''}" data-hz="${hz}" data-dev="${esc(r.device)}" data-w="${r.w}" data-h="${r.h}"${hz === r.hz || busy || remote ? ' disabled' : ''} aria-pressed="${hz === r.hz}"><b class="mono">${hz}</b><small>Hz</small>${hz === r.best ? `<em>${esc(T('dispMax'))}</em>` : ''}</button>`).join('')
      const note = r.below
        ? `<div class="gp-mon-note" data-tone="warn"><i class="fa fa-triangle-exclamation" aria-hidden="true"></i><span>${esc(T('dispBelow', { cur: r.hz, max: r.best }))}</span>${remote ? '' : `<button type="button" class="nt-cta sm" data-hz="${r.best}" data-dev="${esc(r.device)}" data-w="${r.w}" data-h="${r.h}"${busy ? ' disabled' : ''}>${esc(T('dispUse', { hz: r.best }))}</button>`}</div>`
        : r.linkLimited
          ? `<div class="gp-mon-note" data-tone="warn"><i class="fa fa-plug-circle-exclamation" aria-hidden="true"></i><span>${esc(T('dispLink', { edid: r.edid, max: r.best }))}</span></div>`
          : `<div class="gp-mon-note" data-tone="ok"><i class="fa fa-circle-check" aria-hidden="true"></i><span>${esc(T('dispFine', { hz: r.hz }))}</span></div>`
      return `<article class="gp-mon" data-dev="${esc(r.device)}"><header><span class="gp-mon-ico"><i class="fa fa-display" aria-hidden="true"></i></span><div><b>${esc(r.monitor || T('dispMonitor', { n: r.index || 1 }))}</b><span class="mono">${r.w} × ${r.h}</span></div>${r.primary ? `<span class="nt-chip-s">${esc(T('dispPrimary'))}</span>` : ''}<div class="gp-mon-hz mono"><b>${r.hz}</b><small>Hz</small></div></header>
        <div class="gp-hzs" role="group" aria-label="${esc(T('dispRatesAria'))}">${chips || `<span class="gp-note">${esc(T('dispOneRate'))}</span>`}</div>${note}</article>`
    }

    async function change(dev, w, h, hz) {
      if (busy || S.phase !== 'ready') return
      busy = dev; paint()
      let r = null
      try { r = await R.api.gpu2DisplaySet({ device: dev, w, h, hz }) } catch (e) { r = null }
      busy = null
      closeConfirm()
      if (S.disposed) return
      if (r && r.model) ctx.take(r)
      if (!r || !r.ok) ctx.toast(T('dispFailT'), T('dispErr_' + ((r && r.error) || 'x')) || T('dispErr_x'), 'err')
      else if (r.kept) { try { R.JylliSound.play('apply') } catch (e) { /* no sound */ } ctx.toast(T('dispKeptT', { hz: r.to }), T('dispKeptS'), 'ok'); ctx.loadHistory() }
      else ctx.toast(T('dispRevertedT', { hz: r.from }), '', 'info')
      paint(); ctx.refreshAll()
    }

    // The keep / revert sheet: opened by the service's confirm event, closed by the answer or by the event that ends the flow.
    let sheetOpen = false
    function onEvent(ev) {
      if (!ev) return
      if (ev.phase === 'confirm') confirm(ev)
      else if (ev.phase === 'done') closeConfirm()
    }
    function closeConfirm() { clearInterval(tick); tick = null; if (sheetOpen) { sheetOpen = false; const V = R.JylliNetworkViews; if (V && V.closeSheet) V.closeSheet() } }
    function confirm(ev) {
      const V = R.JylliNetworkViews; if (!V || !V.openSheet) return
      sheetOpen = true
      const { wrap, p } = V.openSheet(ctx, `<header class="nt-sheet-h"><h3>${esc(T('cfT', { hz: ev.to }))}</h3><p>${esc(T('cfS', { monitor: ev.monitor || ev.device, from: ev.from }))}</p></header>
        <div class="gp-cf"><div class="gp-cf-bar" aria-hidden="true"><i data-bar></i></div><p class="mono" data-left></p></div>
        <footer class="nt-sheet-f"><button type="button" class="nt-sec" data-close>${esc(T('cfRevert', { hz: ev.from }))}</button><button type="button" class="nt-cta" data-keep><i class="fa fa-check" aria-hidden="true"></i>${esc(T('cfKeep', { hz: ev.to }))}</button></footer>`, T('cfT', { hz: ev.to }))
      const bar = wrap.querySelector('[data-bar]'), left = wrap.querySelector('[data-left]'), total = Math.max(1000, ev.deadline - Date.now())
      const upd = () => { const ms = Math.max(0, ev.deadline - Date.now()); bar.style.setProperty('--p', ms / total * 100); left.textContent = T('cfLeft', { s: Math.ceil(ms / 1000) }) }
      upd(); tick = setInterval(upd, 250)
      wrap.querySelector('[data-keep]').addEventListener('click', () => { sheetOpen = false; clearInterval(tick); V.closeSheet(true) })
      const k = wrap.querySelector('[data-keep]'); if (k) k.focus()
      p.then(keep => { sheetOpen = false; clearInterval(tick); try { R.api.gpu2DisplayAnswer({ keep: keep === true }) } catch (e) { /* main gone */ } })
    }

    slot.addEventListener('click', e => {
      const b = e.target.closest('[data-hz]'); if (!b || b.disabled) return
      change(b.dataset.dev, Number(b.dataset.w), Number(b.dataset.h), Number(b.dataset.hz))
    })
    paint()
    return { paint, onEvent, destroy() { closeConfirm(); slot.innerHTML = '' } }
  }

  api.mount = mount
})(typeof window !== 'undefined' ? window : globalThis)
