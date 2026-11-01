# Jylli Tool release audit: fix plan

## Context
Six-phase pre-release audit (UI wiring, IPC, silent failures, tweak quality, restore points, dead code). Three read-only audits are done. Findings below are agent-reported with file:line; each fix step re-verifies the exact lines before editing (main.js ~826KB and index.html ~970KB are never read in full: Grep, then Read with offset/limit; Edit only).
Constraints from CLAUDE.md: every new UI string needs `en` and `fi` in LANG; main.js logs stay English; run `npm test` and `npm run check` after each step (filtered output); no push, version bump or release.
The audit prompt is a guide, not law: where it conflicts with reality (see "Deviations") I follow reality.

## Audit report

### [CRITICAL]
1. **Tweaks report success when the command failed.** `runPS`/`runCmd` always resolve `{ok,out,err}` (main.js:1334/1357); about 644 call sites ignore the result. `invokeTweak` (main.js:4000, lib/journal-service.js:30/104) treats "did not throw" as success. The `tweak_<id>` flag is set regardless (index.html:7803, journal-service.js:105/151). Most tweaks use `Set-ItemProperty -Force` or `-EA SilentlyContinue`, so even a non-zero exit goes unseen.
2. **Restore point can silently not exist.** `Checkpoint-Computer` throttled by the 24h limit only warns, and the code still reports "RP_OK" (main.js:2578, 4490). The WMI fallback result is ignored (2582, 4495). Nothing re-reads the list to confirm. The success time is saved anyway (4390, journal-service.js:93).
3. **No admin check before restore point creation** (main.js:2566, 4484).
4. **Restore point side effects.** Sets VSS to Automatic permanently (2560). Overwrites and then deletes the user's own `SystemRestorePointCreationFrequency` (2563, 2590, 4504). SR-disable policy removal is unchecked (2558).
5. **Risky changes with no restore point.** Single-tweak runs (main.js:2312), `run-fix` (8278) and `reapplyReverted` (index.html:2289) never create one, including tier-3 tweaks and fix-wifi's firewall reset.
6. **Data-loss on failed restore.** `pulseRestoreAll` deletes the snapshot even when registry restores failed (main.js:10698–10747). `setUpdateGuard(false)` removes the snapshot even if re-enabling wuauserv failed, so Windows Update can stay off (14068–14073). `set-update-intercept` disables wuauserv with no snapshot (14620).
7. **Fake success returned to the user.** Bundle activation (main.js:1048–1058, 2220–2224), profile saves (2086–2201), `saveSettings` (1489) and `saveChangelog` (2171, 12179). Also `pulse-fix-mouse` (11006), `toggle-game-shield` (14211), `cpu-unpin-game` (13976), `set-startup` (1179, 1382), the BIOS handlers (12820–12878, 14519), FiveM pack import (3825–3847), `fivem-clear-cache` (6182) and `reapplyReverted` (index.html:2291).
8. **Backup-before-write is not enforced.** If the backup write fails, gta5_settings.xml (main.js:3316), CitizenFX.ini (3399) and the Arma configs (10601) are written anyway. Auto-restore can then copy back a stale `.bak` (3339, 3352).
9. **Wrong-window IPC sends.** Pulse window listeners never fire (`onAriaFpsTick`, `onAriaTick`, `onThermalTick`, `onThermalProgress`), so the thermal audit progress bar is frozen. `pulse-session-end`, `budget-tick` and `budget-session-report` are never sent at all, so the session debrief never shows.
10. **Unhandled throws.** About 25 handlers destructure their argument with no default, and `assertPositiveInt` throws `TypeError` (main.js:1407 and callers). There is no `unhandledrejection` handler in any renderer.
11. **Argument contract bug.** `pulseStart({preset})` in index.html:14083 vs `presetId` in main.js:10977. Bundle-driven Pulse never starts.
12. **AMD vendor-match bug.** `gpuClassIndexes` (main.js:4258) matches "ATI" inside "Corporation", so `amd-chill-off` (7891) and `amd-power-hold` (7912) write AMD driver values into NVIDIA and Intel adapter keys.

