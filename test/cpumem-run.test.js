const test = require('node:test')
const assert = require('node:assert')
const detect = require('../lib/cpumem/detect')
const CpuMem = require('../lib/cpumem')

const TOPO_X3D = (() => { const m = (from, n) => String(((1n << BigInt(n)) - 1n) << BigInt(from)); const l = []; for (let i = 0; i < 16; i++) l.push(`C|0|0|${m(i * 2, 2)}`); l.push(`L|3|${96 * 1024}|0|${m(0, 16)}`, `L|3|${32 * 1024}|0|${m(16, 16)}`); return l })()
const SAVER = 'a1841308-3541-4fab-bc81-f71556f20b4a', BAL = '381b4222-f694-41f0-9685-ff5bb260df2e'

// A fake PC: `reg` holds probe readings; applyBatch flips the ones the tweaks would; runPS answers each script by what it is.
function harness(o = {}) {
  const calls = { ps: [], batch: [], undo: [], rec: [], spawned: [], killed: 0, scheduled: [], emitted: [] }
  const reg = {}
  for (const r of detect.requests(detect.plan())) reg[r.k] = r.a === 's' ? 'Automatic' : null
  reg['x|scheme'] = BAL
  const store = { v: null }, settings = { ...(o.settings || {}) }
  let premium = o.premium !== false, game = !!o.game, now = 5000, timers = []
  const facts = { cpu: { name: 'AMD Ryzen 9 7950X3D', baseMHz: 4200, cores: 16, threads: 32 }, topo: TOPO_X3D, slots: 4, sticks: [{ slot: 'A', bank: 'ChannelA', capGB: 16, ratedMT: 6000, runMT: 4800, type: 34, part: 'x' }], scheme: BAL }
  const deps = {
    runPS: async script => {
      calls.ps.push(script)
      if (script.includes('JJCM:')) return o.psFail ? { ok: false, out: '' } : { ok: true, out: 'JJCM:' + JSON.stringify({ r: reg, f: facts }) }
      if (script.includes('JJPURGE:')) return { ok: true, out: 'JJPURGE:' + JSON.stringify(o.purge || { before: 3000, after: 200, status: 0 }) }
      if (script.includes('JJCONS:')) return { ok: true, out: 'JJCONS:chrome|40|800\nJJCONS:game|60|3000' }
      if (script.includes('JJPIN:')) return { ok: true, out: 'JJPIN:' + JSON.stringify({ pinned: o.pinned == null ? 2 : o.pinned, failed: 0 }) }
      if (script.includes('JJPRIO:')) return { ok: true, out: 'JJPRIO:{"game.exe":"6"}' }
      return { ok: true, out: '' }
    },
    applyBatch: async req => {
      calls.batch.push(req)
      if (o.abort) return { ok: false, aborted: true, reason: 'restore-point-failed', guidance: 'g', restorePoint: { ok: false } }
      const items = req.items.map(i => {
        if (o.fail && o.fail.includes(i.tweakId)) return { id: i.tweakId, action: i.action, status: 'failed', error: 'boom' }
        if (!o.noFlip) {
          if (i.tweakId === 'sysmain') reg['s|SysMain'] = i.action === 'apply' ? 'Disabled' : 'Automatic'
          if (i.tweakId === 'power-balanced-restore') reg['x|scheme'] = BAL
        }
        settings['tweak_' + i.tweakId] = i.action === 'apply' ? 'applied' : 'restored'
        return { id: i.tweakId, action: i.action, status: 'ok', journalId: 'j_' + i.tweakId, fidelity: 'exact' }
      })
      return { ok: true, batchId: 'b1', items, restorePoint: { ok: true } }
    },
    journalList: () => o.journal || [],
    undo: async t => { calls.undo.push(t); return { ok: true } },
    runRecorded: async (control, action, meta, fn) => { calls.rec.push({ control, action, meta }); const lines = []; await fn(async l => { lines.push(l); return { ok: true } }); calls.rec[calls.rec.length - 1].lines = lines },
    tweakMeta: ids => ids.map(id => ({ id, safetyTier: 1, retired: null, risk: null })),
    applicability: () => ({}), settings: () => settings, caps: () => ({ cpu: { x3d: true, dualCcdX3d: true }, tools: { amd3dSvc: true } }),
    isPremium: () => premium, state: { read: () => store.v, write: v => { store.v = JSON.parse(JSON.stringify(v)) } },
    bootMs: () => 1000, now: () => now, gameRunning: () => game, gameNames: () => ['game.exe'],
    emit: (c, p) => calls.emitted.push([c, p]),
    schedule: (fn, ms) => { calls.scheduled.push(ms); timers.push(fn) },
    spawnLive: ({ script, onLine, onExit }) => { const h = { script, onLine, onExit, kill() { calls.killed++ } }; calls.spawned.push(h); return h },
  }
  const svc = CpuMem.create(deps)
  return { svc, calls, reg, settings, store, setPremium: v => { premium = v }, setGame: v => { game = v }, tick: ms => { now += ms }, fireTimers: () => { const t = timers; timers = []; t.forEach(f => f()) } }
}

