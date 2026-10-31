const test = require('node:test')
const assert = require('node:assert')
const { parseCmd, readBackCmd, parseReadBack, restoreCmd, tokenize } = require('../lib/cmd-parse')

test('tokenize keeps quoted strings together', () => {
  assert.deepStrictEqual(tokenize('reg add "HKLM\\A B" /v X'), ['reg', 'add', 'HKLM\\A B', '/v', 'X'])
})

test('reg add / delete', () => {
  const [a] = parseCmd('reg add "HKCU\\Software\\X" /v Foo /t REG_DWORD /d 1 /f')
  assert.deepStrictEqual(a, { kind: 'reg', op: 'set', key: 'HKCU\\Software\\X', name: 'Foo', type: 'REG_DWORD', data: '1' })
  const [d] = parseCmd('reg delete "HKCU\\Software\\X" /v Foo /f')
  assert.strictEqual(d.op, 'delete')
  assert.strictEqual(parseCmd('reg delete "HKCU\\Software\\X" /f')[0].kind, 'unresolved')
  assert.deepStrictEqual(parseCmd('reg query "HKCU\\Software\\X" /v Foo'), [])
})

test('sc config both spellings', () => {
  assert.deepStrictEqual(parseCmd('sc config DiagTrack start= disabled'), [{ kind: 'service', name: 'DiagTrack', startType: 'disabled' }])
  assert.strictEqual(parseCmd('sc config DiagTrack start=auto')[0].startType, 'auto')
  assert.deepStrictEqual(parseCmd('sc query DiagTrack'), [])
})

test('bcdedit set and deletevalue', () => {
  assert.deepStrictEqual(parseCmd('bcdedit /set useplatformclock false')[0], { kind: 'bcd', op: 'set', id: '{current}', name: 'useplatformclock', value: 'false' })
  assert.strictEqual(parseCmd('bcdedit /deletevalue useplatformtick')[0].op, 'delete')
  assert.deepStrictEqual(parseCmd('bcdedit /enum'), [])
})

test('powercfg set values, active scheme, read-only', () => {
  const [p] = parseCmd('powercfg /setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PERFBOOSTMODE 2')
  assert.strictEqual(p.kind, 'powercfg'); assert.strictEqual(p.ac, true); assert.strictEqual(p.value, '2')
  assert.strictEqual(parseCmd('powercfg -setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c')[0].kind, 'powercfg-active')
  assert.deepStrictEqual(parseCmd('powercfg /list'), [])
  assert.strictEqual(parseCmd('powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61')[0].kind, 'unresolved')
})

test('chained commands', () => {
  const r = parseCmd('sc config A start= disabled & sc stop A && reg add "HKCU\\X" /v Y /t REG_SZ /d z /f')
  assert.deepStrictEqual(r.map(x => x.kind), ['service', 'reg'])
})

test('read back parsing', () => {
  const d = { kind: 'reg', key: 'HKCU\\X', name: 'Y' }
  assert.deepStrictEqual(parseReadBack(d, '\r\nHKEY_CURRENT_USER\\X\r\n    Y    REG_DWORD    0x1f\r\n'), { exists: true, type: 'REG_DWORD', value: '31' })
  assert.deepStrictEqual(parseReadBack(d, ''), { exists: false })
  assert.deepStrictEqual(parseReadBack({ kind: 'service', name: 'S' }, '        START_TYPE         : 4   DISABLED'), { exists: true, value: 'disabled' })
  assert.deepStrictEqual(parseReadBack({ kind: 'bcd', id: '{current}', name: 'nx' }, 'nx                     OptIn\r\nfoo   bar'), { exists: true, value: 'OptIn' })
  assert.deepStrictEqual(parseReadBack({ kind: 'powercfg', ac: true }, '  Current AC Power Setting Index: 0x00000002\r\n  Current DC Power Setting Index: 0x00000001'), { exists: true, value: '2' })
})

test('restore commands', () => {
  const d = { kind: 'reg', key: 'HKCU\\X', name: 'Y' }
  assert.strictEqual(restoreCmd(d, { exists: false }), 'reg delete "HKCU\\X" /v "Y" /f')
  assert.strictEqual(restoreCmd(d, { exists: true, type: 'REG_DWORD', value: '31' }), 'reg add "HKCU\\X" /v "Y" /t REG_DWORD /d "31" /f')
  assert.strictEqual(restoreCmd({ kind: 'service', name: 'S' }, { exists: true, value: 'auto' }), 'sc config "S" start= auto')
  assert.strictEqual(restoreCmd({ kind: 'bcd', id: '{current}', name: 'nx' }, { exists: false }), 'bcdedit /deletevalue {current} nx')
  assert.strictEqual(restoreCmd(d, { unknown: true }), null)
})
