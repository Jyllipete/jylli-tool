// Tweak audit 2 (14 Nov 2026): guards for what the audit changed. See docs/TWEAK_EVIDENCE.md "Audit 2".
const test = require('node:test')
const assert = require('node:assert')
const os = require('os')
const path = require('path')
const fs = require('fs')
const { createJournalService } = require('../lib/journal-service')
const winCatalog = require('../lib/windows/catalog')
const cpuCatalog = require('../lib/cpumem/catalog')
const autoCat = require('../lib/auto-opti/catalog')
const debloatCatalog = require('../lib/debloat/catalog')
const classify = require('../lib/debloat/classify')
const cpuFindings = require('../lib/cpumem/findings')
const diagFindings = require('../lib/diagnostics/findings')
const repairs = require('../lib/diagnostics/repair')
const probes = require('../lib/diagnostics/probes')

const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8')
const BS = String.fromCharCode(92)

/** The source text of one TWEAKS / APP_OPTIMIZER_TWEAKS entry: from "  'id': {" to the next top-level entry. */
function entry(id) {
  const a = main.indexOf(`\n  '${id}': {`)
  assert.ok(a >= 0, 'entry exists: ' + id)
  const b = main.indexOf('\n  \'', a + 10)
  return main.slice(a, b > 0 ? b : a + 4000)
}
const applyPart = src => src.slice(src.indexOf('apply:'), src.indexOf('restore:') > 0 ? src.indexOf('restore:') : undefined)

test('retired in audit 2: the five security tweaks refuse apply, stay restorable and stay banned from Auto-Optimize', () => {
  const ids = ['defender-quiet', 'rt-scan-trim', 'defender-core-off', 'defender-idle-priority', 'full-mitigation-wipe']
  const block = main.slice(main.indexOf('const RETIRED_TWEAKS = {'), main.indexOf('function retireFivemTweaks'))
  for (const id of ids) {
    assert.ok(block.includes(`'${id}':`), 'in RETIRED_TWEAKS: ' + id)
    assert.ok(entry(id).includes('restore:'), 'keeps restore: ' + id)
    assert.ok(autoCat.FOREVER_BANNED.has(id), 'still banned: ' + id)
    const inWin = winCatalog.byId[id], inCpu = cpuCatalog.byId[id]
    assert.strictEqual((inWin || inCpu).lane, 'retired', id)
  }
})

test('Windows tab: nothing that hides security alerts or has no evidence is in the recommended set', () => {
  for (const id of ['security-quiet', 'security-toast-off', 'disable-fso', 'do-solo-mode', 'compat-scanner-off', 'diag-tasks-off', 'defender-quiet'])
    assert.ok(!winCatalog.byId[id] || !winCatalog.byId[id].rec, id)
  // do-solo-mode and disable-delivery-opt write the same value: never both recommended
  assert.ok(!(winCatalog.byId['do-solo-mode'].rec && winCatalog.byId['disable-delivery-opt'].rec))
})

test('Windows tab: probes read what the tweak writes', () => {
  const p = id => JSON.stringify(winCatalog.byId[id].probe || [])
  assert.ok(p('explorer-perf').includes('StartupDelayInMSec') && !p('explorer-perf').includes('LaunchTo'))
  assert.ok(p('disable-background-apps').includes('GlobalUserDisabled'))
  assert.ok(p('compat-scanner-off').includes('ProgramDataUpdater') && !p('compat-scanner-off').includes('PcaSvc'))
  assert.ok(p('diagnostics-off').includes('WdiServiceHost') && !p('diagnostics-off').includes('DPS'))
  assert.ok(!p('search-cloud-off').includes('BingSearchEnabled'))
  assert.deepStrictEqual(winCatalog.byId['usb-suspend'].probe || [], [], 'powercfg setting: no registry probe, so the state stays honestly unknown')
})

test('fallback restores never turn protections off', () => {
  const trim = entry('trim-enable'), page = entry('pagefile-auto')
  const trimRestore = trim.slice(trim.indexOf('restore:'))
  assert.ok(!/DisableDeleteNotification\s+-Value\s+1/.test(trimRestore), 'TRIM restore must not disable TRIM')
  const pageRestore = page.slice(page.indexOf('restore:'))
  assert.ok(!/PagingFiles\s+-Value\s+@\(\)/.test(pageRestore), 'page-file restore must not write an empty list')
})

