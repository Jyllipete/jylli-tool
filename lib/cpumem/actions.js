'use strict'
// The scripts and parsers for what the Lab and the Overview can DO beyond the switches: free standby memory (measured before and after), list
// the programs using the most CPU / memory, pin a game to a core plan, set a per-program CPU priority (IFEO PerfOptions). Pure: index.js runs them.
const affinity = require('./affinity')

const IFEO = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options'
const PRIORITY = { above: 6, high: 3 }          // CpuPriorityClass values: AboveNormal, High. Realtime is never offered.
const PURGE_MARK = 'JJPURGE:', CONS_MARK = 'JJCONS:', PIN_MARK = 'JJPIN:', PRIO_MARK = 'JJPRIO:'

const STANDBY_PS = `$sc = 'Standby Cache Core Bytes','Standby Cache Normal Priority Bytes','Standby Cache Reserve Bytes' | ForEach-Object { New-Object Diagnostics.PerformanceCounter('Memory', $_, '', $true) }
function StandbyMB { [math]::Round((($sc | ForEach-Object { $_.NextValue() }) | Measure-Object -Sum).Sum / 1MB) }`

/** Frees the standby list and reports the standby size before and after. Needs administrator rights: without them nothing changes and the numbers say so. */
function purgeScript() {
  return `$ErrorActionPreference='SilentlyContinue'
${STANDBY_PS}
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class JjPurge {
  [DllImport("ntdll.dll")] static extern uint NtSetSystemInformation(int c, IntPtr i, int l);
  [DllImport("ntdll.dll")] static extern uint RtlAdjustPrivilege(int p, bool e, bool t, out bool prev);
  public static uint Run() { bool prev; RtlAdjustPrivilege(20, true, false, out prev); IntPtr b = Marshal.AllocHGlobal(4); Marshal.WriteInt32(b, 0, 4); uint r = NtSetSystemInformation(80, b, 4); Marshal.FreeHGlobal(b); return r; }
}
'@
$before = StandbyMB
$status = [JjPurge]::Run()
Start-Sleep -Milliseconds 700
$after = StandbyMB
'${PURGE_MARK}' + ([ordered]@{ before = $before; after = $after; status = [int64]$status } | ConvertTo-Json -Compress)
`
}

/** stdout -> { ok, beforeMB, afterMB, freedMB } (ok = Windows accepted the call). null when nothing usable. */
function parsePurge(out) {
  const line = String(out || '').split(/\r?\n/).reverse().find(l => l.startsWith(PURGE_MARK))
  if (!line) return null
  try {
    const o = JSON.parse(line.slice(PURGE_MARK.length))
    const b = Number(o.before), a = Number(o.after)
    if (!Number.isFinite(b) || !Number.isFinite(a)) return null
    return { ok: Number(o.status) === 0, beforeMB: b, afterMB: a, freedMB: Math.max(0, b - a) }
  } catch { return null }
}

/** One CIM query: name|cpu%|private MB for every process. */
function consumersScript() {
  return `$ErrorActionPreference='SilentlyContinue'
Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | ForEach-Object { '${CONS_MARK}' + $_.Name + '|' + $_.PercentProcessorTime + '|' + [math]::Round($_.WorkingSetPrivate / 1MB) }
`
}

