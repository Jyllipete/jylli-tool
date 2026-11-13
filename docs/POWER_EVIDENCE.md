# Power tab "Current": evidence

What the Power tab may show or change, and why. The same rule as the other rebuilt tabs: unverified = not shipped, and a value nobody measured prints "–", never 0.
Code: `lib/power/` (engine), `js/power/` (page), `css/power.css`, LANG group `power2`. Tests: `test/power-*.test.js`. Preview: `npm run preview -- --power [--pw-state desktop|laptop|clutter|blocked|first|fail]`.

## Switches (`lib/power/catalog.js` is the only list)

| id | read back from | why it is here |
|---|---|---|
| intel-power-plan / amd-power-plan | the active plan is named "Intel Max Performance" / "AMD Max Performance" (CIM `Win32_PowerPlan`, or `powercfg /list` when not elevated) | Premium (it was on the Premium Power tab). Desktop only, vendor-specific (`lib/tweak-applicability.js`). The plan is built by `applyMaxPerfPlan` in main.js and removed by `restoreMaxPerfPlan`. |
| pcie-power | PCIe link state (ASPM) AC and DC value of the **active plan** = 0 (CIM `Win32_PowerSettingDataIndex`) | Premium. Documented power setting. Both AC and DC must be 0, so a plan with only AC off reads "partial". |
| trim-enable | `fsutil behavior query DisableDeleteNotify` = 0 | Free. Was only used by Auto-Optimize. Windows has TRIM on by default, so most PCs read "already set" and nothing is recommended. |
| fast-startup-off | `HKLM\...\Session Manager\Power\HiberbootEnabled` = 0 | Free. Was only used by Auto-Optimize. |
| 2 retired (nvme-latency, directstorage-nvme) | not probed | Retired in `RETIRED_TWEAKS`. Listed only when applied, so they can be put back. |

