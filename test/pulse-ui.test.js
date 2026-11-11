'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.join(__dirname, '..')
const LANG = { en: {}, fi: {} }
const ctx = { LANG }; ctx.globalThis = ctx
for (const f of ['pulse-en.js', 'pulse-fi.js']) vm.runInNewContext(fs.readFileSync(path.join(root, 'js', 'lang', f), 'utf8'), ctx)
const EN = LANG.en.pulse2, FI = LANG.fi.pulse2

const UI = require('../js/pulse/ui')
const View = require('../js/pulse/river-view')
const Hud = require('../js/pulse/hud')
const Page = require('../js/pulse/page')
const Attr = require('../lib/pulse/attribution')
const Steps = require('../lib/pulse/steps')
const Pre = require('../lib/pulse/preflight')
const Lim = require('../lib/pulse/limiter')

const ph = s => (String(s).match(/\{\w+\}/g) || []).sort().join(',')
const TE = (k, v) => { const s = EN[k]; assert.ok(s != null, 'missing en key ' + k); return v ? s.replace(/\{(\w+)\}/g, (m, n) => (v[n] == null ? m : v[n])) : s }

// ── copy ─────────────────────────────────────────────────────────────────────────
test('lang: EN and FI have the same keys, the same placeholders and no empty strings', () => {
  assert.deepEqual(Object.keys(EN).sort(), Object.keys(FI).sort())
  for (const k of Object.keys(EN)) { assert.equal(ph(EN[k]), ph(FI[k]), k); assert.ok(String(EN[k]).trim() && String(FI[k]).trim(), 'empty ' + k) }
})
test('lang: Finnish is not a copy of English (except names that stay as they are)', () => {
  const same = Object.keys(EN).filter(k => EN[k] === FI[k])
  const names = /^(hud|vt_cpu|vt_gpu|vt_vram|vt_ram|srcNvidia|srcOs|srcPulse|hud_cpu|hud_gpu|hud_vram|fps_|ck_name|keyHud|pf_updates)/
  for (const k of same) assert.ok(names.test(k) || /^[A-Z0-9 /%.°-]+$/.test(EN[k]), 'untranslated: ' + k)
})
test('lang: every literal key the Pulse code asks for exists', () => {
  const missing = []
  for (const f of ['ui.js', 'page.js', 'cockpit.js', 'hud.js']) {
    const src = fs.readFileSync(path.join(root, 'js', 'pulse', f), 'utf8')
    for (const m of src.matchAll(/\bT\('([A-Za-z0-9_]+)'(?!\s*\+)/g)) if (EN[m[1]] == null) missing.push(f + ':' + m[1])
  }
  assert.deepEqual(missing, [])
})
test('lang: dynamic keys have copy for every id they can be built from', () => {
  const need = []
  for (const id of ['idle', 'thermal', 'vram', 'ram', 'background', 'gpu', 'cpu', 'clock', 'capped', 'balanced']) need.push('lim_' + id, 'limw_' + id)
  for (const id of ['thermal', 'vram', 'ram', 'background', 'gpu', 'cpu', 'clock', 'capped', 'balanced']) need.push('hud_lim_' + id)
  for (const id of Steps.IDS) need.push('step_' + id)
  for (const s of ['ok', 'fail', 'run', 'skip', 'idle']) need.push('stepState_' + s)
  for (const c of [...Attr.CAUSES, 'unknown']) need.push('cause_' + c)
  for (const t of ['thermal', 'gameshield', 'boost']) need.push('sug_' + t)
  for (const t of ['gameshield', 'updateguard', 'boost']) need.push('pfFix_' + t)
  for (const id of ['cpu', 'gpu', 'ram', 'cpuTemp']) need.push('ba_' + id)
  for (const id of ['smooth', 'stable', 'thermal', 'boost']) need.push('part_' + id)
  for (const id of ['avg', 'low1', 'low01', 'p99', 'smooth']) need.push('tip_' + id, 'fps_' + id)
  for (const id of ['cpu', 'gpu', 'gpuClock', 'vram', 'ram', 'net']) need.push('vt_' + id)
  for (const s of ['none', 'light', 'moderate', 'heavy']) need.push('ck_sev_' + s)
  for (const s of ['thermal', 'powerLimit', 'vrm', 'coreImbalance']) need.push('ck_cause_' + s)
  for (const s of ['thermalPaste', 'airflow', 'fanCurve']) need.push('ck_rec_' + s)
  for (const s of ['minimal', 'standard', 'full']) need.push('layout_' + s)
  for (const s of ['tl', 'tr', 'bl', 'br']) need.push('corner_' + s)
  assert.deepEqual(need.filter(k => EN[k] == null), [])
})
test('lang: every pre-flight check has copy for every state it can return', () => {
  const probes = [null, { cpuTemp: 50, ramPct: 40, topProc: { name: 'x', cpu: 3 }, updateActive: false, powerPlan: { name: 'High', high: true }, pendingReboot: false },
    { cpuTemp: 80, ramPct: 75, topProc: { name: 'x', cpu: 25 }, updateActive: true, powerPlan: { name: 'Balanced', high: false }, pendingReboot: true },
    { cpuTemp: 96, ramPct: 90, topProc: { name: 'x', cpu: 50 } }]
  for (const p of probes) for (const i of Pre.evaluate(p).items) {
    assert.ok(EN['pf_' + i.id] != null, 'pf_' + i.id)
    assert.ok(EN['pfw_' + i.id + '_' + i.state] != null, `pfw_${i.id}_${i.state}`)
    if (i.fix) assert.ok(EN['pfFix_' + (i.fix.target || i.fix.kind)] != null)
  }
})

// ── builders ─────────────────────────────────────────────────────────────────────
test('ui: a limiter sentence never says null or undefined, whatever was not measured', () => {
  for (const id of ['thermal', 'vram', 'ram', 'background', 'gpu', 'cpu', 'clock', 'capped', 'balanced', 'idle']) {
    const html = UI.limiterHtml({ id, tone: 'ok', evidence: { cpuTemp: null, gpuTemp: 70, usedMB: null, totalMB: null, ram: null, bg: null, gpu: null, cpu: null, mhz: null, baseMhz: null, capHz: null }, suggest: { kind: 'none' } }, TE)
    assert.ok(!/null|undefined|NaN/.test(html), id + ': ' + html)
  }
  assert.ok(UI.limiterHtml(null, TE).includes('Waiting for frames'))
})
test('ui: not-measured vitals are dashes with a title, never zero; stale values are marked', () => {
  const host = { qs: {}, querySelector(sel) { const k = /"(\w+)"/.exec(sel)[1]; return this.qs[k] || (this.qs[k] = mk(k)) } }
  function mk() { const parts = { b: { textContent: '', title: '' }, '.pu-src': { textContent: '' }, '.pu-tile-s': { textContent: '' } }; return { dataset: {}, querySelector: s => parts[s] || parts.b } }
  UI.paintVitals(host, { 'cpu.load': { v: 41.6, age: 100, src: 'os' }, 'gpu0.load': { v: null, age: null, src: null }, 'ram.load': { v: 60, age: 9000, src: 'os' }, 'cpu.temp.package': { v: 70, age: 100, src: 'sensor' } }, TE)
  assert.equal(host.qs.cpu.dataset.state, 'ok'); assert.equal(host.qs.cpu.querySelector('b').textContent, '42')
  assert.equal(host.qs.cpu.querySelector('.pu-tile-s').textContent, '70 °C')
  assert.equal(host.qs.gpu.dataset.state, 'na'); assert.equal(host.qs.gpu.querySelector('b').textContent, UI.DASH)
  assert.equal(host.qs.ram.dataset.state, 'stale')
})
test('ui: fps cells show a dash, not 0, without frames', () => {
  const html = UI.fpsStrip(null, TE)
  assert.ok(html.includes('data-na="1"') && !/>0</.test(html))
  assert.ok(UI.fpsStrip({ avg: 119.6, low1: 80, low01: 50, p99Ms: 12.34, smooth: 88 }, TE).includes('120'))
})
test('ui: every string that reaches the page is escaped', () => {
  const evil = '<img src=x onerror=alert(1)>'
  const rows = UI.sessionsHtml([{ id: 'aabbccddeeff', game: { name: evil }, startedAt: Date.now(), durationSec: 60, summary: { avgFps: 100 }, score: 800, verdict: 'clean', ribbon: [] }], TE)
  assert.ok(!rows.includes('<img'))
  const pf = UI.preflightHtml({ items: [{ id: 'background', state: 'warn', evidence: { name: evil, cpu: 30 }, fix: null }] }, TE)
  assert.ok(!pf.includes('<img'))
  assert.ok(!UI.receiptHtml({ active: true, steps: [{ id: 'timer', state: 'ok', detail: evil }] }, TE).includes('<img'))
})
test('ui: the boost receipt always lists all eight steps in order', () => {
  const html = UI.receiptHtml({ active: true, steps: [{ id: 'power', state: 'ok' }] }, TE)
  assert.equal((html.match(/<li /g) || []).length, 8)
  assert.ok(html.indexOf('Timer resolution') < html.indexOf('Power plan'))
  assert.ok(UI.receiptHtml(null, TE).includes('data-state="idle"'))
})
test('ui: a debrief renders from a real build, with and without the optional parts', () => {
  const Sess = require('../lib/pulse/session')
  const bins = new Array(60).fill(0).map(() => ({ fps: 120, maxMs: 9, frames: 120 })); bins[30] = { fps: 90, maxMs: 120, frames: 90 }
  const s = { id: 'aabbccddeeff', game: { id: 'valorant', name: 'Valorant' }, startedAt: 1, durationSec: 60, bins, seconds: 60, series: { 'gpu0.load': new Array(60).fill(99) }, summary: { frames: 7000, avgFps: 118, low1Fps: 70, low01Fps: 40 } }
  const full = UI.debriefHtml(Sess.build({ session: s, boost: { steps: [{ id: 'a', state: 'ok' }], baseline: { cpu: 10, gpu: 5, ram: 50, cpuTemp: 40 } }, marks: [{ sec: 30, label: 'x' }], previous: null }), TE)
  assert.ok(full.includes('GPU at its limit') && full.includes('Before and after the boost') && full.includes('Your marks'))
  const bare = UI.debriefHtml(Sess.build({ session: s, boost: null, marks: [], previous: null }), TE)
  assert.ok(!bare.includes('Before and after') && !/null|undefined|NaN/.test(bare))
})
test('ui: the hitch log lists the newest hitches first, with their cause, and says so when there are none', () => {
  const cols = [[0, 8, 7, 9, 30, null], [250, 8, 7, 90, 30, 'thermal'], [500, 8, 7, 9, 30, null], [750, 8, 7, 140, 30, 'unknown'], [1000, 8, 7, 9, 30, null]]
  const log = UI.hitLog({ cols }, 5)
  assert.deepEqual(log, [{ ago: 0.25 * 1, ms: 140, cause: 'unknown' }, { ago: 0.25 * 3, ms: 90, cause: 'thermal' }].map(r => ({ ...r, ago: Math.round(r.ago) })))
  assert.ok(UI.hitLogHtml({ cols }, TE).includes('Heat'))
  assert.ok(UI.hitLogHtml({ cols: [] }, TE).includes('No hitches in the last minute'))
  assert.equal(UI.hitLog({ cols: new Array(40).fill([0, 8, 7, 90, 30, 'gpu-bound']) }, 5).length, 5)
})
test('ui: the session list says what to do when empty', () => assert.ok(UI.sessionsHtml([], TE).includes('No sessions yet')))
test('ui: ribbon path breaks at a gap and needs two points', () => {
  assert.equal(UI.ribbonPath([{ fps: 60 }], 100, 20), '')
  assert.equal((UI.ribbonPath([{ fps: 60 }, { fps: 70 }, { fps: null }, { fps: 65 }, { fps: 66 }], 100, 20).match(/M/g) || []).length, 2)
})
test('ui: clock and time-ago formats', () => {
  assert.equal(UI.clock(65), '1:05'); assert.equal(UI.clock(3725), '1:02:05'); assert.equal(UI.clock(-4), '0:00')
  assert.equal(UI.when(Date.now(), TE), 'just now'); assert.equal(UI.when(Date.now() - 3 * 3600e3, TE), '3 h ago')
})

// ── river view helpers, HUD, page ────────────────────────────────────────────────
test('river view: live columns and marks line up, and a mark far from any column is dropped', () => {
  const live = { cols: [[0, 8, 7, 9, 30, null], [250, 8, 7, 90, 30, 'gpu-bound'], [500, 8, 7, 9, 30, null]], marks: [{ sec: 0.25, label: 'a' }, { sec: 40, label: 'far' }] }
  const r = View.fromLive(live)
  assert.equal(r.cols[1].cause, 'gpu-bound'); assert.deepEqual(r.marks, [{ i: 1, label: 'a' }])
  assert.deepEqual(View.fromLive(null), { cols: [], marks: [] })
})
test('river view: a debrief ribbon keeps its hitch cause and places marks by second', () => {
  const deb = { durationSec: 120, ribbon: new Array(60).fill({ fps: 100, maxMs: 12 }), hitches: [{ startSec: 60, endSec: 60, worstMs: 140, primary: 'thermal' }], marks: [{ sec: 30, label: 'x' }] }
  const r = View.fromDebrief(deb)
  assert.equal(r.cols.length, 60); assert.equal(r.cols[30].cause, 'thermal'); assert.equal(r.cols[30].hi, 140); assert.equal(r.marks[0].i, 15)
})
test('hud: prints only what was measured', () => {
  assert.deepEqual(Hud.read(null), { fps: null, low1: null, lim: null, tone: 'idle', cpu: null, cpuT: null, gpu: null, gpuT: null })
  const r = Hud.read({ fresh: true, fps: { avg: 143.6, low1: 99.2 }, limiter: { id: 'gpu', tone: 'ok' }, vitals: { 'cpu.load': { v: 41.2 }, 'gpu0.temp.core': { v: 66 }, 'gpu0.load': { v: null } } })
  assert.equal(r.fps, 144); assert.equal(r.low1, 99); assert.equal(r.lim, 'gpu'); assert.equal(r.cpu, 41); assert.equal(r.gpuT, 66); assert.equal(r.gpu, null)
})
test('page: the primary action follows the boost state and never offers a boost with no game', () => {
  assert.deepEqual(Page.ctaState({ active: false }, '', false), { key: 'ctaChoose', disabled: true, icon: 'bolt' })
  assert.equal(Page.ctaState({ active: false }, 'Valorant', false).vars.game, 'Valorant')
  assert.equal(Page.ctaState({ active: true }, 'Valorant', false).key, 'ctaEnd')
  assert.equal(Page.ctaState({ active: false }, 'Valorant', true).disabled, true)
  assert.equal(Page.VIEWS.length, 4)
})

// ── source and css hygiene (the rules tools/check-ui.js enforces for the other 2.0 tabs) ─────
test('source: no hex colours or colour inline styles in the Pulse code', () => {
  for (const f of fs.readdirSync(path.join(root, 'js', 'pulse'))) {
    const s = fs.readFileSync(path.join(root, 'js', 'pulse', f), 'utf8')
    assert.ok(!/#[0-9a-f]{3,8}\b/i.test(s.replace(/&#39;/g, '')), f + ' hex colour')
    assert.ok(!/style="[^"]*(color|background|border|box-shadow|fill|stroke)\s*:/i.test(s), f + ' inline colour')
  }
})
test('css: tokens only, no hex, no tiny text, line-clamp untouched', () => {
  for (const f of ['pulse.css', 'pulse-hud.css']) {
    const css = fs.readFileSync(path.join(root, 'css', f), 'utf8')
    assert.ok(!/#[0-9a-f]{3,8}\b/i.test(css), f + ' hex colour')
    for (const m of css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) assert.ok(Number(m[1]) >= 11, f + ' font-size ' + m[1])
    assert.ok(!/line-clamp/.test(css))
  }
})
test('windows: the Cockpit and the HUD load every script they use, in order, and keep a strict CSP', () => {
  for (const [f, need] of [['pulse.html', ['lib/pulse/attribution.js', 'lib/pulse/frames.js', 'lib/pulse/river.js', 'js/pulse/ui.js', 'js/pulse/river-view.js', 'js/pulse/cockpit.js']], ['pulse-hud.html', ['lib/pulse/attribution.js', 'lib/pulse/frames.js', 'lib/pulse/river.js', 'js/pulse/river-view.js', 'js/pulse/hud.js']]]) {
    const html = fs.readFileSync(path.join(root, f), 'utf8')
    let last = -1
    for (const s of need) { const i = html.indexOf(`src="${s}"`); assert.ok(i > last, f + ' order ' + s); last = i; assert.ok(fs.existsSync(path.join(root, s)), s) }
    assert.ok(/script-src 'self';/.test(html) && !/<script>/.test(html), f + ' csp')
  }
})
