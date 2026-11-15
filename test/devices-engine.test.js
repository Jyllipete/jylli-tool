const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { detect, classify, model, vendors, findings, controls } = require('../lib/devices-all')

// A real capture of the author's PC (serial-like instance id endings masked): 2 mice, 1 keyboard, a mic, RGB controller, 2 monitors, a failing Bluetooth radio
// and lots of software devices (G HUB virtual keyboard, Voicemeeter, VB-Cable, Xbox synthetic bus).
const PROBE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/devices/probe-desktop.json'), 'utf8'))
const clone = o => JSON.parse(JSON.stringify(o))
const snapOf = (probe, extra = {}) => { const r = classify.classify(probe); return model.build(Object.assign({ probe, records: r.devices, rig: null, state: {}, now: 1000 }, extra)) }
const by = (snap, f) => snap.devices.find(f)

test('detect.parse: reads the marker line, never throws on junk', () => {
  assert.strictEqual(detect.parse(''), null)
  assert.strictEqual(detect.parse('JJDEV:{broken'), null)
  assert.strictEqual(detect.parse('no marker here'), null)
  const p = detect.parse('noise\r\nJJDEV:' + JSON.stringify({ admin: true, sec: { pnp: { ok: true, ms: 5 } }, pnp: [{ id: 'USB\\VID_046D&PID_C339\\1', cls: 'USB', name: 'PRO', container: '{1A72B9FF-E7CC-57FF-810C-2D7A23A1D680}' }], hid: [], monitors: [], bt: [] }))
  assert.strictEqual(p.admin, true)
  assert.strictEqual(p.pnp[0].container, '1A72B9FF-E7CC-57FF-810C-2D7A23A1D680')
  assert.strictEqual(p.sec.hid.ok, false, 'a section the script did not report is "not run", not ok')
})

test('detect script: read-only, one section per source', () => {
  const s = detect.buildScript()
  assert.ok(!/Set-ItemProperty|New-ItemProperty|Remove-Item|reg add|Set-PnpDevice|Disable-PnpDevice|HidD_Set|WriteFile|DeviceIoControl/i.test(s), 'the probe must not write anything')
  for (const id of ['pnp', 'hid', 'monitors', 'bluetooth']) assert.ok(s.includes("Run '" + id + "'"), id)
})

test('real capture: physical devices are grouped by container, software devices are kept apart', () => {
  const snap = snapOf(PROBE)
  const real = snap.devices.map(d => d.category + ':' + d.title)
  assert.strictEqual(snap.devices.filter(d => d.category === 'mouse').length, 2, 'two mice, not 20 HID interfaces')
  assert.strictEqual(snap.devices.filter(d => d.category === 'keyboard').length, 1, 'the PRO keyboard is ONE keyboard (its 10 interfaces merge); the G HUB virtual keyboard is software')
  assert.ok(real.includes('keyboard:Logitech PRO Gaming Keyboard'), real.join(' | '))
  assert.strictEqual(snap.devices.filter(d => d.category === 'display').length, 2)
  assert.ok(by(snap, d => d.category === 'rgb' && /AURA/.test(d.title)), 'ASUS AURA is an RGB controller')
  assert.ok(by(snap, d => d.category === 'audio' && /fifine/.test(d.title)), 'the mic is audio')
  const soft = snap.software.map(d => d.title).join(' | ')
  assert.match(soft, /LGVirHid/, 'G HUB virtual keyboard is software')
  assert.match(soft, /Synthetic Gamepad/)
  assert.match(soft, /Voicemeeter/)
  assert.match(soft, /VB-Audio Virtual Cable|CABLE/)
  assert.ok(snap.software.every(d => d.virtual && d.facts.connection.value === 'software'))
})

test('the fifine mic keeps its extra USB interface (a group Windows split because it has no container)', () => {
  const snap = snapOf(PROBE)
  const mic = by(snap, d => /fifine/.test(d.title))
  assert.ok(mic.interfaces.length >= 3)
  assert.strictEqual(snap.devices.filter(d => d.facts.ids.vid === '3142').length, 1, 'no second "other" device for the same VID/PID')
})

