// Source-level guards for the 2026-11 performance / automation audit (the main.js glue has no Electron-free harness, so the rules
// that must not regress are pinned the way test/audit2.test.js does it). Every rule is explained in docs/GAMEAUTO_EVIDENCE.md and docs/TRAY_FOOTPRINT.md.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n')
const main = read('main.js')
const fn = (name, src = main) => {
  const i = src.search(new RegExp('(?:async )?function ' + name + '\\b'))
  assert.ok(i >= 0, name + ' exists')
  const j = src.indexOf('\n}\n', i)
  return src.slice(i, j + 3)
}

test('a game session writes no MMCSS value and no FiveM compatibility flag', () => {
  const start = fn('gameSessionStart'), end = fn('gameSessionEnd')
  for (const body of [start, end]) {
    assert.ok(!/SystemResponsiveness|GPU Priority|AppCompatFlags|DISABLEDXMAXIMIZEDWINDOWEDMODE/.test(body.replace(/\/\/.*$/gm, '')), 'no MMCSS / compat-flag write')
  }
  assert.ok(!/watcher-mmcss/.test(start + end), 'sessions no longer take an MMCSS snapshot')
  assert.match(main, /pulseRecover[\s\S]{0,900}watcher-mmcss/, 'a leftover from an older version is still put back once')
})

test('every Pulse start and stop goes through the one owner', () => {
  assert.ok(!/autoPulseTriggeredPreset/.test(main), 'the "who started it" global is gone')
  assert.equal((main.match(/(?<!de)activatePulseCore\(/g) || []).length, 2, 'defined once, called once (inside the owner wiring)')
  assert.equal((main.match(/deactivatePulseCore\(/g) || []).length, 2, 'defined once, called once (inside the owner wiring)')
  assert.match(main, /pulse: \{[\s\S]{0,400}activatePulse\(id, false, gwLog, \{ auto: true \}\)/, 'Auto-Pulse starts as "auto"')
})

test('the profile runs through the profile planner after Auto-Pulse, via the session service', () => {
  assert.match(main, /profile: \{ apply: g => gameSessionProfile\(g\) \}/)
  assert.match(fn('gameSessionProfile'), /GameAutoProfile\.plan\(/)
  const svc = read('lib/gameauto/index.js')
  assert.ok(svc.indexOf('await apStart(game)') < svc.indexOf('deps.profile.apply'), 'profile after Auto-Pulse')
})

test('Competitive Mode ends an open session first and undoes newest first', () => {
  assert.match(main, /async function competeStartOwned[\s\S]{0,600}handOver\('competitive-mode'\)/)
  assert.ok(!/competeSvc\(\)\.start\(\{/.test(main.replace(/async function competeStartOwned[\s\S]*?\n}\n/, '')), 'every start goes through competeStartOwned')
  assert.ok(!/entries\.reverse\(\)/.test(fn('competeRestoreJournal')), 'journal.list is newest first already')
})

test('crash recovery is one ordered chain, not four timers', () => {
  const i = main.indexOf('const step = async fn =>')
  assert.ok(i > 0)
  const chain = main.slice(i, i + 1400)
  const order = ['pulseRecover()', 'appsSvc().recover()', 'competeSvc().recover()', 'gameAutoSvc().recover()', 'startWatcher()', 'competeFromArgv(']
  let at = -1
  for (const k of order) { const n = chain.indexOf(k); assert.ok(n > at, k + ' comes after the one before'); at = n }
  assert.ok(!/setTimeout\(\(\) => \{ appsSvc\(\)\.recover/.test(main) && !/setTimeout\(\(\) => \{ pulseRecover/.test(main))
})

test('hidden or idle: LibreHardwareMonitor, thermal guard, ARIA and the detector cost nothing they do not need to', () => {
  assert.ok(!/^  startLhm\(\)$/m.test(main), 'start-up does not start LibreHardwareMonitor unconditionally')
  assert.match(main, /TrayNeeds\.lhmWanted\(/)
  assert.match(fn('ensureLhm'), /startLhm\(\)/)
  const thermal = main.slice(main.indexOf("ipcMain.handle('thermal-start'"), main.indexOf("ipcMain.handle('thermal-stop'"))
  assert.match(thermal, /_thermalBusy/); assert.match(thermal, /uiWanted\(\)/)
  assert.match(main, /aria: !!_ariaEnabled && !!activeGameProfile/)
  const ctx = fn('_updateSystemContext')
  assert.ok(!/Win32_OperatingSystem|Win32_Processor|Get-Process/.test(ctx), 'RAM and CPU come from Node / the hub, names from the shared tasklist')
  assert.match(main, /_pathScanAt < 60000/)
})

test('Start hidden in the tray: --tray in the logon task, no window at start, a Settings row in both languages', () => {
  assert.match(fn('setStartupTask'), /--tray/)
  assert.match(main, /const START_IN_TRAY = process\.argv\.includes\('--tray'\)/)
  assert.match(main, /if \(START_IN_TRAY\) \{[\s\S]{0,700}createTray\(\)[\s\S]{0,500}\} else \{\s+startupTrace\('createWindow starting'\)\s+createWindow\(\)/)
  assert.match(read('preload.js'), /setStartInTray/)
  assert.match(read('js/pages/settings.js'), /settings-start-tray-check/)
  for (const f of ['js/lang/en.js', 'js/lang/fi.js']) assert.match(read(f), /settingsStartInTray:'/)
  // people who already had Start at Windows Startup keep their visible window: only an explicit "true" starts hidden
  assert.match(fn('setStartupTask'), /startInTray === true/)
})

test('the system poller reads RAM and uptime from the kernel and keeps the old WMI read as the fallback', () => {
  const ps = read('lib/os-poller.ps1')
  assert.match(ps, /GlobalMemoryStatusEx/); assert.match(ps, /GetTickCount64/)
  assert.match(ps, /else \{\s+\$os = Get-CimInstance Win32_OperatingSystem/)
})

test('the admin check is asked once per run and only a real answer is remembered; check-is-admin shares it', () => {
  const m = main.match(/async function checkAdmin\(\) \{[\s\S]*?\n\}\n/)
  assert.ok(m, 'checkAdmin not found')
  assert.match(m[0], /if \(_adminCached !== null\) return _adminCached/)
  assert.match(m[0], /out === 'True' \|\| out === 'False'\) _adminCached = isAdmin/)
  assert.match(main, /ipcMain\.handle\('check-is-admin', async \(\) => \(\{ isAdmin: await checkAdmin\(\) \}\)\)/)
})
