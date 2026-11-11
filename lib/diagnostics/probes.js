'use strict'
// Diagnostics probes. A probe is { id, deep?, admin?, timeoutMs, script, parse(out) -> slice | null } (one PowerShell run), or
// { id, deep?, run(deps) -> slice | null } (reuses an existing handler). Scripts print one `JJDIAG:` JSON line; parse() is pure and
// returns null when it cannot read the output, which the service records as "not measured" - never as a default.
// Every script is locale-safe: no localised counter paths, no parsing of translated text (event ids and WMI classes only).
// What the hardware / security / display / power data comes from: the cached Auto-Optimize profile, not a probe here.
const MARK = 'JJDIAG:'

const PRE = String.raw`$ErrorActionPreference='SilentlyContinue'
function ms($d){ if($d){ [DateTimeOffset]::new([datetime]$d).ToUnixTimeMilliseconds() } else { $null } }
$o=[ordered]@{}
`
const POST = String.raw`
'JJDIAG:' + ($o | ConvertTo-Json -Compress -Depth 5)`

const arr = x => Array.isArray(x) ? x : x == null ? [] : [x]
const num = x => (x == null || x === '' || !Number.isFinite(Number(x))) ? null : Number(x)
const str = x => x == null ? '' : String(x)

function j(out) {
  const lines = String(out || '').split(/\r?\n/)
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i].trim()
    if (l.startsWith(MARK)) { try { return JSON.parse(l.slice(MARK.length)) } catch { return null } }
  }
  return null
}

const body = s => PRE + s + POST

