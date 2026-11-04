'use strict'
// HP's official BIOS interface (root/HP/InstrumentedBIOS). Read-only here; needs an elevated process.
const READ_SCRIPT = `
$ErrorActionPreference = 'Stop'
$ns = 'root/HP/InstrumentedBIOS'
$rows = @()
try {
  foreach ($c in 'HP_BIOSEnumeration','HP_BIOSString','HP_BIOSInteger') {
    foreach ($i in (Get-CimInstance -Namespace $ns -ClassName $c)) {
      $rows += [pscustomobject]@{ cls=$c; Name=$i.Name; Value=$i.Value; CurrentValue=$i.CurrentValue; PossibleValues=@($i.PossibleValues); Path=$i.Path; IsReadOnly=$i.IsReadOnly; LowerBound=$i.LowerBound; UpperBound=$i.UpperBound }
    }
  }
  @{ ok=$true; rows=$rows } | ConvertTo-Json -Depth 4 -Compress
} catch { @{ ok=$false; error=$_.Exception.Message } | ConvertTo-Json -Compress }
`

function parseRead(out) {
  try {
    const j = JSON.parse(String(out || '').trim().split(/\r?\n/).pop())
    if (!j.ok) return { ok: false, error: /access denied/i.test(j.error || '') ? 'access_denied' : /invalid namespace|not found/i.test(j.error || '') ? 'not_hp' : 'wmi_error', detail: j.error }
    return { ok: true, rows: Array.isArray(j.rows) ? j.rows : j.rows ? [j.rows] : [] }
  } catch { return { ok: false, error: 'wmi_error' } }
}

/** SetBIOSSetting for each change, stopping at the first non-zero return. Values travel as base64 JSON, never inside script text. */
function writeScript(changes) {
  const b64 = Buffer.from(JSON.stringify(changes.map(c => ({ name: String(c.id), value: String(c.value) }))), 'utf8').toString('base64')
  return `
$ErrorActionPreference = 'Stop'
try {
  $j = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64}')) | ConvertFrom-Json
  $i = Get-CimInstance -Namespace root/HP/InstrumentedBIOS -ClassName HP_BIOSSettingInterface
  $codes = @()
  foreach ($c in @($j)) {
    $r = Invoke-CimMethod -InputObject $i -MethodName SetBIOSSetting -Arguments @{ Name = [string]$c.name; Value = [string]$c.value; Password = '<utf-16/>' }
    $codes += [int]$r.Return
    if ($r.Return -ne 0) { break }
  }
  @{ ok = $true; codes = $codes } | ConvertTo-Json -Compress
} catch { @{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress }
`
}

// HP return codes: 0 success, 1 not supported, 2 unspecified, 3 timeout, 4 failed, 5 invalid parameter, 6 access denied (also a setup password)
const CODES = { 1: 'not_supported', 2: 'write_failed', 3: 'write_failed', 4: 'write_failed', 5: 'invalid_value', 6: 'access_denied' }
function parseWrite(out, count) {
  try {
    const j = JSON.parse(String(out || '').trim().split(/\r?\n/).pop())
    if (!j.ok) return { ok: false, error: /access denied/i.test(j.error || '') ? 'access_denied' : 'wmi_error' }
    const codes = [].concat(j.codes == null ? [] : j.codes)
    const bad = codes.find(c => c !== 0)
    if (bad != null) return { ok: false, error: CODES[bad] || 'write_failed' }
    return codes.length === count ? { ok: true } : { ok: false, error: 'write_failed' }
  } catch { return { ok: false, error: 'wmi_error' } }
}

module.exports = { READ_SCRIPT, parseRead, writeScript, parseWrite }
