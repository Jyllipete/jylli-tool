'use strict'
const test = require('node:test')
const assert = require('node:assert')
const ao = require('../lib/auto-opti')
const { createRunner, controlChanges } = require('../lib/auto-opti/run')
const controls = require('../lib/auto-opti/controls')
const { P } = require('./fixtures/auto-opti/profiles')

const reg = (name, b, a) => ({ kind: 'reg', via: 'ps', path: 'HKCU:\\System\\GameConfigStore', name, before: { exists: true, type: 'DWord', value: b }, after: { exists: true, type: 'DWord', value: a } })

function harness(over = {}) {
  const h = { events: [], invoked: [], settings: {}, changelog: [], patches: [], noted: [], psCalls: [] }
  const deps = {
    emit: e => h.events.push(e),
    newId: (() => { let n = 0; return () => 'id' + (++n) })(),
    hasTweak: () => true,
    tierOf: () => 1,
    createRestorePoint: async () => ({ ok: true }),
    isApplied: async () => false,
    metrics: async () => ({ procs: 100, startupEnabled: 8, ramUsedGB: 8, freeDiskGB: 100, displays: [{ device: '\\\\.\\DISPLAY1', monitor: 'X', hz: 60 }] }),
    runPS: async (script) => { h.psCalls.push(script); return { ok: true, out: 'JDRESULT=0' } },
    svc: {
      withContext: async (ctx, fn) => { h.ctx = ctx; return fn() },
      invokeTweak: async (id, action, send, meta) => { h.invoked.push(id); if (h.fail === id) throw new Error('boom'); meta.onEntry({ id: 'e-' + id, fidelity: 'exact', changes: [reg('GameDVR_Enabled', 1, 0)] }) },
      runRecorded: async (control, action, meta, fn) => fn(async (s) => { h.psCalls.push(s); return { out: '' } }, async () => ({}), c => h.noted.push(c)),
    },
    controls: controls.CONTROLS, journaledControls: controls.JOURNALED,
    loadSettings: () => h.settings, saveSettings: s => { h.settings = s },
    emitSettingsPatch: p => h.patches.push(p), appendChangelog: e => h.changelog.push(e),
    securityProbe: async () => P.healthy().security,
    confirmMs: 40, ...over,
  }
  h.deps = deps
  return h
}
const stepT = (tweakId, extra = {}) => ({ stepId: `f:${tweakId}`, findingId: 'f', module: 'gpu', type: 'tweak', tweakId, ...extra })
const planOf = (...steps) => ({ steps, modules: [], estSeconds: 0, rebootRequired: false, skipped: [], selected: [] })

test('a failed restore point applies nothing', async () => {
  const h = harness({ createRestorePoint: async () => ({ ok: false, reason: 'not_admin' }) })
  const r = await createRunner(h.deps).run({ plan: planOf(stepT('game-dvr')), profile: P.healthy() })
  assert.strictEqual(r.ok, false); assert.strictEqual(r.aborted, true); assert.strictEqual(r.reason, 'not_admin')
  assert.deepStrictEqual(h.invoked, [])
  assert.strictEqual(h.events.at(-1).phase, 'done')
})

test('an empty plan and a running game both refuse to start', async () => {
  const h = harness()
  assert.strictEqual((await createRunner(h.deps).run({ plan: planOf(), profile: {} })).reason, 'empty-plan')
  const h2 = harness({ isGameRunning: () => true })
  assert.strictEqual((await createRunner(h2.deps).run({ plan: planOf(stepT('game-dvr')), profile: {} })).reason, 'game-running')
})

