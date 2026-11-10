'use strict'
// System > History: timeline of applied / restored tweaks with undo and diff actions.
function buildChangelog(c) {
  const { html } = ui
  c.innerHTML = String(html`
    <div class="tk-hero" id="hist-hero-host"></div>
    ${ui.card({
      title: tUI('journalTitle'),
      sub: tUI('journalSub'),
      body: html`<div id="journal-box" class="j-journal">${ui.empty({ icon: 'clock-rotate-left', title: tUI('historyLoading') })}</div>`,
    })}
    ${ui.card({
      title: tUI('historyTitle'),
      sub: tUI('historySubtitle'),
      actions: html`<span id="cl-count" class="j-muted"></span>${ui.button({ label: tUI('historyRefresh'), icon: 'arrows-rotate', size: 'sm', onclick: 'loadChangelogPage()' })}${ui.button({ label: tUI('historyClear'), icon: 'trash', size: 'sm', variant: 'danger', onclick: 'doClearChangelog()' })}`,
      flush: true,
      body: html`<div id="changelog-list" class="j-history">${ui.empty({ icon: 'clock-rotate-left', title: tUI('historyLoading') })}</div>`,
    })}`)
  const T = (k, v) => tG('histx', k, v)
  const hero = JylliHero.mount(c.querySelector('#hist-hero-host'), {
    id: 'hist-hero', eyebrow: T('loading'), title: tUI('historyTitle'), lead: tUI('journalSub'), dial: { label: T('dial'), unit: '' },
    stats: [{ k: 'today', label: T('statToday') }, { k: 'applied', label: T('statApplied') }, { k: 'restored', label: T('statRestored') }],
  })
  hero.scanning(true); hero.update({ value: '–', tone: 'idle' })
  window._histHero = entries => {
    hero.scanning(false)
    if (!Array.isArray(entries)) { hero.update({ value: '–', tone: 'idle', eyebrow: T('failed'), stats: { today: '–', applied: '–', restored: '–' } }); return }
    const day = Date.now() - 86400000
    hero.update({
      value: String(entries.length), tone: 'accent',
      eyebrow: entries.length ? T('last', { t: _rpRelAge(Math.max(0, Date.now() - entries[0].ts)) }) : T('none'),
      stats: { today: entries.filter(e => e.ts > day).length, applied: entries.filter(e => e.action === 'apply').length, restored: entries.filter(e => e.action !== 'apply').length },
    })
  }
  registerPageCleanup('changelog', () => { window._histHero = null; hero.destroy() })
  c.appendChild(makeTip(`${tUI('historyStoragePath')}: %APPDATA%\\petes-tweaking-utility\\ptu_changelog.json`, 'info'))
  loadChangelogPage()
  try { JylliJournalView.render(document.getElementById('journal-box')) } catch {}
}

async function loadChangelogPage() {
  const { html } = ui
  const entries = await api.getChangelog().catch(() => null)
  if (window._histHero) window._histHero(entries)
  if (!Array.isArray(entries)) { const l0 = document.getElementById('changelog-list'); if (l0) l0.innerHTML = String(ui.error({ title: tG('histx', 'failed'), sub: tG('tab', 'loadFailSub'), action: ui.button({ label: tG('tab', 'retry'), variant: 'secondary', onclick: 'loadChangelogPage()' }) })); return }
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
