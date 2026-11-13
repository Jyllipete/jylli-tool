const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs'), path = require('path'), vm = require('vm')
const P = require('../js/power/pure')
const plans = require('../lib/power/plans')
const findings = require('../lib/power/findings')

const root = path.join(__dirname, '..')
const LANG = { en: { tweakDescs: {}, tweakNames: {} }, fi: { tweakDescs: {}, tweakNames: {} } }
for (const f of ['network-en', 'network-fi', 'power-en', 'power-fi']) vm.runInNewContext(fs.readFileSync(path.join(root, 'js/lang', f + '.js'), 'utf8'), { LANG })
const has = (lang, k) => k in LANG[lang].power2 || k in LANG[lang].net2

test('formats: unmeasured is a dash, never 0; small watts keep a decimal; Wh switches to kWh', () => {
  assert.strictEqual(P.fmtW(null), '–'); assert.strictEqual(P.fmtW(undefined), '–'); assert.strictEqual(P.fmtW(0), '0'); assert.strictEqual(P.fmtW(4.26), '4.3'); assert.strictEqual(P.fmtW(142.6), '143')
  assert.strictEqual(P.fmtWh(null), '–'); assert.strictEqual(P.fmtWh(12.34), '12.3 Wh'); assert.strictEqual(P.fmtWh(420), '420 Wh'); assert.strictEqual(P.fmtWh(1250), '1.25 kWh')
  assert.strictEqual(P.fmtDur(42000), '42 s'); assert.strictEqual(P.fmtDur(125000), '2 min 05 s'); assert.strictEqual(P.fmtDur(4320000), '1 h 12 min')
  assert.strictEqual(P.fmtMinutes(null), '–'); assert.strictEqual(P.fmtMinutes(200), '3 h 20 min'); assert.strictEqual(P.fmtMinutes(45), '45 min')
  assert.strictEqual(P.fmtCost(null, 'EUR'), '–'); assert.strictEqual(P.fmtCost(0.052, 'EUR'), '0.052 EUR'); assert.strictEqual(P.fmtCost(1.234, '€'), '1.23 €')
})
test('flow: nothing measured = still; more watts = faster; never faster than the floor or slower than the ceiling', () => {
  assert.strictEqual(P.flowDur(null), null); assert.strictEqual(P.flowDur(0), null)
  assert.ok(P.flowDur(300) < P.flowDur(50)); assert.ok(P.flowDur(5000) >= 0.7); assert.ok(P.flowDur(1) <= 4.2)
  assert.strictEqual(P.wattFill(null), null); assert.strictEqual(P.wattFill(150, 300), 50); assert.strictEqual(P.wattFill(900, 300), 100)
})
test('stageVerdict: the worst finding wins, then drift, then open switches, then paused, then clean', () => {
  const m = (o = {}) => ({ drifted: [], recommendedIds: [], ...o })
  assert.strictEqual(P.stageVerdict(null, []).kind, 'unread')
  assert.deepStrictEqual([P.stageVerdict(m({ drifted: ['a'] }), [{ id: 'x', tone: 'bad', vars: {} }]).kind, P.stageVerdict(m({ drifted: ['a'] }), [{ id: 'x', tone: 'bad', vars: {} }]).tone], ['finding', 'danger'])
  assert.strictEqual(P.stageVerdict(m({ drifted: ['a'] }), [{ id: 'x', tone: 'warn', vars: {} }]).kind, 'drift')
  assert.strictEqual(P.stageVerdict(m(), [{ id: 'x', tone: 'warn', vars: { n: 1.234 } }]).vars.n, 1.2)
  assert.strictEqual(P.stageVerdict(m({ recommendedIds: ['a'] }), [{ id: 'x', tone: 'info', vars: {} }]).kind, 'open')
  assert.strictEqual(P.stageVerdict(m(), [], true).kind, 'paused'); assert.strictEqual(P.stageVerdict(m(), []).kind, 'clean')
})
test('actionOf maps every finding action the engine can produce to a label that exists in both languages', () => {
  const acts = [{ kind: 'view', view: 'plans' }, { kind: 'view', view: 'sleep' }, { kind: 'switch', id: 'pcie-power' }, { kind: 'plan', guid: plans.GUID.balanced }, { kind: 'tidy' }, { kind: 'mode', overlay: plans.OVERLAY.balanced }]
  for (const a of acts) { const r = P.actionOf({ action: a }); assert.ok(r, a.kind); for (const l of ['en', 'fi']) assert.ok(has(l, r.label), l + ' ' + r.label) }
  assert.strictEqual(P.actionOf({ action: null }), null); assert.strictEqual(P.actionOf({ action: { kind: 'nope' } }), null); assert.strictEqual(P.actionOf(null), null)
})
test('planCards: active first, then Windows plans, then Jylli plans, then the rest by name; only custom inactive plans are tidyable', () => {
  const K = id => plans.keyOf(plans.byAnat[id])
  const list = plans.normalize([{ guid: 'c7c1e4d9-3a52-4f88-9c60-2d5e8a1f6b34', name: 'Zed' }, { guid: plans.GUID.balanced, name: 'Balanced' }, { guid: '89f7c0cb-7c17-4774-be56-b135ea7e679b', name: 'Mine', active: true }, { guid: 'b7c1e4d9-3a52-4f88-9c60-2d5e8a1f6b34', name: 'AMD Max Performance' }, { guid: 'd7c1e4d9-3a52-4f88-9c60-2d5e8a1f6b34', name: 'Alpha' }])
  const cards = P.planCards({ plans: list, idx: { [plans.GUID.balanced]: { AC: { [K('cpuMax')]: 100, [K('boost')]: 1 }, DC: {} } } })
  assert.deepStrictEqual(cards.map(c => c.name), ['Mine', 'Balanced', 'AMD Max Performance', 'Alpha', 'Zed'])
  assert.deepStrictEqual(cards.filter(c => c.tidy).map(c => c.name), ['AMD Max Performance', 'Alpha', 'Zed'])
  assert.strictEqual(cards[1].character.kind, 'balanced'); assert.strictEqual(cards[0].character.kind, 'unread'); assert.deepStrictEqual(P.planCards(null), [])
})
test('compareRows: grouped, rows neither plan exposes are left out, differing rows are flagged', () => {
  const K = id => plans.keyOf(plans.byAnat[id])
  const f = { activeGuid: 'a', idx: { a: { AC: { [K('cpuMax')]: 100, [K('sleep')]: 1800 }, DC: {} }, b: { AC: { [K('cpuMax')]: 70, [K('sleep')]: 1800 }, DC: {} } } }
  const g = P.compareRows(f, 'b'); assert.deepStrictEqual(g.map(x => x.group), ['cpu', 'timeouts'])
  assert.ok(g[0].rows.find(r => r.id === 'cpuMax').differs); assert.ok(!g[1].rows.find(r => r.id === 'sleep').differs)
  assert.deepStrictEqual(P.compareRows(null, 'b'), []); assert.deepStrictEqual(P.compareRows(f, null), [])
})
test('sourceOf / wattsRow: a desktop is the wall, a laptop takes the live rate over the scan, nothing measured stays null', () => {
  assert.strictEqual(P.sourceOf({ battery: null }, null).kind, 'wall')
  const f = { battery: { percent: 60, state: 'discharging', rateW: 10, minutesLeft: 100 } }
  assert.strictEqual(P.sourceOf(f, { bat: { discharging: true, rateW: 12.5 } }).rateW, 12.5); assert.strictEqual(P.sourceOf(f, null).rateW, 10); assert.strictEqual(P.sourceOf(f, null).minutes, 100)
  const w = P.wattsRow({ watts: { cpuW: null, gpuW: 80 }, perf: 120, util: 3 }); assert.strictEqual(w.total, 80); assert.strictEqual(w.cpuW, null); assert.strictEqual(w.perf, 120)
  assert.strictEqual(P.wattsRow(null).total, null); assert.strictEqual(P.wattsRow({ watts: { cpuW: 40, gpuW: 60 } }).total, 100)
})
test('sessionRows: average draw comes from the saved watt-hours and the time, a missing source stays null', () => {
  const r = P.sessionRows([{ at: 1, ms: 3600000, whTotal: 250, cpu: { wh: 50, peakW: 80 }, gpu: { wh: 200, peakW: 300 }, cost: 0.05, currency: 'EUR', game: 'X' }, { at: 2, ms: 0, whTotal: null }])
  assert.strictEqual(r[0].avgW, 250); assert.strictEqual(r[0].peakW, 300); assert.strictEqual(r[0].cpuWh, 50); assert.strictEqual(r[1].avgW, null); assert.strictEqual(r[1].peakW, null)
})
test('timeouts: the page offers exactly what the engine accepts', () => {
  assert.deepStrictEqual(P.TIMEOUTS, require('../lib/power').TIMEOUTS)
})

