# Tray footprint

Goal: Jylli Tool hidden in the tray is close to idle. Pulse and Game Watcher keep working and must never slow a game.

## What runs where
- Hidden window: page timers stop, `get-metrics` returns the last value without restarting polling, nothing is sent to the page.
- After 60 s hidden (`lib/tray.js` `UNLOAD_AFTER_MS`) the page is destroyed unless a main-window IPC call is in flight (`_trayBusy`), or `window.JylliTray.canUnload()` says no (tour, arrival, Auto-Optimize). Retry every 30 s.
- Tray click / menu / second instance rebuilds it with `?resume=<page>`: no boot scan or splash, `get-system-info {resume:true}` returns the cache, `ui-ready` replays the log buffer and the Pulse/watcher state.
- Sensors (telemetry poller, nvidia-smi, JylliSensor) run only while `lib/tray.js` `needs()` is non-empty: window wanted, recording session (or a game just detected), HUD window open, GPU power-limit sentinel, ARIA. `bgNeedsUpdate()` runs on every change and every 5 s.
- Context detector: in the tray one shared `tasklist` (`processSnapshot`), 10 s, no paths, no RAM/CPU queries.
- ONNX advisor loads on first Home request and is released on unload. History sampler uses Node (`os.cpus`, `os.freemem`).
- Pulse session: frames go into `lib/pm-frames.js` (ring, O(1)); busiest process comes from `lib/os-poller.ps1` while `pulse-bg.flag` exists. Helper processes run BelowNormal.

## Measured (dev build, not elevated, Warzone running, Auto-Pulse active)
| State | Resident total |
|---|---|
| Visible, just booted | ~1.5 GB (boot scan still running) |
| Hidden, page loaded (15 s) | ~989 MB |
| Hidden, page unloaded | ~311 MB (255 MB of it the poller, nvidia-smi and JylliSensor, awake because a game was running) |

Without a game the poller and sensors sleep as well: expect roughly the main process (~25 MB) plus trimmed GPU/utility processes. Not yet measured elevated or without a game.

## Audit 2026-11: what else was running for nothing (read from the code)

| What | Before | Now |
|---|---|---|
| LibreHardwareMonitor | started at launch, never stopped until quit | runs while the window is wanted, a session records, or for a minute after a reader (Pulse thermal audit, BIOS sensors, temperatures) asked: `ensureLhm()`, `lib/tray.js` `lhmWanted` |
| Thermal Throttle Detective | PowerShell WMI query every 2 s, also hidden and while the previous one ran | skipped with no viewer (window hidden or gone, no Pulse Cockpit) and never overlapping |
| ARIA | kept the poller, nvidia-smi and JylliSensor awake in the tray for ever | wakes them only while a game session runs (its alerts reach no window otherwise) |
| Context detector, window visible | 3 PowerShell processes every 10 s (process paths, RAM, CPU) | shared `tasklist` for names, Node counters for RAM and CPU (hub value when fresh), the one PowerShell with process paths (unknown-game offer) at most once a minute and never twice at once |
| `lib/os-poller.ps1` | `Get-CimInstance Win32_OperatingSystem` every second (cost lands in WmiPrvSE.exe) | `GlobalMemoryStatusEx` + `TickCount64`; the WMI read stays as the fallback if the helper cannot compile |
| Route traces (FiveM / Network tab) | PowerShell ping loop + timer, only the page could stop them | stopped when the page is unloaded |
| Game Shield mid-session tick | re-ran a PowerShell for the same missing programs every 20 s while RAM stayed high | a program found not running is skipped for 2 minutes |
| Start with Windows | always opened the window and ran the boot scan | optional `--tray`: no window and no page until the tray icon is used (Settings › Start hidden in the tray) |

Not changed on purpose: the Power tab energy session (a measurement you started) keeps its poller until you stop it. The Game Watcher's 5 s `tasklist` is the one recurring process the app needs to notice a game.

Measured 2026-11-16 with `tools/perf/bench.ps1` (dev build, not elevated, fresh profile, no game, 16 cores), raw JSON in `docs/perf/after-settle150.json` (150 s settle) and `docs/perf/after.json` (45 s settle). There is no "before" run, so these are absolute idle costs, not an improvement claim.