test('Restore button puts back the recorded original, not a hardcoded default', async () => {
  const reg = { ['HKCU' + BS + 'Mouse|MouseSpeed']: { type: 'REG_SZ', value: '0' } }
  const runCmd = async c => {
    let m = c.match(/^reg query "(.+?)" \/v "(.+?)"$/)
    if (m) { const e = reg[m[1] + '|' + m[2]]; return { ok: !!e, out: e ? `    ${m[2]}    ${e.type}    ${e.value}` : '', code: e ? 0 : 1 } }
    m = c.match(/^reg add "(.+?)" \/v "(.+?)" \/t (\S+) \/d "(.+?)" \/f$/)
    if (m) { reg[m[1] + '|' + m[2]] = { type: m[3], value: m[4] }; return { ok: true, out: '' } }
    m = c.match(/^reg delete "(.+?)" \/v "(.+?)" \/f$/)
    if (m) { delete reg[m[1] + '|' + m[2]]; return { ok: true, out: '' } }
    return { ok: true, out: '' }
  }
  let ownRestoreRan = 0
  const tweaks = {
    'disable-mouse-accel': { safetyTier: 1, apply: async (s, ps, cmd, regAdd) => { await regAdd('HKCU', 'Mouse', 'MouseSpeed', 'REG_SZ', '1') }, restore: async (s, ps, cmd, regAdd) => { ownRestoreRan++; await regAdd('HKCU', 'Mouse', 'MouseSpeed', 'REG_SZ', '7') } },
    'power-balanced-restore': { safetyTier: 1, apply: async () => {}, restore: async () => { ownRestoreRan++ } },
  }
  const svc = createJournalService({
    file: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'a2-')), 'j.jsonl'),
    runPS: async () => ({ ok: true, out: '' }), runCmd, tweaks,
    hasTweak: (id, a = 'apply') => !!tweaks[id] && typeof tweaks[id][a] === 'function',
    isPlanExcluded: () => false, requiresPremium: () => false, createRestorePoint: async () => ({ ok: true }),
    emit: () => {}, loadSettings: () => ({}), saveSettings: () => {},
  })
  await svc.invokeTweak('disable-mouse-accel', 'apply', () => {})
  assert.strictEqual(reg['HKCU' + BS + 'Mouse|MouseSpeed'].value, '1')
  await svc.invokeTweak('disable-mouse-accel', 'restore', () => {})
  assert.strictEqual(reg['HKCU' + BS + 'Mouse|MouseSpeed'].value, '0', 'the user had it at 0, not the Windows default')
  assert.strictEqual(ownRestoreRan, 0, 'the hardcoded restore did not run')
  // a tweak that snapshots something the journal cannot read keeps its own restore
  await svc.invokeTweak('power-balanced-restore', 'restore', () => {})
  assert.strictEqual(ownRestoreRan, 1)
})

test('Apps tab: launchers are never set to Idle, nothing applies from the old table, steam.cfg is not written', () => {
  const block = main.slice(main.indexOf('const APP_OPTIMIZER_TWEAKS = {'), main.indexOf('async function appsLegacyRestore'))
  assert.ok(!block.includes('apply:'), 'the old table only restores')
  assert.ok(!block.includes('BootStrapperInhibitAll=enable'), 'steam.cfg is never written')
  for (const id of ['ea-app-optimize', 'riot-optimize', 'playnite-optimize']) assert.ok(entry(id).includes('restore:'), id + ' stays restorable')
  const known = require('../lib/apps/known'), appsCat = require('../lib/apps/catalog'), rules = require('../lib/apps/rules')
  for (const r of appsCat.ROWS) { const app = known.BY_ID[r.app]; if (app.role === 'launcher') assert.ok(false, 'no persistent change on a launcher: ' + r.id) }
  for (const app of known.APPS.filter(x => x.role === 'launcher')) assert.ok(!rules.allowed(app).includes('quiet'), app.id)
})

test('Diagnostics: leftover launcher priorities are found and one repair removes them', () => {
  const idleLauncher = { list: [{ exe: 'steam.exe', cpu: 1, io: null }], steamCfg: true }
  const r = diagFindings.evaluate({ data: { launchers: idleLauncher }, takenAt: Date.now() })
  const f = r.findings.find(x => x.id === 'launcher-idle-priority')
  assert.ok(f, 'finding fires')
  assert.deepStrictEqual(f.fix, { kind: 'repair', id: 'launcher-priority' })
  assert.deepStrictEqual(f.vars, { list: 'steam, steam.cfg' })
  const clean = diagFindings.evaluate({ data: { launchers: { list: [], steamCfg: false } }, takenAt: Date.now() })
  assert.ok(!clean.findings.some(x => x.id === 'launcher-idle-priority'))
  assert.ok(clean.passed.some(x => x.id === 'launcher-idle-priority'), 'shown as passed when the probe ran clean')
  assert.ok(repairs.meta('launcher-priority'), 'repair registered')
  assert.strictEqual(repairs.meta('launcher-priority').risk, 'safe')
})

test('Diagnostics probe parses the launcher reading and rejects garbage', () => {
  const p = probes.byId.launchers
  const out = probes.MARK + JSON.stringify({ ok: true, list: [{ exe: 'RiotClientServices.exe', cpu: 1, io: 0 }], steamCfg: false })
  assert.deepStrictEqual(p.parse(out), { list: [{ exe: 'RiotClientServices.exe', cpu: 1, io: 0 }], steamCfg: false })
  assert.strictEqual(p.parse('nothing'), null)
})

