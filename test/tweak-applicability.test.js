'use strict'
// Which tweaks show / are recommended on which rig. The matrix is the contract: a new rule that changes a row has to change it here.
const test = require('node:test')
const assert = require('node:assert/strict')
const { deriveCaps } = require('../lib/capabilities')
const { evaluate, RULES } = require('../lib/tweak-applicability')
const { FX } = require('./fixtures/auto-opti/hw-fixtures')

const caps = name => deriveCaps(FX[name]())
const st = (name, id) => evaluate(id, caps(name))

test('desktop-only power tweaks are hidden on laptops and shown on desktops', () => {
  for (const id of ['power-throttling', 'pcie-power', 'usb-suspend', 'cstates', 'cpu-parking']) {
    assert.equal(st('optimus-laptop', id).show, false, `${id} on laptop`)
    assert.equal(st('raptor-4090', id).show, true, `${id} on desktop`)
  }
})

test('dual-CCD X3D never sees parking or the AMD max-performance plan; single-CCD does', () => {
  for (const name of ['x3d-7950', 'x3d-9950']) {
    assert.equal(st(name, 'cpu-parking').show, false, name)
    assert.equal(st(name, 'amd-power-plan').show, false, name)
    assert.equal(st(name, 'x3d-balanced').show, true, name)
  }
  assert.equal(st('x3d-7800', 'amd-power-plan').show, true)
  assert.equal(st('x3d-7800', 'x3d-balanced').show, false)
})

test('vendor power plans follow the CPU vendor', () => {
  assert.equal(st('raptor-4090', 'intel-power-plan').show, true)
  assert.equal(st('raptor-4090', 'amd-power-plan').show, false)
  assert.equal(st('x3d-7800', 'intel-power-plan').show, false)
})

test('HAGS needs a capable GPU', () => {
  assert.equal(st('raptor-4090', 'gpu-hwsch').show, true)
  assert.equal(st('sandy-bridge', 'gpu-hwsch').show, false)      // RX 580
  assert.equal(st('arc-a770', 'gpu-hwsch').show, true)           // Arc is discrete and supports it
})

test('NIC tweaks are Ethernet only; Wi-Fi tuning is Wi-Fi only and needs driver properties', () => {
  assert.equal(st('raptor-4090', 'nic-interrupt-mod').show, true)
  assert.equal(st('wifi-desktop', 'nic-interrupt-mod').show, false)
  assert.equal(st('optimus-laptop', 'wifi-gaming-tune').show, true)
  assert.equal(st('optimus-laptop', 'wifi-gaming-tune').state, 'caution')   // laptop: battery drain
  assert.equal(st('raptor-4090', 'wifi-gaming-tune').show, false)
  assert.equal(st('wifi-desktop', 'wifi-gaming-tune').show, false)          // no property list detected
})

test('SysMain needs 16 GB and an SSD; memory compression needs 32 GB', () => {
  assert.equal(st('raptor-4090', 'sysmain').show, true)
  assert.equal(st('old-win10-hdd', 'sysmain').show, false)
  assert.equal(st('raptor-4090', 'memory-compression').show, true)     // 32 GB
  assert.equal(st('old-win10-hdd', 'memory-compression').show, false)  // 8 GB
})

test('security-for-speed trades are recommended only where the cost is real', () => {
  assert.equal(st('sandy-bridge', 'spectre-meltdown').state, 'recommended')   // i7-7700K
  assert.equal(st('raptor-4090', 'spectre-meltdown').state, 'caution')        // modern: little to gain
  assert.equal(st('raptor-4090', 'vbs-disable').state, 'caution')             // MBEC makes VBS cheap
  assert.notEqual(st('sandy-bridge', 'vbs-disable').state, 'caution')
  assert.equal(st('old-win10-hdd', 'vbs-disable').show, false)                // Windows 10
})

test('MPO is for NVIDIA/AMD on Windows 11 and recommended for NVIDIA multi-monitor', () => {
  assert.equal(st('raptor-4090', 'disable-mpo').show, true)
  assert.equal(st('arc-a770', 'disable-mpo').show, false)
  assert.equal(st('old-win10-hdd', 'disable-mpo').show, false)
})

test('global timer resolution is Windows 11 only and warns on laptops', () => {
  assert.equal(st('old-win10-hdd', 'global-timer-resolution').show, false)
  assert.equal(st('optimus-laptop', 'global-timer-resolution').state, 'caution')
})

test('hybrid graphics are detected from an integrated plus a discrete GPU', () => {
  assert.equal(caps('optimus-laptop').hybridGraphics, true)
  assert.equal(caps('raptor-4090').hybridGraphics, false)
  assert.equal(caps('arc-a770').gpu.discrete, true)
})

test('unknown everything: nothing is hidden by a missing fact and nothing is recommended', () => {
  const c = deriveCaps(FX['unknown-all']())
  for (const id of Object.keys(RULES)) {
    const r = evaluate(id, c)
    assert.notEqual(r.state, 'recommended', `${id} must not be recommended on an unknown PC`)
  }
  assert.equal(evaluate('cpu-parking', c).show, true)   // unknown form factor: show it (the card carries its own warning)
})

test('garbage caps never throw', () => {
  for (const c of [null, undefined, {}, { os: null }, { cpu: {}, gpus: null }]) {
    for (const id of Object.keys(RULES)) assert.doesNotThrow(() => evaluate(id, c))
  }
})

test('every reason the engine can give has text in both languages', () => {
  const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
  const ctx = {}
  const src = ['en', 'fi'].map(c => fs.readFileSync(path.join(__dirname, '..', 'js', 'lang', c + '.js'), 'utf8')).join('\n')
  vm.runInNewContext(src + '\n;globalThis.__L = LANG', ctx)
  const whys = new Set()
  for (const r of Object.values(RULES)) for (const t of [...(r.requires || []), ...(r.avoid || [])]) whys.add(t.why)
  for (const w of whys) for (const l of ['en', 'fi']) assert.ok(ctx.__L[l].ui['applic_' + w], `${l} ui.applic_${w}`)
  for (const l of ['en', 'fi']) assert.ok(ctx.__L[l].ui.applicRecommended)
})
