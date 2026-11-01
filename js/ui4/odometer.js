'use strict'
// Rolling digits (4.0): a live number changes digit by digit instead of jumping. set(el, text) keeps one column per digit and
// moves a 0-9 strip with a transform, so only the compositor animates. The text is the single source of truth: it is also the
// aria-label, and with the world off, in Classic or with reduced motion the element just gets plain text.
// `plan` is the pure part (unit-tested): it says whether the column structure must be rebuilt and which digit each column shows.
;(function (root) {
  /** prev/next: strings. Returns { rebuild, cells: [{ digit: 0-9 | null, ch }] } */
  function plan(prev, next) {
    const cells = [...next].map(ch => (/\d/.test(ch) ? { digit: +ch, ch } : { digit: null, ch }))
    const shape = s => [...s].map(ch => (/\d/.test(ch) ? '#' : ch)).join('')
    return { rebuild: prev == null || shape(prev) !== shape(next), cells }
  }

  const enabled = () => !!(root.JylliWorld && root.JylliWorld.rolling())

  function set(el, text) {
    if (el._jxText === text) return
    if (!enabled() || !/\d/.test(text)) { el.classList.remove('jx-odo'); if (el.textContent !== text) el.textContent = text; el._jxText = text; el._jxCols = null; return }
    const p = plan(el._jxCols ? el._jxShapeText : null, text)
    if (p.rebuild) {
      el.textContent = ''
      el.classList.add('jx-odo')
      el._jxCols = p.cells.map(c => {
        const col = document.createElement('span'); col.className = 'jx-od'; col.setAttribute('aria-hidden', 'true')
        if (c.digit != null) { col.dataset.d = '1'; col.innerHTML = '<i>0<br>1<br>2<br>3<br>4<br>5<br>6<br>7<br>8<br>9</i>' } else col.textContent = c.ch === ' ' ? ' ' : c.ch
        el.appendChild(col); return col
      })
      // first paint of a column must not roll in from 0
      const strips = [...el.querySelectorAll('i')]
      strips.forEach(i => { i.style.transition = 'none' })
      p.cells.forEach((c, k) => { if (c.digit != null) el._jxCols[k].firstChild.style.transform = `translateY(${-c.digit * 10}%)` })
      void el.offsetWidth
      requestAnimationFrame(() => strips.forEach(i => { i.style.transition = '' }))
    } else {
      p.cells.forEach((c, k) => { if (c.digit != null) el._jxCols[k].firstChild.style.transform = `translateY(${-c.digit * 10}%)` })
    }
    el.setAttribute('role', 'text'); el.setAttribute('aria-label', text)
    el._jxText = text; el._jxShapeText = text
  }

  const api = { plan, set }
  root.JylliOdo = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
