'use strict'
const test = require('node:test')
const assert = require('node:assert')
const Pulse = require('../lib/pulse')

function make(over) {
  const sent = [], store = {}, debriefs = {}
  let t = 1000, prefs = null
  const alive = new Set([1, 2])
  const deps = {
    now: () => t,
    hub: { snapshot: () => ({ s: { 'cpu.load': [40, 100, 'os'], 'gpu0.load': [99, 100, 'nvidia'], 'cpu.temp.package': [null, null, null], 'gpu0.temp.core': [66, 100, 'nvidia'] } }) },
    send: (id, ch, p) => { if (!alive.has(id)) return false; sent.push({ id, ch, p }); return true },
    state: { read: () => prefs, write: v => { prefs = v } },
    sessions: { list: () => [{ id: 'aabbccddeeff', game: { id: 'valorant' }, startedAt: 1, durationSec: 60, summary: {} }], get: id => (id === 'aabbccddeeff' ? recorded() : null) },
    debriefs: { save: (id, d) => { debriefs[id] = d }, load: id => debriefs[id] || null, list: () => Object.values(debriefs) },
    activate: async ({ presetId, report }) => { report('timer', 'ok', '0.5 ms'); report('power', 'ok', 'High performance'); return { ok: true } },
    deactivate: async () => ({ ok: true }),
    baseline: () => ({ cpu: 10, gpu: 2, ram: 50, cpuTemp: 45 }),
    probe: async () => ({ cpuTemp: 50, ramPct: 40, topProc: null, updateActive: false, powerPlan: { name: 'High performance', high: true }, pendingReboot: false }),
    ...over,
  }
  const svc = Pulse.create(deps)
  return { svc, sent, alive, tick: ms => { t += ms }, debriefs, getPrefs: () => prefs }
}
function recorded() {
  const bins = new Array(60).fill(0).map(() => ({ fps: 120, maxMs: 9, frames: 120 })); bins[30] = { fps: 90, maxMs: 120, frames: 90 }
  return { id: 'aabbccddeeff', game: { id: 'valorant', name: 'Valorant' }, startedAt: 1000, durationSec: 60, bins, seconds: 60, series: { 'gpu0.load': new Array(60).fill(99) }, summary: { frames: 7000, avgFps: 118, low1Fps: 70, low01Fps: 40 } }
}
const feed = (svc, n, ms = 8) => { for (let i = 0; i < n; i++) svc.onFrame(ms) }

test('live: before any frame the limiter is idle, there are no fps numbers and the vitals still come through with their source', () => {
  const { svc } = make()
  const l = svc.live()
  assert.equal(l.fresh, false); assert.equal(l.fps, null); assert.equal(l.limiter.id, 'idle')
  assert.deepEqual(l.vitals['gpu0.load'], { v: 99, age: 100, src: 'nvidia' })
  assert.equal(l.vitals['cpu.temp.package'].v, null)
})

test('live: frames produce fps, columns and a limiter verdict from the hub', () => {
  const { svc } = make()
  feed(svc, 600)
  const l = svc.live()
  assert.equal(l.fresh, true)
  assert.equal(Math.round(l.fps.avg), 125)
  assert.equal(l.limiter.id, 'gpu')
  assert.ok(l.cols.length > 10)
  assert.equal(l.cols[0].length, 6)
})

test('live: frames older than 2.5 s no longer count (a paused game is not "125 fps")', () => {
  const { svc, tick } = make()
  feed(svc, 600); tick(3000)
  const l = svc.live()
  assert.equal(l.fresh, false); assert.equal(l.fps, null); assert.equal(l.limiter.id, 'idle')
})

test('subscribe: pushes live frames to every subscriber, drops a closed window, and stops the timer with none left', async () => {
  const { svc, sent, alive } = make()
  svc.subscribe(1); svc.subscribe(2)
  feed(svc, 100)
  svc.tick()
  assert.deepEqual(sent.filter(s => s.ch === 'pulse2-live').map(s => s.id).sort(), [1, 2])
  alive.delete(2); sent.length = 0
  svc.tick()
  assert.deepEqual(sent.map(s => s.id), [1]); assert.equal(svc.subscribers, 1)
  svc.unsubscribe(1)
  assert.equal(svc.subscribers, 0)
  svc.dispose()
})

test('boost: steps are reported live, every window sees the state, and a failed start leaves nothing active', async () => {
  const { svc, sent } = make()
  svc.subscribe(1); sent.length = 0
  const r = await svc.startBoost({ presetId: 'valorant', name: 'Valorant', killBg: true })
  assert.equal(r.ok, true); assert.equal(r.boost.active, true)
  assert.deepEqual(r.boost.steps.map(s => s.id), ['timer', 'power'])
  assert.ok(sent.some(s => s.p.type === 'boost-step'))
  assert.equal(sent.filter(s => s.p && s.p.type === 'state').pop().p.boost.active, true)
  await svc.stopBoost()
  assert.equal(svc.status().boost.active, false)
  svc.dispose()
  const bad = make({ activate: async () => ({ ok: false, error: 'Unknown preset' }) })
  const r2 = await bad.svc.startBoost({ presetId: 'nope' })
  assert.equal(r2.ok, false); assert.equal(bad.svc.status().boost.active, false)
  assert.equal((await bad.svc.startBoost({})).error, 'no-preset')
})

