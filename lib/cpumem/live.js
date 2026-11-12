'use strict'
// Live sampling: the script one long-lived PowerShell process runs (once a second, performance counters only, nothing is written),
// and the pure parser that turns each line into a frame. Pure + UMD; index.js owns the process.
//   JJCMLIVE:{ t, mem:{...}, cpu:[[instance, utility, performance, frequencyMHz, parked], ...] }
const topology = require('./topology')

const MARK = 'JJCMLIVE:'
const INTERVAL_MS = 1000

function buildScript() {
  return `$ErrorActionPreference='SilentlyContinue'
$ram = [double](Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory
$cat = New-Object Diagnostics.PerformanceCounterCategory('Processor Information')
$names = @($cat.GetInstanceNames() | Where-Object { $_ -match '^\\d+,\\d+$' -or $_ -eq '_Total' })
$cn = '% Processor Utility','% Processor Performance','Processor Frequency','Parking Status'
$pc = @{}
foreach ($n in $names) { $pc[$n] = @($cn | ForEach-Object { New-Object Diagnostics.PerformanceCounter('Processor Information', $_, $n, $true) }) }
$mc = 'Available MBytes','Committed Bytes','Commit Limit','Modified Page List Bytes','Standby Cache Core Bytes','Standby Cache Normal Priority Bytes','Standby Cache Reserve Bytes','Free & Zero Page List Bytes','Pool Paged Bytes','Pool Nonpaged Bytes','Page Reads/sec'
$mp = @($mc | ForEach-Object { New-Object Diagnostics.PerformanceCounter('Memory', $_, '', $true) })
foreach ($n in $names) { foreach ($c in $pc[$n]) { [void]$c.NextValue() } }
foreach ($c in $mp) { [void]$c.NextValue() }
$tick = 0; $comp = 0
while ($true) {
  Start-Sleep -Milliseconds ${INTERVAL_MS}
  $tick++
  if ($tick % 5 -eq 1) { $p = Get-Process -Name 'Memory Compression' -ErrorAction SilentlyContinue; if ($p) { $comp = [math]::Round($p.WorkingSet64 / 1MB) } }
  $cpu = New-Object System.Collections.ArrayList
  foreach ($n in $names) { $v = $pc[$n]; [void]$cpu.Add(@($n, [math]::Round($v[0].NextValue(), 1), [math]::Round($v[1].NextValue(), 1), [math]::Round($v[2].NextValue()), [int]$v[3].NextValue())) }
  $m = @($mp | ForEach-Object { $_.NextValue() })
  $o = [ordered]@{ t = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); mem = [ordered]@{ totalMB = [math]::Round($ram / 1MB); avail = $m[0]; commit = [math]::Round($m[1] / 1MB); limit = [math]::Round($m[2] / 1MB); modified = [math]::Round($m[3] / 1MB); standby = [math]::Round(($m[4] + $m[5] + $m[6]) / 1MB); free = [math]::Round($m[7] / 1MB); paged = [math]::Round($m[8] / 1MB); nonpaged = [math]::Round($m[9] / 1MB); reads = [math]::Round($m[10], 1); compressed = $comp }; cpu = $cpu }
  [Console]::Out.WriteLine('${MARK}' + ($o | ConvertTo-Json -Compress -Depth 5))
  [Console]::Out.Flush()
}
`
}

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

/** One stdout line -> a frame, or null when it is not a frame. baseMHz turns "% performance" into an effective clock. */
function parseLine(line, baseMHz) {
  const s = String(line || '')
  if (!s.startsWith(MARK)) return null
  let o
  try { o = JSON.parse(s.slice(MARK.length)) } catch { return null }
  if (!o || !o.mem || !Array.isArray(o.cpu)) return null
  const m = o.mem
  const base = Number(baseMHz) > 0 ? Number(baseMHz) : 0
  const cores = []
  let total = null
  for (const row of o.cpu) {
    if (!Array.isArray(row)) continue
    const util = num(row[1]), perf = num(row[2]), freq = num(row[3])
    const eff = base ? Math.round(perf / 100 * base) : (freq || 0)
    if (row[0] === '_Total') { total = { util: Math.min(100, util), perf, mhz: eff }; continue }
    const n = topology.logicalOf(row[0])
    if (n >= 0) cores.push({ n, util: Math.min(100, util), perf, mhz: eff, parked: num(row[4]) === 1 })
  }
  cores.sort((a, b) => a.n - b.n)
  if (!total && cores.length) total = { util: avg(cores.map(c => c.util)), perf: avg(cores.map(c => c.perf)), mhz: Math.round(avg(cores.map(c => c.mhz))) }
  return {
    t: num(o.t),
    mem: { totalMB: num(m.totalMB), availMB: num(m.avail), committedMB: num(m.commit), commitLimitMB: num(m.limit), modifiedMB: num(m.modified), standbyMB: num(m.standby), freeMB: num(m.free),
      pagedPoolMB: num(m.paged), nonPagedPoolMB: num(m.nonpaged), pageReads: num(m.reads), compressedMB: num(m.compressed) },
    cpu: { total, cores, parkedCount: cores.filter(c => c.parked).length },
  }
}

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0 }

/** A rolling window of the last `max` frames (default two minutes). */
function createWindow(max = 120) {
  const frames = []
  return {
    push(f) { if (f) { frames.push(f); if (frames.length > max) frames.shift() } },
    frames: () => frames.slice(),
    last: () => frames[frames.length - 1] || null,
    clear() { frames.length = 0 },
    size: () => frames.length,
  }
}

const exported = { MARK, INTERVAL_MS, buildScript, parseLine, createWindow }
if (typeof module !== 'undefined' && module.exports) module.exports = exported
if (typeof window !== 'undefined') window.JylliCpuMemLive = exported
