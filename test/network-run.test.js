const test = require('node:test')
const assert = require('node:assert')
const { EventEmitter } = require('events')
const detect = require('../lib/network/detect')
const Network = require('../lib/network')

const WPAD = 's|WinHttpAutoProxySvc', INT = 'x|intmod'

// A fake PC: `reg` holds readings by probe key, `dns` the primary adapter's resolver; applyBatch flips them like the real tweaks would.
function harness(o = {}) {
  const calls = { ps: 0, batch: [], undo: [], saved: [], spawn: 0, killed: 0, emit: [], bench: 0 }
  const reg = {}
  for (const r of detect.requests(detect.plan())) reg[r.k] = r.a === 's' ? 'Manual' : r.a === 'x' ? ({ 'x|doh': 'off', 'x|rss': 'default' }[r.k] || 'on') : null
  const pc = { dns: { servers: ['192.168.1.1'], isStatic: false } }
  const store = { v: null }
  const settings = { ...(o.settings || {}) }
  const meta = o.meta || {}
  const rawFacts = () => ({ adapter: { name: 'Ethernet', desc: 'Intel', wifi: false, speed: 1e9, ifIndex: 4, driver: '1' }, gateway: '192.168.1.1', dns: [{ name: 'Ethernet', ifIndex: 4, ...pc.dns }] })
  const SERVERS = { 'dns-cloudflare': ['1.1.1.1', '1.0.0.1'], 'dns-google': ['8.8.8.8', '8.8.4.4'] }
  const deps = {
    runPS: async () => { calls.ps++; return o.psFail ? { ok: false, out: '' } : { ok: true, out: 'noise\nJJNET:' + JSON.stringify({ r: reg, f: rawFacts() }) + '\n' } },
    applyBatch: async req => {
      calls.batch.push(req)
      if (o.abort) return { ok: false, aborted: true, reason: 'restore-point-failed', guidance: 'Turn on System Protection', restorePoint: { ok: false } }
      if (o.slow) await new Promise(r => setTimeout(r, 30))
      const items = req.items.map(i => {
        if (o.fail && o.fail.includes(i.tweakId)) return { id: i.tweakId, action: i.action, status: 'failed', error: 'boom' }
        const ap = i.action === 'apply'
        if (!o.noFlip) {
          if (i.tweakId === 'disable-wpad') reg[WPAD] = ap ? 'Disabled' : 'Manual'
          if (i.tweakId === 'nic-interrupt-mod') reg[INT] = ap ? 'off' : 'on'
          if (SERVERS[i.tweakId]) pc.dns = ap ? { servers: SERVERS[i.tweakId], isStatic: true } : { servers: ['192.168.1.1'], isStatic: false }
          if (i.tweakId === 'dns-custom') pc.dns = ap ? { servers: [settings.customDnsPrimary], isStatic: true } : { servers: ['192.168.1.1'], isStatic: false }
        }
        settings['tweak_' + i.tweakId] = ap ? 'applied' : 'restored'
        return { id: i.tweakId, action: i.action, status: 'ok', journalId: 'j_' + i.tweakId, fidelity: 'exact' }
      })
      return { ok: true, batchId: 'b' + calls.batch.length, items, restorePoint: { ok: true } }
    },
    journalList: () => o.journal || [],
    undo: async (t, opt) => { calls.undo.push([t, opt]); reg[WPAD] = 'Manual'; settings['tweak_disable-wpad'] = 'restored'; return { ok: true } },
    tweakMeta: ids => ids.filter(id => meta[id] !== null).map(id => ({ id, safetyTier: 1, retired: null, risk: null, ...(meta[id] || {}) })),
    applicability: () => o.applic || {}, settings: () => settings,
    saveSettings: p => { calls.saved.push(p); if (o.saveFail) return false; Object.assign(settings, p); return true },
    state: { read: () => store.v, write: v => { store.v = JSON.parse(JSON.stringify(v)) } },
    bootMs: () => 1000, now: () => 5000, roundTimeoutMs: o.timeout || 3000,
    benchDns: async list => { calls.bench++; return list.map(p => ({ name: p.name, server: p.server, fail: false, median: p.name === 'cloudflare' ? 8 : p.name === 'current' ? (o.curMs || 40) : 15 })) },
    speedHistory: () => o.speed || [],
    lookup4: async h => (h === 'example.com' ? '93.184.216.34' : null),
    emit: (ch, p) => calls.emit.push([ch, p]),
    spawn: () => {
      calls.spawn++
      const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), kill() { calls.killed++ } })
      const hops = o.hops || (() => [[1, '192.168.1.1', 1.5], [2, '100.64.0.1', 9], [3, '84.1.1.1', 11], [4, '1.1.1.1', 13]])
      let n = 0
      const tick = () => { if (child.dead || n >= (o.rounds == null ? 30 : o.rounds)) return; n++; child.stdout.emit('data', 'JJROUTE:' + JSON.stringify({ d: 4, h: hops(n) }) + '\n'); setTimeout(tick, 1) }
      child.kill = () => { child.dead = true; calls.killed++ }
      setTimeout(tick, 1)
      return child
    },
  }
  return { svc: Network.create(deps), calls, reg, settings, store, pc }
}

