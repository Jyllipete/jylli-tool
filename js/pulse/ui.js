'use strict'
// Pulse shared view builders. Pure: each takes data and the copy function T(key, vars) and returns an HTML string, so the tab,
// the Cockpit window and the tests all use the same markup. A value that was not measured is shown as an en dash with a
// "Not measured" title, never as 0. Every string that reaches the DOM goes through esc().
;(function (root) {
  const isNode = typeof module !== 'undefined' && module.exports
  const Steps = isNode ? require('../../lib/pulse/steps') : root.JylliPulseSteps
  const Score = isNode ? require('../../lib/pulse/score') : root.JylliPulseScore

  const DASH = '–'
  const has = v => typeof v === 'number' && Number.isFinite(v)
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const n0 = v => (has(v) ? String(Math.round(v)) : null)
  const n1 = v => (has(v) ? (Math.round(v * 10) / 10).toFixed(1) : null)
  const show = v => (v == null ? DASH : v)
  /** evidence object -> template vars; a null becomes the dash so a sentence never says "null" */
  const vars = ev => { const o = {}; for (const k of Object.keys(ev || {})) o[k] = ev[k] == null ? DASH : ev[k]; return o }

  function clock(sec) {
    sec = Math.max(0, Math.round(sec || 0))
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
  }
  const SRC = { sensor: 'srcSensor', nvidia: 'srcNvidia', os: 'srcOs', pulse: 'srcPulse' }
  const srcName = (src, T) => (src && SRC[src] ? T(SRC[src]) : '')

  // ── fps strip ─────────────────────────────────────────────────────────────────
  function fpsCells(fps) {
    return [
      ['avg', fps ? n0(fps.avg) : null, 'FPS'], ['low1', fps ? n0(fps.low1) : null, 'FPS'], ['low01', fps ? n0(fps.low01) : null, 'FPS'],
      ['p99', fps ? n1(fps.p99Ms) : null, 'ms'], ['smooth', fps ? n0(fps.smooth) : null, '/100'],
    ]
  }
  function fpsStrip(fps, T) {
    return fpsCells(fps).map(([k, v, u]) => `<div data-k="${k}" data-na="${v == null ? 1 : 0}"><dt title="${esc(T('tip_' + k))}">${esc(T('fps_' + k))}</dt><dd>${v == null ? `<span title="${esc(T('notMeasured'))}">${DASH}</span>` : esc(v)}<small>${esc(u)}</small></dd></div>`).join('')
  }

  // ── vitals ────────────────────────────────────────────────────────────────────
  // main: the hub key shown big; sub: [{ key, unit, label }] shown small under it
  const TILES = [
    { k: 'cpu', main: 'cpu.load', unit: '%', sub: [{ key: 'cpu.temp.package', unit: '°C' }, { key: 'cpu.power', unit: 'W' }] },
    { k: 'gpu', main: 'gpu0.load', unit: '%', sub: [{ key: 'gpu0.temp.core', unit: '°C' }, { key: 'gpu0.temp.hotspot', unit: '°C', hot: true }] },
    { k: 'gpuClock', main: 'gpu0.clock.core', unit: 'MHz', sub: [{ key: 'gpu0.power', unit: 'W' }] },
    { k: 'vram', main: 'gpu0.vram.used', unit: 'GB', div: 1024, dec: 1, sub: [{ key: 'gpu0.vram.total', unit: 'GB', div: 1024, dec: 1, of: true }] },
    { k: 'ram', main: 'ram.load', unit: '%', sub: [] },
    { k: 'net', main: 'net.rx', unit: 'MB/s', div: 1048576, dec: 1, sub: [{ key: 'net.tx', unit: 'MB/s', div: 1048576, dec: 1, up: true }] },
  ]
  function tileValue(vit, key, def) {
    const e = vit && vit[key]
    if (!e || !has(e.v)) return null
    const v = def.div ? e.v / def.div : e.v
    return def.dec ? n1(v) : n0(v)
  }
  function vitalsHtml(T) {
    return TILES.map(t => `<div class="pu-tile" data-k="${t.k}" data-state="na"><div class="pu-tile-h"><span>${esc(T('vt_' + t.k))}</span><em class="pu-src"></em></div><div class="pu-tile-v"><b>${DASH}</b><small>${esc(t.unit)}</small></div><div class="pu-tile-s"></div></div>`).join('')
  }
  /** Updates the tiles built by vitalsHtml in place; no innerHTML churn at 4 Hz. */
  function paintVitals(host, vit, T) {
    for (const t of TILES) {
      const el = host.querySelector(`[data-k="${t.k}"]`); if (!el) continue
      const e = vit && vit[t.main]
      const val = tileValue(vit, t.main, t)
      const stale = e && has(e.age) && e.age > 5000
      el.dataset.state = val == null ? 'na' : stale ? 'stale' : 'ok'
      el.querySelector('b').textContent = show(val)
      el.querySelector('b').title = val == null ? T('notMeasured') : ''
      el.querySelector('.pu-src').textContent = val == null ? '' : srcName(e.src, T)
      el.querySelector('.pu-tile-s').textContent = t.sub.map(s => {
        const sv = tileValue(vit, s.key, s)
        return sv == null ? '' : (s.of ? '/ ' : s.up ? '↑ ' : '') + sv + ' ' + s.unit
      }).filter(Boolean).join(' · ')
    }
  }

  // ── limiter ───────────────────────────────────────────────────────────────────
  function limiterHtml(l, T) {
    l = l || { id: 'idle', tone: 'idle', evidence: {}, suggest: { kind: 'none' } }
    const sg = l.suggest && l.suggest.kind !== 'none' ? `<button type="button" class="pu-sec" data-act="suggest" data-kind="${esc(l.suggest.kind)}" data-target="${esc(l.suggest.target)}">${esc(T('sug_' + l.suggest.target))}<i class="fa fa-arrow-right" aria-hidden="true"></i></button>` : ''
    return `<div class="pu-eyebrow"><span class="pu-dot" data-tone="${esc(l.tone)}"></span><span>${esc(T('limiter'))}</span></div><h3 class="pu-lim-t">${esc(T('lim_' + l.id, vars(l.evidence)))}</h3><p class="pu-muted">${esc(T('limw_' + l.id, vars(l.evidence)))}</p>${sg}`
  }

  // ── hitch log ──
  const HIT_TONE = { thermal: 'danger', 'vram-full': 'danger', 'ram-pressure': 'danger', 'background-spike': 'warn', 'gpu-bound': 'warn', 'cpu-bound': 'warn', 'clock-drop': 'warn' }
  /** the last few hitches of the river, newest first: when, how long the slowest frame took, and the likely cause */
  function hitLog(live, max) {
    const cols = (live && live.cols) || [], out = []
    for (let i = cols.length - 1; i >= 0 && out.length < (max || 5); i--) {
      const c = cols[i]
      if (c[5]) out.push({ ago: Math.round((cols.length - 1 - i) * 0.25), ms: Math.round(c[3]), cause: c[5] })
    }
    return out
  }
  function hitLogHtml(live, T) {
    const rows = hitLog(live, 5)
    if (!rows.length) return `<div class="pu-hitlog"><h4 class="pu-h">${esc(T('hitLog'))}</h4><p class="pu-muted">${esc(T('hitNone'))}</p></div>`
    return `<div class="pu-hitlog"><h4 class="pu-h">${esc(T('hitLog'))}</h4><ul>${rows.map(r => `<li><span class="pu-mono">${esc(T('hitAgo', { n: r.ago }))}</span><span class="pu-mono">${r.ms} ms</span><em class="pu-chip" data-tone="${HIT_TONE[r.cause] || 'idle'}">${esc(causeName(r.cause, T))}</em></li>`).join('')}</ul></div>`
  }

  // ── boost receipt ─────────────────────────────────────────────────────────────
  function receiptHtml(boost, T) {
    const by = {}
    for (const s of (boost && boost.steps) || []) by[s.id] = s
    const rows = Steps.IDS.map(id => {
      const s = by[id]
      const st = s ? s.state : (boost && boost.active ? 'skip' : 'idle')
      const icon = st === 'ok' ? 'circle-check' : st === 'fail' ? 'circle-xmark' : st === 'run' ? 'circle-notch' : st === 'skip' ? 'minus' : 'circle'
      return `<li data-state="${st}" title="${esc(s && s.detail || '')}"><i class="fa fa-${icon}" aria-hidden="true"></i><span>${esc(T('step_' + id))}</span><em>${esc(T('stepState_' + st))}</em></li>`
    })
    return `<ul class="pu-steps">${rows.join('')}</ul>`
  }

  // ── pre-flight ────────────────────────────────────────────────────────────────
  function preflightHtml(res, T) {
    if (!res) return ''
    const items = res.items.map(i => {
      const fix = i.fix ? `<button type="button" class="pu-sec" data-act="fix" data-kind="${esc(i.fix.kind)}" data-target="${esc(i.fix.target || '')}">${esc(T('pfFix_' + (i.fix.target || i.fix.kind)))}</button>` : ''
      const icon = i.state === 'ok' ? 'circle-check' : i.state === 'unknown' ? 'circle-question' : i.state === 'bad' ? 'circle-exclamation' : 'triangle-exclamation'
      return `<li class="pu-pf" data-state="${i.state}"><i class="fa fa-${icon}" aria-hidden="true"></i><div><h4>${esc(T('pf_' + i.id))}</h4><p class="pu-muted">${esc(T('pfw_' + i.id + '_' + i.state, vars(i.evidence)))}</p></div>${fix}</li>`
    })
    return `<ul class="pu-pf-list">${items.join('')}</ul>`
  }

  // ── sessions ──────────────────────────────────────────────────────────────────
  const causeName = (id, T) => T('cause_' + id)
  const verdictName = (v, T) => (v == null ? DASH : v === 'clean' ? T('verdict_clean') : causeName(v, T))
  function when(ts, T) {
    const d = Math.max(0, Date.now() - ts), m = Math.floor(d / 60000)
    if (m < 1) return T('ago_now'); if (m < 60) return T('ago_min', { n: m })
    const h = Math.floor(m / 60); if (h < 24) return T('ago_hour', { n: h })
    return T('ago_day', { n: Math.floor(h / 24) })
  }
  /** polyline points for a ribbon of { fps } at w x h, a gap where fps is null */
  function ribbonPath(ribbon, w, h) {
    const v = (ribbon || []).map(r => (r && has(r.fps) ? r.fps : null))
    const known = v.filter(x => x != null)
    if (known.length < 2) return ''
    const lo = Math.min(...known), hi = Math.max(...known), span = Math.max(1, hi - lo)
    let d = '', pen = false
    v.forEach((x, i) => {
      if (x == null) { pen = false; return }
      const px = (i / Math.max(1, v.length - 1)) * w, py = h - 2 - ((x - lo) / span) * (h - 4)
      d += (pen ? 'L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1); pen = true
    })
    return d
  }
  function sessionsHtml(list, T) {
    if (!list || !list.length) return `<div class="pu-empty"><i class="fa fa-wave-square" aria-hidden="true"></i><h3>${esc(T('noSessions'))}</h3><p class="pu-muted">${esc(T('noSessionsWhy'))}</p></div>`
    return `<ul class="pu-sess">${list.map(s => {
      const tone = Score.tone(s.score)
      const name = esc((s.game && s.game.name) || (s.game && s.game.id) || '')
      const path = ribbonPath(s.ribbon, 120, 28)
      return `<li><button type="button" class="pu-sess-row" data-act="open-session" data-id="${esc(s.id)}">
        <span class="pu-sess-main"><b>${name}</b><span class="pu-muted">${esc(when(s.startedAt, T))} · ${esc(clock(s.durationSec))}</span></span>
        <svg class="pu-spark" viewBox="0 0 120 28" aria-hidden="true">${path ? `<path d="${path}"/>` : ''}</svg>
        <span class="pu-sess-fps">${s.summary && has(s.summary.avgFps) ? esc(n0(s.summary.avgFps)) : DASH}<small>${esc(T('fps_avg'))}</small></span>
        <span class="pu-chip" data-tone="${s.verdict === 'clean' ? 'ok' : s.verdict ? 'warn' : 'idle'}">${esc(verdictName(s.verdict, T))}</span>
        <span class="pu-sess-score" data-tone="${tone}">${s.score == null ? DASH : esc(s.score)}</span></button></li>`
    }).join('')}</ul>`
  }

  function deltaHtml(v, unit, goodWhenPositive) {
    if (!has(v)) return DASH
    const good = goodWhenPositive ? v > 0 : v < 0
    const sign = v > 0 ? '+' : v < 0 ? '−' : ''
    return `<span class="pu-delta" data-good="${v === 0 ? 'flat' : good ? 'up' : 'down'}">${sign}${Math.abs(v)}${esc(unit || '')}</span>`
  }

  function debriefHtml(d, T) {
    if (!d) return ''
    const sm = d.summary || {}
    const tone = Score.tone(d.score)
    const head = d.verdict === 'clean' ? T('deb_clean') : T('deb_cause', { cause: causeName(d.verdict, T) })
    const lead = d.verdict === 'clean' ? T('deb_cleanWhy') : T('deb_hitches', { n: d.hitches.length })
    const maxC = Math.max(1, ...d.causes.map(c => c.hitches))
    const causes = d.causes.length ? d.causes.map(c => `<li><span>${esc(causeName(c.id, T))}</span><i style="--w:${Math.round(c.hitches / maxC * 100)}%"></i><b>${c.hitches}</b></li>`).join('') : `<li class="pu-muted">${esc(T('deb_noCauses'))}</li>`
    const parts = (d.scoreParts || []).map(p => `<li data-na="${p.value == null ? 1 : 0}"><span>${esc(T('part_' + p.key))}</span><i style="--w:${p.value == null ? 0 : Math.round(p.value * 100)}%"></i><b>${p.value == null ? DASH : Math.round(p.value * 100)}</b></li>`).join('')
    const ba = d.beforeAfter ? (() => {
      const rows = [['cpu', '%'], ['gpu', '%'], ['ram', '%'], ['cpuTemp', '°C']].map(([k, u]) => {
        const b = d.beforeAfter.baseline[k], a = d.beforeAfter.during[k]
        return `<tr><th scope="row">${esc(T('ba_' + k))}</th><td>${has(b) ? esc(n0(b)) + u : DASH}</td><td>${has(a) ? esc(n0(a)) + u : DASH}</td></tr>`
      }).join('')
      return `<section class="pu-card"><h4 class="pu-h">${esc(T('deb_beforeAfter'))}</h4><table class="pu-table"><thead><tr><th></th><th scope="col">${esc(T('ba_before'))}</th><th scope="col">${esc(T('ba_during'))}</th></tr></thead><tbody>${rows}</tbody></table><p class="pu-muted">${esc(T('ba_note'))}</p></section>`
    })() : ''
    const vs = d.vsLast ? `<section class="pu-card"><h4 class="pu-h">${esc(T('deb_vsLast'))}</h4><dl class="pu-vs"><div><dt>${esc(T('fps_avg'))}</dt><dd>${deltaHtml(d.vsLast.avgFps, '', true)}</dd></div><div><dt>${esc(T('fps_low1'))}</dt><dd>${deltaHtml(d.vsLast.low1Fps, '', true)}</dd></div><div><dt>${esc(T('deb_score'))}</dt><dd>${deltaHtml(d.vsLast.score, '', true)}</dd></div><div><dt>${esc(T('deb_hitchesLabel'))}</dt><dd>${deltaHtml(d.vsLast.hitches, '', true)}</dd></div></dl></section>` : ''
    const marks = d.marks && d.marks.length ? `<section class="pu-card"><h4 class="pu-h">${esc(T('deb_marks'))}</h4><ul class="pu-marks">${d.marks.map(m => `<li><b>${esc(clock(m.sec))}</b><span>${esc(m.label || T('mark'))}</span></li>`).join('')}</ul></section>` : ''
    const boost = d.boost ? `<p class="pu-muted">${esc(T('deb_boost', { ok: d.boost.ok, total: d.boost.total }))}</p>` : `<p class="pu-muted">${esc(T('deb_noBoost'))}</p>`
    return `<div class="pu-deb"><div class="pu-deb-top"><div class="pu-score" data-tone="${tone}"><b>${d.score == null ? DASH : esc(d.score)}</b><small>/1000</small><span>${esc(T('deb_score'))}</span></div><div class="pu-deb-v"><h3>${esc(head)}</h3><p class="pu-muted">${esc(lead)}</p>${boost}</div></div>
      <div class="pu-river pu-river-s" data-river="session" role="img" aria-label="${esc(T('riverAria'))}"></div>
      <dl class="pu-fps">${[['avg', n0(sm.avgFps), 'FPS'], ['low1', n0(sm.low1Fps), 'FPS'], ['low01', n0(sm.low01Fps), 'FPS'], ['hitches', String(d.hitches.length), ''], ['length', clock(d.durationSec), '']].map(([k, v, u]) => `<div data-na="${v == null ? 1 : 0}"><dt>${esc(T('fps_' + k))}</dt><dd>${show(v == null ? null : esc(v))}<small>${esc(u)}</small></dd></div>`).join('')}</dl>
      <div class="pu-cols2"><section class="pu-card"><h4 class="pu-h">${esc(T('deb_causes'))}</h4><ul class="pu-bars">${causes}</ul></section><section class="pu-card"><h4 class="pu-h">${esc(T('deb_parts'))}</h4><ul class="pu-bars">${parts}</ul></section></div>
      <div class="pu-cols2">${ba}${vs}</div>${marks}</div>`
  }

  const api = { DASH, esc, n0, n1, show, vars, clock, srcName, fpsCells, fpsStrip, TILES, tileValue, vitalsHtml, paintVitals, limiterHtml, hitLog, hitLogHtml, receiptHtml, preflightHtml, causeName, verdictName, when, ribbonPath, sessionsHtml, deltaHtml, debriefHtml }
  root.JylliPulseUI = api
  if (isNode) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
