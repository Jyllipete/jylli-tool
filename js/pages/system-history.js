'use strict'
// System > History: timeline of applied / restored tweaks with undo and diff actions.
function buildChangelog(c) {
  const { html } = ui
  c.innerHTML = String(html`
    ${ui.card({
      title: tUI('historyTitle'),
      sub: tUI('historySubtitle'),
      actions: html`<span id="cl-count" class="j-muted"></span>${ui.button({ label: tUI('historyRefresh'), icon: 'arrows-rotate', size: 'sm', onclick: 'loadChangelogPage()' })}${ui.button({ label: tUI('historyClear'), icon: 'trash', size: 'sm', variant: 'danger', onclick: 'doClearChangelog()' })}`,
      flush: true,
      body: html`<div id="changelog-list" class="j-history">${ui.empty({ icon: 'clock-rotate-left', title: tUI('historyLoading') })}</div>`,
    })}`)
  c.appendChild(makeTip(`${tUI('historyStoragePath')}: %APPDATA%\petes-tweaking-utility\ptu_changelog.json`, 'info'))
  loadChangelogPage()
}

async function loadChangelogPage() {
  const { html } = ui
  const entries = await api.getChangelog()
  const list = document.getElementById('changelog-list')
  const count = document.getElementById('cl-count')
  if (!list) return
  if (count) count.textContent = `${entries.length} ${tUI('historyCount')}`
  if (!entries.length) {
    list.innerHTML = String(ui.empty({ icon: 'clock-rotate-left', title: tUI('historyEmpty') }))
    return
  }
  // Non-reversible actions (debloat, cleanup, one-way fixes)
  const NON_REVERSIBLE = ['remove-uwp', 'debloat', 'remove-device', 'disable-service', 'disable-task', 'fix-', 'clean-', 'delete-']
  const isReversible = (id) => !NON_REVERSIBLE.some(prefix => id.startsWith(prefix) || id.includes(prefix))

  // Diff entries are matched to changelog entries by id and a ±5 s timestamp window
  let diffLog = []
  try { diffLog = JSON.parse(localStorage.getItem('tweak_diff_log') || '[]') } catch {}

  list.innerHTML = entries.slice(0, 100).map(e => {
    const applied = e.action === 'apply'
    const oppositeAction = applied ? 'restore' : 'apply'
    const nearDiff = diffLog.find(d => d.id === e.id && Math.abs(d.ts - e.ts) < 5000)
    const actions = html`${nearDiff ? ui.button({ label: tUI('diffBtn'), icon: 'code-compare', size: 'sm', onclick: `openTweakDiff(${JSON.stringify(e.id)},${Number(nearDiff.ts) || 0})` }) : ''}${isReversible(e.id) ? ui.button({ label: applied ? tUI('historyUndo') : tUI('historyReapply'), size: 'sm', variant: 'ghost', onclick: `undoTweakEntry(${JSON.stringify(e.id)},${JSON.stringify(oppositeAction)})` }) : ''}`
    return String(html`<div class="cl-entry j-history-row">
      <span class="${'j-dot ' + (applied ? 'j-dot-ok' : 'j-dot-warn')}"></span>
      <div class="cl-body j-row-main">
        <div class="j-row-title"><i class="fa fa-${applied ? 'check' : 'rotate-left'}" aria-hidden="true"></i> ${applied ? tUI('historyApplied') : tUI('historyRestored')}: ${tName(e.id) || e.id}</div>
        <div class="j-row-sub j-num">${new Date(e.ts).toLocaleString()} · ${e.id}</div>
      </div>
      <div class="j-row-control">${actions}</div>
    </div>`)
  }).join('')
}
