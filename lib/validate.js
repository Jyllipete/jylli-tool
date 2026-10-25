// Input validation for anything that originates in the renderer. Rule: renderer data is never trusted and never
// concatenated into a shell string — validate with these, then pass as an execFile argument or psQuote() it.
const net = require('net')
const path = require('path')

/** PowerShell single-quoted string literal. Quote characters (incl. Unicode look-alikes PowerShell honours) are doubled. */
function psQuote(value) {
  return "'" + String(value).replace(/['\u2018\u2019\u201A\u201B]/g, m => m + m) + "'"
}

const DEVICE_ID_RE = /^[A-Za-z0-9\\&_.#{}\-]{3,200}$/
/** PnP instance id such as PCI\VEN_10DE&DEV_2204\4&1A2B3C&0&0008 */
const isDeviceInstanceId = v => typeof v === 'string' && DEVICE_ID_RE.test(v)

const SERVICE_RE = /^[A-Za-z0-9_\-.]{1,256}$/
const isServiceName = v => typeof v === 'string' && SERVICE_RE.test(v)

/** Scheduled tasks created by Jylli Tool are always named JT_<word chars>. */
const TASK_RE = /^JT_[A-Za-z0-9_\-]{1,80}$/
const isJylliTaskName = v => typeof v === 'string' && TASK_RE.test(v)

const isIp = v => typeof v === 'string' && net.isIP(v) !== 0

const HOST_RE = /^(?=.{1,253}$)([A-Za-z0-9]([A-Za-z0-9\-]{0,61}[A-Za-z0-9])?)(\.[A-Za-z0-9]([A-Za-z0-9\-]{0,61}[A-Za-z0-9])?)*$/
const isHostname = v => typeof v === 'string' && (HOST_RE.test(v) || net.isIP(v) !== 0)

const isPort = v => Number.isInteger(v) && v >= 1 && v <= 65535

const PROCESS_NAME_RE = /^[A-Za-z0-9 _.\-()+]{1,128}$/
const isProcessName = v => typeof v === 'string' && PROCESS_NAME_RE.test(v)

/** Windows network adapter alias (e.g. "Ethernet 2", "Wi-Fi", "vEthernet (WSL)"). */
const ADAPTER_RE = /^[A-Za-z0-9 _.\-()#]{1,128}$/
const isAdapterName = v => typeof v === 'string' && ADAPTER_RE.test(v)

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/
const isHexColor = v => typeof v === 'string' && HEX_COLOR_RE.test(v)

/** Number within [min,max], clamped; returns null when not a finite number so callers can reject. */
function clampNum(v, min, max) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  return Math.min(max, Math.max(min, n))
}

/** Strict: number must already be within range (no silent clamping). */
function inRange(v, min, max) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max ? n : null
}

const BLOCKED_TOP = new Set(['windows', 'system volume information', '$recycle.bin', 'recovery', 'programdata'])
const BAD_PATH_CHARS = /[*?<>|"\r\n\0]/
/**
 * A folder that is safe to add as a Defender exclusion for a game: absolute drive path, no wildcards or "..",
 * at least two levels below the drive root, not inside Windows / ProgramData, and C:\Users needs a profile subfolder.
 */
function isSafeGamePath(p) {
  if (typeof p !== 'string' || p.length < 6 || p.length > 260 || p.includes('..') || BAD_PATH_CHARS.test(p)) return false
  if (!/^[A-Za-z]:[\\/]/.test(p)) return false
  const parts = path.win32.normalize(p).split('\\').filter(Boolean)   // ['C:', 'Games', 'X']
  if (parts.length < 3) return false
  const top = parts[1].toLowerCase()
  if (BLOCKED_TOP.has(top)) return false
  if (top === 'users' && parts.length < 4) return false
  return true
}

module.exports = {
  psQuote, isDeviceInstanceId, isServiceName, isJylliTaskName, isIp, isHostname, isPort,
  isProcessName, isAdapterName, isHexColor, clampNum, inRange, isSafeGamePath,
}
