'use strict'
const test = require('node:test')
const assert = require('node:assert')
const ao = require('../lib/auto-opti')
const { P } = require('./fixtures/auto-opti/profiles')

const F = (name, ctx = {}) => ao.findings.findings(P[name](), { useCase: 'fps', ...ctx })
const ids = list => list.map(f => f.id)
const plan = (name, ctx = {}, pctx = {}) => ao.plan.plan(F(name, ctx), { premium: false, ...pctx })
const tweaksOf = pl => pl.steps.filter(s => s.type === 'tweak').map(s => s.tweakId)

// ── ram parts ──
test('part numbers decode to a rated speed, unknown parts stay null', () => {
  const r = ao.ramParts.ratedFromPart
  assert.strictEqual(r('CMK32GX4M2B3200C16').ratedMT, 3200)
  assert.strictEqual(r('CMH32GX5M2B6000C36').ratedMT, 6000)
  assert.strictEqual(r('F4-3600C16D-32GVKC').ratedMT, 3600)
  assert.strictEqual(r('F5-6000J3038F16GX2-TZ5RK').ratedMT, 6000)
  assert.strictEqual(r('KF436C17BB/16').ratedMT, 3600)
  assert.strictEqual(r('KF560C40-16').ratedMT, 6000)
  assert.strictEqual(r('BL2K16G36C16U4B').ratedMT, 3600)
  assert.strictEqual(r('TF3D416G3600HC18JDC01').ratedMT, 3600)
  assert.strictEqual(r('AX4U32008G16A-DCBK').ratedMT, 3200)
  assert.strictEqual(r('M471A1K43DB1-CTD'), null)
  assert.strictEqual(r(''), null)
  assert.strictEqual(r(null), null)
})

test('xmpState: part number proves XMP is off; JEDEC alone is only a hint', () => {
  const off = ao.ramParts.xmpState([{ part: 'F4-3600C16D-32GVKC', speedMT: 2133, ratedMT: 2133 }], 'DDR4')
  assert.strictEqual(off.state, 'off'); assert.strictEqual(off.confidence, 'measured'); assert.strictEqual(off.ratedMT, 3600)
  const hint = ao.ramParts.xmpState([{ part: 'M378A', speedMT: 2133, ratedMT: 2133 }], 'DDR4')
  assert.strictEqual(hint.state, 'unknown'); assert.strictEqual(hint.jedecOnly, true); assert.strictEqual(hint.ratedMT, null)
  const on = ao.ramParts.xmpState([{ part: 'F4-3600C16D', speedMT: 3600, ratedMT: 3600 }], 'DDR4')
  assert.strictEqual(on.state, 'on')
  assert.strictEqual(ao.ramParts.xmpState([], 'DDR4').state, 'unknown')
})

// ── display ──
test('pickMode only returns a real gain at the current resolution', () => {
  const d = { cur: { w: 2560, h: 1440, hz: 60 }, modes: [{ w: 2560, h: 1440, hz: 60 }, { w: 2560, h: 1440, hz: 144 }, { w: 1920, h: 1080, hz: 240 }] }
  assert.deepStrictEqual(ao.display.pickMode(d), { w: 2560, h: 1440, hz: 144 })   // 240 Hz at 1080p is a resolution change: ignored
  assert.strictEqual(ao.display.pickMode({ cur: { w: 1, h: 1, hz: 60 }, modes: [{ w: 1, h: 1, hz: 59 }] }), null)
  assert.strictEqual(ao.display.pickMode({ cur: { w: 1, h: 1, hz: 60 }, modes: [{ w: 1, h: 1, hz: 62 }] }), null)   // under 3 Hz
  assert.strictEqual(ao.display.pickMode(null), null)
})

test('display list parser rejects odd device names and sets the per-display max', () => {
  const out = 'REMOTE=0\nDISP=\\\\.\\DISPLAY1|Dell|1|1920|1080|60|32|1920x1080@60,1920x1080@144\nDISP=bad|X|0|1|1|1|1|1x1@1\nEDIDMAX=144'
  const r = ao.display.parseList(out)
  assert.strictEqual(r.displays.length, 1)
  assert.strictEqual(r.displays[0].maxHzAtCur, 144)
  assert.strictEqual(r.displays[0].edidMaxHz, 144)
  assert.strictEqual(r.remote, false)
})

