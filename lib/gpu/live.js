'use strict'
// Live sampling. Two read-only sources, once a second, both started and stopped by index.js:
//   1. a PowerShell poller over the Windows GPU counters (every vendor): engine utilization, adapter and per-process memory
//        JJGPLIVE:{ t, mem:{dedicated,shared}, eng:{gfx,compute,copy,decode,encode,vproc}, procs:[[pid,name,util,dedicatedMB]], luid }
//   2. `nvidia-smi -lms 1000` (NVIDIA only): clocks, power, temperature, fan, memory, P-state, PCIe link and the clock-event reason bits
// Pure + UMD. index.js owns the processes and merges the last smi sample into each poller frame.
const L = require('./limiter')

const MARK = 'JJGPLIVE:'
const INTERVAL_MS = 1000

function buildScript() {
  return String.raw`$ErrorActionPreference='SilentlyContinue'
$names = @{}
function PCat($n) { New-Object Diagnostics.PerformanceCounterCategory($n) }
$eng = PCat 'GPU Engine'; $pm = PCat 'GPU Process Memory'; $am = PCat 'GPU Adapter Memory'
$prev = @{}
$tick = 0
function Sample($cat, $counter) { $x = $cat.ReadCategory()[$counter]; if ($x) { $x.Values } else { @() } }
[void](Sample $eng 'Utilization Percentage')
while ($true) {
  Start-Sleep -Milliseconds ${INTERVAL_MS}
  $tick++
  $now = @{}; $byEng = @{}; $byPid = @{}; $ut = @{}
  foreach ($i in (Sample $eng 'Utilization Percentage')) {
    $n = $i.InstanceName; $now[$n] = $i.Sample
    if ($prev.ContainsKey($n)) {
      $v = [Diagnostics.CounterSample]::Calculate($prev[$n], $i.Sample)
      if ($n -match 'pid_(\d+)_luid_(0x[0-9a-fA-F]+_0x[0-9a-fA-F]+)_phys_\d+_eng_(\d+)_engtype_(\w+)') {
        $pid1 = [int]$matches[1]; $luid = $matches[2]; $ek = $luid + '|' + $matches[3] + '|' + $matches[4]
        $byEng[$ek] = [double]$byEng[$ek] + $v; $ut[$luid] = [double]$ut[$luid] + $v
        $pk = $luid + '|' + $pid1; $byPid[$pk] = [double]$byPid[$pk] + $v
      }
    }
  }
  $prev = $now
  $dedicated = @{}; $shared = @{}
  foreach ($i in (Sample $am 'Dedicated Usage')) { if ($i.InstanceName -match 'luid_(0x[0-9a-fA-F]+_0x[0-9a-fA-F]+)') { $dedicated[$matches[1]] = [double]$i.Sample.RawValue } }
  foreach ($i in (Sample $am 'Shared Usage')) { if ($i.InstanceName -match 'luid_(0x[0-9a-fA-F]+_0x[0-9a-fA-F]+)') { $shared[$matches[1]] = [double]$i.Sample.RawValue } }
  $luid = '-'; $best = -1.0; $bs = -1.0
  foreach ($k in (@($dedicated.Keys) + @($ut.Keys) | Select-Object -Unique)) { $sc = [double]$dedicated[$k] + [double]$ut[$k] * 1e8; if ($sc -gt $bs) { $bs = $sc; $luid = $k; $best = [double]$dedicated[$k] } }
  $pmem = @{}
  foreach ($i in (Sample $pm 'Dedicated Usage')) { if ($i.InstanceName -match 'pid_(\d+)_luid_(0x[0-9a-fA-F]+_0x[0-9a-fA-F]+)') { $pmem[$matches[2] + '|' + $matches[1]] = [double]$i.Sample.RawValue } }
  $e = @{ gfx = 0.0; compute = 0.0; copy = 0.0; decode = 0.0; encode = 0.0; vproc = 0.0 }
  foreach ($k in $byEng.Keys) {
    $p = $k -split '\|'
    if ($p[0] -ne $luid) { continue }
    $t = $p[2]; $kind = if ($t -match '^(3D|Graphics)') { 'gfx' } elseif ($t -match '^(Compute|Cuda)') { 'compute' } elseif ($t -match '^Copy') { 'copy' } elseif ($t -match '^VideoDecode') { 'decode' } elseif ($t -match '^VideoEncode') { 'encode' } elseif ($t -match '^VideoProcessing') { 'vproc' } else { $null }
    if ($kind -and $byEng[$k] -gt $e[$kind]) { $e[$kind] = [math]::Min(100.0, $byEng[$k]) }
  }
  $rows = @()
  foreach ($k in $byPid.Keys) {
    $p = $k -split '\|'
    if ($p[0] -ne $luid) { continue }
    $mb = [math]::Round(([double]$pmem[$k]) / 1MB)
    if ($byPid[$k] -lt 0.5 -and $mb -lt 50) { continue }
    $nm = $names[$p[1]]
    if (-not $nm) { $pr = Get-Process -Id ([int]$p[1]); $nm = if ($pr) { $pr.ProcessName } else { '?' }; $names[$p[1]] = $nm }
    $rows += ,@([int]$p[1], $nm, [math]::Round([math]::Min(100.0, $byPid[$k]), 1), $mb)
  }
  $rows = @($rows | Sort-Object { $_[2] * 1000 + $_[3] } -Descending | Select-Object -First 8)
  $o = [ordered]@{ t = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); luid = $luid; mem = [ordered]@{ dedicated = [math]::Round($best / 1MB); shared = [math]::Round(([double]$shared[$luid]) / 1MB) }
    eng = [ordered]@{ gfx = [math]::Round($e.gfx, 1); compute = [math]::Round($e.compute, 1); copy = [math]::Round($e.copy, 1); decode = [math]::Round($e.decode, 1); encode = [math]::Round($e.encode, 1); vproc = [math]::Round($e.vproc, 1) }; procs = $rows }
  if ($tick % 30 -eq 0) { $names = @{} }
  [Console]::Out.WriteLine('${MARK}' + ($o | ConvertTo-Json -Compress -Depth 5))
  [Console]::Out.Flush()
}
`.replace(/\$\{INTERVAL_MS\}/g, String(INTERVAL_MS)).replace(/\$\{MARK\}/g, MARK)
}

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const pc = v => Math.max(0, Math.min(100, num(v)))

