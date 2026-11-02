'use strict'
// Main-process glue for the change journal: journaled tweak execution, the one apply pipeline (apply-batch), undo, and the
// tweak metadata the UI uses. main.js passes in everything it owns (runPS, TWEAKS, settings helpers, IPC emit), so this file
// holds no Electron state and is testable with fakes.
const { AsyncLocalStorage } = require('async_hooks')
const crypto = require('crypto')
const { createJournal, undoEntry } = require('./journal')
const { createRecorder } = require('./journal-runner')

const newId = () => crypto.randomBytes(6).toString('hex')
const PLAN_VIAS = new Set(['auto-opti', 'spw', 'ai', 'game-watcher', 'scheduler'])
const MAX_ITEMS = 120
// restore() runs after the journal restore for the parts the journal cannot follow (it receives opts.journalRestored).
const restoreThenOwn = new Set(['full-mitigation-wipe', 'dns-doh'])
// Tweaks whose restore() hardcodes values: Restore puts back what the journal recorded instead.
const restoreFromJournal = new Set(['disable-ipv6', 'defender-idle-priority', 'mmcss', 'fivem-mmcss', 'fivem-vm', 'gpu-hwsch', 'gpu-hags-off', 'vbs-disable', 'hvci-offload', 'fix-valorant-hvci', 'full-mitigation-wipe', 'vrr-borderless', 'dns-doh', 'dns-cloudflare', 'dns-google', 'dns-quad9', 'dns-adguard', 'dns-custom'])
const RP_STALE_MS = 6 * 3600 * 1000

