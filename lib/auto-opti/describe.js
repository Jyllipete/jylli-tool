'use strict'
// Journal change -> something a person can read: "Background recording  On -> Off", "Refresh rate  60 -> 165 Hz".
// Known registry values get a label key (translated by the renderer); anything else falls back to the raw name and values.

// name (lowercase) -> { key, fmt: 'onoff'|'invonoff'|'num', unit? }
const REG = {
  gamedvr_enabled: { key: 'bgCapture', fmt: 'onoff' }, appcaptureenabled: { key: 'bgCapture', fmt: 'onoff' },
  autogamemodeenabled: { key: 'gameMode', fmt: 'onoff' }, allowautogamemode: { key: 'gameMode', fmt: 'onoff' },
  hwschmode: { key: 'hags', fmt: 'hags' },
  mousespeed: { key: 'mouseAccel', fmt: 'onoff' },
  hiberbootenabled: { key: 'fastStartup', fmt: 'onoff' },
  dodownloadmode: { key: 'deliveryOpt', fmt: 'dom' },
  allowtelemetry: { key: 'telemetry', fmt: 'num' },
  powerthrottlingoff: { key: 'powerThrottling', fmt: 'invonoff' },
  startupdelayinmsec: { key: 'explorerDelay', fmt: 'num', unit: 'ms' },
  disabledeletenotification: { key: 'trim', fmt: 'invonoff' },
  visualfxsetting: { key: 'visualEffects', fmt: 'num' },
  directxuserglobalsettings: { key: 'windowedGames', fmt: 'raw' },
  disablewebsearch: { key: 'webSearch', fmt: 'invonoff' }, bingsearchenabled: { key: 'webSearch', fmt: 'onoff' },
  silentinstalledappsenabled: { key: 'nudges', fmt: 'onoff' },
  flags: { key: 'stickyKeys', fmt: 'num' },
}

function val(state) {
  if (!state || state.exists === false) return null
  return state.value
}

function fmtValue(v, fmt) {
  if (v == null) return { v: null, fmt: 'unset' }
  const n = Number(v)
  switch (fmt) {
    case 'onoff': return { v: n ? 'on' : 'off', fmt: 'onoff' }
    case 'invonoff': return { v: n ? 'off' : 'on', fmt: 'onoff' }
    case 'hags': return { v: n === 2 ? 'on' : 'off', fmt: 'onoff' }
    case 'dom': return { v: n === 0 ? 'off' : 'on', fmt: 'onoff' }
    case 'num': return { v: String(v), fmt: 'raw' }
    default: return { v: String(v), fmt: 'raw' }
  }
}

/** One journal change -> { labelKey, label, before, after, unit }. `label` is the raw item name for per-item rows. */
function describeChange(c) {
  if (!c) return null
  if (c.kind === 'reg') {
    if (/StartupApproved/i.test(c.path || c.key || '')) {
      const b = c.before && c.before.exists && Array.isArray(c.before.value) ? c.before.value[0] : c.before && c.before.value
      const a = c.after && c.after.exists && Array.isArray(c.after.value) ? c.after.value[0] : c.after && c.after.value
      return { labelKey: 'startupItem', label: c.name, before: { v: (Number(b) & 1) ? 'off' : 'on', fmt: 'onoff' }, after: { v: (Number(a) & 1) ? 'off' : 'on', fmt: 'onoff' }, unit: '' }
    }
    const meta = REG[String(c.name || '').toLowerCase()]
    if (meta) return { labelKey: meta.key, label: c.name, before: fmtValue(val(c.before), meta.fmt), after: fmtValue(val(c.after), meta.fmt), unit: meta.unit || '' }
    return { labelKey: null, label: c.name, before: { v: val(c.before) == null ? null : String(val(c.before)), fmt: 'raw' }, after: { v: val(c.after) == null ? null : String(val(c.after)), fmt: 'raw' }, unit: '' }
  }
  if (c.kind === 'service') return { labelKey: 'service', label: c.name, before: { v: val(c.before), fmt: 'raw' }, after: { v: val(c.after), fmt: 'raw' }, unit: '' }
  if (c.kind === 'task') return { labelKey: 'task', label: c.name, before: { v: val(c.before) === 'Disabled' ? 'off' : 'on', fmt: 'onoff' }, after: { v: val(c.after) === 'Disabled' ? 'off' : 'on', fmt: 'onoff' }, unit: '' }
  if (c.kind === 'powercfg-active') return { labelKey: 'powerPlan', label: '', before: { v: val(c.before), fmt: 'raw' }, after: { v: val(c.after), fmt: 'raw' }, unit: '' }
  if (c.kind === 'display-mode') return { labelKey: 'refreshRate', label: c.device || '', before: { v: String(c.before && c.before.value), fmt: 'raw' }, after: { v: String(c.after && c.after.value), fmt: 'raw' }, unit: 'Hz' }
  if (c.kind === 'powercfg') return { labelKey: 'powerSetting', label: c.setting || '', before: { v: val(c.before), fmt: 'raw' }, after: { v: val(c.after), fmt: 'raw' }, unit: '' }
  if (c.kind === 'unresolved') return null
  return { labelKey: null, label: c.name || c.kind, before: { v: val(c.before), fmt: 'raw' }, after: { v: val(c.after), fmt: 'raw' }, unit: '' }
}

/** Journal entry changes -> readable list, merged so one setting changed twice shows once (first before, last after); no-ops dropped. */
function describeEntry(entry) {
  const merged = new Map()
  for (const c of (entry && entry.changes) || []) {
    const d = describeChange(c)
    if (!d) continue
    const k = `${d.labelKey || d.label}|${d.label}`
    const prev = merged.get(k)
    if (prev) prev.after = d.after
    else merged.set(k, d)
  }
  return [...merged.values()].filter(d => !(d.before.v === d.after.v && d.before.fmt === d.after.fmt))
}

module.exports = { describeChange, describeEntry }
