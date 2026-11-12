'use strict'
// Live state: ONE read-only PowerShell script reads what each catalog probe names, plus the facts the stage and the checkup need
// (primary adapter, link, Wi-Fi, gateway, resolver, DoH). buildScript() / parse() / evaluate() are pure (unit-tested); index.js runs the script through deps.runPS.
// The script only reads (Get-NetAdapter*, Get-DnsClient*, Get-ItemPropertyValue, Get-Service, netsh wlan show). It never writes anything.
const catalog = require('./catalog')

const MARK = 'JJNET:'
const psq = s => String(s).replace(/'/g, "''")

/** Probe input for the given ids: { id: [probe, ...] } (ids without a probe are left out). */
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
  return 'x|' + c.x
}
function readReq(c) {
  const k = keyOf(c)
  if (c.r) return { k, a: 'r', p: c.r, n: c.n }
  if (c.s) return { k, a: 's', p: c.s }
  return { k, a: 'x', p: c.x }
}
function requests(p) {
  const seen = new Map()
  for (const list of Object.values(p)) for (const c of list) seen.set(keyOf(c), readReq(c))
  return [...seen.values()]
}

// The same adapters the nic-* tweaks touch: Up, not wireless, not virtual, not loopback.
const WIRED = "$_.Status -eq 'Up' -and $_.PhysicalMediaType -ne 'Native 802.11' -and $_.PhysicalMediaType -ne 'Wireless LAN' -and $_.InterfaceDescription -notlike '*Wireless*' -and $_.InterfaceDescription -notlike '*Wi-Fi*' -and $_.InterfaceDescription -notlike '*802.11*' -and $_.InterfaceDescription -notlike '*Virtual*' -and $_.InterfaceDescription -notlike '*Loopback*'"

