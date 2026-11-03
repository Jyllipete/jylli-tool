'use strict'
// The Auto-Optimize run: restore point, then the planned steps one at a time under one journal batch, with a live event stream
// (what changed, from what to what) and counters. Everything with side effects is injected, so the whole run is testable with fakes.
const { NEVER_AUTO, allowedTweaks, allowedControls } = require('./catalog')
const { describeEntry } = require('./describe')
const metricsLib = require('./metrics')

const TASK_TIMEOUT_MS = 90000

const onoff = v => ({ v, fmt: 'onoff' })
const raw = v => ({ v: v == null ? null : String(v), fmt: 'raw' })

/** What a control did, in the same shape describeEntry gives for tweaks. */
function controlChanges(id, result) {
  if (!result) return []
  if (id === 'display-refresh') return (result.results || []).filter(r => r.status === 'ok').map(r => ({ labelKey: 'refreshRate', label: r.device, before: raw(r.from), after: raw(r.to), unit: 'Hz' }))
  if (id === 'startup-cleanup') return (result.removed || []).map(n => ({ labelKey: 'startupItem', label: n, before: onoff('on'), after: onoff('off'), unit: '' }))
  if (id === 'junk-clean') return result.bytes > 0 ? [{ labelKey: 'junk', label: '', before: raw(null), after: raw(result.bytes), unit: 'bytes' }] : []
  return []
}

