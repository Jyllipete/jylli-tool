'use strict'
// What a run does to ONE catalog item. Side effects come in through `deps` (runPS, and rec = the journal recorder of runRecorded),
// so tests can drive it with fakes.
//   ads, tasks, services  -> rec.ps(...): Set-ItemProperty / Disable-ScheduledTask / Set-Service are recorded EXACTLY by the journal prelude
//   apps, features        -> plain runPS + rec.note(...) with an undo handler (wayback.js), because the prelude cannot follow Appx or DISM
// Nothing here picks WHAT to run: the plan comes from catalog.js + the caller's selection (index.js), and protected packages never get here.
const catalog = require('./catalog')

const psq = s => String(s).replace(/'/g, "''")
const SVC_NAME = /^[\w.\-]{1,256}$/
const PKG_NAME = /^[\w.\-]{1,128}$/
const FEATURE = /^[\w.\-]{1,128}$/
const ORDER = { ad: 0, task: 1, service: 2, feature: 3, appx: 4 }   // cheap and reversible first, apps last

/** ids -> catalog items in run order. Unknown ids, items not present on this PC, and shield-protected packages are dropped with a reason. */
function plan(ids, { present, shield = true } = {}) {
  const items = [], skipped = []
  for (const id of new Set(ids || [])) {
    const it = catalog.get(id)
    if (!it) { skipped.push({ id, reason: 'unknown' }); continue }
    if (present && !present.has(id)) { skipped.push({ id, reason: 'not-present' }); continue }
    if (shield && catalog.isProtectedItem(it)) { skipped.push({ id, reason: 'protected' }); continue }
    items.push(it)
  }
  items.sort((a, b) => ORDER[a.kind] - ORDER[b.kind])
  return { items, skipped }
}

const fail = (error) => ({ ok: false, error: String(error || 'failed').slice(0, 200) })

/** Switch one item off. Returns { ok, error?, restart? }. rec: { ps, note }. opts: { deprovision, family, isProtectedService } */
async function execute(item, deps, rec, opts = {}) {
  switch (item.kind) {
    case 'ad': {
      const lines = item.reg.map(x => `if (-not (Test-Path -Path '${psq(x.key)}')) { New-Item -Path '${psq(x.key)}' -Force | Out-Null }\nSet-ItemProperty -Path '${psq(x.key)}' -Name '${psq(x.name)}' -Value ${Number(x.off)} -Type DWord -Force -ErrorAction Stop`)
      const r = await rec.ps(`$ErrorActionPreference='Stop'\n${lines.join('\n')}`, 20000)
      return r.ok ? { ok: true } : fail(r.err || r.out)
    }
    case 'task': {
      const r = await rec.ps(`Disable-ScheduledTask -TaskPath '${psq(item.task.path)}' -TaskName '${psq(item.task.name)}' -ErrorAction Stop | Out-Null`, 20000)
      return r.ok ? { ok: true } : fail(r.err || r.out)
    }
    case 'service': {
      if (!SVC_NAME.test(item.svc) || (opts.isProtectedService && opts.isProtectedService(item.svc))) return fail('protected-service')
      const r = await rec.ps(`Set-Service -Name '${psq(item.svc)}' -StartupType Disabled -ErrorAction Stop`, 20000)
      if (!r.ok) return fail(r.err || r.out)
      await deps.runPS(`Stop-Service -Name '${psq(item.svc)}' -Force -ErrorAction SilentlyContinue`, 20000).catch(() => {})
      return { ok: true }
    }
    case 'feature': {
      if (!FEATURE.test(item.feature)) return fail('bad-feature')
      const r = await deps.runPS(`$ErrorActionPreference='Stop'\n$x = Disable-WindowsOptionalFeature -Online -FeatureName '${psq(item.feature)}' -NoRestart\nif ($x.RestartNeeded) { 'JJRESTART' }\n'JJOK'`, 180000)
      if (!/JJOK/.test(r.out || '')) return fail(r.err || r.out)
      rec.note({ kind: 'feature', name: item.feature, before: { exists: true, value: 'Enabled' }, after: { exists: true, value: 'Disabled' } })
      return { ok: true, restart: /JJRESTART/.test(r.out) }
    }
    case 'appx': {
      if (!PKG_NAME.test(item.pkg)) return fail('bad-package')
      const n = psq(item.pkg)
      const script = `$ErrorActionPreference='SilentlyContinue'
$n='${n}'
${opts.deprovision ? "Get-AppxProvisionedPackage -Online | Where-Object { $_.DisplayName -eq $n } | ForEach-Object { Remove-AppxProvisionedPackage -Online -PackageName $_.PackageName | Out-Null }" : ''}
Get-AppxPackage -Name $n -AllUsers | Remove-AppxPackage -AllUsers
if (Get-AppxPackage -Name $n -AllUsers) { 'JJFAIL' } else { 'JJOK' }`
      const r = await deps.runPS(script, 180000)
      if (!/JJOK/.test(r.out || '')) return fail(r.err || 'still-installed')
      rec.note({ kind: 'appx', pkg: item.pkg, name: item.pkg, family: opts.family || '', deprovisioned: !!opts.deprovision, before: { exists: true, value: 'installed' }, after: { exists: false } })
      return { ok: true }
    }
    default: return fail('unknown-kind')
  }
}

module.exports = { plan, execute, ORDER }
