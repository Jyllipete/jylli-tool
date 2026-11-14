'use strict'
// Competitive Mode panel (top of the Games tab): pick one game, choose what to change for the session, press Start.
// The engine is lib/compete (main.js `// ─── Competitive Mode`); the pure parts are in js/compete/pure.js. Premium rows lock inline.
;(function (root) {
  const U = root.JylliCompetePure
  const T = (k, v) => tG('compete', k, v)
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

  function mount(host) {
    const st = { games: [], selected: null, opts: U.normalize(), session: { state: 'idle' }, ended: null, premium: false, cores: { kinds: [], logical: 0, cpus: [] }, showOpts: false, query: '', open: false, hi: 0, saved: {}, error: null }
    const offs = []
    host.innerHTML = ''
    const sec = document.createElement('section')
    sec.className = 'cp'; sec.id = 'cp-root'
    host.appendChild(sec)

    const busy = () => st.session.state !== 'idle'
    const gameById = id => st.games.find(g => g.id === id) || null
    const optsFor = id => U.normalize(Object.assign({}, st.saved[id] || {}))

    function badge(store) { return `<span class="cp-badge">${esc(U.STORES[store] || store)}</span>` }

    function rowHtml(r) {
      const o = st.opts, locked = r.premium && !st.premium, dis = busy() || locked
      const b = busy() ? U.badgeFor(r.id, st.session.steps) : null
      let ctl = ''
      if (r.kind === 'check') ctl = `<input type="checkbox" class="cp-check" data-opt="${r.id}" ${o[r.id] ? 'checked' : ''} ${dis ? 'disabled' : ''} aria-label="${esc(T('o_' + r.id))}">`
      else if (r.id === 'priority') ctl = `<select class="cp-sel" data-opt="priority" ${dis ? 'disabled' : ''} aria-label="${esc(T('o_priority'))}">${['normal', 'above', 'high'].map(v => `<option value="${v}" ${o.priority === v ? 'selected' : ''}>${esc(T('p_' + v))}</option>`).join('')}</select>`
      else if (r.id === 'cores') ctl = `<select class="cp-sel" data-opt="cores" ${dis ? 'disabled' : ''} aria-label="${esc(T('o_cores'))}">${U.coreChoices(st.cores).map(v => `<option value="${v}" ${o.cores === v ? 'selected' : ''}>${esc(T('c_' + v))}</option>`).join('')}</select>`
      let tag = ''
      if (locked) tag = `<span class="cp-tag cp-tag-lock"><i class="fa fa-lock" aria-hidden="true"></i> ${esc(T('premium'))}</span>`
      if (b) tag = b.kind === 'ok' ? `<span class="cp-tag cp-tag-ok"><i class="fa fa-check" aria-hidden="true"></i> ${esc(T('s_ok'))}</span>`
        : b.kind === 'skip' ? `<span class="cp-tag cp-tag-skip" title="${esc(T('r_' + b.reason))}">${esc(T('r_' + b.reason))}</span>`
        : `<span class="cp-tag cp-tag-lock"><i class="fa fa-lock" aria-hidden="true"></i> ${esc(T('s_lock'))}</span>`
      const grid = r.id === 'cores' && o.cores === 'custom' && !locked ? customGrid(dis) : ''
      return `<div class="cp-row${locked ? ' cp-locked' : ''}" data-row="${r.id}"${locked ? ` title="${esc(T('locked'))}" tabindex="0" role="button"` : ''}>
        <label class="cp-lab"><span class="cp-name">${esc(T('o_' + r.id))}</span><span class="cp-help">${esc(T('h_' + r.id))}</span></label>
        <span class="cp-ctl">${tag}${ctl}</span>${grid}</div>`
    }

    function customGrid(dis) {
      const sel = new Set(st.opts.customCpus)
      const btn = (k) => `<button type="button" class="cp-mini" data-preset="${k}" ${dis ? 'disabled' : ''}>${esc(T('cu_' + k))}</button>`
      const cells = st.cores.cpus.map(c => `<label class="cp-cell"><input type="checkbox" data-cpu="${c.n}" ${sel.has(c.n) ? 'checked' : ''} ${dis ? 'disabled' : ''}> ${esc(T('cu_cpu', { n: c.n }))}${c.smt ? ` <span class="cp-t" title="${esc(T('cu_thread'))}">(T)</span>` : ''}</label>`).join('')
      return `<div class="cp-grid"><div class="cp-presets">${['all', 'none', 'smtOn', 'smtOff'].map(btn).join('')}</div><div class="cp-cells">${cells}</div>${sel.size < 4 ? `<p class="cp-hint">${esc(T('cu_hint'))}</p>` : ''}</div>`
    }

    function listHtml() {
      const list = U.filterGames(st.games, st.query)
      if (!list.length) return `<div class="cp-empty">${esc(T('none'))}</div>`
      return list.map((g, i) => `<div class="cp-opt${i === st.hi ? ' cp-hi' : ''}" role="option" data-id="${esc(g.id)}" aria-selected="${g.id === st.selected}">${esc(g.name)} ${badge(g.source)}</div>`).join('')
    }

    function render() {
      const sel = gameById(st.selected)
      const status = U.statusFor(st.session, st.games.length, st.ended)
      const shown = busy() ? (st.session.name || '') : (sel ? sel.name : '')
      sec.innerHTML = `
        <h3 class="cp-title">${esc(T('title'))}</h3>
        <div class="cp-card">
          <div class="cp-top">
            <div class="cp-combo">
              <input class="cp-input" id="cp-input" type="text" role="combobox" aria-expanded="${st.open}" aria-controls="cp-list" autocomplete="off" spellcheck="false" ${busy() ? 'disabled' : ''}
                placeholder="${esc(T('pick'))}" value="${esc(st.open ? st.query : shown)}" aria-label="${esc(T('search'))}">
              ${!st.open && sel && !busy() ? `<span class="cp-sel-badge">${badge(sel.source)}</span>` : ''}
              <button type="button" class="cp-caret" id="cp-caret" tabindex="-1" aria-hidden="true" ${busy() ? 'disabled' : ''}><i class="fa fa-chevron-down"></i></button>
              <div class="cp-list" id="cp-list" role="listbox" ${st.open ? '' : 'hidden'}>${st.open ? listHtml() : ''}</div>
            </div>
            <button type="button" class="cp-btn" id="cp-browse" ${busy() ? 'disabled' : ''}>${esc(T('browse'))}</button>
            <button type="button" class="cp-btn cp-go${busy() ? ' cp-stop' : ''}" id="cp-go" ${!busy() && !sel ? 'disabled' : ''}>${esc(busy() ? T(st.session.state === 'ending' ? 'ending' : 'stop') : T('start'))}</button>
          </div>
          <div class="cp-sub">
            <span class="cp-status${st.error ? ' cp-err' : ''}" role="status">${st.error ? esc(T(st.error)) : (!busy() && !st.ended && !st.games.length ? '' : `<i class="fa fa-check-circle cp-ok" aria-hidden="true"></i> `) + esc(T(status.key, status.vars))}</span>
            ${st.ended && st.ended.applied ? `<a href="#" class="cp-link" id="cp-hist">${esc(T('history'))}</a>` : ''}
            <span class="cp-actions">
              <button type="button" class="cp-ghost" id="cp-shortcut" ${!sel || busy() ? 'disabled' : ''} ${!st.premium ? `title="${esc(T('locked'))}"` : ''}><i class="fa fa-up-right-from-square" aria-hidden="true"></i> ${esc(T('shortcut'))}${!st.premium ? ' <i class="fa fa-lock" aria-hidden="true"></i>' : ''}</button>
              <button type="button" class="cp-ghost" id="cp-rescan" ${busy() ? 'disabled' : ''}><i class="fa fa-rotate" aria-hidden="true"></i> ${esc(T('rescan'))}</button>
              <button type="button" class="cp-ghost" id="cp-toggle" aria-expanded="${st.showOpts}"><i class="fa fa-gear" aria-hidden="true"></i> ${esc(T(st.showOpts ? 'hideOpts' : 'showOpts'))}</button>
            </span>
          </div>
        </div>
        <div class="cp-opts" id="cp-opts" ${st.showOpts || busy() ? '' : 'hidden'}>
          <p class="cp-note">${esc(T('note'))}</p>
          ${U.GROUPS.map(g => `<div class="cp-group"><h4>${esc(T('g_' + g.id))}</h4>${g.rows.map(rowHtml).join('')}</div>`).join('')}
        </div>`
      wire()
    }

    function choose(id) {
      st.selected = id; st.open = false; st.query = ''; st.error = null
      st.opts = optsFor(id)
      render()
    }

    function wire() {
      const $ = s => sec.querySelector(s)
      const input = $('#cp-input')
      if (input) {
        input.onfocus = () => { if (!busy() && !st.open) { st.open = true; st.query = ''; st.hi = 0; render(); const i = $('#cp-input'); if (i) i.focus() } }
        input.oninput = () => { st.query = input.value; st.hi = 0; const l = $('#cp-list'); if (l) { l.hidden = false; l.innerHTML = listHtml() } wireList() }
        input.onkeydown = e => {
          const n = U.filterGames(st.games, st.query).length
          if (e.key === 'ArrowDown') { e.preventDefault(); st.hi = Math.min(n - 1, st.hi + 1); refreshList() }
          else if (e.key === 'ArrowUp') { e.preventDefault(); st.hi = Math.max(0, st.hi - 1); refreshList() }
          else if (e.key === 'Enter') { const g = U.filterGames(st.games, st.query)[st.hi]; if (g) { e.preventDefault(); choose(g.id) } }
          else if (e.key === 'Escape') { st.open = false; render() }
        }
        input.onblur = () => setTimeout(() => { if (st.open && !sec.contains(document.activeElement)) { st.open = false; render() } }, 120)
      }
      const caret = $('#cp-caret'); if (caret) caret.onmousedown = e => { e.preventDefault(); if (busy()) return; st.open = !st.open; st.query = ''; st.hi = 0; render(); if (st.open) { const i = $('#cp-input'); if (i) i.focus() } }
      wireList()
      const go = $('#cp-go'); if (go) go.onclick = () => (busy() ? stop() : start())
      const br = $('#cp-browse'); if (br) br.onclick = async () => {
        const r = await api.competeBrowse().catch(() => null)
        if (!r || !r.ok) return
        if (!gameById(r.id)) st.games.unshift({ id: r.id, name: r.name, source: 'custom' })
        choose(r.id)
      }
      const rs = $('#cp-rescan'); if (rs) rs.onclick = () => load(true)
      const tg = $('#cp-toggle'); if (tg) tg.onclick = () => { st.showOpts = !st.showOpts; render() }
      const sc = $('#cp-shortcut'); if (sc) sc.onclick = async () => {
        if (!st.premium) { JylliPremium.open(); return }
        const r = await api.competeShortcut(st.selected).catch(() => null)
        toast(T('title'), r && r.ok ? T('shortcutDone') : T('shortcutFail'), r && r.ok ? 'ok' : 'warn')
      }
      const hi = $('#cp-hist'); if (hi) hi.onclick = e => { e.preventDefault(); showPage('changelog') }
      sec.querySelectorAll('[data-row].cp-locked').forEach(r => { r.onclick = () => JylliPremium.open(); r.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); JylliPremium.open() } } })
      sec.querySelectorAll('input[data-opt]').forEach(i => { i.onchange = () => { st.opts[i.dataset.opt] = i.checked; remember() } })
      sec.querySelectorAll('select[data-opt]').forEach(s => { s.onchange = () => { st.opts[s.dataset.opt] = s.value; remember(); if (s.dataset.opt === 'cores') render() } })
      sec.querySelectorAll('input[data-cpu]').forEach(i => { i.onchange = () => {
        const set = new Set(st.opts.customCpus); i.checked ? set.add(Number(i.dataset.cpu)) : set.delete(Number(i.dataset.cpu))
        st.opts.customCpus = [...set].sort((a, b) => a - b); remember(); render() } })
      sec.querySelectorAll('[data-preset]').forEach(b => { b.onclick = () => { st.opts.customCpus = U.presetCpus(b.dataset.preset, st.cores.cpus); remember(); render() } })
    }
    function wireList() {
      sec.querySelectorAll('.cp-opt').forEach(el => { el.onmousedown = e => { e.preventDefault(); choose(el.dataset.id) } })
    }
    function refreshList() { const l = sec.querySelector('#cp-list'); if (l) { l.innerHTML = listHtml(); wireList(); const h = l.querySelector('.cp-hi'); if (h && h.scrollIntoView) h.scrollIntoView({ block: 'nearest' }) } }
    function remember() { if (st.selected) st.saved[st.selected] = Object.assign({}, st.opts) }

    async function start() {
      if (!st.selected || busy()) return
      st.error = null; st.ended = null
      st.session = { state: 'waiting', name: (gameById(st.selected) || {}).name }
      render()
      const r = await api.competeStart({ gameId: st.selected, opts: U.requestOpts(st.opts) }).catch(() => ({ ok: false, error: 'launch-failed' }))
      if (!r || !r.ok) {
        st.session = { state: 'idle' }
        st.error = { busy: 'e_busy', 'unknown-game': 'e_unknown', 'cannot-launch': 'e_cannot' }[r && r.error] || 'e_launch'
        render()
      }
    }
    async function stop() { st.session = Object.assign({}, st.session, { state: 'ending' }); render(); await api.competeStop().catch(() => {}) }

    async function load(refresh) {
      const [g, s] = await Promise.all([api.competeGames({ refresh: !!refresh }).catch(() => null), api.competeState().catch(() => null)])
      if (g && g.ok) { const keep = st.games.filter(x => x.source === 'custom' && !g.games.some(y => y.id === x.id)); st.games = g.games.concat(keep) }
      if (s) { st.premium = !!s.premium; st.cores = s.cores || st.cores; st.saved = s.opts || {}; st.session = s.state && s.state !== 'idle' ? s : { state: 'idle' }
        if (!st.selected) { const pick = (s.last && st.games.some(x => x.id === s.last)) ? s.last : null; if (pick) { st.selected = pick; st.opts = optsFor(pick) } } }
      if (st.session.state !== 'idle' && st.session.gameId) st.selected = st.session.gameId
      render()
    }

    offs.push(api.onCompeteState(s => { st.session = s && s.state ? s : { state: 'idle' }; if (st.session.state !== 'idle') st.ended = null; render() }))
    offs.push(api.onCompeteEnded(r => { st.ended = r; render() }))
    render(); load(false)
    /** The Games tab hands a game over: select it here and bring the panel into view. */
    function select(id) {
      if (busy() || !id) return
      if (!gameById(id) && String(id).startsWith('custom:')) st.games.unshift({ id, name: String(id).slice(7).split(/[\\/]/).pop().replace(/\.exe$/i, ''), source: 'custom' })
      if (!gameById(id)) return
      choose(id)
      try { sec.scrollIntoView({ block: 'start', behavior: 'smooth' }) } catch {}
    }
    return { destroy() { offs.forEach(f => { try { typeof f === 'function' && f() } catch {} }) }, select }
  }

  const api2 = { mount }
  root.JylliCompetePage = api2
  if (typeof module !== 'undefined' && module.exports) module.exports = api2
})(typeof window !== 'undefined' ? window : globalThis)
