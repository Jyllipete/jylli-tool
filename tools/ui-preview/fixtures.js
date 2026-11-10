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
    default: return undefined
  }
}
function tweakKeys() {
  const o = {}
  for (const id of Object.keys(tweakStates)) { o[`tweak_${id}`] = 'applied'; o[`tweak_${id}_ts`] = now - 3600000 }
  return o
}

module.exports = { respond, sysInfo }
