// Heuristic scan: IPC handler parameters that are interpolated into shell/PowerShell strings.
// Usage: node tools/scan-injection.js   (exit 1 if anything unreviewed is found)
const fs = require('fs')
const path = require('path')

const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8')
const lines = src.split('\n')
const handlerRe = /^ipcMain\.(?:handle|on)\('([^']+)',\s*(?:async\s*)?\(([^)]*)\)\s*=>/
const sinkRe = /\b(runPS|runCmd|exec|execSync|spawn|execFile|ps|cmd)\s*\(/
// Handlers reviewed and known safe (the value is validated or never reaches a shell). Keep this list short and justified.
const REVIEWED = new Map([
  ['enable-service', 'id validated by /^[\\w\\-]{1,256}$/ and start restricted to an allowlist'],
  ['kill-process', 'assertPositiveInt'],
  ['schedule-tweak', 'taskName reduced to [A-Za-z0-9_] by replace(/\\W/g, "_"); action must be a key of the fixed psCommands map'],
])

const starts = []
lines.forEach((l, i) => { const m = handlerRe.exec(l); if (m) starts.push({ i, name: m[1], params: m[2] }) })

let findings = 0
starts.forEach((h, idx) => {
  const end = idx + 1 < starts.length ? starts[idx + 1].i : lines.length
  const ids = (h.params.replace(/[{}\s]/g, '').split(',').map(p => p.split('=')[0]).filter(p => p && p !== '_'))
  if (!ids.length || REVIEWED.has(h.name)) return
  for (let k = h.i; k < end; k++) {
    const l = lines[k]
    // look at multi-line template literals too: scan from a sink line until the closing backtick-paren
    if (!sinkRe.test(l) && !/`$/.test(l.trim())) { /* fallthrough: also scan lines inside templates */ }
    for (const id of ids) {
      const re = new RegExp('\\$\\{[^}]*\\b' + id + '\\b[^}]*\\}')
      if (re.test(l) && (sinkRe.test(l) || inTemplate(k, h.i))) {
        const body = lines.slice(h.i, end).join('\n')
        // guarded: quoted/escaped on this line, or the handler validated this parameter with a lib/validate.js predicate
        const validated = new RegExp('V\\.(?:is\\w+|inRange)\\(\\s*' + id + '\\b').test(body)
        const guarded = validated || /V\.psQuote|psQuote\(|escapePSSingleQuote|runFile\(/.test(l)
        if (!guarded) { findings++; console.log(`${h.name} (main.js:${k + 1}) param "${id}": ${l.trim().slice(0, 140)}`) }
      }
    }
  }
})

// is line k inside a multi-line template literal opened by a runPS(` / runCmd(` call at or after the handler start?
function inTemplate(k, from) {
  let open = false
  for (let j = from; j <= k; j++) {
    const ticks = (lines[j].match(/(?<!\\)`/g) || []).length
    if (ticks % 2 === 1) open = !open
  }
  return open
}

console.log(findings ? `\n${findings} potential injection site(s) to review` : '✔ no unreviewed handler-parameter interpolation into shell strings')
process.exit(findings ? 1 : 0)
