'use strict'
// The only list of what the Power tab may show or change. Every id is a TWEAKS id in main.js (test/power-engine.test.js checks that).
//   lane     which group of the page it sits in (LANES)      premium  needs Premium (it was on the Premium Power tab before)
//   probe    how its live state is read, one check per value it writes. No probe = state cannot be read honestly ('unknown').
//   reboot   the change only takes effect after a restart    rec      part of the "recommended" set (only when evidence says so)
// Probe kinds:  r = registry value {r, n, eq}   p = power-plan value of the ACTIVE plan {p:'<sub>|<setting>', side:'AC'|'DC', eq}
//               pn = the active plan is named {pn}   f = a fact read by the script {f:'trim', eq}
// A probe that cannot be read on this PC is left out of the match, never counted as "off".
const LANES = [
  { id: 'plan', premium: true },
  { id: 'links', premium: true },
  { id: 'storage' },
  { id: 'startup' },
  { id: 'retired' },
]

const ASPM = '501a4d13-42af-4429-9ac1-df54c6bf3fc2|ee12f906-d277-404b-b6da-e5fa1a576df5'
const reg = (r, n, eq) => ({ r, n, eq })

const ITEMS = [
  // ── Plan: a dedicated plan built by Jylli for this CPU. Only desktops (tweak-applicability.js).
  { id: 'intel-power-plan', lane: 'plan', icon: 'bolt', premium: true, reboot: true, probe: [{ pn: 'Intel Max Performance' }] },
  { id: 'amd-power-plan', lane: 'plan', icon: 'bolt', premium: true, reboot: true, probe: [{ pn: 'AMD Max Performance' }] },
  // ── Links
  { id: 'pcie-power', lane: 'links', icon: 'plug-circle-bolt', premium: true, reboot: true, probe: [{ p: ASPM, side: 'AC', eq: 0 }, { p: ASPM, side: 'DC', eq: 0 }], warn: [{ when: 'laptop', key: 'warnLaptopPower' }] },
  // ── Storage and startup (they were Auto-Optimize only; no tab owned them)
  { id: 'trim-enable', lane: 'storage', icon: 'hard-drive', probe: [{ f: 'trim', eq: 0 }] },
  { id: 'fast-startup-off', lane: 'startup', icon: 'power-off', probe: [reg('HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power', 'HiberbootEnabled', 0)] },
  // ── Retired: no longer offered (main.js RETIRED_TWEAKS). Listed only so an earlier apply can still be seen and restored.
  ...['nvme-latency', 'directstorage-nvme'].map(id => ({ id, lane: 'retired', icon: 'box-archive' })),
]

const byId = Object.fromEntries(ITEMS.map(i => [i.id, i]))
const ids = () => ITEMS.map(i => i.id)
const lanes = () => LANES.slice()
const isKnown = id => !!byId[id]
const isPremium = id => !!(byId[id] && byId[id].premium)

const exported = { LANES, ITEMS, byId, ids, lanes, isKnown, isPremium, ASPM }
if (typeof module !== 'undefined' && module.exports) module.exports = exported
if (typeof window !== 'undefined') window.JylliPowerCatalog = exported
