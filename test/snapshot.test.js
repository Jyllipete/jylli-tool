const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createSnapshotStore } = require('../lib/snapshot')

test('snapshot store keeps the FIRST recorded value and round-trips JSON', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jt-snap-'))
  try {
    const st = createSnapshotStore(dir)
    assert.strictEqual(st.load('msi'), null)
    st.merge('msi', { a: null, b: 1 })
    st.merge('msi', { a: 1, b: 0, c: 5 })          // later runs must not overwrite originals
    assert.deepStrictEqual(st.load('msi'), { a: null, b: 1, c: 5 })
    st.remove('msi')
    assert.strictEqual(st.load('msi'), null)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('snapshot names cannot escape the directory', () => {
  const st = createSnapshotStore(fs.mkdtempSync(path.join(os.tmpdir(), 'jt-snap-')))
  assert.throws(() => st.save('..\\evil', {}), /invalid snapshot name/)
  assert.throws(() => st.load('../x'), /invalid snapshot name/)
})
