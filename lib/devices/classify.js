'use strict'
// Devices tab: the ONLY place that decides what is one physical device, what kind it is, how it is connected and whether it is only software.
// Input is the parsed probe (detect.parse). Output is plain device records WITHOUT facts; model.js turns them into facts with a source and a confidence.
//   grouping   Windows ContainerId = one physical thing, so the 9 HID interfaces of one mouse become ONE device. No container (all zeros / all F) falls back
//              to VID+PID of the USB device. Two identical keyboards stay two devices because their containers differ.
//   category   mouse | keyboard | gamepad | audio | camera | display | rgb | bluetooth | other
//              from the HID usages the device reports (usage page 01: 02 pointer, 06 keyboard, 04/05 joystick/gamepad) and the Windows class, then the name.
//   virtual    drivers that make a fake device (G HUB virtual keyboard, VHF, Voicemeeter, Xbox synthetic bus): kept apart from real hardware
const vendors = require('./vendors')

const NO_CONTAINER = /^(0{8}-0{4}-0{4}-F{4}-F{12}|0{8}-0{4}-0{4}-0{4}-0{12}|F{8}-F{4}-F{4}-F{4}-F{12})$/i
const VIRTUAL_ID = /^(ROOT|VHF|LGHUBDEVICE|HID\\HID_DEVICE_SYSTEM_VHF|SWD\\(?!MMDEVAPI))/i
const VIRTUAL_NAME = /virtual|voicemeeter|vb-audio|\bcable\b|synthetic|\bvhf\b|remote desktop|steam streaming/i
const HARDWARE_ID = /^(USB\\VID_|HDAUDIO\\|DISPLAY\\|BTH)/i
const IGNORE_ID = /^(USB\\ROOT_HUB|PCI\\)/i
const IGNORE_NAME = /host controller|root hub|generic usb hub|usb hub\b/i
const WIRELESS = /dongle|receiver|wireless|2\.4 ?g|lightspeed|unifying|bolt\b/i
const MOUSE_WORDS = /mouse|mice|trackball/i
const KBD_WORDS = /key ?board|keypad|keychron/i
const RGB_WORDS = /\bled\b|rgb|aura|lighting|illumination/i
const GENERIC_NAME = /^(usb composite device|usb input device|hid[- ]compliant|hid keyboard device|generic usb|generic monitor|usb audio device|usb device|wireless_device)/i

const HID_LABELS = { '0001/0002': 'Pointer', '0001/0006': 'Keyboard', '0001/0080': 'System control', '0001/0004': 'Joystick', '0001/0005': 'Gamepad', '0001/0007': 'Keypad', '000C/0001': 'Consumer control', '000D/0004': 'Touch screen', '0059/0001': 'Virtual HID' }
const hidLabel = (page, usage) => HID_LABELS[page + '/' + usage] || (/^FF/i.test(page) ? 'Vendor-defined' : page && usage ? page + '/' + usage : 'Unknown')

/** Last segment of an instance id (the serial or a generated suffix) reduced to its last 4 characters, so nothing that identifies a unit leaves the probe. */
function maskId(id) {
  const parts = String(id || '').split('\\')
  if (parts.length < 3) return String(id || '')
  const last = parts[parts.length - 1]
  parts[parts.length - 1] = last.length > 4 ? '...' + last.slice(-4) : last
  return parts.join('\\')
}
function fnv(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h.toString(16).padStart(8, '0') }
const monKey = id => String(id || '').toUpperCase().replace(/_\d+$/, '')

function groupKey(d) {
  if (/^DISPLAY\\/i.test(d.id)) return 'mon:' + monKey(d.id)
  if (d.container && !NO_CONTAINER.test(d.container)) return 'c:' + d.container
  const ids = vendors.idsOf(d.id)
  if (ids.vid && ids.pid) return 'vp:' + ids.vid + ':' + ids.pid
  return 'id:' + d.id
}

/** Group probe records into device records. */
function classify(probe) {
  const hidBy = new Map(probe.hid.map(h => [h.id, h]))
  const monBy = new Map(probe.monitors.map(m => [monKey(m.id), m]))
  const groups = new Map()
  let ignored = 0
  for (const d of probe.pnp) {
    if (IGNORE_ID.test(d.id) || (/^USB\\/i.test(d.id) && IGNORE_NAME.test(d.name))) { ignored++; continue }
    const k = groupKey(d)
    if (!groups.has(k)) groups.set(k, { key: k, members: [] })
    groups.get(k).members.push(d)
  }
  mergeEndpoints(groups)
  mergeNoContainer(groups)
  const devices = []
  for (const g of groups.values()) devices.push(build(g, hidBy, monBy))
  for (const b of probe.bt) devices.push(buildBluetooth(b))
  return { devices, ignored }
}

