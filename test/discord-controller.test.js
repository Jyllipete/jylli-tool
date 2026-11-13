'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const Controller = require('../lib/discord/controller')

const flush = () => new Promise(r => setImmediate(r))

function clock() {
  let t = 1000, id = 0
  const q = new Map()
  return {
    now: () => t,
    setTimeout: (fn, ms) => { const i = ++id; q.set(i, { at: t + ms, fn }); return i },
    clearTimeout: i => { q.delete(i) },
    pending: () => q.size,
    async advance(ms) {
      const end = t + ms
      for (;;) {
        let next = null
        for (const [i, x] of q) if (x.at <= end && (!next || x.at < next[1].at)) next = [i, x]
        if (!next) break
        q.delete(next[0]); t = Math.max(t, next[1].at); next[1].fn(); await flush()
      }
      t = end; await flush()
    },
  }
}

// A fake Discord: `env.running` decides whether login works; every client is recorded.
function discord() {
  const env = { running: true, hangLogin: false, hangDestroy: false, failSend: false, clients: [], log: [] }
  env.createClient = () => {
    const c = new EventEmitter()
    c.n = env.clients.length
    c.sent = []
    c.destroyed = false
    c.login = () => {
      if (env.hangLogin) return new Promise(() => {})
      if (!env.running) return Promise.reject(new Error('Could not connect'))
      return Promise.resolve().then(() => { c.emit('ready') })
    }
    c.setActivity = a => { if (env.failSend) return Promise.reject(new Error('send')); c.sent.push(a); env.log.push('set'); return Promise.resolve({}) }
    c.clearActivity = () => { c.sent.push(null); env.log.push('clear'); return Promise.resolve() }
    c.destroy = () => { c.destroyed = true; env.log.push('destroy'); return env.hangDestroy ? new Promise(() => {}) : Promise.resolve() }
    env.clients.push(c)
    return c
  }
  return env
}

function setup(over = {}) {
  const ck = clock(), env = discord(), statuses = []
  const c = Controller.create({ createClient: env.createClient, clientId: 'x', now: ck.now, setTimeout: ck.setTimeout, clearTimeout: ck.clearTimeout, onStatus: s => statuses.push(s), ...over })
  return { ck, env, c, statuses }
}
const sets = cl => cl.sent.filter(Boolean)

test('Discord closed at launch, opened later: reconnects with a NEW client', async () => {
  const { ck, env, c } = setup()
  env.running = false
  await c.setEnabled(true); await flush()
  assert.equal(c.status().state, 'waiting'); assert.equal(c.status().reason, 'not-running')
  assert.equal(env.clients.length, 1)
  env.running = true
  await ck.advance(5000)
  assert.equal(env.clients.length, 2)
  assert.equal(c.status().state, 'live')
  assert.equal(sets(env.clients[1]).length, 1)
  assert.ok(env.clients[0].destroyed)
})

test('backoff grows 5s, 15s, 30s, 60s and stays at 60s; retryNow resets it', async () => {
  const { ck, env, c } = setup()
  env.running = false
  await c.setEnabled(true); await flush()
  const gaps = []
  for (let i = 0; i < 6; i++) { const at = c.status().nextRetryAt; gaps.push(at - ck.now()); await ck.advance(at - ck.now()) }
  assert.deepEqual(gaps, [5000, 15000, 30000, 60000, 60000, 60000])
  env.running = true
  c.retryNow(); await flush()
  assert.equal(c.status().state, 'live')
})

test('connection lost: waiting, then reconnects on a fresh client', async () => {
  const { ck, env, c } = setup()
  await c.setEnabled(true); await flush()
  assert.equal(c.status().state, 'live')
  env.clients[0].emit('disconnected'); await flush()
  assert.equal(c.status().state, 'waiting'); assert.equal(c.status().reason, 'lost')
  await ck.advance(5000)
  assert.equal(env.clients.length, 2)
  assert.equal(c.status().state, 'live')
  assert.equal(sets(env.clients[1]).length, 1, 'presence is published again after reconnect')
})

test('a replaced client cannot change the state any more', async () => {
  const { ck, env, c } = setup()
  await c.setEnabled(true); await flush()
  const old = env.clients[0]
  old.emit('disconnected'); await ck.advance(5000)
  assert.equal(c.status().state, 'live')
  old.emit('disconnected'); old.emit('ready'); await flush()
  assert.equal(c.status().state, 'live')
  assert.equal(env.clients.length, 2)
})

test('rapid changes are throttled (<= 5 sends per 20 s) and the last one wins', async () => {
  const { ck, env, c } = setup()
  await c.setEnabled(true); await flush()
  const tabs = ['gpu', 'cpumem', 'power', 'network', 'fixes', 'pulse', 'games', 'apps']
  for (let s = 0; s < 200; s++) { c.set({ route: { tab: tabs[s % tabs.length] } }); await ck.advance(100) }   // 20 s of clicking
  const cl = env.clients[0]
  assert.ok(sets(cl).length <= 6, 'sent ' + sets(cl).length)   // first send + at most one per 4.5 s
  await ck.advance(5000)
  c.set({ route: { tab: 'history' } }); c.set({ route: { tab: 'restore' } }); c.set({ route: { tab: 'scheduler' } })
  await ck.advance(5000)
  assert.match(sets(cl).pop().details, /Scheduling/)
})

test('an update that changes nothing sends nothing', async () => {
  const { ck, env, c } = setup()
  await c.setEnabled(true); await flush()
  c.set({ route: { tab: 'gpu' } }); await ck.advance(5000)
  const n = env.clients[0].sent.length
  c.set({ route: { tab: 'gpu' } }); c.set({ tweaks: 0 }); c.setPrefs({ detail: 'full' }); await ck.advance(10000)
  assert.equal(env.clients[0].sent.length, n)
})

