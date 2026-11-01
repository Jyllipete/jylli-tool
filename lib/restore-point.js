'use strict'
// One place that creates a System Restore point and PROVES it exists. Checkpoint-Computer only warns (and exits 0) when Windows'
// 24h throttle or a disabled System Restore swallows the request, so success is judged by a new sequence number appearing in
// Get-ComputerRestorePoint, never by an exit code. Everything the attempt changes (the throttle value, the VSS start type) is put
// back in a finally block. Registry paths use '/' because the PowerShell registry provider accepts it and it keeps the script free of escapes.

const SR_KEY = 'HKLM:/SOFTWARE/Microsoft/Windows NT/CurrentVersion/SystemRestore'
const SR_POLICY = 'HKLM:/SOFTWARE/Policies/Microsoft/Windows NT/SystemRestore'
const VSS_KEY = 'HKLM:/SYSTEM/CurrentControlSet/Services/VSS'

const cleanDesc = d => String(d || 'JylliTool_Restore').replace(/[^A-Za-z0-9 ._-]/g, '').slice(0, 80) || 'JylliTool_Restore'

function buildScript(desc) {
  const d = cleanDesc(desc)
  return `
$ErrorActionPreference = 'Continue'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Output 'RP_FAIL:not_admin:Administrator rights are required to create a restore point'; exit 0 }
$srKey = '${SR_KEY}'; $vssKey = '${VSS_KEY}'
$drive = $env:SystemDrive + [char]92
$origFreq = (Get-ItemProperty -Path $srKey -Name SystemRestorePointCreationFrequency -ErrorAction SilentlyContinue).SystemRestorePointCreationFrequency
$origVss = (Get-ItemProperty -Path $vssKey -Name Start -ErrorAction SilentlyContinue).Start
try {
  foreach ($n in 'DisableSR','DisableConfig') { Remove-ItemProperty -Path '${SR_POLICY}' -Name $n -ErrorAction SilentlyContinue }
  if ($origVss -eq 4) { Set-ItemProperty -Path $vssKey -Name Start -Value 3 -Type DWord -ErrorAction SilentlyContinue }
  Enable-ComputerRestore -Drive $drive -ErrorAction SilentlyContinue
  Set-ItemProperty -Path $srKey -Name SystemRestorePointCreationFrequency -Value 0 -Type DWord -ErrorAction Stop
  $before = (Get-ComputerRestorePoint -ErrorAction SilentlyContinue | Measure-Object -Property SequenceNumber -Maximum).Maximum
  if ($null -eq $before) { $before = 0 }
  $err = ''
  try { Checkpoint-Computer -Description '${d}' -RestorePointType MODIFY_SETTINGS -ErrorAction Stop -WarningAction SilentlyContinue }
  catch {
    $err = $_.Exception.Message
    try { $r = (Get-WmiObject -Class SystemRestore -Namespace root/default).CreateRestorePoint('${d}', 12, 100); if ($r.ReturnValue -ne 0) { $err = "$err (WMI code $($r.ReturnValue))" } }
    catch { $err = "$err | $($_.Exception.Message)" }
  }
  $after = (Get-ComputerRestorePoint -ErrorAction SilentlyContinue | Measure-Object -Property SequenceNumber -Maximum).Maximum
  if ($null -ne $after -and $after -gt $before) { Write-Output "RP_OK:$after" }
  elseif ($err) { Write-Output "RP_FAIL:error:$err" }
  else { Write-Output 'RP_FAIL:not_created:Windows accepted the request but no restore point appeared' }
} catch { Write-Output "RP_FAIL:error:$($_.Exception.Message)" }
finally {
  if ($null -ne $origFreq) { Set-ItemProperty -Path $srKey -Name SystemRestorePointCreationFrequency -Value $origFreq -Type DWord -ErrorAction SilentlyContinue }
  else { Remove-ItemProperty -Path $srKey -Name SystemRestorePointCreationFrequency -ErrorAction SilentlyContinue }
  if ($origVss -eq 4) { Set-ItemProperty -Path $vssKey -Name Start -Value 4 -Type DWord -ErrorAction SilentlyContinue }
}
`
}

const GUIDANCE = {
  not_admin: 'Restart Jylli Tool as administrator, then try again.',
  not_created: 'Open Control Panel > System > System Protection, make sure protection is ON for the system drive, then try again. Windows may also be blocking the request: check that the Volume Shadow Copy service is not disabled by a policy.',
  error: 'Open Control Panel > System > System Protection and make sure protection is ON for the system drive. If it is, check that the Volume Shadow Copy and Microsoft Software Shadow Copy Provider services are not disabled.',
}

/** Turns the script's output into { ok, seq } or { ok:false, code, reason, guidance }. Anything that is not an explicit RP_OK is a failure. */
function parseResult(res) {
  const out = String((res && res.out) || '').split(/[\r\n]+/).map(l => l.trim()).filter(l => l.startsWith('RP_')).pop() || ''
  const ok = /^RP_OK:([0-9]+)$/.exec(out)
  if (ok) return { ok: true, seq: Number(ok[1]) }
  const f = /^RP_FAIL:([a-z_]+):(.*)$/.exec(out)
  const code = f ? f[1] : 'error'
  const reason = (f && f[2]) || String((res && res.err) || '').trim().slice(0, 300) || 'No result from PowerShell'
  return { ok: false, code, reason, guidance: GUIDANCE[code] || GUIDANCE.error }
}

function createRestorePointService({ runPS }) {
  /** Always resolves; never throws. send(msg, level) is optional and gets the user-facing log lines. */
  async function create(desc, send = () => {}) {
    let res
    try { res = await runPS(buildScript(desc), 120000) } catch (e) { res = { ok: false, out: '', err: String((e && e.message) || e) } }
    const r = parseResult(res)
    if (r.ok) { send(`Restore point created (#${r.seq})`, 'ok'); return r }
    send(`Restore point FAILED: ${r.reason}`, 'err')
    send(r.guidance, 'info')
    return r
  }
  return { create }
}

module.exports = { createRestorePointService, buildScript, parseResult, cleanDesc }
