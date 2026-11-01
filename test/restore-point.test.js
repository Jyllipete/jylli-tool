const test = require('node:test')
const assert = require('node:assert')
const { createRestorePointService, buildScript, parseResult, cleanDesc } = require('../lib/restore-point')

test('only an explicit RP_OK with a sequence number counts as success', () => {
  assert.deepStrictEqual(parseResult({ out: 'noise\nRP_OK:42\n' }), { ok: true, seq: 42 })
  assert.strictEqual(parseResult({ out: '' }).ok, false)
  assert.strictEqual(parseResult({ out: 'RP_OK' }).ok, false)
  assert.strictEqual(parseResult({ out: 'WARNING: skipped', ok: true }).ok, false)
})

test('failures keep their code, reason and user guidance', () => {
  const a = parseResult({ out: 'RP_FAIL:not_admin:Administrator rights are required' })
  assert.strictEqual(a.code, 'not_admin'); assert.match(a.guidance, /administrator/i)
  const b = parseResult({ out: 'RP_FAIL:not_created:Windows accepted the request but no restore point appeared' })
  assert.strictEqual(b.code, 'not_created'); assert.match(b.guidance, /System Protection/)
  const c = parseResult({ out: '', err: 'boom' })
  assert.strictEqual(c.reason, 'boom')
})

test('script checks admin, confirms a new sequence number and restores what it changed', () => {
  const s = buildScript("Quick'; Remove-Item C:/ #")
  assert.ok(s.indexOf('IsInRole') < s.indexOf('Checkpoint-Computer'))
  assert.match(s, /\$after -gt \$before/)
  assert.match(s, /finally/)
  assert.match(s, /\$origFreq/)
  assert.ok(!s.includes("Quick'"), 'description is sanitized')
  assert.strictEqual(cleanDesc("a'b;c"), 'abc')
})

test('service never throws and reports the guidance', async () => {
  const lines = []
  const svc = createRestorePointService({ runPS: async () => { throw new Error('spawn failed') } })
  const r = await svc.create('x', (m, l) => lines.push([l, m]))
  assert.strictEqual(r.ok, false)
  assert.ok(lines.some(([l]) => l === 'err'))
  const ok = await createRestorePointService({ runPS: async () => ({ ok: true, out: 'RP_OK:7' }) }).create('x')
  assert.deepStrictEqual(ok, { ok: true, seq: 7 })
})
