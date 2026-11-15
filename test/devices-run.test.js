const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { service, detect, controls, polling } = require('../lib/devices-all')

const PROBE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/devices/probe-desktop.json'), 'utf8'))
const clone = o => JSON.parse(JSON.stringify(o))

// The probe's parsed shape back into what the PowerShell script prints.
function rawLine(probe) {
  return detect.MARK + JSON.stringify({
    admin: probe.admin, sec: probe.sec, pnp: probe.pnp, hid: probe.hid, bt: probe.bt,
    monitors: probe.monitors.map(m => ({ id: m.id, mfr: m.mfr, model: m.model, code: m.code, year: m.year, serialLen: m.hasSerial ? 8 : 0, w: m.wCm, h: m.hCm })),
  })
}

/** A fake PC: the device probe, the keyboard registry values, the journal, the poll helper. */
function makePc(over = {}) {
  const pc = Object.assign({
    probe: clone(PROBE), probeFails: false, calls: { probe: 0, poll: 0, live: 0, kbdRead: 0 },
    kbd: { delay: 1, speed: 31 }, ignoreWrites: false, journal: [], liveApplied: null,
    pollOut: null, openedPath: null, store: null,
  }, over)
  pc.runPS = async script => {
    if (script.includes(detect.MARK)) { pc.calls.probe++; return pc.probeFails ? { ok: false, out: '' } : { ok: true, out: 'noise\n' + rawLine(pc.probe) } }
    if (script.includes(controls.kbdReadScript().split('\n')[1])) { pc.calls.kbdRead++; return { ok: true, out: 'JJKBD:' + JSON.stringify(pc.kbd) } }
    if (script.includes('SystemParametersInfo')) { pc.calls.live++; const m = /0x17, (\d+).*\n.*0x0B, (\d+)/.exec(script); pc.liveApplied = { delay: Number(m[1]), speed: Number(m[2]) }; return { ok: true, out: 'JJKBDLIVE:{}' } }
    if (script.includes('RegisterRawInputDevices')) { pc.calls.poll++; return { ok: true, out: pc.pollOut || 'JJPOLL:' + JSON.stringify({ ok: true, seconds: 4, synthetic: 0, devices: [] }) } }
    return { ok: false, out: '' }
  }
  pc.runRecorded = async (control, action, meta, fn) => {
    const entry = { control, action, undone: false, before: Object.assign({}, pc.kbd) }
    pc.journal.push(entry)
    await fn(async () => ({ ok: true }), async cmd => {
      const m = /\/v (KeyboardDelay|KeyboardSpeed) \/t REG_SZ \/d (\d+) \/f/.exec(cmd)
      if (!m) throw new Error('unexpected command ' + cmd)
      if (!pc.ignoreWrites) pc.kbd[m[1] === 'KeyboardDelay' ? 'delay' : 'speed'] = Number(m[2])
      return { ok: true, out: '', code: 0 }
    })
  }
  pc.undoControl = async control => {
    const e = [...pc.journal].reverse().find(x => x.control === control && !x.undone)
    if (!e) return { ok: true, found: 0 }
    pc.kbd = Object.assign({}, e.before); e.undone = true
    return { ok: true, found: 1 }
  }
  return pc
}
function svcOf(pc, o = {}) {
  let t = 1000000
  const st = { v: pc.store }
  const s = service.create(Object.assign({
    runPS: pc.runPS, runRecorded: pc.runRecorded, undoControl: pc.undoControl, now: () => (t += 1000),
    getRig: async () => ({ cpu: { name: 'AMD Ryzen 7' }, gpus: [], ram: null, drives: [], board: null, adapters: [] }),
    windowsStatus: async () => ({ 'disable-mouse-accel': 'on' }), appInstalled: async () => ({ ghub: true }),
    resolveApp: async id => (id === 'ghub' ? 'C:\\Program Files\\LGHUB\\lghub.exe' : null), openPath: async p => { pc.openedPath = p; return '' },
    state: { read: () => st.v, write: v => { st.v = clone(v) } },
    platform: 'win32',
  }, o))
  s._advance = ms => { t += ms }; s._state = () => st.v
  return s
}

