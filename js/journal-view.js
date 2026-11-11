'use strict'
// History > Journal: the change journal as a tree (session > batch > change) with a true before/after diff and Undo per change,
// batch or session. The pure helpers (grouping, describing a change, fidelity wording) are unit-tested.
;(function (root) {
  const VIA_KEYS = ['manual', 'stage', 'auto-opti', 'spw', 'ai', 'game-watcher', 'scheduler', 'safety-revert', 'undo']

  /** entries (newest first) -> [{ sessionId, ts, batches: [{ batchId, ts, via, entries[] }] }] in display order. */
  function group(entries) {
    const sessions = new Map()
    for (const e of entries) {
      const sid = e.sessionId || 'unknown'
      if (!sessions.has(sid)) sessions.set(sid, { sessionId: sid, ts: e.ts, batches: new Map() })
      const s = sessions.get(sid)
      const bid = e.batchId || 'single:' + e.id
      if (!s.batches.has(bid)) s.batches.set(bid, { batchId: e.batchId || null, key: bid, ts: e.ts, via: e.via, entries: [] })
      s.batches.get(bid).entries.push(e)
      s.ts = Math.max(s.ts, e.ts)
    }
    return [...sessions.values()].map(s => ({ ...s, batches: [...s.batches.values()] }))
  }

  const val = s => (!s || !s.exists ? null : Array.isArray(s.value) ? s.value.join(',') : String(s.value))

  /** One change as { label, before, after } strings; null means "did not exist". */
  function describe(c) {
    switch (c.kind) {
      case 'reg': return { label: `${(c.path || c.key || '').replace(/^Microsoft\.PowerShell\.Core\\Registry::/, '')}\\${c.name || '(default)'}`, before: val(c.before), after: val(c.after) }
      case 'service': return { label: `service ${c.name}`, before: val(c.before), after: val(c.after) }
      case 'bcd': return { label: `bcdedit ${c.name}`, before: val(c.before), after: val(c.after) }
      case 'powercfg': return { label: `power ${c.setting}${c.ac ? ' (AC)' : ' (DC)'}`, before: val(c.before), after: val(c.after) }
      case 'powercfg-active': return { label: 'active power plan', before: val(c.before), after: val(c.after) }
      case 'gpu-power-limit': return { label: 'GPU power limit', before: c.before && c.before.watts != null ? c.before.watts + ' W' : null, after: c.after && c.after.watts != null ? c.after.watts + ' W' : null }
      default: return { label: c.cmd || c.kind, before: null, after: null, unresolved: true }
    }
  }

  /** Counts for the fidelity line: how many changes can be undone exactly and how many only fall back to Windows defaults. */
  function fidelitySummary(entry) {
    const exact = entry.changes.filter(c => c.kind !== 'unresolved').length
    const unresolved = entry.changes.length - exact
    return { fidelity: entry.fidelity, exact, unresolved }
  }

  const api = { group, describe, fidelitySummary, VIA_KEYS }
  root.JylliJournalView = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  // ── DOM ───────────────────────────────────────────────────────────────────────────
  const esc = s => (typeof escHtml === 'function' ? escHtml(s) : String(s))
  const attr = s => (typeof escAttr === 'function' ? escAttr(s) : String(s))
  let filterVia = ''

  async function render(box) {
    if (!box) return
    let entries = []
    try { entries = await root.api.journalList({ limit: 500, via: filterVia || undefined }) } catch {}
    const names = id => (typeof tName === 'function' && tName(id)) || id
    // Debloat 2.0 entries are journaled as control 'debloat:<catalog id>': show the catalog name, not the id
    const ctlName = c => { const m = /^debloat:((?:app|svc|task|ad|feat):.+)$/.exec(c); return m && typeof tG === 'function' ? tG('debloat2', 'n_' + m[1]) : c }
    const opts = ['', ...VIA_KEYS].map(v => `<option value="${attr(v)}"${v === filterVia ? ' selected' : ''}>${esc(v ? tUI('journalVia_' + v) : tUI('journalViaAll'))}</option>`).join('')
    const head = `<div class="j-journal-head"><label class="j-muted">${esc(tUI('journalFilter'))} <select id="journal-filter" class="j-input j-input-sm">${opts}</select></label><span class="j-muted">${entries.length} ${esc(tUI('journalEntries'))}</span></div>`
    if (!entries.length) { box.innerHTML = head + `<div class="j-muted j-journal-empty">${esc(tUI('journalEmpty'))}</div>`; wire(box); return }
    const sessions = group(entries)
    box.innerHTML = head + sessions.map((s, si) => {
      const batches = s.batches.map(b => {
        const rows = b.entries.map(e => {
          const f = fidelitySummary(e)
          const undone = e.undoneBy ? `<span class="j-badge">${esc(tUI('journalUndone'))}</span>` : ''
          const fid = f.fidelity === 'partial' ? `<span class="j-badge j-badge-warning" title="${attr(tUI('journalPartialTip'))}">${esc(tUI('journalPartial').replace('{n}', f.unresolved))}</span>` : f.fidelity === 'intent' ? `<span class="j-badge">${esc(tUI('journalIntent'))}</span>` : `<span class="j-badge j-badge-success">${esc(tUI('journalExact'))}</span>`
          const diff = e.changes.map(c => { const d = describe(c); return `<div class="j-journal-diff"><span class="j-num">${esc(d.label)}</span><span>${d.unresolved ? esc(tUI('journalNotTracked')) : `${esc(d.before == null ? tUI('journalNone') : d.before)} → <b>${esc(d.after == null ? tUI('journalNone') : d.after)}</b>`}</span></div>` }).join('')
          const canUndo = !e.undoneBy && e.via !== 'undo' && e.action === 'apply'
          return `<div class="j-journal-entry-row"><details class="j-journal-entry"><summary><span>${esc(e.action === 'apply' ? '' : tUI('journalRestored') + ': ')}${esc(e.control ? ctlName(e.control) : names(e.tweakId))}</span> ${fid} ${undone}<span class="j-muted j-num">${esc(new Date(e.ts).toLocaleTimeString())}</span></summary>${diff || `<div class="j-muted">${esc(tUI('journalNoChanges'))}</div>`}</details>${canUndo ? `<button type="button" class="j-btn j-btn-sm j-btn-ghost" data-undo-entry="${attr(e.id)}">${esc(tUI('journalUndo'))}</button>` : ''}</div>`
        }).join('')
        const undoable = b.entries.some(e => !e.undoneBy && e.via !== 'undo' && e.action === 'apply')
        return `<div class="j-journal-batch"><div class="j-journal-batch-head"><b>${esc(tUI('journalVia_' + (b.via || 'manual')))}</b><span class="j-muted">${b.entries.length} ${esc(tUI('journalChanges'))}</span>${b.batchId && undoable ? `<button type="button" class="j-btn j-btn-sm" data-undo-batch="${attr(b.batchId)}">${esc(tUI('journalUndoBatch'))}</button>` : ''}</div>${rows}</div>`
      }).join('')
      const sessionUndo = s.sessionId !== 'unknown' ? `<button type="button" class="j-btn j-btn-sm j-btn-ghost" data-undo-session="${attr(s.sessionId)}">${esc(tUI('journalUndoSession'))}</button>` : ''
      return `<section class="j-journal-session"><div class="j-journal-session-head"><b>${esc(new Date(s.ts).toLocaleDateString())} ${esc(new Date(s.ts).toLocaleTimeString())}</b>${sessionUndo}</div>${batches}</section>`
    }).join('')
    wire(box)
  }

  function wire(box) {
    const f = box.querySelector('#journal-filter'); if (f) f.onchange = () => { filterVia = f.value; render(box) }
    box.querySelectorAll('[data-undo-entry]').forEach(b => { b.onclick = e => { e.preventDefault(); e.stopPropagation(); undo({ entryId: b.dataset.undoEntry }, box) } })
    const ask = async (title, body) => { try { await showConfirm({ title, body: esc(body), okText: tUI('journalUndo'), okStyle: 'warning', icon: 'fa-rotate-left' }); return true } catch { return false } }
    box.querySelectorAll('[data-undo-batch]').forEach(b => { b.onclick = async () => { if (await ask(tG('histx', 'undoBatchTitle'), tG('histx', 'undoBatchBody'))) undo({ batchId: b.dataset.undoBatch }, box) } })
    box.querySelectorAll('[data-undo-session]').forEach(b => { b.onclick = async () => { if (await ask(tG('histx', 'undoSessionTitle'), tG('histx', 'undoSessionBody'))) undo({ sessionId: b.dataset.undoSession }, box) } })
  }

  async function undo(target, box) {
    let res = await root.api.journalUndo({ target })
    if (res && res.conflict) {
      let ok = false
      try { await showConfirm({ title: tUI('undoConflictTitle'), body: esc(tUI('undoConflictBody')), okText: tUI('undoOverwrite'), okStyle: 'warning' }); ok = true } catch {}
      if (!ok) return
      res = await root.api.journalUndo({ target, force: true })
    }
    if (res && res.ok && root.JylliWorld) { try { JylliWorld.undoPulse(null, box) } catch {} }
    if (res && res.ok) { try { root.JylliSound && JylliSound.play('undo') } catch {} toast(tUI('undoDone'), '', 'ok') } else toast(tUI('undoFailed'), '', 'err')
    try { invalidatePageCache('changelog') } catch {}
    render(box)
  }

  root.JylliJournalView.render = render
})(typeof window !== 'undefined' ? window : globalThis)
