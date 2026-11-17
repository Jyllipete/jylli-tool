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
- "Room for about N more" = free cap ÷ average point size. Point sizes differ a lot; the tab labels it an estimate and shows nothing when there is nothing to base it on (`roomEstimate`): fewer than 3 points, because on the real PC one point sat in 9.4 GB of shadow storage and the average said "room for 0 more".

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

After the restart `reconcile()` runs on every scan (and 20 s after launch when a request is pending). `model.outcome` judges it from evidence:
1. PC rebooted since the request and `Get-ComputerRestorePoint -LastStatus` says **failed** or **interrupted**: that status;
2. rebooted, status **succeeded** *and* a Windows "Restore Operation" point (type 6) newer than the request exists: **succeeded**. An old success on record proves nothing about this restore, so the point must be there;
3. rebooted, anything else: **unknown** (kept for 3 days, then reported as unknown);
4. no reboot since the request: **waiting** for 15 minutes, then **cancelled** (nothing happened).

**Observed on a real restore (2026-11-17, event log):** Windows creates the "Restore Operation" undo point when the restore *starts* (09:23:50, event 8215) and the machine restarts into the restore. The restore ran ~10 minutes, was cut off by a forced restart (event 41, then 8204 "System restore ended unexpectedly because of power loss or a program error"), so it never finished. The first version of `outcome` took the type-6 point as proof of success and would have reported this interrupted restore as finished and marked the user's changes undone. It now proves only that the restore *started*.

Only a **succeeded** restore changes anything: journal entries recorded between the point and the request get `undoneBy: system-restore:<seq>`, and `tweak_<id>` flags follow (the oldest entry per tweak decides: an apply means "not applied at the point"). Failed / interrupted / cancelled / unknown mark nothing. The old behaviour cleared every `tweak_*` flag *before* the reboot, even when the restore later failed.

**Checked so far (2026-11-17, one Windows 11 PC, non-elevated shell):** the probe runs and parses; without admin Windows lists no points and no shadow storage (`pointsRead:false`, shown as "could not read"); `RPSessionInterval` read 1. Run `node tools/restore-probe.js` from an **elevated** terminal to see the raw `-LastStatus` text, the point types and whether `RPSessionInterval` agrees with the shadow storage, and add the result here.

**Checked elevated (2026-11-17, same PC):** `Get-ComputerRestorePoint` listed 1 point (type 12, `JylliTool_v1_FirstRun`, parsed as origin `firstRun`); `-LastStatus` returned the English text "The last attempt to restore the computer failed." (parsed `failed` by keyword; this PC has an older failed attempt on record, so the *success* and *interrupted* wordings are still unobserved); `RPSessionInterval` was 1 and shadow storage was present, so the two protection sources agree here. Because that old status never goes away, `outcome()` only trusts `-LastStatus` when the PC rebooted after the request.

**The nav dot and tab dot** follow `restore2-changed` (any feature that makes, deletes or restores a point): verified in the preview that a stale status shows both dots and a fresh status clears them.

**Not verified on a real PC:** a *completed* restore: the success wording of `-LastStatus` and whether the type-6 point is listed by `Get-ComputerRestorePoint` (the event log shows Windows creates it) are still unobserved. The interrupted case above is the only real restore seen so far.

## Schedule
A check one minute after start and then hourly (`restore.tick`). It does nothing when the schedule is off or not due, never runs while a game is running (`liveGameReason`) or on battery, and after a failure waits 6 hours. A launch-only timer (the old behaviour) missed PCs that stay on for days.

## What is deliberately not here
- No pinning of points: Windows exposes no supported way to protect one point from cleanup.
- No scheduled deletion of old points, and no "free space" action: deleting a point is irreversible and Windows already drops the oldest when the cap is full.
- Whole-app settings backup is not part of this tab (profiles remain a Premium feature elsewhere).

## Preview
`node tools/ui-preview/serve.js 5188` then `/app?rs=full|covered|uncovered|stale|empty|off|policy|noadmin|returned|failed-return|unreadable|fail[&lang=fi]` (`tools/ui-preview/restore-fixture.js`: the real service on a fake PC; create / delete / protect / storage change the fake PC and are read back through the same probe). `npm run preview -- --pages restore-points --lint --noshot` lints the page.
