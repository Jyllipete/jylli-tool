const test = require('node:test')
const assert = require('node:assert')
const detect = require('../lib/windows/detect')
const Windows = require('../lib/windows')

const DVR = 'r|HKCU:\\System\\GameConfigStore|GameDVR_Enabled'

// A fake PC: `reg` holds readings by probe key; applyBatch flips them like the real tweaks would.
function harness(o = {}) {
  const calls = { ps: 0, batch: [], undo: [] }
  const reg = {}
  for (const r of detect.requests(detect.plan())) reg[r.k] = r.a === 's' || r.a === 't' ? 'Automatic' : r.a === 'f' ? 'True' : r.a === 'x' ? 'True' : null
  const store = { v: null }
  const settings = { ...(o.settings || {}) }
  const meta = o.meta || {}
  const deps = {
    runPS: async () => { calls.ps++; return o.psFail ? { ok: false, out: '' } : { ok: true, out: 'noise\nJJWIN:' + JSON.stringify(reg) + '\n' } },
    applyBatch: async req => {
      calls.batch.push(req)
      if (o.abort) return { ok: false, aborted: true, reason: 'restore-point-failed', guidance: 'Turn on System Protection', restorePoint: { ok: false } }
      const items = req.items.map(i => {
        if (o.fail && o.fail.includes(i.tweakId)) return { id: i.tweakId, action: i.action, status: 'failed', error: 'boom' }
        if (!o.noFlip) { if (i.tweakId === 'game-dvr') reg[DVR] = i.action === 'apply' ? '0' : '1'; if (i.tweakId === 'sysmain') reg['s|SysMain'] = i.action === 'apply' ? 'Disabled' : 'Automatic' }
        settings['tweak_' + i.tweakId] = i.action === 'apply' ? 'applied' : 'restored'
        return { id: i.tweakId, action: i.action, status: 'ok', journalId: 'j_' + i.tweakId, fidelity: 'exact' }
      })
      return { ok: true, batchId: 'b1', items, restorePoint: { ok: true } }
    },
    journalList: () => o.journal || [],
    undo: async (t, opt) => { calls.undo.push([t, opt]); reg[DVR] = '1'; settings.tweak_game_dvr = 'restored'; return { ok: true } },
    tweakMeta: ids => ids.filter(id => meta[id] !== null).map(id => ({ id, safetyTier: 1, retired: null, risk: null, ...(meta[id] || {}) })),
    applicability: () => ({}), settings: () => settings, state: { read: () => store.v, write: v => { store.v = JSON.parse(JSON.stringify(v)) } },
    bootMs: () => 1000, now: () => 5000,
  }
  return { svc: Windows.create(deps), calls, reg, settings, store }
}

test('scan: one read-only probe, models for both tabs, remembered state persisted', async () => {
  const h = harness()
  const r = await h.svc.scan()
  assert.ok(r.ok && r.read && !r.stale)
  assert.strictEqual(h.calls.ps, 1)
  assert.ok(r.models.windows.items.length > 30 && r.models.qol.items.length === 12)
  assert.ok(h.store.v.last.readings)
})

test('scan: when Windows cannot be read the last known state is shown, marked stale', async () => {
  const h = harness()
  await h.svc.scan()
  const bad = Windows.create({ ...{}, runPS: async () => ({ ok: false, out: '' }), applyBatch: async () => ({}), journalList: () => [], undo: async () => ({}), tweakMeta: () => [], applicability: () => ({}), settings: () => ({}), state: { read: () => h.store.v, write: () => {} }, now: () => 9000 })
  const r = await bad.scan()
  assert.ok(r.stale && r.read && r.models.windows.live)
  const none = Windows.create({ runPS: async () => ({ ok: false }), tweakMeta: () => [], state: { read: () => null, write: () => {} }, settings: () => ({}), applicability: () => ({}), now: () => 1 })
  const r2 = await none.scan()
  assert.ok(!r2.read && r2.models.windows.verdict.kind === 'unread')
})

test('run: journaled batch through the manual path, then read back to verify', async () => {
  const h = harness()
  await h.svc.scan()
  const prog = []
  const r = await h.svc.run({ ids: ['game-dvr', 'sysmain'], action: 'apply', onProgress: p => prog.push(p.phase) })
  assert.ok(r.ok)
  assert.strictEqual(h.calls.batch[0].via, 'manual')
  assert.deepStrictEqual(h.calls.batch[0].items, [{ tweakId: 'game-dvr', action: 'apply' }, { tweakId: 'sysmain', action: 'apply' }])
  assert.strictEqual(h.calls.ps, 2, 'one probe before, one after')
  assert.deepStrictEqual(r.receipt.items.map(i => [i.id, i.status, i.verified]), [['game-dvr', 'ok', true], ['sysmain', 'ok', true]])
  assert.strictEqual(r.receipt.counts.verified, 2)
  assert.deepStrictEqual(prog, ['start', 'verify', 'done'])
  assert.strictEqual(r.models.windows.items.find(i => i.id === 'game-dvr').status, 'on')
  assert.strictEqual(h.store.v.runs[0].batchId, 'b1')
})

