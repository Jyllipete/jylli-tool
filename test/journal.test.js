const test = require('node:test')
const assert = require('node:assert')
const os = require('os')
const path = require('path')
const fsx = require('fs')
const { createJournal, buildEntry, fidelityOf, undoEntry, sameState } = require('../lib/journal')
const prelude = require('../lib/journal-prelude')
const { createWriteLog, mergeIncoming } = require('../lib/settings-merge')

const tmp = () => path.join(fsx.mkdtempSync(path.join(os.tmpdir(), 'jj-')), 'j.jsonl')
const regChange = (name, b, a) => ({ kind: 'reg', via: 'ps', path: 'HKCU:\\Software\\T', name, before: b, after: a })

test('fidelity', () => {
  assert.strictEqual(fidelityOf([]), 'intent')
  assert.strictEqual(fidelityOf([regChange('A', { exists: false }, { exists: true, type: 'DWord', value: 1 })]), 'exact')
  assert.strictEqual(fidelityOf([{ kind: 'unresolved', cmd: 'x' }]), 'partial')
})

test('record, list filters, markUndone, torn line', () => {
  const file = tmp()
  let t = 1000
  const j = createJournal({ file, now: () => t++ })
  const a = j.record({ tweakId: 'a', via: 'manual', batchId: 'b1', changes: [regChange('A', { exists: false }, { exists: true, type: 'DWord', value: 1 })] })
  j.record({ tweakId: 'b', via: 'auto-opti', batchId: 'b1', changes: [] })
  assert.strictEqual(j.list().length, 2)
  assert.strictEqual(j.list()[0].tweakId, 'b')                 // newest first
  assert.strictEqual(j.list({ via: 'auto-opti' }).length, 1)
  assert.strictEqual(j.list({ batchId: 'b1' }).length, 2)
  j.markUndone(a.id, 'u1')
  assert.strictEqual(j.get(a.id).undoneBy, 'u1')
  fsx.appendFileSync(file, '{"v":1,"id":"torn')
  assert.strictEqual(j.list().length, 2)                       // torn tail ignored
  assert.strictEqual(buildEntry({ via: 'nonsense' }).via, 'manual')
})

test('rotate drops entries older than 90 days', () => {
  const file = tmp()
  let t = Date.now() - 100 * 24 * 3600 * 1000
  const j = createJournal({ file, now: () => t })
  j.record({ tweakId: 'old' })
  t = Date.now()
  j.record({ tweakId: 'new' })
  assert.strictEqual(j.rotate(), 1)
  assert.deepStrictEqual(j.list().map(e => e.tweakId), ['new'])
})

test('undo: conflict is reported and nothing is written', async () => {
  const entry = buildEntry({ changes: [regChange('A', { exists: true, type: 'DWord', value: 0 }, { exists: true, type: 'DWord', value: 1 })] })
  const calls = []
  const ps = async s => { calls.push(s); return { out: s.includes('JJSTATE') || s.includes('GetValueNames') ? 'JJSTATE{"e":true,"t":"DWord","v":5}' : 'JJOK' } }
  const r = await undoEntry(entry, { ps, cmd: async () => ({}) })
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.conflicts.length, 1)
  assert.strictEqual(calls.length, 1)                          // only the read
  const r2 = await undoEntry(entry, { ps, cmd: async () => ({}), force: true })
  assert.strictEqual(r2.ok, true)
  assert.ok(calls.at(-1).includes('Set-ItemProperty') && calls.at(-1).includes('[int]0'))
})

test('undo: reverse order, removes created value, stops at first failure, skips unresolved', async () => {
  const entry = buildEntry({ changes: [
    regChange('A', { exists: false }, { exists: true, type: 'DWord', value: 1 }),
    { kind: 'unresolved', cmd: 'netsh x' },
    { kind: 'service', via: 'ps', name: 'S', before: { exists: true, value: 'auto' }, after: { exists: true, value: 'disabled' } },
  ] })
  const order = []
  const ps = async s => {
    if (s.includes('GetValueNames')) return { out: 'JJSTATE{"e":true,"t":"DWord","v":1}' }
    order.push('ps:' + (s.includes('Remove-ItemProperty') ? 'remove' : 'set')); return { out: 'JJOK' }
  }
  const cmd = async c => {
    if (c.startsWith('sc qc')) return { out: 'START_TYPE : 4 DISABLED', code: 0 }
    order.push('cmd:' + c); return { ok: true }
  }
  const r = await undoEntry(entry, { ps, cmd })
  assert.strictEqual(r.ok, true)
  assert.deepStrictEqual(order, ['cmd:sc config "S" start= auto', 'ps:remove'])
  assert.deepStrictEqual(r.results.map(x => x.status), ['restored', 'skipped', 'restored'])
  const failing = await undoEntry(entry, { ps, cmd: async c => c.startsWith('sc qc') ? { out: 'START_TYPE : 4 DISABLED' } : { ok: false } })
  assert.strictEqual(failing.ok, false)
  assert.strictEqual(failing.results.length, 1)
})