test('setScript validates the device and mode (nothing user-shaped reaches PowerShell)', () => {
  const ok = ao.display.setScript('\\\\.\\DISPLAY2', { w: 2560, h: 1440, hz: 165 }, 'persist')
  assert.match(ok, /\[JD\]::Set\('\\\\\.\\DISPLAY2', 2560, 1440, 165, 1\)/)
  assert.throws(() => ao.display.setScript("\\\\.\\DISPLAY1'; calc #", { w: 1, h: 1, hz: 60 }, 'test'))
  assert.throws(() => ao.display.setScript('\\\\.\\DISPLAY1', { w: '1; calc', h: 1080, hz: 60 }, 'test'))
  assert.throws(() => ao.display.setScript('\\\\.\\DISPLAY1', { w: 1920, h: 1080, hz: 60 }, 'nope'))
  assert.strictEqual(ao.display.setOk('JDRESULT=0'), true)
  assert.strictEqual(ao.display.setOk('JDRESULT=-2'), false)
})

// ── startup ──
test('startup classification: launchers and chat are safe, security and drivers never', () => {
  const c = ao.startup.categoryOf
  assert.strictEqual(c('Steam'), 'launcher'); assert.strictEqual(c('Discord'), 'chat'); assert.strictEqual(c('Spotify'), 'media')
  assert.strictEqual(c('SecurityHealth'), 'security'); assert.strictEqual(c('Avast Antivirus'), 'security')
  assert.strictEqual(c('RtkAudUService'), 'driver'); assert.strictEqual(c('LGHUB'), 'driver'); assert.strictEqual(c('Corsair iCUE'), 'driver')
  assert.strictEqual(c('SomeUnknownTool'), 'unknown')
  const s = ao.startup.summarize([{ name: 'Steam', enabled: true }, { name: 'SecurityHealth', enabled: true }, { name: 'OneDrive', enabled: true }, { name: 'Discord', enabled: false }])
  assert.strictEqual(s.enabledCount, 3)
  assert.deepStrictEqual(s.candidates.map(i => i.name).sort(), ['OneDrive', 'Steam'])
  assert.strictEqual(s.items.find(i => i.name === 'OneDrive').defaultOn, false)   // cloud is opt-in
  assert.strictEqual(s.items.find(i => i.name === 'Steam').defaultOn, true)
})

// ── probes ──
test('probe parsers: garbage and empty output give null, never a guessed slice', () => {
  for (const pr of ao.probes.PROBES) {
    if (pr.id === 'net') continue
    assert.strictEqual(pr.parse(''), null, pr.id)
    assert.strictEqual(pr.parse('not json at all'), null, pr.id)
  }
  assert.strictEqual(ao.probes.parseNet('').net.primary, 'none')
})

test('parsePower reads the scheme and the overlay', () => {
  const r = ao.probes.parsePower('{"guid":"a1841308-3541-4fab-bc81-f71556f20b4a","name":"Power saver","overlayAc":"961CC777-2547-4F9D-8174-7D86181B8A7A","onAC":true}')
  assert.strictEqual(r.power.kind, 'saver'); assert.strictEqual(r.power.overlayKind, 'efficiency'); assert.strictEqual(r.power.onAC, true)
})

test('parseWindows: absent Game Mode value means on; explicit 0 means off; Finnish-locale service text still parses', () => {
  const a = ao.probes.parseWindows('{"build":26100,"ubr":1,"gameMode":null,"appCapture":1,"mouseSpeed":"1","stickyFlags":"510","diagTrack":"Automaattinen","tasks":[{"name":"a","on":true},{"name":"b","on":false}]}')
  assert.strictEqual(a.gaming.gameMode, true); assert.strictEqual(a.gaming.bgCapture, true)
  assert.strictEqual(a.input.mouseAccel, true); assert.strictEqual(a.input.stickyHotkey, true)
  assert.strictEqual(a.background.diagTrackOn, true); assert.strictEqual(a.background.telemetryTasksOn, 1)
  const b = ao.probes.parseWindows('{"build":19045,"gameMode":0,"stickyFlags":"506"}')
  assert.strictEqual(b.gaming.gameMode, false); assert.strictEqual(b.input.stickyHotkey, false); assert.strictEqual(b.os.win11, false)
})

