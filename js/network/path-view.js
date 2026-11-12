'use strict'
// Path strip: This PC - link - router - ISP - internet, each node with the reading the trace measured and a tone.
// Built once, updated in place (so the packet animation on the connectors is not restarted by every frame). Colour comes from css/network.css (data-tone).
;(function (root) {
  const api = { mount() { return { update() {}, destroy() {} } } }
  root.JylliNetPath = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  const P = root.JylliNetworkPure
  const T = (k, v) => root.tG('net2', k, v)
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const ORDER = ['pc', 'link', 'router', 'isp', 'internet']

  function mount(host) {
    const ol = document.createElement('ol')
    ol.className = 'nt-nodes'
    ol.setAttribute('aria-label', T('pathLabel'))
    ol.innerHTML = ORDER.map((id, i) => `${i ? `<li class="nt-conn" data-for="${id}" data-tone="idle" aria-hidden="true"><i class="nt-pk"></i><i class="nt-pk b"></i></li>` : ''}
      <li class="nt-node" data-id="${id}" data-tone="idle" tabindex="0">
        <span class="nt-ico"><i class="fa fa-${P.NODE_ICON[id]}" aria-hidden="true"></i></span>
        <span class="nt-name">${esc(T('nd_' + id))}</span>
        <span class="nt-val"><b data-v>–</b><small data-u></small></span>
        <span class="nt-sub" data-s></span>
      </li>`).join('')
    host.appendChild(ol)
    const q = (id, s) => ol.querySelector(`.nt-node[data-id="${id}"] ${s}`)

    function update(path, o = {}) {
      ol.dataset.live = o.live ? '1' : '0'
      ol.dataset.busy = o.busy ? '1' : '0'
      const nodes = path && path.nodes ? path.nodes : []
      const vNode = path && path.verdict ? path.verdict.node : null
      for (const id of ORDER) {
        const n = nodes.find(x => x.id === id) || null
        const li = ol.querySelector(`.nt-node[data-id="${id}"]`)
        const tone = n ? n.tone : 'idle'
        li.dataset.tone = tone
        li.dataset.culprit = vNode === id ? '1' : '0'
        const conn = ol.querySelector(`.nt-conn[data-for="${id}"]`)
        if (conn) conn.dataset.tone = tone
        const t = P.nodeText(n)
        let name = T('nd_' + id)
        if (id === 'link') name = T(n && n.v && n.v.kind === 'wifi' ? 'nd_wifi' : n && n.v && n.v.kind === 'ethernet' ? 'nd_ethernet' : 'nd_link')
        li.querySelector('.nt-name').textContent = name
        if (id === 'link') li.querySelector('.nt-ico i').className = 'fa fa-' + (n && n.v && n.v.kind === 'ethernet' ? 'ethernet' : 'wifi')
        li.querySelector('[data-v]').textContent = id === 'pc' ? '' : t.value
        li.querySelector('[data-u]').textContent = t.unit
        let sub = t.sub.map(s => T('nd_' + s.k, { v: s.v })).join(' · ')
        if (id === 'pc' && n && n.v && n.v.name) sub = n.v.name
        if (id === 'router' && n && n.ip) sub = (sub ? sub + '\n' : '') + n.ip
        if (id === 'link' && n && n.v && n.v.kind === 'wifi' && n.v.pct != null && !sub) sub = n.v.pct + ' %'
        if ((id === 'router' || id === 'isp' || id === 'internet') && n && n.v && n.v.hidden) sub = T('nd_hidden')
        li.querySelector('[data-s]').textContent = sub
        li.setAttribute('aria-label', `${name}: ${id === 'pc' ? (n && n.v && n.v.name) || '' : (t.value + ' ' + t.unit).trim()} ${sub}`.trim())
      }
    }
    update(null)
    return { update, destroy() { ol.remove() } }
  }

  api.mount = mount
})(typeof window !== 'undefined' ? window : globalThis)
