'use strict'
// Provenance tags: hover or focus any live number and a small tag says where it came from and how old it is. The text is
// built by JylliTelemetry.fmt (data-prov, e.g. "from nvidia-smi · 0.8s ago") or says why there is no value; nothing is invented.
;(function (root) {
  if (typeof document === 'undefined') return
  let tag, cur
  const el = () => tag || (tag = Object.assign(document.createElement('div'), { id: 'jx-prov' }), tag.setAttribute('role', 'tooltip'), document.body.appendChild(tag), tag)

  function show(target) {
    const text = target.getAttribute('data-prov'); if (!text) return
    const t = el(), parts = text.split(' · ')
    const key = target.getAttribute('data-metric')
    const name = typeof tUI === 'function' && key ? (tUI('sensorKey_' + key) !== 'sensorKey_' + key ? tUI('sensorKey_' + key) : key) : key
    t.innerHTML = `<b>${esc(name || '')}</b>${parts.map(p => `<span>${esc(p)}</span>`).join('<br>')}`
    const r = target.getBoundingClientRect(); t.classList.add('show')
    const w = t.offsetWidth, h = t.offsetHeight
    t.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px'
    t.style.top = (r.top - h - 8 < 8 ? r.bottom + 8 : r.top - h - 8) + 'px'
    cur = target
  }
  const hide = () => { if (tag) tag.classList.remove('show'); cur = null }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

  document.addEventListener('pointerover', e => { const t = e.target.closest && e.target.closest('[data-metric][data-prov]'); if (t && t !== cur) show(t) })
  document.addEventListener('pointerout', e => { if (cur && !(e.relatedTarget && cur.contains(e.relatedTarget))) hide() })
  document.addEventListener('focusin', e => { const t = e.target.closest && e.target.closest('[data-metric][data-prov]'); if (t) show(t) })
  document.addEventListener('focusout', hide)
  document.addEventListener('scroll', hide, true)
  root.JylliProv = { show, hide }
})(typeof window !== 'undefined' ? window : globalThis)
