'use strict'
// Live state: ONE read-only PowerShell script. It reads what each catalog probe names, plus the facts the page draws (plans and what each plan sets,
// battery, AC line, power mode, TRIM, what keeps the PC awake and what wakes it). buildScript() / parse() / evaluate() are pure (unit-tested);
// index.js runs the script through deps.runPS. The script only reads (registry, CIM, fsutil query, powercfg query verbs). It writes nothing.
const catalog = require('./catalog')
const plansLib = require('./plans')
const battery = require('./battery')
const sleep = require('./sleep')

const MARK = 'JJPW:'
const psq = s => String(s).replace(/'/g, "''")

function plan(ids) {
  const out = {}
  for (const id of ids || catalog.ids()) {
    const it = catalog.byId[id]
    if (it && it.probe && it.probe.length) out[id] = it.probe
  }
  return out
}
const keyOf = c => 'r|' + c.r + '|' + c.n
/** Registry probes only: plan values, plan names and facts come from the facts block. */
function requests(p) {
  const seen = new Map()
  for (const list of Object.values(p)) for (const c of list) if (c.r) seen.set(keyOf(c), { k: keyOf(c), p: c.r, n: c.n })
  return [...seen.values()]
}

const READS_PS = String.raw`
foreach ($i in $q) {
  $v = $null
  try { $v = [string](Get-ItemPropertyValue -LiteralPath $i.p -Name $i.n -ErrorAction Stop) } catch { $v = $null }
  $o[$i.k] = $v
}
`

const FACTS_PS = String.raw`
try { [Console]::OutputEncoding = [Text.Encoding]::GetEncoding([Globalization.CultureInfo]::CurrentCulture.TextInfo.OEMCodePage) } catch {}
function RegVal($p, $n) { try { [string](Get-ItemPropertyValue -LiteralPath $p -Name $n -ErrorAction Stop) } catch { $null } }
function Txt($c) { try { ((& cmd.exe /c $c 2>&1) | Out-String) } catch { '' } }
$pw = 'root\cimv2\power'
$plans = @(Get-CimInstance -Namespace $pw -ClassName Win32_PowerPlan | ForEach-Object {
  @{ guid = ([string]$_.InstanceID -replace '^.*\{|\}.*$', ''); name = [string]$_.ElementName; active = [bool]$_.IsActive }
})
if ($plans.Count -eq 0) {
  # CIM refuses a non-elevated caller: fall back to the structure of "powercfg /list" (GUID, then the name in parentheses, then * for the active plan)
  $plans = @((Txt 'powercfg /list') -split "\r?\n" | ForEach-Object {
    $mm = [regex]::Match($_, '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(?:\s+\((.*)\))?\s*(\*?)')
    if ($mm.Success) { @{ guid = $mm.Groups[1].Value.ToLower(); name = $mm.Groups[2].Value; active = ($mm.Groups[3].Value -eq '*') } }
  })
}
$idx = @{}
$rx =[regex]'\{([0-9a-fA-F-]{36})\}\\(AC|DC)\\\{([0-9a-fA-F-]{36})\}$'
foreach ($i in (Get-CimInstance -Namespace $pw -ClassName Win32_PowerSettingDataIndex)) {
  $m = $rx.Match([string]$i.InstanceID)
  if (-not $m.Success) { continue }
  $sg = $m.Groups[3].Value.ToLower()
  if (-not $want.ContainsKey($sg)) { continue }
  $pg = $m.Groups[1].Value.ToLower(); $side = $m.Groups[2].Value
  if (-not $idx.ContainsKey($pg)) { $idx[$pg] = @{ AC = @{}; DC = @{} } }
  $idx[$pg][$side][$want[$sg]] = [int64]$i.SettingIndexValue
}
$pk = 'HKLM:\SYSTEM\CurrentControlSet\Control\Power'
$bat = Get-CimInstance Win32_Battery | Select-Object -First 1
$battery = $null
if ($bat) {
  $bs = Get-CimInstance -Namespace root\wmi -ClassName BatteryStatus | Select-Object -First 1
  $bf = Get-CimInstance -Namespace root\wmi -ClassName BatteryFullChargedCapacity | Select-Object -First 1
  $bd = Get-CimInstance -Namespace root\wmi -ClassName BatteryStaticData | Select-Object -First 1
  $rate = $null
  if ($bs) { $rate = if ($bs.Charging) { [int64]$bs.ChargeRate } else { [int64]$bs.DischargeRate } }
  $battery = @{ present = $true; name = [string]$bat.Name; percent = $bat.EstimatedChargeRemaining; acLine = $(if ($bs) { [bool]$bs.PowerOnline } else { $null });
    charging = $(if ($bs) { [bool]$bs.Charging } else { $null }); discharging = $(if ($bs) { [bool]$bs.Discharging } else { $null });
    remainingMWh = $(if ($bs) { [int64]$bs.RemainingCapacity } else { $null }); fullMWh = $(if ($bf) { [int64]$bf.FullChargedCapacity } else { $null });
    designMWh = $(if ($bd) { [int64]$bd.DesignedCapacity } else { $null }); rateMW = $rate }
}
$trim = $null
$ft = (& fsutil behavior query DisableDeleteNotify 2>$null | Out-String)
$tm = [regex]::Match($ft, 'DisableDeleteNotify\s*=\s*(\d)')
if ($tm.Success) { $trim = [int]$tm.Groups[1].Value }
$f = [ordered]@{
  plans = $plans; idx = $idx; battery = $battery; trim = $trim
  overlayAc = (RegVal ($pk + '\User\PowerSchemes') 'ActiveOverlayAcPowerScheme'); overlayDc = (RegVal ($pk + '\User\PowerSchemes') 'ActiveOverlayDcPowerScheme')
  cs = (RegVal $pk 'CsEnabled'); hibernate = (RegVal $pk 'HibernateEnabled'); fastStartup = (RegVal ($pk.Replace('\Power','\Session Manager\Power')) 'HiberbootEnabled')
  laptop = [bool]$bat; chassis = @((Get-CimInstance Win32_SystemEnclosure | Select-Object -First 1).ChassisTypes)
  req = (Txt 'powercfg /requests'); last = (Txt 'powercfg /lastwake'); armed = (Txt 'powercfg /devicequery wake_armed'); prog = (Txt 'powercfg /devicequery wake_programmable'); timers = (Txt 'powercfg /waketimers')
}
`

function buildScript(p = plan()) {
  const json = psq(JSON.stringify(requests(p)))
  const want = {}
  for (const a of plansLib.ANATOMY) want[a.setting] = plansLib.keyOf(a)
  return `$ErrorActionPreference='SilentlyContinue'
$q = '${json}' | ConvertFrom-Json
$want = @{}
('${psq(JSON.stringify(want))}' | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $want[$_.Name] = $_.Value }
$o = [ordered]@{}
${READS_PS}
${FACTS_PS}
'${MARK}' + ([ordered]@{ r = $o; f = $f } | ConvertTo-Json -Compress -Depth 8)
`
}

const arr = v => (Array.isArray(v) ? v : v == null ? [] : [v])
const num = v => { const n = Number(v); return v == null || v === '' || !Number.isFinite(n) ? null : n }
const str = v => (v == null ? null : String(v))

/** stdout -> { r, f } (facts normalised) or null when the script printed nothing usable. */
function parse(out) {
  const line = String(out || '').split(/\r?\n/).reverse().find(l => l.startsWith(MARK))
  if (!line) return null
  let j
  try { j = JSON.parse(line.slice(MARK.length)) } catch { return null }
  if (!j || typeof j !== 'object') return null
  const f = j.f || {}
  const plans = plansLib.normalize(arr(f.plans))
  const idx = {}
  for (const [g, sides] of Object.entries(f.idx || {})) {
    const id = plansLib.guidKey(g)
    idx[id] = { AC: {}, DC: {} }
    for (const side of ['AC', 'DC']) for (const [k, v] of Object.entries((sides && sides[side]) || {})) { const n = num(v); if (n != null) idx[id][side][k] = n }
  }
  const active = plans.find(p => p.active) || null
  const chassis = arr(f.chassis).map(Number).filter(Number.isFinite)
  const bat = battery.normalize(f.battery ? { ...f.battery } : null)
  return {
    r: j.r || {},
    f: {
      plans, idx, activeGuid: active ? active.guid : null, activeName: active ? active.name : null, battery: bat, laptop: f.laptop === true || !!bat || chassis.some(n => [8, 9, 10, 11, 14, 30, 31, 32].includes(n)), chassis,
      trim: num(f.trim), overlayAc: str(f.overlayAc) ? str(f.overlayAc).toLowerCase() : null, overlayDc: str(f.overlayDc) ? str(f.overlayDc).toLowerCase() : null,
      modernStandby: f.cs == null ? null : String(f.cs) === '1', hibernate: f.hibernate == null ? null : String(f.hibernate) === '1', fastStartup: f.fastStartup == null ? null : String(f.fastStartup) !== '0',
      requests: sleep.parseRequests(f.req), lastWake: sleep.parseLastWake(f.last), wakeDevices: sleep.parseWakeDevices(f.armed, f.prog), wakeTimers: sleep.parseWakeTimers(f.timers),
    },
  }
}

/** One probe against the readings: 'match' | 'miss' | 'unread'. */
function check(c, r, f) {
  let now
  if (c.r) {
    if (!r || !(keyOf(c) in r)) return { s: 'unread', now: null }
    now = r[keyOf(c)]
    if (now == null) return { s: 'miss', now: null }
    return { s: Number(now) === Number(c.eq) ? 'match' : 'miss', now }
  }
  if (c.pn) {
    if (!f || !f.plans || !f.plans.length) return { s: 'unread', now: null }
    return { s: String(f.activeName || '').trim().toLowerCase() === c.pn.toLowerCase() ? 'match' : 'miss', now: f.activeName }
  }
  if (c.p) {
    if (!f || !f.activeGuid || !f.idx || !f.idx[f.activeGuid]) return { s: 'unread', now: null }
    now = (f.idx[f.activeGuid][c.side] || {})[c.p]
    if (now == null) return { s: 'unread', now: null }
    return { s: now === c.eq ? 'match' : 'miss', now }
  }
  if (c.f) {
    now = f ? f[c.f] : null
    if (now == null) return { s: 'unread', now: null }
    return { s: now === c.eq ? 'match' : 'miss', now }
  }
  return { s: 'unread', now: null }
}

/** { id: { state: 'all'|'some'|'none'|'unread', values:[{what, want, now, ok}] } } for every catalog item that has a probe. */
function evaluate(read) {
  const out = {}
  const r = read && read.r, f = read && read.f
  for (const [id, probes] of Object.entries(plan())) {
    const res = probes.map(c => ({ c, ...check(c, r, f) }))
    const known = res.filter(x => x.s !== 'unread')
    const hit = known.filter(x => x.s === 'match').length
    const state = !known.length ? 'unread' : hit === known.length ? 'all' : hit === 0 ? 'none' : 'some'
    out[id] = { state, values: res.map(x => ({ what: x.c.n || x.c.p || x.c.pn || x.c.f, want: x.c.eq == null ? x.c.pn : x.c.eq, now: x.now, ok: x.s === 'match' ? true : x.s === 'miss' ? false : null })) }
  }
  return out
}

module.exports = { MARK, plan, requests, keyOf, buildScript, parse, check, evaluate }
