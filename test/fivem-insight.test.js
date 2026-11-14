'use strict'
// Pacing, console coach, route memory, Fit Check and present modes: pure rules plus the service wiring (synthetic data only).
const test = require('node:test')
const assert = require('node:assert/strict')
const Pace = require('../lib/fivem/pacing')
const Coach = require('../lib/fivem/coach')
const Hist = require('../lib/fivem/history')
const Fit = require('../lib/fivem/fit')
const Rec = require('../lib/session-recorder')
const Srv = require('../lib/fivem/server')
const EN = (() => { global.window = undefined; const L = {}; const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'lang', 'fivem-en.js'), 'utf8'); return src })()

const bin = (fps, maxMs) => ({ fps, maxMs, frames: Math.round(fps) })

test('pacing: small spikes sit between 25 ms and the 60 ms hitch floor; steady share is per second', () => {
  const bins = []
  for (let i = 0; i < 40; i++) bins.push(bin(100, 12))           // steady 10 ms frames
  bins[5] = bin(100, 35); bins[9] = bin(100, 45)                   // two small spikes
  bins[20] = bin(100, 120)                                         // a real hitch: not counted here
  const p = Pace.analyze(bins)
  assert.equal(p.smallSpikes, 2)
  assert.equal(p.medianMs, 10)
  assert.equal(p.consistencyPct, 93)                               // 37 of 40 seconds stayed within 2x the average
  assert.deepEqual(Pace.analyze([bin(60, 20)]), { seconds: 1, medianMs: null, smallSpikes: null, consistencyPct: null })
  assert.equal(Pace.analyze(null).smallSpikes, null)
})
test('pacing: present modes are sorted, grouped by kind and never invented', () => {
  const m = Pace.modes({ 'Hardware: Independent Flip': 90, 'Composed: Flip': 10, junk: 0 })
  assert.deepEqual(m.map(x => [x.mode, x.pct, x.kind]), [['Hardware: Independent Flip', 90, 'direct'], ['Composed: Flip', 10, 'composed']])
  assert.deepEqual(Pace.modes(null), []); assert.deepEqual(Pace.modes({}), [])
})
test('recorder: PresentMode counts are kept (max 8 kinds), NA ignored, absent when never reported', () => {
  const r = Rec.createRecorder()
  r.start({ gameId: 'fivem' })
  for (let i = 0; i < 200; i++) { r.onFrame(10); r.onPresentMode(i < 150 ? 'Hardware: Independent Flip' : 'Composed: Flip') }
  r.onPresentMode('NA'); r.onPresentMode('')
  const s = r.finish()
  assert.deepEqual(s.presentModes, { 'Hardware: Independent Flip': 150, 'Composed: Flip': 50 })
  const q = Rec.createRecorder(); q.start({ gameId: 'fivem' }); for (let i = 0; i < 200; i++) q.onFrame(10)
  assert.equal('presentModes' in q.finish(), false)
  const many = Rec.createRecorder(); many.start({ gameId: 'x' }); for (let i = 0; i < 12; i++) many.onPresentMode('mode' + i)
  for (let i = 0; i < 200; i++) many.onFrame(10)
  assert.equal(Object.keys(many.finish().presentModes).length, 8)
})

test('coach: commands come from measured causes only, one hitch is noise, the overlay tip always closes the list', () => {
  const h = c => ({ primary: c })
  assert.deepEqual(Coach.advise({ hitches: [h('vram-full')] }), [])
  const v = Coach.advise({ hitches: [h('vram-full'), h('vram-full')] })
  assert.deepEqual(v.map(x => x.id), ['vram', 'overlay'])
  assert.deepEqual(v[0].cmds.map(c => c.cmd), ['strmem true', 'str_maxVehicleTextureRes 512'])
  const s = Coach.advise({ hitches: [h('unknown'), h('unknown'), h('cpu-bound')] })
  assert.deepEqual(s.map(x => x.id), ['scripts', 'overlay'])
  assert.ok(s[0].cmds.some(c => c.cmd === 'profiler record 500'))
  assert.deepEqual(Coach.advise({ hitches: [h('thermal'), h('thermal')] }).map(x => x.id), ['overlay'])
  assert.deepEqual(Coach.advise(null), [])
})

