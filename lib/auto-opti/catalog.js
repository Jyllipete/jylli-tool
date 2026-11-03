'use strict'
// The one curated table behind Auto-Optimize. The renderer never names a tweak: it names finding ids, and main turns those into
// steps from this table. Anything not reachable from here cannot run from Auto-Optimize (allowlist), and NEVER_AUTO is a second
// belt for anything that touches security.

const MODULES = ['display', 'power', 'gpu', 'input', 'windows', 'network', 'startup', 'storage', 'fivem', 'cleanup']
const USE_CASES = ['fps', 'open', 'stream', 'mix']
const ALL = USE_CASES
const GAMING = ['fps', 'open']

const T = id => ({ type: 'tweak', id })
const C = id => ({ type: 'control', id })

/**
 * id -> { module, kind, impact, steps, defaultOn: [useCases], reboot, admin, premium, undoable, estMs }
 * kind: 'fix' (we change it), 'manual' (needs the user: BIOS, cable, driver), 'info' (nothing to change, shown for context).
 * impact is what the user can feel: high (visible/audible every day), medium (measurable), low (background tidy-up).
 */
const CATALOG = {
  'display-refresh':     { module: 'display', kind: 'fix', impact: 'high', steps: [C('display-refresh')], defaultOn: ALL, reboot: false, estMs: 4000, interactive: 'display-confirm' },
  'display-link-limited': { module: 'display', kind: 'manual', impact: 'high', steps: [] },
  'ram-xmp-off':         { module: 'power', kind: 'manual', impact: 'high', steps: [] },
  'ram-single-channel':  { module: 'power', kind: 'manual', impact: 'high', steps: [] },
  'power-saver':         { module: 'power', kind: 'fix', impact: 'high', steps: [T('power-balanced-restore')], defaultOn: ALL, estMs: 1500 },
  'power-laptop-ac':     { module: 'power', kind: 'fix', impact: 'medium', steps: [T('laptop-power-mode')], defaultOn: GAMING, estMs: 1500 },
  'power-desktop':       { module: 'power', kind: 'fix', impact: 'medium', steps: [], defaultOn: ['fps', 'open', 'stream'], estMs: 3000 },   // tweak chosen by CPU vendor
  'x3d-setup':           { module: 'power', kind: 'fix', impact: 'high', steps: [T('x3d-balanced')], defaultOn: ALL, estMs: 2000 },
  'x3d-driver':          { module: 'power', kind: 'manual', impact: 'medium', steps: [] },
  'game-mode':           { module: 'gpu', kind: 'fix', impact: 'medium', steps: [T('game-mode-on')], defaultOn: ALL, estMs: 600 },
  'bg-capture':          { module: 'gpu', kind: 'fix', impact: 'medium', steps: [T('game-dvr')], defaultOn: ALL, estMs: 800 },
  'hags':                { module: 'gpu', kind: 'fix', impact: 'medium', steps: [T('gpu-hwsch')], defaultOn: ALL, reboot: true, estMs: 800 },
  'vrr-borderless':      { module: 'gpu', kind: 'fix', impact: 'medium', steps: [T('vrr-borderless')], defaultOn: ['fps', 'open', 'mix'], estMs: 800 },
  'gpu-driver-old':      { module: 'gpu', kind: 'manual', impact: 'medium', steps: [] },
  'mouse-accel':         { module: 'input', kind: 'fix', impact: 'medium', steps: [T('disable-mouse-accel')], defaultOn: GAMING, estMs: 600 },
  'sticky-keys':         { module: 'input', kind: 'fix', impact: 'low', steps: [T('sticky-keys-guard')], defaultOn: GAMING, estMs: 600 },
  'usb-suspend':         { module: 'input', kind: 'fix', impact: 'low', steps: [T('usb-suspend')], defaultOn: GAMING, estMs: 1500 },
  'power-throttling-stream': { module: 'power', kind: 'fix', impact: 'medium', steps: [T('power-throttling')], defaultOn: ['stream'], estMs: 800 },
  'ui-snappy':           { module: 'windows', kind: 'fix', impact: 'low', steps: [T('visual-effects'), T('explorer-perf')], defaultOn: ALL, estMs: 2500 },
  'telemetry':           { module: 'windows', kind: 'fix', impact: 'low', steps: [T('telemetry')], defaultOn: ALL, estMs: 2500 },
  'telemetry-tasks':     { module: 'windows', kind: 'fix', impact: 'low', steps: [T('telemetry-tasks')], defaultOn: ALL, estMs: 2500 },
  'delivery-opt':        { module: 'network', kind: 'fix', impact: 'low', steps: [T('disable-delivery-opt')], defaultOn: ALL, estMs: 600 },
  'nudges':              { module: 'windows', kind: 'fix', impact: 'low', steps: [T('nudge-blocker')], defaultOn: ALL, estMs: 900 },
  'search-web':          { module: 'windows', kind: 'fix', impact: 'low', steps: [T('search-local-only')], defaultOn: ALL, estMs: 900 },
  'nic-eee':             { module: 'network', kind: 'fix', impact: 'medium', steps: [T('nic-energy-efficient')], defaultOn: ALL, estMs: 3000 },
  'startup-apps':        { module: 'startup', kind: 'fix', impact: 'medium', steps: [C('startup-cleanup')], defaultOn: ALL, estMs: 2000 },
  'hibernate':           { module: 'storage', kind: 'fix', impact: 'low', steps: [T('fast-startup-off'), T('hibernate')], defaultOn: ALL, estMs: 2500 },
  'pagefile-off':        { module: 'storage', kind: 'fix', impact: 'high', steps: [T('pagefile-auto')], defaultOn: ALL, reboot: true, estMs: 1000 },
  'trim-off':            { module: 'storage', kind: 'fix', impact: 'medium', steps: [T('trim-enable')], defaultOn: ALL, estMs: 800 },
  'disk-low':            { module: 'storage', kind: 'manual', impact: 'high', steps: [] },
  'junk':                { module: 'cleanup', kind: 'fix', impact: 'low', steps: [C('junk-clean')], defaultOn: ALL, estMs: 8000, undoable: false },
  'fivem':               { module: 'fivem', kind: 'fix', impact: 'high', steps: [T('fivem-priority'), C('fivem-settings')], defaultOn: ['fps', 'open', 'mix'], premium: true, estMs: 3000 },
  'hvci-cost':           { module: 'gpu', kind: 'info', impact: 'medium', steps: [], optIn: 'hvci' },
  'gpu-per-app':         { module: 'gpu', kind: 'fix', impact: 'high', steps: [T('gpu-per-app-preference')], defaultOn: ['fps', 'open', 'mix'], estMs: 2500 },
  'pointer-1to1':        { module: 'input', kind: 'fix', impact: 'low', steps: [T('mouse-pointer-1to1')], defaultOn: [], estMs: 600 },   // changes how the mouse feels: offered, never default
  'cpu-microcode':       { module: 'power', kind: 'manual', impact: 'high', steps: [] },
  'intel-apo':           { module: 'power', kind: 'manual', impact: 'medium', steps: [] },
  'hybrid-win10':        { module: 'power', kind: 'manual', impact: 'high', steps: [] },
  'rebar-off':           { module: 'gpu', kind: 'manual', impact: 'medium', steps: [] },
  'game-on-hdd':         { module: 'storage', kind: 'manual', impact: 'medium', steps: [] },
  'win10-eol':           { module: 'windows', kind: 'manual', impact: 'medium', steps: [] },
  'shield-firewall':     { module: 'security', kind: 'info', impact: 'high', steps: [] },
  'shield-defender':     { module: 'security', kind: 'info', impact: 'high', steps: [] },
  'shield-uac':          { module: 'security', kind: 'info', impact: 'high', steps: [] },
  'shield-update':       { module: 'security', kind: 'info', impact: 'high', steps: [] },
}