| Scenario (90 s window) | Spawns/min | App CPU | Memory | Main process |
|---|---|---|---|---|
| Window visible | 6 (`tasklist` only) | 0.18% | 390 MB | 7.9 ms/s |
| Minimised to tray (page unloaded) | 6 (`tasklist` only) | 0.03% | 27 MB | 4.9 ms/s |
| `--tray` start | 6 (`tasklist` only) | 0.03% | 220 MB | 4.7 ms/s |

- Sampled 45 s after launch, visible and `--tray` show 18 spawns/min (12 of them `powershell`): boot scans still running. By 150 s they are gone, so a `--tray` start is only that noisy for its first minutes.
- `--tray` start holds 220 MB against 27 MB for a window minimised after use. Not yet explained; the page is reported as unloaded in both.
- WmiPrvSE CPU read 0 s in every phase including the control, so this PC shows no WMI load either way and the benchmark cannot prove the WMI saving. The new `os-poller.ps1` RAM and uptime values match WMI (7.71 vs 7.55 GB, same uptime).
- The "window visible" row was taken on a fresh profile, so the window sat on the Discord link screen, not on Home: a floor, not the cost of the real Home page.
- Real game session (2026-11-16, FiveM joined on a server, Premium, Game Watcher + Auto-Pulse on, Update Guard and Game Shield off because they need admin): the watcher saw `fivem_b3889_gtaprocess.exe` as the FiveM preset, started a session within about 8 s and applied Auto-Pulse (game process went Normal -> AboveNormal). About 10 s after the game closed the session ended with Auto-Pulse `restored`. During play the app spawned 12 `tasklist` (the 5 s watcher poll) and 7 `powershell` per minute, 0.49% app CPU, 394 MB. The 7 `powershell` per minute during play are not yet attributed to a feature.
- Second real session, elevated, plan Balanced, all four features on (2026-11-16): Auto-Pulse switched Balanced -> High performance (read back) and the plan was Balanced again after the game closed. Update Guard held `wuauserv` (Stopped, start type 4 Disabled during play) and released it (start type back to 3 Manual, `lastEnd: restored`), but the service was **Running** afterwards although it was Stopped before. Cause (found with a 4 s state trace): the guard's own pending-updates search (Windows Update COM) starts `wuauserv`, and the hold then recorded "was running". Fixed: `ugStart` reads the state before that search and passes it to `hold({ wasRunning })`; test in `test/updateguard.test.js`. Re-run on the real PC: `wuauserv` ended Stopped, Manual with no manual reset. Game Shield: with nothing to stop (Discord and Spotify are tier 3, RAM far below the 70% threshold) it only went active and idle; with a stand-in `skype.exe` (tier 1) running it stopped it at launch (`killed: 1, freedMB: 12`) and started it again at the end (running afterwards). The session record: 33,999 frames, 282 avg FPS, 171 1% low, 80 0.1% low, 1 hitch. That is a description of one session on a live server; the first minute was capped at 200 FPS, so the app's own before/after window is not a fair comparison. No FPS or latency improvement is claimed.
- Still unverified: Game Shield with real tier 3 programs and the mid-session browser stop (needs RAM above the thresholds), any FPS or latency effect.

## Measure
`powershell -File tools/perf/bench.ps1 -Out docs/perf/<name>.json` runs a dev (not elevated) copy with a fresh profile through: start, visible idle, hidden idle after the page unloads (and `-Tray`: started hidden). It needs `--perf-log`, which now also records spawns by program, main-process CPU, whether LibreHardwareMonitor is alive and start-up milestones.
`powershell -File tools/perf/tray-footprint.ps1 -Seconds 120 -RootPid <pid>`; `--perf-log` also records `tray: {hidden, unloaded, telemetry, sensor}`.

## Open
Elevated run (PresentMon, sensors); game starting from the tray; in-flight guard with a long action; Electron's GPU process stays alive after unload (working set trimmed to ~7 MB).
