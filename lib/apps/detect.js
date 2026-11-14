'use strict'
// Apps tab "Backstage": the read-only PowerShell probes and their parsers.
//   buildScript / parse   ONE probe for what is installed, the policy / service / IFEO values and what starts with Windows
//   procScript / parseProcs  one 0.7 s sample of every running program: CPU, private memory, video memory, priority class (cheap enough to repeat)
// Both only read. A value that cannot be read is null and is reported as "unread", never as "off".
const catalog = require('./catalog')
const known = require('./known')

const MARK = 'JJAPPS:', PMARK = 'JJPROC:'
const psq = s => "'" + String(s).replace(/'/g, "''") + "'"

function buildScript() {
  const cfg = {
    installs: known.APPS.map(a => ({ id: a.id, paths: a.install })),
    policies: catalog.ROWS.filter(r => r.kind === 'policy').map(r => ({ id: r.id, key: r.key, name: r.name })),
    ifeo: [...catalog.LEGACY_IFEO, 'obs64.exe'],
    ifeoBase: catalog.IFEO_BASE,
    svc: catalog.ROWS.filter(r => r.kind === 'service').map(r => r.service),
  }
  return String.raw`$ErrorActionPreference = 'SilentlyContinue'
$cfg = ConvertFrom-Json ${psq(JSON.stringify(cfg))}
$inst = @{}
foreach ($a in $cfg.installs) { $hit = $false; foreach ($p in @($a.paths)) { if (Test-Path -LiteralPath ([Environment]::ExpandEnvironmentVariables($p))) { $hit = $true; break } }; $inst[$a.id] = $hit }
$pol = @{}
foreach ($r in $cfg.policies) { $v = $null; try { $v = (Get-ItemProperty -LiteralPath $r.key -Name $r.name -EA Stop).($r.name) } catch {}; $pol[$r.id] = $v }
$ifeo = @{}
foreach ($e in $cfg.ifeo) { $v = $null; try { $v = (Get-ItemProperty -LiteralPath ($cfg.ifeoBase + '\' + $e + '\PerfOptions') -Name CpuPriorityClass -EA Stop).CpuPriorityClass } catch {}; $ifeo[$e.ToLower()] = $v }
$svc = @{}
foreach ($s in $cfg.svc) { $x = Get-Service -Name $s -EA SilentlyContinue; $svc[$s] = if ($x) { $x.StartType.ToString() } else { $null } }
$run = @()
foreach ($hive in 'HKCU', 'HKLM') {
  $k = $hive + ':\Software\Microsoft\Windows\CurrentVersion\Run'
  $ap = $hive + ':\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'
  $item = Get-ItemProperty -LiteralPath $k -EA SilentlyContinue
  if (-not $item) { continue }
  foreach ($pr in $item.PSObject.Properties) {
    if ($pr.Name -like 'PS*') { continue }
    $on = $true; $b = $null
    try { $b = (Get-ItemProperty -LiteralPath $ap -Name $pr.Name -EA Stop).($pr.Name) } catch {}
    if ($b -and ($b[0] -band 1) -eq 1) { $on = $false }
    $run += [pscustomobject]@{ n = [string]$pr.Name; c = [string]$pr.Value; on = $on }
  }
}
'${MARK}' + (ConvertTo-Json -Compress -Depth 5 @{ inst = $inst; pol = $pol; ifeo = $ifeo; svc = $svc; run = @($run) })
`
}

const toArr = v => (Array.isArray(v) ? v : v == null ? [] : [v])
const num = v => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))

/** -> { installed: {id: bool}, pol: {rowId: number|null}, ifeo: {exe lower: number|null}, svc: {name: 'Automatic'|...|null}, run: [{n, c, on}] } | null */
function parse(out) {
  const line = String(out || '').split(/\r?\n/).reverse().find(l => l.startsWith(MARK))
  if (!line) return null
  let j; try { j = JSON.parse(line.slice(MARK.length)) } catch { return null }
  if (!j || typeof j !== 'object') return null
  const pol = {}, ifeo = {}, svc = {}
  for (const [k, v] of Object.entries(j.pol || {})) pol[k] = num(v)
  for (const [k, v] of Object.entries(j.ifeo || {})) ifeo[k.toLowerCase()] = num(v)
  for (const [k, v] of Object.entries(j.svc || {})) svc[k] = v == null ? null : String(v)
  return {
    installed: Object.fromEntries(Object.entries(j.inst || {}).map(([k, v]) => [k, v === true])),
    pol, ifeo, svc,
    run: toArr(j.run).filter(r => r && r.n).map(r => ({ n: String(r.n), c: String(r.c || ''), on: r.on !== false })),
  }
}

