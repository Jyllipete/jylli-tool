'use strict'
// Live state: ONE read-only PowerShell script. It reads what each catalog probe names, plus the facts the page draws (adapters, driver, VRAM,
// interrupt mode, NVIDIA limits and link, monitors). buildScript() / parse() / evaluate() are pure (unit-tested); index.js runs it through deps.runPS.
// The script only reads (registry, CIM, nvidia-smi queries, EnumDisplaySettings). It writes nothing.
const catalog = require('./catalog')
const display = require('../auto-opti/display')

const MARK = 'JJGP:'
const psq = s => String(s).replace(/'/g, "''")

function plan(ids) {
  const out = {}
  for (const id of ids || catalog.ids()) {
    const it = catalog.byId[id]
    if (it && it.probe && it.probe.length) out[id] = it.probe
  }
  return out
}
const keyOf = c => (c.r ? 'r|' + c.r + '|' + c.n : 'x|' + c.x)
const readReq = c => (c.r ? { k: keyOf(c), a: 'r', p: c.r, n: c.n } : { k: keyOf(c), a: 'x', p: c.x })
function requests(p) {
  const seen = new Map()
  for (const list of Object.values(p)) for (const c of list) seen.set(keyOf(c), readReq(c))
  return [...seen.values()]
}

const FACTS_PS = String.raw`
$cls = 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}'
$vram = @(Get-ChildItem $cls | Where-Object { $_.PSChildName -match '^\d{4}$' } | ForEach-Object {
  $p = Get-ItemProperty $_.PSPath
  if (-not $p.DriverDesc) { return }
  $q = $p.'HardwareInformation.qwMemorySize'; $m = $p.'HardwareInformation.MemorySize'
  $bytes = if ($q) { [uint64]$q } elseif ($m -is [byte[]] -and $m.Length -ge 4) { [uint64][BitConverter]::ToUInt32($m, 0) } elseif ($m) { [uint64]$m } else { $null }
  @{ name = [string]$p.DriverDesc; bytes = $bytes }
})
$irq = @(Get-CimInstance Win32_VideoController | Where-Object { $_.PNPDeviceID -like 'PCI*' } | ForEach-Object {
  $id = $_.PNPDeviceID
  $ent = Get-CimInstance Win32_PnPEntity -Filter ("PNPDeviceID='" + ($id -replace '\\','\\') + "'")
  $r = @(Get-CimAssociatedInstance -InputObject $ent -Association Win32_PnPAllocatedResource -ResultClassName Win32_IRQResource | ForEach-Object { [uint32]$_.IRQNumber })
  @{ name = [string]$_.Name; irq = $r }
})
$vc = @(Get-CimInstance Win32_VideoController | ForEach-Object {
  @{ name = [string]$_.Name; driver = [string]$_.DriverVersion; date = $(if ($_.DriverDate) { ([datetime]$_.DriverDate).ToString('yyyy-MM-dd') } else { $null }); pnp = [string]$_.PNPDeviceID; status = [string]$_.Status }
})
$smi = $null
$exe = $null
if (Test-Path "$env:SystemRoot\System32\nvidia-smi.exe") { $exe = "$env:SystemRoot\System32\nvidia-smi.exe" }
if ($exe) {
  $t = (& $exe -q -d TEMPERATURE 2>$null) -join [Environment]::NewLine
  $mem = (& $exe -q -d MEMORY 2>$null) -join [Environment]::NewLine
  function M($txt, $rx) { $x = [regex]::Match($txt, $rx); if ($x.Success) { [int]$x.Groups[1].Value } else { $null } }
  $q = (& $exe --query-gpu=pcie.link.gen.max,pcie.link.width.max,clocks.max.gr,clocks.max.mem,power.limit,power.default_limit,power.min_limit,power.max_limit --format=csv,noheader,nounits 2>$null | Select-Object -First 1)
  $smi = @{ slowdownC = (M $t 'GPU Slowdown Temp\s*:\s*(\d+)'); shutdownC = (M $t 'GPU Shutdown Temp\s*:\s*(\d+)'); targetC = (M $t 'GPU Target Temperature\s*:\s*(\d+)')
    bar1MiB = (M $mem 'BAR1 Memory Usage\s+Total\s*:\s*(\d+)\s*MiB'); fbMiB = (M $mem 'FB Memory Usage\s+Total\s*:\s*(\d+)\s*MiB'); q = [string]$q }
}
$chassis = (Get-CimInstance Win32_SystemEnclosure | Select-Object -First 1).ChassisTypes
$batt = [bool](Get-CimInstance Win32_Battery | Select-Object -First 1)
$f = [ordered]@{ gpus = $vc; vram = $vram; irq = $irq; smi = $smi; battery = $batt; chassis = @($chassis) }
`

const READS_PS = String.raw`
foreach ($i in $q) {
  $v = $null
  switch ($i.a) {
    'r' { try { $v = [string](Get-ItemPropertyValue -LiteralPath $i.p -Name $i.n -ErrorAction Stop) } catch { $v = $null } }
    'x' {
      if ($i.p -eq 'msi') {
        $vals = @()
        Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Enum\PCI' | ForEach-Object { Get-ChildItem $_.PSPath | ForEach-Object {
          $pp = Get-ItemProperty $_.PSPath
          if ($pp.ClassGUID -eq '{4d36e968-e325-11ce-bfc1-08002be10318}') { $vals += ,((Get-ItemProperty ($_.PSPath + '\Device Parameters\Interrupt Management\MessageSignaledInterruptProperties')).MSISupported) }
        } }
        if ($vals.Count -gt 0) { $v = if (@($vals | Where-Object { $_ -ne 1 }).Count -eq 0) { 'on' } else { 'off' } }
      }
      elseif ($i.p -eq 'dxvrr') {
        $s = [string](Get-ItemProperty 'HKCU:\Software\Microsoft\DirectX\UserGpuPreferences' -Name DirectXUserGlobalSettings).DirectXUserGlobalSettings
        $v = if ($s -match 'VRROptimizeEnable=1' -and $s -match 'SwapEffectUpgradeEnable=1') { 'on' } else { 'off' }
      }
    }
  }
  $o[$i.k] = $v
}
`

function buildScript(p = plan()) {
  const json = psq(JSON.stringify(requests(p)))
  return `$ErrorActionPreference='SilentlyContinue'
$q = '${json}' | ConvertFrom-Json
$o = [ordered]@{}
${READS_PS}
${FACTS_PS}
'${MARK}' + ([ordered]@{ r = $o; f = $f } | ConvertTo-Json -Compress -Depth 6)
${display.listScript()}
`
}

const arr = v => (Array.isArray(v) ? v : v == null ? [] : [v])
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null }

