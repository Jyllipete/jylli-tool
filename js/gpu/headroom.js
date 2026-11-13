'use strict'
// GPU tab, the Headroom instrument (stage) and the Engines card. Five rails (load, clock, power, temperature, memory) each drawn against the real
// ceiling the driver reports, a 60 second trace under each, and the one rail that is holding the card back lit as the limiter.
// Every number comes from the live frames (lib/gpu/live.js); a value nobody measured prints "–", never 0. DOM is built once and updated in place.
;(function (root) {
  const api = { mount() { return null }, mountEngines() { return null } }
  root.JylliGpuHeadroom = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  const NS = 'http://www.w3.org/2000/svg'
  const W = 120, H = 28

  function mount(stage, { T, P, esc }) {
    const L = root.JylliGpuLimiter
    const idEl = document.createElement('div'); idEl.className = 'gp-id'
    const railsEl = document.createElement('div'); railsEl.className = 'gp-rails'; railsEl.setAttribute('role', 'group'); railsEl.setAttribute('aria-label', T('railsAria'))
    const limEl = document.createElement('div'); limEl.className = 'gp-lim'; limEl.setAttribute('aria-live', 'polite')
    const traces = {}
    const cards = {}
    for (const id of P.RAILS) {
      traces[id] = P.createTrace()
      const a = document.createElement('article')
      a.className = 'gp-rail'; a.dataset.rail = id; a.dataset.tone = ''; a.dataset.lim = '0'
      a.innerHTML = `<header><i class="fa fa-${P.RAIL_ICON[id]}" aria-hidden="true"></i><span>${esc(T('rail_' + id))}</span><em>${esc(T('railLimiting'))}</em></header>
        <div class="gp-rail-val"><b class="mono" data-v>–</b><small data-u></small></div>
        <div class="gp-rail-bar" aria-hidden="true"><i style="--p:0"></i></div>
        <div class="gp-rail-ceil" data-c>&nbsp;</div>
        <svg class="gp-rail-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d=""/></svg>`
      railsEl.appendChild(a)
      cards[id] = { el: a, v: a.querySelector('[data-v]'), u: a.querySelector('[data-u]'), c: a.querySelector('[data-c]'), bar: a.querySelector('.gp-rail-bar i'), path: a.querySelector('path') }
    }
    stage.append(idEl, railsEl, limEl)
    let facts = null, last = null, paused = false

    function setFacts(f) {
      facts = f
      const g = f && f.gpu
      const chips = P.identity(f).map(c => `<span class="nt-fact"><i class="fa fa-${c.icon}" aria-hidden="true"></i>${esc(T('id_' + c.k, c.vars))}</span>`).join('')
      idEl.innerHTML = `<div class="gp-id-name"><i class="fa fa-display" aria-hidden="true"></i><span>${esc(f ? (g ? g.name : T('gpuUnknown')) : T('gpuReading'))}</span></div>${chips ? `<div class="nt-facts-row">${chips}</div>` : ''}`
      paintLimiter()
    }

    function update(frame, limits) {
      last = frame
      const rails = L.rails(frame, limits || {})
      const lim = frame ? L.limiterOf(frame, limits || {}) : null
      for (const r of rails) {
        const c = cards[r.id], rd = P.railRead(r), t = traces[r.id]
        c.v.textContent = rd.main; c.u.textContent = rd.unit
        c.c.textContent = rd.main === '–' ? T('railNoValue') : rd.ceil ? T('railOf', { max: rd.ceil }) : T('railNoCeil')
        c.bar.style.setProperty('--p', rd.fill == null ? 0 : rd.fill)
        c.bar.parentElement.dataset.on = rd.fill == null ? '0' : '1'
        c.el.dataset.tone = rd.tone
        c.el.dataset.lim = lim && lim.rail === r.id ? '1' : '0'
        // a rail with a ceiling is drawn on 0..ceiling, so the trace shows how close to the wall it runs; the others fit their own range
        t.push(r.value)
        const fixed = r.id === 'load' ? [0, 100] : r.max && r.id !== 'temp' ? [0, r.max] : [null, null]
        const segs = P.sparkSegments(t.values(), W, H, fixed[0], fixed[1], r.id === 'temp' ? 10 : 5)
        c.path.setAttribute('d', segs.map(s => 'M' + s.split(' ').join(' L')).join(' '))
      }
      railsEl.dataset.live = '1'
      paintLimiter(lim)
    }

    function paintLimiter(lim) {
      const l = lim || (last ? L.limiterOf(last, (facts && facts.limits) || {}) : null)
      limEl.dataset.id = paused ? 'paused' : l ? l.id : 'wait'
      const key = paused ? 'paused' : l ? l.id : 'wait'
      limEl.innerHTML = `<i class="fa fa-${ICON[key] || 'circle-info'}" aria-hidden="true"></i><div><b>${esc(T('limT_' + key))}</b><span>${esc(T('limS_' + key))}</span></div>`
    }
    const ICON = { idle: 'moon', none: 'circle-check', power: 'bolt', thermal: 'temperature-arrow-up', hardware: 'triangle-exclamation', load: 'gauge-high', unknown: 'circle-question', wait: 'hourglass-half', paused: 'gamepad' }

    function setPaused(v) { paused = !!v; paintLimiter() }
    function reset() { last = null; for (const id of P.RAILS) traces[id].reset(); paintLimiter(); for (const id of P.RAILS) { cards[id].v.textContent = '–'; cards[id].path.setAttribute('d', ''); cards[id].bar.style.setProperty('--p', 0); cards[id].el.dataset.lim = '0' } }
    setFacts(null)
    return { setFacts, update, setPaused, reset, destroy() { idEl.remove(); railsEl.remove(); limEl.remove() } }
  }

  // ── Engines card: what the card is doing (3D, compute, copy, video) and which programs are using it ──
  function mountEngines(card, { T, P, esc }) {
    card.innerHTML = `<header class="nt-card-h"><div><b>${esc(T('engTitle'))}</b><span>${esc(T('engSub'))}</span></div></header>
      <div class="gp-eng" data-eng></div><div class="gp-procs"><h4>${esc(T('procTitle'))}</h4><ul data-procs></ul></div>`
    const eng = card.querySelector('[data-eng]'), procs = card.querySelector('[data-procs]')
    eng.innerHTML = P.ENGINES.map(id => `<div class="gp-er" data-e="${id}"><span>${esc(T('eng_' + id))}</span><i class="gp-er-bar"><u style="--p:0"></u></i><b class="mono">–</b></div>`).join('')
    procs.innerHTML = `<li class="gp-proc-none">${esc(T('procWait'))}</li>`
    let key = ''
    return {
      update(frame) {
        for (const r of P.engineRows(frame)) {
          const row = eng.querySelector(`[data-e="${r.id}"]`)
          row.querySelector('u').style.setProperty('--p', r.v == null ? 0 : r.v)
          row.querySelector('b').textContent = r.v == null ? '–' : r.v + '%'
          row.dataset.busy = r.v != null && r.v >= 50 ? '1' : '0'
        }
        const rows = P.procRows(frame)
        const k = rows.map(p => p.pid + ':' + p.util + ':' + Math.round(p.mb / 8)).join(',')
        if (k === key) return
        key = k
        procs.innerHTML = rows.length
          ? rows.map(p => `<li><span class="gp-pn" title="${esc(p.name)}">${esc(p.name)}</span><span class="gp-pu"><i style="width:${Math.max(p.util ? 3 : 0, p.util)}%"></i></span><b class="mono">${p.util}%</b><em class="mono">${esc(P.fmtMB(p.mb))}</em></li>`).join('')
          : `<li class="gp-proc-none">${esc(T('procNone'))}</li>`
      },
      clear() { key = ''; procs.innerHTML = `<li class="gp-proc-none">${esc(T('procWait'))}</li>`; for (const r of eng.querySelectorAll('.gp-er')) { r.querySelector('u').style.setProperty('--p', 0); r.querySelector('b').textContent = '–' } },
      destroy() { card.innerHTML = '' },
    }
  }

  api.mount = mount
  api.mountEngines = mountEngines
})(typeof window !== 'undefined' ? window : globalThis)