test('sameState', () => {
  assert.ok(sameState({ exists: false }, { exists: false }))
  assert.ok(sameState({ exists: true, value: 1 }, { exists: true, value: '1' }))
  assert.ok(!sameState({ exists: true, value: 1 }, { exists: false }))
})

test('prelude extract strips ##JJ lines and normalises', () => {
  const out = 'hello\n##JJ{"k":"reg","p":"HKCU:\\\\X","n":"A","b":{"e":false},"a":{"e":true,"t":"DWord","v":1}}\n##JJ{"k":"service","p":"","n":"S","b":{"e":true,"v":"auto"},"a":{"e":true,"v":"disabled"}}\n##JJ{broken\nbye'
  const r = prelude.extract(out)
  assert.strictEqual(r.clean, 'hello\nbye')
  assert.strictEqual(r.bad, 1)
  assert.deepStrictEqual(r.changes[0], { kind: 'reg', via: 'ps', path: 'HKCU:\\X', name: 'A', before: { exists: false }, after: { exists: true, type: 'DWord', value: 1 } })
  assert.strictEqual(r.changes[1].after.value, 'disabled')
})

test('prelude staticScan finds native lines and uninterceptable cmdlets', () => {
  const s = prelude.staticScan('bcdedit /set useplatformclock false\npowercfg /setactive $guid\nnetsh int tcp set global rss=enabled\nStop-Service Foo')
  assert.strictEqual(s.native.length, 1)
  assert.ok(s.unresolved.length >= 2)
})

test('settings merge keeps main\'s recent writes', () => {
  let t = 0
  const log = createWriteLog({ now: () => t, windowMs: 100 })
  log.note('tweak_a', 'applied')
  assert.deepStrictEqual(mergeIncoming({ tweak_a: 'default', x: 1 }, log.recent()), { tweak_a: 'applied', x: 1 })
  t = 500
  assert.deepStrictEqual(mergeIncoming({ tweak_a: 'default' }, log.recent()), { tweak_a: 'default' })
})

test('custom kinds dispatch to handlers[kind]; missing handler is skipped', async () => {
  const entry = { changes: [{ kind: 'display-mode', device: 'D1', before: { exists: true, value: 60 }, after: { exists: true, value: 165 } }] }
  let restored = null
  const handlers = { 'display-mode': { read: async () => ({ exists: true, value: 165 }), restore: async c => { restored = c.before.value; return true } } }
  const r = await undoEntry(entry, { ps: async () => ({}), cmd: async () => ({}), handlers })
  assert.strictEqual(r.ok, true)
  assert.strictEqual(restored, 60)
  const r2 = await undoEntry(entry, { ps: async () => ({}), cmd: async () => ({}), handlers: {} })
  assert.strictEqual(r2.results[0].status, 'skipped')
  assert.strictEqual(r2.results[0].detail, 'no-handler')
})

test('task changes: extract, undo restores the previous state', () => {
  const line = '##JJ' + JSON.stringify({ k: 'task', p: '\\Microsoft\\X\\', n: 'T1', b: { e: true, v: 'Enabled' }, a: { e: true, v: 'Disabled' } })
  const out = prelude.extract('hi\n' + line + '\nbye')
  assert.strictEqual(out.changes.length, 1)
  assert.deepStrictEqual(out.changes[0], { kind: 'task', via: 'ps', path: '\\Microsoft\\X\\', name: 'T1', before: { exists: true, value: 'Enabled' }, after: { exists: true, value: 'Disabled' } })
  assert.strictEqual(out.clean, 'hi\nbye')
})

test('task undo runs Enable-ScheduledTask when it was enabled before', async () => {
  const entry = { changes: [{ kind: 'task', via: 'ps', path: '\\A\\', name: 'T', before: { exists: true, value: 'Enabled' }, after: { exists: true, value: 'Disabled' } }] }
  const scripts = []
  const ps = async s => { scripts.push(s); return { out: /Get-ScheduledTask/.test(s) ? 'JJSTATE{"e":true,"v":"Disabled"}' : 'JJOK' } }
  const r = await undoEntry(entry, { ps, cmd: async () => ({}) })
  assert.strictEqual(r.ok, true)
  assert.ok(scripts.some(s => /Enable-ScheduledTask/.test(s)))
})

test('verifyEntry separates intact, drifted and unknown changes', async () => {
  const { verifyEntry } = require('../lib/journal')
  const entry = { changes: [
    { kind: 'task', path: '\\A\\', name: 'T', before: { exists: true, value: 'Enabled' }, after: { exists: true, value: 'Disabled' } },
    { kind: 'task', path: '\\A\\', name: 'U', before: { exists: true, value: 'Enabled' }, after: { exists: true, value: 'Disabled' } },
    { kind: 'unresolved', cmd: 'netsh' },
  ] }
  const ps = async s => ({ out: 'JJSTATE{"e":true,"v":"' + (/'U'/.test(s) ? 'Enabled' : 'Disabled') + '"}' })
  const r = await verifyEntry(entry, { ps, cmd: async () => ({}) })
  assert.deepStrictEqual(r.same, [0])
  assert.strictEqual(r.drifted.length, 1)
  assert.strictEqual(r.drifted[0].i, 1)
  assert.deepStrictEqual(r.unknown, [2])
})
