const test = require('node:test')
const assert = require('node:assert')
const { isStrictSubpath, topFolderUnder } = require('../lib/paths')

const B = '\\'
const j = (...p) => p.join(B)

test('isStrictSubpath: inside yes; root, siblings with shared prefix, traversal and other drives no', () => {
  const root = j('C:', 'Program Files')
  assert.ok(isStrictSubpath(root, j('C:', 'Program Files', 'Game')))
  assert.ok(isStrictSubpath(root, j('c:', 'program files', 'Game', 'bin')))
  assert.ok(!isStrictSubpath(root, root))
  assert.ok(!isStrictSubpath(root, root + B))
  assert.ok(!isStrictSubpath(root, j('C:', 'Program FilesX', 'Game')))
  assert.ok(!isStrictSubpath(root, j('C:', 'Program Files', '..', 'Windows')))
  assert.ok(!isStrictSubpath(root, j('D:', 'Program Files', 'Game')))
  assert.ok(!isStrictSubpath(root, ''))
  assert.ok(!isStrictSubpath(null, root))
})

test('topFolderUnder returns the application folder name', () => {
  assert.strictEqual(topFolderUnder(j('C:', 'Program Files'), j('C:', 'Program Files', 'Common Files', 'x')), 'common files')
})
