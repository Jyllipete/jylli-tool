const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs'), path = require('path')
const catalog = require('../lib/windows/catalog')
const detect = require('../lib/windows/detect')
const model = require('../lib/windows/model')
const { entries } = require('../tools/list-tweaks')

const root = path.join(__dirname, '..')
const mainSrc = fs.readFileSync(path.join(root, 'main.js'), 'utf8')
const retiredInMain = new Set([...mainSrc.slice(mainSrc.indexOf('const RETIRED_TWEAKS = {'), mainSrc.indexOf('function retireFivemTweaks')).matchAll(/^  '([a-z0-9-]+)':/gm)].map(m => m[1]))

test('catalog: every id is a real tweak, ids are unique, every lane exists', () => {
  const tweaks = new Set(entries.map(e => e.id))
  const seen = new Set()
  for (const i of catalog.ITEMS) {
    assert.ok(tweaks.has(i.id), 'not in TWEAKS: ' + i.id)
    assert.ok(!seen.has(i.id), 'duplicate ' + i.id); seen.add(i.id)
    assert.ok(catalog.LANES.some(l => l.id === i.lane), 'lane of ' + i.id)
  }
})

test('catalog: retired lane = exactly the retired tweaks, and nothing retired is recommended or probed', () => {
  for (const i of catalog.ITEMS) {
    assert.strictEqual(i.lane === 'retired', retiredInMain.has(i.id), i.id)
    if (i.lane === 'retired') { assert.ok(!i.rec, i.id); assert.ok(!i.probe, i.id) }
  }
})

test('catalog: nothing tier 3 is recommended, and every recommended id has a tier-1/2 tweak', () => {
  const tier = Object.fromEntries(entries.map(e => [e.id, Number(e.tier)]))
  for (const i of catalog.ITEMS.filter(x => x.rec)) assert.ok(tier[i.id] < 3, i.id)
})

test('catalog: QoL ids are the quality-of-life tab, the rest the Windows tab', () => {
  assert.deepStrictEqual(catalog.ids('qol').sort(), ['boot-sound-off', 'cloud-sync-off', 'cortana', 'cortana-blackout', 'cortana-remnant-off', 'explorer-perf', 'nudge-blocker', 'search-box-local', 'search-cloud-off', 'security-quiet', 'security-toast-off', 'win-tips'])
})

test('detect: the script only reads', () => {
  const s = detect.buildScript()
  assert.doesNotMatch(s, /\b(Set|New|Remove|Disable|Enable|Stop|Start|Restart)-\w+|sc\.exe|bcdedit|reg add|Out-File|Set-Content/i)
  assert.match(s, /JJWIN:/)
  assert.ok(detect.requests(detect.plan()).length > 30)
})

test('detect: parse reads the last marker line and survives noise', () => {
  assert.deepStrictEqual(detect.parse('x\nJJWIN:{"a":"1","b":null}\n'), { a: '1', b: null })
  assert.strictEqual(detect.parse('nothing'), null)
  assert.strictEqual(detect.parse('JJWIN:{broken'), null)
})

test('detect: check compares per probe kind', () => {
  const r = (c, now) => detect.check(c, { [detect.keyOf(c)]: now })
  assert.strictEqual(r({ r: 'HKCU:\\x', n: 'v', eq: 0 }, '0'), 'match')
  assert.strictEqual(r({ r: 'HKCU:\\x', n: 'v', eq: 0 }, '1'), 'miss')
  assert.strictEqual(r({ r: 'HKCU:\\x', n: 'v', eq: 0 }, null), 'miss')            // value absent = Windows default
  assert.strictEqual(r({ r: 'HKLM:\\x', n: 'v', eq: { ge: 10 } }, '20'), 'match')
  assert.strictEqual(r({ r: 'HKLM:\\x', n: 'v', eq: { le: 1 } }, '2'), 'miss')
  assert.strictEqual(r({ r: 'HKLM:\\x', n: 'v', eq: 'Deny' }, 'Deny'), 'match')
  assert.strictEqual(r({ s: 'SysMain', eq: 'Disabled' }, 'disabled'), 'match')
  assert.strictEqual(r({ s: 'SysMain', eq: 'Disabled' }, 'Automatic'), 'miss')
  assert.strictEqual(r({ s: 'Nope', eq: 'Disabled' }, 'MISSING'), 'na')
  assert.strictEqual(r({ nofile: 'C:\\hiberfil.sys' }, 'False'), 'match')
  assert.strictEqual(r({ nofile: 'C:\\hiberfil.sys' }, 'True'), 'miss')
  assert.strictEqual(r({ x: 'memcomp' }, null), 'unread')
  assert.strictEqual(detect.check({ s: 'A', eq: 'x' }, {}), 'unread')
})

