'use strict'
// Restore points "Lifeline" engine (lib/restore): probe parser, origin decoder, coverage rules, verdict + findings, restore reconcile, and the service's
// write -> read-back flows on the preview fixture's fake PC.
const test = require('node:test')
const assert = require('node:assert/strict')
const Restore = require('../lib/restore')
const { detect, model, actions } = Restore
const F = require('../lib/restore/findings')
const fixture = require('../tools/ui-preview/restore-fixture')

const DAY = 86400000, GB = 1024 ** 3
const NOW = Date.UTC(2026, 10, 17, 12, 0, 0)
const wmi = ms => { const d = new Date(ms), p = (n, l = 2) => String(n).padStart(l, '0'); return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}.000000+000` }
const probeOut = (over = {}) => 'JJRP:' + JSON.stringify({
  admin: true, drive: 'C:', pointsRead: true, points: [{ seq: 7, desc: 'JylliTool_Manual', time: wmi(NOW - DAY), type: 12 }], lastStatus: null, interval: 1, vssStart: 3,
  storage: { has: true, used: 1 * GB, max: 10 * GB, alloc: 1 * GB }, volume: { size: 100 * GB, free: 50 * GB }, battery: { present: false, discharging: false, pct: null },
  bootAt: new Date(NOW - 3600000).toISOString(), programs: [], ...over })

// ── probe parser ──
test('parse: points are newest first with real times; protection comes from Windows\' own flag', () => {
  const r = detect.parse(probeOut({ points: [{ seq: 3, desc: 'a', time: wmi(NOW - 5 * DAY), type: 0 }, { seq: 9, desc: 'b', time: wmi(NOW - DAY), type: 12 }] }))
  assert.equal(r.ok, true)
  assert.deepEqual(r.points.map(p => p.seq), [9, 3])
  assert.equal(r.points[0].at, NOW - DAY)
  assert.equal(r.protection, 'on')
  assert.equal(detect.parse(probeOut({ interval: 0 })).protection, 'off')
  assert.equal(detect.parse(probeOut({ interval: null, storage: { has: false, used: 0, max: 0, alloc: 0 } })).protection, 'off')
  assert.equal(detect.parse(probeOut({ interval: null })).protection, 'on')
})
test('parse: a probe that did not run is ok:false, a probe that could not list points is pointsRead:false (never "none")', () => {
  assert.equal(detect.parse('').ok, false)
  assert.equal(detect.parse('JJRP:{not json').ok, false)
  const r = detect.parse(probeOut({ pointsRead: false, points: [] }))
  assert.equal(r.ok, true); assert.equal(r.pointsRead, false)
})
test('parse: a cap bigger than the disk is "unbounded", not a number to show', () => {
  const r = detect.parse(probeOut({ storage: { has: true, used: GB, max: 18446744073709552000, alloc: GB } }))
  assert.equal(r.storage.unbounded, true); assert.equal(r.storage.max, null)
  assert.equal(detect.parse(probeOut()).storage.max, 10 * GB)
})
test('parse: policy flags, VSS start, last restore status words', () => {
  const r = detect.parse(probeOut({ disableSR: 1, vssStart: 4 }))
  assert.equal(r.policy.blocked, true); assert.equal(r.vss.disabled, true)
  assert.equal(detect.lastStatusOf('The last attempt to restore the computer failed.'), 'failed')
  assert.equal(detect.lastStatusOf('The last restore was interrupted'), 'interrupted')
  assert.equal(detect.lastStatusOf('The last attempt succeeded'), 'succeeded')
  assert.equal(detect.lastStatusOf(''), 'unknown')
})
test('parse: install dates are day precision and junk is dropped', () => {
  const r = detect.parse(probeOut({ programs: [{ n: 'A', d: '20261110' }, { n: 'B', d: 'nope' }, { n: '', d: '20261110' }] }))
  assert.equal(r.programs.length, 1); assert.equal(new Date(r.programs[0].day).getDate(), 10)
})

// ── names ──
test('originOf: the only decoder of restore point names', () => {
  const o = (d, t) => model.originOf(d, t)
  assert.deepEqual(o('JylliTool_Before_msi-mode'), { origin: 'beforeTweak', group: 'jylli', arg: 'msi-mode' })
  assert.equal(o('JylliTool_AutoOpti').origin, 'autoOpti')
  assert.equal(o('JylliTool_v1_FirstRun').origin, 'firstRun')
  assert.equal(o('JylliTool_Debloat').origin, 'debloat')
  assert.equal(o('JylliTool_Scheduled').origin, 'scheduled')
  assert.deepEqual(o('JylliTool_Manual - Before drivers'), { origin: 'manual', group: 'jylli', arg: 'Before drivers' })
  assert.equal(o('JylliTool_Manual_20261101').arg, '')   // the old default name ended in a date, not a label
  assert.equal(o('JylliTool_v1_Quick').origin, 'manual')
  assert.equal(o('Something', 10).origin, 'driver')
  assert.equal(o('Installed Foo', 0).origin, 'installer')
  assert.equal(o('Windows Update', 12).origin, 'windowsUpdate')
  assert.equal(o('Restore Operation', 6).origin, 'restoreOp')
  assert.equal(o('Whatever', 12).group, 'windows')
})

// ── coverage ──
const ch = (id, daysAgo, tweakId = 't') => ({ id, ts: NOW - daysAgo * DAY, tweakId, action: 'apply', via: 'manual', result: 'ok' })
test('a point covers the changes made AFTER it; changes older than every point have no point behind them', () => {
  const points = [{ seq: 2, at: NOW - 2 * DAY }, { seq: 1, at: NOW - 10 * DAY }]
  const changes = model.activeChanges([ch('a', 1), ch('b', 5), ch('c', 20)])
  assert.deepEqual(model.sinceOf(points, changes).map(c => c.id), ['a'])
  assert.deepEqual(model.unprotectedOf(points, changes).map(c => c.id), ['c'])
  assert.deepEqual(model.sinceOf([], changes), []); assert.deepEqual(model.unprotectedOf([], changes), [])
})
test('activeChanges drops undone entries, undo entries and failures', () => {
  const e = [ch('ok', 1), { ...ch('u', 1), undoneBy: 'x' }, { ...ch('v', 1), via: 'undo' }, { ...ch('f', 1), result: 'error' }]
  assert.deepEqual(model.activeChanges(e).map(c => c.id), ['ok'])
})
test('lifeline: a big batch is a few ticks, the counts are kept, and older points are counted not drawn', () => {
  const changes = model.activeChanges(Array.from({ length: 300 }, (_, i) => ch('c' + i, 1 + (i % 3) * 0.0001)))
  const L = model.lifeline([{ seq: 1, at: NOW - 40 * DAY, origin: 'manual', group: 'jylli' }, { seq: 2, at: NOW - 5 * DAY, origin: 'manual', group: 'jylli' }], changes, NOW)
  assert.ok(L.ticks.length <= 3); assert.equal(L.ticks.reduce((n, t) => n + t.n, 0), 300)
  assert.equal(L.older, 1); assert.equal(L.points.length, 1); assert.equal(L.since, true)
  assert.ok(L.points[0].x > 0 && L.points[0].x < 1)
})
test('afterPoint: programs installed on a LATER day are listed apart from the same day (day precision)', () => {
  const p = { at: Date.UTC(2026, 10, 10, 12) }
  const day = d => new Date(2026, 10, d).getTime()
  const a = model.afterPoint(p, model.activeChanges([{ ...ch('a', 0.1), ts: p.at + 1000 }, { ...ch('b', 0.1), ts: p.at - 1000 }]), [{ name: 'later', day: day(12) }, { name: 'same', day: new Date(p.at).setHours(0, 0, 0, 0) }, { name: 'older', day: day(1) }])
  assert.deepEqual(a.changes.map(c => c.id), ['a']); assert.deepEqual(a.later.map(x => x.name), ['later']); assert.deepEqual(a.same.map(x => x.name), ['same'])
})
test('roomEstimate: a bounded cap uses the free cap, nothing to base it on is null', () => {
  assert.equal(model.roomEstimate({ has: true, used: 4 * GB, max: 10 * GB }, null, 4), 6)
  assert.equal(model.roomEstimate({ has: true, used: 0, max: 10 * GB }, null, 0), null)
  assert.equal(model.roomEstimate({ has: true, used: 10 * GB, max: 10 * GB }, null, 5), 0)
  assert.equal(model.roomEstimate(null, null, 3), null)
})

// ── verdict + findings ──
const vm = o => ({ read: true, admin: true, protection: 'on', policyBlocked: false, points: 3, since: 0, newestAt: NOW - DAY, now: NOW, ...o })
test('verdict: one rule, in order', () => {
  const k = o => F.verdict(vm(o)).kind
  assert.equal(k({}), 'covered')
  assert.equal(k({ read: false }), 'unknown')
  assert.equal(k({ admin: false, read: false }), 'noadmin')
  assert.equal(k({ protection: 'off' }), 'off')
  assert.equal(k({ policyBlocked: true }), 'off')
  assert.equal(F.verdict(vm({ policyBlocked: true })).vars.policy, 1)
  assert.equal(k({ points: 0 }), 'none')
  assert.equal(k({ newestAt: NOW - 8 * DAY }), 'stale')
  assert.equal(k({ newestAt: NOW - 7 * DAY + 1000 }), 'covered')
  assert.equal(k({ since: 40 }), 'covered')   // changes after the newest point are COVERED by it, never a warning
  assert.equal(F.verdict(vm({ read: false })).cta, 'rescan')
})
test('findings: named thresholds, and the headline is never repeated', () => {
  const kinds = (o, v) => F.compute(vm(o), v).map(f => f.kind)
  assert.deepEqual(kinds({ unprotected: 2 }), ['unprotected'])
  assert.deepEqual(kinds({ storage: { has: true, used: 8.6 * GB, max: 10 * GB } }), ['storageHigh'])
  assert.deepEqual(kinds({ storage: { has: true, used: 8.4 * GB, max: 10 * GB } }), [])
  assert.deepEqual(kinds({ storage: { has: true, used: 0.1 * GB, max: 0.5 * GB } }), ['capSmall'])
  assert.deepEqual(kinds({ volume: { size: 100 * GB, free: 4 * GB } }), ['diskLow'])
  assert.deepEqual(kinds({ vssDisabled: true }), ['vss'])
  assert.deepEqual(kinds({ policyBlocked: true, protection: 'on' }), ['policy'])
  assert.deepEqual(kinds({ newestAt: NOW - 9 * DAY }, 'stale'), [])
  assert.deepEqual(kinds({ read: false }), [])
})

// ── restore outcome + reconcile ──
test('outcome: the restore we asked for is judged from evidence, never assumed', () => {
  const pending = { seq: 5, at: NOW - 2 * 3600000, pointAt: NOW - 3 * DAY }
  const pr = o => ({ ok: true, points: [], lastStatus: 'unknown', bootAt: pending.at + 60000, ...o })
  assert.equal(model.outcome(pending, pr({ points: [{ type: 6, at: pending.at + 90000 }] }), NOW).status, 'succeeded')
  assert.equal(model.outcome(pending, pr({ lastStatus: 'failed' }), NOW).status, 'failed')
  assert.equal(model.outcome(pending, pr({ lastStatus: 'interrupted' }), NOW).status, 'interrupted')
  assert.equal(model.outcome(pending, pr({ lastStatus: 'succeeded' }), NOW).status, 'succeeded')
  assert.equal(model.outcome(pending, pr({ lastStatus: 'unknown' }), NOW).status, 'unknown')
  assert.equal(model.outcome(pending, pr({ bootAt: pending.at - 3600000 }), NOW).status, 'cancelled')       // no reboot since the request, long ago
  assert.equal(model.outcome({ ...pending, at: NOW - 60000 }, pr({ bootAt: NOW - 3 * 3600000 }), NOW).status, 'waiting')
  assert.equal(model.outcome(pending, { ok: false }, NOW).status, 'unreadable')
  // an OLD successful status without a reboot since the request proves nothing
  assert.equal(model.outcome(pending, pr({ bootAt: pending.at - 3600000, lastStatus: 'succeeded' }), NOW).status, 'cancelled')
})
test('reconcilePlan: only entries between the point and the request; the oldest entry per tweak decides the flag', () => {
  const pending = { pointAt: NOW - 3 * DAY, at: NOW - DAY }
  const e = [
    { id: 'before', ts: pending.pointAt - 1000, tweakId: 'x', action: 'apply' },
    { id: 'a1', ts: NOW - 2.5 * DAY, tweakId: 'x', action: 'apply' },
    { id: 'a2', ts: NOW - 2 * DAY, tweakId: 'x', action: 'restore' },
    { id: 'b1', ts: NOW - 2 * DAY, tweakId: 'y', action: 'restore' },
    { id: 'after', ts: NOW - 0.5 * DAY, tweakId: 'z', action: 'apply' },
    { id: 'undone', ts: NOW - 2 * DAY, tweakId: 'w', action: 'apply', undoneBy: 'u' },
    { id: 'ctl', ts: NOW - 2 * DAY, control: 'debloat:app', action: 'apply' },
  ]
  const p = model.reconcilePlan(pending, e)
  assert.deepEqual(p.ids.sort(), ['a1', 'a2', 'b1', 'ctl'].sort())
  assert.deepEqual(p.flags, { tweak_x: 'restored', tweak_y: 'applied' })
})

// ── actions ──
test('actions: numbers are validated before they reach a command line', () => {
  assert.throws(() => actions.restoreScript('1; calc'), /invalid/)
  assert.throws(() => actions.deleteScript(-3), /invalid/)
  assert.throws(() => actions.storageScript(0), /invalid/)
  assert.throws(() => actions.deleteByIdScript('{x}; calc'), /invalid/)
  assert.match(actions.storageScript(10), /MaxSize=10%/)
  assert.deepEqual(actions.parseOk({ out: 'noise\nRP_OK' }), { ok: true })
  assert.equal(actions.parseOk({ out: 'RP_FAIL:not_admin' }).code, 'not_admin')
  assert.equal(actions.parseOk({ out: '' }).ok, false)
})
test('cleanLabel: Finnish letters survive as Latin twins, the rest is cut to a safe set', () => {
  assert.equal(Restore.cleanLabel('Pelien jälkeen ÄÖ å'), 'Pelien jalkeen AO a')
  assert.equal(Restore.cleanLabel("a';calc;'b"), 'a calc b')
  assert.equal(Restore.cleanLabel('x'.repeat(100)).length, 40)
})

// ── the service on the fake PC ──
test('service: create is single-flight, confirmed by a fresh read, and reports the phases', async () => {
  const phases = []
  const R = fixture.rig('covered')
  const before = (await R.svc.scan()).points.length
  const [a, b] = await Promise.all([R.svc.createNow({ label: 'Before test' }), R.svc.createNow({ label: 'again' })])
  assert.equal(a.ok, true); assert.equal(a.verified, true)
  assert.equal(b.ok, false); assert.equal(b.code, 'busy')
  assert.equal(a.snapshot.points.length, before + 1)
  assert.equal(a.snapshot.points[0].origin, 'manual'); assert.equal(a.snapshot.points[0].arg, 'Before test')
  assert.equal(phases.length, 0)
})
test('service: delete is read back; a point that stays is a failure', async () => {
  const R = fixture.rig('covered')
  const s = await R.svc.scan(), seq = s.points[s.points.length - 1].seq
  const r = await R.svc.remove({ seq })
  assert.equal(r.ok, true); assert.ok(!r.snapshot.points.some(p => p.seq === seq))
  assert.equal((await R.svc.remove({ seq: 'x' })).ok, false)
})
test('service: protection and storage cap are read back', async () => {
  const R = fixture.rig('stale')
  const off = await R.svc.protect({ on: false })
  assert.equal(off.ok, true); assert.equal(off.snapshot.protection, 'off'); assert.equal(off.snapshot.verdict.kind, 'off')
  const on = await R.svc.protect({ on: true })
  assert.equal(on.ok, true); assert.equal(on.snapshot.protection, 'on')
  const cap = await R.svc.storage({ pct: 5 })
  assert.equal(cap.ok, true); assert.ok(Math.abs(cap.snapshot.storage.max / cap.snapshot.volume.size - 0.05) < 0.001)
  assert.equal((await R.svc.storage({ pct: 99 })).ok, false)
})
test('service: schedule accepts only the offered choices', () => {
  const R = fixture.rig('empty')
  assert.equal(R.svc.schedule({ days: 3 }).snapshot.schedule.days, 3)
  assert.equal(R.svc.schedule({ days: 2 }).ok, false)
})
test('service: a returned restore is reconciled once: journal marked, flags patched, receipt kept until dismissed', async () => {
  const R = fixture.rig('returned')
  const s = await R.svc.scan()
  assert.equal(s.lastRestore.status, 'succeeded'); assert.equal(s.lastRestore.marked, 3); assert.equal(s.pending, null)
  assert.ok(R.pc.journal.filter(e => e.undoneBy).length === 3)
  assert.equal((await R.svc.scan()).lastRestore.marked, 3)   // not marked again
  assert.equal(R.svc.ack().snapshot.lastRestore, null)
})
test('service: a failed restore marks nothing', async () => {
  const R = fixture.rig('failed-return')
  const s = await R.svc.scan()
  assert.equal(s.lastRestore.status, 'failed'); assert.equal(s.lastRestore.marked, 0)
  assert.ok(R.pc.journal.every(e => !e.undoneBy))
})
test('service: restore writes the pending record BEFORE it asks Windows, and clears it when Windows refuses', async () => {
  const log = []
  let store = null
  const svc = Restore.create({
    runPS: async s => {
      if (s.includes('JJRP:')) return { ok: true, out: probeOut() }
      if (s.startsWith('Restore-Computer')) { log.push(['restore', !!(store && store.pending)]); return { ok: false, out: '', err: 'Access denied' } }
      return { ok: false, out: '' }
    },
    createPoint: async () => ({ ok: true, seq: 1 }), journal: { list: () => [], markUndone() {} }, settings: { get: () => ({}), patch() {} },
    state: { read: () => store, write: v => { store = v } }, now: () => NOW, openRstrui: async () => true,
  })
  const r = await svc.restore({ seq: 7 })
  assert.deepEqual(log, [['restore', true]])
  assert.equal(r.ok, false); assert.equal(r.fallback, true)
  assert.equal(store.pending, null)
  assert.equal((await svc.restore({ seq: 999 })).error, 'not_found')
})
test('service: the schedule never runs in a game, on battery, when not due, or right after a failure', async () => {
  const mk = (over = {}) => {
    let store = null, created = 0, st = { autoSnapshotDays: 1, lastAutoSnapshot: new Date(NOW - 3 * DAY).toISOString() }
    const svc = Restore.create({
      runPS: async s => (s.includes('JJRP:') ? { ok: true, out: probeOut(over.probe || {}) } : { ok: false, out: '' }),
      createPoint: async () => { created++; return over.fail ? { ok: false, code: 'error', reason: 'x' } : { ok: true, seq: 50 + created } },
      journal: { list: () => [], markUndone() {} }, settings: { get: () => st, patch: p => Object.assign(st, p) },
      isGameRunning: () => !!over.game, state: { read: () => store, write: v => { store = v } }, now: () => NOW,
    })
    return { svc, count: () => created, st }
  }
  assert.equal((await mk({ game: true }).svc.tick()).reason, 'game')
  assert.equal((await mk({ probe: { battery: { present: true, discharging: true, pct: 50 } } }).svc.tick()).reason, 'battery')
  const ok = mk(); const r = await ok.svc.tick()
  assert.equal(r.ran, true); assert.equal(ok.count(), 1); assert.equal((await ok.svc.tick()).reason, 'not_due')
  const bad = mk({ fail: true }); assert.equal((await bad.svc.tick()).reason, 'failed'); assert.equal((await bad.svc.tick()).reason, 'retry_wait'); assert.equal(bad.count(), 1)
  const off = mk(); off.st.autoSnapshotDays = 0; assert.equal((await off.svc.tick()).reason, 'off')
})
test('service: a probe that fails is "unknown", never "no restore points"', async () => {
  const svc = Restore.create({ runPS: async () => ({ ok: false, out: '' }), createPoint: async () => ({ ok: true, seq: 1 }), journal: { list: () => [], markUndone() {} }, settings: { get: () => ({}), patch() {} }, state: { read: () => null, write() {} }, now: () => NOW })
  const s = await svc.scan()
  assert.equal(s.verdict.kind, 'unknown'); assert.equal(s.read, false); assert.deepEqual(s.points, [])
})
