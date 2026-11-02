const test = require('node:test')
const assert = require('node:assert')
const { splitProtected } = require('../lib/uwp-protect')

test('shield on by default holds back Store and Xbox sign-in packages', () => {
  const r = splitProtected(['Microsoft.BingWeather', 'microsoft.windowsstore', 'Microsoft.XboxIdentityProvider'])
  assert.deepStrictEqual(r.allowed, ['Microsoft.BingWeather'])
  assert.strictEqual(r.protectedPkgs.length, 2)
})

test('shield off lets everything through', () => {
  const r = splitProtected(['Microsoft.WindowsStore'], false)
  assert.deepStrictEqual(r.allowed, ['Microsoft.WindowsStore'])
  assert.deepStrictEqual(r.protectedPkgs, [])
})

test('non-array input is treated as empty', () => {
  assert.deepStrictEqual(splitProtected(null).allowed, [])
})
