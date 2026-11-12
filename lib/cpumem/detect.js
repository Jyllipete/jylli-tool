'use strict'
// Live state: ONE read-only PowerShell script. It reads what each catalog probe names, plus the facts the page draws (processor topology,
// memory modules, active power plan, VBS state). buildScript() / parse() / evaluate() are pure (unit-tested); index.js runs it through deps.runPS.
// The script only reads (registry, services, powercfg /query, bcdedit /enum, Get-MMAgent, Get-ProcessMitigation, CIM, GetLogicalProcessorInformationEx).
const catalog = require('./catalog')

const MARK = 'JJCM:'
const psq = s => String(s).replace(/'/g, "''")

function plan(ids) {
  const out = {}
  for (const id of ids || catalog.ids()) {
    const it = catalog.byId[id]
    if (it && it.probe && it.probe.length) out[id] = it.probe
  }
  return out
}

function keyOf(c) {
  if (c.r) return 'r|' + c.r + '|' + c.n
  if (c.s) return 's|' + c.s
  if (c.p) return 'p|' + c.p
  return 'x|' + c.x
}
function readReq(c) {
  const k = keyOf(c)
  if (c.r) return { k, a: 'r', p: c.r, n: c.n }
  if (c.s) return { k, a: 's', p: c.s }
  if (c.p) return { k, a: 'p', p: c.p }
  return { k, a: 'x', p: c.x }
}
function requests(p) {
  const seen = new Map()
  for (const list of Object.values(p)) for (const c of list) seen.set(keyOf(c), readReq(c))
  return [...seen.values()]
}

// Processor topology: one Win32 call. Lines: C|efficiencyClass|group|mask  and  L|3|sizeKB|group|mask
const TOPO_CS = `using System; using System.Runtime.InteropServices; using System.Text;
public static class JjTopo {
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetLogicalProcessorInformationEx(int rel, IntPtr buf, ref int len);
  public static string Read() {
    int len = 0; GetLogicalProcessorInformationEx(0xFFFF, IntPtr.Zero, ref len);
    if (len <= 0) return "";
    IntPtr p = Marshal.AllocHGlobal(len);
    try {
      if (!GetLogicalProcessorInformationEx(0xFFFF, p, ref len)) return "";
      StringBuilder sb = new StringBuilder(); int off = 0;
      while (off + 8 <= len) {
        int rel = Marshal.ReadInt32(p, off); int size = Marshal.ReadInt32(p, off + 4);
        if (size <= 0) break;
        if (rel == 0) {
          int eff = Marshal.ReadByte(p, off + 9); int gc = Marshal.ReadInt16(p, off + 30);
          for (int g = 0; g < gc; g++) sb.Append("C|" + eff + "|" + Marshal.ReadInt16(p, off + 40 + g * 16) + "|" + Marshal.ReadInt64(p, off + 32 + g * 16) + "\\n");
        } else if (rel == 2) {
          int level = Marshal.ReadByte(p, off + 8); int kb = Marshal.ReadInt32(p, off + 12) / 1024; int gc = Marshal.ReadInt16(p, off + 38);
          if (level == 3) for (int g = 0; g < gc; g++) sb.Append("L|3|" + kb + "|" + Marshal.ReadInt16(p, off + 48 + g * 16) + "|" + Marshal.ReadInt64(p, off + 40 + g * 16) + "\\n");
        }
        off += size;
      }
      return sb.ToString();
    } finally { Marshal.FreeHGlobal(p); }
  }
}`

function buildScript(p = plan()) {
  const json = psq(JSON.stringify(requests(p)))
  return `$ErrorActionPreference='SilentlyContinue'
$q = '${json}' | ConvertFrom-Json
$o = [ordered]@{}
function PwQ($spec) { $a = $spec -split ' '; $t = (powercfg /qh SCHEME_CURRENT $a[0] $a[1]) -join ' '; if ($t -match 'Current AC Power Setting Index:\\s*0x([0-9a-fA-F]+)') { [string][Convert]::ToInt64($matches[1], 16) } else { $null } }
$scheme = $null; $g = (powercfg /getactivescheme) -join ' '; if ($g -match '([0-9a-fA-F]{8}-[0-9a-fA-F-]{27})') { $scheme = $matches[1].ToLower() }
foreach ($i in $q) {
  $v = $null
  switch ($i.a) {
    'r' { try { $v = [string](Get-ItemPropertyValue -LiteralPath $i.p -Name $i.n -ErrorAction Stop) } catch { $v = $null } }
    's' { $s = Get-Service -Name $i.p -ErrorAction SilentlyContinue; $v = if ($s) { [string]$s.StartType } else { 'MISSING' } }
    'p' { $v = PwQ $i.p }
    'x' {
      if ($i.p -eq 'memcomp') { $m = Get-MMAgent -ErrorAction SilentlyContinue; $v = if ($m) { [string]$m.MemoryCompression } else { $null } }
      elseif ($i.p -eq 'scheme') { $v = $scheme }
      elseif ($i.p -eq 'hvlaunch') { $b = (bcdedit /enum '{current}' 2>$null) -join ' '; if ($b) { if ($b -match 'hypervisorlaunchtype\\s+(\\w+)') { $v = $matches[1].ToLower() } else { $v = 'auto' } } }
      elseif ($i.p -eq 'pagefile') { $c = Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue; $v = if ($c) { [string]$c.AutomaticManagedPagefile } else { $null } }
      elseif ($i.p -eq 'procmit') { $m = Get-ProcessMitigation -System -ErrorAction SilentlyContinue; $v = if ($m -and $m.CFG) { [string]$m.CFG.Enable } else { $null } }
    }
  }
  $o[$i.k] = $v
}
$f = [ordered]@{ scheme = $scheme }
try {
  Add-Type -TypeDefinition @'
${TOPO_CS}
'@ -ErrorAction Stop
  $f.topo = @(([JjTopo]::Read()) -split "\\n" | Where-Object { $_ })
} catch { $f.topo = @() }
$cpu = Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1
if ($cpu) { $f.cpu = [ordered]@{ name = [string]$cpu.Name; baseMHz = [int]$cpu.MaxClockSpeed; cores = [int]$cpu.NumberOfCores; threads = [int]$cpu.NumberOfLogicalProcessors } }
$arr = Get-CimInstance Win32_PhysicalMemoryArray -ErrorAction SilentlyContinue | Select-Object -First 1
$f.slots = if ($arr) { [int]$arr.MemoryDevices } else { 0 }
$f.sticks = @(Get-CimInstance Win32_PhysicalMemory -ErrorAction SilentlyContinue | ForEach-Object { [ordered]@{ slot = [string]$_.DeviceLocator; bank = [string]$_.BankLabel; capGB = [math]::Round($_.Capacity / 1GB); ratedMT = [int]$_.Speed; runMT = [int]$_.ConfiguredClockSpeed; type = [int]$_.SMBIOSMemoryType; part = ([string]$_.PartNumber).Trim() } })
$dg = Get-CimInstance -Namespace root\\Microsoft\\Windows\\DeviceGuard -ClassName Win32_DeviceGuard -ErrorAction SilentlyContinue
if ($dg) { $f.vbs = ($dg.VirtualizationBasedSecurityStatus -eq 2); $f.hvci = (@($dg.SecurityServicesRunning) -contains 2) }
'${MARK}' + ([ordered]@{ r = $o; f = $f } | ConvertTo-Json -Compress -Depth 6)
`
}

/** stdout -> { r: {key: string|null}, f: facts } or null when the script printed nothing usable. */
function parse(out) {
  const line = String(out || '').split(/\r?\n/).reverse().find(l => l.startsWith(MARK))
  if (!line) return null
  try {
    const o = JSON.parse(line.slice(MARK.length))
    if (!o || typeof o !== 'object' || !o.r || typeof o.r !== 'object') return null
    const f = o.f && typeof o.f === 'object' ? o.f : {}
    if (!Array.isArray(f.topo)) f.topo = f.topo ? [String(f.topo)] : []
    if (!Array.isArray(f.sticks)) f.sticks = f.sticks && typeof f.sticks === 'object' ? [f.sticks] : []   // ConvertTo-Json unwraps a one-element array
    return { r: o.r, f }
  } catch { return null }
}

// One probe against one reading -> 'match' | 'miss' | 'na' (service missing) | 'unread'
function check(c, readings) {
  const now = readings[keyOf(c)]
  if (now === undefined) return 'unread'
  if (c.s) {
    if (now === 'MISSING') return 'na'
    if (now === null) return 'unread'
    return String(now).toLowerCase() === String(c.eq).toLowerCase() ? 'match' : 'miss'
  }
  if (c.p || c.x) {
    if (now === null) return 'unread'
    const a = String(now).toLowerCase()
    if ('ne' in c) return a !== String(c.ne).toLowerCase() ? 'match' : 'miss'
    return a === String(c.eq).toLowerCase() ? 'match' : 'miss'
  }
  if (now === null) return 'miss'   // a registry value that is not there is the Windows default
  if (c.eq && typeof c.eq === 'object') {
    const n = Number(now)
    if (!Number.isFinite(n)) return 'miss'
    if ('ge' in c.eq) return n >= c.eq.ge ? 'match' : 'miss'
    if ('le' in c.eq) return n <= c.eq.le ? 'match' : 'miss'
  }
  return String(now) === String(c.eq) ? 'match' : 'miss'
}

/** readings -> { id: { state: 'all'|'some'|'none'|'na'|'unread', values:[{what, want, now, ok}] } } for every id that has a probe. */
function evaluate(readings, p = plan()) {
  const res = {}
  for (const [id, list] of Object.entries(p)) {
    let match = 0, miss = 0, unread = 0
    const values = []
    for (const c of list) {
      const r = readings ? check(c, readings) : 'unread'
      if (r === 'match') match++; else if (r === 'miss') miss++; else if (r === 'unread') unread++
      values.push({ what: label(c), want: wantText(c), now: readings && readings[keyOf(c)] !== undefined ? readings[keyOf(c)] : null, ok: r === 'match' ? true : r === 'miss' ? false : null })
    }
    res[id] = { state: unread && !match && !miss ? 'unread' : !match && !miss ? 'na' : miss === 0 ? 'all' : match === 0 ? 'none' : 'some', values }
  }
  return res
}

function label(c) {
  if (c.r) return c.r.replace(/^HKLM:\\/, 'HKLM\\') + '\\' + c.n
  if (c.s) return 'service ' + c.s
  if (c.p) return 'power ' + c.p.split(' ')[1]
  return { memcomp: 'memory compression', scheme: 'power plan', hvlaunch: 'hypervisor launch', pagefile: 'page file managed by Windows', procmit: 'Control Flow Guard' }[c.x] || c.x
}
function wantText(c) {
  if ('ne' in c) return 'not ' + c.ne
  if (c.eq && typeof c.eq === 'object') return 'ge' in c.eq ? '>= ' + c.eq.ge : '<= ' + c.eq.le
  return String(c.eq)
}

module.exports = { MARK, plan, requests, keyOf, buildScript, parse, check, evaluate, TOPO_CS }
