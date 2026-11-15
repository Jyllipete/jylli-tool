'use strict'
// Devices tab: the ONLY table that turns a USB vendor id into a name, and a vendor into its companion app.
// It is short on purpose. A vendor id that is not here is shown as the device's own string plus the raw id, never guessed.
//   check 'device'  the id was confirmed against a real device string on the author's PC (see docs/DEVICES_EVIDENCE.md)
//   check 'listed'  taken from the public USB-IF vendor list, not yet seen on a device here
//   oem   true      a chip maker whose id appears on many brands, so it says who made the chip, not whose product it is
// `app` points at lib/apps/known.js ids (their `install` paths are what the Open button may launch).
const VENDORS = {
  '046D': { name: 'Logitech', check: 'device', app: 'ghub' },
  '1532': { name: 'Razer', check: 'listed', app: 'synapse' },
  '1038': { name: 'SteelSeries', check: 'listed', appName: 'SteelSeries GG' },
  '1B1C': { name: 'Corsair', check: 'listed', app: 'icue' },
  '0B05': { name: 'ASUS', check: 'device', app: 'armoury' },
  '045E': { name: 'Microsoft', check: 'listed' },
  '054C': { name: 'Sony', check: 'listed' },
  '057E': { name: 'Nintendo', check: 'listed' },
  '28DE': { name: 'Valve', check: 'listed' },
  '2DC8': { name: '8BitDo', check: 'listed' },
  '1E7D': { name: 'ROCCAT', check: 'listed' },
  '0951': { name: 'Kingston (HyperX)', check: 'listed' },
  '03F0': { name: 'HP (HyperX)', check: 'listed' },
  '2516': { name: 'Cooler Master', check: 'listed' },
  '3434': { name: 'Keychron', check: 'listed' },
  '046A': { name: 'Cherry', check: 'listed' },
  '044F': { name: 'Thrustmaster', check: 'listed' },
  '06A3': { name: 'Saitek', check: 'listed' },
  '0738': { name: 'Mad Catz', check: 'listed' },
  '17EF': { name: 'Lenovo', check: 'listed' },
  '413C': { name: 'Dell', check: 'listed' },
  '05AC': { name: 'Apple', check: 'listed' },
  '0489': { name: 'Foxconn / Hon Hai', check: 'listed', oem: true },
  '0BDA': { name: 'Realtek', check: 'listed', oem: true },
  '8087': { name: 'Intel', check: 'listed', oem: true },
  '04D9': { name: 'Holtek', check: 'listed', oem: true },
  '258A': { name: 'SINO WEALTH', check: 'listed', oem: true },
  '0C45': { name: 'Microdia', check: 'listed', oem: true },
  '0D8C': { name: 'C-Media', check: 'listed', oem: true },
  '0079': { name: 'DragonRise', check: 'listed', oem: true },
}
// Vendor apps that have no entry in lib/apps/known.js (so Jylli cannot know where they live): shown as text only, never launched.
const APP_NAMES = { ghub: 'Logitech G HUB', synapse: 'Razer Synapse', icue: 'Corsair iCUE', armoury: 'ASUS Armoury Crate' }

// PCI / HD-Audio vendor ids (the VEN_xxxx in HDAUDIO\FUNC_01&VEN_10EC...): who made the codec of an on-board or GPU sound device.
const PCI_VENDORS = { '10EC': 'Realtek', '10DE': 'NVIDIA', '1002': 'AMD', '1022': 'AMD', '8086': 'Intel', '1106': 'VIA', '14F1': 'Conexant', '111D': 'IDT' }
const pciVendor = ids => { for (const id of ids || []) { const m = /^HDAUDIO\\.*VEN_([0-9A-F]{4})/i.exec(String(id)); if (m && PCI_VENDORS[m[1].toUpperCase()]) return PCI_VENDORS[m[1].toUpperCase()] } return '' }

/** '36a7' / '0x36A7' / 'VID_36A7' -> '36A7' or '' */
function normVid(v) {
  const m = /^(?:vid_|0x)?([0-9a-f]{4})$/i.exec(String(v == null ? '' : v).trim())
  return m ? m[1].toUpperCase() : ''
}
/** { vid, pid } out of any Windows instance id (USB\VID_046D&PID_C339\..., HID\VID_...). Both are '' when the id has none. */
function idsOf(instanceId) {
  const s = String(instanceId || '')
  const v = /VID_([0-9A-F]{4})/i.exec(s), p = /PID_([0-9A-F]{4})/i.exec(s)
  return { vid: v ? v[1].toUpperCase() : '', pid: p ? p[1].toUpperCase() : '' }
}
const lookup = vid => VENDORS[normVid(vid)] || null
const appFor = vid => { const v = lookup(vid); return v && v.app ? { id: v.app, name: APP_NAMES[v.app] || v.app } : v && v.appName ? { id: null, name: v.appName } : null }

module.exports = { VENDORS, APP_NAMES, PCI_VENDORS, pciVendor, normVid, idsOf, lookup, appFor }