test('scan: one read-only probe; model, topology, plans and findings come back; the read is remembered', async () => {
  const h = harness(); const r = await h.svc.scan()
  assert.ok(r.ok && r.read && !r.stale); assert.strictEqual(h.calls.ps.length, 1)
  assert.ok(r.model.items.length > 10); assert.strictEqual(r.facts.topo.groups.length, 2); assert.ok(r.facts.topo.dualCcdVcache)
  assert.deepStrictEqual(r.facts.plans.map(p => p.kind), ['vcache', 'skip0']); assert.strictEqual(r.facts.baseMHz, 4200)
  assert.ok(r.facts.findings.some(f => f.id === 'ram-below-rated')); assert.ok(h.store.v.last.r)
})
test('scan: a failed read shows the last known state, marked stale; with none it is unread', async () => {
  const h = harness(); await h.svc.scan()
  const store = h.store
  const stale = CpuMem.create({ runPS: async () => ({ ok: false, out: '' }), tweakMeta: () => [], applicability: () => ({}), settings: () => ({}), isPremium: () => true, state: { read: () => store.v, write: () => {} }, now: () => 1 })
  const r = await stale.scan(); assert.ok(r.stale && r.read && r.model.live)
  const none = CpuMem.create({ runPS: async () => ({ ok: false }), tweakMeta: () => [], applicability: () => ({}), settings: () => ({}), isPremium: () => true, state: { read: () => null, write: () => {} }, now: () => 1 })
  const r2 = await none.scan(); assert.ok(!r2.read && r2.model.verdict.kind === 'unread')
})
test('run: journaled batch with label cpumem, then read back to verify', async () => {
  const h = harness(); await h.svc.scan(); const prog = []
  const r = await h.svc.run({ ids: ['sysmain'], action: 'apply', onProgress: p => prog.push(p.phase) })
  assert.ok(r.ok); assert.deepStrictEqual(prog, ['start', 'verify', 'done']); assert.strictEqual(h.calls.batch[0].label, 'cpumem'); assert.strictEqual(h.calls.batch[0].via, 'manual')
  assert.deepStrictEqual(r.receipt.items.map(i => [i.id, i.status, i.verified]), [['sysmain', 'ok', true]]); assert.strictEqual(h.calls.ps.length, 2)
  assert.ok(h.store.v.applied.sysmain)
  const back = await h.svc.run({ ids: ['sysmain'], action: 'restore' }); assert.strictEqual(back.receipt.items[0].verified, true)
})
test('run: a change Windows did not take is reported as a mismatch, a failed item with its reason', async () => {
  const h = harness({ noFlip: true }); await h.svc.scan()
  assert.strictEqual((await h.svc.run({ ids: ['sysmain'] })).receipt.items[0].verified, false)
  const f = harness({ fail: ['sysmain'] }); await f.svc.scan(); const r = await f.svc.run({ ids: ['sysmain'] })
  assert.strictEqual(r.receipt.counts.failed, 1); assert.strictEqual(r.receipt.items[0].error, 'boom')
})
test('run: a Premium switch is refused for a free user, others in the same batch still run', async () => {
  const h = harness({ premium: false }); await h.svc.scan()
  const only = await h.svc.run({ ids: ['cpu-parking'] }); assert.deepStrictEqual([only.ok, only.error, only.locked], [false, 'premium_required', ['cpu-parking']]); assert.strictEqual(h.calls.batch.length, 0)
  const mixed = await h.svc.run({ ids: ['cpu-parking', 'sysmain'] })
  assert.deepStrictEqual(h.calls.batch[0].items, [{ tweakId: 'sysmain', action: 'apply' }]); assert.deepStrictEqual(mixed.receipt.items.map(i => [i.id, i.status]), [['sysmain', 'ok'], ['cpu-parking', 'locked']]); assert.strictEqual(mixed.receipt.counts.locked, 1)
  h.setPremium(true); assert.ok((await h.svc.run({ ids: ['cpu-parking'] })).ok)
  h.setPremium(false); const restore = await h.svc.run({ ids: ['cpu-parking'], action: 'restore' }); assert.ok(restore.ok, 'a free user can always put a Premium change back')
})
test('run: unknown ids, retired switches (apply) and a second run while busy are refused; an aborted restore point stops everything', async () => {
  const h = harness(); await h.svc.scan()
  assert.strictEqual((await h.svc.run({ ids: ['nope'] })).error, 'nothing-to-do'); assert.strictEqual((await h.svc.run({ ids: ['pool-usage-max'] })).error, 'nothing-to-do')
  assert.ok((await h.svc.run({ ids: ['pool-usage-max'], action: 'restore' })).ok)
  const slow = harness(); await slow.svc.scan(); const p = slow.svc.run({ ids: ['sysmain'] }); assert.deepStrictEqual(await slow.svc.run({ ids: ['sysmain'] }), { ok: false, error: 'busy' }); await p
  const ab = harness({ abort: true }); await ab.svc.scan(); const r = await ab.svc.run({ ids: ['sysmain'] }); assert.ok(r.aborted && !r.ok)
})
test('history: switches and journaled priorities, grouped by batch, newest first; undo re-reads', async () => {
  const journal = [{ id: 'e1', batchId: 'b1', tweakId: 'sysmain', action: 'apply', via: 'manual', ts: 100, result: 'ok' }, { id: 'e2', batchId: 'b2', control: 'cpumem:priority:game.exe', action: 'apply', via: 'manual', ts: 300, result: 'ok' },
    { id: 'e3', batchId: 'b3', tweakId: 'game-dvr', action: 'apply', via: 'manual', ts: 400 }, { id: 'e4', batchId: 'b3', control: 'debloat:x', action: 'apply', ts: 500 }]
  const h = harness({ journal }); const hist = h.svc.history()
  assert.deepStrictEqual(hist.batches.map(b => b.batchId), ['b2', 'b1']); assert.strictEqual(hist.batches[0].entries[0].control, 'cpumem:priority:game.exe')
  await h.svc.scan(); const u = await h.svc.undo({ batchId: 'b1' }); assert.ok(u.ok && u.model); assert.deepStrictEqual(h.calls.undo, [{ batchId: 'b1' }])
})

