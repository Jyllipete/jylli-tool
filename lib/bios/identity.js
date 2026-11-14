'use strict'
// Hardware identity for the BIOS tab (pure). Takes the raw values the status script read from several Windows sources and says what
// we know, how sure we are, and what we could not confirm. All Windows sources here come from the same SMBIOS tables, so "agree"
// means "two Windows sources agree", never "confirmed by the vendor".
const crypto = require('crypto')

const PLACEHOLDER = /^(to be filled.*|default string|system product name|system manufacturer|system version|system serial.*|not applicable|not specified|n\/?a|none|unknown|o\.?e\.?m\.?|oem|0123456789|x\.?x|type1.*|\.+|-+)$/i
const str = x => (x == null ? '' : String(x).trim())
const norm = s => str(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const BRANDS = [
  [/asus(tek)?/i, 'asus'], [/micro-?star|\bmsi\b/i, 'msi'], [/gigabyte|giga-byte/i, 'gigabyte'], [/asrock/i, 'asrock'],
  [/\bhp\b|hewlett|hp inc/i, 'hp'], [/\bdell\b/i, 'dell'], [/lenovo/i, 'lenovo'], [/\bacer\b/i, 'acer'], [/samsung/i, 'samsung'],
  [/biostar/i, 'biostar'], [/\bevga\b/i, 'evga'], [/supermicro/i, 'supermicro'], [/\bintel\b/i, 'intel'], [/fujitsu/i, 'fujitsu'],
]
const VM = /vmware|virtualbox|innotek|qemu|\bkvm\b|\bxen\b|bochs|parallels|microsoft corporation.*virtual|virtual machine|hyper-?v|bhyve|amazon ec2|google compute/i
const FW_CLASS = [
  [/american megatrends|\bami\b|aptio/i, 'ami'], [/insyde/i, 'insyde'], [/phoenix/i, 'phoenix'], [/award/i, 'award'],
  [/\bhp\b|hewlett/i, 'hp'], [/\bdell\b/i, 'dell'], [/lenovo/i, 'lenovo'],
]

const brandOf = v => { for (const [re, b] of BRANDS) if (re.test(str(v))) return b; return null }
const fwClassOf = v => { for (const [re, c] of FW_CLASS) if (re.test(str(v))) return c; return null }

/** Cleans one candidate: null for blank or placeholder. */
function clean(v) {
  const s = str(v)
  if (!s) return { v: null, ph: false }
  if (PLACEHOLDER.test(s)) return { v: null, ph: true, raw: s }
  return { v: s, ph: false }
}

/**
 * Merges candidates [{ src, value }] for one field.
 * confidence: 'agree' (2+ sources, same value) | 'single' | 'conflict' (usable values differ) | 'unknown' (nothing usable)
 */
function merge(field, cands, placeholders, conflicts) {
  const good = []
  const raws = []
  for (const c of cands) {
    const r = clean(c.value)
    if (str(c.value)) raws.push({ src: c.src, raw: str(c.value) })
    if (r.ph) placeholders.push({ field, src: c.src, raw: r.raw })
    else if (r.v) good.push({ src: c.src, value: r.v })
  }
  if (!good.length) return { value: null, raws, sources: [], confidence: 'unknown' }
  const distinct = new Map()
  for (const g of good) {
    const k = norm(g.value)
    if (!distinct.has(k)) distinct.set(k, [])
    distinct.get(k).push(g)
  }
  if (distinct.size === 1) {
    return { value: good[0].value, raws, sources: good.map(g => g.src), confidence: good.length > 1 ? 'agree' : 'single' }
  }
  conflicts.push({ field, values: good.map(g => ({ src: g.src, value: g.value })) })
  // keep the value most sources hold; ties keep the first listed source (CIM before registry), and the chip says conflict
  const best = [...distinct.values()].sort((a, b) => b.length - a.length)[0]
  return { value: best[0].value, raws, sources: best.map(g => g.src), confidence: 'conflict' }
}

function formOf(raw, isVM) {
  if (isVM) return 'vm'
  const t = [].concat(raw.chassis == null ? [] : raw.chassis).map(Number)
  const LAP = [8, 9, 10, 11, 12, 14, 18, 21, 30, 31, 32], DESK = [3, 4, 5, 6, 7, 13, 15, 16, 17, 23, 24, 35, 36]
  if (t.some(x => LAP.includes(x))) return 'laptop'
  if (t.some(x => DESK.includes(x))) return 'desktop'
  if (raw.pcSystemType === 2) return 'laptop'
  if (raw.pcSystemType === 1) return 'desktop'
  return 'unknown'
}

/** Normalises a firmware date to yyyy-MM-dd or null (accepts yyyy-MM-dd, yyyyMMdd..., MM/dd/yyyy). */
function parseDate(s) {
  const t = str(s)
  let m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(t)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t)
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  return null
}

/**
 * @param {object} raw  fields from the status script (cim.* = Win32 classes, reg.* = HKLM\HARDWARE\DESCRIPTION\System\BIOS)
 */