test('mouse names: the device string wins, an abbreviated maker is never shown as the maker', () => {
  const snap = snapOf(PROBE)
  const wl = by(snap, d => /WLMOUSE/.test(d.title))
  assert.strictEqual(wl.facts.model.source, 'device')
  assert.strictEqual(wl.facts.model.confidence, 'high')
  assert.strictEqual(wl.facts.vendor.value, 'WL')
  assert.strictEqual(wl.facts.vendor.confidence, 'low', 'WL is an abbreviation')
  assert.strictEqual(wl.facts.vendor.note, 'abbreviated')
  assert.strictEqual(wl.title, 'WLMOUSE BEAST MAX', 'no "WL" prefix in the title')
  const cx = by(snap, d => /dongle/i.test(d.title))
  assert.strictEqual(cx.facts.connection.value, 'receiver')
  assert.strictEqual(cx.facts.connection.source, 'inferred', 'a receiver is a name-based inference, not a reading')
  assert.strictEqual(cx.facts.vendor.confidence, 'low')
})

test('vendor from our table: confirmed by the device string, or marked as a conflict', () => {
  const snap = snapOf(PROBE)
  const kb = by(snap, d => d.category === 'keyboard')
  assert.strictEqual(kb.facts.vendor.value, 'Logitech')
  assert.strictEqual(kb.facts.vendor.source, 'table')
  assert.strictEqual(kb.facts.vendor.confidence, 'high')
  assert.strictEqual(kb.title, 'Logitech PRO Gaming Keyboard')
  const p = clone(PROBE)
  for (const h of p.hid) if (/VID_046D&PID_C339/.test(h.id)) h.mfr = 'Totally Different Corp'
  const kb2 = by(snapOf(p), d => d.category === 'keyboard')
  assert.strictEqual(kb2.facts.vendor.confidence, 'low')
  assert.strictEqual(kb2.facts.vendor.note, 'conflict')
  assert.strictEqual(kb2.facts.vendor.deviceSays, 'Totally Different Corp')
})

test('a vendor id that is not in the table is unknown, never guessed', () => {
  const snap = snapOf(PROBE)
  const mic = by(snap, d => /fifine/.test(d.title))
  assert.strictEqual(mic.facts.vendor.value, null)
  assert.strictEqual(mic.facts.vendor.reason, 'absent')
  assert.strictEqual(mic.facts.ids.value, 'VID 3142 / PID A010')
  assert.strictEqual(vendors.lookup('3142'), null)
  assert.strictEqual(vendors.lookup('FFFF'), null)
})

test('monitors: maker and model from EDID, size and year, no fake connection', () => {
  const snap = snapOf(PROBE)
  const msi = by(snap, d => d.category === 'display' && /MAG/.test(d.title))
  assert.strictEqual(msi.title, 'MSI MAG 244F')
  assert.strictEqual(msi.facts.vendor.value, 'MSI')
  assert.strictEqual(msi.facts.year.value, 2025)
  assert.strictEqual(msi.facts.size.value, 23.8)
  assert.strictEqual(msi.facts.size.note, 'approx', 'EDID size is whole centimetres')
  assert.strictEqual(msi.facts.connection.value, null, 'DisplayPort / HDMI is not readable here: shown as unknown, not guessed')
  assert.strictEqual(by(snap, d => /Odyssey/.test(d.title)).facts.vendor.value, 'Samsung')
})

test('a Windows problem state is shown (the Bluetooth radio on this PC is code 32)', () => {
  const snap = snapOf(PROBE)
  const bt = by(snap, d => d.category === 'bluetooth')
  assert.strictEqual(bt.problem.code, 32)
  assert.strictEqual(snap.problems, 1)
  const f = findings.compute(snap).find(x => x.id === 'device_problem')
  assert.ok(f && f.level === 'warn')
  assert.strictEqual(bt.facts.connection.value, 'usb', 'an internal USB radio is not a "receiver" just because its description says wireless')
})

test('unknowns are counted by what is really unknown', () => {
  const snap = snapOf(PROBE)
  assert.ok(snap.unknown >= 1 && snap.unknown <= 3, 'unknown count ' + snap.unknown)
})

test('a failed section leaves the others intact and is reported', () => {
  const p = clone(PROBE)
  p.sec.hid = { ok: false, ms: 5, err: 'boom' }
  p.hid = []
  const snap = snapOf(p)
  assert.strictEqual(snap.sections.hid.ok, false)
  assert.ok(snap.devices.length > 5, 'devices still found from the PnP section')
  const wl = snap.devices.find(d => d.facts.ids && d.facts.ids.vid === '36A7')
  assert.ok(wl, 'the mouse is still there')
  assert.ok(['mouse', 'keyboard', 'other'].includes(wl.category))
  assert.ok(findings.compute(snap).some(f => f.id === 'section_failed'))
})