test('scan: devices, software devices, core parts, controls and findings in one snapshot', async () => {
  const pc = makePc(), s = svcOf(pc)
  const r = await s.scan()
  assert.strictEqual(r.ok, true)
  const snap = r.snap
  assert.strictEqual(snap.error, '')
  assert.strictEqual(snap.read, true)
  assert.ok(snap.devices.filter(d => d.category === 'mouse').length === 2)
  assert.ok(snap.software.length >= 5)
  assert.strictEqual(snap.core[0].title, 'AMD Ryzen 7')
  assert.deepStrictEqual(snap.kbd, { delay: 1, speed: 31 })
  const kb = snap.devices.find(d => d.category === 'keyboard')
  assert.strictEqual(kb.controls.change[0].id, 'kbd-repeat')
  assert.strictEqual(kb.controls.app.name, 'Logitech G HUB')
  assert.strictEqual(kb.controls.app.installed, true)
  assert.strictEqual(snap.devices.find(d => d.category === 'mouse').controls.link[0].status, 'on')
  assert.ok(snap.findings.some(f => f.id === 'device_problem'))
  assert.ok(JSON.stringify(snap).indexOf('instanceIds') === -1, 'full instance ids never reach the page')
})

test('scan is cached for a few seconds, force rescans, and concurrent scans share one probe', async () => {
  const pc = makePc(), s = svcOf(pc)
  await Promise.all([s.scan(), s.scan(), s.scan()])
  assert.strictEqual(pc.calls.probe, 1)
  await s.scan()
  assert.strictEqual(pc.calls.probe, 1)
  await s.scan({ force: true })
  assert.strictEqual(pc.calls.probe, 2)
})

test('a failed probe is reported as such, with the remembered state untouched', async () => {
  const pc = makePc(), s = svcOf(pc)
  await s.scan()
  const before = JSON.stringify(s._state())
  pc.probeFails = true
  const r = await s.scan({ force: true })
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.snap.error, 'probe_failed')
  assert.strictEqual(r.snap.read, false)
  assert.deepStrictEqual(r.snap.devices, [])
  assert.deepStrictEqual(r.snap.disconnected, [], 'not "everything was unplugged"')
  assert.strictEqual(JSON.stringify(s._state()), before)
})

test('a throwing runPS dependency never throws out of scan', async () => {
  const pc = makePc(), s = svcOf(pc, { runPS: async () => { throw new Error('spawn failed') } })
  const r = await s.scan()
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.snap.read, false)
})

test('an unplugged device shows as disconnected on the next scan, and "forget" removes it', async () => {
  const pc = makePc(), s = svcOf(pc)
  await s.scan()
  const ids = pc.probe.pnp.filter(d => /VID_373B/.test(d.id)).map(d => d.id)
  pc.probe.pnp = pc.probe.pnp.filter(d => !ids.includes(d.id))
  pc.probe.hid = pc.probe.hid.filter(h => !ids.includes(h.id))
  const r = await s.scan({ force: true })
  assert.strictEqual(r.snap.disconnected.length, 1)
  const d = r.snap.disconnected[0]
  assert.match(d.title, /dongle/i)
  assert.deepStrictEqual(await s.forget({ id: d.id }), { ok: true })
  assert.strictEqual((await s.scan({ force: true })).snap.disconnected.length, 0)
  assert.deepStrictEqual(await s.forget({ id: 'nope' }), { ok: false, error: 'unknown_device' })
})

test('unsupported platform: every call says so and nothing runs', async () => {
  const pc = makePc(), s = svcOf(pc, { platform: 'linux' })
  for (const r of [await s.scan(), await s.pollTest(), await s.kbdSet({ delay: 1, speed: 1 }), await s.kbdUndo(), await s.openApp({ id: 'ghub' })]) assert.deepStrictEqual(r, { ok: false, error: 'unsupported_platform' })
  assert.deepStrictEqual(pc.calls, { probe: 0, poll: 0, live: 0, kbdRead: 0 })
})

