'use strict'
// Restore points "Lifeline": the ONLY PowerShell this tab may run besides the read-only probe and lib/restore-point.js (which creates points).
// Every script prints one RP_OK / RP_FAIL line; the service then READS the PC again to prove the change before it says "done".
const { SR_POLICY, VSS_KEY } = require('./detect')

const posInt = n => { const v = Number(n); if (!Number.isInteger(v) || v <= 0 || v > 2147483647) throw new Error('invalid sequence number'); return v }
const pctOf = n => { const v = Number(n); if (!Number.isInteger(v) || v < 1 || v > 50) throw new Error('invalid percent'); return v }

/** Turn System Protection on for the system drive. Mirrors what creating a point already does first (policy flags, VSS manual start), then Enable-ComputerRestore. */
function protectOnScript() {
  return `
$ErrorActionPreference = 'Continue'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Output 'RP_FAIL:not_admin'; exit 0 }
try {
  foreach ($n in 'DisableSR','DisableConfig') { Remove-ItemProperty -Path '${SR_POLICY}' -Name $n -ErrorAction SilentlyContinue }
  $vss = (Get-ItemProperty -Path '${VSS_KEY}' -Name Start -ErrorAction SilentlyContinue).Start
  if ($vss -eq 4) { Set-ItemProperty -Path '${VSS_KEY}' -Name Start -Value 3 -Type DWord -ErrorAction Stop }
  Enable-ComputerRestore -Drive ($env:SystemDrive + [char]92) -ErrorAction Stop
  Write-Output 'RP_OK'
} catch { Write-Output "RP_FAIL:error:$($_.Exception.Message)" }
`
}

/** Turn it off: Windows then drops the points on that drive, so the page confirms first. */
function protectOffScript() {
  return `
$ErrorActionPreference = 'Stop'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Output 'RP_FAIL:not_admin'; exit 0 }
try { Disable-ComputerRestore -Drive ($env:SystemDrive + [char]92); Write-Output 'RP_OK' } catch { Write-Output "RP_FAIL:error:$($_.Exception.Message)" }
`
}

/** The most of the disk the points may use, as a percent (vssadmin resizes the shadow storage of the system drive). */
function storageScript(pct) {
  const n = pctOf(pct)
  return `
$ErrorActionPreference = 'Continue'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Output 'RP_FAIL:not_admin'; exit 0 }
$d = $env:SystemDrive
$out = & vssadmin.exe resize shadowstorage "/For=$d" "/On=$d" "/MaxSize=${n}%" 2>&1 | Out-String
if ($LASTEXITCODE -eq 0) { Write-Output 'RP_OK' } else { Write-Output ('RP_FAIL:error:' + ($out -replace '\\s+', ' ').Trim()) }
`
}

/** Restart into a restore point. Restore-Computer reboots the PC as soon as Windows has staged it. */
function restoreScript(seq) { return `Restore-Computer -RestorePoint ${posInt(seq)} -Confirm:$false -ErrorAction Stop` }

/** Delete one point by deleting its shadow copy (the only reliable way). Matches by creation time and refuses to guess when two snapshots are within 10 s. */
function deleteScript(seq) {
  const n = posInt(seq)
  return `
$ErrorActionPreference = 'Stop'
$rp = Get-ComputerRestorePoint | Where-Object { $_.SequenceNumber -eq ${n} }
if (-not $rp) { throw "Restore point ${n} not found" }
$rpTime = $rp.ConvertToDateTime($rp.CreationTime)
$cands = @(Get-WmiObject -Class Win32_ShadowCopy | Where-Object {
    $scTime = [Management.ManagementDateTimeConverter]::ToDateTime($_.InstallDate)
    [Math]::Abs(($scTime - $rpTime).TotalSeconds) -lt 10
})
if ($cands.Count -eq 0) { throw "No shadow copy found matching restore point ${n}" }
# Never guess: if two snapshots were taken within seconds of each other, deleting the wrong one cannot be undone.
if ($cands.Count -gt 1) { throw "More than one shadow copy matches restore point ${n} - refusing to delete" }
$sc = $cands[0]
$id = $sc.ID
$sc.Delete()
Write-Output "deleted:$id"
`
}

/** Fallback when the WMI delete printed the shadow id but threw: the id is validated as a GUID before it reaches the command line. */
function deleteByIdScript(id) {
  if (!/^\{[0-9a-fA-F-]{36}\}$/.test(String(id))) throw new Error('invalid shadow id')
  return `& vssadmin.exe delete shadows "/Shadow=${id}" /Quiet | Out-Null; if ($LASTEXITCODE -eq 0) { Write-Output 'RP_OK' } else { Write-Output 'RP_FAIL:error:vssadmin' }`
}

/** RP_OK / RP_FAIL:code[:reason] -> { ok, code, reason }. Anything that is not an explicit RP_OK is a failure. */
function parseOk(res) {
  const line = String((res && res.out) || '').split(/[\r\n]+/).map(l => l.trim()).filter(l => l.startsWith('RP_')).pop() || ''
  if (line === 'RP_OK') return { ok: true }
  const f = /^RP_FAIL:([a-z_]+)(?::(.*))?$/.exec(line)
  return { ok: false, code: f ? f[1] : 'error', reason: (f && f[2]) || String((res && res.err) || '').trim().slice(0, 300) }
}

module.exports = { protectOnScript, protectOffScript, storageScript, restoreScript, deleteScript, deleteByIdScript, parseOk, posInt, pctOf }
