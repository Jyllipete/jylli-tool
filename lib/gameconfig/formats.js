'use strict'
// Byte-preserving readers and patchers for the three config file shapes games use.
//   kv       Valve style, one `"key"  "value"` per line (CS2 cs2_video.txt, Apex videoconfig.txt)
//   options  `key:value` per line (Minecraft options.txt)
//   ini      `[Section]` + `Key=Value` (Unreal GameUserSettings.ini)
// A patch only replaces the value text of a line that already exists. Key spelling, spacing, comments, line endings and the BOM all
// survive, and a key that is not in the file is never added (it comes back as `missing`), so a wrong key name in the catalog is harmless.
// patch(text, changes) -> { text, changed:[{key,from,to}], missing:[key], unchanged:[key] }.  parse(text) -> { values: {key: value} }.

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k)

/** Splits text into lines that keep their own ending, so joining gives the file back byte for byte. */
function split(text) {
  const out = []
  const re = /[^\r\n]*(\r\n|\n|\r|$)/g
  let m
  while ((m = re.exec(text)) && m[0] !== '') out.push(m[0])
  return out
}
const body = l => l.replace(/(\r\n|\n|\r)$/, '')
const ending = l => (/(\r\n|\n|\r)$/.exec(l) || [''])[0]

// Each format gives: match(line, ctx) -> { key, valueStart, valueEnd } | null, where ctx tracks the current ini section.
const FORMATS = {
  kv: {
    match(line) {
      const b = body(line)
      const m = /^(\s*)"([^"]+)"(\s+)"([^"]*)"/.exec(b)
      if (!m) return null
      const start = m[1].length + m[2].length + 2 + m[3].length + 1
      return { key: m[2], start, end: start + m[4].length }
    },
    quote: false,
  },
  options: {
    match(line) {
      const b = body(line)
      const m = /^([A-Za-z0-9_.\-]+):/.exec(b)
      return m ? { key: m[1], start: m[0].length, end: b.length } : null
    },
  },
  ini: {
    match(line, ctx) {
      const b = body(line)
      const s = /^\s*\[([^\]]+)\]\s*$/.exec(b)
      if (s) { ctx.section = s[1]; return null }
      const m = /^(\s*)([^=;#\s][^=]*?)(\s*=\s*)(.*)$/.exec(b)
      if (!m) return null
      const start = m[1].length + m[2].length + m[3].length
      // Key is "Section|Key" so two sections can hold the same key name; a catalog entry for ini says which section.
      return { key: (ctx.section || '') + '|' + m[2], start, end: b.length }
    },
  },
}

function scan(format, text) {
  const f = FORMATS[format]
  if (!f) throw new Error('unknown format ' + format)
  const ctx = { section: '' }
  const lines = split(text)
  const hits = []
  lines.forEach((l, i) => { const h = f.match(l, ctx); if (h) hits.push({ i, ...h }) })
  return { lines, hits }
}

function parse(format, text) {
  const bom = text.charCodeAt(0) === 0xFEFF
  const { lines, hits } = scan(format, bom ? text.slice(1) : text)
  const values = {}
  for (const h of hits) if (!has(values, h.key)) values[h.key] = body(lines[h.i]).slice(h.start, h.end)
  return { values, bom }
}

/** changes: { key: newValueString }. The first occurrence of a key is the one that is changed. */
function patch(format, text, changes) {
  const bom = text.charCodeAt(0) === 0xFEFF
  const { lines, hits } = scan(format, bom ? text.slice(1) : text)
  const changed = [], missing = [], unchanged = []
  const done = new Set()
  for (const key of Object.keys(changes)) {
    const h = hits.find(x => x.key === key && !done.has(x.key))
    if (!h) { missing.push(key); continue }
    done.add(key)
    const to = String(changes[key])
    if (/[\r\n]/.test(to) || (format === 'kv' && to.includes('"'))) { missing.push(key); continue }
    const b = body(lines[h.i])
    const from = b.slice(h.start, h.end)
    if (from === to) { unchanged.push(key); continue }
    lines[h.i] = b.slice(0, h.start) + to + b.slice(h.end) + ending(lines[h.i])
    changed.push({ key, from, to })
  }
  return { text: (bom ? '﻿' : '') + lines.join(''), changed, missing, unchanged }
}

module.exports = { parse, patch, FORMATS, split }
