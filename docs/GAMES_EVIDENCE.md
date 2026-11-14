# Games tab "Library": what it does and why

Engine `lib/games/`, UI `js/games/*` + `css/games.css`, wiring `// ─── Games` in main.js, state `jt_games.json`. Competitive Mode stays above it ([[COMPETE_EVIDENCE]]).

## Why it was rebuilt (2026-11-14)
The old tab listed 18 hardcoded titles and guessed folders by name (a game on a second Steam drive was missed), although the app already read every installed Steam / Epic / Xbox game for Home and Competitive Mode. Its "profile" also:
- added an **unjournaled Windows Defender exclusion** (removed from the app for security in commit 2f50738, see [[TWEAK_EVIDENCE]]),
- set **High priority on launchers** (Battle.net, EA Desktop, Ubisoft Connect, Riot Client, Epic launcher), which games then inherit,
- wrote **global** MMCSS and Game DVR values per game, so restoring one game changed all of them (the Windows tab owns those switches),
- never read anything back: it returned ok even when a write failed,
- never fired from the watcher for cs2, arma-reforger, r6siege and overwatch2, because the watcher uses Pulse preset ids (`csgo`, `arma`, `r6`, `overwatch`) and looked up `gameProfile_<preset id>`.
- "Last seen" was the install folder's modification time; sessions were recorded with the preset id as the game name.

## The library
One list: registry games (`lib/games-registry.js`: Steam manifests across every library folder, Epic manifests, Xbox packages) + curated titles found by folder hint (Riot, Battle.net, Rockstar have no manifest; a folder with no program inside is ignored) + games the user added by picking an exe. Curated titles (`known.js`, the only list) match a registry entry by exact normalised name, never by substring ("Rust Hour" is not Rust). Ids keep working: a library id has aliases (curated id, Pulse preset id) so saved `gameProfile_<id>` settings, sessions and the watcher all resolve to the same game.

## Which executable
`exes.js` is the only place that decides it, and says how sure it is: **picked** (user), **learned** (seen running out of the game's own folder by the watcher or the scan), **known** (a curated name found on disk), **guess** (biggest likely exe in the folder, at least 2 MB, not a helper / crash handler / anti-cheat). A guess is shown and must be confirmed; nothing is changed through it. Never listed as a game exe: launchers, `vgc.exe`, BattlEye / EAC services, `javaw.exe` (it runs every Java program).

## Per-game changes (`catalog.js`, the only list)
| Row | How | Status | Evidence |
|---|---|---|---|
| High CPU priority | IFEO `PerfOptions\CpuPriorityClass = 3` for the game exe, through the CPU & Memory service (`cpumem:priority:<exe>`, journaled). A value another tab set is never overwritten (`elsewhere`). | recommended | IFEO `PerfOptions` is a widely used mechanism; no Microsoft page documents these values (not verified). Same level the CPU & Memory Lab offers. Restore deletes the value. |
| Never throttle for power | `powercfg /powerthrottling disable /path <exe>`, read back with `powercfg /powerthrottling list`, undone with `reset`. | recommended on hybrid CPUs and laptops | Documented powercfg option (Windows 10 1709+). Needs elevation to read: unelevated it is reported as "could not be read back", never as failed or applied. |
| Optimisations for windowed games | `HKCU\Software\Microsoft\DirectX\UserGpuPreferences\<exe path> = SwapEffectUpgradeEnable=1;` merged into the existing string (the GPU tab's `GpuPreference=` is kept), journaled. | recommended on Windows 11 | This is the value Settings › Graphics writes per app. Windows 11 only. |
| Disable fullscreen optimisations | `HKCU\...\AppCompatFlags\Layers\<exe path> = ~ DISABLEDXMAXIMIZEDWINDOWEDMODE` merged with existing flags, journaled. | never recommended | Community-level evidence only: helps some games that stutter in exclusive fullscreen, hurts others. The key is the full path (the old code used the bare name, which Windows ignores). |

Every run reads the values again afterwards. A row is only "applied" when Windows says so; otherwise the receipt says `not-verified`. A run can be undone as a whole (History tab) and each registry change is in the System › History journal (`games:<id>:<row>`).

## Dropped on purpose
- **Defender exclusions** (security trade-off, evidence anecdotal, removed from the app before).
- **Launcher priority** (inherited by every game it starts).
- **I/O priority** (`IoPriority` values are not documented by Microsoft).
- **Global MMCSS / Game DVR writes** (owned by the Windows tab; the Library only links to them).
- **GPU preference per exe** (owned by the GPU tab, hybrid PCs only).

## Migration
A game whose old profile is still on (`tweak_game-<id> = applied` and no new rows) shows a banner. "Put it back" runs the old restore (journaled MMCSS / DVR undo, IFEO cleanup including the launchers, Defender exclusion removal), marks it restored, and the new rows become recommendations. `apply-game-tweak` keeps only `restore`; `apply` returns `retired`.

## Play history and impact
Only sessions Jylli recorded (PresentMon while the watcher sees a game it knows by Pulse preset) are counted: time, sessions, average FPS, 1% low, trend. Sessions with fewer than 600 frames are not measurements. **Impact** compares sessions before and after the tuning (first applied row) and is only shown with at least 2 sessions on each side and a change of at least 3 % in the 1% low (average if there are no lows); otherwise it says what is missing or "no clear difference". Games Pulse does not know by name have no history, and the page says so instead of estimating.

## Free vs Premium
Library, covers (Steam's own cache, nothing downloaded), Play, favourites, hiding, custom games and Play history are free. Per-game rows, game settings sheets, automation and saved setups lock inline.

## Not verified
Real writes on a real PC (apply / undo of the four rows), `powercfg /powerthrottling` output format when elevated (parsed by "path present", `unread` when it cannot be read), Xbox game launch, the watcher firing a profile for the aliases above. The read-only path (probe, library, running games, exe ranking) was run on a real PC; everything else on a synthetic one (`npm run preview`, `tools/ui-preview/games-fixture.js`, `?ga=full|first|empty|legacy|running|fail` on `/app`).
