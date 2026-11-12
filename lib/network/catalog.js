'use strict'
// The only list of what the Network tab may show or change. Every id is a TWEAKS id in main.js (test/network-engine.test.js checks that).
//   lane   which group of the page it sits in (LANES below)
//   probe  how its live state is read, one check per value it writes. No probe = state cannot be read honestly ('unknown').
//   preset a DNS preset: its state is the resolver the adapters really use (model.js), never a remembered setting
//   once   a one-shot repair, not a switch: it has no state, only "last run"
//   reboot the change only takes effect after a restart
// Probe kinds:  r = registry value {r:path, n:name, eq}   s = service start type {s, eq}
//               x = value computed by the read-only script (detect.js): {x:'eee'|'intmod'|'offload'|'rss'|'netbios'|'doh', eq}
//               'NA' from the script means the driver or Windows does not expose it on this PC: the state is 'na', never "off".
// Nothing here is recommended by itself: "recommended" comes only from lib/tweak-applicability.js (evidence per PC), see docs/NETWORK_EVIDENCE.md.
const LANES = [
  { id: 'resolver' },
  { id: 'adapter' },
  { id: 'protocol' },
  { id: 'repair' },
  { id: 'retired' },
]

const IPV6 = 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip6\\Parameters'
const INET = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'
const reg = (r, n, eq) => ({ r, n, eq })
const x = (k, eq) => ({ x: k, eq })

// Public resolvers a preset stands for. Primary first. The same addresses the dns-* tweaks in main.js set.
const PRESETS = [
  { id: 'cloudflare', tweak: 'dns-cloudflare', servers: ['1.1.1.1', '1.0.0.1'], bench: '1.1.1.1' },
  { id: 'google', tweak: 'dns-google', servers: ['8.8.8.8', '8.8.4.4'], bench: '8.8.8.8' },
  { id: 'quad9', tweak: 'dns-quad9', servers: ['9.9.9.9', '149.112.112.112'], bench: '9.9.9.9' },
  { id: 'adguard', tweak: 'dns-adguard', servers: ['94.140.14.14', '94.140.15.15'], bench: '94.140.14.14' },
]

const ITEMS = [
  // ── Resolver: the presets are one choice, drawn as one card
  ...PRESETS.map(p => ({ id: p.tweak, lane: 'resolver', icon: 'globe', preset: p.id })),
  { id: 'dns-custom', lane: 'resolver', icon: 'globe', preset: 'custom' },
  { id: 'dns-doh', lane: 'resolver', icon: 'lock', probe: [x('doh', 'on')] },
  // ── Adapter
  { id: 'nic-interrupt-mod', lane: 'adapter', icon: 'bolt', probe: [x('intmod', 'off')] },
  { id: 'nic-energy-efficient', lane: 'adapter', icon: 'leaf', probe: [x('eee', 'off')] },
  { id: 'nic-offloads', lane: 'adapter', icon: 'microchip', probe: [x('offload', 'off')] },
  { id: 'nic-rss-affinity', lane: 'adapter', icon: 'layer-group', probe: [x('rss', 'tuned')] },
  { id: 'wifi-gaming-tune', lane: 'adapter', icon: 'wifi' },
  // ── Protocol
  { id: 'disable-netbios', lane: 'protocol', icon: 'network-wired', probe: [x('netbios', 'off')] },
  { id: 'disable-wpad', lane: 'protocol', icon: 'ban', probe: [{ s: 'WinHttpAutoProxySvc', eq: 'Disabled' }] },
  { id: 'disable-autoproxy', lane: 'protocol', icon: 'ban', probe: [reg(INET, 'AutoDetect', 0)] },
  { id: 'disable-ipv6', lane: 'protocol', icon: 'arrows-left-right', reboot: true, probe: [reg(IPV6, 'DisabledComponents', 32)] },
  // ── Repair (one-shot)
  { id: 'flush-dns', lane: 'repair', icon: 'broom', once: true },
  { id: 'winsock-reset', lane: 'repair', icon: 'rotate', once: true, reboot: true },
  // ── Retired: no longer offered (main.js RETIRED_TWEAKS). Listed only so an earlier apply can still be seen and restored.
  ...['tcp-stack', 'qos-reserve', 'tcp-keepalive', 'tcp-retransmit', 'tcp-ctcp', 'tcp-task-offload', 'tcp-timedwait', 'net-max-ports',
    'net-throttling', 'tcp-buffers', 'net-del-ack', 'nic-flow-control', 'nic-ndis-poll'].map(id => ({ id, lane: 'retired', icon: 'box-archive' })),
]

const byId = Object.fromEntries(ITEMS.map(i => [i.id, i]))
const ids = () => ITEMS.map(i => i.id)
const lanes = () => LANES.slice()
const isKnown = id => !!byId[id]
const presetOf = id => (byId[id] && byId[id].preset) || null

const exported = { LANES, ITEMS, PRESETS, byId, ids, lanes, isKnown, presetOf }
if (typeof module !== 'undefined' && module.exports) module.exports = exported
if (typeof window !== 'undefined') window.JylliNetworkCatalog = exported
