'use strict'
// Startup tab "Ignition": the ONLY list of where programs start from, how each one is switched on or off, and which changes this tab owns.
// Windows' own switch is `Explorer\StartupApproved` (what Task Manager > Startup apps reads and writes): first byte 02 = on, 03 = off, then the
// FILETIME of the moment it was switched off. Nothing is ever deleted here, so Task Manager always agrees with this tab.
const classifier = require('../auto-opti/startup')

const CU = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\'
const LM = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\'
const LM32 = 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\'

/** Where a startup entry can live. `approved` = the StartupApproved key that holds its on/off byte (null = switched another way). */
const SOURCES = {
  'run-hkcu':    { kind: 'run',    key: CU + 'Run',  approved: CU + 'Explorer\\StartupApproved\\Run',          user: true,  icon: 'user' },
  'run-hklm':    { kind: 'run',    key: LM + 'Run',  approved: LM + 'Explorer\\StartupApproved\\Run',          user: false, icon: 'desktop' },
  'run-hklm32':  { kind: 'run',    key: LM32 + 'Run', approved: LM + 'Explorer\\StartupApproved\\Run32',       user: false, icon: 'desktop' },
  'folder-user': { kind: 'folder', dirEnv: 'Startup',       approved: CU + 'Explorer\\StartupApproved\\StartupFolder', user: true,  icon: 'folder' },
  'folder-all':  { kind: 'folder', dirEnv: 'CommonStartup', approved: LM + 'Explorer\\StartupApproved\\StartupFolder', user: false, icon: 'folder' },
  'task':        { kind: 'task',   approved: null, user: false, icon: 'calendar-check' },
  'appx':        { kind: 'appx',   approved: null, user: true,  icon: 'store' },
}
const SRC_IDS = Object.keys(SOURCES)

const ON_BYTES = [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
/** 03 + the FILETIME of "now" (little endian, 8 bytes): what Windows writes itself when you switch an item off in Task Manager. */
function offBytes(nowMs) {
  const ft = BigInt(Math.floor(nowMs)) * 10000n + 116444736000000000n
  const out = [3, 0, 0, 0]
  for (let i = 0n; i < 8n; i++) out.push(Number((ft >> (8n * i)) & 0xffn))
  return out
}
/** First byte of a StartupApproved value -> on / off. Windows treats an even first byte (02, 06) as on and an odd one (01, 03, 07) as off. */
const bytesOn = b => (Array.isArray(b) && b.length ? (Number(b[0]) & 1) === 0 : true)
/** The "off since" moment inside a StartupApproved value (ms since 1970) or null. */
function offSince(b) {
  if (!Array.isArray(b) || b.length < 12 || (Number(b[0]) & 1) === 0) return null
  let ft = 0n
  for (let i = 7; i >= 0; i--) ft = (ft << 8n) | BigInt(Number(b[4 + i]) & 255)
  if (ft === 0n) return null
  const ms = Number((ft - 116444736000000000n) / 10000n)
  return ms > 0 && ms < 4102444800000 ? ms : null
}

/** Jylli's own delay tasks live in this folder; an older version used a flat `JylliDelay_<name>` task. */
const DELAY_PATH = '\\JylliTool\\'
const DELAY_PREFIX = 'Delay_'
const LEGACY_TASK_PREFIX = 'JylliDelay_'
const LEGACY_DISABLED = { 'run-hkcu': CU + 'Run\\AutorunsDisabled', 'run-hklm': LM + 'Run\\AutorunsDisabled' }
const DELAYS = [30, 60, 120]

const slug = s => String(s || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'item'
const delayTaskName = id => DELAY_PREFIX + slug(id) + '_' + hash(id)
function hash(s) { let h = 5381; for (const c of String(s)) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0; return h.toString(36).slice(0, 5) }
const idOf = (src, name) => src + '|' + String(name || '').toLowerCase()

/** Items that are never offered as "worth switching off" whatever the classifier says. Matched against name + command. */
const KEEP_NAME = /jylli|securityhealth|windows security|vanguard|vgc\b|easyanticheat|battleye|ctfmon|msiafterburner|rtss|hwinfo/i
/** On a laptop these are kept too (hotkeys, battery and power helpers). */
const LAPTOP_KEEP = /battery|power|asus|lenovo|dell|hp ?(system|hotkey)|acer|msi ?ec|hotkey|touchpad|fn ?key/i

/** Typical weight of a category when nothing was measured. Always shown as "typical", never as a measurement. */
const TYPICAL = { launcher: 'medium', chat: 'medium', cloud: 'medium', media: 'low', 'vendor-bloat': 'low', driver: 'low', security: 'low', 'updater-security': 'low', unknown: null }
/** Measured slowdown (ms) from Windows' own "this program slowed your boot" events. */
const IMPACT = { high: 3000, medium: 1000 }

/** The one switch this tab owns: signing back in re-opens the apps that were running (the Settings > Accounts > Sign-in options toggle). */
const OWNED = [
  { id: 'restart-apps', key: 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon', name: 'RestartApps', type: 'DWord', value: 0, icon: 'rotate-right' },
]

function classify(item) { return classifier.classify({ name: item.name, cmd: item.cmd, company: item.publisher, enabled: item.enabled }) }

module.exports = { SOURCES, SRC_IDS, ON_BYTES, offBytes, bytesOn, offSince, DELAY_PATH, DELAY_PREFIX, LEGACY_TASK_PREFIX, LEGACY_DISABLED, DELAYS, slug, delayTaskName, idOf,
  KEEP_NAME, LAPTOP_KEEP, TYPICAL, IMPACT, OWNED, classify, classifier }
