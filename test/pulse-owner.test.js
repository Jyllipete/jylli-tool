const test = require('node:test')
const assert = require('node:assert/strict')
const Owner = require('../lib/pulse/owner')

const tick = () => new Promise(r => setImmediate(r))

function make(over = {}) {
  const log = [], notes = []
  let gate = null
  const o = Owner.create({
    activate: async (id, opts) => { log.push('start:' + id + ':' + opts.via); if (gate) await gate; return over.activate ? over.activate(id, opts) : { ok: true } },
    deactivate: async () => { log.push('stop'); return over.deactivate ? over.deactivate() : { ok: true } },
    notify: c => notes.push(c),
  })
  return { o, log, notes, hold: () => { let open; gate = new Promise(r => { open = () => { gate = null; r() } }); return open } }
}

test('start records who started the boost and stop clears it from any surface', async () => {
  const { o } = make()
  await o.start('apex', { auto: true })
  assert.deepEqual(o.state(), { preset: 'apex', via: 'auto' })
  assert.equal(o.autoPreset(), 'apex')
  await o.stop()
  assert.deepEqual(o.state(), { preset: null, via: null })
  assert.equal(o.autoPreset(), null)
  await o.start('apex')            // a later manual boost is never labelled as the game watcher's
  assert.equal(o.state().via, 'manual')
  assert.equal(o.autoPreset(), null)
})

test('a stop issued while a start is still applying runs after it', async () => {
  const { o, log, hold } = make()
  const open = hold()
  const s = o.start('apex', { auto: true })
  const st = o.stop()
  await tick()
  assert.deepEqual(log, ['start:apex:auto'])   // the stop has not started: the start is not finished
  open()
  await Promise.all([s, st])
  assert.deepEqual(log, ['start:apex:auto', 'stop'])
  assert.equal(o.state().preset, null)
})

test('a manual start over an automatic boost becomes manual', async () => {
  const { o, log, notes } = make()
  await o.start('apex', { auto: true })
  await o.start('apex')
  assert.deepEqual(log, ['start:apex:auto', 'start:apex:manual'])
  assert.equal(o.autoPreset(), null)
  const lastNote = notes[notes.length - 1]
  assert.equal(lastNote.via, 'manual'); assert.equal(lastNote.by, 'manual'); assert.equal(lastNote.action, 'start')
})

test('a failed start leaves nothing recorded; a throwing activate is a failed start', async () => {
  const a = make({ activate: () => ({ ok: false, error: 'nope' }) })
  assert.equal((await a.o.start('apex', { auto: true })).ok, false)
  assert.equal(a.o.state().preset, null)
  const b = make({ activate: () => { throw new Error('boom') } })
  const r = await b.o.start('apex')
  assert.equal(r.ok, false); assert.match(r.error, /boom/)
  assert.equal(b.o.state().preset, null)
})

test('the queue survives a failing operation', async () => {
  const { o, log } = make({ deactivate: () => { throw new Error('x') } })
  await o.start('apex')
  assert.equal((await o.stop()).ok, false)
  await o.start('cs2')
  assert.deepEqual(log, ['start:apex:manual', 'stop', 'start:cs2:manual'])
})

test('notify tells who acted and a throwing listener does not break the boost', async () => {
  const notes = []
  const o = Owner.create({ activate: async () => ({ ok: true }), deactivate: async () => ({ ok: true }), notify: c => { notes.push(c); throw new Error('listener') } })
  await o.start('apex', { auto: true })
  await o.stop({ auto: true })
  assert.deepEqual(notes.map(n => n.by + ':' + n.action), ['auto:start', 'auto:stop'])
  assert.equal(o.state().preset, null)
})

test('a refused start leaves an existing boost and its owner as they were', async () => {
  let cur = null
  const o = Owner.create({ activate: async (id) => { if (id === 'nope') return { ok: false }; cur = id; return { ok: true } }, deactivate: async () => { cur = null; return { ok: true } }, current: () => cur })
  await o.start('apex', { auto: true })
  assert.equal((await o.start('nope')).ok, false)
  assert.deepEqual(o.state(), { preset: 'apex', via: 'auto' })
})

test('opts such as the log function reach the engine', async () => {
  const seen = []
  const o = Owner.create({ activate: async (id, opts) => { seen.push(opts); return { ok: true } }, deactivate: async o2 => { seen.push(o2); return { ok: true } } })
  const send = () => {}
  await o.start('apex', { send, killBg: true }); await o.stop({ send })
  assert.equal(seen[0].send, send); assert.equal(seen[0].killBg, true); assert.equal(seen[1].send, send)
})
