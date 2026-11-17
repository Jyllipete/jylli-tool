'use strict'
// Restore points "Lifeline": ONE read-only PowerShell probe (marker JJRP:) and its parser. It reads the restore points, whether System Protection is on,
// the policy values that can switch it off, the Volume Shadow Copy service, the storage the points may use, free disk, battery, last boot and the
// installed programs' install dates. It writes nothing. Anything it could not read is null / pointsRead:false, never a made-up zero, so
// "Windows has none" and "could not ask Windows" stay different answers.
const { parseWmiDate } = require('../../js/restore-nudge')

const SR_KEY = 'HKLM:/SOFTWARE/Microsoft/Windows NT/CurrentVersion/SystemRestore'
const SR_POLICY = 'HKLM:/SOFTWARE/Policies/Microsoft/Windows NT/SystemRestore'
const VSS_KEY = 'HKLM:/SYSTEM/CurrentControlSet/Services/VSS'
const MAX_PROGRAMS = 600

function buildScript() {
  return `
$ErrorActionPreference = 'SilentlyContinue'
$o = [ordered]@{}
$o.admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$sys = $env:SystemDrive
$o.drive = "$sys"
try {
  $pts = @(Get-ComputerRestorePoint -ErrorAction Stop | Sort-Object SequenceNumber -Descending | ForEach-Object { [ordered]@{ seq = [int]$_.SequenceNumber; desc = "$($_.Description)"; time = "$($_.CreationTime)"; type = [int]$_.RestorePointType } })
  $o.points = $pts; $o.pointsRead = $true
} catch { $o.points = @(); $o.pointsRead = $false }
try { $o.lastStatus = "$(Get-ComputerRestorePoint -LastStatus -ErrorAction Stop)" } catch { $o.lastStatus = $null }
$o.interval = (Get-ItemProperty -Path '${SR_KEY}' -Name RPSessionInterval).RPSessionInterval
$o.disableSR = (Get-ItemProperty -Path '${SR_POLICY}' -Name DisableSR).DisableSR
$o.disableConfig = (Get-ItemProperty -Path '${SR_POLICY}' -Name DisableConfig).DisableConfig
$o.vssStart = (Get-ItemProperty -Path '${VSS_KEY}' -Name Start).Start
try {
  $vol = Get-CimInstance Win32_Volume -Filter ("DriveLetter='" + $sys + "'")
  $all = @(Get-CimInstance Win32_ShadowStorage)
  $mine = @($all | Where-Object { $_.Volume.DeviceID -eq $vol.DeviceID })
  if ($mine.Count -eq 0 -and $all.Count -gt 0 -and -not $vol) { $mine = $all }
  $u = 0.0; $m = 0.0; $a = 0.0
  foreach ($s in $mine) { $u += [double]$s.UsedSpace; $m += [double]$s.MaxSpace; $a += [double]$s.AllocatedSpace }
  $o.storage = [ordered]@{ has = ($mine.Count -gt 0); used = $u; max = $m; alloc = $a }
  $o.volume = [ordered]@{ size = [double]$vol.Capacity; free = [double]$vol.FreeSpace }
} catch { $o.storage = $null; $o.volume = $null }
try { $b = @(Get-CimInstance Win32_Battery); $o.battery = [ordered]@{ present = ($b.Count -gt 0); discharging = (@($b | Where-Object { $_.BatteryStatus -eq 1 }).Count -gt 0); pct = if ($b.Count) { [int]$b[0].EstimatedChargeRemaining } else { $null } } } catch { $o.battery = $null }
try { $o.bootAt = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime().ToString('o') } catch { $o.bootAt = $null }
try {
  $paths = 'HKLM:/SOFTWARE/Microsoft/Windows/CurrentVersion/Uninstall/*', 'HKLM:/SOFTWARE/WOW6432Node/Microsoft/Windows/CurrentVersion/Uninstall/*', 'HKCU:/SOFTWARE/Microsoft/Windows/CurrentVersion/Uninstall/*'
  $o.programs = @(Get-ItemProperty -Path $paths | Where-Object { $_.DisplayName -and $_.InstallDate -match '^\\d{8}$' -and $_.SystemComponent -ne 1 } | Select-Object -First ${MAX_PROGRAMS} | ForEach-Object { [ordered]@{ n = "$($_.DisplayName)"; d = "$($_.InstallDate)" } })
} catch { $o.programs = @() }
'JJRP:' + ($o | ConvertTo-Json -Compress -Depth 6)
`
}

