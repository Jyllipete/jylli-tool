'use strict'
// The one owner of "is a Pulse boost running, and who started it". Every surface (Pulse tab, tray, Cockpit, HUD, hotkeys, game bundles,
// Auto-Pulse) starts and stops a boost through here, so:
//   - operations run one after the other: a Stop pressed while a Start is still applying runs AFTER it and takes everything back
//     (before, the Stop restored a half-built boost and the Start then applied its remaining steps on top),
//   - "who started it" is one value, set by the caller of start() and cleared by every stop, from any surface (before, a global was
//     cleared by some stop paths only, so a later manual boost was journaled as "game watcher"),
//   - the game session service is told what happened, and by whom, so its panel never shows a stale state.
// Pure: the work itself (activatePulse / deactivatePulse in main.js) and the notification are injected.

const AUTO = 'auto', MANUAL = 'manual'

/**
 * deps: { activate(presetId, { ...opts, killBg, via }) -> Promise<{ok}>, deactivate(opts) -> Promise<{ok}>, current?() -> the preset the engine really has active,
 *         notify?(change: { preset: string|null, via: 'auto'|'manual'|null, by: 'auto'|'manual', action: 'start'|'stop' }) }
 */
function create(deps) {
  let queue = Promise.resolve()
  let preset = null, via = null
  const enqueue = fn => { const p = queue.then(fn, fn); queue = p.catch(() => {}); return p }
  const tell = c => { try { deps.notify && deps.notify(c) } catch { /* a listener must never break a boost */ } }

  /** Start (or re-apply) a boost. opts.auto = true when Auto-Pulse (not a person) asks for it. */
  function start(presetId, opts = {}) {
    const by = opts.auto ? AUTO : MANUAL
    return enqueue(async () => {
      let r
      try { r = await deps.activate(presetId, { ...opts, killBg: !!opts.killBg, via: by }) } catch (e) { r = { ok: false, error: String((e && e.message) || e).slice(0, 160) } }
      if (r && r.ok) { preset = presetId; via = by }
      else { preset = deps.current ? deps.current() || null : null; if (!preset) via = null }   // a refused start leaves an existing boost exactly as it was
      tell({ preset, via, by, action: 'start' })
      return r
    })
  }

  /** Stop the boost, whoever started it. opts.auto = true when the game session (not a person) ends it. */
  function stop(opts = {}) {
    const by = opts.auto ? AUTO : MANUAL
    return enqueue(async () => {
      let r
      try { r = await deps.deactivate(opts) } catch { r = { ok: false } }
      preset = null; via = null
      tell({ preset: null, via: null, by, action: 'stop' })
      return r
    })
  }

  return {
    start, stop,
    /** The boost that is running and who started it, or { preset: null }. */
    state: () => ({ preset, via }),
    /** The preset id only when Auto-Pulse started it (used for the tray label and for re-sending state to a rebuilt page). */
    autoPreset: () => (via === AUTO ? preset : null),
    /** Waits until everything queued so far has finished (quit, tests). */
    idle: () => queue.then(() => {}, () => {}),
  }
}

module.exports = { create, AUTO, MANUAL }
