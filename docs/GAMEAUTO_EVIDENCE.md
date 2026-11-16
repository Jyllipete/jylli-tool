# Game automation: what it does, what it does not, and why

Game Watcher, Update Guard, Game Shield and Auto-Pulse work as one system: a **game session**. A session starts when a game is detected and ends
when it closes, when another game starts, when Game Watcher is switched off, or (after the fact) when Jylli Tool finds a session a crash left
behind. Every change a session makes is written to a ledger, read back where Windows lets us, and put back when the session ends. Rule from
[[TWEAK_EVIDENCE]]: **unverified = not shipped**; nothing here is described as stronger than the mechanism.

Engine: `lib/gameauto/` (`targets.js` the only place that decides which running program is which game; `watch.js` the detection state machine;
`ledger.js` the session record; `model.js` what each protection is doing, UMD, also loaded by the page; `index.js` the session service, all
Windows access injected). Policy owners: `lib/updateguard.js` (Windows Update service), `lib/gameshield.js` (which programs, thresholds,
exclusions, restore verdicts). Wiring: `// ─── Game sessions` and `// ─── Update Guard / Game Shield` in `main.js`. UI: `js/gameauto/{views,page}.js`,
`css/gameauto.css`, LANG group `gameauto`. Related: [[PULSE_EVIDENCE]], [[COMPETE_EVIDENCE]], [[GAMES_EVIDENCE]].

## Game Watcher

| Behaviour | Mechanism | Limit |
|---|---|---|
| Detection | Process list (`tasklist`) every 5 s, matched by program name against: the Pulse presets, the curated titles in `lib/games/known.js` (every executable they list), games the user added, and, only if "Also detect games from my library" is on, library games whose executable is **trusted** (picked by the user, learned from a running process, or a curated name found on disk; a guessed executable never counts). | By program name only. A game with a generic or shared executable (a Java game, a launcher) is not recognised unless it is in the lists. Unknown games are not detected. |
| Game already running at start | The first check after the watcher starts treats it as a start. | Only what the process list shows. |
| Probe failure | A failed or empty process list changes nothing. After 3 in a row the strip says "Detection degraded"; the session is kept. | |
| Short gaps | A game must be missing on **2 checks in a row** (~10 s) before the session ends. | A game that closes for less than 10 s is one session. |
| Game switch | The old session ends (everything restored) before the new one starts. | Two games at once: the one already in a session wins. |
| Watcher switched off mid-game | The session ends the normal way: Windows Update released, Game Shield programs restarted, MMCSS restored, an automatic boost ended, frame capture stopped. (Before, only Apps game time and Auto-Pulse stopped.) | |
| Competitive Mode | The watcher pauses and touches nothing. | |
| Start | The main process starts the watcher ~8 s after launch, after the recovery checks, when `gameWatcherEnabled` is on. (Before, only the window did, so a hidden or crashed UI left detection off.) | |

