# Competitive Mode: what it changes and why

Competitive Mode (top of Gaming > Games) is a front door to engines Jylli already has: pick one game, press Start, the game launches, a short list of
session changes is applied once its process exists, and every one is put back when the game closes (or on Stop, or after a crash). Rule from
[[TWEAK_EVIDENCE]]: nothing ships without a documented mechanism and a read-back.

Engine: `lib/compete/` (`plan.js` is the only list of steps; `services.js` the only services it may pause; `launch.js` launch targets and process match;
`actions.js` PowerShell; `index.js` the session). Wiring: `// ─── Competitive Mode` in `main.js`. Related: [[PULSE_EVIDENCE]], [[CPUMEM_EVIDENCE]], [[GAMEAUTO_EVIDENCE]] (the watcher pauses while Competitive Mode owns a game).

## In

| Step | Mechanism | Proof / limit | Tier |
|---|---|---|---|
| Game priority | `Process.PriorityClass` Normal > AboveNormal (default) or High. Never Realtime. Journaled (`compete:priority`, same undo as Pulse). | Read back after setting. Anti-cheat may refuse it (shown as "Windows or an anti-cheat refused it"). | Free |
| Keep out of efficiency mode | `SetProcessInformation(ProcessPowerThrottling)` with execution-speed control on, throttle state off (documented Win32 API). | Read back with `GetProcessInformation`; ends with the process. | Free |
| High performance plan | `powercfg /setactive` from Balanced. Journaled (`compete:power`); undone only if the user did not change the plan since. | Skipped on laptops and dual-CCD X3D (same rule as Pulse), when already High or when no High plan exists. | Free |
| Clear standby memory | `NtSetSystemInformation(MemoryPurgeStandbyList)` once, via `lib/cpumem/actions.js`. Off by default. | Reports MB before and after. | Free |
| Minimise Jylli | `BrowserWindow.minimize()`. Jylli keeps running because it must undo the session. | n/a | Free |
| CPU cores | Process affinity via `lib/cpumem/affinity.js` plans valid for this CPU (hybrid P-cores, V-Cache die, skip core 0) or a custom set of at least 4 CPUs. | Plans offered only where `topology.js` says they apply; released on undo; ends with the process. | Premium |
| Game Shield | `gameShieldActivate({ force: true })`: closes the listed background apps and starts them again afterwards, honouring the user's exclusions. | Existing, tested engine. | Premium |
| Pause Windows Search | `Stop-Service WSearch` if it was Running, `Start-Service` at the end. Start type is never touched. Names kept in a snapshot so a crash is repaired by `recover()`. | The only service on the list. | Premium |
| Desktop shortcut | `shell.writeShortcutLink` to `Jylli Tool.exe --compete <id>`. The id is validated again at start-up (`idFromArgv`). | The app needs admin, so Windows shows a UAC prompt on each use. | Premium |

## Out (and why)

- **GPU priority.** No documented per-process GPU priority switch helps a game; the MMCSS "GPU Priority" value is only a hint to the multimedia scheduler.
- **I/O priority.** Unproven gain, and "High" needs privileges Windows keeps back.
- **Reduce Steam resource usage / closing steamwebhelper.** Breaks the Steam overlay, friends and in-game purchases.
- **"Load latency reduction (FSGM)".** No documented effect we can read back.
- **Other services (SysMain, DiagTrack, ...).** No evidence they help a game on current Windows; add one only with an entry here.
- **Disabling Windows Search.** Pausing is enough and fully reversible.

## Safety rules

- One session at a time; the Auto-Pulse / Game Shield / per-game profile watcher stands aside while Competitive Mode owns the game.
- The game is found by its process under the game's install folder (`match` in `launch.js`), never by name alone; custom games by their own exe.
- If no game process appears within three minutes the session ends and nothing was changed.
- Premium steps are decided in the main process (`isPremium()` inside `plan()`), not in the page.
- A session that was running when the app or PC went down is undone at next start (`recover()`, marker `compete-active`).

## Not verified on real hardware

Launching from Steam / Epic / Xbox, the UAC prompt from the shortcut, a real game exit, anti-cheat behaviour and the Xbox package scan
(`Get-AppxPackage` plus `MicrosoftGame.config`) have only been exercised against fixtures and fakes. Test the built app before relying on them.

Preview: `node tools/ui-preview/serve.js`, open `/app` (add `?tier=free` for a free account), go to Gaming > Games. The fixture is
`tools/ui-preview/compete-fixture.js`; push a state from the console with `window.__pushEvent('onCompeteState', { state: 'running', ... })`.