test('happy path: events in order, real changes, tweak_ state, batch context, changelog, pending verify', async () => {
  const h = harness()
  const r = await createRunner(h.deps).run({ plan: planOf(stepT('game-dvr'), stepT('game-mode-on', { module: 'gpu' })), profile: P.healthy(), needsYou: ['ram-xmp-off'] })
  assert.strictEqual(r.ok, true)
  assert.deepStrictEqual(h.invoked, ['game-dvr', 'game-mode-on'])
  assert.deepStrictEqual(h.ctx, { via: 'auto-opti', batchId: 'id2' })
  const phases = h.events.map(e => e.phase)
  assert.deepStrictEqual(phases.filter(p => p !== 'counter' && p !== 'measure' && p !== 'restore-point'),
    ['module-start', 'step-start', 'step-done', 'step-start', 'step-done', 'module-done', 'shield-verified', 'done'])
  const done = h.events.find(e => e.phase === 'step-done')
  assert.strictEqual(done.status, 'ok')
  assert.deepStrictEqual([done.changes[0].labelKey, done.changes[0].before.v, done.changes[0].after.v], ['bgCapture', 'on', 'off'])
  assert.strictEqual(r.counters.settingsChanged, 2)
  assert.strictEqual(h.settings.tweak_game_dvr, undefined)
  assert.strictEqual(h.settings['tweak_game-dvr'], 'applied')
  assert.strictEqual(h.settings.aom_last_run.applied, 2)
  assert.strictEqual(h.settings.aom_pending_verify.batchId, r.batchId)
  assert.deepStrictEqual(h.settings.aom_pending_verify.needsYou, ['ram-xmp-off'])
  assert.strictEqual(h.settings.aom_pending_verify.checks.length, 2)
  assert.deepStrictEqual(h.changelog[0], { type: 'aom-run', batchId: r.batchId, tweakCount: 2, counters: r.counters, v: 2 })
  assert.strictEqual(h.patches.length, 1)
  assert.ok(h.events.every((e, i) => e.seq === i + 1))
})

test('already-applied tweaks are reported as already, not re-run', async () => {
  const h = harness({ isApplied: async id => id === 'game-dvr' })
  const r = await createRunner(h.deps).run({ plan: planOf(stepT('game-dvr'), stepT('game-mode-on')), profile: P.healthy() })
  assert.deepStrictEqual(h.invoked, ['game-mode-on'])
  assert.strictEqual(r.results[0].status, 'already')
})

test('a throwing tweak fails alone; the run continues and stays ok', async () => {
  const h = harness(); h.fail = 'game-dvr'
  const r = await createRunner(h.deps).run({ plan: planOf(stepT('game-dvr'), stepT('game-mode-on')), profile: P.healthy() })
  assert.deepStrictEqual(r.results.map(x => x.status), ['failed', 'ok'])
  assert.match(r.results[0].error, /boom/)
  assert.strictEqual(h.settings['tweak_game-dvr'], undefined)
})

test('partial results (a write the journal saw fail) are surfaced, not called ok', async () => {
  const h = harness()
  h.deps.svc.invokeTweak = async (id, a, send, meta) => { meta.onEntry({ id: 'e', fidelity: 'exact', changes: [] }); meta.onFailures([{ err: 'access denied' }]) }
  const r = await createRunner(h.deps).run({ plan: planOf(stepT('game-dvr')), profile: P.healthy() })
  assert.strictEqual(r.results[0].status, 'partial'); assert.match(r.results[0].error, /access denied/)
  assert.strictEqual(h.settings['tweak_game-dvr'], undefined)
})

test('anything outside the catalog is refused at run time, even if a plan names it', async () => {
  const h = harness()
  const r = await createRunner(h.deps).run({ plan: planOf(stepT('defender-quiet'), stepT('security-quiet'), stepT('priority-sep'), stepT('not-a-tweak'), { stepId: 'x', findingId: 'x', module: 'gpu', type: 'control', control: 'rm-rf' }, stepT('game-dvr')), profile: P.healthy() })
  assert.deepStrictEqual(h.invoked, ['game-dvr'])
  assert.deepStrictEqual(r.results.map(x => x.status), ['skipped', 'skipped', 'skipped', 'skipped', 'skipped', 'ok'])
})

test('tier 3 is refused even when allowlisted', async () => {
  const h = harness({ tierOf: () => 3 })
  const r = await createRunner(h.deps).run({ plan: planOf(stepT('game-dvr')), profile: P.healthy() })
  assert.strictEqual(r.results[0].status, 'skipped'); assert.deepStrictEqual(h.invoked, [])
})

test('stop finishes the current step and skips the rest', async () => {
  const h = harness()
  const runner = createRunner(h.deps)
  const orig = h.deps.svc.invokeTweak
  h.deps.svc.invokeTweak = async (...a) => { runner.stop(); return orig(...a) }
  const r = await runner.run({ plan: planOf(stepT('game-dvr'), stepT('game-mode-on'), stepT('hags')), profile: P.healthy() })
  assert.deepStrictEqual(r.results.map(x => x.status), ['ok', 'skipped', 'skipped'])
  assert.strictEqual(r.stopped, true)
})

