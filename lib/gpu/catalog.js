'use strict'
// The only list of what the GPU tab may show or change. Every id is a TWEAKS id in main.js (test/gpu-engine.test.js checks that).
//   lane     which group of the page it sits in (LANES)      premium  needs Premium (it was on the Premium GPU tab before)
//   probe    how its live state is read, one check per value it writes. No probe = state cannot be read honestly ('unknown').
//   reboot   the change only takes effect after a restart    rec      part of the "recommended" set (only when evidence says so)
// Probe kinds:  r = registry value {r, n, eq | {ge} | {le}}   x = value computed by the read-only script (detect.js): msi | dxvrr, with eq
// A probe that cannot be read on this PC is left out of the match, never counted as "off".
const LANES = [
  { id: 'scheduling' },
  { id: 'displaypath' },
  { id: 'stability' },
  { id: 'retired' },
]

const GFX = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers'
const DWM = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\Dwm'
const reg = (r, n, eq) => ({ r, n, eq })

const ITEMS = [
  // ── Scheduling
  { id: 'gpu-hwsch', lane: 'scheduling', icon: 'palette', reboot: true, probe: [reg(GFX, 'HwSchMode', 2)] },
  { id: 'gpu-hags-off', lane: 'scheduling', icon: 'display', premium: true, reboot: true, probe: [reg(GFX, 'HwSchMode', 1)] },
  { id: 'msi-mode', lane: 'scheduling', icon: 'plug', reboot: true, probe: [{ x: 'msi', eq: 'on' }] },
  // ── Display path
  { id: 'disable-mpo', lane: 'displaypath', icon: 'layer-group', reboot: true, probe: [reg(DWM, 'OverlayTestMode', 5)] },
  { id: 'vrr-borderless', lane: 'displaypath', icon: 'display', probe: [{ x: 'dxvrr', eq: 'on' }] },
  { id: 'gpu-per-app-preference', lane: 'displaypath', icon: 'microchip' },
  // ── Stability
  { id: 'tdr-delay', lane: 'stability', icon: 'shield-halved', probe: [reg(GFX, 'TdrDelay', { ge: 10 })] },
  // ── Retired: no longer offered (main.js RETIRED_TWEAKS). Listed only so an earlier apply can still be seen and restored.
  ...['nvidia-max-perf', 'nvidia-low-latency', 'nvidia-pstate-lock', 'nvidia-profile', 'amd-chill-off', 'amd-power-hold', 'amd-service-trim', 'amd-ulps-disable', 'disable-hdcp']
    .map(id => ({ id, lane: 'retired', icon: 'box-archive' })),
]

const byId = Object.fromEntries(ITEMS.map(i => [i.id, i]))
const ids = () => ITEMS.map(i => i.id)
const lanes = () => LANES.slice()
const isKnown = id => !!byId[id]
const isPremium = id => !!(byId[id] && byId[id].premium)

const exported = { LANES, ITEMS, byId, ids, lanes, isKnown, isPremium }
if (typeof module !== 'undefined' && module.exports) module.exports = exported
if (typeof window !== 'undefined') window.JylliGpuCatalog = exported
