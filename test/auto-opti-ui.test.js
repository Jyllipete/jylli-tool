'use strict'
const test = require('node:test')
const assert = require('node:assert')
const ui = require('../js/auto-opti.js')
const reactor = require('../js/auto-opti/reactor.js')
const verify = require('../lib/auto-opti/verify')
const ao = require('../lib/auto-opti')
const { P } = require('./fixtures/auto-opti/profiles')

const finds = (name, ctx = {}) => ao.findings.findings(P[name](), { useCase: 'fps', ...ctx })

test('headline counts fixes and manual cards, not info', () => {
  const h = ui.headline(finds('cluttered'))
  assert.ok(h.n >= 10)
  assert.strictEqual(h.fix + h.manual, h.n)
  assert.strictEqual(h.healthy, false)
  const p = P.healthy(); p.security.firewallOn = false
  const hh = ui.headline(ao.findings.findings(p, { useCase: 'fps' }))
  assert.strictEqual(hh.n, 2)            // usb-suspend + ui-snappy; the firewall card is info
  assert.strictEqual(hh.healthy, true)
})

test('selection only sends differences from the defaults', () => {
  const list = finds('cluttered')
  const on = ui.initialOn(list)
  assert.deepStrictEqual(ui.selection(list, on), { include: [], exclude: [] })
  on.set('display-refresh', false)
  assert.deepStrictEqual(ui.selection(list, on).exclude, ['display-refresh'])
  const lap = ao.findings.findings(P['intel-laptop'](), { useCase: 'fps' })
  const lon = ui.initialOn(lap)
  assert.strictEqual(lon.get('display-refresh'), false)
  lon.set('display-refresh', true)
  assert.deepStrictEqual(ui.selection(lap, lon).include, ['display-refresh'])
})

test('a selection that round-trips through the engine builds the plan the user ticked', () => {
  const list = finds('cluttered')
  const on = ui.initialOn(list); on.set('junk', false); on.set('mouse-accel', false)
  const pl = ao.plan.plan(list, { ...ui.selection(list, on), premium: false })
  assert.ok(!pl.steps.some(s => s.findingId === 'junk' || s.findingId === 'mouse-accel'))
  assert.ok(pl.steps.some(s => s.findingId === 'display-refresh'))
})

test('moduleViews groups fix findings in module order with tick counts', () => {
  const list = finds('cluttered'); const on = ui.initialOn(list)
  const v = ui.moduleViews(list, on)
  const order = v.map(m => ui.MODULE_ORDER.indexOf(m.id))
  assert.deepStrictEqual(order, [...order].sort((a, b) => a - b))
  assert.ok(v.every(m => m.total === m.items.length && m.onCount <= m.total))
  on.set('junk', false)
  assert.strictEqual(ui.moduleViews(list, on).find(m => m.id === 'cleanup').on, false)
})

test('run state: events fold into lanes, steps, counters; confirm clears when the step ends', () => {
  const list = finds('cluttered')
  const pl = ao.plan.plan(list, {})
  const run = ui.newRun(pl)
  assert.strictEqual(run.order.length, pl.steps.length)
  const first = pl.steps[0]
  ui.applyEvent(run, { phase: 'module-start', module: first.module })
  ui.applyEvent(run, { phase: 'step-start', stepId: first.stepId })
  assert.strictEqual(run.steps.get(first.stepId).status, 'running')
  ui.applyEvent(run, { phase: 'confirm-request', stepId: first.stepId, device: 'D', from: 60, to: 165, deadline: 1 })
  assert.ok(run.confirm)
  ui.applyEvent(run, { phase: 'step-done', stepId: first.stepId, module: first.module, status: 'ok', changes: [{ labelKey: 'refreshRate' }], counters: { settingsChanged: 3 } })
  assert.strictEqual(run.confirm, null)
  assert.strictEqual(run.steps.get(first.stepId).status, 'ok')
  assert.strictEqual(run.counters.settingsChanged, 3)
  assert.strictEqual(run.modules.get(first.module).done, 1)
  assert.ok(ui.progress(run) > 0 && ui.progress(run) < 1)
  ui.applyEvent(run, { phase: 'counter', counters: { bytesReclaimed: 5 } })
  assert.strictEqual(run.counters.bytesReclaimed, 5); assert.strictEqual(run.counters.settingsChanged, 3)
  ui.applyEvent(run, { phase: 'done', ok: true, rebootRequired: true })
  assert.strictEqual(run.phase, 'done'); assert.strictEqual(run.finished.rebootRequired, true)
  assert.strictEqual(ui.applyEvent(null, {}), null)
})

test('progress counts finished steps only', () => {
  const run = ui.newRun({ steps: [{ stepId: 'a', module: 'gpu' }, { stepId: 'b', module: 'gpu' }], modules: [{ id: 'gpu', steps: 2 }] })
  assert.strictEqual(ui.progress(run), 0)
  ui.applyEvent(run, { phase: 'step-start', stepId: 'a' })
  assert.strictEqual(ui.progress(run), 0)
  ui.applyEvent(run, { phase: 'step-done', stepId: 'a', module: 'gpu', status: 'already' })
  assert.strictEqual(ui.progress(run), 0.5)
})

test('close is blocked only while changes are being applied', () => {
  const run = ui.newRun({ steps: [], modules: [] })
  assert.strictEqual(ui.canClose('scan', null), true)
  assert.strictEqual(ui.canClose('run', run), false)
  run.phase = 'done'
  assert.strictEqual(ui.canClose('run', run), true)
  assert.strictEqual(ui.canClose('result', null), true)
})

