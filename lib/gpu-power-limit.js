'use strict'
// NVIDIA power limit: the one GPU write the app offers. Everything is validated here, in main:
//   - desktop NVIDIA GPU with numeric min < default <= max limits (laptops and AMD/Intel: "not available")
//   - integer watts inside [min, max], addressed by UUID; above the default needs an explicit confirmation
//   - after the write the limit is read back; a difference over 1 W means it failed and the old value is put back
//   - journaled as { kind: 'gpu-power-limit', before, after }; Undo writes the exact before-value
//   - policy "session" (default): restored when the app quits; a sentinel file restores it after a crash
//   - thermal guard: while above the default, a hot GPU for 5 s puts the default back
// nvidia-smi is run without a shell (System32\nvidia-smi.exe). I/O is injected, so the logic is unit-tested.
const smi = require('./nvidia-smi')

const GUARD_CORE_C = 87
const GUARD_HOLD_MS = 5000

function createPowerLimit({ run, query, isLaptop, isAdmin, readSentinel, writeSentinel, clearSentinel, record, now = Date.now, emit = () => {}, policy = () => 'session' }) {
  let hotSince = null

  async function probe() {
    const gpus = await query()
    const gpu = gpus.find(g => g.uuid) || null
    const lap = await isLaptop()
    const support = smi.powerLimitSupport(gpu, { isLaptop: lap })
    return { gpu, support }
  }

  async function get() {
    const { gpu, support } = await probe()
    const admin = await isAdmin()
    return { ...support, uuid: gpu ? gpu.uuid : null, name: gpu ? gpu.name : null, needsAdmin: support.supported && !admin, policy: policy(), active: !!(await readSentinel()) }
  }

  async function write(uuid, watts) {
    const r = await run(['-i', uuid, '-pl', String(watts)])
    return r
  }

  async function current(uuid) {
    const g = (await query()).find(x => x.uuid === uuid)
    return g ? Math.round(g.powerLimit) : null
  }

  /** req: { watts, confirmAboveDefault, via }. Returns { ok, reason?, before?, after? }. */
  async function set(req) {
    const { gpu, support } = await probe()
    const v = smi.validatePowerLimit(req, support)
    if (!v.ok) return { ok: false, reason: v.reason }
    if (!(await isAdmin())) return { ok: false, reason: 'needs-admin' }
    const before = support.current
    const w = await write(gpu.uuid, v.watts)
    if (!w.ok) return { ok: false, reason: 'write-failed', detail: String(w.err || w.out || '').slice(0, 200) }
    const after = await current(gpu.uuid)
    if (after == null || Math.abs(after - v.watts) > 1) {
      await write(gpu.uuid, before)                 // verify failed: put the old value back
      return { ok: false, reason: 'verify-failed', before, after }
    }
    const sentinel = (await readSentinel()) || { uuid: gpu.uuid, original: before, since: now() }
    await writeSentinel(sentinel)
    const entry = record({
      control: 'gpu-power-limit', action: 'apply', via: req.via || 'manual',
      changes: [{ kind: 'gpu-power-limit', uuid: gpu.uuid, before: { exists: true, value: before, watts: before }, after: { exists: true, value: after, watts: after } }],
    })
    emit('power-limit', { watts: after, default: support.default })
    return { ok: true, before, after, journalId: entry ? entry.id : null }
  }

  /** Back to what it was before the app first changed it (or the driver default if unknown). */
  async function reset(via = 'manual') {
    const s = await readSentinel()
    const { gpu, support } = await probe()
    if (!gpu || !support.supported) { await clearSentinel(); return { ok: false, reason: 'unsupported' } }
    const target = s && s.original != null ? s.original : support.default
    const before = support.current
    if (before === target) { await clearSentinel(); return { ok: true, unchanged: true } }
    if (!(await isAdmin())) return { ok: false, reason: 'needs-admin' }
    const w = await write(gpu.uuid, target)
    const after = await current(gpu.uuid)
    if (!w.ok || after == null || Math.abs(after - target) > 1) return { ok: false, reason: 'write-failed' }
    await clearSentinel()
    record({ control: 'gpu-power-limit', action: 'restore', via, changes: [{ kind: 'gpu-power-limit', uuid: gpu.uuid, before: { exists: true, value: before, watts: before }, after: { exists: true, value: after, watts: after } }] })
    emit('power-limit', { watts: after, default: support.default })
    return { ok: true, after }
  }

  /** Called on quit: policy "session" puts the original limit back. */
  async function onQuit() { if (policy() === 'session' && (await readSentinel())) return reset('safety-revert'); return { ok: true, skipped: true } }

  /** Called at startup: a leftover sentinel means the last run ended without restoring (crash, power loss). */
  async function recover() {
    if (!(await readSentinel())) return { recovered: false }
    if (policy() === 'persist') return { recovered: false, kept: true }
    const r = await reset('safety-revert')
    if (r.ok) emit('power-limit-recovered', {})
    return { recovered: !!r.ok }
  }

  /** Feed the latest GPU core temperature. Returns true when the guard reverted the limit. */
  async function guard(tempC, currentWatts, defaultWatts) {
    if (!(currentWatts > defaultWatts)) { hotSince = null; return false }
    if (tempC != null && tempC >= GUARD_CORE_C) {
      if (hotSince == null) hotSince = now()
      if (now() - hotSince >= GUARD_HOLD_MS) {
        hotSince = null
        const r = await reset('safety-revert')
        if (r.ok) { emit('power-limit-guard', { tempC }); return true }
      }
    } else hotSince = null
    return false
  }

  /** Journal undo handler for entries of kind gpu-power-limit. */
  const undoHandler = {
    async read(change) { const w = await current(change.uuid); return w == null ? { unknown: true } : { exists: true, value: w } },
    async restore(change) {
      if (!(await isAdmin())) return false
      const w = await write(change.uuid, change.before.watts)
      const after = await current(change.uuid)
      return !!w.ok && after != null && Math.abs(after - change.before.watts) <= 1
    },
  }

  return { get, set, reset, onQuit, recover, guard, undoHandler }
}

module.exports = { createPowerLimit, GUARD_CORE_C, GUARD_HOLD_MS }
