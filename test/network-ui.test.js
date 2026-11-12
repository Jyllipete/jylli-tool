const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs'), path = require('path'), vm = require('vm')
const catalog = require('../lib/network/catalog')
const Verdict = require('../lib/fivem/route-verdict')
const P = require('../js/network/pure')

const root = path.join(__dirname, '..')
const ctx = {}
vm.runInNewContext(['en', 'fi', 'network-en', 'network-fi'].map(c => fs.readFileSync(path.join(root, 'js', 'lang', c + '.js'), 'utf8')).join('\n') + '\n;globalThis.__L = LANG', ctx)
const L = ctx.__L
const en = L.en.net2, fi = L.fi.net2

test('LANG: English and Finnish have the same keys and placeholders', () => {
  assert.deepStrictEqual(Object.keys(en).sort(), Object.keys(fi).sort())
  const ph = s => (String(s).match(/\{\w+\}/g) || []).sort().join()
  for (const k of Object.keys(en)) { assert.ok(String(fi[k]).length > 0, k); assert.strictEqual(ph(fi[k]), ph(en[k]), k) }
})

const VERDICTS = Verdict.VERDICTS.filter(v => v !== 'measuring' && v !== 'clean')
const FIND_IDS = [...new Set([...fs.readFileSync(path.join(root, 'lib', 'network', 'findings.js'), 'utf8').matchAll(/\badd\('([a-z-]+)'/g)].map(m => m[1]))].filter(id => id !== 'path-')
const keysUsed = () => {
  const src = ['page.js', 'views.js', 'cards.js', 'path-view.js'].map(f => fs.readFileSync(path.join(root, 'js', 'network', f), 'utf8')).join('\n')
  const keys = new Set([...src.matchAll(/\bT\('([A-Za-z0-9_-]+)'/g)].map(m => m[1]))
  for (const m of src.matchAll(/\bT\([a-zA-Z. ]+ \? '([A-Za-z0-9_-]+)' : '([A-Za-z0-9_-]+)'/g)) { keys.add(m[1]); keys.add(m[2]) }
  for (const m of src.matchAll(/titleKey: ?'([A-Za-z0-9_]+)'|'(pv[A-Za-z]+)'\)/g)) keys.add(m[1] || m[2])
  return [...keys].filter(k => !/_$/.test(k))
}

test('LANG: every literal key the pages use exists, and so do the run-time families', () => {
  for (const k of keysUsed()) { assert.ok(en[k] !== undefined, 'en ' + k); assert.ok(fi[k] !== undefined, 'fi ' + k) }
  const fam = {
    seg_: [...P.VIEWS, 'home', 'isp', 'transit', 'server'], chip_: P.CHIPS, ago_: ['now', 'min', 'hour', 'day'], lane_: catalog.LANES.map(l => l.id), laneSub_: catalog.LANES.map(l => l.id),
    st_: [...Object.keys(P.STATUS).filter(s => s !== 'once'), 'unknownApplied'], nd_: ['pc', 'link', 'wifi', 'ethernet', 'router', 'isp', 'internet', 'band', 'radio', 'jitter', 'loss', 'hidden'],
    preset_: ['auto', 'custom', 'other', ...catalog.PRESETS.map(p => p.id)], presetS_: ['auto', 'custom', ...catalog.PRESETS.map(p => p.id)],
    v_: VERDICTS, fT_: FIND_IDS.concat(VERDICTS.map(v => 'path-' + v)), fS_: FIND_IDS.concat(VERDICTS.map(v => 'path-' + v)), ck_: [...Verdict.VERDICTS, 'idle'],
    ckStep_: ['switches', 'path', 'dns'], ckStepS_: ['switches', 'path', 'dns'], bloat_: ['Ap', 'A', 'B', 'C', 'D', 'F'],
    dnsErr_: ['primary-missing', 'primary-invalid', 'secondary-invalid', 'same'], err_: ['primary-missing', 'primary-invalid', 'secondary-invalid', 'same', 'busy', 'save-failed', 'unknown-preset', 'nothing-to-do'],
    via_: ['manual', 'stage', 'auto-opti', 'spw', 'ai', 'game-watcher', 'scheduler', 'safety-revert', 'undo'], act_: ['apply', 'restore'], lvErr_: ['dns', 'x'],
  }
  for (const [pre, list] of Object.entries(fam)) for (const k of list) { assert.ok(en[pre + k] !== undefined, 'en ' + pre + k); assert.ok(fi[pre + k] !== undefined, 'fi ' + pre + k) }
  for (const k of ['vMeasuring', 'vClean', 'vWifi', 'vWifiLoss', 'vUnread', 'vStale', 'vNever', 'vCk', 'vRun', 'vScan']) assert.ok(en[k] && fi[k], k)
})

test('LANG: every finding the engine can raise has a title and a body with the variables it can fill', () => {
  const ev = { n: 1, names: 1, ids: 1, ip: 1, ttl: 1, loss: 1, jitter: 1, avg: 1, p95: 1, rssi: 1, band: 1, channel: 1, mbps: 1, extra: 1, idle: 1, loaded: 1, server: 1, ms: 1, best: 1, bestMs: 1, verdict: 1, node: 1, endLoss: 1, via: 1 }
  for (const id of FIND_IDS.concat(VERDICTS.map(v => 'path-' + v))) for (const pre of ['fT_', 'fS_']) for (const lang of [en, fi]) for (const m of String(lang[pre + id]).matchAll(/\{(\w+)\}/g)) assert.ok(ev[m[1]], pre + id + ' uses {' + m[1] + '}')
})

test('LANG: every catalog switch has a name and a description in both languages', () => {
  for (const it of catalog.ITEMS) for (const l of ['en', 'fi']) {
    const names = L[l].tweakNames || {}, descs = L[l].tweakDescs || {}
    const name = names[it.id] ?? L.en.tweakNames[it.id], desc = descs[it.id] ?? L.en.tweakDescs[it.id]
    assert.ok(name, l + ' name ' + it.id)
    if (!it.preset) assert.ok(desc, l + ' desc ' + it.id)
  }
})

test('pure: status looks, flip action, chips', () => {
  assert.strictEqual(P.flipAction({ status: 'off' }), 'apply'); assert.strictEqual(P.flipAction({ status: 'on' }), 'restore')
  assert.strictEqual(P.flipAction({ status: 'unknown', remembered: 'applied' }), 'restore')
  assert.ok(P.isLocked({ status: 'native' }) && !P.isLocked({ status: 'on' }))
  const items = [{ status: 'on', tier: 1 }, { status: 'off', tier: 2, rec: true }, { status: 'drifted', tier: 1 }, { status: 'native', tier: 1 }]
  assert.deepStrictEqual(P.chipCounts(items), { all: 4, rec: 1, set: 2, open: 2, drifted: 1, risky: 1 })
  assert.ok(P.matches({ id: 'dns-doh' }, 'doh', 'Encrypted lookups') && !P.matches({ id: 'x' }, 'zzz', 'abc'))
})

test('pure: node text prints what the trace measured and nothing it did not', () => {
  assert.deepStrictEqual(P.nodeText({ id: 'router', ms: 1.25, jitter: 0.8, loss: 0 }), { value: '1.3', unit: 'ms', sub: [{ k: 'jitter', v: '0.8 ms' }, { k: 'loss', v: '0 %' }] })
  assert.deepStrictEqual(P.nodeText({ id: 'isp', ms: null, jitter: null, loss: null, v: { hidden: true } }), { value: '–', unit: '', sub: [] })
  assert.deepStrictEqual(P.nodeText({ id: 'link', v: { kind: 'wifi', rssi: -55, band: 5, radio: '802.11ax' } }), { value: '-55', unit: 'dBm', sub: [{ k: 'band', v: '5 GHz' }, { k: 'radio', v: '802.11ax' }] })
  assert.deepStrictEqual(P.nodeText({ id: 'link', v: { kind: 'ethernet', speedMbps: 2500 } }), { value: '2.5', unit: 'Gbps', sub: [] })
  assert.strictEqual(P.nodeText({ id: 'link', v: { kind: 'ethernet', speedMbps: 100 } }).unit, 'Mbps')
  assert.strictEqual(P.nodeText(null).value, '–')
  assert.strictEqual(P.fmtMs(123.4), '123'); assert.strictEqual(P.fmtMs(null), '–'); assert.strictEqual(P.fmtMs(8.44), '8.4')
})

test('pure: stage verdict picks a key per state and a Wi-Fi wording for home problems on Wi-Fi', () => {
  const live = { live: true }
  assert.strictEqual(P.stageVerdict({ verdict: { id: 'clean', ev: { avg: 12 } } }, live, null).key, 'vClean')
  assert.strictEqual(P.stageVerdict({ verdict: { id: 'loss-isp', ev: { loss: 5 } } }, live, null).tone, 'danger')
  assert.strictEqual(P.stageVerdict({ verdict: { id: 'jitter-home', wifi: true, ev: {} } }, live, null).key, 'vWifi')
  assert.strictEqual(P.stageVerdict({ verdict: { id: 'jitter-home', wifi: false, ev: {} } }, live, null).key, 'v_jitter-home')
  assert.strictEqual(P.stageVerdict({ verdict: { id: 'measuring' } }, live, null).key, 'vMeasuring')
  assert.strictEqual(P.stageVerdict({ verdict: { id: 'idle' } }, live, null).key, 'vNever')
  assert.strictEqual(P.stageVerdict({ verdict: { id: 'idle' } }, live, { at: 1 }).key, 'vStale')
  assert.strictEqual(P.stageVerdict(null, { live: false }, null).key, 'vUnread')
})

test('pure: finding variables, bufferbloat grades, ping tone and delta, sparkline', () => {
  const v = P.findingVars({ ev: { ids: ['a', 'b', 'c', 'd'], best: 'cloudflare', ms: 41.26 } }, id => id.toUpperCase())
  assert.deepStrictEqual([v.n, v.names, v.best, v.ms], [4, 'A, B, C …', 'cloudflare', 41.3])
  assert.deepStrictEqual([0, 10, 40, 100, 300, 500].map(P.bloatGrade), ['A+', 'A', 'B', 'C', 'D', 'F'])
  assert.strictEqual(P.bloatGrade(null), null)
  assert.deepStrictEqual(['A+', 'B', 'D', null].map(P.gradeTone), ['ok', 'warn', 'danger', 'idle'])
  assert.deepStrictEqual([{ avg: 20, packetLoss: 0, jitter: 2 }, { avg: 90, packetLoss: 0 }, { avg: 20, packetLoss: 3 }, { avg: -1 }, { avg: null }].map(P.pingTone), ['ok', 'warn', 'danger', 'danger', 'danger'])
  assert.deepStrictEqual(P.pingDelta({ name: 'a', avg: 20 }, { a: 35 }), { k: 'better', v: '−15', t: '35' })
  assert.strictEqual(P.pingDelta({ name: 'a', avg: 40 }, { a: 20 }).k, 'worse')
  assert.strictEqual(P.pingDelta({ name: 'a', avg: 21 }, { a: 20 }).k, 'same')
  assert.strictEqual(P.pingDelta({ name: 'a', avg: 21 }, null).k, 'none')
  assert.strictEqual(P.sparkPoints([1], 100, 20), '')
  const pts = P.sparkPoints([10, null, 20, 30], 100, 20).split(' ')
  assert.strictEqual(pts.length, 3); assert.ok(pts[0].startsWith('2.0,') && pts[2].endsWith(',2.0'))
})

test('pure: preview groups cost the batch; custom DNS form check matches the engine rule', () => {
  const m = { lanes: [{ id: 'adapter', ids: ['a', 'b'] }, { id: 'protocol', ids: ['c'] }], items: [{ id: 'a', tier: 2, reboot: false }, { id: 'b', tier: 1, reboot: true }, { id: 'c', tier: 1, reboot: false }] }
  assert.deepStrictEqual(P.previewGroups(m, ['a', 'c', 'b']), { groups: [{ lane: 'adapter', ids: ['a', 'b'] }, { lane: 'protocol', ids: ['c'] }], n: 3, restart: 1, restorePoint: true })
  const { validateDns } = require('../lib/network')
  for (const [a, b] of [['', ''], ['1.1.1.1', ''], ['1.1.1.1', '1.0.0.1'], ['1.1.1', ''], ['1.1.1.1', '1.1.1.1'], ['127.0.0.1', ''], ['8.8.8.8', 'x']]) assert.strictEqual(P.dnsInput(a, b).ok, validateDns(a, b).ok, a + '|' + b)
  assert.deepStrictEqual(P.receiptNumbers({ counts: { ok: 2, verified: 1, mismatch: 1 }, items: [1, 2] }), { ok: 2, failed: 0, verified: 1, mismatch: 1, restart: 0, total: 2 })
})