function createRunner(deps) {
  const now = deps.now || Date.now
  const emitRaw = deps.emit || (() => {})
  const okTweaks = allowedTweaks(), okControls = allowedControls()
  let active = null          // { runId, stopRequested, pending: Map(stepId -> resolve) }

  const seq = { n: 0 }
  const emit = (ev) => emitRaw({ runId: active && active.runId, seq: ++seq.n, ...ev })

  function stop() { if (active) active.stopRequested = true; return { ok: !!active } }
  function confirm(stepId, keep) {
    const r = active && active.pending.get(stepId)
    if (!r) return { ok: false }
    r(keep ? 'keep' : 'revert')
    return { ok: true }
  }

  function askConfirm(stepId, info) {
    const ms = deps.confirmMs || 15000
    const deadline = now() + ms
    return new Promise(resolve => {
      const done = v => { clearTimeout(t); active && active.pending.delete(stepId); resolve(v) }
      const t = setTimeout(() => done('revert'), ms)
      active.pending.set(stepId, done)
      emit({ phase: 'confirm-request', stepId, deadline, ...info })
    })
  }

  function guard(step) {
    if (step.type === 'tweak') return okTweaks.has(step.tweakId) && !NEVER_AUTO.has(step.tweakId) && deps.hasTweak(step.tweakId) && (deps.tierOf ? deps.tierOf(step.tweakId) < 3 : true)
    if (step.type === 'control') return okControls.has(step.control) && !!(deps.controls || {})[step.control]
    return false
  }

  async function withTimeout(p, ms) {
    let t
    try { return await Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('timeout')), ms) })]) } finally { clearTimeout(t) }
  }

  /**
   * req: { plan, profile, premium, needsYou: [findingId] }.
   * Resolves to { ok, runId, batchId, results, counters, rows, shield, rebootRequired, ... } or { ok:false, aborted:true, reason }.
   */
  async function run(req) {
    if (active) return { ok: false, aborted: true, reason: 'already-running' }
    const runId = deps.newId ? deps.newId() : Math.random().toString(16).slice(2, 14)
    active = { runId, stopRequested: false, pending: new Map() }
    seq.n = 0
    try { return await runInner(req || {}, runId) } finally { active = null }
  }

  async function runInner({ plan, profile, needsYou = [] }, runId) {
    const steps = (plan && plan.steps) || []
    if (!steps.length) return { ok: false, aborted: true, reason: 'empty-plan' }
    if (deps.isGameRunning && deps.isGameRunning()) return { ok: false, aborted: true, reason: 'game-running' }

    emit({ phase: 'measure', state: 'start' })
    const metricsBefore = await metricsSafe({ sampleCpu: true })
    emit({ phase: 'measure', state: 'done' })

    emit({ phase: 'restore-point', state: 'start' })
    const rp = await deps.createRestorePoint()
    if (!rp || !rp.ok) {
      emit({ phase: 'done', ok: false, aborted: true, reason: (rp && rp.reason) || 'restore-point-failed' })
      return { ok: false, aborted: true, reason: (rp && rp.reason) || 'restore-point-failed', guidance: rp && rp.guidance, runId }
    }
    emit({ phase: 'restore-point', state: 'done' })

    const batchId = deps.newId ? deps.newId() : Math.random().toString(16).slice(2, 14)
    const results = []
    const counters = { settingsChanged: 0, startupRemoved: 0, tasksDisabled: 0, bytesReclaimed: 0 }
    const settingsPatch = {}
    const count = (name, n) => { counters[name] = (counters[name] || 0) + n; emit({ phase: 'counter', counters: { ...counters } }) }
    let stopped = false

    await deps.svc.withContext({ via: 'auto-opti', batchId }, async () => {
      let curModule = null
      for (const step of steps) {
        if (active.stopRequested) { stopped = true; results.push({ stepId: step.stepId, findingId: step.findingId, status: 'skipped', reason: 'stopped', changes: [] }); continue }
        if (step.module !== curModule) {
          if (curModule) emit({ phase: 'module-done', module: curModule })
          curModule = step.module
          emit({ phase: 'module-start', module: curModule })
        }
        emit({ phase: 'step-start', stepId: step.stepId, module: step.module, findingId: step.findingId })
        const r = await runStep(step, { profile, batchId, count, counters, settingsPatch })
        results.push(r)
        emit({ phase: 'step-done', stepId: step.stepId, module: step.module, findingId: step.findingId, status: r.status, changes: r.changes, error: r.error, counters: { ...counters } })
      }
      if (curModule) emit({ phase: 'module-done', module: curModule })
    })

    // Security shield: re-read what the scan saw. A difference means something outside this run changed it; it is reported, never fixed.
    const shield = await verifyShield(profile)
    emit({ phase: 'shield-verified', ...shield })

    const metricsAfter = await metricsSafe({})
    const rows = metricsLib.diff(metricsBefore, metricsAfter)
    const okSteps = results.filter(r => r.status === 'ok')
    const rebootRequired = steps.some(s => s.reboot && results.find(r => r.stepId === s.stepId && (r.status === 'ok' || r.status === 'already')))

    let bootBaselineMs = null
    try { if (deps.bootBaseline) bootBaselineMs = await deps.bootBaseline() } catch {}
    persist({ bootBaselineMs, batchId, runAt: now(), settingsPatch, counters, results, steps, metricsBefore, needsYou, rebootRequired })

    const out = { ok: okSteps.length > 0 || !results.some(r => r.status === 'failed'), runId, batchId, results, counters, rows, shield, metricsBefore, metricsAfter, needsYou, rebootRequired, stopped }
    emit({ phase: 'done', ok: out.ok, rebootRequired, counters: { ...counters }, rows, shield, stopped })
    return out
  }

  async function metricsSafe(opts) { try { return await deps.metrics(opts) } catch { return null } }

  async function runStep(step, { profile, batchId, count, counters, settingsPatch }) {
    const base = { stepId: step.stepId, findingId: step.findingId, module: step.module }
    if (!guard(step)) return { ...base, status: 'skipped', reason: 'not-allowed', changes: [] }
    const send = (msg, level = 'info') => deps.log && deps.log(msg, level, step.tweakId || step.control)
    try {
      if (step.type === 'tweak') {
        if (deps.isApplied && await deps.isApplied(step.tweakId)) return { ...base, status: 'already', changes: [] }
        let entry = null, failed = null
        await withTimeout(deps.svc.invokeTweak(step.tweakId, 'apply', send, { onEntry: e => { entry = e }, onFailures: f => { failed = f } }), TASK_TIMEOUT_MS)
        const changes = entry ? describeEntry(entry) : []
        counters.settingsChanged += changes.length
        counters.tasksDisabled += changes.filter(c => c.labelKey === 'task' && c.after.v === 'off').length
        if (failed) return { ...base, status: 'partial', changes, error: failed.map(f => f.err).join('; ').slice(0, 300) }
        settingsPatch[`tweak_${step.tweakId}`] = 'applied'
        return { ...base, status: 'ok', changes, journalId: entry && entry.id, fidelity: entry && entry.fidelity }
      }
      // control
      const fn = deps.controls[step.control]
      const cctx = { params: step.params, profile, runPS: deps.runPS, count, askConfirm: info => askConfirm(step.stepId, info), now }
      let result
      if (deps.journaledControls && deps.journaledControls.has(step.control)) {
        result = await deps.svc.runRecorded(`auto-opti:${step.control}`, 'apply', {}, (ps, cmd, note) => fn({ ...cctx, rec: { ps, cmd, note } }))
      } else {
        result = await fn({ ...cctx, rec: null })
      }
      const changes = controlChanges(step.control, result)
      if (step.control !== 'junk-clean') counters.settingsChanged += changes.length
      const status = result && result.status ? result.status : 'ok'
      return { ...base, status, changes, detail: result }
    } catch (e) {
      return { ...base, status: 'failed', changes: [], error: String(e && e.message || e).slice(0, 300) }
    }
  }

  async function verifyShield(profile) {
    const before = profile && profile.security
    if (!before || !deps.securityProbe) return { ok: true, checked: false, changed: [] }
    let after = null
    try { after = await deps.securityProbe() } catch {}
    if (!after) return { ok: true, checked: false, changed: [] }
    const changed = []
    for (const k of ['defenderRtp', 'firewallOn', 'uac', 'smartScreen', 'windowsUpdate', 'hvci']) {
      if (before[k] != null && after[k] != null && before[k] !== after[k]) changed.push({ key: k, before: before[k], after: after[k] })
    }
    return { ok: changed.length === 0, checked: true, changed }
  }

  function persist({ bootBaselineMs, batchId, runAt, settingsPatch, counters, results, steps, metricsBefore, needsYou, rebootRequired }) {
    try {
      const applied = results.filter(r => r.status === 'ok').length
      const patch = { ...settingsPatch, aom_last_run: { ts: runAt, batchId, applied, counters }, aom_pending_verify: {
        batchId, runAt, rebootRequired, metricsBefore, needsYou, bootBaselineMs,
        checks: results.filter(r => r.status === 'ok' || r.status === 'already').map(r => ({ stepId: r.stepId, findingId: r.findingId, tweakId: (steps.find(s => s.stepId === r.stepId) || {}).tweakId || null, control: (steps.find(s => s.stepId === r.stepId) || {}).control || null })),
      } }
      const s = deps.loadSettings(); Object.assign(s, patch); deps.saveSettings(s)
      if (deps.noteSettingsWrites) deps.noteSettingsWrites(patch)
      if (deps.emitSettingsPatch) deps.emitSettingsPatch(patch)
      if (deps.appendChangelog) deps.appendChangelog({ type: 'aom-run', batchId, tweakCount: applied, counters, v: 2 })
    } catch (e) { if (deps.log) deps.log(`persist failed: ${e && e.message}`, 'warn') }
  }

  return { run, stop, confirm, get active() { return !!active } }
}

module.exports = { createRunner, controlChanges, TASK_TIMEOUT_MS }
