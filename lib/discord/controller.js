'use strict'
// Discord connection + publish controller. Everything with a side effect comes in through deps so tests drive it with fakes:
//   createClient() -> discord-rpc style client (on/login/setActivity/clearActivity/destroy)   clientId
//   onStatus(status)                      called whenever the state or the published activity changes
//   setTimeout/clearTimeout/now           clock
// Why a fresh client per attempt: discord-rpc@4 caches its connect promise forever, so retrying on the same client never reconnects
// and a client that lost its socket reports "ready" again without any socket. Events from a replaced client are ignored.
const Presence = require('./presence')

const BACKOFF_MS = [5000, 15000, 30000, 60000]
const MIN_GAP_MS = 4500          // Discord allows 5 updates per 20 s; one per 4.5 s stays under it
const DESTROY_MS = 1500
const SHUTDOWN = { clear: 700, flush: 300, destroy: 500 }

function create(deps) {
  const now = deps.now || Date.now
  const setT = deps.setTimeout || setTimeout
  const clearT = deps.clearTimeout || clearTimeout
  const build = deps.build || Presence.build
  const log = deps.log || (() => {})

  let enabled = false
  let prefs = Presence.normalizePrefs(deps.prefs)
  let base = { lang: 'en', route: null, tweaks: 0, game: null, pulse: null, sessionStart: now(), hidden: false, silent: false }
  const tasks = []                 // [{ token, kind, step, total, key, since }]; the newest one is shown
  let nextToken = 1

  let client = null                // the one live client (identity checks drop events from replaced ones)
  let link = 'off'                 // off | connecting | waiting | live
  let reason = null                // short code: not-running | lost | send-failed | create-failed
  let since = now()
  let nextRetryAt = null
  let retryTimer = null
  let pendingTimer = null
  let backoffIdx = 0
  let lastJson = undefined         // what Discord currently shows ('null' = cleared); undefined = unknown
  let lastSentAt = 0
  let lastStatusJson = ''

  const withTimeout = (p, ms) => new Promise(resolve => {
    const t = setT(resolve, ms)
    Promise.resolve(p).then(() => { clearT(t); resolve() }, () => { clearT(t); resolve() })
  })
  const sleep = ms => new Promise(r => setT(r, ms))

  function compute() {
    const top = tasks.length ? tasks[tasks.length - 1] : null
    return build({ ...base, task: top ? { kind: top.kind, step: top.step, total: top.total, key: top.key, since: top.since } : null }, prefs)
  }

  function status() {
    const res = compute()
    let state = link
    let why = reason
    if (link === 'live' && !res.activity) { state = 'paused'; why = res.mode }
    return { state, reason: why, since, nextRetryAt, mode: res.mode, activity: enabled ? res.activity : null, prefs: { ...prefs } }
  }
  function emit() {
    let s
    try { s = status() } catch { return }
    const j = JSON.stringify(s)
    if (j === lastStatusJson) return
    lastStatusJson = j
    try { if (deps.onStatus) deps.onStatus(s) } catch { /* a closed window must not break presence */ }
  }
  function setLink(next, why) {
    if (link !== next || reason !== (why || null)) { link = next; reason = why || null; since = now() }
    if (next !== 'waiting') nextRetryAt = null
    emit()
  }

  // ── connection ────────────────────────────────────────────────────────────────
  // Drops the current client at once (so a new one can start) and tears the old one down in the background.
  // `pre(old)` runs first, while the socket is still open (the final clearActivity).
  function detach(ms, pre) {
    const old = client
    client = null
    lastJson = undefined
    if (pendingTimer) { clearT(pendingTimer); pendingTimer = null }
    if (!old) return Promise.resolve()
    try { if (old.removeAllListeners) { old.removeAllListeners(); old.on('error', () => {}) } } catch { /* ignore */ }
    return (async () => {
      if (pre) await pre(old)
      await withTimeout(old.destroy(), ms || DESTROY_MS)
    })().catch(() => {})
  }

  function scheduleRetry() {
    if (!enabled || retryTimer) return
    const delay = BACKOFF_MS[Math.min(backoffIdx, BACKOFF_MS.length - 1)]
    backoffIdx++
    nextRetryAt = now() + delay
    retryTimer = setT(() => { retryTimer = null; connect() }, delay)
    emit()
  }
  function lost(c, why) {
    if (client !== c) return
    detach().catch(() => {})
    setLink('waiting', why)
    scheduleRetry()
  }

  function connect() {
    if (!enabled || client) return
    let c
    try { c = deps.createClient() } catch (e) { log('create failed: ' + (e && e.message)); setLink('waiting', 'create-failed'); scheduleRetry(); return }
    client = c
    setLink('connecting')
    c.on('error', () => {})
    c.on('ready', () => {
      if (client !== c) return
      backoffIdx = 0; lastJson = undefined; lastSentAt = 0
      setLink('live')
      flush()
    })
    c.on('disconnected', () => lost(c, 'lost'))
    Promise.resolve().then(() => c.login({ clientId: deps.clientId })).catch(() => lost(c, 'not-running'))
  }

  // ── publishing ────────────────────────────────────────────────────────────────
  function send(c, res, json) {
    lastJson = json
    lastSentAt = now()
    let p
    try { p = res.activity ? c.setActivity(res.activity) : c.clearActivity() } catch { p = Promise.reject(new Error('send')) }
    Promise.resolve(p).catch(() => lost(c, 'send-failed'))
  }
  function flush() {
    if (!enabled || !client || link !== 'live') return
    const res = compute()
    const json = res.activity ? JSON.stringify(res.activity) : 'null'
    if (json === lastJson) return
    const wait = lastSentAt ? lastSentAt + MIN_GAP_MS - now() : 0
    if (wait > 0) {
      if (!pendingTimer) pendingTimer = setT(() => { pendingTimer = null; flush() }, wait)
      return
    }
    send(client, res, json)
  }

  // ── public API ────────────────────────────────────────────────────────────────
  function change() { flush(); emit() }
  const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b)

  /** Merge a patch into the live input (route, tweaks, game, pulse, lang, hidden, silent, sessionStart). */
  function set(patch) {
    let changed = false
    for (const k of Object.keys(patch || {})) {
      if (!(k in base) || sameJson(base[k], patch[k])) continue
      base[k] = patch[k]; changed = true
    }
    if (changed) change()
  }
  function setPrefs(patch) {
    const next = Presence.normalizePrefs({ ...prefs, ...(patch || {}) })
    if (sameJson(next, prefs)) return prefs
    prefs = next
    change()
    return prefs
  }

  function beginTask(kind) {
    const t = { token: nextToken++, kind, step: null, total: null, key: null, since: now() }
    tasks.push(t)
    change()
    return t.token
  }
  function progress(token, p) {
    const t = tasks.find(x => x.token === token)
    if (!t) return
    const q = p || {}
    t.step = Number.isFinite(q.step) ? q.step : null
    t.total = Number.isFinite(q.total) ? q.total : null
    t.key = typeof q.key === 'string' ? q.key : null
    change()
  }
  function endTask(token) {
    const i = tasks.findIndex(x => x.token === token)
    if (i < 0) return
    tasks.splice(i, 1)
    change()
  }

  async function teardown(wasLive, ms) {
    if (retryTimer) { clearT(retryTimer); retryTimer = null }
    const pre = wasLive ? async c => {
      await withTimeout((() => { try { return c.clearActivity() } catch { return null } })(), ms ? ms.clear : 700)
      await sleep(ms ? ms.flush : 300)   // let Discord pass the clear on before the socket goes
    } : null
    await detach(ms ? ms.destroy : DESTROY_MS, pre)
  }

  async function setEnabled(on) {
    on = !!on
    if (on === enabled) return
    enabled = on
    if (on) { backoffIdx = 0; connect(); emit(); return }
    const wasLive = link === 'live'
    setLink('off')
    await teardown(wasLive)
  }
  function retryNow() {
    if (!enabled || link === 'live' || link === 'connecting') return
    if (retryTimer) { clearT(retryTimer); retryTimer = null }
    backoffIdx = 0
    connect()
  }
  async function shutdown() {
    enabled = false
    const wasLive = link === 'live'
    setLink('off')
    await teardown(wasLive, SHUTDOWN)
  }
  function timers() { return [retryTimer, pendingTimer] }

  return { set, setPrefs, beginTask, progress, endTask, setEnabled, retryNow, shutdown, status, timers, get enabled() { return enabled } }
}

module.exports = { create, BACKOFF_MS, MIN_GAP_MS }