test('only one run at a time', async () => {
  const h = harness()
  const runner = createRunner(h.deps)
  let release
  h.deps.createRestorePoint = () => new Promise(res => { release = () => res({ ok: true }) })
  const first = runner.run({ plan: planOf(stepT('game-dvr')), profile: P.healthy() })
  await new Promise(r => setTimeout(r, 5))
  assert.strictEqual((await runner.run({ plan: planOf(stepT('game-dvr')), profile: P.healthy() })).reason, 'already-running')
  release(); await first
  assert.strictEqual(runner.active, false)
})

test('security shield: a changed protection setting is reported loudly', async () => {
  const h = harness({ securityProbe: async () => ({ ...P.healthy().security, defenderRtp: false }) })
  const r = await createRunner(h.deps).run({ plan: planOf(stepT('game-dvr')), profile: P.healthy() })
  assert.strictEqual(r.shield.ok, false)
  assert.deepStrictEqual(r.shield.changed, [{ key: 'defenderRtp', before: true, after: false }])
  const ok = await createRunner(harness().deps).run({ plan: planOf(stepT('game-dvr')), profile: P.healthy() })
  assert.strictEqual(ok.shield.ok, true); assert.strictEqual(ok.shield.checked, true)
})

// ── display control ──
const dispStep = (hz = 144) => ({ stepId: 'display-refresh:display-refresh', findingId: 'display-refresh', module: 'display', type: 'control', control: 'display-refresh',
  params: { targets: [{ device: '\\\\.\\DISPLAY1', w: 2560, h: 1440, hz, from: 60 }] } })

test('refresh rate: Keep persists the mode and journals it; the result carries 60 -> 144', async () => {
  const h = harness()
  const runner = createRunner(h.deps)
  const p = runner.run({ plan: planOf(dispStep()), profile: P['60-on-144']() })
  await new Promise(r => setTimeout(r, 15))
  const ask = h.events.find(e => e.phase === 'confirm-request')
  assert.ok(ask && ask.deadline > Date.now() - 1000)
  runner.confirm('display-refresh:display-refresh', true)
  const r = await p
  assert.strictEqual(r.results[0].status, 'ok')
  assert.deepStrictEqual([r.results[0].changes[0].labelKey, r.results[0].changes[0].before.v, r.results[0].changes[0].after.v], ['refreshRate', '60', '144'])
  assert.deepStrictEqual(h.noted, [{ kind: 'display-mode', device: '\\\\.\\DISPLAY1', w: 2560, h: 1440, before: { exists: true, value: 60 }, after: { exists: true, value: 144 } }])
  assert.ok(h.psCalls.some(s => /, 1\)/.test(s)), 'persist phase ran')
})

test('refresh rate: no answer before the deadline reverts by itself and journals nothing', async () => {
  const h = harness({ confirmMs: 20 })
  const r = await createRunner(h.deps).run({ plan: planOf(dispStep()), profile: P['60-on-144']() })
  assert.strictEqual(r.results[0].status, 'reverted')
  assert.deepStrictEqual(h.noted, [])
  assert.deepStrictEqual(r.results[0].changes, [])
  assert.ok(h.psCalls.filter(s => /\[JD\]::Set/.test(s)).pop().includes(', 60, 0)'), 'last call put 60 Hz back (dynamic)')
})

test('refresh rate: a mode the scan never saw, or an unknown device, is refused before touching the display', async () => {
  const h = harness()
  const bad = dispStep(240)
  const r = await createRunner(h.deps).run({ plan: planOf(bad), profile: P['60-on-144']() })
  assert.strictEqual(r.results[0].detail.results[0].reason, 'mode-not-offered')
  assert.strictEqual(h.psCalls.filter(s => /\[JD\]::Set/.test(s)).length, 0)
  const unk = dispStep(); unk.params.targets[0].device = '\\\\.\\DISPLAY9'
  assert.strictEqual((await createRunner(harness().deps).run({ plan: planOf(unk), profile: P['60-on-144']() })).results[0].detail.results[0].reason, 'unknown-device')
})

test('refresh rate: a driver that rejects the test mode is left alone', async () => {
  const h = harness({ runPS: async (s) => ({ ok: true, out: /, 2\)/.test(s) ? 'JDRESULT=-2' : 'JDRESULT=0' }) })
  const r = await createRunner(h.deps).run({ plan: planOf(dispStep()), profile: P['60-on-144']() })
  assert.strictEqual(r.results[0].status, 'skipped')
})