function createJournalService(deps) {
  const { file, runPS, runCmd, tweaks, hasTweak, isPlanExcluded, requiresPremium, createRestorePoint, emit,
    loadSettings, saveSettings, writeLog, now = Date.now, fs, handlers = {}, manifest = {} } = deps
  const journal = createJournal({ file, now, ...(fs ? { fs } : {}) })
  const als = new AsyncLocalStorage()

  const withContext = (ctx, fn) => als.run(ctx, fn)

  /**
   * Restore buttons of tweaks whose own restore() writes fixed defaults: put back the values the journal recorded before the
   * apply. Only used when every active apply of the tweak was recorded exactly (nothing unresolved); otherwise returns null
   * and the tweak's own restore runs. force:true because the user explicitly asked for the original back.
   */
  async function restoreFromRecorded(id, send, key = 'tweakId') {
    const entries = journal.list({ limit: 2000 }).filter(e => e[key] === id && e.action === 'apply' && !e.undoneBy && e.via !== 'undo')
    if (!entries.length || entries.some(e => !e.changes.length || e.changes.every(c => c.kind === 'unresolved'))) return null
    // Part of the tweak could not be followed (process mitigation, DoH servers): those parts still go through its own restore.
    const partial = entries.some(e => e.changes.some(c => c.kind === 'unresolved'))
    if (partial && !restoreThenOwn.has(id)) return null
    const undoId = newId()
    for (const e of entries) {
      const r = await undoEntry(e, { ps: runPS, cmd: runCmd, force: true, handlers })
      if (!r.ok) { send?.(`[warn] could not restore the recorded original values (${id}); using the built-in restore`, 'warn'); return null }
      journal.markUndone(e.id, undoId)
      journal.record({ [key]: id, action: 'restore', via: 'undo', batchId: undoId, undoes: e.id, changes: [] })
    }
    send?.('Restored the values this tool recorded before it changed them.', 'ok')
    return partial ? { partial: true } : { done: true }
  }

  /** Runs a tweak action under the journal. Same signature and return value as the old invokeTweak, plus meta. */
  async function invokeTweak(id, action = 'apply', send, meta = {}) {
    if (!hasTweak(id, action)) throw new Error(`Unknown tweak or action: ${String(id).slice(0, 60)}/${String(action).slice(0, 12)}`)
    const ctx = { ...(als.getStore() || {}), ...meta }
    let restoreOpts
    if (action === 'restore' && ctx.via !== 'undo' && restoreFromJournal.has(id)) {
      const j = await restoreFromRecorded(id, send)
      if (j && j.done) return undefined
      if (j && j.partial) restoreOpts = { journalRestored: true }
    }
    const rec = createRecorder({ runPS, runCmd })
    let result = 'ok'
    try {
      const ret = await tweaks[id][action](send, rec.ps, rec.cmd, rec.regAdd, rec.regDelete, rec.note, restoreOpts)
      const { failures, warnings } = rec.outcome()
      warnings.forEach(w => send?.(`[warn] ${w.kind}: ${w.err} (${w.command})`, 'warn'))
      if (failures.length) {
        // The tweak ran to the end but a write was rejected: report it instead of calling it applied.
        result = 'partial'
        failures.forEach(f => send?.(`[fail] ${f.kind}: ${f.err} (${f.command})`, 'err'))
        ctx.onFailures?.(failures)
      }
      return ret
    } catch (e) {
      result = 'error'
      throw e
    } finally {
      try {
        const { changes } = rec.finish()
        if (changes.length) {
          const entry = journal.record({ tweakId: id, action, via: ctx.via || 'manual', batchId: ctx.batchId || null, changes, result })
          ctx.onEntry?.(entry)
        }
      } catch (e) { writeLog?.(`[journal] record failed: ${e.message}`) }
    }
  }

  /** Journals work that is not a registered tweak (game profiles, power limit...). fn receives journaling ps/cmd. */
  async function runRecorded(control, action, meta, fn) {
    const ctx = { ...(als.getStore() || {}), ...meta }
    const rec = createRecorder({ runPS, runCmd })
    let result = 'ok'
    try {
      const ret = await fn(rec.ps, rec.cmd)
      const { failures } = rec.outcome()
      if (failures.length) { result = 'partial'; ctx.onFailures?.(failures) }
      return ret
    } catch (e) { result = 'error'; throw e } finally {
      try {
        const { changes } = rec.finish()
        if (changes.length) journal.record({ control, action, via: ctx.via || 'manual', batchId: ctx.batchId || null, changes, result })
      } catch (e) { writeLog?.(`[journal] record failed: ${e.message}`) }
    }
  }

  /** Undoes every still-active apply recorded for a control, newest first. Returns { ok, found } (found = entries seen). */
  async function undoControl(control, opts = { force: true }) {
    const entries = journal.list({ limit: 2000 }).filter(e => e.control === control && e.action === 'apply' && !e.undoneBy)
    for (const e of entries) { const r = await undo({ entryId: e.id }, opts); if (!r.ok) return { ok: false, found: entries.length, result: r } }
    return { ok: true, found: entries.length }
  }

  function tierOf(id) { return tweaks[id]?.safetyTier ?? 3 }

  async function applyBatch(req) {
    const { items, via = 'manual', restorePoint = 'auto', label = '' } = req || {}
    if (!Array.isArray(items) || !items.length || items.length > MAX_ITEMS) return { ok: false, error: 'invalid_items' }
    const batchId = newId()
    const out = { ok: true, batchId, restorePoint: null, items: [], rebootRequired: false, settingsPatch: {} }
    const queue = []
    for (const it of items) {
      const id = it?.tweakId, action = it?.action === 'restore' ? 'restore' : 'apply'
      if (typeof id !== 'string' || !hasTweak(id, action)) { out.items.push({ id: String(id).slice(0, 60), status: 'unknown', error: 'unknown_tweak_or_action' }); continue }
      if (id.startsWith('fivem-') && !requiresPremium('apply-batch')) { out.items.push({ id, status: 'blocked', error: 'premium_required' }); continue }
      if (PLAN_VIAS.has(via) && action === 'apply' && (isPlanExcluded(id) || tierOf(id) >= 3)) { out.items.push({ id, status: 'skipped', error: 'not_allowed_in_automatic_run' }); continue }
      queue.push({ id, action })
    }
    const s0 = loadSettings()
    const stale = !s0.lastRestorePointAt || now() - s0.lastRestorePointAt > RP_STALE_MS
    const applying = queue.filter(q => q.action === 'apply')
    const wantRp = restorePoint === 'force' || (restorePoint === 'auto' && applying.length &&
      (applying.some(q => tierOf(q.id) >= 2) || applying.length > 5 || stale))
    if (wantRp) {
      emit('batch-progress', { batchId, step: 0, total: queue.length, status: 'restore-point', label })
      const rp = await createRestorePoint()
      out.restorePoint = { ok: !!rp?.ok, name: rp?.name || 'JylliTool_AutoOpti', reason: rp?.reason, guidance: rp?.guidance }
      if (!rp?.ok) {
        // Same rule as Auto-Optimize: no safety net, no changes.
        return { ...out, ok: false, aborted: true, reason: rp?.reason || 'restore-point-failed', guidance: rp?.guidance, items: out.items }
      }
      const s = loadSettings(); s.lastRestorePointAt = now(); saveSettings(s)
    }
    let step = 0
    await withContext({ via, batchId }, async () => {
      for (const q of queue) {
        step++
        emit('batch-progress', { batchId, step, total: queue.length, id: q.id, status: 'running', label })
        let entry = null
        const send = (msg, level = 'info') => emit('log', { msg, level, ts: new Date().toLocaleTimeString(), source: q.id })
        try {
          let failed = null
          await invokeTweak(q.id, q.action, send, { onEntry: e => { entry = e }, onFailures: f => { failed = f } })
          if (failed) {
            out.items.push({ id: q.id, action: q.action, status: 'partial', journalId: entry?.id || null, fidelity: entry?.fidelity || 'intent', error: failed.map(f => f.err).join('; ').slice(0, 300), failures: failed })
          } else {
            out.items.push({ id: q.id, action: q.action, status: 'ok', journalId: entry?.id || null, fidelity: entry?.fidelity || 'intent' })
            out.settingsPatch[`tweak_${q.id}`] = q.action === 'apply' ? 'applied' : 'restored'
          }
        } catch (e) {
          out.items.push({ id: q.id, action: q.action, status: 'failed', journalId: entry?.id || null, fidelity: entry?.fidelity || 'intent', error: String(e.message || e).slice(0, 300) })
        }
        emit('batch-progress', { batchId, step, total: queue.length, id: q.id, status: out.items.at(-1).status, label })
      }
    })
    if (Object.keys(out.settingsPatch).length) {
      const s = loadSettings()
      Object.assign(s, out.settingsPatch)
      saveSettings(s)
      deps.noteSettingsWrites?.(out.settingsPatch)
      emit('settings-patch', out.settingsPatch)
    }
    out.rebootRequired = out.items.some(i => i.status === 'ok' && /reboot/i.test(String(tweaks[i.id]?.rebootRequired ?? '')))
    out.ok = out.items.some(i => i.status === 'ok') || !out.items.length
    return out
  }

  function list(opts) { return journal.list(opts) }

  /** target: { entryId } | { batchId } | { sessionId }. Newest first, so later changes are undone before earlier ones. */
  async function undo(target, { force = false } = {}) {
    let entries = []
    if (target?.entryId) { const e = journal.get(target.entryId); if (e) entries = [e] }
    else if (target?.batchId) entries = journal.list({ batchId: target.batchId, limit: 5000 })
    else if (target?.sessionId) entries = journal.list({ sessionId: target.sessionId, limit: 5000 })
    entries = entries.filter(e => !e.undoneBy && e.via !== 'undo')
    if (!entries.length) return { ok: false, error: 'nothing_to_undo' }
    const undoId = newId()
    const results = []
    for (const e of entries) {
      const hasReal = e.changes.some(c => c.kind !== 'unresolved')
      let r
      if (!hasReal && hasTweak(e.tweakId, e.action === 'apply' ? 'restore' : 'apply')) {
        // Nothing was recorded precisely: fall back to the tweak's own restore, and say so.
        try { await invokeTweak(e.tweakId, e.action === 'apply' ? 'restore' : 'apply', () => {}, { via: 'undo' }); r = { ok: true, fallback: true, results: [] } }
        catch (err) { r = { ok: false, error: String(err.message || err), results: [] } }
      } else {
        r = await undoEntry(e, { ps: runPS, cmd: runCmd, force, handlers })
      }
      results.push({ entryId: e.id, tweakId: e.tweakId, ok: r.ok, fallback: !!r.fallback, conflicts: r.conflicts || [], failedAt: r.failedAt, error: r.error })
      if (!r.ok) return { ok: false, undoId, results, conflict: (r.conflicts || []).length > 0 }
      journal.markUndone(e.id, undoId)
      journal.record({ tweakId: e.tweakId, action: e.action === 'apply' ? 'restore' : 'apply', via: 'undo', batchId: undoId, undoes: e.id, changes: [] })
      if (e.tweakId) {
        const s = loadSettings(); const patch = { [`tweak_${e.tweakId}`]: e.action === 'apply' ? 'restored' : 'applied' }
        Object.assign(s, patch); saveSettings(s); deps.noteSettingsWrites?.(patch); emit('settings-patch', patch)
      }
    }
    return { ok: true, undoId, results }
  }

  function tweakMeta(ids) {
    const list = Array.isArray(ids) && ids.length ? ids : Object.keys(tweaks)
    return list.filter(id => typeof id === 'string' && tweaks[id]).map(id => {
      const t = tweaks[id]
      return { id, name: t.name || id, category: t.category || null, safetyTier: t.safetyTier ?? 3, gamerImpact: t.gamerImpact || 'low', hasCheck: typeof t.check === 'function', hasRestore: typeof t.restore === 'function',
        fidelity: manifest[id] ? manifest[id].fidelity : 'unknown', touches: manifest[id] ? manifest[id].touches.length : null }
    })
  }

  /** Restore of a non-tweak control (e.g. app-optimizer:<id>) from its recorded originals: { done } or { partial } / {}. */
  const restoreRecorded = (control, send) => restoreFromRecorded(control, send, 'control').then(r => r || {})

  return { journal, runRecorded, restoreRecorded, undoControl, invokeTweak, applyBatch, withContext, list, undo, tweakMeta }
}

module.exports = { createJournalService }
