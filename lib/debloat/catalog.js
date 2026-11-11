'use strict'
// Debloat catalog: the ONE list of what Jylli Tool may remove or switch off on the Debloat tab.
// Scanning, classifying, running, undo and Guard all read it, so what the tab shows is what a run touches.
//   kind  'appx' | 'service' | 'task' | 'ad' | 'feature'
//   lane  'safe' (nothing on most PCs uses it) | 'review' (some people do: never pre-ticked)
//   needs intents that keep the item (see classify.js): 'print' 'xbox' 'stream' 'work' 'dev' 'laptop' 'gaming'
//   use   a fact that proves the item is in use on THIS PC ('printers' 'btPaired' 'xboxController')
//   exe   process names (no .exe) for RAM attribution and last-opened evidence
//   breaks  true when switching it off takes a visible feature away (the card then explains what, in LANG w_<id>)
// Names and descriptions live in LANG.debloat2 as n_<id> / d_<id> / w_<id>.
const { PROTECTED } = require('../uwp-protect')

const KINDS = ['appx', 'service', 'task', 'ad', 'feature']
const LAYERS = ['apps', 'services', 'tasks', 'ads', 'features']
const LAYER_OF = { appx: 'apps', service: 'services', task: 'tasks', ad: 'ads', feature: 'features' }
const INTENTS = ['gaming', 'xbox', 'stream', 'work', 'dev', 'laptop', 'print']

const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const A = (pkg, group, o = {}) => ({ id: 'app:' + pkg, kind: 'appx', pkg, group, lane: 'safe', tags: [], needs: [], exe: [], breaks: false, ...o })
const S = (svc, group, o = {}) => ({ id: 'svc:' + svc, kind: 'service', svc, group, lane: 'safe', tags: [], needs: [], exe: [], breaks: false, ...o })
const T = (path, name, group, o = {}) => ({ id: 'task:' + slug(name), kind: 'task', task: { path, name }, group, lane: 'safe', tags: [], needs: [], exe: [], breaks: false, ...o })
const AD = (id, surface, reg, o = {}) => ({ id: 'ad:' + id, kind: 'ad', surface, group: surface, reg, lane: 'safe', tags: [], needs: [], exe: [], breaks: false, ...o })
const F = (feature, o = {}) => ({ id: 'feat:' + feature, kind: 'feature', feature, group: 'legacy', lane: 'review', tags: [], needs: [], exe: [], breaks: false, ...o })

const CDM = 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager'
const ADV = 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced'
const r = (key, name, off, on) => ({ key, name, off, on })

