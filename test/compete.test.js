const test = require('node:test')
const assert = require('node:assert')
const P = require('../lib/compete/plan')
const S = require('../lib/compete/services')
const L = require('../lib/compete/launch')

const desktop = { form: 'desktop', dualCcdX3d: false, activePlan: { guid: P.BALANCED, name: 'Balanced' }, highPerfAvailable: true, coreKinds: ['skip0'], logical: 16, gameCls: 'Normal' }
const ids = r => r.steps.map(s => s.id + ':' + s.state)

test('default plan on a free desktop: priority, eco and power apply; nothing locked', () => {
  const r = P.plan({ opts: {}, facts: desktop, premium: false })
  assert.deepStrictEqual(ids(r), ['priority:apply', 'eco:apply', 'power:apply'])
  assert.strictEqual(r.steps[0].level, 'AboveNormal')
  assert.strictEqual(r.applied, 3)
})

test('priority never goes to Realtime and bad input falls back to the default', () => {
  assert.strictEqual(P.normalize({ priority: 'realtime' }).priority, 'above')
  assert.strictEqual(P.plan({ opts: { priority: 'high' }, facts: desktop }).steps[0].level, 'High')
  assert.strictEqual(P.plan({ opts: { priority: 'normal' }, facts: desktop }).steps.some(s => s.id === 'priority'), false)
})

test('power plan is skipped on laptops, dual-CCD X3D and when already high', () => {
  const reason = f => P.plan({ opts: { priority: 'normal', eco: false }, facts: Object.assign({}, desktop, f) }).steps[0].reason
  assert.strictEqual(reason({ form: 'laptop' }), 'laptop')
  assert.strictEqual(reason({ dualCcdX3d: true }), 'x3d')
  assert.strictEqual(reason({ activePlan: { guid: P.HIGH_PERF } }), 'already-high')
  assert.strictEqual(reason({ highPerfAvailable: false }), 'no-high')
  assert.strictEqual(reason({ activePlan: null }), 'unknown')
})

test('priority is skipped when the game already has a raised class', () => {
  const r = P.plan({ opts: { eco: false, power: false }, facts: Object.assign({}, desktop, { gameCls: 'High' }) })
  assert.deepStrictEqual(r.steps, [{ id: 'priority', state: 'skipped', reason: 'already-set' }])
})

test('premium steps are locked on a free account and run on premium', () => {
  const opts = { priority: 'normal', eco: false, power: false, cores: 'skip0', shield: true, services: true }
  assert.deepStrictEqual(ids(P.plan({ opts, facts: desktop, premium: false })), ['cores:locked', 'shield:locked', 'services:locked'])
  assert.deepStrictEqual(ids(P.plan({ opts, facts: desktop, premium: true })), ['cores:apply', 'shield:apply', 'services:apply'])
})

test('core plans only apply where the PC offers them; custom needs a sane list', () => {
  const run = (cores, customCpus, f) => P.plan({ opts: { priority: 'normal', eco: false, power: false, cores, customCpus }, facts: Object.assign({}, desktop, f), premium: true }).steps[0]
  assert.strictEqual(run('pcores').reason, 'not-on-this-pc')
  assert.strictEqual(run('pcores', [], { coreKinds: ['pcores'] }).state, 'apply')
  assert.strictEqual(run('custom', [0, 1]).reason, 'custom-too-few')
  assert.strictEqual(run('custom', [0, 1, 2, 99]).state, 'skipped')
  assert.strictEqual(run('custom', Array.from({ length: 16 }, (_, i) => i)).reason, 'custom-all')
  assert.deepStrictEqual(run('custom', [8, 2, 4, 6, 4]).cpus, [2, 4, 6, 8])
})

test('tray does not count as a change', () => {
  const r = P.plan({ opts: { priority: 'normal', eco: false, power: false, tray: true }, facts: desktop })
  assert.deepStrictEqual(ids(r), ['tray:apply'])
  assert.strictEqual(r.applied, 0)
})

test('only listed services can be paused, and the script names only those', () => {
  assert.strictEqual(S.validName('WSearch'), true)
  assert.strictEqual(S.validName('SysMain'), false)
  assert.ok(!S.pauseScript(['WSearch', "x'; calc; '"]).includes('calc'))
  assert.strictEqual(S.resumeScript(['nope']), '')
  assert.deepStrictEqual(S.parsePaused('JJSVC:WSearch\nJJSVC:Evil\r\nnoise'), ['WSearch'])
})

