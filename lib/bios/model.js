'use strict'
// Normalised setting model shared by every engine. The renderer only ever sees these objects (never paths or commands).
//   { key, engine, id, name, kind: 'option'|'number'|'string', current, options:[{value,label}], path:[], def, tier, tierWhy,
//     locked, raw?: { token, offset, width } }
const policy = require('./policy')
const scewinFmt = require('./scewin-format')

function decorate(s) {
  const c = policy.classify({ name: s.name, path: s.path, kind: s.policyKind || s.kind, ambiguous: s.ambiguous })
  const tier = s.readOnly ? 'readonly' : c.tier
  const { policyKind, readOnly, ambiguous, ...rest } = s
  return { ...rest, key: `${s.engine}:${s.id}`, tier, tierWhy: s.readOnly ? 'locked by the firmware' : c.reason }
}

/** SCEWIN parse() result -> normalised settings. */
function fromScewin(parsed) {
  return parsed.settings.filter(s => s.id).map(s => {
    const kind = s.kind === 'option' || s.kind === 'choice' ? 'option' : s.kind === 'number' ? 'number' : s.kind === 'string' ? 'string' : 'unsupported'
    return decorate({
      engine: 'scewin', id: s.id, name: s.name, kind: kind === 'unsupported' ? 'string' : kind, policyKind: s.kind, ambiguous: s.ambiguous,
      current: s.current, def: s.biosDefault, path: s.path, options: s.options.map(o => ({ value: o.value, label: o.label })),
      raw: { token: s.token, offset: s.offset, width: s.width }, help: s.help,
    })
  })
}

const arr = v => (Array.isArray(v) ? v : v == null ? [] : [v])
/** Rows from lib/bios/hp-wmi.js script (one object per HP_BIOS* instance) -> normalised settings. */
function fromHp(rows) {
  const out = []
  for (const r of arr(rows)) {
    if (!r || !r.Name) continue
    const name = String(r.Name)
    const kind = r.cls === 'HP_BIOSEnumeration' ? 'option' : r.cls === 'HP_BIOSInteger' ? 'number' : 'string'
    const possible = arr(r.PossibleValues).map(String)
    const cur = r.CurrentValue != null ? String(r.CurrentValue) : r.Value != null ? String(r.Value) : ''
    out.push(decorate({
      engine: 'hp-wmi', id: name, name, kind, policyKind: kind,
      current: cur.replace(/^\*/, ''), path: r.Path ? String(r.Path).split(/[\\/]/).filter(Boolean) : [],
      options: kind === 'option' ? possible.map(p => ({ value: p.replace(/^\*/, ''), label: p.replace(/^\*/, '') })) : [],
      readOnly: r.IsReadOnly === true || r.IsReadOnly === 'True',
      range: kind === 'number' ? { min: r.LowerBound ?? null, max: r.UpperBound ?? null } : undefined,
    }))
  }
  return out
}

/** Rows from lib/bios/lenovo-wmi.js parseRead (read only; a setting without listed options becomes a string = never writable). */
function fromLenovo(rows) {
  const out = []
  for (const r of arr(rows)) {
    if (!r || !r.name) continue
    const options = (r.options || []).map(o => ({ value: o, label: o }))
    const isOption = options.length > 1 && options.some(o => o.value === r.value)
    out.push(decorate({
      engine: 'lenovo-wmi', id: r.name, name: r.name, kind: isOption ? 'option' : 'string', policyKind: isOption ? 'option' : 'string',
      current: r.value, path: [], options: isOption ? options : [], readOnly: r.showOnly === true,
    }))
  }
  return out
}

/** Rows from lib/bios/dell-wmi.js READ_SCRIPT (read only). */
function fromDell(rows) {
  const out = []
  for (const r of arr(rows)) {
    if (!r || !r.Name) continue
    const name = String(r.Name)
    const kind = r.cls === 'EnumerationAttribute' ? 'option' : r.cls === 'IntegerAttribute' ? 'number' : 'string'
    const cur = arr(r.CurrentValue).map(String)[0] || ''
    const possible = arr(r.PossibleValues).map(String)
    out.push(decorate({
      engine: 'dell-wmi', id: name, name: r.Display ? String(r.Display) : name, kind, policyKind: kind, current: cur,
      path: r.Path ? String(r.Path).split(/[\/]/).filter(Boolean) : [],
      options: kind === 'option' ? possible.map(p => ({ value: p, label: p })) : [],
      readOnly: r.IsReadOnly === true || r.IsReadOnly === 'True',
      range: kind === 'number' ? { min: r.LowerBound ?? null, max: r.UpperBound ?? null } : undefined,
    }))
  }
  return out
}

module.exports = { fromLenovo, fromDell, fromScewin, fromHp, decorate, parseScewin: scewinFmt.parse }
