# FiveM "Uplink": evidence

`lib/fivem/` only reads, says and changes what this file justifies. Anything not confirmed here is not shipped; the feature
degrades instead of guessing. Grades: **documented** (official docs.fivem.net), **community** (several independent guides,
no official source), **measured** (we measure it on the user's PC at run time).

## CitizenFX.ini (`%LOCALAPPDATA%\FiveM\FiveM.app\CitizenFX.ini`)

Source: <https://docs.fivem.net/docs/client-manual/citizenfx/> (documented). One section, `[Game]`, and these keys only:

| Key | Values | Editable in the tab |
|---|---|---|
| `IVPath` | path to the GTA V folder | read-only here (FiveM asks for it itself) |
| `SavedBuildNumber` | integer game build | yes, integer |
| `UpdateChannel` | `production`, `beta`, `canary` | yes |
| `DisableNVSP` | `0` / `1` (blocks the GeForce Experience overlay) | yes |
| `EnableFullMemoryDump` | `0` / `1` (1 to 10 GB dumps) | yes, with a size warning |
| `DisableOSVersionCheck` | `0` / `1` | yes |
| `DisableCrashUpload` | `0` / `1` | yes |

Keys found in the file that are not in this table are shown read-only and never rewritten.

**Retired from the old tab, no source says FiveM reads them:** `StreamingMemory`, `WorkerThreads`, `MaximumGrass`,
`MaxLodDistance`, `MaxObjectLodDistance`, `DisableCrashReporter`, `DisableSteamAchievements`, `AdaptivePerformanceMode`,
`EndpointPrivacy`, `BoostGamePriority`, `TelemetryUpload`, `ScriptHookAllowed`. The old tab wrote some of them and "restored"
invented defaults. `UpdateChannel=canary` is no longer recommended.

## Server endpoints

- `GET /info.json` on the connect endpoint is what the client itself fetches (documented, server proxy page).
- `dynamic.json` and `players.json` exist on every server (documented as URLs that should load in a browser; fields are
  **community**: `hostname`, `clients`, `sv_maxclients`, `gametype`, `mapname`). Fields are read defensively; a missing field
  is "not reported", never zero.
- Default game port is 30120, TCP and UDP (documented).
- A UDP latency query to the game port is **not confirmed** in any source we found, so there is no UDP column. TCP connect
  to the HTTP endpoint and ICMP to the host are both **measured** and are labelled as exactly that.

## Join codes

`cfx.re/join/<code>` resolves through `https://servers-frontend.fivem.net/api/servers/single/<code>` (already used by the app;
**community**, undocumented API). The tab says "could not resolve" on any failure and never invents an address. Direct
`host:port` and `http(s)://host:port` always work.

## In-game tools the tab points to

Documented console commands (<https://docs.fivem.net/docs/client-manual/console-commands/>): `cl_drawperf` (FPS, ping,
packet loss, CPU, GPU), `netgraph` and `net_statsFile` (developer mode), `resmon`, `strdbg`. The tab may tell the user to
type them; it does not toggle them.

## Cache (`%LOCALAPPDATA%\FiveM\FiveM.app\data`)

**Community** (hosting guides agree; no official page). Safe to clear with FiveM closed: `cache\browser`, `cache\subprocess`,
`server-cache-priv`, `nui-storage`, and the contents of `server-cache` except its `game` folder. **Never cleared:**
`cache\game` and `server-cache\game` (multi-GB GTA assets; clearing forces a 4 to 8 GB re-download). The first launch after a
clear is slower. No FPS gain is claimed. Clearing is done through Cleanup's target list, not here.

## Graphics (`%APPDATA%\CitizenFX\gta5_settings.xml`)

No official documentation (community only). The tab edits only keys that already exist in the user's file, writes through a
temp file, verifies, and journals the original bytes. Value ranges come from the file's own current values and the in-game
menu, never from invented tables. Keys the old defs listed but the file does not contain are not created.

## Client tweaks

| Id | Verdict | Why |
|---|---|---|
| `fivem-priority` | kept (community) | IFEO `PerfOptions\CpuPriorityClass` is a documented Windows mechanism; FiveM benefit is community-reported. Restore deletes the value. |
| `fivem-io-priority` | kept (community) | IFEO `IoPriority`. Restore deletes the value. |
| `fivem-fso` | kept (documented) | AppCompat flag `DISABLEDXMAXIMIZEDWINDOWEDMODE`; restore removes it. |
| `fivem-gamebar` | kept (documented) | Game DVR off for this user. Original values journaled. |
| `fivem-defender` | kept, opt-in | Defender exclusion for the FiveM folder. Security trade-off stated; failure is reported, not hidden. |
| `fivem-hang-fix` | retired | Global hung-app timeouts, not FiveM-specific, no evidence. |
| `fivem-network`, `-mmcss`, `-vm`, `-gpu` | retired (already) | See `docs/TWEAK_EVIDENCE.md`. |
| `fivem-auto-opti`, `-disable-update-checks` | retired | Never did anything. |
| `fivem-commandline` | retired | Overwrote the user's `commandline.txt`; arguments unverified. |
| `-streaming-mem`, `-worker-threads`, `-preload-ipl`, `-reduce-draw-distance`, `-disable-crash-reporter`, `-disable-anticheat-upload` | retired | Keys not read by FiveM (see above). |
| `fivem-power-plan`, `fivem-mouse-accel` | moved | Not FiveM-specific; other tabs own them. |

Changes made by the old tab stay restorable (Client view, "Made by the old tab").

## Route and verdict rules (measured)

- Hops come from TTL-limited ICMP echo. Many routers rate-limit or ignore TTL-expired replies. **Loss counts only if it
  persists at every later hop and at the endpoint**; loss at one middle hop that clears further on is ICMP rate limiting and
  is never reported as packet loss.
- A hop's segment is classified by address: private (RFC 1918) hops before the first public address are "your network";
  CGNAT `100.64/10` and the first two public hops are "your ISP"; the rest "transit"; the final hop "server".
- A hop that never answers is shown as hidden, not as a fault.
- The verdict is a fixed list in `lib/fivem/route-verdict.js`; each carries the numbers it was derived from.

## Hitch attribution (measured)

A hitch is a one-second bin whose worst frame is far above the session median. The cause is named only when recorded
telemetry within two seconds supports it (GPU or CPU near saturation, VRAM full, RAM pressure, clock or thermal drop);
otherwise it is "unknown". Network events are listed beside frame hitches and never blamed for them.
