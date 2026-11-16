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

Measured before/after numbers are in `docs/perf/` once `tools/perf/bench.ps1` has been run (spawn counts per minute by program, app CPU, memory, WmiPrvSE CPU). Nothing here claims an FPS or latency change. These rows are read from the code, not measured yet.

## Measure
`powershell -File tools/perf/bench.ps1 -Out docs/perf/<name>.json` runs a dev (not elevated) copy with a fresh profile through: start, visible idle, hidden idle after the page unloads (and `-Tray`: started hidden). It needs `--perf-log`, which now also records spawns by program, main-process CPU, whether LibreHardwareMonitor is alive and start-up milestones.
`powershell -File tools/perf/tray-footprint.ps1 -Seconds 120 -RootPid <pid>`; `--perf-log` also records `tray: {hidden, unloaded, telemetry, sensor}`.

## Open
Elevated run (PresentMon, sensors); game starting from the tray; in-flight guard with a long action; Electron's GPU process stays alive after unload (working set trimmed to ~7 MB).
