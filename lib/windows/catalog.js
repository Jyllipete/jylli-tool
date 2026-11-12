'use strict'
// The only list of what the Windows tab may show or change. Every id is a TWEAKS id in main.js (test/windows-engine.test.js checks that).
//   lane   which group of the page it sits in (LANES below)       rec    part of the "recommended for most PCs" set
//   probe  how its live state is read from Windows, one check per value it writes. No probe = state cannot be read honestly ('unknown').
//   reboot the change only takes effect after a restart
//   warn   situation warnings shown on the row (LANG ui keys; `when` is 'laptop' or 'ramBelow' + n)
// Probe kinds:  r = registry value {r:path, n:name, eq | {ge} | {le}}   s = service start type {s, eq}   t = scheduled task state {t, n, eq}
//               nofile = file must be absent {nofile}   x = special read {x:'memcomp'}
// A probe whose service/task does not exist on this PC is left out of the match (nothing to switch), never counted as "off".
const LANES = [
  { id: 'gaming', scope: 'windows' },
  { id: 'input', scope: 'windows' },
  { id: 'quiet', scope: 'windows' },
  { id: 'graphics', scope: 'windows' },
  { id: 'memory', scope: 'windows' },
  { id: 'privacy', scope: 'windows' },
  { id: 'expert', scope: 'windows' },
  { id: 'retired', scope: 'windows' },
  { id: 'qol-search', scope: 'qol' },
  { id: 'qol-quiet', scope: 'qol' },
  { id: 'qol-explorer', scope: 'qol' },
]

const CU = 'HKCU:\\', LM = 'HKLM:\\'
const CDM = CU + 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager'
const GCS = CU + 'System\\GameConfigStore'
const MOUSE = CU + 'Control Panel\\Mouse'
const GFX = LM + 'SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers'
const POL = LM + 'SOFTWARE\\Policies\\Microsoft\\Windows\\'
const SRCH = CU + 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Search'
const MM = LM + 'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management'

const reg = (r, n, eq) => ({ r, n, eq })
const svc = (s, eq = 'Disabled') => ({ s, eq })

