'use strict'
// Home HTML builders (strings only; js/home/page.js owns the data flow and the events). Copy: LANG group `home2` via T.
// Everything user- or machine-derived goes through esc(). Colour comes from css/home.css (data-tone), never from here.
;(function (root) {
  const P = () => root.JylliHomePure
  const esc = s => String(s == null ? '' : s).replace(/[&<>"'`]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]))
  const ic = (name, extra) => `<i class="fa fa-${name}${extra ? ' ' + extra : ''}" aria-hidden="true"></i>`

  const SUBS = ['stability', 'storage', 'memory', 'cpu', 'gpu', 'drivers', 'windows', 'security', 'network', 'config']
  const PILLARS = ['health', 'tuned', 'protected']
  const PILLAR_ICON = { health: 'heart-pulse', tuned: 'sliders', protected: 'shield-halved' }
  const BTN_ICON = { restore: 'shield-halved', autoOpti: 'rocket', tab: 'arrow-right', batch: 'bolt', drift: 'rotate-left', admin: 'lock', ai: 'wand-magic-sparkles' }

  /** The three-band dial. Arcs start empty; page.js sets the real dash so the CSS transition draws them in. */
  function dialSvg() {
    const bands = P().BANDS
    return `<svg viewBox="0 0 200 200" aria-hidden="true" focusable="false">
      <g class="hm-ticks">${Array.from({ length: 60 }, (_, i) => {
    const a = (i * 6 - 90) * Math.PI / 180, r0 = i % 5 === 0 ? 94.5 : 96, r1 = 99
    return `<line x1="${(100 + r0 * Math.cos(a)).toFixed(1)}" y1="${(100 + r0 * Math.sin(a)).toFixed(1)}" x2="${(100 + r1 * Math.cos(a)).toFixed(1)}" y2="${(100 + r1 * Math.sin(a)).toFixed(1)}"/>`
  }).join('')}</g>
      ${bands.map(b => `<circle class="hm-track" cx="100" cy="100" r="${b.r - 5.5}"/>`).join('')}
      ${bands.map(b => `<circle class="hm-arc" data-pillar="${b.key}" data-tone="idle" cx="100" cy="100" r="${b.r - 5.5}" pathLength="100" stroke-dasharray="0 100" transform="rotate(-90 100 100)"/>`).join('')}
    </svg>`
  }

  function pillarRow(T, key, index, detail) {
    const p = index.pillars[key]
    const val = p.pct == null ? `<span class="hm-na">${esc(T('notMeasured'))}</span>` : `<b class="hm-num">${p.pct}</b><small>/100</small>`
    return `<li><button type="button" class="hm-pillar" data-pillar="${key}" data-tone="${p.tone}" aria-expanded="false" aria-controls="hm-why" title="${esc(T('whyOpen'))}">
      <span class="hm-pillar-i">${ic(PILLAR_ICON[key])}</span>
      <span class="hm-pillar-t"><span class="hm-pillar-n">${esc(T('p_' + key))}</span><span class="hm-pillar-d">${esc(detail || '')}</span></span>
      <span class="hm-pillar-v">${val}</span>
      <span class="hm-bar" aria-hidden="true"><i style="width:${p.pct == null ? 0 : p.pct}%"></i></span>
    </button></li>`
  }

  function chips(T, m) {
    const imp = `<span class="hm-chip" data-impact="${m.impact}">${esc(T('impact_' + m.impact))}</span>`
    const mins = m.minutes ? `<span class="hm-chip">${ic('clock')} ${esc(T('minutes', { n: m.minutes }))}</span>` : ''
    const rev = m.reversible ? `<span class="hm-chip" data-ok="1">${ic('rotate-left')} ${esc(T('reversible'))}</span>` : ''
    return imp + mins + rev
  }

  /** copy = { title, why } already translated. */
  function moveCard(T, m, copy, busy) {
    const label = T('btn_' + m.action.type)
    return `<article class="hm-move-c" data-id="${esc(m.id)}" data-blocking="${m.blocking ? 1 : 0}"${busy ? ' aria-busy="true"' : ''}>
      <div class="hm-eyebrow"><span class="hm-dot"></span>${esc(T(m.blocking ? 'moveFirst' : 'moveNext'))}</div>
      <h3 class="hm-move-t">${esc(copy.title)}</h3>
      ${copy.why ? `<p class="hm-move-w">${esc(copy.why)}</p>` : ''}
      <div class="hm-move-m">${chips(T, m)}</div>
      <div class="hm-move-a">
        <button type="button" class="j-btn j-btn-primary j-btn-lg" data-act="run" data-move="${esc(m.id)}">${ic(BTN_ICON[m.action.type] || 'arrow-right')}<span>${esc(label)}</span></button>
        <button type="button" class="j-btn j-btn-ghost" data-act="later" data-move="${esc(m.id)}">${esc(T('notNow'))}</button>
      </div>
    </article>`
  }

  function allClear(T, line) {
    return `<article class="hm-move-c hm-clear">
      <div class="hm-eyebrow"><span class="hm-dot" data-tone="ok"></span>${esc(T('clearEyebrow'))}</div>
      <h3 class="hm-move-t">${esc(T('clearTitle'))}</h3>
      <p class="hm-move-w">${esc(line || T('clearWhy'))}</p>
      <div class="hm-move-a"><button type="button" class="j-btn j-btn-ghost" data-act="checkup">${ic('stethoscope')}<span>${esc(T('btn_checkup'))}</span></button></div>
    </article>`
  }

  function nextRow(T, m, copy) {
    return `<li><button type="button" class="hm-next-r" data-act="run" data-move="${esc(m.id)}">
      <span class="hm-next-i">${ic(BTN_ICON[m.action.type] || 'arrow-right')}</span>
      <span class="hm-next-t">${esc(copy.title)}</span><span class="hm-next-m">${esc(T('minutes', { n: m.minutes || 1 }))}</span>${ic('chevron-right', 'hm-next-c')}
    </button></li>`
  }

  // ── Why this number ──────────────────────────────────────────────────────────────
  /** rows: [{ key, label, value, note }] per pillar; page.js fills the numbers from the snapshot. */
  function whyDrawer(T, index, rows, trendText) {
    const w = index.pillars
    return `<div class="hm-why-h"><h3>${esc(T('whyTitle'))}</h3><p>${esc(T('whyLead'))}</p>
      <button type="button" class="j-btn j-btn-ghost j-btn-sm" data-act="why-close">${esc(T('close'))}</button></div>
      <div class="hm-why-g">${PILLARS.map(k => {
    const r = rows[k] || { items: [] }
    return `<section class="hm-why-p" data-tone="${w[k].tone}" id="hm-why-${k}"><header>${ic(PILLAR_ICON[k])}<h4>${esc(T('p_' + k))}</h4><span class="hm-why-w">${esc(T('weight', { n: w[k].weight }))}</span></header>
        <p class="hm-why-s">${esc(T('pd_' + k))}</p>
        <ul>${r.items.map(i => `<li data-state="${i.state}"><span>${esc(i.label)}</span><b>${esc(i.value)}</b></li>`).join('')}</ul>
        ${r.extra || ''}${r.action ? `<button type="button" class="j-btn j-btn-sm" data-act="${r.action.act}">${esc(r.action.label)}</button>` : ''}</section>`
  }).join('')}</div>${trendText ? `<p class="hm-why-t">${esc(trendText)}</p>` : ''}`
  }

  // ── Proof Ledger ─────────────────────────────────────────────────────────────────
  function tile(T, id, big, unit, label, sub, tone) {
    return `<li class="hm-tile" data-tile="${id}" data-tone="${tone || 'ok'}"><span class="hm-tile-l">${esc(label)}</span>
      <span class="hm-tile-v"><b class="hm-num">${esc(big)}</b>${unit ? `<small>${esc(unit)}</small>` : ''}</span>${sub ? `<span class="hm-tile-s">${esc(sub)}</span>` : ''}</li>`
  }

  function ledger(T, L, now, canUndo) {
    const t = L.tiles, p = P(), tiles = []
    if (t.boot) {
      const s = p.seconds(t.boot.deltaMs)
      tiles.push(tile(T, 'boot', (t.boot.faster ? '−' : '+') + s, 's', T(t.boot.faster ? 'tileBootFaster' : 'tileBootSlower'), T('tileBootSub', { a: p.seconds(t.boot.beforeMs), b: p.seconds(t.boot.afterMs) }), t.boot.faster ? 'ok' : 'warn'))
    }
    if (t.reclaimed) {
      const b = p.bytes(t.reclaimed.bytes)
      tiles.push(tile(T, 'reclaimed', b.n, b.u, T('tileReclaimed'), T('tileReclaimedSub', { n: t.reclaimed.runs }), 'ok'))
    }
    if (t.removed) {
      const n = t.removed.startup + t.removed.tasks + t.removed.apps
      tiles.push(tile(T, 'removed', String(n), '', T('tileRemoved'), T('tileRemovedSub', { s: t.removed.startup, k: t.removed.tasks, a: t.removed.apps }), 'ok'))
    }
    if (t.tweaks) {
      tiles.push(tile(T, 'tweaks', String(t.tweaks.holding), '', T('tileTweaks'), t.tweaks.drifted ? T('tileTweaksDrift', { n: t.tweaks.drifted }) : T(t.tweaks.checked ? 'tileTweaksSub' : 'tileTweaksUnchecked', { n: t.tweaks.inPlace }), t.tweaks.drifted ? 'warn' : t.tweaks.checked ? 'ok' : 'idle'))
    }
    const w = L.week
    const week = w.batches ? `<p class="hm-week">${ic('calendar-week')} ${esc(T('weekLine', { b: w.batches, c: w.changes }))}${w.undone ? ' · ' + esc(T('weekUndone', { n: w.undone })) : ''}${w.failed ? ' · ' + esc(T('weekFailed', { n: w.failed })) : ''}</p>` : ''
    const undo = canUndo ? `<button type="button" class="j-btn j-btn-ghost j-btn-sm" data-act="undo-last">${ic('rotate-left')}<span>${esc(T('undoLast'))}</span></button>` : ''
    if (!tiles.length && !week) return ''
    return `<ul class="hm-tiles">${tiles.join('')}</ul><div class="hm-ledger-f">${week}${undo}</div>`
  }

  function ledgerEmpty(T) {
    return `<div class="hm-empty">${ic('flask-vial')}<div><b>${esc(T('proofEmptyT'))}</b><p>${esc(T('proofEmptyB'))}</p></div></div>`
  }

  // ── Subsystem grades: a compact list inside the Health column of the Why drawer (they are what Health is made of) ──
  function gradesMini(T, g, takenText) {
    return `<div class="hm-gm"><div class="hm-gm-h"><span>${esc(T('gradesTitle'))}</span><span>${esc(takenText || '')}</span></div>
      <ul class="hm-gm-l">${SUBS.map(s => {
      const v = g && typeof g[s] === 'number' ? g[s] : null
      return `<li data-tone="${P().tone(v)}"><span>${esc(T('sub_' + s))}</span><b class="hm-num">${v == null ? '–' : v}</b><span class="hm-bar" aria-hidden="true"><i style="width:${v == null ? 0 : v}%"></i></span></li>`
    }).join('')}</ul></div>`
  }

  // ── Timeline ─────────────────────────────────────────────────────────────────────
  const TL_TABS = ['cpu', 'gpu', 'ram', 'disk', 'net']
  const TL_WINS = ['1m', '10m', '7d']
  function timelineHead(T) {
    return `<div class="hm-tl-bar"><div class="hm-tabs" role="tablist" aria-label="${esc(T('trTitle'))}">${TL_TABS.map(id => `<button type="button" role="tab" class="hm-tab" data-act="tl-tab" data-tab="${id}" aria-selected="false">
        <span class="hm-tab-n">${esc(T('trTab_' + id))}</span><span class="hm-tab-v hm-num" data-tab-v="${id}">–</span><span class="hm-tab-s hm-num" data-tab-s="${id}"></span></button>`).join('')}</div>
      <div class="hm-seg" role="group" aria-label="${esc(T('trTitle'))}">${TL_WINS.map(w => `<button type="button" class="hm-seg-b" data-act="tl-win" data-win="${w}" aria-pressed="false">${esc(T('trWin_' + w))}</button>`).join('')}</div></div>`
  }

  // ── Quick actions ────────────────────────────────────────────────────────────────
  function dock(T, isAdmin) {   // borderless chips; the page adds the Ctrl K hint
    const b = (act, icon, label, extra) => `<button type="button" class="hm-dock-b" data-act="${act}"${extra || ''}>${ic(icon)}<span>${esc(label)}</span></button>`
    return [
      b('dns', 'trash', T('dockDns')), b('temp', 'broom', T('dockTemp')), b('ram', 'memory', T('dockRam'), ' id="btn-ram-clean"'),
      b('games', 'gamepad', T('dockGames')), b('fivem', 'car-side', T('dockFivem')), b('specs', 'arrows-rotate', T('dockSpecs')),
      isAdmin === false ? b('admin', 'lock', T('dockAdmin'), ' id="btn-relaunch-admin" data-urgent="1"') : '',
    ].join('')
  }

  root.JylliHomeViews = { esc, ic, SUBS, PILLARS, dialSvg, pillarRow, moveCard, allClear, nextRow, whyDrawer, ledger, ledgerEmpty, gradesMini, timelineHead, TL_TABS, TL_WINS, dock, chips }
})(typeof window !== 'undefined' ? window : globalThis)