const CATALOG = [
  // ── Xbox apps ──
  A('Microsoft.Xbox.TCUI', 'xbox', { needs: ['xbox'], tags: ['xbox'] }),
  A('Microsoft.XboxApp', 'xbox', { needs: ['xbox'], tags: ['xbox'], exe: ['XboxPcApp', 'XboxApp'] }),
  A('Microsoft.XboxGameOverlay', 'xbox', { needs: ['xbox', 'stream'], tags: ['xbox'] }),
  A('Microsoft.XboxGamingOverlay', 'xbox', { needs: ['xbox', 'stream'], tags: ['xbox'], breaks: true, exe: ['GameBar'] }),
  A('Microsoft.XboxIdentityProvider', 'xbox', { lane: 'review', needs: ['xbox'], tags: ['xbox'], breaks: true }),
  A('Microsoft.XboxSpeechToTextOverlay', 'xbox', { needs: ['xbox'], tags: ['xbox'] }),
  // ── Microsoft apps ──
  A('Microsoft.BingWeather', 'microsoft'), A('Microsoft.BingNews', 'microsoft'), A('Microsoft.BingFinance', 'microsoft'), A('Microsoft.BingSports', 'microsoft'),
  A('Microsoft.BingSearch', 'microsoft'),
  A('Microsoft.GetHelp', 'microsoft'), A('Microsoft.Getstarted', 'microsoft'),
  A('Microsoft.MicrosoftOfficeHub', 'microsoft', { exe: ['OfficeHubApp'] }),
  A('Microsoft.MicrosoftSolitaireCollection', 'microsoft', { exe: ['Solitaire'] }),
  A('Microsoft.People', 'microsoft'), A('Microsoft.WindowsFeedbackHub', 'microsoft', { exe: ['PilotshubApp'] }),
  A('Microsoft.WindowsMaps', 'microsoft', { exe: ['Maps'] }), A('Microsoft.Print3D', 'microsoft'), A('Microsoft.3DViewer', 'microsoft'),
  A('Microsoft.MixedReality.Portal', 'microsoft'), A('Microsoft.ZuneMusic', 'microsoft', { exe: ['Music.UI'] }), A('Microsoft.ZuneVideo', 'microsoft', { exe: ['Video.UI'] }),
  A('Microsoft.Wallet', 'microsoft'), A('Microsoft.OneConnect', 'microsoft'),
  A('Clipchamp.Clipchamp', 'microsoft', { exe: ['Clipchamp'] }),
  A('Microsoft.Todos', 'microsoft', { lane: 'review', exe: ['Todo'] }),
  A('Microsoft.PowerAutomateDesktop', 'microsoft', { lane: 'review', needs: ['work'] }),
  A('Microsoft.Windows.DevHome', 'microsoft', { lane: 'review', needs: ['dev'] }),
  A('Microsoft.OutlookForWindows', 'comms', { lane: 'review', needs: ['work'], exe: ['olk'] }),
  A('Microsoft.Copilot', 'ai', { lane: 'review', exe: ['Copilot'] }),
  // ── Communication ──
  A('Microsoft.SkypeApp', 'comms', { exe: ['Skype'] }),
  A('Microsoft.Teams', 'comms', { exe: ['Teams'] }),
  A('MSTeams', 'comms', { lane: 'review', needs: ['work'], exe: ['ms-teams'] }),
  A('Microsoft.YourPhone', 'comms', { lane: 'review', tags: ['phone'], needs: ['laptop'], exe: ['PhoneExperienceHost', 'YourPhone'] }),
  A('MicrosoftWindows.CrossDevice', 'comms', { lane: 'review', tags: ['phone'] }),
  A('Microsoft.WindowsCommunicationsApps', 'comms', { lane: 'review', breaks: true, needs: ['work'], exe: ['HxOutlook', 'HxCalendarAppImm'] }),
  // ── AI / Cortana ──
  A('Microsoft.Windows.Cortana', 'ai'), A('Microsoft.549981C3F5F10', 'ai'),
  // ── Sponsored ──
  A('king.com.CandyCrushSaga', 'sponsored'), A('king.com.CandyCrushSodaSaga', 'sponsored'), A('king.com.CandyCrushFriends', 'sponsored'),
  A('SpotifyAB.SpotifyMusic', 'sponsored', { lane: 'review', exe: ['Spotify'] }),
  A('BytedancePte.Ltd.TikTok', 'sponsored'), A('4DF9E0F8.Netflix', 'sponsored'), A('AmazonVideo.PrimeVideo', 'sponsored'), A('Disney.37853FC22B2CE', 'sponsored'),
  A('Facebook.Facebook', 'sponsored'), A('Facebook.Instagram', 'sponsored'), A('LinkedInforWindows', 'sponsored'), A('Microsoft.MicrosoftJournal', 'sponsored'),
  A('MicrosoftWindows.Client.WebExperience', 'microsoft', { lane: 'review', tags: ['widgets'], breaks: true }),

  // Protected by the Xbox and Store shield (lib/uwp-protect): shown as kept, removable only with the shield off
  A('Microsoft.WindowsStore', 'microsoft', { lane: 'review', breaks: true }), A('Microsoft.StorePurchaseApp', 'microsoft', { lane: 'review', breaks: true }),
  A('Microsoft.DesktopAppInstaller', 'microsoft', { lane: 'review', breaks: true }), A('Microsoft.GamingServices', 'xbox', { lane: 'review', breaks: true, needs: ['xbox'] }),

  // ── Services ──
  S('SysMain', 'performance'), S('WSearch', 'performance', { lane: 'review', needs: ['dev', 'work'], breaks: true, tags: ['search'], exe: ['SearchIndexer'] }),
  S('DiagTrack', 'privacy'), S('dmwappushservice', 'privacy'), S('RemoteRegistry', 'privacy'), S('WerSvc', 'privacy'),
  S('XblAuthManager', 'xbox', { needs: ['xbox'], tags: ['xbox'] }), S('XblGameSave', 'xbox', { needs: ['xbox'], tags: ['xbox'] }), S('XboxNetApiSvc', 'xbox', { needs: ['xbox'], tags: ['xbox'] }),
  S('XboxGipSvc', 'xbox', { lane: 'review', use: 'xboxController', needs: ['xbox'], tags: ['xbox'] }),
  S('Fax', 'legacy'), S('RetailDemo', 'legacy'), S('WMPNetworkSvc', 'legacy'), S('MapsBroker', 'maps', { tags: ['maps'] }),
  S('WpcMonSvc', 'legacy'), S('AJRouter', 'legacy'), S('wisvc', 'legacy'), S('WalletService', 'legacy'),
  S('diagnosticshub.standardcollector.service', 'diagnostics', { lane: 'review' }), S('PcaSvc', 'diagnostics', { lane: 'review', breaks: true }),
  S('icssvc', 'system', { lane: 'review', breaks: true, needs: ['laptop'] }),
  S('Spooler', 'system', { lane: 'review', use: 'printers', needs: ['print'], breaks: true, tags: ['print'] }),
  S('lfsvc', 'system', { lane: 'review', needs: ['laptop'], breaks: true, tags: ['location'] }),
  S('bthserv', 'system', { lane: 'review', use: 'btPaired', needs: ['laptop'], breaks: true, tags: ['bluetooth'] }),

  // ── Scheduled tasks ──
  T('\\Microsoft\\Windows\\Application Experience\\', 'Microsoft Compatibility Appraiser', 'telemetry'),
  T('\\Microsoft\\Windows\\Application Experience\\', 'ProgramDataUpdater', 'telemetry'),
  T('\\Microsoft\\Windows\\Application Experience\\', 'AitAgent', 'telemetry'),
  T('\\Microsoft\\Windows\\Application Experience\\', 'StartupAppTask', 'telemetry'),
  T('\\Microsoft\\Windows\\Autochk\\', 'Proxy', 'telemetry'),
  T('\\Microsoft\\Windows\\Customer Experience Improvement Program\\', 'Consolidator', 'telemetry'),
  T('\\Microsoft\\Windows\\Customer Experience Improvement Program\\', 'UsbCeip', 'telemetry'),
  T('\\Microsoft\\Windows\\Customer Experience Improvement Program\\', 'BthSQM', 'telemetry'),
  T('\\Microsoft\\Windows\\PI\\', 'Sqm-Tasks', 'telemetry'),
  T('\\Microsoft\\Windows\\NetTrace\\', 'GatherNetworkInfo', 'telemetry'),
  T('\\Microsoft\\Windows\\DiskDiagnostic\\', 'Microsoft-Windows-DiskDiagnosticDataCollector', 'diagnostics', { needs: ['laptop'] }),
  T('\\Microsoft\\Windows\\Maintenance\\', 'WinSAT', 'diagnostics'),
  T('\\Microsoft\\Windows\\Power Efficiency Diagnostics\\', 'AnalyzeSystem', 'diagnostics'),
  T('\\Microsoft\\Windows\\Feedback\\Siuf\\', 'DmClient', 'privacy'),
  T('\\Microsoft\\Windows\\Feedback\\Siuf\\', 'DmClientOnScenarioDownload', 'privacy'),
  T('\\Microsoft\\Windows\\Windows Error Reporting\\', 'QueueReporting', 'privacy'),
  T('\\Microsoft\\Windows\\Speech\\', 'SpeechModelDownloadTask', 'privacy'),
  T('\\Microsoft\\XblGameSave\\', 'XblGameSaveTask', 'xbox', { needs: ['xbox'] }),
  T('\\Microsoft\\Windows\\Maps\\', 'MapsToastTask', 'maps'), T('\\Microsoft\\Windows\\Maps\\', 'MapsUpdateTask', 'maps'),
  T('\\Microsoft\\Windows\\Shell\\', 'FamilySafetyMonitor', 'shell', { lane: 'review', breaks: true }),
  T('\\Microsoft\\Windows\\Shell\\', 'FamilySafetyRefreshTask', 'shell', { lane: 'review', breaks: true }),
  T('\\Microsoft\\Windows\\WindowsUpdate\\', 'Automatic App Update', 'updates', { lane: 'review', breaks: true }),
  T('\\Microsoft\\Windows\\CloudExperienceHost\\', 'CreateObjectTask', 'cloud'),

  // ── Ad surfaces (registry, per user). reg: off = value that switches it off, on = value that switches it on ──
  AD('lock-screen-ads', 'lock', [r(CDM, 'RotatingLockScreenEnabled', 0, 1)]),
  AD('spotlight', 'lock', [r(CDM, 'RotatingLockScreenOverlayEnabled', 0, 1), r(CDM, 'SubscribedContent-338387Enabled', 0, 1)]),
  AD('start-suggestions', 'start', [r(CDM, 'SystemPaneSuggestionsEnabled', 0, 1)]),
  AD('start-recommended', 'start', [r(ADV, 'Start_IrisRecommendations', 0, 1)]),
  AD('start-tiles', 'start', [r(CDM, 'PreInstalledAppsEnabled', 0, 1), r(CDM, 'PreInstalledAppsEverEnabled', 0, 1), r(CDM, 'OemPreInstalledAppsEnabled', 0, 1)]),
  AD('silent-app-install', 'start', [r(CDM, 'SilentInstalledAppsEnabled', 0, 1)]),
  AD('bing-search', 'search', [r('HKCU:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Explorer', 'DisableSearchBoxSuggestions', 1, 0)]),
  AD('taskbar-widgets', 'taskbar', [r(ADV, 'TaskbarDa', 0, 1)], { lane: 'review', breaks: true }),
  AD('explorer-sync-nag', 'explorer', [r(ADV, 'ShowSyncProviderNotifications', 0, 1)]),
  AD('settings-suggestions', 'settings', [r(CDM, 'SubscribedContent-338393Enabled', 0, 1), r(CDM, 'SubscribedContent-353694Enabled', 0, 1), r(CDM, 'SubscribedContent-353696Enabled', 0, 1)]),
  AD('tips-notifications', 'notify', [r(CDM, 'SubscribedContent-338389Enabled', 0, 1), r(CDM, 'SoftLandingEnabled', 0, 1)]),
  AD('welcome-experience', 'notify', [r(CDM, 'SubscribedContent-310093Enabled', 0, 1), r(CDM, 'SubscribedContentEnabled', 0, 1)]),
  AD('finish-setup', 'notify', [r('HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\UserProfileEngagement', 'ScoobeSystemSettingEnabled', 0, 1)]),
  AD('advertising-id', 'settings', [r('HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo', 'Enabled', 0, 1)]),
  AD('tailored-exp', 'settings', [r('HKCU:\\Control Panel\\International\\User Profile', 'HttpAcceptLanguageOptOut', 1, 0)]),
  AD('ms-account-nag', 'notify', [r(ADV, 'Start_AccountNotifications', 0, 1)]),

  // ── Optional features ──
  F('Internet-Explorer-Optional-amd64'), F('SMB1Protocol', { security: true, lane: 'safe' }), F('SMB1Protocol-Client', { security: true, lane: 'safe' }), F('SMB1Protocol-Server', { security: true, lane: 'safe' }),
  F('MicrosoftWindowsPowerShellV2Root', { security: true, lane: 'safe' }), F('MicrosoftWindowsPowerShellV2', { security: true, lane: 'safe' }),
  F('Xps-Foundation-Xps-Viewer'), F('WindowsMediaPlayer'), F('WorkFolders-Client'), F('TelnetClient'), F('TFTP'), F('SimpleTCP'),
  F('FaxServicesClientPackage'), F('MediaPlayback'), F('DirectPlay', { needs: ['gaming'] }),
]

