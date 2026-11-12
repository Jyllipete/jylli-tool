'use strict'
// Debloat secondary views: Ad map, Programs, Extras (devices, context menu), History. Built lazily by js/debloat/page.js with a ctx
// { T, esc, el, fmt, nameOf, items(), model(), rescan(), runQuick(ids), toast(), S }. Pure helpers are exported for node tests.
;(function (root) {
  // ── pure ──
  const SYSTEM_APP = /Visual C\+\+|\.NET |DirectX|Redistributable|Security Update|KB\d{6,}|Update for Windows|Windows SDK|PhysX System|Intel.*Driver|AMD.*Driver|Microsoft.*Runtime|Windows.*Update|WebView2|Edge Update|Microsoft Update|Dell.*Update|HP.*Update|Lenovo.*Update|ASUS.*Update/i
  const DAY = 86400000
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  /** UserAssist entries [{ path, count, lastUsed }] -> { exeKey: { count, ts } } */
  function assistMap(list) {
    const out = {}
    for (const e of list || []) {
      if (!e || !e.path) continue
      const k = norm(String(e.path).split('\\').pop().replace(/\.exe$/i, ''))
      const ts = e.lastUsed ? Date.parse(e.lastUsed) : 0
      if (k && (!out[k] || ts > out[k].ts)) out[k] = { count: e.count || 0, ts: ts || 0 }
    }
    return out
  }
  /** Prefetch [{ Name, LastWriteTime }] -> { exeKey: ts } */
  function prefetchMap(list) {
    const out = {}
    for (const p of list || []) {
      if (!p || !p.Name) continue
      const k = norm(String(p.Name).replace(/\.pf$/i, '').replace(/-[A-F0-9]{8}$/i, '').replace(/\.exe$/i, ''))
      const ts = p.LastWriteTime ? Date.parse(p.LastWriteTime) : 0
      if (k && ts > (out[k] || 0)) out[k] = ts
    }
    return out
  }
  /** Best evidence of when a program was last opened: { ts, count } or null. Names must overlap by 60 % to match (so "Edge" never matches "Edge Update"). */
  function lastOpened(name, assist, prefetch) {
    const key = norm(name).slice(0, 24)
    if (key.length < 5) return null
    const near = k => { if (!k || k.length < 5) return false; const s = key.length < k.length ? key : k, l = key.length < k.length ? k : key; return s.length / l.length >= 0.6 && l.includes(s) }
    let ts = 0, count = 0
    for (const [k, v] of Object.entries(assist || {})) if (near(k) && v.ts > ts) { ts = v.ts; count = v.count }
    for (const [k, v] of Object.entries(prefetch || {})) if (near(k) && v > ts) ts = v
    return ts ? { ts, count } : null
  }
  const isOem = (name, oem) => (oem || []).some(o => String(name || '').toLowerCase().includes(String(o).toLowerCase()))
  const isSystem = name => SYSTEM_APP.test(name || '')
  /** Rows for the Programs list after filter chip, search and sort. */
  function programRows(apps, o = {}) {
    const q = String(o.q || '').trim().toLowerCase(), now = o.now || Date.now()
    let list = (apps || []).filter(a => !q || String(a.name).toLowerCase().includes(q) || String(a.publisher || '').toLowerCase().includes(q))
    if (o.filter === 'oem') list = list.filter(a => a.oem)
    else if (o.filter === 'unused') list = list.filter(a => !a.system && a.last && now - a.last.ts > 90 * DAY)
    else if (o.filter === 'large') list = list.filter(a => a.size >= 500 * 1048576)
    const dir = o.dir === -1 ? -1 : 1
    const key = {
      size: (a, b) => (b.size - a.size),
      date: (a, b) => String(b.date || '').localeCompare(String(a.date || '')),
      last: (a, b) => ((a.last ? a.last.ts : Infinity) - (b.last ? b.last.ts : Infinity)),
      name: (a, b) => String(a.name).localeCompare(String(b.name)),
    }[o.sort] || ((a, b) => String(a.name).localeCompare(String(b.name)))
    return list.sort((a, b) => key(a, b) * (o.sort === 'name' || !o.sort ? dir : 1))
  }
  const installDate = raw => { const s = String(raw || '').replace(/\D/g, ''); return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : '' }
  /** Journal entries -> batches, newest first: [{ batchId, ts, rows: [entry], undone }] */
  function groupBatches(entries) {
    const map = new Map()
    for (const e of entries || []) {
      const k = e.batchId || e.entryId
      if (!map.has(k)) map.set(k, { batchId: e.batchId || null, ts: e.ts, rows: [] })
      const b = map.get(k); b.rows.push(e); if (e.ts > b.ts) b.ts = e.ts
    }
    return [...map.values()].map(b => ({ ...b, undone: b.rows.every(r => r.undone) })).sort((a, b) => b.ts - a.ts)
  }

  const V = { SYSTEM_APP, assistMap, prefetchMap, lastOpened, isOem, isSystem, programRows, installDate, groupBatches, refresh: {} }
  root.JylliDebloatViews = V
  if (typeof module !== 'undefined' && module.exports) module.exports = V
  if (typeof document === 'undefined') return

  const loadingHtml = (ctx, k) => `<div class="db-wait"><i class="fa fa-spinner fa-spin" aria-hidden="true"></i><span>${ctx.esc(ctx.T(k))}</span></div>`
  const errHtml = (ctx, retry) => `<div class="db-wait err"><i class="fa fa-triangle-exclamation" aria-hidden="true"></i><span>${ctx.esc(ctx.T('loadFailed'))}</span><button type="button" class="db-sec sm" data-retry>${ctx.esc(ctx.T('retry'))}</button></div>`
  const when = (ctx, ts) => { const d = Math.floor((Date.now() - ts) / DAY); return d < 1 ? ctx.T('agoToday') : d < 60 ? ctx.T('agoDays', { n: d }) : d < 700 ? ctx.T('agoMonths', { n: Math.round(d / 30) }) : ctx.T('agoYears', { n: Math.round(d / 365) }) }
  const holdOr = (btn, run) => { if (root.JylliHold) root.JylliHold.attach(btn, 650, run); btn.addEventListener('click', () => { if (!(root.JylliWorld && root.JylliWorld.holdToApply && root.JylliWorld.holdToApply())) run() }) }
  const label = (ctx, id) => id.startsWith('shell:') ? ctx.T('shellEntry', { id: id.slice(6) }) : ctx.nameOf(id)

  // ───────────────────────── Ad map ─────────────────────────
  const PINS = { lock: [50, 27], start: [50, 72], search: [38, 95.5], taskbar: [5, 95.5], explorer: [80, 17], settings: [19, 38], notify: [94, 95.5] }
  V.admap = function (host, ctx) {
    const { T, esc, el } = ctx
    const local = { sel: new Set(), cur: null, busy: false, init: false }
    const ads = () => ctx.items().filter(i => i.kind === 'ad')
    const active = s => ads().filter(i => i.surface === s && i.state === 'on')
    function paint() {
      const items = ads(), on = items.filter(i => i.state === 'on')
      if (!local.init && items.length) { local.init = true; on.forEach(i => { const v = ctx.S.verdicts[i.id]; if (v && v.lane === 'safe') local.sel.add(i.id) }); local.cur = Object.keys(PINS).find(s => active(s).length) || 'lock' }
      for (const id of [...local.sel]) if (!on.some(i => i.id === id)) local.sel.delete(id)
      const pins = Object.entries(PINS).map(([s, [x, y]]) => { const n = active(s).length; return `<button type="button" class="db-pin${n ? ' on' : ' off'}${local.cur === s ? ' cur' : ''}" data-surface="${s}" style="left:${x}%;top:${y}%" aria-label="${esc(T('surface_' + s))}: ${n ? esc(T('adsOn', { n })) : esc(T('adsOff'))}">${n ? `<b>${n}</b>` : '<i class="fa fa-check" aria-hidden="true"></i>'}</button>` }).join('')
      const list = ads().filter(i => !local.cur || i.surface === local.cur)
      const rows = list.map(i => `<label class="db-ad${i.state === 'on' ? '' : ' off'}"><input type="checkbox" data-ad="${esc(i.id)}"${local.sel.has(i.id) ? ' checked' : ''}${i.state === 'on' ? '' : ' disabled'}><span class="db-ad-k"></span>
        <span class="db-ad-t"><b>${esc(ctx.nameOf(i.id))}</b><em>${esc(T('d_' + i.id))}</em></span><span class="db-chip-i ${i.state === 'on' ? 'warn' : 'keep'}">${esc(T(i.state === 'on' ? 'adOn' : 'adOffNow'))}</span></label>`).join('')
      host.innerHTML = `<section class="db-adsec"><header class="db-sec-h"><div><h3>${esc(T('adsTitle'))}</h3><p>${esc(T('adsSub'))}</p></div><span class="db-lane-n">${esc(T('adsCount', { n: on.length, t: items.length }))}</span></header>
        <div class="db-adwrap"><div class="db-desk" aria-hidden="false">
          <div class="db-win db-w-settings"><span class="db-w-t">${esc(T('surface_settings'))}</span><i class="db-w-bar"></i><i class="db-w-line"></i><i class="db-w-line s"></i><i class="db-w-card"></i></div>
          <div class="db-win db-w-explorer"><span class="db-w-t">${esc(T('surface_explorer'))}</span><i class="db-w-bar"></i><i class="db-w-banner"></i><i class="db-w-line"></i><i class="db-w-line s"></i></div>
          <div class="db-win db-w-lock"><span class="db-w-t">${esc(T('surface_lock'))}</span><span class="db-w-clock">${esc(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</span></div>
          <div class="db-win db-w-start"><span class="db-w-t">${esc(T('surface_start'))}</span><div class="db-w-grid"><i></i><i></i><i></i><i></i><i></i><i></i></div><i class="db-w-rec"></i></div>
          <div class="db-taskbar"><i class="db-tb-w"></i><i class="db-tb-s"></i><i class="db-tb-search"></i><i class="db-tb-tray"></i></div>${pins}</div>
        <div class="db-adside"><h4>${esc(T('surface_' + (local.cur || 'lock')))}</h4><div class="db-ads">${rows || `<p class="db-empty">${esc(T('nothingHere'))}</p>`}</div>
          <div class="db-adact"><button type="button" class="db-cta" data-act="go"${local.sel.size && !local.busy ? '' : ' disabled'}><i class="fa fa-ban" aria-hidden="true"></i><span>${esc(T('adsGo', { n: local.sel.size }))}</span></button>
          <button type="button" class="db-sec sm" data-act="all">${esc(T('adsAll'))}</button></div><p class="db-note">${esc(T('adsUndo'))}</p></div></div></section>`
      const go = host.querySelector('[data-act="go"]'); if (go) holdOr(go, run)
    }
    async function run() {
      if (local.busy || !local.sel.size) return
      local.busy = true; paint()
      const ids = [...local.sel]
      const res = await ctx.runQuick(ids)
      local.busy = false
      const ok = res && res.ok ? res.receipt.rows.filter(r => r.ok).length : 0
      ctx.toast('', res && res.ok ? T('adsDone', { n: ok }) : T('runFailed'), res && res.ok ? 'ok' : 'warn', 4000)
      paint()
    }
    host.addEventListener('click', e => {
      const p = e.target.closest('[data-surface]'); if (p) { local.cur = p.dataset.surface; paint(); return }
      const a = e.target.closest('[data-act="all"]'); if (a) { ads().filter(i => i.state === 'on').forEach(i => local.sel.add(i.id)); paint() }
    })
    host.addEventListener('change', e => { const cb = e.target.closest('input[data-ad]'); if (!cb) return; if (cb.checked) local.sel.add(cb.dataset.ad); else local.sel.delete(cb.dataset.ad); paint() })
    V.refresh.admap = () => paint()
    if (!ctx.model()) host.innerHTML = loadingHtml(ctx, 'scanning')
    else paint()
    // the first scan may still be running when this view opens
    const t = setInterval(() => { if (!host.isConnected) return clearInterval(t); if (ctx.model() && !local.init) paint() }, 600)
  }

  // ───────────────────────── Programs ─────────────────────────
  V.programs = function (host, ctx) {
    const { T, esc } = ctx
    const L = { apps: [], sel: new Set(), q: '', filter: 'all', sort: 'name', dir: 1, state: 'idle', busy: false }
    host.innerHTML = `<section class="db-prog"><header class="db-sec-h"><div><h3>${esc(T('pgTitle'))}</h3><p>${esc(T('pgSub'))}</p></div><button type="button" class="db-sec" data-act="load"><i class="fa fa-rotate" aria-hidden="true"></i><span>${esc(T('pgLoad'))}</span></button></header>
      <div class="db-tools"><label class="db-search"><i class="fa fa-magnifying-glass" aria-hidden="true"></i><input type="search" data-q placeholder="${esc(T('search'))}" aria-label="${esc(T('search'))}"></label>
      <div class="db-chips" data-fx></div><div class="db-chips" data-sx></div></div><div data-body></div><div class="db-bar-act" data-bar hidden></div><div data-prog class="db-run-prog" hidden></div></section>`
    const body = host.querySelector('[data-body]'), bar = host.querySelector('[data-bar]'), prog = host.querySelector('[data-prog]')
    const chipsF = host.querySelector("[data-fx]"), chipsS = host.querySelector("[data-sx]")
    function chipsPaint() {
      chipsF.innerHTML = ['all', 'oem', 'unused', 'large'].map(f => `<button type="button" class="db-chip${L.filter === f ? ' on' : ''}" data-f="${f}">${esc(T('pgF_' + f))}</button>`).join('')
      chipsS.innerHTML = ['name', 'size', 'date', 'last'].map(s => `<button type="button" class="db-chip${L.sort === s ? ' on' : ''}" data-s="${s}">${esc(T('pgS_' + s))}</button>`).join('')
    }
    function barPaint() {
      const chosen = L.apps.filter(a => L.sel.has(a.key)), bytes = chosen.reduce((s, a) => s + a.size, 0)
      bar.hidden = !chosen.length
      if (!chosen.length) return
      bar.innerHTML = `<span>${esc(T('pgSelected', { n: chosen.length }))}${bytes ? ' · ' + esc(T('pgFree', { s: ctx.fmt(bytes) })) : ''}</span><span class="db-note">${esc(T('pgNoUndo'))}</span><button type="button" class="db-cta" data-act="go"><i class="fa fa-trash" aria-hidden="true"></i><span>${esc(T('pgUninstall', { n: chosen.length }))}</span></button>`
      holdOr(bar.querySelector('[data-act="go"]'), uninstall)
    }
    function paint() {
      chipsPaint()
      if (L.state === 'loading') { body.innerHTML = loadingHtml(ctx, 'pgScanning'); bar.hidden = true; return }
      if (L.state === 'error') { body.innerHTML = errHtml(ctx); return }
      if (L.state === 'idle') { body.innerHTML = `<p class="db-empty">${esc(T('pgIdle'))}</p>`; return }
      const rows = programRows(L.apps, { q: L.q, filter: L.filter, sort: L.sort, dir: L.dir, now: Date.now() })
      const total = L.apps.reduce((s, a) => s + a.size, 0)
      const head = `<p class="db-prog-sum"><b>${L.apps.length}</b> ${esc(T('pgApps'))}${total ? ` · <b>${esc(ctx.fmt(total))}</b>` : ''}</p>`
      body.innerHTML = head + (rows.length ? `<div class="db-plist">${rows.map(a => `<article class="db-prow${a.system ? ' sys' : ''}${L.sel.has(a.key) ? ' on' : ''}" data-key="${esc(a.key)}">
        <label class="db-check"><input type="checkbox" data-pk="${esc(a.key)}"${L.sel.has(a.key) ? ' checked' : ''}${a.system ? ' disabled' : ''} aria-label="${esc(a.name)}"><span></span></label>
        <div class="db-main"><div class="db-name">${esc(a.name)}${a.version ? `<small>${esc(a.version)}</small>` : ''}</div><div class="db-desc">${esc(a.publisher || '')}</div>
          <div class="db-chips-i">${a.system ? `<span class="db-chip-i keep"><i class="fa fa-lock" aria-hidden="true"></i>${esc(T('pgSystem'))}</span>` : ''}${a.oem ? `<span class="db-chip-i warn">${esc(T('pgOem'))}</span>` : ''}${a.last ? `<span class="db-chip-i${Date.now() - a.last.ts > 180 * DAY ? ' warn' : ''}" title="${esc(new Date(a.last.ts).toLocaleDateString())}">${esc(T('pgOpened', { when: when(ctx, a.last.ts) }))}${a.last.count ? ` · ${a.last.count}×` : ''}</span>` : (a.system ? '' : `<span class="db-chip-i">${esc(T('pgNoRecord'))}</span>`)}</div></div>
        <div class="db-size"><div class="db-num">${a.size ? (() => { const p = ctx.parts(a.size); return `<b>${esc(p.v)}</b><small>${esc(p.u)}</small>` })() : '<b class="muted">–</b>'}</div><div class="db-state">${esc(a.date)}</div></div></article>`).join('')}</div>` : `<p class="db-empty">${esc(T('noMatch'))}</p>`)
      barPaint()
    }
    async function load() {
      L.state = 'loading'; paint()
      try {
        const [apps, pre, ua] = await Promise.all([root.api.listInstalledWin32(), root.api.getPrefetchAges().catch(() => []), root.api.getUserAssist().catch(() => [])])
        const as = assistMap(ua), pm = prefetchMap(pre), oem = (ctx.model() && ctx.model().oem) || []
        L.apps = (Array.isArray(apps) ? apps : []).filter(a => a && a.DisplayName).map(a => ({ key: a.Key || a.DisplayName, name: a.DisplayName, version: a.DisplayVersion || '', publisher: a.Publisher || '', size: a.SizeBytes || 0, date: installDate(a.InstallDate), system: isSystem(a.DisplayName), oem: isOem(a.DisplayName, oem), last: lastOpened(a.DisplayName, as, pm) }))
        L.sel.clear(); L.state = 'ready'
      } catch (e) { L.state = 'error' }
      paint()
    }
    async function uninstall() {
      if (L.busy) return
      const chosen = L.apps.filter(a => L.sel.has(a.key)); if (!chosen.length) return
      try { await root.showConfirm({ title: T('pgConfirmTitle', { n: chosen.length }), body: `<div class="db-confirm-list">${chosen.slice(0, 12).map(a => `<div>• ${esc(a.name)}</div>`).join('')}${chosen.length > 12 ? `<div>… +${chosen.length - 12}</div>` : ''}</div><p>${esc(T('pgConfirmBody'))}</p>`, okText: T('pgUninstall', { n: chosen.length }), okStyle: 'danger', icon: 'fa-trash' }) } catch (e) { return }
      L.busy = true; prog.hidden = false; prog.innerHTML = `<div class="db-run-l">${esc(T('rpCreating'))}</div><div class="db-run-t"><i></i></div>`
      let rp = null; try { rp = await root.api.createRestorePoint('JylliTool_Debloat') } catch (e) { rp = null }
      if (!rp || rp.ok === false) { let go = false; try { await root.showConfirm({ title: T('rpFailTitle'), body: esc(T('rpFailBody')), okText: T('rpFailGo'), okStyle: 'danger', icon: 'fa-shield-halved' }); go = true } catch (e) { /* stay */ } if (!go) { L.busy = false; prog.hidden = true; return } }
      const unsub = root.api.onDebloatProgress ? root.api.onDebloatProgress(p => { prog.innerHTML = `<div class="db-run-l">${esc(T('pgRemoving', { a: p.current, b: p.total, name: p.pkg || '' }))}</div><div class="db-run-t"><i style="width:${Math.round((p.current / Math.max(1, p.total)) * 100)}%"></i></div>` }) : null
      let res = []
      try { res = await root.api.uninstallWin32Apps(chosen.map(a => ({ name: a.name, key: a.key }))) } catch (e) { res = [] }
      if (typeof unsub === 'function') unsub()
      L.busy = false; prog.hidden = true
      const ok = (res || []).filter(r => r.ok).length
      ctx.toast('', T('pgDone', { n: ok }), ok ? 'ok' : 'warn', 4500)
      load()
    }
    host.addEventListener('click', e => {
      if (e.target.closest('[data-act="load"], [data-retry]')) return load()
      const f = e.target.closest('[data-f]'); if (f) { L.filter = f.dataset.f; paint() }
      const s = e.target.closest('[data-s]'); if (s) { if (L.sort === s.dataset.s && s.dataset.s === 'name') L.dir *= -1; L.sort = s.dataset.s; paint() }
    })
    host.addEventListener('change', e => { const cb = e.target.closest('input[data-pk]'); if (!cb) return; if (cb.checked) L.sel.add(cb.dataset.pk); else L.sel.delete(cb.dataset.pk); cb.closest('.db-prow').classList.toggle('on', cb.checked); barPaint() })
    host.querySelector('[data-q]').addEventListener('input', e => { L.q = e.target.value; paint() })
    paint(); load()
  }

  // ───────────────────────── Extras ─────────────────────────
  V.extras = function (host, ctx) {
    const { T, esc } = ctx
    host.innerHTML = `<section class="db-ex" data-dev></section><section class="db-ex" data-shell></section>`
    const dev = host.querySelector('[data-dev]'), sh = host.querySelector('[data-shell]')
    let devices = [], shells = []

    async function loadDevices() {
      dev.innerHTML = `<header class="db-sec-h"><div><h3>${esc(T('devTitle'))}</h3><p>${esc(T('devSub'))}</p></div></header>${loadingHtml(ctx, 'devScanning')}`
      try { devices = await root.api.getUnusedDevices() } catch (e) { dev.innerHTML = errHtml(ctx).replace('data-retry', 'data-retry="dev"'); return }
      devices = Array.isArray(devices) ? devices : []
      dev.innerHTML = `<header class="db-sec-h"><div><h3>${esc(T('devTitle'))}</h3><p>${esc(T('devSub'))}</p></div><button type="button" class="db-sec sm" data-act="dev-load"><i class="fa fa-rotate" aria-hidden="true"></i><span>${esc(T('rescan'))}</span></button></header>
        ${devices.length ? `<div class="db-plist">${devices.map((d, i) => `<article class="db-prow on"><label class="db-check"><input type="checkbox" data-dev="${i}" checked aria-label="${esc(d.name)}"><span></span></label><div class="db-main"><div class="db-name">${esc(d.name)}</div><div class="db-desc">${esc(d.cls || '')}</div></div><div class="db-size"><div class="db-state">${esc(T(d.present ? 'devError' : 'devGhost'))}</div></div></article>`).join('')}</div>
        <div class="db-bar-act"><span class="db-note">${esc(T('devNote'))}</span><button type="button" class="db-cta" data-act="dev-go"><i class="fa fa-plug-circle-xmark" aria-hidden="true"></i><span>${esc(T('devRemove'))}</span></button></div>` : `<p class="db-empty"><i class="fa fa-circle-check" aria-hidden="true"></i> ${esc(T('devNone'))}</p>`}`
      const go = dev.querySelector('[data-act="dev-go"]'); if (go) holdOr(go, removeDevices)
    }
    async function removeDevices() {
      const chosen = devices.filter((d, i) => dev.querySelector(`[data-dev="${i}"]`)?.checked); if (!chosen.length) return
      try { await root.showConfirm({ title: T('devConfirm', { n: chosen.length }), body: esc(T('devConfirmBody')), okText: T('devRemove'), okStyle: 'warning', icon: 'fa-microchip' }) } catch (e) { return }
      dev.querySelector('[data-act="dev-go"]').disabled = true
      try { await root.api.removeDevices(chosen.map(d => d.id)) } catch (e) { /* the rescan shows the truth */ }
      ctx.toast('', T('devDone', { n: chosen.length }), 'ok', 3500)
      loadDevices()
    }
    async function loadShell() {
      sh.innerHTML = `<header class="db-sec-h"><div><h3>${esc(T('shellTitle'))}</h3><p>${esc(T('shellSub'))}</p></div></header>${loadingHtml(ctx, 'shellScanning')}`
      try { shells = await root.api.getShellExtensions() } catch (e) { sh.innerHTML = errHtml(ctx).replace('data-retry', 'data-retry="shell"'); return }
      shells = Array.isArray(shells) ? shells : []
      const orphan = shells.filter(s => !s.dllExists).length
      sh.innerHTML = `<header class="db-sec-h"><div><h3>${esc(T('shellTitle'))}</h3><p>${esc(T('shellSub'))}</p></div><button type="button" class="db-sec sm" data-act="shell-load"><i class="fa fa-rotate" aria-hidden="true"></i><span>${esc(T('rescan'))}</span></button></header>
        ${shells.length ? `<p class="db-prog-sum"><b>${shells.length}</b> ${esc(T('shellFound'))} · <b>${orphan}</b> ${esc(T('shellOrphans'))}</p><div class="db-plist">${shells.map((s, i) => `<article class="db-prow${s.dllExists ? '' : ' on'}"><label class="db-check"><input type="checkbox" data-sh="${i}"${s.dllExists ? '' : ' checked'} aria-label="${esc(s.name || s.clsid)}"><span></span></label><div class="db-main"><div class="db-name">${esc(s.name || s.clsid)}</div><div class="db-desc mono">${esc(s.dllPath || T('shellNoDll'))}</div></div><div class="db-size"><span class="db-chip-i ${s.dllExists ? 'keep' : 'warn'}">${esc(T(s.dllExists ? 'shellActive' : 'shellOrphan'))}</span></div></article>`).join('')}</div>
        <div class="db-bar-act"><span class="db-note">${esc(T('shellNote'))}</span><button type="button" class="db-cta" data-act="shell-go"><i class="fa fa-ban" aria-hidden="true"></i><span>${esc(T('shellRemove'))}</span></button></div>` : `<p class="db-empty"><i class="fa fa-circle-check" aria-hidden="true"></i> ${esc(T('shellNone'))}</p>`}`
      const go = sh.querySelector('[data-act="shell-go"]'); if (go) holdOr(go, removeShell)
    }
    async function removeShell() {
      const chosen = shells.filter((s, i) => sh.querySelector(`[data-sh="${i}"]`)?.checked); if (!chosen.length) return
      try { await root.showConfirm({ title: T('shellConfirm', { n: chosen.length }), body: esc(T('shellConfirmBody')), okText: T('shellRemove'), okStyle: 'danger', icon: 'fa-ban' }) } catch (e) { return }
      const r = await root.api.debloat2ShellRemove({ clsids: chosen.map(s => s.clsid) })
      const ok = r && r.ok ? r.rows.filter(x => x.ok).length : 0
      ctx.toast('', T('shellDone', { n: ok }), ok ? 'ok' : 'warn', 4000)
      loadShell()
    }
    host.addEventListener('click', e => {
      if (e.target.closest('[data-act="dev-load"], [data-retry="dev"]')) loadDevices()
      if (e.target.closest('[data-act="shell-load"], [data-retry="shell"]')) loadShell()
    })
    loadDevices(); loadShell()
  }

  // ───────────────────────── History ─────────────────────────
  V.history = function (host, ctx) {
    const { T, esc } = ctx
    async function paint() {
      host.innerHTML = loadingHtml(ctx, 'histLoading')
      let res = null
      try { res = await root.api.debloat2History() } catch (e) { res = null }
      if (!res || !res.ok) { host.innerHTML = errHtml(ctx); return }
      const batches = groupBatches(res.entries)
      let legacy = []
      try { legacy = JSON.parse(localStorage.getItem('debloat-action-history') || '[]') } catch (e) { legacy = [] }
      const rowHtml = e => `<li class="${e.undone ? 'undone' : ''}"><span><b>${esc(label(ctx, e.id))}</b><em>${esc(e.result === 'ok' || !e.result ? '' : T('itemFailed'))}${e.undone ? esc(T('histUndone')) : ''}</em></span>
        <span class="db-hist-act">${e.undone ? '' : `<button type="button" class="db-mini" data-undo="${esc(e.entryId)}">${esc(T('histUndo'))}</button>`}${e.id.startsWith('app:') ? `<button type="button" class="db-mini" data-wb="${esc(e.id)}">${esc(T('wbBtn'))}</button>` : ''}</span></li>`
      host.innerHTML = `<section class="db-hist"><header class="db-sec-h"><div><h3>${esc(T('histTitle'))}</h3><p>${esc(T('histSub'))}</p></div></header>
        ${batches.length ? batches.map(b => `<article class="db-batch${b.undone ? ' undone' : ''}"><header><div><b>${esc(new Date(b.ts).toLocaleString())}</b><span>${esc(T('histItems', { n: b.rows.length }))}</span></div>${!b.undone && b.batchId ? `<button type="button" class="db-sec sm" data-undo-batch="${esc(b.batchId)}"><i class="fa fa-rotate-left" aria-hidden="true"></i><span>${esc(T('histUndoRun'))}</span></button>` : ''}</header><ul>${b.rows.map(rowHtml).join('')}</ul></article>`).join('') : `<p class="db-empty">${esc(T('histEmpty'))}</p>`}
        ${legacy.length ? `<details class="db-legacy"><summary>${esc(T('histLegacy', { n: legacy.length }))}</summary><ul>${legacy.slice(0, 50).map(l => `<li><span>${esc(l.name || '')}</span><em>${esc(new Date(l.ts).toLocaleDateString())}</em></li>`).join('')}</ul></details>` : ''}</section>`
    }
    host.addEventListener('click', async e => {
      if (e.target.closest('[data-retry]')) return paint()
      const ub = e.target.closest('[data-undo-batch]'), u = e.target.closest('[data-undo]'), w = e.target.closest('[data-wb]')
      if (ub || u) {
        const btn = ub || u; btn.disabled = true
        const r = await root.api.debloat2Undo(ub ? { batchId: ub.dataset.undoBatch } : { entryId: u.dataset.undo })
        ctx.toast('', r && r.ok ? T('undone', { n: (r.ids || []).length }) : T('undoFailed'), r && r.ok ? 'ok' : 'warn', 4500)
        ctx.rescan(); paint()
      }
      if (w) {
        w.disabled = true
        const r = await root.api.debloat2Wayback({ id: w.dataset.wb })
        ctx.toast('', r && r.ok ? T('wbDone_' + (r.how || 'present')) : r && r.how === 'store' ? T('wbDone_store') : T('wbFailed'), r && (r.ok || r.how === 'store') ? 'ok' : 'warn', 5000)
        ctx.rescan(); w.disabled = false
      }
    })
    V.refresh.history = () => paint()
    paint()
  }
})(typeof window !== 'undefined' ? window : globalThis)
