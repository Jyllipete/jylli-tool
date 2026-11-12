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

Switches with no probe (`msi-mode` per-device keys, `gpu-per-app-preference`, `vrr-borderless`, `fth-reset`, `rt-scan-trim`, `defender-quiet`, `cortana-remnant-off`) show `unknown`. They are offered, they are journaled, they are not verified.

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
