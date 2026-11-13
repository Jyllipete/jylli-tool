const test = require('node:test')
const assert = require('node:assert')
const detect = require('../lib/power/detect')
const plans = require('../lib/power/plans')
const Power = require('../lib/power')

const BAL = '381b4222-f694-41f0-9685-ff5bb260df2e', MINE = '89f7c0cb-7c17-4774-be56-b135ea7e679b', OLD1 = 'b7c1e4d9-3a52-4f88-9c60-2d5e8a1f6b34', OLD2 = 'c7c1e4d9-3a52-4f88-9c60-2d5e8a1f6b34'
const SAVER = 'a1841308-3541-4fab-bc81-f71556f20b4a'
const ASPM = '501a4d13-42af-4429-9ac1-df54c6bf3fc2|ee12f906-d277-404b-b6da-e5fa1a576df5'
const K = id => plans.keyOf(plans.byAnat[id])
const HIBER = detect.keyOf({ r: 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power', n: 'HiberbootEnabled' })

function harness(o = {}) {
  const calls = { ps: [], cmd: [], batch: [], undo: [], rec: [], spawned: [], smi: [], killed: 0, emitted: [] }
  const st = {
    plans: [{ guid: BAL, name: 'Balanced' }, { guid: MINE, name: 'Mine' }, { guid: OLD1, name: 'Old' }, { guid: OLD2, name: 'Old' }], active: MINE, aspmAc: 1, aspmDc: 2, sleepAc: 1800, sleepDc: 600,
    armed: ['HID Keyboard Device', 'Intel(R) Ethernet', 'Realtek NIC', 'USB Hub'], overlay: 'ded574b5-45a0-4f42-8737-46345c09c238', files: new Set(), battery: o.battery || null, laptop: !!o.laptop, trim: o.trim == null ? 0 : o.trim,
  }
  const store = { v: null }, settings = {}
  let premium = o.premium !== false, game = !!o.game, now = 5000
  const facts = () => ({
    plans: st.plans.map(p => ({ ...p, active: p.guid === st.active })),
    idx: { [st.active]: { AC: { [ASPM]: st.aspmAc, [K('sleep')]: st.sleepAc }, DC: { [ASPM]: st.aspmDc, [K('sleep')]: st.sleepDc } } },
    battery: st.battery, trim: st.trim, overlayAc: st.overlay, cs: '0', hibernate: '1', fastStartup: '1', laptop: st.laptop, chassis: [3],
    req: 'DISPLAY:\nNone.\n\nSYSTEM:\nNone.\n\nAWAYMODE:\nNone.\n', last: 'Wake History Count - 0', armed: st.armed.join('\n'), prog: st.armed.concat(['Other']).join('\n'), timers: 'There are no active wake timers.',
  })
  const deps = {
    runPS: async script => {
      calls.ps.push(script)
      if (script.includes('JJPW:')) return o.psFail ? { ok: false, out: '' } : { ok: true, out: 'JJPW:' + JSON.stringify({ r: { [HIBER]: '1' }, f: facts() }) }
      if (script.includes('JOVL')) return { ok: true, out: 'JOVL=' + st.overlay + ' RC=0' }
      if (script.includes('JOSET')) { const m = /\[guid\]'([0-9a-f-]+)'/.exec(script); if (!o.refuseMode) st.overlay = m[1]; return { ok: true, out: 'JOSET=0' } }
      return { ok: true, out: '' }
    },
    runCmd: async c => {
      calls.cmd.push(c)
      let m
      if ((m = /^powercfg \/export "([^"]+)" ([0-9a-f-]+)$/.exec(c))) { if (!o.exportFail) st.files.add(m[1]); return { ok: !o.exportFail, out: '' } }
      if ((m = /^powercfg \/delete ([0-9a-f-]+)$/.exec(c))) { if (o.deleteFail) return { ok: false, out: '' }; st.plans = st.plans.filter(p => p.guid !== m[1]); return { ok: true, out: '' } }
      if ((m = /^powercfg \/device(enable|disable)wake "(.+)"$/.exec(c))) { if (o.wakeFail) return { ok: false, out: '' }; st.armed = st.armed.filter(d => d !== m[2]); if (m[1] === 'enable') st.armed.push(m[2]); return { ok: true, out: '' } }
      return { ok: true, out: '' }
    },
    applyBatch: async req => {
      calls.batch.push(req)
      if (o.abort) return { ok: false, aborted: true, reason: 'restore-point-failed', guidance: 'g', restorePoint: { ok: false } }
      const items = req.items.map(i => {
        if (!o.noFlip && i.tweakId === 'pcie-power') { st.aspmAc = i.action === 'apply' ? 0 : 2; st.aspmDc = st.aspmAc }
        if (!o.noFlip && i.tweakId === 'trim-enable') st.trim = i.action === 'apply' ? 0 : 1
        settings['tweak_' + i.tweakId] = i.action === 'apply' ? 'applied' : 'restored'
        return { id: i.tweakId, action: i.action, status: 'ok', journalId: 'j_' + i.tweakId, fidelity: 'exact' }
      })
      return { ok: true, batchId: 'b1', items, restorePoint: { ok: true } }
    },
    journalList: () => o.journal || [],
    undo: async t => { calls.undo.push(t); return { ok: true } },
    runRecorded: async (control, action, meta, fn) => {
      const ch = []
      const cmd = async c => {
        let m
        if ((m = /^powercfg \/setactive ([0-9a-f-]+)$/.exec(c))) st.active = m[1]
        if ((m = /^powercfg \/set(ac|dc)valueindex SCHEME_CURRENT (\S+) (\S+) (\d+)$/.exec(c))) { const a = Object.values(plans.byAnat).find(x => x.setting === m[3]); if (a && a.id === 'sleep') st['sleep' + (m[1] === 'ac' ? 'Ac' : 'Dc')] = Number(m[4]) }
        calls.cmd.push(c); return { ok: true, out: '' }
      }
      await fn(async () => ({ ok: true }), cmd, c => ch.push(c)); calls.rec.push({ control, action, meta, changes: ch })
    },
    tweakMeta: ids => ids.map(id => ({ id, safetyTier: 1, retired: null, risk: null })),
    applicability: () => ({}), settings: () => settings, isPremium: () => premium,
    state: { read: () => store.v, write: v => { store.v = JSON.parse(JSON.stringify(v)) } },
    planDir: 'C:\\plans', fileExists: p => st.files.has(p), bootMs: () => 1000, now: () => now, gameRunning: () => game, gameName: () => 'Game.exe',
    emit: (c, p) => calls.emitted.push([c, p]),
    hub: keys => Object.fromEntries(keys.map(k => [k, k === 'cpu.power' ? 60 : null])),
    spawnLive: ({ script, onLine, onExit }) => { const h = { script, onLine, onExit, kill() { calls.killed++ } }; calls.spawned.push(h); return h },
    spawnSmi: ({ args, onLine, onExit }) => { const h = { args, onLine, onExit, kill() { calls.killed++ } }; calls.smi.push(h); return h },
  }
  const svc = Power.create(deps)
  return { svc, calls, st, settings, store, setPremium: v => { premium = v }, setGame: v => { game = v }, tick: ms => { now += ms } }
}
const frame = (o = {}) => 'JJPWLIVE:' + JSON.stringify({ t: 1, perf: 100, util: o.util == null ? 5 : o.util, bat: o.bat || null }) + '\n'

test('scan: one read-only probe; model, facts and findings come back; the read is remembered; cached serves it back stale', async () => {
  const h = harness(); const r = await h.svc.scan()
  assert.ok(r.ok && r.read && !r.stale); assert.strictEqual(h.calls.ps.length, 1)
  assert.strictEqual(r.facts.activeName, 'Mine'); assert.strictEqual(r.facts.plans.length, 4); assert.strictEqual(r.facts.laptop, false)
  assert.ok(r.facts.findings.some(f => f.id === 'plan-clutter')); assert.ok(r.facts.findings.some(f => f.id === 'aspm-on-desktop'))
  assert.ok(h.store.v.last.f.plans.length === 4)
  const h4 = harness(); h4.store.v = h.store.v; const c = h4.svc.cached(); assert.ok(c.ok && c.stale)
  assert.strictEqual(harness().svc.cached(), null)
})
test('scan: a failed probe falls back to the last read and says stale; with no last read nothing is claimed', async () => {
  const h = harness(); await h.svc.scan()
  const h2 = harness({ psFail: true }); h2.store.v = h.store.v
  const r = await h2.svc.scan(); assert.ok(r.stale && r.read)
  const h3 = harness({ psFail: true }); const r3 = await h3.svc.scan()
  assert.ok(!r3.read); assert.strictEqual(r3.model.verdict.kind, 'unread'); assert.strictEqual(r3.model.recommendedIds.length, 0); assert.strictEqual(r3.facts.read, false)
})
test('run: applies through one journaled batch, reads again, verifies; a switch that did not take is a mismatch', async () => {
  const h = harness(); await h.svc.scan()
  const r = await h.svc.run({ ids: ['pcie-power'] })
  assert.ok(r.ok); assert.strictEqual(h.calls.batch.length, 1); assert.strictEqual(h.calls.batch[0].label, 'power'); assert.strictEqual(r.receipt.items[0].verified, true); assert.strictEqual(r.receipt.counts.verified, 1)
  const h2 = harness({ noFlip: true, trim: 1 }); await h2.svc.scan()
  const r2 = await h2.svc.run({ ids: ['trim-enable'] }); assert.strictEqual(r2.receipt.items[0].verified, false); assert.strictEqual(r2.receipt.counts.mismatch, 1)
})
test('run: filters unknown ids, locks Premium ones without Premium, refuses retired ones except restore, reports an aborted restore point', async () => {
  const h = harness({ premium: false }); await h.svc.scan()
  assert.strictEqual((await h.svc.run({ ids: ['pcie-power'] })).error, 'premium_required')
  assert.strictEqual((await h.svc.run({ ids: ['nope', 7] })).error, 'nothing-to-do')
  assert.strictEqual((await h.svc.run({ ids: ['nvme-latency'] })).error, 'nothing-to-do')
  const mixed = await h.svc.run({ ids: ['trim-enable', 'pcie-power'] }); assert.strictEqual(mixed.receipt.counts.locked, 1); assert.deepStrictEqual(h.calls.batch[0].items.map(i => i.tweakId), ['trim-enable'])
  const h2 = harness({ abort: true }); await h2.svc.scan(); const a = await h2.svc.run({ ids: ['trim-enable'] }); assert.ok(!a.ok && a.aborted)
})
test('run: single-flight', async () => {
  const h = harness(); await h.svc.scan()
  const a = h.svc.run({ ids: ['trim-enable'] }), b = await h.svc.run({ ids: ['trim-enable'] })
  assert.strictEqual(b.error, 'busy'); await a
})
test('planSet: only a plan from the last scan, recorded as power2:plan, read back', async () => {
  const h = harness(); await h.svc.scan()
  assert.strictEqual((await h.svc.planSet({ guid: 'not-a-guid' })).error, 'unknown-plan'); assert.strictEqual((await h.svc.planSet({ guid: SAVER })).error, 'unknown-plan')
  const r = await h.svc.planSet({ guid: BAL.toUpperCase() })
  assert.ok(r.ok && r.verified === true); assert.strictEqual(h.st.active, BAL); assert.strictEqual(r.facts.activeName, 'Balanced'); assert.strictEqual(h.calls.rec[0].control, 'power2:plan')
})
test('timeoutSet: validates, writes AC or battery only for display or sleep, read back; a bad value never reaches powercfg', async () => {
  const h = harness(); await h.svc.scan()
  for (const bad of [{ id: 'cpuMax', side: 'ac', seconds: 0 }, { id: 'sleep', side: 'x', seconds: 0 }, { id: 'sleep', side: 'ac', seconds: 61 }, { id: 'sleep', side: 'ac', seconds: '60; calc' }]) assert.strictEqual((await h.svc.timeoutSet(bad)).error, 'invalid')
  assert.strictEqual(h.calls.cmd.filter(c => /valueindex/.test(c)).length, 0)
  const r = await h.svc.timeoutSet({ id: 'sleep', side: 'dc', seconds: 300 })
  assert.ok(r.ok && r.verified === true); assert.strictEqual(h.st.sleepDc, 300); assert.strictEqual(h.st.sleepAc, 1800)
  assert.ok(h.calls.cmd.some(c => /setdcvalueindex SCHEME_CURRENT 238c9fa8-0aad-41ed-83f4-97be242c8f20 29f6c1db-86da-48c5-9fdb-f2b67b1f44da 300/.test(c)))
})
test('planTidy: exports every plan first, deletes only custom inactive ones, records each, never the active or a built-in plan', async () => {
  const h = harness(); await h.svc.scan()
  const r = await h.svc.planTidy({ guids: [MINE, BAL, OLD1, OLD2, 'junk'] })
  assert.ok(r.ok); assert.deepStrictEqual(r.results.map(x => x.guid), [OLD1, OLD2]); assert.ok(r.results.every(x => x.ok && x.verified === true))
  assert.deepStrictEqual(h.st.plans.map(p => p.guid), [BAL, MINE]); assert.strictEqual(h.st.active, MINE)
  const order = h.calls.cmd.filter(c => /export|delete/.test(c)); assert.ok(/export/.test(order[0]) && /delete/.test(order[1]))
  assert.strictEqual(h.calls.rec.length, 2); assert.strictEqual(h.calls.rec[0].changes[0].kind, 'power-plan-file'); assert.ok(h.calls.rec[0].changes[0].file.endsWith(OLD1 + '.pow'))
  assert.strictEqual((await h.svc.planTidy({ guids: [MINE, BAL] })).error, 'nothing-to-do')
})
test('planTidy: a plan that could not be exported is never deleted; a failed delete records nothing', async () => {
  const h = harness({ exportFail: true }); await h.svc.scan()
  const r = await h.svc.planTidy({ guids: [OLD1] })
  assert.strictEqual(r.results[0].error, 'export-failed'); assert.ok(!h.calls.cmd.some(c => /delete/.test(c))); assert.strictEqual(h.calls.rec.length, 0)
  const h2 = harness({ deleteFail: true }); await h2.svc.scan()
  const r2 = await h2.svc.planTidy({ guids: [OLD1] }); assert.strictEqual(r2.results[0].error, 'delete-failed'); assert.strictEqual(h2.calls.rec[0].changes.length, 0)
})
test('wakeSet: only devices the scan listed, names with shell characters refused, verified by reading again, recorded for undo', async () => {
  const h = harness(); await h.svc.scan()
  assert.strictEqual((await h.svc.wakeSet({ device: 'Unknown thing' })).error, 'unknown-device'); assert.strictEqual((await h.svc.wakeSet({ device: 'NIC" & calc' })).error, 'invalid')
  assert.ok(!h.calls.cmd.some(c => /devicedisablewake/.test(c)))
  const r = await h.svc.wakeSet({ device: 'Realtek NIC' })
  assert.ok(r.ok && r.verified === true); assert.ok(!h.st.armed.includes('Realtek NIC')); assert.strictEqual(h.calls.rec[0].changes[0].kind, 'power-wake'); assert.strictEqual(h.calls.rec[0].changes[0].before.value, 'armed')
  const h2 = harness({ wakeFail: true }); await h2.svc.scan(); assert.strictEqual((await h2.svc.wakeSet({ device: 'Realtek NIC' })).error, 'refused')
})
test('modeSet: only the three Windows power modes, recorded as power-overlay with the old value, read back', async () => {
  const h = harness(); await h.svc.scan()
  assert.strictEqual((await h.svc.modeSet({ overlay: 'abc' })).error, 'invalid')
  const r = await h.svc.modeSet({ overlay: plans.OVERLAY.balanced })
  assert.ok(r.ok && r.verified === true); const c = h.calls.rec[0].changes[0]; assert.strictEqual(c.kind, 'power-overlay'); assert.strictEqual(c.before.value, plans.OVERLAY.performance)
  const h2 = harness({ refuseMode: true }); await h2.svc.scan(); const r2 = await h2.svc.modeSet({ overlay: plans.OVERLAY.efficiency }); assert.ok(r2.ok && r2.verified === false)
})
test('history: groups journal entries of this tab only, with what each one changed; undo reads again', async () => {
  const j = [
    { id: 'e1', batchId: 'b1', tweakId: 'pcie-power', action: 'apply', via: 'manual', ts: 3, result: 'ok', changes: [] },
    { id: 'e2', batchId: 'b2', control: 'power2:plan-tidy', action: 'apply', via: 'manual', ts: 5, result: 'ok', changes: [{ kind: 'power-plan-file', name: 'Old' }] },
    { id: 'e3', batchId: 'b3', control: 'gpu2:display:x', action: 'apply', via: 'manual', ts: 9, result: 'ok', changes: [] },
    { id: 'e4', batchId: 'b4', control: 'power2:timeout:sleep:dc', action: 'apply', via: 'manual', ts: 7, result: 'ok', changes: [{ kind: 'powercfg', before: { value: '600' }, after: { value: '300' }, setting: 'x', ac: false }] },
  ]
  const h = harness({ journal: j }); await h.svc.scan()
  const hist = h.svc.history(); assert.deepStrictEqual(hist.batches.map(b => b.batchId), ['b4', 'b2', 'b1'])
  assert.strictEqual(hist.batches[1].entries[0].detail.kind, 'tidy'); assert.strictEqual(hist.batches[0].entries[0].detail.to, '300')
  const u = await h.svc.undo({ entryId: 'e2' }); assert.ok(u.ok); assert.deepStrictEqual(h.calls.undo[0], { entryId: 'e2' }); assert.ok(u.facts)
})
test('live: starts one poller with the battery only on a laptop, merges nvidia-smi and the sensor bridge, reports watts, stops without a heartbeat', async () => {
  const h = harness(); await h.svc.scan()
  assert.ok(h.svc.liveStart().ok); assert.strictEqual(h.calls.spawned.length, 1); assert.ok(!/root\\wmi/.test(h.calls.spawned[0].script) || h.calls.spawned[0].script.includes('$withBat = $false'))
  assert.strictEqual(h.calls.smi.length, 1)
  h.calls.smi[0].onLine('0, 33.5, 4\n'); h.calls.spawned[0].onLine(frame())
  const ev = h.calls.emitted.filter(e => e[0] === 'power2-live' && e[1].frame).pop()[1]
  assert.strictEqual(ev.frame.watts.gpuW, 33.5); assert.strictEqual(ev.frame.watts.cpuW, 60); assert.strictEqual(ev.frame.watts.cpuSrc, 'sensor')
  h.svc.liveStop(); assert.ok(h.calls.killed >= 2)
})
test('live: a laptop gets the battery poller and its live findings; a game pauses it; the heartbeat decides whether it resumes', async () => {
  const bat = { present: true, percent: 60, discharging: true, remainingMWh: 30000, fullMWh: 40000, designMWh: 50000, rateMW: 25000 }
  const h = harness({ laptop: true, battery: bat }); await h.svc.scan()
  h.svc.liveStart(); assert.ok(h.calls.spawned[0].script.includes('$withBat = $true'))
  for (let i = 0; i < 35; i++) h.calls.spawned[0].onLine(frame({ bat: { ac: false, charging: false, discharging: true, rateMW: 25000, remMWh: 30000 } }))
  assert.ok(h.calls.emitted.filter(e => e[1].findings && e[1].findings.some(f => f.id === 'battery-drain-high')).length > 0)
  h.svc.gameStarted(); assert.ok(h.calls.emitted.some(e => e[1].paused === 'game')); const k = h.calls.killed
  h.svc.heartbeat(); h.svc.gameEnded(); assert.strictEqual(h.calls.spawned.length, 2); assert.ok(h.calls.emitted.some(e => e[1].resumed))
  h.svc.liveStop(); h.setGame(true); h.svc.liveStart(); assert.strictEqual(h.svc.liveStart().paused, 'game')
  assert.ok(k >= 1)
})
test('live: the watchdog is not started twice and a stale heartbeat stops the poller', async () => {
  const h = harness(); await h.svc.scan(); h.svc.liveStart(); h.svc.liveStart(); assert.strictEqual(h.calls.spawned.length, 1)
  assert.deepStrictEqual(Object.keys(h.svc.heartbeat()).sort(), ['ok', 'paused', 'running', 'session'])
  h.svc.liveStop(); assert.ok(!h.svc.running())
})
test('session: needs live, integrates measured sources only, saves watt-hours and a cost, ignores a run shorter than 10 s', async () => {
  const h = harness(); await h.svc.scan()
  assert.strictEqual(h.svc.sessionStart().error, 'live-off'); h.svc.liveStart()
  assert.ok(h.svc.priceSet({ perKwh: 0.2, currency: 'EUR' }).ok); assert.strictEqual(h.svc.sessionStart({ label: 'test' }).ok, true); assert.strictEqual(h.svc.sessionStart().error, 'busy')
  for (let i = 0; i <= 3600; i++) { h.calls.smi[0].onLine('0, 200, 90\n'); h.calls.spawned[0].onLine(frame()); h.tick(1000) }
  const s = h.svc.sessionStop(); assert.ok(s.saved); assert.ok(Math.abs(s.record.gpu.wh - 200) < 5, 'gpu wh ' + s.record.gpu.wh); assert.ok(Math.abs(s.record.cpu.wh - 60) < 2)
  assert.ok(Math.abs(s.record.whTotal - 260) < 6); assert.ok(Math.abs(s.record.cost - 0.052) < 0.002); assert.strictEqual(h.store.v.sessions.length, 1)
  h.svc.sessionStart(); h.calls.spawned[0].onLine(frame()); const short = h.svc.sessionStop(); assert.ok(!short.saved); assert.strictEqual(h.store.v.sessions.length, 1)
  assert.strictEqual(h.svc.sessionStop().error, 'not-running')
})
test('session: keeps reading nvidia-smi and the sensor bridge through a game, tags the game, and stops with the live poller', async () => {
  const h = harness(); await h.svc.scan(); h.svc.liveStart(); h.svc.sessionStart(); h.setGame(true); h.svc.gameStarted()
  assert.ok(h.calls.killed >= 1); const before = h.calls.emitted.length
  h.calls.smi[0].onLine('0, 150, 95\n'); assert.ok(h.calls.emitted.length > before, 'a frame came from the smi line alone')
  assert.strictEqual(h.svc.sessionStop().record.game, 'Game.exe')
  h.svc.sessionStart(); h.svc.liveStop(); assert.ok(!h.svc.sessionActive())
})
test('priceSet: a number or null, a short currency, nothing else; sessions can be cleared', async () => {
  const h = harness(); await h.svc.scan()
  for (const bad of [{ perKwh: -1 }, { perKwh: 11 }, { perKwh: NaN }, { perKwh: 0.1, currency: 'EUR;rm' }, { perKwh: 0.1, currency: '' }]) assert.strictEqual(h.svc.priceSet(bad).error, 'invalid')
  assert.deepStrictEqual(h.svc.priceSet({ perKwh: null }).price, { perKwh: null, currency: 'EUR' }); assert.ok(h.svc.sessionsClear().ok)
})