test('no probe at all: an empty, honest snapshot (not a crash, not an empty list that looks like "nothing connected")', () => {
  const snap = model.build({ probe: null, records: [], rig: null, state: { devices: { 'usb-1': { id: 'usb-1', title: 'X', category: 'mouse', lastSeen: 5 } } }, now: 9 })
  assert.strictEqual(snap.read, false)
  assert.deepStrictEqual(snap.disconnected, [], 'a failed probe must not mark everything as disconnected')
})

test('remembered devices: unplugged shows as disconnected with the last seen time, virtual ones are never remembered', () => {
  const snap1 = snapOf(PROBE)
  const st = model.remember({}, snap1.devices.concat(snap1.software), 1000)
  assert.ok(Object.keys(st.devices).length >= 7)
  assert.ok(!Object.values(st.devices).some(d => /Voicemeeter|LGVirHid/.test(d.title)))
  const p = clone(PROBE)
  const mouseIds = p.pnp.filter(d => /VID_373B/.test(d.id)).map(d => d.id)
  p.pnp = p.pnp.filter(d => !mouseIds.includes(d.id))
  p.hid = p.hid.filter(h => !mouseIds.includes(h.id))
  const snap2 = snapOf(p, { state: st, now: 9000 })
  assert.strictEqual(snap2.disconnected.length, 1)
  assert.match(snap2.disconnected[0].title, /dongle/i)
  assert.strictEqual(snap2.disconnected[0].lastSeen, 1000)
  assert.strictEqual(snap2.disconnected[0].present, false)
})

test('remembered devices are capped', () => {
  let st = {}
  for (let i = 0; i < 230; i++) st = model.remember(st, [{ id: 'usb-' + i, title: 'D' + i, category: 'mouse', virtual: false, core: false, facts: {} }], i + 1)
  assert.strictEqual(Object.keys(st.devices).length, 200)
  assert.ok(st.devices['usb-229'] && !st.devices['usb-0'])
})

test('identical keyboards with different containers stay two devices', () => {
  const p = clone(PROBE)
  const add = (cont, tail) => {
    p.pnp.push({ id: 'USB\\VID_046D&PID_C339\\X' + tail, cls: 'USB', name: 'PRO', mfr: 'Logitech', status: 'OK', bus: 'PRO Gaming Keyboard', container: cont, loc: '', parent: '', driver: '', problem: 0 })
    p.pnp.push({ id: 'HID\\VID_046D&PID_C339&MI_00\\Y' + tail, cls: 'Keyboard', name: 'HID Keyboard Device', mfr: '', status: 'OK', bus: '', container: cont, loc: '', parent: '', driver: '', problem: 0 })
    p.hid.push({ id: 'HID\\VID_046D&PID_C339&MI_00\\Y' + tail, mfr: 'Logitech', prod: 'PRO Gaming Keyboard', page: '0001', usage: '0006' })
  }
  add('AAAAAAAA-0000-0000-0000-000000000001', '1')
  add('AAAAAAAA-0000-0000-0000-000000000002', '2')
  const snap = snapOf(p)
  assert.strictEqual(snap.devices.filter(d => d.category === 'keyboard').length, 3)
})

test('a mouse that also exposes a keyboard interface is still a mouse; a keyboard named keyboard stays one', () => {
  const snap = snapOf(PROBE)
  const wl = snap.devices.find(d => d.facts.ids && d.facts.ids.vid === '36A7')
  assert.ok(wl.interfaces.some(i => i.hid && i.hid.label === 'Keyboard'), 'it really has a keyboard interface')
  assert.strictEqual(wl.category, 'mouse')
})

test('instance ids sent to the page are masked; full ids stay in the engine', () => {
  const snap = snapOf(PROBE)
  for (const d of snap.devices) for (const i of d.interfaces) assert.ok(!/[0-9A-F]{8,}\w*$/i.test(i.id.split('\\').pop()) || i.id.split('\\').pop().startsWith('...') || i.id.split('\\').pop().length <= 4, i.id)
  assert.strictEqual(classify.maskId('USB\\VID_046D&PID_C339\\0781336F3734'), 'USB\\VID_046D&PID_C339\\...3734')
  assert.strictEqual(classify.maskId('SHORT'), 'SHORT')
})

