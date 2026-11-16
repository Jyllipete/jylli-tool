# Samples the memory and CPU of Jylli Tool and every child it started.
# Usage: powershell -File tools/perf/tray-footprint.ps1 -Seconds 180 [-Every 5]
param([int]$Seconds = 60, [int]$Every = 5, [int]$RootPid = 0)
$root = $null
if ($RootPid) { $root = Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -eq $RootPid } }
if (-not $root) { $root = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'Jylli Tool.exe' -and $_.CommandLine -notmatch '--type=' } | Select-Object -First 1 }
if (-not $root) { $root = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'electron.exe' -and $_.CommandLine -notmatch '--type=' -and $_.CommandLine -match 'jylli' } | Select-Object -First 1 }
if (-not $root) { Write-Host 'Jylli Tool is not running'; exit 1 }
function Get-Tree($id, $all) {
  $id
  foreach ($c in ($all | Where-Object { $_.ParentProcessId -eq $id })) { Get-Tree $c.ProcessId $all }
}
$end = (Get-Date).AddSeconds($Seconds)
$prev = @{}
# WMI work the app causes is billed to WmiPrvSE.exe, which is not a child of ours: report its CPU-seconds over the run (the whole PC's, so compare with a run
# of the same length without the app), and how many distinct child processes were seen (short-lived PowerShell helpers only show up if a sample catches them).
function Wmi-Cpu { (Get-Process -Name WmiPrvSE -EA SilentlyContinue | Measure-Object CPU -Sum).Sum }
$wmi0 = Wmi-Cpu; $seenPids = @{}
while ((Get-Date) -lt $end) {
  $all = Get-CimInstance Win32_Process
  $ids = @(Get-Tree $root.ProcessId $all)
  $rows = foreach ($id in $ids) {
    $p = Get-Process -Id $id -EA SilentlyContinue; if (-not $p) { continue }
    $w = $all | Where-Object { $_.ProcessId -eq $id }
    $type = if ($w.CommandLine -match '--type=([a-z-]+)') { $Matches[1] } else { '' }
    $cpu = 0.0; if ($prev.ContainsKey($id)) { $cpu = [math]::Round(($p.CPU - $prev[$id]) / $Every / [Environment]::ProcessorCount * 100, 2) }
    $prev[$id] = $p.CPU
    [pscustomobject]@{ Pid = $id; Name = $p.ProcessName; Type = $type; PrivMB = [math]::Round($p.PrivateMemorySize64 / 1MB); WsMB = [math]::Round($p.WorkingSet64 / 1MB); CpuPct = $cpu }
  }
  foreach ($id in $ids) { $seenPids[$id] = $true }
  '--- ' + (Get-Date -Format 'HH:mm:ss') + '  distinct pids seen ' + $seenPids.Count + ', WmiPrvSE cpu-s since start ' + [math]::Round((Wmi-Cpu) - $wmi0, 2) + '  total private ' + ($rows | Measure-Object PrivMB -Sum).Sum + ' MB, ws ' + ($rows | Measure-Object WsMB -Sum).Sum + ' MB, cpu ' + [math]::Round(($rows | Measure-Object CpuPct -Sum).Sum, 2) + ' %'
  $rows | Sort-Object PrivMB -Descending | Format-Table -AutoSize | Out-String -Width 200
  Start-Sleep -Seconds $Every
}
