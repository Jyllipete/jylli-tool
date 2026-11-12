const test = require('node:test')
const assert = require('node:assert')
const M = require('../lib/home/model')
const V = require('../lib/home/moves')
const P = require('../lib/home/proof')
const R = require('../lib/home/rewind')

const DAY = 86400000
const NOW = Date.UTC(2026, 10, 12, 12)

// ── index ───────────────────────────────────────────────────────────────────────────
test('index: nothing measured is null, never 0', () => {
  const i = M.buildIndex({ now: NOW })
  assert.strictEqual(i.score, null)
  assert.strictEqual(i.tone, 'idle')
  assert.strictEqual(i.verdictKey, 'verdictNone')
  assert.deepStrictEqual(i.missing.sort(), ['health', 'protected', 'tuned'])
})

test('index: an unmeasured pillar is left out, not averaged in', () => {
  const only = M.buildIndex({ now: NOW, diag: { score: 90, takenAt: NOW } })
  assert.strictEqual(only.score, 90)
  assert.deepStrictEqual(only.used, ['health'])
  const full = M.buildIndex({ now: NOW, diag: { score: 90, takenAt: NOW }, tuned: { applied: 10, open: 0, drifted: 0 }, protect: { restore: { level: 'fresh' }, isAdmin: true } })
  assert.strictEqual(full.score, 95)
  assert.strictEqual(full.tone, 'ok')
})

test('index: vitals wins over the quick score; the quick score is the fallback', () => {
  assert.strictEqual(M.buildIndex({ now: NOW, diag: { score: 40, takenAt: NOW }, legacy: { score: 95 } }).pillars.health.source, 'vitals')
  const q = M.buildIndex({ now: NOW, legacy: { score: 70 } })
  assert.strictEqual(q.pillars.health.source, 'quick')
  assert.strictEqual(q.score, 70)
})

test('index: an old checkup is flagged stale but still counts', () => {
  const i = M.buildIndex({ now: NOW, diag: { score: 80, takenAt: NOW - 45 * DAY } })
  assert.strictEqual(i.pillars.health.stale, true)
  assert.strictEqual(i.score, 80)
})

test('tuned: drifted tweaks count against, nothing applicable is not measured', () => {
  assert.strictEqual(M.buildIndex({ now: NOW, tuned: { applied: 6, open: 4, drifted: 2 } }).pillars.tuned.pct, 40)
  assert.strictEqual(M.buildIndex({ now: NOW, tuned: { applied: 0, open: 0, drifted: 0 } }).pillars.tuned.value, null)
  assert.strictEqual(M.buildIndex({ now: NOW, tuned: { applied: 3, open: 0, drifted: 9 } }).pillars.tuned.pct, 0)
})

test('protected: restore level and admin are blended 70/30, unknown admin is left out', () => {
  assert.strictEqual(M.buildIndex({ now: NOW, protect: { restore: { level: 'stale' }, isAdmin: false } }).pillars.protected.pct, 35)
  assert.strictEqual(M.buildIndex({ now: NOW, protect: { restore: { level: 'never' }, isAdmin: null } }).pillars.protected.pct, 0)
  assert.strictEqual(M.buildIndex({ now: NOW, protect: { restore: {}, isAdmin: null } }).pillars.protected.value, null)
})

test('verdict follows the weakest measured pillar', () => {
  const i = M.buildIndex({ now: NOW, diag: { score: 95, takenAt: NOW }, protect: { restore: { level: 'never' }, isAdmin: true } })
  assert.strictEqual(i.weakest, 'protected')
  assert.strictEqual(i.verdictKey, 'verdictWeak_protected')
  assert.strictEqual(M.buildIndex({ now: NOW, diag: { score: 92, takenAt: NOW } }).verdictKey, 'verdictStrong')
  assert.strictEqual(M.buildIndex({ now: NOW, diag: { score: 62, takenAt: NOW } }).verdictKey, 'verdictFair')
})

