'use strict'
// CPU & Memory tab: memory strata. One bar splits installed RAM into what is active, modified, standby (cached) and free; below it the commit charge
// against its limit, a few kernel numbers, the installed modules (rated vs running speed) and the Free standby action, whose result is measured.
;(function (root) {
  const api = { mount() { return null } }
  root.JylliCpuMemMem = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

  /** host: element to fill. ctx: { T, onFree() -> Promise<result> }. Returns { update(strata), setModules(mods), destroy }. */
  api.mount = function (host, ctx) {
    const { T } = ctx, P = root.JylliCpuMemPure
    const ids = ['active', 'modified', 'standby', 'free']
    host.innerHTML = `<header class="cm-mem-h"><div><b>${esc(T('memTitle'))}</b><span data-sub>${esc(T('memWaiting'))}</span></div><strong class="cm-big mono" data-load>–</strong></header>
      <div class="cm-strata" role="img" data-bar aria-label="${esc(T('memTitle'))}">${ids.map(id => `<i data-p="${id}" style="width:0%"></i>`).join('')}<u class="cm-comp" data-comp></u></div>
      <ul class="cm-legend">${ids.map(id => `<li data-l="${id}"><span class="cm-dot" data-p="${id}"></span><span>${esc(T(P.PART_KEYS[id]))}</span><b class="mono" data-v>–</b></li>`).join('')}</ul>
      <div class="cm-commit"><div class="cm-commit-h"><span>${esc(T('memCommit'))}</span><b class="mono" data-commit>–</b></div><div class="cm-track" data-ctrack><i data-cfill style="width:0%"></i></div></div>
      <dl class="cm-mini"><div><dt>${esc(T('memCompressed'))}</dt><dd class="mono" data-comp-v>–</dd></div><div><dt>${esc(T('memFaults'))}</dt><dd class="mono" data-faults>–</dd></div><div><dt>${esc(T('memPools'))}</dt><dd class="mono" data-pools>–</dd></div></dl>
      <div class="cm-mods" data-mods></div>
      <div class="cm-mem-act"><button type="button" class="nt-sec sm" data-free><i class="fa fa-wind" aria-hidden="true"></i>${esc(T('freeStandby'))}</button><span class="cm-note" data-note aria-live="polite">${esc(T('freeStandbyHint'))}</span></div>`
    const q = s => host.querySelector(s)
    const bar = q('[data-bar]'), segs = Object.fromEntries(ids.map(id => [id, bar.querySelector(`i[data-p="${id}"]`)])), comp = q('[data-comp]')
    const legend = Object.fromEntries(ids.map(id => [id, q(`[data-l="${id}"] [data-v]`)]))
    const freeBtn = q('[data-free]'), note = q('[data-note]')
    let busy = false

    freeBtn.addEventListener('click', async () => {
      if (busy) return
      busy = true; freeBtn.disabled = true
      freeBtn.firstElementChild.className = 'fa fa-circle-notch fa-spin'
      note.textContent = T('freeing')
      let r = null
      try { r = await ctx.onFree() } catch (e) { r = null }
      busy = false; freeBtn.disabled = false
      freeBtn.firstElementChild.className = 'fa fa-wind'
      if (!r || r.error) note.textContent = T('freeFailed')
      else if (!r.accepted) note.textContent = T('freeDenied')
      else if (r.freedMB < 8) note.textContent = T('freeNothing', { had: P.fmtMB(r.beforeMB) })
      else note.textContent = T('freeDone', { freed: P.fmtMB(r.freedMB), before: P.fmtMB(r.beforeMB), after: P.fmtMB(r.afterMB) })
      note.dataset.tone = r && r.accepted && r.freedMB >= 8 ? 'ok' : 'warn'
    })

    return {
      update(s) {
        if (!s) return
        q('[data-load]').textContent = s.loadPct + '%'
        q('[data-sub]').textContent = T('memSub', { used: P.fmtMB(s.activeMB + s.modifiedMB), total: P.fmtMB(s.totalMB) })
        const tone = s.loadPct >= 90 ? 'bad' : s.loadPct >= 75 ? 'warn' : 'ok'
        host.dataset.tone = tone
        for (const part of s.parts) { segs[part.id].style.width = part.pct.toFixed(1) + '%'; legend[part.id].textContent = P.fmtMB(part.mb) }
        comp.style.width = (s.activeMB ? (s.compressedMB / s.totalMB * 100) : 0).toFixed(1) + '%'
        comp.style.left = '0%'
        q('[data-commit]').textContent = s.commitLimitMB ? `${P.fmtMB(s.committedMB)} / ${P.fmtMB(s.commitLimitMB)}` : '–'
        const cf = q('[data-cfill]'); cf.style.width = Math.min(100, s.commitPct || 0) + '%'
        q('[data-ctrack]').dataset.tone = s.commitPct >= 90 ? 'bad' : s.commitPct >= 75 ? 'warn' : 'ok'
        q('[data-comp-v]').textContent = P.fmtMB(s.compressedMB)
        q('[data-faults]').textContent = Math.round(s.pageReads) + '/s'
        q('[data-pools]').textContent = `${P.fmtMB(s.pagedPoolMB)} · ${P.fmtMB(s.nonPagedPoolMB)}`
      },
      setModules(m) {
        const box = q('[data-mods]')
        if (!m || !m.list.length) { box.innerHTML = ''; return }
        box.innerHTML = m.list.map(x => `<div class="cm-mod" data-below="${x.below ? '1' : '0'}"><b>${x.capGB} GB</b><span>${esc([x.type, x.ratedMT ? (x.runMT && x.runMT !== x.ratedMT ? x.runMT + ' / ' + x.ratedMT : x.ratedMT) + ' MT/s' : ''].filter(Boolean).join(' · '))}</span><small>${esc(x.channel ? T('modChannel', { c: x.channel }) : x.slot)}</small></div>`).join('')
          + Array.from({ length: m.empty }, () => `<div class="cm-mod cm-mod-empty"><b>–</b><span>${esc(T('modEmpty'))}</span></div>`).join('')
      },
      destroy() { host.innerHTML = '' },
    }
  }
})(typeof window !== 'undefined' ? window : globalThis)
