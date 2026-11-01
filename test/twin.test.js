const test = require('node:test')
const assert = require('node:assert')
const L = require('../js/twin/layout')
const M = require('../js/twin/mapping')
const Mo = require('../js/twin/motion')
const F = require('../js/twin/fallback')
const { buildRigSpec } = require('../lib/inventory')
const raw = require('./fixtures/sensors/inventory-raw-desktop.json')

const snap = (o) => ({ s: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, [v, 100, 'sensor']])) })

test('layout of the real desktop: GPU drawn, unknown cooler is a ghost, RAM sticks placed with position flagged', () => {
  const lay = L.layoutRig(buildRigSpec(raw))
  assert.strictEqual(lay.formFactor, 'tower')
  const byId = Object.fromEntries(lay.parts.map(p => [p.id, p]))
  assert.strictEqual(byId.gpu.ghost, false); assert.strictEqual(byId.gpu.fans, null)     // fan count is never guessed
  assert.strictEqual(byId.cooler.ghost, true); assert.strictEqual(byId.cooler.kind, 'cooler-unknown')
  const ram = lay.parts.filter(p => p.kind === 'ram-slot')
  assert.strictEqual(ram.length, 4)
  assert.deepStrictEqual(ram.map(p => !!p.slot.stick), [false, true, false, true])      // two sticks, spread over slots 2 and 4
  assert.ok(ram.filter(p => p.slot.stick).every(p => p.slot.positionKnown === false))   // this board does not report the slot
  assert.ok(lay.ghosts.includes('cooler'))
})

test('showcase case fans: decor-only on a tower, excluded from ghosts, none on a laptop', () => {
  const lay = L.layoutRig(buildRigSpec(raw))
  const fans = lay.parts.filter(p => p.kind === 'case-fan')
  assert.strictEqual(fans.length, 4)                                    // 3 front + 1 rear
  assert.ok(fans.every(p => p.decor === true && p.ghost === false))     // cosmetic: never implies a detected fan
  assert.ok(fans.every(p => !lay.ghosts.includes(p.id)))                // decor parts never appear as "not detected"
  const lap = L.layoutRig({ formFactor: 'laptop', gpus: [], ram: { sticks: [] }, drives: [] })
  assert.strictEqual(lap.parts.filter(p => p.kind === 'case-fan').length, 0)
})

test('declared AIO builds a radiator; a laptop is laid out as a laptop; iGPU-only machines get no card', () => {
  const rig = buildRigSpec(raw, { cooler: 'aio' })
  const lay = L.layoutRig(rig)
  assert.ok(lay.parts.find(p => p.id === 'cooler').rad)
  const lap = L.layoutRig({ formFactor: 'laptop', gpus: [{ name: 'iGPU', integrated: true }], ram: { sticks: [] }, drives: [] })
  assert.strictEqual(lap.formFactor, 'laptop'); assert.ok(lap.parts.find(p => p.id === 'case').kind === 'laptop-body')
  const t = L.layoutRig({ formFactor: 'tower', gpus: [{ name: 'iGPU', integrated: true }] })
  assert.strictEqual(t.parts.find(p => p.id === 'gpu').ghost, true); assert.strictEqual(t.parts.find(p => p.id === 'gpu').note, 'integrated-only')
  assert.strictEqual(L.layoutRig({}).formFactorKnown, false)
})

test('slot names parse from firmware locators', () => {
  assert.strictEqual(L.slotFromStick({ locator: 'DIMM_A2' }), 'A2')
  assert.strictEqual(L.slotFromStick({ locator: 'ChannelB-DIMM1' }), 'B1')
  assert.strictEqual(L.slotFromStick({ locator: 'DIMM 1' }), null)
})

test('mapping: heat only from a temperature, fans only from real readings, nothing from nothing', () => {
  const none = M.visualState(snap({}))
  assert.strictEqual(none.cpu.heat, null); assert.strictEqual(none.gpu.heat, null); assert.strictEqual(none.gpu.fan, null)
  assert.deepStrictEqual(none.caseFans, [])
  const loadOnly = M.visualState(snap({ 'cpu.load': 95, 'gpu0.load': 99 }))
  assert.strictEqual(loadOnly.cpu.heat, null); assert.strictEqual(loadOnly.gpu.heat, null)    // load is not temperature
  assert.strictEqual(loadOnly.cpu.load, 0.95)
  const hot = M.visualState(snap({ 'gpu0.temp.core': 85, 'gpu0.fan.pct': 30 }))
  assert.ok(hot.gpu.heat > 1); assert.strictEqual(hot.gpu.fan, 0.3)
  assert.strictEqual(M.visualState(snap({ 'gpu0.temp.core': 40, 'gpu0.temp.hotspot': 70 })).gpu.temp, 70)   // hotspot wins
  assert.strictEqual(M.visualState(snap({ 'mb.fan1.rpm': 900, 'mb.fan2.rpm': 1200 })).caseFans.length, 2)
})

