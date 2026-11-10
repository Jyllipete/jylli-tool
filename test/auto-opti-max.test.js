'use strict'
// Maximum mode: what it offers per PC, and the gates that keep expert (tier 3) tweaks behind a typed confirmation.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ao = require('../lib/auto-opti')
const { findings } = require('../lib/auto-opti/findings')
const { plan } = require('../lib/auto-opti/plan')
const { createRunner } = require('../lib/auto-opti/run')
const controls = require('../lib/auto-opti/controls')
const ui = require('../js/auto-opti.js')
const { P } = require('./fixtures/auto-opti/profiles')
const { FX } = require('./fixtures/auto-opti/hw-fixtures')

const cat = ao.catalog
const maxIds = (name, mut, ctx = {}) => { const p = FX[name](); if (mut) mut(p); return findings(p, { useCase: 'fps', intensity: 'max', ...ctx }) }
const ids = list => list.map(f => f.id)
const clean = p => { p.sys = { ...(p.sys || {}), partOfDomain: false, antiCheat: [], hypervisorPresent: true, hvciRunning: true, services: { wsl: false, docker: false, hyperV: false, vmp: false } } }

test('Safe output is identical with or without the intensity argument', () => {
  for (const name of Object.keys(P)) {
    const safe = findings(P[name](), { useCase: 'fps' })
    const explicit = findings(P[name](), { useCase: 'fps', intensity: 'safe' })
    assert.deepEqual(safe, explicit, name)
    assert.ok(!safe.some(f => f.intensity === 'max'), name)
  }
})

test('the Safe allowlist is unchanged by Maximum rows; Maximum and expert sets are disjoint from forever-banned', () => {
  assert.equal(cat.allowedTweaks().size, 28)
  for (const id of [...cat.MAX_TWEAKS, ...cat.EXPERT_TWEAKS]) assert.ok(!cat.FOREVER_BANNED.has(id), id)
  for (const id of cat.MAX_TWEAKS) assert.ok(!cat.EXPERT_TWEAKS.has(id), id)
})

test('isAllowedTweak: Safe refuses Maximum tweaks, Maximum needs the exact confirmation for expert ones', () => {
  assert.equal(cat.isAllowedTweak('msi-mode', { intensity: 'safe' }), false)
  assert.equal(cat.isAllowedTweak('msi-mode', { intensity: 'max' }), true)
  assert.equal(cat.isAllowedTweak('hypervisor-off', { intensity: 'max' }), false)
  assert.equal(cat.isAllowedTweak('hypervisor-off', { intensity: 'max', expertOk: ['expert-hvci'], findingId: 'expert-hypervisor' }), false)
  assert.equal(cat.isAllowedTweak('hypervisor-off', { intensity: 'max', expertOk: ['expert-hypervisor'], findingId: 'expert-hypervisor' }), true)
  assert.equal(cat.isAllowedTweak('hypervisor-off', { intensity: 'safe', expertOk: ['expert-hypervisor'], findingId: 'expert-hypervisor' }), false)
  for (const id of ['vbs-disable', 'defender-core-off', 'full-mitigation-wipe']) assert.equal(cat.isAllowedTweak(id, { intensity: 'max', expertOk: ['x'], findingId: 'x' }), false, id)
})

test('only the Memory Integrity tweak may touch the DeviceGuard key', () => {
  const manifest = require('../lib/tweak-manifest.json')
  for (const id of [...cat.MAX_TWEAKS, ...cat.EXPERT_TWEAKS]) {
    for (const t of (manifest[id] && manifest[id].touches) || []) {
      for (const rx of cat.SHIELD_DENY) if (rx.test(t.target)) assert.equal(id, 'hvci-offload', `${id} touches ${t.target}`)
    }
  }
})

test('a modern desktop gets moderate rows on and optional rows off; nothing expert without the right facts', () => {
  const list = maxIds('raptor-4090', clean)
  const byId = Object.fromEntries(list.map(f => [f.id, f]))
  assert.ok(byId['max-pcie'] && byId['max-pcie'].defaultOn)
  assert.ok(byId['max-throttling'] && byId['max-throttling'].defaultOn)
  assert.ok(byId['max-timer'] && !byId['max-timer'].defaultOn)
  assert.ok(byId['expert-hypervisor'] && !byId['expert-hypervisor'].defaultOn && byId['expert-hypervisor'].risk === 3)
  assert.ok(!byId['expert-hvci'], 'hvci is redundant next to the hypervisor row')
  assert.ok(!byId['expert-spectre'], 'a 14900K gains nothing from dropping mitigations')
})

