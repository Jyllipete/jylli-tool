'use strict'
// Every tier >= 2 tweak must carry a structured risk disclosure (what can happen / who should avoid it), in both languages.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { TAGS, RISK, LEGACY_UNDOCUMENTED } = require('../lib/tweak-risk')

const root = path.join(__dirname, '..')
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8').split('\n')
function tiers() {
  const out = {}
  let cur = null
  for (const l of main.slice(4700, 9000)) {
    let m = l.match(/^  '([a-z0-9-]+)': \{$/)
    if (m) cur = m[1]
    m = l.match(/^    safetyTier: (\d)/)
    if (m && cur) out[cur] = +m[1]
  }
  return out
}
let _L
function lang(code) {
  if (!_L) {
    const ctx = {}
    const src = ['en', 'fi'].map(c => fs.readFileSync(path.join(root, 'js', 'lang', c + '.js'), 'utf8')).join('\n')
    vm.runInNewContext(src + '\n;globalThis.__L = LANG', ctx)
    _L = ctx.__L
  }
  return _L[code]
}

const retiredBlock = main.join('\n')
const retired = new Set([...retiredBlock.slice(retiredBlock.indexOf('const RETIRED_TWEAKS = {'), retiredBlock.indexOf('let _retiredApplied')).matchAll(/^  '([a-z0-9-]+)':/gm)].map(m => m[1]))

test('tier >= 3 tweaks (not retired) have a risk entry with text in en and fi', () => {
  const t = tiers()
  const en = lang('en'), fi = lang('fi')
  for (const [id, tier] of Object.entries(t)) {
    if (tier < 3 || retired.has(id)) continue
    assert.ok(RISK[id], `${id}: missing lib/tweak-risk.js entry`)
    assert.ok((en.tweakRisk || {})[id] && en.tweakRisk[id].length, `${id}: missing en tweakRisk`)
    assert.ok((fi.tweakRisk || {})[id] && fi.tweakRisk[id].length, `${id}: missing fi tweakRisk`)
  }
})

test('tier 2 tweaks are documented or listed as legacy', () => {
  const t = tiers()
  for (const [id, tier] of Object.entries(t)) {
    if (tier !== 2 || retired.has(id) || /^(clean-|fix-)/.test(id)) continue
    assert.ok(RISK[id] || LEGACY_UNDOCUMENTED.includes(id), `${id}: tier 2 needs a risk entry (or LEGACY_UNDOCUMENTED)`)
  }
})

test('risk tags are known and have labels in both languages', () => {
  const en = lang('en'), fi = lang('fi')
  for (const [id, r] of Object.entries(RISK)) {
    assert.ok(['journal', 'manual', 'none'].includes(r.revert), `${id}: revert`)
    for (const tag of [...r.avoid, ...r.caution]) {
      assert.ok(TAGS.includes(tag), `${id}: unknown tag ${tag}`)
      assert.ok(en.riskTag[tag], `en riskTag ${tag}`)
      assert.ok(fi.riskTag[tag], `fi riskTag ${tag}`)
    }
  }
})
