'use strict'
// Debloat 2.0, "Lean" view: the Footprint Core, a verdict, the 24-hour chatter band, "this PC is for" intent chips, three lanes
// (Safe to remove / Your call / In use, kept), an in-place run, a receipt with MEASURED deltas, the came-back banner and Guard.
// Facts come from the scan (lib/debloat); which lane an item lands in is JylliDebloatClassify and re-runs instantly when an intent
// chip changes. Pure helpers are exported for node tests (test/debloat-ui.test.js); the DOM part is guarded by `typeof document`.
;(function (root) {
  const LANE_ORDER = ['safe', 'review', 'kept']
  const LAYERS = ['apps', 'services', 'tasks', 'ads', 'features']
  const LAYER_ICON = { apps: 'cube', services: 'gear', tasks: 'clock', ads: 'rectangle-ad', features: 'puzzle-piece' }
  const GROUP_ICON = { xbox: 'gamepad', ai: 'wand-magic-sparkles', comms: 'comments', sponsored: 'bullhorn', telemetry: 'tower-broadcast', diagnostics: 'stethoscope', privacy: 'eye-slash', maps: 'map-location-dot', shell: 'window-restore', updates: 'arrows-rotate', cloud: 'cloud', performance: 'gauge-high', legacy: 'box-archive', system: 'shield-halved', microsoft: 'window-maximize', lock: 'lock', start: 'table-cells-large', search: 'magnifying-glass', taskbar: 'bars', explorer: 'folder-open', settings: 'sliders', notify: 'bell' }
  const GROUP_OF_TICK = { telemetry: 'telemetry', diagnostics: 'diagnostics', privacy: 'privacy' }

  // ── pure ──
  const M = 1048576, G = 1073741824
  function parts(b) { return b >= G ? { v: (b / G).toFixed(1), u: 'GB' } : b >= M ? { v: String(Math.round(b / M)), u: 'MB' } : b > 0 ? { v: String(Math.max(1, Math.round(b / 1024))), u: 'KB' } : { v: '0', u: 'MB' } }
  const fmt = b => { const p = parts(b); return p.v + ' ' + p.u }
  /** What an item costs, as the number shown on its card: disk for apps, RAM for services, wake-ups for tasks, nothing measurable otherwise. */
  function costOf(it, now) {
    if (it.kind === 'appx' && it.disk > 0) return parts(it.disk)
    if (it.ram > 0) return parts(it.ram)
    if (it.kind === 'task') { const n = root.JylliDebloatFootprint.taskTicks(it, now).length; if (n) return { v: String(n), u: '×' } }
    return null
  }
  const weight = it => (it.disk || 0) + (it.ram || 0)
  const byCost = (a, b) => weight(b) - weight(a) || String(a.id).localeCompare(String(b.id))
  /** Items of one lane for the cards, honouring the layer chip and the search text. nameOf(id) gives the shown name. */
  function laneList(items, verdicts, lane, o = {}) {
    const q = String(o.q || '').trim().toLowerCase()
    return (items || []).filter(i => verdicts[i.id] && verdicts[i.id].lane === lane && (!o.layer || o.layer === 'all' || i.layer === o.layer) &&
      (!q || String(o.nameOf ? o.nameOf(i.id) : i.id).toLowerCase().includes(q) || String(i.ref).toLowerCase().includes(q))).sort(byCost)
  }
  /** { all, apps, services, ... } counts of removable (not kept) items for the layer chips. */
  function layerCounts(items, verdicts) {
    const out = { all: 0 }
    for (const l of LAYERS) out[l] = 0
    for (const i of items || []) { const v = verdicts[i.id]; if (v && v.present && v.lane !== 'kept') { out.all++; out[i.layer]++ } }
    return out
  }
  /** A run is confirmed in a dialog when it takes an app or feature away or includes anything from "Your call"; plain safe services, tasks and ads are exactly undoable and only need the hold. */
  function needsConfirm(items, verdicts, sel) {
    return (items || []).some(i => sel.has(i.id) && (i.kind === 'appx' || i.kind === 'feature' || (verdicts[i.id] && verdicts[i.id].lane === 'review')))
  }
  const selectedIds = (items, verdicts, sel) => (items || []).filter(i => sel.has(i.id) && verdicts[i.id] && verdicts[i.id].present && verdicts[i.id].lane !== 'kept').map(i => i.id)
  /** Wakes in the next 24 h now and after the selection is silenced. */
  function wakesAfter(ticks, sel) { return { now: ticks.length, after: ticks.filter(t => !sel.has(t.id)).length } }
  const wayBack = (it, deprovision) => (it.kind === 'appx' ? (!deprovision && it.provisioned ? 'offline' : 'store') : null)
  /** Pins for the 24-hour band: position in % of the window, one entry per tick. */
  const bandPos = (t, now, windowMs) => Math.max(0, Math.min(100, ((t - now) / windowMs) * 100))

  const api = { LANE_ORDER, LAYERS, LAYER_ICON, GROUP_ICON, parts, fmt, costOf, byCost, laneList, layerCounts, needsConfirm, selectedIds, wakesAfter, wayBack, bandPos }
  root.JylliDebloatPage = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  const T = (k, v) => root.tG('debloat2', k, v)
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const still = () => document.documentElement.classList.contains('motion-reduced') || document.body.classList.contains('game-live')
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
  const sizeHtml = p => `<b>${esc(p.v)}</b><small>${esc(p.u)}</small>`
  const CL = () => root.JylliDebloatClassify, FP = () => root.JylliDebloatFootprint

  // Windows brought things back (background Guard): say so wherever the user is
  if (root.api && root.api.onDebloat2Drift) root.api.onDebloat2Drift(d => { try { root.toast(T('driftTitle'), d.reapplied ? T('driftQuiet', { n: d.reapplied }) : T('driftBody', { n: d.count }), 'warn', 7000) } catch (e) { /* toast not ready */ } })

  function mount(c) {
    const host = el('div', 'jk db')
    c.appendChild(host)
    const S = { model: null, verdicts: {}, intents: {}, auto: {}, shield: true, deprovision: true, guard: { mode: 'off' }, sel: new Set(), unlocked: new Set(), phase: 'scan', receipt: null,
      open: new Set(), drift: [], q: '', layer: 'all', keptOpen: false, runTotal: 0, removed: 0, remain: {}, rpMsg: false, disposed: false }
    let view = 'lean'
    const views = {}
    const nameOf = id => (id.startsWith('app:') || id.startsWith('svc:') || id.startsWith('task:') || id.startsWith('ad:') || id.startsWith('feat:')) ? T('n_' + id) : id

    // ── frame ──
    const bar = el('div', 'db-bar')
    const sw = root.JylliTab.seg([
      { id: 'lean', label: T('segLean'), icon: 'leaf' }, { id: 'admap', label: T('segAds'), icon: 'rectangle-ad' }, { id: 'programs', label: T('segPrograms'), icon: 'box-archive' },
      { id: 'extras', label: T('segExtras'), icon: 'puzzle-piece' }, { id: 'history', label: T('segHistory'), icon: 'clock-rotate-left' },
    ], view, id => show(id))
    bar.appendChild(sw.el)
    host.appendChild(bar)
    for (const k of ['lean', 'admap', 'programs', 'extras', 'history']) { views[k] = el('div', 'db-view'); views[k].dataset.view = k; host.appendChild(views[k]) }
    const built = {}
    const ctx = {
      T, esc, el, fmt, parts, nameOf, S, still,
      model: () => S.model, items: () => (S.model ? S.model.items : []),
      rescan: () => doScan({ quiet: true }),
      /** Quick run for a few items from another view (no card UI): journaled like any run. */
      async runQuick(ids) {
        if (S.phase === 'running' || !ids.length) return null
        const res = await root.api.debloat2Run({ ids, deprovision: S.deprovision })
        await doScan({ quiet: true })
        return res
      },
      toast: (...a) => { try { root.toast(...a) } catch (e) { /* ignore */ } },
    }
    function show(id) {
      view = id
      sw.set(id)
      for (const k of Object.keys(views)) views[k].hidden = k !== id
      if (id !== 'lean') {
        const V = root.JylliDebloatViews
        if (V && V[id]) { if (!built[id]) { built[id] = true; V[id](views[id], ctx) } else if (V.refresh && V.refresh[id]) V.refresh[id](views[id], ctx) }
      }
    }

    // ── lean view skeleton ──
    const lv = views.lean
    const banner = el('div', 'db-banner-slot')
    const stage = el('section', 'db-stage')
    const coreHost = el('div', 'db-core-host')
    const core = root.JylliDebloatCore.mount(coreHost, { label: T('scanning') })
    const verdict = el('div', 'db-verdict')
    stage.append(coreHost, verdict)
    const chatter = el('section', 'db-chatter')
    const intents = el('section', 'db-intents')
    const receiptSlot = el('div', 'db-receipt-slot')
    const tools = el('div', 'db-tools')
    tools.innerHTML = `<label class="db-search"><i class="fa fa-magnifying-glass" aria-hidden="true"></i><input type="search" data-q placeholder="${esc(T('search'))}" aria-label="${esc(T('search'))}"></label><div class="db-chips" role="group" data-layers></div>`
    const lanesEl = el('div', 'db-lanes')
    const guardSlot = el('div', 'db-guard-slot')
    lv.append(banner, stage, chatter, intents, receiptSlot, tools, lanesEl, guardSlot)
    core.onArc(l => highlight(l))
    function highlight(l) { core.highlight(l); lanesEl.querySelectorAll('.db-card').forEach(card => card.classList.toggle('hl', !!l && card.dataset.l === l)) }

    // ── derived ──
    const items = () => (S.model ? S.model.items : [])
    const byId = id => items().find(i => i.id === id)
    function classifyNow() { S.verdicts = CL().classify(items(), S.model.facts, S.intents, { shield: S.shield, now: S.model.ts, unlocked: S.unlocked }) }
    const totals = () => FP().totals(items(), S.verdicts, S.model.ts, S.sel)
    const sel = () => selectedIds(items(), S.verdicts, S.sel)
    const keptCount = () => Object.values(S.verdicts).filter(v => v.present && v.lane === 'kept').length
    const ticks = () => FP().chatter(items(), S.verdicts, S.model.ts)

    // ── verdict ──
    function paintVerdict() {
      const ph = S.phase
      let eyebrow = T('eyScan'), title = T('tScan'), lead = T('lScan'), tone = 'idle', stats = '', btns = ''
      if (ph === 'ready' && S.model) {
        const t = totals(), n = sel().length
        if (!t.all.count) { eyebrow = T('eyClean'); title = T('tClean'); lead = T('lClean'); tone = 'ok' }
        else {
          eyebrow = T('eyReady'); tone = 'accent'
          title = T('tFound', { n: t.all.count })
          lead = keptCount() ? T('lFound', { kept: keptCount() }) : T('lFoundAll')
          btns = `<button type="button" class="db-cta" data-act="clean"${n > 0 ? '' : ' disabled'}><i class="fa fa-broom" aria-hidden="true"></i><span>${esc(T('removeBtn', { n }))}</span></button>`
        }
        stats = `<dl class="db-stats">
          <div><dt>${esc(T('stRam'))}</dt><dd>${esc(fmt(t.all.ram))}</dd></div>
          <div><dt>${esc(T('stDisk'))}</dt><dd>${esc(fmt(t.all.disk))}</dd></div>
          <div><dt>${esc(T('stWakes'))}</dt><dd>${t.all.wakes}</dd></div></dl>`
      } else if (ph === 'running') {
        eyebrow = T('eyRun'); title = T('tRun', { a: S.removed, b: S.runTotal }); lead = S.rpMsg ? T('lRp') : T('lRun'); tone = 'accent'
        btns = `<button type="button" class="db-cta db-stop" data-act="stop"><i class="fa fa-stop" aria-hidden="true"></i><span>${esc(T('stop'))}</span></button>`
      } else if (ph === 'done') {
        const r = S.receipt, n = r ? r.rows.filter(x => x.ok).length : 0
        eyebrow = T('eyDone'); title = T('tDone', { n }); lead = r && r.failed.length ? T('lDoneFail', { n: r.failed.length }) : T('lDone'); tone = r && r.failed.length ? 'warn' : 'ok'
      } else if (ph === 'failed') {
        eyebrow = T('eyFail'); title = T('tFail'); lead = T('lFail'); tone = 'danger'
      }
      verdict.dataset.tone = tone
      verdict.innerHTML = `<div class="db-eyebrow"><span class="db-dot"></span><span>${esc(eyebrow)}</span></div>
        <h2 class="db-title">${esc(title)}</h2><p class="db-lead">${esc(lead)}</p>${stats}
        <div class="db-actions">${btns}<button type="button" class="db-sec" data-act="scan"${ph === 'running' || ph === 'scan' ? ' disabled' : ''}><i class="fa fa-rotate" aria-hidden="true"></i><span>${esc(T('rescan'))}</span></button></div>`
      const cta = verdict.querySelector('[data-act="clean"]')
      if (cta && root.JylliHold) root.JylliHold.attach(cta, 650, () => start())
    }

    // ── came back banner ──
    function paintBanner() {
      const gone = S.model ? S.drift.filter(d => { const it = byId(d.id); return it && it.state === 'on' }) : []
      if (!gone.length || S.phase === 'running') { banner.innerHTML = ''; return }
      const names = gone.slice(0, 3).map(d => nameOf(d.id)).join(', ') + (gone.length > 3 ? ' …' : '')
      banner.innerHTML = `<div class="db-banner"><div class="db-banner-ico"><i class="fa fa-rotate-left" aria-hidden="true"></i></div>
        <div class="db-banner-t"><b>${esc(T('cameBack', { n: gone.length }))}</b><span>${esc(names)}</span></div>
        <button type="button" class="db-sec" data-act="review-drift">${esc(T('review'))}</button><button type="button" class="db-cta sm" data-act="again">${esc(T('removeAgain'))}</button></div>`
    }
    banner.addEventListener('click', e => {
      const x = e.target.closest('[data-act]'); if (!x) return
      const ids = S.drift.filter(d => { const v = S.verdicts[d.id]; return v && v.present }).map(d => d.id)
      if (x.dataset.act === 'review-drift') { S.sel = new Set(ids.filter(id => S.verdicts[id].lane !== 'kept')); S.q = ''; S.layer = 'all'; tools.querySelector('[data-q]').value = ''; paintTools(); paintLanes(); paintVerdict(); paintChatter(); lanesEl.scrollIntoView({ behavior: still() ? 'auto' : 'smooth', block: 'start' }) }
      if (x.dataset.act === 'again') start(ids.filter(id => S.verdicts[id].lane !== 'kept'))
    })

    // ── 24-hour band ──
    function paintChatter() {
      if (!S.model || S.phase === 'scan') { chatter.innerHTML = ''; return }
      const now = S.model.ts, win = FP().DAY, tk = ticks()
      const w = wakesAfter(tk, S.sel)
      const labels = [0, 6, 12, 18, 24].map(h => `<span style="left:${h / 24 * 100}%">${esc(new Date(now + h * FP().HOUR).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</span>`).join('')
      const marks = tk.map(t => { const it = byId(t.id), off = S.sel.has(t.id), g = GROUP_OF_TICK[t.group] || 'other'
        return `<i class="db-tick-m g-${g}${off ? ' off' : ''}${t.kept ? ' kept' : ''}" style="left:${bandPos(t.t, now, win).toFixed(2)}%" title="${esc(new Date(t.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · ' + (it ? nameOf(it.id) : t.id))}"></i>` }).join('')
      const lead = !tk.length ? T('chatterNone') : S.sel.size && w.after !== w.now ? T('chatterAfter', { n: w.now, a: w.after }) : T('chatterNow', { n: w.now })
      chatter.innerHTML = `<header><div><h3>${esc(T('chatterTitle'))}</h3><p>${esc(lead)}</p></div></header>
        <div class="db-band" role="img" aria-label="${esc(lead)}"><div class="db-band-track">${marks}</div><div class="db-band-axis">${labels}</div></div>`
    }

    // ── intents ──
    function paintIntents() {
      if (!S.model) { intents.innerHTML = ''; return }
      const chips = CL().INTENTS.map(k => `<button type="button" class="db-intent${S.intents[k] ? ' on' : ''}" data-intent="${k}" aria-pressed="${!!S.intents[k]}"><i class="fa fa-${esc(({ gaming: 'gamepad', xbox: 'trophy', stream: 'video', work: 'briefcase', dev: 'code', laptop: 'laptop', print: 'print' })[k])}" aria-hidden="true"></i><span>${esc(T('int_' + k))}</span>${S.auto[k] ? `<em title="${esc(T('detected'))}"></em>` : ''}</button>`).join('')
      intents.innerHTML = `<header><div><h3>${esc(T('forTitle'))}</h3><p>${esc(T('forSub'))}</p></div></header><div class="db-intent-row">${chips}</div>
        <div class="db-switches"><label class="db-sw"><input type="checkbox" id="db-protect" ${S.shield ? 'checked' : ''}><span class="db-sw-k"></span><span>${esc(T('shield'))}</span></label>
        <label class="db-sw"><input type="checkbox" id="db-deprov" ${S.deprovision ? 'checked' : ''}><span class="db-sw-k"></span><span>${esc(T('deprov'))}</span></label></div>`
    }
    intents.addEventListener('click', e => {
      const b = e.target.closest('[data-intent]'); if (!b || S.phase === 'running') return
      const k = b.dataset.intent; S.intents[k] = !S.intents[k]
      root.api.debloat2PrefsSet({ intents: S.intents })
      reclassify()
    })
    intents.addEventListener('change', e => {
      if (S.phase === 'running') return
      if (e.target.id === 'db-protect') { S.shield = e.target.checked; root.api.debloat2PrefsSet({ shield: S.shield }); reclassify() }
      if (e.target.id === 'db-deprov') { S.deprovision = e.target.checked; root.api.debloat2PrefsSet({ deprovision: S.deprovision }); paintLanes() }
    })
    function reclassify() {
      const before = new Set(S.sel)
      classifyNow()
      const def = CL().defaultSelection(S.verdicts)
      S.sel = new Set([...def, ...[...before].filter(id => S.verdicts[id] && S.verdicts[id].present && S.verdicts[id].lane === 'review')])
      for (const id of [...S.unlocked]) if (!S.verdicts[id] || S.verdicts[id].lane !== 'review') S.unlocked.delete(id)
      showFound(true)
    }

    // ── tools ──
    function paintTools() {
      const counts = layerCounts(items(), S.verdicts), chips = tools.querySelector('[data-layers]')
      chips.innerHTML = ['all', ...LAYERS].map(l => `<button type="button" class="db-chip${S.layer === l ? ' on' : ''}" data-layer="${l}"${l !== 'all' && !counts[l] ? ' disabled' : ''}>${esc(T('layer_' + l))}<b>${counts[l] || 0}</b></button>`).join('')
    }
    tools.addEventListener('click', e => { const b = e.target.closest('[data-layer]'); if (!b || b.disabled) return; S.layer = b.dataset.layer; paintTools(); paintLanes() })
    tools.querySelector('[data-q]').addEventListener('input', e => { S.q = e.target.value; paintLanes() })

    // ── cards ──
    function ago(ts) { const d = Math.max(0, Math.floor((S.model.ts - ts) / 86400000)); return d < 1 ? T('agoToday') : T('agoDays', { n: d }) }
    function reasonText(r) {
      if (!r) return ''
      if (r.code === 'use') return T('use_' + r.arg, { n: (S.model.facts[r.arg] || 0) })
      if (r.code === 'intent') return T('whyIntent', { x: T('int_' + r.arg) })
      if (r.code === 'recent') return T('whyRecent', { n: r.arg })
      return T('why_' + r.code)
    }
    function chips(it, v) {
      const out = []
      if (v.lane === 'kept') out.push(`<span class="db-chip-i keep"><i class="fa fa-shield-halved" aria-hidden="true"></i>${esc(reasonText(v.reason))}</span>`)
      else if (v.reason && v.reason.code === 'recent') out.push(`<span class="db-chip-i warn"><i class="fa fa-clock-rotate-left" aria-hidden="true"></i>${esc(reasonText(v.reason))}</span>`)
      else if (v.reason && v.reason.code === 'unlocked') out.push(`<span class="db-chip-i warn">${esc(T('why_unlocked'))}</span>`)
      if (it.running && it.ram > 0) out.push(`<span class="db-chip-i">${esc(T('chipRunning', { s: fmt(it.ram) }))}</span>`)
      else if (it.kind === 'appx' && it.ram > 0) out.push(`<span class="db-chip-i">${esc(T('chipRunning', { s: fmt(it.ram) }))}</span>`)
      if (it.kind === 'appx' && it.provisioned) out.push(`<span class="db-chip-i" title="${esc(T('chipProvTip'))}">${esc(T('chipProv'))}</span>`)
      if (it.kind === 'task') { const n = FP().taskTicks(it, S.model.ts).length; if (n) out.push(`<span class="db-chip-i">${esc(T('chipWakes', { n }))}</span>`) }
      if (it.lastUsed && v.reason && v.reason.code !== 'recent') out.push(`<span class="db-chip-i">${esc(T('chipUsed', { when: ago(it.lastUsed) }))}</span>`)
      if (it.breaks) out.push(`<span class="db-chip-i warn"><i class="fa fa-triangle-exclamation" aria-hidden="true"></i>${esc(T('chipBreaks'))}</span>`)
      if (it.security) out.push(`<span class="db-chip-i warn"><i class="fa fa-shield-exclamation" aria-hidden="true"></i>${esc(T('chipSecurity'))}</span>`)
      const wb = wayBack(it, S.deprovision)
      if (wb) out.push(`<span class="db-chip-i way" title="${esc(T('wbTip_' + wb))}"><i class="fa fa-rotate-left" aria-hidden="true"></i>${esc(T('wb_' + wb))}</span>`)
      return out.join('')
    }
    function more(it, v) {
      const rows = []
      if (it.breaks) rows.push(`<p class="db-breaks"><i class="fa fa-triangle-exclamation" aria-hidden="true"></i>${esc(T('w_' + it.id))}</p>`)
      if (v.lane === 'kept' && v.reason) rows.push(`<p class="db-why">${esc(reasonText(v.reason))}</p>`)
      if (it.kind === 'task' && it.next) rows.push(`<p class="db-meta">${esc(T('nextRun', { t: new Date(it.next).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) }))}</p>`)
      if (it.kind === 'ad') rows.push(`<p class="db-meta">${esc(T('surface_' + it.surface))}</p>`)
      rows.push(`<p class="db-ref"><span>${esc(T('exactId'))}</span><code>${esc(it.ref)}</code></p>`)
      if (v.lane === 'kept') rows.push(`<button type="button" class="db-sec sm" data-act="unlock">${esc(T('unlock'))}</button>`)
      return rows.join('')
    }
    function card(it, v) {
      const open = S.open.has(it.id), kept = v.lane === 'kept', on = S.sel.has(it.id)
      const cost = costOf(it, S.model.ts)
      const icon = GROUP_ICON[it.group] || LAYER_ICON[it.layer]
      const ctrl = kept
        ? `<span class="db-lock" title="${esc(reasonText(v.reason))}"><i class="fa fa-lock" aria-hidden="true"></i></span>`
        : `<label class="db-check"><input type="checkbox" data-sel="${esc(it.id)}"${on ? ' checked' : ''} aria-label="${esc(nameOf(it.id))}"><span></span></label>`
      return `<article class="db-card db-l-${it.layer}${on ? ' on' : ''}${open ? ' open' : ''}${kept ? ' kept' : ''}" data-id="${esc(it.id)}" data-l="${esc(it.layer)}" data-lane="${esc(v.lane)}">
        ${ctrl}
        <div class="db-ico db-l-${it.layer}"><i class="fa fa-${esc(icon)}" aria-hidden="true"></i></div>
        <div class="db-main"><div class="db-name">${esc(nameOf(it.id))}</div><div class="db-desc">${esc(T('d_' + it.id))}</div><div class="db-chips-i">${chips(it, v)}</div><div class="db-more">${more(it, v)}</div></div>
        <div class="db-size"><div class="db-num">${cost ? sizeHtml(cost) : '<b class="muted">–</b>'}</div><div class="db-state" data-state></div></div>
        <button type="button" class="db-exp" data-act="expand" aria-expanded="${open}" aria-label="${esc(T('details'))}"><i class="fa fa-chevron-down" aria-hidden="true"></i></button>
      </article>`
    }
    function paintLanes() {
      tools.hidden = !S.model
      if (!S.model && S.phase === 'failed') { lanesEl.innerHTML = ''; return }
      if (!S.model || S.phase === 'scan') { lanesEl.innerHTML = `<div class="db-skel">${'<i></i>'.repeat(5)}</div>`; return }
      let html = '', shownAny = false
      for (const l of LANE_ORDER) {
        const list = laneList(items(), S.verdicts, l, { q: S.q, layer: S.layer, nameOf })
        if (!list.length) continue
        shownAny = true
        const collapsed = l === 'kept' && !S.keptOpen && !S.q
        const bulk = l !== 'kept' ? `<span class="db-bulk"><button type="button" data-act="lane-all" data-lane="${l}">${esc(T('all'))}</button><button type="button" data-act="lane-none" data-lane="${l}">${esc(T('none'))}</button></span>` : `<button type="button" class="db-toggle" data-act="kept-toggle" aria-expanded="${!collapsed}">${esc(collapsed ? T('show') : T('hide'))}</button>`
        html += `<section class="db-lane" data-lane="${l}"><header class="db-lane-h"><div><h3>${esc(T('lane_' + l))}</h3><p>${esc(T('laneSub_' + l))}</p></div><div class="db-lane-r"><span class="db-lane-n">${esc(T('nItems', { n: list.length }))}</span>${bulk}</div></header>${collapsed ? '' : `<div class="db-cards">${list.map(it => card(it, S.verdicts[it.id])).join('')}</div>`}</section>`
      }
      const done = items().filter(i => i.state === 'off').length
      if (!shownAny) html += `<p class="db-empty">${esc(S.q || S.layer !== 'all' ? T('noMatch') : T('nothingHere'))}</p>`
      if (done) html += `<p class="db-clean-n"><i class="fa fa-circle-check" aria-hidden="true"></i>${esc(T('alreadyOff', { n: done }))}</p>`
      lanesEl.innerHTML = html
    }
    function refreshSelectionUi() {
      lanesEl.querySelectorAll('.db-card').forEach(card => { const on = S.sel.has(card.dataset.id); card.classList.toggle('on', on); const cb = card.querySelector('input[data-sel]'); if (cb) cb.checked = on })
      paintVerdict(); paintChatter()
    }

    // ── events ──
    lanesEl.addEventListener('change', e => {
      const cb = e.target.closest('input[data-sel]'); if (!cb) return
      if (cb.checked) S.sel.add(cb.dataset.sel); else S.sel.delete(cb.dataset.sel)
      refreshSelectionUi()
    })
    lanesEl.addEventListener('click', e => {
      const x = e.target.closest('[data-act]'); if (!x) return
      const card = x.closest('.db-card'), act = x.dataset.act
      if (act === 'expand' && card) { const id = card.dataset.id; if (S.open.has(id)) S.open.delete(id); else S.open.add(id); card.classList.toggle('open', S.open.has(id)); x.setAttribute('aria-expanded', String(S.open.has(id))) }
      if (act === 'unlock' && card) { S.unlocked.add(card.dataset.id); reclassify() }
      if (act === 'kept-toggle') { S.keptOpen = !S.keptOpen; paintLanes() }
      if (act === 'lane-all' || act === 'lane-none') {
        const list = laneList(items(), S.verdicts, x.dataset.lane, { q: S.q, layer: S.layer, nameOf })
        for (const it of list) { if (act === 'lane-all') S.sel.add(it.id); else S.sel.delete(it.id) }
        refreshSelectionUi()
      }
    })
    lanesEl.addEventListener('mouseover', e => { const card = e.target.closest('.db-card'); highlight(card ? card.dataset.l : null) })
    lanesEl.addEventListener('mouseleave', () => highlight(null))
    verdict.addEventListener('click', e => {
      const x = e.target.closest('[data-act]'); if (!x || x.disabled) return
      if (x.dataset.act === 'clean' && !(root.JylliWorld && root.JylliWorld.holdToApply && root.JylliWorld.holdToApply())) start()
      if (x.dataset.act === 'stop') { x.disabled = true; root.api.debloat2Abort() }
      if (x.dataset.act === 'scan') doScan({})
    })

    // ── scan ──
    function showFound(keepPhase) {
      const t = totals()
      core.state('ready'); core.label(T('removable'))
      const lv2 = {}; for (const l of LAYERS) lv2[l] = t.layers[l].count
      core.groups(lv2); core.value(t.all.count)
      if (!keepPhase) S.phase = 'ready'
      paintAll()
    }
    function paintAll() { paintBanner(); paintVerdict(); paintChatter(); paintIntents(); paintTools(); paintLanes(); paintGuard() }
    async function doScan(o) {
      if (S.disposed || S.phase === 'running') return
      const quiet = !!(o && o.quiet)
      if (!quiet) { S.phase = 'scan'; S.receipt = null; receiptSlot.innerHTML = ''; core.state('scan'); core.label(T('scanning')); core.groups({}); core.empty(); paintVerdict(); paintLanes(); paintChatter(); paintBanner() }
      let res
      try { res = await root.api.debloat2Scan() } catch (e) { res = null }
      if (S.disposed) return
      if (!res || !res.ok) { if (quiet) return; S.phase = 'failed'; core.state('idle'); core.label(T('failedLbl')); core.empty(); paintVerdict(); paintLanes(); return }
      S.model = res.model; S.drift = res.drift || []
      const p = res.prefs || {}
      S.auto = CL().autoIntents(S.model.facts)
      S.intents = p.intents || S.auto; S.shield = p.shield !== false; S.deprovision = p.deprovision !== false; S.guard = p.guard || { mode: 'off' }
      const before = S.sel
      classifyNow()
      S.sel = quiet ? new Set([...before].filter(id => S.verdicts[id] && S.verdicts[id].present && S.verdicts[id].lane !== 'kept')) : CL().defaultSelection(S.verdicts)
      if (quiet && S.phase === 'done') { paintBanner(); paintChatter(); paintTools(); paintLanes(); paintGuard(); return }
      showFound()
    }

    // ── run ──
    async function start(idsIn, o = {}) {
      if (S.phase === 'running' || !S.model) return
      const ids = idsIn || sel()
      if (!ids.length) return
      const chosen = new Set(ids)
      if (!o.skipConfirm && needsConfirm(items(), S.verdicts, chosen)) {
        const counts = LAYERS.map(l => [l, items().filter(i => chosen.has(i.id) && i.layer === l).length]).filter(x => x[1])
        const body = `<div class="db-confirm">${counts.map(([l, n]) => `<div><b>${n}</b> ${esc(T('layer_' + l).toLowerCase())}</div>`).join('')}</div><p>${esc(T('confirmBody'))}</p>${items().some(i => chosen.has(i.id) && i.kind === 'appx') ? `<p>${esc(S.deprovision ? T('confirmStore') : T('confirmOffline'))}</p>` : ''}`
        try { await root.showConfirm({ title: T('confirmTitle', { n: ids.length }), body, okText: T('removeBtn', { n: ids.length }), okStyle: 'danger', icon: 'fa-broom' }) } catch (e) { return }
      }
      S.phase = 'running'; S.runTotal = ids.length; S.removed = 0; S.rpMsg = false
      S.remain = {}; for (const l of LAYERS) S.remain[l] = items().filter(i => chosen.has(i.id) && i.layer === l).length
      core.state('run'); core.label(T('removedSoFar')); core.groups(S.remain); core.value(0)
      paintBanner(); paintVerdict()
      lanesEl.querySelectorAll('.db-card').forEach(card => { const q = chosen.has(card.dataset.id); card.classList.toggle('queued', q); card.classList.toggle('dim', !q); const cb = card.querySelector('input'); if (cb) cb.disabled = true })
      const unsub = root.api.onDebloat2Progress(p => {
        if (p.kind !== 'run' || S.disposed) return
        if (p.phase === 'rp') { S.rpMsg = true; paintVerdict(); return }
        const card = lanesEl.querySelector(`.db-card[data-id="${CSS.escape(p.id)}"]`)
        if (p.phase === 'start') { if (S.rpMsg) { S.rpMsg = false; paintVerdict() } if (card) { card.classList.remove('queued'); card.classList.add('running'); card.scrollIntoView({ block: 'nearest', behavior: still() ? 'auto' : 'smooth' }) } }
        if (p.phase === 'done') {
          const it = byId(p.id)
          if (p.ok) { S.removed++; core.value(S.removed); core.ripple(); if (it) { S.remain[it.layer] = Math.max(0, (S.remain[it.layer] || 0) - 1); core.groups(S.remain) } }
          if (card) {
            card.classList.remove('running'); card.classList.add(p.ok ? 'done' : 'failed')
            card.querySelector('[data-state]').innerHTML = p.ok ? `<i class="fa fa-check" aria-hidden="true"></i>${esc(T('itemDone'))}${p.restart ? `<em>${esc(T('restartNeeded'))}</em>` : ''}` : `<i class="fa fa-triangle-exclamation" aria-hidden="true"></i>${esc(T('itemFailed'))}`
          }
          paintVerdict()
        }
      })
      let out = null
      try { out = await root.api.debloat2Run({ ids, deprovision: S.deprovision, restorePoint: o.skipRp ? 'skip' : 'auto' }) } catch (e) { out = null }
      unsub()
      if (S.disposed) return
      if (!out || !out.ok) {
        S.phase = 'ready'
        if (out && out.aborted) {
          paintAll()
          let go = false
          try { await root.showConfirm({ title: T('rpFailTitle'), body: `${esc(T('rpFailBody'))}${out.guidance ? `<p>${esc(out.guidance)}</p>` : ''}`, okText: T('rpFailGo'), okStyle: 'danger', icon: 'fa-shield-halved' }); go = true } catch (e) { /* stay */ }
          if (go) start(ids, { skipRp: true, skipConfirm: true })
          return
        }
        try { root.toast('', T('runFailed'), 'warn', 4000) } catch (e) { /* ignore */ }
        doScan({}); return
      }
      S.receipt = out.receipt; S.drift = out.drift || []; S.phase = 'done'
      const okN = out.receipt.rows.filter(x => x.ok).length
      core.state('done'); core.label(T('removed')); core.value(okN); core.ripple()
      paintVerdict(); paintReceipt()
      doScan({ quiet: true })
    }

    // ── receipt ──
    function delta(pair, f) { if (!pair) return ''; const [b, a] = pair; return `${f(b)} → ${f(a)}` }
    function paintReceipt() {
      const r = S.receipt; if (!r) { receiptSlot.innerHTML = ''; return }
      const okN = r.rows.filter(x => x.ok).length
      const layerLine = LAYERS.filter(l => r.counts[l]).map(l => `${r.counts[l]} ${T('layer_' + l).toLowerCase()}`).join(' · ')
      const d = r.delta
      const meta = d ? `<div><span>${esc(T('stRam'))}</span><b>${esc(delta(d.ram, fmt))}</b></div><div><span>${esc(T('stDisk'))}</span><b>${esc(delta(d.disk, fmt))}</b></div><div><span>${esc(T('stWakes'))}</span><b>${esc(delta(d.wakes, String))}</b></div>` : ''
      receiptSlot.innerHTML = `<section class="db-receipt"><header><div><span class="db-r-k">${esc(T('rTitle'))}</span><div class="db-r-big"><b>${okN}</b><small>${esc(layerLine)}</small></div></div>
          <div class="db-r-meta">${meta}<div><span>${esc(T('rTime'))}</span><b>${esc((r.ms / 1000).toFixed(1))} s</b></div>${r.aborted ? `<div><span></span><b>${esc(T('rStopped'))}</b></div>` : ''}</div></header>
        <ul class="db-r-rows">${r.rows.map(x => `<li class="${x.ok ? '' : 'bad'}"><span>${esc(nameOf(x.id))}${x.error ? `<em>${esc(x.error)}</em>` : ''}${x.restart ? `<em>${esc(T('restartNeeded'))}</em>` : ''}</span><b>${esc(x.ok ? T('itemDone') : T('itemFailed'))}</b></li>`).join('')}</ul>
        ${r.restorePoint && r.restorePoint.ok ? `<p class="db-r-note"><i class="fa fa-shield-halved" aria-hidden="true"></i>${esc(T('rRp'))}</p>` : ''}
        <p class="db-r-note">${esc(T('rUndoNote'))}</p>
        <footer><button type="button" class="db-sec" data-r="undo"><i class="fa fa-rotate-left" aria-hidden="true"></i><span>${esc(T('rUndo'))}</span></button>
          <button type="button" class="db-sec" data-r="share"><i class="fa fa-image" aria-hidden="true"></i><span>${esc(T('rShare'))}</span></button>
          <button type="button" class="db-cta" data-r="done"><i class="fa fa-check" aria-hidden="true"></i><span>${esc(T('rDone'))}</span></button></footer></section>`
      if (!still()) receiptSlot.firstElementChild.classList.add('enter')
    }
    receiptSlot.addEventListener('click', async e => {
      const b = e.target.closest('[data-r]'); if (!b) return
      if (b.dataset.r === 'done') { S.receipt = null; S.phase = 'ready'; receiptSlot.innerHTML = ''; if (S.model) showFound() }
      if (b.dataset.r === 'share' && S.receipt) shareImage(S.receipt)
      if (b.dataset.r === 'undo' && S.receipt) {
        b.disabled = true
        const r = await root.api.debloat2Undo({ batchId: S.receipt.batchId })
        ctx.toast('', r && r.ok ? T('undone', { n: (r.ids || []).length }) : T('undoFailed'), r && r.ok ? 'ok' : 'warn', 4000)
        S.receipt = null; receiptSlot.innerHTML = ''; S.phase = 'ready'; doScan({})
      }
    })
    function shareImage(r) {
      const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 630
      const x = cv.getContext('2d'), cs = getComputedStyle(document.documentElement)
      const tok = n => cs.getPropertyValue(n).trim(), accent = tok('--c-accent'), ink = tok('--c-text-primary')
      const g = x.createLinearGradient(0, 0, 1200, 630); g.addColorStop(0, tok('--c-bg-base')); g.addColorStop(1, tok('--c-bg-raised'))
      x.fillStyle = g; x.fillRect(0, 0, 1200, 630)
      x.strokeStyle = accent; x.globalAlpha = 0.9; x.lineWidth = 18; x.beginPath(); x.arc(930, 315, 190, -Math.PI / 2, Math.PI * 1.5); x.stroke(); x.globalAlpha = 1
      const n = r.rows.filter(z => z.ok).length
      x.fillStyle = ink; x.font = '600 34px sans-serif'; x.fillText(T('shareTitle'), 80, 130)
      x.font = '700 170px sans-serif'; x.fillStyle = accent; x.fillText(String(n), 80, 330)
      x.font = '400 30px sans-serif'; x.fillStyle = 'rgba(237,237,240,0.72)'
      x.fillText(T('shareLine', { n, s: (r.ms / 1000).toFixed(1) }), 80, 400)
      if (r.delta) x.fillText(`${T('stRam')}: ${fmt(r.delta.ram[0])} → ${fmt(r.delta.ram[1])}`, 80, 450)
      x.font = '600 28px sans-serif'; x.fillStyle = ink; x.fillText('Jylli Tool', 80, 560)
      cv.toBlob(b => { if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'jylli-debloat.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000) }, 'image/png')
    }

    // ── guard ──
    function paintGuard() {
      const prem = !!(root.settings && root.settings.isPremium)
      const modes = ['off', 'update', 'quiet']
      guardSlot.innerHTML = `<section class="db-guard${prem ? '' : ' locked'}"><div class="db-guard-t"><span class="db-guard-ico"><i class="fa fa-shield-halved" aria-hidden="true"></i></span>
        <div><h3>${esc(T('guardTitle'))}${prem ? '' : `<span class="db-prem">${esc(T('premium'))}</span>`}</h3><p>${esc(T('guardSub'))}</p></div></div>
        <div class="db-guard-c">${prem ? `<div class="j-seg tk-seg jk" role="tablist">${modes.map(k => `<button type="button" class="j-seg-item${S.guard.mode === k ? ' j-seg-active' : ''}" data-mode="${k}" role="tab" aria-selected="${S.guard.mode === k}"><span>${esc(T('guard_' + k))}</span></button>`).join('')}</div>`
          : `<span class="db-guard-free">${esc(T('guardFree'))}</span><button type="button" class="db-sec" data-unlock><i class="fa fa-unlock" aria-hidden="true"></i><span>${esc(T('unlockGuard'))}</span></button>`}</div></section>`
    }
    guardSlot.addEventListener('click', async e => {
      const u = e.target.closest('[data-unlock]'); if (u) { try { root.premiumStoreAction().run() } catch (x) { /* ignore */ } return }
      const b = e.target.closest('[data-mode]'); if (!b) return
      const r = await root.api.debloat2GuardSet(b.dataset.mode)
      if (r && r.ok) { S.guard = r.guard; paintGuard(); ctx.toast('', T('guardSaved'), 'ok', 2500) }
    })

    // ── start ──
    paintVerdict(); paintLanes(); paintGuard()
    show(view)
    doScan({})
    if (root.registerPageCleanup) root.registerPageCleanup('debloater', () => { S.disposed = true; core.destroy() })
    return { rescan: () => doScan({}), state: S }
  }
  api.mount = mount
})(typeof window !== 'undefined' ? window : globalThis)
