'use strict'
// Cleanup 2.0, the other two views: History (what was reclaimed, what refills) and Space Map (Premium: where the drive went, big forgotten
// files, leftover app folders). `squarify` is the pure treemap layout (unit-tested).
;(function (root) {
  /** values (descending) laid out in a w x h box -> [{ i, x, y, w, h }]; the areas add up to w*h and stay as square as possible. */
  function squarify(values, w, h) {
    const total = values.reduce((a, b) => a + b, 0)
    if (!(total > 0) || w <= 0 || h <= 0) return []
    const scale = (w * h) / total, areas = values.map(v => v * scale), out = []
    let x = 0, y = 0, rw = w, rh = h, i = 0
    const worst = (row, side) => { const s = row.reduce((a, b) => a + b, 0), mx = Math.max(...row), mn = Math.min(...row); return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn)) }
    while (i < areas.length) {
      const side = Math.min(rw, rh)
      let row = [areas[i]], j = i + 1
      while (j < areas.length) { const next = row.concat(areas[j]); if (worst(next, side) <= worst(row, side)) { row = next; j++ } else break }
      const s = row.reduce((a, b) => a + b, 0)
      if (rw >= rh) { const cw = s / rh; let cy = y; row.forEach((a, k) => { const ch = a / cw; out.push({ i: i + k, x, y: cy, w: cw, h: ch }); cy += ch }); x += cw; rw -= cw }
      else { const ch = s / rw; let cx = x; row.forEach((a, k) => { const cw = a / ch; out.push({ i: i + k, x: cx, y, w: cw, h: ch }); cx += cw }); y += ch; rh -= ch }
      i += row.length
    }
    return out
  }
  /** "C:\\Users\\a" -> [{ name, path }] breadcrumb trail. */
  function crumbs(p) {
    const bs = String.fromCharCode(92), segs = String(p || '').split(bs).filter(Boolean), out = []
    segs.forEach((s, k) => out.push({ name: k === 0 ? s + bs : s, path: segs.slice(0, k + 1).join(bs) + (k === 0 ? bs : '') }))
    return out
  }
  const api = { squarify, crumbs }
  root.JylliCleanupExtras = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  function teaser(host, ctx, title, sub) {
    host.innerHTML = `<section class="cu-lock"><div class="cu-lock-ico"><i class="fa fa-lock" aria-hidden="true"></i></div><h3>${ctx.esc(title)}</h3><p>${ctx.esc(sub)}</p>
      <button type="button" class="cu-cta" data-unlock><i class="fa fa-unlock" aria-hidden="true"></i><span>${ctx.esc(ctx.T('unlock'))}</span></button><small>${ctx.esc(ctx.T('freeStays'))}</small></section>`
    host.querySelector('[data-unlock]').addEventListener('click', () => { try { root.premiumStoreAction().run() } catch (e) { /* ignore */ } })
  }

  // ───────── History ─────────
  api.history = async function (host, ctx) {
    const { T, esc, fmt } = ctx
    host.innerHTML = `<div class="cu-skel"><i></i><i></i></div>`
    let d = null
    try { d = await root.api.cleanup2History() } catch (e) { d = null }
    if (!d || !d.ok) { host.innerHTML = `<p class="cu-empty">${esc(T('histFail'))}</p>`; return }
    const list = d.history || []
    const loc = root.settings && root.settings.language === 'fi' ? 'fi-FI' : 'en-GB'
    const day = ts => new Date(ts).toLocaleDateString(loc, { day: 'numeric', month: 'short' })
    const recent = list.slice(0, 12).reverse(), max = Math.max(1, ...recent.map(h => h.freedBytes || 0))
    const bars = recent.length ? `<div class="cu-hist-bars" role="img" aria-label="${esc(T('histBars'))}">${recent.map(h => `<div class="cu-hb" title="${esc(fmt(h.freedBytes || 0))} · ${esc(day(h.ts))}${h.auto ? ' · ' + esc(T('histAuto')) : ''}"><i style="height:${Math.max(3, Math.round(((h.freedBytes || 0) / max) * 100))}%"${h.auto ? ' class="auto"' : ''}></i><span>${esc(day(h.ts))}</span></div>`).join('')}</div>` : `<p class="cu-empty">${esc(T('histNone'))}</p>`
    const last = list[0]
    let reg = ''
    if (d.premium && d.regrowth) {
      const rows = Object.entries(d.regrowth).filter(([, v]) => v.perDay > 0).sort((a, b) => b[1].perDay - a[1].perDay).slice(0, 6)
      reg = rows.length ? `<ul class="cu-reg">${rows.map(([id, v]) => `<li><span>${esc(T('n_' + id))}</span><b>${esc(T('refill', { size: fmt(v.perDay * 7) }))}</b></li>`).join('')}</ul>` : `<p class="cu-empty sm">${esc(T('regNeed'))}</p>`
    } else reg = `<div class="cu-reg-lock"><ul class="cu-reg blur" aria-hidden="true"><li><span>Discord</span><b>~140 MB / week</b></li><li><span>Edge, Chrome</span><b>~600 MB / week</b></li><li><span>Steam</span><b>~90 MB / week</b></li></ul><button type="button" class="cu-sec" data-unlock><i class="fa fa-unlock" aria-hidden="true"></i><span>${esc(T('unlock'))}</span></button></div>`
    const proj = d.projection ? `<div class="cu-proj"><i class="fa fa-hourglass-half" aria-hidden="true"></i><span>${esc(T('projFull', { days: d.projection.days, date: new Date(d.projection.date).toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' }), rate: fmt(d.projection.perDay) }))}</span></div>` : ''
    host.innerHTML = `<div class="cu-hist">
      <div class="cu-tiles"><div><span>${esc(T('histTotal'))}</span><b>${esc(fmt(d.total || 0))}</b></div><div><span>${esc(T('histCleans'))}</span><b>${list.length}</b></div><div><span>${esc(T('histLast'))}</span><b>${last ? esc(day(last.ts)) : '–'}</b></div></div>
      <section class="cu-panel"><header><h3>${esc(T('histTitle'))}</h3></header>${bars}${proj}</section>
      <section class="cu-panel"><header><h3>${esc(T('regTitle'))}${d.premium ? '' : `<span class="cu-prem">${esc(T('premium'))}</span>`}</h3><p>${esc(T('regSub'))}</p></header>${reg}</section></div>`
    const u = host.querySelector('[data-unlock]'); if (u) u.addEventListener('click', () => { try { root.premiumStoreAction().run() } catch (e) { /* ignore */ } })
  }

  // ───────── Space Map ─────────
  api.map = function (host, ctx) {
    const { T, esc, fmt } = ctx
    if (!(root.settings && root.settings.isPremium)) { teaser(host, ctx, T('mapLockTitle'), T('mapLockSub')); return }
    const bs = String.fromCharCode(92)
    host.innerHTML = `<div class="cu-map"><section class="cu-panel cu-map-main"><header><h3>${esc(T('mapTitle'))}</h3><nav class="cu-crumbs" aria-label="${esc(T('mapPath'))}"></nav></header>
        <div class="cu-tm" aria-live="polite"></div><div class="cu-tm-note"></div><div class="cu-legend">${['games', 'media', 'apps', 'system', 'files'].map(k => `<span><i class="cu-k-${k}"></i>${esc(T('k_' + k))}</span>`).join('')}</div></section>
      <aside class="cu-map-rail"><section class="cu-panel"><header><h3>${esc(T('bigTitle'))}</h3><p>${esc(T('bigSub'))}</p></header><div class="cu-big"></div></section>
        <section class="cu-panel"><header><h3>${esc(T('leftTitle'))}</h3><p>${esc(T('leftSub'))}</p></header><div class="cu-left"></div></section></aside></div>`
    const tm = host.querySelector('.cu-tm'), note = host.querySelector('.cu-tm-note'), nav = host.querySelector('.cu-crumbs')
    let token = 0
    async function go(p) {
      const my = ++token
      nav.innerHTML = crumbs(p).map(c => `<button type="button" data-p="${esc(c.path)}">${esc(c.name)}</button>`).join('<i class="fa fa-chevron-right" aria-hidden="true"></i>')
      tm.innerHTML = `<div class="cu-tm-wait"><i class="fa fa-spinner fa-spin" aria-hidden="true"></i>${esc(T('mapWait'))}</div>`; note.textContent = ''
      let r = null
      try { r = await root.api.cleanup2SpaceMap(p) } catch (e) { r = null }
      if (my !== token) return
      if (!r || !r.ok) { tm.innerHTML = `<p class="cu-empty">${esc(T(r && r.reason === 'superseded' ? 'mapBusy' : 'mapFail'))}</p>`; return }
      const nodes = r.nodes.filter(n => n.bytes > 0)
      if (!nodes.length) { tm.innerHTML = `<p class="cu-empty">${esc(T('mapEmpty'))}</p>`; return }
      const w = tm.clientWidth || 640, h = tm.clientHeight || 360
      const rects = squarify(nodes.map(n => n.bytes), w, h)
      tm.innerHTML = rects.map(q => {
        const n = nodes[q.i], big = q.w > 96 && q.h > 46
        const label = n.dir ? n.name : T('mapLoose', { n: n.files || 0 })
        return `<button type="button" class="cu-tile cu-k-${esc(n.kind)}${n.dir ? '' : ' loose'}" ${n.dir ? `data-p="${esc(n.path)}"` : 'disabled'} style="left:${q.x.toFixed(1)}px;top:${q.y.toFixed(1)}px;width:${Math.max(0, q.w - 2).toFixed(1)}px;height:${Math.max(0, q.h - 2).toFixed(1)}px" title="${esc(label)} · ${esc(fmt(n.bytes))}">${big ? `<b>${esc(label)}</b><span>${esc(fmt(n.bytes))}</span>` : ''}</button>`
      }).join('')
      note.textContent = (r.partial ? T('mapPartial') + ' ' : '') + T('mapTotal', { size: fmt(r.total) })
    }
    host.addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) go(b.dataset.p) })
    go('C:' + bs)

    // large and forgotten files
    const big = host.querySelector('.cu-big')
    async function loadBig() {
      big.innerHTML = `<div class="cu-tm-wait"><i class="fa fa-spinner fa-spin" aria-hidden="true"></i>${esc(T('bigWait'))}</div>`
      let r = null; try { r = await root.api.cleanup2LargeFiles() } catch (e) { r = null }
      if (!r || !r.ok) { big.innerHTML = `<p class="cu-empty sm">${esc(T('mapFail'))}</p>`; return }
      if (!r.files.length) { big.innerHTML = `<p class="cu-empty sm">${esc(T('bigNone'))}</p>`; return }
      big.innerHTML = `<ul class="cu-files">${r.files.slice(0, 25).map(f => `<li><label><input type="checkbox" data-f="${esc(f.path)}" data-b="${f.bytes}"><span class="cu-fn" title="${esc(f.path)}">${esc(f.name)}</span></label><em>${esc(T('age', { d: f.ageDays }))}${f.reason === 'installer' ? ' · ' + esc(T('installer')) : ''}</em><b>${esc(fmt(f.bytes))}</b></li>`).join('')}</ul>
        <button type="button" class="cu-sec" data-trash disabled><i class="fa fa-trash-can" aria-hidden="true"></i><span></span></button><p class="cu-r-note">${esc(T('bigNote'))}</p>`
      refresh()
    }
    function refresh() {
      const btn = big.querySelector('[data-trash]'); if (!btn) return
      const sel = [...big.querySelectorAll('input[data-f]:checked')]
      btn.disabled = !sel.length; btn.querySelector('span').textContent = sel.length ? T('trashN', { n: sel.length, size: fmt(sel.reduce((a, c) => a + Number(c.dataset.b), 0)) }) : T('trashPick')
    }
    big.addEventListener('change', refresh)
    big.addEventListener('click', async e => {
      const b = e.target.closest('[data-trash]'); if (!b || b.disabled) return
      const sel = [...big.querySelectorAll('input[data-f]:checked')]
      try { await root.showConfirm({ title: T('trashConfirmTitle'), body: T('trashConfirm', { n: sel.length }), okText: T('trashOk'), okStyle: 'warning', icon: 'fa-trash-can' }) } catch (x) { return }
      b.disabled = true
      const r = await root.api.cleanup2Trash(sel.map(c => c.dataset.f))
      try { root.toast('', r && r.ok ? T('trashDone', { size: fmt(r.freed) }) : T('mapFail'), r && r.ok ? 'ok' : 'warn', 4000) } catch (x) { /* ignore */ }
      loadBig()
    })
    loadBig()

    // leftover app folders (existing scan, Premium)
    const left = host.querySelector('.cu-left')
    async function loadLeft() {
      left.innerHTML = `<div class="cu-tm-wait"><i class="fa fa-spinner fa-spin" aria-hidden="true"></i>${esc(T('leftWait'))}</div>`
      let r = null; try { r = await root.api.scanPhantomApps() } catch (e) { r = null }
      if (!Array.isArray(r)) { left.innerHTML = `<p class="cu-empty sm">${esc(T('mapFail'))}</p>`; return }
      if (!r.length) { left.innerHTML = `<p class="cu-empty sm">${esc(T('leftNone'))}</p>`; return }
      left.innerHTML = `<ul class="cu-files">${r.slice(0, 20).map((f, k) => `<li><span class="cu-fn" title="${esc(f.folderPath)}">${esc(f.folderName)}</span><em>${esc(T(f.sizeBytes > 10485760 ? 'leftBig' : 'leftEmpty'))}</em><b>${esc(fmt(f.sizeBytes))}</b><button type="button" class="cu-mini" data-k="${k}">${esc(T('leftRemove'))}</button></li>`).join('')}</ul><p class="cu-r-note">${esc(T('leftNote'))}</p>`
      left.onclick = async e => {
        const b = e.target.closest('[data-k]'); if (!b) return
        const f = r[Number(b.dataset.k)]; if (!f) return
        b.disabled = true
        const x = await root.api.deletePhantomFolder(f.folderPath).catch(() => ({ ok: false }))
        if (x && x.ok) b.closest('li').classList.add('gone'); else { b.disabled = false; b.textContent = T('leftFail') }
      }
    }
    loadLeft()
  }
})(typeof window !== 'undefined' ? window : globalThis)
