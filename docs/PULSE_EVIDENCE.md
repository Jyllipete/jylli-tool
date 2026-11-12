# Pulse evidence

`lib/pulse/` only reads, says and measures what this file justifies. A number that cannot be measured is shown as "not measured" (an en dash) and never counts as zero, as a pass or as a fail. Anything unconfirmed is not shipped.

Where a threshold is **ours**, it says so: it is a judgement tuned on recorded sessions, not a vendor figure. Where it is **measured**, the app reads it from the PC at run time.

## What is measured, and from where

| Value | Source | Notes |
|---|---|---|
| Frame time (every frame) | PresentMon, `MsBetweenPresents`, game process only (`spawnPresentMon` with the game PID, tapped in `main.js`) | The only per-frame source. No PresentMon, no frames, and the Limiter says "waiting for frames". |
| CPU load, RAM, network | Telemetry hub, source `os` (`lib/os-poller.ps1`) | 1 Hz. |
| CPU temperature, CPU power | Telemetry hub, source `sensor` (JylliSensor / LibreHardwareMonitor) | Missing without the sensor service; shown as not measured. |
| GPU load, temperature, hotspot, power, clocks, VRAM | Telemetry hub, source `nvidia` (`nvidia-smi`) | NVIDIA only today. |
| Heaviest background process | `Win32_PerfFormattedData_PerfProc_Process`, one query every 5 s while a session records or a Pulse window is open (`puBgOnce`) | Share of the whole CPU; the game's own process is excluded. Fed into the hub as `bg.cpu`. |
| Windows Update activity, pending restart, power plan | One PowerShell probe on demand (`puProbe`) | `TiWorker` / `MoUsoCoreWorker` running; the two documented RebootPending / RebootRequired registry keys; `powercfg /getactivescheme` matched against the High performance and Ultimate Performance GUIDs. |

Every vitals tile shows the source it came from and greys out when the value is older than 5 s.

## Frame statistics (`frames.js`)

Definitions match `lib/frame-stats.js`, so the tab, the Cockpit, the FPS HUD and Replay agree.

- Average FPS = 1000 / mean frame time. 1% low = 1000 / mean of the slowest 1% of frames. 0.1% low likewise. These are the app's long-standing definitions, not the "99th percentile" some tools use; the 99th percentile frame time is shown separately.
- The live window is the last 4 s of rendered time. Frame time is the clock, so a paused game adds nothing. If no frame arrived for 2.5 s the game is "not rendering" and every FPS number reads not measured.
- Fewer than 10 usable frames (0 < ms < 1000) gives no statistics.
- **Pacing score, 0 to 100 (ours).** Half from jitter (median absolute deviation over the median frame time, 0 at 0.2 or more) and half from the slow tail (p99 over the median, 0 at 3.0 or more, no penalty up to 1.2). It exists because two sessions with the same average can feel very different.

## Hitches and their causes (`attribution.js`, shared with FiveM)

- A **hitch** is a frame, or a run of adjacent seconds, whose slowest frame is at least `max(60 ms, 4 x the typical frame time)` (ours). One function, `hitchLimit`, serves the live river, the debrief and FiveM.
- A cause is named only when telemetry recorded within 2 s supports it; otherwise the hitch is `unknown`. Network events are listed separately and are never blamed for frame hitches. Causes, in priority order, with ours thresholds:

| Cause | Rule |
|---|---|
| `thermal` | CPU package at least 95 C, or GPU core at least 87 C |
| `vram-full` | VRAM used / total at least 95% |
| `ram-pressure` | RAM load at least 92% |
| `background-spike` | a non-game process using at least 35% of the CPU |
| `gpu-bound` | GPU load at least 97% |
| `cpu-bound` | CPU load at least 90% |
| `clock-drop` | GPU clock at most 85% of the session median (debrief only; the live view has no baseline) |

- The live river tags a hitch with the nearest 4 Hz sample of the vitals, and only when that sample is within 2 s of the hitch (`sampleCauses`). Otherwise it says unknown.

## The Limiter (`limiter.js`)

One verdict from the last few seconds, checked in this order. The first that applies wins.

1. thermal, VRAM full, RAM full, background app, GPU at 97% or more (`gpu`), CPU at 90% or more (`cpu`), GPU clock dropped (same thresholds as above).
2. **capped**: frames are steady (p99 under 1.25 x the median, jitter under 0.06) and the average sits within 2% of a common cap (30, 40, 45, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 175, 240, 360).
3. **balanced**: nothing is maxed out.

"GPU-bound" is shown as the healthy way to be limited, not as a fault. A missing sensor can never create a verdict; with no frames the verdict is `idle`.

## Pulse score, 0 to 1000 (`score.js`)

| Part | Weight | Formula (ours) |
|---|---|---|
| Smoothness | 0.35 | pacing score / 100 |
| Stability | 0.25 | (1% low / average - 0.4) / 0.45, clamped to 0..1 |
| Thermal headroom | 0.25 | (95 - hottest of CPU and GPU) / 25, clamped to 0..1 |
| Boost steps | 0.15 | steps done / steps in the boost; only while a boost ran |

A part that was not measured is left out and the rest renormalised (`js/score.js`), so it can neither raise nor lower the score. Smoothness or stability must be measured: a cool PC with a boost but no frames behind it has no score. The debrief shows each part with the number behind it. Colour: 800 and up good, 600 and up fair, below that poor.

## Boost steps (`steps.js`)

The receipt maps the lines `activatePulse` logs onto eight named steps: timer resolution 0.5 ms, CPU core parking, power plan, game scheduling (MMCSS), GPU and network interrupt routing, background apps, game priority, background priority. A step is done, skipped (the log says why: laptop, RAM size, core count) or failed. Every step is journaled by `activatePulse` and undone by `pulseRestoreAll`.

## Pre-flight (`preflight.js`)

| Check | ok | warn | bad | Fix offered |
|---|---|---|---|---|
| Temperature | under 75 C | 75 C or more | 90 C or more | none |
| Memory | under 70% | 70% or more | 85% or more | Game Shield |
| Background load | under 20% | 20% or more | 35% or more | Game Shield |
| Windows Update | not running | running | n/a | Update Guard |
| Power plan | High / Ultimate | anything else | n/a | the boost |
| Pending restart | none | waiting | n/a | none |

A fix is offered only where Pulse already has an action for it. Unreadable inputs are `unknown`, never ok.

## Session debrief (`session.js`)

Built when a recorded session ends: hitches and causes (`attribution.analyze`), the score, the boost steps, the PC before the boost (taken when the boost began) against the middle of the session, the change against the previous session of the same game, the player's marks, and a 120-point ribbon for the session list. The pacing score for a whole session uses the 1 s bins (steadiness of the per-second frame time and the share of seconds that hitched).

## Removed, and why

- **Per-game "FPS gain" estimates in the thermal audit.** They were a fixed 120 FPS baseline times a per-game constant, not a measurement.
- **The pre-arm "defer" button.** It deferred nothing; the handler only echoed its input.
- **ARIA "prediction" chips.** The main process never emitted that event.
- **The affinity and MMCSS checkboxes in the old window.** The main process ignored them.
- **The old window's P/E-core divider.** It guessed hybrid layout from the core count and was wrong on SMT CPUs.
- **`pulse-prearm-scan`, `pulse-baseline-*`, `pulse-get-history`.** No caller remained after the rebuild. `pulse-save-session` still writes `game-history.json`.
