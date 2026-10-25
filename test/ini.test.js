const test = require('node:test')
const assert = require('node:assert')
const ini = require('../lib/ini')

const allowed = new Set(['StreamingMemory', 'MaxLodDistance', 'MaximumGrass'])

test('applyIniChanges updates anchored keys only and leaves similar keys alone', () => {
  const src = 'MaxLodDistance=100\nMaxObjectLodDistance=100\nStreamingMemory = 500\n; StreamingMemory=1\n'
  const out = ini.applyIniChanges(src, { MaxLodDistance: 30, StreamingMemory: 1024 }, allowed)
  assert.deepStrictEqual(out.applied.sort(), ['MaxLodDistance', 'StreamingMemory'])
  assert.match(out.content, /^MaxLodDistance=30$/m)
  assert.match(out.content, /^MaxObjectLodDistance=100$/m)
  assert.match(out.content, /^StreamingMemory ?=\s?1024$/m)
  assert.match(out.content, /^; StreamingMemory=1$/m)
})

test('applyIniChanges appends missing keys', () => {
  assert.strictEqual(ini.applyIniChanges('A=1', { MaximumGrass: true }, allowed).content, 'A=1\nMaximumGrass=1\n')
})

test('applyIniChanges rejects unknown keys, newline/regex/replace-pattern injection', () => {
  const out = ini.applyIniChanges('MaxLodDistance=100\n', {
    'Evil\nKey': 1, 'MaxLodDistance.*': 1, NotAllowed: 1,
    MaximumGrass: '1\nInjected=1', StreamingMemory: '$&$1', MaxLodDistance: { toString: () => '5' },
  }, allowed)
  assert.deepStrictEqual(out.applied, [])
  assert.strictEqual(out.content, 'MaxLodDistance=100\n')
  assert.strictEqual(out.skipped.length, 6)
})

test('isSafeXmlValue', () => {
  for (const ok of [1, 0.5, 'High', 'true', '1.25']) assert.ok(ini.isSafeXmlValue(ok), String(ok))
  for (const bad of ['"/><evil', '<x>', 'a b', '$&', '', 'x'.repeat(40), NaN, null]) assert.ok(!ini.isSafeXmlValue(bad), String(bad))
})
