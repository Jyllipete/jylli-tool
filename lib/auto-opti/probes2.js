'use strict'
// Second set of detection probes: the facts the first set did not read (real CPU layout, VBS state, GPU memory and interrupt mode,
// system-disk bus, network driver properties). Same contract as probes.js: one PowerShell script + one pure parser each, a probe that
// fails leaves its slice undefined, and nothing here guesses.

const j = text => { try { return JSON.parse(String(text || '').trim().split(/\r?\n/).filter(l => l.trim().startsWith('{')).pop()) } catch { return null } }
const arr = x => (x == null ? [] : Array.isArray(x) ? x : [x])
const num = x => { const n = Number(x); return Number.isFinite(n) ? n : null }
const bool = x => (x == null ? null : x === true || x === 1 || x === '1' || /^true$/i.test(String(x)))

// ── cpu2: hybrid layout, CCD count, timer resolution, microcode ──────────────────────────────────────────────
const CPU2 = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices; using System.Collections.Generic; using System.Text;
public static class JtCpu {
  [DllImport("kernel32.dll")] static extern bool GetSystemCpuSetInformation(IntPtr info, uint len, out uint ret, IntPtr proc, uint flags);
  [DllImport("ntdll.dll")] static extern int NtQueryTimerResolution(out uint min, out uint max, out uint cur);
  public static string Layout() {
    uint len; GetSystemCpuSetInformation(IntPtr.Zero, 0, out len, IntPtr.Zero, 0);
    if (len == 0) return "{}";
    IntPtr buf = Marshal.AllocHGlobal((int)len);
    var logical = new Dictionary<int,int>(); var cores = new Dictionary<int, HashSet<int>>(); var llc = new HashSet<int>();
    if (GetSystemCpuSetInformation(buf, len, out len, IntPtr.Zero, 0)) {
      int off = 0;
      while (off < len) {
        int size = Marshal.ReadInt32(buf, off); int type = Marshal.ReadInt32(buf, off + 4);
        if (size <= 0) break;
        if (type == 0) {
          int core = Marshal.ReadByte(buf, off + 15); int cache = Marshal.ReadByte(buf, off + 16); int ec = Marshal.ReadByte(buf, off + 18);
          if (!logical.ContainsKey(ec)) { logical[ec] = 0; cores[ec] = new HashSet<int>(); }
          logical[ec]++; cores[ec].Add(core); llc.Add(cache);
        }
        off += size;
      }
    }
    Marshal.FreeHGlobal(buf);
    var sb = new StringBuilder("{\"classes\":{");
    bool first = true;
    foreach (var k in logical.Keys) { if (!first) sb.Append(","); first = false; sb.Append("\"" + k + "\":{\"logical\":" + logical[k] + ",\"cores\":" + cores[k].Count + "}"); }
    sb.Append("},\"llc\":" + llc.Count + "}");
    return sb.ToString();
  }
  public static string Timer() { uint a, b, c; if (NtQueryTimerResolution(out a, out b, out c) != 0) return "{}"; return "{\"min\":" + a + ",\"max\":" + b + ",\"cur\":" + c + "}"; }
}
"@
$layout = [JtCpu]::Layout() | ConvertFrom-Json
$timer = [JtCpu]::Timer() | ConvertFrom-Json
$cp = Get-ItemProperty 'HKLM:\HARDWARE\DESCRIPTION\System\CentralProcessor\0'
$mc = $cp.'Update Revision'
$p = Get-CimInstance Win32_Processor | Select-Object -First 1
@{ layout = $layout; timer = $timer; microcode = $(if ($mc) { @($mc | ForEach-Object { [int]$_ }) } else { $null }); l3KB = $p.L3CacheSize; family = $p.Caption } | ConvertTo-Json -Depth 6 -Compress
`

function parseCpu2(out) {
  const o = j(out)
  if (!o) return null
  const classes = o.layout && o.layout.classes ? Object.entries(o.layout.classes).map(([k, v]) => ({ cls: Number(k), logical: num(v.logical), cores: num(v.cores) })).sort((a, b) => a.cls - b.cls) : []
  let hybrid = null, pCores = null, eCores = null
  if (classes.length) {
    hybrid = classes.length > 1
    if (hybrid) { pCores = classes[classes.length - 1].cores; eCores = classes.slice(0, -1).reduce((a, c) => a + c.cores, 0) }
    else pCores = classes[0].cores
  }
  // Intel keeps the loaded microcode revision in the upper dword of the 8-byte "Update Revision" value (little-endian).
  const mc = arr(o.microcode)
  const dword = at => ((mc[at] | (mc[at + 1] << 8) | (mc[at + 2] << 16) | (mc[at + 3] << 24)) >>> 0)
  // Some machines report only the 4-byte revision, others the full 8 bytes (revision in the upper dword).
  const microcode = mc.length >= 8 ? dword(4) : mc.length === 4 ? dword(0) : null
  const t = o.timer || {}
  return { cpuX: {
    hybrid, pCores, eCores, llcGroups: o.layout && o.layout.llc != null ? num(o.layout.llc) : null, l3MB: num(o.l3KB) != null ? Math.round(num(o.l3KB) / 1024) : null,
    microcode, family: o.family || null,
    timer: t.cur ? { curMs: Math.round(t.cur / 100) / 1000, minMs: Math.round(t.min / 100) / 1000, maxMs: Math.round(t.max / 100) / 1000 } : null,
  } }
}

// ── sys2: Windows release, VBS/HVCI running state, hypervisor, chassis, BIOS, vendor services ──────────────────
const SYS2 = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$cv = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
$cs = Get-CimInstance Win32_ComputerSystem
$bios = Get-CimInstance Win32_BIOS | Select-Object -First 1
$dg = Get-CimInstance -Namespace 'root\Microsoft\Windows\DeviceGuard' -ClassName Win32_DeviceGuard
$svc = @{ hyperV = [bool](Get-Service vmms); wsl = [bool](Get-Service LxssManager); vmp = [bool](Get-Service vmcompute); docker = [bool](Get-Service com.docker.service) }
@{ displayVersion = $cv.DisplayVersion; build = [int]$cv.CurrentBuildNumber; edition = $cv.EditionID
   pcSystemType = [int]$cs.PCSystemType; hypervisorPresent = [bool]$cs.HypervisorPresent; model = $cs.Model; manufacturer = $cs.Manufacturer
   vbsStatus = $dg.VirtualizationBasedSecurityStatus; svcRunning = @($dg.SecurityServicesRunning); svcConfigured = @($dg.SecurityServicesConfigured)
   biosDate = $(if ($bios.ReleaseDate) { $bios.ReleaseDate.ToString('yyyy-MM-dd') } else { $null }); biosVersion = $bios.SMBIOSBIOSVersion
   domain = [bool]$cs.PartOfDomain
   fth = (Get-Item 'HKLM:\SOFTWARE\Microsoft\FTH\State').ValueCount
   ac = @(@('vgk','vgc','FACEIT','EasyAntiCheat','EasyAntiCheat_EOS','BEService','ESEADriver2') | Where-Object { Test-Path ('HKLM:\SYSTEM\CurrentControlSet\Services\' + $_) })
   amd3d = [bool](Get-Service amd3dvcacheSvc); amdPmf = [bool](Get-Service AMDRyzenMasterDriverV30)
   dtt = (Test-Path 'HKLM:\SYSTEM\CurrentControlSet\Services\esif_lf')
   secureBoot = $(try { Confirm-SecureBootUEFI } catch { $null }); services = $svc } | ConvertTo-Json -Depth 5 -Compress
`