/** stdout -> { cpu:[{name,cpu,mb,game}], ram:[...] } top `limit` each; instances of one program (chrome#1, chrome#2) are summed; cpu is % of the whole CPU. */
function parseConsumers(out, { cores = 1, games = [], limit = 8 } = {}) {
  const gameSet = new Set((games || []).map(g => String(g).toLowerCase().replace(/\.exe$/, '')))
  const by = new Map()
  for (const l of String(out || '').split(/\r?\n/)) {
    if (!l.startsWith(CONS_MARK)) continue
    const [raw, c, m] = l.slice(CONS_MARK.length).split('|')
    const name = String(raw || '').replace(/#\d+$/, '')
    if (!name || name === '_Total' || name === 'Idle' || name === 'System Idle Process') continue
    const e = by.get(name) || { name, cpu: 0, mb: 0, game: gameSet.has(name.toLowerCase()) }
    e.cpu += (Number(c) || 0) / Math.max(1, cores); e.mb += Number(m) || 0
    by.set(name, e)
  }
  const all = [...by.values()].map(e => ({ ...e, cpu: Math.round(e.cpu * 10) / 10 }))
  return { cpu: all.filter(e => e.cpu > 0).sort((a, b) => b.cpu - a.cpu).slice(0, limit), ram: all.filter(e => e.mb > 0).sort((a, b) => b.mb - a.mb).slice(0, limit) }
}

const procName = exe => String(exe).replace(/\.exe$/i, '').replace(/'/g, "''")

/** Sets the allowed logical processors of every running process of `exe`. mask: decimal string (affinity.maskOf). */
function pinScript(exe, mask) {
  if (!affinity.validExe(exe) || !/^\d{1,20}$/.test(String(mask))) throw new Error('bad-input')
  return `$ErrorActionPreference='SilentlyContinue'
$m = [BitConverter]::ToInt64([BitConverter]::GetBytes([UInt64]'${mask}'), 0)
$n = 0; $f = 0
Get-Process -Name '${procName(exe)}' | ForEach-Object { try { $_.ProcessorAffinity = [IntPtr]$m; $n++ } catch { $f++ } }
'${PIN_MARK}' + ([ordered]@{ pinned = $n; failed = $f } | ConvertTo-Json -Compress)
`
}

function parsePin(out) {
  const line = String(out || '').split(/\r?\n/).reverse().find(l => l.startsWith(PIN_MARK))
  if (!line) return null
  try { const o = JSON.parse(line.slice(PIN_MARK.length)); return { pinned: Number(o.pinned) || 0, failed: Number(o.failed) || 0 } } catch { return null }
}

/** The IFEO writes for a per-program CPU priority. Returns the PowerShell lines (journaled by runRecorded). */
function prioritySetLines(exe, level) {
  if (!affinity.validExe(exe) || !PRIORITY[level]) throw new Error('bad-input')
  const key = `${IFEO}\\${exe}\\PerfOptions`
  return [`New-Item -Path "${key}" -Force -EA SilentlyContinue | Out-Null`, `Set-ItemProperty -Path "${key}" -Name CpuPriorityClass -Value ${PRIORITY[level]} -Force`]
}
function priorityClearLines(exe) {
  if (!affinity.validExe(exe)) throw new Error('bad-input')
  return [`Remove-Item -Path "${IFEO}\\${exe}\\PerfOptions" -Force -EA SilentlyContinue`]
}
/** Reads the CpuPriorityClass of each exe: { 'game.exe': 'high'|'above'|null }. */
function priorityReadScript(exes) {
  const list = (exes || []).filter(affinity.validExe).slice(0, 40)
  return `$ErrorActionPreference='SilentlyContinue'
$o = [ordered]@{}
foreach ($e in @(${list.map(e => `'${String(e).replace(/'/g, "''")}'`).join(',')})) { $v = $null; try { $v = [string](Get-ItemPropertyValue -LiteralPath "${IFEO}\\$e\\PerfOptions" -Name CpuPriorityClass -ErrorAction Stop) } catch {}; $o[$e] = $v }
'${PRIO_MARK}' + ($o | ConvertTo-Json -Compress)
`
}
function parsePriorities(out) {
  const line = String(out || '').split(/\r?\n/).reverse().find(l => l.startsWith(PRIO_MARK))
  if (!line) return null
  try {
    const o = JSON.parse(line.slice(PRIO_MARK.length)), res = {}
    for (const [k, v] of Object.entries(o || {})) res[k] = v === String(PRIORITY.high) ? 'high' : v === String(PRIORITY.above) ? 'above' : v == null ? null : 'other'
    return res
  } catch { return null }
}

module.exports = { IFEO, PRIORITY, purgeScript, parsePurge, consumersScript, parseConsumers, pinScript, parsePin, prioritySetLines, priorityClearLines, priorityReadScript, parsePriorities }
