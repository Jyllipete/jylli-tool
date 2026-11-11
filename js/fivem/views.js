'use strict'
// FiveM 2.0 views besides Uplink: Sessions (flight recorder), Graphics, Client, Crash lab. Each builder gets (host, ctx) and returns
// { refresh }. ctx = { T, esc, el, ago, A, S, show, rescan, toast, confirm }. Pure helpers are exported for node tests.
;(function (root) {
  // ── pure ──
  /** Polyline path over `vals` (null breaks the line), scaled into w x h between lo and hi. */
  function pathOf(vals, w, h, lo, hi) {
    const n = vals.length
    if (n < 2) return ''
    const span = hi - lo || 1
    let d = '', pen = false
    for (let i = 0; i < n; i++) {
      const v = vals[i]
      if (v == null || !Number.isFinite(v)) { pen = false; continue }
      const x = (i / (n - 1)) * w, y = h - ((Math.min(hi, Math.max(lo, v)) - lo) / span) * h
      d += (pen ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)
      pen = true
    }
    return d
  }
  const secs = s => { const m = Math.floor(s / 60), r = Math.round(s % 60); return m + ':' + String(r).padStart(2, '0') }
  const CAUSE_TONE = { thermal: 'danger', 'vram-full': 'danger', 'ram-pressure': 'warn', 'gpu-bound': 'warn', 'cpu-bound': 'warn', 'clock-drop': 'warn', unknown: 'idle' }
  /** hitch list -> { cause: count } by primary cause. */
  const causeCounts = hs => hs.reduce((o, h) => { o[h.primary] = (o[h.primary] || 0) + 1; return o }, {})
  /** pending changes merged over the file's values. */
  const merged = (values, pending) => ({ ...values, ...pending })
  const GFX_STEP_LABEL = /^[a-z]/i

  const api = { pathOf, secs, CAUSE_TONE, causeCounts, merged }
  root.JylliFivemViews = Object.assign(root.JylliFivemViews || {}, { pure: api })
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof document === 'undefined') return

  const V = root.JylliFivemViews
  const noop = () => {}

  // ───────────────────────── Sessions ─────────────────────────
  V.sessions = function (host, ctx) {
    const { T, esc, el, A, S } = ctx
    const st = { rows: null, sel: null, data: null, loading: false }
    const wrap = el('div', 'fv-split')
    const listBox = el('aside', 'fv-slist')
    const detail = el('div', 'fv-sdetail')
    wrap.append(listBox, detail)
    host.appendChild(wrap)

    function paintList() {
      if (st.rows == null) { listBox.innerHTML = `<p class="fv-muted">${esc(T('loading'))}</p>`; return }
      if (!st.rows.length) { listBox.innerHTML = `<h3 class="fv-h">${esc(T('sessions'))}</h3><p class="fv-muted">${esc(T('noSessions'))}</p>`; return }
      listBox.innerHTML = `<h3 class="fv-h">${esc(T('sessions'))}</h3>` + st.rows.map(r => {
        const d = new Date(r.startedAt)
        return `<button type="button" class="fv-srow" data-id="${esc(r.id)}" aria-pressed="${r.id === st.sel}"><span class="fv-srow-t">${esc(d.toLocaleDateString())} ${esc(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</span>` +
          `<span class="fv-srow-s">${esc(secs(r.durationSec))}${r.summary && r.summary.avgFps ? ' · ' + Math.round(r.summary.avgFps) + ' fps' : ''}${r.server ? ' · ' + esc(r.server.name || r.server.host) : ''}</span></button>`
      }).join('')
    }
    listBox.addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) select(b.dataset.id) })

    async function load() {
      const r = await A().fivem2Sessions().catch(() => null)
      st.rows = r && r.ok ? r.sessions : []
      paintList()
      if (!st.sel && st.rows.length) select(st.rows[0].id)
      else if (!st.rows.length) detail.innerHTML = `<div class="fv-empty"><i class="fa fa-chart-line" aria-hidden="true"></i><h3>${esc(T('noSessionsT'))}</h3><p>${esc(T('noSessionsB'))}</p></div>`
    }
    async function select(id) {
      st.sel = id; paintList()
      detail.innerHTML = `<p class="fv-muted">${esc(T('loading'))}</p>`
      const r = await A().fivem2Session({ id }).catch(() => null)
      if (st.sel !== id) return
      if (!r || !r.ok) { detail.innerHTML = `<p class="fv-muted">${esc(T('sessionGone'))}</p>`; return }
      st.data = r; paintDetail()
    }

    function chart(d) {
      const { session: s, net, analysis: a } = d
      const n = s.bins.length, W = 960
      const ms = s.bins.map(b => (b && b.fps > 0 ? 1000 / b.fps : null))
      const mx = s.bins.map(b => (b && b.frames ? b.maxMs : null))
      const top = Math.max(50, Math.min(250, Math.max(...mx.filter(v => v != null), 50)))
      const band = h => `<rect class="fv-hb" data-tone="${CAUSE_TONE[h.primary] || 'idle'}" x="${(h.startSec / Math.max(1, n - 1)) * W}" y="0" width="${Math.max(3, ((h.endSec - h.startSec + 1) / Math.max(1, n - 1)) * W)}" height="150"/>`
      const frame = `<svg class="fv-chart" viewBox="0 0 ${W} 150" role="img" aria-label="${esc(T('chFrame'))}" preserveAspectRatio="none">${a.hitches.map(band).join('')}<path class="fv-l-max" d="${pathOf(mx, W, 150, 0, top)}"/><path class="fv-l-ms" d="${pathOf(ms, W, 150, 0, top)}"/></svg>`
      let netSvg = ''
      if (net && net.rtt.length > 1) {
        const off = net.offsetSec, rtt = new Array(n).fill(undefined)
        net.rtt.forEach((v, i) => { const k = i + off; if (k >= 0 && k < n) rtt[k] = v })
        const cover = rtt.map(v => (v === undefined ? null : v))
        const vals = cover.filter(v => v != null)
        const rt = Math.max(60, Math.min(400, vals.length ? Math.max(...vals) : 60))
        const lost = rtt.map((v, i) => (v === null ? `<line class="fv-lost" x1="${(i / Math.max(1, n - 1)) * W}" x2="${(i / Math.max(1, n - 1)) * W}" y1="0" y2="60"/>` : '')).join('')
        netSvg = `<svg class="fv-chart fv-chart-s" viewBox="0 0 ${W} 60" role="img" aria-label="${esc(T('chNet'))}" preserveAspectRatio="none">${lost}<path class="fv-l-net" d="${pathOf(cover, W, 60, 0, rt)}"/></svg>`
      }
      let loadSvg = ''
      if (s.seconds > 0 && s.series && (s.series['gpu0.load'] || s.series['cpu.load'])) {
        loadSvg = `<svg class="fv-chart fv-chart-s" viewBox="0 0 ${W} 60" role="img" aria-label="${esc(T('chLoad'))}" preserveAspectRatio="none"><path class="fv-l-gpu" d="${pathOf(s.series['gpu0.load'] || [], W, 60, 0, 100)}"/><path class="fv-l-cpu" d="${pathOf(s.series['cpu.load'] || [], W, 60, 0, 100)}"/></svg>`
      }
      return `<div class="fv-chartbox"><div class="fv-cl"><span>${esc(T('chFrame'))}</span><span class="fv-leg"><i class="fv-sw fv-sw-ms"></i>${esc(T('lgAvg'))}<i class="fv-sw fv-sw-max"></i>${esc(T('lgWorst'))}</span></div>${frame}` +
        (netSvg ? `<div class="fv-cl"><span>${esc(T('chNet'))}${net.server ? ' · ' + esc(net.server.name || net.server.host) : ''}</span><span class="fv-leg">${esc(T('lgLost'))}</span></div>${netSvg}` : '') +
        (loadSvg ? `<div class="fv-cl"><span>${esc(T('chLoad'))}</span><span class="fv-leg"><i class="fv-sw fv-sw-gpu"></i>GPU<i class="fv-sw fv-sw-cpu"></i>CPU</span></div>${loadSvg}` : '') +
        `<div class="fv-axis"><span>0:00</span><span>${esc(secs(n))}</span></div></div>`
    }

    function paintDetail() {
      const d = st.data; if (!d) return
      const { session: s, analysis: a, net } = d
      const sum = s.summary || {}
      const counts = causeCounts(a.hitches)
      const cell = (k, v) => `<div><dt>${esc(T('ss_' + k))}</dt><dd>${v == null ? '<span class="fv-na">–</span>' : esc(v)}</dd></div>`
      const hit = a.hitches.slice(0, 40).map(h => `<li data-tone="${CAUSE_TONE[h.primary] || 'idle'}"><span class="fv-mono">${esc(secs(h.startSec))}</span><span class="fv-hw">${esc(h.worstMs)} ms</span><span class="fv-pill" data-tone="${CAUSE_TONE[h.primary] || 'idle'}">${esc(T('cause_' + h.primary))}</span><span class="fv-muted">${esc(h.causes.length > 1 ? h.causes.slice(1).map(c => T('cause_' + c)).join(', ') : '')}</span></li>`).join('')
      const ne = a.net.slice(0, 20).map(e => `<li data-tone="${e.type === 'spike' ? 'warn' : 'danger'}"><span class="fv-mono">${esc(secs(e.startSec + (net ? net.offsetSec : 0)))}</span><span class="fv-hw">${e.worst ? esc(e.worst) + ' ms' : esc(secs(e.endSec - e.startSec + 1))}</span><span class="fv-pill" data-tone="${e.type === 'spike' ? 'warn' : 'danger'}">${esc(T('net_' + e.type))}</span></li>`).join('')
      const causeChips = Object.entries(counts).sort((x, y) => y[1] - x[1]).map(([c, n]) => `<span class="fv-pill" data-tone="${CAUSE_TONE[c] || 'idle'}">${esc(T('cause_' + c))} · ${n}</span>`).join('')
      detail.innerHTML = `<dl class="fv-stats">${cell('dur', secs(s.durationSec))}${cell('avg', sum.avgFps ? Math.round(sum.avgFps) + ' fps' : null)}${cell('low1', sum.low1Fps ? Math.round(sum.low1Fps) + ' fps' : null)}${cell('hitches', String(a.hitches.length))}</dl>` +
        chart(d) +
        `<div class="fv-cols"><section><h3 class="fv-h">${esc(T('hitches'))}</h3>${causeChips ? `<div class="fv-pills">${causeChips}</div>` : ''}` +
        (hit ? `<ul class="fv-ev">${hit}</ul>` : `<p class="fv-muted">${esc(T('noHitches'))}</p>`) +
        (!a.hasTelemetry ? `<p class="fv-muted">${esc(T('noTelemetry'))}</p>` : '') + `</section>` +
        `<section><h3 class="fv-h">${esc(T('netEvents'))}</h3>` + (net ? (ne ? `<ul class="fv-ev">${ne}</ul>` : `<p class="fv-muted">${esc(T('noNetEvents'))}</p>`) : `<p class="fv-muted">${esc(T('noNet'))}</p>`) +
        `<p class="fv-muted">${esc(T('netNote'))}</p></section></div>`
    }

    load()
    return { refresh: load }
  }

  // ───────────────────────── Graphics ─────────────────────────
  V.graphics = function (host, ctx) {
    const { T, esc, el, A, S } = ctx
    const Gfx = root.JylliFivemGraphics
    const st = { pending: {} }
    const box = el('div', 'fv-gfx')
    host.appendChild(box)
    const optLabel = l => (GFX_STEP_LABEL.test(l) ? T('o_' + l) : l)
    const gfx = () => S.report && S.report.gfx
    const running = () => !!(S.report && S.report.running)

    function paint() {
      const r = S.report
      if (!r) { box.innerHTML = `<p class="fv-muted">${esc(T('loading'))}</p>`; return }
      if (!r.loc.installed) { box.innerHTML = empty('notInstalled'); return }
      const g = gfx()
      if (!g) { box.innerHTML = empty('noGfx'); return }
      if (!g.structure) { box.innerHTML = empty('corruptGfx'); return }
      const vals = merged(g.values, st.pending)
      const load = Gfx.load(vals)
      const groups = Gfx.GROUPS.map(gr => {
        const rows = Gfx.DEFS.filter(d => d.group === gr && g.values[d.key] != null).map(d => {
          const cur = vals[d.key], changed = Object.prototype.hasOwnProperty.call(st.pending, d.key)
          const opts = d.opts.map(o => `<option value="${esc(o[0])}"${Gfx.canonValue(d.key, cur) === o[0] ? ' selected' : ''}>${esc(optLabel(o[1]))}</option>`).join('')
          const unknown = Gfx.canonValue(d.key, cur) == null ? `<option value="" selected>${esc(T('customValue', { v: cur }))}</option>` : ''
          return `<div class="fv-grow" data-changed="${changed}"><label for="fv-g-${esc(d.key)}"><span class="fv-gl">${esc(T('g_' + d.key))}</span><span class="fv-imp" role="img" aria-label="${esc(T('impact', { n: d.impact }))}">${'<i></i>'.repeat(d.impact)}</span></label><select id="fv-g-${esc(d.key)}" class="fv-in" data-key="${esc(d.key)}">${unknown}${opts}</select></div>`
        }).join('')
        return rows ? `<section class="fv-gg"><h3 class="fv-h">${esc(T('gg_' + gr))}</h3>${rows}</section>` : ''
      }).join('')
      const n = Object.keys(st.pending).length
      const tex = vals.TextureQuality != null && g.textureLimit != null && Number(vals.TextureQuality) > g.textureLimit
      box.innerHTML = `<div class="fv-gtop"><div class="fv-meter" data-tone="${load == null ? 'idle' : load < 30 ? 'ok' : load < 60 ? 'warn' : 'danger'}"><div class="fv-meter-h"><span>${esc(T('loadT'))}</span><strong>${load == null ? '–' : esc(load) + '%'}</strong></div><div class="fv-meter-bar"><i style="width:${load == null ? 0 : load}%"></i></div><p class="fv-muted">${esc(T('loadNote'))}</p></div>` +
        `<div class="fv-presets" role="group" aria-label="${esc(T('presets'))}">${['performance', 'balanced', 'quality'].map(p => `<button type="button" class="fv-sec" data-preset="${p}">${esc(T('pre_' + p))}</button>`).join('')}</div></div>` +
        (running() ? `<p class="fv-banner" data-tone="warn" role="status">${esc(T('gameRunningW'))}</p>` : '') +
        (g.vramMB ? `<p class="fv-muted">${esc(T('vramNote', { gb: Math.round(g.vramMB / 102.4) / 10 }))}</p>` : `<p class="fv-muted">${esc(T('vramUnknown'))}</p>`) +
        (tex ? `<p class="fv-banner" data-tone="warn" role="status">${esc(T('t_texture-vram', { q: vals.TextureQuality, limit: g.textureLimit, vram: Math.round(g.vramMB / 102.4) / 10 }))}</p>` : '') +
        `<div class="fv-ggrid">${groups}</div>` +
        `<div class="fv-bar2"><span class="fv-muted">${esc(n ? T('pending', { n }) : T('noPending'))}</span><span class="fv-bar2-b"><button type="button" class="fv-sec" data-act="undo">${esc(T('undoGfx'))}</button><button type="button" class="fv-sec" data-act="discard"${n ? '' : ' disabled'}>${esc(T('discard'))}</button><button type="button" class="fv-cta" data-act="apply"${n && !running() ? '' : ' disabled'}>${esc(n ? T('applyN', { n }) : T('apply'))}</button></span></div>`
    }
    const empty = k => `<div class="fv-empty"><i class="fa fa-sliders" aria-hidden="true"></i><h3>${esc(T('e_' + k + 'T'))}</h3><p>${esc(T('e_' + k + 'B'))}</p></div>`

    box.addEventListener('change', e => {
      const s = e.target.closest('select[data-key]'); if (!s || !s.value) return
      const g = gfx(), key = s.dataset.key
      if (Gfx.canonValue(key, g.values[key]) === s.value) delete st.pending[key]; else st.pending[key] = s.value
      paint()
    })
    box.addEventListener('click', async e => {
      const p = e.target.closest('[data-preset]')
      if (p) {
        const r = await A().fivem2GfxPreset({ name: p.dataset.preset }).catch(() => null)
        if (r && r.ok) { st.pending = r.changes; paint(); if (!Object.keys(r.changes).length) ctx.toast(T('presetSame'), '', 'ok') } else ctx.toast(T('presetFail'), '', 'err')
        return
      }
      const b = e.target.closest('[data-act]'); if (!b) return
      if (b.dataset.act === 'discard') { st.pending = {}; paint() }
      else if (b.dataset.act === 'apply') {
        const changes = st.pending, n = Object.keys(changes).length
        try { await ctx.confirm({ title: T('cf_gfx_t'), body: T('cf_gfx_b', { n }), okText: T('cf_gfx_ok'), okStyle: 'warning', icon: 'sliders' }) } catch { return }
        const r = await A().fivem2GfxWrite({ changes }).catch(() => null)
        if (r && r.ok) { st.pending = {}; ctx.toast(T('gfxSaved', { n: r.changed.length }), T('gfxSavedB'), 'ok'); ctx.rescan() }
        else ctx.toast(T('gfxFail'), T('werr_' + ((r && r.error) || 'x')), 'err')
      } else if (b.dataset.act === 'undo') {
        const r = await A().fivem2Undo({ id: 'gfx' }).catch(() => null)
        ctx.toast(r && r.ok ? T('undoDone') : T('undoFail'), '', r && r.ok ? 'ok' : 'err'); st.pending = {}; ctx.rescan()
      }
    })
    paint()
    return { refresh: paint }
  }

  // ───────────────────────── Client ─────────────────────────
  V.client = function (host, ctx) {
    const { T, esc, el, A, S } = ctx
    const Ini = root.JylliFivemIni
    const st = { pending: {} }
    const box = el('div', 'fv-client')
    host.appendChild(box)
    const running = () => !!(S.report && S.report.running)

    function paint() {
      const r = S.report
      if (!r) { box.innerHTML = `<p class="fv-muted">${esc(T('loading'))}</p>`; return }
      if (!r.loc.installed) { box.innerHTML = `<div class="fv-empty"><i class="fa fa-screwdriver-wrench" aria-hidden="true"></i><h3>${esc(T('e_notInstalledT'))}</h3><p>${esc(T('e_notInstalledB'))}</p></div>`; return }
      const lock = running() ? `<p class="fv-banner" data-tone="warn" role="status">${esc(T('gameRunningW'))}</p>` : ''
      const tw = r.tweaks.map(t => `<article class="fv-twk" data-applied="${t.applied === true}"><div class="fv-twk-t"><h4>${esc(T('n_' + t.id))}${t.admin ? `<span class="fv-pill" data-tone="idle">${esc(T('adminTag'))}</span>` : ''}</h4><p>${esc(T('d_' + t.id))}</p>${t.risk === 'confirm' ? `<p class="fv-risk">${esc(T('r_' + t.id))}</p>` : ''}</div>` +
        `<div class="fv-twk-b">${t.applied === true ? `<span class="fv-pill" data-tone="ok">${esc(T('applied'))}</span><button type="button" class="fv-sec" data-act="undo" data-id="${esc(t.id)}">${esc(T('undo'))}</button>` : t.applied === null ? `<span class="fv-muted">${esc(T('unknownState'))}</span>` : `<button type="button" class="fv-sec" data-act="apply" data-id="${esc(t.id)}" data-risk="${esc(t.risk)}">${esc(T('apply'))}</button>`}</div></article>`).join('')
      const ini = r.ini
      let iniHtml
      if (!r.loc.iniExists || !ini) iniHtml = `<p class="fv-muted">${esc(T('noIni'))}</p>`
      else {
        const rows = ini.known.map(k => {
          const cur = Object.prototype.hasOwnProperty.call(st.pending, k.key) ? st.pending[k.key] : k.value
          const changed = Object.prototype.hasOwnProperty.call(st.pending, k.key)
          let ctl
          if (!k.editable) ctl = `<span class="fv-mono fv-path">${esc(cur == null ? T('notSet') : cur)}</span>`
          else if (k.type === 'bool01') ctl = `<label class="fv-sw2"><input type="checkbox" data-key="${esc(k.key)}"${cur === '1' ? ' checked' : ''}${running() ? ' disabled' : ''}><span>${esc(cur === '1' ? T('on') : T('off'))}</span></label>`
          else if (k.type === 'enum') ctl = `<select class="fv-in" data-key="${esc(k.key)}"${running() ? ' disabled' : ''}>${cur == null ? `<option value="" selected>${esc(T('notSet'))}</option>` : ''}${k.values.map(v => `<option value="${esc(v)}"${cur === v ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>`
          else ctl = `<input class="fv-in fv-in-s" type="text" inputmode="numeric" data-key="${esc(k.key)}" value="${esc(cur == null ? '' : cur)}" placeholder="${esc(T('notSet'))}"${running() ? ' disabled' : ''}>`
          return `<div class="fv-grow" data-changed="${changed}"><div class="fv-ik"><span class="fv-gl fv-mono">${esc(k.key)}</span><span class="fv-muted">${esc(T('kd_' + k.key))}${k.key === 'EnableFullMemoryDump' ? ' ' + esc(T('kw_EnableFullMemoryDump')) : ''}</span></div>${ctl}</div>`
        }).join('')
        const other = ini.other.length ? `<details class="fv-hops"><summary>${esc(T('otherKeys', { n: ini.other.length }))}</summary><div class="fv-tw2">${ini.other.map(o => `<div class="fv-mono">${esc(o.section ? '[' + o.section + '] ' : '')}${esc(o.key)} = ${esc(o.value)}</div>`).join('')}</div><p class="fv-muted">${esc(T('otherNote'))}</p></details>` : ''
        const n = Object.keys(st.pending).length
        iniHtml = `<div class="fv-ggrid fv-ggrid1">${rows}</div>${other}<div class="fv-bar2"><span class="fv-muted">${esc(n ? T('pending', { n }) : T('noPending'))}</span><span class="fv-bar2-b"><button type="button" class="fv-sec" data-act="undo" data-id="ini">${esc(T('undoIni'))}</button><button type="button" class="fv-sec" data-act="idiscard"${n ? '' : ' disabled'}>${esc(T('discard'))}</button><button type="button" class="fv-cta" data-act="isave"${n && !running() ? '' : ' disabled'}>${esc(n ? T('applyN', { n }) : T('apply'))}</button></span></div>`
      }
      const c = r.cache
      const cache = `<div class="fv-cache"><div class="fv-cache-t"><strong>${esc(c.mb)} MB</strong><span class="fv-muted">${esc(T('cacheNote'))}</span>${c.folders.map(f => `<span class="fv-pill" data-tone="idle">${esc(T('cf_' + f.key))} · ${f.mb} MB</span>`).join('')}</div><button type="button" class="fv-sec" data-act="cache"${running() ? ' disabled' : ''}>${esc(T('clearCache'))}</button></div>`
      const leg = r.legacy && r.legacy.length ? `<section class="fv-sec2"><h3 class="fv-h">${esc(T('legacyT'))}</h3><p class="fv-muted">${esc(T('legacyB'))}</p>${r.legacy.map(id => `<div class="fv-leg2"><span>${esc(T('ln_' + id))}</span><button type="button" class="fv-sec" data-act="legacy" data-id="${esc(id)}">${esc(T('restore'))}</button></div>`).join('')}</section>` : ''
      const hud = `<section class="fv-sec2"><h3 class="fv-h">${esc(T('hudT'))}</h3><p class="fv-muted">${esc(T('hudB'))}</p><div class="fv-cache"><label class="fv-sw2"><input type="checkbox" data-hud="auto"${root.settings && root.settings.fivemHudEnabled ? ' checked' : ''}><span>${esc(T('hudAuto'))}</span></label><span class="fv-bar2-b"><button type="button" class="fv-sec" data-act="hud-show">${esc(T('hudShow'))}</button><button type="button" class="fv-sec" data-act="hud-hide">${esc(T('hudHide'))}</button></span></div></section>`
      box.innerHTML = lock + `<section class="fv-sec2"><h3 class="fv-h">${esc(T('changesT'))}</h3><div class="fv-twl">${tw}</div></section><section class="fv-sec2"><h3 class="fv-h">${esc(T('iniT'))}</h3><p class="fv-muted">${esc(T('iniB'))}</p>${iniHtml}</section><section class="fv-sec2"><h3 class="fv-h">${esc(T('cacheT'))}</h3>${cache}</section>${hud}${leg}`
    }

    box.addEventListener('change', async e => {
      const h = e.target.closest('[data-hud="auto"]')
      if (h) {
        root.settings.fivemHudEnabled = h.checked
        const ok = await A().saveSettings(root.settings).then(() => true).catch(() => false)
        if (!ok) { root.settings.fivemHudEnabled = !h.checked; h.checked = !h.checked; ctx.toast(T('hudSaveFail'), '', 'err') }
        return
      }
      const t = e.target.closest('[data-key]'); if (!t) return
      const key = t.dataset.key, k = S.report.ini.known.find(x => x.key === key)
      const v = t.type === 'checkbox' ? (t.checked ? '1' : '0') : t.value.trim()
      if (t.type !== 'checkbox' && v === '') { delete st.pending[key]; paint(); return }
      const ok = Ini.validate(key, v)
      if (!ok.ok) { ctx.toast(T('badValue'), '', 'err'); delete st.pending[key]; paint(); return }
      if (k && k.value === ok.value) delete st.pending[key]; else st.pending[key] = ok.value
      paint()
    })
    box.addEventListener('click', async e => {
      const b = e.target.closest('[data-act]'); if (!b) return
      const act = b.dataset.act, id = b.dataset.id
      if (act === 'idiscard') { st.pending = {}; paint(); return }
      if (act === 'hud-show') { A().openFivemHud(); return }
      if (act === 'hud-hide') { A().closeFivemHud(); return }
      if (act === 'isave') {
        const r = await A().fivem2IniWrite({ changes: st.pending }).catch(() => null)
        if (r && r.ok) { st.pending = {}; ctx.toast(T('iniSaved', { n: r.changed.length }), T('iniSavedB'), 'ok'); ctx.rescan() }
        else ctx.toast(T('iniFail'), T('werr_' + ((r && r.error) || 'x')), 'err')
        return
      }
      if (act === 'apply') {
        if (b.dataset.risk === 'confirm') { try { await ctx.confirm({ title: T('cf_' + id + '_t'), body: T('r_' + id), okText: T('cf_ok'), okStyle: 'warning', icon: 'shield-halved' }) } catch { return } }
        b.disabled = true
        const r = await A().fivem2Apply({ id }).catch(() => null)
        if (r && r.ok) ctx.toast(T('n_' + id), T('appliedToast'), 'ok'); else ctx.toast(T('applyFail'), T('aerr_' + ((r && r.error) || 'x')), 'err')
        ctx.rescan(); return
      }
      if (act === 'undo') {
        const r = await A().fivem2Undo({ id }).catch(() => null)
        ctx.toast(r && r.ok ? T('undoDone') : T('undoFail'), '', r && r.ok ? 'ok' : 'err'); ctx.rescan(); return
      }
      if (act === 'cache') {
        try { await ctx.confirm({ title: T('cf_cache_t'), body: T('cf_cache_b'), okText: T('cf_cache_ok'), okStyle: 'warning', icon: 'broom' }) } catch { return }
        b.disabled = true
        const r = await A().fivem2CacheClear().catch(() => null)
        if (r && r.ok) ctx.toast(T('cacheDone'), T('cacheDoneB'), 'ok'); else ctx.toast(T('cacheFail'), r && r.error === 'game-running' ? T('werr_game-running') : '', 'err')
        ctx.rescan(); return
      }
      if (act === 'legacy') {
        const r = await A().fivem2LegacyRestore({ id }).catch(() => null)
        ctx.toast(r && r.ok ? T('undoDone') : T('undoFail'), '', r && r.ok ? 'ok' : 'err'); ctx.rescan()
      }
    })
    paint()
    return { refresh: paint }
  }

  // ───────────────────────── Crash lab ─────────────────────────
  V.crash = function (host, ctx) {
    const { T, esc, el, A, S } = ctx
    const st = { log: null, mods: null, filter: 'all', q: '', loading: false }
    const box = el('div', 'fv-crash')
    host.appendChild(box)

    function paint() {
      if (!S.report) { box.innerHTML = `<p class="fv-muted">${esc(T('loading'))}</p>`; return }
      if (!S.report.loc.installed) { box.innerHTML = `<div class="fv-empty"><i class="fa fa-bug" aria-hidden="true"></i><h3>${esc(T('e_notInstalledT'))}</h3><p>${esc(T('e_notInstalledB'))}</p></div>`; return }
      const L = st.log
      let diag = '', logHtml = ''
      if (L && L.ok) {
        diag = L.found.length ? L.found.map(f => `<article class="fv-find" data-sev="warn"><div class="fv-find-t"><h4>${esc(T('sig_' + f.id))}${f.count > 1 ? ` <span class="fv-muted">×${f.count}</span>` : ''}</h4><p>${esc(T('sigf_' + f.id))}</p><p class="fv-mono fv-sample">${esc(f.sample)}</p></div></article>`).join('') : `<p class="fv-muted">${esc(T('noSigs'))}</p>`
        const q = st.q.toLowerCase()
        const lines = L.lines.filter(l => (st.filter === 'all' || l.sev === st.filter || (st.filter === 'warn' && l.sev === 'error')) && (!q || l.text.toLowerCase().includes(q)))
        logHtml = `<div class="fv-logbar"><div class="fv-fchips" role="group" aria-label="${esc(T('logFilter'))}">${['all', 'error', 'warn'].map(f => `<button type="button" class="fv-chipb" data-f="${f}" aria-pressed="${st.filter === f}">${esc(T('lf_' + f))}</button>`).join('')}</div><input type="search" class="fv-in" id="fv-lq" value="${esc(st.q)}" placeholder="${esc(T('logSearch'))}" aria-label="${esc(T('logSearch'))}"><span class="fv-muted">${esc(L.file)} · ${esc(ctx.ago(Date.now() - L.at))}</span></div>` +
          `<div class="fv-log" tabindex="0" aria-label="${esc(T('logAria'))}">${lines.map(l => `<div class="fv-ll" data-sev="${l.sev}"><span class="fv-lx"></span><span class="fv-mono">${esc(l.text)}</span></div>`).join('') || `<p class="fv-muted">${esc(T('noLines'))}</p>`}</div>`
      } else if (L && !L.ok) logHtml = `<p class="fv-muted">${esc(T(L.error === 'no-log' ? 'noLog' : 'logFail'))}</p>`
      else logHtml = `<p class="fv-muted">${esc(T('loading'))}</p>`
      const M = st.mods
      const modsHtml = M && M.ok ? (M.found.length ? M.found.map(m => `<article class="fv-find" data-sev="${m.sev === 'high' ? 'bad' : m.sev === 'medium' ? 'warn' : 'info'}"><div class="fv-find-t"><h4>${esc(m.file)}</h4><p>${esc(T('mod_' + m.id))}</p><p class="fv-mono fv-sample">${esc(m.dir)}</p></div></article>`).join('') : `<p class="fv-muted">${esc(T('noMods'))}</p>`) : `<p class="fv-muted">${esc(T('loading'))}</p>`
      box.innerHTML = `<div class="fv-cols"><section><div class="fv-sh"><h3 class="fv-h">${esc(T('diagT'))}</h3><button type="button" class="fv-sec" data-act="reload"><i class="fa fa-rotate" aria-hidden="true"></i><span>${esc(T('reload'))}</span></button></div>${diag || ''}<p class="fv-muted">${esc(T('diagNote'))}</p>${logHtml}</section>` +
        `<section><h3 class="fv-h">${esc(T('modsT'))}</h3><p class="fv-muted">${esc(T('modsB'))}</p>${modsHtml}</section></div>`
    }
    box.addEventListener('click', e => {
      const f = e.target.closest('[data-f]'); if (f) { st.filter = f.dataset.f; paint(); return }
      if (e.target.closest('[data-act="reload"]')) load()
    })
    box.addEventListener('input', e => { if (e.target.id === 'fv-lq') { st.q = e.target.value; const pos = e.target.selectionStart; paint(); const n = box.querySelector('#fv-lq'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos) } catch { noop() } } } })
    async function load() {
      st.log = null; st.mods = null; paint()
      const [l, m] = await Promise.all([A().fivem2Logs().catch(() => ({ ok: false, error: 'x' })), A().fivem2Mods().catch(() => ({ ok: false }))])
      st.log = l; st.mods = m; paint()
      const lg = box.querySelector('.fv-log'); if (lg) lg.scrollTop = lg.scrollHeight
    }
    paint(); if (S.report && S.report.loc.installed) load()
    return { refresh: () => { if (S.report && S.report.loc.installed && !st.log) load(); else paint() } }
  }
})(typeof window !== 'undefined' ? window : globalThis)
