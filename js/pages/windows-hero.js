'use strict'
// Windows tuning / Quality of life hero. Pure helpers (summarize) are unit-tested; mount() wires the shared hero (js/ui/tab-kit.js)
// to the tweak list that buildWindowsOpti renders. Nothing here sets a colour.
//   dial     share of this tab's tweaks that are applied
//   ledger   one row per section, click scrolls to it and flashes it
//   command  stats + the one primary action: apply the recommended set (scoped to this tab), and Restore all
;(function (root) {
  // Tweaks that are well proven, safe and need no restart. They are the recommended set on the Windows and Quality of life tabs
  // (applicability can add to it: a tweak the capability scan marks 'recommended' counts too).
  // Tour anchors set at runtime: data-tour="windows-undo" on the Restore all button (kit secondary), data-tour="windows-search" on the toolbar search (index.html).
  const SAFE_DEFAULTS = [
    'game-dvr', 'disable-fso', 'win-tips', 'explorer-perf', 'disable-mouse-accel',
    'disable-background-apps', 'disable-auto-maintenance', 'disable-delivery-opt',
    'mmcss', 'priority-sep', 'raw-aim-curve', 'proximity-deny', 'nudge-blocker',
    'sticky-keys-guard', 'search-box-local', 'search-cloud-off', 'do-solo-mode',
    'security-quiet', 'security-toast-off', 'boot-sound-off', 'compat-scanner-off',
    'defender-quiet', 'diag-tasks-off',
  ]

  /**
   * sections: [{ id, title, cards: [{ id }] }]
   * stateOf(id) -> 'applied' | 'pre-applied' | 'restored' | 'default'
   * visible(id) -> false for retired / not offered tweaks (excluded from every count)
   * applicOf(id) -> { state: 'recommended' | 'caution' | ... } | undefined
   * reboot: Set of ids that need a restart; safe: Set of recommended ids
   */
  function summarize({ sections, stateOf, visible, applicOf, reboot, safe }) {
    const vis = visible || (() => true)
    const safeSet = safe || new Set(SAFE_DEFAULTS)
    const rb = reboot || new Set()
    const rows = [], recommendedIds = []
    let total = 0, applied = 0, needsRestart = 0
    for (const s of sections || []) {
      const ids = (s.cards || []).map(c => c.id).filter(id => vis(id))
      const n = ids.filter(id => stateOf(id) === 'applied').length
      total += ids.length; applied += n
      for (const id of ids) {
        const st = stateOf(id), ap = applicOf && applicOf(id)
        if (st === 'applied' && rb.has(id)) needsRestart++
        if (st === 'applied' || st === 'pre-applied') continue
        if (ap && ap.state === 'caution') continue
        if (safeSet.has(id) || (ap && ap.state === 'recommended')) { if (!rb.has(id)) recommendedIds.push(id) }
      }
      if (ids.length) rows.push({ id: s.id, title: s.title, n, total: ids.length })
    }
    return {
      total, applied, left: total - applied,
      pct: total > 0 ? Math.round((applied / total) * 100) : null,
      sections: rows, recommendedIds, needsRestart,
    }
  }

  const api = { SAFE_DEFAULTS, summarize }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  /** mount(host, { mode: 'full'|'qol', getSections(), stateOf, visible, applicOf, reboot, t(key, vars), onApply(ids), onRestoreAll(), titleOf(sec) }) */
  function mount(host, o) {
    const t = o.t, mode = o.mode === 'qol' ? 'qol' : 'full'
    const hero = root.JylliHero.mount(host, {
      id: 'win-hero', cls: 'win-hero', tour: null,
      eyebrow: '', title: t('title_' + mode), lead: t('lead_' + mode), dial: { label: t('dial') },
      stats: [{ k: 'left', label: t('statLeft') }, { k: 'rec', label: t('statRec') }, { k: 'reboot', label: t('statReboot') }],
      cta: { id: 'win-apply-recommended', icon: 'wand-magic-sparkles', label: t('cta'), onClick: () => api.last && o.onApply(api.last.recommendedIds) },
      secondary: { id: 'gen-restore-all-btn', icon: 'rotate-left', label: t('restoreAll'), tour: 'windows-undo', onClick: () => o.onRestoreAll() },
      onLedger: id => goto(id),
    })
    function goto(secId) {
      const sec = document.querySelector('.section-card[data-sec-id="' + secId + '"]'); if (!sec) return
      const grid = sec.querySelector('.tweak-card-grid')
      if (grid && grid.classList.contains('sec-collapsed')) { grid.classList.remove('sec-collapsed'); const b = document.getElementById('scb-' + secId); if (b) b.classList.remove('collapsed') }
      const reduce = document.documentElement.classList.contains('motion-reduced')
      sec.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
      sec.classList.remove('jh-flash'); void sec.offsetWidth; sec.classList.add('jh-flash')
      setTimeout(() => sec.classList.remove('jh-flash'), 1400)
    }
    function refresh() {
      const s = summarize({ sections: o.getSections(), stateOf: o.stateOf, visible: o.visible, applicOf: o.applicOf, reboot: o.reboot })
      api.last = s
      const done = s.recommendedIds.length === 0
      hero.update({
        pct: s.pct, tone: 'accent',
        eyebrow: s.total === 0 ? '' : s.applied === 0 ? t('eyebrowNone') : s.applied === s.total ? t('eyebrowAll', { n: s.total }) : t('eyebrow', { a: s.applied, n: s.total }),
        ledger: s.sections.map(r => ({ id: r.id, label: r.title, n: r.n, total: r.total })),
        stats: { left: s.left, rec: s.recommendedIds.length, reboot: s.needsRestart },
        cta: { label: done ? t('ctaDone') : t('cta'), badge: s.recommendedIds.length, done, hidden: s.total === 0 },
        secondary: { hidden: s.applied === 0 },
      })
      return s
    }
    return { hero, refresh, el: hero.el, destroy() { hero.destroy(); api.last = null } }
  }

  root.JylliWindowsHero = Object.assign({ mount }, api)
})(typeof window !== 'undefined' ? window : globalThis)