test('launch targets per store; bad ids give null', () => {
  assert.strictEqual(L.launchFor({ id: 'steam:730' }).url, 'steam://rungameid/730')
  assert.match(L.launchFor({ id: 'epic:Fortnite' }).url, /^com\.epicgames\.launcher:\/\/apps\/Fortnite\?action=launch/)
  assert.strictEqual(L.launchFor({ id: 'xbox:Pkg_8wekyb3d8bbwe', aumid: 'Pkg_8wekyb3d8bbwe!Game' }).target, 'shell:AppsFolder\\Pkg_8wekyb3d8bbwe!Game')
  assert.strictEqual(L.launchFor({ id: 'xbox:Pkg_8wekyb3d8bbwe' }), null)
  assert.deepStrictEqual(L.launchFor({ id: 'custom:D:\\Games\\a\\b.exe' }), { kind: 'exe', exe: 'D:\\Games\\a\\b.exe', cwd: 'D:\\Games\\a' })
  for (const id of ['steam:1;calc', 'epic:a b', 'custom:cmd.exe', 'custom:C:\\x\\y.bat', '', 'steam:']) assert.strictEqual(L.launchFor({ id }), null, id)
})

test('process match: under install folder, skips helpers and already-running exes', () => {
  const lines = ['@@crashhandler.exe|D:\\Lib\\Game\\crashhandler.exe', '@@other.exe|C:\\Windows\\other.exe', '@@old.exe|D:\\Lib\\Game\\old.exe', '@@game.exe|D:\\Lib\\Game\\bin\\game.exe']
  assert.deepStrictEqual(L.matchProcess(lines, { install: 'D:\\Lib\\Game' }, new Set(['old.exe'])), { exe: 'game.exe', path: 'D:\\Lib\\Game\\bin\\game.exe' })
  assert.strictEqual(L.matchProcess(lines, { install: 'D:\\Lib\\Gam' }), null)
  assert.strictEqual(L.matchProcess(lines, { customExe: 'C:\\Windows\\other.exe' }).exe, 'other.exe')
  assert.strictEqual(L.matchProcess([], { install: 'D:\\Lib' }), null)
})

test('command line: --compete takes only ids the launcher accepts; shortcut names are file-safe', () => {
  const BS = String.fromCharCode(92)
  assert.strictEqual(L.idFromArgv(['x.exe', '--compete', 'steam:730']), 'steam:730')
  assert.strictEqual(L.idFromArgv(['--compete=epic:Fortnite']), 'epic:Fortnite')
  assert.strictEqual(L.idFromArgv(['--compete', 'custom:D:' + BS + 'G' + BS + 'a.exe']), 'custom:D:' + BS + 'G' + BS + 'a.exe')
  for (const bad of ['steam:1;calc', 'custom:cmd.exe', 'epic:a b', '']) assert.strictEqual(L.idFromArgv(['--compete', bad]), null, bad)
  assert.strictEqual(L.idFromArgv([]), null)
  assert.strictEqual(L.shortcutName('A' + BS + 'B/C:D*E?F"G<H>I|J'), 'Competitive - A B C D E F G H I J.lnk')
  assert.ok(L.shortcutName('x'.repeat(300)).length <= 88)
})

test('tasklist liveness: same pid and image name only', () => {
  const A = require('../lib/compete/actions')
  const g = { pid: 4242, name: 'cs2' }
  assert.deepStrictEqual(A.aliveArgs(g), ['/FI', 'PID eq 4242', '/FO', 'CSV', '/NH'])
  assert.strictEqual(A.parseAliveTasklist('"cs2.exe","4242","Console","1","1,234 K"', g), true)
  assert.strictEqual(A.parseAliveTasklist('"other.exe","4242","Console","1","9 K"', g), false)
  assert.strictEqual(A.parseAliveTasklist('"cs2.exe","99","Console","1","9 K"', g), false)
  assert.strictEqual(A.parseAliveTasklist('INFO: No tasks are running which match the specified criteria.', g), false)
  assert.strictEqual(A.aliveArgs({ pid: 0 }), null)
})

test('Call of Duty HQ: the game is cod.exe, its helpers are never picked', () => {
  const dir = 'C:' + String.fromCharCode(92) + 'Program Files (x86)' + String.fromCharCode(92) + 'Steam' + String.fromCharCode(92) + 'steamapps' + String.fromCharCode(92) + 'common' + String.fromCharCode(92) + 'Call of Duty HQ'
  const BS = String.fromCharCode(92)
  const lines = ['bootstrapper.exe', 'CODSecureAttestationWizard.exe', 'ccsdownloader.exe', 'CODBrokerService.exe', 'codinstallcleaner.exe', 'codCrashHandler.exe', 'cod.exe'].map(e => '@@' + e + '|' + dir + BS + e)
  assert.strictEqual(L.matchProcess(lines, { install: dir }).exe, 'cod.exe')
})
