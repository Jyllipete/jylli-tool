# Startup tab "Ignition": evidence

Engine `lib/startup/`, UI `js/startup/`, `css/startup.css` (prefix `su-`), LANG group `startup2`.

## What is in, and why
| Thing | Basis |
|---|---|
| On/off through `Explorer\StartupApproved\{Run,Run32,StartupFolder}` (byte 02 = on, 03 + FILETIME = off) | The switch Task Manager reads and writes; Auto-Optimize already used it. Read on this PC: 5 of 9 Run entries were off in Windows while the old tab showed them on. Real round trip on a throwaway HKCU entry: off = byte 3, on = byte 2, Run value never touched. |
| Logon/boot tasks via Enable/Disable-ScheduledTask with TaskPath | The old tab ignored TaskPath, so tasks in subfolders failed. The journal records these as its built-in `task` kind. |
| Sources: HKCU/HKLM/HKLM32 Run, both Startup folders (.lnk target resolved), non-Microsoft logon/boot tasks, Store-app startup tasks | Probe read on this PC: 14 entries incl. Voicemeeter in the Startup folder and 3 Store apps. |
| Delay = own task in `\JylliTool\`, original switched off in StartupApproved | Real check: task has `ExecutionTimeLimit PT0S`, `Delay PT30S`, working directory set. The old version used a 1 h limit (the program was killed after an hour) and deleted the Run value. |
| Boot timing from event 100 (BootTime, MainPathBootTime, BootPostBootTime, BootNumStartupApps) | Same event `lib/auto-opti/verify.js` already reads. Every field optional, never filled in. |
| Slow starters from event 101 | Field names are read tolerantly (DegradationTime, TotalTime, Duration). |
| Lanes from `lib/auto-opti/startup.js` classifier | Shared with Auto-Optimize; security, drivers and updaters are never "worth switching off". |
| "Restart apps after sign-in" (`HKCU\...\Winlogon\RestartApps`) | Value read back after writing; the Settings > Accounts > Sign-in options toggle. |

## Not verified here (shown as "not read" instead of guessed)
- Event 100/101 content: the Diagnostics-Performance log has no events on this PC and this session was not elevated. Parsers are covered by tests with synthetic events. If Windows names a field differently, the tab shows "not measured", never a number.
- `RestartApps` effect: the registry write is verified, the Windows behaviour was not toggled on this PC.
- Store-app startup State: enum read as 0 Disabled, 1 DisabledByUser, 2 Enabled, 3/4 policy. Writing it is unverified, so those rows are shown read-only with a link to Windows Settings.

## Dropped, and why
- Task Manager's own "Startup impact" (StartupInfo XML in `System32\wdi\LogFiles`): schema not verified and unreadable without elevation. Replaced by Windows' own slowdown events and a clearly labelled "typical" weight.
- Authenticode signature check: revocation lookups can stall a scan for seconds. Publisher comes from the file's version info.
- RunOnce entries: transient, not a startup setting.
- Old `AutorunsDisabled` move and the `JylliDelay_` tasks: replaced; a banner migrates old leftovers.
- Old fake "impact" by source (HKCU = Low, HKLM = Medium) and the `get-boot-impact` reader that looked for a field that does not exist.

## Tested
`test/startup-engine.test.js` (40), `test/startup-ui.test.js` (14); preview `node tools/ui-preview/serve.js 5188` + `/app?su=full|first|legacy|lean|noadmin|noboot|done|fail[&tier=free][&lang=fi]`; `npm run preview -- --pages startup-manager --lint --noshot`.
