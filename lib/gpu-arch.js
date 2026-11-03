'use strict'
// One place that turns a GPU name into what the tweak engine needs to know. Pure. An unrecognised name yields nulls, never a guess.

/** @returns {{ vendor: 'nvidia'|'amd'|'intel'|'other', arch: string|null, discrete: boolean|null, hags: boolean|null, dlssFrameGen: boolean|null, fsrFrameGen: boolean|null }} */
function classifyGpu(name, vendorHint) {
  const n = String(name || '')
  const hint = String(vendorHint || '')
  const s = `${hint} ${n}`.toLowerCase()
  let vendor = 'other'
  if (/nvidia|geforce|\brtx\b|\bgtx\b|quadro/.test(s)) vendor = 'nvidia'
  else if (/\bamd\b|radeon|advanced micro/.test(s)) vendor = 'amd'
  else if (/intel|\barc\b|\buhd\b|iris/.test(s)) vendor = 'intel'

  const out = { vendor, arch: null, discrete: null, hags: null, dlssFrameGen: null, fsrFrameGen: null }

  if (vendor === 'nvidia') {
    out.discrete = true
    const rtx = /\brtx\s*(?:pro\s*)?(?:a?\s*)?(\d)(\d{2,3})/i.exec(n)
    if (rtx) {
      const series = +rtx[1]
      out.arch = series >= 5 ? 'rtx50' : series === 4 ? 'rtx40' : series === 3 ? 'rtx30' : series === 2 ? 'rtx20' : null
    } else if (/\bgtx\s*16\d{2}/i.test(n)) out.arch = 'gtx16'
    else if (/\bgtx\s*10\d{2}/i.test(n)) out.arch = 'gtx10'
    else if (/\bgtx\s*\d{3}\b|\bgt\s*\d{3}/i.test(n)) out.arch = 'older'
    out.hags = ['rtx50', 'rtx40', 'rtx30', 'rtx20', 'gtx16', 'gtx10'].includes(out.arch) ? true : out.arch ? false : null
    out.dlssFrameGen = out.arch ? ['rtx50', 'rtx40'].includes(out.arch) : null
    out.fsrFrameGen = out.arch ? ['rtx50', 'rtx40', 'rtx30', 'rtx20', 'gtx16', 'gtx10'].includes(out.arch) : null
  } else if (vendor === 'amd') {
    // APU graphics: "AMD Radeon(TM) Graphics", "Radeon 780M", "Radeon Vega 8". Discrete: "Radeon RX 7800 XT", "RX 7600M XT", "Radeon Pro W7800".
    const igpu = !/\brx\b|\bpro\s*w|\bfirepro|\bvii\b/i.test(n) && /radeon(?:\(tm\))?\s*(?:graphics|vega\s*\d+|\d{3}m)\b/i.test(n)
    out.discrete = igpu ? false : /\brx\b|radeon\s*pro|\br[579]\s*\d{3}|\bvega\s*(?:56|64|frontier)|radeon\s*vii/i.test(n) ? true : null
    const rx = /\brx\s*(\d)(\d{3})/i.exec(n)
    if (rx) {
      const series = +rx[1]
      out.arch = series >= 9 ? 'rdna4' : series === 7 ? 'rdna3' : series === 6 ? 'rdna2' : series === 5 ? 'rdna1' : series <= 4 ? 'gcn' : null
    } else if (/\brx\s*[45]\d{2}\b|\brx\s*vega/i.test(n)) out.arch = 'gcn'
    else if (igpu) out.arch = /\b[78]\d0m\b|\b8[0-9]{2}m\b/i.test(n) ? 'rdna3' : /\b6\d0m\b/i.test(n) ? 'rdna2' : 'vega'
    out.hags = ['rdna4', 'rdna3', 'rdna2', 'rdna1'].includes(out.arch) ? true : out.arch ? false : null
    out.fsrFrameGen = out.arch ? !['gcn', 'vega'].includes(out.arch) : null
  } else if (vendor === 'intel') {
    // Arc discrete cards are "Arc A770" / "Arc B580"; the integrated "Intel Arc Graphics" (Meteor/Arrow Lake) has no model number.
    const arc = /\barc(?:\(tm\))?\s*(?:pro\s*)?([ab])\s*\d{3}/i.exec(n)
    if (arc) { out.discrete = true; out.arch = arc[1].toLowerCase() === 'b' ? 'arc-battlemage' : 'arc-alchemist'; out.hags = true; out.fsrFrameGen = true }
    else if (/\barc\b|\biris\s*xe|\bxe\b|\buhd\b|\bhd graphics/i.test(n)) { out.discrete = false; out.arch = /\buhd|\bhd graphics/i.test(n) ? 'uhd' : 'xe' }
  }
  return out
}

module.exports = { classifyGpu }
