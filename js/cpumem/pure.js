'use strict'
// CPU & Memory tab, pure helpers (no DOM): view ids, lane icons, verdict, finding text variables, die model (topology + one live frame), number formats.
// Builds on js/network/pure.js (status looks, chips, receipt numbers, batch preview groups): one vocabulary for every verified-switch tab. Unit-tested.
;(function (root) {
  const N = root.JylliNetworkPure || (typeof require === 'function' ? require('../network/pure') : {})
  const LANE_ICON = { processor: 'microchip', corepower: 'bolt-lightning', memory: 'memory', tradeoffs: 'triangle-exclamation', retired: 'box-archive' }
  const VIEWS = ['overview', 'tune', 'lab', 'history']
  const PLAN_ICON = { pcores: 'bolt', vcache: 'layer-group', skip0: 'forward-step' }

  const r1 = v => Math.round(v * 10) / 10
  /** MB -> "6.1 GB" / "640 MB" */
  function fmtMB(mb) {
    if (mb == null || !Number.isFinite(mb)) return '–'
    return mb >= 1024 ? r1(mb / 1024) + ' GB' : Math.round(mb) + ' MB'
  }
  /** MHz -> "4.62" (GHz, 2 decimals) or "–" */
  const fmtGHz = mhz => (mhz > 0 ? (mhz / 1000).toFixed(2) : '–')
  const pct = v => (v == null || !Number.isFinite(v) ? '–' : Math.round(v) + '%')

  /** Load -> a tone for the tile fill: idle < 35, ok < 75, warn < 92, bad above. */
  function loadTone(u) { return u == null ? 'idle' : u < 35 ? 'idle' : u < 75 ? 'ok' : u < 92 ? 'warn' : 'bad' }

  /**
   * The die the page draws: topology groups -> cores -> threads, each thread with its latest numbers (frame may be null: no numbers yet).
   * highlight: array of logical numbers a core plan would keep (their tiles are marked), or null.
   */
  function dieModel(topo, frame, highlight) {
    if (!topo || !topo.ok) return null
    const byN = new Map(((frame && frame.cpu && frame.cpu.cores) || []).map(c => [c.n, c]))
    const keep = highlight ? new Set(highlight) : null
    const groups = topo.groups.map(g => {
      const cores = g.cores.map(ci => {
        const core = topo.cores[ci]
        const threads = core.threads.map(n => { const t = byN.get(n); return { n, util: t ? t.util : null, mhz: t ? t.mhz : null, parked: t ? t.parked : false, keep: keep ? keep.has(n) : null } })
        const have = threads.filter(t => t.util != null)
        const util = have.length ? Math.max(...have.map(t => t.util)) : null
        const mhz = have.length ? Math.round(have.reduce((a, t) => a + (t.mhz || 0), 0) / have.length) : null
        return { index: ci, threads, util, mhz, parked: have.length > 0 && have.every(t => t.parked), keep: keep ? threads.some(t => t.keep) : null }
      })
      const have = cores.filter(c => c.util != null)
      return { id: g.id, kind: g.kind, label: g.label, l3MB: g.l3MB, vcache: g.vcache, cores, util: have.length ? Math.round(have.reduce((a, c) => a + c.util, 0) / have.length) : null,
        parked: cores.filter(c => c.parked).length }
    })
    return { groups, hybrid: topo.hybrid, logical: topo.logical, physical: topo.physical }
  }

  /** The package readout: load, effective clock (GHz), parked cores. frame may be null. */
  function packageRead(frame, base) {
    const t = frame && frame.cpu && frame.cpu.total
    if (!t) return { util: null, mhz: null, ratio: null, parked: 0 }
    return { util: Math.round(t.util), mhz: t.mhz || null, ratio: base && t.mhz ? r1(t.mhz / base) : null, parked: frame.cpu.parkedCount || 0 }
  }

  /**
   * The headline of the stage: the worst finding wins, then Windows reverting something, then open recommended switches, then clean.
   * Returns { kind, id|null, tone: 'danger'|'warn'|'ok'|'idle'|'accent', vars }
   */
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

  /** What a finding's action button does, as { kind, label key, ... } for the page. */
  function actionOf(f) {
    const a = f && f.action
    if (!a) return null
    if (a.kind === 'bios') return { kind: 'tab', tab: 'bios', label: 'actBios' }
    if (a.kind === 'consumers') return { kind: 'consumers', label: 'actConsumers' }
    if (a.kind === 'switch') return { kind: 'switch', id: a.id, label: 'actApply' }
    if (a.kind === 'reveal') return { kind: 'reveal', id: a.id, label: 'actReveal' }
    if (a.kind === 'url') return { kind: 'url', url: a.url, label: 'actOpen' }
    return null
  }

  /** Strata bar parts with a LANG key each. */
  const PART_KEYS = { active: 'memActive', modified: 'memModified', standby: 'memStandby', free: 'memFree' }

  /** A running-program entry from getProcesses/consumers -> display name without .exe. */
  const progName = n => String(n || '').replace(/\.exe$/i, '')

  const api = { ...N, LANE_ICON, VIEWS, PLAN_ICON, PART_KEYS, fmtMB, fmtGHz, pct, loadTone, dieModel, packageRead, stageVerdict, actionOf, progName }
  root.JylliCpuMemPure = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
