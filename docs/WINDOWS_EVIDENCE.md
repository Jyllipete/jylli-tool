# Windows evidence

`lib/windows/catalog.js` is the only list of what the Windows and Quality of life tabs show or change. Why a tweak is offered at all lives in [[TWEAK_EVIDENCE]]; this file says how the tab **knows the state of each switch**, and what it will and will not claim.

## Status of a switch (lib/windows/model.js `statusOf`, the only place these rules live)
Remembered state = `settings.tweak_<id>` (what Jylli applied). Live state = what the probe reads from Windows now.
| Status | Remembered | Live | Shown as |
|---|---|---|---|
| `on` | applied | all values match | Set by Jylli |
| `native` | not applied | all values match | Already set in Windows. The switch is locked: Jylli did not set it, so Jylli does not undo it |
| `partial` | any | some values match | Partly set |
| `off` | not applied | no value matches | Windows default |
| `drifted` | applied | no value matches | Put back by Windows (Windows Update or another program) |
| `restart` | applied after the last boot, change needs a restart | no value matches yet | Waiting for restart |
| `unknown` | any | not readable / no probe | Applied: "cannot be verified"; otherwise "cannot be read". Never shown as on or off |

A service or scheduled task that does not exist on this PC is left out of the match (nothing to switch). A registry value that is not there reads as the Windows default.

## What is measured (lib/windows/detect.js, one read-only PowerShell call)
`Get-ItemPropertyValue` for registry values, `Get-Service` start type, `Get-ScheduledTask` state, `Test-Path` for `hiberfil.sys`, `Get-MMAgent` for memory compression. The script contains no write command (a test enforces it). Probes are hand-listed in the catalog next to each id, copied from what each tweak's `apply` writes, and shared keys are read once.

Switches with no probe (`fth-reset`, `usb-suspend` (a powercfg setting), `cortana-remnant-off`) show `unknown`. Audit 2 fixed probes that read something the tweak does not write; `defender-quiet`, `rt-scan-trim`, `defender-core-off` and `defender-idle-priority` are retired. They are offered, they are journaled, they are not verified.

## Verification after a change (lib/windows/index.js `run`)
Apply or restore goes through `journalSvc().applyBatch` (via `manual`, restore point rule of the journal: any tier 2+, more than 5 items, or a stale restore point; no restore point means no change). After the batch the whole probe runs again. Per item: `verified: true` when Windows now reads as asked, `false` when the change went through but the live value is different (reported as "Read differently", never as success), `null` when it cannot be read or waits for a restart.

## Recommended (one rule, lib/windows/model.js)
Catalog `rec`, or applicability `recommended` for this hardware, and the switch is open (`off`, or `unknown` and not applied), not `caution`, not retired, tier below 3, needs no restart. Stage, chips, the CTA count and the row badge all read this one result.

## Retired
Tweaks in `RETIRED_TWEAKS` (main.js) stay in the catalog in lane `retired`. They are shown only when still applied, can only be restored, and show the reason from main. A test keeps the lane and the main.js list equal.

## Undo
| What | How |
|---|---|
| One change | `journal-undo` by entry id (row details, snackbar) |
| A whole batch | `journal-undo` by batch id (receipt, History, "Undo last change") |
| Everything Jylli set here | History, "Restore all set by Jylli": a batch restore |
A value changed after the apply asks first (`force` only after confirmation). Switches the journal could not record exactly use the tweak's own restore.

## Not shipped
A background guard that re-applies reverted switches. The tab tells you when Windows put something back and offers one button; it never re-applies on its own.

**Moved to the CPU & Memory tab:** `power-throttling`, `global-timer-resolution`, `sysmain`, `memory-compression`, `spectre-meltdown` (see [[CPUMEM_EVIDENCE]]). The `memory` lane here now holds only `hibernate`.

Back to [[Home]]

## Round 2 (2026-11-14, LuminApp comparison)
14 policy/registry switches added. All are tier 1, apply through the journal, and undo removes the value (Windows default).
Sources: Microsoft Policy CSP / ADMX names; written from policy documentation, **not yet run on a real PC**.