test('heat ramp is continuous and colours blend toward warn then danger', () => {
  assert.strictEqual(M.heatLevel('cpu', 50), 0); assert.strictEqual(M.heatLevel('cpu', 80), 1); assert.strictEqual(M.heatLevel('cpu', 99), 2)
  assert.strictEqual(M.heatLevel('cpu', null), null)
  const a = [0.5, 0.5, 0.9]
  assert.deepStrictEqual(M.heatColor(null, a), a); assert.deepStrictEqual(M.heatColor(0, a), a)
  assert.notDeepStrictEqual(M.heatColor(2, a), a)
})

test('camera spring converges without overshoot and keeps velocity when re-targeted', () => {
  const s = { x: [0, 0, 0], v: [0, 0, 0] }
  let max = 0
  for (let i = 0; i < 120; i++) { Mo.springStep(s, [10, 0, 0], 1 / 60); max = Math.max(max, s.x[0]) }
  assert.ok(max <= 10.0001); assert.ok(Mo.settled(s, [10, 0, 0], 0.05))
  const t = { x: [0], v: [0] }
  for (let i = 0; i < 10; i++) Mo.springStep(t, [10], 1 / 60)
  assert.ok(t.v[0] > 0)
  Mo.springStep(t, [-10], 1 / 600)
  assert.ok(t.v[0] > 0)       // the velocity was not reset by the new target; it bends smoothly instead
})

test('low-end detection and quality stepping', () => {
  assert.ok(Mo.isSoftwareRenderer('ANGLE (Microsoft, Microsoft Basic Render Driver (0x0000008C) Direct3D11 vs_5_0 ps_5_0, D3D11)'))
  assert.ok(Mo.isSoftwareRenderer('Google SwiftShader'))
  assert.ok(!Mo.isSoftwareRenderer('ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11)'))
  assert.strictEqual(Mo.startQuality('auto', { software: true }), 'static')
  assert.strictEqual(Mo.startQuality('off', {}), 'static')
  assert.strictEqual(Mo.startQuality('auto', { stored: 'reduced' }), 'reduced')
  assert.strictEqual(Mo.nextQuality('full', 25), 'reduced'); assert.strictEqual(Mo.nextQuality('reduced', 25), 'static')
  assert.strictEqual(Mo.nextQuality('full', 12), 'full'); assert.strictEqual(Mo.nextQuality('static', 99), 'static')
  assert.strictEqual(Mo.percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 100], 90), 100)
})

test('frame-rate policy', () => {
  const base = { visible: true, gameForeground: false, msSinceInput: 0, interacting: false }
  assert.strictEqual(Mo.targetFps({ ...base, interacting: true }), 60)
  assert.strictEqual(Mo.targetFps(base), 30)
  assert.strictEqual(Mo.targetFps({ ...base, msSinceInput: 25000 }), 15)
  assert.strictEqual(Mo.targetFps({ ...base, visible: false }), 0)
  assert.strictEqual(Mo.targetFps({ ...base, gameForeground: true }), 0)
})

test('fallback SVG: ghosts by class, heat only with a temperature, no vendor names', () => {
  const lay = L.layoutRig(buildRigSpec(raw))
  const svg = F.svgFor(lay, M.visualState(snap({ 'gpu0.temp.core': 85 })), { label: 'PC' })
  assert.ok(svg.includes('j-twin-ghost')); assert.ok(svg.includes('data-part="gpu" data-heat="hot"'))
  const cold = F.svgFor(lay, M.visualState(snap({})))
  assert.ok(!/data-heat/.test(cold))
  assert.ok(!/nvidia|rtx|ryzen|intel|asus/i.test(svg))
  assert.ok(!/data-part="fanFront0"|data-part="fanRear"/.test(svg))   // showcase-only decor stays out of the compact silhouette
})
