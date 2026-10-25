// Lists every entry of the TWEAKS table in main.js with its metadata, without loading Electron.
// Usage: node tools/list-tweaks.js [--missing-tier]
const fs = require('fs')
const path = require('path')

const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8')
const start = src.indexOf('\nconst TWEAKS = {')
if (start < 0) throw new Error('TWEAKS table not found')
const lines = src.slice(start).split('\n')

const entries = []
let cur = null
for (let i = 1; i < lines.length; i++) {
  const l = lines[i]
  const m = /^  '([^']+)': \{\s*$/.exec(l) || /^  ([A-Za-z0-9_]+): \{\s*$/.exec(l)
  if (m) { if (cur) entries.push(cur); cur = { id: m[1], line: start ? src.slice(0, start).split('\n').length + i : i, body: [] }; continue }
  if (cur) cur.body.push(l)
}

if (cur) entries.push(cur)
for (const e of entries) {
  const body = e.body.join('\n')
  e.tier = (/^\s{4}safetyTier:\s*(\d)/m.exec(body) || [])[1] ?? null
  e.category = (/^\s{4}category:\s*'([^']+)'/m.exec(body) || [])[1] ?? null
  e.name = (/^\s{4}name:\s*'([^']+)'/m.exec(body) || [])[1] ?? null
  e.hasApply = /^\s{4}apply:/m.test(body)
  e.hasRestore = /^\s{4}restore:/m.test(body)
  e.reboot = /requiresReboot:\s*true/.test(body)
}

if (require.main === module) {
  const onlyMissing = process.argv.includes('--missing-tier')
  const rows = entries.filter(e => !onlyMissing || e.tier === null)
  for (const e of rows) console.log(`${String(e.line).padStart(5)}  tier=${e.tier ?? '-'}  ${e.id.padEnd(30)} ${(e.category || '').padEnd(12)} ${e.hasApply ? 'A' : '-'}${e.hasRestore ? 'R' : '-'}  ${e.name || ''}`)
  console.log(`\n${entries.length} tweaks, ${entries.filter(e => e.tier === null).length} without safetyTier`)
}

module.exports = { entries }
