'use strict'
// CitizenFX.ini: section-aware, byte-preserving reader and patcher. Only the keys docs.fivem.net documents are editable
// (docs/FIVEM_EVIDENCE.md); anything else in the file is reported read-only and is never rewritten. A patch changes the value
// text of an existing line and nothing else (key spelling, spacing, comments, line endings and the BOM all survive); a missing
// key is appended to its section, a missing section to the end of the file.
;(function (root) {
  const SECTION = 'Game'

  // type: 'bool01' | 'int' | 'enum' | 'path'. editable:false means the tab shows it but never writes it.
  const KNOWN = {
    IVPath:                { type: 'path', editable: false },
    SavedBuildNumber:      { type: 'int', min: 1, max: 99999, editable: true },
    UpdateChannel:         { type: 'enum', values: ['production', 'beta', 'canary'], editable: true },
    DisableNVSP:           { type: 'bool01', editable: true },
    EnableFullMemoryDump:  { type: 'bool01', editable: true },
    DisableOSVersionCheck: { type: 'bool01', editable: true },
    DisableCrashUpload:    { type: 'bool01', editable: true },
  }

  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k)
  const canon = key => { for (const k of Object.keys(KNOWN)) if (k.toLowerCase() === String(key).toLowerCase()) return k; return null }

  /** -> { ok, value } | { ok:false, reason }. Value is normalised to the text written to the file. */
  function validate(key, raw) {
    const k = canon(key)
    if (!k) return { ok: false, reason: 'unknown-key' }
    const def = KNOWN[k]
    if (!def.editable) return { ok: false, reason: 'read-only' }
    const v = String(raw == null ? '' : raw).trim()
    if (def.type === 'bool01') return v === '0' || v === '1' ? { ok: true, value: v } : { ok: false, reason: 'bad-value' }
    if (def.type === 'int') { const n = Number(v); return /^\d{1,6}$/.test(v) && n >= def.min && n <= def.max ? { ok: true, value: String(n) } : { ok: false, reason: 'bad-value' } }
    if (def.type === 'enum') return def.values.includes(v) ? { ok: true, value: v } : { ok: false, reason: 'bad-value' }
    return { ok: false, reason: 'bad-value' }
  }

  /** Splits text into lines keeping each line's own ending, so joining them gives the file back byte for byte. */
  function split(text) {
    const out = []
    const re = /[^\r\n]*(\r\n|\n|\r|$)/g
    let m
    while ((m = re.exec(text)) && m[0] !== '') out.push(m[0])
    return out
  }
  const body = l => l.replace(/(\r\n|\n|\r)$/, '')
  const eolOf = l => (l.match(/(\r\n|\n|\r)$/) || [''])[0]

  /** -> { sections: [{name, line}], entries: [{section, key, value, line}] } (line = 0-based line index) */
  function parse(text) {
    const lines = split(String(text || '').replace(/^﻿/, ''))
    const sections = [], entries = []
    let cur = ''
    lines.forEach((raw, i) => {
      const l = body(raw).trim()
      if (!l || l[0] === ';' || l[0] === '#') return
      const s = l.match(/^\[([^\]]+)\]$/)
      if (s) { cur = s[1].trim(); sections.push({ name: cur, line: i }); return }
      const kv = l.match(/^([^=]+?)\s*=\s*(.*)$/)
      if (kv) entries.push({ section: cur, key: kv[1].trim(), value: kv[2].trim(), line: i })
    })
    return { sections, entries }
  }

  /** Values for the editor: { known: [{key, value, present, type, values?, editable}], other: [{section, key, value}] } */
  function read(text) {
    const p = parse(text)
    const game = p.entries.filter(e => e.section.toLowerCase() === SECTION.toLowerCase())
    const byKey = {}
    for (const e of game) { const k = canon(e.key); if (k && !has(byKey, k)) byKey[k] = e.value }
    const known = Object.keys(KNOWN).map(k => ({ key: k, value: has(byKey, k) ? byKey[k] : null, present: has(byKey, k), type: KNOWN[k].type, values: KNOWN[k].values || null, editable: KNOWN[k].editable }))
    const other = p.entries.filter(e => !(e.section.toLowerCase() === SECTION.toLowerCase() && canon(e.key))).map(e => ({ section: e.section, key: e.key, value: e.value }))
    return { known, other }
  }

  /** changes: { Key: value }. -> { ok, text, changed: [keys], rejected: [{key, reason}] }. Unknown/read-only/invalid keys are rejected, never written. */
  function patch(text, changes) {
    const src = String(text || '')
    const bom = src.startsWith('﻿') ? '﻿' : ''
    const lines = split(src.replace(/^﻿/, ''))
    const changed = [], rejected = []
    const eol = lines.length ? (eolOf(lines.find(l => eolOf(l)) || '') || '\r\n') : '\r\n'
    for (const [key, raw] of Object.entries(changes || {})) {
      const v = validate(key, raw)
      if (!v.ok) { rejected.push({ key, reason: v.reason }); continue }
      const k = canon(key)
      const p = parse(lines.join(''))
      const hit = p.entries.find(e => e.section.toLowerCase() === SECTION.toLowerCase() && e.key.toLowerCase() === k.toLowerCase())
      if (hit) {
        const l = lines[hit.line], b = body(l)
        const eq = b.indexOf('=')
        const head = b.slice(0, eq + 1), after = b.slice(eq + 1)
        const lead = after.match(/^\s*/)[0]
        lines[hit.line] = head + lead + v.value + eolOf(l)
      } else {
        const sec = p.sections.find(s => s.name.toLowerCase() === SECTION.toLowerCase())
        if (sec) {
          // after the last non-blank line of that section
          let end = sec.line
          for (let i = sec.line + 1; i < lines.length; i++) {
            const t = body(lines[i]).trim()
            if (/^\[[^\]]+\]$/.test(t)) break
            if (t) end = i
          }
          if (!eolOf(lines[end])) lines[end] += eol
          lines.splice(end + 1, 0, k + '=' + v.value + eol)
        } else {
          if (lines.length && !eolOf(lines[lines.length - 1])) lines[lines.length - 1] += eol
          lines.push('[' + SECTION + ']' + eol, k + '=' + v.value + eol)
        }
      }
      changed.push(k)
    }
    return { ok: true, text: bom + lines.join(''), changed, rejected }
  }

  const api = { SECTION, KNOWN, validate, parse, read, patch, canon }
  root.JylliFivemIni = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
