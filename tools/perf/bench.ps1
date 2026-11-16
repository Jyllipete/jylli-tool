# Repeatable idle-cost benchmark of Jylli Tool (dev build, not elevated, fresh profile, no game).
# Usage: powershell -File tools/perf/bench.ps1 -Out docs/perf/baseline.json [-Visible 90] [-Hidden 90] [-Control 60] [-Tray]
#   control : the PC without Jylli Tool (WmiPrvSE and total spawn noise), so the app's share can be told apart
#   visible : window shown, after the boot scan settled (-Settle seconds)
#   hidden  : window minimised to the tray, page unloaded after 60 s, then sampled
#   -Tray   : extra scenario, launched with --tray (start hidden; only when the app supports it)
# Reads userData/perf.log written by `electron . --perf-log` (spawn counts by exe, main-process CPU, per-process CPU and memory).
param([string]$Out = '', [int]$Visible = 90, [int]$Hidden = 90, [int]$Control = 60, [int]$Settle = 45, [switch]$Tray)
$ErrorActionPreference = 'Stop'
$repo = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$electron = Join-Path $repo 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path $electron)) { throw "electron.exe not found: $electron" }
if (Get-Process -Name 'Jylli Tool' -EA SilentlyContinue) { throw 'Close the installed Jylli Tool first (single-instance lock).' }

Add-Type -Namespace JT -Name Win -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int cmd);
'@

function Wmi-Cpu { (Get-Process -Name WmiPrvSE -EA SilentlyContinue | Measure-Object CPU -Sum).Sum }
function Window-Stats($rows) {
  if (-not $rows -or $rows.Count -eq 0) { return $null }
  $secs = [math]::Max(1, ([datetime]$rows[-1].t - [datetime]$rows[0].t).TotalSeconds + 5)
  $by = @{}; $spawnTotal = 0
  foreach ($r in $rows) { if ($r.spawns) { $spawnTotal += $r.spawns.total; foreach ($p in $r.spawns.by.PSObject.Properties) { $by[$p.Name] = ($by[$p.Name] + $p.Value) } } }
  $byRate = [ordered]@{}; foreach ($e in ($by.GetEnumerator() | Sort-Object Value -Descending)) { $byRate[$e.Key] = [math]::Round($e.Value / $secs * 60, 1) }
  $cpu = ($rows | ForEach-Object { ($_.procs | Measure-Object cpu -Sum).Sum } | Measure-Object -Average).Average
  $mem = ($rows | ForEach-Object { ($_.procs | Measure-Object memMB -Sum).Sum } | Measure-Object -Average).Average
  $mainMs = ($rows | Measure-Object mainCpuMs -Sum).Sum
  $last = $rows[-1]
  [ordered]@{
    seconds = [math]::Round($secs); samples = $rows.Count
    spawnsPerMin = [math]::Round($spawnTotal / $secs * 60, 1)
    spawnsByExePerMin = $byRate
    appCpuPct = [math]::Round($cpu, 2)          # sum of the app's processes, % of one core-equivalent as Electron reports it
    mainCpuMsPerSec = [math]::Round($mainMs / $secs, 1)
    workingSetMB = [math]::Round($mem)
    lastTray = $last.tray
  }
}

$result = [ordered]@{ date = (Get-Date -Format s); cores = [Environment]::ProcessorCount; scenarios = [ordered]@{} }

# control: nothing of ours running
$w0 = Wmi-Cpu; $t0 = Get-Date; Start-Sleep -Seconds $Control
$result.control = [ordered]@{ seconds = $Control; wmiPrvSeCpuSec = [math]::Round((Wmi-Cpu) - $w0, 2) }

function Run-Scenario($name, $extraArgs) {
  $ud = Join-Path ([IO.Path]::GetTempPath()) ('jt-bench-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
  New-Item -ItemType Directory $ud | Out-Null
  $argList = @($repo.Path, '--perf-log', "--user-data-dir=$ud") + $extraArgs
  $p = Start-Process -FilePath $electron -ArgumentList $argList -PassThru -WindowStyle Normal
  try {
    Start-Sleep -Seconds $Settle
    $log = Join-Path $ud 'perf.log'
    $out = [ordered]@{}
    $marks = $null
    if (Test-Path $log) { $l = Get-Content $log | Select-Object -Last 1 | ConvertFrom-Json; $marks = $l.marks }
    $out.startupMarksMs = $marks
    if ($extraArgs -notcontains '--tray') {
      $vStart = Get-Date; $w = Wmi-Cpu
      Start-Sleep -Seconds $Visible
      $vEnd = Get-Date; $wv = (Wmi-Cpu) - $w
      $rows = @(Get-Content $log | ForEach-Object { $_ | ConvertFrom-Json } | Where-Object { [datetime]$_.t -ge $vStart -and [datetime]$_.t -le $vEnd })
      $out.visible = Window-Stats $rows; if ($out.visible) { $out.visible.wmiPrvSeCpuSec = [math]::Round($wv, 2) }
      # minimise the main window: the app hides it to the tray; the page is unloaded after 60 s
      $p.Refresh(); $hwnd = [IntPtr]$p.MainWindowHandle; if ($hwnd -ne [IntPtr]::Zero) { [JT.Win]::ShowWindow($hwnd, 6) | Out-Null } else { Write-Warning "no main window handle; the hidden phase is measured with the window still open" }
      Start-Sleep -Seconds 75
    }
    $hStart = Get-Date; $w = Wmi-Cpu
    Start-Sleep -Seconds $Hidden
    $hEnd = Get-Date; $wh = (Wmi-Cpu) - $w
    $rows = @(Get-Content $log | ForEach-Object { $_ | ConvertFrom-Json } | Where-Object { [datetime]$_.t -ge $hStart -and [datetime]$_.t -le $hEnd })
    $out.hidden = Window-Stats $rows; if ($out.hidden) { $out.hidden.wmiPrvSeCpuSec = [math]::Round($wh, 2) }
    return $out
  } finally {
    if (-not $p.HasExited) { & taskkill /PID $p.Id /T /F | Out-Null }
    Start-Sleep -Seconds 2
    Get-Process -Name LibreHardwareMonitor, JylliSensor -EA SilentlyContinue | Stop-Process -Force -EA SilentlyContinue
    Remove-Item -Recurse -Force $ud -EA SilentlyContinue
  }
}

$result.scenarios.normalStart = Run-Scenario 'normalStart' @()
if ($Tray) { $result.scenarios.trayStart = Run-Scenario 'trayStart' @('--tray') }

$json = $result | ConvertTo-Json -Depth 8
if ($Out) { $full = if ([IO.Path]::IsPathRooted($Out)) { $Out } else { Join-Path (Get-Location).Path $Out }; New-Item -ItemType Directory -Force (Split-Path -Parent $full) | Out-Null; Set-Content -Path $full -Value $json -Encoding UTF8 }
$json
