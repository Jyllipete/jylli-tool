'use strict'
// Boot trial: after a risky change a startup task (SYSTEM) watches the next boots. Two unexpected shutdowns (Kernel-Power 41) after
// arming -> the previous values are written back through HP's interface and the PC restarts. If Windows stays up for WAIT seconds the
// trial passes and the task removes itself. This only helps when Windows boots at all: a PC that never reaches POST needs Clear CMOS.
// The script reads everything it restores from trial.json in an admin-only folder; no value is ever embedded in script text.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const TASK = 'JylliBiosTrial'
const MAX_CRASHES = 2
const WAIT = 300

const SCRIPT = `param([string]$StateDir, [switch]$DryRun, [int]$CrashOverride = -1, [int]$WaitSeconds = ${WAIT})
$ErrorActionPreference = 'Stop'
$statePath = Join-Path $StateDir 'trial.json'
function Log($m) { Add-Content -LiteralPath (Join-Path $StateDir 'trial.log') -Value ('{0:o} {1}' -f (Get-Date), $m) }
function Save($o) { $o | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $statePath -Encoding UTF8 }
function Done($status) { $s.status = $status; $s.finishedAt = [int64][DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); Save $s }
if (-not (Test-Path -LiteralPath $statePath)) { exit 0 }
$s = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
if ($s.status -ne 'armed') { exit 0 }
$since = [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$s.armedAt).LocalDateTime
$crashes = if ($CrashOverride -ge 0) { $CrashOverride } else { @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; Id = 41; StartTime = $since } -ErrorAction SilentlyContinue).Count }
Log "crashes since arming: $crashes"
if ($crashes -ge [int]$s.maxCrashes) {
  if ($DryRun) { Write-Output 'WOULD_REVERT'; exit 0 }
  $ok = $true
  try {
    $i = Get-CimInstance -Namespace root/HP/InstrumentedBIOS -ClassName HP_BIOSSettingInterface
    foreach ($r in @($s.restore)) {
      $res = Invoke-CimMethod -InputObject $i -MethodName SetBIOSSetting -Arguments @{ Name = [string]$r.name; Value = [string]$r.value; Password = '<utf-16/>' }
      if ($res.Return -ne 0) { $ok = $false; Log "restore failed for $($r.name): code $($res.Return)"; break }
    }
  } catch { $ok = $false; Log "restore error: $($_.Exception.Message)" }
  if ($ok) { Done 'reverted'; schtasks.exe /Delete /TN ${TASK} /F | Out-Null; Log 'reverted, restarting'; shutdown.exe /r /t 30 /c 'Jylli Tool is restoring your previous BIOS settings.' }
  else { Done 'revert_failed' }
  exit 0
}
if ($DryRun) { Write-Output 'WOULD_WAIT'; exit 0 }
Start-Sleep -Seconds $WaitSeconds
Done 'passed'
schtasks.exe /Delete /TN ${TASK} /F | Out-Null
Log 'trial passed'
`

const paths = dir => ({ state: path.join(dir, 'trial.json'), script: path.join(dir, 'trial.ps1') })
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex')

function read(dir) {
  // the startup script saves with Windows PowerShell, which writes a UTF-8 BOM that JSON.parse rejects
  try { return JSON.parse(fs.readFileSync(paths(dir).state, 'utf8').replace(/^﻿/, '')) } catch { return null }
}

/**
 * Writes the script and the state. `restore` is [{ name, value }] with the values from BEFORE the commit. A second arm while one is
 * still armed keeps the earliest value per setting, so a revert always goes back to the state before the first risky change.
 */
function arm(dir, { engine, snapshotId, restore, now = Date.now() }) {
  if (engine !== 'hp-wmi') return { ok: false, error: 'engine_unsupported' }
  const p = paths(dir)
  fs.mkdirSync(dir, { recursive: true })
  const prev = read(dir)
  const merged = new Map()
  if (prev && prev.status === 'armed') for (const r of prev.restore || []) merged.set(r.name, String(r.value))
  for (const r of restore) if (!merged.has(r.name)) merged.set(r.name, String(r.value))
  const state = { status: 'armed', engine, snapshotId, armedAt: now, finishedAt: null, maxCrashes: MAX_CRASHES, restore: [...merged].map(([name, value]) => ({ name, value })), script: sha256(SCRIPT) }
  fs.writeFileSync(p.script, SCRIPT)
  fs.writeFileSync(p.state, JSON.stringify(state, null, 2))
  return { ok: true, state }
}

function disarm(dir) {
  const s = read(dir)
  if (!s) return null
  if (s.status === 'armed') { s.status = 'disarmed'; s.finishedAt = Date.now(); fs.writeFileSync(paths(dir).state, JSON.stringify(s, null, 2)) }
  return s
}

/** schtasks arguments that register the startup task. */
const createArgs = dir => ['/Create', '/TN', TASK, '/SC', 'ONSTART', '/RU', 'SYSTEM', '/RL', 'HIGHEST', '/F',
  '/TR', `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${paths(dir).script}" -StateDir "${dir}"`]
const deleteArgs = () => ['/Delete', '/TN', TASK, '/F']

/** True when the script on disk is the one we wrote (checked before arming is trusted). */
const scriptIntact = dir => { try { return sha256(fs.readFileSync(paths(dir).script, 'utf8')) === sha256(SCRIPT) } catch { return false } }

module.exports = { TASK, MAX_CRASHES, WAIT, SCRIPT, arm, disarm, read, createArgs, deleteArgs, scriptIntact, paths }
