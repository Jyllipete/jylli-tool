'use strict'
const test = require('node:test')
const assert = require('node:assert')
const P = require('../js/gate/pure.js')

test('ticksLeft counts whole seconds and stays inside 0..120', () => {
  assert.strictEqual(P.ticksLeft(0, 1000), P.TICKS)
  assert.strictEqual(P.ticksLeft(121000, 1000), 120)
  assert.strictEqual(P.ticksLeft(61000, 1000), 60)
  assert.strictEqual(P.ticksLeft(60500, 1000), 60)
  assert.strictEqual(P.ticksLeft(1000, 5000), 0)
  assert.strictEqual(P.ticksLeft(999999999, 0), 120)
})

test('stageOf: stages only advance with real progress', () => {
  assert.strictEqual(P.stageOf('idle'), 0)
  assert.strictEqual(P.stageOf('opening'), 0)
  assert.strictEqual(P.stageOf('waiting', false), 2)
  assert.strictEqual(P.stageOf('waiting', true), 3)
  assert.strictEqual(P.stageOf('granted'), 4)
  assert.strictEqual(P.stageOf('denied'), 0)
})

test('reasonKey maps server reasons, unknown means not a member', () => {
  assert.strictEqual(P.reasonKey('bad_entitlement'), 'key')
  assert.strictEqual(P.reasonKey('expired'), 'expired')
  assert.strictEqual(P.reasonKey('not_in_guild'), 'member')
  assert.strictEqual(P.reasonKey(undefined), 'member')
})

test('avatarIndex uses the snowflake formula and survives bad ids', () => {
  assert.strictEqual(P.avatarIndex('80351110224678912'), Number((80351110224678912n >> 22n) % 6n))
  assert.strictEqual(P.avatarIndex('not a number'), 0)
  assert.strictEqual(P.avatarIndex(null), 0)
  assert.ok(P.avatarIndex('123456789012345678') >= 0 && P.avatarIndex('123456789012345678') <= 5)
})

test('primaryAction and tierKey', () => {
  assert.strictEqual(P.primaryAction('idle'), 'link')
  assert.strictEqual(P.primaryAction('denied', 'nope'), 'join')
  assert.strictEqual(P.primaryAction('denied', 'bad_entitlement'), 'again')
  assert.strictEqual(P.primaryAction('waiting'), null)
  assert.strictEqual(P.tierKey(true), 'premium')
  assert.strictEqual(P.tierKey(false), 'free')
  assert.strictEqual(P.tierKey(undefined), 'free')
})

test('isOffline recognises network failures only', () => {
  assert.ok(P.isOffline({ code: 'ENOTFOUND' }))
  assert.ok(P.isOffline(new Error('timeout')))
  assert.ok(!P.isOffline(new Error('bad json')))
  assert.ok(!P.isOffline(null))
})

test('avatarUrl uses the real avatar only for a valid hash and id, welcomeLine adds the name', () => {
  const id = '80351110224678912', hash = '8342729096ea3675442027381ff50dfe'
  assert.strictEqual(P.avatarUrl(id, { avatar: hash }), 'https://cdn.discordapp.com/avatars/' + id + '/' + hash + '.png?size=128')
  assert.strictEqual(P.avatarUrl(id, { avatar: 'a_' + hash }), 'https://cdn.discordapp.com/avatars/' + id + '/a_' + hash + '.png?size=128')
  assert.strictEqual(P.avatarUrl(id, { avatar: '../x' }), 'https://cdn.discordapp.com/embed/avatars/' + P.avatarIndex(id) + '.png')
  assert.strictEqual(P.avatarUrl('abc', { avatar: hash }), 'https://cdn.discordapp.com/embed/avatars/0.png')
  assert.strictEqual(P.avatarUrl(id, null), 'https://cdn.discordapp.com/embed/avatars/' + P.avatarIndex(id) + '.png')
  assert.strictEqual(P.welcomeLine('Welcome', { name: 'Pete J' }), 'Welcome, Pete J')
  assert.strictEqual(P.welcomeLine('Welcome', { name: '  ' }), 'Welcome')
  assert.strictEqual(P.welcomeLine('Welcome', null), 'Welcome')
  assert.ok(P.welcomeLine('W', { name: 'x'.repeat(99) }).length <= 35)
})

test('every reason the bot sends maps to its own message, and a banned account gets no retry', () => {
  assert.strictEqual(P.reasonKey('cancelled'), 'cancelled')
  assert.strictEqual(P.reasonKey('banned'), 'banned')
  assert.strictEqual(P.reasonKey('error'), 'error')
  assert.strictEqual(P.reasonKey('not_member'), 'member')
  assert.strictEqual(P.primaryAction('denied', 'cancelled'), 'again')
  assert.strictEqual(P.primaryAction('denied', 'error'), 'again')
  assert.strictEqual(P.primaryAction('denied', 'banned'), null)
  assert.strictEqual(P.primaryAction('denied', 'not_member'), 'join')
})