`speed-shift` (already in the CPU & Memory retired lane), `usb-suspend` (Windows tab), `power-throttling`, `cpu-parking`, `cstates` and `hibernate` stay with their owners. A test checks that no id is owned by two tabs.
Removed from the old tab: the Efficiency Tracker (its poller never stopped, and `powerW` meant GPU-only on NVIDIA but CPU + GPU elsewhere) and "Clean up old power plans" (deleted every custom plan, the user's own included, with no undo).

## Reads (one read-only script, `lib/power/detect.js`)

| fact | source | notes |
|---|---|---|
| plans, active plan | CIM `root\cimv2\power` `Win32_PowerPlan` (needs elevation) with a fallback to the structure of `powercfg /list` (GUID, name in parentheses, `*`) | locale-independent |
| what each plan sets | CIM `Win32_PowerSettingDataIndex`, AC and DC, for the settings in `plans.ANATOMY` | an unread value is `null` |
| power mode | `ActiveOverlayAcPowerScheme` / `…Dc…` under `HKLM\...\Control\Power\User\PowerSchemes` | shown only when it exists |
| battery | `Win32_Battery`, and `root\wmi` `BatteryStatus`, `BatteryFullChargedCapacity`, `BatteryStaticData` | health = full ÷ design capacity |
| TRIM, Fast Startup, hibernation, Modern Standby | `fsutil`, registry (`HiberbootEnabled`, `HibernateEnabled`, `CsEnabled`) | |
| what keeps the PC awake, last wake, wake devices, wake timers | `powercfg /requests`, `/lastwake`, `/devicequery wake_armed` (cross-checked with `wake_programmable`), `/waketimers` | Parsed by **structure** only (`lib/power/sleep.js`), because powercfg prints in the Windows language. Text that does not look like powercfg output (an error, no admin) is "unread", never "nothing found". |

## Live readings (`lib/power/live.js`), once a second, only while the tab is open and visible

| reading | source | when it is "–" |
|---|---|---|
| CPU clock as % of base | `Processor Information\% Processor Performance` | counter missing |
| CPU load | `Processor Information\% Processor Utility` (capped at 100) | counter missing |
| CPU package power | telemetry hub `cpu.power` (sensor bridge) | the sensor bridge is not running (said on the card) |
| GPU board power and load | `nvidia-smi -lms 1000` (`power.draw`, `utilization.gpu`), else hub `gpu0.power` | not an NVIDIA card and no sensor bridge |
| battery rate | `root\wmi` `BatteryStatus` charge / discharge rate | desktop, or the driver reports none |

The total on the stage is labelled "CPU + GPU" and only sums sources that were measured. It is never presented as wall power.
The poller stops without a heartbeat (45 s), while the tab is hidden (unless an energy session runs), and pauses while a game runs. An energy session started before a game keeps reading nvidia-smi and the sensor bridge (they cost nothing to run), not the PowerShell poller.

## Findings (`lib/power/findings.js` is the only list)

Static: `saver-on-desktop`, `efficiency-mode-on-ac` (laptop on AC with Windows on Best power efficiency), `aspm-on-desktop` (only when the switch is open **and** the plan really has ASPM on), `plan-clutter` (several non-built-in plans with the same name), `battery-worn` (WEAR_WARN 80 %, WEAR_BAD 60 %), `sleep-never-on-battery`, `sleep-blocked` (an active request in SYSTEM, AWAYMODE or EXECUTION), `wake-armed-many` (more than WAKE_MANY 2 wake-capable devices that are not a keyboard or mouse), `wake-timers`, `modern-standby` (info).
Live (from the last 60 frames, at least LIVE_MIN_FRAMES 30): `gpu-idle-draw-high` (GPU load under GPU_IDLE_LOAD 5 % and board power over GPU_IDLE_W 45 W in at least IDLE_SHARE 80 % of the idle frames), `battery-drain-high` (laptop, CPU utility under LAPTOP_IDLE_UTIL 15 %, discharge over BAT_IDLE_DRAIN_W 15 W in at least 80 % of the idle frames).

Left out on purpose: any "your CPU is too hot / fans too slow" claim (no sensor for it here), a static "ASPM is on" without the switch state, and a Windows-wide idle-power score (no honest ground truth).

## Changes the tab can make

| change | how | journal / undo |
|---|---|---|
| a switch | `journalSvc().applyBatch`, label `power`, then the probe is read again and the row is marked verified or mismatched | tweak entries, `restoreFromJournal` where the tweak has it |
| switch plan | `powercfg /setactive <guid>` (guid must be in the last scan) | native `powercfg-active` change, control `power2:plan` |
| screen-off / sleep timeout | `/setacvalueindex` or `/setdcvalueindex SCHEME_CURRENT …` for the active plan, values from a fixed list, then `/setactive`; read back from CIM | native `powercfg` changes, control `power2:timeout:<setting>:<side>` |
| tidy plans | each chosen plan is exported to `userData/power-plans/<guid>.pow` first; the active and built-in plans are refused; a plan whose export failed is never deleted | change kind `power-plan-file`, undo = `powercfg /import <file> <guid>` |
| stop a device waking the PC | `powercfg /devicedisablewake "<name>"` for a device the scan listed; names with shell characters are refused; read back | change kind `power-wake`, undo re-enables |
| Windows power mode | `PowerSetActiveOverlayScheme` (`lib/auto-opti/overlay.js`) | existing kind `power-overlay` |

Energy sessions (`lib/power/energy.js`): trapezoid integration of the measured watts per source; a gap longer than 5 s is not integrated across; a session under 10 s is not kept; cost needs the price per kWh the user typed (0 to 10, a short currency code). The last 20 sessions are kept in `jt_power.json`.

## Not done, and why

- Wall-power measurement: no sensor on this hardware exposes it; the stage says "CPU + GPU" instead.
- Switching plans per game or per power source automatically: that is the Scheduler's / Pulse's job and would change settings without the user asking.
