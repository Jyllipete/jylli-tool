'use strict'
// Display modes: enumerate each attached monitor's current and supported (non-interlaced) modes, pick the best refresh rate at
// the current resolution, and build the PowerShell that applies one. Applying is two-phase (dynamic first, persisted only after
// the user keeps it), so a black screen reverts by itself; the timer for that lives in main, not the renderer.

const CSHARP = `
using System; using System.Text; using System.Runtime.InteropServices;
public class JD {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)] public struct DEVMODE {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string dmDeviceName;
    public short dmSpecVersion; public short dmDriverVersion; public short dmSize; public short dmDriverExtra; public int dmFields;
    public int dmPositionX; public int dmPositionY; public int dmDisplayOrientation; public int dmDisplayFixedOutput;
    public short dmColor; public short dmDuplex; public short dmYResolution; public short dmTTOption; public short dmCollate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string dmFormName;
    public short dmLogPixels; public int dmBitsPerPel; public int dmPelsWidth; public int dmPelsHeight; public int dmDisplayFlags; public int dmDisplayFrequency;
    public int dmICMMethod; public int dmICMIntent; public int dmMediaType; public int dmDitherType; public int dmReserved1; public int dmReserved2; public int dmPanningWidth; public int dmPanningHeight;
  }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)] public struct DISPLAY_DEVICE {
    public int cb; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string DeviceName; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceString;
    public int StateFlags; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceID; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceKey;
  }
  [DllImport("user32.dll", CharSet=CharSet.Ansi)] public static extern bool EnumDisplayDevices(string dev, uint n, ref DISPLAY_DEVICE d, uint flags);
  [DllImport("user32.dll", CharSet=CharSet.Ansi)] public static extern bool EnumDisplaySettingsEx(string dev, int mode, ref DEVMODE m, uint flags);
  [DllImport("user32.dll", CharSet=CharSet.Ansi)] public static extern int ChangeDisplaySettingsEx(string dev, ref DEVMODE m, IntPtr hwnd, uint flags, IntPtr lp);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
  public static DEVMODE Cur(string dev) { DEVMODE m = new DEVMODE(); m.dmSize = (short)Marshal.SizeOf(typeof(DEVMODE)); EnumDisplaySettingsEx(dev, -1, ref m, 0); return m; }
  public static string List() {
    StringBuilder sb = new StringBuilder();
    sb.AppendLine("REMOTE=" + GetSystemMetrics(0x1000));
    for (uint i = 0; i < 16; i++) {
      DISPLAY_DEVICE d = new DISPLAY_DEVICE(); d.cb = Marshal.SizeOf(typeof(DISPLAY_DEVICE));
      if (!EnumDisplayDevices(null, i, ref d, 0)) break;
      if ((d.StateFlags & 1) == 0) continue;
      string mon = ""; DISPLAY_DEVICE c = new DISPLAY_DEVICE(); c.cb = Marshal.SizeOf(typeof(DISPLAY_DEVICE));
      if (EnumDisplayDevices(d.DeviceName, 0, ref c, 0)) mon = c.DeviceString;
      DEVMODE cur = Cur(d.DeviceName);
      StringBuilder modes = new StringBuilder(); System.Collections.Generic.HashSet<string> seen = new System.Collections.Generic.HashSet<string>();
      for (int k = 0; k < 4000; k++) {
        DEVMODE m = new DEVMODE(); m.dmSize = (short)Marshal.SizeOf(typeof(DEVMODE));
        if (!EnumDisplaySettingsEx(d.DeviceName, k, ref m, 0)) break;
        if ((m.dmDisplayFlags & 2) != 0) continue;
        string key = m.dmPelsWidth + "x" + m.dmPelsHeight + "@" + m.dmDisplayFrequency;
        if (seen.Add(key)) { if (modes.Length > 0) modes.Append(","); modes.Append(key); }
      }
      sb.AppendLine("DISP=" + d.DeviceName + "|" + mon + "|" + ((d.StateFlags & 4) != 0 ? 1 : 0) + "|" + cur.dmPelsWidth + "|" + cur.dmPelsHeight + "|" + cur.dmDisplayFrequency + "|" + cur.dmBitsPerPel + "|" + modes.ToString());
    }
    return sb.ToString();
  }
  // flags: 2 = CDS_TEST, 0 = dynamic, 1 = CDS_UPDATEREGISTRY (persist). Only width, height and frequency change.
  public static int Set(string dev, int w, int h, int hz, uint flags) {
    DEVMODE m = Cur(dev); m.dmPelsWidth = w; m.dmPelsHeight = h; m.dmDisplayFrequency = hz;
    m.dmFields = 0x80000 | 0x100000 | 0x400000;
    return ChangeDisplaySettingsEx(dev, ref m, IntPtr.Zero, flags, IntPtr.Zero);
  }
}
`

