'use strict'
// Pattern (usable in both JS and PowerShell -match, which is case-insensitive) that tells whose display adapter a registry class
// key belongs to. "ATI" must be a whole word: unanchored it matched "NVIDIA Corporation" and "Intel Corporation", so AMD driver
// values used to be written into NVIDIA and Intel adapter keys.
const PATTERNS = {
  nvidia: 'NVIDIA',
  amd: 'Advanced Micro Devices|(^|[^A-Za-z])(AMD|ATI|Radeon)([^A-Za-z]|$)',
}
const vendorPattern = vendor => (vendor === 'nvidia' ? PATTERNS.nvidia : PATTERNS.amd)
const matchesVendor = (vendor, text) => new RegExp(vendorPattern(vendor), 'i').test(String(text || ''))
module.exports = { vendorPattern, matchesVendor }