function parseSys2(out) {
  const o = j(out)
  if (!o) return null
  const build = num(o.build)
  const svc = arr(o.svcRunning).map(Number)
  const vbsStatus = o.vbsStatus == null ? null : Number(o.vbsStatus)
  // Win32_DeviceGuard is absent on Home editions and in some VMs; absent means unknown, not off.
  const vbsKnown = vbsStatus != null
  return { sys: {
    displayVersion: o.displayVersion || null, build, edition: o.edition || null,
    win10Eol: build != null ? build < 22000 : null,
    pcSystemType: num(o.pcSystemType), model: o.model || null, manufacturer: o.manufacturer || null,
    hypervisorPresent: bool(o.hypervisorPresent),
    vbsRunning: vbsKnown ? vbsStatus === 2 : null,
    hvciRunning: vbsKnown ? svc.includes(2) : null,
    credentialGuardRunning: vbsKnown ? svc.includes(1) : null,
    services: { hyperV: bool(o.services && o.services.hyperV), wsl: bool(o.services && o.services.wsl), vmp: bool(o.services && o.services.vmp), docker: bool(o.services && o.services.docker) },
    biosDate: o.biosDate || null, biosVersion: o.biosVersion || null,
    amd3dSvc: bool(o.amd3d), intelDtt: bool(o.dtt), secureBoot: bool(o.secureBoot),
    // Domain-joined PCs belong to an organisation's policy; kernel anti-cheat services are the games most sensitive to protection changes.
    partOfDomain: bool(o.domain), fthCount: o.fth == null ? 0 : num(o.fth), antiCheat: arr(o.ac).filter(x => typeof x === 'string'),
  } }
}

