const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const P = require('../js/cpumem/pure')
const topology = require('../lib/cpumem/topology')
const memory = require('../lib/cpumem/memory')
const findings = require('../lib/cpumem/findings')

const root = path.join(__dirname, '..')
const read = f => fs.readFileSync(path.join(root, f), 'utf8')
const LANG = vm.runInNewContext(['js/lang/en.js', 'js/lang/fi.js', 'js/lang/network-en.js', 'js/lang/network-fi.js', 'js/lang/cpumem-en.js', 'js/lang/cpumem-fi.js'].map(read).concat(';LANG').join('\n'), {})

const m = (from, n) => String(((1n << BigInt(n)) - 1n) << BigInt(from))
const topo = topology.build({ topo: [...Array.from({ length: 4 }, (_, i) => `C|0|0|${m(i * 2, 2)}`), `L|3|${96 * 1024}|0|${m(0, 8)}`] }, { x3d: true })

test('pure: the die model puts the latest numbers on the right cores and marks a previewed plan', () => {
  const frame = { cpu: { total: { util: 50, mhz: 4000 }, cores: [{ n: 0, util: 80, mhz: 4500, parked: false }, { n: 1, util: 10, mhz: 3000, parked: false }, { n: 2, util: 0, mhz: 800, parked: true }, { n: 3, util: 0, mhz: 800, parked: true }] } }
  const d = P.dieModel(topo, frame, [0, 1])
  assert.strictEqual(d.groups.length, 1); assert.ok(d.groups[0].vcache); const [c0, c1] = d.groups[0].cores
  assert.deepStrictEqual([c0.util, c0.mhz, c0.parked, c0.keep], [80, 3750, false, true]); assert.deepStrictEqual([c1.parked, c1.keep], [true, false]); assert.strictEqual(d.groups[0].parked, 1)
  const none = P.dieModel(topo, null, null); assert.ok(none.groups[0].cores.every(c => c.util === null && c.keep === null))
  assert.strictEqual(P.dieModel({ ok: false }, null), null)
})
test('pure: package readout, formats and load tones', () => {
  assert.deepStrictEqual(P.packageRead({ cpu: { total: { util: 49.6, mhz: 3000 }, parkedCount: 2 } }, 2400), { util: 50, mhz: 3000, ratio: 1.3, parked: 2 }); assert.strictEqual(P.packageRead(null, 2400).util, null)
  assert.deepStrictEqual([P.fmtMB(640), P.fmtMB(6246), P.fmtMB(null), P.fmtGHz(4620), P.fmtGHz(0), P.pct(null)], ['640 MB', '6.1 GB', '–', '4.62', '–', '–'])
  assert.deepStrictEqual([null, 10, 50, 80, 99].map(P.loadTone), ['idle', 'idle', 'ok', 'warn', 'bad'])
})
test('pure: the verdict is the worst finding, then drift, then open switches, then clean', () => {
  const model = { drifted: [], recommendedIds: [] }
  assert.strictEqual(P.stageVerdict(null, []).kind, 'unread'); assert.strictEqual(P.stageVerdict(model, []).kind, 'clean'); assert.strictEqual(P.stageVerdict(model, [], true).kind, 'paused')
  assert.strictEqual(P.stageVerdict({ ...model, recommendedIds: ['a'] }, []).kind, 'open')
  assert.strictEqual(P.stageVerdict({ ...model, drifted: ['a'], recommendedIds: ['b'] }, []).kind, 'drift')
  const warn = { id: 'power-saver', tone: 'warn', vars: {} }, bad = { id: 'thermal', tone: 'bad', vars: { c: 97.4 } }
  assert.deepStrictEqual(P.stageVerdict({ ...model, drifted: ['a'] }, [warn, bad]), { kind: 'finding', id: 'thermal', tone: 'danger', vars: { c: 97.4 } })
  assert.strictEqual(P.stageVerdict({ ...model, drifted: ['a'] }, [warn]).kind, 'drift'); assert.strictEqual(P.stageVerdict(model, [warn]).tone, 'warn')
})
test('pure: finding actions map to what the page does', () => {
  assert.deepStrictEqual(P.actionOf({ action: { kind: 'bios' } }), { kind: 'tab', tab: 'bios', label: 'actBios' }); assert.strictEqual(P.actionOf({ action: { kind: 'reveal', id: 'x' } }).id, 'x')
  assert.strictEqual(P.actionOf({ action: null }), null); assert.strictEqual(P.actionOf({ action: { kind: 'nope' } }), null)
})
test('the browser pages load without a DOM and expose their API', () => {
  for (const f of ['page', 'lab', 'die-view', 'mem-view']) assert.ok(require('../js/cpumem/' + f))
  assert.strictEqual(typeof require('../js/cpumem/page').mount, 'function'); assert.strictEqual(typeof require('../js/cpumem/lab').mount, 'function')
})
test('the renderer copy of the strata maths is the one tested in lib/cpumem', () => { assert.strictEqual(typeof memory.strata, 'function'); assert.ok(read('js/cpumem/page.js').includes('JylliCpuMemMemory.strata')) })