test('parseNet: the default-route adapter decides wired vs wireless', () => {
  assert.strictEqual(ao.probes.parseNet('{"name":"Wi-Fi","desc":"Intel AX201","media":"Native 802.11"}').net.primary, 'wifi')
  const e = ao.probes.parseNet('{"name":"Ethernet","desc":"Realtek","media":"802.3","eee":[{"n":"Energy Efficient Ethernet","v":"Enabled"}]}').net
  assert.strictEqual(e.primary, 'ethernet'); assert.strictEqual(e.eee, 'on')
})

test('parseStorage: pagefile disabled only when nothing manages one', () => {
  const base = { free: 10 * 1024 ** 3, used: 90 * 1024 ** 3, media: 'SSD', trimDisabled: 0, tempBytes: 5, wuBytes: 0 }
  const s = o => ao.probes.parseStorage(JSON.stringify({ ...base, ...o })).storage
  assert.strictEqual(s({ autoPagefile: false, pagefileSettings: 0, pagingFiles: '' }).pagefileDisabled, true)
  assert.strictEqual(s({ autoPagefile: true, pagefileSettings: 0, pagingFiles: '' }).pagefileDisabled, false)
  assert.strictEqual(s({ autoPagefile: false, pagefileSettings: 1, pagingFiles: 'C:\\pagefile.sys 0 0' }).pagefileDisabled, false)
  assert.strictEqual(s({ trimDisabled: 1 }).trimOn, false)
  assert.strictEqual(s({}).pctFree, 10)
})

// ── detect ──
test('detect: a failed or hung probe leaves its fields unset, the others still land, concurrency stays at 4', async () => {
  let running = 0, peak = 0
  const events = []
  const runPS = async (script, t) => {
    running++; peak = Math.max(peak, running)
    await new Promise(r => setTimeout(r, 5)); running--
    if (/Get-NetRoute/.test(script)) return { ok: false, err: 'timeout' }
    if (/powercfg \/getactivescheme/.test(script)) return { ok: true, out: '{"guid":"381b4222-f694-41f0-9685-ff5bb260df2e","name":"Balanced","onAC":true}' }
    return { ok: true, out: 'garbage' }
  }
  const p = await ao.detect.detect({ runPS, emit: e => events.push(e) }, { admin: true, scanId: 's1' })
  assert.ok(peak <= ao.detect.CONCURRENCY)
  assert.strictEqual(p.power.kind, 'balanced')
  assert.strictEqual(p.probes.net.ok, false)
  assert.strictEqual(p.probes.hw.ok, false)
  assert.strictEqual(p.cpu, undefined)
  assert.strictEqual(events.filter(e => e.state === 'start').length, ao.probes.PROBES.length)
  assert.ok(events.some(e => e.probe === 'power' && e.state === 'done' && e.chips.length))
  assert.ok(events.some(e => e.probe === 'net' && e.state === 'fail'))
})

test('detect: a probe thrown error is contained', async () => {
  const p = await ao.detect.detect({ runPS: async () => { throw new Error('boom') } }, {})
  assert.ok(Object.values(p.probes).every(x => x.ok === false))
})

// ── findings ──
test('healthy desktop: no performance findings beyond the always-available tidy-ups', () => {
  const f = F('healthy')
  assert.deepStrictEqual(ids(f).sort(), ['ui-snappy', 'usb-suspend'])
})

test('no probes at all: no findings (unknown is never a finding)', () => {
  assert.deepStrictEqual(F('no-probes'), [])
})

