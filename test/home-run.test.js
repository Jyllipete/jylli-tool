const test = require('node:test')
const assert = require('node:assert')
const Home = require('../lib/home')

const DAY = 86400000
const NOW = Date.UTC(2026, 10, 12, 12)

function make(over = {}) {
  let disk = null
  const deps = {
    now: () => NOW,
    state: { read: () => disk, write: v => { disk = JSON.parse(JSON.stringify(v)) } },
    settings: () => ({ tweak_a: 'applied', tweak_b: 'applied', tweak_c: 'restored', isPremium: false, aom_last_run: { ts: NOW - 2 * DAY, batchId: 'b1', counters: { startupRemoved: 3, tasksDisabled: 1, bytesReclaimed: 0 } } }),
    applicability: () => ({ a: { show: true, state: 'recommended' }, b: { show: true, state: 'recommended' }, c: { show: true, state: 'recommended' }, d: { show: true, state: 'recommended' }, e: { show: false, state: 'hidden' } }),
    restore: () => ({ newestAt: NOW - DAY, lastCreatedAt: null }),
    diagCached: () => ({ report: { score: 82, takenAt: NOW - DAY, tone: 'ok', grades: { cpu: 90 }, stats: { urgent: 0 }, findings: [{ id: 'f1', subsystem: 'cpu', severity: 'low', penalty: 3, vars: {} }] } }),
    isAdmin: () => true,
    cleanupHistory: () => [{ ts: NOW - 3 * DAY, freedBytes: 2e9, itemCount: 5 }],
    cleanupScans: () => [{ ts: NOW - DAY, sizes: { 'clean-temp': 3e9, 'clean-history': 9e9, 'clean-x': 0 } }],
    cleanupLane: id => ({ 'clean-temp': 'safe', 'clean-history': 'permanent' })[id] || null,
    debloatSummary: () => ({ count: 9, safe: 4, ram: 500, disk: null }),
    journal: () => [{ id: 1, batchId: 'b1', ts: NOW - DAY, via: 'auto-opti', result: 'ok', action: 'apply' },
      { id: 2, batchId: 'd1', ts: NOW - DAY, via: 'manual', result: 'ok', action: 'apply', control: 'debloat:app:A' },
      { id: 3, batchId: 'd1', ts: NOW - DAY, via: 'manual', result: 'ok', action: 'apply', control: 'debloat:app:B', undoneBy: 'u1' },
      { id: 4, batchId: 'd1', ts: NOW - DAY, via: 'manual', result: 'error', action: 'apply', control: 'debloat:app:C' }],
    game: () => null,
    driftCheck: async () => ({ checked: 2, reverted: ['b'] }),
    ...over,
  }
  return { svc: Home.create(deps), disk: () => disk }
}

test('snapshot: index, facts and ledger come from what the engines recorded', async () => {
  const { svc } = make()
  const s = await svc.snapshot()
  assert.strictEqual(s.ok, true)
  assert.strictEqual(s.index.pillars.health.pct, 82)
  assert.strictEqual(s.index.pillars.tuned.pct, 50)           // a and b applied, c and d still open
  assert.strictEqual(s.index.pillars.protected.pct, 100)
  assert.deepStrictEqual(s.facts.tuned, { applied: 2, open: 2, drifted: 0 })
  assert.strictEqual(s.facts.cleanup.reclaimableBytes, 3e9, 'only the safe lane counts')
  assert.strictEqual(s.facts.restore.level, 'fresh')
  assert.strictEqual(s.facts.autoOpti.lastAt, NOW - 2 * DAY)
  assert.strictEqual(s.proof.tiles.reclaimed.bytes, 2e9)
  assert.strictEqual(s.proof.tiles.removed.startup, 3)
  assert.strictEqual(s.proof.tiles.removed.apps, 1, 'only what Debloat really removed: not undone, not failed, not merely found')
  assert.strictEqual(s.proof.tiles.tweaks.checked, false)
  assert.strictEqual(s.facts.driftCheckedAt, null)
  assert.strictEqual(s.proof.week.batches, 2)
})