// ── live ──
const frameLine = (t, avail = 4000) => 'JJCMLIVE:' + JSON.stringify({ t, mem: { totalMB: 8000, avail, commit: 5000, limit: 9000, modified: 10, standby: 1000, free: 100, paged: 1, nonpaged: 1, reads: 0, compressed: 0 }, cpu: [['_Total', 20, 100, 4200, 0], ['0,0', 20, 100, 4200, 0]] })
test('live: start spawns one poller, frames stream out (even split across chunks), stop kills it', async () => {
  const h = harness(); await h.svc.scan()
  assert.deepStrictEqual(h.svc.liveStart(), { ok: true, paused: null }); h.svc.liveStart(); assert.strictEqual(h.calls.spawned.length, 1)
  const s = h.calls.spawned[0], line = frameLine(1)
  s.onLine(line.slice(0, 30)); s.onLine(line.slice(30) + '\r\n' + frameLine(2) + '\n')
  const frames = h.calls.emitted.filter(e => e[0] === 'cpumem2-live' && e[1].frame); assert.strictEqual(frames.length, 2); assert.strictEqual(frames[0][1].frame.cpu.total.mhz, 4200)
  assert.strictEqual(h.svc.frames().length, 2); h.svc.liveStop(); assert.strictEqual(h.calls.killed, 1); assert.strictEqual(h.svc.frames().length, 0); assert.ok(!h.svc.running())
})
test('live: the watchdog stops sampling when the page stops sending heartbeats', async () => {
  const real = global.setInterval; let tick = null
  global.setInterval = fn => { tick = fn; return { unref() {} } }
  try {
    const h = harness(); h.svc.liveStart(); assert.ok(h.svc.running())
    h.tick(CpuMem.HEARTBEAT_TIMEOUT_MS - 1000); tick(); assert.ok(h.svc.running())
    h.svc.heartbeat(); h.tick(CpuMem.HEARTBEAT_TIMEOUT_MS - 1000); tick(); assert.ok(h.svc.running(), 'a heartbeat resets the clock')
    h.tick(2000); tick(); assert.ok(!h.svc.running()); assert.strictEqual(h.calls.killed, 1)
  } finally { global.setInterval = real }
})
test('live: never starts while a game runs; a game starting pauses it, ending resumes it', async () => {
  const h = harness({ game: true })
  assert.deepStrictEqual(h.svc.liveStart(), { ok: true, paused: 'game' }); assert.strictEqual(h.calls.spawned.length, 0)
  h.setGame(false); h.svc.liveStart(); assert.strictEqual(h.calls.spawned.length, 1)
  h.setGame(true); h.svc.gameStarted('game.exe'); assert.strictEqual(h.calls.killed, 1); assert.ok(h.calls.emitted.some(e => e[1].paused === 'game'))
  h.setGame(false); h.svc.gameEnded(); assert.strictEqual(h.calls.spawned.length, 2); assert.ok(h.calls.emitted.some(e => e[1].resumed))
})