### [HIGH]
- **Health check false positives** in `run-tweak-health` (main.js:9651–9695). The pre-flight scan marks every saved flag as applied (8812–8824).
  - `priority-sep` checks the wrong key path (9657).
  - `net-throttling` compares 4294967295 against -1 (9655).
  - `win-tips` checks a value the tweak never writes (9661).
  - `disable-hdcp` is hardcoded to GPU slot `\0000` (9668).
- **Restore buttons hardcode values instead of the originals.** Affected: mmcss (4639), fivem-mmcss (6350), fivem-vm (6433), gpu-hwsch (4718), gpu-hags-off (7742), vbs-disable (7783), hvci-offload (7760), fix-valorant-hvci (6679), full-mitigation-wipe (7845), vrr-borderless (8106), dns-doh (5329), and the DNS tweaks, which force DHCP. Several services are put back as `auto` when Windows defaults to manual.
- **Journal gaps.**
  - The DNS tweaks (main.js:513–515) and fix-usb-ghosting (6980–6989, 7130) bypass the journal.
  - `fsutil`, `Disable-MMAgent` and `Set-ProcessMitigation` are not recorded.
  - `full-mitigation-wipe` is labelled "exact" but only restores the registry part.
  - `bcd-tweaks` is labelled "exact" but is not.
  - The manifest has no entries for tweaks from `raw-aim-curve` on.
- **Dead or broken UI/IPC.**
  - Scheduler: 3 of 7 options return `invalid_schedule`, and custom time and day are ignored (main.js:12205).
  - FPS HUD corner is saved but never applied (main.js:~13689, fps-hud.html).
  - `open-pulse-window` fails silently for free users (js/pages/gaming-pulse.js:78).
  - `rename-profile` has no premium check (main.js:2129).
  - `list-restore-points` returns `{error}` instead of an array (2594), which breaks `rps.find` at index.html:10141.
  - `onPulseCooldownTick` is dead (index.html:1265).
  - The IRQ affinity panel is a stub that hides itself (index.html:12273–12497, main.js:2071).
  - Update Guard and Game Shield toggles toast success regardless of result (index.html:1955–1992, 2092).
  - `sgmToggle` (14701), `genRebootNow` (8036) and Auto-Pulse override (5161) also ignore results.
- **Harmful or unsafe.**
  - `fix-2502` grants Everyone full control on `C:\Windows\Temp` recursively (6847).
  - `clean-browser-history` deletes Firefox `places.sqlite`, which holds bookmarks (5994).
  - `clean-vs-temp` wipes the `.nuget` cache (6081).
  - `clean-temp` includes Prefetch (5844).
  - `defender-idle-priority` adds AV exclusions (8035).
  - The FiveM `UpdateChannel=canary` setting.
  - `disable-ipv6` writes 255, not the documented value (5441).
  - `net-max-ports` starts the range at 10000 (5826).
  - The tier-3 security-lowering tweaks (spectre-meltdown, full-mitigation-wipe, hvci-offload, vbs-disable, defender-core-off), plus defender-quiet and rt-scan-trim, which are only tier 2.

