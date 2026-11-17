'use strict'
// Source-level guards for the Restore points "Lifeline" glue (main.js has no Electron-free harness, so the rules that must not regress are pinned the way
// test/perf-audit-wiring.test.js does it): every call the page makes has a preload method AND a main handler, the events exist on both ends, and the
// things other features still depend on were not removed.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n')
const main = read('main.js'), preload = read('preload.js'), page = read('js/restore/page.js'), svc = read('lib/restore/index.js'), nudge = read('js/restore-nudge-ui.js')
const kebab = name => name.replace(/^restore2/, 'restore2-').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace('restore2--', 'restore2-')
const calls = [...new Set([...(page + nudge).matchAll(/\bapi\.(restore2[A-Za-z]+)\(/g)].map(m => m[1]))]

test('the page calls the service only through restore2* methods that exist end to end', () => {
  assert.ok(calls.length >= 9, 'found ' + calls.join(','))
  for (const name of calls) {
    const ch = kebab(name)
    assert.match(preload, new RegExp(`^\\s{2}${name}:\\s+.*ipcRenderer\\.invoke\\('${ch}'`, 'm'), `preload ${name} -> ${ch}`)
    assert.ok(main.includes(`ipcMain.handle('${ch}'`), `main handler ${ch}`)
  }
})
test('every restore2 handler in main has a preload method (no orphan IPC)', () => {
  for (const m of main.matchAll(/ipcMain\.handle\('(restore2-[a-z-]+)'/g)) assert.ok(preload.includes(`'${m[1]}'`), 'preload for ' + m[1])
})
test('live events: preload subscribes to the channels the service emits', () => {
  for (const [on, ch] of [['onRestore2Changed', 'restore2-changed'], ['onRestore2Phase', 'restore2-phase']]) {
    assert.match(preload, new RegExp(`${on}:.*ipcRenderer\\.on\\('${ch}'`), on)
    assert.ok(svc.includes(`'${ch}'`), 'service emits ' + ch)
  }
  assert.match(nudge, /onRestore2Changed/)   // the nav dot follows any feature's restore point
  assert.match(page, /onRestore2Phase/)
})
test('main wiring: any feature that makes a point tells the tab, and the schedule is main-owned', () => {
  const fn = main.slice(main.indexOf('async function createRestorePointInternal'), main.indexOf('async function createRestorePointInternal') + 700)
  assert.match(fn, /_restoreSvc\.invalidate\(\)/)
  assert.match(main, /const MAIN_OWNED_SETTINGS = \[[^\]]*'autoSnapshotDays'/)
  assert.match(main, /restoreSvc\(\)\.hasPending\(\)/)                       // a restore requested before a reboot is reconciled after start
  assert.match(main, /setInterval\([^\n]*restoreSvc\(\)\.tick\(\)[^\n]*3600000\)\.unref\(\)/)   // hourly, never keeps the process alive
  assert.match(main, /isGameRunning: \(\) => _liveGameReasons\.size > 0/)    // never mid-game
})
test('main wiring: the restore service never gets a path or a command from the page', () => {
  const block = main.slice(main.indexOf("ipcMain.handle('restore2-scan'"), main.indexOf('// ─── Debloat: scan installed apps'))
  assert.match(block, /which === 'rstrui' \? 'rstrui\.exe' : which === 'protection' \? 'SystemPropertiesProtection\.exe' : null/)
  assert.doesNotMatch(block, /req\.(path|cmd|command|script|file)/)
  for (const m of block.matchAll(/ipcMain\.handle\('restore2-[a-z-]+'[^\n]*\n?/g)) assert.doesNotMatch(m[0], /runPS\(/, 'the page cannot send PowerShell')
})
test('what other features still use was kept, and the replaced handlers are gone', () => {
  for (const ch of ['create-restore-point', 'list-restore-points', 'get-restore-status', 'check-is-admin']) assert.ok(main.includes(`ipcMain.handle('${ch}'`), ch)
  for (const ch of ['restore-to-point', 'delete-restore-point', 'get-sr-disk-usage']) assert.ok(!main.includes(`ipcMain.handle('${ch}'`), ch + ' should be gone')
  for (const m of ['createRestorePoint', 'listRestorePoints', 'getRestoreStatus', 'saveTextFile', 'onAutoSnapshotDone', 'checkIsAdmin']) assert.match(preload, new RegExp(`^\\s{2}${m}:`, 'm'), m)
  assert.ok(svc.includes("emit('auto-snapshot-done'"), 'Home still listens for auto-snapshot-done')
})
test('the page is wired into the shell, the assets load, and the old page is gone', () => {
  const html = read('index.html')
  assert.match(html, /function buildRestorePoints\(c\)[\s\S]{0,300}JylliRestorePage\.mount/)
  for (const a of ['css/restore.css', 'js/lang/restore-en.js', 'js/lang/restore-fi.js', 'js/restore/pure.js', 'js/restore/views.js', 'js/restore/page.js']) assert.ok(html.includes(a), a)
  assert.ok(!html.includes('js/pages/system-restore.js')); assert.ok(!fs.existsSync(path.join(root, 'js/pages/system-restore.js')))
  assert.match(read('js/shell.js'), /restore: c => buildRestorePoints\(c\)/)
})
test('the preview fixture answers every restore2 call the page makes', () => {
  const fx = read('tools/ui-preview/restore-fixture.js')
  for (const name of calls) assert.ok(fx.includes(`case '${name}'`), 'fixture case ' + name)
})