test('core parts come from the RigSpec with source windows and unknowns as absent', () => {
  const rig = { cpu: { name: 'AMD Ryzen 7 5800X3D', cores: 8, threads: 16, socket: 'AM4', vendor: 'AuthenticAMD' }, gpus: [{ name: 'RTX', vendor: 'NVIDIA', driver: '566.1', integrated: false }],
    ram: { slotsTotal: 4, sticks: [{ locator: 'A', sizeGB: 16, ratedMT: 3600, speedMT: 3600, part: 'P', type: 'DDR4' }, { locator: 'B', sizeGB: 16, ratedMT: 3600, speedMT: 3600, part: 'P', type: 'DDR4' }] },
    drives: [{ name: 'Samsung SSD', media: 'SSD', bus: 'NVMe', sizeGB: 1000, health: null }], board: { vendor: 'ASUS', model: 'TUF' }, adapters: [{ name: 'Ethernet', desc: 'Realtek 2.5GbE', up: true, speed: 2500, kind: 'ethernet' }] }
  const core = model.coreParts(rig)
  assert.deepStrictEqual(core.map(c => c.category), ['cpu', 'gpu', 'ram', 'storage', 'board', 'network'])
  assert.strictEqual(core.find(c => c.category === 'ram').title, '32 GB')
  assert.strictEqual(core.find(c => c.category === 'storage').facts.health.value, null)
  assert.strictEqual(core.find(c => c.category === 'storage').facts.health.reason, 'absent')
  assert.ok(core.every(c => c.core && c.facts.vendor === undefined || c.facts.vendor.source === 'windows' || c.facts.vendor.value == null))
  assert.deepStrictEqual(model.coreParts(null), [])
})

test('controls: only keyboard repeat is a write; mouse DPI and polling writes are display only', () => {
  assert.deepStrictEqual(controls.CONTROLS.filter(c => c.kind === 'write').map(c => c.id), ['kbd-repeat'])
  const snap = snapOf(PROBE)
  const wl = snap.devices.find(d => d.category === 'mouse')
  const c = controls.forDevice(wl, { windows: { 'disable-mouse-accel': 'on' }, appInstalled: {}, kbd: null })
  assert.deepStrictEqual(c.change, [])
  assert.ok(c.info.includes('dpi') && c.info.includes('polling_write'))
  assert.deepStrictEqual(c.link.map(l => l.windowsId), ['disable-mouse-accel', 'mouse-pointer-1to1'])
  assert.strictEqual(c.link[0].status, 'on')
  assert.strictEqual(c.link[1].status, 'unknown')
  assert.deepStrictEqual(c.measure.map(m => m.id), ['polling-test'])
  const kb = controls.forDevice(snap.devices.find(d => d.category === 'keyboard'), { kbd: { delay: 1, speed: 31 } })
  assert.deepStrictEqual(kb.change.map(x => x.id), ['kbd-repeat'])
  assert.strictEqual(kb.app && kb.app.name, 'Logitech G HUB')
  assert.deepStrictEqual(controls.forDevice(snap.software[0], {}), { change: [], link: [], measure: [], info: [], app: null })
  assert.ok(!controls.kbdValid(4, 5) && !controls.kbdValid(1, 32) && !controls.kbdValid(1.5, 5) && controls.kbdValid(0, 0) && controls.kbdValid(3, 31))
})

test('every link control points at a real Windows switch', () => {
  const wcat = require('../lib/windows/catalog')
  const ids = new Set(wcat.ITEMS.map(s => s.id))
  assert.ok(ids.size > 20)
  for (const c of controls.CONTROLS.filter(x => x.kind === 'link')) assert.ok(ids.has(c.windowsId), c.windowsId)
})

test('vendor table: well-formed and every companion app exists in the apps list', () => {
  const known = require('../lib/apps/known')
  const apps = known.APPS
  assert.ok(apps.length > 10)
  for (const [vid, v] of Object.entries(vendors.VENDORS)) {
    assert.match(vid, /^[0-9A-F]{4}$/)
    assert.ok(v.name && ['device', 'listed'].includes(v.check))
    if (v.app) assert.ok(apps.some(a => a.id === v.app), v.app)
  }
  assert.strictEqual(vendors.idsOf('HID\\VID_36A7&PID_A881&MI_01&COL04\\8').vid, '36A7')
  assert.strictEqual(vendors.idsOf('ROOT\\MEDIA\\0001').vid, '')
  assert.strictEqual(vendors.normVid('vid_046d'), '046D')
  assert.strictEqual(vendors.normVid('zz'), '')
})
