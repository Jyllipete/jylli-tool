'use strict'
// Findings that come from the capability layer: platform health facts and hardware-gated fixes.
const test = require('node:test')
const assert = require('node:assert/strict')
const { findings } = require('../lib/auto-opti/findings')
const { FX } = require('./fixtures/auto-opti/hw-fixtures')

const ids = (name, mut) => { const p = FX[name](); if (mut) mut(p); return findings(p, { useCase: 'fps' }).map(f => f.id) }

test('Raptor Lake desktop on old microcode is told to update the BIOS; new microcode is not', () => {
  assert.ok(ids('raptor-4090').includes('cpu-microcode'))                                   // 0x129
  assert.ok(!ids('raptor-4090', p => { p.cpuX.microcode = 0x12F }).includes('cpu-microcode'))
  assert.ok(!ids('raptor-4090', p => { delete p.cpuX.microcode }).includes('cpu-microcode')) // unknown revision: say nothing
  assert.ok(!ids('optimus-laptop').includes('cpu-microcode'))                                 // mobile parts are not affected
})

test('hybrid graphics with installed games gets the GPU preference fix; without games it does not', () => {
  const withGames = findings(Object.assign(FX['optimus-laptop'](), { context: { apps: { games: 12 } } }), { useCase: 'fps' })
  const f = withGames.find(x => x.id === 'gpu-per-app')
  assert.ok(f && f.kind === 'fix' && f.defaultOn)
  assert.ok(!ids('optimus-laptop').includes('gpu-per-app'))
  assert.ok(!findings(Object.assign(FX['raptor-4090'](), { context: { apps: { games: 12 } } }), { useCase: 'fps' }).some(x => x.id === 'gpu-per-app'))
})

test('Windows 10 is flagged, and a hybrid Intel CPU on it more strongly', () => {
  assert.ok(ids('old-win10-hdd').includes('win10-eol'))
  assert.ok(!ids('raptor-4090').includes('win10-eol'))
  assert.ok(ids('raptor-4090', p => { p.os = { build: 19045, win11: false }; p.cpuX.hybrid = true }).includes('hybrid-win10'))
})

test('pointer speed other than 6/11 is offered but never on by default', () => {
  const f = findings(Object.assign(FX['raptor-4090'](), { input: { pointerSpeed: 14, mouseAccel: false, stickyHotkey: false } }), { useCase: 'fps' }).find(x => x.id === 'pointer-1to1')
  assert.ok(f); assert.equal(f.defaultOn, false)
  assert.ok(!ids('raptor-4090', p => { p.input.pointerSpeed = 10 }).includes('pointer-1to1'))
})

test('ReBAR off is reported only for GPUs that support it', () => {
  assert.ok(ids('raptor-4090', p => { p.gpuX = { rebar: false } }).includes('rebar-off'))
  assert.ok(!ids('raptor-4090', p => { p.gpuX = { rebar: true } }).includes('rebar-off'))
  assert.ok(!ids('sandy-bridge', p => { p.gpuX = { rebar: false } }).includes('rebar-off'))   // RX 580
})

test('a game library on a hard drive is flagged only when an SSD with room exists', () => {
  const lib = p => { p.storageX = { libraries: [{ path: 'D:/Steam', letter: 'D', kind: 'hdd' }], drives: [{ letter: 'C', kind: 'nvme', freeGB: 300 }, { letter: 'D', kind: 'hdd', freeGB: 800 }] } }
  assert.ok(ids('raptor-4090', lib).includes('game-on-hdd'))
  assert.ok(!ids('raptor-4090', p => { lib(p); p.storageX.drives[0].freeGB = 20 }).includes('game-on-hdd'))
})

test('an empty profile produces none of the new findings', () => {
  const got = ids('unknown-all')
  for (const id of ['cpu-microcode', 'intel-apo', 'hybrid-win10', 'rebar-off', 'game-on-hdd', 'win10-eol', 'gpu-per-app', 'pointer-1to1']) assert.ok(!got.includes(id), id)
})