test('route memory: short or measuring traces are not remembered; patterns need three runs', () => {
  const an = (id, rounds = 60, extra = {}) => ({ rounds, verdict: { id, seg: 'isp', ttl: 3 }, end: { got: 50, avg: 40, jitter: 3, lossPct: 5 }, tcp: { got: 0 }, ...extra })
  assert.equal(Hist.entryFrom(an('clean', 10), 1, 20), null)
  assert.equal(Hist.entryFrom(an('measuring'), 1, 20), null)
  const e = Hist.entryFrom(an('loss-isp'), 1000, 21)
  assert.equal(e.bucket, 'evening'); assert.equal(e.verdict, 'loss-isp'); assert.equal(e.loss, 5)
  assert.equal(Hist.bucketOf(0), 'night'); assert.equal(Hist.bucketOf(6), 'morning'); assert.equal(Hist.bucketOf(13), 'afternoon'); assert.equal(Hist.bucketOf(23), 'evening')
  let list = []; for (let i = 0; i < 60; i++) list = Hist.add(list, { verdict: 'clean', hour: 10, bucket: 'morning' })
  assert.equal(list.length, Hist.CAP)
  const few = Hist.pattern([{ verdict: 'loss-isp', seg: 'isp', hour: 20, bucket: 'evening' }, { verdict: 'clean', hour: 9, bucket: 'morning' }])
  assert.equal(few.enough, false); assert.equal(few.worst, null); assert.equal(few.repeat, null)
  const many = Hist.pattern([
    { verdict: 'loss-isp', seg: 'isp', hour: 20, bucket: 'evening' }, { verdict: 'loss-isp', seg: 'isp', hour: 21, bucket: 'evening' }, { verdict: 'clean', hour: 19, bucket: 'evening' },
    { verdict: 'clean', hour: 9, bucket: 'morning' }, { verdict: 'clean', hour: 10, bucket: 'morning' }])
  assert.equal(many.enough, true); assert.equal(many.badRuns, 2)
  assert.deepEqual(many.worst, { bucket: 'evening', n: 3, bad: 2 })
  assert.deepEqual(many.repeat, { verdict: 'loss-isp', seg: 'isp', count: 2 })
})

test('fit: nothing is flagged for an unreported field; each finding names the facts behind it', () => {
  const base = { installed: true, builds: [3258], mods: [], tcp: Fit.tcpStats([30, 31, 29, 30, 32, 30]), server: { reachable: true } }
  assert.deepEqual(Fit.evaluate(base), { items: [], ok: true })
  const r = Fit.evaluate({ ...base, server: { reachable: true, build: 3407, pure: 1, resources: 420 }, mods: [{ id: 'reshade', sev: 'low' }, { id: 'menyoo', sev: 'high' }] })
  assert.deepEqual(r.items.map(i => i.id).sort(), ['build', 'mods-high', 'pure-mods', 'resources'])
  assert.equal(r.items.find(i => i.id === 'build').vars.build, 3407)
  assert.equal(r.ok, false)                                          // mods-high is a warning
  assert.equal(Fit.evaluate({ ...base, server: { reachable: true, build: 3258 } }).items.length, 0)   // the build is already on disk
  assert.equal(Fit.evaluate({ ...base, server: { reachable: true, pure: 0 }, mods: [{ id: 'reshade' }] }).items.length, 0)  // pure off: nothing to warn about
  assert.deepEqual(Fit.evaluate({ ...base, server: { reachable: false } }).items.map(i => i.id), ['unreachable'])
  assert.deepEqual(Fit.evaluate({ ...base, server: { reachable: true, hidden: true } }).items.map(i => i.id), ['hidden'])
  assert.equal(Fit.evaluate({ ...base, server: null }).items[0].id, 'unreachable')
  const lossy = Fit.evaluate({ ...base, tcp: Fit.tcpStats([30, null, 30, null, 30, 30]) })
  assert.ok(lossy.items.some(i => i.id === 'loss' && i.sev === 'bad'))
  assert.ok(Fit.evaluate({ ...base, tcp: Fit.tcpStats([null, null, null]) }).items.some(i => i.id === 'no-connect'))
  assert.ok(Fit.evaluate({ ...base, tcp: Fit.tcpStats([200, 210, 190, 205]) }).items.some(i => i.id === 'far'))
})
test('fit: tcp stats are measured values and null when nothing answered', () => {
  assert.deepEqual(Fit.tcpStats([10, 20, null, 30]), { n: 4, got: 3, lossPct: 25, avg: 20, jitter: 10 })
  assert.deepEqual(Fit.tcpStats([null, null]), { n: 2, got: 0, lossPct: 100, avg: null, jitter: null })
  assert.deepEqual(Fit.tcpStats([]), { n: 0, got: 0, lossPct: null, avg: null, jitter: null })
})