/** stdout -> { r, f, displays, remote } or null when the script printed nothing usable. */
function parse(out) {
  const line = String(out || '').split(/\r?\n/).reverse().find(l => l.startsWith(MARK))
  if (!line) return null
  try {
    const o = JSON.parse(line.slice(MARK.length))
    if (!o || typeof o !== 'object' || !o.r || typeof o.r !== 'object') return null
    const f = o.f && typeof o.f === 'object' ? o.f : {}
    const smi = f.smi && typeof f.smi === 'object' ? f.smi : null
    const q = smi && smi.q ? String(smi.q).split(',').map(s => num(s.trim())) : []
    const d = display.parseList(out)
    return {
      r: o.r,
      f: {
        gpus: arr(f.gpus).filter(g => g && g.name).map(g => ({ name: String(g.name), driver: g.driver || null, date: g.date || null, pnp: g.pnp || '', status: g.status || null })),
        vram: arr(f.vram).filter(g => g && g.name).map(g => ({ name: g.name, gb: num(g.bytes) ? Math.round(num(g.bytes) / 1024 ** 3 * 10) / 10 : null })),
        irq: arr(f.irq).filter(g => g && g.name).map(g => { const n = arr(g.irq).map(Number).filter(Number.isFinite); return { name: g.name, mode: n.length ? (n.some(x => x >= 0x80000000) ? 'msi' : 'line') : null } }),
        battery: f.battery === true, chassis: arr(f.chassis).map(Number).filter(Number.isFinite),
        smi: smi ? {
          slowdownC: num(smi.slowdownC), shutdownC: num(smi.shutdownC), targetC: num(smi.targetC),
          rebar: num(smi.bar1MiB) != null && num(smi.fbMiB) ? num(smi.bar1MiB) >= num(smi.fbMiB) * 0.9 : null,
          pcieGenMax: q[0] == null ? null : q[0], pcieWidthMax: q[1] == null ? null : q[1], clockMaxMHz: q[2] == null ? null : q[2], memClockMaxMHz: q[3] == null ? null : q[3],
          powerLimitW: q[4] == null ? null : q[4], powerDefaultW: q[5] == null ? null : q[5], powerMinW: q[6] == null ? null : q[6], powerMaxW: q[7] == null ? null : q[7],
        } : null,
      },
      displays: d.displays, remote: d.remote,
    }
  } catch { return null }
}

// One probe against one reading -> 'match' | 'miss' | 'unread'
function check(c, readings) {
  const now = readings[keyOf(c)]
  if (now === undefined) return 'unread'
  if (c.x) { if (now === null) return 'unread'; return String(now).toLowerCase() === String(c.eq).toLowerCase() ? 'match' : 'miss' }
  if (now === null) return 'miss'   // a registry value that is not there is the Windows default
  if (c.eq && typeof c.eq === 'object') {
    const n = Number(now)
    if (!Number.isFinite(n)) return 'miss'
    if ('ge' in c.eq) return n >= c.eq.ge ? 'match' : 'miss'
    if ('le' in c.eq) return n <= c.eq.le ? 'match' : 'miss'
  }
  return String(now) === String(c.eq) ? 'match' : 'miss'
}

/** readings -> { id: { state: 'all'|'some'|'none'|'unread', values:[{what, want, now, ok}] } } for every id that has a probe. */
function evaluate(readings, p = plan()) {
  const res = {}
  for (const [id, list] of Object.entries(p)) {
    let match = 0, miss = 0, unread = 0
    const values = []
    for (const c of list) {
      const r = readings ? check(c, readings) : 'unread'
      if (r === 'match') match++; else if (r === 'miss') miss++; else unread++
      values.push({ what: label(c), want: wantText(c), now: readings && readings[keyOf(c)] !== undefined ? readings[keyOf(c)] : null, ok: r === 'match' ? true : r === 'miss' ? false : null })
    }
    res[id] = { state: unread && !match && !miss ? 'unread' : miss === 0 ? 'all' : match === 0 ? 'none' : 'some', values }
  }
  return res
}
const label = c => (c.r ? c.r.replace(/^HKLM:\\/, 'HKLM\\') + '\\' + c.n : { msi: 'message-signalled interrupts (graphics adapters)', dxvrr: 'windowed-game VRR + flip-model upgrade' }[c.x] || c.x)
const wantText = c => (c.eq && typeof c.eq === 'object' ? ('ge' in c.eq ? '>= ' + c.eq.ge : '<= ' + c.eq.le) : String(c.eq))

module.exports = { MARK, plan, requests, keyOf, buildScript, parse, check, evaluate }