/** The EDID record of a monitor: by its full instance id, else by the maker+product code in the middle of it when that code is unique among the monitors. */
function findMonitor(key, monBy) {
  if (monBy.has(key)) return monBy.get(key)
  const code = key.split('\\')[1]
  const same = [...monBy].filter(([k]) => k.split('\\')[1] === code)
  return code && same.length === 1 ? same[0][1] : null
}

/** Audio endpoints have containers of their own, so they are tied to the sound device they belong to by the adapter name Windows puts in brackets:
 *  "Speakers (fifine Microphone)" -> the device called "fifine Microphone". No such device: the endpoints of one adapter name form one device together. */
const adapterOf = name => { const m = /\(([^()]+)\)\s*$/.exec(String(name || '')); return m ? m[1].trim() : '' }
function mergeEndpoints(groups) {
  const byName = new Map()
  for (const g of groups.values()) for (const x of g.members) if (x.cls === 'MEDIA') byName.set(x.name.toLowerCase(), g)
  for (const [k, g] of [...groups]) {
    if (!g.members.every(x => x.cls === 'AudioEndpoint')) continue
    const keep = []
    for (const x of g.members) {
      const ad = adapterOf(x.name).toLowerCase()
      if (!ad) { keep.push(x); continue }
      let to = byName.get(ad)
      if (!to) { to = groups.get('ad:' + ad) || { key: 'ad:' + ad, members: [] }; groups.set(to.key, to); byName.set(ad, to) }
      to.members.push(x)
    }
    if (keep.length) g.members = keep; else groups.delete(k)
  }
}
/** A device with no container (all zeros / all F) split into several groups by Windows: join it to the one container group with the same VID:PID, when there is exactly one. */
function mergeNoContainer(groups) {
  const byVp = new Map()
  for (const g of groups.values()) {
    if (!g.key.startsWith('c:')) continue
    const root = g.members.map(x => vendors.idsOf(x.id)).find(i => i.vid && i.pid)
    if (!root) continue
    const k = root.vid + ':' + root.pid
    byVp.set(k, byVp.has(k) ? null : g)
  }
  for (const [k, g] of [...groups]) {
    if (!k.startsWith('vp:')) continue
    const to = byVp.get(k.slice(3))
    if (to) { to.members.push(...g.members); groups.delete(k) }
  }
}

function endpointFlow(id) {
  const m = /\{0\.0\.([01])\.0{8}\}/.exec(id)
  return m ? (m[1] === '1' ? 'input' : 'output') : null
}

