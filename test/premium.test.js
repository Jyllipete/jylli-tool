const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const vm = require('node:vm')
const P = require('../js/premium')

// LANG files are plain browser scripts (en.js declares LANG, fi.js extends it); evaluate both without a DOM.
const LANG = vm.runInNewContext([fs.readFileSync('js/lang/en.js', 'utf8'), fs.readFileSync('js/lang/fi.js', 'utf8'), ';LANG'].join('\n'), {})
const KEYS = tab => ['name_', 'head_', 'lead_', 'b1_', 'b2_', 'b3_'].map(p => p + tab)

test('every premium tab has a pitch in English and Finnish', () => {
  for (const lang of ['en', 'fi']) {
    const g = LANG[lang].premium
    assert.ok(g, lang + ' premium group')
    for (const tab of P.ORDER) for (const k of KEYS(tab)) assert.ok(g[k] && g[k].length >= 3, `${lang}.${k}`)
  }
})

test('English and Finnish premium groups have the same keys', () => {
  assert.deepStrictEqual(Object.keys(LANG.en.premium).sort(), Object.keys(LANG.fi.premium).sort())
})

test('every key the module and its previews ask for exists', () => {
  const asked = new Set()
  const t = k => (asked.add(k), k)
  for (const tab of P.ORDER) P.previewHtml(tab, t)
  for (const k of asked) assert.ok(LANG.en.premium[k] !== undefined, 'missing ' + k)
  const src = fs.readFileSync('js/premium.js', 'utf8')
  for (const m of src.matchAll(/tg\('([a-zA-Z]+)'\)/g)) assert.ok(LANG.en.premium[m[1]] !== undefined, 'missing ' + m[1])
  for (const f of ['cpu', 'gpu', 'ram', 'vram', 'disk', 'games', 'form']) assert.ok(LANG.en.premium['fact_' + f], 'fact_' + f)
})

test('facts come only from real readings', () => {
  assert.deepStrictEqual(P.factsFor('gpu', {}), [])
  assert.deepStrictEqual(P.factsFor('gpu', { gpu: '', vramMB: 0 }), [])
  assert.deepStrictEqual(P.factsFor('games', { games: 0 }), [])
  const f = P.factsFor('latency', { cpu: 'AMD Ryzen 7 7800X3D 8-Core Processor', ramGB: 32, ramType: 'DDR5' })
  assert.deepStrictEqual(f, [{ k: 'cpu', v: 'AMD Ryzen 7 7800X3D' }])
  assert.deepStrictEqual(P.factsFor('scheduler', { isLaptop: true, diskType: 'NVMe SSD' }), [{ k: 'form', v: 'laptop' }])
  assert.deepStrictEqual(P.factsFor('nope', { cpu: 'x' }), [])
})

test('the copy makes no performance promises', () => {
  const bad = /\d+\s*%|\bfps\b.*\b(up|more|higher)\b|\+\d|guarantee|refund|\d{2,}[ ,]*(players|members|users)/i
  for (const lang of ['en', 'fi']) for (const [k, v] of Object.entries(LANG[lang].premium)) {
    if (k.startsWith('pv')) continue   // example values inside the labelled "Example" panel
    assert.ok(!bad.test(v), `${lang}.${k}: ${v}`)
  }
})

test('premium tabs are flagged in the routes so the tab bar shows the badge', () => {
  const R = require('../js/routes')
  const flagged = R.SECTIONS.flatMap(s => s.tabs).filter(t => t.premium).map(t => t.id).sort()
  assert.deepStrictEqual(flagged, [...P.ORDER].sort())
})
