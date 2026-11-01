const test = require('node:test')
const assert = require('node:assert')
const { matchesVendor } = require('../lib/gpu-vendor')

test('AMD pattern no longer matches the "ati" inside Corporation', () => {
  assert.strictEqual(matchesVendor('amd', 'NVIDIA Corporation NVIDIA GeForce RTX 4070'), false)
  assert.strictEqual(matchesVendor('amd', 'Intel Corporation Intel(R) UHD Graphics'), false)
  assert.strictEqual(matchesVendor('amd', 'Advanced Micro Devices, Inc. AMD Radeon RX 7800 XT'), true)
  assert.strictEqual(matchesVendor('amd', 'ATI Technologies Inc. Radeon HD 5770'), true)
  assert.strictEqual(matchesVendor('amd', 'AMD Radeon(TM) Graphics'), true)
})

test('NVIDIA pattern', () => {
  assert.strictEqual(matchesVendor('nvidia', 'NVIDIA Corporation NVIDIA GeForce RTX 4070'), true)
  assert.strictEqual(matchesVendor('nvidia', 'AMD Radeon RX 6600'), false)
})
