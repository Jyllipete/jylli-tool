'use strict'
// Round 3 (competitor comparison 2026-11-14): the six added tweaks exist everywhere they must, and the rejected ones stay out.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs'), path = require('path')
const root = path.join(__dirname, '..')
const src = fs.readFileSync(path.join(root, 'main.js'), 'utf8')
const win = require('../lib/windows/catalog.js')
const net = require('../lib/network/catalog.js')
const manifest = require('../lib/tweak-manifest.json')

const ADDED = { windows: ['game-mode-on', 'classic-context-menu', 'explorer-this-pc', 'menu-delay-short', 'bsod-no-autoreboot'], network: ['disable-llmnr'] }
const REJECTED = ['fast-udp-send', 'mouse-throttling', 'ctfmon-off', 'audio-enhancements-off', 'ndu-off', 'desktop-safe-mode-menu', 'vulnerable-driver-blocklist-off', 'smartscreen-off', 'uac-off', 'cfg-off']

test('added tweaks: a TWEAKS entry, a catalog row, EN + FI names and descriptions', () => {
  const lang = {}
  for (const l of ['en', 'fi']) {
    global.LANG = { en: { tweakNames: {}, tweakDescs: {} }, fi: { tweakNames: {}, tweakDescs: {} } }
    for (const f of [`windows-${l}.js`, `network-${l}.js`]) {
      const code = fs.readFileSync(path.join(root, 'js', 'lang', f), 'utf8')
      new Function('LANG', code)(global.LANG)
    }
    lang[l] = global.LANG[l]
  }
  for (const [scope, ids] of Object.entries(ADDED)) {
    const cat = scope === 'windows' ? win : net
    for (const id of ids) {
      assert.ok(src.includes(`  '${id}': {`), `${id} missing from TWEAKS`)
      assert.ok(cat.isKnown ? cat.isKnown(id) : cat.byId[id], `${id} missing from the ${scope} catalog`)
      assert.ok(manifest[id], `${id} missing from tweak-manifest.json (run node tools/journal-coverage.js)`)
      for (const l of ['en', 'fi']) assert.ok(lang[l].tweakDescs[id], `${id} has no ${l} description`)
    }
  }
  for (const id of ['classic-context-menu', 'explorer-this-pc', 'menu-delay-short', 'bsod-no-autoreboot', 'disable-llmnr']) {
    for (const l of ['en', 'fi']) assert.ok(lang[l].tweakNames[id], `${id} has no ${l} name`)
  }
})

test('rejected tweaks stay out of TWEAKS and the catalogs', () => {
  for (const id of REJECTED) {
    assert.ok(!src.includes(`  '${id}': {`), id)
    assert.ok(!win.byId[id] && !net.byId[id], id)
  }
})

test('manual-only: the security and shell preferences never run from Auto-Optimize', () => {
  const ao = require('../lib/auto-opti/catalog.js')
  const never = ao.NEVER_AUTO || new Set()
  for (const id of ['disable-llmnr', 'bsod-no-autoreboot', 'classic-context-menu', 'explorer-this-pc', 'menu-delay-short']) assert.ok(never.has(id) || (ao.isAllowedTweak && !ao.isAllowedTweak(id)), id)
})

test('added probes read real registry paths (a lost backslash would silently read nothing)', () => {
  for (const [scope, ids] of Object.entries(ADDED)) {
    const cat = scope === 'windows' ? win : net
    for (const id of ids) for (const pr of cat.byId[id].probe || []) {
      if (pr.r) assert.ok(pr.r.startsWith('HKCU:\\') || pr.r.startsWith('HKLM:\\'), id); assert.ok(pr.r.split(String.fromCharCode(92)).length >= 3, id)
    }
  }
  // Inside main.js the PowerShell strings sit in JS single quotes, so every path separator must be written as two backslashes.
  const block = src.slice(src.indexOf('// ── Round 3 (competitor comparison'), src.indexOf("  'driver-updates-off': {"))
  for (const m of block.matchAll(/HK(?:CU|LM):[^"']*/g)) assert.ok(!/[^\\]\\[^\\]/.test(m[0]), m[0])
})
