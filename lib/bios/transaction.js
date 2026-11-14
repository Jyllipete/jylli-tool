'use strict'
// Commit transaction: preflight -> snapshot -> write -> read back -> verify; anything that did not stick is reverted.
// A tool that exits 0 is not trusted: only the read-back counts.
//   engine: { id, read(): Promise<settings[]>, write(changes): Promise<{ ok, error? }> }
//   ctx:    { typed: boolean, onBattery: boolean, store: snapshots store, allowed(engineId): boolean, reason?: string, device?: { id, biosVersion } }
const policy = require('./policy')

const fail = (error, extra) => ({ ok: false, error, ...extra })

function shapeOk(s, value) {
  const v = String(value)
  if (s.kind === 'option') return s.options.some(o => o.value === v)
  if (s.kind === 'number') {
    if (!/^-?\d{1,12}$/.test(v)) return false
    const n = Number(v), r = s.range
    return !(r && ((r.min != null && n < Number(r.min)) || (r.max != null && n > Number(r.max))))
  }
  return false   // strings are never written
}

/** Validates changes against a fresh read. Returns { ok, items:[{setting,value,tier}], needsTyped } or a failure. */
function plan(settings, changes, engineId, allowed) {
  if (!Array.isArray(changes) || !changes.length) return fail('no_changes')
  if (changes.length > 200) return fail('too_many')
  if (!allowed(engineId)) return fail('engine_locked')
  const byId = new Map(settings.map(s => [s.id, s]))
  const seen = new Set(), items = []
  for (const c of changes) {
    const s = byId.get(String(c && c.id))
    if (!s) return fail('unknown_setting', { id: c && c.id })
    if (seen.has(s.id)) return fail('duplicate', { id: s.id })
    seen.add(s.id)
    const a = policy.assess(s, c.value)
    if (!a.ok) return fail('not_allowed', { id: s.id, why: a.why })
    if (!shapeOk(s, c.value)) return fail('invalid_value', { id: s.id })
    if (String(c.value) === String(s.current)) return fail('no_change', { id: s.id })
    items.push({ setting: s, value: String(c.value), tier: a.tier })
  }
  return { ok: true, items, needsTyped: items.some(i => i.tier === 'critical') }
}

async function run(engine, changes, ctx) {
  const before = await engine.read()
  const p = plan(before, changes, engine.id, ctx.allowed)
  if (!p.ok) return p
  if (p.needsTyped && !ctx.typed) return fail('typed_required')
  if (ctx.onBattery) return fail('on_battery')

  const changeList = p.items.map(i => ({ id: i.setting.id, name: i.setting.name, from: i.setting.current, to: i.value }))
  const snapshotId = ctx.store.save({ engine: engine.id, settings: before, reason: ctx.reason || 'commit', device: ctx.device, changes: changeList })
  const w = await engine.write(p.items.map(i => ({ id: i.setting.id, name: i.setting.name, value: i.value })))
  const after = await engine.read().catch(() => null)
  if (!after) return fail('verify_unreadable', { snapshotId, changes: changeList })

  const now = new Map(after.map(s => [s.id, s]))
  const mismatches = p.items.filter(i => !now.has(i.setting.id) || String(now.get(i.setting.id).current) !== i.value).map(i => i.setting.id)
  if (w.ok && !mismatches.length) {
    const order = ['normal', 'moderate', 'critical']
    const maxTier = p.items.reduce((m, i) => (order.indexOf(i.tier) > order.indexOf(m) ? i.tier : m), 'normal')
    return { ok: true, snapshotId, changes: changeList, applied: p.items.length, restartNeeded: true, maxTier, restore: p.items.map(i => ({ name: i.setting.name, value: String(i.setting.current) })) }
  }

  // something did not stick (or the write errored part-way): put back whatever did change, then READ BACK to see what really happened.
  // A revert is only counted when the read-back shows the old value; a tool that exits 0 is not trusted here either.
  const toRevert = p.items.filter(i => now.has(i.setting.id) && String(now.get(i.setting.id).current) !== String(i.setting.current))
    .map(i => ({ id: i.setting.id, name: i.setting.name, value: String(i.setting.current) }))
  let reverted = 0, stillChanged = [], revertUnreadable = false
  if (toRevert.length) {
    await engine.write(toRevert).catch(() => ({ ok: false }))
    const again = await engine.read().catch(() => null)
    if (!again) { revertUnreadable = true; stillChanged = toRevert.map(c => c.id) }
    else {
      const now2 = new Map(again.map(s => [s.id, s]))
      for (const c of toRevert) { if (now2.has(c.id) && String(now2.get(c.id).current) === c.value) reverted++; else stillChanged.push(c.id) }
    }
  }
  const extra = { snapshotId, changes: changeList, mismatches, reverted, needRevert: toRevert.length, stillChanged }
  // partial = at least one setting is still not at its original value: the user must be told which, with the old values to set by hand
  if (stillChanged.length) {
    const manual = p.items.filter(i => stillChanged.includes(i.setting.id)).map(i => ({ id: i.setting.id, name: i.setting.name, value: String(i.setting.current) }))
    return fail('revert_incomplete', { ...extra, partial: true, revertUnreadable, manual })
  }
  return fail(w.ok ? 'verify_failed' : (w.error || 'write_failed'), extra)
}

module.exports = { run, plan, shapeOk }
