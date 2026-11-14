'use strict'
// Dell's BIOS attribute interface (root\dcim\sysman\biosattributes; Dell Command | Configure / Client Command Suite documentation).
// READ ONLY: no write script exists here and policy.WRITES_VERIFIED['dell-wmi'] is false. Not yet checked on a real Dell PC;
// unknown or missing properties make a row read-only or drop it, never a guess.
const NS = String.raw`root\dcim\sysman\biosattributes`

const PROBE_SCRIPT = `
$ErrorActionPreference = 'Stop'
try { $n = @(Get-CimInstance -Namespace ${NS} -ClassName EnumerationAttribute -ErrorAction Stop).Count; @{ ok=$true; count=$n } | ConvertTo-Json -Compress }
catch { @{ ok=$false; error=$_.Exception.Message } | ConvertTo-Json -Compress }
`

const READ_SCRIPT = `
$ErrorActionPreference = 'Stop'
$ns = '${NS}'
$rows = @()
try {
  foreach ($c in 'EnumerationAttribute','IntegerAttribute','StringAttribute') {
    foreach ($i in (Get-CimInstance -Namespace $ns -ClassName $c -ErrorAction Stop)) {
      $pv = @($i.PossibleValue); if (-not $pv.Count) { $pv = @($i.PossibleValues) }
      $rows += [pscustomobject]@{ cls=$c; Name=$i.AttributeName; Display=$i.DisplayName; CurrentValue=@($i.CurrentValue); PossibleValues=$pv; IsReadOnly=$i.IsReadOnly; LowerBound=$i.LowerBound; UpperBound=$i.UpperBound; Path=$i.Path }
    }
  }
  @{ ok=$true; rows=$rows } | ConvertTo-Json -Depth 4 -Compress
} catch { @{ ok=$false; error=$_.Exception.Message } | ConvertTo-Json -Compress }
`

function parseRead(out) {
  try {
    const j = JSON.parse(String(out || '').trim().split(/\r?\n/).pop())
    if (!j.ok) return { ok: false, error: /access denied/i.test(j.error || '') ? 'access_denied' : /invalid namespace|invalid class|not found/i.test(j.error || '') ? 'not_dell' : 'wmi_error', detail: j.error }
    return { ok: true, rows: Array.isArray(j.rows) ? j.rows : j.rows ? [j.rows] : [] }
  } catch { return { ok: false, error: 'wmi_error' } }
}

function parseProbe(out) {
  const r = parseRead(String(out || '').replace(/"count"\s*:\s*\d+/, '"rows":[]'))
  return r.ok ? 'ok' : r.error === 'access_denied' ? 'denied' : 'absent'
}

module.exports = { NS, PROBE_SCRIPT, READ_SCRIPT, parseRead, parseProbe }
