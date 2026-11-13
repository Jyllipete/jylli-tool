'use strict'
// Power tab "Current", pure helpers (no DOM): view ids, verdict, finding actions, number formats, flow speed, plan cards and the plan comparison rows.
// Builds on js/network/pure.js (status looks, chips, batch preview groups): one vocabulary for every verified-switch tab. Unit-tested (test/power-ui.test.js).
;(function (root) {
  const N = root.JylliNetworkPure || (typeof require === 'function' ? require('../network/pure') : {})
  const Pl = root.JylliPowerPlans || (typeof require === 'function' ? require('../../lib/power/plans') : null)
  const LANE_ICON = { plan: 'bolt', links: 'plug-circle-bolt', storage: 'hard-drive', startup: 'power-off', retired: 'box-archive' }
  const VIEWS = ['overview', 'plans', 'sleep', 'energy', 'tune', 'history']
  const VIEW_ICON = { overview: 'gauge-high', plans: 'layer-group', sleep: 'moon', energy: 'bolt', tune: 'sliders', history: 'clock-rotate-left' }
  const TIMEOUTS = [0, 60, 120, 180, 300, 600, 900, 1200, 1800, 2700, 3600, 7200, 10800, 18000]   // same list as lib/power/index.js
  const GROUPS = ['cpu', 'links', 'timeouts']

  const r1 = v => Math.round(v * 10) / 10
  const num = v => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null)

  /** Watts: "–" when not measured, one decimal under 10 W. */
  const fmtW = v => (num(v) == null ? '–' : Math.abs(v) < 10 ? String(r1(v)) : String(Math.round(v)))
  /** Watt-hours: "–", "420 Wh" or "1.25 kWh". */
  const fmtWh = wh => (num(wh) == null ? '–' : wh >= 1000 ? (wh / 1000).toFixed(2) + ' kWh' : wh >= 100 ? Math.round(wh) + ' Wh' : r1(wh) + ' Wh')
  /** Milliseconds -> { h, m, s } descriptor pieces for LANG: "1 h 12 min" is built by the page from these. */
  function parts(ms) { const t = Math.max(0, Math.round((num(ms) || 0) / 1000)); return { h: Math.floor(t / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 } }
  const fmtDur = ms => { const p = parts(ms); return p.h ? p.h + ' h ' + String(p.m).padStart(2, '0') + ' min' : p.m ? p.m + ' min ' + String(p.s).padStart(2, '0') + ' s' : p.s + ' s' }
  const fmtMinutes = m => (num(m) == null ? '–' : m >= 60 ? Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min' : m + ' min')
  /** Money with the user's currency code or symbol; small amounts keep 3 decimals so a 10 minute session does not read 0.00. */
  function fmtCost(c, cur) {
    if (num(c) == null) return '–'
    const d = c < 0.1 ? 3 : 2
    return c.toFixed(d) + ' ' + (cur || '')
  }
  const fmtPct = v => (num(v) == null ? '–' : Math.round(v) + '%')

  /** Seconds the dashes of a flow line take to travel one gap: faster for more watts, still when nothing was measured. */
  function flowDur(w) {
    if (num(w) == null || w <= 0) return null
    return r1(4.2 - 3.4 * Math.min(1, w / 300))
  }
  /** Fill 0..100 for a bar against a soft ceiling (300 W) or a real one. */
  const wattFill = (w, max) => (num(w) == null ? null : Math.max(0, Math.min(100, (w / (max || 300)) * 100)))

  /** The headline of the stage: the worst finding wins, then Windows reverting something, then open recommended switches, then clean. */
  function stageVerdict(model, finds, paused) {
    if (!model) return { kind: 'unread', id: null, tone: 'idle', vars: {} }
    const list = finds || []
    const bad = list.find(f => f.tone === 'bad')
    if (bad) return { kind: 'finding', id: bad.id, tone: 'danger', vars: flat(bad.vars) }
    if (model.drifted && model.drifted.length) return { kind: 'drift', id: null, tone: 'warn', vars: { n: model.drifted.length } }
    const warn = list.find(f => f.tone === 'warn')
    if (warn) return { kind: 'finding', id: warn.id, tone: 'warn', vars: flat(warn.vars) }
    if (model.recommendedIds && model.recommendedIds.length) return { kind: 'open', id: null, tone: 'accent', vars: { n: model.recommendedIds.length } }
    if (paused) return { kind: 'paused', id: null, tone: 'idle', vars: {} }
    return { kind: 'clean', id: null, tone: 'ok', vars: {} }
  }
  function flat(v) {
    const o = {}
    for (const [k, x] of Object.entries(v || {})) if (x != null && typeof x !== 'object') o[k] = typeof x === 'number' ? r1(x) : x
    return o
  }

  /** What a finding's action button does: { kind, label key, ... } or null. */
  function actionOf(f) {
    const a = f && f.action
    if (!a) return null
    if (a.kind === 'view') return { kind: 'view', view: a.view, label: 'actOpen_' + a.view }
    if (a.kind === 'switch') return { kind: 'switch', id: a.id, label: 'actReveal' }
    if (a.kind === 'plan') return { kind: 'plan', guid: a.guid, label: 'actSwitchPlan' }
    if (a.kind === 'tidy') return { kind: 'tidy', label: 'actTidy' }
    if (a.kind === 'mode') return { kind: 'mode', overlay: a.overlay, label: 'actMode' }
    return null
  }

  /** Plans for the Plans view, active first, then built in, then the rest by name: [{ guid, name, kind, active, builtin, own, character, tidy }]. */
  function planCards(facts) {
    if (!facts || !facts.plans) return []
    const rank = p => (p.active ? 0 : p.builtin ? 1 : p.own ? 2 : 3)
    return facts.plans.slice().sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)).map(p => ({
      guid: p.guid, name: p.name, kind: p.kind, active: !!p.active, builtin: !!p.builtin, own: !!p.own, character: Pl ? Pl.character(facts.idx, p.guid) : { kind: 'unread' }, tidy: Pl ? Pl.deletable(p) : false,
    }))
  }

  /** Comparison rows of the selected plan against the active one, grouped: [{ group, rows:[{ id, a:{ac,dc}, b:{ac,dc}, differs }] }]. Rows both plans do not expose are left out. */
  function compareRows(facts, guidB) {
    if (!Pl || !facts || !facts.activeGuid || !guidB) return []
    const rows = Pl.diff(facts.idx, facts.activeGuid, guidB).filter(r => r.a.ac != null || r.a.dc != null || r.b.ac != null || r.b.dc != null)
    return GROUPS.map(g => ({ group: g, rows: rows.filter(r => r.group === g) })).filter(g => g.rows.length)
  }

  /** A value descriptor ({kind, n}) -> text through LANG key "d_<kind>" with {n}; null = "–". */
  function descText(T, d) { return d ? T('d_' + d.kind, { n: d.n }) : '–' }

  /** The battery as a line of facts for the source node: { state, big, sub|null } using only what was read. */
  function sourceOf(facts, frame) {
    const b = facts && facts.battery
    if (!b) return { kind: 'wall', percent: null, rateW: null, minutes: null, state: 'wall' }
    const live = frame && frame.bat
    const rateW = live && live.rateW != null ? live.rateW : b.rateW
    return { kind: 'battery', percent: b.percent, state: live ? (live.discharging ? 'discharging' : live.charging ? 'charging' : live.ac ? 'ac' : b.state) : b.state, rateW, minutes: b.state === 'discharging' ? b.minutesLeft : b.minutesToFull }
  }

  /** The watts a live frame carries (the page receives them already computed in the frame message): { cpuW, gpuW, total|null, cpuSrc, gpuSrc }. */
  function wattsRow(frame) {
    const w = (frame && frame.watts) || {}
    const cpuW = num(w.cpuW), gpuW = num(w.gpuW)
    const total = cpuW == null && gpuW == null ? null : (cpuW || 0) + (gpuW || 0)
    return { cpuW, gpuW, total, cpuSrc: w.cpuSrc || null, gpuSrc: w.gpuSrc || null, gpuLoad: num(w.gpuLoad), perf: frame ? num(frame.perf) : null, util: frame ? num(frame.util) : null }
  }

  /** Which words name the total: 'both' | 'gpu' | 'cpu' (null when nothing was measured). */
  const totalKind = w => (w.cpuW != null && w.gpuW != null ? 'both' : w.gpuW != null ? 'gpu' : w.cpuW != null ? 'cpu' : null)

  /** Session records -> rows for the Energy view, newest first, with cost per record when a price existed then. */
  function sessionRows(list) {
    return (list || []).map(s => ({ at: s.at, ms: s.ms, label: s.label || '', game: s.game || '', whTotal: s.whTotal, cpuWh: s.cpu ? s.cpu.wh : null, gpuWh: s.gpu ? s.gpu.wh : null, avgW: s.ms > 0 && s.whTotal != null ? r1(s.whTotal / (s.ms / 3600000)) : null, peakW: Math.max(s.cpu ? s.cpu.peakW : 0, s.gpu ? s.gpu.peakW : 0) || null, cost: s.cost, currency: s.currency }))
  }

  /** Last minute of a series as SVG paths in a w x h box: { line, area }. null breaks the line; the scale never drops below `floor` watts so noise stays flat. */
  function areaPaths(values, w, h, floor = 40) {
    const have = (values || []).filter(v => v != null)
    if (!have.length) return { line: '', area: '' }
    const max = Math.max(floor, ...have) * 1.12, step = w / 59, off = w - (values.length - 1) * step
    const segs = []; let cur = []
    values.forEach((v, i) => { if (v == null) { if (cur.length) segs.push(cur); cur = []; return } cur.push([off + i * step, h - 1 - Math.max(0, Math.min(1, v / max)) * (h - 3)]) })
    if (cur.length) segs.push(cur)
    const pt = p => r1(p[0]) + ',' + r1(p[1])
    return {
      line: segs.map(sg => 'M' + sg.map(pt).join(' L')).join(' '),
      area: segs.filter(sg => sg.length > 1).map(sg => 'M' + r1(sg[0][0]) + ',' + h + ' L' + sg.map(pt).join(' L') + ' L' + r1(sg[sg.length - 1][0]) + ',' + h + ' Z').join(' '),
    }
  }

  /** CPU state range of a plan on AC for the profile bar: { min, max } in %, or null when the plan does not expose it. */
  function planProfile(facts, guid) {
    if (!Pl || !facts || !facts.idx) return null
    const v = id => Pl.valuesOf(facts.idx, guid, Pl.byAnat[id]).ac
    const min = v('cpuMin'), max = v('cpuMax')
    return min == null || max == null ? null : { min: Math.max(0, Math.min(100, min)), max: Math.max(0, Math.min(100, max)) }
  }

  /** The last 7 characters of a GUID: tells apart plans that share a name. */
  const shortId = g => String(g || '').slice(-7)

  const api = { ...N, totalKind, areaPaths, planProfile, shortId, LANE_ICON, VIEWS, VIEW_ICON, TIMEOUTS, GROUPS, fmtW, fmtWh, fmtDur, fmtMinutes, fmtCost, fmtPct, parts, flowDur, wattFill, stageVerdict, actionOf, planCards, compareRows, descText, sourceOf, wattsRow, sessionRows }
  root.JylliPowerPure = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
