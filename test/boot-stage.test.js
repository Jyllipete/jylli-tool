'use strict'
const test = require('node:test')
const assert = require('node:assert')
const { STEP_TO_STAGE, partForStep, leaderPath } = require('../js/boot-stage.js')
const Lay = require('../js/twin/layout.js')

const stageOf = p => p.decor ? 'shell' : p.id === 'cpu' || p.id === 'cooler' ? 'cpu' : p.id.startsWith('ram') ? 'ram' : p.id === 'gpu' || p.id === 'gpu-laptop' ? 'gpu' : p.id.startsWith('drive') ? 'disk' : 'board'

test('every ledger step maps to a stage and vram lands on the gpu, os only powers on', () => {
  assert.deepStrictEqual(Object.keys(STEP_TO_STAGE), ['cpu', 'ram', 'gpu', 'vram', 'storage', 'display', 'board', 'os'])
  assert.strictEqual(STEP_TO_STAGE.vram, STEP_TO_STAGE.gpu)
  assert.strictEqual(STEP_TO_STAGE.os, 'power')
})

test('partForStep points at a part of the right stage, vram at the gpu, os at nothing', () => {
  const parts = Lay.layoutRig({}).parts
  for (const step of ['cpu', 'ram', 'gpu', 'vram', 'storage']) {
    const id = partForStep(parts, step, stageOf)
    const p = parts.find(x => x.id === id)
    assert.ok(p, step + ' resolves to a part')
    assert.strictEqual(stageOf(p), STEP_TO_STAGE[step])
  }
  assert.strictEqual(partForStep(parts, 'vram', stageOf), partForStep(parts, 'gpu', stageOf))
  assert.strictEqual(partForStep(parts, 'os', stageOf), null)
})

test('partForStep prefers a detected part over a ghost', () => {
  const parts = [{ id: 'ram0', kind: 'ram-slot', ghost: true }, { id: 'ram1', kind: 'ram', ghost: false }]
  assert.strictEqual(partForStep(parts, 'ram', stageOf), 'ram1')
})

test('leaderPath starts at the row, ends at the part, and lanes keep neighbours apart', () => {
  const a = { x: 100, y: 50 }, b = { x: 400, y: 220 }
  const d0 = leaderPath(a, b, 0), d1 = leaderPath(a, b, 3)
  assert.match(d0, /^M100 50H/)
  assert.match(d0, /L400 220$/)
  assert.notStrictEqual(d0, d1)
})

test('leaderPath clamps the part into the bounds and never runs backwards', () => {
  const d = leaderPath({ x: 100, y: 50 }, { x: 5000, y: -40 }, 2, { w: 800, h: 600 })
  assert.match(d, /L800 0$/)
  const back = leaderPath({ x: 300, y: 50 }, { x: 310, y: 80 }, 5)
  const mid = Number(back.match(/H(-?[\d.]+)/)[1])
  assert.ok(mid >= 300, 'the elbow stays right of the row')
})
