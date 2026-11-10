'use strict'
// Structured risk disclosure for every tier >= 2 tweak. Texts live in LANG (`tweakRisk[id]` = what can happen, `riskTag[tag]` = who),
// this file holds the machine-readable part: which kinds of system should avoid the tweak, which should be careful, how it is undone.
// The card and the typed-confirmation dialog render it; test/tweak-risk.test.js keeps it complete.
//   avoid:   "do not apply on" tags     caution: "think twice on" tags
//   revert:  'journal' = Undo puts back the recorded values, 'manual' = needs the user (reboot/driver/BIOS), 'none' = cannot be undone

const TAGS = [
  'shared-pc', 'work-pc', 'no-av', 'modern-cpu', 'old-cpu', 'anticheat', 'valorant', 'virtualization', 'wsl-docker',
  'hello-users', 'bt-peripherals', 'laptop', 'battery', 'wifi', 'multi-monitor', 'hdd', 'low-ram', 'intel-13-14', 'dual-ccd-x3d',
  'hybrid-gpu', 'roaming',
]

const RISK = {
  'spectre-meltdown':    { avoid: ['shared-pc', 'work-pc'], caution: ['modern-cpu'], revert: 'journal', reboot: true },
  'vbs-disable':         { avoid: ['work-pc', 'virtualization'], caution: ['anticheat', 'modern-cpu'], revert: 'journal', reboot: true },
  'hvci-offload':        { avoid: ['work-pc'], caution: ['anticheat', 'modern-cpu'], revert: 'journal', reboot: true },
  'full-mitigation-wipe': { avoid: ['shared-pc', 'work-pc', 'valorant'], caution: ['anticheat'], revert: 'journal', reboot: true },
  'defender-core-off':   { avoid: ['no-av', 'shared-pc'], caution: [], revert: 'journal', reboot: false },
  'defender-idle-priority': { avoid: [], caution: ['low-ram'], revert: 'journal', reboot: false },
  'biometrics-off':      { avoid: ['hello-users'], caution: [], revert: 'journal', reboot: false },
  'bluetooth-hard-off':  { avoid: ['bt-peripherals'], caution: [], revert: 'journal', reboot: false },
  'pcie-power': { avoid: ['laptop', 'battery'], caution: [], revert: 'journal', reboot: false },
  'power-throttling': { avoid: ['laptop', 'battery'], caution: [], revert: 'journal', reboot: false },
  'disable-background-apps': { avoid: [], caution: [], revert: 'journal', reboot: false },
  'global-timer-resolution': { avoid: [], caution: ['laptop', 'battery'], revert: 'journal', reboot: false },
  'disable-fso': { avoid: [], caution: [], revert: 'journal', reboot: false },
  'sysmain': { avoid: [], caution: ['hdd', 'low-ram'], revert: 'journal', reboot: false },
  'hypervisor-off':      { avoid: ['wsl-docker', 'virtualization', 'work-pc'], caution: ['anticheat'], revert: 'journal', reboot: true },
  'disable-mpo':         { avoid: [], caution: ['laptop', 'multi-monitor'], revert: 'journal', reboot: true },
  'fth-reset':           { avoid: [], caution: [], revert: 'none', reboot: false },
  'wifi-gaming-tune':    { avoid: [], caution: ['laptop', 'roaming'], revert: 'journal', reboot: false },
  'msi-mode': { avoid: [], caution: ['laptop'], revert: 'journal', reboot: true },
  'memory-compression': { avoid: [], caution: ['low-ram', 'hdd'], revert: 'journal', reboot: false },
  'cstates': { avoid: ['laptop', 'battery'], caution: [], revert: 'journal', reboot: false },
  'winsock-reset': { avoid: [], caution: ['work-pc'], revert: 'none', reboot: true },
  'disable-ipv6': { avoid: [], caution: [], revert: 'journal', reboot: true },
  'nic-offloads': { avoid: [], caution: [], revert: 'journal', reboot: false },
  'nic-interrupt-mod': { avoid: [], caution: [], revert: 'journal', reboot: false },
  'nic-rss-affinity': { avoid: [], caution: [], revert: 'journal', reboot: false },
  'fivem-preload-ipl': { avoid: [], caution: [], revert: 'journal', reboot: false },
  'fivem-reduce-draw-distance': { avoid: [], caution: [], revert: 'journal', reboot: false },
  'reality-telephony-off': { avoid: [], caution: ['work-pc'], revert: 'journal', reboot: false },
  'rt-scan-trim': { avoid: [], caution: ['work-pc'], revert: 'journal', reboot: false },
  'security-quiet': { avoid: [], caution: ['shared-pc'], revert: 'journal', reboot: false },
  'security-toast-off': { avoid: [], caution: ['shared-pc'], revert: 'journal', reboot: false },
  'sensor-suite-off': { avoid: ['laptop'], caution: [], revert: 'journal', reboot: false },
  'telemetry-zero': { avoid: [], caution: ['work-pc'], revert: 'journal', reboot: false },
  'defender-quiet': { avoid: [], caution: ['work-pc'], revert: 'journal', reboot: false },
  'diagnostics-off': { avoid: [], caution: [], revert: 'journal', reboot: false },
  'gpu-hags-off': { avoid: [], caution: [], revert: 'journal', reboot: true },
  'capability-ruleset': { avoid: [], caution: [], revert: 'journal', reboot: false },
}

/** Tier >= 2 tweaks that predate this file and have no entry yet. Shrink it, never grow it. */
const LEGACY_UNDOCUMENTED = []

module.exports = { TAGS, RISK, LEGACY_UNDOCUMENTED }
