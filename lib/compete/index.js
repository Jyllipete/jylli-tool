'use strict'
// Competitive Mode session service. One session at a time: launch the game, wait for its process, apply the planned steps,
// watch the process, undo everything in reverse order when it exits (or on Stop, or after a crash via recover()).
// Everything that touches the system arrives through `deps` (main.js wires the real ones, the tests wire fakes):
//   isPremium() -> bool                       resolveGame(id) -> { id, name, install?, aumid?, customExe? } | null
//   listLines() -> Promise<string[]>          "@@exe|fullpath" for every running process (see lib/gamecandidate.js)
//   lookup(exe) -> Promise<{ pid, name, st, cls } | null>        alive(g) -> Promise<bool>
//   launch(spec) -> Promise<void>             facts(game) -> Promise<facts for plan.js>
//   apply: { [stepId](ctx) -> Promise<{ ok, detail? }> }          undo: { [stepId](ctx) -> Promise<void> }
//   store: { load(key), save(key, value), remove(key) }           emit(channel, payload)
//   prefs: { read() -> object, write(object) }                    now(), pollMs, waitMs
const Plan = require('./plan')
const Launch = require('./launch')

const ACTIVE_KEY = 'compete-active'
const WAIT_MS = 3 * 60 * 1000
const POLL_MS = 2000
const WATCH_MS = 5000

function create(deps) {
  const now = deps.now || Date.now
  const pollMs = deps.pollMs || POLL_MS
  const watchMs = deps.watchMs || deps.pollMs || WATCH_MS   // while the game runs: a slow, cheap check
  const waitMs = deps.waitMs || WAIT_MS
  let session = null           // { state, gameId, name, since, game, plan, results, timer, batchId, stopping }

  const view = () => session ? {
    state: session.state, gameId: session.gameId, name: session.name, since: session.since, exe: session.game && session.game.exe || null,
    steps: (session.results || []).map(r => ({ id: r.id, state: r.state, reason: r.reason, ok: r.ok, detail: r.detail })),
  } : { state: 'idle' }
  const push = () => { try { deps.emit('compete-state', view()) } catch {} }
  const status = () => Object.assign({ ok: true }, view())

  const sleep = ms => new Promise(r => { const t = setTimeout(r, ms); if (t.unref) t.unref() })

  async function finish(why) {
    const s = session; if (!s) return
    s.state = 'ending'; push()
    clearTimeout(s.timer)
    const undone = []
    for (const r of [...(s.results || [])].reverse()) {
      if (r.state !== 'apply' || !r.ok) continue
      try { if (deps.undo[r.id]) await deps.undo[r.id](ctxOf(s, r)); undone.push(r.id) } catch { /* the journal keeps what could not be undone */ }
    }
    try { deps.store.remove(ACTIVE_KEY) } catch {}
    const receipt = { gameId: s.gameId, name: s.name, why, applied: (s.results || []).filter(r => r.state === 'apply' && r.ok).length, reverted: undone.length, at: now() }
    session = null
    try { deps.emit('compete-ended', receipt) } catch {}
    try { deps.emit('compete-state', { state: 'idle' }) } catch {}
    return receipt
  }

  const ctxOf = (s, step) => ({ game: s.game, step, batchId: s.batchId, gameId: s.gameId, name: s.name })

  async function watch(s) {
    while (session === s && s.state === 'running') {
      await sleep(watchMs)
      if (session !== s || s.state !== 'running') return
      let up = true
      try { up = await deps.alive(s.game) } catch { up = true }
      if (!up) return finish('game-closed')
    }
  }

  async function begin(s) {
    const found = await deps.lookup(s.match.exe)
    if (!found) return false
    s.game = Object.assign({ exe: s.match.exe, path: s.match.path }, found)
    const facts = Object.assign({}, await deps.facts(s.game).catch(() => ({})), { gameCls: found.cls })
    s.plan = Plan.plan({ opts: s.opts, facts, premium: !!deps.isPremium() })
    s.results = s.plan.steps.map(x => Object.assign({}, x))
    s.state = 'running'
    deps.store.save(ACTIVE_KEY, { batchId: s.batchId, gameId: s.gameId, name: s.name, since: s.since, exe: s.game.exe })
    push()
    for (const r of s.results) {
      if (r.state !== 'apply') continue
      if (session !== s) return true
      try {
        const out = await deps.apply[r.id](ctxOf(s, r))
        r.ok = !!(out && out.ok); r.detail = out && out.detail
        if (!r.ok) { r.state = 'skipped'; r.reason = (out && out.reason) || 'not-applied' }
      } catch (e) { r.ok = false; r.state = 'skipped'; r.reason = 'error' }
      push()
    }
    return true
  }

  async function waitForGame(s) {
    const t0 = now()
    while (session === s && s.state === 'waiting') {
      if (now() - t0 > waitMs) return finish('no-game-found')
      await sleep(pollMs)
      if (session !== s || s.state !== 'waiting') return
      let lines = []
      try { lines = await deps.listLines() } catch {}
      const m = Launch.matchProcess(lines, s.spec, s.known)
      if (!m) continue
      s.match = m
      if (await begin(s)) return watch(s)
    }
  }

  async function start({ gameId, opts } = {}) {
    if (session) return { ok: false, error: 'busy' }
    const game = deps.resolveGame(String(gameId || ''))
    if (!game) return { ok: false, error: 'unknown-game' }
    const spec = Launch.launchFor(game)
    if (!spec) return { ok: false, error: 'cannot-launch' }
    const o = Plan.normalize(opts)
    let known = new Set()
    try { known = new Set((await deps.listLines()).filter(l => String(l).startsWith('@@')).map(l => String(l).slice(2, String(l).indexOf('|')).trim().toLowerCase())) } catch {}
    const s = session = { state: 'waiting', gameId: game.id, name: game.name, since: now(), opts: o, known, batchId: 'compete-' + now(), results: [],
      spec: { install: game.install || null, customExe: game.customExe || null } }
    push()
    try { await deps.launch(spec) } catch (e) { session = null; push(); return { ok: false, error: 'launch-failed' } }
    try { const p = deps.prefs.read() || {}; p.last = game.id; p.opts = Object.assign({}, p.opts, { [game.id]: o }); deps.prefs.write(p) } catch {}
    waitForGame(s).catch(() => finish('error'))
    return { ok: true, state: 'waiting' }
  }

  async function stop() {
    if (!session) return { ok: true, state: 'idle' }
    const r = await finish('stopped')
    return { ok: true, state: 'idle', receipt: r }
  }

  /** After a crash or forced exit: a leftover marker means the steps were never undone. The journal holds the rest. */
  async function recover() {
    let left = null
    try { left = deps.store.load(ACTIVE_KEY) } catch {}
    if (!left) return { ok: true, recovered: false }
    const fake = { gameId: left.gameId, name: left.name, game: { exe: left.exe }, batchId: left.batchId, results: [] }
    for (const id of Object.keys(deps.undo).reverse()) { try { await deps.undo[id](ctxOf(fake, { id }), { recover: true }) } catch {} }
    try { deps.store.remove(ACTIVE_KEY) } catch {}
    return { ok: true, recovered: true }
  }

  return { start, stop, status, recover, view }
}

module.exports = { create, ACTIVE_KEY }
