$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
function New-Counters($cat, $counter, $filter) {
  $list = @()
  try {
    foreach ($i in (New-Object Diagnostics.PerformanceCounterCategory($cat)).GetInstanceNames()) {
      if ($filter -and $i -notmatch $filter) { continue }
      $c = New-Object Diagnostics.PerformanceCounter($cat, $counter, $i, $true)
      $null = $c.NextValue()
      $list += , @($i, $c)
    }
  } catch {}
  return ,$list
}
$cpuC = $null
try { $cpuC = New-Object Diagnostics.PerformanceCounter('Processor Information', '% Processor Utility', '_Total', $true); $null = $cpuC.NextValue() } catch {}
$rx = @(); $tx = @(); $gpuC = @(); $tick = 0; $lastInst = [DateTime]::MinValue
while ($true) {
  if (([DateTime]::UtcNow - $lastInst).TotalSeconds -gt 10) {   # adapters and GPU engines come and go; refresh the instance lists
    $rx = New-Counters 'Network Interface' 'Bytes Received/sec' '^(?!.*(isatap|Loopback|Teredo|Pseudo)).*$'
    $tx = New-Counters 'Network Interface' 'Bytes Sent/sec' '^(?!.*(isatap|Loopback|Teredo|Pseudo)).*$'
    $gpuC = New-Counters 'GPU Engine' 'Utilization Percentage' 'engtype_3D'
    $lastInst = [DateTime]::UtcNow
  }
  $o = [ordered]@{ t = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
  if ($cpuC) { $o.cpuLoad = [math]::Round([math]::Min(100, $cpuC.NextValue()), 1) }
  $os = Get-CimInstance Win32_OperatingSystem
  if ($os) { $o.ramTotalGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2); $o.ramUsedGB = [math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / 1MB, 2) }
  if ($os) { $o.uptimeSec = [int]((Get-Date) - $os.LastBootUpTime).TotalSeconds }
  try { $d = New-Object IO.DriveInfo ($env:SystemDrive); $o.diskTotalGB = [math]::Round($d.TotalSize / 1GB, 1); $o.diskUsedGB = [math]::Round(($d.TotalSize - $d.AvailableFreeSpace) / 1GB, 1) } catch {}
  $nets = [ordered]@{}
  foreach ($p in $rx) { $nets[$p[0]] = @([math]::Round($p[1].NextValue()), 0) }
  foreach ($p in $tx) { if ($nets.Contains($p[0])) { $nets[$p[0]][1] = [math]::Round($p[1].NextValue()) } else { $null = $p[1].NextValue() } }
  $o.net = $nets
  if ($gpuC.Count) { $g = 0.0; foreach ($p in $gpuC) { $g += $p[1].NextValue() }; $o.gpuLoad = [math]::Round([math]::Min(100, $g), 1) }
  if ($tick % 5 -eq 0) { $script:procs = (Get-Process).Count }
  # Drive temperature: Windows only reports it with administrator rights; without them the value is simply absent.
  if ($tick % 30 -eq 0) { $script:dtemp = $null; try { $c = Get-PhysicalDisk | Select-Object -First 1 | Get-StorageReliabilityCounter -ErrorAction Stop; if ($c.Temperature -gt 0) { $script:dtemp = [int]$c.Temperature } } catch {} }
  if ($null -ne $script:dtemp) { $o.diskTemp = $script:dtemp }
  $o.processes = $script:procs
  [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress -Depth 4))
  [Console]::Out.Flush()
  $tick++
  Start-Sleep -Milliseconds 1000
}
