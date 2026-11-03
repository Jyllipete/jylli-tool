'use strict'
// SystemProfile fixtures shared by the Auto-Optimize tests and the UI preview. base() is a healthy mid-range desktop where no
// finding fires (apart from the always-available tidy-ups); each named profile bends it one way.
const startup = require('../../../lib/auto-opti/startup')

const display = (over = {}) => ({
  device: '\\\\.\\DISPLAY1', monitor: 'LG 27GP850', primary: true, cur: { w: 2560, h: 1440, hz: 165, bpp: 32 },
  modes: [{ w: 2560, h: 1440, hz: 60 }, { w: 2560, h: 1440, hz: 144 }, { w: 2560, h: 1440, hz: 165 }], maxHzAtCur: 165, edidMaxHz: null, ...over,
})

function base() {
  return {
    v: 1, scanId: 'fx', takenAt: 0, admin: true, context: {}, probes: {}, formFactor: 'desktop',
    os: { build: 26100, ubr: 1, edition: 'Professional', win11: true },
    cpu: { name: 'Intel(R) Core(TM) i7-13700K', vendor: 'intel', cores: 16, threads: 24, x3d: 'none' },
    gpus: [{ name: 'NVIDIA GeForce RTX 4070', vendor: 'nvidia', discrete: true, driverVersion: '32.0.15.6', driverDate: '2026-09-01', driverAgeDays: 60, hagsCapable: true }],
    hags: 2, dxGlobal: 'VRROptimizeEnable=1;SwapEffectUpgradeEnable=1;',
    ram: { type: 'DDR5', slotsTotal: 4, dimms: 2, totalGB: 32, sticks: [], mismatched: false, xmp: 'on', xmpConfidence: 'measured', xmpRatedMT: 6000, xmpConfiguredMT: 6000 },
    displays: [display()], remoteSession: false,
    power: { guid: '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c', name: 'High performance', kind: 'high', onAC: true, overlayAc: null, overlayKind: null },
    storage: { freeGB: 400, totalGB: 1000, pctFree: 40, ssd: true, trimOn: true, pagefileDisabled: false, tempBytes: 10 * 1024 ** 2, wuBytes: 0, wuRebootPending: false, hiberBytes: 0, hiberboot: false },
    gaming: { gameMode: true, bgCapture: false },
    input: { mouseAccel: false, stickyHotkey: false },
    background: { telemetryTasksOn: 0, telemetryTasksFound: 6, diagTrackOn: false, doPeerOn: false, bingSearchOn: false, nudgesOn: false },
    startup: startup.summarize([]),
    security: { av: ['Windows Defender'], thirdPartyAv: [], defenderRtp: true, defenderPassive: false, firewall: { domain: true, private: true, public: true }, firewallOn: true, smartScreen: 'on', windowsUpdate: 'ok', uac: 'on', hvci: 'off' },
    net: { primary: 'ethernet', name: 'Ethernet', desc: 'Realtek', speed: '1 Gbps', eee: 'off' },
  }
}

const startupItems = [
  { name: 'Steam', cmd: 'steam.exe', company: 'Valve', enabled: true }, { name: 'Discord', cmd: 'discord.exe', company: 'Discord', enabled: true },
  { name: 'Spotify', cmd: 'spotify.exe', company: 'Spotify', enabled: true }, { name: 'EpicGamesLauncher', cmd: 'epic.exe', company: 'Epic', enabled: true },
  { name: 'Teams', cmd: 'teams.exe', company: 'Microsoft', enabled: true }, { name: 'OneDrive', cmd: 'onedrive.exe', company: 'Microsoft', enabled: true },
  { name: 'SecurityHealth', cmd: 'securityhealth.exe', company: 'Microsoft', enabled: true }, { name: 'RtkAudUService', cmd: 'rtk.exe', company: 'Realtek', enabled: true },
]

