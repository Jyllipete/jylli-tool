'use strict'
// Probe: ONE PowerShell script that measures everything the Debloat tab shows, and the parser for what it prints.
// buildScript() and parse() are pure (unit-tested); index.js runs the script through deps.runPS.
// Everything the script reads is named by the catalog, so the probe never lists "all apps" or "all services" to the UI.
const catalog = require('./catalog')

const MARK = 'JJPROBE:'
const psq = s => String(s).replace(/'/g, "''")

/** The probe input: what to look for. JSON, embedded as one single-quoted PowerShell literal. */
function wanted() {
  return {
    apps: catalog.ofKind('appx').map(i => i.pkg),
    svc: catalog.ofKind('service').map(i => i.svc),
    tasks: catalog.ofKind('task').map(i => ({ p: i.task.path, n: i.task.name })),
    reg: catalog.adRegistry(),
    exe: catalog.exeNames(),
  }
}

function buildScript(w = wanted()) {
  const json = psq(JSON.stringify(w))
  return `$ErrorActionPreference='SilentlyContinue'
$c = '${json}' | ConvertFrom-Json
$o = [ordered]@{}
$pk = @{}; foreach ($n in $c.apps) { $pk[$n] = 1 }
$o.appx = @(Get-AppxPackage -AllUsers | Where-Object { $pk.ContainsKey($_.Name) } | ForEach-Object {
  $sz = 0; if ($_.InstallLocation -and (Test-Path -LiteralPath $_.InstallLocation)) { $sz = (Get-ChildItem -LiteralPath $_.InstallLocation -Recurse -File -Force | Measure-Object Length -Sum).Sum }
  [pscustomobject]@{ n = $_.Name; f = $_.PackageFamilyName; sz = [int64]$sz } } | Sort-Object n -Unique)
$o.prov = @(Get-AppxProvisionedPackage -Online | ForEach-Object { $_.DisplayName })
$all = Get-CimInstance Win32_Service
$cnt = @{}; foreach ($s in $all) { if ($s.ProcessId -gt 0) { $cnt[[string]$s.ProcessId]++ } }
$sv = @{}
foreach ($n in $c.svc) { $s = $all | Where-Object { $_.Name -eq $n }; if ($s) { $ws = 0; if ($s.ProcessId -gt 0) { $ws = (Get-Process -Id $s.ProcessId).WorkingSet64 }; $sv[$n] = @{ st = [string]$s.State; sm = [string]$s.StartMode; sh = [int]$cnt[[string]$s.ProcessId]; ws = [int64]$ws } } }
$o.svc = $sv
$tk = @()
foreach ($t in $c.tasks) {
  $x = Get-ScheduledTask -TaskPath $t.p -TaskName $t.n
  if ($x) {
    $i = $x | Get-ScheduledTaskInfo; $rep = ''
    foreach ($g in $x.Triggers) { if ($g.Repetition.Interval) { $rep = [string]$g.Repetition.Interval } }
    $nx = 0; if ($i.NextRunTime -and $i.NextRunTime.Year -gt 2000) { $nx = [DateTimeOffset]::new($i.NextRunTime).ToUnixTimeMilliseconds() }
    $tk += [pscustomobject]@{ p = $t.p; n = $t.n; s = [string]$x.State; nx = $nx; rep = $rep }
  }
}
$o.tasks = $tk
$rg = @{}
foreach ($r in $c.reg) { $k = $r.key + '|' + $r.name; try { $rg[$k] = (Get-ItemPropertyValue -LiteralPath $r.key -Name $r.name -ErrorAction Stop) } catch { $rg[$k] = $null } }
$o.reg = $rg
$fe = @{}; Get-WindowsOptionalFeature -Online | ForEach-Object { $fe[$_.FeatureName] = ([string]$_.State -eq 'Enabled') }
$o.feat = $fe
$pr = @{}
Get-Process | Where-Object { $c.exe -contains $_.ProcessName.ToLower() } | Group-Object { $_.ProcessName.ToLower() } | ForEach-Object { $pr[$_.Name] = [int64](($_.Group | Measure-Object WorkingSet64 -Sum).Sum) }
$o.procs = $pr
$lr = @{}
Get-ChildItem 'C:\\Windows\\Prefetch' -Filter *.pf | ForEach-Object {
  $e = ($_.Name -replace '-[0-9A-Fa-f]{8}\\.pf$', '').ToLower() -replace '\\.exe$', ''
  if ($c.exe -contains $e) { $ts = [DateTimeOffset]::new($_.LastWriteTime).ToUnixTimeMilliseconds(); if (-not $lr[$e] -or $lr[$e] -lt $ts) { $lr[$e] = $ts } }
}
$o.lastRun = $lr
$f = @{}
$f.printers = @(Get-Printer | Where-Object { $_.Name -notmatch 'PDF|XPS|OneNote|Fax|Send To|Snagit' }).Count
$f.btPaired = @(Get-PnpDevice -Class Bluetooth -Status OK | Where-Object { $_.InstanceId -match '^BTH(ENUM|LE)\\\\DEV_' }).Count
$f.xboxController = @(Get-PnpDevice -PresentOnly | Where-Object { $_.FriendlyName -match 'Xbox.*(Controller|Wireless|Adapter)' }).Count
$f.gamePass = @(Get-ChildItem 'C:\\XboxGames' -Directory).Count
$f.obs = [bool]((Test-Path "$env:ProgramFiles\\obs-studio") -or (Test-Path "$env:ProgramFiles\\Streamlabs*"))
$f.dev = [bool]((Get-Command git) -or (Get-Command code) -or (Test-Path "$env:LOCALAPPDATA\\Programs\\Microsoft VS Code"))
$f.laptop = [bool]((Get-CimInstance Win32_Battery) -or ((Get-CimInstance Win32_SystemEnclosure).ChassisTypes | Where-Object { $_ -in 8, 9, 10, 11, 14, 30, 31, 32 }))
$f.build = [int][Environment]::OSVersion.Version.Build
$f.ubr = [int](Get-ItemPropertyValue 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion' UBR)
$f.mfr = [string](Get-CimInstance Win32_ComputerSystem).Manufacturer
$o.facts = $f
Write-Output ('${MARK}' + ($o | ConvertTo-Json -Depth 6 -Compress))`
}

/** ISO 8601 duration ("PT1H", "PT30M", "P1D", "PT1H30M") -> ms, 0 when empty or unreadable. */
function isoMs(s) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(s || ''))
  if (!m) return 0
  return (((+m[1] || 0) * 24 + (+m[2] || 0)) * 60 + (+m[3] || 0)) * 60000 + (+m[4] || 0) * 1000
}

