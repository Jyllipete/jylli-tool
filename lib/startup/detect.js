'use strict'
// Startup tab "Ignition": the read-only PowerShell probes and their parsers.
//   buildScript / parse      ONE probe for everything that starts with Windows (Run keys, Startup folders, logon tasks, Store-app startup tasks),
//                            each one's StartupApproved byte, its file facts, the programs running now, Jylli's own delay tasks and old-version leftovers
//   liveScript / parseLive   the cheap repeat: which startup programs are running right now and how much memory they hold
//   bootScript / parseBoot   Windows' own boot timing (Diagnostics-Performance events 100 and 101), raw fields only
//   iconScript / parseIcons  32 px icons for a few program files (only asked for once per file)
// They only read. A value that cannot be read is null and is reported as "unread", never as "off".
const catalog = require('./catalog')

const MARK = 'JJSTART:', LMARK = 'JJLIVE:', BMARK = 'JJBOOT:', IMARK = 'JJICON:'
const psq = s => "'" + String(s).replace(/'/g, "''") + "'"
const toArr = v => (Array.isArray(v) ? v : v == null ? [] : [v])
const str = v => (v == null ? '' : String(v))

function buildScript() {
  const cfg = {
    sources: Object.fromEntries(Object.entries(catalog.SOURCES).filter(([, s]) => s.kind === 'run' || s.kind === 'folder').map(([id, s]) => [id, { kind: s.kind, key: s.key || '', approved: s.approved, dir: s.dirEnv || '' }])),
    delayPath: catalog.DELAY_PATH, legacyPrefix: catalog.LEGACY_TASK_PREFIX, legacyDisabled: catalog.LEGACY_DISABLED,
    owned: catalog.OWNED.map(o => ({ id: o.id, key: o.key, name: o.name })),
  }
  return String.raw`$ErrorActionPreference = 'SilentlyContinue'
$cfg = ConvertFrom-Json ${psq(JSON.stringify(cfg))}
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
function Approved($k) { $m = @{}; $i = Get-Item -LiteralPath $k -EA SilentlyContinue; if ($i) { foreach ($n in $i.GetValueNames()) { $v = $i.GetValue($n); if ($v -is [byte[]]) { $m[$n.ToLower()] = @($v | Select-Object -First 12) } } }; $m }
function Facts($cmd) {
  $exe = ''; $a = ''
  if ($cmd -match '^\s*"([^"]+)"\s*(.*)$') { $exe = $matches[1]; $a = $matches[2] }
  elseif ($cmd -match '^\s*(.+?\.(?:exe|bat|cmd|com))(?:\s+(.*))?$') { $exe = $matches[1]; $a = $matches[2] }
  elseif ($cmd -match '^\s*(\S+)\s*(.*)$') { $exe = $matches[1]; $a = $matches[2] }
  $exe = [Environment]::ExpandEnvironmentVariables($exe)
  $full = $exe
  if ($exe -and -not ($exe -match '[\\/]')) { $g = Get-Command $exe -EA SilentlyContinue | Select-Object -First 1; $full = if ($g) { [string]$g.Source } else { '' } }
  $ex = $null; $co = ''; $de = ''
  if ($full) { $ex = [bool](Test-Path -LiteralPath $full -PathType Leaf); if ($ex) { $vi = (Get-Item -LiteralPath $full).VersionInfo; $co = [string]$vi.CompanyName; $de = [string]$vi.FileDescription } }
  @{ exe = $full; args = [string]$a; exists = $ex; co = $co; de = $de }
}
$items = @()
foreach ($sid in @('run-hkcu', 'run-hklm', 'run-hklm32')) {
  $s = $cfg.sources.$sid
  $ap = Approved $s.approved
  $k = Get-ItemProperty -LiteralPath $s.key -EA SilentlyContinue
  if (-not $k) { continue }
  foreach ($p in $k.PSObject.Properties) {
    if ($p.Name -like 'PS*') { continue }
    $c = [string]$p.Value; $f = Facts $c
    $items += @{ src = $sid; name = [string]$p.Name; cmd = $c; exe = $f.exe; args = $f.args; exists = $f.exists; co = $f.co; de = $f.de; ap = $ap[$p.Name.ToLower()] }
  }
}
$sh = $null
foreach ($sid in @('folder-user', 'folder-all')) {
  $s = $cfg.sources.$sid
  $dir = [Environment]::GetFolderPath($s.dir)
  $ap = Approved $s.approved
  if (-not $dir -or -not (Test-Path -LiteralPath $dir)) { continue }
  foreach ($fi in (Get-ChildItem -LiteralPath $dir -File -Force -EA SilentlyContinue)) {
    if ($fi.Name -ieq 'desktop.ini') { continue }
    $c = $fi.FullName; $tgt = ''; $a = ''
    if ($fi.Extension -ieq '.lnk') { if (-not $sh) { $sh = New-Object -ComObject WScript.Shell }; try { $l = $sh.CreateShortcut($fi.FullName); $tgt = [string]$l.TargetPath; $a = [string]$l.Arguments } catch {} }
    else { $tgt = $fi.FullName }
    $f = if ($tgt) { Facts ('"' + $tgt + '"') } else { @{ exe = ''; args = ''; exists = $null; co = ''; de = '' } }
    $items += @{ src = $sid; name = [string]$fi.Name; cmd = $(if ($tgt) { '"' + $tgt + '" ' + $a } else { $c }).Trim(); exe = $f.exe; args = $a; exists = $f.exists; co = $f.co; de = $f.de; ap = $ap[$fi.Name.ToLower()]; file = $fi.FullName }
  }
}
$delay = @(); $legacyTasks = @()
foreach ($t in (Get-ScheduledTask -EA SilentlyContinue)) {
  if ($t.TaskPath.StartsWith('\Microsoft\')) { continue }
  $act = $t.Actions | Select-Object -First 1
  $ex = [string]$act.Execute; $ar = [string]$act.Arguments
  if ($t.TaskPath -eq $cfg.delayPath) { $delay += @{ name = [string]$t.TaskName; state = [string]$t.State; exe = $ex; args = $ar }; continue }
  if ($t.TaskName.StartsWith($cfg.legacyPrefix)) { $legacyTasks += @{ path = [string]$t.TaskPath; name = [string]$t.TaskName; state = [string]$t.State; exe = $ex; args = $ar }; continue }
  $kinds = @($t.Triggers | ForEach-Object { $_.CimClass.CimClassName })
  if (-not (($kinds -contains 'MSFT_TaskLogonTrigger') -or ($kinds -contains 'MSFT_TaskBootTrigger'))) { continue }
  $c = ($ex + ' ' + $ar).Trim(); $f = Facts $(if ($ex) { '"' + [Environment]::ExpandEnvironmentVariables($ex) + '" ' + $ar } else { $c })
  $items += @{ src = 'task'; name = [string]$t.TaskName; path = [string]$t.TaskPath; cmd = $c; exe = $f.exe; args = $ar; exists = $f.exists; co = $f.co; de = $f.de; state = [string]$t.State; boot = [bool]($kinds -contains 'MSFT_TaskBootTrigger') }
}
$appx = @()
$root = 'HKCU:\Software\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\SystemAppData'
foreach ($pk in (Get-ChildItem -LiteralPath $root -EA SilentlyContinue)) {
  foreach ($tk in (Get-ChildItem -LiteralPath $pk.PSPath -EA SilentlyContinue)) {
    $st = (Get-ItemProperty -LiteralPath $tk.PSPath -EA SilentlyContinue).State
    if ($null -ne $st) { $appx += @{ pkg = [string]$pk.PSChildName; task = [string]$tk.PSChildName; state = [int]$st } }
  }
}
$legacyDisabled = @()
foreach ($sid in @('run-hkcu', 'run-hklm')) {
  $d = Get-ItemProperty -LiteralPath $cfg.legacyDisabled.$sid -EA SilentlyContinue
  if ($d) { foreach ($p in $d.PSObject.Properties) { if ($p.Name -notlike 'PS*') { $legacyDisabled += @{ src = $sid; name = [string]$p.Name; cmd = [string]$p.Value } } } }
}
$sw = @{}
foreach ($o in $cfg.owned) { $v = $null; try { $v = (Get-ItemProperty -LiteralPath $o.key -Name $o.name -EA Stop).($o.name) } catch {}; $sw[$o.id] = $v }
$pm = @{}
foreach ($pr in (Get-Process)) { $n = $pr.ProcessName.ToLower(); if (-not $pm.ContainsKey($n)) { $pm[$n] = @{ n = 0; mb = 0 } }; $pm[$n].n++; $pm[$n].mb += [math]::Round($pr.WorkingSet64 / 1MB) }
'${MARK}' + (ConvertTo-Json -Compress -Depth 6 @{ admin = $admin; items = @($items); appx = @($appx); delay = @($delay); legacyTasks = @($legacyTasks); legacyDisabled = @($legacyDisabled); sw = $sw; procs = $pm })
`
}

const exeStem = p => { const m = /([^\\/]+?)(?:\.(?:exe|bat|cmd|com|lnk|url))?$/i.exec(String(p || '')); return m ? m[1].toLowerCase() : '' }

/** AppX startup-task State is the StartupTaskState enum: 0 Disabled, 1 DisabledByUser, 2 Enabled, 3 DisabledByPolicy, 4 EnabledByPolicy. */
const APPX_ON = new Set([2, 4])
const APPX_POLICY = new Set([3, 4])

function normalise(it) {
  const src = String(it.src)
  const base = {
    src, name: str(it.name), cmd: str(it.cmd), exe: str(it.exe), args: str(it.args), exists: it.exists === true ? true : it.exists === false ? false : null,
    publisher: str(it.co).trim(), desc: str(it.de).trim(), stem: exeStem(it.exe || it.cmd), file: str(it.file), path: str(it.path),
  }
  if (src === 'task') return { ...base, id: catalog.idOf(src, base.path + base.name), enabled: str(it.state) !== 'Disabled', offAt: null, boot: it.boot === true, state: str(it.state) }
  const bytes = Array.isArray(it.ap) ? it.ap.map(Number) : null
  return { ...base, id: catalog.idOf(src, base.name), enabled: catalog.bytesOn(bytes), offAt: bytes ? catalog.offSince(bytes) : null, hasApproved: !!bytes }
}

function normaliseAppx(a) {
  const pkg = str(a.pkg), fam = pkg.split('_')[0]
  const st = Number(a.state)
  return {
    src: 'appx', id: catalog.idOf('appx', pkg + '/' + a.task), name: fam, sub: str(a.task), pkg, task: str(a.task), cmd: pkg + ' / ' + str(a.task), exe: '', args: '', exists: true,
    publisher: '', desc: '', stem: '', file: '', path: '', enabled: APPX_ON.has(st), policy: APPX_POLICY.has(st), offAt: null, state: String(st),
  }
}

/** -> { admin, items: [entry], delays: [{name,state,exe,args}], legacy: {disabled:[], tasks:[]}, switches: {id: 0|1|null}, procs: {stem: {n, mb}} } | null */
function parse(out) {
  const line = String(out || '').split(/\r?\n/).reverse().find(l => l.startsWith(MARK))
  if (!line) return null
  let j; try { j = JSON.parse(line.slice(MARK.length)) } catch { return null }
  if (!j || typeof j !== 'object') return null
  const items = [...toArr(j.items).filter(i => i && i.name != null && catalog.SOURCES[i.src]).map(normalise), ...toArr(j.appx).filter(a => a && a.pkg).map(normaliseAppx)]
  const seen = new Set()
  const uniq = items.filter(i => (seen.has(i.id) ? false : (seen.add(i.id), true)))
  const procs = {}
  for (const [k, v] of Object.entries(j.procs || {})) procs[String(k).toLowerCase()] = { n: Number(v && v.n) || 0, mb: Number(v && v.mb) || 0 }
  const switches = {}
  for (const [k, v] of Object.entries(j.sw || {})) switches[k] = v == null || v === '' ? null : Number(v)
  return {
    admin: j.admin === true, items: uniq, procs, switches,
    delays: toArr(j.delay).filter(d => d && d.name).map(d => ({ name: str(d.name), state: str(d.state), exe: str(d.exe), args: str(d.args) })),
    legacy: {
      disabled: toArr(j.legacyDisabled).filter(d => d && d.name).map(d => ({ src: str(d.src), name: str(d.name), cmd: str(d.cmd) })),
      tasks: toArr(j.legacyTasks).filter(t => t && t.name).map(t => ({ path: str(t.path), name: str(t.name), state: str(t.state), exe: str(t.exe), args: str(t.args) })),
    },
  }
}

// ── live (cheap) ─────────────────────────────────────────────────────────────
function liveScript() {
  return String.raw`$ErrorActionPreference = 'SilentlyContinue'
$pm = @{}
foreach ($pr in (Get-Process)) { $n = $pr.ProcessName.ToLower(); if (-not $pm.ContainsKey($n)) { $pm[$n] = @{ n = 0; mb = 0 } }; $pm[$n].n++; $pm[$n].mb += [math]::Round($pr.WorkingSet64 / 1MB) }
'${LMARK}' + (ConvertTo-Json -Compress -Depth 4 @{ procs = $pm })
`
}
function parseLive(out) {
  const line = String(out || '').split(/\r?\n/).reverse().find(l => l.startsWith(LMARK))
  if (!line) return null
  let j; try { j = JSON.parse(line.slice(LMARK.length)) } catch { return null }
  const procs = {}
  for (const [k, v] of Object.entries((j && j.procs) || {})) procs[String(k).toLowerCase()] = { n: Number(v && v.n) || 0, mb: Number(v && v.mb) || 0 }
  return { procs }
}

// ── boot timing ──────────────────────────────────────────────────────────────
function bootScript() {
  return String.raw`$ErrorActionPreference = 'Stop'
$log = 'Microsoft-Windows-Diagnostics-Performance/Operational'
$status = 'ok'; $boots = @(); $slow = @()
function Read($id, $max) {
  $res = @()
  foreach ($e in (Get-WinEvent -FilterHashtable @{ LogName = $log; Id = $id } -MaxEvents $max -EA Stop)) {
    $x = [xml]$e.ToXml(); $d = @{}
    foreach ($n in $x.Event.EventData.Data) { if ($n.Name) { $d[[string]$n.Name] = [string]$n.'#text' } }
    $res += @{ at = $e.TimeCreated.ToUniversalTime().ToString('o'); d = $d }
  }
  $res
}
try { $boots = @(Read 100 12) } catch { $status = if ($_.Exception.Message -match 'No events were found') { 'none' } elseif ($_.Exception.Message -match 'unauthorized|denied') { 'denied' } else { 'error' } }
if ($status -eq 'ok' -or $status -eq 'none') { try { $slow = @(Read 101 150) } catch {} }
$lb = $null; try { $lb = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime().ToString('o') } catch {}
'${BMARK}' + (ConvertTo-Json -Compress -Depth 6 @{ status = $status; boots = @($boots); slow = @($slow); lastBoot = $lb })
`
}
/** -> { status: 'ok'|'none'|'denied'|'error', boots: [{at, d}], slow: [{at, d}], lastBoot } | null. d = the event's own fields, untouched. */
function parseBoot(out) {
  const line = String(out || '').split(/\r?\n/).reverse().find(l => l.startsWith(BMARK))
  if (!line) return null
  let j; try { j = JSON.parse(line.slice(BMARK.length)) } catch { return null }
  if (!j || typeof j !== 'object') return null
  const ev = x => ({ at: Date.parse(x.at), d: x.d && typeof x.d === 'object' ? x.d : {} })
  const okEv = x => x && Number.isFinite(x.at)
  return {
    status: ['ok', 'none', 'denied', 'error'].includes(j.status) ? j.status : 'error',
    boots: toArr(j.boots).map(ev).filter(okEv), slow: toArr(j.slow).map(ev).filter(okEv),
    lastBoot: j.lastBoot ? Date.parse(j.lastBoot) || null : null,
  }
}

// ── icons ────────────────────────────────────────────────────────────────────
function iconScript(paths) {
  return String.raw`$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Drawing
$cfg = ConvertFrom-Json ${psq(JSON.stringify({ paths }))}
$res = @{}
foreach ($p in @($cfg.paths)) {
  try {
    if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { continue }
    $ic = [System.Drawing.Icon]::ExtractAssociatedIcon($p)
    if (-not $ic) { continue }
    $bmp = New-Object System.Drawing.Bitmap 32, 32
    $g = [System.Drawing.Graphics]::FromImage($bmp); $g.InterpolationMode = 'HighQualityBicubic'; $g.DrawImage($ic.ToBitmap(), 0, 0, 32, 32); $g.Dispose()
    $ms = New-Object System.IO.MemoryStream; $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $b = [Convert]::ToBase64String($ms.ToArray())
    if ($b.Length -lt 8192) { $res[$p] = $b }
    $bmp.Dispose(); $ms.Dispose(); $ic.Dispose()
  } catch {}
}
'${IMARK}' + (ConvertTo-Json -Compress @{ icons = $res })
`
}
function parseIcons(out) {
  const line = String(out || '').split(/\r?\n/).reverse().find(l => l.startsWith(IMARK))
  if (!line) return {}
  try { const j = JSON.parse(line.slice(IMARK.length)); const o = {}; for (const [k, v] of Object.entries((j && j.icons) || {})) if (/^[A-Za-z0-9+/=]+$/.test(v)) o[k] = 'data:image/png;base64,' + v; return o } catch { return {} }
}

module.exports = { buildScript, parse, liveScript, parseLive, bootScript, parseBoot, iconScript, parseIcons, exeStem, APPX_ON, MARK, LMARK, BMARK, IMARK }
