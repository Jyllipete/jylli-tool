'use strict'
// Restore-point nudge UI (renderer): System nav dot + Restore tab dot. The Restore tab itself (js/restore/*) owns every banner and card.
// Status comes from JylliRestoreNudge.restoreStatus (pure); this file only fetches it and paints the two dots. LANG group `rpNudge` (`title` is the dot's tooltip).
;(function (root) {
  const N = root.JylliRestoreNudge
  const SEEN_KEY = 'jt_rp_nudge_seen'
  let st = { level: 'never', ageMs: null, at: null, known: false }

  const seen = () => { try { return localStorage.getItem(SEEN_KEY) === '1' } catch (e) { return false } }
  const setSeen = on => { try { on ? localStorage.setItem(SEEN_KEY, '1') : localStorage.removeItem(SEEN_KEY) } catch (e) {} }
  const nudging = () => st.known && (st.level === 'stale' || st.level === 'never')
  const T = (k, v) => tG('rpNudge', k, v)
  const $ = id => document.getElementById(id)

  function compute(r) {
    const s = (root.settings || {})
    const base = N.restoreStatus({ newestAt: r && r.newestAt, lastCreatedAt: (r && r.lastCreatedAt) || s.lastRestorePointAt })
    // Windows could not be asked (not admin) and we never made one: do not claim there is none.
    const unknown = !!(r && r.unknown) && base.level === 'never'
    st = { ...base, level: unknown ? 'unknown' : base.level, known: true }
    if (st.level === 'fresh') setSeen(false)
  }

  function paintNav() {
    const on = nudging()
    const dot = $('badge-restore')
    if (dot) { dot.style.display = on ? '' : 'none'; dot.classList.toggle('rp-pulse', on && !seen()); dot.title = T('title') }
    document.querySelectorAll('#j-head .j-tab').forEach(b => {
      if (!/Shell\.tab\('restore'\)/.test(b.getAttribute('onclick') || '')) return
      let d = b.querySelector('.rp-tab-dot')
      if (on && !d) { d = document.createElement('span'); d.className = 'j-dot j-dot-warn rp-tab-dot'; b.appendChild(d) }
      if (d) { d.style.display = on ? '' : 'none'; d.classList.toggle('rp-pulse', on && !seen()) }
    })
  }

  const paint = paintNav

  async function refresh() {
    let r = null
    try { r = await root.api.getRestoreStatus() } catch (e) {}
    compute(r)
    paint()
  }

  root.JylliRestoreUI = {
    paint, refresh,
    status: () => st,
    // Restore tab opened: the user has seen the nudge, so the pulse stops (the dot stays until a fresh point exists).
    onRestoreOpen() { if (nudging()) setSeen(true); paintNav() },
    // Concierge input: a known stale/missing point overrides the first-run result.
    conciergeHealth(first) { return nudging() ? false : first },
  }
})(typeof window !== 'undefined' ? window : globalThis)
;(function (root) {
  const go = () => root.JylliRestoreUI && root.JylliRestoreUI.refresh()
  if (!root.document) return
  (root._bootFinished && root._bootFinished.then ? root._bootFinished : Promise.resolve()).then(go, go)
  // Any restore point made, deleted or restored (by any tab) moves the dots without a reload.
  try { root.api && root.api.onRestore2Changed && root.api.onRestore2Changed(go) } catch (e) { /* the dots then update on the next page change */ }
})(typeof window !== 'undefined' ? window : globalThis)
