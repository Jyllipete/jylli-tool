'use strict'
// "Never overwrite good with worse": a field that came back empty / 'Detecting…' / 0 / 'Unknown' never replaces a value we already know.
const EMPTY = new Set(['', 'Detecting…', 'Unknown', 'SSD/HDD', 'Detected', 'VRAM not detected'])
const isEmpty = v => v == null || v === 0 || v === false && false || (typeof v === 'string' && EMPTY.has(v.trim()))
// Fields that are live truth every time (a false is a real answer there).
const LIVE = new Set(['isAdmin', 'onBattery', 'hasInternet', 'hasEthernet', 'hasBluetooth', 'isWifi', 'isLaptop', 'nvme', 'fivemInstalled'])

/** merge(known, fresh) -> new object: fresh wins unless it is empty for a field `known` has. */
function merge(known, fresh) {
  const out = Object.assign({}, known || {})
  for (const [k, v] of Object.entries(fresh || {})) {
    if (LIVE.has(k)) { out[k] = v; continue }
    if (isEmpty(v) && !isEmpty(out[k])) continue
    out[k] = v
  }
  return out
}
module.exports = { merge, isEmpty, LIVE }
