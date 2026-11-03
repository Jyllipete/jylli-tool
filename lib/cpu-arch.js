'use strict'
// CPU name -> generation, family and the properties the tweak engine gates on. Pure; unknown stays null.
// Name-based facts are labelled as such: hybrid layout and CCD count are better read from the machine (see probes `cpu2`), these are the fallback.

const ZEN = { 1: 'zen1', 2: 'zen+', 3: 'zen2', 4: 'zen2', 5: 'zen3', 6: 'zen3+', 7: 'zen4', 8: 'zen4', 9: 'zen5' }

/** @returns {{ vendor, family, gen, mobile, x3d, dualCcdX3d, raptorLakeDesktop, hvciCostly, mitigationCost }} */
function classifyCpu(name, vendorHint) {
  const n = String(name || '')
  const s = `${vendorHint || ''} ${n}`.toLowerCase()
  const out = { vendor: null, family: null, gen: null, mobile: null, x3d: null, dualCcdX3d: null, raptorLakeDesktop: false, hvciCostly: null, mitigationCost: null }
  if (!n.trim()) return out

  if (/ryzen|threadripper|athlon|\bamd\b/.test(s) && !/intel/.test(s)) {
    out.vendor = 'amd'
    const m = /ryzen\s*(?:ai\s*)?(?:[3579]|z\d)\s*(?:pro\s*)?(\d)(\d{3})(\w*)/i.exec(n)
    if (m) {
      const suffix = m[3].toUpperCase()
      out.gen = +m[1]
      out.family = ZEN[out.gen] || null
      out.mobile = /^(U|H|HS|HX|HX3D)$/.test(suffix) ? true : /^(X|X3D|XT|F|G|GE|GT|E|)$/.test(suffix) ? false : null
      if (/ryzen\s*ai/i.test(n)) { out.family = 'zen5'; out.mobile = true }
      out.x3d = /x3d/i.test(n)
      out.dualCcdX3d = out.x3d ? /ryzen\s*9/i.test(n) : false
      out.hvciCostly = out.gen <= 2     // Zen 1 / Zen+ lack the hardware assist (GMET)
      out.mitigationCost = 'low'        // AMD is not affected by Meltdown
    }
    return out
  }

  if (/intel/.test(s) || /core\(tm\)|core ultra|\bi[3579]-/.test(s)) {
    out.vendor = 'intel'
    const ultra = /core\(tm\)\s*ultra\s*([3579])\s*(\d)(\d{2})(\w*)/i.exec(n) || /core\s*ultra\s*([3579])\s*(\d)(\d{2})(\w*)/i.exec(n)
    if (ultra) {
      const series = +ultra[2]
      const suffix = ultra[4].toUpperCase()
      out.gen = 14 + series                     // Core Ultra series 1 sits after 14th gen, series 2 after that
      out.family = series >= 2 ? (/V$/.test(suffix) ? 'lunar-lake' : 'arrow-lake') : 'meteor-lake'
      out.mobile = !/^(K|KF|F|S)$/.test(suffix) && suffix !== ''
      out.hvciCostly = false
      out.mitigationCost = 'low'
      return out
    }
    const m = /\bi([3579])-(\d{4,5})([A-Z0-9]*)/i.exec(n)
    if (m) {
      const num = m[2]
      const suffix = m[3].toUpperCase()
      out.gen = num.length === 5 ? +num.slice(0, 2) : +num.slice(0, 1)
      out.family = out.gen >= 12 ? (out.gen >= 14 ? 'raptor-lake-refresh' : out.gen === 13 ? 'raptor-lake' : 'alder-lake') : out.gen >= 6 ? 'skylake-family' : 'pre-skylake'
      out.mobile = /^(H|HX|HK|U|P|G\d|Y)/.test(suffix) ? true : /^(K|KF|KS|F|T|)$/.test(suffix) ? false : null
      out.hvciCostly = out.gen <= 6              // Mode-Based Execution Control arrived with Kaby Lake (7th gen)
      out.mitigationCost = out.gen <= 8 ? 'high' : out.gen <= 10 ? 'medium' : 'low'
      // Intel's Vmin-shift instability: desktop 13th/14th gen i5-13600/14600 and up, 65 W and above.
      out.raptorLakeDesktop = (out.gen === 13 || out.gen === 14) && out.mobile === false && !/T$/.test(suffix) &&
        (m[1] === '9' || m[1] === '7' || (m[1] === '5' && /^1[34]6\d\d/.test(num)))
    }
  }
  return out
}

module.exports = { classifyCpu }