test('detect: evaluate -> all / some / none / na / unread', () => {
  const p = { a: [{ r: 'HKCU:\\k', n: 'a', eq: 1 }, { r: 'HKCU:\\k', n: 'b', eq: 1 }], b: [{ s: 'Gone', eq: 'Disabled' }], c: [{ r: 'HKCU:\\k', n: 'c', eq: 1 }] }
  const read = { 'r|HKCU:\\k|a': '1', 'r|HKCU:\\k|b': '0', 's|Gone': 'MISSING', 'r|HKCU:\\k|c': '1' }
  const ev = detect.evaluate(read, p)
  assert.strictEqual(ev.a.state, 'some'); assert.strictEqual(ev.b.state, 'na'); assert.strictEqual(ev.c.state, 'all')
  assert.strictEqual(ev.a.values.length, 2)
  assert.strictEqual(detect.evaluate(null, p).a.state, 'unread')
})

test('model: status of a switch', () => {
  const S = model.statusOf
  assert.strictEqual(S('applied', { state: 'all' }), 'on')
  assert.strictEqual(S('default', { state: 'all' }), 'native')
  assert.strictEqual(S('restored', { state: 'all' }), 'native')
  assert.strictEqual(S('applied', { state: 'none' }), 'drifted')
  assert.strictEqual(S('applied', { state: 'none' }, true), 'restart')
  assert.strictEqual(S('default', { state: 'none' }), 'off')
  assert.strictEqual(S('applied', { state: 'some' }), 'partial')
  assert.strictEqual(S('default', { state: 'unread' }), 'unknown')
  assert.strictEqual(S('applied', null), 'unknown')
  assert.strictEqual(S('applied', { state: 'na' }), 'unknown')
})

function liveFor(overrides = {}) {
  const p = detect.plan(), read = {}
  for (const r of detect.requests(p)) read[r.k] = r.a === 's' || r.a === 't' ? 'Automatic' : r.a === 'f' ? 'True' : r.a === 'x' ? 'True' : null
  return detect.evaluate({ ...read, ...overrides }, p)
}

test('model: one recommended rule (open, not retired, not tier 3, no restart, no caution)', () => {
  const m = model.buildModel({ scope: 'windows', live: liveFor(), remembered: {}, meta: { 'disable-mouse-accel': { safetyTier: 1 }, 'game-dvr': { safetyTier: 1 }, 'defender-quiet': { safetyTier: 2 } },
    applic: { 'disable-fso': { show: true, state: 'caution', why: 'x' } } })
  assert.ok(m.recommendedIds.includes('game-dvr'))
  assert.ok(!m.recommendedIds.includes('disable-fso'), 'caution is never recommended')
  assert.ok(!m.recommendedIds.includes('spectre-meltdown'))
  assert.ok(!m.recommendedIds.includes('gpu-hwsch'), 'not in the recommended set')
  assert.deepStrictEqual(m.recommendedIds, m.items.filter(i => i.rec).map(i => i.id))
  // a switch that Windows already has is not offered again
  const live = liveFor({ 'r|HKCU:\\System\\GameConfigStore|GameDVR_Enabled': '0' })
  const m2 = model.buildModel({ scope: 'windows', live, remembered: {}, meta: {}, applic: {} })
  assert.strictEqual(m2.items.find(i => i.id === 'game-dvr').status, 'native')
  assert.ok(!m2.recommendedIds.includes('game-dvr'))
})

test('model: drift is found, restart is held back, retired shows only when applied', () => {
  const live = liveFor()
  const m = model.buildModel({ scope: 'windows', live, remembered: { 'game-dvr': 'applied', 'gpu-hwsch': 'applied', hpet: 'applied' }, restart: ['gpu-hwsch'], meta: { hpet: { retired: 'because' } }, applic: {} })
  assert.deepStrictEqual(m.drifted, ['game-dvr'])
  assert.deepStrictEqual(m.pendingRestart, ['gpu-hwsch'])
  assert.ok(m.items.find(i => i.id === 'hpet' && i.retired && i.lane === 'retired' && i.retiredWhy === 'because'))
  assert.ok(!m.items.some(i => i.id === 'mmcss'), 'retired and never applied: not shown')
  assert.strictEqual(m.verdict.kind, 'attention')
  assert.ok(!m.recommendedIds.includes('game-dvr'), 'a drifted switch is put back, not recommended')
})

test('model: applicability hides what does not apply, qol scope is separate, unread has no live verdict', () => {
  const m = model.buildModel({ scope: 'windows', live: liveFor(), remembered: {}, meta: {}, applic: { 'msi-mode': { show: false, state: 'hidden' } } })
  assert.ok(!m.items.some(i => i.id === 'msi-mode'))
  const q = model.buildModel({ scope: 'qol', live: liveFor(), remembered: {}, meta: {}, applic: {} })
  assert.deepStrictEqual(q.lanes.map(l => l.id), ['qol-search', 'qol-quiet', 'qol-explorer'])
  assert.ok(q.items.every(i => catalog.scopeOf(i.id) === 'qol'))
  const u = model.buildModel({ scope: 'windows', live: null, remembered: { 'game-dvr': 'applied' }, meta: {}, applic: {} })
  assert.strictEqual(u.verdict.kind, 'unread')
  assert.strictEqual(u.items.find(i => i.id === 'game-dvr').status, 'unknown')
})
