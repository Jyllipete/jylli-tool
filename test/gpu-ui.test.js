const test = require('node:test')
const assert = require('node:assert')
const P = require('../js/gpu/pure')
const L = require('../lib/gpu/limiter')

const frame = (o = {}) => ({ t: 1, load: 80, smi: { load: 80, clock: 2400, clockMax: 2850, power: 150, powerLimit: 200, temp: 72, vramUsed: 3000, vramTotal: 12000, reasons: '0x4', ...(o.smi || {}) }, sensor: { tempHot: null, ...(o.sensor || {}) }, mem: { dedicatedMB: 3000 }, eng: { gfx: 80, compute: 0, copy: 3, decode: 0, encode: 0 }, procs: o.procs || [] })

test('railRead: values with their ceiling and fill; unknown prints a dash, never 0', () => {
  const r = L.rails(frame(), { slowdownC: 92 })
  assert.deepStrictEqual(P.railRead(r[1]), { main: '2.40', unit: 'GHz', ceil: '2.85 GHz', fill: r[1].pct, tone: '' })
  assert.strictEqual(P.railRead(r[2]).ceil, '200 W'); assert.strictEqual(P.railRead(r[3]).ceil, '92 °C'); assert.strictEqual(P.railRead(r[4]).main, '2.9'); assert.strictEqual(P.railRead(r[4]).unit, 'GB')
  const none = P.railRead(L.rails({ load: null, mem: {} }, {})[1]); assert.deepStrictEqual(none, { main: '–', unit: '', ceil: null, fill: null, tone: '' })
  assert.strictEqual(P.railRead(L.rails(frame({ smi: { power: 199.6 } }), {})[2]).tone, 'cap'); assert.strictEqual(P.railRead(L.rails(frame({ smi: { power: 120 } }), {})[2]).tone, '')
  assert.strictEqual(P.railRead(L.rails(frame({ smi: { temp: 70 } }), {})[3]).fill, null, 'no slowdown temperature, no bar')
})

test('sparkSegments: fixed scale, fitted scale with a floor, gaps break the line', () => {
  const v = [0, 50, 100]
  const [s] = P.sparkSegments(v, 120, 28, 0, 100)
  assert.ok(s.split(' ').length === 3); assert.ok(s.endsWith('120,1')); assert.ok(s.startsWith('' + (120 - 2 * (120 / 59)).toFixed(1).replace(/\.0$/, '')))
  const flat = P.sparkSegments([70, 70.4, 70.2], 120, 28, null, null, 5)[0].split(' ').map(p => Number(p.split(',')[1]))
  assert.ok(Math.max(...flat) - Math.min(...flat) < 6, 'noise stays flat')
  assert.strictEqual(P.sparkSegments([1, null, 2], 120, 28, 0, 5).length, 2); assert.deepStrictEqual(P.sparkSegments([null, null], 120, 28), [])
})

test('createTrace keeps the last 60 values', () => {
  const t = P.createTrace(); for (let i = 0; i < 70; i++) t.push(i)
  assert.strictEqual(t.size(), 60); assert.strictEqual(t.values()[0], 10); t.push(undefined); assert.strictEqual(t.values().at(-1), null)
})

test('stageVerdict: bad finding > drift > warning > open > paused > clean', () => {
  const m = { drifted: [], recommendedIds: [] }
  assert.strictEqual(P.stageVerdict(null, []).kind, 'unread')
  assert.deepStrictEqual(P.stageVerdict(m, []), { kind: 'clean', id: null, tone: 'ok', vars: {} })
  assert.strictEqual(P.stageVerdict(m, [], true).kind, 'paused')
  assert.strictEqual(P.stageVerdict({ ...m, recommendedIds: ['a'] }, []).kind, 'open')
  assert.strictEqual(P.stageVerdict({ ...m, drifted: ['a'], recommendedIds: ['a'] }, [{ id: 'x', tone: 'warn', vars: {} }]).kind, 'drift')
  assert.strictEqual(P.stageVerdict(m, [{ id: 'w', tone: 'warn', vars: { n: 2.04 } }, { id: 'b', tone: 'bad', vars: {} }]).id, 'b')
  assert.deepStrictEqual(P.stageVerdict(m, [{ id: 'w', tone: 'warn', vars: { n: 2.04, o: { a: 1 } } }]).vars, { n: 2 })
})

