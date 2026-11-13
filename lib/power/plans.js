'use strict'
;(function (root) {
// Power plans, pure. What a plan is made of (ANATOMY), what kind it is, a one-line character, what can be tidied, and the difference between two plans.
// Values come from CIM Win32_PowerSettingDataIndex (detect.js), which is the same in every Windows language. Nothing here touches the PC.
const GUID = {
  saver: 'a1841308-3541-4fab-bc81-f71556f20b4a', balanced: '381b4222-f694-41f0-9685-ff5bb260df2e',
  high: '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c', ultimate: 'e9a42b02-d5df-448d-aa00-03f14749eb61',
}
const BUILTIN = new Set(Object.values(GUID))
const OVERLAY = { efficiency: '961cc777-2547-4f9d-8174-7d86181b8a7a', balanced: '00000000-0000-0000-0000-000000000000', performance: 'ded574b5-45a0-4f42-8737-46345c09c238', max: '3af9b8d9-7c97-431d-ad78-34a8bfea439f' }
const PROC = '54533251-82be-4824-96c1-47b60b740d00', SLEEP = '238c9fa8-0aad-41ed-83f4-97be242c8f20', VIDEO = '7516b95f-f776-4464-8c53-06167f40cc99'
const JYLLI_NAMES = /^(Intel|AMD) Max Performance$/i

// Every setting the tab reads: key = sub|setting, unit = how its value is shown (pct | sec | enum | mode), writable timeouts are marked.
const ANATOMY = [
  { id: 'cpuMin', sub: PROC, setting: '893dee8e-2bef-41e0-89c6-b55d0929964c', unit: 'pct', group: 'cpu' },
  { id: 'cpuMax', sub: PROC, setting: 'bc5038f7-23e0-4960-96da-33abaf5935ec', unit: 'pct', group: 'cpu' },
  { id: 'boost', sub: PROC, setting: 'be337238-0d82-4146-a960-4f3749d470c7', unit: 'boost', group: 'cpu' },
  { id: 'epp', sub: PROC, setting: '36687f9e-e3a5-4dbf-b1dc-15eb381c6863', unit: 'pct', group: 'cpu' },
  { id: 'parking', sub: PROC, setting: '0cc5b647-c1df-4637-891a-dec35c318583', unit: 'pct', group: 'cpu' },
  { id: 'aspm', sub: '501a4d13-42af-4429-9ac1-df54c6bf3fc2', setting: 'ee12f906-d277-404b-b6da-e5fa1a576df5', unit: 'aspm', group: 'links' },
  { id: 'usb', sub: '2a737441-1930-4402-8d77-b2bebba308a3', setting: '48e6b7a6-50f5-4782-a5d4-53bb8f07e226', unit: 'onoff', group: 'links' },
  { id: 'disk', sub: '0012ee47-9041-4b5d-9b77-535fba8b1442', setting: '6738e2c4-e8a5-4a42-b16a-e040e769756e', unit: 'sec', group: 'links' },
  { id: 'display', sub: VIDEO, setting: '3c0bc021-c8a8-4e07-a973-6b14cbcb2b7e', unit: 'sec', group: 'timeouts', timeout: true },
  { id: 'sleep', sub: SLEEP, setting: '29f6c1db-86da-48c5-9fdb-f2b67b1f44da', unit: 'sec', group: 'timeouts', timeout: true },
  { id: 'hibernate', sub: SLEEP, setting: '9d7815a6-7ee4-497e-8888-515a05f02364', unit: 'sec', group: 'timeouts' },
]
const byAnat = Object.fromEntries(ANATOMY.map(a => [a.id, a]))
const keyOf = a => a.sub + '|' + a.setting

const guidKey = g => String(g || '').toLowerCase().replace(/[{}]/g, '')
const isGuid = g => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(g || ''))

function schemeKind(guid, name) {
  const g = guidKey(guid)
  for (const k of Object.keys(GUID)) if (GUID[k] === g) return k
  if (JYLLI_NAMES.test(String(name || '').trim())) return 'jylli'
  return g ? 'custom' : null
}

/** Raw script output -> [{guid, name, active, kind, builtin, own}] without duplicates by guid. Never throws. */
function normalize(list) {
  const seen = new Set(), out = []
  for (const p of Array.isArray(list) ? list : []) {
    const guid = guidKey(p && p.guid)
    if (!isGuid(guid) || seen.has(guid)) continue
    seen.add(guid)
    const name = String((p && p.name) || '').trim().slice(0, 80)
    out.push({ guid, name, active: p.active === true, kind: schemeKind(guid, name), builtin: BUILTIN.has(guid), own: JYLLI_NAMES.test(name) })
  }
  return out
}

/** The value of one anatomy row on one plan: { ac, dc } numbers or null when the plan does not expose it. */
function valuesOf(idx, guid, a) {
  const p = (idx && idx[guidKey(guid)]) || null
  const k = keyOf(a)
  const n = v => (v == null || !Number.isFinite(Number(v)) ? null : Number(v))
  return { ac: p && p.AC ? n(p.AC[k]) : null, dc: p && p.DC ? n(p.DC[k]) : null }
}

const fmtSec = s => (s === 0 ? { kind: 'never' } : s < 120 ? { kind: 'sec', n: s } : s % 3600 === 0 ? { kind: 'hour', n: s / 3600 } : { kind: 'min', n: Math.round(s / 60) })
/** A value as a small descriptor the page turns into text with LANG: { kind, n? }. null in = null out (shown as "–"). */
function describe(a, v) {
  if (v == null) return null
  switch (a.unit) {
    case 'pct': return { kind: 'pct', n: v }
    case 'sec': return fmtSec(v)
    case 'onoff': return { kind: v === 1 ? 'on' : 'off' }
    case 'aspm': return { kind: ['aspmOff', 'aspmModerate', 'aspmMax'][v] || 'other', n: v }
    case 'boost': return { kind: ['boostOff', 'boostEnabled', 'boostAggressive', 'boostEfficientEnabled', 'boostEfficientAggressive', 'boostAggressiveGuaranteed', 'boostEfficientGuaranteed'][v] || 'other', n: v }
    default: return { kind: 'num', n: v }
  }
}

/** One-line character of a plan, from facts only: { kind: 'saver'|'balanced'|'performance'|'custom', ... } */
function character(idx, guid) {
  const v = id => valuesOf(idx, guid, byAnat[id]).ac
  const max = v('cpuMax'), min = v('cpuMin'), boost = v('boost'), aspm = v('aspm'), park = v('parking')
  if (max == null && min == null && boost == null) return { kind: 'unread' }
  const flags = []
  if (min != null && min >= 50) flags.push('pinned')
  if (max != null && max < 100) flags.push('capped')
  if (boost === 0) flags.push('noBoost')
  if (boost != null && boost >= 2) flags.push('boosting')
  if (aspm === 0) flags.push('linksAwake')
  if (park != null && park >= 100) flags.push('allCores')
  const kind = flags.includes('capped') || flags.includes('noBoost') ? 'saver' : flags.includes('pinned') ? 'performance' : 'balanced'
  return { kind, flags, cpuMin: min, cpuMax: max }
}

/** Plans that can be removed: not built in, not active, not the one Windows would fall back on. */
const deletable = p => !!p && !p.builtin && !p.active && isGuid(p.guid)
/** Duplicate groups: several plans with the same name (what "clutter" means). Returns [{name, guids}] with 2 or more. */
function duplicates(plans) {
  const by = new Map()
  for (const p of plans || []) { if (p.builtin) continue; const k = p.name.toLowerCase(); (by.get(k) || by.set(k, []).get(k)).push(p.guid) }
  return [...by].filter(([, g]) => g.length > 1).map(([name, guids]) => ({ name, guids }))
}
/** Plans offered for tidying: every custom plan that is not active (the user chooses; duplicates and Jylli's own are pre-selected by the page). */
const tidyable = plans => (plans || []).filter(deletable)

/** Rows where two plans differ, AC and DC: [{id, group, a:{ac,dc}, b:{ac,dc}, differs}] */
function diff(idx, guidA, guidB) {
  return ANATOMY.map(a => {
    const x = valuesOf(idx, guidA, a), y = valuesOf(idx, guidB, a)
    return { id: a.id, group: a.group, a: x, b: y, differs: (x.ac !== y.ac && !(x.ac == null && y.ac == null)) || (x.dc !== y.dc && !(x.dc == null && y.dc == null)) }
  })
}

const exported = { GUID, OVERLAY, BUILTIN, ANATOMY, byAnat, keyOf, guidKey, isGuid, schemeKind, normalize, valuesOf, describe, character, deletable, duplicates, tidyable, diff, JYLLI_NAMES }
if (typeof module !== 'undefined' && module.exports) module.exports = exported
if (typeof window !== 'undefined') root.JylliPowerPlans = exported
})(typeof window !== 'undefined' ? window : globalThis)