// ── polling test ────────────────────────────────────────────────────────────────────────────────────────────────────────
const bins = hz => { const o = []; for (let i = 0; i < 40; i++) o.push(i % 7 === 6 ? 0 : hz / 10); return o }
const pollLine = devs => 'JJPOLL:' + JSON.stringify({ ok: true, seconds: 4, synthetic: 2, devices: devs })
const wlPath = '\\\\?\\HID#VID_36A7&PID_A881&MI_00#8&3578d41d&0&0000#{378de44c-56ef-11d1-bc8c-00a0c91405dd}'
const wlPath2 = '\\\\?\\HID#VID_36A7&PID_A881&MI_01&Col01#8&d0e2654&0&0000#{378de44c-56ef-11d1-bc8c-00a0c91405dd}'

test('polling test: the measurement is tied to ONE physical mouse and shown on its card as measured', async () => {
  const w = bins(1000)
  const pc = makePc({ pollOut: pollLine([{ path: wlPath, n: w.reduce((a, b) => a + b, 0), w }, { path: '\\\\?\\HID#VID_FFFF&PID_0001#a#{x}', n: 10, w: [1, 1] }]) }), s = svcOf(pc)
  await s.scan()
  const r = await s.pollTest({ seconds: 4 })
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.synthetic, 2)
  assert.strictEqual(r.unmatched, 1, 'a mouse we cannot match to a device is reported, not attached to the wrong one')
  assert.strictEqual(r.results.length, 1)
  assert.strictEqual(r.results[0].estimate.hz, 1000)
  const snap = (await s.scan()).snap
  const wl = snap.devices.find(d => d.title === 'WLMOUSE BEAST MAX')
  assert.strictEqual(wl.facts.polling.value, 1000)
  assert.strictEqual(wl.facts.polling.source, 'measured')
  const other = snap.devices.find(d => /dongle/i.test(d.title))
  assert.strictEqual(other.facts.polling.value, null)
  assert.strictEqual(other.facts.polling.reason, 'not_measured')
})

test('polling test: several interfaces of one mouse count once (the busiest one wins)', async () => {
  const a = bins(500), b = bins(1000)
  const pc = makePc({ pollOut: pollLine([{ path: wlPath, n: 200, w: a }, { path: wlPath2, n: 400, w: b }]) }), s = svcOf(pc)
  await s.scan()
  const r = await s.pollTest()
  assert.strictEqual(r.results.length, 1)
  assert.strictEqual(r.results[0].estimate.hz, 1000)
})

test('polling test: no movement or too little is "not measured", never a made-up number', async () => {
  const pc = makePc({ pollOut: pollLine([{ path: wlPath, n: 3, w: [1, 1, 1] }]) }), s = svcOf(pc)
  await s.scan()
  const r = await s.pollTest()
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.results[0].estimate.ok, false)
  const wl = (await s.scan()).snap.devices.find(d => d.title === 'WLMOUSE BEAST MAX')
  assert.strictEqual(wl.facts.polling.value, null)
})

test('polling test: a helper that fails is an error, and two tests at once are refused', async () => {
  const pc = makePc({ pollOut: 'JJPOLL:' + JSON.stringify({ ok: false, error: 'register' }) }), s = svcOf(pc)
  assert.deepStrictEqual(await s.pollTest(), { ok: false, error: 'register' })
  const pc2 = makePc({ pollOut: 'garbage' }), s2 = svcOf(pc2)
  assert.deepStrictEqual(await s2.pollTest(), { ok: false, error: 'helper_failed' })
  const pc3 = makePc({ pollOut: pollLine([]) }), s3 = svcOf(pc3)
  const [x, y] = await Promise.all([s3.pollTest(), s3.pollTest()])
  assert.ok([x, y].some(r => r.error === 'busy'))
})