function build(g, hidBy, monBy) {
  const m = g.members
  const usb = m.filter(x => /^USB\\VID_/i.test(x.id) && !/&MI_/i.test(x.id)).sort((a, b) => a.id.length - b.id.length)
  const root = usb[0] || null
  const ids = vendors.idsOf((root || m.find(x => vendors.idsOf(x.id).vid) || m[0]).id)
  const hids = m.map(x => ({ rec: hidBy.get(x.id), pnp: x })).filter(x => x.rec && !x.rec.err)
  const usages = hids.map(x => x.rec.page + '/' + x.rec.usage)
  const hasUsage = u => usages.includes(u)
  const clsHas = c => m.some(x => x.cls === c)
  const mon = g.key.startsWith('mon:') ? findMonitor(g.key.slice(4), monBy) : null
  const endpoints = m.filter(x => x.cls === 'AudioEndpoint').map(x => ({ name: x.name, flow: endpointFlow(x.id) }))
  const text = m.map(x => x.name + ' ' + x.bus).join(' ') + ' ' + hids.map(x => x.rec.prod).join(' ')
  const best = f => { for (const x of hids) if (x.rec[f]) return x.rec[f]; return '' }
  const hidProd = best('prod'), hidMfr = best('mfr')
  const bus = (root && root.bus) || (m.find(x => x.bus && !GENERIC_NAME.test(x.bus)) || {}).bus || ''

  let category = 'other'
  const isMouse = hasUsage('0001/0002') || clsHas('Mouse')
  const isKbd = hasUsage('0001/0006') || clsHas('Keyboard')
  if (mon || clsHas('Monitor')) category = 'display'
  else if (clsHas('Bluetooth')) category = 'bluetooth'
  else if (isMouse || isKbd) {
    // A gaming mouse often exposes a keyboard interface for macros, so both at once is common: the name decides, and a pointer wins when the name says nothing.
    if (isMouse && isKbd) category = KBD_WORDS.test(text) && !MOUSE_WORDS.test(text) ? 'keyboard' : 'mouse'
    else category = isMouse ? 'mouse' : 'keyboard'
  } else if (hasUsage('0001/0005') || hasUsage('0001/0004') || clsHas('XnaComposite') || clsHas('XboxComposite')) category = 'gamepad'
  else if (clsHas('Camera') || clsHas('Image')) category = 'camera'
  else if (endpoints.length || clsHas('MEDIA')) category = 'audio'
  else if (hids.some(x => /^FF/i.test(x.rec.page)) && RGB_WORDS.test(text)) category = 'rgb'
  else if (/gamepad|joystick|game ?controller/i.test(text)) category = 'gamepad'

  const hardware = m.some(x => HARDWARE_ID.test(x.id))
  const virtual = !hardware && (m.some(x => VIRTUAL_ID.test(x.id)) || m.some(x => VIRTUAL_NAME.test(x.name)) || (endpoints.length > 0 && endpoints.every(e => VIRTUAL_NAME.test(e.name))))

  let connection = null
  if (m.some(x => /^BTH/i.test(x.id))) connection = 'bluetooth'
  else if (root) connection = category !== 'bluetooth' && WIRELESS.test((GENERIC_NAME.test(bus) ? '' : bus) + ' ' + hidProd) ? 'receiver' : 'usb'
  else if (m.some(x => /^HDAUDIO\\/i.test(x.id))) connection = 'internal'
  else if (virtual) connection = 'software'

  const problem = m.find(x => x.problem || /^error$/i.test(x.status))
  const dev = {
    id: '', key: g.key, category, virtual, connection,
    vid: ids.vid, pid: ids.pid,
    hidProd, hidMfr, bus, pnpMfr: (root && root.mfr) || '', pnpMfrs: m.map(x => x.mfr).filter(Boolean),
    friendly: friendlyOf(m, category, root),
    monitor: mon, endpoints,
    port: (root && root.loc) || '',
    driver: (root && root.driver) || (m.find(x => x.driver) || {}).driver || '',
    problem: problem ? { code: problem.problem || null, status: problem.status, on: problem.name } : null,
    container: (m[0] && m[0].container && !NO_CONTAINER.test(m[0].container)) ? m[0].container : '',
    interfaces: m.filter(x => x.cls !== 'AudioEndpoint').map(x => {
      const h = hidBy.get(x.id)
      return { id: maskId(x.id), cls: x.cls, name: x.name, hid: h && !h.err ? { page: h.page, usage: h.usage, label: hidLabel(h.page, h.usage) } : null }
    }),
    hasSerial: !!(mon && mon.hasSerial),
    instanceIds: m.filter(x => x.cls !== 'AudioEndpoint').map(x => x.id),   // full ids, used only to match a polling-test device; never sent to the page
  }
  dev.id = stableId(dev)
  return dev
}

function friendlyOf(m, category, root) {
  const pick = c => (m.find(x => x.cls === c) || {}).name || ''
  if (category === 'bluetooth') return pick('Bluetooth')
  if (category === 'display') return pick('Monitor')
  if (category === 'audio') return pick('MEDIA')
  if (category === 'camera') return pick('Camera') || pick('Image')
  return (root && root.name) || ''
}

function stableId(dev) {
  if (dev.key.startsWith('mon:')) return 'mon-' + fnv(dev.key)
  if (dev.vid && dev.pid) return 'usb-' + dev.vid + '-' + dev.pid + '-' + fnv(dev.container || dev.key)
  return 'dev-' + fnv(dev.key)
}

function buildBluetooth(b) {
  const text = b.name + ' ' + b.cls
  const category = /mouse|mice/i.test(text) ? 'mouse' : /key ?board/i.test(text) ? 'keyboard' : /headset|headphone|earbud|airpod|speaker|buds/i.test(text) ? 'audio' : /controller|gamepad|xbox|dualsense|dualshock/i.test(text) ? 'gamepad' : 'other'
  return {
    id: 'bt-' + fnv(b.id.replace(/\{[^}]+\}/g, '').replace(/&\d$/g, '')), key: 'bt:' + b.id, category, virtual: false, connection: 'bluetooth',
    vid: '', pid: '', hidProd: '', hidMfr: '', bus: '', pnpMfr: '', friendly: b.name, monitor: null, endpoints: [], port: '', driver: '',
    problem: /^error$/i.test(b.status) ? { code: null, status: b.status, on: b.name } : null, container: '',
    interfaces: [], hasSerial: false, battery: b.battery, paired: true,
  }
}

module.exports = { classify, maskId, hidLabel, fnv, GENERIC_NAME, NO_CONTAINER }
