const test = require('node:test')
const assert = require('node:assert')
const { scrubPaths } = require('../lib/privacy')

test('scrubPaths removes user names from Windows and POSIX paths', () => {
  const out = scrubPaths('at fn (C:\\Users\\Pete\\AppData\\Local\\a.js:1:2)\n at C:/Users/Jane Doe/x.js\n/home/bob/y.js')
  assert.ok(!/Pete|bob/.test(out), out)
  assert.ok(out.includes('C:\\Users\\<user>\\AppData\\Local\\a.js'))
  assert.ok(out.includes('/Users/<user>/y.js'))
})

test('scrubPaths passes non-strings through', () => {
  assert.strictEqual(scrubPaths(undefined), undefined)
  assert.strictEqual(scrubPaths(5), 5)
})
