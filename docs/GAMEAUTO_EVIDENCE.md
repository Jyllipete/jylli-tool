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

## Not verified

- No run in the built Electron app and no real game session: lifecycle tested with fakes (`test/gameauto-*.test.js`, `test/updateguard.test.js`) and the
  panel in the browser preview (`/app?gx=idle|playing|ended|failed|degraded|off|paused|fail`).
- `sc.exe config wuauserv start= delayed-auto` and the registry read of `DelayedAutostart` are documented Windows behaviour but were not exercised
  against a real service here.
- Which programs Windows Update Medic or Group Policy may turn back on is outside this tool.
