'use strict'
// Cleanup catalog: the ONE list of what Jylli Tool may delete. Measuring, cleaning, the TWEAKS clean-* entries and Auto-Optimize all read it,
// so what is shown is what is removed. Pure data + root resolution (fs is injected so tests can use a temp tree).
//   lane:    'safe' (pre-ticked, rebuilds by itself) | 'review' (rebuild has a cost, or is not just a cache) | 'permanent' (cannot be undone)
//   rebuild: 'none' | 'seconds' | 'firstLaunch' | 'shaderRecompile'
//   special: handled by lib/cleanup/special.js instead of the file walker
const path = require('path')

const GROUPS = ['system', 'browsers', 'gpu', 'apps', 'games', 'dev', 'permanent']
const LANES = ['safe', 'review', 'permanent']
const REBUILD = ['none', 'seconds', 'firstLaunch', 'shaderRecompile']

const j = (...p) => path.win32.join(...p)
const SR = e => e.SystemRoot || 'C:\\Windows'
const PD = e => e.ProgramData || 'C:\\ProgramData'

function listDirs(fs, dir, rx) {
  try { return fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory() && rx.test(d.name)).map(d => d.name) } catch { return [] }
}
/** Chromium user-data dir -> every profile's cache folders (Default, Profile 1, ...). */
function chromiumCaches(fs, userData, subs = ['Cache', 'Code Cache', 'GPUCache', 'Service Worker\\CacheStorage']) {
  if (!userData) return []
  const out = []
  for (const n of listDirs(fs, userData, /^(Default|Profile \d+|Guest Profile)$/)) for (const s of subs) out.push(j(userData, n, s))
  return out
}
/** Chromium history/cookie files (permanent lane). */
function chromiumHistory(fs, userData) {
  if (!userData) return []
  const out = []
  for (const n of listDirs(fs, userData, /^(Default|Profile \d+)$/)) for (const f of ['History', 'History-journal', 'Cookies', 'Cookies-journal', 'Network\\Cookies', 'Network\\Cookies-journal']) out.push(j(userData, n, f))
  return out
}
function firefoxCaches(fs, lad) {
  const base = j(lad || '', 'Mozilla', 'Firefox', 'Profiles')
  return listDirs(fs, base, /./).flatMap(n => [j(base, n, 'cache2'), j(base, n, 'startupCache')])
}
function packageCache(fs, lad, prefix) {
  const base = j(lad || '', 'Packages')
  return listDirs(fs, base, new RegExp('^' + prefix.replace(/[.]/g, '\\.'))).map(n => j(base, n, 'LocalCache'))
}