test('history keeps one entry a day, sorted, capped', () => {
  let h = []
  h = M.pushHistory(h, { ts: NOW, score: 50 })
  h = M.pushHistory(h, { ts: NOW + 3600e3, score: 55 })
  assert.strictEqual(h.length, 1)
  assert.strictEqual(h[0].score, 55)
  for (let d = 1; d <= 70; d++) h = M.pushHistory(h, { ts: NOW - d * DAY, score: 60 })
  assert.strictEqual(h.length, M.MAX_HISTORY)
  assert.ok(h.every((e, i) => i === 0 || e.ts > h[i - 1].ts))
  assert.deepStrictEqual(M.pushHistory([{ ts: 1, score: 1 }], { ts: NaN, score: 5 }), [{ ts: 1, score: 1 }])
})

test('trend compares with about a week ago', () => {
  assert.strictEqual(M.trend([{ ts: NOW, score: 70 }], NOW), null)
  const h = [{ ts: NOW - 9 * DAY, score: 50 }, { ts: NOW - 7 * DAY, score: 60 }, { ts: NOW - 2 * DAY, score: 65 }, { ts: NOW, score: 72 }]
  assert.deepStrictEqual(M.trend(h, NOW), { delta: 12, days: 7 })
  assert.strictEqual(M.trend([{ ts: NOW - 3600e3, score: 1 }, { ts: NOW, score: 5 }], NOW), null)
})

// ── moves ───────────────────────────────────────────────────────────────────────────
const conc = [
  { id: 'restore', tab: 'restore', score: 100, blocking: true, impact: 'high', action: { type: 'tab', page: 'restore-points', tab: 'restore' }, titleKey: 'restoreTitle', whyKey: 'restoreWhy' },
  { id: 'essentials', tab: 'windows', score: 60, impact: 'high', action: { type: 'batch', ids: ['a'] }, titleKey: 'essentialsTitle', whyKey: 'essentialsWhy' },
  { id: 'cleanup', tab: 'cleanup', score: 30, impact: 'low', action: { type: 'tab', page: 'privacy-cleanup', tab: 'cleanup' }, titleKey: 'cleanupTitle', whyKey: 'cleanupWhy' },
]
const calm = () => ({ now: NOW, restore: { level: 'fresh' }, diag: { findings: [], takenAt: NOW }, autoOpti: { lastAt: NOW - DAY }, isAdmin: true })

test('moves: a PC with no restore point is told to protect it first', () => {
  const r = V.rank({ ...calm(), restore: { level: 'never' }, concierge: conc })
  assert.strictEqual(r.primary.id, 'protect')
  assert.strictEqual(r.primary.action.type, 'restore')
  assert.ok(!r.all.some(m => m.id === 'restore'), 'the concierge restore move is covered')
})

test('moves: critical findings outrank everything but a missing restore point', () => {
  const diag = { findings: [{ id: 'disk-failing', severity: 'critical' }, { id: 'x', severity: 'low' }], takenAt: NOW }
  assert.strictEqual(V.rank({ ...calm(), diag }).primary.id, 'vitals')
  assert.strictEqual(V.rank({ ...calm(), diag, restore: { level: 'never' } }).primary.id, 'protect')
  assert.strictEqual(V.rank({ ...calm(), diag }).primary.vars.n, 1)
})

test('moves: Auto-Optimize first run, then again after 30 days, never in between', () => {
  assert.strictEqual(V.rank({ ...calm(), autoOpti: { lastAt: null } }).primary.id, 'autoOptiFirst')
  assert.ok(V.rank({ ...calm(), autoOpti: { lastAt: NOW - 40 * DAY } }).all.some(m => m.id === 'autoOptiAgain'))
  assert.ok(!V.rank(calm()).all.some(m => m.id.startsWith('autoOpti')))
})

test('moves: a calm PC is all clear; dismissed and done moves stay away', () => {
  assert.strictEqual(V.rank(calm()).allClear, true)
  assert.strictEqual(V.rank(calm()).primary, null)
  const r = V.rank({ ...calm(), concierge: conc, dismissed: ['essentials', 'restore'], done: ['cleanup'] })
  assert.deepStrictEqual(r.all.map(m => m.id), [])
})

