const test = require('node:test')
const assert = require('node:assert')
const detect = require('../lib/gpu/detect')
const Gpu = require('../lib/gpu')

const DISP = 'REMOTE=0\nDISP=\\\\.\\DISPLAY1|Dell|1|2560|1440|60|32|2560x1440@60,2560x1440@165\nEDIDMAX=165\n'
const FACTS = { gpus: [{ name: 'NVIDIA GeForce RTX 4070', driver: '31.0.15.5222', date: '2026-01-10', pnp: 'PCI\\X', status: 'OK' }, { name: 'Intel(R) UHD Graphics', driver: '1', date: '2026-01-10', pnp: 'PCI\\Y' }],
  vram: [{ name: 'NVIDIA GeForce RTX 4070', bytes: 12 * 1024 ** 3 }], irq: [{ name: 'NVIDIA GeForce RTX 4070', irq: [5] }], battery: false, chassis: [3],
  smi: { slowdownC: 92, shutdownC: 98, targetC: 83, bar1MiB: 256, fbMiB: 12282, q: '4,16,2850,10501,200,200,100,220' } }
const HWS = 'r|HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers|HwSchMode'
const TDR = 'r|HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers|TdrDelay'

function harness(o = {}) {
  const calls = { ps: [], batch: [], undo: [], rec: [], spawned: [], smi: [], killed: 0, emitted: [], scheduled: [] }
  const reg = {}
  for (const r of detect.requests(detect.plan())) reg[r.k] = null
  reg['x|msi'] = 'off'
  const store = { v: null }, settings = {}
  let premium = o.premium !== false, game = !!o.game, now = 5000, timers = []
  let mode = 60
  const deps = {
    runPS: async script => {
      calls.ps.push(script)
      if (script.includes('JJGP:')) return o.psFail ? { ok: false, out: '' } : { ok: true, out: 'JJGP:' + JSON.stringify({ r: reg, f: FACTS }) + '\n' + DISP.replace('@60,', '@' + mode + ',').replace(/\|60\|32/, '|' + mode + '|32') }
      if (script.includes('JD]::Set')) { if (/, 0\)\s*\nWrite|JDRESULT/.test(script)) { const m = /\[JD\]::Set\('[^']+', \d+, \d+, (\d+), (\d)\)/.exec(script); if (m && m[2] !== '2') mode = Number(m[1]); return { ok: true, out: o.refuse && m && m[2] === '2' ? 'JDRESULT=-2' : 'JDRESULT=0' } } }
      return { ok: true, out: '' }
    },
    applyBatch: async req => {
      calls.batch.push(req)
      if (o.abort) return { ok: false, aborted: true, reason: 'restore-point-failed', guidance: 'g', restorePoint: { ok: false } }
      const items = req.items.map(i => {
        if (!o.noFlip) {
          if (i.tweakId === 'tdr-delay') reg[TDR] = i.action === 'apply' ? '10' : null
          if (i.tweakId === 'gpu-hwsch') reg[HWS] = i.action === 'apply' ? '2' : null
          if (i.tweakId === 'gpu-hags-off') reg[HWS] = i.action === 'apply' ? '1' : null
        }
        settings['tweak_' + i.tweakId] = i.action === 'apply' ? 'applied' : 'restored'
        return { id: i.tweakId, action: i.action, status: 'ok', journalId: 'j_' + i.tweakId, fidelity: 'exact' }
      })
      return { ok: true, batchId: 'b1', items, restorePoint: { ok: true } }
    },
    journalList: () => o.journal || [],
    undo: async t => { calls.undo.push(t); return { ok: true } },
    runRecorded: async (control, action, meta, fn) => { const ch = []; await fn(async () => ({ ok: true }), async () => ({ ok: true }), c => ch.push(c)); calls.rec.push({ control, action, meta, changes: ch }) },
    tweakMeta: ids => ids.map(id => ({ id, safetyTier: 1, retired: null, risk: null })),
    applicability: () => ({}), settings: () => settings, caps: () => ({ form: 'desktop' }),
    isPremium: () => premium, state: { read: () => store.v, write: v => { store.v = JSON.parse(JSON.stringify(v)) } },
    bootMs: () => 1000, now: () => now, gameRunning: () => game,
    emit: (c, p) => calls.emitted.push([c, p]),
    schedule: (fn, ms) => { calls.scheduled.push(ms); const t = { fn }; timers.push(t); return t }, clearSchedule: t => { timers = timers.filter(x => x !== t) },
    hub: keys => Object.fromEntries(keys.map(k => [k, k === 'gpu0.temp.core' ? 60 : null])),
    power: async () => ({ supported: true, current: 200, default: 200 }),
    spawnLive: ({ script, onLine, onExit }) => { const h = { script, onLine, onExit, kill() { calls.killed++ } }; calls.spawned.push(h); return h },
    spawnSmi: ({ args, onLine, onExit }) => { const h = { args, onLine, onExit, kill() { calls.killed++ } }; calls.smi.push(h); return h },
  }
  const svc = Gpu.create(deps)
  return { svc, calls, reg, settings, store, setPremium: v => { premium = v }, setGame: v => { game = v }, tick: ms => { now += ms }, fireTimers: () => { const t = timers; timers = []; t.forEach(x => x.fn()) } }
}
const frame = (h, o = {}) => 'JJGPLIVE:' + JSON.stringify({ t: 1, luid: 'a', mem: { dedicated: 900, shared: 0 }, eng: { gfx: o.gfx == null ? 90 : o.gfx, compute: 0, copy: 0, decode: 0, encode: 0, vproc: 0 }, procs: [] }) + '\n'
const smiLine = (o = {}) => `0, 95, 2500, 10000, 2850, 10501, ${o.power || 190}, 200, ${o.temp || 70}, 40, 6000, 12282, P2, 4, 16, ${o.reasons || '0x4'}\n`

test('scan: one read-only probe; model, GPU facts, display list and findings come back; the read is remembered', async () => {
  const h = harness(); const r = await h.svc.scan()
  assert.ok(r.ok && r.read && !r.stale); assert.strictEqual(h.calls.ps.length, 1)
  assert.strictEqual(r.facts.gpu.name, 'NVIDIA GeForce RTX 4070'); assert.strictEqual(r.facts.gpu.vramGB, 12); assert.ok(r.facts.gpu.hybrid); assert.strictEqual(r.facts.laptop, false)
  assert.strictEqual(r.facts.displays.length, 1); assert.strictEqual(r.facts.limits.slowdownC, 92)
  const f = r.facts.findings.map(x => x.id)
  assert.ok(f.includes('refresh-below-max') && f.includes('rebar-off') && f.includes('hybrid-games-igpu'))
  assert.ok(h.store.v.last.f.gpus.length === 2)
  const c = await harness().svc.cached(); assert.strictEqual(c, null)
})
test('scan: a failed read falls back to the last one and says stale; never read = unread', async () => {
  const h = harness(); await h.svc.scan()
  const h2 = harness({ psFail: true }); h2.store.v = h.store.v
  const r = await h2.svc.scan(); assert.ok(r.stale && r.read)
  const r3 = await harness({ psFail: true }).svc.scan(); assert.ok(!r3.read); assert.strictEqual(r3.model.verdict.kind, 'unread'); assert.deepStrictEqual(r3.facts.findings, [])
})
test('run: journaled batch, then READ AGAIN; the receipt says verified, and a value that did not change is a mismatch', async () => {
  const h = harness(); await h.svc.scan()
  const r = await h.svc.run({ ids: ['tdr-delay'], action: 'apply' })
  assert.ok(r.ok); assert.strictEqual(h.calls.batch[0].items[0].tweakId, 'tdr-delay'); assert.strictEqual(r.receipt.items[0].verified, true); assert.strictEqual(r.model.items.find(i => i.id === 'tdr-delay').status, 'on')
  assert.strictEqual(h.calls.batch[0].restorePoint, 'auto'); assert.strictEqual(h.calls.ps.length, 2, 'scan + verify read only')
  const h2 = harness({ noFlip: true }); await h2.svc.scan()
  const r2 = await h2.svc.run({ ids: ['tdr-delay'], action: 'apply' })
  assert.strictEqual(r2.receipt.items[0].verified, false); assert.strictEqual(r2.receipt.counts.mismatch, 1)
  const r3 = await h.svc.run({ ids: ['tdr-delay'], action: 'restore' }); assert.strictEqual(r3.receipt.items[0].verified, true)
})
test('run: unknown ids are dropped, a retired switch can only be restored, Premium needs Premium, a failed restore point changes nothing, one run at a time', async () => {
  const h = harness({ premium: false }); await h.svc.scan()
  assert.deepStrictEqual(await h.svc.run({ ids: ['nope'] }), { ok: false, error: 'nothing-to-do', locked: [] })
  const lock = await h.svc.run({ ids: ['gpu-hags-off'] }); assert.strictEqual(lock.error, 'premium_required'); assert.strictEqual(h.calls.batch.length, 0)
  const mixed = await h.svc.run({ ids: ['gpu-hags-off', 'tdr-delay'] }); assert.strictEqual(mixed.receipt.items.find(i => i.id === 'gpu-hags-off').status, 'locked'); assert.strictEqual(mixed.receipt.counts.locked, 1)
  const ha = harness({ abort: true }); await ha.svc.scan(); const ab = await ha.svc.run({ ids: ['tdr-delay'] }); assert.ok(ab.aborted && !ab.ok)
  const hb = harness(); await hb.svc.scan(); const a = hb.svc.run({ ids: ['tdr-delay'] }); assert.deepStrictEqual(await hb.svc.run({ ids: ['gpu-hwsch'] }), { ok: false, error: 'busy' }); await a
})
test('drift: applied by Jylli but Windows reads the default again = drifted, and put back is a normal apply', async () => {
  const h = harness(); await h.svc.scan(); await h.svc.run({ ids: ['tdr-delay'] })
  h.reg[TDR] = null
  const r = await h.svc.scan(); assert.strictEqual(r.model.items.find(i => i.id === 'tdr-delay').status, 'drifted'); assert.deepStrictEqual(r.model.drifted, ['tdr-delay'])
})
test('history: GPU switches, power limit and monitor changes only, grouped by batch, with what changed', async () => {
  const h = harness({ journal: [
    { id: 'e1', batchId: 'b1', tweakId: 'tdr-delay', action: 'apply', via: 'manual', ts: 10, result: 'ok', changes: [] },
    { id: 'e2', batchId: 'b2', control: 'gpu-power-limit', action: 'apply', via: 'manual', ts: 20, changes: [{ kind: 'gpu-power-limit', before: { watts: 200 }, after: { watts: 150 } }] },
    { id: 'e3', batchId: 'b3', control: 'gpu2:display:\\\\.\\DISPLAY1', action: 'apply', via: 'manual', ts: 30, changes: [{ kind: 'display-mode', before: { value: 60 }, after: { value: 165 } }] },
    { id: 'e4', batchId: 'b4', tweakId: 'sysmain', action: 'apply', via: 'manual', ts: 40, changes: [] }] })
  const r = h.svc.history(); assert.deepStrictEqual(r.batches.map(b => b.batchId), ['b3', 'b2', 'b1'])
  assert.deepStrictEqual(r.batches[0].entries[0].detail, { kind: 'display', from: 60, to: 165 }); assert.deepStrictEqual(r.batches[1].entries[0].detail, { kind: 'power', from: 200, to: 150 })
})
test('live: poller + nvidia-smi start together, frames merge the smi sample and the sensor, a heartbeat keeps it alive, no heartbeat stops it', async () => {
  const h = harness(); await h.svc.scan()
  assert.deepStrictEqual(h.svc.liveStart(), { ok: true, paused: null }); assert.strictEqual(h.calls.spawned.length, 1); assert.strictEqual(h.calls.smi.length, 1)
  assert.ok(h.calls.smi[0].args[0].includes('clocks_event_reasons.active'))
  h.calls.smi[0].onLine(smiLine()); h.calls.spawned[0].onLine(frame(h))
  const f = h.svc.lastFrame(); assert.strictEqual(f.smi.clock, 2500); assert.strictEqual(f.sensor.tempCore, 60); assert.strictEqual(f.load, 95)
  assert.ok(h.calls.emitted.some(([c, p]) => c === 'gpu2-live' && p.frame))
  h.svc.liveStop(); assert.ok(h.calls.killed >= 2); assert.strictEqual(h.svc.running(), false)
})
test('live: a driver that rejects the reason field gets the older name, then none; a card that gives no frames stops asking', async () => {
  const h = harness(); h.svc.liveStart()
  h.calls.smi[0].onExit(); assert.ok(h.calls.smi[1].args[0].includes('clocks_throttle_reasons.active'))
  h.calls.smi[1].onExit(); assert.ok(!h.calls.smi[2].args[0].includes('reasons'))
  h.calls.smi[2].onExit(); assert.strictEqual(h.calls.smi.length, 3)
})
test('live: not while a game runs; a game starting pauses, ending resumes; the first frames after resume are fresh', async () => {
  const h = harness({ game: true }); assert.deepStrictEqual(h.svc.liveStart(), { ok: true, paused: 'game' }); assert.strictEqual(h.calls.spawned.length, 0)
  h.setGame(false); h.svc.liveStart(); h.svc.gameStarted(); assert.ok(h.calls.emitted.some(([c, p]) => p.paused === 'game')); assert.strictEqual(h.svc.running(), false)
  h.svc.gameEnded(); assert.strictEqual(h.svc.running(), true)
})
test('display: test, apply, ask; keep persists and journals the change; no answer puts the old mode back; a mode the monitor never offered is refused', async () => {
  const h = harness(); await h.svc.scan()
  assert.strictEqual((await h.svc.displaySet({ device: '\\\\.\\DISPLAY1', w: 2560, h: 1440, hz: 144 })).error, 'mode-not-offered')
  assert.strictEqual((await h.svc.displaySet({ device: '\\\\.\\DISPLAY9', w: 2560, h: 1440, hz: 165 })).error, 'unknown-device')
  const p = h.svc.displaySet({ device: '\\\\.\\DISPLAY1', w: 2560, h: 1440, hz: 165 })
  await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r))
  assert.ok(h.calls.emitted.some(([c, x]) => c === 'gpu2-display' && x.phase === 'confirm' && x.to === 165 && x.from === 60))
  assert.deepStrictEqual((await h.svc.displaySet({ device: '\\\\.\\DISPLAY1', w: 2560, h: 1440, hz: 165 })).error, 'busy')
  h.svc.displayAnswer({ keep: true }); const r = await p
  assert.ok(r.ok && r.kept); assert.strictEqual(h.calls.rec.length, 1); assert.strictEqual(h.calls.rec[0].changes[0].kind, 'display-mode'); assert.strictEqual(h.calls.rec[0].changes[0].before.value, 60); assert.strictEqual(h.calls.rec[0].changes[0].after.value, 165)
  const h2 = harness(); await h2.svc.scan()
  const p2 = h2.svc.displaySet({ device: '\\\\.\\DISPLAY1', w: 2560, h: 1440, hz: 165 })
  await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r)); h2.fireTimers()
  const r2 = await p2; assert.ok(r2.ok && r2.reverted && !r2.kept); assert.strictEqual(h2.calls.rec.length, 0); assert.strictEqual(r2.facts.displays[0].cur.hz, 60)
  const h3 = harness({ refuse: true }); await h3.svc.scan(); assert.strictEqual((await h3.svc.displaySet({ device: '\\\\.\\DISPLAY1', w: 2560, h: 1440, hz: 165 })).error, 'driver-refused')
})
test('test: refused while a game runs; hot card stops it; finishing returns a report and the change since the last run; only ten are kept', async () => {
  const hg = harness({ game: true }); assert.strictEqual(hg.svc.testStart().error, 'game')
  const h = harness(); await h.svc.scan()
  const feed = (n, o) => { for (let i = 0; i < n; i++) { h.calls.smi[0].onLine(smiLine(o)); h.calls.spawned[0].onLine(frame(h)) } }
  const s = h.svc.testStart(); assert.ok(s.ok); assert.strictEqual(h.svc.testStart().error, 'busy'); assert.ok(h.calls.scheduled.includes(45000))
  feed(12, { power: 190, temp: 80 }); h.tick(1)
  const r = h.svc.testFinish({ work: 40, renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070)' })
  assert.ok(r.ok); assert.strictEqual(r.report.limiter.id, 'power'); assert.strictEqual(r.report.wrongGpu, false); assert.strictEqual(r.report.gpu, 'NVIDIA GeForce RTX 4070'); assert.strictEqual(r.delta, null)
  h.svc.testStart(); feed(12, { power: 140, temp: 78 })
  const r2 = h.svc.testFinish({ work: 38 }); assert.strictEqual(r2.delta.power, -50); assert.strictEqual(r2.delta.work, -5)
  h.svc.testStart(); feed(2, { temp: 88 })
  assert.ok(h.calls.emitted.some(([c, p]) => c === 'gpu2-test' && p.phase === 'abort' && p.reason === 'hot-core')); assert.strictEqual(h.svc.testing(), false)
  assert.strictEqual(h.svc.testFinish({}).error, 'not-running')
  for (let i = 0; i < 12; i++) { h.svc.testStart(); feed(10, {}); h.svc.testFinish({ work: 1 }) }
  assert.strictEqual(h.svc.tests().tests.length, 10)
})
test('test: a game starting stops it, the 45 s cap stops it, hiding the tab (live stop) stops it', async () => {
  const h = harness(); await h.svc.scan()
  h.svc.testStart(); h.svc.gameStarted(); assert.ok(h.calls.emitted.some(([c, p]) => p.reason === 'game')); assert.strictEqual(h.svc.testing(), false)
  h.svc.gameEnded(); h.svc.testStart(); h.fireTimers(); assert.ok(h.calls.emitted.some(([c, p]) => p.reason === 'timeout')); assert.strictEqual(h.svc.testing(), false)
  h.svc.testStart(); h.svc.liveStop(); assert.strictEqual(h.svc.testing(), false)
})
