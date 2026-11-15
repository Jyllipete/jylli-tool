'use strict'
// Startup tab "Ignition": the PowerShell this tab may run. Every write goes through the change journal (runRecorded), so each one is undoable.
//   approvedLines   Windows' own on/off byte in Explorer\StartupApproved (what Task Manager > Startup apps reads and writes). Nothing is deleted.
//   taskLines       Enable-/Disable-ScheduledTask for a logon task (the journal records the task's state itself)
//   delay*          Jylli's own delay task in \JylliTool\ (runs the program N seconds after sign-in, no time limit)
//   migrate*        puts back what an older version did (values moved to Run\AutorunsDisabled, flat JylliDelay_ tasks)
//   switchLines     the one switch this tab owns
const path = require('path')
const catalog = require('./catalog')

const psq = s => "'" + String(s == null ? '' : s).replace(/'/g, "''") + "'"
const bytes = a => '([byte[]](' + a.join(',') + '))'

/** One line group that sets the on/off byte of a Run value or a Startup-folder file. src must have an `approved` key. */
function approvedLines(srcId, name, on, nowMs) {
  const s = catalog.SOURCES[srcId]
  if (!s || !s.approved) return []
  const b = on ? catalog.ON_BYTES : catalog.offBytes(nowMs || Date.now())
  return [
    `New-Item -Path ${psq(s.approved)} -Force -ErrorAction SilentlyContinue | Out-Null`,
    `Set-ItemProperty -Path ${psq(s.approved)} -Name ${psq(name)} -Value ${bytes(b)} -Type Binary -Force`,
  ]
}

function taskLines(taskPath, taskName, on) {
  return [`${on ? 'Enable' : 'Disable'}-ScheduledTask -TaskPath ${psq(taskPath)} -TaskName ${psq(taskName)} | Out-Null`]
}

// ── Jylli's delay task ──────────────────────────────────────────────────────
const wdOf = exe => { const d = path.win32.dirname(String(exe || '')); return d && d !== '.' ? d : '' }

function delayCreateScript({ name, exe, args, sec }) {
  const wd = wdOf(exe)
  return `$ErrorActionPreference = 'Stop'
$act = New-ScheduledTaskAction -Execute ${psq(exe)}${args ? ' -Argument ' + psq(args) : ''}${wd ? ' -WorkingDirectory ' + psq(wd) : ''}
$me = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$trg = New-ScheduledTaskTrigger -AtLogOn -User $me
$trg.Delay = 'PT${Math.max(5, Math.min(600, Math.round(Number(sec) || 60)))}S'
$set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
$pri = New-ScheduledTaskPrincipal -UserId $me -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskPath ${psq(catalog.DELAY_PATH)} -TaskName ${psq(name)} -Action $act -Trigger $trg -Settings $set -Principal $pri -Description 'Started a little after sign-in by Jylli Tool (Startup tab). Remove it there, or switch the program on in Task Manager.' -Force | Out-Null
if (Get-ScheduledTask -TaskPath ${psq(catalog.DELAY_PATH)} -TaskName ${psq(name)} -ErrorAction SilentlyContinue) { Write-Output 'JJOK' }`
}
function delayRemoveScript(name) {
  return `$ErrorActionPreference = 'Stop'
Unregister-ScheduledTask -TaskPath ${psq(catalog.DELAY_PATH)} -TaskName ${psq(name)} -Confirm:$false
Write-Output 'JJOK'`
}
function delayStateScript(name) {
  return `$t = $null; try { $t = Get-ScheduledTask -TaskPath ${psq(catalog.DELAY_PATH)} -TaskName ${psq(name)} -ErrorAction Stop } catch {}
if ($t) { Write-Output 'JJSTATE{"e":true,"v":"present"}' } else { Write-Output 'JJSTATE{"e":false}' }`
}
const stateOk = out => { const m = /JJSTATE(\{.*\})/.exec(String(out || '')); if (!m) return { unknown: true }; try { const j = JSON.parse(m[1]); return j.e ? { exists: true, value: 'present' } : { exists: false } } catch { return { unknown: true } } }

// ── migrating what an older version did ─────────────────────────────────────
/** A value that an older version moved to Run\AutorunsDisabled goes back to Run with its original type; Windows' own switch then keeps it off. */
function migrateDisabledLines(srcId, name, nowMs) {
  const run = catalog.SOURCES[srcId] && catalog.SOURCES[srcId].key, dis = catalog.LEGACY_DISABLED[srcId]
  if (!run || !dis) return []
  return [
    `$from = ${psq(dis)}; $to = ${psq(run)}; $n = ${psq(name)}
$src = Get-Item -LiteralPath $from -ErrorAction SilentlyContinue
if ($null -eq $src -or $null -eq $src.GetValue($n, $null)) { Write-Error 'VALUE_NOT_FOUND'; exit 1 }
$val = $src.GetValue($n, $null, 'DoNotExpandEnvironmentNames'); $kind = $src.GetValueKind($n).ToString()
New-ItemProperty -Path $to -Name $n -Value $val -PropertyType $kind -Force -ErrorAction Stop | Out-Null
if ($null -eq (Get-Item -LiteralPath $to).GetValue($n, $null)) { Write-Error 'WRITE_VERIFY_FAILED'; exit 1 }
Remove-ItemProperty -Path $from -Name $n -Force -ErrorAction SilentlyContinue`,
    ...approvedLines(srcId, name, false, nowMs),
  ]
}
/** A flat JylliDelay_ task (older version) is removed and its program goes back to the user's Run key, switched on. */
function migrateTaskLines(task) {
  const cmd = ((task.exe ? '"' + task.exe + '"' : '') + (task.args ? ' ' + task.args : '')).trim()
  const nm = String(task.name).replace(catalog.LEGACY_TASK_PREFIX, '')
  return [
    `New-ItemProperty -Path ${psq(catalog.SOURCES['run-hkcu'].key)} -Name ${psq(nm)} -Value ${psq(cmd)} -PropertyType String -Force -ErrorAction Stop | Out-Null`,
    ...approvedLines('run-hkcu', nm, true),
    `Unregister-ScheduledTask -TaskPath ${psq(task.path || '\\')} -TaskName ${psq(task.name)} -Confirm:$false -ErrorAction Stop`,
  ]
}

// ── the owned switch ────────────────────────────────────────────────────────
function switchLines(row, on, before) {
  if (on) return [`New-Item -Path ${psq(row.key)} -Force -ErrorAction SilentlyContinue | Out-Null`, `Set-ItemProperty -Path ${psq(row.key)} -Name ${psq(row.name)} -Value ${row.value} -Type DWord -Force`]
  if (before === 1) return [`Set-ItemProperty -Path ${psq(row.key)} -Name ${psq(row.name)} -Value 1 -Type DWord -Force`]
  return [`Remove-ItemProperty -Path ${psq(row.key)} -Name ${psq(row.name)} -Force -ErrorAction SilentlyContinue`]
}

module.exports = { approvedLines, taskLines, delayCreateScript, delayRemoveScript, delayStateScript, stateOk, migrateDisabledLines, migrateTaskLines, switchLines, wdOf, psq }
