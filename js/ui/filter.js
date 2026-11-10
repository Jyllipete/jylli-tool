'use strict'
// One search + chip filter for every tweak list (replaces genFilterTweaks / hwFilterTweaks / netFilterTweaks / fivemFilterTweaks).
// It only ever touches items inside the `root` it was mounted on, and only sections that actually contain items, so Live
// monitor, tools, tips and every other block on the page are never hidden or un-hidden by a search.
// Item metadata is read from data attributes: data-search (lowercase text), data-applied, data-recommended, data-reboot, data-risk.
;(function (root) {
  const CHIPS = ['all', 'recommended', 'applied', 'reboot', 'risky']

  // Pure: does an item with this meta pass the query and chip?
  function matches(meta, q, chip) {
    const s = String(q || '').trim().toLowerCase()
    if (s && !String((meta && meta.search) || '').toLowerCase().includes(s)) return false
    switch (chip || 'all') {
      case 'recommended': return !!meta.recommended && !meta.applied
      case 'applied': return !!meta.applied
      case 'reboot': return !!meta.reboot
      case 'risky': return Number(meta.risk || 0) >= 2
      default: return true
    }
  }

  const flag = v => v === '1' || v === 'true'
  const metaOf = el => ({ search: el.dataset.search || el.textContent || '', applied: flag(el.dataset.applied), recommended: flag(el.dataset.recommended), reboot: flag(el.dataset.reboot), risk: Number(el.dataset.risk || 0) })

  // Chip counts for a list of metas (so chips can show "Applied 12").
  function counts(metas) {
    const out = {}
    for (const c of CHIPS) out[c] = metas.filter(m => matches(m, '', c)).length
    return out
  }

  const api = { CHIPS, matches, counts }
  root.JylliFilter = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  // mount(rootEl, { item: '.x-row', section: '.x-sec', input: HTMLInputElement|null, chipsEl: Element|null,
  //                 onResult({shown,total,q,chip}), onChips(counts) })
  api.mount = function (rootEl, o) {
    let q = '', chip = 'all', timer = 0
    const items = () => [...rootEl.querySelectorAll(o.item)]
    const sections = () => o.section ? [...rootEl.querySelectorAll(o.section)] : []
    function run() {
      const all = items()
      let shown = 0
      for (const el of all) { const ok = matches(metaOf(el), q, chip); el.hidden = !ok; if (ok) shown++ }
      for (const sec of sections()) {
        const own = [...sec.querySelectorAll(o.item)]
        if (!own.length) continue
        sec.hidden = !own.some(el => !el.hidden)
        if (q) sec.dataset.searchOpen = '1'; else delete sec.dataset.searchOpen
      }
      if (o.chipsEl) {
        const c = counts(all.map(metaOf))
        for (const b of o.chipsEl.querySelectorAll('[data-chip]')) {
          b.setAttribute('aria-pressed', String(b.dataset.chip === chip))
          const n = b.querySelector('[data-n]'); if (n) n.textContent = String(c[b.dataset.chip] ?? 0)
        }
        if (o.onChips) o.onChips(c)
      }
      if (o.onResult) o.onResult({ shown, total: all.length, q, chip })
    }
    const onInput = () => { clearTimeout(timer); timer = setTimeout(() => { q = o.input.value; run() }, 120) }
    const onChip = e => { const b = e.target.closest('[data-chip]'); if (!b) return; chip = b.dataset.chip; run() }
    if (o.input) o.input.addEventListener('input', onInput)
    if (o.chipsEl) o.chipsEl.addEventListener('click', onChip)
    return {
      refresh: run,
      set(next) { if (next.q != null) { q = next.q; if (o.input) o.input.value = q } if (next.chip) chip = next.chip; run() },
      state: () => ({ q, chip }),
      destroy() { clearTimeout(timer); if (o.input) o.input.removeEventListener('input', onInput); if (o.chipsEl) o.chipsEl.removeEventListener('click', onChip) },
    }
  }
})(typeof window !== 'undefined' ? window : globalThis)
