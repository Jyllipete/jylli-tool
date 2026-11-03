'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { classifyGpu } = require('../lib/gpu-arch')
const { classifyCpu } = require('../lib/cpu-arch')

test('GPU: discrete vs integrated, including Intel Arc cards and the Arc iGPU', () => {
  assert.equal(classifyGpu('Intel(R) Arc(TM) A770 Graphics', 'Intel Corporation').discrete, true)
  assert.equal(classifyGpu('Intel(R) Arc(TM) B580 Graphics').arch, 'arc-battlemage')
  assert.equal(classifyGpu('Intel(R) Arc(TM) Graphics').discrete, false)
  assert.equal(classifyGpu('Intel(R) UHD Graphics 770').discrete, false)
  assert.equal(classifyGpu('AMD Radeon(TM) Graphics').discrete, false)
  assert.equal(classifyGpu('AMD Radeon 780M Graphics').discrete, false)
  assert.equal(classifyGpu('AMD Radeon RX 7900 XTX').discrete, true)
  assert.equal(classifyGpu('AMD Radeon RX 7600M XT').discrete, true)
  assert.equal(classifyGpu('NVIDIA GeForce RTX 4060 Laptop GPU').discrete, true)
})

test('GPU: architecture, HAGS and frame generation', () => {
  const a = classifyGpu('NVIDIA GeForce RTX 5090'); assert.equal(a.arch, 'rtx50'); assert.equal(a.dlssFrameGen, true)
  const b = classifyGpu('NVIDIA GeForce RTX 3070'); assert.equal(b.arch, 'rtx30'); assert.equal(b.dlssFrameGen, false); assert.equal(b.hags, true)
  assert.equal(classifyGpu('NVIDIA GeForce GTX 1060 6GB').arch, 'gtx10')
  assert.equal(classifyGpu('NVIDIA GeForce GTX 1660 SUPER').arch, 'gtx16')
  assert.equal(classifyGpu('NVIDIA GeForce GTX 770').hags, false)
  assert.equal(classifyGpu('AMD Radeon RX 6800 XT').arch, 'rdna2')
  assert.equal(classifyGpu('AMD Radeon RX 580').arch, 'gcn')
  assert.equal(classifyGpu('AMD Radeon RX 580').hags, false)
  assert.equal(classifyGpu('AMD Radeon RX 9070 XT').arch, 'rdna4')
})

test('GPU: unknown names give nulls', () => {
  const g = classifyGpu('Mystery Adapter 3000')
  assert.equal(g.vendor, 'other'); assert.equal(g.discrete, null); assert.equal(g.hags, null)
  assert.equal(classifyGpu('').arch, null)
})

test('CPU: AMD generations and X3D CCD layout', () => {
  assert.equal(classifyCpu('AMD Ryzen 9 7950X3D 16-Core Processor').dualCcdX3d, true)
  assert.equal(classifyCpu('AMD Ryzen 9 9950X3D 16-Core Processor').dualCcdX3d, true)
  assert.equal(classifyCpu('AMD Ryzen 7 7800X3D 8-Core Processor').dualCcdX3d, false)
  assert.equal(classifyCpu('AMD Ryzen 7 5800X3D 8-Core Processor').x3d, true)
  assert.equal(classifyCpu('AMD Ryzen 9 9900X 12-Core Processor').x3d, false)
  assert.equal(classifyCpu('AMD Ryzen 5 3600 6-Core Processor').family, 'zen2')
  assert.equal(classifyCpu('AMD Ryzen 7 1700 Eight-Core Processor').hvciCostly, true)
  assert.equal(classifyCpu('AMD Ryzen 7 7840HS w/ Radeon 780M Graphics').mobile, true)
  assert.equal(classifyCpu('AMD Ryzen 5 5600X 6-Core Processor').mobile, false)
})

test('CPU: Intel generations, mobile, mitigation cost and Raptor Lake desktop', () => {
  const a = classifyCpu('Intel(R) Core(TM) i9-14900K')
  assert.equal(a.gen, 14); assert.equal(a.raptorLakeDesktop, true); assert.equal(a.mitigationCost, 'low')
  assert.equal(classifyCpu('13th Gen Intel(R) Core(TM) i7-13700KF').raptorLakeDesktop, true)
  assert.equal(classifyCpu('13th Gen Intel(R) Core(TM) i7-13700H').raptorLakeDesktop, false)
  assert.equal(classifyCpu('13th Gen Intel(R) Core(TM) i7-13700H').mobile, true)
  assert.equal(classifyCpu('Intel(R) Core(TM) i5-13400').raptorLakeDesktop, false)
  assert.equal(classifyCpu('Intel(R) Core(TM) i7-7700K CPU @ 4.20GHz').mitigationCost, 'high')
  assert.equal(classifyCpu('Intel(R) Core(TM) i7-6700K CPU @ 4.00GHz').hvciCostly, true)
  assert.equal(classifyCpu('Intel(R) Core(TM) i7-8700K CPU @ 3.70GHz').hvciCostly, false)
  assert.equal(classifyCpu('Intel(R) Core(TM) Ultra 9 285K').family, 'arrow-lake')
  assert.equal(classifyCpu('Intel(R) Core(TM) Ultra 7 155H').family, 'meteor-lake')
})

test('CPU: unknown name gives nulls', () => {
  const c = classifyCpu('')
  assert.equal(c.vendor, null); assert.equal(c.gen, null)
  assert.equal(classifyCpu('Weird CPU').vendor, null)
})
