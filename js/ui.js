'use strict'
// Component library for the 2.0 UI. Everything returns a SafeHtml: interpolated values are escaped unless wrapped in raw()
// or produced by another ui.* call, so a forgotten escHtml can no longer become an XSS hole.
// Usage:  const { html, raw } = ui;   el.innerHTML = html`<b>${userText}</b> ${ui.badge('Pro')}`
;(function (root) {
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ESC[c])

  class SafeHtml {
    constructor(s) { this.s = s }
    toString() { return this.s }
  }
  const raw = s => new SafeHtml(String(s ?? ''))

  function part(v) {
    if (v == null || v === false || v === true) return ''
    if (v instanceof SafeHtml) return v.s
    if (Array.isArray(v)) return v.map(part).join('')
    return esc(v)
  }
  function html(strings, ...vals) {
    let out = strings[0]
    for (let i = 0; i < vals.length; i++) out += part(vals[i]) + strings[i + 1]
    return new SafeHtml(out)
  }

  // Attribute string from an object; false/null skip, true renders the bare attribute. `on*` values are trusted handler code.
  function attrs(o) {
    return Object.entries(o || {}).filter(([, v]) => v != null && v !== false)
      .map(([k, v]) => v === true ? k : `${k}="${esc(v)}"`).join(' ')
  }
  const cls = (...c) => c.flat().filter(Boolean).join(' ')
  const icon = name => name ? html`<i class="fa fa-${name.replace(/[^\w-]/g, '')}" aria-hidden="true"></i>` : ''

  const ui = { html, raw, esc, SafeHtml, attrs, cls, icon }

  // variant: primary | secondary | ghost | danger   size: sm | md | lg   loading: shows a spinner and blocks clicks
  ui.button = ({ label, icon: ic, variant = 'secondary', size = 'md', onclick, id, title, disabled, iconOnly, loading, tip, extra } = {}) => html`<button class="${cls('j-btn', 'j-btn-' + variant, size === 'sm' && 'j-btn-sm', size === 'lg' && 'j-btn-lg', iconOnly && 'j-btn-icon', loading && 'j-btn-loading')}" type="button" ${raw(attrs({ id, title: tip ? null : title, 'data-tip': tip || (iconOnly ? title : null), onclick, disabled, 'aria-busy': loading ? 'true' : null, 'aria-label': iconOnly ? (title || label) : null, ...extra }))}>${icon(ic)}${iconOnly ? '' : label}</button>`

  // tone: neutral | ok | warn | danger | info | accent
  ui.badge = (text, tone = 'neutral') => html`<span class="${cls('j-badge', 'j-badge-' + tone)}">${text}</span>`
  ui.pro = label => html`<span class="j-badge j-badge-pro">${label || 'Pro'}</span>`
  ui.kbd = text => html`<kbd class="j-kbd">${text}</kbd>`

  ui.switch = ({ id, checked, onchange, disabled, label } = {}) => html`<label class="j-switch"><input type="checkbox" role="switch" ${raw(attrs({ id, checked, onchange, disabled, 'aria-label': label }))}><span class="j-switch-track"></span></label>`

  ui.card = ({ title, sub, actions, body, flush, id } = {}) => html`<section class="${cls('j-card', flush && 'j-card-flush')}" ${raw(attrs({ id }))}>${(title || actions) ? html`<header class="j-card-head"><div class="j-card-titles">${title ? html`<h3 class="j-card-title">${title}</h3>` : ''}${sub ? html`<p class="j-card-sub">${sub}</p>` : ''}</div>${actions ? html`<div class="j-card-actions">${actions}</div>` : ''}</header>` : ''}<div class="j-card-body">${body}</div></section>`

  // Settings/tweak row: text on the left, control on the right. `detail` expands on click when given.
  ui.row = ({ title, sub, badges, control, id, onclick, active } = {}) => html`<div class="${cls('j-row', onclick && 'j-row-click', active && 'j-row-active')}" ${raw(attrs({ id, onclick }))}><div class="j-row-main"><div class="j-row-title">${title}${badges ? html`<span class="j-row-badges">${badges}</span>` : ''}</div>${sub ? html`<div class="j-row-sub">${sub}</div>` : ''}</div>${control ? html`<div class="j-row-control">${control}</div>` : ''}</div>`
  ui.group = (label, rows) => html`<div class="j-group">${label ? html`<div class="j-group-label">${label}</div>` : ''}<div class="j-group-rows">${rows}</div></div>`

  // tone: accent | ok | warn | danger
  ui.meter = (pct, tone = 'accent') => {
    const p = Math.max(0, Math.min(100, Number(pct) || 0))
    return html`<div class="${cls('j-meter', 'j-meter-' + tone)}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p)}"><span style="width:${p}%"></span></div>`
  }
  ui.ring = (pct, label, tone = 'accent', size = 96) => {
    const p = Math.max(0, Math.min(100, Number(pct) || 0)), r = 44, c = 2 * Math.PI * r
    return html`<div class="${cls('j-ring', 'j-ring-' + tone)}" style="width:${size}px;height:${size}px"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="j-ring-bg" cx="50" cy="50" r="${r}"/><circle class="j-ring-fg" cx="50" cy="50" r="${r}" stroke-dasharray="${(c * p / 100).toFixed(1)} ${c.toFixed(1)}"/></svg><div class="j-ring-label">${label ?? Math.round(p)}</div></div>`
  }
  ui.spark = (values, w = 120, h = 32) => {
    const v = (values || []).map(Number).filter(Number.isFinite)
    if (v.length < 2) return html`<svg class="j-spark" width="${w}" height="${h}"></svg>`
    const lo = Math.min(...v), hi = Math.max(...v), span = (hi - lo) || 1
    const pts = v.map((y, i) => `${(i / (v.length - 1) * w).toFixed(1)},${(h - 2 - (y - lo) / span * (h - 4)).toFixed(1)}`).join(' ')
    return html`<svg class="j-spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}"/></svg>`
  }
  ui.stat = ({ label, value, unit, sub, spark, tone, id } = {}) => html`<div class="${cls('j-stat', tone && 'j-stat-' + tone)}" ${raw(attrs({ id }))}><div class="j-stat-label">${label}</div><div class="j-stat-value"><span data-v>${value}</span>${unit ? html`<span class="j-stat-unit">${unit}</span>` : ''}</div>${sub ? html`<div class="j-stat-sub">${sub}</div>` : ''}${spark ? html`<div class="j-stat-spark">${spark}</div>` : ''}</div>`

  // tabs: [{ id, label, count, pro, locked }]; onSwitch is the handler source, called with the tab id: "switchTab('page', '{id}')"
  ui.tabs = (tabs, active, onSwitch) => html`<div class="j-tabs" role="tablist">${tabs.map(t => html`<button class="${cls('j-tab', t.id === active && 'j-tab-active')}" role="tab" aria-selected="${t.id === active}" type="button" onclick="${String(onSwitch).replace(/\{id\}/g, String(t.id).replace(/[^\w-]/g, ''))}">${t.label}${t.count != null ? html`<span class="j-tab-count">${t.count}</span>` : ''}${t.pro ? ui.pro(t.pro === true ? 'Pro' : t.pro) : ''}</button>`)}</div>`
  ui.segmented = (items, active, onSwitch) => html`<div class="j-seg" role="tablist">${items.map(t => html`<button class="${cls('j-seg-item', t.id === active && 'j-seg-active')}" type="button" onclick="${String(onSwitch).replace(/\{id\}/g, String(t.id).replace(/[^\w-]/g, ''))}">${t.label}</button>`)}</div>`

  ui.empty = ({ icon: ic = 'inbox', title, sub, action } = {}) => html`<div class="j-empty">${ic ? html`<div class="j-empty-icon">${icon(ic)}</div>` : ''}<div class="j-empty-title">${title}</div>${sub ? html`<div class="j-empty-sub">${sub}</div>` : ''}${action ? html`<div class="j-empty-action">${action}</div>` : ''}</div>`
  // Error state: what happened and what to do; the action is usually a Retry button
  ui.error = ({ icon: ic = 'triangle-exclamation', title, sub, action } = {}) => html`<div class="j-error" role="alert"><div class="j-error-icon">${icon(ic)}</div><div class="j-error-title">${title}</div>${sub ? html`<div class="j-error-sub">${sub}</div>` : ''}${action ? html`<div class="j-error-action">${action}</div>` : ''}</div>`
  // Impact bars: level 1-3 plus a label
  ui.impact = (level, label) => { const n = Math.max(0, Math.min(3, Number(level) || 0)); return html`<span class="j-impact"><span class="j-bars" aria-hidden="true"><i class="${n >= 1 ? 'j-on' : ''}"></i><i class="${n >= 2 ? 'j-on' : ''}"></i><i class="${n >= 3 ? 'j-on' : ''}"></i></span>${label}</span>` }
  ui.skeleton = (w = '100%', h = 12) => html`<span class="j-skeleton" style="width:${typeof w === 'number' ? w + 'px' : esc(w)};height:${Number(h) || 12}px"></span>`
  ui.spinner = label => html`<span class="j-loading"><i class="fa fa-spinner fa-spin" aria-hidden="true"></i>${label ? html`<span>${label}</span>` : ''}</span>`
  ui.callout = (text, tone = 'info', ic) => html`<div class="${cls('j-callout', 'j-callout-' + tone)}">${icon(ic || ({ info: 'circle-info', ok: 'circle-check', warn: 'triangle-exclamation', danger: 'circle-exclamation' })[tone])}<div>${text}</div></div>`

  // Premium lock panel: a short pitch plus one action. The caller supplies translated strings.
  ui.lock = ({ title, sub, cta, onclick } = {}) => html`<div class="j-lock"><div class="j-lock-icon">${icon('lock')}</div><div class="j-lock-title">${title}</div><div class="j-lock-sub">${sub}</div>${cta ? ui.button({ label: cta, variant: 'primary', onclick }) : ''}</div>`

  // columns: [{ key, label, align, width, render(row) }]; rows are plain objects. sort: { key, dir } only shows the indicator.
  ui.table = ({ columns, rows, sort, onSort, empty } = {}) => !rows || !rows.length ? (empty || '') : html`<div class="j-table-wrap"><table class="j-table"><thead><tr>${columns.map(c => html`<th class="${cls(c.align && 'j-' + c.align, onSort && c.sortable && 'j-sortable')}" ${raw(attrs({ style: c.width ? `width:${Number(c.width) || 0}px` : null, onclick: onSort && c.sortable ? `${onSort}('${String(c.key).replace(/[^\w-]/g, '')}')` : null }))}>${c.label}${sort && sort.key === c.key ? html`<i class="fa fa-arrow-${sort.dir === 'asc' ? 'up' : 'down'}" aria-hidden="true"></i>` : ''}</th>`)}</tr></thead><tbody>${rows.map(r => html`<tr>${columns.map(c => html`<td class="${cls(c.align && 'j-' + c.align)}">${c.render ? c.render(r) : r[c.key]}</td>`)}</tr>`)}</tbody></table></div>`

  ui.section = ({ title, sub, actions, tabs } = {}) => html`<div class="j-section-head"><div class="j-section-row"><div><h1 class="j-section-title">${title}</h1>${sub ? html`<p class="j-section-sub">${sub}</p>` : ''}</div>${actions ? html`<div class="j-section-actions">${actions}</div>` : ''}</div>${tabs || ''}</div>`

  root.ui = ui
  if (typeof module !== 'undefined' && module.exports) module.exports = ui
})(typeof window !== 'undefined' ? window : globalThis)
