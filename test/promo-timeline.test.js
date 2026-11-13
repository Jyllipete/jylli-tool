// Release video (tools/promo): the cut list has to stay on the music grid, claim only what facts.json can source, and be retimable.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs'), path = require('path')
const dir = path.join(__dirname, '..', 'tools', 'promo')
const { build } = require(path.join(dir, 'timeline.js'))
const beats = require(path.join(dir, 'beats.json'))
const defs = require(path.join(dir, 'scenes.js')).scenes
const copy = require(path.join(dir, 'copy-fi.js'))
const tl = build(beats, defs)
const near = (a, b, eps) => Math.abs(a - b) <= eps

test('tempo map: 140 BPM from the analysed track, bar 0 at 0 s', () => {
  assert.ok(near(beats.bpm, 140, 0.05))
  assert.ok(near(beats.offset, 0, 0.005))
  assert.ok(near(beats.beat * beats.bpm, 60, 0.001))
})

test('scenes are contiguous (no gaps, no overlaps) and start on whole beats', () => {
  for (let i = 0; i < tl.scenes.length; i++) {
    const s = tl.scenes[i]
    assert.ok(Number.isInteger(s.a) && Number.isInteger(s.z), s.id + ' not on a beat')
    assert.ok(s.z > s.a, s.id + ' has no length')
    if (i) assert.strictEqual(s.a, tl.scenes[i - 1].z, `gap or overlap before ${s.id}`)
    assert.ok(near(s.start, beats.offset + s.a * beats.beat, 0.001))
  }
  assert.ok(tl.scenes.at(-1).end >= beats.duration, 'the timeline ends before the track does')
})

test('no cut closer than one beat; a scene with a headline lasts at least one bar', () => {
  for (const s of tl.scenes) {
    if (s.kind === 'black') continue
    assert.ok(s.beats >= 1, s.id + ' shorter than a beat')
    if (s.head) assert.ok(s.beats >= 4, `${s.id}: headline on screen for ${s.beats} beats`)
  }
})

test('flashes and hits only on the drops, and every drop gets one', () => {
  const drops = beats.drops.map(d => d.t)
  assert.strictEqual(drops.length, 3)
  for (const s of tl.scenes) if (s.flash || s.hit) assert.ok(drops.some(t => near(s.start, t, 0.01)), s.id + ' flashes off a drop')
  for (const t of drops) assert.ok(tl.scenes.some(s => s.flash && near(s.start, t, 0.01)), 'no flash on the drop at ' + t)
})

test('black frames sit on the silent beats before a drop, on the track end, or at the open', () => {
  const drops = beats.drops.map(d => d.t)
  for (const s of tl.scenes.filter(x => x.kind === 'black')) {
    const ok = near(s.start, 0, 0.001) || s.start >= beats.duration - 6 || drops.some(t => near(s.end, t, 0.01))
    assert.ok(ok, s.id + ' black frame is not on a silence')
  }
})

test('every headline, counter fact and still it mentions exists', () => {
  const facts = require(path.join(dir, 'facts.json'))
  const manifestFile = path.join(dir, 'shots', 'manifest.json')
  const manifest = fs.existsSync(manifestFile) ? require(manifestFile) : null   // shots/ is generated (npm run promo:shoot)
  for (const s of defs) {
    if (s.head) assert.ok(copy.t[s.head], 'no copy for ' + s.head)
    for (const c of s.counters || []) assert.ok(facts[c.fact] && facts[c.fact].source, `fact ${c.fact} has no source`)
    const ids = [s.shot, ...(s.side || []).map(x => x.shot), ...(s.wall || [])].filter(Boolean)
    if (manifest) for (const id of ids) assert.ok(manifest[id], `${s.id}: still ${id} is not in the manifest`)
  }
})

test('on-screen text only uses sourced numbers (no percentages or speed-ups in the copy)', () => {
  const all = JSON.stringify(copy)
  assert.ok(!/\d\s?%|nopeampi|x\d|kertaa/i.test(all), 'unsourced claim in copy-fi.js')
})

test('sampling: a scene fades in and out inside its own window, never more than two layers at once', () => {
  for (let t = 0; t < beats.duration; t += 0.05) {
    const st = tl.sample(t)
    assert.ok(st.scenes.length <= 2, `${st.scenes.length} layers at ${t.toFixed(2)} s`)
    for (const x of st.scenes) assert.ok(x.alpha >= 0 && x.alpha <= 1.0001)
  }
})

test('reduced motion: no camera, tilt, parallax offset or flash', () => {
  for (let t = 0; t < beats.duration; t += 0.37) {
    const st = tl.sample(t, { reduce: true })
    assert.strictEqual(st.flash, 0)
    assert.strictEqual(st.pulse, 0)
    for (const x of st.scenes) { assert.strictEqual(x.cam.z, 1); assert.strictEqual(x.cam.tiltX, 0); assert.strictEqual(x.cam.tiltY, 0); assert.strictEqual(x.cam.dx, 0); assert.strictEqual(x.cam.scale, 1) }
  }
})

test('camera moves land exactly on the beat they are keyed to', () => {
  for (const s of tl.scenes.filter(x => x.cam && x.cam.length > 1)) {
    for (const k of s.cam.slice(1)) {
      const c = tl.camera(s, k.b, {})
      const drift = 1 + Math.min(1, k.b / Math.max(1, s.beats)) * 0.035
      assert.ok(near(c.z, k.z * drift, 0.002), `${s.id}: zoom ${c.z} != ${k.z * drift} on beat ${k.b}`)
    }
  }
})

test('flash is 120 ms and only inside a drop scene', () => {
  const t0 = beats.drops[0].t
  assert.ok(tl.sample(t0 + 0.01).flash > 0.5)
  assert.strictEqual(tl.sample(t0 + 0.2).flash, 0)
  assert.strictEqual(tl.sample(t0 - 0.05).flash, 0)
})