function buildScript(p = plan()) {
  const json = psq(JSON.stringify(requests(p)))
  return String.raw`$ErrorActionPreference='SilentlyContinue'; $ProgressPreference='SilentlyContinue'
$q = '${json}' | ConvertFrom-Json
$wired = @(Get-NetAdapter | Where-Object { ${WIRED} })
function AdvVals($names) {
  $vals = @()
  foreach ($a in $wired) {
    $hit = $null
    foreach ($n in $names) { $hit = Get-NetAdapterAdvancedProperty -Name $a.Name -DisplayName $n -ErrorAction SilentlyContinue; if ($hit) { break } }
    if ($hit) { $vals += [string]$hit.DisplayValue }
  }
  return ,$vals
}
function OffOn($vals) {
  if (-not $vals -or $vals.Count -eq 0) { return 'NA' }
  foreach ($v in $vals) { if ($v -notmatch '^(Disabled|Off)$') { return 'on' } }
  return 'off'
}
$o = [ordered]@{}
foreach ($i in $q) {
  $v = $null
  switch ($i.a) {
    'r' { try { $v = [string](Get-ItemPropertyValue -LiteralPath $i.p -Name $i.n -ErrorAction Stop) } catch { $v = $null } }
    's' { $s = Get-Service -Name $i.p -ErrorAction SilentlyContinue; $v = if ($s) { [string]$s.StartType } else { 'MISSING' } }
    'x' {
      switch ($i.p) {
        'eee'     { $v = OffOn (AdvVals @('Energy Efficient Ethernet','EEE','Green Ethernet','Energy-Efficient Ethernet','Ultra Low Power Mode')) }
        'intmod'  { $v = OffOn (AdvVals @('Interrupt Moderation','InterruptModeration','Interrupt Moderation Rate')) }
        'offload' {
          if ($wired.Count -eq 0) { $v = 'NA' } else {
            $v = 'off'
            foreach ($a in $wired) {
              $c = Get-NetAdapterChecksumOffload -Name $a.Name -ErrorAction SilentlyContinue
              $l = Get-NetAdapterLso -Name $a.Name -ErrorAction SilentlyContinue
              $r = Get-NetAdapterRsc -Name $a.Name -ErrorAction SilentlyContinue
              if (-not $c -and -not $l -and -not $r) { $v = 'NA'; break }
              if ($c -and ($c.IpIPv4Enabled -ne 'Disabled' -or $c.TcpIPv4Enabled -ne 'Disabled' -or $c.UdpIPv4Enabled -ne 'Disabled')) { $v = 'on' }
              if ($l -and ($l.V1IPv4Enabled -or $l.IPv4Enabled)) { $v = 'on' }
              if ($r -and $r.IPv4Enabled) { $v = 'on' }
            }
          }
        }
        'rss' {
          $rows = @(); foreach ($a in $wired) { $r = Get-NetAdapterRss -Name $a.Name -ErrorAction SilentlyContinue; if ($r -and $r.Enabled) { $rows += $r } }
          if ($rows.Count -eq 0) { $v = 'NA' } else { $v = 'tuned'; foreach ($r in $rows) { if ([int]$r.BaseProcessorNumber -lt 2) { $v = 'default' } } }
        }
        'netbios' {
          $k = @(Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Services\NetBT\Parameters\Interfaces' -ErrorAction SilentlyContinue)
          if ($k.Count -eq 0) { $v = 'NA' } else { $v = 'off'; foreach ($e in $k) { if ([int](Get-ItemProperty -Path $e.PSPath -Name NetbiosOptions -ErrorAction SilentlyContinue).NetbiosOptions -ne 2) { $v = 'on' } } }
        }
        'doh' {
          if (-not (Get-Command Get-DnsClientDohServerAddress -ErrorAction SilentlyContinue)) { $v = 'NA' }
          else { $d = Get-DnsClientDohServerAddress -ServerAddress '1.1.1.1' -ErrorAction SilentlyContinue; $v = if ($d -and ([string]$d.AutoUpgrade -eq 'True')) { 'on' } else { 'off' } }
        }
      }
    }
  }
  $o[$i.k] = $v
}
# facts: what the stage shows. Primary adapter = the one that owns the default route.
$rt = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object { $_.RouteMetric + $_.InterfaceMetric } | Select-Object -First 1
$ad = if ($rt) { Get-NetAdapter -InterfaceIndex $rt.ifIndex -ErrorAction SilentlyContinue } else { $null }
$f = [ordered]@{}
if ($ad) {
  $isW = ($ad.PhysicalMediaType -match '802.11|Wireless') -or ($ad.InterfaceDescription -match 'Wireless|Wi-Fi|802\.11|WLAN')
  $f.adapter = [ordered]@{ name = [string]$ad.Name; desc = [string]$ad.InterfaceDescription; wifi = [bool]$isW; speed = [int64]$ad.Speed; ifIndex = [int]$ad.ifIndex; driver = [string]$ad.DriverVersionString }
  $f.gateway = [string]$rt.NextHop
  if ($isW) { $f.wlan = @(netsh wlan show interfaces 2>$null | ForEach-Object { [string]$_ }) }
}
$dns = @()
foreach ($a in @(Get-NetAdapter | Where-Object { $_.Status -eq 'Up' })) {
  $s = @((Get-DnsClientServerAddress -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue).ServerAddresses | ForEach-Object { [string]$_ })
  $ns = [string](Get-ItemProperty -Path ('HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces\' + $a.InterfaceGuid) -Name NameServer -ErrorAction SilentlyContinue).NameServer
  $dns += [ordered]@{ name = [string]$a.Name; ifIndex = [int]$a.ifIndex; servers = $s; isStatic = [bool]($ns -and $ns.Trim().Length -gt 0) }
}
$f.dns = $dns
'${MARK}' + ([ordered]@{ r = $o; f = $f } | ConvertTo-Json -Depth 6 -Compress)
`
}

/** stdout -> { r: {key: string|null}, f: facts } or null when the script printed nothing usable. */
function parse(out) {
  const line = String(out || '').split(/\r?\n/).reverse().find(l => l.startsWith(MARK))
  if (!line) return null
  try {
    const o = JSON.parse(line.slice(MARK.length))
    if (!o || typeof o !== 'object' || !o.r || typeof o.r !== 'object') return null
    return { r: o.r, f: normFacts(o.f) }
  } catch { return null }
}

const arr = v => (Array.isArray(v) ? v : v == null ? [] : [v])   // PowerShell collapses one-element arrays to a scalar in ConvertTo-Json
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/