test('60 Hz on a 144 Hz panel is the headline finding, with the real numbers', () => {
  const f = F('60-on-144')[0]
  assert.strictEqual(f.id, 'display-refresh'); assert.strictEqual(f.impact, 'high')
  assert.deepStrictEqual([f.before.v, f.expectedAfter.v], [60, 144])
  assert.deepStrictEqual(f.detail.targets[0], { device: '\\\\.\\DISPLAY1', monitor: 'LG 27GP850', w: 2560, h: 1440, hz: 144, from: 60 })
  assert.strictEqual(f.defaultOn, true)
})

test('laptop: refresh fix is offered but not on by default; AC overlay offered for gaming; never max-perf, hibernate or USB', () => {
  const f = F('intel-laptop')
  assert.strictEqual(f.find(x => x.id === 'display-refresh').defaultOn, false)
  assert.ok(ids(f).includes('power-laptop-ac'))
  const t = tweaksOf(plan('intel-laptop', {}, { include: ['display-refresh'] }))
  for (const bad of ['intel-power-plan', 'amd-power-plan', 'usb-suspend', 'hibernate', 'fast-startup-off', 'cpu-parking']) assert.ok(!t.includes(bad), bad)
})

test('laptop on battery gets no display or power-mode finding', () => {
  const p = P['intel-laptop'](); p.power.onAC = false
  const f = ao.findings.findings(p, { useCase: 'fps' })
  assert.ok(!ids(f).includes('display-refresh')); assert.ok(!ids(f).includes('power-laptop-ac'))
})

test('remote session: never touch the display', () => {
  const p = P['60-on-144'](); p.remoteSession = true
  assert.ok(!ids(ao.findings.findings(p, {})).includes('display-refresh'))
})

test('dual-CCD X3D: balanced plan + Game Mode, never a max-performance plan or core-parking change', () => {
  const pl = plan('x3d-desktop')
  const t = tweaksOf(pl)
  assert.ok(t.includes('x3d-balanced')); assert.ok(t.includes('game-mode-on'))
  for (const bad of ['amd-power-plan', 'intel-power-plan', 'cpu-parking', 'hvci-offload']) assert.ok(!t.includes(bad), bad)
  assert.ok(ids(F('x3d-desktop')).includes('x3d-driver'))
  // Game Bar must stay intact on dual-CCD parts: the capture fix only turns background capture off
  assert.ok(t.includes('game-dvr'))
})

test('single-CCD X3D on Balanced gets the AMD plan, not the X3D special case', () => {
  const t = tweaksOf(plan('x3d-single'))
  assert.ok(t.includes('amd-power-plan')); assert.ok(!t.includes('x3d-balanced'))
})

test('Intel desktop on Balanced gets the Intel plan; High performance already is fine', () => {
  const p = P.healthy(); p.power = { guid: '381b4222-f694-41f0-9685-ff5bb260df2e', name: 'Balanced', kind: 'balanced', onAC: true }
  assert.ok(tweaksOf(ao.plan.plan(ao.findings.findings(p, { useCase: 'fps' }), {})).includes('intel-power-plan'))
  assert.ok(!ids(F('healthy')).includes('power-desktop'))
})

test('single DIMM and XMP off become manual cards, never fixes', () => {
  const f = F('single-dimm')
  const xmp = f.find(x => x.id === 'ram-xmp-off'), ch = f.find(x => x.id === 'ram-single-channel')
  assert.ok(xmp && ch)
  assert.strictEqual(xmp.kind, 'manual'); assert.strictEqual(ch.kind, 'manual')
  assert.deepStrictEqual([xmp.before.v, xmp.expectedAfter.v], [2133, 3600])
  assert.strictEqual(plan('single-dimm').steps.some(s => /ram/.test(s.findingId)), false)
})

test('low disk space is a warning, and the junk cleaner is offered', () => {
  const f = F('low-disk')
  assert.strictEqual(f.find(x => x.id === 'disk-low').kind, 'manual')
  assert.strictEqual(f.find(x => x.id === 'junk').undoable, false)
})