test('actionOf maps every finding action the engine can produce', () => {
  assert.strictEqual(P.actionOf({ action: { kind: 'display' } }).kind, 'display'); assert.strictEqual(P.actionOf({ action: { kind: 'bios' } }).tab, 'bios')
  assert.strictEqual(P.actionOf({ action: { kind: 'switch', id: 'x' } }).id, 'x'); assert.strictEqual(P.actionOf({ action: { kind: 'reveal', id: 'y' } }).kind, 'reveal'); assert.strictEqual(P.actionOf({ action: { kind: 'url', url: 'u' } }).url, 'u')
  assert.strictEqual(P.actionOf({ action: null }), null); assert.strictEqual(P.actionOf({ action: { kind: 'nope' } }), null)
})

test('identity: only what is known, architecture named', () => {
  assert.deepStrictEqual(P.identity(null), [])
  const c = P.identity({ gpu: { arch: 'rtx40', vramGB: 12, driver: '31.0', irqMode: 'msi' }, smi: { pcieGenMax: 4, pcieWidthMax: 16, rebar: false } })
  assert.deepStrictEqual(c.map(x => x.k), ['arch', 'vram', 'driver', 'pcie', 'rebarOff', 'irqMsi']); assert.strictEqual(c[0].vars.arch, 'RTX 40 series (Ada)')
  assert.deepStrictEqual(P.identity({ gpu: { name: 'x' } }), [])
})

test('displayRows: best rate at the current resolution, below, link-limited, primary first index', () => {
  const d = { device: '\\\\.\\DISPLAY2', monitor: 'Dell', primary: true, cur: { w: 2560, h: 1440, hz: 60 }, modes: [{ w: 2560, h: 1440, hz: 60 }, { w: 2560, h: 1440, hz: 165 }, { w: 1920, h: 1080, hz: 240 }, { w: 2560, h: 1440, hz: 120 }], maxHzAtCur: 165, edidMaxHz: 240 }
  const [r] = P.displayRows([d])
  assert.deepStrictEqual(r.hzs, [165, 120, 60]); assert.strictEqual(r.best, 165); assert.ok(r.below && r.linkLimited); assert.strictEqual(r.index, 2)
  assert.ok(!P.displayRows([{ ...d, cur: { w: 2560, h: 1440, hz: 165 }, edidMaxHz: null }])[0].below)
})

test('engineRows / procRows: ordered, rounded, names without .exe, nothing before a frame', () => {
  assert.deepStrictEqual(P.engineRows(null).map(r => r.v), [null, null, null, null, null])
  assert.deepStrictEqual(P.engineRows(frame()).map(r => r.v), [80, 0, 3, 0, 0])
  const rows = P.procRows(frame({ procs: [{ pid: 1, name: 'dwm.exe', util: 3.4, mb: 90 }, { pid: 2, name: 'game.exe', util: 71.6, mb: 4000 }, { pid: 3, name: 'idle', util: 0, mb: 200 }] }))
  assert.deepStrictEqual(rows.map(r => r.name), ['game', 'dwm', 'idle']); assert.strictEqual(rows[0].util, 72); assert.strictEqual(rows[0].memFill, 100)
  assert.deepStrictEqual(P.procRows(null), [])
})

test('reportRows / signed', () => {
  assert.deepStrictEqual(P.reportRows({ ok: false }), [])
  const rows = P.reportRows({ ok: true, work: 41.2, clockAvg: 2500, clockPct: 87.7, powerAvg: 190, powerPct: 95, tempPeak: 88, hotspotPeak: 99 })
  assert.deepStrictEqual(rows.map(r => r.k), ['work', 'clock', 'power', 'temp']); assert.strictEqual(rows[1].main, '2.50'); assert.strictEqual(rows[3].tone, 'bad'); assert.strictEqual(P.reportRows({ ok: true, work: null })[0].main, '–')
  assert.strictEqual(P.signed(-50), '−50'); assert.strictEqual(P.signed(1.25, 1), '+1.3'); assert.strictEqual(P.signed(0), '±0'); assert.strictEqual(P.signed(null), null)
})

test('formats', () => {
  assert.strictEqual(P.fmtMB(640), '640 MB'); assert.strictEqual(P.fmtMB(6246), '6.1 GB'); assert.strictEqual(P.fmtMB(null), '–'); assert.strictEqual(P.fmtGHz(2520), '2.52'); assert.strictEqual(P.fmtGHz(0), '–'); assert.strictEqual(P.pct(null), '–')
})