test('moves: ranking is deterministic and at most one move per tab', () => {
  const input = { ...calm(), cleanup: { reclaimableBytes: 6 * 1073741824 }, debloat: { safe: 5 }, concierge: conc }
  const a = V.rank(input), b = V.rank(JSON.parse(JSON.stringify(input)))
  assert.deepStrictEqual(a.all.map(m => m.id), b.all.map(m => m.id))
  const tabs = a.all.map(m => m.tab)
  assert.strictEqual(new Set(tabs).size, tabs.length)
  assert.ok(a.all.some(m => m.id === 'reclaim') && !a.all.some(m => m.id === 'cleanup'))
  assert.strictEqual(a.next.length, Math.min(V.MAX_NEXT, a.all.length - 1))
})

test('moves: small reclaimable space and few bloat items are not worth a card; drift and admin are', () => {
  const r = V.rank({ ...calm(), cleanup: { reclaimableBytes: 100 * 1048576 }, debloat: { safe: 2 } })
  assert.strictEqual(r.allClear, true)
  const r2 = V.rank({ ...calm(), isAdmin: false, drift: { count: 2, ids: ['a', 'b'] } })
  assert.deepStrictEqual(r2.all.map(m => m.id), ['drift', 'admin'])
  assert.deepStrictEqual(r2.primary.action.ids, ['a', 'b'])
})

test('moves: AI suggestions are extra candidates and never replace a Home move', () => {
  const r = V.rank({ ...calm(), restore: { level: 'stale' }, ai: [{ id: 'r1', title: 'Disable X', why: 'because' }, { id: 'r2', title: 'Disable Y' }] })
  assert.strictEqual(r.primary.id, 'protectStale')
  assert.strictEqual(r.all.filter(m => m.kind === 'ai').length, 2)
})

// ── proof ───────────────────────────────────────────────────────────────────────────
test('proof: no evidence means no tiles, and not "zero"', () => {
  const l = P.ledger({ now: NOW })
  assert.strictEqual(l.hasProof, false)
  assert.deepStrictEqual(Object.values(l.tiles).filter(Boolean), [])
  assert.strictEqual(l.week.batches, 0)
})

test('proof: boot change needs both readings', () => {
  assert.strictEqual(P.bootTile({ boot: { beforeMs: 40000 } }), null)
  assert.deepStrictEqual(P.bootTile({ boot: { beforeMs: 40000, afterMs: 31000 } }), { beforeMs: 40000, afterMs: 31000, deltaMs: -9000, faster: true })
  assert.strictEqual(P.bootTile({ boot: { beforeMs: 30000, afterMs: 36000, deltaMs: 6000 } }).faster, false)
})

test('proof: reclaimed bytes come from the cleanup history, else the last run', () => {
  const c = { history: [{ ts: 1, freedBytes: 100 }, { ts: 5, freedBytes: 300 }] }
  assert.deepStrictEqual(P.reclaimedTile(c, null), { bytes: 400, runs: 2, lastTs: 5, lastBytes: 300 })
  assert.strictEqual(P.reclaimedTile({ history: [] }, { counters: { bytesReclaimed: 900 } }).bytes, 900)
  assert.strictEqual(P.reclaimedTile({ history: [] }, null), null)
})

test('proof: removed and tweaks tiles', () => {
  assert.deepStrictEqual(P.removedTile({ counters: { startupRemoved: 3, tasksDisabled: 2 } }, { removed: 7 }), { startup: 3, tasks: 2, apps: 7 })
  assert.strictEqual(P.removedTile(null, { count: 53 }), null, 'what Debloat merely found is not something that was removed')
  assert.strictEqual(P.removedTile({ counters: {} }, null), null)
  assert.deepStrictEqual(P.tweaksTile({ inPlace: 12, drifted: 2, checked: true }), { inPlace: 12, drifted: 2, holding: 10, checked: true })
  assert.strictEqual(P.tweaksTile({ inPlace: 12, drifted: 0 }).checked, false)
  assert.strictEqual(P.tweaksTile({ inPlace: 0, drifted: 0 }), null)
})

