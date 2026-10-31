'use strict'
// F6 / Shift+F6 cycle keyboard focus between the main regions (sidebar, page, stage dock, status bar). Regions that are hidden are
// skipped. Pure ordering logic is exported for tests.
;(function (root) {
  const REGIONS = ['j-sidebar', 'page-content', 'stage-dock', 'j-statusbar']

  /** next index among the usable regions; dir is 1 or -1; current is the index of the focused region or -1. */
  function nextRegion(usable, current, dir) {
    const idx = usable.map((u, i) => (u ? i : -1)).filter(i => i >= 0)
    if (!idx.length) return -1
    if (current < 0) return dir > 0 ? idx[0] : idx[idx.length - 1]
    const pos = idx.indexOf(current)
    if (pos < 0) return dir > 0 ? (idx.find(i => i > current) ?? idx[0]) : ([...idx].reverse().find(i => i < current) ?? idx[idx.length - 1])
    return idx[(pos + dir + idx.length) % idx.length]
  }

  const api = { nextRegion, REGIONS }
  root.JylliRegions = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  document.addEventListener('keydown', e => {
    if (e.key !== 'F6') return
    e.preventDefault()
    const els = REGIONS.map(id => document.getElementById(id))
    const usable = els.map(el => !!el && !el.hidden && el.offsetParent !== null)
    const cur = els.findIndex(el => el && el.contains(document.activeElement))
    const n = nextRegion(usable, cur, e.shiftKey ? -1 : 1)
    if (n < 0) return
    const el = els[n]
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
    el.focus({ preventScroll: false })
    el.classList.add('j-region-focus')
    setTimeout(() => el.classList.remove('j-region-focus'), 900)
  })
})(typeof window !== 'undefined' ? window : globalThis)