// ── language ──
test('lang: every finding has a title and a sentence in both languages, and both files carry the same keys', () => {
  for (const l of ['en', 'fi']) for (const id of findings.IDS) for (const p of ['fT_', 'fS_']) assert.ok(LANG[l].power2[p + id.replace(/-/g, '_')], l + ' ' + p + id)
  const en = Object.keys(LANG.en.power2).sort(), fi = Object.keys(LANG.fi.power2).sort()
  assert.deepStrictEqual(en.filter(k => !fi.includes(k)), []); assert.deepStrictEqual(fi.filter(k => !en.includes(k)), [])
})
test('lang: every plan setting, flag, value kind, view, lane and character the code can produce has a text', () => {
  const need = [...P.VIEWS.map(v => 'seg_' + v), ...plans.ANATOMY.map(a => 'an_' + a.id), ...P.GROUPS.map(g => 'grp_' + g), ...['pinned', 'capped', 'noBoost', 'boosting', 'linksAwake', 'allCores'].map(x => 'flag_' + x), ...['unread', 'saver', 'balanced', 'performance'].map(x => 'char_' + x)]
  for (const a of plans.ANATOMY) for (const v of [0, 1, 2, 3, 4, 5, 6, 7, 60, 600, 7200, 3 * 3600 + 60]) { const d = plans.describe(a, v); if (d) need.push('d_' + d.kind) }
  for (const l of ['en', 'fi']) for (const k of need) assert.ok(has(l, k), l + ' ' + k)
})
test('lang: the Windows power modes, wear states and request sections have texts', () => {
  const need = ['modeEfficiency', 'modeBalanced', 'modePerformance', 'modeMax', 'modeOther', 'wear_ok', 'wear_warn', 'wear_bad', 'rq_system', 'rq_awaymode', 'rq_execution', 'lane_plan', 'lane_links', 'lane_storage', 'lane_startup', 'lane_retired', 'laneSub_plan', 'laneSub_links', 'laneSub_storage', 'laneSub_startup', 'laneSub_retired']
  for (const l of ['en', 'fi']) for (const k of need) assert.ok(has(l, k), l + ' ' + k)
})

