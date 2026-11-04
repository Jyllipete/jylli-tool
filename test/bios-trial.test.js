'use strict'
// Boot trial: state handling, merge of restore values, task arguments, and the REAL startup script in dry-run mode (no BIOS access).
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const bt = require('../lib/bios/boot-trial')

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'jbios-trial-'))

test('arm writes state and the script; script never contains restore values', () => {
  const dir = tmp()
  const r = bt.arm(dir, { engine: 'hp-wmi', snapshotId: 7, restore: [{ name: 'Turbo Boost', value: 'Enable' }], now: 1000 })
  assert.equal(r.ok, true)
  assert.equal(bt.read(dir).status, 'armed'); assert.equal(bt.read(dir).maxCrashes, 2)
  assert.equal(bt.scriptIntact(dir), true)
  assert.ok(!fs.readFileSync(bt.paths(dir).script, 'utf8').includes('Turbo Boost'))
  fs.writeFileSync(bt.paths(dir).script, 'tampered')
  assert.equal(bt.scriptIntact(dir), false)
})

test('only HP is supported; a second arm keeps the earliest value per setting', () => {
  const dir = tmp()
  assert.equal(bt.arm(dir, { engine: 'scewin', snapshotId: 1, restore: [] }).error, 'engine_unsupported')
  bt.arm(dir, { engine: 'hp-wmi', snapshotId: 1, restore: [{ name: 'A', value: 'old' }] })
  const s = bt.arm(dir, { engine: 'hp-wmi', snapshotId: 2, restore: [{ name: 'A', value: 'newer' }, { name: 'B', value: 'b0' }] }).state
  assert.deepEqual(s.restore, [{ name: 'A', value: 'old' }, { name: 'B', value: 'b0' }])
  assert.equal(s.snapshotId, 2)
})

test('disarm marks the state; task arguments run the script as SYSTEM at startup', () => {
  const dir = tmp()
  bt.arm(dir, { engine: 'hp-wmi', snapshotId: 1, restore: [{ name: 'A', value: 'x' }] })
  assert.equal(bt.disarm(dir).status, 'disarmed'); assert.equal(bt.read(dir).status, 'disarmed')
  assert.equal(bt.disarm(tmp()), null)
  const a = bt.createArgs(dir)
  assert.ok(a.includes('SYSTEM') && a.includes('ONSTART') && a.includes(bt.TASK))
  assert.match(a[a.length - 1], /-StateDir/)
  assert.deepEqual(bt.deleteArgs().slice(0, 3), ['/Delete', '/TN', bt.TASK])
})

test('startup script (dry run): reverts at 2 crashes, waits below, ignores non-armed state', { skip: process.platform !== 'win32' }, () => {
  const run = (dir, n) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', bt.paths(dir).script, '-StateDir', dir, '-DryRun', '-CrashOverride', String(n)], { encoding: 'utf8', timeout: 60000 }).trim()
  const dir = tmp()
  bt.arm(dir, { engine: 'hp-wmi', snapshotId: 1, restore: [{ name: 'A', value: 'x' }] })
  assert.equal(run(dir, 0), 'WOULD_WAIT')
  assert.equal(run(dir, 1), 'WOULD_WAIT')
  assert.equal(run(dir, 2), 'WOULD_REVERT')
  assert.equal(run(dir, 5), 'WOULD_REVERT')
  bt.disarm(dir)
  assert.equal(run(dir, 9), '')   // nothing to do once disarmed
  assert.equal(bt.read(dir).status, 'disarmed')   // dry run changed nothing
})

test('state written by Windows PowerShell (UTF-8 with BOM) is still readable', () => {
  const dir = tmp()
  bt.arm(dir, { engine: 'hp-wmi', snapshotId: 1, restore: [{ name: 'A', value: 'x' }] })
  const s = JSON.parse(fs.readFileSync(bt.paths(dir).state, 'utf8')); s.status = 'reverted'
  fs.writeFileSync(bt.paths(dir).state, '\uFEFF' + JSON.stringify(s))
  assert.equal(bt.read(dir).status, 'reverted')
})
