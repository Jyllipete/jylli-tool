'use strict'
// Lenovo's documented BIOS interface (root\wmi, Lenovo_BiosSetting). READ ONLY: no write script exists here and
// policy.WRITES_VERIFIED['lenovo-wmi'] is false. Parsing follows Lenovo's "Think BIOS Config" documentation and has NOT been
// checked on a real Lenovo PC yet; anything that does not parse cleanly is dropped rather than guessed.
const PROBE_SCRIPT = `
$ErrorActionPreference = 'Stop'
try { $n = @(Get-CimInstance -Namespace root\\wmi -ClassName Lenovo_BiosSetting -ErrorAction Stop).Count; @{ ok=$true; count=$n } | ConvertTo-Json -Compress }
catch { @{ ok=$false; error=$_.Exception.Message } | ConvertTo-Json -Compress }
`

const READ_SCRIPT = `
$ErrorActionPreference = 'Stop'
try {
  $rows = @(Get-CimInstance -Namespace root\\wmi -ClassName Lenovo_BiosSetting -ErrorAction Stop | Where-Object { $_.CurrentSetting } | ForEach-Object { [string]$_.CurrentSetting })
  @{ ok=$true; rows=$rows } | ConvertTo-Json -Compress -Depth 3
} catch { @{ ok=$false; error=$_.Exception.Message } | ConvertTo-Json -Compress }
`

/**
 * "Name,Value" or "Name,Value;[Optional:a,b,c]" (extra bracket groups such as [Status:ShowOnly] / [Excluded from boot order:...]).
 * @returns {{ name, value, options:string[], showOnly:boolean } | null}
 */
function parseLine(line) {
  const s = String(line || '').trim()
  const cut = s.indexOf(';')
  const head = cut >= 0 ? s.slice(0, cut) : s
  const tail = cut >= 0 ? s.slice(cut + 1) : ''
  const comma = head.indexOf(',')
  if (comma <= 0) return null
  const name = head.slice(0, comma).trim(), value = head.slice(comma + 1).trim()
  if (!name || name.length > 120 || /[\r\n]/.test(name)) return null
  const opt = /\[Optional:([^\]]*)\]/i.exec(tail)
  const options = opt ? opt[1].split(',').map(x => x.trim()).filter(Boolean) : []
  const showOnly = /\[Status:\s*ShowOnly\]/i.test(tail)
  return { name, value, options, showOnly }
}

function parseRead(out) {
  try {
    const j = JSON.parse(String(out || '').trim().split(/\r?\n/).pop())
    if (!j.ok) return { ok: false, error: /access denied/i.test(j.error || '') ? 'access_denied' : /invalid namespace|invalid class|not found/i.test(j.error || '') ? 'not_lenovo' : 'wmi_error', detail: j.error }
    const rows = (Array.isArray(j.rows) ? j.rows : j.rows ? [j.rows] : []).map(parseLine).filter(Boolean)
    return { ok: true, rows }
  } catch { return { ok: false, error: 'wmi_error' } }
}

function parseProbe(out) {
  const r = parseRead(String(out || '').replace(/"count"\s*:\s*\d+/, '"rows":[]'))
  return r.ok ? 'ok' : r.error === 'access_denied' ? 'denied' : 'absent'
}

module.exports = { PROBE_SCRIPT, READ_SCRIPT, parseLine, parseRead, parseProbe }