// Vendor helper programs shown as "OEM" in Programs (matched by display name, case-insensitive).
const OEM = {
  dell: ['Dell SupportAssist', 'Dell Update', 'Dell Mobile Connect', 'Dell Digital Delivery', 'Dell Core Services', 'DellDataVaultWizard', 'Dell Peripheral Manager'],
  hp: ['HP Sure Connect', 'HP Jump Start', 'HP Audio Switch', 'HP Wolf Security', 'HP Client Security Manager', 'HP Notifications', 'HP Smart', 'myHP'],
  lenovo: ['Lenovo Vantage', 'Lenovo Now', 'Lenovo Smart Appearance', 'Lenovo Commercial Vantage', 'LenovoWelcome', 'Lenovo Migration Assistant'],
  asus: ['ASUS Armory Crate', 'MyASUS', 'ASUS ROG GameFirst', 'Armoury Crate', 'ASUS Sonic Studio', 'ASUS System Diagnosis'],
  msi: ['MSI Center', 'Dragon Center', 'MSI App Player', 'Nahimic for MSI'],
  acer: ['Acer Care Center', 'Acer Quick Access', 'Acer Product Registration', 'Acer Jumpstart', 'Acer Configuration Manager'],
  samsung: ['Samsung Settings', 'Samsung PC Cleaner', 'Samsung CRU', 'Samsung Update'],
  toshiba: ['Toshiba Service Station', 'Toshiba Setup Utility'],
  sony: ['VAIO Update', 'VAIO Care'],
}
const oemFor = mfr => { const m = String(mfr || '').toLowerCase(); for (const [v, l] of Object.entries(OEM)) if (m.includes(v)) return l; return [] }

const BY_ID = new Map(CATALOG.map(i => [i.id, i]))
const get = id => BY_ID.get(id) || null
const ofKind = k => CATALOG.filter(i => i.kind === k)
const layerOf = item => LAYER_OF[item.kind]
const isProtectedItem = item => item.kind === 'appx' && PROTECTED.some(p => p.toLowerCase() === item.pkg.toLowerCase())
/** Every registry value an ad surface reads, for the probe. */
const adRegistry = () => ofKind('ad').flatMap(i => i.reg.map(x => ({ key: x.key, name: x.name })))
/** Process names (lower case) the probe measures. */
const exeNames = () => [...new Set(CATALOG.flatMap(i => i.exe).map(e => e.toLowerCase()))]
const taskKey = (p, n) => String(p).toLowerCase() + '|' + String(n).toLowerCase()

module.exports = { CATALOG, KINDS, LAYERS, LAYER_OF, INTENTS, OEM, oemFor, get, ofKind, layerOf, isProtectedItem, adRegistry, exeNames, taskKey }
