const test = require('node:test')
const assert = require('node:assert/strict')
const G = require('../lib/gameshield')

test('normalizeExclusions lower-cases, adds .exe, dedupes and drops junk', () => {
  assert.deepEqual(G.normalizeExclusions(['Discord', 'discord.exe', ' OBS64.EXE ', '', 5, 'a;calc.exe', '..\\x.exe']), ['discord.exe', 'obs64.exe'])
  assert.deepEqual(G.normalizeExclusions('nope'), [])
  assert.equal(G.normalizeExclusions(Array.from({ length: 200 }, (_, i) => `p${i}`)).length, 50)
})

test('clampThresholds keeps mid-session at least 5 above tier 3', () => {
  assert.deepEqual(G.clampThresholds(70, 80), { tier3: 70, mid: 80 })
  assert.deepEqual(G.clampThresholds(90, 80), { tier3: 90, mid: 95 })
  assert.deepEqual(G.clampThresholds('x', undefined), { tier3: 70, mid: 80 })
  assert.equal(G.clampThresholds(10, 10).tier3, 50)
})

test('launch list: tier 3 only at or above the threshold, exclusions always win', () => {
  const low = G.launchKillList({ ramPct: 60, tier3Threshold: 70 })
  assert.ok(low.includes('onedrive') && !low.includes('discord'))
  const high = G.launchKillList({ ramPct: 75, tier3Threshold: 70, exclusions: ['discord.exe'] })
  assert.ok(high.includes('spotify') && !high.includes('discord'))
  assert.ok(!high.includes('steam'))
})

test('mid-session list needs the threshold and skips what is already stopped', () => {
  assert.deepEqual(G.midSessionKillList({ ramPct: 79, tier3Threshold: 70, midThreshold: 80 }), [])
  const l = G.midSessionKillList({ ramPct: 85, tier3Threshold: 70, midThreshold: 80, exclusions: ['chrome.exe'], alreadyStopped: ['discord'] })
  assert.ok(l.includes('msedge') && l.includes('spotify') && !l.includes('chrome') && !l.includes('discord'))
})

test('isRelaunchable accepts only absolute .exe paths', () => {
  assert.ok(G.isRelaunchable('C:\\Users\\me\\AppData\\Local\\Discord\\app-1\\Discord.exe'))
  assert.ok(!G.isRelaunchable('Discord.exe'))
  assert.ok(!G.isRelaunchable('C:\\a\\..\\b.exe'))
  assert.ok(!G.isRelaunchable('C:\\a\\b.bat'))
  assert.ok(!G.isRelaunchable(null))
})
