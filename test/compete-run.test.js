const test = require('node:test')
const assert = require('node:assert')
const Svc = require('../lib/compete')
const P = require('../lib/compete/plan')

function rig(over = {}) {
  const log = [], events = [], saved = {}
  let procs = []                    // "@@exe|path" lines currently running
  let alive = true
  const mk = id => async () => { log.push('apply:' + id); return { ok: true, detail: id } }
  const un = id => async () => { log.push('undo:' + id) }
  const deps = Object.assign({
    isPremium: () => true,
    resolveGame: id => id === 'steam:730' ? { id, name: 'CS2', install: 'D:\\Lib\\cs2', source: 'steam' } : null,
    listLines: async () => procs.slice(),
    lookup: async exe => ({ pid: 4242, name: exe.replace('.exe', ''), st: '1', cls: 'Normal' }),
    alive: async () => alive,
    launch: async spec => { log.push('launch:' + spec.url); procs = ['@@cs2.exe|D:\\Lib\\cs2\\bin\\cs2.exe'] },
    facts: async () => ({ form: 'desktop', activePlan: { guid: P.BALANCED, name: 'Balanced' }, highPerfAvailable: true, coreKinds: ['skip0'], logical: 16 }),
    apply: { priority: mk('priority'), eco: mk('eco'), power: mk('power'), standby: mk('standby'), cores: mk('cores'), shield: mk('shield'), services: mk('services'), tray: mk('tray') },
    undo: { priority: un('priority'), eco: un('eco'), power: un('power'), standby: un('standby'), cores: un('cores'), shield: un('shield'), services: un('services'), tray: un('tray') },
    store: { load: k => saved[k] || null, save: (k, v) => { saved[k] = v }, remove: k => { delete saved[k] } },
    emit: (c, p) => events.push([c, p]),
    prefs: { read: () => saved.prefs || {}, write: v => { saved.prefs = v } },
    pollMs: 5, waitMs: 400,
  }, over)
  return { deps, log, events, saved, kill: () => { alive = false }, svc: Svc.create(deps) }
}
const until = async (fn, ms = 1500) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('timeout'); await new Promise(r => setTimeout(r, 5)) } }

test('start launches, applies the plan, and undoes in reverse when the game closes', async () => {
  const r = rig()
  const res = await r.svc.start({ gameId: 'steam:730', opts: { standby: true } })
  assert.deepStrictEqual(res, { ok: true, state: 'waiting' })
  await until(() => r.svc.status().state === 'running')
  assert.deepStrictEqual(r.log, ['launch:steam://rungameid/730', 'apply:priority', 'apply:eco', 'apply:power', 'apply:standby'])
  assert.ok(r.saved['compete-active'])
  r.kill()
  await until(() => r.svc.status().state === 'idle')
  assert.deepStrictEqual(r.log.slice(5), ['undo:standby', 'undo:power', 'undo:eco', 'undo:priority'])
  assert.strictEqual(r.saved['compete-active'], undefined)
  const ended = r.events.find(e => e[0] === 'compete-ended')[1]
  assert.strictEqual(ended.why, 'game-closed'); assert.strictEqual(ended.applied, 4); assert.strictEqual(ended.reverted, 4)
  assert.strictEqual(r.saved.prefs.last, 'steam:730')
})

test('free account: premium steps are locked and never applied', async () => {
  const r = rig({ isPremium: () => false })
  await r.svc.start({ gameId: 'steam:730', opts: { shield: true, services: true, cores: 'skip0' } })
  await until(() => r.svc.status().state === 'running')
  assert.ok(!r.log.some(l => /shield|services|cores/.test(l)))
  assert.deepStrictEqual(r.svc.status().steps.filter(s => s.state === 'locked').map(s => s.id), ['cores', 'shield', 'services'])
  await r.svc.stop()
})

test('a step that fails is reported as skipped and not undone', async () => {
  const r = rig(); r.deps.apply.eco = async () => ({ ok: false, reason: 'denied' })
  await r.svc.start({ gameId: 'steam:730' })
  await until(() => r.svc.status().state === 'running')
  assert.strictEqual(r.svc.status().steps.find(s => s.id === 'eco').reason, 'denied')
  await r.svc.stop()
  assert.ok(!r.log.includes('undo:eco'))
})

test('Stop reverts at once; a second start while busy is refused; unknown ids are refused', async () => {
  const r = rig()
  assert.strictEqual((await r.svc.start({ gameId: 'nope' })).error, 'unknown-game')
  await r.svc.start({ gameId: 'steam:730' })
  assert.strictEqual((await r.svc.start({ gameId: 'steam:730' })).error, 'busy')
  await until(() => r.svc.status().state === 'running')
  const out = await r.svc.stop()
  assert.strictEqual(out.receipt.why, 'stopped')
  assert.strictEqual(r.svc.status().state, 'idle')
})

test('no game process within the wait: session ends cleanly with nothing applied', async () => {
  const r = rig({ launch: async () => {}, waitMs: 60 })
  await r.svc.start({ gameId: 'steam:730' })
  await until(() => r.svc.status().state === 'idle')
  assert.deepStrictEqual(r.log.filter(l => l.startsWith('apply')), [])
  assert.strictEqual(r.events.find(e => e[0] === 'compete-ended')[1].why, 'no-game-found')
})

test('recover() undoes every step after a crash and clears the marker', async () => {
  const r = rig()
  r.saved['compete-active'] = { batchId: 'compete-1', gameId: 'steam:730', name: 'CS2', exe: 'cs2.exe' }
  const out = await r.svc.recover()
  assert.strictEqual(out.recovered, true)
  assert.strictEqual(r.log.length, 8)
  assert.strictEqual(r.saved['compete-active'], undefined)
  assert.deepStrictEqual(await r.svc.recover(), { ok: true, recovered: false })
})