// ── lab ──
test('pin: Premium only; validates the program; sends the plan mask; remembers; unpin gives every thread back', async () => {
  const free = harness({ premium: false }); await free.svc.scan(); assert.strictEqual((await free.svc.pin({ exe: 'game.exe', kind: 'vcache' })).error, 'premium_required')
  const h = harness(); await h.svc.scan()
  assert.strictEqual((await h.svc.pin({ exe: 'svchost.exe', kind: 'vcache' })).error, 'bad-exe'); assert.strictEqual((await h.svc.pin({ exe: 'game.exe', kind: 'pcores' })).error, 'plan-not-available')
  const r = await h.svc.pin({ exe: 'Game.exe', kind: 'vcache', remember: true })
  assert.ok(r.ok && r.processes === 2 && r.count === 16 && r.total === 32); assert.ok(h.calls.ps.pop().includes("'65535'")); assert.deepStrictEqual(r.rules, { 'game.exe': 'vcache' }); assert.ok(r.pinned['game.exe'])
  const u = await h.svc.unpin({ exe: 'game.exe', forget: true }); assert.ok(u.ok); assert.ok(h.calls.ps.pop().includes("'4294967295'")); assert.deepStrictEqual(u.rules, {}); assert.deepStrictEqual(u.pinned, {})
})
test('pin: a remembered plan is applied twice after a game starts, only for Premium; the pin ends with the game', async () => {
  const h = harness(); await h.svc.scan(); await h.svc.pin({ exe: 'game.exe', kind: 'vcache', remember: true }); h.calls.ps.length = 0
  assert.deepStrictEqual(h.svc.gameStarted('GAME.EXE'), { ok: true, applying: true, kind: 'vcache' }); assert.deepStrictEqual(h.calls.scheduled, [4000, 15000])
  h.fireTimers(); await new Promise(r => setImmediate(r)); assert.strictEqual(h.calls.ps.filter(s => s.includes('JJPIN:')).length, 2)
  h.svc.gameEnded(); assert.deepStrictEqual(h.svc.cached().rules.pinned, {})
  const free = harness({ premium: true }); await free.svc.scan(); await free.svc.pin({ exe: 'game.exe', kind: 'vcache', remember: true }); free.setPremium(false)
  assert.strictEqual(free.svc.gameStarted('game.exe').applying, false); assert.strictEqual(h.svc.gameStarted('other.exe').applying, false)
})
test('priority: journaled IFEO write for a validated program; the real value is read back; Realtime is refused', async () => {
  const h = harness(); await h.svc.scan()
  assert.strictEqual((await h.svc.priority({ exe: 'game.exe', level: 'realtime' })).error, 'bad-input'); assert.strictEqual((await h.svc.priority({ exe: 'lsass.exe', level: 'high' })).error, 'bad-input')
  const r = await h.svc.priority({ exe: 'game.exe', level: 'above' })
  assert.ok(r.ok); assert.strictEqual(h.calls.rec[0].control, 'cpumem:priority:game.exe'); assert.match(h.calls.rec[0].lines[1], /CpuPriorityClass -Value 6/); assert.match(h.calls.rec[0].lines[0], /Image File Execution Options\\game\.exe\\PerfOptions/)
  assert.deepStrictEqual(r.priorities, { 'game.exe': 'above' })
  const c = await h.svc.priorityClear({ exe: 'game.exe' }); assert.ok(c.ok); assert.match(h.calls.rec[1].lines[0], /Remove-Item/)
  assert.strictEqual((await harness({ premium: false }).svc.priority({ exe: 'game.exe', level: 'high' })).error, 'premium_required')
})
test('freeStandby reports what was really freed; consumers are not read during a game', async () => {
  const h = harness(); assert.deepStrictEqual(await h.svc.freeStandby(), { ok: true, accepted: true, beforeMB: 3000, afterMB: 200, freedMB: 2800 })
  assert.strictEqual((await harness({ purge: { before: 100, after: 100, status: 3221225569 } }).svc.freeStandby()).accepted, false)
  const c = await h.svc.consumers(); assert.ok(c.ok && c.cpu[0].name === 'game' && c.cpu[0].game === true)
  h.setGame(true); assert.deepStrictEqual(await h.svc.consumers(), { ok: true, game: true })
})
