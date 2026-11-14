'use strict'
// Apps tab "Backstage": the ONLY list of changes that stay on the PC (everything Game time does is temporary and lives in rules.js).
// Row kinds: policy (a documented browser policy value in HKLM), file (our own marked lines in the app's settings file, written by index.js
// through injected file deps), service (start type of one service, only shown when the service exists), priority (a per-program CPU priority through
// the CPU & Memory tab's IFEO writer).
// Retired = changes an older Jylli version made that this version no longer makes: restore-only, offered through "Put back" (see LEGACY).
// Why each row is in or out: docs/APPS_EVIDENCE.md.
const POL = 'HKLM:\\SOFTWARE\\Policies\\'
const IFEO_BASE = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options'
const PRIORITY_ABOVE = 6                        // CpuPriorityClass AboveNormal (same value lib/cpumem/actions.js writes)

const ROWS = [
  { id: 'edge-startup-boost', app: 'edge', kind: 'policy', icon: 'bolt', key: POL + 'Microsoft\\Edge', name: 'StartupBoostEnabled', value: 0, rec: true, restart: true },
  { id: 'edge-background', app: 'edge', kind: 'policy', icon: 'moon', key: POL + 'Microsoft\\Edge', name: 'BackgroundModeEnabled', value: 0, rec: true, restart: true },
  { id: 'chrome-background', app: 'chrome', kind: 'policy', icon: 'moon', key: POL + 'Google\\Chrome', name: 'BackgroundModeEnabled', value: 0, rec: true, restart: true },
  { id: 'brave-background', app: 'brave', kind: 'policy', icon: 'moon', key: POL + 'BraveSoftware\\Brave', name: 'BackgroundModeEnabled', value: 0, rec: true, restart: true },
  { id: 'firefox-lean', app: 'firefox', kind: 'file', icon: 'feather', rec: true, restart: true },
  { id: 'discord-hwaccel', app: 'discord', kind: 'file', icon: 'microchip', rec: false, restart: true },
  { id: 'nvidia-telemetry', app: 'nvidia', kind: 'service', icon: 'eye-slash', service: 'NvTelemetryContainer', rec: false },
  { id: 'obs-priority', app: 'obs', kind: 'priority', icon: 'gauge-high', exe: 'obs64.exe', level: 'above', rec: true },
]
const byId = Object.fromEntries(ROWS.map(r => [r.id, r]))
const ids = () => ROWS.map(r => r.id)
const rowsOf = app => ROWS.filter(r => r.app === app)
const q = s => "'" + String(s).replace(/'/g, "''") + "'"

/** The PowerShell lines that switch a registry / service row on or off. `before` = what the probe read (service start type). */
function lines(row, on, before) {
  if (row.kind === 'policy') {
    return on
      ? [`New-Item -Path ${q(row.key)} -Force -EA SilentlyContinue | Out-Null`, `Set-ItemProperty -Path ${q(row.key)} -Name ${q(row.name)} -Value ${row.value} -Force`]
      : [`Remove-ItemProperty -Path ${q(row.key)} -Name ${q(row.name)} -EA SilentlyContinue`]
  }
  if (row.kind === 'service') {
    const type = /^(Automatic|Manual|Disabled)$/i.test(String(before || '')) && !/disabled/i.test(String(before)) ? before : 'Automatic'
    return on
      ? [`Stop-Service -Name ${q(row.service)} -Force -EA SilentlyContinue`, `Set-Service -Name ${q(row.service)} -StartupType Disabled -EA SilentlyContinue`]
      : [`Set-Service -Name ${q(row.service)} -StartupType ${type} -EA SilentlyContinue`]
  }
  return []
}

// ── Firefox: OUR lines only, between two markers; the user's own lines are never touched. ──
const FF_BEGIN = '// >>> Jylli Tool: Firefox lean (remove this block to undo) >>>'
const FF_END = '// <<< Jylli Tool <<<'
const FF_LINES = ['user_pref("browser.sessionstore.interval", 60000);', 'user_pref("browser.sessionhistory.max_total_viewers", 4);']
const FF_LEGACY_HEAD = '// PTU Firefox Performance'      // the header the old version wrote over the whole file
function ffBlock() { return [FF_BEGIN, ...FF_LINES, FF_END].join('\n') }
function ffHas(text) { return typeof text === 'string' && text.includes(FF_BEGIN) && text.includes(FF_END) }
function ffAdd(text) {
  const t = String(text == null ? '' : text)
  if (ffHas(t)) return t
  const nl = t.includes('\r\n') ? '\r\n' : '\n'
  const block = ffBlock().split('\n').join(nl)
  return t + (t && !/\r?\n$/.test(t) ? nl : '') + block + nl
}
function ffRemove(text) {
  const t = String(text == null ? '' : text)
  const a = t.indexOf(FF_BEGIN), b = t.indexOf(FF_END)
  if (a < 0 || b < a) return t
  let end = b + FF_END.length
  if (t.slice(end, end + 2) === '\r\n') end += 2; else if (t[end] === '\n') end += 1
  return t.slice(0, a) + t.slice(end)
}
function ffLegacy(text) { return typeof text === 'string' && text.startsWith(FF_LEGACY_HEAD) }

// ── Discord: only `enableHardwareAcceleration`. Everything else in settings.json is left exactly as it is. ──
function discordReadHw(text) {
  try { const j = JSON.parse(text); return j.enableHardwareAcceleration === false ? 'all' : 'none' } catch { return 'unread' }
}
/** -> { text, before } where before = the previous value of the key ({exists, value}) so restore can put it back. */
function discordSetHw(text, off, prev) {
  const j = JSON.parse(text)
  const before = Object.prototype.hasOwnProperty.call(j, 'enableHardwareAcceleration') ? { exists: true, value: j.enableHardwareAcceleration } : { exists: false }
  if (off) j.enableHardwareAcceleration = false
  else if (prev && prev.exists) j.enableHardwareAcceleration = prev.value
  else delete j.enableHardwareAcceleration
  return { text: JSON.stringify(j, null, 2), before }
}
/** Old bundle evidence: it also set SKIP_HOST_UPDATE (blocked Discord's own updates) and the legacy audio subsystem. */
function discordLegacy(text) {
  try { const j = JSON.parse(text); return j.SKIP_HOST_UPDATE === true || j.audioSubsystem === 'legacy' } catch { return false }
}

// ── Retired ──────────────────────────────────────────────────────────────────
// id = the old tweak id (settings key tweak_<id>, restore handler in main.js `APP_OPTIMIZER_TWEAKS`). ifeo = the IFEO exe it wrote (value 1 = Idle).
const LEGACY = [
  { id: 'discord-optimize', app: 'discord', file: 'discord' },
  { id: 'discord-cpu-priority', app: 'discord', ifeo: 'Discord.exe', value: 1 },
  { id: 'spotify-optimize', app: 'spotify', ifeo: 'Spotify.exe', value: 1 },
  { id: 'vscode-optimize', app: 'vscode', ifeo: 'Code.exe', value: 1 },
  { id: 'ea-app-optimize', app: 'ea', ifeo: 'EADesktop.exe', value: 1 },
  { id: 'riot-optimize', app: 'riot', ifeo: 'RiotClientServices.exe', value: 1 },
  { id: 'playnite-optimize', app: 'playnite', ifeo: 'Playnite.DesktopApp.exe', value: 1 },
  { id: 'firefox-optimize', app: 'firefox', file: 'firefox' },
  { id: 'obs-optimize', app: 'obs', ifeo: 'obs64.exe', value: 3, flagOnly: true },
]
const LEGACY_IFEO = [...new Set(LEGACY.filter(l => l.ifeo).map(l => l.ifeo))]

/**
 * Which old changes are still on this PC. o: { settings: {tweak_<id>: 'applied'|'restored'}, ifeo: {<exe lower>: value|null}, files: { discord: bool, firefox: bool } }
 * Evidence is the old settings flag OR the value itself; a value that is not the one the old version wrote is somebody else's and is never listed.
 */
function legacyFound(o) {
  const st = (o && o.settings) || {}, ifeo = (o && o.ifeo) || {}, files = (o && o.files) || {}
  const out = []
  for (const l of LEGACY) {
    const flagged = st['tweak_' + l.id] === 'applied'
    let live = false
    if (l.ifeo) live = ifeo[l.ifeo.toLowerCase()] === l.value
    if (l.file) live = !!files[l.file]
    if (l.flagOnly ? (flagged && live) : (flagged || live)) out.push({ id: l.id, app: l.app })
  }
  return out
}

module.exports = { ROWS, byId, ids, rowsOf, lines, q, IFEO_BASE, PRIORITY_ABOVE, LEGACY, LEGACY_IFEO, legacyFound,
  FF_BEGIN, FF_END, ffBlock, ffHas, ffAdd, ffRemove, ffLegacy, discordReadHw, discordSetHw, discordLegacy }
