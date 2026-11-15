const test = require('node:test')
const assert = require('node:assert/strict')
const UG = require('../lib/updateguard')

function fake(start = 3, delayed = '', running = true) {
  const svc = { start, delayed, running, failSet: false, failRestore: false }
  const store = new Map()
  const snapshots = { load: k => store.get(k) || null, save: (k, v) => store.set(k, v), remove: k => store.delete(k) }
  const runPS = async script => {
    if (script.includes('JJWU')) return { ok: true, out: 'JJWU|' + svc.start + '|' + svc.delayed + '|' + (svc.running ? 'Running' : 'Stopped') }
    const m = /start= (disabled|auto|demand|delayed-auto)/.exec(script)
    if (m) {
      if (m[1] === 'disabled' && svc.failSet) return { ok: true, out: '' }
      if (m[1] !== 'disabled' && svc.failRestore) return { ok: true, out: '' }
      svc.start = { disabled: 4, demand: 3, auto: 2, 'delayed-auto': 2 }[m[1]]
      svc.delayed = m[1] === 'delayed-auto' ? 1 : ''
      if (m[1] === 'disabled') svc.running = false
      if (/Start-Service/.test(script)) svc.running = true
    }
    return { ok: true, out: '' }
  }
  return { svc, store, g: UG.create({ runPS, snapshots, setTimer: () => ({ unref() {} }), clearTimer: () => {} }) }
}

test('parseProbe reads start type, delayed flag and status', () => {
  assert.deepEqual(UG.parseProbe('JJWU|2|1|Running'), { mode: 'delayed', running: true })
  assert.deepEqual(UG.parseProbe('JJWU|3||Stopped'), { mode: 'manual', running: false })
  assert.equal(UG.parseProbe('garbage'), null)
  assert.equal(UG.parseProbe('JJWU|||'), null)
})

test('hold then release restores a delayed-auto service that was running', async () => {
  const { svc, g } = fake(2, 1, true)
  assert.equal((await g.hold()).state, 'holding')
  assert.equal(svc.start, 4)
  const r = await g.release()
  assert.equal(r.state, 'restored')
  assert.deepEqual([svc.start, svc.delayed, svc.running], [2, 1, true])
})

test('a stopped manual service is not started on restore', async () => {
  const { svc, g } = fake(3, '', false)
  await g.hold(); await g.release()
  assert.deepEqual([svc.start, svc.running], [3, false])
})

test('already disabled: nothing is changed and nothing is claimed', async () => {
  const { svc, store, g } = fake(4, '', false)
  const r = await g.hold()
  assert.equal(r.state, 'skipped')
  assert.equal(store.size, 0)
  assert.equal((await g.release()).state, 'idle')
  assert.equal(svc.start, 4)
})

test('a hold that does not stick is reported as failed and put back', async () => {
  const { svc, store, g } = fake(3, '', true)
  svc.failSet = true
  const r = await g.hold()
  assert.equal(r.ok, false)
  assert.equal(svc.start, 3)
  assert.equal(store.size, 0)
})

test('failed restore keeps the snapshot and says failed', async () => {
  const { svc, store, g } = fake(2, '', true)
  await g.hold()
  svc.failRestore = true
  const r = await g.release()
  assert.equal(r.ok, false); assert.equal(r.state, 'failed')
  assert.ok(store.get(UG.SNAP))
  svc.failRestore = false
  assert.equal((await g.release()).state, 'restored')
})

test('rapid hold/release storms never leave the service disabled', async () => {
  const { svc, g } = fake(2, '', true)
  await Promise.all([g.hold(), g.release(), g.hold(), g.release(), g.hold(), g.release()])
  assert.equal(svc.start, 2)
  assert.equal(g.pendingRestore(), false)
})

test('legacy snapshot is understood; legacy Disabled leaves the service alone', async () => {
  const a = fake(4, '', false)
  a.store.set(UG.SNAP, { prev: 'Automatic' })
  assert.equal((await a.g.release()).state, 'restored')
  assert.equal(a.svc.start, 2)
  const b = fake(4, '', false)
  b.store.set(UG.SNAP, { prev: 'Disabled' })
  assert.equal((await b.g.release()).prev, 'disabled')
  assert.equal(b.svc.start, 4)
})

test('release notes when Windows switched the service back on during the hold', async () => {
  const { svc, g } = fake(3, '', true)
  await g.hold()
  svc.start = 3
  const r = await g.release()
  assert.equal(r.reenabled, true)
})

test('pending updates: unreadable is null, never 0', async () => {
  const snaps = { load() {}, save() {}, remove() {} }
  const mk = out => UG.create({ runPS: async () => ({ ok: true, out }), snapshots: snaps })
  assert.deepEqual(await mk('JJPEND|3').pendingUpdates(), { count: 3 })
  assert.deepEqual(await mk('JJPEND|0').pendingUpdates(), { count: 0 })
  assert.equal((await mk('').pendingUpdates()).count, null)
  const bad = UG.create({ runPS: async () => { throw new Error('x') }, snapshots: snaps })
  assert.equal((await bad.pendingUpdates()).count, null)
})
