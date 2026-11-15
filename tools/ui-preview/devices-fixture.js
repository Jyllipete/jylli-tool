// Devices tab answers for the browser preview: the REAL lib/devices service on a fake PC built from a real capture of the author's PC (test/fixtures/devices/probe-desktop.json).
// State comes from ?dv=full|real|first|gone|denied|noprobe|fail on /app (serve.js passes it as ctx.dv).
//   full     the capture plus a paired Bluetooth headset with a battery and a wireless game controller, so every kind of card shows up (default)
//   real     the capture as it is (2 mice, 1 keyboard, 2 monitors, a mic, an RGB controller, a failing Bluetooth radio, software devices)
//   first    real, and nothing remembered yet
//   gone     real, and two devices that were plugged in before and are not now
//   denied   the HID and monitor parts of the probe could not be read
//   noprobe  the whole probe returns nothing (devices unreadable)
//   fail     the service itself throws
// The keyboard repeat setting and the polling test round-trip through the same service code as the real app; the "mouse movement" of the polling test is synthetic.
const fs = require('fs')
const path = require('path')
const Devices = require('../../lib/devices')
const detect = require('../../lib/devices/detect')
const controls = require('../../lib/devices/controls')
const inventory = require('../../lib/inventory')

const CAPTURE = JSON.parse(fs.readFileSync(path.join(__dirname, '../../test/fixtures/devices/probe-desktop.json'), 'utf8'))
const RIG = () => inventory.buildRigSpec(require('../../test/fixtures/sensors/inventory-raw-desktop.json'))
const clone = o => JSON.parse(JSON.stringify(o))

function probeFor(state) {
  const p = clone(CAPTURE)
  if (state === 'full') {
    const C = 'AB12CD34-0000-4000-8000-00000000A001'
    p.pnp.push({ id: 'USB\\VID_054C&PID_0CE6\\...A001', cls: 'USB', name: 'USB Composite Device', mfr: '(Standard USB Host Controller)', status: 'OK', bus: 'Wireless Controller', container: C, loc: 'Port_#0003.Hub_#0001', parent: '', driver: '10.0.26100.1', problem: 0 })
    p.pnp.push({ id: 'HID\\VID_054C&PID_0CE6&MI_03\\...A001', cls: 'HIDClass', name: 'HID-compliant game controller', mfr: 'Microsoft', status: 'OK', bus: '', container: C, loc: '', parent: '', driver: '', problem: 0 })
    p.hid.push({ id: 'HID\\VID_054C&PID_0CE6&MI_03\\...A001', mfr: 'Sony Interactive Entertainment', prod: 'Wireless Controller', page: '0001', usage: '0005' })
    p.bt.push({ id: 'BTHENUM\\DEV_AABBCCDDEEFF\\...A002', name: 'Soundcore Life Q30', cls: 'Bluetooth', status: 'OK', battery: 78 })
  }
  if (state === 'denied') {
    p.sec.hid = { ok: false, ms: 12, err: 'Access is denied' }; p.hid = []
    p.sec.monitors = { ok: false, ms: 9, err: 'Access denied' }; p.monitors = []
  }
  return p
}
const rawLine = probe => detect.MARK + JSON.stringify({
  admin: probe.admin, sec: probe.sec, pnp: probe.pnp, hid: probe.hid, bt: probe.bt,
  monitors: probe.monitors.map(m => ({ id: m.id, mfr: m.mfr, model: m.model, code: m.code, year: m.year, serialLen: m.hasSerial ? 8 : 0, w: m.wCm, h: m.hCm })),
})

const services = new Map()
function build(state) {
  const probe = probeFor(state)
  const kbd = { delay: 1, speed: 31 }
  const journal = []
  const store = { v: null }
  if (state === 'gone') {
    store.v = { devices: {
      'usb-1532-0099-0001': { id: 'usb-1532-0099-0001', title: 'Razer DeathAdder V2', category: 'mouse', vendor: 'Razer', firstSeen: Date.now() - 40 * 86400000, lastSeen: Date.now() - 3 * 86400000 },
      'usb-054C-09CC-0002': { id: 'usb-054C-09CC-0002', title: 'Wireless Controller', category: 'gamepad', vendor: 'Sony', firstSeen: Date.now() - 90 * 86400000, lastSeen: Date.now() - 20 * 3600000 },
    }, polls: {} }
  }
  const wlBins = []; for (let i = 0; i < 40; i++) wlBins.push(i % 7 === 6 ? 0 : 100)
  const runPS = async script => {
    if (state === 'fail') throw new Error('preview: service failure')
    if (script.includes(detect.MARK)) return state === 'noprobe' ? { ok: false, out: '' } : { ok: true, out: rawLine(probe) }
    if (script.includes('RegisterRawInputDevices')) {
      await new Promise(r => setTimeout(r, 1500))
      return { ok: true, out: 'JJPOLL:' + JSON.stringify({ ok: true, seconds: 4, synthetic: 0, devices: [{ path: '\\\\?\\HID#VID_36A7&PID_A881&MI_00#8&3578d41d&0&0000#{378de44c-56ef-11d1-bc8c-00a0c91405dd}', n: 340, w: wlBins }] }) }
    }
    if (script.includes('SystemParametersInfo')) return { ok: true, out: 'JJKBDLIVE:{}' }
    if (script.includes('JJKBD:')) return { ok: true, out: 'JJKBD:' + JSON.stringify(kbd) }
    return { ok: false, out: '' }
  }
  return Devices.create({
    runPS,
    runRecorded: async (control, action, meta, fn) => {
      journal.push({ control, before: Object.assign({}, kbd), undone: false })
      await fn(async () => ({ ok: true }), async cmd => { const m = /\/v (KeyboardDelay|KeyboardSpeed) \/t REG_SZ \/d (\d+) \/f/.exec(cmd); if (m) kbd[m[1] === 'KeyboardDelay' ? 'delay' : 'speed'] = Number(m[2]); return { ok: true, out: '', code: 0 } })
    },
    undoControl: async () => { const e = [...journal].reverse().find(x => !x.undone); if (!e) return { ok: true, found: 0 }; Object.assign(kbd, e.before); e.undone = true; return { ok: true, found: 1 } },
    getRig: async () => RIG(),
    windowsStatus: async () => ({ 'disable-mouse-accel': 'on', 'mouse-pointer-1to1': 'off' }),
    appInstalled: async () => ({ ghub: true, synapse: false, icue: false, armoury: false }),
    resolveApp: async id => (id === 'ghub' ? 'C:\\Program Files\\LGHUB\\lghub.exe' : null),
    openPath: async () => '',
    state: { read: () => store.v, write: v => { store.v = clone(v) } },
    platform: 'win32',
  })
}
const svc = state => { const k = state === 'real' || state === 'first' || state === 'gone' || state === 'denied' || state === 'noprobe' || state === 'fail' ? state : 'full'; if (!services.has(k)) services.set(k, build(k)); return services.get(k) }

async function respond(name, args, ctx) {
  const st = ctx.dv || 'full'
  const s = svc(st)
  const a = (args && args[0]) || {}
  try {
    switch (name) {
      case 'devices2Scan': return await s.scan(a)
      case 'devices2Poll': return await s.pollTest(a)
      case 'devices2KbdSet': return await s.kbdSet(a)
      case 'devices2KbdUndo': return await s.kbdUndo()
      case 'devices2Forget': return s.forget(a)
      case 'devices2OpenApp': return await s.openApp(a)
    }
  } catch (e) { return { ok: false, error: String(e && e.message || e) } }
  return undefined
}
module.exports = { respond, controls }