| Switch | Value written | Evidence |
|---|---|---|
| activity-history-off (rec) | Policies\...\System EnableActivityFeed / PublishUserActivities / UploadUserActivities = 0 | Policy CSP Privacy; EnableActivityFeed location confirmed |
| ceip-policy-off (rec) | Policies\Microsoft\SQMClient\Windows CEIPEnable = 0 | ADMX SQM |
| typing-insights-off | HKCU Input\TIPC Enabled, Input\Settings InsightsEnabled = 0 | Settings toggle values (user scope) |
| wer-policy-off | Policies\...\Windows Error Reporting Disabled = 1 | ADMX WER |
| appcompat-inventory-off | Policies\...\AppCompat DisableInventory, DisableUAR = 1 | ADMX AppCompat |
| recall-off | Policies\...\WindowsAI DisableAIDataAnalysis = 1 | Policy CSP WindowsAI. Shown only on build 26100+. AllowRecallEnablement left out: not found as a registry policy |
| search-highlights-off (rec) | Policies\...\Windows Search EnableDynamicContentInWSB = 0 | ADMX Search |
| toasts-off | HKCU PushNotifications ToastEnabled = 0 | Settings toggle value |
| lockscreen-toasts-off | HKCU Notifications\Settings NOC_GLOBAL_SETTING_ALLOW_TOASTS_ABOVE_LOCK = 0 | Settings toggle value |
| cross-device-off | Policies\...\System EnableCdp, AllowCrossDeviceClipboard = 0 | ADMX System |
| long-paths-on | FileSystem LongPathsEnabled = 1 | Microsoft file-path docs |
| driver-updates-off | Policies\...\WindowsUpdate ExcludeWUDriversInQualityUpdate = 1 | Policy CSP Update; sources disagree on HKCU use, only HKLM is written |
| auto-restart-guard | WindowsUpdate\AU NoAutoRebootWithLoggedOnUsers = 1 | Documented: no effect when Configure Automatic Updates is disabled; user-scheduled restart overrides |
| remote-assist-off (rec) | Remote Assistance fAllowToGetHelp = 0 | Long-standing registry value |

### Not shipped (unverified)
- **paint-ai-off** (DisableCocreator/GenerativeFill/ImageCreator): Microsoft documents these as Policy CSP only; the registry path in guides (`HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Paint`) is community-sourced.
- **onesettings-off** (DisableOneSettingsDownloads): no source confirmed this round.

## Round 3 (competitor comparison, 2026-11-14)
Checked a rival tool's Network, Tweaks and Security pages against ours. Registry values are the documented/commonly used ones; none is claimed to raise FPS.

**Added (Windows tab):** `game-mode-on` (now a visible row; Game Mode is on by default, so it is a "set explicitly / repair" switch), `classic-context-menu` (HKCU CLSID `{86ca1aa0-…}\InprocServer32` empty default, Windows 11 only), `explorer-this-pc` (Explorer `LaunchTo=1`, preference), `menu-delay-short` (`MenuShowDelay` 100, default 400), `bsod-no-autoreboot` (`CrashControl\AutoReboot=0`, keeps the stop code readable; expert lane). All manual-only in Auto-Optimize.

**Rejected:** Fast UDP Datagram Send, Nagle, TCP ACK frequency, QoS reserve, Network Throttling Index, TCP task offload (retired for lack of measurement, see TWEAK_EVIDENCE); Mouse Throttling (only background-window input); Text Input Service off (breaks typing/IMEs, CPU figure unsourced); Audio Enhancements off (per-endpoint writes, weak evidence); Network Data Usage off (old Killer-driver DPC reports, breaks metered limits); Safe Mode + Power Plans desktop menu (a safeboot flag can trap users); Vulnerable Driver Blocklist, SmartScreen, UAC, Control Flow Guard (security cost, no proven gain; `SHIELD_DENY` forbids UAC/SmartScreen/DeviceGuard); Kernel Paging Executive, NTFS last-access, Auto Maintenance, Foreground App Boost (already retired).

**Not added yet:** Modern Standby fix (`PlatformAoAcOverride=0`). Only safe when S3 is offered by the firmware; needs a gate on `lib/power/sleep.js` output first.
