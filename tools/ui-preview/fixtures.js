// Fixture data for the UI preview harness. Unknown calls resolve to { ok: false } so a page that needs more data shows its
// error/empty state instead of crashing the harness. Add fixtures here whenever a page renders blank.
const now = Date.now()

const sysInfo = {
  computerName: 'JYLLI-PC', osCaption: 'Microsoft Windows 11 Pro', isAdmin: true,
  cpu: 'AMD Ryzen 7 7800X3D 8-Core Processor', cpuBrand: 'amd', cpuCores: 8, cpuThreads: 16, cpuSpeed: 4200,
  ram: 34359738368, ramGB: 32, ramHz: 6000, ramType: 'DDR5', ramSpec: 'DDR5-6000', ramSpeed: 6000,
  gpu: 'NVIDIA GeForce RTX 4070 Ti', gpuBrand: 'nvidia', gpuDriver: '561.09', vramMB: 12288,
  diskType: 'NVMe SSD', nvme: true, diskModel: 'Samsung SSD 990 PRO 2TB', diskSizeGB: 1863, diskTotalGB: 1863, diskUsedGB: 812,
  displayRes: '2560x1440', displayRefresh: 165, isLaptop: false, isWifi: false, onBattery: false,
  hasEthernet: true, hasBluetooth: true, hasInternet: true, nicName: 'Intel(R) Ethernet Controller I225-V', nicSpeed: 2.5, nicDriver: '1.1.4.43',
  fivemInstalled: true, hwInfoStatus: 'ok',
}

const metrics = (t = 0) => ({
  cpu: 23 + Math.round(8 * Math.sin(t)), ram: 46, ramUsed: 15, ramTotal: 32, disk: 44, diskUsed: 812, diskTotal: 1863,
  gpu: 31, netDown: 182000, netUp: 41000, uptime: 93600, processes: 214, cpuTemp: 54, gpuTemp: 49,
})

const tweakStates = {}
for (const id of ['chrome-optimize', 'steam-optimize', 'discord-optimize', 'obs-optimize', 'explorer-optimize', 'game-dvr', 'mmcss', 'priority-sep', 'ntfs', 'disable-mouse-accel', 'tcp-stack', 'net-throttling', 'qos-reserve', 'visual-effects']) tweakStates[id] = true

const processes = [
  ['chrome', 11.2, 1240], ['Discord', 4.1, 520], ['steamwebhelper', 3.8, 410], ['FiveM_b3095_GTAProcess', 28.6, 5600], ['obs64', 7.4, 880],
  ['Spotify', 1.9, 330], ['explorer', 0.8, 190], ['MsMpEng', 2.2, 260], ['svchost', 0.4, 80], ['Code', 3.2, 640], ['dwm', 1.7, 150], ['OneDrive', 0.6, 120],
].map(([Name, CPU, RAM], i) => ({ Id: 1000 + i * 37, Name, CPU, RAM }))

