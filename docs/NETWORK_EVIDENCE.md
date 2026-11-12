# Network evidence

`lib/network/catalog.js` is the only list of what the Network tab shows or changes. Why a tweak is offered at all lives in [[TWEAK_EVIDENCE]]; the route rules (loss, jitter, hidden hops) live in [[FIVEM_EVIDENCE]] and are reused unchanged. This file says how the tab **knows the state of each switch**, what the **checkup** measures, and every **threshold** it may say something about. Rule of this vault: unverified means not shipped.

## Where a verdict comes from
One stage, five nodes, one verdict. Nothing on it is invented: a node with no measurement is drawn dashed and empty.
| Node | Measured by | Tone rule |
|---|---|---|
| This PC | adapter of the default route (`Get-NetRoute` + `Get-NetAdapter`) | never red; shows the adapter name |
| Link | `Get-NetAdapter` link speed; `netsh wlan show interfaces` for Wi-Fi (signal %, channel, band, radio) | Wi-Fi: warn at <= -67 dBm or on 2.4 GHz, bad at <= -75 dBm. Cable: warn at <= 100 Mbps |
| Router | first hop of the route trace (TTL 1) | from the route verdict only |
| ISP | last answering hop of the ISP segment, plus private hops after hop 1 (carrier-grade NAT, the ISP's modem or core) | from the route verdict only |
| Internet | the destination when it answers ICMP, else the TCP connect time to it, else the last transit hop | from the route verdict only |

Wi-Fi signal: Windows reports a percentage; `dBm = pct / 2 - 100` is the usual mapping (100 % = -50 dBm). The -67 dBm line is the common guidance for real-time use (voice, games); below -75 dBm the link is marginal. `netsh` labels are localized, so each line is told apart by its **value** (`90%`, `802.11ax`, `5 GHz`, a channel number), never by its label.

## Route trace (lib/fivem/route.js + route-verdict.js)
A long-lived PowerShell child sends TTL-limited ICMP echoes once a second. The verdict rules are the ones documented in [[FIVEM_EVIDENCE]]: loss counts only when it persists at every later hop and at the endpoint, so a router that rate-limits its own ICMP replies is never reported as packet loss; a hop that never answers is "hidden", not a fault. The checkup takes 12 rounds to 1.1.1.1; the Measure view's live trace runs until stopped. Both use their own poller, and both are killed when the tab is left or the app quits. Target is an IPv4 literal or a name that Node resolves; the script never receives text from the page.

## Findings: the only things the tab may say (lib/network/findings.js)
A finding exists only when its evidence is in the input.
| Finding | Evidence | Threshold |
|---|---|---|
| `drifted` | Jylli applied it, Windows reads the default again | live probe vs remembered state |
| `path-*` | route verdict id | route-verdict constants (loss >= 2 %, home jitter >= 8 ms, endpoint jitter >= 15 ms, spikes p95 >= max(2.5 x avg, avg + 60 ms), far >= 150 ms) |
| `wifi-path` | route verdict `jitter-home` / `loss-home` on a Wi-Fi adapter | same as above |
| `wifi-weak` | Wi-Fi RSSI | <= -67 dBm warn, <= -75 dBm bad |
| `wifi-band` | Wi-Fi band | 2.4 GHz (info) |
| `link-slow` | cable link speed | <= 100 Mbps |
| `dns-slow` | TCP connect to port 53 of the resolver in use vs four public resolvers | best public resolver is >= 15 ms and >= 1.5 x faster |
| `dns-down` | the resolver in use does not answer, a public one does | n/a |
| `bufferbloat` | last speed test, loaded minus idle latency | >= 100 ms warn, >= 300 ms bad, test no older than 7 days (bufferbloat.net convention) |
| `tune` | `lib/tweak-applicability.js` says "recommended" for this PC | see [[TWEAK_EVIDENCE]] |
| `restart` | applied since the last boot, needs a restart | n/a |

The DNS comparison is **TCP connect time to port 53**, i.e. how far away the resolver is. It does not measure how fast a resolver answers a cold lookup, and the text says "away", never "answers in". Bufferbloat is advice only: the fix is on the router (Smart Queue / SQM), which Jylli cannot change.

## Status of a switch (lib/network/model.js, status words as [[WINDOWS_EVIDENCE]])
`on` / `native` / `partial` / `off` / `drifted` / `restart` / `unknown` come from `lib/windows/model.js statusOf` (shared, not copied). Extra rules here:
- **`na` means "not offered"**: a probe that answers `NA` (the driver does not expose the property, no wired adapter, no NetBIOS interface, `Get-DnsClientDohServerAddress` missing) puts the switch in `unavailable`, shown as one line under the list. It is never shown as "off".
- **`once`**: Flush DNS and Winsock reset are repairs, not switches. They have no state, only "last run" from the journal.
- **Nothing is recommended by the catalog.** "Recommended" comes only from applicability: interrupt moderation off and EEE off when the adapter reports them on, Wi-Fi tuning when the driver exposes roaming, power-save or band properties. Offloads, RSS affinity, NetBIOS, WPAD, auto-proxy and IPv6 preference are optional and never recommended (weak or mixed evidence).

## What is measured (lib/network/detect.js, one read-only PowerShell call)
| Switch | Read | "Set" means |
|---|---|---|
| `nic-energy-efficient` | `Get-NetAdapterAdvancedProperty` named Energy Efficient Ethernet / EEE / Green Ethernet / Energy-Efficient Ethernet / Ultra Low Power Mode, every wired adapter that is up | every one is Disabled or Off |
| `nic-interrupt-mod` | Interrupt Moderation / InterruptModeration / Interrupt Moderation Rate | every one is Disabled or Off |
| `nic-offloads` | `Get-NetAdapterChecksumOffload`, `Get-NetAdapterLso`, `Get-NetAdapterRsc` | IPv4 checksum, LSO and RSC all disabled |
| `nic-rss-affinity` | `Get-NetAdapterRss` BaseProcessorNumber on adapters with RSS enabled | every one starts at core 2 or later |
| `disable-netbios` | `NetBT\Parameters\Interfaces\*\NetbiosOptions` | every interface = 2 |
| `disable-wpad` | start type of `WinHttpAutoProxySvc` | Disabled |
| `disable-autoproxy` | `HKCU\...\Internet Settings\AutoDetect` | 0 |
| `disable-ipv6` | `Tcpip6\Parameters\DisabledComponents` | 32 (prefer IPv4; IPv6 stays on). Needs a restart |
| `dns-doh` | `Get-DnsClientDohServerAddress -ServerAddress 1.1.1.1` AutoUpgrade | True **and** Cloudflare is the resolver in use |
| `wifi-gaming-tune` | not read (driver property names differ per vendor) | `unknown`: shows what Jylli remembers |

"Wired adapter" is the same filter the `nic-*` tweaks use (Up, not wireless, not virtual, not loopback), so the probe reads exactly what the tweak writes. Windows ships a **built-in list** of DoH servers (Cloudflare, Google, Quad9) with AutoUpgrade False, so "listed" proves nothing; only AutoUpgrade plus the resolver in use counts.

## Resolver (lib/network/model.js `resolverOf`)
The preset is read from the addresses the primary adapter really uses (`Get-DnsClientServerAddress`) and whether they are static (`Tcpip\Parameters\Interfaces\{guid}\NameServer`), **not** from what Jylli remembers. DHCP that hands out 8.8.8.8 is still "Automatic". Other adapters that are up with a different resolver (VPN, virtual switch) are named, because the `dns-*` tweaks change every adapter that is up. Custom servers: IPv4 only, primary required, no loopback / 0.0.0.0 / broadcast, never the same twice; they are validated in the page and again in the service, saved to `settings.customDnsPrimary/Secondary`, and only then applied.

## Verification after a change (lib/network/index.js `run`)
Same as the Windows tab: `journalSvc().applyBatch` (via `manual`, label `network`, restore point rule of the journal), then one more read. A resolver choice is verified against the addresses the adapter uses afterwards (`auto` = DHCP again). A change that Windows does not show is a **mismatch**, not a success.

## Retired
`tcp-stack`, `qos-reserve`, `tcp-keepalive`, `tcp-retransmit`, `tcp-ctcp`, `tcp-task-offload`, `tcp-timedwait`, `net-max-ports`, `net-throttling`, `tcp-buffers`, `net-del-ack`, `nic-flow-control`, `nic-ndis-poll`: no credible measurement on current Windows ([[TWEAK_EVIDENCE]]). They show only when applied earlier, and can only be restored. The old "Apply safe defaults" button is gone: eight of its eleven switches were retired, so it did almost nothing.

## Not shipped
- A DNS resolution-time benchmark (cold lookups through each resolver): needs a DNS client, not a TCP connect.
- Bufferbloat or QoS changes on the router: Jylli cannot reach it. The tab says what to switch on.
- A per-adapter view: the stage describes the adapter that owns the default route; DNS is changed on every adapter that is up, as the tweaks always did.
- Probes for Wi-Fi driver properties: names differ per vendor, so the state of `wifi-gaming-tune` stays `unknown`.
- `disable-delivery-opt` lives on the Windows tab; the Network tab does not own it.
