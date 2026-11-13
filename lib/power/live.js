'use strict'
// Live sampling for the Power tab, once a second, started and stopped by index.js. Read-only sources:
//   1. a PowerShell poller: Windows processor counters (clock as % of base, utility) and, on a laptop, the battery flow
//        JJPWLIVE:{ t, perf, util, bat:{ pct, ac, charging, discharging, rateMW, remMWh } | null }
//   2. `nvidia-smi -lms 1000` (NVIDIA only): board power and load
//   3. the telemetry hub (CPU package power from the sensor bridge), merged by index.js; a source that is not running stays null, never 0.
// Pure + UMD. index.js owns the processes and merges the last smi sample into each poller frame.
const MARK = 'JJPWLIVE:'
const INTERVAL_MS = 1000

function buildScript(withBattery = true) {
  return String.raw`$ErrorActionPreference='SilentlyContinue'
function PC($cat, $name) { try { $c = New-Object Diagnostics.PerformanceCounter($cat, $name, '_Total'); [void]$c.NextValue(); $c } catch { $null } }
$perf = PC 'Processor Information' '% Processor Performance'
$util = PC 'Processor Information' '% Processor Utility'
$withBat = ${withBattery ? '$true' : '$false'}
while ($true) {
  Start-Sleep -Milliseconds ${INTERVAL_MS}
  $p = if ($perf) { [math]::Round($perf.NextValue(), 1) } else { $null }
  $u = if ($util) { [math]::Round($util.NextValue(), 1) } else { $null }
  $bat = $null
  if ($withBat) {
    $bs = Get-CimInstance -Namespace root\wmi -ClassName BatteryStatus | Select-Object -First 1
    if ($bs) { $bat = [ordered]@{ ac = [bool]$bs.PowerOnline; charging = [bool]$bs.Charging; discharging = [bool]$bs.Discharging; rateMW = $(if ($bs.Charging) { [int64]$bs.ChargeRate } else { [int64]$bs.DischargeRate }); remMWh = [int64]$bs.RemainingCapacity } }
  }
  $o = [ordered]@{ t = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); perf = $p; util = $u; bat = $bat }
  [Console]::Out.WriteLine('${MARK}' + ($o | ConvertTo-Json -Compress -Depth 4))
  [Console]::Out.Flush()
}
`
}

const num = v => { const n = Number(v); return v == null || v === '' || !Number.isFinite(n) ? null : n }
const clamp = (v, lo, hi) => (v == null ? null : Math.max(lo, Math.min(hi, v)))

/** One stdout line -> a poller frame, or null. perf may exceed 100 (boost); util is capped at 100. */
function parseLine(line) {
  const s = String(line || '')
  if (!s.startsWith(MARK)) return null
  let o
  try { o = JSON.parse(s.slice(MARK.length)) } catch { return null }
  if (!o || typeof o !== 'object') return null
  const b = o.bat && typeof o.bat === 'object' ? o.bat : null
  const rate = b ? num(b.rateMW) : null
  return {
    t: num(o.t) || 0, perf: clamp(num(o.perf), 0, 400), util: clamp(num(o.util), 0, 100),
    bat: b ? { ac: b.ac === true, charging: b.charging === true, discharging: b.discharging === true, rateW: rate != null && rate > 0 ? Math.round(rate / 100) / 10 : null, remMWh: num(b.remMWh) } : null,
    smi: null, sensor: null,
  }
}

// ── nvidia-smi: board power and load only (this tab is not the GPU tab).
const SMI_BASE = ['index', 'power.draw', 'utilization.gpu']
const smiArgs = () => ['--query-gpu=' + SMI_BASE.join(','), '--format=csv,noheader,nounits', '-lms', String(INTERVAL_MS)]
const n1 = s => { const t = String(s).trim(); if (!t || /^\[|n\/a|not supported|unknown/i.test(t)) return null; const n = Number(t); return Number.isFinite(n) ? n : null }
/** One nvidia-smi csv line (GPU 0 only) -> { powerW, load } or null. */
function parseSmi(line) {
  const c = String(line || '').split(',').map(x => x.trim())
  if (c.length < SMI_BASE.length || n1(c[0]) !== 0) return null
  return { powerW: n1(c[1]), load: n1(c[2]) }
}

/** The watts a frame carries, with where each came from: { cpuW, gpuW, cpuSrc, gpuSrc, gpuLoad } (null = not measured). */
function wattsOf(f) {
  if (!f) return { cpuW: null, gpuW: null, cpuSrc: null, gpuSrc: null, gpuLoad: null }
  const se = f.sensor || {}, smi = f.smi || {}
  const gpuW = smi.powerW != null ? smi.powerW : num(se.gpuW)
  return {
    cpuW: num(se.cpuW), gpuW, cpuSrc: num(se.cpuW) != null ? 'sensor' : null, gpuSrc: smi.powerW != null ? 'nvidia-smi' : num(se.gpuW) != null ? 'sensor' : null,
    gpuLoad: smi.load != null ? smi.load : num(se.gpuLoad),
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

const exported = { MARK, INTERVAL_MS, buildScript, parseLine, SMI_BASE, smiArgs, parseSmi, wattsOf, createWindow }
if (typeof module !== 'undefined' && module.exports) module.exports = exported
if (typeof window !== 'undefined') window.JylliPowerLive = exported
