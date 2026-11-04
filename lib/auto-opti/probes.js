'use strict'
// Detection probes. Each probe is one PowerShell script plus a pure parser, so the parsers are tested against recorded output.
// A probe that fails or times out leaves its fields unset (unknown); nothing here guesses.
const inventory = require('../inventory')
const display = require('./display')
const startup = require('./startup')
const ramParts = require('./ram-parts')
const { classifyCpu } = require('../cpu-arch')

const j = text => { try { return JSON.parse(String(text || '').trim().split(/\r?\n/).filter(l => l.trim().startsWith('{')).pop()) } catch { return null } }
const arr = x => (x == null ? [] : Array.isArray(x) ? x : [x])
const num = x => { const n = Number(x); return Number.isFinite(n) ? n : null }
const bool = x => (x == null ? null : x === true || x === 1 || x === '1' || /^true$/i.test(String(x)))

const GUID = {
  saver: 'a1841308-3541-4fab-bc81-f71556f20b4a', balanced: '381b4222-f694-41f0-9685-ff5bb260df2e',
  high: '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c', ultimate: 'e9a42b02-d5df-448d-aa00-03f14749eb61',
}
const OVERLAY = { efficiency: '961cc777-2547-4f9d-8174-7d86181b8a7a', balanced: '00000000-0000-0000-0000-000000000000', performance: 'ded574b5-45a0-4f42-8737-46345c09c238', max: '3af9b8d9-7c97-431d-ad78-34a8bfea439f' }

function schemeKind(guid, name) {
  const g = String(guid || '').toLowerCase()
  for (const k of Object.keys(GUID)) if (GUID[k] === g) return k
  if (/jylli|max performance/i.test(name || '')) return 'jylli'
  return g ? 'custom' : null
}

// ── scripts ───────────────────────────────────────────────────────────────────────────────────────────────────
const POWER = String.raw`
$o = @{}
$a = (powercfg /getactivescheme) -join ' '
if ($a -match '([0-9a-fA-F-]{36})\s*\(([^)]*)\)') { $o.guid = $matches[1]; $o.name = $matches[2] }
$o.overlayAc = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Power\User\PowerSchemes' -ErrorAction SilentlyContinue).ActiveOverlayAcPowerScheme
Add-Type -AssemblyName System.Windows.Forms
$o.onAC = ([System.Windows.Forms.SystemInformation]::PowerStatus.PowerLineStatus -eq 'Online')
$o | ConvertTo-Json -Compress
`

const GPU = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$g = @(Get-CimInstance Win32_PnPSignedDriver | Where-Object { $_.DeviceClass -eq 'DISPLAY' } | ForEach-Object { @{ name = $_.DeviceName; ver = $_.DriverVersion; date = $(if ($_.DriverDate) { $_.DriverDate.ToString('yyyy-MM-dd') } else { $null }) } })
@{ drivers = $g
   hwsch = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers').HwSchMode
   dx = (Get-ItemProperty 'HKCU:\Software\Microsoft\DirectX\UserGpuPreferences').DirectXUserGlobalSettings } | ConvertTo-Json -Depth 4 -Compress
`

const STORAGE = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$c = Get-PSDrive C
$cs = Get-CimInstance Win32_ComputerSystem
$pd = Get-Partition -DriveLetter C | Get-Disk | Get-PhysicalDisk | Select-Object -First 1
function Sz($p, $hours) { $cut = (Get-Date).AddHours(-$hours); $m = Get-ChildItem -LiteralPath $p -Recurse -File -Force | Where-Object { $_.LastWriteTime -lt $cut } | Measure-Object Length -Sum; [int64]$m.Sum }
@{ free = [int64]$c.Free; used = [int64]$c.Used
   media = ($pd.MediaType + '')
   trimDisabled = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem').DisableDeleteNotification
   autoPagefile = $cs.AutomaticManagedPagefile
   pagefileSettings = @(Get-CimInstance Win32_PageFileSetting).Count
   pagingFiles = (@((Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management').PagingFiles) -join ';')
   tempBytes = (Sz $env:TEMP 24) + (Sz 'C:\Windows\Temp' 24)
   wuBytes = (Sz 'C:\Windows\SoftwareDistribution\Download' 240)
   wuRebootPending = (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired')
   hiberBytes = [int64](Get-Item 'C:\hiberfil.sys' -Force).Length
   hiberboot = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power').HiberbootEnabled } | ConvertTo-Json -Compress
`

