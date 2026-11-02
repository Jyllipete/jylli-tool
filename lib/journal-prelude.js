'use strict'
// Wraps a tweak's PowerShell script so every registry/service write reports its real before and after value.
// journal-prelude.ps1 redefines Set-/New-/Remove-ItemProperty and Set-Service inside the one-shot powershell.exe process
// and prints `##JJ{json}` lines. extract() strips those lines from the output and returns normalised changes.
const fs = require('fs')
const path = require('path')
const { parseCmd } = require('./cmd-parse')

let _prelude = null
function prelude() {
  if (_prelude === null) _prelude = fs.readFileSync(path.join(__dirname, 'journal-prelude.ps1'), 'utf8')
  return _prelude
}

function wrap(script) { return prelude() + '\n' + script }

function state(s) {
  if (!s || s.e === false) return { exists: false }
  return { exists: true, type: s.t, value: s.v }
}

/** Splits ##JJ lines out of PowerShell output. Malformed lines are dropped and counted. */
function extract(out) {
  const changes = []
  let bad = 0
  const clean = []
  for (const line of String(out || '').split(/\r?\n/)) {
    if (!line.startsWith('##JJ')) { clean.push(line); continue }
    try {
      const j = JSON.parse(line.slice(4))
      if (j.k === 'reg') changes.push({ kind: 'reg', via: 'ps', path: j.p, name: j.n, before: state(j.b), after: state(j.a) })
      else if (j.k === 'service') changes.push({ kind: 'service', via: 'ps', name: j.n, before: { exists: !!j.b?.e, value: j.b?.v }, after: { exists: !!j.a?.e, value: j.a?.v } })
      else bad++
    } catch { bad++ }
  }
  return { clean: clean.join('\n'), changes, bad }
}

// Cmdlets and tools the prelude does not intercept. Seeing one in a script means the journal cannot promise an exact undo.
const UNINTERCEPTED = [
  /\bRemove-Item\b[^\n]*\bHK(LM|CU|CR)\b/i, /\bRemove-Item\b[^\n]*Registry::/i,
  /\bnetsh\b/i, /\bschtasks\b/i, /\b(Disable|Enable|Unregister|Register)-ScheduledTask\b/i,
  /\b(Set|Add|Remove)-MpPreference\b/i, /\bSet-ProcessMitigation\b/i, /\b(Add|Remove)-DnsClientDoh\w*\b/i, /\bSet-NetAdapter\w*\b/i, /\bSet-Net\w+\b/i, /\bSet-DnsClient\w*\b/i,
  /\b(Disable|Enable)-(NetAdapter\w*|WindowsOptionalFeature|WindowsErrorReporting|ComputerRestore)\b/i,
  /\b(Stop|Start|Restart)-Service\b/i, /\bRemove-AppxPackage\b/i, /\bRemove-AppxProvisionedPackage\b/i,
  /\bSet-ExecutionPolicy\b/i, /\bSet-Content\b[^\n]*\b(hosts|\.ini|\.cfg|\.xml)\b/i,
]

/** Looks at the script text: literal native commands (reg/sc/bcdedit/powercfg) are returned as descriptors to read before and after. */
function staticScan(script) {
  const native = []
  const unresolved = []
  for (const raw of String(script || '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const m = line.match(/^(?:&\s*)?(?:cmd\s*\/c\s*)?((?:reg|sc|bcdedit|powercfg)(?:\.exe)?\s.*)$/i)
    if (m && !m[1].includes('$')) {
      for (const d of parseCmd(m[1])) { if (d.kind === 'unresolved') unresolved.push(d.cmd); else native.push(d) }
    } else if (/^(reg|sc|bcdedit|powercfg)(\.exe)?\s/i.test(line) && line.includes('$')) {
      unresolved.push(line.slice(0, 120))
    }
  }
  const s = String(script || '')
  for (const rx of UNINTERCEPTED) { const mm = s.match(rx); if (mm) unresolved.push(mm[0].slice(0, 120)) }
  return { native, unresolved: [...new Set(unresolved)] }
}

module.exports = { prelude, wrap, extract, staticScan }