const PROBES = [
  { id: 'reliability', timeoutMs: 45000, script: body(String.raw`$c=(Get-Date).AddDays(-30)
$o.idx=@(Get-CimInstance Win32_ReliabilityStabilityMetrics | Where-Object { $_.StartMeasurementTime -gt $c } | Sort-Object StartMeasurementTime | ForEach-Object { @{ t=(ms $_.StartMeasurementTime); v=[math]::Round([double]$_.SystemStabilityIndex,2) } })
$o.rec=@(Get-CimInstance Win32_ReliabilityRecords | Where-Object { $_.TimeGenerated -gt $c } | Select-Object -First 400 | ForEach-Object { $m=[string]$_.Message; if($m.Length -gt 140){$m=$m.Substring(0,140)}; @{ t=(ms $_.TimeGenerated); src=[string]$_.SourceName; id=[int]$_.EventIdentifier; p=[string]$_.ProductName; m=$m } })`),
    parse(out) {
      const o = j(out); if (!o) return null
      const idx = arr(o.idx).map(x => ({ t: num(x.t), v: num(x.v) })).filter(x => x.t != null && x.v != null)
      const rec = arr(o.rec).map(x => ({ t: num(x.t), src: str(x.src), id: num(x.id), p: str(x.p), m: str(x.m) })).filter(x => x.t != null)
      if (!idx.length && !rec.length) return null
      return { idx, rec }
    } },

  { id: 'events', timeoutMs: 45000, script: body(String.raw`$c=(Get-Date).AddDays(-30)
$l=@()
$l+=@(Get-WinEvent -FilterHashtable @{LogName='System';Id=41,1001,6008,4101,7,11,15,51,55,98,129,140,153;StartTime=$c} -MaxEvents 500)
$l+=@(Get-WinEvent -FilterHashtable @{LogName='System';ProviderName='Microsoft-Windows-WHEA-Logger';StartTime=$c} -MaxEvents 100)
$o.list=@($l | Where-Object { $_ } | ForEach-Object { $m=''; if($_.Id -eq 1001){ $m=[string]$_.Message; if($m.Length -gt 300){$m=$m.Substring(0,300)} }; @{ t=(ms $_.TimeCreated); id=[int]$_.Id; p=[string]$_.ProviderName; m=$m } })
$o.ok=$true`),
    parse(out) { const o = j(out); return o && o.ok ? { list: arr(o.list).map(x => ({ t: num(x.t), id: num(x.id), p: str(x.p), m: str(x.m) })).filter(x => x.t != null) } : null } },

  { id: 'minidumps', admin: true, timeoutMs: 15000, script: body(String.raw`$ok=$true
try { $f=@(Get-ChildItem 'C:\Windows\Minidump' -Filter *.dmp -ErrorAction Stop) } catch { if (Test-Path 'C:\Windows\Minidump') { $ok=$false }; $f=@() }
$o.readable=$ok
$o.list=@($f | Where-Object { $_.LastWriteTime -gt (Get-Date).AddDays(-30) } | ForEach-Object { @{ t=(ms $_.LastWriteTime); n=[string]$_.Name; size=[int64]$_.Length } })`),
    parse(out) { const o = j(out); return o && o.readable !== false ? { list: arr(o.list).map(x => ({ t: num(x.t), n: str(x.n), size: num(x.size) })).filter(x => x.t != null) } : null } },

  { id: 'storage', admin: true, timeoutMs: 30000, script: body(String.raw`$o.disks=@(Get-PhysicalDisk | ForEach-Object { $rc=$_ | Get-StorageReliabilityCounter -ErrorAction SilentlyContinue; @{ n=[string]$_.FriendlyName; media=[string]$_.MediaType; bus=[string]$_.BusType; health=[string]$_.HealthStatus; size=[int64]$_.Size; wear=$rc.Wear; temp=$rc.Temperature; poh=$rc.PowerOnHours; rerr=$rc.ReadErrorsUncorrected; werr=$rc.WriteErrorsUncorrected } })
$pr=@(Get-CimInstance -Namespace root\wmi -ClassName MSStorageDriver_FailurePredictStatus)
$o.predict = if($pr.Count){ [bool](@($pr | Where-Object { $_.PredictFailure }).Count) } else { $null }
$t=(fsutil behavior query DisableDeleteNotify) -join ' '
$o.trimDisabled = if($t -match 'DisableDeleteNotify\s*=\s*(\d)'){ [int]$matches[1] } else { $null }
$o.vols=@(Get-Volume | Where-Object { $_.DriveType -eq 'Fixed' -and $_.DriveLetter } | ForEach-Object { @{ l=[string]$_.DriveLetter; size=[int64]$_.Size; free=[int64]$_.SizeRemaining } })
$o.sysDrive=([string]$env:SystemDrive).TrimEnd(':')`),
    parse(out) {
      const o = j(out); if (!o) return null
      const disks = arr(o.disks).map(d => ({ n: str(d.n), media: str(d.media), bus: str(d.bus), health: str(d.health), size: num(d.size), wear: num(d.wear), temp: num(d.temp), poh: num(d.poh), rerr: num(d.rerr), werr: num(d.werr) }))
      const vols = arr(o.vols).map(v => ({ l: str(v.l), size: num(v.size), free: num(v.free) })).filter(v => v.size)
      if (!disks.length && !vols.length) return null
      return { disks, predict: typeof o.predict === 'boolean' ? o.predict : null, trimDisabled: num(o.trimDisabled), vols, sysDrive: str(o.sysDrive) || 'C' }
    } },

  { id: 'battery', timeoutMs: 15000, script: body(String.raw`$s=@(Get-CimInstance -Namespace root\wmi -ClassName BatteryStaticData)[0]
$f=@(Get-CimInstance -Namespace root\wmi -ClassName BatteryFullChargedCapacity)[0]
$y=@(Get-CimInstance -Namespace root\wmi -ClassName BatteryCycleCount)[0]
$o.present=[bool]$s
$o.design=$s.DesignedCapacity
$o.full=$f.FullChargedCapacity
$o.cycles=$y.CycleCount`),
    parse(out) { const o = j(out); return o ? { present: !!o.present, design: num(o.design), full: num(o.full), cycles: num(o.cycles) } : null } },

  { id: 'devices', timeoutMs: 30000, script: body(String.raw`$o.list=@(Get-CimInstance Win32_PnPEntity -Filter "ConfigManagerErrorCode <> 0" | Where-Object { $_.ConfigManagerErrorCode -ne 22 -and $_.ConfigManagerErrorCode -ne 45 } | Select-Object -First 40 | ForEach-Object { @{ n=[string]$_.Name; code=[int]$_.ConfigManagerErrorCode; cls=[string]$_.PNPClass } })
$o.ok=$true`),
    parse(out) { const o = j(out); return o && o.ok ? { list: arr(o.list).map(d => ({ n: str(d.n), code: num(d.code), cls: str(d.cls) })) } : null } },

  { id: 'drivers', timeoutMs: 75000, script: body(String.raw`$o.list=@(Get-CimInstance Win32_PnPSignedDriver -Filter "DeviceClass='DISPLAY' OR DeviceClass='NET' OR DeviceClass='MEDIA' OR DeviceClass='BLUETOOTH'" | Where-Object { $_.DeviceName -and $_.Manufacturer -notmatch 'Microsoft' -and $_.DeviceName -notmatch 'Standard' } | ForEach-Object { @{ n=[string]$_.DeviceName; m=[string]$_.Manufacturer; v=[string]$_.DriverVersion; t=(ms $_.DriverDate); cls=[string]$_.DeviceClass } })
$o.ok=$true`),
    parse(out) { const o = j(out); return o && o.ok ? { list: arr(o.list).map(d => ({ n: str(d.n), m: str(d.m), v: str(d.v), t: num(d.t), cls: str(d.cls) })) } : null } },

  { id: 'updates', timeoutMs: 45000, script: body(String.raw`$o.rebootPending=[bool]((Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending') -or (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired'))
$hf=@(Get-HotFix | Where-Object { $_.InstalledOn } | Sort-Object InstalledOn -Descending | Select-Object -First 40)
$o.kbs=@($hf | ForEach-Object { @{ kb=[string]$_.HotFixID; t=(ms $_.InstalledOn) } })
$o.wu=[string](Get-Service wuauserv).StartType
$o.ok=$true`),
    parse(out) {
      const o = j(out); if (!o || !o.ok) return null
      const kbs = arr(o.kbs).map(k => ({ kb: str(k.kb), t: num(k.t) })).filter(k => k.t != null)
      return { rebootPending: !!o.rebootPending, kbs, lastKbTs: kbs.length ? Math.max(...kbs.map(k => k.t)) : null, wu: str(o.wu) }
    } },

  { id: 'tpm', admin: true, timeoutMs: 15000, script: body(String.raw`$adm=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$t= if($adm){ Get-Tpm } else { $null }
$o.present = if($t){ [bool]$t.TpmPresent } else { $null }
$o.ready = if($t){ [bool]$t.TpmReady } else { $null }`),
    parse(out) { const o = j(out); return o && typeof o.present === 'boolean' ? { present: o.present, ready: !!o.ready } : null } },

  { id: 'memory', timeoutMs: 20000, script: body(String.raw`$os=Get-CimInstance Win32_OperatingSystem
$o.totalKB=[int64]$os.TotalVisibleMemorySize
$o.freeKB=[int64]$os.FreePhysicalMemory
if($os.TotalVirtualMemorySize){ $o.commitPct=[math]::Round(100*($os.TotalVirtualMemorySize-$os.FreeVirtualMemory)/$os.TotalVirtualMemorySize,1) }
$e=Get-WinEvent -FilterHashtable @{LogName='System';ProviderName='Microsoft-Windows-MemoryDiagnostics-Results';Id=1201,1202} -MaxEvents 1
if($e){ $o.memdiag=@{ t=(ms $e.TimeCreated); ok=([int]$e.Id -eq 1201) } }
$o.ok=[bool]$os`),
    parse(out) { const o = j(out); return o && o.ok ? { totalKB: num(o.totalKB), freeKB: num(o.freeKB), commitPct: num(o.commitPct), memdiag: o.memdiag ? { t: num(o.memdiag.t), ok: !!o.memdiag.ok } : null } : null } },

  // CPU load comes from two os.cpus() snapshots (a second apart): no PowerShell start-up in the way of the measurement.
  { id: 'cpu', run: async deps => {
    if (deps && deps.cpuLoad) return { name: 'test', cur: null, max: null, load: deps.cpuLoad() }
    const os = require('os')
    const snap = () => os.cpus().reduce((a, c) => { const t = c.times; a.idle += t.idle; a.total += t.user + t.nice + t.sys + t.idle + t.irq; return a }, { idle: 0, total: 0 })
    const a = snap(); await new Promise(r => setTimeout(r, (deps && deps.cpuSampleMs) || 1200)); const b = snap()
    const dt = b.total - a.total, c0 = os.cpus()[0] || {}
    return { name: String(c0.model || '').replace(/s+/g, ' ').trim(), cur: c0.speed || null, max: null, load: dt > 0 ? Math.round((1 - (b.idle - a.idle) / dt) * 100) : null }
  } },

  { id: 'net', timeoutMs: 40000, script: body(String.raw`function pg($h){ $r=@(Test-Connection $h -Count 4 -ErrorAction SilentlyContinue); if(-not $r.Count){ return @{ avg=$null; loss=100 } }; @{ avg=[math]::Round(($r | Measure-Object ResponseTime -Average).Average,1); loss=[int](100*(4-$r.Count)/4) } }
$gw=(Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric | Select-Object -First 1).NextHop
if($gw -and $gw -ne '0.0.0.0'){ $o.gw=(pg $gw); $o.gw.ip=[string]$gw }
$o.inet=(pg '1.1.1.1')
$a=@(Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and -not $_.Virtual } | Sort-Object InterfaceMetric | Select-Object -First 1)[0]
if($a){ $o.adapter=@{ name=[string]$a.Name; mbps=[int]($a.Speed/1000000); wifi=[bool]($a.PhysicalMediaType -eq 'Native 802.11') } }
$o.ok=$true`),
    parse(out) {
      const o = j(out); if (!o || !o.ok) return null
      const inet = o.inet ? { avg: num(o.inet.avg), loss: num(o.inet.loss) } : null
      let gw = o.gw ? { ip: str(o.gw.ip), avg: num(o.gw.avg), loss: num(o.gw.loss) } : null
      // Many routers drop ICMP: a silent gateway with a working internet link is "not measured", not "100% loss".
      if (gw && gw.loss === 100 && inet && inet.loss < 100) gw = null
      return { gw, inet, adapter: o.adapter ? { name: str(o.adapter.name), mbps: num(o.adapter.mbps), wifi: !!o.adapter.wifi } : null }
    } },

  // ── deep ───────────────────────────────────────────────────────────────────────
  { id: 'health', deep: true, admin: true, timeoutMs: 240000, script: body(String.raw`$s=''
try { $s=([string](Repair-WindowsImage -Online -CheckHealth).ImageHealthState).ToLower() } catch { $s='unknown' }
$o.dism = switch ($s) { 'healthy' { 'healthy' } 'repairable' { 'repairable' } 'nonrepairable' { 'corrupted' } default { 'unknown' } }
$x=(& sfc /verifyonly 2>&1 | Out-String).Replace([string][char]0,'')
$code=$LASTEXITCODE
$o.sfc = if($x -match 'did not find any integrity violations'){ 'clean' } elseif($x -match 'found integrity violations'){ 'corrupt' } elseif($x -match 'could not perform the requested operation'){ 'pending' } elseif($code -eq 0){ 'clean' } else { 'unknown' }`),
    parse(out) { const o = j(out); return o ? { dism: str(o.dism) || 'unknown', sfc: str(o.sfc) || 'unknown' } : null } },
  { id: 'thermal', deep: true, run: async deps => deps.thermalAudit ? deps.thermalAudit() : null },
  { id: 'ram', deep: true, run: async deps => deps.ramStress ? deps.ramStress() : null },

  // ── reused from existing handlers ──────────────────────────────────────────────
  { id: 'runtimes', run: async deps => deps.runtimes ? deps.runtimes() : null },
]

const byId = Object.fromEntries(PROBES.map(p => [p.id, p]))
const forMode = mode => PROBES.filter(p => mode === 'deep' || !p.deep)

module.exports = { PROBES, byId, forMode, j, MARK }
