'use strict'
// Devices tab: the ONLY list of what this tab may do to or for a device. Everything else it shows is information.
//   write    changes a Windows setting through the change journal (read back, undoable)           kbd-repeat
//   link     the setting belongs to another tab (Windows); this tab shows its state and opens it  pointer-accel, pointer-1to1
//   measure  reads only, listens to the mouse and counts                                          polling-test
//   open     starts the vendor's own app from the install path Jylli already knows                vendor-app
// Not here, on purpose: DPI, polling-rate or lighting WRITES. No mouse or keyboard maker documents a way for other software to change them
// (Logitech G HUB, Razer Synapse, SteelSeries GG and Corsair iCUE publish lighting / event SDKs, not DPI or polling rate), the protocols are private HID
// feature reports that differ per model, and a wrong write can leave a device unusable. So they are shown as "Display only: change it in <app>".
const CONTROLS = [
  { id: 'polling-test', kind: 'measure', cats: ['mouse'] },
  { id: 'pointer-accel', kind: 'link', cats: ['mouse'], windowsId: 'disable-mouse-accel' },
  { id: 'pointer-1to1', kind: 'link', cats: ['mouse'], windowsId: 'mouse-pointer-1to1' },
  { id: 'kbd-repeat', kind: 'write', cats: ['keyboard'], journal: 'devices:kbd-repeat' },
  { id: 'vendor-app', kind: 'open', cats: ['mouse', 'keyboard', 'gamepad', 'audio', 'rgb'] },
]
// What each kind of device has that this tab can only SHOW (never change).
const DISPLAY_ONLY = {
  mouse: ['dpi', 'polling_write', 'lighting', 'buttons'],
  keyboard: ['polling_write', 'lighting', 'macros'],
  gamepad: ['deadzone', 'lighting'],
  audio: ['eq'],
  rgb: ['lighting'],
}

const KBD = { delay: { min: 0, max: 3 }, speed: { min: 0, max: 31 } }
const KBD_KEY = 'HKCU\\Control Panel\\Keyboard'
const MARK = 'JJKBD:'

const kbdReadScript = () => String.raw`$ErrorActionPreference = 'SilentlyContinue'
$k = Get-ItemProperty -LiteralPath 'HKCU:\Control Panel\Keyboard'
'${MARK}' + (ConvertTo-Json -Compress @{ delay = $k.KeyboardDelay; speed = $k.KeyboardSpeed })
`
/** Tells the running session about the new values (the registry alone is only read at sign-in). Writes nothing to the registry itself (flag 2 = broadcast only). */
const kbdLiveScript = (delay, speed) => String.raw`$ErrorActionPreference = 'Stop'
Add-Type -Namespace JJ -Name Kbd -MemberDefinition '[DllImport("user32.dll", SetLastError=true)] public static extern bool SystemParametersInfo(uint a, uint u, IntPtr p, uint f);'
$a = [JJ.Kbd]::SystemParametersInfo(0x17, ${Number(delay)}, [IntPtr]::Zero, 2)
$b = [JJ.Kbd]::SystemParametersInfo(0x0B, ${Number(speed)}, [IntPtr]::Zero, 2)
'JJKBDLIVE:' + (ConvertTo-Json -Compress @{ delay = $a; speed = $b })
`
function kbdParse(out) {
  const line = String(out || '').split(/\r?\n/).reverse().find(l => l.startsWith(MARK))
  if (!line) return null
  let j; try { j = JSON.parse(line.slice(MARK.length)) } catch { return null }
  const n = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
  return { delay: n(j.delay), speed: n(j.speed) }
}
const kbdValid = (delay, speed) => Number.isInteger(delay) && Number.isInteger(speed) && delay >= KBD.delay.min && delay <= KBD.delay.max && speed >= KBD.speed.min && speed <= KBD.speed.max
const kbdCommands = (delay, speed) => [
  'reg add "' + KBD_KEY + '" /v KeyboardDelay /t REG_SZ /d ' + delay + ' /f',
  'reg add "' + KBD_KEY + '" /v KeyboardSpeed /t REG_SZ /d ' + speed + ' /f',
]

/** The controls of one device: what can be changed here, what links elsewhere, what is display-only, and the vendor app. ctx = { windows:{id:status}, appInstalled:{appId:bool|null}, kbd:{delay,speed}|null } */
function forDevice(dev, ctx) {
  const c = ctx || {}
  const out = { change: [], link: [], measure: [], info: [], app: null }
  if (dev.virtual || dev.core || !dev.present) return out
  for (const k of CONTROLS) {
    if (!k.cats.includes(dev.category) || k.kind === 'open') continue
    if (k.kind === 'write') out.change.push({ id: k.id, value: c.kbd || null, range: KBD })
    else if (k.kind === 'link') out.link.push({ id: k.id, windowsId: k.windowsId, status: (c.windows && c.windows[k.windowsId]) || 'unknown' })
    else if (k.kind === 'measure') out.measure.push({ id: k.id })
  }
  out.info = (DISPLAY_ONLY[dev.category] || []).slice()
  if (dev.app) out.app = { id: dev.app.id, name: dev.app.name, installed: dev.app.id && c.appInstalled ? (c.appInstalled[dev.app.id] === undefined ? null : c.appInstalled[dev.app.id]) : null }
  return out
}

module.exports = { CONTROLS, DISPLAY_ONLY, KBD, KBD_KEY, kbdReadScript, kbdLiveScript, kbdParse, kbdValid, kbdCommands, forDevice }