// ── keyboard repeat: journaled, applied live, READ BACK, undoable ───────────────────────────────────────────────────────
test('keyboard repeat: set, read back, applied to the session, journaled; undo puts the old values back live', async () => {
  const pc = makePc(), s = svcOf(pc)
  const r = await s.kbdSet({ delay: 0, speed: 20 })
  assert.strictEqual(r.ok, true)
  assert.deepStrictEqual(r.before, { delay: 1, speed: 31 })
  assert.deepStrictEqual(r.after, { delay: 0, speed: 20 })
  assert.deepStrictEqual(pc.kbd, { delay: 0, speed: 20 })
  assert.deepStrictEqual(pc.liveApplied, { delay: 0, speed: 20 })
  assert.strictEqual(pc.journal.length, 1)
  assert.strictEqual(pc.journal[0].control, 'devices:kbd-repeat')
  const u = await s.kbdUndo()
  assert.strictEqual(u.ok, true)
  assert.deepStrictEqual(pc.kbd, { delay: 1, speed: 31 })
  assert.deepStrictEqual(pc.liveApplied, { delay: 1, speed: 31 }, 'undo also reaches the running session')
})

test('keyboard repeat: values outside the documented range are refused before anything is written', async () => {
  const pc = makePc(), s = svcOf(pc)
  for (const bad of [{ delay: 4, speed: 5 }, { delay: -1, speed: 5 }, { delay: 1, speed: 32 }, { delay: 1.5, speed: 5 }, { delay: 'x', speed: 5 }, {}, null]) assert.deepStrictEqual(await s.kbdSet(bad), { ok: false, error: 'invalid_value' })
  assert.strictEqual(pc.journal.length, 0)
  assert.strictEqual(pc.calls.live, 0)
})

test('keyboard repeat: a write Windows ignored is reported as not verified, and the session is left alone', async () => {
  const pc = makePc({ ignoreWrites: true }), s = svcOf(pc)
  const r = await s.kbdSet({ delay: 0, speed: 20 })
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.error, 'verify_failed')
  assert.strictEqual(pc.calls.live, 0)
})

test('keyboard repeat: an unreadable current value stops before any write', async () => {
  const pc = makePc(); const base = pc.runPS
  pc.runPS = async script => (script.includes('JJKBD:') && !script.includes('SystemParametersInfo') ? { ok: false, out: '' } : base(script))
  const s = svcOf(pc)
  assert.deepStrictEqual(await s.kbdSet({ delay: 0, speed: 20 }), { ok: false, error: 'unreadable' })
  assert.strictEqual(pc.journal.length, 0)
})

test('the keyboard commands are plain registry writes the journal understands', () => {
  assert.deepStrictEqual(controls.kbdCommands(2, 15), [
    'reg add "HKCU\\Control Panel\\Keyboard" /v KeyboardDelay /t REG_SZ /d 2 /f',
    'reg add "HKCU\\Control Panel\\Keyboard" /v KeyboardSpeed /t REG_SZ /d 15 /f',
  ])
  const cp = require('../lib/cmd-parse')
  const d = cp.parseCmd ? cp.parseCmd(controls.kbdCommands(2, 15)[0]) : null
  if (d) assert.ok(d.kind === 'reg' || (Array.isArray(d) && d[0].kind === 'reg'))
})

test('vendor app: only a known companion app, only when installed, only through the injected opener', async () => {
  const pc = makePc(), s = svcOf(pc)
  assert.deepStrictEqual(await s.openApp({ id: 'calc.exe' }), { ok: false, error: 'unknown_app' })
  assert.deepStrictEqual(await s.openApp({ id: '../../x' }), { ok: false, error: 'unknown_app' })
  assert.deepStrictEqual(await s.openApp({ id: 'synapse' }), { ok: false, error: 'not_installed' })
  assert.deepStrictEqual(await s.openApp({ id: 'ghub' }), { ok: true })
  assert.strictEqual(pc.openedPath, 'C:\\Program Files\\LGHUB\\lghub.exe')
  const bad = svcOf(makePc(), { openPath: async () => 'The system cannot find the file' })
  assert.deepStrictEqual(await bad.openApp({ id: 'ghub' }), { ok: false, error: 'open_failed' })
})