test('snapshot: a failing source is not measured, never a made-up value', async () => {
  const boom = () => { throw new Error('nope') }
  const { svc } = make({ diagCached: boom, restore: boom, applicability: boom, isAdmin: boom, debloatSummary: boom, journal: boom, cleanupHistory: boom, cleanupScans: boom })
  const s = await svc.snapshot()
  assert.strictEqual(s.index.score, null)
  assert.strictEqual(s.facts.diag, null)
  assert.strictEqual(s.facts.restore, null)
  assert.strictEqual(s.facts.tuned, null)
  assert.strictEqual(s.facts.cleanup.reclaimableBytes, null)
  assert.strictEqual(s.facts.profiled, false)
  assert.strictEqual(s.history.length, 0)
})

test('snapshot: the quick score is the fallback until a checkup exists', async () => {
  const { svc } = make({ diagCached: () => ({ report: null }) })
  svc.noteLegacy(64.4)
  const s = await svc.snapshot()
  assert.strictEqual(s.index.pillars.health.source, 'quick')
  assert.strictEqual(s.index.pillars.health.pct, 64)
  assert.strictEqual(svc.noteLegacy(NaN).ok, false)
})

test('snapshot: scans older than two weeks are ignored', async () => {
  const { svc } = make({ cleanupScans: () => [{ ts: NOW - 20 * DAY, sizes: { 'clean-temp': 9e9 } }] })
  assert.strictEqual((await svc.snapshot()).facts.cleanup.reclaimableBytes, null)
})

test('history: one reading a day is stored and cached() paints from the last snapshot', async () => {
  const { svc, disk } = make()
  assert.strictEqual(svc.cached().last, null)
  await svc.snapshot(); await svc.snapshot()
  assert.strictEqual(disk().history.length, 1)
  assert.strictEqual(svc.cached().last.index.score, disk().last.index.score)
})

test('drift: re-reads registry values, feeds Tuned and the Next Best Move input', async () => {
  const { svc } = make()
  const d = await svc.drift()
  assert.deepStrictEqual([d.ok, d.checked, d.ids], [true, 2, ['b']])
  const s = await svc.snapshot()
  assert.deepStrictEqual(s.facts.tuned, { applied: 2, open: 2, drifted: 1 })
  assert.deepStrictEqual(s.facts.drift, { count: 1, ids: ['b'], checkedAt: NOW })
  assert.strictEqual(s.proof.tiles.tweaks.holding, 1)
  assert.strictEqual(s.proof.tiles.tweaks.checked, true)
  assert.strictEqual(s.facts.driftCheckedAt, NOW)
  assert.strictEqual((await make({ driftCheck: async () => { throw new Error('x') } }).svc.drift()).ok, false)
})

test('drift: a drifted tweak that was applied again drops out, a stale check is ignored', async () => {
  let settings = { tweak_b: 'applied' }
  const { svc, disk } = make({ settings: () => settings })
  await svc.drift()
  settings = { tweak_b: 'restored' }
  assert.strictEqual((await svc.snapshot()).facts.drift, null)
  const st = disk(); st.drift.checkedAt = NOW - 10 * DAY
  const { svc: s2 } = make({ state: { read: () => st, write: () => {} }, settings: () => ({ tweak_b: 'applied' }) })
  assert.strictEqual((await s2.snapshot()).facts.drift, null)
})

test('verify: only a rebooted run with both boot readings is remembered, and it shows up as proof', async () => {
  const { svc } = make()
  assert.strictEqual(svc.noteVerify({ rebooted: false, boot: { beforeMs: 1, afterMs: 2 } }).ok, false)
  assert.strictEqual(svc.noteVerify({ rebooted: true, boot: { beforeMs: 40000 } }).ok, false)
  assert.strictEqual(svc.noteVerify({ rebooted: true, boot: { beforeMs: 40000, afterMs: 31000 }, runAt: 5 }).ok, true)
  const s = await svc.snapshot()
  assert.deepStrictEqual(s.proof.tiles.boot, { beforeMs: 40000, afterMs: 31000, deltaMs: -9000, faster: true })
})

test('a broken state file does not break the snapshot', async () => {
  const { svc } = make({ state: { read: () => { throw new Error('corrupt') }, write: () => { throw new Error('locked') } } })
  const s = await svc.snapshot()
  assert.strictEqual(s.ok, true)
  assert.strictEqual(s.index.pillars.health.pct, 82)
})