// The CPU-vendor choice for 'power-desktop'.
const POWER_DESKTOP_TWEAK = { intel: 'intel-power-plan', amd: 'amd-power-plan' }

/** Security shield: registry and service names Auto-Optimize must never write. The catalog test checks every allowed tweak against this. */
const SHIELD_DENY = [
  /Windows Defender/i, /Windows Security/i, /Security Center/i, /SecurityHealth/i, /\bMpsSvc\b/i, /\bWinDefend\b/i, /\bwuauserv\b/i, /\bUsoSvc\b/i,
  /\bEnableLUA\b/i, /SmartScreen/i, /DeviceGuard/i, /WindowsUpdate\\AU/i, /\bSecurityHealthService\b/i,
]

/** Tweaks that must never run from Auto-Optimize even if something asks for them. */
const NEVER_AUTO = new Set([
  'security-quiet', 'security-toast-off', 'defender-quiet', 'rt-scan-trim', 'vbs-disable', 'hvci-offload', 'defender-core-off', 'defender-idle-priority',
  'spectre-meltdown', 'biometrics-off', 'bluetooth-hard-off', 'full-mitigation-wipe', 'memory-guard-tune', 'reboot-now', 'winsock-reset', 'disable-ipv6',
  // Removed from Auto-Optimize as redundant, low-value or side-effect-prone; they stay manual-only.
  'priority-sep', 'mmcss', 'cursor-max-rate', 'raw-aim-curve', 'disable-auto-maintenance', 'disable-background-apps', 'pcie-power', 'sysmain', 'cortana', 'cortana-blackout',
  'reality-telephony-off', 'sensor-suite-off', 'ntfs', 'nvme-latency', 'directstorage-nvme', 'tdr-delay', 'disable-fso', 'tcp-stack', 'qos-reserve', 'net-throttling',
  'tcp-retransmit', 'tcp-ctcp', 'nic-interrupt-mod', 'nic-flow-control', 'nic-offloads', 'disable-netbios', 'disable-wpad', 'cloud-sync-off', 'boot-sound-off',
  'telemetry-zero', 'do-solo-mode', 'win-tips', 'compat-scanner-off', 'compat-tasks-off', 'diag-tasks-off', 'search-box-local', 'search-cloud-off',
  'fivem-network', 'fivem-hang-fix', 'fivem-streaming-mem', 'fivem-commandline', 'fivem-fso', 'fivem-mmcss', 'cpu-parking', 'intel-power-plan-legacy',
])

/** Every tweak id Auto-Optimize may run. */
function allowedTweaks() {
  const s = new Set(Object.values(POWER_DESKTOP_TWEAK))
  for (const e of Object.values(CATALOG)) for (const st of e.steps) if (st.type === 'tweak') s.add(st.id)
  for (const id of NEVER_AUTO) s.delete(id)
  return s
}
function allowedControls() {
  const s = new Set()
  for (const e of Object.values(CATALOG)) for (const st of e.steps) if (st.type === 'control') s.add(st.id)
  return s
}

const IMPACT_RANK = { high: 3, medium: 2, low: 1 }

module.exports = { MODULES, USE_CASES, CATALOG, POWER_DESKTOP_TWEAK, SHIELD_DENY, NEVER_AUTO, IMPACT_RANK, allowedTweaks, allowedControls }
