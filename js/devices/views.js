'use strict'
// Devices tab: HTML builders for the cards and their detail (js/devices/page.js mounts and wires them). Everything is rendered from the service snapshot;
// nothing here decides what a device is. A fact is always shown with where it came from and how sure that is, and an unknown one says why.
;(function (root) {
  const api = {}
  root.JylliDevicesViews = api
  if (typeof document === 'undefined') return

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

  /** A fact value as text. Units that are names (Hz, GB) stay as they are. */
  function factText(ctx, key, f) {
    const { T } = ctx
    const v = f.value
    switch (key) {
      case 'connection': return T('conn_' + v)
      case 'polling': return v + ' Hz'
      case 'battery': return v + '%'
      case 'size': return T('sizeIn', { n: v })
      case 'port': return T('portFmt', { hub: v.hub, port: v.port })
      case 'sizeGB': return v + ' GB'
      case 'integrated': case 'up': return T(v ? 'yes' : 'no')
      case 'kind': return v === 'wifi' ? 'Wi-Fi' : v === 'ethernet' ? 'Ethernet' : String(v)
      default: return String(v)
    }
  }

  const dot = (ctx, label, f) => {
    const { T } = ctx
    const c = f && f.value != null ? f.confidence || 'low' : 'none'
    const why = f && f.value != null ? T('src_' + f.source) + ' · ' + T('conf_' + f.confidence) : T('why_' + ((f && f.reason) || 'absent'))
    return `<i class="dv-dot" data-c="${c}" title="${esc(label + ': ' + why)}" aria-hidden="true"></i>`
  }

  function sub(ctx, d) {
    const { T, P } = ctx
    const f = d.facts || {}
    const bits = []
    if (d.disconnected) { bits.push(d.vendor ? esc(d.vendor) : ''); const a = P.ago(d.lastSeen, Date.now()); bits.push(esc(a ? T('lastSeen') + ' ' + T('ago_' + a.k, { n: a.n }) : T('lastSeen') + ' –')) }
    else {
      if (f.vendor && f.vendor.value != null && f.vendor.note !== 'abbreviated') bits.push(esc(f.vendor.value))
      else if (f.vendor && f.vendor.note === 'abbreviated' && f.ids && f.ids.value) bits.push(esc(T('vendorId', { id: f.ids.vid || '' })))
      if (f.connection && f.connection.value != null && d.category !== 'display') bits.push(esc(T('conn_' + f.connection.value)))
      if (f.polling && f.polling.value != null) bits.push(esc(f.polling.value + ' Hz · ' + T('src_measured')))
      if (f.battery && f.battery.value != null) bits.push(esc(f.battery.value + '%'))
      if (f.size && f.size.value != null) bits.push(esc(T('sizeIn', { n: f.size.value })))
    }
    return bits.filter(Boolean).join(' · ')
  }

  // ── card ──────────────────────────────────────────────────────────────
  api.card = (ctx, d, open) => {
    const { T, P } = ctx
    const f = d.facts || {}
    const id = esc(d.id)
    const problem = d.problem ? `<span class="dv-pill" data-tone="warn" title="${esc(T('problemT', { code: d.problem.code == null ? '?' : d.problem.code }))}"><i class="fa fa-triangle-exclamation" aria-hidden="true"></i>${esc(T('problem'))}</span>` : ''
    const dots = d.disconnected || d.core ? '' : `<span class="dv-dots" aria-hidden="true">${dot(ctx, T('f_vendor'), f.vendor)}${dot(ctx, T('f_model'), f.model)}${dot(ctx, T('f_connection'), f.connection)}</span>`
    const title = d.title || T('unnamed')
    return `<article class="dv-card" data-id="${id}" data-cat="${esc(d.category)}" data-open="${open ? '1' : '0'}"${d.virtual ? ' data-virtual="1"' : ''}${d.disconnected ? ' data-gone="1"' : ''}>
      <button type="button" class="dv-card-h" data-act="toggle" data-id="${id}" aria-expanded="${open ? 'true' : 'false'}" aria-controls="dv-d-${id}">
        <span class="dv-ico" aria-hidden="true"><i class="fa fa-${P.iconOf(d.category)}"></i></span>
        <span class="dv-ct"><b>${esc(title)}</b><em>${sub(ctx, d)}</em></span>
        <span class="dv-badges">${problem}${dots}</span>
        <i class="fa fa-chevron-down dv-chev" aria-hidden="true"></i>
      </button>
      <div class="dv-detail" id="dv-d-${id}"${open ? '' : ' hidden'}>${open ? api.detail(ctx, d) : ''}</div>
    </article>`
  }

  // ── detail ────────────────────────────────────────────────────────────
  function noteText(ctx, f) {
    const { T } = ctx
    if (!f || f.value == null) return ''
    if (f.note === 'abbreviated') return T('note_abbreviated')
    if (f.note === 'conflict') return T('note_conflict', { says: f.deviceSays || '' })
    if (f.note === 'chip_maker') return T('note_chipMaker')
    if (f.note === 'generic') return T('note_generic')
    if (f.note === 'approx') return T('note_approx')
    return ''
  }

  function factRow(ctx, key, f) {
    const { T } = ctx
    if (!f) return ''
    if (f.value == null) return `<tr class="dv-unk"><th scope="row">${esc(T('f_' + key))}</th><td><span class="dv-na">${esc(T('unknown'))}</span><small>${esc(T('why_' + (f.reason || 'absent')))}</small></td><td></td><td></td></tr>`
    const note = noteText(ctx, f)
    return `<tr><th scope="row">${esc(T('f_' + key))}</th><td>${esc(factText(ctx, key, f))}${note ? `<small>${esc(note)}</small>` : ''}</td>
      <td><span class="dv-src" data-s="${esc(f.source)}">${esc(T('src_' + f.source))}</span></td>
      <td><span class="dv-conf" data-c="${esc(f.confidence)}">${esc(T('conf_' + f.confidence))}</span></td></tr>`
  }

  api.detail = (ctx, d) => {
    const { T, P } = ctx
    if (d.disconnected) {
      return `<div class="dv-d-body"><p class="dv-foot">${esc(T('goneNote'))}</p><div class="dv-ctl-row"><button type="button" class="nt-sec sm" data-act="forget" data-id="${esc(d.id)}"><i class="fa fa-trash-can" aria-hidden="true"></i>${esc(T('forget'))}</button></div></div>`
    }
    const rows = P.rowsOf(d).map(k => factRow(ctx, k, d.facts[k])).join('')
    const kind = d.kindSource ? `<tr><th scope="row">${esc(T('f_kind'))}</th><td>${esc(T('cat_' + d.category))}</td><td><span class="dv-src" data-s="${esc(d.kindSource.source)}">${esc(T('src_' + d.kindSource.source))}</span></td><td><span class="dv-conf" data-c="${esc(d.kindSource.confidence)}">${esc(T('conf_' + d.kindSource.confidence))}</span></td></tr>` : ''
    const table = `<table class="dv-facts"><thead><tr><th>${esc(T('colFact'))}</th><th>${esc(T('colValue'))}</th><th>${esc(T('colSource'))}</th><th>${esc(T('colSure'))}</th></tr></thead><tbody>${kind}${rows}</tbody></table>`
    let extra = ''
    if (d.items && d.items.length) {
      extra += `<div class="dv-sub"><h4>${esc(T('modules'))}</h4><ul class="dv-list">${d.items.map(m => `<li><b>${esc(m.locator || '–')}</b> ${esc([m.sizeGB ? m.sizeGB + ' GB' : '', m.type, m.speedMT ? m.speedMT + ' MT/s' : '', m.part].filter(Boolean).join(' · '))}</li>`).join('')}</ul></div>`
    }
    if (d.endpoints && d.endpoints.length) {
      extra += `<div class="dv-sub"><h4>${esc(T('endpoints'))}</h4><ul class="dv-list">${d.endpoints.map(e => `<li>${esc(e.name)}${e.flow ? ` <span class="dv-src" data-s="inferred">${esc(T('flow_' + e.flow))}</span>` : ''}</li>`).join('')}</ul></div>`
    }
    if (d.interfaces && d.interfaces.length > 1) {
      extra += `<details class="dv-sub dv-ifs"><summary>${esc(T('interfaces', { n: d.interfaces.length }))}</summary><ul class="dv-list">${d.interfaces.map(i => `<li><b>${esc(i.hid ? i.hid.label : i.cls)}</b> <code>${esc(i.id)}</code></li>`).join('')}</ul><p class="dv-foot">${esc(T('maskNote'))}</p></details>`
    }
    return `<div class="dv-d-body">${d.virtual ? `<p class="dv-foot">${esc(T('softNote'))}</p>` : ''}${table}${extra}${d.controls ? api.controls(ctx, d) : ''}</div>`
  }

  // ── controls: what can be changed here, what links to Windows, what is only shown ───────────────────────────────────
  api.controls = (ctx, d) => {
    const { T, P, S } = ctx
    const c = d.controls
    if (!c || (!c.change.length && !c.link.length && !c.measure.length && !c.info.length && !c.app)) return ''
    const id = esc(d.id)
    let out = ''
    if (c.measure.length) {
      const p = d.facts.polling
      const last = S.pollNote && S.pollNote[d.id]
      out += `<div class="dv-ctl"><h4>${esc(T('ctl_measure'))}</h4><p>${esc(T('ctl_measureS'))}</p>
        <div class="dv-ctl-row"><button type="button" class="nt-sec sm" data-act="poll" ${S.busy ? 'disabled' : ''}><i class="fa fa-gauge-high" aria-hidden="true"></i>${esc(T('pollBtn'))}</button>
        ${p && p.value != null ? `<span class="dv-res"><b>${esc(p.value + ' Hz')}</b> ${esc(T('conf_' + p.confidence))}${p.snapped === false ? ' · ' + esc(T('pollOdd', { raw: p.rawHz })) : ''}</span>` : `<span class="dv-res dv-na">${esc(T('why_not_measured'))}</span>`}</div>
        ${last ? `<p class="dv-foot">${esc(T('pollRes_' + last))}</p>` : ''}<p class="dv-foot">${esc(T('pollLimits'))}</p></div>`
    }
    if (c.link.length) {
      out += `<div class="dv-ctl"><h4>${esc(T('ctl_link'))}</h4><p>${esc(T('ctl_linkS'))}</p>${c.link.map(l => {
        const on = l.status === 'on' || l.status === 'native'
        return `<div class="dv-ctl-row"><span class="dv-lk"><b>${esc(T('lk_' + l.id))}</b><small>${esc(T('lkS_' + l.id))}</small></span><span class="dv-state" data-on="${on ? '1' : l.status === 'unknown' ? '' : '0'}">${esc(T(on ? 'st_on' : l.status === 'unknown' ? 'st_unknown' : 'st_off'))}</span><button type="button" class="nt-sec sm" data-act="openwin" data-win="${esc(l.windowsId)}">${esc(T('openWin'))}</button></div>`
      }).join('')}</div>`
    }
    if (c.change.length) {
      const dr = S.kbdDraft || c.change[0].value || { delay: 1, speed: 31 }
      out += `<div class="dv-ctl"><h4>${esc(T('ctl_change'))}</h4><p>${esc(T('ctl_kbdS'))}</p>
        <div class="dv-kbd" data-kbd>
          <label>${esc(T('kbdDelay'))}<input type="range" min="0" max="3" step="1" value="${esc(dr.delay)}" data-kbd-delay aria-label="${esc(T('kbdDelay'))}"><b data-kbd-delay-t>${esc(T('kbdMs', { n: P.repeatDelayMs(dr.delay) }))}</b></label>
          <label>${esc(T('kbdSpeed'))}<input type="range" min="0" max="31" step="1" value="${esc(dr.speed)}" data-kbd-speed aria-label="${esc(T('kbdSpeed'))}"><b data-kbd-speed-t>${esc(T('kbdCps', { n: P.repeatCps(dr.speed) }))}</b></label>
        </div>
        <div class="dv-ctl-row"><button type="button" class="nt-cta sm" data-act="kbd-apply" ${S.busy ? 'disabled' : ''}>${esc(T('kbdApply'))}</button><button type="button" class="nt-sec sm" data-act="kbd-undo" ${S.busy ? 'disabled' : ''}>${esc(T('kbdUndo'))}</button>
        <span class="dv-res">${c.change[0].value ? esc(T('kbdNow', { d: P.repeatDelayMs(c.change[0].value.delay), s: P.repeatCps(c.change[0].value.speed) })) : esc(T('kbdUnread'))}</span></div>
        <p class="dv-foot">${esc(T('kbdWhy'))}</p></div>`
    }
    if (c.info.length || c.app) {
      const app = c.app
      out += `<div class="dv-ctl dv-only"><h4><i class="fa fa-eye" aria-hidden="true"></i>${esc(T('ctl_info'))}</h4>
        <p>${esc(app ? T('ctl_infoApp', { app: app.name }) : T('ctl_infoNoApp'))}</p>
        ${c.info.length ? `<ul class="dv-chips">${c.info.map(k => `<li>${esc(T('info_' + k))}</li>`).join('')}</ul>` : ''}
        ${app ? `<div class="dv-ctl-row">${app.installed === true && app.id ? `<button type="button" class="nt-sec sm" data-act="openapp" data-app="${esc(app.id)}"><i class="fa fa-arrow-up-right-from-square" aria-hidden="true"></i>${esc(T('openApp', { app: app.name }))}</button>` : `<span class="dv-na">${esc(app.installed === false ? T('appMissing', { app: app.name }) : T('appUnknown', { app: app.name }))}</span>`}</div>` : ''}
        <p class="dv-foot">${esc(T('noWrites'))}</p></div>`
    }
    return `<div class="dv-controls" data-for="${id}">${out}</div>`
  }

  // ── sections / banners / findings ───────────────────────────────────────
  api.section = (ctx, sec, openSet) => {
    const { T } = ctx
    const folded = sec.kind === 'software' || sec.kind === 'gone'
    const cards = sec.items.map(d => api.card(ctx, d, openSet.has(d.id))).join('')
    return `<section class="dv-sec" data-sec="${esc(sec.id)}"><header class="dv-sec-h"><span class="dv-sec-i" aria-hidden="true"><i class="fa fa-${esc(sec.icon)}"></i></span><h3>${esc(T('grp_' + sec.id))}<b>${sec.items.length}</b></h3><p>${esc(T('grpS_' + sec.id))}</p></header>
      <div class="dv-grid${folded ? ' dv-soft' : ''}">${cards}</div></section>`
  }

  api.finding = (ctx, f) => {
    const { T } = ctx
    return `<div class="dv-find" data-tone="${f.level === 'warn' ? 'warn' : 'info'}"><span class="dv-find-i" aria-hidden="true"><i class="fa fa-${f.level === 'warn' ? 'triangle-exclamation' : 'circle-info'}"></i></span><div class="dv-find-t"><b>${esc(T('fT_' + f.id, f.vars))}</b><span>${esc(T('fS_' + f.id, f.vars))}</span></div>${f.device ? `<button type="button" class="nt-sec sm" data-act="reveal" data-id="${esc(f.device)}">${esc(T('show'))}</button>` : ''}</div>`
  }
})(typeof window !== 'undefined' ? window : globalThis)