### [PERFORMANCE IMPROVEMENTS]
**Remove or merge** (placebo/obsolete on Win10/11; each is verified in code before removal, and the tweak ids stay in a `RETIRED` list so saved flags don't break):
- Network: tcp-buffers, net-throttling, net-del-ack, tcp-task-offload, tcp-timedwait, fivem-network (global-key writes), net-max-ports.
- Memory/kernel: large-system-cache, disable-paging-executive, pool-usage-max, split-large-caches, fivem-vm.
- Timer/boot: hpet (`useplatformtick` and `disabledynamictick` can raise latency), tsc-sync, bcd-tweaks, cpu-parking.
- Scheduling and priority: priority-sep and cpu-focus-bias (only the 38/0x26 value mismatch needs fixing), dpc-coalescing, gpu-preemption, cursor-max-rate, global-timer-resolution (keep as an opt-in, niche).
- Audio, storage and GPU: audio-exclusive-mode, wasapi-min-period, directstorage-nvme, memory-guard-tune, fivem-io-priority, NVIDIA PowerMizer duplicates (5056 and 7850).
- Visual: visual-effects, which needs the `UserPreferencesMask` change to take effect.
- FiveM ini keys that are unverified (6509–6643).

**Upgrade** (keep the tweak, make it correct):
- Make MMCSS proper: `SystemResponsiveness` (10–20 for gaming), `Tasks\Games` (GPU Priority 8, Priority 6, Scheduling Category High, SFIO Priority High), with a captured original and an exact restore.
- Keep gpu-hwsch/MPO/vrr-borderless, power-throttling, game-dvr, disable-fso, msi-mode, usb-suspend, pcie-power, disable-netbios and the power plans, but make them verified writes with a captured original.
- Add a Windows 11 Game Mode / GameConfigStore pass: verify the keys that the existing game-dvr tweak writes and add `AllowAutoGameMode`.
- Add a NIC pass for interrupt moderation, RSS queues and EEE/flow control (some already exist: check them), applied to the active adapter only.
- Add telemetry reduction using documented policies and services only, with the current value captured.

**UI performance:** `reapplyReverted` and batch runs currently fire `runPS` sequentially (limit 4). Batch independent registry writes into one `reg import` or one PowerShell call per tweak group. Measure with before/after timings using the existing journal timestamps.

### [CLEANUP]
- **Dead functions** in index.html: tSub (576), pcTierBadge (1525), settingsToggleUpdateGuard/GameShield/GameWatcher/AutoPulse (1954–1971), _getAudioCtx (2181), settingsFpsHudSizeChange (2242), shadeColor (2357), doGameBoost/doBoostRestore (3282/3298), doGameScan (5185), saveCurrentProfile (7450), scanAllConflicts (7886), loadHistoryChart (9655–9697), aomRenderRunPlanPreview (10704–10765). Also js/fivem-logic.js:532 `copyFivemReport`, js/ui-helpers.js:131 `_promptModalCancel` and :338 `pinkHex`. Each name is re-grepped (including string-built names) before deletion.
- **Preload methods and handlers with no caller:** ariaBeforeTweak/ariaAfterTweak (main.js:13730–13825), discordSetTweaks/discordSetActiveGame, fivemIniBatch, getGameWatcherStatus, getRecycleBinSize, runPingTests, sensorGetSchema/sensorGetRate/sensorBridgeStatus, and the unused listeners the IPC report lists. Remove the preload entry and the handler together.
- **IPC events with no listener or no sender:** `power-limit-recovered`, `update-guard-expired`, `budget-*`, `pulse-session-end`.
- **Packaging:** `asarUnpack` and main.js reference `assets/lhm|fancontrol|cpuz|ryzenadj|scewin|DDU`, which are not in the repo. Check whether they are gitignored, expected at build time, or dead. `design-*.html` is already excluded from the installer, so leave it. `tools/show-tweak.js` is unreferenced (medium confidence), so leave it unless confirmed.
- **Electron 45 deprecations:** replace sync `safeStorage` calls with the async variants.
- **Remaining small items:** raw `alert()` at index.html:12580, return-shape inconsistency (`reason` vs `error`).

## Implementation steps
Each step ends with a re-grep of the touched lines, `npm test`, and `npm run check` (filtered). One commit per step is made only if you ask.

1. **Central result tracking (fixes #1 and the root cause of most fake-success cases).**
   - In lib/journal-runner.js, record every `ps`/`cmd`/`reg` call's `{ok,err}` into the current invocation's `failures` list.
   - In lib/journal-service.js `invokeTweak` and the batch path, return `{ok:false, partial:true, failures}` (and skip setting the `tweak_<id>` flag) when a write that matters failed. Treat "key already absent" and optional-service lookups as non-fatal via a small allowlist of known-benign patterns, to avoid a flood of false failures.
   - Surface failures in the existing toast/result UI with `en` and `fi` strings.
   - Extend test/journal-service.test.js and test/journal-runner.test.js.
2. **Restore point hardening (main.js:2555–2600, 4484–4511, journal-service.js:81–93).**
   - Add an admin check up front with a clear message.
   - Check the SR and VSS service state and enable them without permanently changing the VSS start type: record the original start type and restore it afterwards.
   - Save the user's original `SystemRestorePointCreationFrequency` and put it back.
   - After creating a point, re-read `Get-ComputerRestorePoint` and confirm a new sequence number. If none appeared, the creation failed.
   - Make one shared helper `ensureRestorePoint(reason)` returning `{ok, seq, error, guidance}`.
   - Call it before any tier-2+ single tweak, `run-fix`, `reapplyReverted`, and all batch/Auto-Optimize paths. On failure, block the risky tweak and show guidance. Offer an explicit "continue without a restore point" only for tier 1.
   - Add a test for the helper with stubbed runners.
3. **IPC robustness.**
   - Add a small `safeHandle(channel, fn)` wrapper in main.js that applies default arguments, catches throws, and returns `{ok:false, error}`. Apply it to the handlers with unguarded destructuring and `assertPositiveInt`.
   - Fix `list-restore-points` to always return an array, with a separate error channel.
   - Add `window.addEventListener('unhandledrejection')` in the renderers, logging and toasting.
   - Normalize new returns to `{ok, error?, data?}` while keeping `reason` readable for existing callers (the codebase uses `ok`, not `success`).
4. **Fix fake-success paths (list #7, #8, #6).** Check results before reporting, enforce backup-before-write (abort when the backup fails), keep snapshots until the restore is confirmed, and make the Update Guard fail loudly and retry on quit. Update the renderer callers (index.html:1955–2092, 2291, 5161, 8036, 14701) to read `{ok}`.
5. **Fix IPC wiring bugs.**
   - `presetId` in index.html:14083.
   - Send Pulse-window events to the Pulse window and drop or implement `budget-tick`/`pulse-session-end`.
   - Scheduler options in main.js:12205 and system-scheduler.js.
   - Apply the FPS HUD corner in fps-hud.html and main.js.
   - Free-user feedback for `open-pulse-window`.
   - Premium check on `rename-profile`.
6. **Tweak correctness.**
   - Fix `gpuClassIndexes` to match the vendor against the adapter's `ProviderName` / `MatchingDeviceId` rather than a loose pattern.
   - Fix the four `run-tweak-health` checks, and make the pre-flight scan read real state.
   - Make Restore buttons use the captured original where the journal has one (reuse the journal undo path in lib/journal.js:151 rather than hardcoded values).
   - Route the DNS tweaks and fix-usb-ghosting through the journaled runners.
   - Correct the manifest "exact" labels and add the missing manifest entries (check with `node tools/journal-coverage.js --check`).
   - Fix the harmful items listed under [HIGH] (fix-2502, Firefox bookmarks, nuget, Prefetch, canary, ipv6 value, port range).
   - Add a stronger confirmation plus a mandatory restore point for the tier-3 security-lowering tweaks.
7. **Tweak upgrades and removals** per [PERFORMANCE IMPROVEMENTS]. Retire placebo tweaks into a `RETIRED` map, so existing `tweak_<id>` flags and journal entries don't break. For retired tweaks that are currently applied, show a one-time "restore to Windows default" prompt. Implement the MMCSS, Game Mode and NIC upgrades, each with a rationale string (`en`/`fi`) and a verified undo.
8. **Dead code sweep.** Delete the listed functions and the orphaned preload/handler pairs, re-grepping each name first. Prune the `asarUnpack` entries only if they are confirmed unused.
9. **Misc.** Async `safeStorage`, remove `alert()`, add an `en`/`fi` check via `tools/check-keys.js`.

## Deviations from the audit prompt
- The prompt asks for `{success, error, data}`. The codebase uses `{ok}` in 448 places and `success` in none, so I standardize on `{ok, error?, data?}`.
- Roughly 170 of the 350+ empty catches are intentional best-effort (telemetry, UI effects, optional cache reads). I fix the dangerous ones, not all of them.
- I keep the security-lowering tweaks (users choose them knowingly) and add warnings and a mandatory restore point, rather than removing them.
- IRQ affinity is a stub, so I remove the dead panel instead of implementing it.

## Verification
- After each step: `npm test` and `npm run check`, output filtered to errors.
- New unit tests for the failure tracking, `ensureRestorePoint`, `safeHandle` and the GPU vendor match.
- Run the app (`node_modules\electron\dist\electron.exe .`, which launches reliably here). Check the console for IPC errors, then in the UI: apply and undo a tweak, force a failure (non-admin), create a restore point twice within 24h, open the Pulse window and check the thermal progress bar.
- Final re-grep: no handler without a preload method, no preload method without a caller, no inline `onclick` to an undefined function.
