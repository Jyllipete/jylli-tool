'use strict'
// App Optimizer hero ("coverage scanner"). Pure helpers (arcs, summary) are unit-tested; mount() builds the DOM.
//   dial     one arc per installed app (idle / applied / drifted / live), 60-tick bezel lit up to the score, scan beam only while scanning
//   ledger   one row per category with a pip per app
//   command  live stats + the Optimize-all button
// Colours come from css/app-hero.css (data-cat / data-state); nothing here sets a colour.
;(function (root) {
  const C = 100
  const rad = d => (d - 90) * Math.PI / 180
  const pt = (r, deg) => [C + r * Math.cos(rad(deg)), C + r * Math.sin(rad(deg))]
  const f = n => Math.round(n * 100) / 100
  const CATS = ['Browsers', 'Communication', 'Media', 'Launchers', 'Streaming', 'System']
  const TICKS = 60

  function arcPath(r, a0, a1) {
    const [x0, y0] = pt(r, a0), [x1, y1] = pt(r, a1)
    return `M${f(x0)} ${f(y0)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${f(x1)} ${f(y1)}`
  }

  /** n equal arcs separated by gapDeg on radius r -> [{ i, a0, a1, d }] */
  function arcs(n, gapDeg = 5, r = 74) {
    if (!n || n < 1) return []
    const span = 360 / n
    const gap = n === 1 ? 0.01 : Math.min(gapDeg, span * 0.6)
    return Array.from({ length: n }, (_, i) => {
      const a0 = i * span + gap / 2, a1 = (i + 1) * span - gap / 2
      return { i, a0, a1, d: arcPath(r, a0, a1) }
    })
  }

  /**
   * defs: [{ id, cat }], installed: Set|array of ids, states: { id: 'applied'|... }, running / drifted: Set|array of ids.
   * drifted only matters for applied apps, running only for unapplied ones.
   */
  function summary(defs, installed, states, running, drifted) {
    const inst = new Set(installed || []), run = new Set(running || []), dr = new Set(drifted || [])
    const st = states || {}
    const apps = (defs || []).filter(d => inst.has(d.id)).map(d => {
      const applied = st[d.id] === 'applied'
      const state = applied ? (dr.has(d.id) ? 'drifted' : 'applied') : (run.has(d.id) ? 'live' : 'idle')
      return { id: d.id, cat: d.cat, applied, state }
    })
    const total = apps.length, applied = apps.filter(a => a.applied).length
    const cats = CATS.map(cat => {
      const list = apps.filter(a => a.cat === cat)
      return { cat, total: list.length, applied: list.filter(a => a.applied).length }
    }).filter(c => c.total > 0)
    return {
      apps, total, applied, cats,
      pct: total > 0 ? Math.round((applied / total) * 100) : 0,
      running: apps.filter(a => a.state === 'live').length,
      drifted: apps.filter(a => a.state === 'drifted').length,
      left: total - applied,
      remainingIds: apps.filter(a => !a.applied).map(a => a.id),
    }
  }

  const api = { arcs, summary, arcPath, CATS }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const reduced = () => document.documentElement.classList.contains('motion-reduced') || document.body.classList.contains('game-live')

  /** mount(container, { t(key, vars), catLabel(cat), appName(id) }) -> controller */
  function mount(container, opts) {
    const t = opts.t, catLabel = opts.catLabel || (c => c), appName = opts.appName || (id => id)
    const el = document.createElement('div')
    el.className = 'ao-hero aoh aoh-enter'
    el.dataset.scan = '1'
    const ticks = Array.from({ length: TICKS }, (_, i) => {
      const major = i % 5 === 0, [x0, y0] = pt(major ? 83 : 85, i * 6), [x1, y1] = pt(92, i * 6)
      return `<line class="aoh-tick${major ? ' major' : ''}" x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}"/>`
    }).join('')
    el.innerHTML = `
      <div class="aoh-dial" data-lint-hole="0.695">
        <div class="aoh-glow"></div>
        <svg viewBox="0 0 200 200" aria-hidden="true" focusable="false">
          <g class="aoh-ticks">${ticks}</g>
          <circle class="aoh-track" cx="100" cy="100" r="74"/>
          <g class="aoh-arcs"></g>
          <circle class="aoh-ripple" cx="100" cy="100" r="74"/>
        </svg>
        <div class="aoh-beam"></div>
        <div class="aoh-core"><div class="aoh-num"><span class="aoh-n">0</span><small>%</small></div><div class="aoh-lbl">${esc(t('aoHeroScoreLabel'))}</div></div>
      </div>
      <div class="aoh-body">
        <div class="aoh-eyebrow"><span class="aoh-dot"></span><span class="aoh-eyebrow-t"></span></div>
        <h2 class="aoh-title">${esc(t('appOptiHeroTitle'))}</h2>
        <p class="aoh-lead">${esc(t('aoHeroLead'))}</p>
        <div class="aoh-ledger"></div>
      </div>
      <div class="aoh-cmd">
        <dl class="aoh-stats">
          <div data-k="running"><dt>${esc(t('aoHeroStatRunning'))}</dt><dd>0</dd></div>
          <div data-k="drifted"><dt>${esc(t('aoHeroStatDrifted'))}</dt><dd>0</dd></div>
          <div data-k="left"><dt>${esc(t('aoHeroStatLeft'))}</dt><dd>0</dd></div>
        </dl>
        <button type="button" class="aoh-cta" id="ao-optimize-all-btn" disabled></button>
      </div>`
    const host = document.createElement('div')
    host.className = 'aoh-host'
    host.appendChild(el)
    container.appendChild(host)
    const q = s => el.querySelector(s)
    const arcsG = q('.aoh-arcs'), numEl = q('.aoh-n'), eyebrow = q('.aoh-eyebrow-t'), ledger = q('.aoh-ledger'), cta = q('.aoh-cta')
    const tickEls = [...el.querySelectorAll('.aoh-tick')]
    let last = null, shown = 0, raf = 0, remaining = [], isScanning = true, detected = 0

    const goto = (sel, flashSel) => {
      const target = document.querySelector(sel); if (!target) return
      target.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' })
      const fl = (flashSel && document.querySelector(flashSel)) || target
      fl.classList.remove('aoh-flash'); void fl.offsetWidth; fl.classList.add('aoh-flash')
      setTimeout(() => fl.classList.remove('aoh-flash'), 1400)
    }
    arcsG.addEventListener('click', e => { const a = e.target.closest('[data-app]'); if (a) goto('#aoc-' + a.dataset.app) })
    ledger.addEventListener('click', e => { const r = e.target.closest('[data-cat]'); if (r) goto('.ao-grid[data-ao-cat="' + r.dataset.cat + '"]') })
    cta.addEventListener('click', () => { if (remaining.length && typeof window.applyAllRunningApps === 'function') window.applyAllRunningApps(remaining) })

    function countTo(n) {
      cancelAnimationFrame(raf)
      if (reduced() || n === shown) { shown = n; numEl.textContent = n; return }
      const from = shown, start = performance.now(), dur = 900 * (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--motion-scale')) || 1)
      const step = now => {
        const k = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - k, 3)
        shown = Math.round(from + (n - from) * e); numEl.textContent = shown
        if (k < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    }
    function setEyebrow() {
      eyebrow.textContent = isScanning ? t('aoHeroScanning') : detected ? `${t('aoHeroEyebrow')} · ${t('aoHeroDetected', { n: detected })}` : t('aoHeroNone')
    }
    function pulse() { const r = q('.aoh-ripple'); r.classList.remove('go'); void r.getBoundingClientRect(); r.classList.add('go') }

    const ctl = {
      el,
      scanning(on) { isScanning = !!on; el.dataset.scan = on ? '1' : '0'; setEyebrow() },
      update(s) {
        detected = s.total
        const sig = s.apps.map(a => a.id).join('|')
        if (!last || last.sig !== sig) {
          arcsG.innerHTML = arcs(s.apps.length).map(a => {
            const app = s.apps[a.i]
            return `<path class="aoh-arc" data-app="${esc(app.id)}" data-cat="${esc(app.cat)}" d="${a.d}"><title></title></path>`
          }).join('')
        }
        s.apps.forEach((app, i) => {
          const p = arcsG.children[i]; if (!p) return
          p.setAttribute('data-state', app.state)
          p.firstChild.textContent = `${appName(app.id)} · ${t('aoHeroArc_' + app.state)}`
        })
        const lit = Math.round((s.pct / 100) * TICKS)
        tickEls.forEach((tk, i) => tk.classList.toggle('lit', i < lit))
        el.style.setProperty('--aoh-level', String(s.pct / 100))
        el.dataset.done = s.total > 0 && s.left === 0 ? '1' : '0'
        el.dataset.empty = s.total === 0 ? '1' : '0'
        countTo(s.pct)
        if (last && s.applied > last.applied) pulse()
        ledger.innerHTML = s.cats.map(c => `
          <button type="button" class="aoh-cat" data-cat="${esc(c.cat)}" data-full="${c.applied === c.total ? 1 : 0}">
            <span class="aoh-cat-dot"></span><span class="aoh-cat-name">${esc(catLabel(c.cat))}</span>
            <span class="aoh-pips">${Array.from({ length: c.total }, (_, i) => `<i class="${i < c.applied ? 'on' : ''}"></i>`).join('')}</span>
            <span class="aoh-cat-n" id="ao-cat-chip-${esc(c.cat.toLowerCase())}">${c.applied}/${c.total}</span>
          </button>`).join('')
        for (const k of ['running', 'drifted', 'left']) {
          const row = q(`[data-k="${k}"]`); row.querySelector('dd').textContent = s[k]; row.dataset.zero = s[k] === 0 ? '1' : '0'
        }
        remaining = s.remainingIds
        const done = s.total > 0 && s.left === 0
        cta.disabled = s.total === 0 || done
        cta.dataset.done = done ? '1' : '0'
        cta.hidden = s.total === 0
        cta.innerHTML = done
          ? `<i class="fa fa-circle-check"></i><span>${esc(t('aoOptimizeAllDone'))}</span>`
          : `<i class="fa fa-bolt"></i><span>${esc(t('aoOptimizeAll'))}</span><b>${s.left}</b>`
        last = { sig, applied: s.applied }
        setEyebrow()
      },
      destroy() { cancelAnimationFrame(raf); host.remove() },
    }
    setEyebrow()
    return ctl
  }

  root.JylliAppHero = Object.assign({ mount }, api)
})(typeof window !== 'undefined' ? window : globalThis)
