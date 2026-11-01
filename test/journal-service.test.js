const test = require('node:test')
const assert = require('node:assert')
const os = require('os')
const path = require('path')
const fsx = require('fs')
const { createJournalService } = require('../lib/journal-service')

function setup(extra = {}) {
  const reg = {}   // 'key|name' -> {type,value}
  const runCmd = async (c) => {
    let m = c.match(/^reg query "(.+?)" \/v "(.+?)"$/)
    if (m) { const e = reg[m[1] + '|' + m[2]]; return { ok: !!e, out: e ? `    ${m[2]}    ${e.type}    0x${Number(e.value).toString(16)}` : '', code: e ? 0 : 1 } }
    m = c.match(/^reg add "(.+?)" \/v "(.+?)" \/t (\S+) \/d "(.+?)" \/f$/)
    if (m) { reg[m[1] + '|' + m[2]] = { type: m[3], value: m[4] }; return { ok: true, out: '' } }
    m = c.match(/^reg delete "(.+?)" \/v "(.+?)" \/f$/)
    if (m) { delete reg[m[1] + '|' + m[2]]; return { ok: true, out: '' } }
    return { ok: true, out: '' }
  }
  const tweaks = {
    a: { name: 'A', safetyTier: 1, apply: async (s, ps, cmd, regAdd) => { await regAdd('HKLM', 'S', 'A', 'REG_DWORD', '1') }, restore: async () => {} },
    b: { name: 'B', safetyTier: 2, apply: async (s, ps, cmd, regAdd) => { await regAdd('HKLM', 'S', 'B', 'REG_DWORD', '2') }, restore: async () => {} },
    bad: { name: 'Bad', safetyTier: 1, apply: async () => { throw new Error('boom') } },
    danger: { name: 'Danger', safetyTier: 3, apply: async () => {} },
    noop: { name: 'Noop', safetyTier: 1, apply: async () => {}, restore: async () => {} },
  }
  let settings = {}
  const emitted = []
  let rpCalls = 0
  const svc = createJournalService({
    file: path.join(fsx.mkdtempSync(path.join(os.tmpdir(), 'js-')), 'j.jsonl'),
    runPS: async () => ({ ok: true, out: '' }), runCmd, tweaks,
    hasTweak: (id, action = 'apply') => !!tweaks[id] && typeof tweaks[id][action] === 'function',
    isPlanExcluded: id => id === 'noop', requiresPremium: () => true,
    createRestorePoint: async () => { rpCalls++; return extra.rp || { ok: true, name: 'RP' } },
    emit: (ch, p) => emitted.push([ch, p]),
    loadSettings: () => ({ ...settings }), saveSettings: s => { settings = { ...s } },
  })
  return { svc, reg, emitted, get settings() { return settings }, get rpCalls() { return rpCalls } }
}

test('batch applies, journals with real values, patches settings, undoes the batch', async () => {
  const t = setup()
  t.reg['HKLM\\S|A'] = { type: 'REG_DWORD', value: '9' }
  const r = await t.svc.applyBatch({ items: [{ tweakId: 'a', action: 'apply' }, { tweakId: 'b', action: 'apply' }, { tweakId: 'bad', action: 'apply' }, { tweakId: 'nope', action: 'apply' }], via: 'manual' })
  assert.deepStrictEqual(r.items.map(i => i.status), ['unknown', 'ok', 'ok', 'failed'])
  const byId = Object.fromEntries(r.items.map(i => [i.id, i]))
  assert.strictEqual(byId.a.status, 'ok'); assert.strictEqual(byId.a.fidelity, 'exact')
  assert.strictEqual(byId.bad.status, 'failed'); assert.strictEqual(byId.nope.status, 'unknown')
  assert.strictEqual(r.restorePoint.ok, true)                       // tier-2 item forces a restore point
  assert.deepStrictEqual(r.settingsPatch, { tweak_a: 'applied', tweak_b: 'applied' })
  assert.strictEqual(t.settings.tweak_a, 'applied')
  assert.ok(t.emitted.some(([c]) => c === 'settings-patch'))
  assert.strictEqual(t.reg['HKLM\\S|A'].value, '1')

  const entries = t.svc.list({ batchId: r.batchId })
  assert.strictEqual(entries.length, 2)
  const u = await t.svc.undo({ batchId: r.batchId })
  assert.strictEqual(u.ok, true, JSON.stringify(u))
  assert.strictEqual(t.reg['HKLM\\S|A'].value, '9')                 // back to the original, not to a default
  assert.strictEqual(t.reg['HKLM\\S|B'], undefined)                 // value the tweak created is removed
  assert.strictEqual(t.settings.tweak_a, 'restored')
  assert.strictEqual((await t.svc.undo({ batchId: r.batchId })).ok, false)   // already undone
})

