'use strict'
// CPU & Memory tab: the die map. One card per CCD / core cluster, one tile per physical core (SMT threads as pips). Built once from the real
// topology; every live frame only changes attributes and text (no innerHTML per frame). Tile fill = load of the busiest thread, figure = effective clock,
// hatched = parked by Windows, ringed = kept by the core plan being previewed. Numbers come from performance counters, never guessed.
;(function (root) {
  const api = { mount() { return null } }
  root.JylliCpuMemDie = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

  /** host: element to fill. T(key, vars): LANG lookup. Returns { setTopo, update, highlight, destroy }. */
  api.mount = function (host, { T }) {
    const P = root.JylliCpuMemPure
    let topo = null, refs = [], hl = null, lastFrame = null, lastBase = 0

    function groupTitle(g) {
      if (g.kind === 'p') return T('grp_p')
      if (g.kind === 'e') return label(g, 'grp_e')
      if (g.kind === 'ccd') return T('grp_ccd', { n: g.label.replace(/\D/g, '') || '0' })
      return T('grp_all')
    }
    const label = (g, k) => (g.label === 'LP-E' ? T('grp_lpe') : T(k))
    function groupSub(g) {
      const parts = []
      if (g.l3MB) parts.push(T('l3', { mb: g.l3MB }))
      if (g.vcache) parts.push(T('vcache'))
      return parts.join(' · ')
    }

    function build() {
      const model = P.dieModel(topo, null, hl)
      refs = []
      if (!model) { host.innerHTML = `<p class="cm-die-empty">${esc(T('dieNone'))}</p>`; return }
      host.dataset.hybrid = model.hybrid ? '1' : '0'
      host.innerHTML = model.groups.map(g => `<section class="cm-grp" data-kind="${g.kind}" data-vcache="${g.vcache ? '1' : '0'}" data-grp="${g.id}">
        <header class="cm-grp-h"><b>${esc(groupTitle(g))}</b><span>${esc(groupSub(g))}</span><em class="cm-grp-u mono" data-u>–</em></header>
        <div class="cm-cores">${g.cores.map(c => `<div class="cm-core" data-core="${c.index}" data-tone="idle" role="img" aria-label="${esc(T('coreLabel', { n: c.index + 1, load: '–', ghz: '–' }))}">
          <i class="cm-fill" aria-hidden="true"></i><span class="cm-ghz mono" data-ghz>–</span><span class="cm-pips" aria-hidden="true">${c.threads.map(() => '<i></i>').join('')}</span></div>`).join('')}</div></section>`).join('')
      host.querySelectorAll('.cm-grp').forEach((gel, gi) => {
        const g = model.groups[gi]
        refs.push({ el: gel, u: gel.querySelector('[data-u]'), cores: g.cores.map(c => { const el = gel.querySelector(`[data-core="${c.index}"]`); return { index: c.index, el, ghz: el.querySelector('[data-ghz]'), pips: [...el.querySelectorAll('.cm-pips i')], n: c.threads.map(t => t.n) } }) })
      })
      paint(P.dieModel(topo, lastFrame, hl))
    }

    function paint(model) {
      if (!model) return
      model.groups.forEach((g, gi) => {
        const r = refs[gi]; if (!r) return
        r.u.textContent = g.util == null ? '–' : g.util + '%'
        g.cores.forEach((c, ci) => {
          const cr = r.cores[ci]; if (!cr) return
          const tone = c.parked ? 'parked' : P.loadTone(c.util)
          if (cr.el.dataset.tone !== tone) cr.el.dataset.tone = tone
          cr.el.style.setProperty('--u', c.util == null ? 0 : Math.min(1, c.util / 100).toFixed(2))
          const txt = c.parked ? T('parked') : P.fmtGHz(c.mhz)
          if (cr.ghz.textContent !== txt) cr.ghz.textContent = txt
          cr.el.dataset.keep = c.keep == null ? '' : c.keep ? '1' : '0'
          c.threads.forEach((t, ti) => { const p = cr.pips[ti]; if (p) p.dataset.on = t.util != null && t.util >= 25 ? '1' : '0' })
          cr.el.setAttribute('aria-label', T('coreLabel', { n: c.index + 1, load: c.util == null ? '–' : Math.round(c.util), ghz: P.fmtGHz(c.mhz) }))
        })
      })
    }

    return {
      setTopo(t) { topo = t; build() },
      update(frame, base) { lastFrame = frame; lastBase = base || lastBase; if (topo && refs.length) paint(P.dieModel(topo, frame, hl)) },
      highlight(cpus) { hl = cpus && cpus.length ? cpus : null; if (topo && refs.length) paint(P.dieModel(topo, lastFrame, hl)); host.dataset.preview = hl ? '1' : '0' },
      destroy() { host.innerHTML = ''; refs = [] },
    }
  }
})(typeof window !== 'undefined' ? window : globalThis)
