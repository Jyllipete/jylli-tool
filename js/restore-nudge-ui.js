'use strict'
// Restore-point nudge UI (renderer): Home "Safety net" card, System nav dot, Restore tab dot + banner, Quick Health row.
// Status comes from JylliRestoreNudge.restoreStatus (pure); this file only fetches it and paints it. LANG group `rpNudge`.
;(function (root) {
  const N = root.JylliRestoreNudge
  const SEEN_KEY = 'jt_rp_nudge_seen'
  let st = { level: 'never', ageMs: null, at: null, known: false }

  const seen = () => { try { return localStorage.getItem(SEEN_KEY) === '1' } catch (e) { return false } }
  const setSeen = on => { try { on ? localStorage.setItem(SEEN_KEY, '1') : localStorage.removeItem(SEEN_KEY) } catch (e) {} }
  const nudging = () => st.known && (st.level === 'stale' || st.level === 'never')
  const T = (k, v) => tG('rpNudge', k, v)
  const when = () => (typeof _rpRelAge === 'function' && st.ageMs != null) ? _rpRelAge(st.ageMs) : ''
  const $ = id => document.getElementById(id)

  function compute(r) {
    const s = (root.settings || {})
    const base = N.restoreStatus({ newestAt: r && r.newestAt, lastCreatedAt: (r && r.lastCreatedAt) || s.lastRestorePointAt })
    // Windows could not be asked (not admin) and we never made one: do not claim there is none.
    const unknown = !!(r && r.unknown) && base.level === 'never'
    st = { ...base, level: unknown ? 'unknown' : base.level, known: true }
    if (st.level === 'fresh') setSeen(false)
  }

  function bannerText() { return st.level === 'never' ? T('bannerNever') : T('bannerStale', { when: when() }) }

  function paintHome() {
    const el = $('rp-safety')
    if (!el) return
    const pulse = nudging() && !seen() ? ' rp-pulse' : ''
    const open = ui.button({ label: T('open'), size: 'sm', variant: 'ghost', onclick: "showPage('restore-points')" })
    if (nudging()) {
      el.innerHTML = String(ui.html`<div class="j-callout j-callout-warn rp-safety-callout" role="status"><i class="fa fa-shield-halved" aria-hidden="true"></i>
        <div class="j-grow"><b>${T('title')}</b><div class="j-muted">${bannerText()}</div></div>
        ${ui.button({ label: T('create'), icon: 'shield-halved', size: 'sm', variant: 'primary', id: 'rp-safety-btn', onclick: 'rpNudgeCreate()' })}${open}</div>`)
      const b = $('rp-safety-btn'); if (b && pulse) b.classList.add('rp-pulse')
    } else if (st.known && st.level === 'fresh') {
      el.innerHTML = String(ui.html`<div class="j-callout j-callout-ok rp-safety-callout" role="status"><i class="fa fa-shield-check" aria-hidden="true"></i>
        <div class="j-grow">${T('last', { when: when() })}</div>${open}</div>`)
    } else {
      el.innerHTML = ''
    }
    // Quick Health row
    if (typeof setQH === 'function' && $('qh-row-restore-point')) {
      if (!st.known || st.level === 'unknown') setQH('restore-point', '—', 0)
      else if (st.level === 'never') setQH('restore-point', T('none'), 100, 'danger')
      else setQH('restore-point', when(), st.level === 'stale' ? 100 : Math.max(4, Math.round(st.ageMs / N.STALE_MS * 100)), st.level === 'stale' ? 'warn' : 'ok')
    }
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

  function paintBanner() {
    const b = $('rp-stale-banner')
    if (!b) return
    b.style.display = nudging() ? 'flex' : 'none'
    const t = $('rp-stale-text'); if (t) t.textContent = bannerText()
  }

  function paint() { paintHome(); paintNav(); paintBanner() }

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
    onRestoreOpen() { if (nudging()) setSeen(true); paintNav(); paintBanner() },
    // Concierge input: a known stale/missing point overrides the first-run result.
    conciergeHealth(first) { return nudging() ? false : first },
  }
  root.rpNudgeCreate = async function () {
    const b = $('rp-safety-btn'); if (b) b.disabled = true
    try { await root.quickCreateRP() } finally { await refresh() }
  }
})(typeof window !== 'undefined' ? window : globalThis)
;(function (root) {
  const go = () => root.JylliRestoreUI && root.JylliRestoreUI.refresh()
  if (root.document) (root._bootFinished && root._bootFinished.then ? root._bootFinished : Promise.resolve()).then(go, go)
})(typeof window !== 'undefined' ? window : globalThis)