test('boost: started elsewhere (tray, Auto-Pulse) the service is told and broadcasts it once', () => {
  const { svc, sent } = make()
  svc.subscribe(1); sent.length = 0
  svc.syncBoost(true, 'apex', 'Apex Legends')
  assert.equal(svc.status().boost.active, true)
  assert.equal(sent.filter(s => s.p.type === 'state').length, 1)
  svc.syncBoost(false)
  assert.equal(svc.status().boost.active, false)
  svc.dispose()
})

test('session: game start clears the river, a mark lands on the frame clock, and the end builds and stores a debrief', async () => {
  const { svc, debriefs, sent } = make()
  feed(svc, 50)
  svc.gameStarted('valorant', 'Valorant')
  assert.equal(svc.live().cols.length, 0)
  feed(svc, 500)
  const m = svc.mark('stutter').mark
  assert.equal(m.sec, 4)
  svc.subscribe(1)
  await svc.startBoost({ presetId: 'valorant' })
  sent.length = 0
  const d = svc.gameEnded(recorded())
  assert.equal(d.id, 'aabbccddeeff'); assert.deepEqual(d.marks, [{ sec: 4, label: 'stutter' }])
  assert.ok(debriefs.aabbccddeeff)
  assert.equal(sent.find(s => s.p.type === 'game-end').p.debrief.id, 'aabbccddeeff')
  assert.equal(svc.gameEnded(null), null)
  svc.dispose()
})

test('sessions: the list carries each debrief\'s score and verdict, and an unknown id is an error', () => {
  const { svc } = make()
  svc.gameEnded(recorded())
  const s = svc.sessions().sessions[0]
  assert.equal(s.verdict, 'gpu-bound'); assert.ok(s.score > 0)
  assert.equal(svc.session('aabbccddeeff').debrief.id, 'aabbccddeeff')
  assert.equal(svc.session('000000000000').ok, false)
})

test('prefs: hotkeys must be real accelerators and may not collide', () => {
  const { svc } = make()
  assert.equal(svc.prefs().prefs.keys.hud, 'CommandOrControl+Alt+P')
  let p = svc.setPrefs({ keys: { hud: 'Ctrl+Shift+H', mark: 'rm -rf' } }).prefs
  assert.equal(p.keys.hud, 'Ctrl+Shift+H'); assert.equal(p.keys.mark, 'CommandOrControl+Alt+M')
  p = svc.setPrefs({ keys: { mark: 'Ctrl+Shift+H' } }).prefs
  assert.equal(p.keys.mark, 'CommandOrControl+Alt+M')
})

test('boost: begin resets the steps and takes a baseline, whichever surface started it', () => {
  const { svc } = make()
  svc.report('timer', 'ok'); svc.beginBoost('apex', 'Apex Legends')
  const b = svc.status().boost
  assert.deepEqual(b.steps, []); assert.equal(b.name, 'Apex Legends'); assert.equal(b.active, false)
})

test('prefs: only valid values are saved and the opacity is clamped', () => {
  const { svc, getPrefs } = make()
  assert.equal(svc.prefs().prefs.mode, 'cockpit')
  const p = svc.setPrefs({ mode: 'hud', pin: true, hud: { layout: 'full', corner: 'bl', opacity: 9 }, bounds: { x: 1.4, y: 2, width: 600, height: 700 } }).prefs
  assert.equal(p.mode, 'hud'); assert.equal(p.hud.layout, 'full'); assert.equal(p.hud.corner, 'bl'); assert.equal(p.hud.opacity, 1)
  assert.deepEqual(p.bounds, { x: 1, y: 2, width: 600, height: 700 })
  const q = svc.setPrefs({ mode: 'evil', pin: 'yes', hud: { layout: '../x', corner: 'zz', opacity: 0 }, bounds: { x: 1 } }).prefs
  assert.equal(q.mode, 'hud'); assert.equal(q.pin, true); assert.equal(q.hud.layout, 'full'); assert.equal(q.hud.opacity, 0.3)
  assert.ok(getPrefs())
})

test('preflight: a probe that throws is "not measured", not a crash', async () => {
  const { svc } = make({ probe: async () => { throw new Error('ps failed') } })
  const r = await svc.preflight()
  assert.equal(r.ok, true); assert.equal(r.state, 'unknown')
  assert.equal((await make().svc.preflight()).state, 'ok')
})

test('live: a hitch column is tagged with what the PC was doing at that moment, or unknown', () => {
  let t = 5000
  const { svc } = make({ now: () => t })
  const pad = n => { for (let i = 0; i < n; i++) svc.onFrame(10) }   // 25 frames of 10 ms = exactly one sealed column
  pad(200)
  svc.live()                                   // takes a vitals sample (GPU 99 %)
  t += 400; svc.onFrame(150); pad(60)
  const tagged = svc.live().cols.filter(c => c[5])
  assert.equal(tagged.length, 1); assert.equal(tagged[0][5], 'gpu-bound')
  pad(50)
  t += 20000; svc.onFrame(150); pad(60); t += 5000
  assert.ok(svc.live().cols.some(c => c[5] === 'unknown'))   // no sample within 2 s of that column
})