const ITEMS = [
  // ── Gaming & overlays
  { id: 'game-dvr', lane: 'gaming', icon: 'gamepad', rec: true, probe: [reg(GCS, 'GameDVR_Enabled', 0)] },
  { id: 'disable-fso', lane: 'gaming', icon: 'display', rec: true, probe: [reg(GCS, 'GameDVR_FSEBehaviorMode', 2)] },
  { id: 'gpu-per-app-preference', lane: 'gaming', icon: 'microchip' },
  { id: 'vrr-borderless', lane: 'gaming', icon: 'display' },
  // ── Input & aim
  { id: 'disable-mouse-accel', lane: 'input', icon: 'computer-mouse', rec: true, probe: [reg(MOUSE, 'MouseSpeed', 0), reg(MOUSE, 'MouseThreshold1', 0), reg(MOUSE, 'MouseThreshold2', 0)] },
  { id: 'mouse-pointer-1to1', lane: 'input', icon: 'computer-mouse', probe: [reg(MOUSE, 'MouseSensitivity', 10)] },
  { id: 'sticky-keys-guard', lane: 'input', icon: 'keyboard', rec: true, probe: [reg(CU + 'Control Panel\\Accessibility\\StickyKeys', 'Flags', 506)] },
  { id: 'proximity-deny', lane: 'input', icon: 'ban', rec: true, probe: [reg(LM + 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\proximity', 'Value', 'Deny')] },
  { id: 'usb-suspend', lane: 'input', icon: 'plug', probe: [reg(LM + 'SYSTEM\\CurrentControlSet\\Services\\USB', 'DisableSelectiveSuspend', 1)], warn: [{ when: 'laptop', key: 'warnLaptopPcie' }] },
  // ── Quiet background
  { id: 'disable-background-apps', lane: 'quiet', icon: 'ban', rec: true, probe: [reg(POL + 'AppPrivacy', 'LetAppsRunInBackground', 2)] },
  { id: 'disable-delivery-opt', lane: 'quiet', icon: 'arrows-turn-to-dots', rec: true, probe: [reg(POL + 'DeliveryOptimization', 'DODownloadMode', 0)] },
  { id: 'do-solo-mode', lane: 'quiet', icon: 'network-wired', rec: true, probe: [reg(POL + 'DeliveryOptimization', 'DODownloadMode', 1)] },
  { id: 'compat-scanner-off', lane: 'quiet', icon: 'magnifying-glass-minus', rec: true, probe: [svc('PcaSvc')] },
  { id: 'compat-tasks-off', lane: 'quiet', icon: 'calendar-xmark', probe: [{ t: '\\Microsoft\\Windows\\Application Experience\\', n: 'StartupAppTask', eq: 'Disabled' }] },
  { id: 'diag-tasks-off', lane: 'quiet', icon: 'stethoscope', rec: true, probe: [{ t: '\\Microsoft\\Windows\\Diagnosis\\', n: 'Scheduled', eq: 'Disabled' }] },
  { id: 'diagnostics-off', lane: 'quiet', icon: 'wrench', probe: [svc('DPS')] },
  { id: 'reality-telephony-off', lane: 'quiet', icon: 'phone-slash', probe: [svc('TapiSrv')] },
  { id: 'sensor-suite-off', lane: 'quiet', icon: 'gauge', probe: [svc('SensorService')] },
  { id: 'fth-reset', lane: 'quiet', icon: 'memory' },
  // ── Graphics & display
  { id: 'gpu-hwsch', reboot: true, lane: 'graphics', icon: 'palette', probe: [reg(GFX, 'HwSchMode', 2)] },
  { id: 'tdr-delay', lane: 'graphics', icon: 'shield-halved', probe: [reg(GFX, 'TdrDelay', { ge: 10 })] },
  { id: 'disable-mpo', reboot: true, lane: 'graphics', icon: 'layer-group', probe: [reg(LM + 'SOFTWARE\\Microsoft\\Windows\\Dwm', 'OverlayTestMode', 5)] },
  { id: 'msi-mode', reboot: true, lane: 'graphics', icon: 'plug' },
  { id: 'visual-effects', lane: 'graphics', icon: 'wand-sparkles', probe: [reg(CU + 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects', 'VisualFXSetting', 2)] },
  // ── Memory & storage (the CPU and memory switches moved to the CPU & Memory tab: lib/cpumem/catalog.js)
  { id: 'hibernate', lane: 'memory', icon: 'moon', probe: [{ nofile: 'C:\\hiberfil.sys' }], warn: [{ when: 'laptop', key: 'warnLaptopHibernate' }] },
  // ── Privacy & telemetry
  { id: 'telemetry', lane: 'privacy', icon: 'satellite-dish', probe: [reg(POL + 'DataCollection', 'AllowTelemetry', { le: 1 }), svc('DiagTrack')] },
  { id: 'telemetry-zero', lane: 'privacy', icon: 'satellite-dish', probe: [reg(POL + 'DataCollection', 'AllowTelemetry', 0)] },
  { id: 'capability-ruleset', lane: 'privacy', icon: 'lock', probe: [reg(CU + 'Software\\Microsoft\\Windows\\CurrentVersion\\Privacy', 'TailoredExperiencesWithDiagnosticDataEnabled', 0)] },
  { id: 'defender-quiet', lane: 'privacy', icon: 'bell-slash', rec: true },
  // ── Expert trade-offs
  { id: 'defender-core-off', lane: 'expert', icon: 'shield-halved', probe: [reg(LM + 'SOFTWARE\\Policies\\Microsoft\\Windows Defender', 'DisableAntiSpyware', 1)] },
  { id: 'defender-idle-priority', lane: 'expert', icon: 'shield-virus', probe: [reg(LM + 'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\MsMpEng.exe\\PerfOptions', 'CpuPriorityClass', 5)] },
  { id: 'rt-scan-trim', lane: 'expert', icon: 'shield-halved' },
  { id: 'biometrics-off', lane: 'expert', icon: 'fingerprint', probe: [svc('WbioSrvc')] },
  { id: 'bluetooth-hard-off', lane: 'expert', icon: 'bluetooth-b', probe: [svc('bthserv')] },
  // ── Quality of life
  { id: 'search-box-local', lane: 'qol-search', icon: 'magnifying-glass', rec: true, probe: [reg(POL + 'Windows Search', 'DisableWebSearch', 1), reg(POL + 'Windows Search', 'ConnectedSearchUseWeb', 0)] },
  { id: 'search-cloud-off', lane: 'qol-search', icon: 'cloud', rec: true, probe: [reg(POL + 'Windows Search', 'AllowCloudSearch', 0), reg(SRCH, 'BingSearchEnabled', 0)] },
  { id: 'cortana', lane: 'qol-search', icon: 'magnifying-glass', probe: [svc('WSearch')] },
  { id: 'cortana-blackout', lane: 'qol-search', icon: 'microphone-slash', probe: [reg(POL + 'Windows Search', 'AllowCortana', 0)] },
  { id: 'cortana-remnant-off', lane: 'qol-search', icon: 'trash' },
  { id: 'win-tips', lane: 'qol-quiet', icon: 'lightbulb', rec: true, probe: [reg(CDM, 'SoftLandingEnabled', 0)] },
  { id: 'nudge-blocker', lane: 'qol-quiet', icon: 'circle-xmark', rec: true, probe: [reg(CDM, 'ContentDeliveryAllowed', 0)] },
  { id: 'boot-sound-off', lane: 'qol-quiet', icon: 'volume-xmark', rec: true, probe: [reg(LM + 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Authentication\\LogonUI\\BootAnimation', 'DisableStartupSound', 1)] },
  { id: 'security-quiet', lane: 'qol-quiet', icon: 'bell-slash', rec: true, probe: [reg(LM + 'SOFTWARE\\Policies\\Microsoft\\Windows Defender Security Center\\Notifications', 'DisableNotifications', 1)] },
  { id: 'security-toast-off', lane: 'qol-quiet', icon: 'comment-slash', rec: true, probe: [reg(CU + 'Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings\\Windows.Defender.SecurityCenter', 'Enabled', 0)] },
  { id: 'explorer-perf', lane: 'qol-explorer', icon: 'folder-open', rec: true, probe: [reg(CU + 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', 'LaunchTo', 1)] },
  { id: 'cloud-sync-off', lane: 'qol-explorer', icon: 'cloud', probe: [reg(POL + 'SettingSync', 'DisableSettingSync', 2)] },
  // ── Retired: no longer offered (main.js RETIRED_TWEAKS). Listed only so an earlier apply can still be seen and restored.
  ...['large-system-cache', 'disable-paging-executive', 'tsc-sync', 'hpet', 'priority-sep', 'ntfs', 'cursor-max-rate', 'raw-aim-curve', 'split-large-caches', 'mmcss', 'bcd-tweaks', 'disable-auto-maintenance']
    .map(id => ({ id, lane: 'retired', icon: 'box-archive' })),
]

const byId = Object.fromEntries(ITEMS.map(i => [i.id, i]))
const laneOf = id => LANES.find(l => l.id === (byId[id] && byId[id].lane)) || null
const scopeOf = id => (laneOf(id) || {}).scope || null
const ids = scope => ITEMS.filter(i => !scope || scopeOf(i.id) === scope).map(i => i.id)
const lanes = scope => LANES.filter(l => !scope || l.scope === scope)
const isKnown = id => !!byId[id]

const exported = { LANES, ITEMS, byId, laneOf, scopeOf, ids, lanes, isKnown }
if (typeof module !== 'undefined' && module.exports) module.exports = exported
if (typeof window !== 'undefined') window.JylliWindowsCatalog = exported
