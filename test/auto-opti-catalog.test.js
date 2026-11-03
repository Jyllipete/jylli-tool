'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const ao = require('../lib/auto-opti')
const dx = require('../lib/auto-opti/dx-settings')
const manifest = require('../lib/tweak-manifest.json')

test('every tweak Auto-Optimize can run exists in the tweak manifest (i.e. in TWEAKS)', () => {
  for (const id of ao.catalog.allowedTweaks()) assert.ok(manifest[id], `${id} missing from lib/tweak-manifest.json`)
})

test('no allowed tweak touches anything on the security shield list', () => {
  for (const id of ao.catalog.allowedTweaks()) {
    for (const t of (manifest[id] && manifest[id].touches) || []) {
      for (const rx of ao.catalog.SHIELD_DENY) assert.ok(!rx.test(t.target), `${id} touches ${t.target} (${rx})`)
    }
  }
})

test('allowed tweaks carry no unjournaled work, except the ones with a recorded note or a known unpredictable target', () => {
  // Fidelity "exact" means the journal follows every write. "partial" is allowed only when the apply notes its change itself.
  const NOTED = new Set(['hibernate', 'laptop-power-mode', 'telemetry-tasks', 'power-desktop', 'intel-power-plan', 'amd-power-plan', 'usb-suspend', 'fast-startup-off', 'trim-enable', 'nic-energy-efficient', 'x3d-balanced', 'power-balanced-restore'])
  for (const id of ao.catalog.allowedTweaks()) {
    const f = manifest[id] && manifest[id].fidelity
    if (f === 'exact') continue
    assert.ok(NOTED.has(id) || f === 'none', `${id} has fidelity ${f}`)
  }
})

test('the TWEAKS table holds the metadata the UI needs for every allowed tweak', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8')
  for (const id of ao.catalog.allowedTweaks()) {
    const i = src.indexOf(`\n  '${id}': {`)
    assert.ok(i > 0, `${id} not found in main.js`)
    const head = src.slice(i, i + 700)
    assert.match(head, /name: '/, `${id} has no name`)
    assert.match(head, /safetyTier: [12]/, `${id} is not tier 1 or 2`)
  }
})

test('DirectX settings merge keeps the user\'s other options', () => {
  assert.strictEqual(dx.merge('', dx.VRR), 'VRROptimizeEnable=1;SwapEffectUpgradeEnable=1;')
  assert.strictEqual(dx.merge('AutoHDREnable=2097;VRROptimizeEnable=0;', dx.VRR), 'AutoHDREnable=2097;VRROptimizeEnable=1;SwapEffectUpgradeEnable=1;')
  assert.strictEqual(dx.merge('GpuPreference=2;', dx.VRR), 'GpuPreference=2;VRROptimizeEnable=1;SwapEffectUpgradeEnable=1;')
  assert.strictEqual(dx.remove('AutoHDREnable=2097;VRROptimizeEnable=1;SwapEffectUpgradeEnable=1;', Object.keys(dx.VRR)), 'AutoHDREnable=2097;')
  assert.strictEqual(dx.remove('VRROptimizeEnable=1;', Object.keys(dx.VRR)), '')
  assert.strictEqual(dx.merge('garbage;;=;', {}), '')
})

function loadLang() {
  const ctx = {}
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'lang', 'en.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '..', 'js', 'lang', 'fi.js'), 'utf8') + '\n;globalThis.__L = LANG', ctx)
  return ctx.__L
}

