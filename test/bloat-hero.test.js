const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const vm = require('vm')
const H = require('../js/pages/bloat-hero')

const part = (n, total, measured = true) => ({ n, total, measured })

test('weights add up to 100', () => {
  assert.strictEqual(Object.values(H.WEIGHTS).reduce((a, b) => a + b, 0), 100)
})

test('tier boundaries', () => {
  const at = s => H.tierOf(s)
  assert.deepStrictEqual([0, 25, 26, 55, 56, 80, 81, 100].map(at), ['clean', 'clean', 'moderate', 'moderate', 'bloated', 'bloated', 'critical', 'critical'])
})

test('score is null until every source is measured', () => {
  const r = H.compute({ uwp: part(0, 10, false), svc: part(9, 14), task: part(16, 30) })
  assert.strictEqual(r.score, null)
  assert.strictEqual(r.tier, null)
  assert.strictEqual(r.partial, true)
  assert.strictEqual(H.compute({}).score, null)
})

test('score is the weighted share of each source', () => {
  assert.strictEqual(H.compute({ uwp: part(10, 10), svc: part(14, 14), task: part(30, 30) }).score, 100)
  assert.strictEqual(H.compute({ uwp: part(0, 10), svc: part(0, 14), task: part(0, 30) }).score, 0)
  const r = H.compute({ uwp: part(5, 10), svc: part(7, 14), task: part(15, 30) })
  assert.strictEqual(r.score, 50)
  assert.deepStrictEqual(r.parts.map(p => p.pts), [20, 18, 13])
})

test('zero totals and overshoot never give NaN or more than 100', () => {
  const r = H.compute({ uwp: part(3, 0), svc: part(99, 14), task: part(-4, 30) })
  assert.ok(Number.isFinite(r.score))
  assert.ok(r.score <= 100 && r.score >= 0)
  assert.strictEqual(r.parts[0].ratio, 0)
})

test('segments: proportional spans with gaps, fill length follows the ratio', () => {
  const r = H.compute({ uwp: part(5, 10), svc: part(0, 14), task: part(30, 30) })
  const s = H.segments(r.parts)
  assert.strictEqual(s.length, 3)
  const span = x => x.a1 - x.a0
  assert.ok(span(s[0]) > span(s[1]) && span(s[1]) > span(s[2]))
  assert.ok(s[1].a0 > s[0].a1, 'gap between arcs')
  assert.strictEqual(s[1].fill, '', 'empty source draws no fill')
  assert.notStrictEqual(s[2].fill, '')
})

test('trend: last score from before this visit, ignoring junk', () => {
  const h = [{ score: 60, ts: 1 }, { score: 52, ts: 2 }, { score: 40, ts: 10 }, null, { score: 'x', ts: 3 }]
  assert.strictEqual(H.trend(h, 5), 52)
  assert.strictEqual(H.trend(h, 1), null)
  assert.strictEqual(H.trend(null, 5), null)
})

test('every tier has a title and sentence in EN and FI (the old hero showed raw keys)', () => {
  const LANG = vm.runInNewContext([fs.readFileSync('js/lang/en.js', 'utf8'), fs.readFileSync('js/lang/fi.js', 'utf8'), ';LANG'].join('\n'), {})
  for (const lang of ['en', 'fi']) {
    for (const t of H.TIERS) {
      assert.ok(LANG[lang].ui['bloatTier_' + t], `${lang} bloatTier_${t}`)
      assert.ok(LANG[lang].ui['bloatDesc_' + t], `${lang} bloatDesc_${t}`)
    }
    for (const k of ['bhScanning', 'bhChecked', 'bhSrc_uwp', 'bhSrc_svc', 'bhSrc_task', 'bhOf', 'bhPts', 'bhLowerBetter', 'bhRescan', 'bhTrend', 'bsScoreLabel', 'bsScanPrompt', 'scanGaming']) {
      assert.ok(LANG[lang].ui[k], `${lang} ${k}`)
    }
  }
})
