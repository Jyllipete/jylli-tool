'use strict'
// Packages that Xbox sign-in, Game Pass installs and the Microsoft Store depend on. remove-uwp-apps drops these server-side
// unless the user turns the "Keep Xbox & Microsoft Store" shield off, so a stale or crafted request can't break them.
const PROTECTED = [
  'Microsoft.WindowsStore',
  'Microsoft.StorePurchaseApp',
  'Microsoft.DesktopAppInstaller',
  'Microsoft.GamingServices',
  'Microsoft.XboxIdentityProvider',
]
const isProtected = pkg => PROTECTED.some(p => p.toLowerCase() === String(pkg).toLowerCase())
const splitProtected = (packages, keepXboxStore = true) => {
  const list = Array.isArray(packages) ? packages.map(String) : []
  if (keepXboxStore === false) return { allowed: list, protectedPkgs: [] }
  return { allowed: list.filter(p => !isProtected(p)), protectedPkgs: list.filter(isProtected) }
}
module.exports = { PROTECTED, isProtected, splitProtected }
