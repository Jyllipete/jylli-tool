// Runs inside a page (via the harness --lint flag) and returns a compact text report of visual/a11y problems, so layouts can be
// reviewed without screenshots. Checks only what is rendered and visible.
module.exports = String.raw`(() => {
  const out = {}
  const add = (k, v) => { (out[k] = out[k] || []).push(v) }
  const vis = el => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05 }
  const name = el => (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + (!el.id && !el.className ? '"' + (el.textContent || '').trim().slice(0, 24) + '"' : '')).slice(0, 70)
  const root = document.getElementById('page-content') || document.body
  const lum = c => { const f = x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]) }
  const parse = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(parseFloat); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1] }
  const bgOf = el => { let c = [0, 0, 0, 0]; for (let e = el; e && c[3] < 1; e = e.parentElement) { const b = parse(getComputedStyle(e).backgroundColor); if (b && b[3] > 0) c = [0, 1, 2].map(i => b[i] * b[3] + c[i] * (1 - b[3])).concat(Math.min(1, b[3] + c[3] * (1 - b[3]))) } return c[3] < 1 ? (document.documentElement.dataset.scheme === 'light' ? [241, 241, 243, 1] : [9, 9, 11, 1]) : c }
  let texts = 0, primary = 0
  for (const el of root.querySelectorAll('*')) {
    if (!vis(el)) continue
    const cs = getComputedStyle(el)
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())
    if (own) {
      texts++
      const fs = parseFloat(cs.fontSize)
      if (fs < 11) add('font<11px', name(el) + ' ' + fs + 'px')
      if (cs.textTransform === 'uppercase' && fs <= 11) add('tiny-uppercase', name(el))
      const fg = parse(cs.color), bg = bgOf(el)
      if (fg) { const f = [0, 1, 2].map(i => fg[i] * fg[3] + bg[i] * (1 - fg[3])); const a = lum(f), b = lum(bg); const r = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); if (r < 4.5 && fs < 18) add('contrast<4.5', name(el) + ' ' + r.toFixed(1)) }
    }
    if (el.scrollWidth > el.clientWidth + 2 && cs.overflowX === 'visible' && el.clientWidth > 0 && own) add('text-overflow', name(el))
    const tag = el.tagName
    if (/^(BUTTON|A|SELECT|INPUT|SUMMARY)$/.test(tag) || el.getAttribute('role') === 'button' || el.hasAttribute('onclick')) {
      const r = el.getBoundingClientRect()
      if (tag !== 'INPUT' || el.type !== 'checkbox') { if (r.height < 24 || r.width < 24) add('target<24px', name(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)) }
      const label = (el.textContent || '').trim() || el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('data-tip') || (el.labels && el.labels.length)
      if (!label && tag !== 'SELECT') add('no-accessible-name', name(el))
      if (!/^(BUTTON|A|INPUT|SELECT|SUMMARY)$/.test(tag) && !el.hasAttribute('tabindex') && el.hasAttribute('onclick')) add('click-not-focusable', name(el))
      if (el.matches('.j-btn-primary, .btn-primary, .btn-accent')) primary++
    }
    if (cs.boxShadow !== 'none') { for (const m of cs.boxShadow.matchAll(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)\s+(-?\d+)px\s+(-?\d+)px\s+(\d+)px/g)) { if (Math.max(+m[1], +m[2], +m[3]) > 60 && +m[7] >= 8 && (m[4] === undefined || +m[4] > 0.1)) { add('glow-shadow', name(el)); break } } }
    const bl = parseFloat(cs.borderLeftWidth)
    if (bl >= 2 && cs.borderLeftStyle === 'solid' && !el.matches('.j-tab,.j-nav-item')) add('left-accent-border', name(el))
    if (el.hasAttribute('style') && /#[0-9a-f]{3,6}|rgb\(/i.test(el.getAttribute('style'))) add('inline-colour', name(el))
  }
  if (root.scrollWidth > root.clientWidth + 2) add('page-h-scroll', root.scrollWidth + '>' + root.clientWidth)
  if (primary > 1) add('multiple-primary', String(primary))
  const lines = []
  for (const [k, v] of Object.entries(out)) { const u = [...new Set(v)]; lines.push(k + ' x' + v.length + ': ' + u.slice(0, 6).join(' | ') + (u.length > 6 ? ' …' : '')) }
  // untranslated English left in the Finnish UI (heuristic: common English function words in a visible text node)
  if (document.documentElement.lang === 'fi' || (typeof currentLang !== 'undefined' && currentLang === 'fi')) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let n = w.nextNode(); n; n = w.nextNode()) { const t = n.textContent.trim(); if (t.length > 12 && /\b(the|and|your|with|for|from|this|that|will|can|are|you|not|to)\b/i.test(t) && n.parentElement && vis(n.parentElement) && !/^(script|style)$/i.test(n.parentElement.tagName)) add('english-in-fi', t.slice(0, 60)) }
  }
  // style signature of the rendered page: lets two CSS versions be compared (same signature = same computed styles)
  let sig = 5381, count = 0
  for (const el of root.querySelectorAll('*')) { if (!vis(el)) continue; const s = getComputedStyle(el); const str = el.tagName + s.display + s.color + s.backgroundColor + s.fontSize + s.fontWeight + s.borderTopWidth + s.borderLeftWidth + s.padding + s.margin + s.width + s.height; for (let i = 0; i < str.length; i++) sig = ((sig << 5) + sig + str.charCodeAt(i)) | 0; count++ }
  return 'texts=' + texts + ' sig=' + (sig >>> 0).toString(16) + '/' + count + (lines.length ? '\n  ' + lines.join('\n  ') : ' clean')
})()`