test('trail follows the scene; welcome back sits on the result step', () => {
  assert.deepStrictEqual(ui.TRAIL.map((_, i) => ui.trailState('plan', i)), ['done', 'done', 'active', 'todo', 'todo'])
  assert.strictEqual(ui.trailState('welcome', 4), 'active')
})

test('formatting', () => {
  assert.strictEqual(ui.fmtBytes(0), '0 MB'); assert.strictEqual(ui.fmtBytes(300 * 1024 ** 2), '300 MB')
  assert.strictEqual(ui.fmtBytes(2.4 * 1024 ** 3), '2.4 GB'); assert.strictEqual(ui.fmtBytes(12 * 1024 ** 3), '12 GB')
  assert.strictEqual(ui.fmtDuration(45), '45 s'); assert.strictEqual(ui.fmtDuration(95), '1 min 35 s'); assert.strictEqual(ui.fmtDuration(120), '2 min')
})

test('every refusal reason maps to a message key', () => {
  for (const r of ['game-running', 'run-active', 'not-admin', 'scan-expired', 'already-running', 'empty-plan', 'scan-failed', 'restore-point-failed', 'something-new']) assert.ok(/^r[A-Z]/.test(ui.reasonKey(r)), r)
  assert.strictEqual(ui.reasonKey('restore-point-failed'), 'rRestore')
})

// ── reactor geometry ──
test('reactor segments tile the circle with gaps and never overlap', () => {
  const s = reactor.segments(10, 6)
  assert.strictEqual(s.length, 10)
  for (let i = 0; i < s.length; i++) { assert.ok(s[i].a1 > s[i].a0); if (i) assert.ok(s[i].a0 >= s[i - 1].a1) }
  assert.ok(s[9].a1 <= 360)
  assert.deepStrictEqual(reactor.segments(0), [])
  assert.ok(/^M[\d. -]+A124 124 0 0 1/.test(s[0].d))
})

test('reactor satellites sit on the ring, evenly spaced, starting at the top', () => {
  const sat = reactor.satellites(9, 142)
  assert.strictEqual(sat.length, 9)
  assert.ok(Math.abs(sat[0].x - 150) < .01 && Math.abs(sat[0].y - 8) < .01)
  for (const p of sat) assert.ok(Math.abs(Math.hypot(p.x - 150, p.y - 150) - 142) < .05)
})

// ── verification after the restart ──
test('boot events: parsed, sorted, garbage ignored; baseline is the median of the last three boots before the run', () => {
  const out = ['2026-10-01T10:00:00.0000000Z|60000', '2026-10-02T10:00:00.0000000Z|48000', '2026-10-03T10:00:00.0000000Z|54000', '2026-09-30T10:00:00Z|90000', 'junk', '2026-10-04T10:00:00Z|5', 'LASTBOOT=2026-10-04T09:50:00.0000000Z'].join('\n')
  const { events, lastBootAt } = verify.parseBootEvents(out)
  assert.strictEqual(events.length, 4)                      // the 5 ms entry is rejected
  assert.strictEqual(events[0].ms, 54000)                   // newest first
  assert.strictEqual(lastBootAt, Date.parse('2026-10-04T09:50:00Z'))
  assert.strictEqual(verify.bootBaseline(events, Date.parse('2026-10-03T23:00:00Z')), 54000)
  assert.strictEqual(verify.bootBaseline([], Date.now()), null)
  assert.strictEqual(verify.median([1, 3, 2, 4]), 3)
})

test('verifyState: not rebooted yet, waiting for the log, unavailable, and a real before/after', () => {
  const runAt = Date.parse('2026-10-03T12:00:00Z')
  const pv = { runAt, bootBaselineMs: 60000, rebootRequired: true, needsYou: ['ram-xmp-off'] }
  assert.deepStrictEqual(Object.keys(verify.verifyState(pv, { lastBootAt: runAt - 1000, events: [], now: runAt + 5000 })).sort(), ['ageMs', 'pending', 'rebootRequired', 'rebooted', 'runAt'])
  assert.strictEqual(verify.verifyState(null, {}).pending, false)
  const at = runAt + 3600000
  assert.deepStrictEqual(verify.verifyState(pv, { lastBootAt: at, events: [], now: at + 60000 }).boot, { waiting: true })
  assert.deepStrictEqual(verify.verifyState(pv, { lastBootAt: at, events: [], now: at + 3600000 }).boot, { unavailable: true })
  const ok = verify.verifyState(pv, { lastBootAt: at, events: [{ at: at + 120000, ms: 45000 }], drift: { total: 10, same: 9, drifted: [{ tweakId: 'x', items: ['Y'] }] }, now: at + 200000 })
  assert.deepStrictEqual(ok.boot, { beforeMs: 60000, afterMs: 45000, deltaMs: -15000 })
  assert.strictEqual(ok.persisted.same, 9); assert.strictEqual(ok.persisted.drifted.length, 1)
  assert.deepStrictEqual(ok.needsYou, ['ram-xmp-off'])
  // an event from before the run must not be mistaken for the new boot
  assert.deepStrictEqual(verify.verifyState(pv, { lastBootAt: at, events: [{ at: runAt - 5000, ms: 61000 }], now: at + 60000 }).boot, { waiting: true })
  // no baseline captured: still shows the new boot time, with no delta
  assert.deepStrictEqual(verify.verifyState({ ...pv, bootBaselineMs: null }, { lastBootAt: at, events: [{ at: at + 1, ms: 45000 }], now: at + 9 }).boot, { beforeMs: null, afterMs: 45000, deltaMs: null })
})
