'use strict'
// The only list of what the CPU & Memory tab may show or change. Every id is a TWEAKS id in main.js (test/cpumem-engine.test.js checks that).
//   lane     which group of the page it sits in (LANES below)       premium  needs Premium (it was on a Premium tab before)
//   probe    how its live state is read, one check per value it writes. No probe = state cannot be read honestly ('unknown').
//   reboot   the change only takes effect after a restart           rec      part of the "recommended" set (only when evidence says so)
// Probe kinds:  r = registry value {r, n, eq | {ge} | {le}}    s = service start type {s, eq}
//               p = powercfg AC index of the active plan {p:'SUB_PROCESSOR CPMINCORES', eq: number}
//               x = value computed by the read-only script (detect.js): memcomp | scheme | hvlaunch | pagefile | procmit, with eq or ne
// A probe that cannot be read on this PC is left out of the match, never counted as "off".
const LANES = [
  { id: 'processor' },
  { id: 'corepower', premium: true },
  { id: 'memory' },
  { id: 'tradeoffs' },
  { id: 'retired' },
]

const MM = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management'
const DG = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard'
const HVCI = DG + '\\Scenarios\\HypervisorEnforcedCodeIntegrity'
const BALANCED = '381b4222-f694-41f0-9685-ff5bb260df2e'
const SAVER = 'a1841308-3541-4fab-bc81-f71556f20b4a'
const reg = (r, n, eq) => ({ r, n, eq })
const pw = (p, eq) => ({ p, eq })

const ITEMS = [
  // ── Processor
  { id: 'power-throttling', lane: 'processor', icon: 'bolt', probe: [reg('HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling', 'PowerThrottlingOff', 1)], warn: [{ when: 'laptop', key: 'warnLaptopBattery' }] },
  { id: 'global-timer-resolution', lane: 'processor', icon: 'clock', probe: [reg('HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel', 'GlobalTimerResolutionRequests', 1)] },
  { id: 'x3d-balanced', lane: 'processor', icon: 'layer-group', probe: [{ x: 'scheme', eq: BALANCED }] },
  { id: 'power-balanced-restore', lane: 'processor', icon: 'gauge-high', rec: true, probe: [{ x: 'scheme', ne: SAVER }] },
  // ── Core power (Premium)
  { id: 'cpu-parking', lane: 'corepower', icon: 'microchip', premium: true, reboot: true, probe: [pw('SUB_PROCESSOR CPMINCORES', 100)] },
  { id: 'cstates', lane: 'corepower', icon: 'bolt-lightning', premium: true, reboot: true, probe: [pw('SUB_PROCESSOR PROCTHROTTLEMIN', 100), pw('SUB_PROCESSOR IDLEPROMOTE', 0), pw('SUB_PROCESSOR IDLEDEMOTE', 0)] },
  // ── Memory
  { id: 'sysmain', lane: 'memory', icon: 'brain', probe: [{ s: 'SysMain', eq: 'Disabled' }], warn: [{ when: 'ramBelow', n: 12, key: 'warnLowRamSysmain' }] },
  { id: 'memory-compression', lane: 'memory', icon: 'compress', probe: [{ x: 'memcomp', eq: 'False' }], warn: [{ when: 'ramBelow', n: 16, key: 'warnLowRamCompression' }] },
  { id: 'pagefile-auto', lane: 'memory', icon: 'file-lines', reboot: true, probe: [{ x: 'pagefile', eq: 'True' }] },
  // ── Security trade-offs
  { id: 'spectre-meltdown', lane: 'tradeoffs', icon: 'triangle-exclamation', reboot: true, probe: [reg(MM, 'FeatureSettingsOverride', 3), reg(MM, 'FeatureSettingsOverrideMask', 3)] },
  { id: 'hvci-offload', lane: 'tradeoffs', icon: 'server', premium: true, reboot: true, probe: [reg(HVCI, 'Enabled', 0)] },
  { id: 'vbs-disable', lane: 'tradeoffs', icon: 'shield-halved', premium: true, reboot: true, probe: [reg(DG, 'EnableVirtualizationBasedSecurity', 0), reg(HVCI, 'Enabled', 0)] },
  { id: 'hypervisor-off', lane: 'tradeoffs', icon: 'cubes', premium: true, reboot: true, probe: [{ x: 'hvlaunch', eq: 'off' }] },
  { id: 'full-mitigation-wipe', lane: 'tradeoffs', icon: 'skull-crossbones', premium: true, reboot: true, probe: [reg(MM, 'FeatureSettingsOverride', 3), reg(MM, 'FeatureSettingsOverrideMask', 3), { x: 'procmit', eq: 'OFF' }] },
  // ── Retired: no longer offered (main.js RETIRED_TWEAKS). Listed only so an earlier apply can still be seen and restored.
  ...['memory-guard-tune', 'pool-usage-max', 'process-count-reduction', 'speed-shift'].map(id => ({ id, lane: 'retired', icon: 'box-archive' })),
]

const byId = Object.fromEntries(ITEMS.map(i => [i.id, i]))
const ids = () => ITEMS.map(i => i.id)
const lanes = () => LANES.slice()
const isKnown = id => !!byId[id]
const isPremium = id => !!(byId[id] && byId[id].premium)

const exported = { LANES, ITEMS, BALANCED, SAVER, byId, ids, lanes, isKnown, isPremium }
if (typeof module !== 'undefined' && module.exports) module.exports = exported
if (typeof window !== 'undefined') window.JylliCpuMemCatalog = exported
