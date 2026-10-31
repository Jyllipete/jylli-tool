'use strict'
// Hardware inventory: one PowerShell pass for the parts list (RigSpec), parsed by pure code, cached on disk. The RigSpec is what
// the 3D rig and the hardware pages are built from; anything not detected stays unknown and is drawn as a ghost, never guessed.

const SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$cs  = Get-CimInstance Win32_ComputerSystem
$bb  = Get-CimInstance Win32_BaseBoard | Select-Object -First 1
$enc = Get-CimInstance Win32_SystemEnclosure | Select-Object -First 1
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$o = [ordered]@{
  csModel = $cs.Model; csManufacturer = $cs.Manufacturer; chassis = @($enc.ChassisTypes)
  hasBattery = [bool](Get-CimInstance Win32_Battery)
  board = @{ vendor = $bb.Manufacturer; model = $bb.Product }
  cpu = @{ name = $cpu.Name; cores = $cpu.NumberOfCores; threads = $cpu.NumberOfLogicalProcessors; maxMHz = $cpu.MaxClockSpeed; socket = $cpu.SocketDesignation; vendor = $cpu.Manufacturer }
  gpus = @(Get-CimInstance Win32_VideoController | ForEach-Object { @{ name = $_.Name; vendor = $_.AdapterCompatibility; driver = $_.DriverVersion; pnp = $_.PNPDeviceID } })
  ramSlotsTotal = (Get-CimInstance Win32_PhysicalMemoryArray | Measure-Object MemoryDevices -Sum).Sum
  ram = @(Get-CimInstance Win32_PhysicalMemory | ForEach-Object { @{ locator = $_.DeviceLocator; bank = $_.BankLabel; bytes = $_.Capacity; ratedMT = $_.Speed; configuredMT = $_.ConfiguredClockSpeed; part = ($_.PartNumber + '').Trim(); type = $_.SMBIOSMemoryType } })
  drives = @(Get-PhysicalDisk | ForEach-Object { @{ name = $_.FriendlyName; media = ($_.MediaType + ''); bus = ($_.BusType + ''); bytes = $_.Size; health = ($_.HealthStatus + '') } })
  adapters = @(Get-NetAdapter -Physical | ForEach-Object { @{ name = $_.Name; desc = $_.InterfaceDescription; up = ($_.Status -eq 'Up'); speed = ($_.LinkSpeed + ''); media = ($_.PhysicalMediaType + ''); ifIndex = $_.ifIndex } })
}
$o | ConvertTo-Json -Depth 5 -Compress
`

const LAPTOP_CHASSIS = new Set([8, 9, 10, 11, 12, 14, 18, 21, 30, 31, 32])
const DESKTOP_CHASSIS = new Set([3, 4, 5, 6, 7, 13, 15, 16, 17, 23, 24, 35, 36])
const MEM_TYPES = { 20: 'DDR', 21: 'DDR2', 24: 'DDR3', 26: 'DDR4', 34: 'DDR5', 29: 'LPDDR3', 30: 'LPDDR4', 35: 'LPDDR5' }

const arr = x => (x == null ? [] : Array.isArray(x) ? x : [x])
const str = x => (x == null ? '' : String(x).trim())
const known = x => { const s = str(x); return s && !/^(to be filled|default string|system product name|unknown|n\/a)/i.test(s) ? s : null }

function formFactor(raw) {
  const types = arr(raw.chassis).map(Number)
  if (types.some(t => LAPTOP_CHASSIS.has(t))) return 'laptop'
  if (types.some(t => DESKTOP_CHASSIS.has(t))) return 'tower'
  if (raw.hasBattery) return 'laptop'
  return 'unknown'
}

function gpuVendor(g) {
  const s = `${g.vendor} ${g.name}`.toLowerCase()
  if (/nvidia/.test(s)) return 'nvidia'
  if (/\bamd\b|radeon|advanced micro/.test(s)) return 'amd'
  if (/intel/.test(s)) return 'intel'
  return 'other'
}

/** Raw PowerShell JSON -> RigSpec. Pure. `userDeclared` (from "Edit my PC") overrides undetected parts with source:'user'. */
function buildRigSpec(raw, userDeclared = {}) {
  raw = raw || {}
  const gpus = arr(raw.gpus)
    .filter(g => known(g.name) && !/microsoft basic|remote display|virtual/i.test(g.name))
    .map((g, i) => ({ index: i, name: str(g.name), vendor: gpuVendor(g), driver: known(g.driver), integrated: gpuVendor(g) === 'intel' || /radeon\(tm\) graphics|radeon graphics|vega \d+ graphics/i.test(g.name) }))
  const sticks = arr(raw.ram).map(r => ({
    locator: str(r.locator) || str(r.bank), bank: known(r.bank), channel: (str(r.bank).match(/CHANNEL\s*([A-Z])/i) || [])[1] || null, sizeGB: r.bytes ? Math.round(Number(r.bytes) / 1024 ** 3) : null,
    ratedMT: Number(r.ratedMT) || null, speedMT: Number(r.configuredMT) || null, part: known(r.part), type: MEM_TYPES[Number(r.type)] || null,
  }))
  const rig = {
    formFactor: formFactor(raw),
    cpu: raw.cpu && known(raw.cpu.name) ? { name: str(raw.cpu.name), cores: Number(raw.cpu.cores) || null, threads: Number(raw.cpu.threads) || null, socket: known(raw.cpu.socket), vendor: known(raw.cpu.vendor) } : null,
    cooler: { type: 'unknown', evidence: null, source: 'unknown' },
    gpus,
    ram: { slotsTotal: Number(raw.ramSlotsTotal) || null, sticks },
    drives: arr(raw.drives).filter(d => d.name).map(d => ({
      name: str(d.name), media: known(d.media), bus: known(d.bus), sizeGB: d.bytes ? Math.round(Number(d.bytes) / 1e9) : null, health: known(d.health),
    })),
    board: { vendor: known(raw.board?.vendor), model: known(raw.board?.model) },
    adapters: arr(raw.adapters).map(a => ({ name: str(a.name), desc: str(a.desc), up: !!a.up, speed: known(a.speed), kind: /802\.11|wireless|wi-?fi/i.test(`${a.media} ${a.desc}`) ? 'wifi' : 'ethernet', ifIndex: a.ifIndex ?? null })),
  }
  // "Edit my PC": declared values fill what detection could not. They are marked so the UI can say who said so.
  if (userDeclared.cooler && rig.cooler.source === 'unknown') rig.cooler = { type: userDeclared.cooler, evidence: 'declared by you', source: 'user' }
  if (userDeclared.formFactor && rig.formFactor === 'unknown') { rig.formFactor = userDeclared.formFactor; rig.formFactorSource = 'user' }
  return rig
}

module.exports = { SCRIPT, buildRigSpec, formFactor, gpuVendor }
