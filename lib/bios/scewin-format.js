'use strict'
// Parser and byte-preserving patcher for the AMISCE / SCEWIN "nvram.txt" script.
// Format as seen in public dumps: a header, "HIICrc32= XXXXXXXX", "// FORM SET" / "// FORM" comment blocks with titles, then records
//   Setup Question<TAB>= Name
//   Token<TAB>=7006<TAB>// Do NOT change this line
//   Offset<TAB>=03          Width<TAB>=01
//   BIOS Default / MFG Default
//   Value<TAB>=0<TAB>// Enabled = 1, Disabled = 0        (value style)
//   Options<TAB>=*[00]Disabled<TAB>// Move "*" ...       (option style, further options on following indented lines)
// NOT verified against a real board yet (no AMI hardware available): anything that does not match a known shape becomes
// kind 'unsupported' and is never writable. Writes in release builds stay locked until a real board passes (see policy.WRITES_VERIFIED).
// The patcher only touches the lines of the changed records; every other byte, including line endings, stays identical.

const FIELD = /^([A-Za-z][A-Za-z ]*?)\s*=(.*)$/
const OPT_LINE = /^(Options\s*=\s*|[ \t]+)(\*?)\[([0-9A-Fa-f]+)\]([^\r\n]*?)([ \t]*\/\/[^\r\n]*)?(\r?\n)?$/
const VALUE_LINE = /^(Value\s*=\s*)(<[^>]*>|"[^"]*"|[^\s/]+)([^\r\n]*)(\r?\n)?$/

const stripEol = s => s.replace(/\r?\n$/, '')
const stripComment = s => String(s).replace(/[ \t]*\/\/.*$/, '').trim()
const idOf = (token, offset, width) => `${token}:${offset}:${width}`

function splitLines(text) { return String(text).split(/(?<=\n)/) }

function parseHeader(lines) {
  const h = { crc: null, version: null }
  for (const l of lines.slice(0, 40)) {
    const c = l.match(/HIICrc32\s*=\s*([0-9A-Fa-f]+)/)
    if (c) h.crc = c[1].toUpperCase()
    const v = l.match(/AMISCE Utility\.?\s*Ver\s*([\d.]+)/i)
    if (v) h.version = v[1]
  }
  return h
}

/** Parses a dump into { header, settings[] }. Each setting keeps line indexes so the patcher can edit in place. */
function parse(text) {
  const lines = splitLines(text)
  const header = parseHeader(lines)
  const settings = []
  const seen = new Map()
  let formSet = '', form = '', pendingTitleFor = null
  for (let i = 0; i < lines.length; i++) {
    const L = stripEol(lines[i])
    if (/^\/\/\s*FORM SET\b/.test(L)) { pendingTitleFor = 'set'; continue }
    if (/^\/\/\s*FORM\b/.test(L)) { pendingTitleFor = 'form'; continue }
    const t = L.match(/^\/\/\s*Title\s*=\s*(.*)$/)
    if (t && pendingTitleFor) { if (pendingTitleFor === 'set') { formSet = t[1].trim(); form = '' } else form = t[1].trim(); pendingTitleFor = null; continue }
    const q = L.match(/^Setup Question\s*=\s*(.*)$/)
    if (!q) continue
    // record = this line up to the next record start / FORM comment
    let end = i + 1
    while (end < lines.length && !/^Setup Question\s*=/.test(lines[end]) && !/^\/\/\s*FORM\b/.test(lines[end])) end++
    const rec = parseRecord(lines, i, end, q[1].trim())
    rec.path = [formSet, form].filter(Boolean)
    const id = rec.id
    if (id) {
      if (seen.has(id)) { rec.ambiguous = true; settings[seen.get(id)].ambiguous = true } else seen.set(id, settings.length)
    }
    settings.push(rec)
    i = end - 1
  }
  return { header, settings }
}