// ── language ──
const en = LANG.en.cpumem2, fi = LANG.fi.cpumem2, net = LANG.en.net2
test('language: English and Finnish have exactly the same keys, none empty', () => {
  assert.deepStrictEqual(Object.keys(en).sort(), Object.keys(fi).sort())
  for (const [k, v] of Object.entries(en)) assert.ok(String(v).length > 0 && String(fi[k]).length > 0, k)
  for (const k of Object.keys(en)) assert.deepStrictEqual((String(en[k]).match(/\{\w+\}/g) || []).sort(), (String(fi[k]).match(/\{\w+\}/g) || []).sort(), 'placeholders of ' + k)
})
test('language: every key the cpumem pages ask for exists in cpumem2 or the shared net2 strings', () => {
  const src = ['page', 'lab', 'die-view', 'mem-view'].map(f => read('js/cpumem/' + f + '.js')).join('\n')
  const keys = new Set([...src.matchAll(/\bT\('([A-Za-z0-9_\-]+)'(?!\s*\+)/g)].map(x => x[1]))
  const have = k => k in en || k in net
  for (const k of keys) assert.ok(have(k), 'missing string: ' + k)
  // keys built at run time
  const dyn = [
    ...P.VIEWS.map(v => 'seg_' + v), ...['balanced', 'saver', 'high', 'ultimate', 'other'].map(k => 'plan_' + k), ...['processor', 'corepower', 'memory', 'tradeoffs', 'retired'].flatMap(l => ['lane_' + l, 'laneSub_' + l]),
    ...findings.IDS.flatMap(id => ['fT_' + id.replace(/-/g, '_'), 'fS_' + id.replace(/-/g, '_')]), ...['pcores', 'vcache', 'skip0'].flatMap(k => ['plan_' + k, 'planS_' + k]),
    ...['above', 'high', 'other'].map(k => 'prio_' + k), ...['above', 'high'].map(k => 'prioS_' + k), ...['x', 'premium_required', 'bad-exe', 'plan-not-available', 'script-failed', 'no-topology'].map(k => 'pinErr_' + k),
    ...['on', 'native', 'partial', 'off', 'drifted', 'restart', 'unknown', 'locked'].map(k => 'st_' + k), ...['now', 'min', 'hour', 'day'].map(k => 'ago_' + k), ...P.CHIPS.map(c => 'chip_' + c),
    ...['manual', 'stage', 'auto-opti', 'undo', 'game-watcher'].map(k => 'via_' + k), 'labPitch1', 'labPitch2', 'labPitch3',
  ]
  for (const k of dyn) assert.ok(have(k), 'missing string: ' + k)
  // the shared net2 strings the receipt, sheet and details reach for
  for (const k of ['sheetLabel', 'pvLead', 'pvRp', 'pvRestart', 'pvUndo', 'cancel', 'pvGo', 'pvGoRestore', 'pvRecTitle', 'pvPutTitle', 'rcTitle', 'rcTitleRestore', 'dChanges', 'dWhat', 'dWant', 'dNow', 'dNotSet', 'dWhyPc', 'lockedWhy', 'dDrifted', 'dLast', 'dUndo', 'conflictT', 'histTitle', 'histEmptyT']) assert.ok(k in net, 'net2 lost: ' + k)
})
test('language: no finding or verdict text promises a gain', () => {
  const bad = /\d+\s*%\s*(faster|more|higher)|guarantee|\bfps\b.*\b(up|more|higher)\b/i
  for (const [k, v] of Object.entries(en)) if (/^(fT_|fS_|v[A-Z]|lead)/.test(k)) assert.ok(!bad.test(v), k + ': ' + v)
})
