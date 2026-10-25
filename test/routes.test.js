const test = require('node:test')
const assert = require('node:assert')
const R = require('../js/routes')

// Every id the old UI could pass to showPage (builders table + shims + CMD_PAGES)
const OLD_IDS = ['dashboard', 'preflight', 'fixes', 'restore-points', 'performance', 'gaming', 'network', 'privacy-cleanup', 'startup-manager',
  'process-manager', 'latency-monitor', 'bios-tuner', 'pulse', 'fivem', 'scheduler', 'changelog', 'settings',
  'windows-opti', 'hardware', 'debloater', 'cleanup', 'game-opti', 'app-optimizer']

test('every legacy page id resolves to a section and tab', () => {
  for (const id of OLD_IDS) {
    const r = R.resolve(id)
    assert.ok(r, id)
    assert.ok(R.section(r.section).tabs.some(t => t.id === r.tab), id)
  }
})

test('wrapper pages open their first tab; tab ids select within the section', () => {
  assert.deepStrictEqual(R.resolve('performance'), { section: 'optimize', tab: 'windows', page: 'windows-opti', premium: false })
  assert.strictEqual(R.resolve('hardware', 'gpu').tab, 'gpu')
  assert.strictEqual(R.resolve('hardware', 'gpu').page, 'hardware')
  assert.strictEqual(R.resolve('hardware', 'nope').tab, 'cpumem')
  assert.strictEqual(R.resolve('hardware').premium, true)
  assert.strictEqual(R.resolve('unknown-page'), null)
})

test('tab ids are unique per section and sections cover 5 destinations plus settings', () => {
  assert.deepStrictEqual(R.SECTIONS.map(s => s.id), ['home', 'optimize', 'gaming', 'clean', 'system', 'settings'])
  for (const s of R.SECTIONS) assert.strictEqual(new Set(s.tabs.map(t => t.id)).size, s.tabs.length, s.id)
})

test('entry remembers the last tab and falls back to the first', () => {
  assert.strictEqual(R.entry('clean', 'startup').page, 'startup-manager')
  assert.strictEqual(R.entry('clean', 'bogus').page, 'cleanup')
  assert.strictEqual(R.entry('nope'), null)
})
