'use strict'
// Before/after numbers. Only things that are measured: nothing here is estimated or invented. Idle CPU takes a few seconds, so it
// is sampled only when asked (before the run, and again after the restart), never during the run screen.
const display = require('./display')
const probes = require('./probes')

const SYSTEM = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$os = Get-CimInstance Win32_OperatingSystem
$o = @{ procs = @(Get-Process).Count; services = @(Get-Service | Where-Object { $_.Status -eq 'Running' }).Count
  ramUsedGB = [math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / 1MB, 2)
  freeDiskGB = [math]::Round((Get-PSDrive C).Free / 1GB, 2) }
@SAMPLE@
$o | ConvertTo-Json -Compress
`
// Win32_PerfFormattedData is locale independent (the Get-Counter paths are not).
const CPU = `$s = @(); 1..5 | ForEach-Object { $s += (Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'").PercentProcessorTime; Start-Sleep -Milliseconds 800 }
$o.idleCpuPct = [math]::Round(($s | Measure-Object -Average).Average, 1)`

function systemScript(sampleCpu) { return SYSTEM.replace('@SAMPLE@', sampleCpu ? CPU : '') }

const num = x => { const n = Number(x); return Number.isFinite(n) ? n : null }

/** deps: { runPS(script, ms) }. Resolves to a snapshot; a failed part is null. */
async function snapshot(deps, { sampleCpu = false } = {}) {
  const startupProbe = probes.PROBES.find(p => p.id === 'startup')
  const [sys, disp, st] = await Promise.all([
    deps.runPS(systemScript(sampleCpu), sampleCpu ? 20000 : 10000).catch(() => null),
    deps.runPS(display.listScript(), 12000).catch(() => null),
    deps.runPS(startupProbe.script, 12000).catch(() => null),
  ])
  let s = null
  try { s = sys && sys.out ? JSON.parse(String(sys.out).trim().split(/\r?\n/).filter(l => l.startsWith('{')).pop()) : null } catch {}
  const d = disp && disp.out ? display.parseList(disp.out).displays : null
  const startup = st && st.out ? (startupProbe.parse(st.out) || {}).startup : null
  return {
    takenAt: Date.now(),
    procs: s ? num(s.procs) : null, services: s ? num(s.services) : null, ramUsedGB: s ? num(s.ramUsedGB) : null, freeDiskGB: s ? num(s.freeDiskGB) : null,
    idleCpuPct: s ? num(s.idleCpuPct) : null,
    displays: d ? d.map(x => ({ device: x.device, monitor: x.monitor, hz: x.cur.hz })) : null,
    startupEnabled: startup ? startup.enabledCount : null,
  }
}

// key, unit, which direction is better ('down' | 'up'), label key suffix
const ROWS = [
  ['startupEnabled', '', 'down'], ['procs', '', 'down'], ['services', '', 'down'], ['ramUsedGB', 'GB', 'down'], ['freeDiskGB', 'GB', 'up'], ['idleCpuPct', '%', 'down'],
]

/** before/after -> rows for the result scene. A metric missing on either side is left out rather than shown as zero. */
function diff(before, after) {
  const rows = []
  if (before && after && before.displays && after.displays) {
    for (const a of after.displays) {
      const b = before.displays.find(x => x.device === a.device)
      if (b) rows.push({ key: 'refresh', label: a.monitor || a.device, before: b.hz, after: a.hz, unit: 'Hz', better: a.hz > b.hz ? 'better' : a.hz < b.hz ? 'worse' : 'same' })
    }
  }
  for (const [key, unit, dir] of ROWS) {
    const b = before && before[key], a = after && after[key]
    if (b == null || a == null) continue
    const delta = a - b
    rows.push({ key, before: b, after: a, unit, better: delta === 0 ? 'same' : (dir === 'down') === (delta < 0) ? 'better' : 'worse' })
  }
  return rows
}

module.exports = { snapshot, diff, systemScript }