test('proof: the week counts batches, not single changes, and ignores undo entries and old ones', () => {
  const e = [
    { id: 1, batchId: 'b1', ts: NOW - DAY, via: 'auto-opti', result: 'ok', action: 'apply' },
    { id: 2, batchId: 'b1', ts: NOW - DAY, via: 'auto-opti', result: 'ok', action: 'apply', undoneBy: 'u1' },
    { id: 3, batchId: null, ts: NOW - 2 * DAY, via: 'manual', result: 'error', action: 'apply' },
    { id: 4, batchId: 'u1', ts: NOW - DAY / 2, via: 'undo', result: 'ok', action: 'restore' },
    { id: 5, batchId: 'old', ts: NOW - 9 * DAY, via: 'manual', result: 'ok', action: 'apply' },
  ]
  const w = P.weekSummary(e, NOW)
  assert.deepStrictEqual({ b: w.batches, c: w.changes, u: w.undone, f: w.failed }, { b: 2, c: 3, u: 1, f: 1 })
  assert.strictEqual(w.byVia['auto-opti'], 2)
  assert.strictEqual(P.ledger({ now: NOW, journal: e }).hasProof, true)
})

// ── rewind ──────────────────────────────────────────────────────────────────────────
test('rewind: samples are averaged into buckets and gaps stay null', () => {
  const s = R.strip({ now: NOW, hours: 168, samples: [{ ts: NOW - 60e3, cpu: 10, ram: 40 }, { ts: NOW - 90e3, cpu: 30, ram: 60 }, { ts: NOW - 100 * DAY, cpu: 99, ram: 99 }] })
  assert.strictEqual(s.buckets.length, R.BUCKETS)
  const last = s.buckets[R.BUCKETS - 1]
  assert.deepStrictEqual([last.cpu, last.ram], [20, 50])
  assert.strictEqual(s.buckets[0].cpu, null)
  assert.strictEqual(s.buckets.filter(b => b.cpu != null).length, 1)
})

test('rewind: one mark per batch, flagged when undone, undo entries are not marks', () => {
  const e = [
    { id: 3, batchId: 'u1', ts: NOW - 3600e3, via: 'undo' },
    { id: 2, batchId: 'b1', ts: NOW - 2 * DAY, via: 'auto-opti', undoneBy: 'u1' },
    { id: 1, batchId: 'b1', ts: NOW - 2 * DAY, via: 'auto-opti' },
    { id: 0, batchId: 'b0', ts: NOW - 20 * DAY, via: 'manual' },
  ]
  const s = R.strip({ now: NOW, entries: e })
  assert.strictEqual(s.marks.length, 1)
  assert.strictEqual(s.marks[0].n, 2)
  assert.strictEqual(s.marks[0].undone, true)
  assert.ok(s.marks[0].x > 0.7 && s.marks[0].x < 0.8)
})

test('rewind: the playhead finds the bucket and the marks near it', () => {
  const s = R.strip({ now: NOW, entries: [{ id: 1, batchId: 'b1', ts: NOW - 84 * 3600e3, via: 'manual' }], samples: [{ ts: NOW - 84 * 3600e3, cpu: 12, ram: 33 }] })
  const hit = R.at(s, 0.5)
  assert.strictEqual(hit.marks.length, 1)
  assert.strictEqual(hit.bucket.cpu, 12)
  assert.strictEqual(R.at(s, 0.9).marks.length, 0)
  assert.strictEqual(R.at(s, 5).ts, s.to)
  assert.strictEqual(R.at(null, 0.5), null)
})

test('index: tuning and protection alone never make an Index; the bands still show', () => {
  const i = M.buildIndex({ now: NOW, tuned: { applied: 9, open: 1, drifted: 0 }, protect: { restore: { level: 'fresh' }, isAdmin: true } })
  assert.strictEqual(i.score, null)
  assert.strictEqual(i.tone, 'idle')
  assert.strictEqual(i.verdictKey, 'verdictNone')
  assert.strictEqual(i.pillars.tuned.pct, 90)
  assert.strictEqual(i.pillars.protected.pct, 100)
})