/** One stdout line -> a poller frame, or null. */
function parseLine(line) {
  const s = String(line || '')
  if (!s.startsWith(MARK)) return null
  let o
  try { o = JSON.parse(s.slice(MARK.length)) } catch { return null }
  if (!o || !o.eng || !o.mem) return null
  const procs = (Array.isArray(o.procs) ? o.procs : []).filter(Array.isArray).map(r => ({ pid: num(r[0]), name: String(r[1] || '?'), util: pc(r[2]), mb: Math.max(0, num(r[3])) }))
  const e = o.eng
  const eng = { gfx: pc(e.gfx), compute: pc(e.compute), copy: pc(e.copy), decode: pc(e.decode), encode: pc(e.encode), vproc: pc(e.vproc) }
  return { t: num(o.t), luid: o.luid || null, mem: { dedicatedMB: Math.max(0, num(o.mem.dedicated)), sharedMB: Math.max(0, num(o.mem.shared)) }, eng, load: Math.max(eng.gfx, eng.compute), procs, smi: null, sensor: null }
}

// ── nvidia-smi: reason field names differ by driver (clocks_event_reasons since 550, clocks_throttle_reasons before), so index.js tries them in order.
const SMI_BASE = ['index', 'utilization.gpu', 'clocks.gr', 'clocks.mem', 'clocks.max.gr', 'clocks.max.mem', 'power.draw', 'enforced.power.limit', 'temperature.gpu', 'fan.speed',
  'memory.used', 'memory.total', 'pstate', 'pcie.link.gen.current', 'pcie.link.width.current']
const SMI_REASON_FIELDS = ['clocks_event_reasons.active', 'clocks_throttle_reasons.active', null]
const smiArgs = reason => ['--query-gpu=' + SMI_BASE.concat(reason ? [reason] : []).join(','), '--format=csv,noheader,nounits', '-lms', String(INTERVAL_MS)]

const n1 = s => { const t = String(s).trim(); if (!t || /^\[|n\/a|not supported|unknown/i.test(t)) return null; const n = Number(t); return Number.isFinite(n) ? n : null }

/** One nvidia-smi csv line (GPU 0 only) -> the smi part of a frame, or null. */
function parseSmi(line, withReason = true) {
  const c = String(line || '').split(',').map(x => x.trim())
  if (c.length < SMI_BASE.length) return null
  if (n1(c[0]) !== 0) return null
  return {
    load: n1(c[1]), clock: n1(c[2]), memClock: n1(c[3]), clockMax: n1(c[4]), memClockMax: n1(c[5]), power: n1(c[6]), powerLimit: n1(c[7]), temp: n1(c[8]), fan: n1(c[9]),
    vramUsed: n1(c[10]), vramTotal: n1(c[11]), pstate: /^P\d+$/i.test(c[12]) ? c[12].toUpperCase() : null, genCur: n1(c[13]), widthCur: n1(c[14]),
    reasons: withReason && c.length > SMI_BASE.length ? c[SMI_BASE.length] : null,
  }
}

/** A rolling window of the last `max` frames (default two minutes). */
function createWindow(max = 120) {
  const frames = []
  return {
    push(f) { if (f) { frames.push(f); if (frames.length > max) frames.shift() } },
    frames: () => frames.slice(),
    last: () => frames[frames.length - 1] || null,
    since: t => frames.filter(f => f.t >= t),
    clear() { frames.length = 0 },
    size: () => frames.length,
  }
}

const exported = { MARK, INTERVAL_MS, buildScript, parseLine, SMI_BASE, SMI_REASON_FIELDS, smiArgs, parseSmi, createWindow, decodeReasons: L.decodeReasons }
if (typeof module !== 'undefined' && module.exports) module.exports = exported
if (typeof window !== 'undefined') window.JylliGpuLive = exported