test('Wi-Fi primary never gets NIC tweaks; wired with EEE on does', () => {
  assert.ok(!ids(F('intel-laptop')).includes('nic-eee'))
  assert.ok(ids(F('wifi-eth-desktop')).includes('nic-eee'))
})

test('stream use case turns Power Throttling off; other use cases do not', () => {
  assert.ok(ids(F('stream-obs', { useCase: 'stream' })).includes('power-throttling-stream'))
  assert.ok(!ids(F('stream-obs', { useCase: 'fps' })).includes('power-throttling-stream'))
  assert.strictEqual(F('stream-obs', { useCase: 'stream' }).find(x => x.id === 'power-throttling-stream').defaultOn, true)
  assert.strictEqual(F('stream-obs', { useCase: 'fps' }).find(x => x.id === 'usb-suspend').defaultOn, true)
  assert.strictEqual(F('stream-obs', { useCase: 'stream' }).find(x => x.id === 'usb-suspend').defaultOn, false)
})

test('hibernate question: a user who uses hibernate keeps it', () => {
  assert.ok(ids(F('cluttered')).includes('hibernate'))
  assert.ok(!ids(F('cluttered', { answers: { useHibernate: true } })).includes('hibernate'))
})

test('already-applied one-shots do not reappear', () => {
  const f = F('healthy', { applied: new Set(['usb-suspend', 'visual-effects', 'explorer-perf']) })
  assert.deepStrictEqual(f, [])
})

test('security shield: findings are information only and never carry steps', () => {
  const p = P.healthy(); p.security = { ...p.security, firewallOn: false, defenderRtp: false, uac: 'off', windowsUpdate: 'disabled' }
  const f = ao.findings.findings(p, {}).filter(x => x.module === 'security')
  assert.deepStrictEqual(f.map(x => x.id).sort(), ['shield-defender', 'shield-firewall', 'shield-uac', 'shield-update'])
  assert.ok(f.every(x => x.kind === 'info' && x.steps.length === 0 && !x.defaultOn))
  // a third-party AV makes Defender being passive normal, not a warning
  p.security.thirdPartyAv = ['Bitdefender']
  assert.ok(!ao.findings.findings(p, {}).some(x => x.id === 'shield-defender'))
})

test('HVCI is only raised on CPUs where it is costly, and only as an opt-in card', () => {
  assert.strictEqual(ao.findings.hvciCostly('Intel(R) Core(TM) i7-6700K'), true)
  assert.strictEqual(ao.findings.hvciCostly('Intel(R) Core(TM) i7-8700K'), false)
  assert.strictEqual(ao.findings.hvciCostly('Intel(R) Core(TM) i5-13600K'), false)
  assert.strictEqual(ao.findings.hvciCostly('AMD Ryzen 5 2600'), true)
  assert.strictEqual(ao.findings.hvciCostly('AMD Ryzen 5 5600X'), false)
  const p = P.healthy(); p.cpu.name = 'Intel(R) Core(TM) i7-6700K'; p.security.hvci = 'on'
  const h = ao.findings.findings(p, {}).find(x => x.id === 'hvci-cost')
  assert.ok(h && h.kind === 'info' && h.optIn === 'hvci' && !h.defaultOn)
  assert.deepStrictEqual(ao.plan.plan(ao.findings.findings(p, {}), { include: ['hvci-cost'] }).steps.filter(s => /hvci/.test(s.tweakId || '')), [])
})

test('findings are sorted by impact first', () => {
  const f = F('cluttered')
  const rank = { high: 3, medium: 2, low: 1 }
  for (let i = 1; i < f.length; i++) assert.ok(rank[f[i - 1].impact] >= rank[f[i].impact])
})

// ── plan ──
test('plan: display first, plan-switch before powercfg tweaks, cleanup last', () => {
  const pl = plan('cluttered')
  const order = pl.steps.map(s => s.module)
  assert.strictEqual(order[0], 'display')
  assert.strictEqual(order[order.length - 1], 'cleanup')
  const mi = ao.catalog.MODULES
  for (let i = 1; i < order.length; i++) assert.ok(mi.indexOf(order[i - 1]) <= mi.indexOf(order[i]))
  const pidx = pl.steps.findIndex(s => s.tweakId === 'intel-power-plan'), uidx = pl.steps.findIndex(s => s.tweakId === 'usb-suspend')
  assert.ok(pidx >= 0 && uidx > pidx)
})