// ── startup control ──
test('startup cleanup disables only scanned, classified-safe items via StartupApproved, and counts them', async () => {
  const h = harness()
  const profile = P.cluttered()
  const step = { stepId: 'startup-apps:startup-cleanup', findingId: 'startup-apps', module: 'startup', type: 'control', control: 'startup-cleanup', params: { items: ['Steam', 'SecurityHealth', 'RtkAudUService', "x'; calc; '", 'Discord'] } }
  const r = await createRunner(h.deps).run({ plan: planOf(step), profile })
  assert.deepStrictEqual(r.results[0].detail.removed, ['Steam', 'Discord'])
  assert.strictEqual(r.counters.startupRemoved, 2)
  const scripts = h.psCalls.filter(s => /StartupApproved/.test(s))
  assert.strictEqual(scripts.length, 2)
  assert.ok(scripts.every(s => /\[byte\[\]\]\(3,0,0,0/.test(s)))
  assert.ok(!scripts.some(s => /SecurityHealth|calc/.test(s)))
  assert.deepStrictEqual(r.results[0].changes.map(c => c.label), ['Steam', 'Discord'])
})

// ── junk control ──
test('junk cleaner skips shader caches, skips the update cache while a reboot is pending, and reports the bytes', async () => {
  const outs = ['FREED=1000', 'FREED=2000', 'FREED=3000']
  const scripts = []
  const mk = pending => harness({ runPS: async s => { scripts.push(s); return { ok: true, out: outs[scripts.length - 1] } } })
  const step = { stepId: 'junk:junk-clean', findingId: 'junk', module: 'cleanup', type: 'control', control: 'junk-clean' }
  const p1 = P.cluttered(); p1.storage.wuRebootPending = false
  const h1 = mk(); const r1 = await createRunner(h1.deps).run({ plan: planOf(step), profile: p1 })
  const junk = scripts.filter(s => /FREED/.test(s) && /Get-ChildItem/.test(s))
  assert.strictEqual(junk.length, 3)
  assert.ok(junk.every(s => /DxCache\|DXCache\|GLCache/.test(s) && /-notmatch/.test(s)))
  assert.ok(!junk.some(s => /Recycle|Downloads|History|Cookies/i.test(s)))
  assert.strictEqual(r1.counters.bytesReclaimed, 6000)
  assert.strictEqual(r1.results[0].changes[0].after.v, '6000')
  scripts.length = 0
  const p2 = P.cluttered(); p2.storage.wuRebootPending = true
  await createRunner(mk().deps).run({ plan: planOf(step), profile: p2 })
  assert.strictEqual(scripts.filter(s => /SoftwareDistribution/.test(s)).length, 0)
})

test('controlChanges has nothing to say about unknown or empty results', () => {
  assert.deepStrictEqual(controlChanges('display-refresh', null), [])
  assert.deepStrictEqual(controlChanges('junk-clean', { bytes: 0 }), [])
  assert.deepStrictEqual(controlChanges('nope', { status: 'ok' }), [])
})

test('reboot flag follows the steps that really ran', async () => {
  const h = harness({ isApplied: async () => true })
  const r = await createRunner(h.deps).run({ plan: planOf(stepT('gpu-hwsch', { reboot: true })), profile: P.healthy() })
  assert.strictEqual(r.rebootRequired, true)
  const h2 = harness(); h2.fail = 'gpu-hwsch'
  const r2 = await createRunner(h2.deps).run({ plan: planOf(stepT('gpu-hwsch', { reboot: true })), profile: P.healthy() })
  assert.strictEqual(r2.rebootRequired, false)
})

test('before/after rows are measured values only', async () => {
  let n = 0
  const h = harness({ metrics: async () => (++n === 1 ? { procs: 120, startupEnabled: 9, displays: [{ device: 'D', monitor: 'M', hz: 60 }], ramUsedGB: null } : { procs: 100, startupEnabled: 5, displays: [{ device: 'D', monitor: 'M', hz: 144 }], ramUsedGB: 7 }) })
  const r = await createRunner(h.deps).run({ plan: planOf(stepT('game-dvr')), profile: P.healthy() })
  const by = k => r.rows.find(x => x.key === k)
  assert.deepStrictEqual([by('refresh').before, by('refresh').after, by('refresh').better], [60, 144, 'better'])
  assert.deepStrictEqual([by('startupEnabled').before, by('startupEnabled').after], [9, 5])
  assert.strictEqual(by('ramUsedGB'), undefined)       // missing on one side: left out, not shown as 0
})
