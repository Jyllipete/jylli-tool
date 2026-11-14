# Apps tab "Backstage": what is in, what is out, and why

Engine `lib/apps/` (`catalog.js` = the only list of persistent changes, `rules.js` = the only place that decides Game time, `findings.js` = the only list of what the tab may say). Rule of this vault: **unverified = not shipped**.

## Persistent changes that ship

| Row | What it writes | Evidence |
|---|---|---|
| `edge-startup-boost` | `HKLM\SOFTWARE\Policies\Microsoft\Edge\StartupBoostEnabled = 0` | Microsoft Edge policy documentation: disabling it stops Edge processes launching at sign-in and restarting in the background after the last window closes. |
| `edge-background` | `...\Edge\BackgroundModeEnabled = 0` | Microsoft Edge policy documentation (same page family). |
| `chrome-background`, `brave-background` | `...\Google\Chrome` / `...\BraveSoftware\Brave` `BackgroundModeEnabled = 0` | Chromium policy `BackgroundModeEnabled`, kept from the old tab (unchanged values, so an old Jylli apply reads as "on" without a migration). |
| `firefox-lean` | One marked block in each profile's `user.js` (`browser.sessionstore.interval` 60000, `browser.sessionhistory.max_total_viewers` 4) | Documented Firefox prefs. Our lines sit between two marker comments; the user's own lines are never touched and restore removes only the block. The old version overwrote the whole file and deleted every `user.js` on restore. |
| `discord-hwaccel` | Only `enableHardwareAcceleration` in `%APPDATA%\discord\settings.json`; the previous value is stored and put back | Discord's own setting. Not recommended by default: it moves drawing to the CPU. The old bundle also set `SKIP_HOST_UPDATE` (blocks Discord's updates) and the legacy audio subsystem; both are retired. |
| `nvidia-telemetry` | `NvTelemetryContainer` start type -> Disabled (original start type stored and restored) | Only shown when the service exists. Current drivers no longer ship it (it showed "drifted" forever on those PCs). Never recommended. |
| `obs-priority` | IFEO `CpuPriorityClass` = AboveNormal through the CPU & Memory writer | OBS's own guidance is a modest raise; the old tab used High. A different value on the exe (`other`) is never overwritten. |

Every write is read back; a value that does not read back is reported `not-verified` and is not remembered as applied. A value somebody else set (`elsewhere`) is never overwritten, and a value Jylli did not set is never removed (`not-ours`).

## Not shipped

| Candidate | Why not |
|---|---|
| Chrome `HighEfficiencyModeEnabled` (Memory Saver) | Policy name and values could not be confirmed on an official Google page in this audit (2026-11-14). Add it only with a source. |
| Per-app "Resource Budget" (5 / 10 / 25 % CPU) | Was stored in `ao-cpu-caps.json` and **never enforced**. Removed. |
| "Idle suppression" | Ran `powercfg /requestsoverride` on Jylli's own exe, which does nothing for games. Removed. |
| "Update intercept" | Duplicate of Update Guard (Pulse launch rules). Removed. |
| Permanent Idle priority for Discord, Spotify, VS Code | A voice call or music under load can crackle, and the change applied even when no game was running. Replaced by Game time, which is temporary and opt-in. |
| Launcher Idle priority (Steam, Epic, EA, Riot, Playnite) | A game started by a launcher inherits its priority (Microsoft CreateProcess docs). Game time never lowers a launcher's own process, only web helpers listed in `known.js` `lower`. |
| Steam `steam.cfg`, Epic `bRunAtStartup` | Blocks Steam updates / startup keys are unverified. The Startup tab owns startup. |
| Explorer tweaks | Same registry values as Windows > Quality of life (`explorer-perf`, `explorer-this-pc`). Not duplicated. |
| Conflict banner ("GPU queue conflict... microstutter") | Fixed English claims with no measurement. Replaced by findings that quote a measured number. |
| Health check by `execSync` | Blocked the main process, and reported "drifted" when a config file simply did not exist. Replaced by one async read-only probe; unreadable = `unread`. |

## Game time

- **Priority**: `PriorityClass = BelowNormal` on processes that are at `Normal` *now*. Checked per process by pid + program name + start time (a pid can be reused). Read back; `SET` lines carry the class Windows reports after the write.
- **Quiet** (Premium): additionally `SetProcessInformation(ProcessPowerThrottling)` (Windows API, `ControlMask = StateMask = 1`), read back with `GetProcessInformation`. Put back with `ControlMask = 0` (system-managed again).
- **Never touched** (`rules.js PROTECTED`): the game itself, anti-cheat (Vanguard, EasyAntiCheat, BattlEye, FACEIT, ESEA), audio (`audiodg`, Voicemeeter), shell and drivers, capture tools, Jylli.
- **Roles that only offer "off"**: capture, GPU tool, and any launcher with nothing safe to lower.
- **Put back** at game end, at app quit (best effort) and at the next start (`recover()`): each process only if its class is still what Jylli set. A priority the user changed meanwhile is left alone; a closed or replaced program counts as gone.
- Default state is **off**: the user turns it on once. Journal control `apps:gametime`, change kind `pulse-priority` (the existing undo handler).

## Measuring

- CPU and private working set: `Win32_PerfRawData_PerfProc_Process`, two samples 0.7 s apart (no elevation needed). Whole-CPU % = delta(PercentProcessorTime) / delta(Timestamp_Sys100NS) / cores.
- Video memory per program: `GPU Process Memory` > `Dedicated Usage` (same counter family `lib/gpu/live.js` uses). A PC without the counter shows "–", never 0.
- A cost sample takes about 2 s of PowerShell, so the tab polls every 10 s and only while it is visible and no game runs.
- Verified read-only on the development PC on 2026-11-14 (probe parses, real apps and costs found, one run about 2.3 s). No writes were made on a real PC.