test('server: a server that answers every info request with nothing but accepts connections is "hidden", not offline', async () => {
  const dead = { getJson: async () => ({ ok: false }), tcp: async () => 28 }
  const r = await Srv.readServer(dead, 'x.example', 30120)
  assert.equal(r.ok, true); assert.equal(r.hidden, true); assert.equal(r.players, null)
  const off = await Srv.readServer({ getJson: async () => ({ ok: false }), tcp: async () => null }, 'x.example', 30120)
  assert.deepEqual(off, { ok: false, error: 'no-answer' })
  const open = await Srv.readServer({ getJson: async u => (/info\.json/.test(u) ? { ok: true, ms: 5, data: { vars: { sv_enforceGameBuild: '3407', sv_pureLevel: '1' }, resources: ['a', 'b', 'c'] } } : { ok: true, ms: 4, data: { clients: 3, sv_maxclients: 32 } }), tcp: async () => 1 }, 'x.example', 30120)
  assert.equal(open.build, 3407); assert.equal(open.pure, 1); assert.equal(open.resources, 3); assert.equal(open.hidden, undefined)
})

test('lang: every key the new views build exists in English and Finnish', () => {
  const FI = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'lang', 'fivem-fi.js'), 'utf8')
  const need = ['fitRun', 'fitBusy', 'fitFail', 'fitT', 'fitOk', 'fitNote', 'histT', 'histRuns', 'histWorst', 'histRepeat', 'histFew', 'ss_spikes', 'ss_steady', 'modesT', 'modesNote', 'modesComposed', 'coachT', 'coachNote', 'devTag', 'copy', 'copied', 'copyFail', 'infoHidden', 'tPaused', 'lPaused', 'aerr_owned-elsewhere']
  for (const id of ['not-installed', 'enhanced', 'unreachable', 'hidden', 'build', 'pure-mods', 'resources', 'no-connect', 'loss', 'jitter', 'far', 'mods-high']) need.push('ft_' + id, 'fw_' + id)
  for (const id of ['vram', 'ram', 'scripts', 'overlay']) need.push('co_' + id, 'cw_' + id)
  for (const b of Hist.BUCKETS) need.push('hb_' + b)
  for (const k of need) { assert.ok(EN.includes(JSON.stringify(k)) || EN.includes(k + ':') || EN.includes("'" + k + "'"), 'en ' + k); assert.ok(FI.includes(JSON.stringify(k)) || FI.includes(k + ':') || FI.includes("'" + k + "'"), 'fi ' + k) }
})

test('passport: medians of tagged sessions against everything else; nothing is compared on too little data', () => {
  const Pass = require('../lib/fivem/passport')
  const row = (avg, low1, server, dur = 600) => ({ durationSec: dur, summary: { avgFps: avg, low1Fps: low1 }, server })
  const here = { host: 'a.example', port: 30120 }, other = { host: 'b.example', port: 30120 }
  assert.equal(Pass.build([row(100, 60, other)], here), null)                       // nothing recorded on this server yet
  assert.equal(Pass.build(null, here), null)
  const rows = [row(100, 60, here), row(120, 70, here), row(500, 300, here, 30), row(140, 90, other), row(160, 100, null), row(150, 95, other)]
  const p = Pass.build(rows, here)
  assert.deepEqual(p.here, { n: 2, minutes: 20, avg: 110, low1: 65 })               // the 30 s session is ignored
  assert.equal(p.elsewhere.n, 3); assert.equal(p.elsewhere.avg, 150)
  assert.equal(p.enough, true); assert.equal(p.deltaPct, -27)
  const few = Pass.build([row(100, 60, here), row(150, 95, other)], here)
  assert.equal(few.enough, false); assert.equal(few.deltaPct, null)
  assert.equal(Pass.build([row(100, 60, here), row(100, 60, here)], here).elsewhere, null)
})