// ── gpu2: real VRAM, ReBAR (NVIDIA), interrupt mode ───────────────────────────────────────────────────────────
const GPU2 = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$cls = 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}'
$gpus = @(Get-ChildItem $cls | Where-Object { $_.PSChildName -match '^\d{4}$' } | ForEach-Object {
  $p = Get-ItemProperty $_.PSPath
  if (-not $p.DriverDesc) { return }
  $q = $p.'HardwareInformation.qwMemorySize'
  $m = $p.'HardwareInformation.MemorySize'
  $bytes = if ($q) { [uint64]$q } elseif ($m -is [byte[]] -and $m.Length -ge 4) { [uint64][BitConverter]::ToUInt32($m, 0) } elseif ($m) { [uint64]$m } else { $null }
  @{ name = $p.DriverDesc; vramBytes = $bytes; provider = $p.ProviderName }
})
$irq = @(Get-CimInstance Win32_VideoController | Where-Object { $_.PNPDeviceID -like 'PCI*' } | ForEach-Object {
  $id = $_.PNPDeviceID
  $ent = Get-CimInstance Win32_PnPEntity -Filter ("PNPDeviceID='" + ($id -replace '\\','\\') + "'")
  $r = @(Get-CimAssociatedInstance -InputObject $ent -Association Win32_PnPAllocatedResource -ResultClassName Win32_IRQResource | ForEach-Object { [uint32]$_.IRQNumber })
  $msi = (Get-ItemProperty ("HKLM:\SYSTEM\CurrentControlSet\Enum\" + $id + "\Device Parameters\Interrupt Management\MessageSignaledInterruptProperties")).MSISupported
  @{ name = $_.Name; irq = $r; msiSupported = $msi }
})
$smi = $null
$exe = (Get-Command nvidia-smi.exe).Source
if (-not $exe -and (Test-Path "$env:SystemRoot\System32\nvidia-smi.exe")) { $exe = "$env:SystemRoot\System32\nvidia-smi.exe" }
if ($exe) {
  $txt = (& $exe -q -d MEMORY 2>$null) -join [Environment]::NewLine
  $bar = [regex]::Match($txt, 'BAR1 Memory Usage\s+Total\s*:\s*(\d+)\s*MiB')
  $fb = [regex]::Match($txt, 'FB Memory Usage\s+Total\s*:\s*(\d+)\s*MiB')
  $link = (& $exe --query-gpu=pcie.link.gen.current,pcie.link.gen.max,pcie.link.width.current --format=csv,noheader,nounits 2>$null | Select-Object -First 1)
  $smi = @{ bar1MiB = $(if ($bar.Success) { [int]$bar.Groups[1].Value } else { $null }); fbMiB = $(if ($fb.Success) { [int]$fb.Groups[1].Value } else { $null }); link = $link }
}
@{ gpus = $gpus; irq = $irq; smi = $smi } | ConvertTo-Json -Depth 5 -Compress
`

function parseGpu2(out) {
  const o = j(out)
  if (!o) return null
  const smi = o.smi || null
  let rebar = null
  if (smi && smi.bar1MiB != null && smi.fbMiB) rebar = smi.bar1MiB >= smi.fbMiB * 0.9    // BAR1 covering the whole framebuffer = Resizable BAR on
  const link = smi && smi.link ? String(smi.link).split(',').map(s => num(s.trim())) : []
  return { gpuX: {
    vram: arr(o.gpus).filter(g => g && g.name).map(g => ({ name: g.name, bytes: num(g.vramBytes), gb: num(g.vramBytes) ? Math.round(num(g.vramBytes) / 1024 ** 3 * 10) / 10 : null })),
    // Windows lists message-signalled interrupts as IRQ numbers at or above 0x80000000; a small number is a legacy line-based IRQ.
    interrupts: arr(o.irq).filter(g => g && g.name).map(g => {
      const irqs = arr(g.irq).map(Number).filter(Number.isFinite)
      return { name: g.name, mode: irqs.length ? (irqs.some(n => n >= 0x80000000) ? 'msi' : 'line') : null, msiSupported: g.msiSupported == null ? null : Number(g.msiSupported) }
    }),
    rebar, bar1MiB: smi ? num(smi.bar1MiB) : null, pcie: link.length === 3 ? { gen: link[0], genMax: link[1], width: link[2] } : null,
  } }
}

// ── storage2: system-disk bus, drive media per game library ───────────────────────────────────────────────────
const STORAGE2 = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
function Media($letter) {
  $d = Get-Partition -DriveLetter $letter | Get-Disk | Select-Object -First 1
  if (-not $d) { return $null }
  $pd = Get-PhysicalDisk | Where-Object { $_.DeviceId -eq $d.Number } | Select-Object -First 1
  @{ bus = ($d.BusType + ''); media = ($pd.MediaType + ''); name = $d.FriendlyName }
}
$sys = ($env:SystemDrive + '').TrimEnd(':')
$libs = @()
$steam = (Get-ItemProperty 'HKCU:\Software\Valve\Steam').SteamPath
if ($steam) {
  $vdf = Join-Path $steam 'steamapps\libraryfolders.vdf'
  if (Test-Path $vdf) { foreach ($m in [regex]::Matches((Get-Content $vdf -Raw), '"path"\s+"([^"]+)"')) { $libs += ($m.Groups[1].Value -replace '\\\\','\') } }
}
$libInfo = @($libs | ForEach-Object { $l = $_.Substring(0,1); $m = Media $l; @{ path = $_; letter = $l; bus = $m.bus; media = $m.media } })
@{ system = (Media $sys); libraries = $libInfo; drives = @(Get-Volume | Where-Object { $_.DriveLetter -and $_.DriveType -eq 'Fixed' } | ForEach-Object { $m = Media ([string]$_.DriveLetter); @{ letter = [string]$_.DriveLetter; bus = $m.bus; media = $m.media; freeGB = [math]::Round($_.SizeRemaining/1GB,1) } }) } | ConvertTo-Json -Depth 5 -Compress
`

const mediaKind = (bus, media) => {
  if (/nvme/i.test(bus || '') || bus === '17') return 'nvme'
  if (/hdd/i.test(media || '')) return 'hdd'
  if (/ssd/i.test(media || '')) return 'ssd'
  return null
}

function parseStorage2(out) {
  const o = j(out)
  if (!o) return null
  const sys = o.system || null
  return { storageX: {
    systemBus: sys && sys.bus ? (/nvme/i.test(sys.bus) ? 'nvme' : /sata|ata/i.test(sys.bus) ? 'sata' : String(sys.bus).toLowerCase()) : null,
    systemKind: sys ? mediaKind(sys.bus, sys.media) : null,
    libraries: arr(o.libraries).filter(l => l && l.path).map(l => ({ path: l.path, letter: l.letter, kind: mediaKind(l.bus, l.media) })),
    drives: arr(o.drives).map(d => ({ letter: d.letter, kind: mediaKind(d.bus, d.media), freeGB: num(d.freeGB) })),
  } }
}

// ── net2: the primary adapter's driver properties (what a tweak is allowed to touch) ───────────────────────────
const NET2 = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$r = Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object { $_.RouteMetric + $_.InterfaceMetric } | Select-Object -First 1
$ad = if ($r) { Get-NetAdapter -InterfaceIndex $r.ifIndex } else { $null }
$props = @()
if ($ad) {
  $rx = 'Energy|Green|EEE|Interrupt Moderation|Roam|Background Scan|BG Scan|Power Sav|MIMO|U-APSD|Preferred Band|Large Send|Receive Segment|Flow Control|Wake'
  $props = @(Get-NetAdapterAdvancedProperty -Name $ad.Name | Where-Object { $_.DisplayName -match $rx } | ForEach-Object { @{ n = $_.DisplayName; v = $_.DisplayValue; k = $_.RegistryKeyword; valid = @($_.ValidDisplayValues) } })
}
@{ name = $ad.Name; desc = $ad.InterfaceDescription; driver = $ad.DriverInformation; props = $props } | ConvertTo-Json -Depth 5 -Compress
`

function nicVendor(desc) {
  const d = String(desc || '')
  if (/intel/i.test(d)) return 'intel'
  if (/realtek/i.test(d)) return 'realtek'
  if (/killer|qualcomm|atheros/i.test(d)) return 'qualcomm'
  if (/mediatek|ralink/i.test(d)) return 'mediatek'
  if (/broadcom/i.test(d)) return 'broadcom'
  if (/marvell|aquantia/i.test(d)) return 'marvell'
  return d ? 'other' : null
}

function parseNet2(out) {
  const o = j(out)
  if (!o) return null
  if (!o.name) return { netX: { vendor: null, props: [] } }    // no default-route adapter (offline): a real answer, "nothing to tune"
  return { netX: {
    vendor: nicVendor(o.desc),
    props: arr(o.props).filter(p => p && p.n).map(p => ({ name: p.n, value: p.v == null ? null : String(p.v), keyword: p.k || null, valid: arr(p.valid).map(String) })),
  } }
}

const PROBES2 = [
  { id: 'cpu2', script: CPU2, parse: parseCpu2, timeoutMs: 15000 },
  { id: 'sys2', script: SYS2, parse: parseSys2, timeoutMs: 15000 },
  { id: 'gpu2', script: GPU2, parse: parseGpu2, timeoutMs: 15000 },
  { id: 'storage2', script: STORAGE2, parse: parseStorage2, timeoutMs: 15000 },
  { id: 'net2', script: NET2, parse: parseNet2, timeoutMs: 10000 },
]

module.exports = { PROBES2, parseCpu2, parseSys2, parseGpu2, parseStorage2, parseNet2, nicVendor, mediaKind }