test('scan: one read-only probe, a model with the stage before any trace, state persisted', async () => {
  const h = harness()
  const r = await h.svc.scan()
  assert.ok(r.ok && r.read && !r.stale)
  assert.strictEqual(h.calls.ps, 1)
  assert.strictEqual(r.model.resolver.current, 'auto')
  assert.deepStrictEqual(r.model.path.nodes.map(n => n.id), ['pc', 'link', 'router', 'isp', 'internet'])
  assert.ok(r.model.items.length > 5)
  assert.ok(h.store.v.last.readings && h.store.v.last.facts)
})

test('scan: when Windows cannot be read the last known state is shown, marked stale; with none it is unread', async () => {
  const h = harness()
  await h.svc.scan()
  const bad = Network.create({ runPS: async () => ({ ok: false, out: '' }), applyBatch: async () => ({}), journalList: () => [], undo: async () => ({}), tweakMeta: () => [], applicability: () => ({}), settings: () => ({}), state: { read: () => h.store.v, write: () => {} }, now: () => 9000 })
  const r = await bad.scan()
  assert.ok(r.stale && r.read && r.model.live)
  const none = Network.create({ runPS: async () => ({ ok: false }), tweakMeta: () => [], state: { read: () => null, write: () => {} }, settings: () => ({}), applicability: () => ({}), now: () => 1 })
  const r2 = await none.scan()
  assert.ok(!r2.read && r2.model.verdict.kind === 'unread')
})

test('run: journaled batch through the manual path labelled network, then read back to verify', async () => {
  const h = harness()
  await h.svc.scan()
  const prog = []
  const r = await h.svc.run({ ids: ['disable-wpad'], action: 'apply', onProgress: p => prog.push(p.phase) })
  assert.ok(r.ok)
  assert.strictEqual(h.calls.batch[0].via, 'manual')
  assert.strictEqual(h.calls.batch[0].label, 'network')
  assert.strictEqual(h.calls.ps, 2, 'one probe before, one after')
  assert.deepStrictEqual(r.receipt.items.map(i => [i.id, i.status, i.verified]), [['disable-wpad', 'ok', true]])
  assert.deepStrictEqual(prog, ['start', 'verify', 'done'])
  assert.strictEqual(r.model.items.find(i => i.id === 'disable-wpad').status, 'on')
  assert.strictEqual(h.store.v.runs[0].batchId, 'b1')
  const back = await h.svc.run({ ids: ['disable-wpad'], action: 'restore' })
  assert.strictEqual(back.receipt.items[0].verified, true)
})

test('run: a change Windows does not show afterwards is a mismatch, not a success; a failed item does not stop the rest', async () => {
  const h = harness({ noFlip: true })
  const r = await h.svc.run({ ids: ['disable-wpad'], action: 'apply' })
  assert.strictEqual(r.receipt.items[0].verified, false)
  assert.strictEqual(r.receipt.counts.mismatch, 1)
  const h2 = harness({ fail: ['disable-wpad'] })
  const r2 = await h2.svc.run({ ids: ['disable-wpad', 'nic-interrupt-mod'], action: 'apply' })
  assert.deepStrictEqual(r2.receipt.items.map(i => i.status), ['failed', 'ok'])
  assert.strictEqual(r2.receipt.counts.failed, 1)
})