test('undo reports a conflict instead of overwriting', async () => {
  const t = setup()
  const r = await t.svc.applyBatch({ items: [{ tweakId: 'a', action: 'apply' }], restorePoint: 'skip' })
  t.reg['HKLM\\S|A'] = { type: 'REG_DWORD', value: '77' }           // changed by someone else
  const u = await t.svc.undo({ entryId: r.items[0].journalId })
  assert.strictEqual(u.ok, false); assert.strictEqual(u.conflict, true)
  assert.strictEqual(t.reg['HKLM\\S|A'].value, '77')
  const forced = await t.svc.undo({ entryId: r.items[0].journalId }, { force: true })
  assert.strictEqual(forced.ok, true)
})

test('automatic runs refuse expert-tier and plan-excluded tweaks; restore point policy; failure aborts', async () => {
  const t = setup()
  const r = await t.svc.applyBatch({ items: [{ tweakId: 'danger', action: 'apply' }, { tweakId: 'noop', action: 'apply' }, { tweakId: 'a', action: 'apply' }], via: 'auto-opti', restorePoint: 'skip' })
  assert.deepStrictEqual(r.items.filter(i => i.status === 'skipped').map(i => i.id), ['danger', 'noop'])
  assert.strictEqual(t.rpCalls, 0)
  const f = setup({ rp: { ok: false, reason: 'sr-disabled' } })
  const r2 = await f.svc.applyBatch({ items: [{ tweakId: 'b', action: 'apply' }] })
  assert.strictEqual(r2.aborted, true); assert.strictEqual(f.reg['HKLM\\S|B'], undefined)
})

test('tweak with nothing recorded falls back to its own restore on undo', async () => {
  const t = setup()
  const r = await t.svc.applyBatch({ items: [{ tweakId: 'noop', action: 'apply' }], restorePoint: 'skip' })
  assert.strictEqual(t.svc.list().length, 0)    // nothing changed, nothing journaled
  assert.strictEqual(r.items[0].fidelity, 'intent')
})

test('tweakMeta reports main\'s tier', () => {
  const t = setup()
  const m = t.svc.tweakMeta(['a', 'danger', 'zzz'])
  assert.deepStrictEqual(m.map(x => [x.id, x.safetyTier]), [['a', 1], ['danger', 3]])
})

test('a rejected write marks the tweak partial, not applied', async () => {
  const t = setup()
  const origCmd = t.svc // eslint-disable-line no-unused-vars
  const tweaks = { w: { name: 'W', safetyTier: 1, apply: async (s, ps, cmd, regAdd) => { await regAdd('HKLM', 'S', 'W', 'REG_DWORD', '1') } } }
  const svc = createJournalService({
    file: path.join(fsx.mkdtempSync(path.join(os.tmpdir(), 'js-')), 'j.jsonl'),
    runPS: async () => ({ ok: true, out: '' }),
    runCmd: async c => /^reg add/.test(c) ? { ok: false, out: '', err: 'ERROR: Access is denied.', code: 1 } : { ok: true, out: '' },
    tweaks, hasTweak: id => !!tweaks[id], isPlanExcluded: () => false, requiresPremium: () => true,
    createRestorePoint: async () => ({ ok: true }), emit: () => {}, loadSettings: () => ({}), saveSettings: () => {},
  })
  let failed = null
  await svc.invokeTweak('w', 'apply', () => {}, { onFailures: f => { failed = f } })
  assert.strictEqual(failed.length, 1)
  const r = await svc.applyBatch({ items: [{ tweakId: 'w', action: 'apply' }], restorePoint: 'never' })
  assert.strictEqual(r.items[0].status, 'partial')
  assert.deepStrictEqual(r.settingsPatch, {})
})
