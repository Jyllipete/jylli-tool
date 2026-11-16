param([string]$BgFlag = '')
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
$dIdle = $null; $dRd = $null; $dWr = $null   # whole-system drive activity; a PC with the PhysicalDisk counters turned off simply has no disk activity keys
try { $dIdle = New-Object Diagnostics.PerformanceCounter('PhysicalDisk', '% Idle Time', '_Total', $true); $null = $dIdle.NextValue() } catch {}
try { $dRd = New-Object Diagnostics.PerformanceCounter('PhysicalDisk', 'Disk Read Bytes/sec', '_Total', $true); $null = $dRd.NextValue() } catch {}
try { $dWr = New-Object Diagnostics.PerformanceCounter('PhysicalDisk', 'Disk Write Bytes/sec', '_Total', $true); $null = $dWr.NextValue() } catch {}
$memOk = $false
try {
  Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class JtMem {
  [StructLayout(LayoutKind.Sequential)] public class MS { public uint dwLength; public uint dwMemoryLoad; public ulong ullTotalPhys; public ulong ullAvailPhys; public ulong ullTotalPageFile; public ulong ullAvailPageFile; public ulong ullTotalVirtual; public ulong ullAvailVirtual; public ulong ullAvailExtendedVirtual; public MS() { dwLength = (uint)Marshal.SizeOf(typeof(MS)); } }
  [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] static extern bool GlobalMemoryStatusEx([In, Out] MS m);
  [DllImport("kernel32.dll")] static extern ulong GetTickCount64();
  public static long UptimeSec() { return (long)(GetTickCount64() / 1000UL); }
  public static ulong[] Get() { MS m = new MS(); return GlobalMemoryStatusEx(m) ? new ulong[] { m.ullTotalPhys, m.ullAvailPhys } : null; }
}
'@
  $memOk = $null -ne [JtMem]::Get()
} catch {}
$rx = @(); $tx = @(); $gpuC = @(); $tick = 0; $lastInst = [DateTime]::MinValue
$bgPrev = $null; $bgPrevT = $null; $cores = [Environment]::ProcessorCount
while ($true) {
  if (([DateTime]::UtcNow - $lastInst).TotalSeconds -gt 10) {   # adapters and GPU engines come and go; refresh the instance lists
    $rx = New-Counters 'Network Interface' 'Bytes Received/sec' '^(?!.*(isatap|Loopback|Teredo|Pseudo)).*$'
    $tx = New-Counters 'Network Interface' 'Bytes Sent/sec' '^(?!.*(isatap|Loopback|Teredo|Pseudo)).*$'
    $gpuC = New-Counters 'GPU Engine' 'Utilization Percentage' 'engtype_3D'
    $lastInst = [DateTime]::UtcNow
  }
  $o = [ordered]@{ t = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
  if ($cpuC) { $o.cpuLoad = [math]::Round([math]::Min(100, $cpuC.NextValue()), 1) }
  # RAM and uptime straight from the kernel (GlobalMemoryStatusEx, TickCount64): no WMI query every second (that work is billed to WmiPrvSE.exe).
  # If the helper type could not be compiled, the old WMI read is the fallback, so the numbers are never missing.
  $m = $null; if ($memOk) { try { $m = [JtMem]::Get() } catch {} }
  if ($m) { $o.ramTotalGB = [math]::Round($m[0] / 1GB, 2); $o.ramUsedGB = [math]::Round(($m[0] - $m[1]) / 1GB, 2); $o.uptimeSec = [int][JtMem]::UptimeSec() }
  else {
    $os = Get-CimInstance Win32_OperatingSystem
    if ($os) { $o.ramTotalGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2); $o.ramUsedGB = [math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / 1MB, 2) }
    if ($os) { $o.uptimeSec = [int]((Get-Date) - $os.LastBootUpTime).TotalSeconds }
  }
  try { $d = New-Object IO.DriveInfo ($env:SystemDrive); $o.diskTotalGB = [math]::Round($d.TotalSize / 1GB, 1); $o.diskUsedGB = [math]::Round(($d.TotalSize - $d.AvailableFreeSpace) / 1GB, 1) } catch {}
  if ($dIdle) { $o.diskIdle = [math]::Round([math]::Max(0, [math]::Min(100, $dIdle.NextValue())), 1) }
  if ($dRd) { $o.diskRead = [math]::Round($dRd.NextValue()) }
  if ($dWr) { $o.diskWrite = [math]::Round($dWr.NextValue()) }
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
  # Busiest processes, as a share of the whole CPU, every 10th second and only while Jylli Tool asks for it (the flag file exists).
  if ($BgFlag -and (Test-Path -LiteralPath $BgFlag)) {
    if ($tick % 10 -eq 0) {
      $t = [DateTime]::UtcNow; $cur = @{}
      foreach ($p in [Diagnostics.Process]::GetProcesses()) { try { $cur[$p.Id] = @($p.ProcessName, $p.TotalProcessorTime.TotalSeconds) } catch {}; $p.Dispose() }
      if ($bgPrev) {
        $dt = ($t - $bgPrevT).TotalSeconds; $rows = @()
        foreach ($id in $cur.Keys) { $b = $bgPrev[$id]; if ($b -and $b[0] -eq $cur[$id][0] -and $dt -gt 0) { $c = [math]::Round(($cur[$id][1] - $b[1]) / $dt / $cores * 100, 1); if ($c -gt 0) { $rows += [pscustomobject]@{ n = $cur[$id][0]; c = $c } } } }
        $o.bg = @($rows | Sort-Object c -Descending | Select-Object -First 5)
      }
      $bgPrev = $cur; $bgPrevT = $t
    }
  } else { $bgPrev = $null }
  [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress -Depth 4))
  [Console]::Out.Flush()
  $tick++
  Start-Sleep -Milliseconds 1000
}