// id, group, lane, rebuild, processes (exe names that hold the files open), minAgeHours, roots(env, fs), requires, special, files, glob
const TARGETS = [
  // ── System ──
  { id: 'clean-temp', group: 'system', lane: 'safe', rebuild: 'seconds', minAgeHours: 24, protectPersonal: true, processes: [], icon: 'trash',
    roots: e => [e.TEMP, j(SR(e), 'Temp')] },
  { id: 'clean-wu', group: 'system', lane: 'safe', rebuild: 'none', minAgeHours: 240, processes: [], icon: 'download', skipWhenWuPending: true,
    roots: e => [j(SR(e), 'SoftwareDistribution', 'Download')] },
  { id: 'clean-deliveryopt', group: 'system', lane: 'safe', rebuild: 'none', minAgeHours: 0, processes: [], icon: 'cloud-arrow-down',
    roots: e => [j(SR(e), 'ServiceProfiles', 'NetworkService', 'AppData', 'Local', 'Microsoft', 'Windows', 'DeliveryOptimization', 'Cache')] },
  { id: 'clean-errorlogs', group: 'system', lane: 'safe', rebuild: 'none', minAgeHours: 0, processes: [], icon: 'bug-slash',
    roots: e => [j(SR(e), 'Minidump'), j(e.LOCALAPPDATA || '', 'CrashDumps'), j(PD(e), 'Microsoft', 'Windows', 'WER', 'ReportQueue'),
      j(PD(e), 'Microsoft', 'Windows', 'WER', 'ReportArchive'), j(SR(e), 'LiveKernelReports')],
    files: [e => j(SR(e), 'MEMORY.DMP')] },
  { id: 'clean-thumbnails', group: 'system', lane: 'safe', rebuild: 'seconds', minAgeHours: 0, processes: [], icon: 'image', needsExplorerRestart: true,
    roots: () => [], glob: e => ({ dir: j(e.LOCALAPPDATA || '', 'Microsoft', 'Windows', 'Explorer'), rx: /^(thumbcache|iconcache)_.*\.db$/i }) },
  { id: 'clean-fontcache', group: 'system', lane: 'safe', rebuild: 'seconds', minAgeHours: 0, processes: [], icon: 'font', needsService: 'FontCache',
    roots: () => [], glob: e => ({ dir: j(e.LOCALAPPDATA || '', 'Microsoft', 'Windows'), rx: /^FontCache/i }), files: [e => j(SR(e), 'System32', 'FNTCACHE.DAT')] },
  { id: 'clean-winsxs', group: 'system', lane: 'review', rebuild: 'none', special: 'dism', processes: [], icon: 'box-archive', slow: true, roots: () => [] },
  { id: 'clean-eventlogs', group: 'system', lane: 'review', rebuild: 'none', special: 'eventlogs', processes: [], icon: 'list-check', roots: () => [] },
  { id: 'clean-upgrade-leftovers', group: 'system', lane: 'review', rebuild: 'none', minAgeHours: 0, processes: [], icon: 'folder-minus',
    roots: () => ['C:\\$Windows.~BT', 'C:\\$Windows.~WS'] },

  // ── Browsers ──
  { id: 'clean-browsers', group: 'browsers', lane: 'safe', rebuild: 'firstLaunch', minAgeHours: 0, icon: 'globe',
    processes: ['msedge.exe', 'chrome.exe', 'firefox.exe', 'brave.exe', 'vivaldi.exe', 'opera.exe'],
    roots: (e, fs) => [
      ...chromiumCaches(fs, j(e.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'User Data')),
      ...chromiumCaches(fs, j(e.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data')),
      ...chromiumCaches(fs, j(e.LOCALAPPDATA || '', 'BraveSoftware', 'Brave-Browser', 'User Data')),
      ...chromiumCaches(fs, j(e.LOCALAPPDATA || '', 'Vivaldi', 'User Data')),
      ...chromiumCaches(fs, j(e.APPDATA || '', 'Opera Software', 'Opera GX Stable')),
      ...chromiumCaches(fs, j(e.APPDATA || '', 'Opera Software', 'Opera Stable')),
      ...firefoxCaches(fs, e.LOCALAPPDATA),
    ] },
  // Firefox is left alone here: its history and bookmarks share one file.
  { id: 'clean-browser-history', group: 'permanent', lane: 'permanent', rebuild: 'none', minAgeHours: 0, icon: 'clock-rotate-left', filesOnly: true,
    processes: ['msedge.exe', 'chrome.exe', 'brave.exe', 'vivaldi.exe'],
    roots: (e, fs) => [
      ...chromiumHistory(fs, j(e.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'User Data')),
      ...chromiumHistory(fs, j(e.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data')),
      ...chromiumHistory(fs, j(e.LOCALAPPDATA || '', 'BraveSoftware', 'Brave-Browser', 'User Data')),
      ...chromiumHistory(fs, j(e.LOCALAPPDATA || '', 'Vivaldi', 'User Data')),
    ] },

  // ── GPU shader caches (a rebuild costs a stutter, so: review) ──
  { id: 'clean-nvidia', group: 'gpu', lane: 'review', rebuild: 'shaderRecompile', minAgeHours: 0, processes: [], icon: 'microchip', requires: 'nvidia',
    roots: e => [j(e.LOCALAPPDATA || '', 'NVIDIA', 'DXCache'), j(e.LOCALAPPDATA || '', 'NVIDIA', 'GLCache'), j(e.LOCALAPPDATA || '', 'NVIDIA', 'ComputeCache'),
      j(e.LOCALAPPDATA || '', 'D3DSCache'), j(e.TEMP || '', 'NVIDIA Corporation', 'NV_Cache')] },
  { id: 'clean-amd-shader', group: 'gpu', lane: 'review', rebuild: 'shaderRecompile', minAgeHours: 0, processes: [], icon: 'microchip', requires: 'amd',
    roots: e => [j(e.LOCALAPPDATA || '', 'AMD', 'DxCache'), j(e.LOCALAPPDATA || '', 'AMD', 'GLCache'), j(e.LOCALAPPDATA || '', 'AMD', 'VkCache')] },

  // ── App caches ──
  { id: 'clean-discord', group: 'apps', lane: 'safe', rebuild: 'firstLaunch', minAgeHours: 0, processes: ['Discord.exe'], icon: 'comment',
    roots: e => ['Cache', 'Code Cache', 'GPUCache'].map(n => j(e.APPDATA || '', 'discord', n)) },
  { id: 'clean-spotify', group: 'apps', lane: 'safe', rebuild: 'firstLaunch', minAgeHours: 0, processes: ['Spotify.exe'], icon: 'music',
    roots: e => [j(e.LOCALAPPDATA || '', 'Spotify', 'Storage')] },
  { id: 'clean-xbox', group: 'apps', lane: 'safe', rebuild: 'firstLaunch', minAgeHours: 0, processes: ['XboxPcApp.exe', 'GamingApp.exe'], icon: 'gamepad',
    roots: (e, fs) => packageCache(fs, e.LOCALAPPDATA, 'Microsoft.GamingApp_') },
  { id: 'clean-msstore', group: 'apps', lane: 'safe', rebuild: 'firstLaunch', minAgeHours: 0, processes: ['WinStore.App.exe'], icon: 'shop',
    roots: (e, fs) => packageCache(fs, e.LOCALAPPDATA, 'Microsoft.WindowsStore_') },
  { id: 'clean-vscode', group: 'apps', lane: 'safe', rebuild: 'firstLaunch', minAgeHours: 0, processes: ['Code.exe'], icon: 'code',
    roots: e => ['Cache', 'CachedData', 'Code Cache', 'GPUCache'].map(n => j(e.APPDATA || '', 'Code', n)) },
  { id: 'clean-teams-slack', group: 'apps', lane: 'safe', rebuild: 'firstLaunch', minAgeHours: 0, processes: ['ms-teams.exe', 'slack.exe'], icon: 'users',
    roots: e => [j(e.APPDATA || '', 'Slack', 'Cache'), j(e.APPDATA || '', 'Slack', 'Code Cache'), j(e.APPDATA || '', 'Slack', 'GPUCache'),
      j(e.LOCALAPPDATA || '', 'Packages', 'MSTeams_8wekyb3d8bbwe', 'LocalCache', 'Microsoft', 'MSTeams', 'EBWebView', 'Default', 'Cache')] },

  // ── Games ──
  { id: 'clean-steam', group: 'games', lane: 'safe', rebuild: 'firstLaunch', minAgeHours: 0, processes: ['steam.exe', 'steamwebhelper.exe'], icon: 'gamepad',
    roots: e => [j(e.LOCALAPPDATA || '', 'Steam', 'htmlcache'), j(e.APPDATA || '', 'Steam', 'logs'), j(e.APPDATA || '', 'Steam', 'dumps'),
      'C:\\Program Files (x86)\\Steam\\logs', 'C:\\Program Files (x86)\\Steam\\dumps'] },
  { id: 'clean-gameservices', group: 'games', lane: 'safe', rebuild: 'firstLaunch', minAgeHours: 0, icon: 'store',
    processes: ['EADesktop.exe', 'EpicGamesLauncher.exe', 'Battle.net.exe'],
    roots: e => [j(e.LOCALAPPDATA || '', 'EA Desktop', 'logs'), j(e.LOCALAPPDATA || '', 'EA Desktop', 'cache'), j(e.APPDATA || '', 'Battle.net', 'Cache'),
      j(e.APPDATA || '', 'Battle.net', 'Logs'), j(e.LOCALAPPDATA || '', 'EpicGamesLauncher', 'Saved', 'Logs'), j(e.LOCALAPPDATA || '', 'EpicGamesLauncher', 'Saved', 'webcache')] },
  { id: 'clean-roblox', group: 'games', lane: 'safe', rebuild: 'firstLaunch', minAgeHours: 0, processes: ['RobloxPlayerBeta.exe'], icon: 'cube',
    roots: e => [j(e.LOCALAPPDATA || '', 'Roblox', 'logs'), j(e.TEMP || '', 'Roblox')] },
  { id: 'fivem-clear-cache', group: 'games', lane: 'review', rebuild: 'firstLaunch', minAgeHours: 0, processes: ['FiveM.exe'], icon: 'car', requires: 'fivem',
    roots: e => [j(e.LOCALAPPDATA || '', 'FiveM', 'FiveM.app', 'data', 'cache'), j(e.LOCALAPPDATA || '', 'FiveM', 'FiveM.app', 'data', 'server-cache'),
      j(e.LOCALAPPDATA || '', 'FiveM', 'FiveM.app', 'data', 'server-cache-priv')] },

  // ── Dev tools ── (~/.nuget/packages is the global package store, not a cache: never touched)
  { id: 'clean-vs-temp', group: 'dev', lane: 'review', rebuild: 'firstLaunch', minAgeHours: 0, processes: ['devenv.exe', 'dotnet.exe', 'node.exe'], icon: 'code',
    roots: e => [j(e.TEMP || '', 'NuGetScratch'), j(e.LOCALAPPDATA || '', 'NuGet', 'Cache'), j(e.LOCALAPPDATA || '', 'Microsoft', 'TypeScript'),
      j(e.LOCALAPPDATA || '', 'npm-cache'), j(e.APPDATA || '', 'npm-cache')] },

  // ── Permanent ──
  { id: 'clean-recycle', group: 'permanent', lane: 'permanent', rebuild: 'none', special: 'recycle', processes: [], icon: 'trash-can', roots: () => [] },
  { id: 'clean-old-windows', group: 'permanent', lane: 'permanent', rebuild: 'none', special: 'oldwindows', processes: [], icon: 'folder-open', slow: true,
    roots: () => ['C:\\Windows.old'] },
]

const byId = new Map(TARGETS.map(t => [t.id, t]))
const get = id => byId.get(id) || null
const ids = () => TARGETS.map(t => t.id)

/** Every absolute root of a target, deduped. */
function resolveRoots(target, env, fs) {
  const out = new Set()
  for (const r of target.roots(env || {}, fs)) if (r && path.win32.isAbsolute(r)) out.add(path.win32.normalize(r))
  return [...out]
}
/** Single files a target removes: the explicit list plus a directory glob. */
function resolveFiles(target, env, fs) {
  const out = []
  for (const f of (Array.isArray(target.files) ? target.files : [])) { const p = f(env || {}); if (p) out.push(p) }
  if (target.glob) {
    const { dir, rx } = target.glob(env || {})
    try { for (const d of fs.readdirSync(dir, { withFileTypes: true })) if (d.isFile() && rx.test(d.name)) out.push(path.win32.join(dir, d.name)) } catch {}
  }
  return out
}

module.exports = { TARGETS, GROUPS, LANES, REBUILD, get, ids, resolveRoots, resolveFiles }