const LOAD = `Add-Type -TypeDefinition @'${CSHARP}'@ -ErrorAction Stop`

const EDID = String.raw`
$ed = @()
Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Enum\DISPLAY' -ErrorAction SilentlyContinue | ForEach-Object { Get-ChildItem $_.PSPath -ErrorAction SilentlyContinue } | ForEach-Object {
  $b = (Get-ItemProperty (Join-Path $_.PSPath 'Device Parameters') -ErrorAction SilentlyContinue).EDID
  if ($b -and $b.Length -ge 128) { foreach ($o in 54,72,90,108) { if ($b[$o] -eq 0 -and $b[$o+1] -eq 0 -and $b[$o+2] -eq 0 -and $b[$o+3] -eq 0xFD) { $ed += [int]$b[$o+6] + $(if (($b[$o+4] -band 0x02) -ne 0) { 255 } else { 0 }) } } }
}
Write-Output ('EDIDMAX=' + (($ed | Sort-Object -Descending | Select-Object -First 4) -join ','))
`

/** Script for the display probe: prints REMOTE=, DISP= lines and EDIDMAX=. */
function listScript() { return `${LOAD}\n[Console]::Out.Write([JD]::List())\n${EDID}` }

const DEVICE_RE = /^\\\\\.\\DISPLAY\d{1,2}$/
const intIn = (n, a, b) => Number.isInteger(n) && n >= a && n <= b

/** Parses the display probe output. */
function parseList(out) {
  const displays = []
  let remote = false, edid = []
  for (const raw of String(out || '').split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith('REMOTE=')) remote = Number(line.slice(7)) !== 0
    else if (line.startsWith('EDIDMAX=')) edid = line.slice(8).split(',').map(Number).filter(n => n >= 30 && n <= 1000)
    else if (line.startsWith('DISP=')) {
      const p = line.slice(5).split('|')
      if (p.length < 8 || !DEVICE_RE.test(p[0])) continue
      const [w, h, hz, bpp] = [3, 4, 5, 6].map(i => Number(p[i]))
      const modes = (p[7] || '').split(',').map(s => /^(\d+)x(\d+)@(\d+)$/.exec(s)).filter(Boolean).map(m => ({ w: +m[1], h: +m[2], hz: +m[3] }))
      displays.push({ device: p[0], monitor: p[1] || '', primary: p[2] === '1', cur: { w, h, hz, bpp }, modes })
    }
  }
  for (const d of displays) {
    d.maxHzAtCur = Math.max(0, ...d.modes.filter(m => m.w === d.cur.w && m.h === d.cur.h).map(m => m.hz))
    d.edidMaxHz = displays.length === 1 && edid.length === 1 ? edid[0] : null
  }
  return { displays, remote }
}

/** Best mode at the current resolution, or null when the gain is under 3 Hz (59.94 vs 60 is not a fix). */
function pickMode(display) {
  if (!display || !display.cur) return null
  const best = Math.max(0, ...(display.modes || []).filter(m => m.w === display.cur.w && m.h === display.cur.h).map(m => m.hz))
  return best - display.cur.hz >= 3 ? { w: display.cur.w, h: display.cur.h, hz: best } : null
}

/** PowerShell that tests or applies a mode. phase: 'test' | 'dynamic' | 'persist'. Throws on a device name outside \\.\DISPLAYn. */
function setScript(device, mode, phase) {
  if (!DEVICE_RE.test(String(device))) throw new Error('bad display device')
  if (!mode || !intIn(mode.w, 320, 16384) || !intIn(mode.h, 200, 16384) || !intIn(mode.hz, 24, 1000)) throw new Error('bad display mode')
  const flags = { test: 2, dynamic: 0, persist: 1 }[phase]
  if (flags == null) throw new Error('bad phase')
  return `${LOAD}\n$r = [JD]::Set('${device}', ${mode.w}, ${mode.h}, ${mode.hz}, ${flags})\nWrite-Output ('JDRESULT=' + $r)`
}

/** DISP_CHANGE_SUCCESSFUL is 0 (and 1 = restart needed, which a refresh-rate change never wants). */
const setOk = out => /JDRESULT=0\b/.test(String(out || ''))

module.exports = { CSHARP, listScript, parseList, pickMode, setScript, setOk, DEVICE_RE }
