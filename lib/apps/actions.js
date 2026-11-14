'use strict'
// Apps tab "Backstage": the PowerShell for Game time. One script sets / puts back / reads the priority class (and Windows Efficiency mode) of a
// list of processes and prints one line per process. Every process is checked three ways before it is touched: same pid, same program name, same
// start time (a pid can be reused after a program closes). Pure: index.js runs it.
//   SET|pid|before|after|eco     changed; `after` is what Windows says now (read back); eco = ok | denied | unproven | none
//   SKIP|pid|class               its priority is not the one we expected (somebody else changed it): left alone
//   LEFT|pid|class               restore only: the priority is no longer the one we set (the user changed it): left alone
//   GONE|pid                     closed or replaced by another program
//   DENIED|pid                   Windows refused
//   CUR|pid|class                read mode
const psq = s => "'" + String(s).replace(/'/g, "''") + "'"
const CLASSES = new Set(['Idle', 'BelowNormal', 'Normal', 'AboveNormal', 'High'])      // Realtime is never offered

/**
 * mode 'set' | 'restore' | 'read'; items: [{ pid, name (lower stem), st (start FILETIME string), only: [class the process must have now], to: class, eco: 'on'|'reset'|'' }]
 */
function priorityScript(mode, items) {
  const payload = JSON.stringify((items || []).slice(0, 150).map(x => ({
    id: Number(x.pid) || 0, name: String(x.name || '').toLowerCase(), st: String(x.st || ''),
    only: (x.only || []).filter(c => CLASSES.has(c)), to: CLASSES.has(x.to) ? x.to : 'Normal', eco: x.eco === 'on' || x.eco === 'reset' ? x.eco : '',
  })))
  return String.raw`$ErrorActionPreference = 'SilentlyContinue'
$items = ConvertFrom-Json ${psq(payload)}
$mode = ${psq(mode)}
$ecoReady = $false
function EcoSet($p, $on) {
  if (-not $script:ecoReady) {
    Add-Type -Namespace JJApps -Name Eco -MemberDefinition @'
[StructLayout(LayoutKind.Sequential)] public struct PPT { public uint Version; public uint ControlMask; public uint StateMask; }
[DllImport("kernel32.dll", SetLastError=true)] public static extern bool SetProcessInformation(IntPtr h, int cls, ref PPT info, int size);
[DllImport("kernel32.dll", SetLastError=true)] public static extern bool GetProcessInformation(IntPtr h, int cls, ref PPT info, int size);
'@
    $script:ecoReady = $true
  }
  try {
    $h = $p.Handle
    $i = New-Object JJApps.Eco+PPT; $i.Version = 1
    if ($on) { $i.ControlMask = 1; $i.StateMask = 1 } else { $i.ControlMask = 0; $i.StateMask = 0 }
    if (-not [JJApps.Eco]::SetProcessInformation($h, 4, [ref]$i, 12)) { return 'denied' }
    $o = New-Object JJApps.Eco+PPT; $o.Version = 1
    if (-not [JJApps.Eco]::GetProcessInformation($h, 4, [ref]$o, 12)) { return 'unproven' }
    if ($on) { if ((($o.ControlMask -band 1) -eq 1) -and (($o.StateMask -band 1) -eq 1)) { return 'ok' } else { return 'unproven' } }
    else { if (($o.ControlMask -band 1) -eq 0) { return 'ok' } else { return 'unproven' } }
  } catch { return 'denied' }
}
foreach ($i in @($items)) {
  $p = Get-Process -Id $i.id -EA SilentlyContinue
  if (-not $p -or $p.ProcessName.ToLower() -ne $i.name) { Write-Output ('GONE|' + $i.id); continue }
  $st = ''; try { $st = $p.StartTime.ToFileTimeUtc().ToString() } catch {}
  if ($i.st -and $st -and $st -ne $i.st) { Write-Output ('GONE|' + $i.id); continue }
  $cur = ''; try { $cur = $p.PriorityClass.ToString() } catch { Write-Output ('DENIED|' + $i.id); continue }
  if ($mode -eq 'read') { Write-Output ('CUR|' + $i.id + '|' + $cur); continue }
  $only = @($i.only)
  if ($mode -eq 'restore' -and $only.Count -gt 0 -and $only -notcontains $cur) { Write-Output ('LEFT|' + $i.id + '|' + $cur); continue }
  if ($mode -eq 'set' -and $only.Count -gt 0 -and $only -notcontains $cur) { Write-Output ('SKIP|' + $i.id + '|' + $cur); continue }
  try { $p.PriorityClass = $i.to } catch { Write-Output ('DENIED|' + $i.id); continue }
  $p.Refresh(); $after = ''; try { $after = $p.PriorityClass.ToString() } catch {}
  $eco = 'none'
  if ($i.eco -eq 'on') { $eco = EcoSet $p $true } elseif ($i.eco -eq 'reset') { $eco = EcoSet $p $false }
  Write-Output ('SET|' + $i.id + '|' + $cur + '|' + $after + '|' + $eco)
}
`
}

/** -> Map pid -> { st: 'SET'|'SKIP'|'LEFT'|'GONE'|'DENIED'|'CUR', a, b, eco } */
function parsePriority(out) {
  const res = new Map()
  for (const line of String(out || '').split(/\r?\n/)) {
    const m = /^(SET|SKIP|DENIED|GONE|LEFT|CUR)\|(\d+)(?:\|(\w*))?(?:\|(\w*))?(?:\|(\w*))?$/.exec(line.trim())
    if (m) res.set(Number(m[2]), { st: m[1], a: m[3] || '', b: m[4] || '', eco: m[5] || 'none' })
  }
  return res
}

module.exports = { priorityScript, parsePriority, CLASSES }