/** Live reading of one row: { state: 'all'|'none'|'other'|'unread', value? } (the shape lib/windows/model.statusOf understands). */
function evaluate(parsed, row, files) {
  if (!parsed) return { state: 'unread' }
  if (row.kind === 'policy') {
    if (!(row.id in parsed.pol)) return { state: 'unread' }
    const v = parsed.pol[row.id]
    return v == null ? { state: 'none' } : v === row.value ? { state: 'all', value: v } : { state: 'other', value: v }
  }
  if (row.kind === 'service') {
    const t = parsed.svc[row.service]
    if (t == null) return { state: 'na' }
    return /disabled/i.test(t) ? { state: 'all', value: t } : { state: 'none', value: t }
  }
  if (row.kind === 'priority') {
    const v = parsed.ifeo[row.exe.toLowerCase()]
    if (!(row.exe.toLowerCase() in parsed.ifeo)) return { state: 'unread' }
    return v == null ? { state: 'none' } : v === catalog.PRIORITY_ABOVE ? { state: 'all', value: v } : { state: 'other', value: v }
  }
  if (row.kind === 'file') return files && files[row.id] ? files[row.id] : { state: 'unread' }
  return { state: 'unread' }
}

// ── processes ───────────────────────────────────────────────────────────────
function procScript() {
  const stems = [...new Set(known.APPS.flatMap(a => a.stems))]
  return String.raw`$ErrorActionPreference = 'SilentlyContinue'
$cfg = ConvertFrom-Json ${psq(JSON.stringify({ stems }))}
$cores = [Environment]::ProcessorCount
function Snap { Get-CimInstance Win32_PerfRawData_PerfProc_Process | Where-Object { $_.Name -ne '_Total' -and $_.Name -ne 'Idle' } | ForEach-Object { [pscustomobject]@{ id = [int]$_.IDProcess; name = [string]$_.Name; cpu = [double]$_.PercentProcessorTime; ts = [double]$_.Timestamp_Sys100NS; ws = [double]$_.WorkingSetPrivate } } }
$a = @{}; foreach ($p in (Snap)) { $a[$p.id] = $p }
Start-Sleep -Milliseconds 700
$b = Snap
$vram = @{}
try { foreach ($i in ((New-Object Diagnostics.PerformanceCounterCategory('GPU Process Memory')).ReadCategory()['Dedicated Usage']).Values) { if ($i.InstanceName -match 'pid_(\d+)_') { $k = [int]$matches[1]; $vram[$k] = [double]$vram[$k] + [double]$i.Sample.RawValue } } } catch {}
$rows = @()
foreach ($p in $b) {
  $pa = $a[$p.id]; $cpu = 0.0
  if ($pa -and $p.ts -gt $pa.ts -and $p.name -eq $pa.name) { $cpu = [math]::Round((($p.cpu - $pa.cpu) / ($p.ts - $pa.ts)) / $cores * 100, 1) }
  $nm = ($p.name -replace '#\d+$', '').ToLower()
  if (-not (($cpu -ge 0.3) -or ($p.ws -ge 157286400) -or ($cfg.stems -contains $nm))) { continue }
  $cls = ''; $st = ''
  try { $gp = Get-Process -Id $p.id -EA Stop; $cls = $gp.PriorityClass.ToString(); $st = $gp.StartTime.ToFileTimeUtc().ToString() } catch {}
  $rows += [pscustomobject]@{ id = $p.id; name = $nm; cpu = $cpu; ws = [math]::Round($p.ws / 1MB); vram = [math]::Round(([double]$vram[$p.id]) / 1MB); cls = $cls; st = $st }
}
'${PMARK}' + (ConvertTo-Json -Compress -Depth 4 @{ cores = $cores; gpu = ($vram.Count -gt 0); procs = @($rows) })
`
}

/** -> { cores, gpu: bool, procs: [{ pid, name, cpu (% of the whole CPU), ram (MB private), vram (MB dedicated), cls, st }] } | null */
function parseProcs(out) {
  const line = String(out || '').split(/\r?\n/).reverse().find(l => l.startsWith(PMARK))
  if (!line) return null
  let j; try { j = JSON.parse(line.slice(PMARK.length)) } catch { return null }
  if (!j || typeof j !== 'object') return null
  const procs = toArr(j.procs).filter(p => p && Number(p.id) > 0).map(p => ({
    pid: Number(p.id), name: known.stem(p.name), cpu: Math.max(0, num(p.cpu) || 0), ram: Math.max(0, num(p.ws) || 0), vram: Math.max(0, num(p.vram) || 0),
    cls: String(p.cls || ''), st: String(p.st || ''),
  }))
  return { cores: Number(j.cores) || 1, gpu: j.gpu === true, procs }
}

module.exports = { buildScript, parse, evaluate, procScript, parseProcs, MARK, PMARK }