test('Debloat: SysMain is never pre-ticked, and Game Bar stays on a dual-CCD X3D', () => {
  assert.strictEqual(debloatCatalog.CATALOG.find(i => i.id === 'svc:SysMain').lane, 'review')
  const gameBar = debloatCatalog.CATALOG.find(i => i.id === 'app:Microsoft.XboxGamingOverlay')
  const items = [{ ...gameBar, state: 'on' }]
  const normal = classify.classify(items, { x3dDual: 0 }, { gaming: true })
  assert.strictEqual(normal[gameBar.id].lane, gameBar.lane)
  const x3d = classify.classify(items, { x3dDual: 1 }, { gaming: true })
  assert.strictEqual(x3d[gameBar.id].lane, 'kept')
  assert.deepStrictEqual(x3d[gameBar.id].reason, { code: 'use', arg: 'x3dDual' })
})

test('CPU & Memory: Game Mode off is flagged only on a dual-CCD X3D', () => {
  const caps = dual => ({ cpu: { dualCcdX3d: dual, name: 'Ryzen 9 7950X3D', vendor: 'amd' }, tools: { amd3dSvc: true }, os: {}, sec: {}, form: 'desktop' })
  const run = (c, gameMode) => cpuFindings.statics({ caps: c, topo: null, mods: { list: [] }, status: {}, scheme: 'balanced', gameMode, base: 4200 }).map(f => f.id)
  assert.ok(run(caps(true), 0).includes('x3d-gamemode-off'))
  assert.ok(!run(caps(true), 1).includes('x3d-gamemode-off'))
  assert.ok(!run(caps(true), null).includes('x3d-gamemode-off'), 'unset = Windows default = on')
  assert.ok(!run(caps(false), 0).includes('x3d-gamemode-off'))
  assert.ok(cpuFindings.IDS.includes('x3d-gamemode-off'))
})

test('fix-wifi no longer wipes the firewall rules and takes a restore point', () => {
  const src = entry('fix-wifi')
  assert.ok(!src.includes('advfirewall reset'))
  assert.ok(/safetyTier:\s*2/.test(src))
})

test('Audit-2 description files load after the older ones and cover every retired and rewritten id', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8')
  const order = html.match(/js\/lang\/[a-z-]+\.js/g)
  assert.ok(order.indexOf('js/lang/audit-en.js') > order.indexOf('js/lang/cpumem-en.js'))
  assert.ok(order.indexOf('js/lang/audit-fi.js') > order.indexOf('js/lang/windows-fi.js'))
  const vm = require('vm'), ctx = { console, window: {} }
  vm.createContext(ctx)
  for (const f of order) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f })
  const descs = lang => vm.runInContext(`LANG.${lang}.tweakDescs`, ctx)
  for (const id of ['defender-quiet', 'rt-scan-trim', 'defender-core-off', 'defender-idle-priority', 'full-mitigation-wipe']) {
    assert.ok(/^Retired/.test(descs('en')[id]), id)
    assert.ok(/^Poistettu käytöstä/.test(descs('fi')[id]), id)
  }
  for (const id of ['intel-power-plan', 'amd-power-plan', 'pcie-power', 'gpu-hags-off', 'dns-cloudflare', 'dns-google', 'dns-quad9', 'dns-adguard', 'dns-custom'])
    assert.ok(descs('en')[id] && descs('fi')[id], 'has a description in both languages: ' + id)
  // no description may promise a number nobody measured
  for (const lang of ['en', 'fi']) for (const [id, text] of Object.entries(descs(lang)))
    if (['defender-idle-priority', 'compat-scanner-off', 'gpu-hwsch'].includes(id)) assert.ok(!/\d+\s*(–|-)\s*\d+\s*ms/.test(text), `${lang}/${id} promises milliseconds`)
})

test('launcher probe and repair scripts carry real registry paths (backslashes intact)', () => {
  const p = require('../lib/diagnostics/probes').byId.launchers.script
  const r = fs.readFileSync(path.join(__dirname, '..', 'lib', 'diagnostics', 'repair.js'), 'utf8')
  const ifeo = ['HKLM:', 'SOFTWARE', 'Microsoft', 'Windows NT', 'CurrentVersion', 'Image File Execution Options'].join(String.fromCharCode(92)).replace('HKLM:' + String.fromCharCode(92), 'HKLM:' + String.fromCharCode(92))
  assert.ok(p.includes(ifeo), 'probe IFEO path')
  assert.ok(r.includes(ifeo), 'repair IFEO path')
  assert.ok(p.includes("$b + '" + String.fromCharCode(92) + "' + $_ + '" + String.fromCharCode(92) + "PerfOptions'"), 'probe joins path parts with a backslash')
  assert.ok(r.includes("$b + '" + String.fromCharCode(92) + "' + $e + '" + String.fromCharCode(92) + "PerfOptions'"), 'repair joins path parts with a backslash')
  const names = diagFindings.evaluate({ data: { launchers: { list: [{ exe: 'steam.exe', cpu: 1, io: null }], steamCfg: false } }, takenAt: Date.now() }).findings[0]
  assert.deepStrictEqual(names.vars, { list: 'steam' })
})