const WINDOWS = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$cv = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
$tasks = @()
foreach ($t in 'Microsoft Compatibility Appraiser','ProgramDataUpdater','PcaPatchDbTask','Consolidator','UsbCeip','Microsoft-Windows-DiskDiagnosticDataCollector') {
  $s = Get-ScheduledTask -TaskName $t | Select-Object -First 1
  if ($s) { $tasks += @{ name = $t; on = ($s.State -ne 'Disabled') } }
}
@{ build = [int]$cv.CurrentBuildNumber; ubr = [int]$cv.UBR; edition = $cv.EditionID
   gameMode = (Get-ItemProperty 'HKCU:\Software\Microsoft\GameBar').AutoGameModeEnabled
   appCapture = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\GameDVR').AppCaptureEnabled
   gameDvr = (Get-ItemProperty 'HKCU:\System\GameConfigStore').GameDVR_Enabled
   mouseSpeed = (Get-ItemProperty 'HKCU:\Control Panel\Mouse').MouseSpeed
   mouseSens = (Get-ItemProperty 'HKCU:\Control Panel\Mouse').MouseSensitivity
   bgApps = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\BackgroundAccessApplications').GlobalUserDisabled
   stickyFlags = (Get-ItemProperty 'HKCU:\Control Panel\Accessibility\StickyKeys').Flags
   diagTrack = ((Get-Service DiagTrack).StartType + '')
   doMode = (Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\DeliveryOptimization').DODownloadMode
   bing = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Search').BingSearchEnabled
   nudge = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager').SilentInstalledAppsEnabled
   tasks = $tasks } | ConvertTo-Json -Depth 4 -Compress
`

const STARTUP = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
function Items($root, $sub, $src, $apprRoot, $apprSub) {
  $k = Get-ItemProperty -Path "$root\$sub"
  $ap = Get-ItemProperty -Path "$apprRoot\$apprSub"
  if (-not $k) { return }
  foreach ($p in $k.PSObject.Properties) {
    if ($p.Name -like 'PS*') { continue }
    $cmd = [string]$p.Value
    $exe = if ($cmd -match '^"([^"]+)"') { $matches[1] } elseif ($cmd -match '^(\S+?\.exe)') { $matches[1] } else { '' }
    $co = if ($exe -and (Test-Path -LiteralPath $exe)) { (Get-Item -LiteralPath $exe).VersionInfo.CompanyName } else { '' }
    $b = $ap.($p.Name)
    $en = if ($b -is [byte[]] -and $b.Length -gt 0) { (($b[0] -band 1) -eq 0) } else { $true }
    @{ name = $p.Name; src = $src; cmd = $cmd; company = $co; enabled = $en }
  }
}
$all = @()
$all += Items 'HKCU:' 'Software\Microsoft\Windows\CurrentVersion\Run' 'HKCU' 'HKCU:' 'Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'
$all += Items 'HKLM:' 'SOFTWARE\Microsoft\Windows\CurrentVersion\Run' 'HKLM' 'HKLM:' 'SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'
$all += Items 'HKLM:' 'SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run' 'HKLM32' 'HKLM:' 'SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run32'
@{ items = $all } | ConvertTo-Json -Depth 4 -Compress
`

const SECURITY = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$mp = Get-MpComputerStatus
$ss = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer').SmartScreenEnabled
$ssp = (Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System').EnableSmartScreen
@{ rtp = $mp.RealTimeProtectionEnabled; mode = ($mp.AMRunningMode + '')
   av = @(Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct | ForEach-Object { $_.displayName })
   fw = @(Get-NetFirewallProfile | ForEach-Object { @{ name = ($_.Name + ''); on = [bool]$_.Enabled } })
   smartscreen = $ss; smartscreenPolicy = $ssp
   wu = ((Get-Service wuauserv).StartType + ''); wuNoAuto = (Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU').NoAutoUpdate
   uac = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System').EnableLUA
   hvci = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity').Enabled } | ConvertTo-Json -Depth 4 -Compress
`

const NET = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$r = Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object { $_.RouteMetric + $_.InterfaceMetric } | Select-Object -First 1
$ad = if ($r) { Get-NetAdapter -InterfaceIndex $r.ifIndex } else { $null }
$eee = @(); if ($ad) { $eee = @(Get-NetAdapterAdvancedProperty -Name $ad.Name | Where-Object { $_.DisplayName -match 'Energy.Efficient|Green Ethernet|EEE|Ultra Low Power' } | ForEach-Object { @{ n = $_.DisplayName; v = $_.DisplayValue } }) }
@{ name = $ad.Name; desc = $ad.InterfaceDescription; media = ($ad.PhysicalMediaType + ''); speed = ($ad.LinkSpeed + ''); eee = $eee } | ConvertTo-Json -Depth 4 -Compress
`

// ── parsers: each returns a slice of the profile ──────────────────────────────────────────────────────────────
const MEM_TYPES = { 20: 'DDR', 21: 'DDR2', 24: 'DDR3', 26: 'DDR4', 34: 'DDR5', 29: 'LPDDR3', 30: 'LPDDR4', 35: 'LPDDR5' }

function parseHw(out) {
  const raw = j(out)
  if (!raw) return null
  const rig = inventory.buildRigSpec(raw)
  const name = rig.cpu ? rig.cpu.name : ''
  // Dual-CCD is a property of the part (Ryzen 9 X3D), not of the core count; the real CCD count is refined by the cpu2 probe.
  const cls = classifyCpu(name, rig.cpu && rig.cpu.vendor)
  const x3d = !/x3d/i.test(name) ? 'none' : cls.dualCcdX3d ? 'dual' : 'single'
  const vendor = /intel/i.test(name) ? 'intel' : /amd|ryzen/i.test(name) ? 'amd' : null
  const ramType = (rig.ram.sticks.find(s => s.type) || {}).type || null
  const x = ramParts.xmpState(rig.ram.sticks, ramType)
  const sizes = rig.ram.sticks.map(s => s.sizeGB).filter(Boolean)
  return {
    formFactor: rig.formFactor === 'tower' ? 'desktop' : rig.formFactor,
    cpu: rig.cpu ? { name, vendor, cores: rig.cpu.cores, threads: rig.cpu.threads, x3d } : null,
    gpuList: rig.gpus.map(g => ({ name: g.name, vendor: g.vendor, integrated: g.integrated })),
    ram: {
      type: ramType, slotsTotal: rig.ram.slotsTotal, dimms: rig.ram.sticks.length, totalGB: sizes.reduce((a, b) => a + b, 0) || null,
      sticks: rig.ram.sticks.map(s => ({ slot: s.locator, capGB: s.sizeGB, ratedMT: s.ratedMT, configuredMT: s.speedMT, part: s.part })),
      mismatched: new Set(sizes).size > 1, xmp: x.state, xmpConfidence: x.confidence, xmpRatedMT: x.ratedMT, xmpConfiguredMT: x.configuredMT, xmpJedecOnly: x.jedecOnly === true,
    },
    drives: rig.drives,
  }
}

function parseDisplay(out) {
  const r = display.parseList(out)
  return r.displays.length ? { displays: r.displays, remoteSession: r.remote } : null
}

function parsePower(out) {
  const o = j(out)
  if (!o) return null
  const ov = String(o.overlayAc || '').toLowerCase()
  return { power: { guid: o.guid || null, name: o.name || null, kind: schemeKind(o.guid, o.name), onAC: bool(o.onAC), overlayAc: ov || null,
    overlayKind: Object.keys(OVERLAY).find(k => OVERLAY[k] === ov) || (ov ? 'other' : null) } }
}

function parseGpu(out) {
  const o = j(out)
  if (!o) return null
  return { gpuDrivers: arr(o.drivers).filter(d => d && d.name).map(d => ({ name: d.name, ver: d.ver || null, date: d.date || null })),
    hags: num(o.hwsch), dxGlobal: o.dx == null ? '' : String(o.dx) }
}

function parseStorage(out) {
  const o = j(out)
  if (!o) return null
  const total = num(o.free) != null && num(o.used) != null ? o.free + o.used : null
  const pagingFiles = String(o.pagingFiles || '').trim()
  const auto = bool(o.autoPagefile)
  return { storage: {
    freeGB: o.free != null ? Math.round(o.free / 1024 ** 3 * 10) / 10 : null, totalGB: total != null ? Math.round(total / 1024 ** 3) : null,
    pctFree: total ? Math.round(o.free / total * 100) : null,
    ssd: /ssd/i.test(o.media || '') ? true : /hdd/i.test(o.media || '') ? false : null,
    trimOn: o.trimDisabled == null ? null : Number(o.trimDisabled) === 0,
    // Disabled = not system-managed, no explicit page file configured, and the registry list is empty.
    pagefileDisabled: auto === null ? null : auto === false && !num(o.pagefileSettings) && !pagingFiles,
    tempBytes: num(o.tempBytes) || 0, wuBytes: num(o.wuBytes) || 0, wuRebootPending: bool(o.wuRebootPending) === true,
    hiberBytes: num(o.hiberBytes) || 0, hiberboot: o.hiberboot == null ? null : Number(o.hiberboot) === 1,
  } }
}

function parseWindows(out) {
  const o = j(out)
  if (!o) return null
  const build = num(o.build)
  return {
    os: { build, ubr: num(o.ubr), edition: o.edition || null, win11: build != null ? build >= 22000 : null },
    gaming: {
      // The value is absent on a default install, and Game Mode is then on; only an explicit 0 is "off".
      gameMode: o.gameMode == null ? true : Number(o.gameMode) !== 0,
      bgCapture: Number(o.appCapture) === 1 || Number(o.gameDvr) === 1,
    },
    input: { pointerSpeed: o.mouseSens == null ? null : num(o.mouseSens), mouseAccel: o.mouseSpeed == null ? null : Number(o.mouseSpeed) !== 0, stickyHotkey: o.stickyFlags == null ? null : (Number(o.stickyFlags) & 4) !== 0 },
    background: {
      telemetryTasksOn: arr(o.tasks).filter(t => t.on).length, telemetryTasksFound: arr(o.tasks).length,
      diagTrackOn: o.diagTrack ? !/disabled/i.test(o.diagTrack) : null,
      doPeerOn: o.doMode == null ? true : Number(o.doMode) !== 0 && Number(o.doMode) !== 99 && Number(o.doMode) !== 100,
      bingSearchOn: o.bing == null ? true : Number(o.bing) !== 0,
      nudgesOn: o.nudge == null ? true : Number(o.nudge) !== 0,
      bgAppsOff: o.bgApps == null ? false : Number(o.bgApps) === 1,
    },
  }
}

function parseStartup(out) {
  const o = j(out)
  if (!o) return null
  return { startup: startup.summarize(arr(o.items).filter(i => i && i.name)) }
}

function parseSecurity(out) {
  const o = j(out)
  if (!o) return null
  const av = arr(o.av).filter(Boolean)
  const thirdParty = av.filter(n => !/windows defender|microsoft defender/i.test(n))
  const fw = {}
  for (const p of arr(o.fw)) fw[String(p.name).toLowerCase()] = !!p.on
  const ss = String(o.smartscreen || '')
  return { security: {
    av, thirdPartyAv: thirdParty, defenderRtp: bool(o.rtp), defenderPassive: /passive|sxs/i.test(o.mode || '') || thirdParty.length > 0,
    firewall: fw, firewallOn: Object.keys(fw).length ? Object.values(fw).every(Boolean) : null,
    smartScreen: Number(o.smartscreenPolicy) === 0 ? 'off' : /^off$/i.test(ss) ? 'off' : ss ? 'on' : 'unknown',
    windowsUpdate: /disabled/i.test(o.wu || '') || Number(o.wuNoAuto) === 1 ? 'disabled' : o.wu ? 'ok' : 'unknown',
    uac: o.uac == null ? 'unknown' : Number(o.uac) === 1 ? 'on' : 'off',
    hvci: o.hvci == null ? 'off' : Number(o.hvci) === 1 ? 'on' : 'off',
  } }
}

function parseNet(out) {
  const o = j(out)
  if (!o || !o.name) return { net: { primary: 'none', name: null, eee: 'n/a' } }
  const wifi = /802\.11|wireless|wi-?fi/i.test(`${o.media} ${o.desc}`)
  const eee = arr(o.eee)
  return { net: { primary: wifi ? 'wifi' : 'ethernet', name: o.name, desc: o.desc || '', speed: o.speed || '',
    eee: wifi ? 'n/a' : !eee.length ? 'n/a' : eee.some(e => /^(enabled|on|auto)/i.test(String(e.v))) ? 'on' : 'off' } }
}

// ── chips: what the scan scene shows when a probe resolves (language-neutral values; labels come from LANG) ──
function chipsFor(id, s) {
  if (!s) return [{ key: id, valueText: '', subText: '', status: 'unknown' }]
  const gb = n => (n != null ? `${n} GB` : '')
  switch (id) {
    case 'hw': return [
      { key: 'cpu', valueText: s.cpu ? s.cpu.name : '', subText: s.cpu ? `${s.cpu.cores}C / ${s.cpu.threads}T` : '', status: s.cpu ? 'ok' : 'unknown' },
      { key: 'gpu', valueText: (s.gpuList.find(g => !g.integrated) || s.gpuList[0] || {}).name || '', subText: '', status: s.gpuList.length ? 'ok' : 'unknown' },
      { key: 'ram', valueText: `${gb(s.ram.totalGB)} ${s.ram.type || ''}`.trim(), subText: s.ram.xmpConfiguredMT ? `${s.ram.xmpConfiguredMT} MT/s` : '', status: s.ram.xmp === 'off' ? 'warn' : 'ok' },
    ]
    case 'display': return s.displays.map(d => ({ key: 'display', valueText: `${d.cur.w}x${d.cur.h} @ ${d.cur.hz} Hz`, subText: d.monitor, status: d.maxHzAtCur - d.cur.hz >= 3 ? 'warn' : 'ok' }))
    case 'power': return [{ key: 'power', valueText: s.power.name || '', subText: s.power.onAC === false ? 'battery' : '', status: s.power.kind === 'saver' ? 'warn' : 'ok' }]
    case 'gpu': return [{ key: 'driver', valueText: (s.gpuDrivers[0] || {}).ver || '', subText: (s.gpuDrivers[0] || {}).date || '', status: 'ok' }]
    case 'storage': return [{ key: 'storage', valueText: `${s.storage.freeGB != null ? s.storage.freeGB : '?'} GB free`, subText: s.storage.ssd === true ? 'SSD' : s.storage.ssd === false ? 'HDD' : '', status: s.storage.pctFree != null && s.storage.pctFree < 10 ? 'bad' : 'ok' }]
    case 'windows': return [{ key: 'windows', valueText: s.os.build ? `Build ${s.os.build}.${s.os.ubr || 0}` : '', subText: s.os.edition || '', status: 'ok' }]
    case 'startup': return [{ key: 'startup', valueText: String(s.startup.enabledCount), subText: String(s.startup.candidates.length), status: s.startup.candidates.length ? 'warn' : 'ok' }]
    case 'security': return [{ key: 'security', valueText: s.security.thirdPartyAv[0] || (s.security.defenderRtp ? 'Microsoft Defender' : ''), subText: '', status: s.security.defenderRtp === false && !s.security.thirdPartyAv.length ? 'bad' : 'ok' }]
    case 'net': return [{ key: 'net', valueText: s.net.primary === 'ethernet' ? 'Ethernet' : s.net.primary === 'wifi' ? 'Wi-Fi' : '', subText: s.net.speed || '', status: s.net.primary === 'none' ? 'unknown' : 'ok' }]
    default: return []
  }
}

/** id, script, parser, timeout (ms), needs admin to be complete. `inventory.SCRIPT` is the hardware pass the 3D rig uses. */
const PROBES = [
  { id: 'hw', script: inventory.SCRIPT, parse: parseHw, timeoutMs: 12000 },
  { id: 'display', script: display.listScript(), parse: parseDisplay, timeoutMs: 12000 },
  { id: 'power', script: POWER, parse: parsePower, timeoutMs: 6000 },
  { id: 'gpu', script: GPU, parse: parseGpu, timeoutMs: 8000 },
  { id: 'storage', script: STORAGE, parse: parseStorage, timeoutMs: 15000 },
  { id: 'windows', script: WINDOWS, parse: parseWindows, timeoutMs: 8000 },
  { id: 'startup', script: STARTUP, parse: parseStartup, timeoutMs: 12000 },
  { id: 'security', script: SECURITY, parse: parseSecurity, timeoutMs: 10000, admin: true },
  { id: 'net', script: NET, parse: parseNet, timeoutMs: 8000 },
]

module.exports = { PROBES, chipsFor, schemeKind, GUID, OVERLAY, parseHw, parseDisplay, parsePower, parseGpu, parseStorage, parseWindows, parseStartup, parseSecurity, parseNet }

// Second probe set (real CPU layout, VBS state, GPU memory and interrupt mode, system-disk bus, NIC properties).
PROBES.push(...require("./probes2").PROBES2)