const startupItems = [
  { Name: 'Discord', Command: '"C:\\Users\\Pete\\AppData\\Local\\Discord\\Update.exe" --processStart Discord.exe', Source: 'HKCU Registry', Enabled: true, Impact: 'High', Key: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' },
  { Name: 'Steam', Command: '"C:\\Program Files (x86)\\Steam\\steam.exe" -silent', Source: 'HKCU Registry', Enabled: true, Impact: 'Medium', Key: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' },
  { Name: 'OneDrive', Command: '"C:\\Users\\Pete\\AppData\\Local\\Microsoft\\OneDrive\\OneDrive.exe" /background', Source: 'HKCU Registry', Enabled: false, Impact: 'Medium', Key: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' },
  { Name: 'RtkAudUService', Command: '"C:\\Windows\\System32\\DriverStore\\FileRepository\\realtekservice\\RtkAudUService64.exe" -background', Source: 'HKLM Registry', Enabled: true, Impact: 'Low', Key: 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' },
  { Name: 'MicrosoftEdgeUpdateTaskMachineUA', Command: '\\Microsoft\\', Source: 'Task Scheduler', Enabled: true, Impact: 'Low', Key: 'MicrosoftEdgeUpdateTaskMachineUA' },
]

const restorePoints = [
  { SequenceNumber: 41, Description: 'JylliTool_AutoOpti', CreationTime: '20261024210000.000000-000' },
  { SequenceNumber: 40, Description: 'Windows Update', CreationTime: '20261018083000.000000-000' },
  { SequenceNumber: 39, Description: 'JylliTool_Debloat', CreationTime: '20260930191500.000000-000' },
]

/** @returns the fixture for an API call, or undefined for "unknown" */
function respond(name, args, ctx) {
  const lang = ctx.lang, premium = ctx.premium
  if (/^diag2/.test(name)) return require('./diag-fixture').respond(name, args, ctx)
  switch (name) {
    // BIOS workstation: runs the REAL model/doctor code on synthetic data (HP-style rows plus a few hundred generated ones to exercise the virtual grid)
    case 'bios2Status': {
      const doctor = require('../../lib/bios/doctor')
      const info = { vendor: 'HP', biosVersion: 'T70 Ver. 01.25.01', biosDate: '2026-06-17', board: 'HP 87E0', system: 'HP ProBook 440 G8', uefi: true, hvci: true, elevated: true }
      return { ok: true, info, engines: [{ id: 'hp-wmi', state: 'ready', verified: false, writable: true }], findings: doctor.diagnose({ vendor: 'HP', elevated: true, uefi: true, hvci: true, hpWmi: 'ok' }) }
    }
    // Easy mode: the REAL advisor on a synthetic gaming laptop (RAM below rated speed, ReBAR off, fan always on)
    case 'bios2Advise': {
      const adv = require('../../lib/bios/advisor'), model = require('../../lib/bios/model')
      const e = (n, cur, opts) => ({ cls: 'HP_BIOSEnumeration', Name: n, CurrentValue: cur, PossibleValues: opts, Path: 'Advanced/System Options', IsReadOnly: false })
      const settings = model.fromHp([e('XMP Profile', 'Disable', ['Disable', 'Profile 1']), e('CSM Support', 'Enable', ['Enable', 'Disable']), e('Above 4G Decoding', 'Disable', ['Disable', 'Enable']), e('Resizable BAR', 'Disable', ['Disable', 'Enable']), e('Fan Always On', 'Enable', ['Enable', 'Disable']), e('Graphics Mode', 'Hybrid', ['Hybrid', 'Discrete']), e('Core Performance Boost', 'Auto', ['Disable', 'Auto'])])
      const caps = { form: 'laptop', hybridGraphics: true, anyDiscrete: true, rebar: false, bios: { date: '2025-03-12' }, cpu: { name: 'AMD Ryzen 7 7840HS', vendor: 'amd', family: 'zen4', mobile: true }, gpu: { name: 'NVIDIA GeForce RTX 4060 Laptop GPU', vendor: 'nvidia', arch: 'rtx40', discrete: true }, sec: { secureBoot: true }, host: { antiCheat: [] } }
      const out = adv.advise({ caps, ram: { xmp: 'off', type: 'DDR5', xmpConfiguredMT: 4800, xmpRatedMT: 5600 }, info: { board: 'HP 8A44', vendor: 'HP', uefi: true }, settings, writable: true })
      return { ok: true, engine: 'hp-wmi', writable: true, haveSettings: true, capsKnown: true, ...out }
    }
    case 'bios2Restart': return { ok: true }
    case 'bios2Trial': return { ok: true, trial: null }
    case 'bios2Commit': return { ok: true, snapshotId: 1, applied: (args[0] && args[0].changes || []).length, restartNeeded: true }
    case 'bios2Snapshots': return { ok: true, snapshots: [{ id: 1, ts: now - 3600000, engine: 'hp-wmi', reason: 'commit', changes: [{ id: 'Fast Boot', name: 'Fast Boot', from: 'Disable', to: 'Enable' }], count: 713 }] }
    case 'bios2Restore': return { ok: true, applied: 1 }
    case 'bios2Read': {
      const model = require('../../lib/bios/model')
      const names = ['Virtualization Technology (VTx)', 'Fast Boot', 'Turbo Boost', 'Hyper-Threading', 'Secure Boot', 'Power On Password', 'CPU Core Voltage Offset', 'Memory XMP Profile', 'Above 4G Decoding', 'SATA Mode', 'Wake on LAN', 'C-State Support', 'Fan Always On']
      const rows = names.map((n, i) => ({ cls: i === 6 ? 'HP_BIOSInteger' : 'HP_BIOSEnumeration', Name: n, CurrentValue: i === 6 ? '0' : 'Enable', PossibleValues: ['Enable', 'Disable'], Path: i < 6 ? 'Advanced/System Options' : 'Advanced/Built-In Device Options', IsReadOnly: false, LowerBound: -100, UpperBound: 100 }))
      for (let i = 0; i < 700; i++) rows.push({ cls: 'HP_BIOSEnumeration', Name: 'Generated option ' + (i + 1), CurrentValue: 'Disable', PossibleValues: ['Enable', 'Disable'], Path: 'Advanced/Generated', IsReadOnly: false })
      return { ok: true, engine: 'hp-wmi', settings: model.fromHp(rows) }
    }
    case 'getAppVersion': return '1.6.0'
    case 'getBootTime': return now - 93600000
    case 'getSystemInfo': return sysInfo
    // 3.0: hardware inventory and telemetry. sensors: 'full' | 'partial' (default: no CPU temperature, no fans) | 'none'
    case 'getHardwareInventory': return { ok: true, rig: require('../../lib/inventory').buildRigSpec(require('../../test/fixtures/sensors/inventory-raw-desktop.json')), detectedAt: now }
    case 'setDeclaredRig': return { ok: true, rig: require('../../lib/inventory').buildRigSpec(require('../../test/fixtures/sensors/inventory-raw-desktop.json'), args[0] || {}) }
    case 'telemetrySubscribe': return { ok: true, snapshot: { v: 1, seq: 1, t: now, s: {} } }
    case 'telemetryUnsubscribe': return { ok: true }
    case 'telemetryCapabilities': {
      const mode = ctx.sensors || 'partial'
      const cap = (available, extra) => available ? { available: true, source: 'os', detail: 'fixture', rateHz: 1, ...extra } : { available: false, reason: 'needs-driver' }
      const on = mode !== 'none'
      return { capabilities: { 'cpu.load': cap(on), 'cpu.temp.package': cap(mode === 'full'), 'gpu0.load': cap(on), 'gpu0.temp.core': cap(on), 'gpu0.fan.rpm': cap(mode === 'full'), 'net.rx': cap(on) }, context: { sensorRunning: mode === 'full' } }
    }
    case 'getTweakMeta': { const T3 = ['spectre-meltdown', 'vbs-disable', 'hvci-offload', 'full-mitigation-wipe', 'defender-core-off', 'biometrics-off', 'bluetooth-hard-off', 'hypervisor-off']; return Object.entries(require('../../lib/tweak-risk').RISK).map(([id, risk]) => ({ id, name: id, safetyTier: T3.includes(id) ? 3 : 2, risk, retired: null })) }
    case 'getApplicability': return { ok: true, map: { 'gpu-per-app-preference': { show: true, state: 'recommended', why: null }, 'global-timer-resolution': { show: true, state: 'caution', why: 'batteryDrain' } } }
    case 'journalList': return []
    case 'isAdmin': case 'checkIsAdmin': return true
    case 'relaunchAdmin': return { ok: true }
    case 'getMetrics': return metrics(Date.now() / 3000)
    case 'loadSettings': case 'getSettings':
      return { language: lang, onboardingDone: !ctx.arrival, toursEnabled: !!ctx.tours, analyticsConsent: false, avTipDismissed: true, adminRelaunchDismissed: true, isPremium: premium,
               accentColor: ctx.accent || undefined, theme: ctx.theme || undefined, advancedMode: !!ctx.advanced, ...tweakKeys() }
    case 'saveSettings': return true
    case 'authVerify': return { ok: true, reason: 'ok', isPremium: premium }
    case 'getCachedTier': return premium
    case 'getTweakStates': return tweakStates
    case 'getProcesses': return processes
    case 'scanInstalledApps': return ['edge-optimize','chrome-optimize','firefox-optimize','discord-optimize','discord-cpu-priority','spotify-optimize','steam-optimize','epic-optimize','riot-optimize','obs-optimize','nvidia-app-optimize','vscode-optimize','explorer-optimize']
    case 'healthCheckAppOptimizer': return { 'chrome-optimize': 'drifted', 'steam-optimize': 'ok' }
    case 'aoGetCpuCaps': return {}
    case 'freezeGetPids': return { ok: true, frozenPids: [] }
    case 'getStartupItems': return startupItems
    case 'getBootImpact': return { ok: true, items: [] }
    case 'toggleStartupItem': return { ok: true }
    case 'listRestorePoints': return restorePoints
    case 'getChangelog': return [
      { id: 'game-dvr', action: 'apply', ts: now - 3600000 }, { id: 'mmcss', action: 'apply', ts: now - 3500000 }, { id: 'tcp-stack', action: 'restore', ts: now - 86400000 },
    ]
    case 'listProfiles': return premium ? { 'Gaming Mode': { name: 'Gaming Mode', tweaks: { tweak_mmcss: 'applied', 'tweak_game-dvr': 'applied' }, savedAt: now - 86400000 } } : {}
    // Cleanup 2.0: the REAL model builder on synthetic scan numbers (a realistic gaming PC: open Discord/Chrome, personal files in Temp, Recycle Bin)
    case 'cleanup2Scan': {
      const rc = require('../../lib/cleanup/receipt'), M = 1048576, G = 1073741824
      const s = (bytes, extra) => ({ present: bytes > 0, bytes, files: Math.round(bytes / 400000) + 1, ...extra })
      const scans = {
        'clean-temp': s(1.9 * G, { personalFiles: 3, recentBytes: 410 * M, roots: [{ path: 'C:\\Users\\Pete\\AppData\\Local\\Temp', bytes: 1.5 * G }, { path: 'C:\\Windows\\Temp', bytes: 0.4 * G }] }),
        'clean-wu': s(820 * M), 'clean-errorlogs': s(310 * M), 'clean-thumbnails': s(96 * M), 'clean-fontcache': s(22 * M), 'clean-deliveryopt': s(540 * M),
        'clean-browsers': s(2.6 * G, { roots: [{ path: 'C:\\Users\\Pete\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cache', bytes: 1.7 * G }, { path: 'C:\\Users\\Pete\\AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\Cache', bytes: 0.9 * G }] }),
        'clean-discord': s(640 * M), 'clean-spotify': s(1.1 * G), 'clean-steam': s(380 * M), 'clean-vscode': s(210 * M), 'clean-msstore': s(0), 'clean-roblox': s(0),
        'clean-nvidia': s(1.4 * G), 'clean-vs-temp': s(1.2 * G), 'fivem-clear-cache': s(3.2 * G),
        'clean-winsxs': { present: true, unknown: true, bytes: 0 }, 'clean-eventlogs': s(148 * M),
        'clean-recycle': s(3.8 * G), 'clean-old-windows': s(21.4 * G), 'clean-browser-history': s(64 * M),
      }
      const model = rc.buildModel(scans, { running: new Set(['discord.exe', 'chrome.exe']), has: { nvidia: true, amd: false, fivem: true } })
      model.ts = Date.now(); model.disk = { totalBytes: 1863 * G, usedBytes: 1051 * G, freeBytes: 812 * G }
      return { ok: true, model }
    }
    case 'cleanup2Run': return { ok: true, receipt: require('../../lib/cleanup/receipt').buildReceipt([
      { id: 'clean-temp', freed: 1.5 * 1073741824, files: 412, skipped: { inUse: 2, access: 0, tooNew: 9, personal: 3 }, skippedBytes: 410 * 1048576 }, { id: 'clean-browsers', freed: 1.7 * 1073741824, files: 900, skipped: { inUse: 14, access: 0, tooNew: 0, personal: 0 }, skippedBytes: 900 * 1048576 },
      { id: 'clean-spotify', freed: 1.1 * 1073741824, files: 300, skipped: {}, skippedBytes: 0 }], { startedAt: Date.now() - 6400, endedAt: Date.now(), disk: { before: 812 * 1073741824, after: 816.3 * 1073741824 } }) }
    case 'cleanup2Abort': return { ok: true }
    case 'cleanup2AutopilotGet': return { ok: true, rule: { mode: premium ? 'weekly' : 'off', thresholdBytes: 2 * 1073741824, lastRunTs: 0 } }
    case 'cleanup2AutopilotSet': return { ok: true, rule: args[0] }
    case 'cleanup2History': {
      const D = 86400000, G = 1073741824
      return { ok: true, premium, total: 41.6 * G, history: [6.1, 3.2, 8.4, 2.1, 5.7, 4.4, 9.8, 1.9].map((g, i) => ({ ts: now - i * 4 * D, freedBytes: g * G, itemCount: 7, auto: i % 3 === 1 })),
        regrowth: premium ? { 'clean-browsers': { perDay: 90 * 1048576, samples: 3 }, 'clean-discord': { perDay: 20 * 1048576, samples: 2 }, 'clean-spotify': { perDay: 40 * 1048576, samples: 2 } } : null, projection: { days: 212, perDay: 3.4 * G, date: now + 212 * D } }
    }
    case 'cleanup2SpaceMap': {
      const G = 1073741824, p = String(args[0] || 'C:\\')
      const n = (name, gb, kind, dir = true) => ({ name, path: p.replace(/\\$/, '') + '\\' + name, bytes: gb * G, kind, dir })
      return { ok: true, path: p, total: 1051 * G, partial: false, nodes: [n('Games', 412, 'games'), n('Users', 288, 'media'), n('Program Files', 96, 'apps'), n('Windows', 61, 'system'), n('Program Files (x86)', 54, 'apps'), n('ProgramData', 22, 'system'), n('Projektit', 9, 'files'), n('$Recycle.Bin', 3.8, 'system'), { name: '', path: p, bytes: 2.4 * G, kind: 'files', dir: false, files: 6 }] }
    }
    case 'cleanup2LargeFiles': return { ok: true, partial: false, total: 38e9, files: [
      { path: 'C:\\Users\\Pete\\Videos\\raw-2025-02.mkv', name: 'raw-2025-02.mkv', bytes: 14.2e9, ageDays: 420, reason: 'large-old' }, { path: 'C:\\Users\\Pete\\Downloads\\Windows11_23H2.iso', name: 'Windows11_23H2.iso', bytes: 6.1e9, ageDays: 210, reason: 'installer' },
      { path: 'C:\\Users\\Pete\\Documents\\vm\\ubuntu.vhdx', name: 'ubuntu.vhdx', bytes: 11.4e9, ageDays: 160, reason: 'large-old' }] }
    case 'cleanup2Trash': return { ok: true, freed: 14.2e9, failed: [] }
    case 'scanPhantomApps': return premium ? [{ folderPath: 'C:\\Users\\Pete\\AppData\\Roaming\\OldLauncher', folderName: 'OldLauncher', sizeBytes: 312 * 1048576, label: 'Large orphan' }, { folderPath: 'C:\\Program Files\\Leftover', folderName: 'Leftover', sizeBytes: 12000, label: 'Empty folder' }] : { ok: false, reason: 'premium_required' }
    case 'getTempSize': return { totalMB: 2840 }
    case 'getDiskUsage': return { ok: true, folders: [] }
    case 'getRecycleBinSize': return { sizeMB: 412 }
    case 'getWhatsNew': return [{ version: '1.6.0', items: ['New — Redesigned interface', 'Security — Signed Premium tokens'] }]
    case 'getHealthScore': return { total: 78, breakdown: { temp: { score: 14, max: 20, label: 'Temps' }, startup: { score: 9, max: 20, label: 'Startup' }, tweaks: { score: 18, max: 20, label: 'Tweaks' } } }
    case 'getMetricsHistory': return Array.from({ length: 48 }, (_, i) => ({ ts: now - (48 - i) * 1800000, cpu: 20 + Math.round(15 * Math.abs(Math.sin(i / 4))), ram: 42 + Math.round(6 * Math.sin(i / 7)) }))
    case 'getPremiumUrl': return 'https://jyllitool.netlify.app/'
    case 'detectGames': return [{ id: 'fortnite', installed: true, isRunning: false, installPath: 'C:/Games/Fortnite', lastPlayed: '10/24/2026' }, { id: 'cs2', installed: true, isRunning: false, installPath: 'D:/Steam/cs2', lastPlayed: '10/25/2026' }]
    case 'listGameBundles': return { 'Comp CS2': { name: 'Comp CS2', gameId: 'cs2', tweakProfileName: 'Gaming Mode', pulsePreset: 'cs2' } }
    case 'getGameWatcherStatus': return { running: false }
    case 'pulseGetPresets': return [{ id: 'fivem', name: 'FiveM', exe: 'FiveM_GTAProcess' }, { id: 'valorant', name: 'Valorant', exe: 'VALORANT-Win64-Shipping' }, { id: 'fortnite', name: 'Fortnite', exe: 'FortniteClient' }]
    case 'pulseDetectGame': return { ok: true, game: null }
    case 'detectAv': return null
    case 'analyticsPageVisit': case 'analyticsTweakApplied': case 'discordSetPage': case 'startupTrace': return { ok: true }
    // Debloat 2.0: the REAL probe parser, model, classifier and footprint on a synthetic gaming desktop (printer, 2 Bluetooth devices, Xbox controller, OBS)
    case 'debloat2Scan': {
      const D = require('../../lib/debloat'), now = Date.now(), H = 3600000, DAY = 24 * H
      const CDM = 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', ADV = 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced'
      if (ctx.debloat === 'empty') return { ok: true, model: D.model.buildModel(D.probe.parse(D.probe.MARK + JSON.stringify({ facts: { build: 26200, ubr: 1, mfr: 'HP' } })), { now }), drift: [], prefs: { intents: null, shield: true, deprovision: true, guard: { mode: 'off' } } }
      if (ctx.debloat === 'fail') return { ok: false, error: 'scan-failed' }
      const app = (n, sz) => ({ n, f: n + '_8wekyb3d8bbwe', sz: sz * 1048576 })
      const task = (p, n, h, rep, st) => ({ p: '\\Microsoft\\Windows\\' + p + '\\', n, s: st || 'Ready', nx: now + h * H, rep: rep || '' })
      const snap = D.probe.parse(D.probe.MARK + JSON.stringify({
        appx: [app('Microsoft.BingNews', 48), app('Microsoft.BingWeather', 61), app('Microsoft.GetHelp', 12), app('Microsoft.Getstarted', 9), app('Microsoft.MicrosoftSolitaireCollection', 140), app('Microsoft.WindowsMaps', 96), app('Microsoft.ZuneVideo', 33), app('Microsoft.XboxApp', 120), app('Microsoft.XboxGamingOverlay', 74),
          app('Microsoft.YourPhone', 188), app('Clipchamp.Clipchamp', 210), app('Microsoft.WindowsStore', 90), app('Microsoft.GamingServices', 60), app('Microsoft.Copilot', 150), app('Microsoft.Todos', 40), app('BytedancePte.Ltd.TikTok', 70), app('king.com.CandyCrushSaga', 55), app('Microsoft.People', 8), app('MicrosoftWindows.Client.WebExperience', 130)],
        prov: ['Microsoft.BingNews', 'Microsoft.BingWeather', 'Microsoft.GetHelp', 'Microsoft.YourPhone', 'Clipchamp.Clipchamp', 'king.com.CandyCrushSaga'],
        svc: { DiagTrack: { st: 'Running', sm: 'Auto', sh: 1, ws: 38 * 1048576 }, SysMain: { st: 'Running', sm: 'Auto', sh: 1, ws: 96 * 1048576 }, WSearch: { st: 'Running', sm: 'Auto', sh: 1, ws: 142 * 1048576 }, WerSvc: { st: 'Stopped', sm: 'Manual', sh: 0, ws: 0 },
          Spooler: { st: 'Running', sm: 'Auto', sh: 1, ws: 14 * 1048576 }, bthserv: { st: 'Running', sm: 'Manual', sh: 5, ws: 0 }, XblAuthManager: { st: 'Stopped', sm: 'Manual', sh: 0, ws: 0 }, XboxGipSvc: { st: 'Running', sm: 'Manual', sh: 3, ws: 0 }, RemoteRegistry: { st: 'Stopped', sm: 'Disabled', sh: 0, ws: 0 },
          MapsBroker: { st: 'Stopped', sm: 'Auto', sh: 0, ws: 0 }, lfsvc: { st: 'Running', sm: 'Manual', sh: 4, ws: 0 }, Fax: { st: 'Stopped', sm: 'Manual', sh: 0, ws: 0 }, PcaSvc: { st: 'Running', sm: 'Auto', sh: 6, ws: 0 } },
        tasks: [task('Application Experience', 'Microsoft Compatibility Appraiser', 3.4), task('Application Experience', 'ProgramDataUpdater', 5.1), task('Application Experience', 'StartupAppTask', 9.2), task('Customer Experience Improvement Program', 'Consolidator', 0.9, 'PT6H'), task('Customer Experience Improvement Program', 'UsbCeip', 1.6),
          task('Maintenance', 'WinSAT', 14), task('Windows Error Reporting', 'QueueReporting', 7.3), task('Feedback\\Siuf', 'DmClient', 4.2, 'PT4H'), task('Maps', 'MapsUpdateTask', 2.2, 'PT8H'), task('Autochk', 'Proxy', 0, '', 'Disabled'), task('Shell', 'FamilySafetyMonitor', 6.4, 'PT1H')],
        reg: { [CDM + '|RotatingLockScreenEnabled']: 1, [CDM + '|RotatingLockScreenOverlayEnabled']: 1, [CDM + '|SubscribedContent-338387Enabled']: 1, [CDM + '|SystemPaneSuggestionsEnabled']: 0, [ADV + '|Start_IrisRecommendations']: 1, [CDM + '|PreInstalledAppsEnabled']: 1, [CDM + '|PreInstalledAppsEverEnabled']: 1, [CDM + '|OemPreInstalledAppsEnabled']: 1,
          [CDM + '|SilentInstalledAppsEnabled']: 0, [ADV + '|TaskbarDa']: 1, [ADV + '|ShowSyncProviderNotifications']: 1, [CDM + '|SubscribedContent-338393Enabled']: 1, [CDM + '|SubscribedContent-353694Enabled']: 1, [CDM + '|SubscribedContent-353696Enabled']: 1, [CDM + '|SubscribedContent-338389Enabled']: 1, [CDM + '|SoftLandingEnabled']: 1 },
        feat: { SMB1Protocol: true, 'SMB1Protocol-Client': true, 'SMB1Protocol-Server': false, MicrosoftWindowsPowerShellV2Root: true, MicrosoftWindowsPowerShellV2: true, 'Internet-Explorer-Optional-amd64': true, TelnetClient: false, DirectPlay: true, WindowsMediaPlayer: true },
        procs: { yourphone: 61 * 1048576, phoneexperiencehost: 40 * 1048576, searchindexer: 142 * 1048576 }, lastRun: { yourphone: now - 4 * DAY, spotify: now - 1 * DAY },
        facts: { printers: 1, btPaired: 2, xboxController: 1, gamePass: 3, obs: true, dev: false, laptop: false, build: 26200, ubr: 1742, mfr: 'HP' },
      }))
      const model = D.model.buildModel(snap, { now })
      return { ok: true, model, drift: ctx.debloat === 'drift' ? [{ id: 'app:Microsoft.BingNews', since: now - 20 * DAY }, { id: 'svc:DiagTrack', since: now - 20 * DAY }] : [], prefs: { intents: null, shield: true, deprovision: true, guard: { mode: premium ? 'update' : 'off' } } }
    }
    case 'debloat2Run': {
      const ids = (args[0] && args[0].ids) || []
      const kind = id => ({ app: 'appx', svc: 'service', task: 'task', ad: 'ad', feat: 'feature' })[id.split(':')[0]]
      const n = p => ids.filter(i => i.startsWith(p)).length
      return { ok: true, drift: [], receipt: { batchId: 'preview', ts: Date.now(), ms: 8400, aborted: false, deprovision: true, skipped: [], restorePoint: { ok: true }, failed: [], restartNeeded: false,
        rows: ids.map(id => ({ id, kind: kind(id), ok: true, error: null })),
        counts: { apps: n('app:'), services: n('svc:'), tasks: n('task:'), ads: n('ad:'), features: n('feat:') },
        delta: { ram: [310 * 1048576, 24 * 1048576], disk: [1.4 * 1073741824, 0], wakes: [31, 9] } } }
    }
    case 'debloat2Abort': return { ok: true }
    case 'debloat2Summary': return { ok: true, summary: { ts: Date.now(), count: 23, safe: 17, ram: 310 * 1048576, disk: 1.4 * 1073741824, wakes: 31, layers: { apps: 11, services: 4, tasks: 5, ads: 3, features: 0 } } }
    case 'debloat2PrefsSet': return { ok: true, prefs: { intents: null, shield: true, deprovision: true, guard: { mode: 'off' } } }
    case 'debloat2GuardSet': return premium ? { ok: true, guard: { mode: args[0] } } : { ok: false, reason: 'premium_required' }
    case 'debloat2Undo': return { ok: true, ids: [] }
    case 'debloat2Wayback': return { ok: true, how: 'offline' }
    case 'debloat2ShellRemove': return { ok: true, batchId: 'preview', rows: [] }
    case 'debloat2History': {
      const t = Date.now()
      return { ok: true, runs: [], entries: [
        { entryId: 'e1', batchId: 'b1', id: 'app:Microsoft.BingNews', ts: t - 3600000, result: 'ok', fidelity: 'exact', undone: false, family: 'Microsoft.BingNews_8wekyb3d8bbwe' },
        { entryId: 'e2', batchId: 'b1', id: 'svc:DiagTrack', ts: t - 3600000, result: 'ok', fidelity: 'exact', undone: false, family: '' },
        { entryId: 'e3', batchId: 'b1', id: 'ad:start-recommended', ts: t - 3600000, result: 'ok', fidelity: 'exact', undone: false, family: '' },
        { entryId: 'e4', batchId: 'b0', id: 'task:winsat', ts: t - 9 * 86400000, result: 'ok', fidelity: 'exact', undone: true, family: '' } ] }
    }
    case 'listInstalledWin32': {
      const M = 1048576
      return [{ DisplayName: 'HP Smart', DisplayVersion: '152.1', Publisher: 'HP Inc.', SizeBytes: 380 * M, InstallDate: '20240115', Key: 'a' }, { DisplayName: 'Spotify', DisplayVersion: '1.2', Publisher: 'Spotify AB', SizeBytes: 420 * M, InstallDate: '20250301', Key: 'b' },
        { DisplayName: 'Old Video Converter', DisplayVersion: '4.0', Publisher: 'Acme', SizeBytes: 900 * M, InstallDate: '20190512', Key: 'c' }, { DisplayName: 'Microsoft Visual C++ 2015-2022 Redistributable (x64)', DisplayVersion: '14.38', Publisher: 'Microsoft Corporation', SizeBytes: 24 * M, InstallDate: '20240101', Key: 'd' },
        { DisplayName: 'Steam', DisplayVersion: '2.10', Publisher: 'Valve Corporation', SizeBytes: 1.2 * 1073741824, InstallDate: '20230101', Key: 'e' }, { DisplayName: 'HP Support Assistant', DisplayVersion: '9.1', Publisher: 'HP Inc.', SizeBytes: 210 * M, InstallDate: '20230620', Key: 'f' }]
    }
    case 'getPrefetchAges': return [{ Name: 'SPOTIFY.EXE-ABCD1234.pf', LastWriteTime: new Date(Date.now() - 86400000).toISOString() }, { Name: 'STEAM.EXE-ABCD1235.pf', LastWriteTime: new Date(Date.now() - 2 * 86400000).toISOString() }]
    case 'getUserAssist': return [{ path: 'C:\\Program Files\\Old Video Converter\\Old Video Converter.exe', count: 3, lastUsed: new Date(Date.now() - 400 * 86400000).toISOString() }]
    case 'getUnusedDevices': return [{ name: 'USB Mass Storage Device', id: 'USB\\VID_1', status: 'Unknown', cls: 'USB', present: false }, { name: 'Generic PnP Monitor', id: 'DISPLAY\\X', status: 'Unknown', cls: 'Monitor', present: false }]
    case 'getShellExtensions': return [{ clsid: '{11111111-1111-1111-1111-111111111111}', name: 'Old Archiver shell extension', dllPath: 'C:\\Program Files\\OldArc\\shell.dll', dllExists: false }, { clsid: '{22222222-2222-2222-2222-222222222222}', name: 'Git Bash Here', dllPath: 'C:\\Program Files\\Git\\git.dll', dllExists: true }]
    default: return undefined
  }
}
function tweakKeys() {
  const o = {}
  for (const id of Object.keys(tweakStates)) { o[`tweak_${id}`] = 'applied'; o[`tweak_${id}_ts`] = now - 3600000 }
  return o
}

module.exports = { respond, sysInfo }