test('expert rows disappear on domain-joined PCs, with anti-cheat, with WSL, or when facts are unknown', () => {
  assert.ok(!ids(maxIds('raptor-4090', p => { clean(p); p.sys.partOfDomain = true })).some(i => i.startsWith('expert-')))
  assert.ok(!ids(maxIds('raptor-4090', p => { clean(p); p.sys.antiCheat = ['vgk'] })).some(i => i.startsWith('expert-')))
  const wsl = ids(maxIds('raptor-4090', p => { clean(p); p.sys.services.wsl = true }))
  assert.ok(!wsl.includes('expert-hypervisor'))
  assert.ok(wsl.includes('expert-hvci'), 'without the hypervisor row, Memory Integrity alone can still be offered')
  assert.ok(!ids(maxIds('raptor-4090')).some(i => i.startsWith('expert-')), 'no sys probe means nothing is known')
  assert.deepEqual(ids(maxIds('unknown-all')).filter(i => i !== 'max-fso'), [])   // fso has no hardware condition, so it is the one row an unknown PC can get
})

test('an old Intel desktop is offered the Spectre/Meltdown row; a laptop gets Wi-Fi tuning unticked', () => {
  const old = maxIds('sandy-bridge', p => { clean(p); p.formFactor = 'desktop' })
  assert.ok(ids(old).includes('expert-spectre'))
  const lap = maxIds('optimus-laptop')
  const wifi = lap.find(f => f.id === 'max-wifi')
  assert.ok(wifi && !wifi.defaultOn)
  assert.ok(!ids(lap).includes('max-pcie'), 'desktop-only rows stay off laptops')
})

test('plan: Maximum needs Premium; expert rows need include AND expertOk; Safe drops them all', () => {
  const list = maxIds('raptor-4090', clean)
  const sel = ctx => plan(list, { include: ['expert-hypervisor'], ...ctx })
  assert.equal(sel({ intensity: 'max', premium: false, expertOk: ['expert-hypervisor'] }).intensity, 'safe')
  assert.ok(!sel({ intensity: 'max', premium: false, expertOk: ['expert-hypervisor'] }).steps.some(s => s.tweakId === 'hypervisor-off'))
  assert.ok(!sel({ intensity: 'max', premium: true }).steps.some(s => s.tweakId === 'hypervisor-off'))
  assert.ok(!plan(list, { intensity: 'max', premium: true, expertOk: ['expert-hypervisor'] }).steps.some(s => s.tweakId === 'hypervisor-off'), 'confirmed but not selected')
  const ok = sel({ intensity: 'max', premium: true, expertOk: ['expert-hypervisor'] })
  assert.ok(ok.steps.some(s => s.tweakId === 'hypervisor-off'))
  assert.equal(ok.rebootRequired, true)
  assert.ok(!sel({ intensity: 'safe', premium: true, expertOk: ['expert-hypervisor'] }).steps.some(s => s.tweakId === 'hypervisor-off'))
  assert.ok(plan(list, { intensity: 'max', premium: true }).steps.some(s => s.tweakId === 'pcie-power'))
  assert.ok(!plan(list, { intensity: 'safe', premium: true }).steps.some(s => s.tweakId === 'pcie-power'))
})

function runnerWith(over = {}) {
  const invoked = []
  const deps = {
    emit: () => {}, newId: () => 'id', hasTweak: () => true, tierOf: id => (cat.EXPERT_TWEAKS.has(id) ? 3 : 1),
    createRestorePoint: async () => ({ ok: true }), isApplied: async () => false, metrics: async () => ({ procs: 1 }),
    runPS: async () => ({ ok: true, out: '' }),
    svc: { withContext: async (ctx, fn) => fn(), invokeTweak: async (id, a, send, meta) => { invoked.push(id); meta.onEntry({ id: 'e', fidelity: 'exact', changes: [] }) }, runRecorded: async () => ({}) },
    controls: controls.CONTROLS, journaledControls: controls.JOURNALED,
    loadSettings: () => ({}), saveSettings: () => {}, emitSettingsPatch: () => {}, appendChangelog: () => {},
    securityProbe: async () => P.healthy().security, ...over,
  }
  return { runner: createRunner(deps), invoked }
}
const stepFor = (tw, fid) => ({ stepId: `${fid}:${tw}`, findingId: fid, module: 'windows', type: 'tweak', tweakId: tw, estMs: 1 })