test('run: no restore point = nothing changed; unknown ids are dropped; a retired switch can only be restored; a second run is busy', async () => {
  const a = harness({ abort: true })
  const r = await a.svc.run({ ids: ['disable-wpad'], action: 'apply' })
  assert.ok(!r.ok && r.aborted && r.guidance)
  const h = harness({ meta: { 'tcp-stack': { retired: 'no benefit' } } })
  assert.strictEqual((await h.svc.run({ ids: ['not-a-tweak', 'game-dvr'], action: 'apply' })).error, 'nothing-to-do')
  assert.strictEqual((await h.svc.run({ ids: ['tcp-stack'], action: 'apply' })).error, 'nothing-to-do')
  assert.ok((await h.svc.run({ ids: ['tcp-stack'], action: 'restore' })).ok)
  const s = harness({ slow: true })
  const first = s.svc.run({ ids: ['disable-wpad'], action: 'apply' })
  assert.strictEqual((await s.svc.run({ ids: ['nic-interrupt-mod'], action: 'apply' })).error, 'busy')
  assert.strictEqual((await s.svc.dnsSet({ preset: 'google' })).error, 'busy')
  assert.strictEqual((await s.svc.checkup()).error, 'busy')
  await first
})

test('dnsSet: a preset applies its tweak and is verified against the resolver the adapter really uses', async () => {
  const h = harness()
  await h.svc.scan()
  const r = await h.svc.dnsSet({ preset: 'cloudflare' })
  assert.ok(r.ok)
  assert.deepStrictEqual(h.calls.batch[0].items, [{ tweakId: 'dns-cloudflare', action: 'apply' }])
  assert.strictEqual(r.receipt.items[0].verified, true)
  assert.strictEqual(r.model.resolver.current, 'cloudflare')
  const mis = harness({ noFlip: true })
  assert.strictEqual((await mis.svc.dnsSet({ preset: 'google' })).receipt.items[0].verified, false)
  assert.strictEqual((await h.svc.dnsSet({ preset: 'nope' })).error, 'unknown-preset')
})

test('dnsSet: automatic restores whichever resolver tweak is applied, then verifies DHCP', async () => {
  const h = harness({ settings: { 'tweak_dns-google': 'applied' } })
  h.pc.dns = { servers: ['8.8.8.8', '8.8.4.4'], isStatic: true }
  const r = await h.svc.dnsSet({ preset: 'auto' })
  assert.deepStrictEqual(h.calls.batch[0].items, [{ tweakId: 'dns-google', action: 'restore' }])
  assert.strictEqual(r.receipt.items[0].verified, true)
  assert.strictEqual(r.model.resolver.current, 'auto')
})

test('dnsSet: custom servers are validated and saved BEFORE anything is applied', async () => {
  const h = harness()
  const bad = await h.svc.dnsSet({ preset: 'custom', custom: { primary: '1.1.1', secondary: '' } })
  assert.strictEqual(bad.error, 'primary-invalid')
  assert.strictEqual(h.calls.batch.length, 0); assert.strictEqual(h.calls.saved.length, 0)
  const inj = await h.svc.dnsSet({ preset: 'custom', custom: { primary: '1.1.1.1; calc', secondary: '' } })
  assert.strictEqual(inj.error, 'primary-invalid')
  const ok = await h.svc.dnsSet({ preset: 'custom', custom: { primary: '10.9.9.9', secondary: '10.9.9.8' } })
  assert.ok(ok.ok)
  assert.deepStrictEqual(h.calls.saved, [{ customDnsPrimary: '10.9.9.9', customDnsSecondary: '10.9.9.8' }])
  assert.strictEqual(ok.model.resolver.current, 'custom')
  const nf = harness({ saveFail: true })
  assert.strictEqual((await nf.svc.dnsSet({ preset: 'custom', custom: { primary: '10.9.9.9' } })).error, 'save-failed')
  assert.strictEqual(nf.calls.batch.length, 0)
})

