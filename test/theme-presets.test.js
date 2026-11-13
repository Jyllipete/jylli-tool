'use strict'
// Theme presets: accents stay in sync across windows, and the Liquid Glass material is isolated to its own attribute.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')

const index = read('index.html')
const themes = index.slice(index.indexOf('const THEMES = {'), index.indexOf('function applyTheme')).replace(/^\s*\/\/.*$/gm, '')
const entries = [...themes.matchAll(/^ {2}(\w+):\s+\{([\s\S]*?)(?=^ {2}\w+:\s+\{|^\})/gm)].map(m => ({ key: m[1], body: m[2] }))
const syncAccents = Object.fromEntries([...read('js/theme-sync.js').match(/const ACCENTS = \{([^}]*)\}/)[1].matchAll(/(\w+):\s*'(#[0-9a-fA-F]{6})'/g)].map(m => [m[1], m[2].toUpperCase()]))

test('every preset has the same accent in theme-sync.js (secondary windows)', () => {
  assert.ok(entries.length >= 9)
  for (const { key, body } of entries) {
    const accent = body.match(/accent:\s*'(#[0-9a-fA-F]{6})'/)[1].toUpperCase()
    assert.strictEqual(syncAccents[key], accent, key)
  }
})

test('only the liquid preset carries a material, and applyTheme clears it for the others', () => {
  const withMaterial = entries.filter(e => /material:/.test(e.body)).map(e => e.key)
  assert.deepStrictEqual(withMaterial, ['liquid'])
  const fn = index.slice(index.indexOf('function applyTheme'), index.indexOf('function applyAccentColor'))
  assert.match(fn, /dataset\.material\s*=\s*t\.material/)
  assert.match(fn, /delete document\.documentElement\.dataset\.material/)
})

test('every Liquid Glass rule is scoped to the preset attribute', () => {
  const css = read('css/liquid-glass.css').replace(/\/\*[\s\S]*?\*\//g, '')
  const rules = [...css.matchAll(/([^{}@]+)\{[^{}]*\}/g)].map(m => m[1].trim())
  assert.ok(rules.length > 10)
  for (const sel of rules) for (const part of sel.split(/,(?![^(]*\))/).map(s => s.trim()).filter(Boolean)) {
    if (/^\.j-theme\[data-theme="liquid"\]/.test(part)) continue   // the Settings swatch card
    assert.ok(part.startsWith(':root[data-material="liquid"]'), 'unscoped selector: ' + part)
  }
})

test('liquid-glass.css is loaded and the strings exist in English and Finnish', () => {
  assert.match(index, /css\/liquid-glass\.css/)
  for (const f of ['js/lang/en.js', 'js/lang/fi.js']) { const s = read(f); assert.match(s, /themeLiquidName:/); assert.match(s, /themeLiquidDesc:/) }
})
