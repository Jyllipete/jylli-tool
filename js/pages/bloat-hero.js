'use strict'
// Bloatware hero. Pure helpers (compute, tierOf, segments, trend) are unit-tested; mount() builds the DOM.
//   dial     one ring split into three weighted arcs (Store apps 40, services 35, tasks 25); each arc fills with that source's share of bloat
//   ledger   one row per source: count, share bar, points
//   command  preset + rescan buttons, trend chip
// The score is null until all three sources were really measured, so a partial number is never shown or saved.
// Colours live in css/bloat-hero.css (data-tier / data-src); nothing here sets a colour.
;(function (root) {
  const C = 100, R = 78
  const WEIGHTS = { uwp: 40, svc: 35, task: 25 }
  const ORDER = ['uwp', 'svc', 'task']
  const TIERS = ['clean', 'moderate', 'bloated', 'critical']
  const f = n => Math.round(n * 100) / 100
  const rad = d => (d - 90) * Math.PI / 180
  const pt = (r, deg) => [C + r * Math.cos(rad(deg)), C + r * Math.sin(rad(deg))]

  const tierOf = s => s <= 25 ? 'clean' : s <= 55 ? 'moderate' : s <= 80 ? 'bloated' : 'critical'

  /** parts: { uwp|svc|task: { n, total, measured } } -> { score|null, tier|null, partial, parts[] } */
  function compute(parts) {
    const list = ORDER.map(k => {
      const p = (parts && parts[k]) || {}
      const total = Math.max(0, +p.total || 0), n = Math.min(total, Math.max(0, +p.n || 0))
      const ratio = total > 0 ? n / total : 0
      return { k, n, total, measured: !!p.measured, ratio, max: WEIGHTS[k], pts: Math.round(ratio * WEIGHTS[k]) }
    })
    const all = list.every(p => p.measured)
    const score = all ? Math.min(100, Math.round(list.reduce((a, p) => a + p.ratio * p.max, 0))) : null
    return { score, tier: score == null ? null : tierOf(score), partial: !all, parts: list }
  }

  function arcPath(r, a0, a1) {
    const [x0, y0] = pt(r, a0), [x1, y1] = pt(r, a1)
    return `M${f(x0)} ${f(y0)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${f(x1)} ${f(y1)}`
  }

  /** three arcs spanning their weight of the circle; `fill` is the part lit up by the source's ratio -> [{ k, a0, a1, d, fill }] */
  function segments(parts, gapDeg = 8, r = R) {
    let at = 0
    return parts.map(p => {
      const span = 360 * p.max / 100
      const a0 = at + gapDeg / 2, a1 = at + span - gapDeg / 2
      at += span
      const fillTo = a0 + (a1 - a0) * Math.max(0, Math.min(1, p.ratio))
      return { k: p.k, a0, a1, d: arcPath(r, a0, a1), fill: p.ratio > 0 ? arcPath(r, a0, Math.max(fillTo, a0 + 0.01)) : '' }
    })
  }

  /** last score saved before `sinceTs` (the start of this visit), or null */
  function trend(history, sinceTs) {
    const h = (Array.isArray(history) ? history : []).filter(x => x && typeof x.score === 'number' && x.ts < sinceTs)
    return h.length ? h[h.length - 1].score : null
  }

  const api = { WEIGHTS, ORDER, TIERS, tierOf, compute, segments, arcPath, trend }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const reduced = () => document.documentElement.classList.contains('motion-reduced') || document.body.classList.contains('game-running')

  /** mount(container, { t(key), onOpen(src), onPreset(), onRescan(), previous }) -> controller { el, update(result), scanning(on), destroy() } */
  function mount(container, opts) {
    const t = opts.t
    const el = document.createElement('div')
    el.className = 'bloat-tier-hero bh bh-enter'
    el.dataset.scan = '1'
    el.dataset.tier = 'pending'
    const ticks = Array.from({ length: 48 }, (_, i) => {
      const [x0, y0] = pt(i % 4 === 0 ? 91 : 93, i * 7.5), [x1, y1] = pt(97, i * 7.5)
      return `<line class="bh-tick" x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}"/>`
    }).join('')
    const rows = ORDER.map(k => `
      <button type="button" class="bh-row" data-src="${k}">
        <span class="bh-dot"></span>
        <span class="bh-name">${esc(t('bhSrc_' + k))}</span>
        <span class="bh-bar"><i></i></span>
        <span class="bh-count">–</span>
        <span class="bh-pts">–</span>
      </button>`).join('')
    el.innerHTML = `
      <div class="bh-dial" data-lint-hole="0.72" title="${esc(t('bhLowerBetter'))}">
        <div class="bh-glow"></div>
        <svg viewBox="0 0 200 200" aria-hidden="true" focusable="false">
          <g>${ticks}</g>
          <g class="bh-segs">${ORDER.map(k => `<path class="bh-track" data-src="${k}"/><path class="bh-fill" data-src="${k}"/>`).join('')}</g>
        </svg>
        <div class="bh-beam"></div>
        <div class="bh-core"><span class="bh-n">–</span><span class="bh-lbl">${esc(t('bsScoreLabel'))}</span></div>
      </div>
      <div class="bh-body">
        <div class="bh-eyebrow"><span class="bh-status"></span><span class="bh-eyebrow-t"></span></div>
        <div class="bh-headline"><span class="bloat-tier-badge bh-badge">–</span></div>
        <p class="bh-desc"></p>
        <div class="bh-ledger">${rows}</div>
      </div>
      <div class="bh-cmd">
        <button type="button" class="bh-cta"><i class="fa fa-gamepad"></i><span>${esc(t('scanGaming'))}</span></button>
        <button type="button" class="bh-rescan"><i class="fa fa-magnifying-glass"></i><span>${esc(t('bhRescan'))}</span></button>
        <span class="bh-trend" hidden></span>
      </div>`
    const host = document.createElement('div')
    host.className = 'bh-host'
    host.appendChild(el)
    container.appendChild(host)
    const q = s => el.querySelector(s), qa = s => [...el.querySelectorAll(s)]
    const numEl = q('.bh-n'), eyebrow = q('.bh-eyebrow-t'), badge = q('.bh-badge'), desc = q('.bh-desc'), cta = q('.bh-cta'), trendEl = q('.bh-trend')
    let raf = 0, shown = null, isScanning = true

    qa('.bh-row').forEach(b => b.addEventListener('click', () => opts.onOpen && opts.onOpen(b.dataset.src)))
    cta.addEventListener('click', () => opts.onPreset && opts.onPreset())
    q('.bh-rescan').addEventListener('click', () => opts.onRescan && opts.onRescan())

    function countTo(n) {
      cancelAnimationFrame(raf)
      if (reduced() || shown == null || n === shown) { shown = n; numEl.textContent = n; return }
      const from = shown, start = performance.now(), dur = 900 * (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--motion-scale')) || 1)
      const step = now => {
        const k = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - k, 3)
        shown = Math.round(from + (n - from) * e); numEl.textContent = shown
        if (k < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    }
    function setEyebrow() { eyebrow.textContent = isScanning ? t('bhScanning') : t('bhChecked') }

    const ctl = {
      el,
      scanning(on) { isScanning = !!on; el.dataset.scan = on ? '1' : '0'; setEyebrow() },
      update(r) {
        const segs = segments(r.parts)
        segs.forEach(s => {
          const tr = q(`.bh-track[data-src="${s.k}"]`), fl = q(`.bh-fill[data-src="${s.k}"]`)
          tr.setAttribute('d', s.d); fl.setAttribute('d', s.fill || s.d)
          fl.style.opacity = s.fill ? '' : '0'
        })
        el.dataset.tier = r.tier || 'pending'
        r.parts.forEach(p => {
          const row = q(`.bh-row[data-src="${p.k}"]`)
          row.dataset.measured = p.measured ? '1' : '0'
          row.dataset.zero = p.measured && p.n === 0 ? '1' : '0'
          row.querySelector('.bh-bar i').style.width = p.measured ? Math.round(p.ratio * 100) + '%' : '0%'
          row.querySelector('.bh-count').textContent = p.measured ? `${p.n} ${t('bhOf')} ${p.total}` : '–'
          row.querySelector('.bh-pts').textContent = p.measured ? `+${p.pts}` : '–'
          row.querySelector('.bh-pts').title = p.measured ? `${p.pts} / ${p.max} ${t('bhPts')}` : ''
        })
        if (r.score == null) {
          badge.className = 'bloat-tier-badge bh-badge'; badge.textContent = '–'; desc.textContent = t('bsScanPrompt')
          numEl.textContent = '–'; shown = null
          cta.hidden = true; trendEl.hidden = true
        } else {
          badge.className = `bloat-tier-badge bh-badge tier-${r.tier}`; badge.textContent = t('bloatTier_' + r.tier)
          desc.textContent = t('bloatDesc_' + r.tier)
          const first = shown == null
          countTo(r.score)
          if (first && !reduced()) { el.classList.remove('bh-pop'); void el.offsetWidth; el.classList.add('bh-pop') }
          cta.hidden = r.tier === 'clean'
          const prev = opts.previous
          if (prev != null) {
            const d = r.score - prev
            trendEl.hidden = false; trendEl.dataset.dir = d < 0 ? 'down' : d > 0 ? 'up' : 'same'
            trendEl.textContent = `${t('bhTrend')} ${prev}${d ? ` (${d > 0 ? '+' : ''}${d})` : ''}`
          } else trendEl.hidden = true
        }
        setEyebrow()
      },
      destroy() { cancelAnimationFrame(raf); host.remove() },
    }
    ctl.update(compute({}))
    return ctl
  }

  root.JylliBloatHero = Object.assign({ mount }, api)
})(typeof window !== 'undefined' ? window : globalThis)