test('overlapping tasks: the newest shows, finishing the older one keeps it, finishing the last restores the page', async () => {
  const { ck, env, c } = setup()
  await c.setEnabled(true); await flush()
  const a = c.beginTask('scan'); await ck.advance(5000)
  const h = c.beginTask('health'); c.progress(h, { key: 'sfc' }); await ck.advance(5000)
  assert.match(c.status().activity.details, /Windows health/)
  assert.match(c.status().activity.state, /SFC/)
  c.endTask(a); await ck.advance(5000)
  assert.match(c.status().activity.details, /Windows health/)
  c.progress(h, { step: 2, total: 3 }); assert.equal(c.status().activity.state, 'Step 2 of 3')
  c.endTask(h); await ck.advance(5000)
  assert.equal(c.status().mode, 'page')
  c.endTask(h); c.progress(999, { step: 1, total: 2 })   // unknown / repeated tokens are harmless
  assert.equal(c.status().mode, 'page')
})

test('turning it off while connecting leaves no live client and a late ready is ignored', async () => {
  const { ck, env, c } = setup()
  env.hangLogin = true
  await c.setEnabled(true); await flush()
  assert.equal(c.status().state, 'connecting')
  await c.setEnabled(false)
  assert.equal(c.status().state, 'off')
  assert.ok(env.clients[0].destroyed)
  env.clients[0].emit('ready'); await ck.advance(120000)
  assert.equal(c.status().state, 'off')
  assert.equal(env.clients.length, 1, 'no retry after disabling')
  assert.equal(ck.pending(), 0)
})

test('off then on quickly gives exactly one new live client', async () => {
  const { ck, env, c } = setup()
  await c.setEnabled(true); await flush()
  const off = c.setEnabled(false)    // its teardown sleeps on the fake clock
  const on = c.setEnabled(true)
  await ck.advance(2000); await off; await on
  assert.equal(c.status().state, 'live')
  assert.equal(env.clients.filter(x => !x.destroyed).length, 1)
})

test('a destroy() that never answers cannot hang disabling or shutdown', async () => {
  const { ck, env, c } = setup()
  env.hangDestroy = true
  await c.setEnabled(true); await flush()
  let done = false
  c.setEnabled(false).then(() => { done = true })
  await ck.advance(3000)
  assert.ok(done, 'setEnabled(false) resolved')
  await c.setEnabled(true); await flush()
  done = false
  c.shutdown().then(() => { done = true })
  await ck.advance(1600)
  assert.ok(done, 'shutdown resolved within ~1.5 s')
})

test('hide clears, show restores; whenHidden keep ignores hide', async () => {
  const { ck, env, c } = setup()
  await c.setEnabled(true); await flush()
  c.set({ route: { tab: 'gpu' } }); await ck.advance(5000)
  c.set({ hidden: true }); await ck.advance(5000)
  assert.equal(env.clients[0].sent.at(-1), null)
  assert.equal(c.status().state, 'paused'); assert.equal(c.status().reason, 'hidden')
  c.set({ hidden: false }); await ck.advance(5000)
  assert.match(env.clients[0].sent.at(-1).details, /GPU/)
  assert.equal(c.status().state, 'live')
  c.setPrefs({ whenHidden: 'keep' }); const n = env.clients[0].sent.length
  c.set({ hidden: true }); await ck.advance(10000)
  assert.equal(env.clients[0].sent.length, n)
})

test('silent mode clears without dropping the connection', async () => {
  const { ck, env, c } = setup()
  await c.setEnabled(true); await flush()
  c.set({ silent: true }); await ck.advance(5000)
  assert.equal(env.clients[0].sent.at(-1), null)
  assert.equal(env.clients.length, 1); assert.ok(!env.clients[0].destroyed)
  assert.equal(c.status().reason, 'silent')
  c.set({ silent: false }); await ck.advance(5000)
  assert.ok(env.clients[0].sent.at(-1))
})

test('shutdown clears the status before the socket is destroyed', async () => {
  const { ck, env, c } = setup()
  await c.setEnabled(true); await flush()
  env.log.length = 0
  const p = c.shutdown(); await ck.advance(1500); await p
  assert.deepEqual(env.log, ['clear', 'destroy'])
  assert.equal(c.status().state, 'off')
  assert.equal(ck.pending(), 0)
})

test('a failed send drops to waiting and reconnects', async () => {
  const { ck, env, c } = setup()
  await c.setEnabled(true); await flush()
  env.failSend = true
  c.set({ route: { tab: 'gpu' } }); await ck.advance(5000); await flush()
  assert.equal(c.status().state, 'waiting'); assert.equal(c.status().reason, 'send-failed')
  env.failSend = false
  await ck.advance(5000)
  assert.equal(c.status().state, 'live')
})

test('status carries exactly the activity that is published, and is pushed on change only', async () => {
  const { ck, env, c, statuses } = setup()
  await c.setEnabled(true); await flush()
  c.set({ route: { tab: 'network' }, tweaks: 2 }); await ck.advance(5000)
  assert.deepEqual(c.status().activity, env.clients[0].sent.at(-1))
  const n = statuses.length
  c.set({ tweaks: 2 }); assert.equal(statuses.length, n)
  const off = setup(); assert.equal(off.c.status().activity, null); assert.equal(off.c.status().state, 'off')
})

test('a createClient that throws is survivable', async () => {
  const { ck, c, env } = setup({ createClient: () => { throw new Error('discord-rpc missing') } })
  await c.setEnabled(true); await flush()
  assert.equal(c.status().state, 'waiting'); assert.equal(c.status().reason, 'create-failed')
  await c.setEnabled(false)
  assert.equal(ck.pending(), 0); assert.equal(env.clients.length, 0)
})
