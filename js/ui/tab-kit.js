'use strict'
// Shared tab kit: one anatomy for every tab (hero -> toolbar -> sections, with designed loading / empty / error states).
//   JylliHero.mount(host, cfg)   dial | headline + ledger | stats + one primary action  (generalised from app-hero / bloat-hero)
//   JylliTab.frame / load / skeleton / toolbar / section / seg / actionBar / noMatch
// Colour comes from css/tab-kit.css (data-tone / data-state); nothing here sets a colour. Pure helpers (clampPct, tone) are unit-tested.
;(function (root) {
  const TICKS = 60
  const clampPct = v => (v == null || Number.isNaN(Number(v))) ? null : Math.max(0, Math.min(100, Math.round(Number(v))))
  // 0..100 -> 'ok' | 'warn' | 'danger' (null stays neutral). Same boundaries the Bloat hero uses for its tiers.
  const tone = pct => { const p = clampPct(pct); return p == null ? 'idle' : p >= 80 ? 'ok' : p >= 50 ? 'warn' : 'danger' }

  const api = { clampPct, tone, TICKS }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const g = (k, v) => (root.tG ? root.tG('tab', k, v) : k)
  const reduced = () => document.documentElement.classList.contains('motion-reduced') || document.body.classList.contains('game-live')
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
  const f = n => Math.round(n * 100) / 100
  const pt = (r, deg) => { const a = (deg - 90) * Math.PI / 180; return [100 + r * Math.cos(a), 100 + r * Math.sin(a)] }

  // ───────────────────────────── Hero ─────────────────────────────
  // cfg: { id, cls, tour, eyebrow, title, lead, dial: { label, unit }, onLedger(id),
  //        stats: [{ k, label }], cta: { id, icon, label, onClick }, secondary: { id, icon, label, onClick } }
  // update(s): { pct, eyebrow, lead, title, ledger: [{ id, label, n, total }], stats: { k: value },
  //              cta: { label, icon, badge, disabled, done, hidden }, tone, scanning, empty }
  function mountHero(host, cfg) {
    const ticks = Array.from({ length: TICKS }, (_, i) => {
      const major = i % 5 === 0, p0 = pt(major ? 83 : 85, i * 6), p1 = pt(92, i * 6)
      return `<line class="jh-tick${major ? ' major' : ''}" x1="${f(p0[0])}" y1="${f(p0[1])}" x2="${f(p1[0])}" y2="${f(p1[1])}"/>`
    }).join('')
    const node = el('div', 'jk jh jh-enter' + (cfg.cls ? ' ' + cfg.cls : ''))
    if (cfg.id) node.id = cfg.id
    if (cfg.tour) node.dataset.tour = cfg.tour
    node.dataset.tone = 'idle'; node.dataset.scan = '0'
    node.innerHTML = `
      <div class="jh-dial" data-lint-hole="0.695">
        <div class="jh-glow"></div>
        <svg viewBox="0 0 200 200" aria-hidden="true" focusable="false">
          <g class="jh-ticks">${ticks}</g>
          <circle class="jh-track" cx="100" cy="100" r="74"/>
          <circle class="jh-arc" cx="100" cy="100" r="74" pathLength="100" stroke-dasharray="0 100" transform="rotate(-90 100 100)"/>
          <circle class="jh-ripple" cx="100" cy="100" r="74"/>
        </svg>
        <div class="jh-beam"></div>
        <div class="jh-core"><div class="jh-num"><span class="jh-n">–</span><small class="jh-unit">${esc((cfg.dial && cfg.dial.unit) || '%')}</small></div><div class="jh-lbl">${esc((cfg.dial && cfg.dial.label) || '')}</div></div>
      </div>
      <div class="jh-body">
        <div class="jh-eyebrow"><span class="jh-dot"></span><span class="jh-eyebrow-t">${esc(cfg.eyebrow || '')}</span></div>
        <h2 class="jh-title">${esc(cfg.title || '')}</h2>
        <p class="jh-lead">${esc(cfg.lead || '')}</p>
        <div class="jh-ledger" hidden></div>
      </div>
      <div class="jh-cmd">
        <dl class="jh-stats"></dl>
        <div class="jh-actions"></div>
      </div>`
    host.appendChild(node)
    const q = s => node.querySelector(s)
    const unitEl = q('.jh-unit'), lblEl = q('.jh-lbl')
    const numEl = q('.jh-n'), arc = q('.jh-arc'), ledgerEl = q('.jh-ledger'), statsEl = q('.jh-stats'), actions = q('.jh-actions')
    const tickEls = [...node.querySelectorAll('.jh-tick')]
    let shown = 0, raf = 0, lastPct = null, ctaBtn = null, secBtn = null

    statsEl.innerHTML = (cfg.stats || []).map(s => `<div data-k="${esc(s.k)}" data-zero="1"><dt>${esc(s.label)}</dt><dd>–</dd></div>`).join('')
    statsEl.hidden = !(cfg.stats && cfg.stats.length)
    if (cfg.cta) {
      ctaBtn = el('button', 'jh-cta'); ctaBtn.type = 'button'; if (cfg.cta.id) ctaBtn.id = cfg.cta.id
      ctaBtn.addEventListener('click', () => { if (!ctaBtn.disabled && cfg.cta.onClick) cfg.cta.onClick() })
      actions.appendChild(ctaBtn)
    }
    if (cfg.secondary) {
      const b = el('button', 'jh-sec'); secBtn = b; b.type = 'button'; if (cfg.secondary.id) b.id = cfg.secondary.id; if (cfg.secondary.tour) b.dataset.tour = cfg.secondary.tour
      b.innerHTML = `${cfg.secondary.icon ? `<i class="fa fa-${esc(cfg.secondary.icon)}" aria-hidden="true"></i>` : ''}<span>${esc(cfg.secondary.label)}</span>`
      b.addEventListener('click', () => cfg.secondary.onClick && cfg.secondary.onClick())
      actions.appendChild(b)
    }
    ledgerEl.addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b && cfg.onLedger) cfg.onLedger(b.dataset.id) })

    // Long ledgers show the first `ledgerMax` rows and a Show all / Show less toggle (the hero stays one screen tall)
    let expanded = false
    function applyMore(n) {
      const max = cfg.ledgerMax || 6
      const rows = [...ledgerEl.querySelectorAll('.jh-row')]
      rows.forEach((r, i) => { r.hidden = !expanded && i >= max })
      let more = ledgerEl.querySelector('.jh-more')
      if (n <= max) { if (more) more.remove(); return }
      if (!more) { more = el('button', 'jh-more'); more.type = 'button'; ledgerEl.appendChild(more) }
      more.textContent = expanded ? g('showLess') : g('showAll', { n })
    }
    ledgerEl.addEventListener('click', e => { if (e.target.closest('.jh-more')) { expanded = !expanded; applyMore(ledgerEl.querySelectorAll('.jh-row').length) } })

    function countTo(n) {
      cancelAnimationFrame(raf)
      if (n == null) { numEl.textContent = '–'; shown = 0; return }
      if (reduced() || n === shown) { shown = n; numEl.textContent = n; return }
      const from = shown, start = performance.now(), dur = 900 * (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--motion-scale')) || 1)
      const step = now => { const k = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - k, 3); shown = Math.round(from + (n - from) * e); numEl.textContent = shown; if (k < 1) raf = requestAnimationFrame(step) }
      raf = requestAnimationFrame(step)
    }
    function ripple() { const r = q('.jh-ripple'); r.classList.remove('go'); void r.getBoundingClientRect(); r.classList.add('go') }

    function paintCta(c) {
      if (!ctaBtn || !c) return
      ctaBtn.hidden = !!c.hidden
      ctaBtn.disabled = !!c.disabled || !!c.done
      ctaBtn.dataset.done = c.done ? '1' : '0'
      const label = c.label != null ? c.label : cfg.cta.label
      const icon = c.done ? 'circle-check' : (c.icon || cfg.cta.icon || 'bolt')
      ctaBtn.innerHTML = `<i class="fa fa-${esc(icon)}" aria-hidden="true"></i><span>${esc(label)}</span>${c.badge != null && !c.done ? `<b>${esc(c.badge)}</b>` : ''}`
    }

    const ctl = {
      el: node,
      scanning(on) { node.dataset.scan = on ? '1' : '0' },
      update(s) {
        s = s || {}
        if ('pct' in s) {
          const p = clampPct(s.pct)
          arc.setAttribute('stroke-dasharray', `${p == null ? 0 : p} 100`)
          const lit = p == null ? 0 : Math.round((p / 100) * TICKS)
          tickEls.forEach((tk, i) => tk.classList.toggle('lit', i < lit))
          node.style.setProperty('--jh-level', String((p || 0) / 100))
          if (!('tone' in s)) node.dataset.tone = tone(p)
          countTo(p)
          if (lastPct != null && p != null && p > lastPct) ripple()
          lastPct = p
        }
        if ('value' in s) { cancelAnimationFrame(raf); numEl.textContent = s.value == null ? '–' : s.value; if (s.unit != null) unitEl.textContent = s.unit }
        if (s.label != null) lblEl.textContent = s.label
        if ('tone' in s) node.dataset.tone = s.tone || 'idle'
        if ('scanning' in s) ctl.scanning(s.scanning)
        if ('empty' in s) node.dataset.empty = s.empty ? '1' : '0'
        if (s.eyebrow != null) q('.jh-eyebrow-t').textContent = s.eyebrow
        if (s.title != null) q('.jh-title').textContent = s.title
        if (s.lead != null) q('.jh-lead').textContent = s.lead
        if (s.ledger) {
          ledgerEl.hidden = !s.ledger.length
          ledgerEl.innerHTML = s.ledger.map(r => {
            const hasTotal = r.total != null
            const full = hasTotal && r.total > 0 && r.n >= r.total, w = hasTotal && r.total > 0 ? Math.round(r.n / r.total * 100) : 0
            return `<button type="button" class="jh-row" data-id="${esc(r.id)}" data-full="${full ? 1 : 0}" title="${esc(r.label)}">
              <span class="jh-row-name">${esc(r.label)}</span><span class="jh-bar" aria-hidden="true"><i style="width:${w}%"></i></span><span class="jh-row-n">${hasTotal ? `${r.n}/${r.total}` : esc(r.n)}</span></button>`
          }).join('')
          applyMore(s.ledger.length)
        }
        if (s.stats) for (const k of Object.keys(s.stats)) {
          const row = statsEl.querySelector(`[data-k="${k}"]`); if (!row) continue
          const v = s.stats[k]
          row.querySelector('dd').textContent = v == null ? '–' : v
          row.dataset.zero = (v === 0 || v == null || v === '–') ? '1' : '0'
        }
        if (s.cta) paintCta(s.cta)
        if (s.secondary && secBtn) { secBtn.hidden = !!s.secondary.hidden; if (s.secondary.label != null) secBtn.querySelector('span').textContent = s.secondary.label }
      },
      destroy() { cancelAnimationFrame(raf); node.remove() },
    }
    if (cfg.cta) paintCta({})
    return ctl
  }

  // ───────────────────────────── Tab frame and states ─────────────────────────────
  // frame(c, { tab }) -> { root, hero, bar, body }: the standard page skeleton.
  function frame(c, o) {
    const node = el('div', 'jk tk')
    if (o && o.tab) node.dataset.tab = o.tab
    const hero = el('div', 'tk-hero'), bar = el('div', 'tk-bar'), body = el('div', 'tk-body')
    node.append(hero, bar, body)
    c.appendChild(node)
    return { root: node, hero, bar, body }
  }

  function skeleton(kind, n) {
    if (kind === 'hero') return '<div class="tk-sk-hero" aria-hidden="true"><span class="j-skeleton tk-sk-dial"></span><div class="tk-sk-col"><span class="j-skeleton tk-sk-t"></span><span class="j-skeleton tk-sk-l"></span><span class="j-skeleton tk-sk-l2"></span></div></div>'
    const row = '<div class="tk-sk-row"><span class="j-skeleton tk-sk-a"></span><span class="j-skeleton tk-sk-b"></span></div>'
    return `<div class="tk-sk" role="status" aria-label="${esc(g('loading'))}">${row.repeat(n || 6)}</div>`
  }

  // load(slot, fn, { kind, n, title, sub }) shows a skeleton that matches the final layout, runs fn(slot),
  // and turns a throw into an error state with Retry. A newer load() on the same slot wins.
  async function load(slot, fn, o) {
    o = o || {}
    const token = (slot._jtTok = (slot._jtTok || 0) + 1)
    slot.innerHTML = skeleton(o.kind, o.n)
    try {
      slot.innerHTML = ''
      await fn(slot)
    } catch (e) {
      if (slot._jtTok !== token) return
      slot.innerHTML = ''
      const box = el('div', 'j-error tk-error'); box.setAttribute('role', 'alert')
      box.innerHTML = `<div class="j-error-icon"><i class="fa fa-triangle-exclamation" aria-hidden="true"></i></div><div class="j-error-title">${esc(o.title || g('loadFailTitle'))}</div><div class="j-error-sub">${esc(o.sub || g('loadFailSub'))}</div>`
      const b = el('button', 'j-btn j-btn-secondary j-btn-md'); b.type = 'button'; b.textContent = g('retry')
      b.addEventListener('click', () => load(slot, fn, o))
      box.appendChild(b); slot.appendChild(box)
      if (root.console) console.warn('[tab-kit] load failed:', e && e.message)
    }
  }

  // toolbar({ placeholder, chips }) -> { el, input, chipsEl }; wire it with JylliFilter.mount(list, { input, chipsEl, ... })
  function toolbar(o) {
    o = o || {}
    const bar = el('div', 'jk tk-toolbar')
    const chips = o.chips || ['all', 'recommended', 'applied', 'reboot', 'risky']
    const ph = o.placeholder || g('searchTweaks')
    bar.innerHTML = `
      <label class="tk-search"><i class="fa fa-magnifying-glass" aria-hidden="true"></i><input type="search" class="tk-search-in" placeholder="${esc(ph)}" aria-label="${esc(ph)}" autocomplete="off"></label>
      <div class="tk-chips" role="group" aria-label="${esc(g('filterBy'))}">${chips.map(c => `<button type="button" class="tk-chip" data-chip="${esc(c)}" aria-pressed="${c === 'all'}">${esc(g('chip' + c.charAt(0).toUpperCase() + c.slice(1)))}<span class="tk-chip-n" data-n>0</span></button>`).join('')}</div>`
    return { el: bar, input: bar.querySelector('.tk-search-in'), chipsEl: bar.querySelector('.tk-chips') }
  }

  // noMatch(q, onClear) -> an empty state for a filter with no results; keep it outside the filtered list
  function noMatch(q, onClear) {
    const box = el('div', 'j-empty tk-nomatch')
    box.innerHTML = `<div class="j-empty-icon"><i class="fa fa-magnifying-glass" aria-hidden="true"></i></div><div class="j-empty-title">${esc(g('noMatchTitle'))}</div><div class="j-empty-sub">${esc(g('noMatchSub', { q: q || '' }))}</div>`
    const b = el('button', 'j-btn j-btn-secondary j-btn-md'); b.type = 'button'; b.textContent = g('clearFilter'); b.addEventListener('click', () => onClear && onClear())
    box.appendChild(b); return box
  }

  // section({ id, title, sub, collapsible }) -> { el, body, progress(a, n) }. Collapse state shares makeSection's `sec_col_<id>` key.
  function section(o) {
    const sec = el('section', 'jk tk-sec'); if (o.id) sec.dataset.secId = o.id
    const head = el('header', 'tk-sec-head')
    head.innerHTML = `<div class="tk-sec-t"><h3>${esc(o.title)}</h3>${o.sub ? `<p>${esc(o.sub)}</p>` : ''}</div><span class="tk-sec-prog" hidden></span>`
    const body = el('div', 'tk-sec-body'); body.dataset.collapsed = ''
    sec.append(head, body)
    sec.dataset.collapsed = '0'
    if (o.collapsible !== false && o.id) {
      const btn = el('button', 'tk-sec-tog'); btn.type = 'button'; btn.innerHTML = '<i class="fa fa-chevron-down" aria-hidden="true"></i>'
      head.appendChild(btn)
      const set = c => { sec.dataset.collapsed = c ? '1' : '0'; btn.setAttribute('aria-expanded', String(!c)); btn.setAttribute('aria-label', g(c ? 'expand' : 'collapse')) }
      let c0 = false; try { c0 = localStorage.getItem('sec_col_' + o.id) === '1' } catch (e) { /* storage blocked: stay open */ }
      set(c0)
      btn.addEventListener('click', () => { const c = sec.dataset.collapsed !== '1'; set(c); try { localStorage.setItem('sec_col_' + o.id, c ? '1' : '') } catch (e) { /* ignore */ } })
    }
    const prog = head.querySelector('.tk-sec-prog')
    return { el: sec, body, progress(a, n) { prog.hidden = !(n > 0); prog.textContent = `${a}/${n}`; prog.title = g('appliedOf', { a, n }); prog.dataset.full = n > 0 && a >= n ? '1' : '0' } }
  }

  // seg(items:[{id,label,icon}], active, onChange) -> { el, set(id) }: one segmented control (arrow keys, aria-selected)
  function seg(items, active, onChange) {
    const wrap = el('div', 'jk j-seg tk-seg'); wrap.setAttribute('role', 'tablist')
    const btns = items.map(it => {
      const b = el('button', 'j-seg-item', `${it.icon ? `<i class="fa fa-${esc(it.icon)}" aria-hidden="true"></i>` : ''}<span>${esc(it.label)}</span>`)
      b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.id = it.id
      wrap.appendChild(b); return b
    })
    const set = (id, fire) => {
      btns.forEach(b => { const on = b.dataset.id === id; b.classList.toggle('j-seg-active', on); b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1 })
      if (fire && onChange) onChange(id)
    }
    wrap.addEventListener('click', e => { const b = e.target.closest('.j-seg-item'); if (b) set(b.dataset.id, true) })
    wrap.addEventListener('keydown', e => {
      const i = btns.findIndex(b => b.tabIndex === 0); if (i < 0) return
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return
      e.preventDefault(); const n = btns[(i + d + btns.length) % btns.length]; n.focus(); set(n.dataset.id, true)
    })
    set(active, false)
    return { el: wrap, set: id => set(id, false) }
  }

  // actionBar(c, { summary, ghost: [{ label, onClick }], primary: { label, onClick, id, disabled } }) -> { el, update, destroy }
  // The sticky footer from Auto-Optimize: ghosts left, one primary right.
  function actionBar(c, o) {
    const bar = el('div', 'jk tk-actions'); bar.setAttribute('role', 'region')
    const sum = el('div', 'tk-actions-sum'); bar.appendChild(sum)
    const gh = el('div', 'tk-actions-gh'); bar.appendChild(gh)
    ;(o.ghost || []).forEach(x => { const b = el('button', 'j-btn j-btn-ghost j-btn-md'); b.type = 'button'; b.textContent = x.label; b.addEventListener('click', x.onClick); gh.appendChild(b) })
    const p = el('button', 'j-btn j-btn-primary j-btn-md'); p.type = 'button'; if (o.primary.id) p.id = o.primary.id
    p.addEventListener('click', () => { if (!p.disabled && o.primary.onClick) o.primary.onClick() }); bar.appendChild(p)
    const ctl = {
      el: bar,
      update(s) { if (s.summary != null) sum.textContent = s.summary; if (s.label != null) p.textContent = s.label; if ('disabled' in s) p.disabled = !!s.disabled; if ('hidden' in s) bar.hidden = !!s.hidden },
      destroy() { bar.remove() },
    }
    ctl.update({ summary: o.summary || '', label: o.primary.label, disabled: !!o.primary.disabled })
    c.appendChild(bar); return ctl
  }

  root.JylliHero = { mount: mountHero, clampPct, tone }
  root.JylliTab = { frame, skeleton, load, toolbar, noMatch, section, seg, actionBar, clampPct, tone }
})(typeof window !== 'undefined' ? window : globalThis)
