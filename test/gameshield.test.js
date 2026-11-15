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

test('validateExclusion explains every rejection', () => {
  assert.deepEqual(G.validateExclusion(' OBS64 ', []), { ok: true, value: 'obs64.exe' })
  assert.equal(G.validateExclusion('', []).reason, 'empty')
  assert.equal(G.validateExclusion('a;calc', []).reason, 'format')
  assert.equal(G.validateExclusion('..\\x.exe', []).reason, 'format')
  assert.equal(G.validateExclusion('OBS64.exe', ['obs64.exe']).reason, 'duplicate')
  assert.equal(G.validateExclusion('new', Array.from({ length: 50 }, (_, i) => 'p' + i + '.exe')).reason, 'limit')
})

test('coverage says which phase would close a program, null when Game Shield never would', () => {
  assert.equal(G.coverage('OneDrive.exe'), 'launch')
  assert.equal(G.coverage('discord'), 'tier3')
  assert.equal(G.coverage('chrome.exe'), 'mid')
  assert.equal(G.coverage('obs64.exe'), null)
  assert.equal(G.coverage('steam.exe'), null)
})

test('steam and the Steam client are never in any kill list', () => {
  const all = [...G.TIER1, ...G.TIER3, ...G.BROWSERS]
  assert.ok(!all.includes('steam') && !all.includes('steamservice'))
})

test('restoreVerdict covers every outcome', () => {
  const ok = 'C:\\Apps\\a.exe'
  assert.equal(G.restoreVerdict({ path: ok, alreadyRunning: true }), 'already-running')
  assert.equal(G.restoreVerdict({ path: null }), 'no-path')
  assert.equal(G.restoreVerdict({ path: ok, exists: false }), 'missing')
  assert.equal(G.restoreVerdict({ path: ok, exists: true, started: false }), 'start-failed')
  assert.equal(G.restoreVerdict({ path: ok, exists: true, started: true }), 'restarted')
})
