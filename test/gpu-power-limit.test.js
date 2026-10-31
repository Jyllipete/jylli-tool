const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs'), path = require('path')
const smi = require('../lib/nvidia-smi')
const { createPowerLimit } = require('../lib/gpu-power-limit')

const gpu0 = smi.parseQuery(fs.readFileSync(path.join(__dirname, 'fixtures/sensors/nvidia-smi-rtx-desktop.csv'), 'utf8'))[0]

function setup({ laptop = false, admin = true, writeWorks = true, driftBy = 0, policy = 'session' } = {}) {
  const st = { limit: 250, sentinel: null, records: [], events: [], writes: [] }
  const api = createPowerLimit({
    run: async args => { st.writes.push(args.join(' ')); if (!writeWorks) return { ok: false, err: 'denied' }; st.limit = Number(args[3]) + driftBy; return { ok: true, out: 'ok' } },
    query: async () => [{ ...gpu0, powerLimit: st.limit }],
    isLaptop: async () => laptop, isAdmin: async () => admin,
    readSentinel: async () => st.sentinel, writeSentinel: async s => { st.sentinel = s }, clearSentinel: async () => { st.sentinel = null },
    record: f => { const e = { id: 'e' + st.records.length, ...f }; st.records.push(e); return e },
    emit: (c, p) => st.events.push([c, p]), policy: () => policy, now: () => st.t || 0,
  })
  return { st, api }
}

test('probe: desktop NVIDIA with numeric limits is supported; laptop is not', async () => {
  const d = await setup().api.get()
  assert.deepStrictEqual([d.supported, d.min, d.max, d.default, d.current], [true, 175, 300, 250, 250])
  assert.strictEqual((await setup({ laptop: true }).api.get()).supported, false)
  assert.strictEqual((await setup({ admin: false }).api.get()).needsAdmin, true)
})

test('set: validates, writes by UUID, verifies, journals before/after, leaves a sentinel', async () => {
  const { st, api } = setup()
  assert.strictEqual((await api.set({ watts: 999 })).reason, 'out-of-range')
  assert.strictEqual((await api.set({ watts: 280 })).reason, 'needs-confirmation')
  assert.strictEqual(st.writes.length, 0)                       // nothing reached nvidia-smi
  const r = await api.set({ watts: 240 })
  assert.deepStrictEqual([r.ok, r.before, r.after], [true, 250, 240])
  assert.ok(st.writes[0].startsWith('-i GPU-') && st.writes[0].endsWith('-pl 240'))
  assert.strictEqual(st.records[0].changes[0].before.watts, 250)
  assert.strictEqual(st.sentinel.original, 250)
})

test('a write that does not stick is rolled back and reported', async () => {
  const { st, api } = setup({ driftBy: 15 })
  const r = await api.set({ watts: 240 })
  assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, 'verify-failed')
  assert.ok(st.writes.length >= 2)                              // the old value was written back
  assert.strictEqual(st.records.length, 0)
  assert.strictEqual((await setup({ writeWorks: false }).api.set({ watts: 240 })).reason, 'write-failed')
  assert.strictEqual((await setup({ admin: false }).api.set({ watts: 240 })).reason, 'needs-admin')
})

test('reset, quit policy and crash recovery put the original back', async () => {
  const { st, api } = setup()
  await api.set({ watts: 240 })
  const r = await api.reset(); assert.strictEqual(r.ok, true); assert.strictEqual(st.limit, 250); assert.strictEqual(st.sentinel, null)
  await api.set({ watts: 240 })
  assert.strictEqual((await api.onQuit()).ok, true); assert.strictEqual(st.limit, 250)
  await api.set({ watts: 230 })                                  // app "crashes" here: sentinel stays
  const rec = await api.recover(); assert.strictEqual(rec.recovered, true); assert.strictEqual(st.limit, 250)
  assert.ok(st.events.some(([c]) => c === 'power-limit-recovered'))
  assert.strictEqual(st.records.at(-1).via, 'safety-revert')
  const keep = setup({ policy: 'persist' }); await keep.api.set({ watts: 240 })
  assert.strictEqual((await keep.api.recover()).kept, true); assert.strictEqual(keep.st.limit, 240)
})

test('thermal guard: only above the default, only after 5 s hot', async () => {
  const { st, api } = setup()
  await api.set({ watts: 270, confirmAboveDefault: true })
  st.t = 0; assert.strictEqual(await api.guard(88, 270, 250), false)
  st.t = 4000; assert.strictEqual(await api.guard(88, 270, 250), false)
  st.t = 5100; assert.strictEqual(await api.guard(88, 270, 250), true); assert.strictEqual(st.limit, 250)
  st.t = 0; assert.strictEqual(await api.guard(95, 240, 250), false)   // below default: nothing to guard
})

test('journal undo handler writes the recorded before-value', async () => {
  const { st, api } = setup()
  const r = await api.set({ watts: 240 })
  const change = st.records[0].changes[0]
  assert.deepStrictEqual(await api.undoHandler.read(change), { exists: true, value: 240 })
  assert.strictEqual(await api.undoHandler.restore(change), true); assert.strictEqual(st.limit, 250)
  void r
})