// ── second pass: meter paths, profile bar, naming of the total, plural forms ──
test('areaPaths: gaps break the line, the area closes to the floor, nothing measured draws nothing, the scale never drops below the floor', () => {
  assert.deepStrictEqual(P.areaPaths([], 240, 56), { line: '', area: '' }); assert.deepStrictEqual(P.areaPaths([null, null], 240, 56), { line: '', area: '' })
  const d = P.areaPaths([10, 20, null, 30, 40], 240, 56)
  assert.strictEqual((d.line.match(/M/g) || []).length, 2); assert.strictEqual((d.area.match(/Z/g) || []).length, 2)
  const flat = P.areaPaths([1, 1, 1], 240, 56, 40), y = Number(/,([\d.]+) L/.exec(flat.line)[1]); assert.ok(y > 40, 'a 1 W reading stays near the bottom, it does not fill the chart')
  assert.ok(Number(/,([\d.]+)$/.exec(P.areaPaths([400, 400], 240, 56, 40).line)[1]) < 20, 'a high reading rises')
})
test('planProfile / shortId / totalKind', () => {
  const K = id => plans.keyOf(plans.byAnat[id])
  const f = { idx: { a: { AC: { [K('cpuMin')]: 5, [K('cpuMax')]: 100 }, DC: {} }, b: { AC: { [K('cpuMax')]: 70 }, DC: {} } } }
  assert.deepStrictEqual(P.planProfile(f, 'a'), { min: 5, max: 100 }); assert.strictEqual(P.planProfile(f, 'b'), null); assert.strictEqual(P.planProfile(null, 'a'), null); assert.strictEqual(P.planProfile(f, 'zzz'), null)
  assert.strictEqual(P.shortId('89f7c0cb-7c17-4774-be56-b135ea7e679b'), 'a7e679b')
  assert.strictEqual(P.totalKind({ cpuW: 1, gpuW: 2 }), 'both'); assert.strictEqual(P.totalKind({ cpuW: null, gpuW: 2 }), 'gpu'); assert.strictEqual(P.totalKind({ cpuW: 1, gpuW: null }), 'cpu'); assert.strictEqual(P.totalKind({ cpuW: null, gpuW: null }), null)
})
test('lang: every one-form key has its plural base, and the names of what was measured exist in both languages', () => {
  for (const l of ['en', 'fi']) {
    for (const k of Object.keys(LANG[l].power2).filter(k => k.endsWith('_1'))) assert.ok(has(l, k.slice(0, -2)), l + ' base of ' + k)
    for (const k of ['meterHeroK', 'meterHeroGpu', 'meterHeroCpu', 'vCleanNotesS', 'vCleanNotesS_1', 'planTidy_1', 'tidyGo_1']) assert.ok(has(l, k), l + ' ' + k)
    for (const k of Object.keys(LANG[l].power2)) assert.ok(!/\(s\)|\(es\)/.test(LANG[l].power2[k]), l + ' "(s)" left in ' + k)
  }
})
