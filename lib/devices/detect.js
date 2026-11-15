'use strict'
// Devices tab: the ONE read-only PowerShell probe and its parser. It only reads (no device is written to).
//   pnp        every present device of the classes in sources.js with the name the device itself reports on the bus, its container (= one physical thing),
//              its parent, location, driver version and problem code. ONE batched property read, not one call per device.
//   hid        for every HID interface: manufacturer string, product string and top-level usage page/usage, read with HidD_* using access 0
//              (works without admin and does not disturb the device)
//   monitors   WmiMonitorID (EDID: maker, model, year, serial length) + the physical size
//   bluetooth  paired Bluetooth devices and the battery Windows keeps for them, when the device publishes one
// A section that cannot be read says so ({ok:false, err}); a value that cannot be read is null. Nothing is invented.
const sources = require('./sources')

const MARK = 'JJDEV:'
const psq = s => "'" + String(s).replace(/'/g, "''") + "'"
const toArr = v => (Array.isArray(v) ? v : v == null ? [] : [v])
const str = v => (v == null ? '' : String(v))

function buildScript() {
  const cfg = { classes: sources.PNP_CLASSES, props: sources.PROPS }
  return String.raw`$ErrorActionPreference = 'SilentlyContinue'
$cfg = ConvertFrom-Json ${psq(JSON.stringify(cfg))}
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$sec = @{}
function Run($id, [scriptblock]$b) {
  $t = [Diagnostics.Stopwatch]::StartNew()
  try { $r = & $b; $sec[$id] = @{ ok = $true; ms = [int]$t.ElapsedMilliseconds }; return @($r) }
  catch { $sec[$id] = @{ ok = $false; ms = [int]$t.ElapsedMilliseconds; err = [string]$_.Exception.Message }; return @() }
}
function Prop($map, $id, $k) { if ($map.ContainsKey($id) -and $map[$id].ContainsKey($k)) { return $map[$id][$k] } else { return $null } }
$pnp = Run 'pnp' {
  $devs = @(Get-PnpDevice -PresentOnly -Class $cfg.classes -ErrorAction Stop)
  $map = @{}
  if ($devs.Count) {
    foreach ($x in @(Get-PnpDeviceProperty -InstanceId @($devs.InstanceId) -KeyName $cfg.props -ErrorAction SilentlyContinue)) {
      if (-not $map.ContainsKey($x.InstanceId)) { $map[$x.InstanceId] = @{} }
      $map[$x.InstanceId][$x.KeyName] = $x.Data
    }
  }
  foreach ($d in $devs) {
    $i = $d.InstanceId
    @{ id = $i; cls = [string]$d.Class; name = [string]$d.FriendlyName; mfr = [string]$d.Manufacturer; status = [string]$d.Status
       bus = [string](Prop $map $i 'DEVPKEY_Device_BusReportedDeviceDesc'); container = [string](Prop $map $i 'DEVPKEY_Device_ContainerId')
       loc = [string](Prop $map $i 'DEVPKEY_Device_LocationInfo'); parent = [string](Prop $map $i 'DEVPKEY_Device_Parent')
       driver = [string](Prop $map $i 'DEVPKEY_Device_DriverVersion'); problem = [int](Prop $map $i 'DEVPKEY_Device_ProblemCode') }
  }
}
$hid = Run 'hid' {
  if (-not ('JJHid' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;
public static class JJHid {
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern SafeFileHandle CreateFile(string n, uint a, uint s, IntPtr sa, uint c, uint f, IntPtr t);
  [DllImport("hid.dll", SetLastError=true)] static extern bool HidD_GetManufacturerString(SafeFileHandle h, byte[] b, int l);
  [DllImport("hid.dll", SetLastError=true)] static extern bool HidD_GetProductString(SafeFileHandle h, byte[] b, int l);
  [DllImport("hid.dll", SetLastError=true)] static extern bool HidD_GetPreparsedData(SafeFileHandle h, out IntPtr p);
  [DllImport("hid.dll")] static extern bool HidD_FreePreparsedData(IntPtr p);
  [DllImport("hid.dll")] static extern int HidP_GetCaps(IntPtr p, byte[] caps);
  static string Str(byte[] b) { var s = Encoding.Unicode.GetString(b); int i = s.IndexOf((char)0); return i >= 0 ? s.Substring(0, i) : s; }
  public static string[] Probe(string path) {
    using (var h = CreateFile(path, 0, 3, IntPtr.Zero, 3, 0, IntPtr.Zero)) {
      if (h.IsInvalid) return new string[] { "err", Marshal.GetLastWin32Error().ToString() };
      var m = new byte[256]; var p = new byte[256];
      string ms = HidD_GetManufacturerString(h, m, 256) ? Str(m) : "";
      string ps = HidD_GetProductString(h, p, 256) ? Str(p) : "";
      IntPtr pp; string page = "", usage = "";
      if (HidD_GetPreparsedData(h, out pp)) { var c = new byte[64]; HidP_GetCaps(pp, c); usage = BitConverter.ToUInt16(c, 0).ToString("X"); page = BitConverter.ToUInt16(c, 2).ToString("X"); HidD_FreePreparsedData(pp); }
      return new string[] { "ok", ms, ps, page, usage };
    }
  }
}
'@
  }
  foreach ($d in $pnp) {
    if ($d.id -notlike 'HID\*') { continue }
    $path = '\\?\' + ($d.id -replace '\\', '#') + '#{4d1e55b2-f16f-11cf-88cb-001111000030}'
    $r = [JJHid]::Probe($path)
    if ($r[0] -eq 'ok') { @{ id = $d.id; mfr = $r[1]; prod = $r[2]; page = $r[3]; usage = $r[4] } } else { @{ id = $d.id; err = [string]$r[1] } }
  }
}
$monitors = Run 'monitors' {
  $size = @{}
  foreach ($b in @(Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorBasicDisplayParams -ErrorAction SilentlyContinue)) { $size[$b.InstanceName] = @{ w = [int]$b.MaxHorizontalImageSize; h = [int]$b.MaxVerticalImageSize } }
  function Dec($a) { if ($a) { [string]::new([char[]]@($a | Where-Object { $_ -ne 0 })) } else { '' } }
  foreach ($m in @(Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorID -ErrorAction Stop)) {
    $s = Dec $m.SerialNumberID
    @{ id = [string]$m.InstanceName; mfr = (Dec $m.ManufacturerName); model = (Dec $m.UserFriendlyName); code = (Dec $m.ProductCodeID); year = [int]$m.YearOfManufacture
       serialLen = $s.Length; w = [int]$size[$m.InstanceName].w; h = [int]$size[$m.InstanceName].h }
  }
}
$bt = Run 'bluetooth' {
  $key = '{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2'
  foreach ($d in @(Get-PnpDevice -PresentOnly -ErrorAction Stop | Where-Object { $_.InstanceId -match '^BTH(ENUM|LE)\\DEV_' })) {
    $b = Get-PnpDeviceProperty -InstanceId $d.InstanceId -KeyName $key -ErrorAction SilentlyContinue
    @{ id = $d.InstanceId; name = [string]$d.FriendlyName; cls = [string]$d.Class; status = [string]$d.Status; battery = $(if ($b -and $b.Data -ne $null) { [int]$b.Data } else { $null }) }
  }
}
'${MARK}' + (ConvertTo-Json -Compress -Depth 5 @{ admin = [bool]$admin; sec = $sec; pnp = @($pnp); hid = @($hid); monitors = @($monitors); bt = @($bt) })
`
}

const num = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const hex = v => { const s = str(v).trim().toUpperCase(); return /^[0-9A-F]{1,4}$/.test(s) ? s.padStart(4, '0') : '' }
const guid = v => { const s = str(v).trim().toUpperCase().replace(/[{}]/g, ''); return /^[0-9A-F-]{36}$/.test(s) ? s : '' }

/** Raw probe output -> plain objects, or null when the marker line is missing / unreadable JSON. */
function parse(out) {
  const line = String(out || '').split(/\r?\n/).reverse().find(l => l.startsWith(MARK))
  if (!line) return null
  let j; try { j = JSON.parse(line.slice(MARK.length)) } catch { return null }
  if (!j || typeof j !== 'object') return null
  const sec = {}
  for (const id of sources.SECTIONS) {
    const s = (j.sec && j.sec[id]) || null
    sec[id] = s ? { ok: s.ok === true, ms: num(s.ms), err: s.err ? str(s.err).slice(0, 200) : '' } : { ok: false, ms: null, err: 'not_run' }
  }
  const pnp = toArr(j.pnp).filter(d => d && d.id).map(d => ({
    id: str(d.id), cls: str(d.cls), name: str(d.name), mfr: str(d.mfr), status: str(d.status), bus: str(d.bus),
    container: guid(d.container), loc: str(d.loc), parent: str(d.parent), driver: str(d.driver), problem: num(d.problem) || 0,
  }))
  const hid = toArr(j.hid).filter(h => h && h.id).map(h => (h.err != null && h.page == null
    ? { id: str(h.id), err: str(h.err) }
    : { id: str(h.id), mfr: str(h.mfr), prod: str(h.prod), page: hex(h.page), usage: hex(h.usage) }))
  const monitors = toArr(j.monitors).filter(m => m && m.id).map(m => ({
    id: str(m.id), mfr: str(m.mfr), model: str(m.model), code: str(m.code), year: num(m.year) || null,
    hasSerial: (num(m.serialLen) || 0) > 0, wCm: num(m.w) || null, hCm: num(m.h) || null,
  }))
  const bt = toArr(j.bt).filter(b => b && b.id).map(b => ({ id: str(b.id), name: str(b.name), cls: str(b.cls), status: str(b.status), battery: num(b.battery) }))
  return { admin: j.admin === true, sec, pnp, hid, monitors, bt }
}

module.exports = { MARK, buildScript, parse }
