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

module.exports = { fromScewin, fromHp, decorate, parseScewin: scewinFmt.parse }