const arr = v => (v == null ? [] : Array.isArray(v) ? v : [v])
const num = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

/** "The last attempt to restore ... failed / was interrupted / succeeded" -> one word. Matching is by keyword only because Windows words it per language. */
function lastStatusOf(s) {
  const t = String(s == null ? '' : s).toLowerCase()
  if (!t.trim()) return 'unknown'
  if (/interrupt|keskeyt/.test(t)) return 'interrupted'
  if (/fail|ep[aä]onnis/.test(t)) return 'failed'
  if (/succe|onnistu/.test(t)) return 'succeeded'
  if (/no\s+(attempt|record)|ei ole/.test(t)) return 'none'
  return 'unknown'
}

/** yyyymmdd -> local midnight ms, or null. */
function dayOf(s) {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(s || ''))
  if (!m) return null
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
  return Number.isFinite(t) ? t : null
}

/** probe output -> facts. `ok:false` means the probe itself did not run; pointsRead:false means Windows would not list the points. */
function parse(out) {
  const i = String(out || '').lastIndexOf('JJRP:')
  if (i < 0) return { ok: false }
  let j
  try { j = JSON.parse(String(out).slice(i + 5).trim().split(/\r?\n/)[0]) } catch { return { ok: false } }
  if (!j || typeof j !== 'object') return { ok: false }
  const points = arr(j.points).map(p => ({ seq: num(p.seq), desc: String(p.desc || ''), at: parseWmiDate(p.time), type: num(p.type) }))
    .filter(p => p.seq != null && p.seq > 0).sort((a, b) => b.seq - a.seq)
  const interval = num(j.interval), disableSR = num(j.disableSR), disableConfig = num(j.disableConfig), vssStart = num(j.vssStart)
  const st = j.storage && typeof j.storage === 'object' ? j.storage : null
  const vol = j.volume && typeof j.volume === 'object' ? j.volume : null
  const size = vol ? num(vol.size) : null
  const maxRaw = st ? num(st.max) : null
  // "No limit" shows up as a number bigger than the disk (or 2^64): treat it as unbounded, never as a cap.
  const unbounded = !!(st && st.has && maxRaw != null && (maxRaw <= 0 || (size != null && maxRaw > size) || maxRaw >= 9e18))
  const storage = st ? { has: st.has === true, used: num(st.used) || 0, alloc: num(st.alloc) || 0, max: st.has && !unbounded ? maxRaw : null, unbounded } : null
  const policyBlocked = disableSR === 1 || disableConfig === 1
  // RPSessionInterval is Windows' own on/off flag for System Restore (1 on, 0 off); when it is absent, the existence of shadow storage is the next best evidence.
  const protection = interval === 1 ? 'on' : interval === 0 ? 'off' : storage ? (storage.has ? 'on' : 'off') : 'unknown'
  const b = j.battery && typeof j.battery === 'object' ? j.battery : null
  const programs = arr(j.programs).map(p => ({ name: String(p.n || ''), day: dayOf(p.d) })).filter(p => p.name && p.day != null)
  const bootAt = j.bootAt ? Date.parse(j.bootAt) : null
  return {
    ok: true,
    admin: j.admin === true,
    drive: String(j.drive || 'C:'),
    pointsRead: j.pointsRead === true,
    points,
    lastStatus: lastStatusOf(j.lastStatus),
    protection,
    policy: { disableSR: disableSR === 1, disableConfig: disableConfig === 1, blocked: policyBlocked },
    vss: { start: vssStart, disabled: vssStart === 4 },
    storage,
    volume: vol ? { size, free: num(vol.free) } : null,
    battery: b ? { present: b.present === true, discharging: b.discharging === true, pct: num(b.pct) } : null,
    bootAt: Number.isFinite(bootAt) ? bootAt : null,
    programs,
  }
}

module.exports = { buildScript, parse, lastStatusOf, dayOf, SR_KEY, SR_POLICY, VSS_KEY }
