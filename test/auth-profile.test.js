'use strict'
const test = require('node:test')
const assert = require('node:assert')
const { cleanProfile } = require('../lib/auth')

test('cleanProfile keeps a short plain name and a hex avatar hash only', () => {
  assert.deepStrictEqual(cleanProfile({ name: 'Pete J', avatar: 'a_1b2c', token: 'x' }), { name: 'Pete J', avatar: 'a_1b2c' })
  assert.deepStrictEqual(cleanProfile({ name: 'Pete', avatar: null }), { name: 'Pete', avatar: null })
  assert.deepStrictEqual(cleanProfile({ avatar: '../../x', name: '' }), null)
  assert.strictEqual(cleanProfile({ name: 'x'.repeat(100) }).name.length, 32)
  assert.strictEqual(cleanProfile('nope'), null)
  assert.strictEqual(cleanProfile(undefined), null)
})
