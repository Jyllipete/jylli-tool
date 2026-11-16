const test = require('node:test')
const assert = require('node:assert/strict')
const L = require('../lib/perf/spawn-ledger')

test('powershell is labelled by the start of its script, not by its flags', () => {
  const l = L.cmdLabel('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', 'Get-Process   -Name foo\n| Select Id'])
  assert.equal(l, 'powershell: Get-Process -Name foo | Select Id')
})

test('other programs: arguments without flags; exec(): the command line minus the program', () => {
  assert.equal(L.cmdLabel('tasklist', ['/FO', 'CSV', '/NH']), 'tasklist: /FO CSV /NH')
  assert.equal(L.cmdLabel('sc.exe qc wuauserv', null), 'sc: qc wuauserv')
  assert.equal(L.cmdLabel('nvidia-smi', []), 'nvidia-smi')
})

test('drain returns per-program and per-command counts and starts a new window; labels are capped', () => {
  const led = L.createLedger()
  led.note('powershell.exe', ['-Command', 'A']); led.note('powershell.exe', ['-Command', 'A']); led.note('tasklist', ['/NH'])
  const d = led.drain()
  assert.deepEqual(d.by, { powershell: 2, tasklist: 1 })
  assert.equal(d.cmds['powershell: A'], 2)
  assert.equal(d.total, 3)
  assert.deepEqual(led.drain(), { total: 0, by: {}, cmds: {} })
  for (let i = 0; i < 300; i++) led.note('powershell.exe', ['-Command', 'script ' + i])
  const big = led.drain()
  assert.equal(big.total, 300)
  assert.ok(Object.keys(big.cmds).length <= 100)
})
