'use strict'
// Game settings sheet (Games tab, lib/gameconfig). One panel per game: the rows that really exist in the game's own file, grouped by
// Display / Graphics / Performance, your pending edits, "Jylli recommends" where the effect is understood, a Review step that shows the
// exact before/after, and Apply. Nothing is written until Apply, and never while the game runs. Pure helpers are exported for node tests.
;(function (root) {
  const GROUPS = ['all', 'display', 'graphics', 'performance']

  // ── pure ──
  /** Pending edits that differ from the file: { key: value }. A value equal to the current one is no edit. */
  function pendingChanges(rows, pending) {
    const out = {}
    for (const r of rows) {
      if (!Object.prototype.hasOwnProperty.call(pending, r.key)) continue
      const v = String(pending[r.key])
      const same = r.type === 'int' ? Number(v) === Number(r.current) : v.toLowerCase() === String(r.current).toLowerCase()
      if (!same) out[r.key] = v
    }
    return out
  }
  /** The recommended values that are not set yet: { key: value }. */
  const recommended = rows => { const o = {}; for (const r of rows) if (r.rec != null && r.recOpen) o[r.key] = r.rec; return o }
  /** Group tabs that have rows, in fixed order. */
  const tabsFor = rows => GROUPS.filter(g => g === 'all' || rows.some(r => r.group === g))
  /** Last part of a key shown when no label exists ("setting.mat_vsync" -> "mat vsync"). */
  const nameOf = key => String(key).split('|').pop().replace(/^setting\./, '').replace(/^sg\./, '').replace(/^videocfg_/, '').replace(/^b(?=[A-Z])/, '').replace(/[_.]/g, ' ')

  const api = { GROUPS, pendingChanges, recommended, tabsFor, nameOf }
  root.JylliGameCfg = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  // ── DOM ──
  const esc = s => (typeof escHtml === 'function' ? escHtml(s) : String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])))
  const T = (k, v) => (typeof tG === 'function' ? tG('gamecfg', k, v) : k)
  const A = () => root.api
  const hasKey = k => { try { return typeof LANG !== 'undefined' && LANG[(root.settings && root.settings.language) || 'en'] && LANG[(root.settings && root.settings.language) || 'en'].gamecfg && (k in LANG[(root.settings && root.settings.language) || 'en'].gamecfg) } catch { return false } }
  const label = key => { const id = 'k_' + String(key).split('|').pop().replace(/[^\w]/g, '_'); return hasKey(id) ? T(id) : nameOf(key) }

  const mounts = new Map()   // host element -> state

  async function mount(host, id) {
    if (!host || !A() || !A().gamecfgRead) return
    const S = { host, id, rows: [], pending: {}, tab: 'all', view: 'edit', review: null, running: false, file: '', busy: false }
    mounts.set(host, S)
    host.className = 'gc'
    host.innerHTML = `<p class="gc-muted">${esc(T('loading'))}</p>`
    await load(S)
  }

  async function load(S) {
    const r = await A().gamecfgRead({ id: S.id }).catch(() => null)
    if (!S.host.isConnected) return
    if (!r || r.reason === 'premium_required') { S.host.innerHTML = ''; return }
    if (!r.ok) { S.host.innerHTML = `<div class="gc-head"><b>${esc(T('title'))}</b></div><p class="gc-muted">${esc(r.error === 'no-file' ? T('noFile') : T('readFail'))}</p>`; return }
    S.rows = r.rows; S.running = !!r.running; S.file = r.file; S.launchable = !!r.launchable; S.name = r.name
    S.pending = {}; S.view = 'edit'; S.review = null
    if (!tabsFor(S.rows).includes(S.tab)) S.tab = 'all'
    draw(S)
  }

  function control(S, r) {
    const cur = Object.prototype.hasOwnProperty.call(S.pending, r.key) ? S.pending[r.key] : r.current
    const k = esc(r.key)
    if (r.type === 'int') return `<input class="gc-in" type="number" data-key="${k}" min="${r.min}" max="${r.max}" value="${esc(String(Number(cur)))}" aria-label="${esc(label(r.key))}">`
    const vals = r.values || []
    if (r.type !== 'choice' || vals.length <= 6) {
      return `<div class="gc-seg" role="group" aria-label="${esc(label(r.key))}">` + vals.map(v => {
        const on = String(v.value).toLowerCase() === String(cur).toLowerCase()
        const lbl = v.label === 'on' ? T('on') : v.label === 'off' ? T('off') : v.label
        return `<button type="button" class="gc-opt" data-key="${k}" data-val="${esc(v.value)}" aria-pressed="${on}">${esc(lbl)}</button>`
      }).join('') + '</div>'
    }
    return `<select class="gc-in" data-key="${k}">${vals.map(v => `<option value="${esc(v.value)}"${String(v.value) === String(cur) ? ' selected' : ''}>${esc(v.label)}</option>`).join('')}</select>`
  }

  function draw(S) {
    const ch = pendingChanges(S.rows, S.pending), n = Object.keys(ch).length
    const rec = Object.keys(recommended(S.rows)).length
    const tabs = tabsFor(S.rows)
    const rows = S.rows.filter(r => S.tab === 'all' || r.group === S.tab)
    const groupHead = g => `<div class="gc-grp">${esc(T('g_' + g))}</div>`
    let body = ''
    if (S.view === 'review' && S.review) {
      body = `<div class="gc-review"><div class="gc-grp">${esc(T('reviewTitle'))}</div>` + (S.review.changed.length
        ? S.review.changed.map(c => `<div class="gc-diff"><span>${esc(label(c.key))}</span><span class="gc-mono"><s>${esc(c.from)}</s> → <b>${esc(c.to)}</b></span></div>`).join('')
        : `<p class="gc-muted">${esc(T('reviewNone'))}</p>`) +
        (S.review.missing && S.review.missing.length ? `<p class="gc-muted">${esc(T('reviewMissing', { n: S.review.missing.length }))}</p>` : '') + '</div>'
    } else if (!rows.length) {
      body = `<p class="gc-muted">${esc(T('noRows'))}</p>`
    } else {
      let last = null
      for (const r of rows) {
        if (S.tab === 'all' && r.group !== last) { body += groupHead(r.group); last = r.group }
        const edited = Object.prototype.hasOwnProperty.call(ch, r.key)
        const recLine = r.rec != null ? `<span class="gc-rec${r.recOpen ? '' : ' gc-rec-ok'}">${esc(r.recOpen ? T('recommends', { v: recText(r) }) : T('recSet'))}${r.why ? ' · ' + esc(T('why_' + r.why)) : ''}</span>` : ''
        body += `<div class="gc-row${edited ? ' gc-edited' : ''}"><div class="gc-name">${esc(label(r.key))}${recLine}</div>${control(S, r)}</div>`
      }
    }
    const busy = S.busy ? ' disabled' : ''
    const canApply = !S.running && !S.busy
    S.host.innerHTML = `
      <div class="gc-head"><b>${esc(T('title'))}</b>
        <div class="gc-tools">${S.launchable ? `<button type="button" class="gc-btn" data-act="launch">${esc(T('launch'))}</button>` : ''}<button type="button" class="gc-btn" data-act="undo"${busy}>${esc(T('undo'))}</button></div></div>
      <p class="gc-file gc-mono" title="${esc(S.file)}">${esc(S.file)}</p>
      ${S.running ? `<div class="gc-warn" role="status">${esc(T('running', { name: S.name }))}</div>` : ''}
      <div class="gc-tabs" role="tablist">${tabs.map(g => `<button type="button" role="tab" class="gc-tab" aria-selected="${g === S.tab}" data-tab="${g}">${esc(T('g_' + g))}</button>`).join('')}</div>
      <div class="gc-rows">${body}</div>
      <div class="gc-foot">
        ${S.view === 'review'
          ? `<button type="button" class="gc-btn" data-act="back"${busy}>${esc(T('back'))}</button><button type="button" class="gc-btn gc-primary" data-act="apply"${canApply && S.review && S.review.changed.length ? '' : ' disabled'}>${esc(T('apply', { n: S.review ? S.review.changed.length : 0 }))}</button>`
          : `<button type="button" class="gc-btn" data-act="rec"${rec ? '' : ' disabled'}>${esc(T('applyRec', { n: rec }))}</button><button type="button" class="gc-btn gc-primary" data-act="review"${n && !S.busy ? '' : ' disabled'}>${esc(T('review', { n }))}</button>`}
      </div>`
    wire(S)
  }

  const recText = r => { const v = (r.values || []).find(x => String(x.value).toLowerCase() === String(r.rec).toLowerCase()); const l = v ? v.label : r.rec; return l === 'on' ? T('on') : l === 'off' ? T('off') : l }

  function wire(S) {
    const h = S.host
    h.querySelectorAll('.gc-tab').forEach(b => { b.onclick = () => { S.tab = b.dataset.tab; draw(S) } })
    h.querySelectorAll('.gc-opt').forEach(b => { b.onclick = () => { S.pending[b.dataset.key] = b.dataset.val; draw(S) } })
    h.querySelectorAll('.gc-in').forEach(i => { i.onchange = () => { S.pending[i.dataset.key] = i.value; draw(S) } })
    const on = (a, fn) => { const b = h.querySelector(`[data-act="${a}"]`); if (b) b.onclick = fn }
    on('rec', () => { Object.assign(S.pending, recommended(S.rows)); draw(S) })
    on('back', () => { S.view = 'edit'; draw(S) })
    on('review', async () => {
      S.busy = true; draw(S)
      const r = await A().gamecfgPreview({ id: S.id, changes: pendingChanges(S.rows, S.pending) }).catch(() => null)
      S.busy = false
      if (!r || !r.ok) { toastErr(r && r.error); draw(S); return }
      S.review = r; S.view = 'review'; draw(S)
    })
    on('apply', async () => {
      S.busy = true; draw(S)
      const r = await A().gamecfgApply({ id: S.id, changes: pendingChanges(S.rows, S.pending) }).catch(() => null)
      S.busy = false
      if (!r || !r.ok) { toastErr(r && r.error); draw(S); return }
      toast(T('applied'), T('appliedMsg', { n: r.changed.length, name: S.name }), 'ok')
      await load(S)
    })
    on('undo', async () => {
      S.busy = true; draw(S)
      const r = await A().gamecfgUndo({ id: S.id }).catch(() => null)
      S.busy = false
      if (!r || !r.ok) { toast(T('undoFail'), T('undoFailMsg'), 'err'); draw(S); return }
      toast(T('undone'), S.name, 'info')
      await load(S)
    })
    on('launch', async () => {
      const r = await A().gamecfgLaunch({ id: S.id }).catch(() => null)
      if (!r || !r.ok) toast(T('launchFail'), '', 'err')
    })
  }
  function toastErr(code) {
    const known = ['game-running', 'no-file', 'bad-value', 'out-of-range', 'verify-failed', 'write-failed', 'unknown-key']
    toast(T('errTitle'), T('err_' + (known.includes(code) ? code : 'other')), 'err')
  }

  api.mount = mount
})(typeof window !== 'undefined' ? window : globalThis)
