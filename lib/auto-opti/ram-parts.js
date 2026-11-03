'use strict'
// Decodes a memory kit's rated speed (MT/s) from its part number. SMBIOS "Speed" is often just the running speed, so the part
// number is the only evidence that XMP/EXPO is off. Unknown parts return null: never guessed.

const lo = 1333, hi = 9000
const ok = n => Number.isFinite(n) && n >= lo && n <= hi

const RULES = [
  // Corsair CMK32GX4M2B3200C16, CMH32GX5M2B6000C36
  { re: /^CM[A-Z]{1,2}\d+G[A-Z]*[45]M\d[A-Z]?(\d{4,5})C\d{2}/, val: m => +m[1] },
  // G.Skill F4-3600C16D-32GVKC, F5-6000J3038F16GX2-TZ5RK
  { re: /^F[345]-(\d{4,5})/, val: m => +m[1] },
  // Kingston / HyperX KF436C17BB/16, KF560C40-16, HX436C17PB3/16
  { re: /^(?:KF|HX)([345])(\d{2})[CS]\d/, val: m => +m[2] * 100 },
  // Crucial / Ballistix BL2K16G36C16U4B, CT16G56C46U5
  { re: /^(?:BL|CT)[\dK]*G(\d{2})C\d{2}/, val: m => +m[1] * 100 },
  // TeamGroup TF3D416G3600HC18JDC01, FF3D532G6000HC38ADC01
  { re: /G(\d{4})HC\d{2}/, val: m => +m[1] },
  // ADATA / XPG AX4U32008G16A, AX5U6000C3016G
  { re: /^AX[345]U(\d{4})/, val: m => +m[1] },
  // Patriot PVS416G320C6K
  { re: /^PV\w*?\d+G(\d{3})C\d/, val: m => +m[1] * 10 },
  // JEDEC style: PC4-25600 (MB/s per module = 8 x MT/s)
  { re: /PC[345]-(\d{4,6})/, val: m => Math.round(+m[1] / 8) },
  // Generic "DDR4-3200" / "3200C16"
  { re: /DDR[345]-(\d{4,5})/, val: m => +m[1] },
  { re: /(\d{4,5})C\d{2}/, val: m => +m[1] },
]

function ratedFromPart(part) {
  const p = String(part || '').trim().toUpperCase().replace(/\s+/g, '')
  if (!p) return null
  for (const r of RULES) {
    const m = r.re.exec(p)
    if (!m) continue
    const v = r.val(m)
    if (ok(v)) return { ratedMT: v, source: 'part' }
  }
  return null
}

/** JEDEC base speeds: a kit running at one of these on a desktop is probably running without its XMP/EXPO profile. */
const JEDEC = { DDR4: [2133, 2400, 2666], DDR5: [4800, 5200, 5600] }

/**
 * Compares what the sticks run at with what they are rated for.
 * Returns { state:'off'|'on'|'unknown', confidence:'measured'|'likely'|null, ratedMT, configuredMT }.
 */
function xmpState(sticks, type) {
  const list = (sticks || []).filter(s => s && Number(s.speedMT) > 0)
  if (!list.length) return { state: 'unknown', confidence: null, ratedMT: null, configuredMT: null }
  const configuredMT = Math.min(...list.map(s => Number(s.speedMT)))
  let ratedMT = null
  for (const s of list) {
    const p = ratedFromPart(s.part)
    const r = Math.max(p ? p.ratedMT : 0, Number(s.ratedMT) || 0)
    if (r > (ratedMT || 0)) ratedMT = r
  }
  const partDecoded = list.some(s => ratedFromPart(s.part))
  if (ratedMT && ratedMT > configuredMT + 200) return { state: 'off', confidence: partDecoded ? 'measured' : 'likely', ratedMT, configuredMT }
  if (!partDecoded && JEDEC[type] && JEDEC[type].includes(configuredMT) && configuredMT <= (type === 'DDR5' ? 5600 : 2666)) {
    // No part evidence: a JEDEC base speed is only a hint, so it says "likely" and never claims a rated speed.
    return { state: 'unknown', confidence: 'likely', ratedMT: null, configuredMT, jedecOnly: true }
  }
  return { state: ratedMT ? 'on' : 'unknown', confidence: ratedMT ? (partDecoded ? 'measured' : 'likely') : null, ratedMT, configuredMT }
}

module.exports = { ratedFromPart, xmpState, JEDEC }