function identify(raw) {
  raw = raw || {}
  const cim = raw.cim || {}, reg = raw.reg || {}
  const placeholders = [], conflicts = []
  const m = (field, ...c) => merge(field, c, placeholders, conflicts)

  const fwVendor = m('firmwareVendor', { src: 'Win32_BIOS', value: cim.biosVendor }, { src: 'Registry', value: reg.BIOSVendor })
  const fwVersion = m('firmwareVersion', { src: 'Win32_BIOS', value: cim.biosVersion }, { src: 'Registry', value: reg.BIOSVersion })
  // dates compare after normalising (the registry uses MM/dd/yyyy)
  const dA = parseDate(cim.biosDate), dB = parseDate(reg.BIOSReleaseDate)
  const fwDate = { value: dA || dB || null, raws: [], sources: [], confidence: 'unknown' }
  if (dA && dB) {
    fwDate.confidence = dA === dB ? 'agree' : 'conflict'
    fwDate.sources = ['Win32_BIOS', 'Registry']
    if (dA !== dB) conflicts.push({ field: 'firmwareDate', values: [{ src: 'Win32_BIOS', value: dA }, { src: 'Registry', value: dB }] })
  } else if (dA || dB) { fwDate.confidence = 'single'; fwDate.sources = [dA ? 'Win32_BIOS' : 'Registry'] }

  const boardVendor = m('boardVendor', { src: 'Win32_BaseBoard', value: cim.boardVendor }, { src: 'Registry', value: reg.BaseBoardManufacturer })
  const boardProduct = m('boardProduct', { src: 'Win32_BaseBoard', value: cim.board }, { src: 'Registry', value: reg.BaseBoardProduct })
  const sysVendor = m('systemVendor', { src: 'Win32_ComputerSystem', value: cim.systemVendor }, { src: 'Win32_ComputerSystemProduct', value: cim.productVendor }, { src: 'Registry', value: reg.SystemManufacturer })
  const sysModel = m('systemModel', { src: 'Win32_ComputerSystem', value: cim.systemModel }, { src: 'Win32_ComputerSystemProduct', value: cim.productName }, { src: 'Registry', value: reg.SystemProductName })
  const sysFamily = m('systemFamily', { src: 'Win32_ComputerSystem', value: cim.family }, { src: 'Registry', value: reg.SystemFamily })
  const sysSku = m('systemSku', { src: 'Win32_ComputerSystem', value: cim.sku }, { src: 'Registry', value: reg.SystemSKU })

  // VM only from SMBIOS identity strings. HypervisorPresent alone is true on any PC with VBS / Hyper-V enabled.
  const vmText = [cim.systemVendor, cim.systemModel, cim.productName, cim.boardVendor, cim.board, cim.biosVendor, cim.biosVersion, reg.SystemManufacturer, reg.SystemProductName].map(str).join(' | ')
  const isVM = VM.test(vmText)

  const brand = brandOf(boardVendor.value) || brandOf(sysVendor.value) || null
  const sysBrand = brandOf(sysVendor.value) || null
  const oem = !!sysBrand && ['hp', 'dell', 'lenovo', 'acer', 'samsung', 'fujitsu'].includes(sysBrand)
  const fwClass = isVM ? 'vm' : (fwClassOf(fwVendor.value) || null)

  // how sure are we about the model? Confirmed = a usable value from at least two sources that agree.
  const modelKey = oem ? sysModel : boardProduct
  const modelStatus = modelKey.confidence === 'agree' ? 'confirmed' : modelKey.confidence === 'conflict' ? 'conflict' : modelKey.value ? 'partial' : 'unknown'

  const uefi = raw.uefi === true ? true : raw.uefi === false ? false : null
  const fp = [norm(sysVendor.value), norm(sysModel.value), norm(boardVendor.value), norm(boardProduct.value)].join('|')
  const fingerprint = {
    id: crypto.createHash('sha256').update(fp).digest('hex').slice(0, 16),
    deviceKey: fp,
    biosVersion: fwVersion.value || null,
    biosDate: fwDate.value || null,
  }

  return {
    firmware: { vendor: fwVendor, vendorClass: fwClass, version: fwVersion, date: fwDate, smbios: raw.smbios || null, uefi, secureBoot: raw.secureBoot === true ? true : raw.secureBoot === false ? false : null },
    board: { vendor: boardVendor, product: boardProduct, version: str(cim.boardVersion) || null, brand },
    system: { vendor: sysVendor, model: sysModel, family: sysFamily, sku: sysSku, brand: sysBrand, oem, form: formOf(raw, isVM) },
    isVM, hypervisorPresent: raw.hypervisorPresent === true ? true : raw.hypervisorPresent === false ? false : null,
    model: { status: modelStatus, field: oem ? 'system' : 'board' },
    placeholders, conflicts, fingerprint,
    elevated: raw.elevated === true, lastBoot: raw.lastBoot || null,
  }
}

/** Flat summary for the renderer and the advisor. */
function summary(id) {
  const t = id.system.oem ? id.system.model : id.board.product
  const vendor = id.system.oem ? id.system.vendor : id.board.vendor
  return {
    vendor: id.firmware.vendor.value, board: [id.board.vendor.value, id.board.product.value].filter(Boolean).join(' '),
    system: id.system.model.value, modelLabel: [vendor.value, t.value].filter(Boolean).join(' ') || null,
    biosVersion: id.firmware.version.value, biosDate: id.firmware.date.value, brand: id.board.brand || id.system.brand,
  }
}

module.exports = { identify, summary, parseDate, brandOf, fwClassOf, PLACEHOLDER }
