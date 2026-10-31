// Static journal coverage: reads every tweak's apply() source and writes lib/tweak-manifest.json with what it touches
// (literal registry writes, services, bcdedit/powercfg) and how well the journal can follow it. It never runs a tweak, so it
// is safe anywhere; the VM run that proves a byte-identical registry export is a separate, manual step.
// Usage: node tools/journal-coverage.js [--check]   (--check fails if the committed manifest is out of date)
const fs = require('fs'), path = require('path')
const { staticScan } = require('../lib/journal-prelude')

const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8')
const start = src.indexOf('\nconst TWEAKS = {')
if (start < 0) throw new Error('TWEAKS table not found')
const lines = src.slice(start).split('\n')
const entries = []
let cur = null
for (let i = 1; i < lines.length; i++) {
  const m = /^  '([^']+)': \{\s*$/.exec(lines[i]) || /^  ([A-Za-z0-9_]+): \{\s*$/.exec(lines[i])
  if (m) { if (cur) entries.push(cur); cur = { id: m[1], body: [] }; continue }
  if (/^\}/.test(lines[i])) break
  if (cur) cur.body.push(lines[i])
}
if (cur) entries.push(cur)

const out = {}
for (const e of entries) {
  const body = e.body.join('\n')
  const a = body.indexOf('    apply:'), r = body.indexOf('    restore:')
  const apply = a < 0 ? '' : body.slice(a, r > a ? r : undefined)
  const touches = []
  for (const m of apply.matchAll(/Set-ItemProperty[^\n]*?-Path\s+["']([^"']+)["'][^\n]*?-Name\s+["']?([\w ]+?)["']?\s+-Value\s+([^\s`'")]+)/gi)) touches.push({ kind: 'reg', target: `${m[1].replace(/\\\\/g, '\\')}\\${m[2]}`, after: m[3].replace(/^["']|["']$/g, '') })
  for (const m of apply.matchAll(/reg add\s+\\?"([^"\\]+)\\?"\s+\/v\s+\\?"?([\w ]+?)\\?"?\s+\/t\s+\w+\s+\/d\s+\\?"?([^\s"\\]+)/gi)) touches.push({ kind: 'reg', target: `${m[1].replace(/\\\\/g, '\\')}\\${m[2]}`, after: m[3] })
  for (const m of apply.matchAll(/Set-Service[^\n]*?-Name\s+["']?([\w.-]+)["']?[^\n]*?-StartupType\s+["']?(\w+)/gi)) touches.push({ kind: 'service', target: m[1], after: m[2] })
  for (const m of apply.matchAll(/sc(?:\.exe)?\s+config\s+["']?([\w.-]+)["']?\s+start=\s*(\w[\w-]*)/gi)) touches.push({ kind: 'service', target: m[1], after: m[2] })
  for (const m of apply.matchAll(/bcdedit\s+\/set\s+(?:\{\w+\}\s+)?(\w+)\s+(\w+)/gi)) touches.push({ kind: 'bcd', target: m[1], after: m[2] })
  const scan = staticScan(apply)
  const dynamic = /\$\{|\$\w+/.test(apply) && /Set-ItemProperty|reg add|Set-Service|sc config/i.test(apply)
  const hasWrites = touches.length > 0
  out[e.id] = { touches, dynamic, untracked: scan.unresolved.length, fidelity: !hasWrites && !scan.unresolved.length && !/Set-ItemProperty|reg add|Set-Service|sc config|bcdedit|powercfg/i.test(apply) ? 'none' : scan.unresolved.length ? 'partial' : 'exact' }
}
const json = JSON.stringify(out, null, 1) + '\n'
const file = path.join(__dirname, '..', 'lib', 'tweak-manifest.json')
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  if (cur !== json) { console.error('✖ lib/tweak-manifest.json is out of date: run node tools/journal-coverage.js'); process.exit(1) }
  console.log('✔ tweak manifest is current')
} else {
  fs.writeFileSync(file, json)
  const f = Object.values(out).reduce((a, x) => (a[x.fidelity] = (a[x.fidelity] || 0) + 1, a), {})
  console.log(`wrote lib/tweak-manifest.json for ${Object.keys(out).length} tweaks`, JSON.stringify(f))
}
