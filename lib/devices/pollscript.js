'use strict'
// Devices tab: the Raw Input helper behind the polling-rate test. It only LISTENS (a message-only window that registers for mouse Raw Input, sink mode),
// counts the movement reports of every physical mouse per 100 ms and prints one JJPOLL: line. It never writes to a device and never sends input.
// Input injected by software has no device handle and is counted separately, so a script moving the cursor can never pose as a mouse.
const polling = require('./polling')

function buildScript(seconds) {
  const s = Math.max(2, Math.min(10, Math.round(Number(seconds) || 4)))
  return String.raw`$ErrorActionPreference = 'Stop'
try {
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
public static class JJPoll {
  delegate IntPtr WndProcD(IntPtr h, uint m, IntPtr w, IntPtr l);
  static WndProcD proc = WndProc;
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct WNDCLASS { public uint style; public WndProcD lpfnWndProc; public int cbClsExtra; public int cbWndExtra; public IntPtr hInstance; public IntPtr hIcon; public IntPtr hCursor; public IntPtr hbrBackground; public string lpszMenuName; public string lpszClassName; }
  [StructLayout(LayoutKind.Sequential)] struct RAWINPUTDEVICE { public ushort usUsagePage; public ushort usUsage; public uint dwFlags; public IntPtr hwndTarget; }
  [StructLayout(LayoutKind.Sequential)] struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public int x; public int y; }
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern ushort RegisterClassW(ref WNDCLASS c);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr CreateWindowExW(uint ex, string cls, string name, uint style, int x, int y, int w, int h, IntPtr parent, IntPtr menu, IntPtr inst, IntPtr p);
  [DllImport("user32.dll")] static extern IntPtr DefWindowProcW(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern bool RegisterRawInputDevices(RAWINPUTDEVICE[] d, uint n, uint size);
  [DllImport("user32.dll")] static extern uint GetRawInputData(IntPtr h, uint cmd, IntPtr data, ref uint size, uint hdr);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern uint GetRawInputDeviceInfoW(IntPtr dev, uint cmd, StringBuilder data, ref uint size);
  [DllImport("user32.dll")] static extern bool PeekMessage(out MSG m, IntPtr h, uint a, uint b, uint remove);
  [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref MSG m);
  [DllImport("user32.dll")] static extern uint MsgWaitForMultipleObjectsEx(uint n, IntPtr[] h, uint ms, uint mask, uint flags);
  [DllImport("user32.dll")] static extern bool DestroyWindow(IntPtr h);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern IntPtr GetModuleHandleW(string n);
  static Dictionary<long, List<int>> bins = new Dictionary<long, List<int>>();
  static Dictionary<long, int> totals = new Dictionary<long, int>();
  static Stopwatch sw = new Stopwatch();
  static int synthetic = 0;
  static IntPtr WndProc(IntPtr h, uint m, IntPtr w, IntPtr l) {
    if (m == 0x00FF) {
      uint size = 0;
      uint hdr = (uint)(IntPtr.Size == 8 ? 24 : 16);
      GetRawInputData(l, 0x10000003, IntPtr.Zero, ref size, hdr);
      if (size > 0 && size < 4096) {
        IntPtr buf = Marshal.AllocHGlobal((int)size);
        try {
          if (GetRawInputData(l, 0x10000003, buf, ref size, hdr) == size && Marshal.ReadInt32(buf, 0) == 0) {
            long dev = Marshal.ReadIntPtr(buf, 8).ToInt64();
            int dx = Marshal.ReadInt32(buf, (int)hdr + 12), dy = Marshal.ReadInt32(buf, (int)hdr + 16);
            if (dx != 0 || dy != 0) {
              if (dev == 0) synthetic++;
              else {
                int bi = (int)(sw.ElapsedMilliseconds / 100);
                List<int> b; if (!bins.TryGetValue(dev, out b)) { b = new List<int>(); bins[dev] = b; totals[dev] = 0; }
                while (b.Count <= bi) b.Add(0);
                b[bi]++; totals[dev]++;
              }
            }
          }
        } finally { Marshal.FreeHGlobal(buf); }
      }
    }
    return DefWindowProcW(h, m, w, l);
  }
  static string Esc(string s) { return s.Replace("\\", "\\\\").Replace("\"", "\\\""); }
  public static string Run(int seconds) {
    var wc = new WNDCLASS(); wc.lpfnWndProc = proc; wc.hInstance = GetModuleHandleW(null); wc.lpszClassName = "JJPollWnd" + Guid.NewGuid().ToString("N");
    if (RegisterClassW(ref wc) == 0) return "{\"ok\":false,\"error\":\"class\"}";
    IntPtr hwnd = CreateWindowExW(0, wc.lpszClassName, "", 0, 0, 0, 0, 0, new IntPtr(-3), IntPtr.Zero, wc.hInstance, IntPtr.Zero);
    if (hwnd == IntPtr.Zero) return "{\"ok\":false,\"error\":\"window\"}";
    var rid = new RAWINPUTDEVICE[] { new RAWINPUTDEVICE { usUsagePage = 1, usUsage = 2, dwFlags = 0x100, hwndTarget = hwnd } };
    if (!RegisterRawInputDevices(rid, 1, (uint)Marshal.SizeOf(typeof(RAWINPUTDEVICE)))) return "{\"ok\":false,\"error\":\"register\"}";
    sw.Start();
    MSG msg;
    while (sw.ElapsedMilliseconds < seconds * 1000) {
      MsgWaitForMultipleObjectsEx(0, null, 20, 0x0400, 0x4);
      while (PeekMessage(out msg, IntPtr.Zero, 0, 0, 1)) DispatchMessage(ref msg);
    }
    DestroyWindow(hwnd);
    var sb = new StringBuilder("{\"ok\":true,\"seconds\":" + seconds + ",\"synthetic\":" + synthetic + ",\"devices\":[");
    bool first = true;
    foreach (var kv in bins) {
      uint n = 520; var name = new StringBuilder((int)n);
      if (GetRawInputDeviceInfoW(new IntPtr(kv.Key), 0x20000007, name, ref n) == 0xFFFFFFFF) continue;
      if (!first) sb.Append(","); first = false;
      sb.Append("{\"path\":\"" + Esc(name.ToString()) + "\",\"n\":" + totals[kv.Key] + ",\"w\":[" + string.Join(",", kv.Value.ConvertAll(x => x.ToString()).ToArray()) + "]}");
    }
    return sb.Append("]}").ToString();
  }
}
'@
'${polling.MARK}' + [JJPoll]::Run(${s})
} catch { '${polling.MARK}' + (ConvertTo-Json -Compress @{ ok = $false; error = [string]$_.Exception.Message }) }
`
}

module.exports = { buildScript }
