const test = require('node:test')
const assert = require('node:assert')
const v = require('../lib/validate')

const INJECTIONS = [
  "a');calc;('", '$(calc)', '`calc`', 'a"; calc; "', 'a & calc', 'a | calc', 'a\ncalc', 'a\r\ncalc', '..\\..\\x', "x' -or '1'='1", '; Remove-Item C:\\ -Recurse',
]

test('psQuote neutralises single quotes (incl. unicode lookalikes PowerShell treats as quotes)', () => {
  assert.strictEqual(v.psQuote("it's"), "'it''s'")
  assert.strictEqual(v.psQuote("a');calc;('"), "'a'');calc;('''")
})

test('psQuote output can never contain an unescaped quote', () => {
  for (const s of INJECTIONS.concat(["\u2018x\u2019", 'plain'])) {
    const q = v.psQuote(s)
    const inner = q.slice(1, -1)
    assert.ok(q.startsWith("'") && q.endsWith("'"))
    // every quote-like char in the body must be doubled
    assert.strictEqual(inner.replace(/(['\u2018\u2019\u201A\u201B])\1/g, '').match(/['\u2018\u2019\u201A\u201B]/), null, s)
  }
})

test('device instance ids', () => {
  assert.ok(v.isDeviceInstanceId('PCI\\VEN_10DE&DEV_2204\\4&1A2B3C&0&0008'))
  assert.ok(v.isDeviceInstanceId('USB\\VID_046D&PID_C52B\\5&2B2F4E1&0&2'))
  // backslash and dot are legal in instance ids (not a file path), everything else dangerous must fail
  for (const s of INJECTIONS.filter(x => x !== '..\\..\\x').concat(['', 'a', 5, null])) assert.ok(!v.isDeviceInstanceId(s), String(s))
})

test('task / service / process / adapter names', () => {
  assert.ok(v.isJylliTaskName('JT_clean-temp_1'))
  for (const s of ["JT_a'b", 'Microsoft\\Windows\\x', 'JT_', 'JT_a b', ...INJECTIONS]) assert.ok(!v.isJylliTaskName(s), s)
  assert.ok(v.isServiceName('wuauserv'))
  for (const s of ['a b', 'x;y', '', ...INJECTIONS]) assert.ok(!v.isServiceName(s), s)
  assert.ok(v.isAdapterName('Ethernet 2') && v.isAdapterName('vEthernet (WSL)'))
  for (const s of ['a"b', 'a&b', 'a|b', "a'b", ...INJECTIONS]) assert.ok(!v.isAdapterName(s), s)
  assert.ok(v.isProcessName('Discord.exe'))
  for (const s of ["a'b", 'a;b', 'a\nb']) assert.ok(!v.isProcessName(s), s)
})

test('ip / host / port / colour / numbers', () => {
  assert.ok(v.isIp('1.1.1.1') && v.isIp('2606:4700:4700::1111'))
  for (const s of ['1.1.1.1 & calc', '1.1.1', 'cloudflare.com', '']) assert.ok(!v.isIp(s), s)
  assert.ok(v.isHostname('runtime.fivem.net') && v.isHostname('127.0.0.1'))
  for (const s of ['a b', 'a;b', '-a.com', 'a..b', ...INJECTIONS]) assert.ok(!v.isHostname(s), s)
  assert.ok(v.isPort(443) && !v.isPort(0) && !v.isPort(70000) && !v.isPort('80') && !v.isPort(1.5))
  assert.ok(v.isHexColor('#a1B2c3') && !v.isHexColor('red') && !v.isHexColor('#12345') && !v.isHexColor('#12345g'))
  assert.strictEqual(v.clampNum('5', 0, 10), 5)
  assert.strictEqual(v.clampNum(50, 0, 10), 10)
  assert.strictEqual(v.clampNum('0 & calc', 0, 10), null)
  assert.strictEqual(v.clampNum(NaN, 0, 10), null)
  assert.strictEqual(v.inRange(11, 0, 10), null)
  assert.strictEqual(v.inRange('-30', -40, 0), -30)
})

test('isSafeGamePath accepts game folders, rejects roots, system dirs, wildcards and traversal', () => {
  const B = '\\'
  const j = (...p) => p.join(B)
  for (const ok of [j('D:', 'Games', 'Steam', 'steamapps', 'common', 'Rust'), j('C:', 'Program Files', 'Epic Games', 'Fortnite'), j('C:', 'Users', 'Pete', 'AppData', 'Local', 'FiveM')])
    assert.ok(v.isSafeGamePath(ok), ok)
  for (const bad of ['C:' + B, j('C:', 'Games'), j('C:', 'Windows', 'System32'), j('C:', 'Users', 'Pete'), j('C:', 'ProgramData', 'x'), B + B + j('server', 'share', 'x'),
    j('C:', 'Games', '*'), j('C:', 'Games', '..', 'Windows', 'x'), j('relative', 'path', 'x'), j('C:', 'Games', 'a\nb'), '', null, 5])
    assert.ok(!v.isSafeGamePath(bad), String(bad))
})