test('checkup: switches, a 12-round trace, a DNS benchmark -> findings; progress in order; state saved; the poller is stopped', async () => {
  const h = harness({ curMs: 45 })
  const prog = []
  const r = await h.svc.checkup({ onProgress: p => prog.push(p.phase) })
  assert.ok(r.ok, r.error)
  assert.deepStrictEqual([...new Set(prog)], ['switches', 'path', 'dns', 'done'])
  assert.strictEqual(r.path.rounds, 12)
  assert.strictEqual(r.path.verdict.id, 'clean')
  assert.strictEqual(r.measured, true)
  assert.strictEqual(r.hops.length, 4)
  assert.strictEqual(r.bench.current.median, 45)
  const f = r.findings.find(x => x.id === 'dns-slow')
  assert.ok(f && f.action.preset === 'cloudflare')
  assert.ok(h.calls.killed >= 1, 'the PowerShell tracer is killed')
  assert.ok(h.calls.emit.some(([ch, p]) => ch === 'net2-route' && p.target.checkup), 'the stage gets frames during the checkup')
  assert.strictEqual(h.store.v.lastCheckup.at, 5000)
  assert.strictEqual(h.store.v.checkups[0].verdict, 'clean')
  assert.strictEqual(h.svc.cached().last.at, 5000)
  assert.strictEqual(h.svc.busy(), false)
})

test('checkup: a trace that never gets an answer is reported as not measured, and the settings are still checked', async () => {
  const h = harness({ rounds: 0, timeout: 60 })
  const r = await h.svc.checkup()
  assert.ok(r.ok)
  assert.strictEqual(r.measured, false)
  assert.strictEqual(r.healthy, false)
  assert.ok(!r.findings.some(f => f.id.startsWith('path-')))
})

test('checkup: loss that starts at the ISP is found and named', async () => {
  let n = 0
  const h = harness({ hops: () => { n++; return [[1, '192.168.1.1', 1.5], [2, '100.64.0.1', 9], n % 4 ? [3, '84.1.1.1', 11] : [3, null, null], n % 4 ? [4, '1.1.1.1', 13] : [4, null, null]] } })
  const r = await h.svc.checkup()
  assert.strictEqual(r.path.verdict.id, 'loss-isp')
  assert.strictEqual(r.findings[0].id, 'path-loss-isp')
  assert.strictEqual(r.findings[0].tone, 'bad')
})

test('route: only an IPv4 literal or a name that resolves; frames are emitted; stop kills the child', async () => {
  const h = harness()
  assert.strictEqual((await h.svc.routeStart('nope.invalid')).error, 'dns')
  assert.strictEqual((await h.svc.routeStart('1.1.1.1; calc')).error, 'dns')
  assert.strictEqual(h.calls.spawn, 0)
  const r = await h.svc.routeStart('example.com')
  assert.ok(r.ok && r.ip === '93.184.216.34')
  await new Promise(res => setTimeout(res, 40))
  const frames = h.calls.emit.filter(([ch]) => ch === 'net2-route')
  assert.ok(frames.length >= 3)
  assert.strictEqual(frames[0][1].target.host, 'example.com')
  assert.ok(frames.at(-1)[1].path.nodes.length === 5 && frames.at(-1)[1].hops.length)
  assert.strictEqual(h.svc.routeSnapshot().running, true)
  h.svc.routeStop()
  assert.strictEqual(h.svc.routeSnapshot().running, false)
  assert.ok(h.calls.killed >= 1)
  const again = await h.svc.routeStart('8.8.8.8'); assert.ok(again.ok)
  h.svc.shutdown()
  assert.strictEqual(h.svc.routeSnapshot().running, false)
})

test('history: only network switches, grouped by batch; once-only repairs show their last run; undo re-reads', async () => {
  const j = [
    { id: 'e1', batchId: 'b1', tweakId: 'disable-wpad', action: 'apply', via: 'manual', ts: 100, result: 'ok' },
    { id: 'e2', batchId: 'b1', tweakId: 'flush-dns', action: 'apply', via: 'manual', ts: 101, result: 'ok' },
    { id: 'e3', batchId: 'b2', tweakId: 'game-dvr', action: 'apply', via: 'manual', ts: 200, result: 'ok' },
    { id: 'e4', batchId: 'b3', tweakId: 'flush-dns', action: 'apply', via: 'manual', ts: 300, result: 'ok' },
  ]
  const h = harness({ journal: j })
  const hist = h.svc.history()
  assert.deepStrictEqual(hist.batches.map(b => b.batchId), ['b3', 'b1'])
  const sc = await h.svc.scan()
  assert.strictEqual(sc.model.items.find(i => i.id === 'flush-dns').lastRun, 300)
  const before = h.calls.ps
  const u = await h.svc.undo({ batchId: 'b1' })
  assert.ok(u.ok && u.model && h.calls.ps === before + 1)
})
