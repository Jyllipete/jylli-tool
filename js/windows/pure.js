'use strict'
// Windows tab, pure helpers (no DOM): status looks, verdict, chips, switchboard columns, preview grouping, warnings. Unit-tested; page.js and views.js use them.
;(function (root) {
  // glyph = Font Awesome name, tone = ok | warn | info | idle (css maps tone -> token)
  const STATUS = {
    on:      { glyph: 'check',              tone: 'ok' },
    native:  { glyph: 'lock',               tone: 'ok' },
    partial: { glyph: 'circle-half-stroke', tone: 'warn' },
    off:     { glyph: 'circle',             tone: 'idle' },
    drifted: { glyph: 'rotate-left',        tone: 'warn' },
    restart: { glyph: 'rotate-right',       tone: 'info' },
    unknown: { glyph: 'circle-question',    tone: 'idle' },
  }
  const LANE_ICON = { gaming: 'gamepad', input: 'computer-mouse', quiet: 'volume-xmark', graphics: 'display', memory: 'memory', privacy: 'user-shield', expert: 'triangle-exclamation', retired: 'box-archive',
    'qol-search': 'magnifying-glass', 'qol-quiet': 'bell-slash', 'qol-explorer': 'folder-open' }
  const CHIPS = ['all', 'rec', 'set', 'open', 'drifted', 'restart', 'risky']

  const statusLook = s => STATUS[s] || STATUS.unknown
  /** Is the switch shown as on? native = Windows already has it (shown on, but locked: Jylli did not set it, so Jylli does not undo it). */
  const isOn = it => it.status === 'on' || it.status === 'native' || it.status === 'restart' || (it.status === 'unknown' && it.remembered === 'applied')
  const isLocked = it => it.status === 'native'
  /** What flipping the switch does. */
  const flipAction = it => (isOn(it) ? 'restore' : 'apply')
  const isExpert = it => it.tier >= 3

  function chipMatch(it, chip) {
    switch (chip) {
      case 'rec': return !!it.rec
      case 'set': return it.status === 'on' || it.status === 'native' || it.status === 'restart'
      case 'open': return it.status === 'off' || it.status === 'partial' || it.status === 'drifted'
      case 'drifted': return it.status === 'drifted'
      case 'restart': return it.status === 'restart' || (it.reboot && it.status !== 'native')
      case 'risky': return it.tier >= 2
      default: return true
    }
  }
  function chipCounts(items) { const o = {}; for (const c of CHIPS) o[c] = items.filter(i => chipMatch(i, c)).length; return o }
  function matches(it, q, text) { q = String(q || '').trim().toLowerCase(); return !q || (String(text || '') + ' ' + it.id).toLowerCase().includes(q) }

  /** Relative time of the live read: { k: 'now'|'min'|'hour'|'day', n } */
  function ago(ms, now) {
    if (!ms) return null
    const d = Math.max(0, (now || Date.now()) - ms), m = Math.round(d / 60000)
    if (m < 1) return { k: 'now', n: 0 }
    if (m < 60) return { k: 'min', n: m }
    if (m < 1440) return { k: 'hour', n: Math.round(m / 60) }
    return { k: 'day', n: Math.round(m / 1440) }
  }

  /** The stage verdict: which sentence, which tone, and the numbers. */
  function verdict(model, stale) {
    const v = model.verdict
    if (!model.live) return { key: 'vUnread', tone: 'idle', vars: {} }
    const base = { set: v.set, total: v.total, rec: v.rec, n: v.drifted, restart: v.restart }
    if (v.drifted) return { key: 'vDrift', tone: 'warn', vars: base }
    if (v.rec) return { key: 'vOpen', tone: stale ? 'idle' : 'accent', vars: base }
    return { key: 'vClean', tone: stale ? 'idle' : 'ok', vars: base }
  }

  /** The switchboard: one column per lane, one cell per switch, in the model's order. */
  function board(model) {
    return model.lanes.map(l => ({ lane: l.id, icon: LANE_ICON[l.id] || 'circle', cells: l.ids.map(id => { const it = model.items.find(i => i.id === id); return { id, status: it.status, rec: it.rec, tier: it.tier } }) }))
  }

  /** Preview before a batch: items grouped by lane, with what the batch will cost. */
  function previewGroups(model, ids) {
    const set = new Set(ids), groups = []
    for (const l of model.lanes) {
      const list = l.ids.filter(id => set.has(id))
      if (list.length) groups.push({ lane: l.id, ids: list })
    }
    const items = model.items.filter(i => set.has(i.id))
    return { groups, n: items.length, restart: items.filter(i => i.reboot).length, restorePoint: items.some(i => i.tier >= 2) || items.length > 5, expert: items.filter(i => i.tier >= 3).map(i => i.id) }
  }

  /** Situation warnings for a row: facts = { laptop, ramGB } -> [{ key, vars }] */
  function warnsFor(it, facts) {
    const out = [], f = facts || {}
    for (const w of it.warn || []) {
      if (w.when === 'laptop' && f.laptop) out.push({ key: w.key, vars: {} })
      else if (w.when === 'ramBelow' && f.ramGB > 0 && f.ramGB < w.n) out.push({ key: w.key, vars: { n: f.ramGB } })
    }
    return out
  }

  /** Receipt wording numbers: what changed, what was read back, what needs attention. */
  function receiptNumbers(r) {
    const c = r.counts || {}
    return { ok: c.ok || 0, failed: c.failed || 0, verified: c.verified || 0, mismatch: c.mismatch || 0, restart: c.restart || 0, total: (r.items || []).length }
  }

  const api = { STATUS, LANE_ICON, CHIPS, statusLook, isOn, isLocked, flipAction, isExpert, chipMatch, chipCounts, matches, ago, verdict, board, previewGroups, warnsFor, receiptNumbers }
  root.JylliWindowsPure = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
