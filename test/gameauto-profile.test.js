const test = require('node:test')
const assert = require('node:assert/strict')
const P = require('../lib/gameauto/profile')

const tiers = { a: 1, b: 2, c: 3, d: 1, e: 2 }
const ctx = (settings = {}, excluded = []) => ({
  settings,
  hasTweak: id => id in tiers,
  isPlanExcluded: id => excluded.includes(id),
  tierOf: id => tiers[id],
})
const prof = { tweaks: { tweak_a: 'applied', tweak_b: 'applied', tweak_c: 'applied', tweak_d: 'restored', tweak_gone: 'applied', tweak_e: 'applied' } }

test('only missing tweaks are applied; applied ones are not run again', () => {
  const p = P.plan(prof, ctx({ tweak_a: 'applied' }))
  assert.deepEqual(p.apply, ['b', 'e'])
  assert.deepEqual(p.already, ['a'])
})

test('tier 3 and user-excluded tweaks are refused, with the reason', () => {
  const p = P.plan(prof, ctx({}, ['e']))
  assert.deepEqual(p.refused, [{ id: 'c', reason: 'tier' }, { id: 'e', reason: 'excluded' }])
  assert.ok(!p.apply.includes('c') && !p.apply.includes('e'))
})

test('a tweak the app no longer has is reported, and a "restored" entry is ignored', () => {
  const p = P.plan(prof, ctx())
  assert.deepEqual(p.unknown, ['gone'])
  assert.ok(![...p.apply, ...p.already].includes('d'))
})

test('an empty or missing profile plans nothing', () => {
  for (const x of [null, {}, { tweaks: {} }]) assert.deepEqual(P.plan(x, ctx()), { apply: [], already: [], refused: [], unknown: [] })
})

test('events: one kept summary (never "pending"), one event per problem', () => {
  const p = P.plan(prof, ctx({ tweak_a: 'applied' }, ['e']))
  const ev = P.events('Ranked', p, [{ id: 'b', error: 'access denied' }])
  const kept = ev.find(e => e.kind === 'applied')
  assert.equal(kept.detail, 'kept-counts'); assert.equal(kept.key, undefined)
  assert.deepEqual(kept.vars, { name: 'Ranked', n: 0, already: 1 })
  assert.ok(ev.some(e => e.kind === 'failed' && e.vars.id === 'b' && /denied/.test(e.vars.error)))
  assert.ok(ev.some(e => e.detail === 'refused-tier' && e.vars.id === 'c'))
  assert.ok(ev.some(e => e.detail === 'refused-excluded' && e.vars.id === 'e'))
  assert.ok(ev.some(e => e.detail === 'unknown-tweak' && e.vars.id === 'gone'))
})

test('events: nothing applied and nothing already applied gives no "kept" line', () => {
  const ev = P.events('X', { apply: [], already: [], refused: [], unknown: [] })
  assert.deepEqual(ev, [])
})

const AE = require('../lib/gameauto/appsevents')

test('Apps Game time: what the ledger says at start and end', () => {
  assert.deepEqual(AE.startEvents({ ok: true, skipped: 'disabled' }), { events: [], lowered: 0 })
  assert.equal(AE.startEvents({ ok: false, error: 'no-sample' }).events[0].kind, 'failed')
  assert.equal(AE.startEvents({ ok: true, skipped: 'active' }).events[0].detail, 'still-ending')
  assert.equal(AE.startEvents({ ok: true, lowered: 0 }).events[0].detail, 'nothing-to-lower')
  const s = AE.startEvents({ ok: true, lowered: 4 })
  assert.equal(s.lowered, 4); assert.equal(s.events[0].key, 'gametime')
  assert.deepEqual(AE.endEvents({ ok: true, session: { restored: 4, left: 0 } }, 0), [])          // nothing was lowered: nothing to restore
  const e = AE.endEvents({ ok: true, session: { restored: 3, left: 1 } }, 4)[0]
  assert.equal(e.ok, false); assert.equal(e.detail, 'left')
  assert.equal(AE.endEvents({ ok: true, skipped: 'idle' }, 4)[0].ok, true)   // the sweep already ended it: still paired with the start event
})
