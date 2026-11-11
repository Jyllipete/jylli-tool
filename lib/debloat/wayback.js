'use strict'
// Way back: put back what a debloat run took away.
//   apps      offline when Windows still has the package staged (we did not deprovision it): Add-AppxPackage -RegisterByFamilyName.
//             Otherwise the Store page opens (deep link by package family) - it needs the internet and one click, and the UI says so.
//   features  Enable-WindowsOptionalFeature
// Services, tasks and ad registry values are undone by the change journal itself (exact before-values), not here.
// The `handlers` object is what main passes to the journal service (kinds 'appx' and 'feature'): read(change) -> state, restore(change) -> bool.
const psq = s => String(s).replace(/'/g, "''")
const NAME = /^[\w.\-]{1,128}$/
const FAMILY = /^[\w.\-]{1,200}$/

function create(deps) {
  const installed = async pkg => /JJYES/.test((await deps.runPS(`if (Get-AppxPackage -Name '${psq(pkg)}' -AllUsers) { 'JJYES' } else { 'JJNO' }`, 30000)).out || '')

  /** -> { ok, how: 'present' | 'offline' | 'store' | 'none' } */
  async function restoreApp({ pkg, family }) {
    if (!NAME.test(pkg || '')) return { ok: false, how: 'none' }
    if (await installed(pkg)) return { ok: true, how: 'present' }
    if (FAMILY.test(family || '')) {
      await deps.runPS(`Add-AppxPackage -RegisterByFamilyName -MainPackage '${psq(family)}' -ErrorAction SilentlyContinue`, 120000).catch(() => {})
      if (await installed(pkg)) return { ok: true, how: 'offline' }
      if (deps.openExternal) { try { deps.openExternal(`ms-windows-store://pdp/?PFN=${encodeURIComponent(family)}`) } catch { /* no Store handler */ } return { ok: false, how: 'store' } }
    }
    return { ok: false, how: 'none' }
  }

  async function featureState(name) {
    const r = await deps.runPS(`$f = Get-WindowsOptionalFeature -Online -FeatureName '${psq(name)}' -ErrorAction SilentlyContinue; if ($f) { 'JJF:' + $f.State } else { 'JJF:none' }`, 60000)
    const m = /JJF:(\w+)/.exec(r.out || '')
    if (!m) return { unknown: true }
    return m[1] === 'none' ? { exists: false } : { exists: true, value: m[1] === 'Enabled' ? 'Enabled' : 'Disabled' }
  }

  const handlers = {
    appx: {
      async read(c) { return (await installed(c.pkg)) ? { exists: true, value: 'installed' } : { exists: false } },
      async restore(c) { const r = await restoreApp(c); if (deps.onWayback) deps.onWayback(c.pkg, r); return r.ok },
    },
    feature: {
      read: c => featureState(c.name),
      async restore(c) {
        if (!NAME.test(c.name || '')) return false
        await deps.runPS(`Enable-WindowsOptionalFeature -Online -FeatureName '${psq(c.name)}' -NoRestart -All | Out-Null`, 180000)
        const s = await featureState(c.name)
        return !s.unknown && s.value === 'Enabled'
      },
    },
  }
  return { restoreApp, handlers, installed, featureState }
}

module.exports = { create }