function normFacts(f) {
  f = f && typeof f === 'object' ? f : {}
  const a = f.adapter && typeof f.adapter === 'object' ? f.adapter : null
  return {
    adapter: a ? { name: String(a.name || ''), desc: String(a.desc || ''), wifi: !!a.wifi, speedMbps: Number(a.speed) > 0 ? Math.round(Number(a.speed) / 1e6) : null, ifIndex: Number(a.ifIndex) || null, driver: String(a.driver || '') } : null,
    gateway: typeof f.gateway === 'string' && IPV4.test(f.gateway) ? f.gateway : null,
    wlan: a && a.wifi ? parseWlan(arr(f.wlan)) : null,
    dns: arr(f.dns).filter(d => d && typeof d === 'object').map(d => ({ name: String(d.name || ''), ifIndex: Number(d.ifIndex) || null, servers: arr(d.servers).map(String).filter(s => IPV4.test(s)), isStatic: !!d.isStatic })),
  }
}

/** `netsh wlan show interfaces` -> { ssid, signalPct, rssi, channel, band, radio } (any field null). The labels are localized, so lines are told apart by their VALUE. */
function parseWlan(lines) {
  const out = { ssid: null, signalPct: null, rssi: null, channel: null, band: null, radio: null }
  for (const raw of lines) {
    const m = /^\s*([^:]+?)\s*:\s*(.+?)\s*$/.exec(String(raw))
    if (!m) continue
    const key = m[1], v = m[2]
    if (/^SSID$/i.test(key)) { out.ssid = v; continue }
    if (/^\d{1,3}%$/.test(v) && out.signalPct == null) { out.signalPct = parseInt(v, 10); continue }
    if (/^802\.11[a-z]+/i.test(v) && !out.radio) { out.radio = v; continue }
    if (/^\d(\.\d)?\s*GHz$/i.test(v)) { out.band = parseFloat(v); continue }
    if (/^\d{1,3}$/.test(v) && out.channel == null && +v >= 1 && +v <= 233) out.channel = +v
  }
  if (out.band == null && out.channel != null) out.band = out.channel <= 14 ? 2.4 : 5
  if (out.signalPct != null) out.rssi = Math.round(out.signalPct / 2 - 100)   // the usual Windows mapping: 100 % = -50 dBm, 0 % = -100 dBm
  return out
}

/** One probe against one reading -> 'match' | 'miss' | 'na' | 'unread'. */
function check(c, r) {
  const now = r[keyOf(c)]
  if (now === undefined) return 'unread'
  if (c.s) {
    if (now === 'MISSING') return 'na'
    if (now === null) return 'unread'
    return String(now).toLowerCase() === String(c.eq).toLowerCase() ? 'match' : 'miss'
  }
  if (c.x) {
    if (now === null) return 'unread'
    if (now === 'NA') return 'na'
    return String(now) === String(c.eq) ? 'match' : 'miss'
  }
  if (now === null) return 'miss'   // a registry value that is not there is the Windows default
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
      values.push({ what: label(c), want: String(c.eq), now: readings && readings[keyOf(c)] !== undefined ? readings[keyOf(c)] : null, ok: r === 'match' ? true : r === 'miss' ? false : null })
    }
    res[id] = { state: unread && !match && !miss ? 'unread' : !match && !miss ? 'na' : miss === 0 ? 'all' : match === 0 ? 'none' : 'some', values }
  }
  return res
}

const X_LABEL = { eee: 'Energy-Efficient Ethernet', intmod: 'Interrupt moderation', offload: 'Checksum, LSO and RSC offload', rss: 'RSS start core', netbios: 'NetBIOS over TCP/IP', doh: 'DoH upgrade for 1.1.1.1' }
function label(c) {
  if (c.r) return c.r.replace(/^HK(LM|CU):\\/, 'HK$1\\') + '\\' + c.n
  if (c.s) return 'service ' + c.s
  return X_LABEL[c.x] || c.x
}

module.exports = { MARK, WIRED, plan, requests, keyOf, buildScript, parse, parseWlan, normFacts, check, evaluate }