function parseRecord(lines, start, end, name) {
  const rec = { name, start, end, kind: 'unsupported', token: null, offset: null, width: null, id: null, biosDefault: null, mfgDefault: null,
    help: '', options: [], current: null, raw: null, ambiguous: false, reason: '' }
  let valueIdx = -1, optFirst = -1
  for (let i = start + 1; i < end; i++) {
    const L = stripEol(lines[i])
    const f = L.match(FIELD)
    if (!f) continue
    const key = f[1].trim(), rest = f[2]
    if (key === 'Token') rec.token = stripComment(rest)
    else if (key === 'Offset') rec.offset = stripComment(rest)
    else if (key === 'Width') rec.width = stripComment(rest)
    else if (key === 'BIOS Default') rec.biosDefault = stripComment(rest)
    else if (key === 'MFG Default') rec.mfgDefault = stripComment(rest)
    else if (key === 'Help String') rec.help = rest.trim()
    else if (key === 'Value' && valueIdx < 0) valueIdx = i
    else if (key === 'Options' && optFirst < 0) optFirst = i
  }
  if (rec.token && rec.offset != null && rec.width != null) rec.id = idOf(rec.token, rec.offset, rec.width)
  if (!rec.id) { rec.reason = 'missing token, offset or width'; return rec }

  if (optFirst >= 0) {
    // option style: the first line carries "Options=", the rest are indented lines until a line that is not an option
    const opts = []
    for (let i = optFirst; i < end; i++) {
      const m = lines[i].match(OPT_LINE)
      if (!m) { if (i === optFirst) break; if (stripEol(lines[i]).trim() === '') break; break }
      opts.push({ value: m[3].toUpperCase(), label: m[4].trim(), selected: m[2] === '*', line: i })
    }
    const sel = opts.filter(o => o.selected)
    if (opts.length && sel.length === 1) {
      rec.kind = 'option'; rec.options = opts; rec.current = sel[0].value
    } else rec.reason = opts.length ? (sel.length ? 'more than one selected option' : 'no selected option') : 'options not readable'
    return rec
  }

  if (valueIdx >= 0) {
    const m = lines[valueIdx].match(VALUE_LINE)
    if (!m) { rec.reason = 'value not readable'; return rec }
    const rawVal = m[2], tail = m[3]
    rec.valueLine = valueIdx
    if (rawVal.startsWith('"')) { rec.kind = 'string'; rec.current = rawVal.slice(1, -1); rec.raw = rawVal; return rec }
    const numeric = rawVal.startsWith('<')
    rec.current = numeric ? rawVal.slice(1, -1).trim() : rawVal
    rec.raw = rawVal
    // "// Enabled = 1, Disabled = 0" turns a plain value into a choice
    const hint = [...tail.replace(/^[ \t]*\/\/[ \t]*/, '').matchAll(/([^=,]+?)\s*=\s*([0-9A-Fa-f]+)/g)].map(x => ({ value: x[2].toUpperCase(), label: x[1].trim() }))
    if (!numeric && hint.length >= 2) { rec.kind = 'choice'; rec.options = hint } else rec.kind = 'number'
    rec.numericStyle = numeric ? 'angle' : 'plain'
    return rec
  }
  rec.reason = 'no value or options'
  return rec
}

/** Is `value` an acceptable new value for this setting (shape only; policy decides if it is allowed). */
function validValue(s, value) {
  if (!s || s.ambiguous) return false
  const v = String(value)
  if (s.kind === 'option') return s.options.some(o => o.value === v.toUpperCase())
  if (s.kind === 'choice') return s.options.some(o => o.value === v.toUpperCase())
  if (s.kind === 'number') {
    if (!/^[0-9A-Fa-f]{1,16}$/.test(v)) return false
    const w = parseInt(s.width, 16) || parseInt(s.width, 10) || 0
    return !w || v.length <= w * 2 || parseInt(v, 16) <= 2 ** (8 * w) - 1
  }
  return false   // strings and unsupported records are never written
}

/**
 * Returns new dump text with `changes` ([{ id, value }]) applied. Throws on anything unknown, ambiguous or invalid so a half-applied
 * patch can never be produced. Only the lines of changed records differ from the input.
 */
function patch(text, changes) {
  const parsed = parse(text)
  const byId = new Map(parsed.settings.filter(s => s.id).map(s => [s.id, s]))
  const lines = splitLines(text)
  const done = new Set()
  for (const c of changes) {
    const s = byId.get(c.id)
    if (!s) throw new Error(`unknown setting ${c.id}`)
    if (done.has(c.id)) throw new Error(`duplicate change for ${c.id}`)
    if (!validValue(s, c.value)) throw new Error(`invalid value for ${c.id}`)
    done.add(c.id)
    const want = String(c.value).toUpperCase()
    if (s.kind === 'option') {
      for (const o of s.options) {
        const first = /^Options/.test(lines[o.line])
        lines[o.line] = lines[o.line].replace(OPT_LINE, (all, pre, star, val, label, cmt, eol) => {
          const sel = val.toUpperCase() === want
          let p = pre
          if (first) return `${p}${sel ? '*' : ''}[${val}]${label}${cmt || ''}${eol || ''}`
          // continuation lines keep their alignment: the star takes the place of one space
          if (sel && !star) p = /[ ]$/.test(p) && p.length > 1 ? p.slice(0, -1) + '*' : p + '*'
          else if (!sel && star) p = p + ' '
          else return all
          return `${p}[${val}]${label}${cmt || ''}${eol || ''}`
        })
        // a replaced selected line must not carry two stars
        lines[o.line] = lines[o.line].replace(/\*\*+/g, '*')
      }
    } else {
      const wrap = s.kind === 'number' && s.numericStyle === 'angle'
      lines[s.valueLine] = lines[s.valueLine].replace(VALUE_LINE, (all, pre, val, tail, eol) => `${pre}${wrap ? `<${c.value}>` : c.value}${tail}${eol || ''}`)
    }
  }
  const out = lines.join('')
  // verify: re-parse and compare; any surprise rejects the whole patch
  const again = parse(out)
  const m2 = new Map(again.settings.filter(s => s.id).map(s => [s.id, s]))
  for (const c of changes) {
    const s = m2.get(c.id)
    if (!s || String(s.current).toUpperCase() !== String(c.value).toUpperCase()) throw new Error(`patch verification failed for ${c.id}`)
  }
  for (const s of parsed.settings) {
    if (done.has(s.id)) continue
    const s2 = m2.get(s.id)
    if (s.id && (!s2 || s2.current !== s.current)) throw new Error(`patch changed unrelated setting ${s.id}`)
  }
  return out
}

module.exports = { parse, patch, validValue, idOf }