test('plan: no redundant, low-value or side-effect-prone tweak and nothing from NEVER_AUTO is ever emitted, for every fixture and use case', () => {
  for (const name of Object.keys(P)) for (const useCase of ao.catalog.USE_CASES) {
    const list = ao.findings.findings(P[name](), { useCase })
    const pl = ao.plan.plan(list, { premium: true, include: list.map(f => f.id) })
    for (const s of pl.steps) if (s.tweakId) assert.ok(!ao.catalog.NEVER_AUTO.has(s.tweakId), `${name}/${useCase}: ${s.tweakId}`)
  }
})

test('plan: premium findings are stripped for free users, kept for premium', () => {
  const p = P.healthy(); p.context = { apps: { fivem: true } }
  const list = ao.findings.findings(p, { useCase: 'fps' })
  assert.ok(list.some(f => f.id === 'fivem'))
  assert.ok(!ao.plan.plan(list, { premium: false }).steps.some(s => s.findingId === 'fivem'))
  assert.ok(ao.plan.plan(list, { premium: false }).skipped.some(s => s.reason === 'premium'))
  assert.ok(ao.plan.plan(list, { premium: true }).steps.some(s => s.tweakId === 'fivem-priority'))
})

test('plan: exclude beats default, include adds an off-by-default finding, module toggle drops a module', () => {
  const list = F('cluttered')
  assert.ok(!ao.plan.plan(list, { exclude: ['display-refresh'] }).steps.some(s => s.findingId === 'display-refresh'))
  const lap = ao.findings.findings(P['intel-laptop'](), { useCase: 'fps' })
  assert.ok(!ao.plan.plan(lap, {}).steps.some(s => s.findingId === 'display-refresh'))
  assert.ok(ao.plan.plan(lap, { include: ['display-refresh'] }).steps.some(s => s.findingId === 'display-refresh'))
  assert.ok(!ao.plan.plan(list, { modules: { startup: false } }).steps.some(s => s.module === 'startup'))
})

test('plan: startup cleanup takes only classified-safe names, minus the user\'s unticks; an empty list drops the step', () => {
  const list = F('cluttered')
  const s = ao.plan.plan(list, {}).steps.find(x => x.control === 'startup-cleanup')
  assert.deepStrictEqual(s.params.items.sort(), ['Discord', 'EpicGamesLauncher', 'Spotify', 'Steam', 'Teams'])
  assert.ok(!s.params.items.includes('SecurityHealth') && !s.params.items.includes('RtkAudUService') && !s.params.items.includes('OneDrive'))
  const s2 = ao.plan.plan(list, { itemExclude: { 'startup-apps': ['Steam'] } }).steps.find(x => x.control === 'startup-cleanup')
  assert.ok(!s2.params.items.includes('Steam'))
  const s3 = ao.plan.plan(list, { startupItems: ['SecurityHealth', 'Bogus'] })
  assert.ok(!s3.steps.some(x => x.control === 'startup-cleanup'))
})

test('plan: reboot flag, estimate includes the restore point, empty plan is empty', () => {
  const pl = plan('cluttered')
  assert.strictEqual(pl.rebootRequired, true)           // hags + the pagefile style steps
  assert.ok(pl.estSeconds >= ao.plan.RESTORE_POINT_SEC)
  assert.deepStrictEqual(ao.plan.plan([], {}), { steps: [], modules: [], estSeconds: 0, rebootRequired: false, skipped: [], selected: [], intensity: 'safe', expertOk: [] })
})

test('plan: a tampered include of a security finding or unknown id builds nothing', () => {
  const list = F('healthy')
  const pl = ao.plan.plan(list, { include: ['shield-firewall', 'defender-quiet', '../x'] })
  assert.deepStrictEqual(pl.steps.filter(s => !['ui-snappy', 'usb-suspend'].includes(s.findingId)), [])
})

