# Restore points "Lifeline": evidence

The tab answers one question: **am I covered, and what exactly would rolling back do?** Every fact on it has a source below; anything that could not be read is shown as unknown, never as zero.

Engine: `lib/restore/` (main.js `// ─── Restore (Lifeline)`), state `jt_restore.json`, UI `js/restore/*`, strings `js/lang/restore-{en,fi}.js` (group `restore2`).

## What a restore point covers (the rule the tab is built on)
A point captures the state at its own time. Rolling back to it undoes everything changed **after** it, and nothing before it.
- A Jylli change is **covered** when a point older than the change exists. That is the normal state right after Auto-Optimize (the point is made first, the changes follow).
- `since` = changes after the *newest* point. They are covered by it; they only make a rollback bigger, which is what an old point costs. Never a warning.
- `unprotected` = changes older than *every* point. No point can undo them; only the change journal can (History tab). Information only: a new point never fixes it, so it is never the headline.
- An early version of this design called changes after the newest point "unprotected". That was backwards, found while running the fixture, and is covered by `test/restore-engine.test.js`.

## Where each fact comes from
| Fact | Source | Notes |
|---|---|---|
| Points (seq, name, time, type) | `Get-ComputerRestorePoint` in the one probe (`detect.js`, marker `JJRP:`) | `pointsRead:false` when Windows would not list them: shown as "could not read", not "none" |
| System Protection on / off | `HKLM:\...\SystemRestore\RPSessionInterval` (1 / 0), else existence of shadow storage | Not verified on every Windows build; a wrong guess shows as "Unknown" rather than on/off only when both sources are missing |
| Policy lock | `DisableSR` / `DisableConfig` under `HKLM:\SOFTWARE\Policies\...\SystemRestore` | Creating a point or turning protection on removes these two values (the existing `lib/restore-point.js` behaviour); the tab says so |
| Storage used / cap | `Win32_ShadowStorage` of the system volume | A cap larger than the disk is "no limit", not a number |
| Free disk, size | `Win32_Volume` | |
| Battery | `Win32_Battery` (`BatteryStatus` 1 = discharging) | |
| Last boot | `Win32_OperatingSystem.LastBootUpTime` | used to judge a restore, below |
| Programs installed after a point | Uninstall keys with an `InstallDate` (yyyymmdd) | **Day precision.** Later days are listed as "likely"; the same day is listed apart as "cannot tell which came first" |
| Jylli changes after a point | `jt_journal.jsonl` via `journal.list`, live entries only (not undone, not an undo, not failed) | exact |
| Origin of a point | description prefix `JylliTool_*` (`model.originOf`, the only decoder), else Windows' own description and type | |

## Estimates (and only these)
- "Room for about N more" = free cap ÷ average point size. Point sizes differ a lot; the tab labels it an estimate and shows nothing when there is nothing to base it on (`roomEstimate`).

## Writes, and how each is proven
| Action | How | Proof |
|---|---|---|
| Create | `lib/restore-point.js` (unchanged script) | A new sequence number must appear; then the tab rescans and checks that the number is in the list (`verified`) |
| Delete | shadow copy matched by creation time within 10 s, refuses when two match | rescan: the point must be gone |
| Protection on / off | `Enable-ComputerRestore` / `Disable-ComputerRestore` (on also clears the two policy flags and sets VSS to manual start if it was disabled) | rescan: `protection` must equal what was asked |
| Storage cap | `vssadmin resize shadowstorage /MaxSize=N%` | rescan: cap ÷ disk within 1 point of N |
| Schedule | `settings.autoSnapshotDays` (0, 1, 3, 7) | returned in the snapshot |
| Restore | `Restore-Computer`, after writing `pending` to state | see below |

The protection toggle and storage cap are not journaled: each has its own inverse in the tab and neither touches a tweak. Creating, deleting and restoring points are Windows operations the journal cannot invert.

## Restore and the reboot
`Restore-Computer` reboots the PC, which may kill this process before it can write anything. So `pending { seq, pointAt, at }` is written first; it is cleared if Windows refuses (and `rstrui.exe` is opened as before).

After the restart `reconcile()` runs on every scan (and 20 s after launch when a request is pending). `model.outcome` judges it from evidence, strongest first:
1. a Windows "Restore Operation" point (type 6) newer than the request: **succeeded**;
2. the PC rebooted after the request and `Get-ComputerRestorePoint -LastStatus` says failed / interrupted / succeeded (matched by keyword, because Windows words it per language): that status;
3. rebooted but no usable status: **unknown** (kept for 3 days, then reported as unknown);
4. no reboot since the request: **waiting** for 15 minutes, then **cancelled** (nothing happened).

Only a **succeeded** restore changes anything: journal entries recorded between the point and the request get `undoneBy: system-restore:<seq>`, and `tweak_<id>` flags follow (the oldest entry per tweak decides: an apply means "not applied at the point"). Failed / interrupted / cancelled / unknown mark nothing. The old behaviour cleared every `tweak_*` flag *before* the reboot, even when the restore later failed.

**Checked so far (2026-11-17, one Windows 11 PC, non-elevated shell):** the probe runs and parses; without admin Windows lists no points and no shadow storage (`pointsRead:false`, shown as "could not read"); `RPSessionInterval` read 1. Run `node tools/restore-probe.js` from an **elevated** terminal to see the raw `-LastStatus` text, the point types and whether `RPSessionInterval` agrees with the shadow storage, and add the result here.

**The nav dot and tab dot** follow `restore2-changed` (any feature that makes, deletes or restores a point): verified in the preview that a stale status shows both dots and a fresh status clears them.

**Not verified on a real PC:** the type-6 point and the `-LastStatus` wording have not been observed on a real restore (the fixture and tests drive the logic with synthetic probes). A real `Restore-Computer` reboot is the one thing this work could not exercise.

## Schedule
A check one minute after start and then hourly (`restore.tick`). It does nothing when the schedule is off or not due, never runs while a game is running (`liveGameReason`) or on battery, and after a failure waits 6 hours. A launch-only timer (the old behaviour) missed PCs that stay on for days.

## What is deliberately not here
- No pinning of points: Windows exposes no supported way to protect one point from cleanup.
- No scheduled deletion of old points, and no "free space" action: deleting a point is irreversible and Windows already drops the oldest when the cap is full.
- Whole-app settings backup is not part of this tab (profiles remain a Premium feature elsewhere).

## Preview
`node tools/ui-preview/serve.js 5188` then `/app?rs=full|covered|uncovered|stale|empty|off|policy|noadmin|returned|failed-return|unreadable|fail[&lang=fi]` (`tools/ui-preview/restore-fixture.js`: the real service on a fake PC; create / delete / protect / storage change the fake PC and are read back through the same probe). `npm run preview -- --pages restore-points --lint --noshot` lints the page.