test('autoOpti LANG group: en and fi have the same keys, and every key the UI can ask for exists', () => {
  const L = loadLang(), en = L.en.autoOpti, fi = L.fi.autoOpti
  assert.ok(en && fi, 'autoOpti group missing')
  assert.deepStrictEqual(Object.keys(en).sort(), Object.keys(fi).sort())
  for (const k of Object.keys(en)) { assert.ok(String(en[k]).length, 'en empty ' + k); assert.ok(String(fi[k]).length, 'fi empty ' + k) }
  // placeholders must match between languages
  const ph = x => (String(x).match(/\{\w+\}/g) || []).sort().join()
  for (const k of Object.keys(en)) assert.strictEqual(ph(fi[k]), ph(en[k]), 'placeholders differ for ' + k)

  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'auto-opti.js'), 'utf8')
  const used = new Set()
  for (const m of src.matchAll(/\bgx?\('([A-Za-z0-9_]+)'/g)) if (!m[1].endsWith('_')) used.add(m[1])
  const ui = require('../js/auto-opti.js')
  for (const id of ui.PROBE_ORDER) used.add('probe_' + id)
  for (const id of [...ui.MODULE_ORDER, 'security']) used.add('mod_' + id)
  for (const id of ui.TRAIL) used.add('trail_' + id)
  for (const k of ['high', 'medium', 'low']) used.add('impact_' + k)
  for (const c of ['launcher', 'chat', 'media', 'cloud', 'vendor-bloat', 'security', 'driver', 'updater-security', 'unknown']) used.add('cat_' + c)
  for (const k of ['startupEnabled', 'procs', 'services', 'ramUsedGB', 'freeDiskGB', 'idleCpuPct']) used.add('row_' + k)
  for (const k of ['fps', 'open', 'stream', 'mix']) { const n = 'use' + k[0].toUpperCase() + k.slice(1); used.add(n); used.add(n + 'S') }
  for (const k of ['runStartSub', 'runRestoreSub', 'bootFaster', 'bootSlower', 'on', 'off', 'yes', 'no', 'rGame', 'rBusy', 'rAdmin', 'rExpired', 'rEmpty', 'rScan', 'rRestore', 'rGeneric']) used.add(k)
  for (const id of Object.keys(ao.catalog.CATALOG)) { used.add('fT_' + id); used.add('fW_' + id) }
  used.add('fW_ram-xmp-jedec')
  const miss = [...used].filter(k => en[k] == null)
  assert.deepStrictEqual(miss, [])
  // every journal label key describe.js can produce has a chg_ string
  const dsrc = fs.readFileSync(path.join(__dirname, '..', 'lib', 'auto-opti', 'describe.js'), 'utf8')
  const labelKeys = new Set([...dsrc.matchAll(/key: '([A-Za-z]+)'/g)].map(m => m[1]))
  for (const m of dsrc.matchAll(/labelKey: '([A-Za-z]+)'/g)) labelKeys.add(m[1])
  for (const k of ['junk', 'startupItem', 'refreshRate']) labelKeys.add(k)
  for (const k of labelKeys) assert.ok(en['chg_' + k] != null, 'chg_' + k)
})

test('no user-visible text calls a feature low-value: no verdict wording in any language file', () => {
  for (const f of ['en', 'fi']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'lang', f + '.js'), 'utf8')
    assert.ok(!/placebo|tweakVerdict/i.test(src), f + '.js')
  }
})

test('retired tweaks are never offered by Auto-Optimize and stay restorable', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8')
  const block = src.slice(src.indexOf('const RETIRED_TWEAKS = {'), src.indexOf('let _retiredApplied'))
  const ids = [...block.matchAll(/^  '([a-z0-9-]+)':/gm)].map(m => m[1])
  for (const id of ['priority-sep', 'qos-reserve', 'nvme-latency', 'directstorage-nvme', 'ntfs', 'net-throttling', 'tcp-ctcp', 'nic-flow-control', 'cursor-max-rate', 'raw-aim-curve']) assert.ok(ids.includes(id), id + ' not retired')
  const allowed = ao.catalog.allowedTweaks()
  for (const id of ids) assert.ok(!allowed.has(id), id + ' is retired but Auto-Optimize allows it')
  for (const id of ids) assert.ok(manifest[id], id + ' retired but not a tweak')
})