// ── catalog invariants ──
test('catalog: every step is allowlisted, nothing in NEVER_AUTO is reachable, every fix has a default list', () => {
  const okT = ao.catalog.allowedTweaks()
  for (const [id, c] of Object.entries(ao.catalog.CATALOG)) {
    // Maximum rows are reachable only through isAllowedTweak (see test/auto-opti-max.test.js), never through the Safe allowlist.
    for (const s of c.steps) if (s.type === 'tweak' && c.intensity !== 'max') { assert.ok(okT.has(s.id), `${id} -> ${s.id}`); assert.ok(!ao.catalog.NEVER_AUTO.has(s.id), `${id} -> ${s.id}`) }
    if (c.kind === 'fix') assert.ok(Array.isArray(c.defaultOn), id)
    if (c.kind !== 'fix') assert.strictEqual(c.steps.length, 0, `${id} must not carry steps`)
    assert.ok(ao.catalog.MODULES.includes(c.module) || c.module === 'security', id)
  }
  for (const id of ['security-quiet', 'security-toast-off', 'defender-quiet', 'hvci-offload', 'vbs-disable']) assert.ok(ao.catalog.NEVER_AUTO.has(id) && !okT.has(id))
})

// ── describe ──
test('describe: registry changes become readable before -> after pairs', () => {
  const d = ao.describe.describeEntry({ changes: [
    { kind: 'reg', path: 'HKCU:\\System\\GameConfigStore', name: 'GameDVR_Enabled', before: { exists: true, type: 'DWord', value: 1 }, after: { exists: true, type: 'DWord', value: 0 } },
    { kind: 'reg', path: 'HKCU:\\System\\GameConfigStore', name: 'Noop', before: { exists: true, value: 1 }, after: { exists: true, value: 1 } },
    { kind: 'display-mode', device: 'D1', before: { exists: true, value: 60 }, after: { exists: true, value: 165 } },
    { kind: 'reg', path: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run', name: 'Spotify', before: { exists: true, value: [2, 0] }, after: { exists: true, value: [3, 0] } },
    { kind: 'unresolved', cmd: 'netsh' },
  ] })
  assert.strictEqual(d.length, 3)
  assert.deepStrictEqual([d[0].labelKey, d[0].before.v, d[0].after.v], ['bgCapture', 'on', 'off'])
  assert.deepStrictEqual([d[1].labelKey, d[1].before.v, d[1].after.v, d[1].unit], ['refreshRate', '60', '165', 'Hz'])
  assert.deepStrictEqual([d[2].labelKey, d[2].label, d[2].before.v, d[2].after.v], ['startupItem', 'Spotify', 'on', 'off'])
})

test('describe: a setting changed twice shows first before and last after', () => {
  const r = (b, a) => ({ kind: 'reg', path: 'HKLM:\\X', name: 'HwSchMode', before: { exists: true, value: b }, after: { exists: true, value: a } })
  const d = ao.describe.describeEntry({ changes: [r(1, 0), r(0, 2)] })
  assert.strictEqual(d.length, 1); assert.deepStrictEqual([d[0].before.v, d[0].after.v], ['off', 'on'])
})

test('power mode overlay: only GUIDs reach PowerShell, output is parsed strictly', () => {
  const ov = require('../lib/auto-opti/overlay')
  assert.match(ov.setScript(ov.PERFORMANCE), /\[guid\]'ded574b5-45a0-4f42-8737-46345c09c238'/)
  assert.throws(() => ov.setScript("x'; calc; '"))
  assert.strictEqual(ov.parseRead('JOVL=DED574B5-45A0-4F42-8737-46345C09C238 RC=0'), 'ded574b5-45a0-4f42-8737-46345c09c238')
  assert.strictEqual(ov.parseRead('JOVL=00000000-0000-0000-0000-000000000000 RC=5'), null)
  assert.strictEqual(ov.setOk('JOSET=0'), true); assert.strictEqual(ov.setOk('JOSET=87'), false)
})