test('runner: a tampered expert step is refused unless the plan carries that exact confirmation', async () => {
  const profile = P.healthy()
  const step = stepFor('hypervisor-off', 'expert-hypervisor')
  for (const p of [
    { steps: [step] },                                                                       // no intensity
    { steps: [step], intensity: 'safe', expertOk: ['expert-hypervisor'] },                    // Safe
    { steps: [step], intensity: 'max', expertOk: [] },                                       // not confirmed
    { steps: [step], intensity: 'max', expertOk: ['expert-hvci'] },                          // another row confirmed
  ]) {
    const { runner, invoked } = runnerWith()
    const r = await runner.run({ plan: { ...p, modules: [], estSeconds: 0 }, profile })
    assert.equal(invoked.length, 0, JSON.stringify(p))
    assert.ok(r.results.every(x => x.status === 'skipped'))
  }
  const { runner, invoked } = runnerWith()
  await runner.run({ plan: { steps: [step], intensity: 'max', expertOk: ['expert-hypervisor'], modules: [], estSeconds: 0 }, profile })
  assert.deepEqual(invoked, ['hypervisor-off'])
})

test('runner: Maximum tweaks are refused in a Safe plan, allowed in a Maximum one', async () => {
  const step = stepFor('msi-mode', 'max-msi')
  let t = runnerWith()
  await t.runner.run({ plan: { steps: [step], intensity: 'safe', modules: [], estSeconds: 0 }, profile: P.healthy() })
  assert.equal(t.invoked.length, 0)
  t = runnerWith()
  await t.runner.run({ plan: { steps: [step], intensity: 'max', modules: [], estSeconds: 0 }, profile: P.healthy() })
  assert.deepEqual(t.invoked, ['msi-mode'])
})

test('runner: a confirmed Memory Integrity change is not reported as an outside shield change', async () => {
  const before = P.healthy(); before.security.hvci = 'on'
  const after = { ...before.security, hvci: 'off' }
  const step = stepFor('hvci-offload', 'expert-hvci')
  const { runner } = runnerWith({ securityProbe: async () => after })
  const r = await runner.run({ plan: { steps: [step], intensity: 'max', expertOk: ['expert-hvci'], modules: [], estSeconds: 0 }, profile: before })
  assert.deepEqual(r.shield.changed, [])
  const other = runnerWith({ securityProbe: async () => ({ ...before.security, hvci: 'off', uac: 'off' }) })
  const r2 = await other.runner.run({ plan: { steps: [step], intensity: 'max', expertOk: ['expert-hvci'], modules: [], estSeconds: 0 }, profile: before })
  assert.deepEqual(r2.shield.changed.map(c => c.key), ['uac'])
})

test('UI: expert rows are kept out of the module list and of module switches', () => {
  const list = maxIds('raptor-4090', clean)
  const views = ui.moduleViews(list, ui.initialOn(list))
  assert.ok(!views.some(m => m.items.some(f => f.risk >= 3)))
  assert.ok(ui.expertViews(list).every(f => f.risk >= 3) && ui.expertViews(list).length > 0)
  assert.ok([...ui.initialOn(list)].filter(([id]) => id.startsWith('expert-')).every(([, on]) => on === false))
})

test('UI source: mode buttons are not caught by the use-case handler, every plan request goes through planReq, and the module switch skips expert rows', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'auto-opti.js'), 'utf8')
  assert.ok(src.includes("r.querySelectorAll('.ao-tile[data-use]')"), 'use-case handler must only bind buttons with data-use')
  assert.ok(!/aoPlan\(\{/.test(src) && !/aoRun\(\{/.test(src), 'aoPlan/aoRun must take planReq(), never a hand-built object')
  assert.ok(src.includes('!(f.risk >= 3)'), 'module toggle must skip expert rows')
  assert.ok(src.includes("root.confirmTier(f.steps[0].id)"), 'expert rows ask for the typed confirmation')
})

test('every Maximum row has a risk block: structured entry plus text in both languages', () => {
  const vm = require('node:vm')
  const { RISK } = require('../lib/tweak-risk')
  const ctx = {}
  vm.runInNewContext(['en', 'fi'].map(c => fs.readFileSync(path.join(__dirname, '..', 'js', 'lang', c + '.js'), 'utf8')).join('\n') + '\n;globalThis.__L = LANG', ctx)
  for (const [fid, row] of Object.entries(cat.CATALOG)) {
    if (row.intensity !== 'max') continue
    for (const st of row.steps) {
      assert.ok(RISK[st.id], fid + ': ' + st.id + ' has no lib/tweak-risk.js entry')
      for (const l of ['en', 'fi']) assert.ok(ctx.__L[l].tweakRisk[st.id] && ctx.__L[l].tweakRisk[st.id].length, fid + ': ' + l + ' tweakRisk ' + st.id)
    }
  }
})