Pulse presets that matched only one executable now use a prefix (`r5apex*`, `RainbowSix*`), so `r5apex_dx12.exe` and `RainbowSix_Vulkan.exe` are found.
A Pulse preset is attached to a session **only when the running program fits it**: GTA5.exe is "GTA V" with no preset (the FiveM preset targets
FiveM's own process) and Minecraft Bedrock has none (the Minecraft preset targets `javaw`).

## Update Guard

**What it does:** sets the `wuauserv` service to Disabled and stops it while a game runs, then puts back the start type it had (Automatic,
Automatic delayed, or Manual, read from the registry `Start` and `DelayedAutostart` values) and starts it only if it was running.

| Behaviour | Mechanism / limit |
|---|---|
| Read back | The start type is read again after every change. A hold that did not take is undone and reported as failed, never as held. |
| Restore failed | The snapshot is kept, the card says "Needs attention" with Try again and the manual fix, the next start retries. It is never reported as restored. |
| Service already disabled | Nothing is changed and nothing is recorded ("skipped"). The old version "restored" it to Manual, which was wrong. |
| Quick start/exit, toggles | All operations run through one queue: a restore always follows its hold. |
| Windows switched it back on | Noted in the ledger when the game ends. (Update Medic can do this.) |
| 8 h limit | The hold is released by itself after 8 hours. |
| Pending updates | Offline search of the local update cache before the hold, 8 s limit. An unreadable result is shown as "could not check", never as 0. The list can be out of date. |
| Old snapshot `{ prev: 'Automatic' | 'Manual' | 'Disabled' }` | Read as before; `Disabled` is left disabled. |

**What it does not do:** it does not stop the Microsoft Store, an update that is already installing, an already scheduled restart, Update
Medic, or other updaters. It does not make a game faster. The old text "blocks Windows Update" overstated this and was replaced.

## Game Shield

Launch list (always): onedrive, teams, ms-teams, skype, dropbox, googledrivefs, yourphone, phoneexperiencehost. Also at launch when RAM use is at
or above the **launch threshold** (default 70 %, 50 to 90): discord, spotify, steamwebhelper. During the game, checked every 20 s, when RAM use
reaches the **mid-session threshold** (default 80 %, at least launch + 5, at most 95): the launch-threshold programs plus browsers. Lists are unchanged
by this work; **Steam is never listed** and the game's own program is always protected (`test/gameshield.test.js`).

| Behaviour | Mechanism / limit |
|---|---|
| Thresholds | One pair, clamped in one place (`clampThresholds` / model `clampPair`): sliders 50 to 90 and 55 to 95, the pair moves together, the gap is enforced on save. (The old slider allowed 95 for the launch value while the engine capped it at 90.) |
| Always keep alive | `validateExclusion`: lower-cased, `.exe` added, letters digits space `. _ - ( ) +`, up to 64 characters, 50 entries, no duplicates; each rejection says why. A save failure is reported and the list is unchanged. A program Game Shield would never close is shown as "no effect". |
| What is restored | Only programs Game Shield itself stopped, from the path Windows reported for the process. The session is **written to disk** (`snapshots/game-shield-session`) as it happens, so a crash does not forget it. |
| Restore result | Per program: restarted (verified running ~3 s later), already running, no recorded path, program file missing, did not start. Failures are listed with a Try again button; only retryable ones stay saved, a "no path" program cannot be started by us and is reported once. |
| Edge / Google update tasks | Still paused while Game Shield is on, but the tasks that were enabled are remembered (`game-shield-tasks`) and only those are re-enabled. No record (older install): all four, as before. Best effort. |

**What it does not do:** it force-closes programs (unsaved data is lost), frees no memory the game or Windows holds, and has no proof that closing a
program makes a particular game faster. It is not shown as a performance gain.

## Auto-Pulse

| Behaviour | Mechanism / limit |
|---|---|
| Needs Game Watcher | Said on the card; the switch still arms it. |
| Start | Only when enabled, Premium, the game has a Pulse preset, the game is not switched off, no boost is running and Competitive Mode is not active. State "Starting…", then Active, or Needs attention with the reason and "Open Pulse". The "auto-pulse-start" event is sent **after** `activatePulse` succeeded (it used to be sent first, and a failure left the badge on). |
| Boost the user started | Never replaced ("Left alone"). One for the **same game** still ends when that game closes (existing behaviour, now shown in the ledger). One for another game stays. |
| User stops an automatic boost | "Snoozed" until this game is closed and started again. `activatePulse` / `deactivatePulse` tell the service, so the UI never keeps a stale Active. |
| End | Only the boost it started (or the same-game manual one). A restore that did not fully work is reported (`deactivatePulse` now returns `ok: false`). |
| Per-game control | On/off per game with a Pulse preset, Reset all. Stored in `jt_gameauto.json`. |
| Old preset override | `auto-pulse-overrides.json` let a game use **another game's** preset. A preset is one game's program, so the priority boost aimed at the wrong process and the picker was never filled. Removed; the count of saved overrides is shown once and dismissed, not carried over. |

## What stays after a session (said in the ledger)

- The per-game **tweak profile** is not undone when the game ends; the ledger says "stays until you undo it in History". (The old watcher also had a
  bug here: it passed an undefined variable to `bundleApply`, so a profile never got past its first tweak. Fixed.)
- The FiveM compatibility flag is a persistent per-user setting by design.

## Recovery

| Situation | What happens |
|---|---|
| App quit during a game | `will-quit` ends the session (restores in order), then a manual boost, then releases Windows Update; a final sync relaunch of Game Shield programs if time ran out. |
| Crash / power loss | At the next start (8 s): Windows Update released, Game Shield programs recorded on disk restarted, MMCSS restored (existing `pulseRecover`), the saved session is closed as "Jylli Tool closed during the game" with what was recovered. |
| Settings | Switches and thresholds are main-owned (`MAIN_OWNED_SETTINGS`), so a stale renderer copy cannot overwrite them. Every change returns `{ ok }`; a failed write changes nothing and says so. |

## Ownership and precedence (audit 2026-11)

Rule: **one owner per resource, restore in the exact reverse of apply, one queue.** Found by reading the code paths, fixed in the same round.

| Resource | Owner | Order / rule |
|---|---|---|
| Session start | `lib/gameauto` queue | effects (Apps Game time, frame capture) → Game Shield → Update Guard → Auto-Pulse → saved tweak profile |
| Session end | same queue | **exact reverse**: Auto-Pulse → Update Guard → Game Shield → effects. The power plan and Windows Update come back before the slower Game Shield restart check, which matters when the app quits against its 6.5 s timeout. |
| Pulse boost | `lib/pulse/owner.js` | Every surface (tab, tray, Cockpit, HUD, hotkeys, bundles, Auto-Pulse) goes through one queue. A Stop pressed while a Start is applying runs after it. "Who started it" is one value (`auto` / `manual`), cleared by every stop. |
| Auto-Pulse switch off mid-game | session service | ends only a boost Auto-Pulse started; your own boost stays (and still ends with its game) |
| Your boost started over an automatic one | owner → `pulseChanged(preset, 'manual')` | becomes yours ("taken over by you") |
| Competitive Mode | `competeStartOwned` | an open automatic session ends the normal way first (`handOver`), and the watcher is held off while the start looks the game up. Undo is newest first. |
| Apps Game time | session effects | its start and end are awaited inside the session (a quick game switch can no longer overlap them) and recorded in the ledger |
| CPU & Memory / GPU / Power live views | `liveGameReason` | two reasons (`context` detector, `session`); the views pause on the first and resume when the last ends, so a library or custom game pauses them too |
| Start-up recovery | one chain, ~4 s after launch | Pulse → Apps → Competitive Mode → session service, then the watcher, then a `--compete` shortcut |

### Removed from sessions, and why

- **MMCSS write** (`SystemResponsiveness` = 10 and the Games task's `GPU Priority` = 8 at every session). Microsoft documents `SystemResponsiveness` as the share of CPU kept for low-priority tasks and `GPU Priority` as "not yet used" (Multimedia Class Scheduler Service, Microsoft Learn); 8 is already the default. The effect on a game is not measured here and only reaches threads that register with MMCSS. The restore also reset the user's own `mmcss` / `priority-sep` tweak (10) to 20 after every game. The persistent `mmcss` tweak stays; `pulseRecover` still puts back a leftover snapshot from an older version once.
- **FiveM compatibility flag** write on every session: not journaled, and it silently re-added the flag after the user undid the Games-tab row. The row and the FiveM catalog own that key.

### Saved tweak profile (`lib/gameauto/profile.js`)

Runs last. A tweak already applied (`tweak_<id>` = applied) is not applied again; tier 3 and tweaks you excluded from automatic runs are refused (the same rule as the journal's automatic pipeline, which the old loop skipped); an unknown id is reported. What it applies is written to the settings so the UI agrees. The profile stays applied after the game (undo in History); the ledger says how many were applied, which were already on, and which were refused or failed.

## Not verified

- No run in the built Electron app and no real game session: lifecycle tested with fakes (`test/gameauto-*.test.js`, `test/updateguard.test.js`) and the
  panel in the browser preview (`/app?gx=idle|playing|ended|failed|degraded|off|paused|fail`).
- `sc.exe config wuauserv start= delayed-auto` and the registry read of `DelayedAutostart` are documented Windows behaviour but were not exercised
  against a real service here.
- The 2026-11 ownership changes are covered by unit tests with fakes (`test/gameauto-service.test.js`, `test/pulse-owner.test.js`, `test/gameauto-profile.test.js`) and source-level guards (`test/perf-audit-wiring.test.js`). No real game session, no real MMCSS / Windows Update / compatibility-flag write was run.
- Which programs Windows Update Medic or Group Policy may turn back on is outside this tool.
