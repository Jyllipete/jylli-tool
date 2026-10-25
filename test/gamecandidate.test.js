'use strict'
const test = require('node:test')
const assert = require('node:assert')
const { parseCandidateLines, pickCandidate } = require('../lib/gamecandidate')

test('parses a Steam library process and names it after the install folder', () => {
  const r = parseCandidateLines(['chrome.exe', '@@hades.exe|C:\\Program Files (x86)\\Steam\\steamapps\\common\\Hades\\x64\\Hades.exe'])
  assert.deepStrictEqual(r, [{ exe: 'hades.exe', name: 'Hades' }])
})

test('ignores helpers, installers and paths outside game libraries', () => {
  const r = parseCandidateLines([
    '@@crashhandler.exe|C:\\Games\\steamapps\\common\\X\\crashhandler.exe',
    '@@vc_redist.x64.exe|C:\\Games\\steamapps\\common\\X\\vc_redist.x64.exe',
    '@@notes.exe|C:\\Users\\Pete\\Documents\\notes.exe',
    '@@bad;name.exe|C:\\Games\\steamapps\\common\\X\\bad.exe',
  ])
  assert.deepStrictEqual(r, [])
})

test('pickCandidate skips known, blacklisted and already offered exes', () => {
  const cands = [{ exe: 'a.exe', name: 'A' }, { exe: 'b.exe', name: 'B' }, { exe: 'c.exe', name: 'C' }, { exe: 'd.exe', name: 'D' }]
  const pick = pickCandidate(cands, { known: new Set(['a.exe']), blacklist: ['B.exe'], offered: new Set(['c.exe']) })
  assert.strictEqual(pick.exe, 'd.exe')
  assert.strictEqual(pickCandidate([], {}), null)
})
