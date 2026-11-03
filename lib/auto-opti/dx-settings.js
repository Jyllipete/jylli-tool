'use strict'
// HKCU\Software\Microsoft\DirectX\UserGpuPreferences\DirectXUserGlobalSettings is one semicolon string shared by several Windows
// graphics options (e.g. AutoHDR, VRROptimizeEnable). Writing it whole would wipe the user's other options, so changes merge.

function parse(str) {
  const map = new Map()
  for (const part of String(str || '').split(';')) {
    const i = part.indexOf('=')
    if (i <= 0) continue
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim()
    if (k) map.set(k, v)
  }
  return map
}

/** Sets the given keys, keeping every other key and its order. Returns the new string (always ends with ';'). */
function merge(existing, set) {
  const map = parse(existing)
  for (const [k, v] of Object.entries(set)) map.set(k, String(v))
  return [...map].map(([k, v]) => `${k}=${v};`).join('')
}

/** Removes keys. Returns '' when nothing is left. */
function remove(existing, keys) {
  const map = parse(existing)
  for (const k of keys) map.delete(k)
  return [...map].map(([k, v]) => `${k}=${v};`).join('')
}

const VRR = { VRROptimizeEnable: 1, SwapEffectUpgradeEnable: 1 }

module.exports = { parse, merge, remove, VRR }