/** PowerShell output -> snapshot. Returns null when no probe line was found or it is not JSON (the scan failed). */
function parse(out) {
  const line = String(out || '').split(/\r?\n/).find(l => l.startsWith(MARK))
  if (!line) return null
  let j
  try { j = JSON.parse(line.slice(MARK.length)) } catch { return null }
  const arr = v => (Array.isArray(v) ? v : v == null ? [] : [v])
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})
  const low = o => Object.fromEntries(Object.entries(obj(o)).map(([k, v]) => [k.toLowerCase(), v]))
  const appx = {}
  for (const a of arr(j.appx)) if (a && a.n) appx[String(a.n).toLowerCase()] = { name: a.n, family: a.f || '', size: +a.sz || 0 }
  const tasks = {}
  for (const t of arr(j.tasks)) if (t && t.n) tasks[catalog.taskKey(t.p, t.n)] = { state: String(t.s || ''), next: +t.nx || 0, repMs: isoMs(t.rep) }
  const svc = {}
  for (const [k, v] of Object.entries(obj(j.svc))) svc[k.toLowerCase()] = { state: String(v.st || ''), start: String(v.sm || ''), shared: +v.sh || 0, ram: +v.ws || 0 }
  const f = obj(j.facts)
  return {
    appx, provisioned: arr(j.prov).map(x => String(x).toLowerCase()), svc, tasks,
    reg: obj(j.reg), feat: low(j.feat), procs: low(j.procs), lastRun: low(j.lastRun),
    facts: { printers: +f.printers || 0, btPaired: +f.btPaired || 0, xboxController: +f.xboxController || 0, gamePass: +f.gamePass || 0,
      obs: !!f.obs, dev: !!f.dev, laptop: !!f.laptop, build: +f.build || 0, ubr: +f.ubr || 0, mfr: String(f.mfr || '') },
  }
}

module.exports = { MARK, wanted, buildScript, parse, isoMs }