const P = {
  healthy: () => base(),
  'x3d-desktop': () => Object.assign(base(), {
    cpu: { name: 'AMD Ryzen 9 7950X3D', vendor: 'amd', cores: 16, threads: 32, x3d: 'dual' },
    power: { guid: '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c', name: 'High performance', kind: 'high', onAC: true, overlayAc: null, overlayKind: null },
    gaming: { gameMode: false, bgCapture: true },
  }),
  'x3d-single': () => Object.assign(base(), {
    cpu: { name: 'AMD Ryzen 7 7800X3D', vendor: 'amd', cores: 8, threads: 16, x3d: 'single' },
    power: { guid: '381b4222-f694-41f0-9685-ff5bb260df2e', name: 'Balanced', kind: 'balanced', onAC: true, overlayAc: null, overlayKind: null },
  }),
  'intel-laptop': () => Object.assign(base(), {
    formFactor: 'laptop', cpu: { name: '11th Gen Intel(R) Core(TM) i5-1135G7', vendor: 'intel', cores: 4, threads: 8, x3d: 'none' },
    gpus: [{ name: 'Intel(R) Iris(R) Xe Graphics', vendor: 'intel', discrete: false, driverVersion: '31', driverDate: '2026-01-01', driverAgeDays: 300, hagsCapable: false }],
    power: { guid: '381b4222-f694-41f0-9685-ff5bb260df2e', name: 'Balanced', kind: 'balanced', onAC: true, overlayAc: '961cc777-2547-4f9d-8174-7d86181b8a7a', overlayKind: 'efficiency' },
    net: { primary: 'wifi', name: 'Wi-Fi', desc: 'Intel AX201', speed: '144 Mbps', eee: 'n/a' },
    displays: [display({ cur: { w: 1920, h: 1080, hz: 60, bpp: 32 }, modes: [{ w: 1920, h: 1080, hz: 60 }, { w: 1920, h: 1080, hz: 144 }], maxHzAtCur: 144, monitor: 'Internal' })],
  }),
  'wifi-eth-desktop': () => Object.assign(base(), { net: { primary: 'ethernet', name: 'Ethernet', desc: 'Realtek 2.5GbE', speed: '2.5 Gbps', eee: 'on' } }),
  '60-on-144': () => Object.assign(base(), { displays: [display({ cur: { w: 2560, h: 1440, hz: 60, bpp: 32 }, maxHzAtCur: 144, modes: [{ w: 2560, h: 1440, hz: 60 }, { w: 2560, h: 1440, hz: 144 }] })] }),
  'single-dimm': () => Object.assign(base(), { ram: { ...base().ram, dimms: 1, totalGB: 16, type: 'DDR4', xmp: 'off', xmpConfidence: 'measured', xmpRatedMT: 3600, xmpConfiguredMT: 2133 } }),
  'low-disk': () => Object.assign(base(), { storage: { ...base().storage, freeGB: 40, pctFree: 4, tempBytes: 3 * 1024 ** 3 } }),
  'power-saver-laptop': () => Object.assign(P['intel-laptop'](), { power: { guid: 'a1841308-3541-4fab-bc81-f71556f20b4a', name: 'Power saver', kind: 'saver', onAC: true, overlayAc: null, overlayKind: null } }),
  'stream-obs': () => Object.assign(base(), { context: { apps: { obs: true } } }),
  'cluttered': () => Object.assign(base(), {
    power: { guid: '381b4222-f694-41f0-9685-ff5bb260df2e', name: 'Balanced', kind: 'balanced', onAC: true, overlayAc: null, overlayKind: null },
    gaming: { gameMode: false, bgCapture: true }, input: { mouseAccel: true, stickyHotkey: true }, hags: 1, dxGlobal: '',
    background: { telemetryTasksOn: 5, telemetryTasksFound: 6, diagTrackOn: true, doPeerOn: true, bingSearchOn: true, nudgesOn: true },
    startup: startup.summarize(startupItems.map(i => ({ src: 'HKCU', ...i }))),
    storage: { ...base().storage, tempBytes: 2.4 * 1024 ** 3, wuBytes: 900 * 1024 ** 2, hiberBytes: 12 * 1024 ** 3, hiberboot: true },
    displays: [display({ cur: { w: 2560, h: 1440, hz: 60, bpp: 32 }, maxHzAtCur: 165 })],
    net: { primary: 'ethernet', name: 'Ethernet', desc: 'Realtek', speed: '1 Gbps', eee: 'on' },
  }),
  'no-probes': () => ({ v: 1, scanId: 'fx', takenAt: 0, admin: true, context: {}, probes: {}, gpus: [] }),
}

module.exports = { P, base, display, startupItems }
