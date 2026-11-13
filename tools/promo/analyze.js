// Tempo map for the release video: node tools/promo/analyze.js [--audio file] [--out beats.json]
// Decodes the track with ffmpeg-static, finds BPM + beat phase + downbeat, per-bar energy, sections and accents.
// The video timeline only refers to bars/beats/accents from beats.json, so a new track = re-run this and retime.
const { execFileSync } = require('child_process')
const fs = require('fs'), path = require('path')
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d }
const audio = path.resolve(arg('audio', path.join(__dirname, 'media', 'after-us.mp3')))
const out = path.resolve(arg('out', path.join(__dirname, 'beats.json')))

function decode(file) {
  const buf = execFileSync(require('ffmpeg-static'), ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', '44100', '-'], { maxBuffer: 1 << 30 })
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4))
}

function analyze(x, sr) {
  const hop = 512, win = 1024, fps = sr / hop, frames = Math.floor((x.length - win) / hop)
  const rms = new Float32Array(frames), low = new Float32Array(frames), flux = new Float32Array(frames)
  let lp = 0, pe = 0, pl = 0
  for (let f = 0; f < frames; f++) {
    let e = 0, le = 0; const s = f * hop
    for (let i = 0; i < win; i++) { const v = x[s + i]; e += v * v; lp += 0.02 * (v - lp); le += lp * lp }
    e = Math.sqrt(e / win); le = Math.sqrt(le / win)
    rms[f] = e; low[f] = le; flux[f] = Math.max(0, e - pe) + 2 * Math.max(0, le - pl); pe = e; pl = le
  }
  // coarse tempo by autocorrelation, then comb fit for exact bpm + phase
  let coarse = { s: -1, bpm: 120 }
  for (let bpm = 60; bpm <= 190; bpm += 0.25) {
    const lag = fps * 60 / bpm; let s = 0
    for (let f = 0; f + lag + 1 < frames; f++) { const i = Math.floor(f + lag), fr = f + lag - i; s += flux[f] * (flux[i] * (1 - fr) + flux[i + 1] * fr) }
    if (s > coarse.s) coarse = { s, bpm }
  }
  let best = { s: -1 }
  for (let bpm = coarse.bpm - 1.5; bpm <= coarse.bpm + 1.5; bpm += 0.01) {
    const p = fps * 60 / bpm
    for (let ph = 0; ph < p; ph += 0.5) {
      let s = 0
      for (let t = ph; t < frames - 1; t += p) { const i = Math.round(t); s += flux[i] + 0.5 * (flux[i - 1] || 0) + 0.5 * (flux[i + 1] || 0) }
      if (s > best.s) best = { s, bpm, ph }
    }
  }
  const bpm = Math.round(best.bpm * 100) / 100
  const beat = 60 / bpm, dur = x.length / sr
  const offsetRaw = best.ph / fps
  // low-band hits decide which beat of four is the downbeat
  const lf = new Float32Array(frames); for (let i = 1; i < frames; i++) lf[i] = Math.max(0, low[i] - low[i - 1])
  const ds = [0, 0, 0, 0]; let k = 0
  for (let t = offsetRaw; t < dur - 1; t += beat, k++) { const i = Math.round(t * fps); ds[k % 4] += lf[i] + (lf[i + 1] || 0) }
  const down = ds.indexOf(Math.max(...ds))
  let offset = offsetRaw + down * beat; if (offset >= 4 * beat) offset -= 4 * beat
  if (offset > 2 * beat) offset -= 4 * beat   // a downbeat just before 0 means bar 0 starts at that negative time
  if (Math.abs(offset) < 0.006) offset = 0
  const bar = 4 * beat, nBars = Math.ceil((dur - offset) / bar)
  // per-bar energy (0..1 of the loudest bar)
  const e = []; let maxE = 0
  for (let b = 0; b < nBars; b++) {
    const a = Math.max(0, Math.round((offset + b * bar) * fps)), z = Math.min(frames, Math.round((offset + (b + 1) * bar) * fps))
    let s = 0; for (let i = a; i < z; i++) s += rms[i]; const v = z > a ? s / (z - a) : 0; e.push(v); maxE = Math.max(maxE, v)
  }
  const energy = e.map(v => +(v / maxE).toFixed(3))
  // sections: a new section starts where the 2-bar mean steps by > 0.15 (min 4 bars apart); "drops" are the rising ones
  const m2 = b => ((energy[b] || 0) + (energy[b + 1] || 0)) / 2, p2 = b => ((energy[b - 1] || 0) + (energy[b - 2] !== undefined ? energy[b - 2] : energy[b - 1] || 0)) / 2
  const cuts = [0], rises = []
  for (let b = 2; b < nBars; b++) {
    const d = m2(b) - p2(b)
    if (Math.abs(d) > 0.15 && b - cuts[cuts.length - 1] >= 4) { cuts.push(b); if (d > 0) rises.push(b) }
  }
  const sections = cuts.map((b, i) => {
    const end = i + 1 < cuts.length ? cuts[i + 1] : nBars
    const slice = energy.slice(b, end), mean = slice.reduce((s, v) => s + v, 0) / slice.length
    return { startBar: b, bars: end - b, start: +(offset + b * bar).toFixed(3), energy: +mean.toFixed(3), kind: mean > 0.75 ? 'high' : mean > 0.45 ? 'mid' : 'low' }
  })
  // accents: beats whose following beat is much louder (+) or quieter (-) than the 4 beats before
  const beatsPer = Math.round(beat * fps), acc = []
  for (let n = 4; n < Math.floor((dur - offset) / beat); n++) {
    const i = Math.round((offset + n * beat) * fps); let pre = 0, c = 0, post = 0, c2 = 0
    for (let j = i - 4 * beatsPer; j < i - 2; j++) if (j >= 0) { pre += rms[j]; c++ }
    for (let j = i; j < i + beatsPer && j < frames; j++) { post += rms[j]; c2++ }
    if (c && c2) acc.push({ beat: n, t: +(offset + n * beat).toFixed(3), jump: (post / c2 - pre / c) / maxE })
  }
  const pick = (arr, sign, thr) => {
    const out = []
    for (const a of [...arr].sort((p, q) => sign * (q.jump - p.jump))) {
      if (sign * a.jump < thr) break
      if (!out.some(o => Math.abs(o.beat - a.beat) < 16)) out.push(a)   // at most one per 4 bars
    }
    return out.sort((p, q) => p.beat - q.beat).map(a => ({ beat: a.beat, bar: Math.floor(a.beat / 4), t: a.t, strength: +Math.abs(a.jump).toFixed(3) }))
  }
  let lastSound = 0; for (let i = frames - 1; i > 0; i--) if (rms[i] > 0.01) { lastSound = i / fps; break }
  return { audio: path.basename(audio), duration: +dur.toFixed(3), lastSound: +lastSound.toFixed(2), bpm, beat: +beat.toFixed(6), bar: +bar.toFixed(6), offset: +offset.toFixed(4), bars: nBars,
    downbeatScores: ds.map(v => +v.toFixed(2)), energy, sections, hits: pick(acc, 1, 0.1), silences: pick(acc, -1, 0.17), drops: energy.map((v, b) => b).filter(b => b > 0 && energy[b] > 0.85 && energy[b - 1] < 0.8 && energy[b - 1] > 0.02).map(b => ({ bar: b, t: +(offset + b * bar).toFixed(3) })) }
}

if (require.main === module) {
  const r = analyze(decode(audio), 44100)
  fs.writeFileSync(out, JSON.stringify(r, null, 1))
  console.log(`${r.bpm} BPM  offset ${r.offset}s  ${r.bars} bars  ${r.duration}s  sections ${r.sections.map(s => s.startBar).join(',')}`)
  console.log('hits  ', r.hits.map(h => h.t).join(' '))
  console.log('silences', r.silences.map(h => h.t).join(' '))
  console.log('drops ', r.drops.map(h => h.bar + '@' + h.t).join(' '))
}
module.exports = { analyze, decode }