test('run: a change Windows does not show afterwards is reported as a mismatch, not as success', async () => {
  const h = harness({ noFlip: true })
  const r = await h.svc.run({ ids: ['game-dvr'], action: 'apply' })
  assert.strictEqual(r.receipt.items[0].verified, false)
  assert.strictEqual(r.receipt.counts.mismatch, 1)
})

test('run: a failed item is reported with its reason and the others still count', async () => {
  const h = harness({ fail: ['sysmain'] })
  const r = await h.svc.run({ ids: ['game-dvr', 'sysmain'], action: 'apply' })
  assert.strictEqual(r.receipt.counts.ok, 1); assert.strictEqual(r.receipt.counts.failed, 1)
  assert.strictEqual(r.receipt.items[1].error, 'boom')
})

test('run: no restore point means no change, and the guidance is passed on', async () => {
  const h = harness({ abort: true })
  const r = await h.svc.run({ ids: ['game-dvr'], action: 'apply' })
  assert.ok(!r.ok && r.aborted && r.guidance)
  assert.strictEqual(h.calls.ps, 0)
})

test('run: only catalog ids, no retired apply (restore is allowed), single flight', async () => {
  const h = harness({ meta: { hpet: { retired: 'old' } } })
  assert.strictEqual((await h.svc.run({ ids: ['not-a-tweak', 'telemetry-x'], action: 'apply' })).error, 'nothing-to-do')
  assert.strictEqual((await h.svc.run({ ids: ['hpet', 'mmcss'], action: 'apply' })).error, 'nothing-to-do')
  const r = await h.svc.run({ ids: ['hpet'], action: 'restore' })
  assert.ok(r.ok); assert.strictEqual(h.calls.batch.at(-1).items[0].action, 'restore')
  const a = h.svc.run({ ids: ['game-dvr'], action: 'apply' })
  assert.deepStrictEqual(await h.svc.run({ ids: ['sysmain'], action: 'apply' }), { ok: false, error: 'busy' })
  await a
})

test('run: an applied reboot-required switch waits for a restart until after the next boot', async () => {
  const h = harness({ meta: { 'gpu-hwsch': {} } })
  const r = await h.svc.run({ ids: ['gpu-hwsch'], action: 'apply' })   // the fake PC never flips its registry value: the live value still reads default
  assert.strictEqual(r.receipt.items[0].live, 'restart')
  assert.strictEqual(r.receipt.items[0].verified, null)
  assert.deepStrictEqual(r.receipt.restartNeeded, ['gpu-hwsch'])
})

test('history: Windows entries only, grouped by batch, newest first', async () => {
  const journal = [
    { id: 'e3', batchId: 'bb', tweakId: 'game-dvr', action: 'restore', via: 'undo', ts: 300, result: 'ok' },
    { id: 'e2', batchId: 'ba', tweakId: 'sysmain', action: 'apply', via: 'manual', ts: 200, result: 'ok' },
    { id: 'e1', batchId: 'ba', tweakId: 'game-dvr', action: 'apply', via: 'manual', ts: 150, result: 'ok', undoneBy: 'u' },
    { id: 'x', batchId: 'bz', tweakId: 'nic-offloads', action: 'apply', via: 'manual', ts: 400 },
  ]
  const h = harness({ journal })
  const r = h.svc.history()
  assert.deepStrictEqual(r.batches.map(b => b.batchId), ['bb', 'ba'])
  assert.strictEqual(r.batches[1].entries.length, 2)
  assert.strictEqual(r.batches[1].entries[1].undone, true)
})

test('undo: goes through the journal, then reads Windows again', async () => {
  const h = harness()
  await h.svc.scan()
  const r = await h.svc.undo({ batchId: 'ba' }, { force: true })
  assert.ok(r.ok && r.models)
  assert.deepStrictEqual(h.calls.undo[0], [{ batchId: 'ba' }, { force: true }])
  assert.strictEqual(h.calls.ps, 2)
})

test('summary: from the last read, null before any', async () => {
  const h = harness()
  assert.strictEqual(h.svc.summary(), null)
  await h.svc.scan()
  const s = h.svc.summary()
  assert.ok(s.total > 30 && s.rec > 0)
})
