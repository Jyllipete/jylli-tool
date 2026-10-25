# Audit: Auto-Optimizer & Smart Profile Wizard

*Code-verified answers to all Section 2 questions from the Feature Sprint prompt.*
*Generated: 2026-05-19*

---

## 2.1 — Auto-Optimizer Audit

### Trigger & Detection

**What triggers the Auto-Optimizer?**
User click only. The entry point is `runAutoOpti()` in `index.html:8585`. There is no schedule trigger and no system-event trigger. The dashboard button calls this function; it is also called from within the 4-step AOM wizard flow.

**How does it detect system state before optimizing?**
`sysInfo` is populated during onboarding (wizard step 3) via `api.getSystemInfo()` which calls `detectSystemInfo()` in `main.js:860`. Data collected: CPU model/cores/speed, RAM GB, GPU name, VRAM, NVMe presence, disk usage, display resolution/refresh, network type (Wi-Fi or Ethernet), laptop vs desktop, OS version. This object is passed into `runAutoOpti()` at call time (`index.html:9296`).

**Does it check what the user is doing before applying changes?**
No. There is no detection of running games, active video calls, streaming software, or foreground application state. Optimizations apply regardless of current activity.

**Is there a debounce or cooldown?**
No. The "Fix My PC" / "Auto-Optimize" button has no guard against concurrent invocations. Rapid double-clicking will call `api.runAutoOpti()` twice, starting two concurrent runs against the same system.

**Does it differentiate idle vs gaming load?**
No. All selected tweaks run regardless of current CPU/GPU/RAM load.

---

### Optimization Logic

**What optimizations does it currently apply?**

The `aomBuildTweakList()` function (`index.html:9101`) selects from 60+ registered tweaks in `TWEAKS` (`main.js:~2180+`). Full list by category:

| Category | Tweaks |
|---|---|
| Gaming | Game DVR disable, Fullscreen Optimizations disable, MMCSS GPU Priority=8/Games=High, GPU Hardware Scheduling, Foreground priority boost, TDR timeout 10s |
| CPU/Power | Power Throttling disable (desktop only), Intel Max Perf plan, AMD Max Perf plan, CPU focus bias (DPC+MMCSS), USB Selective Suspend disable (desktop), PCIe LSPM disable (desktop), Disable HPET, TSC Sync Enhanced, Speed Shift, C-States minimization |
| Memory | SysMain/SuperFetch disable (16GB+ RAM only), Memory Compression disable |
| Storage | NTFS 8.3 names + last-access disable, NVMe StorPort latency (NVMe only), Hibernate disable |
| Network | TCP stack (autotune/RSS/ECN), QoS 20% reserve remove, network throttling index, NetBIOS disable, WPAD disable, Nagle disable, NIC interrupt moderation (Ethernet only), NIC flow control (Ethernet only), Energy Efficient Ethernet (Ethernet only), NIC hardware offloads (Ethernet only), Delivery Optimization P2P disable, DNS (optional) |
| Hardware | MSI Interrupt Mode (PCI devices), USB hub power-cycling disable, AutoPlay disable |
| Input | Mouse acceleration disable, raw aim curve 1:1, StickyKeys guard, cursor max rate (8000Hz) |
| Privacy/Telemetry | Telemetry (AllowTelemetry=1), Telemetry Zero (=0), DiagTrack service, diagnostic tasks, delivery optimization solo mode |
| UI | Visual Effects → Best Performance, Explorer startup optimize, Windows tips disable, UWP background apps disable, boot sound disable |
| System | Cortana+WSearch indexer (conditional), Cortana blackout, auto-maintenance disable, Mixed Reality/Telephony services, Sensor Monitoring service, App Compat Scanner, compat tasks, security quiet mode, security toast disable, Defender quiet mode (conditional), OneDrive sync disable (conditional), Bluetooth hard off (conditional) |
| FiveM | FiveM/GTA5 CPU priority, I/O priority, MMCSS, FSO disable, GPU pre-emption, network tweaks, hang-on-disconnect fix, StreamingMemory 1024MB, command-line flags |

**Are optimizations hardcoded and static, or adaptive?**
Partly adaptive. Tweak selection is conditional on: GPU model (for HWSCH), CPU brand (for power plan), laptop flag (skip power/USB/PCIe tweaks), Wi-Fi flag (skip NIC tweaks), RAM GB (SysMain requires 16GB+), NVMe flag (StorPort tweak), user preference answers (10 questions). The actual PowerShell commands within each tweak are hardcoded.

**Does it apply all optimizations every time?**
No — only the subset passing the `safe` and `skip` conditions in `aomBuildTweakList()`, minus what the preflight scan already shows as applied (`preApplied`).

**Is there logic to skip already-applied tweaks?**
Partially. The preflight scan (`pf_tweak_states` in localStorage) marks tweaks as applied. This cache is up to 24 hours old. There is **no real-time re-check** at run time — if a tweak was applied after the last preflight scan, it will be re-applied.

**Does it measure before/after?**
No. There are no pre/post metrics collected. The result returned is `{ ok: true }` with no impact data.

---

### Safety & Reversibility

**Does it create a restore point before running?**
Yes. This is mandatory. `createRestorePointInternal()` (`main.js:2157`) runs first. If it fails, the entire run aborts: `return { ok: false, aborted: true, reason }`. No tweaks are applied without a successful restore point.

**Is every action reversible?**
Mostly. Every tweak in the `TWEAKS` registry has both `apply` and `restore` functions. Exceptions:
- Winsock reset (`netsh winsock reset`) — noted as one-time/irreversible, no rollback
- `bcdedit` changes (HPET, TSC, C-states) — reversible in principle but require specific reverse commands; restore functions exist
- Power plan creation — reversible by deleting the created plan; restore function deletes it
- MSI Interrupt Mode — requires manual Device Manager revert per device; restore function does attempt to revert registry keys

**What happens if interrupted mid-run?**
The restore point exists but tweaks applied before the crash remain applied. There is no transaction log that tracks exactly which tweaks completed. The changelog only records entries when `add-changelog-entry` is called (which happens separately from the optimizer run — it is not called by the auto-opti handler itself, only by individual tweak runs from the Advanced tab).

**Does it have a timeout per step?**
No. Each `tweak.apply()` call can hang indefinitely if PowerShell blocks (e.g., WMI query timeout). The entire run hangs with no UI feedback.

**If one optimization fails, does it stop or continue?**
Continues. The catch block (`main.js:2115`) swallows the exception with `send(warn)` and moves to the next tweak. However, the failure is not tracked — `failedTasks` is never recorded, and the final result `{ ok: true }` is returned regardless of how many tweaks failed.

---

### Results & Feedback

**What does it report to the UI when done?**
The final return is `{ ok: true }` (or `{ ok: false, aborted: true, reason }` on abort). The renderer checks `result?.aborted` and shows either a completion banner or an abort message. No per-task pass/fail data is returned.

**Are before/after metrics captured?**
No. There is no RAM freed, CPU% delta, or latency change measurement.

**Is the result log human-readable?**
The live run log (`#aom-run-log`) shows `[step/total] label` entries in green monospace. Each log line from `send()` also appears there. The log is human-readable but only shows task name — not outcome (pass/fail/skipped).

**Is optimization history stored persistently?**
Via the changelog (`jt_changelog.json`, max 50 entries). The auto-opti run itself does not write changelog entries — individual tweak applications from the Advanced tab write entries when manually applied/restored. The auto-opti run has no changelog integration.

---

### Performance of the Optimizer Itself

**Does running the optimizer cause a noticeable spike?**
Moderate. PowerShell processes are spawned sequentially (one at a time), each taking 100ms–3s. Total runtime for a full run is typically 30–90 seconds. No parallelism means the CPU spike is sustained but moderate.

**Are tasks run in parallel, sequentially, or a mix?**
Sequentially. The `for` loop in `main.js:2103` awaits each task before starting the next.

**Are renderer-blocking operations present?**
The optimizer runs in the main process via IPC. The renderer is not blocked — it only updates UI via `auto-opti-progress` events.

---

## 2.2 — Smart Profile Wizard Audit

### Wizard Flow

**How many steps? What does each do?**

There are **two separate wizard flows**:

**A) Onboarding Wizard (6 steps, `index.html:4147`):**
1. Admin check
2. Create restore point
3. Windows Health Check (SFC + DISM + S.M.A.R.T.)
4. System scan (hardware detection)
5. Pre-Flight scan (applied tweak detection, Safety Score)
6. Choice: Auto-Optimize path or Manual browse

**B) Smart Profile Wizard (3 steps, `index.html:9637`):**
1. Use case selection (FPS / Open-World / Streaming / Mixed)
2. Game selection (8 hardcoded games)
3. Review + apply

**Is it question-based, automatic, or a mix?**
The SPW is question-based (user selects use case and games). Hardware data from the already-completed system scan (`sysInfo`) is used to filter tweaks (e.g., NIC tweaks skipped for Wi-Fi), but no new hardware detection runs inside the SPW.

**How long does the wizard take?**
SPW: ~30–60 seconds to complete including review. Onboarding: 5–10 minutes (Health Check takes 1–3 minutes).

**Can the user go back?**
SPW: Yes. Step 2 → Step 1 and Step 3 → Step 2 both work. Step 1 has only a Close button (no back).
Onboarding: Yes, all steps except Step 0 have a Back button.

**What happens if the user quits halfway?**
SPW: Module-level variables `_spwUseCase` and `_spwGames` are reset **only when `spwOpen()` is called** (i.e., wizard is reopened). If the modal is closed via `spwClose()` without completing, the variables retain their last-set values. The next `spwOpen()` call correctly resets them (`index.html:9641–9642`), so on re-open from scratch this is safe. **However**, if some other code path calls `spwStep1()` without going through `spwOpen()`, stale state would persist. No localStorage draft is saved.

---

### Profile Detection & Intelligence

**What system data does the wizard read to inform recommendations?**
- GPU model name (for HWSCH tweak applicability)
- RAM GB (for SysMain tweak applicability, requires 16GB+)
- NVMe presence (for StorPort tweak)
- Network type (Wi-Fi vs Ethernet — NIC tweaks excluded for Wi-Fi)
- Laptop flag (power/USB/PCIe tweaks excluded for laptops)

**Does it detect GPU model and VRAM?** GPU model: yes. VRAM: detected and stored in `sysInfo.vramMB` but not used in profile recommendations.

**Does it detect CPU core count and speed?** Yes, stored in `sysInfo.cpuCores` and `sysInfo.cpuSpeed`. Not used in SPW recommendations (only CPU brand matters for power plan selection).

**Does it detect RAM amount and speed?** Amount: yes (used for SysMain gate). Speed: detected but not used in SPW.

**Does it detect running games or installed launchers?** No. No launcher detection (Steam, Epic, etc.). No process scanning for running games.

**Does it detect display refresh rate?** Yes, stored in `sysInfo.displayRefresh`. Not used in SPW recommendations.

**Does it detect laptop vs desktop?** Yes, used to exclude power/USB/PCIe tweaks.

**Does the profile differ meaningfully by hardware?**
Moderately. GPU gates HWSCH, RAM gates SysMain, NVMe gates StorPort, Ethernet gates NIC tweaks, Desktop gates power/USB tweaks. The use case selection (FPS/Open/Stream/Mix) adds different tweak subsets. So two users with identical hardware but different use cases get different profiles, and two users with the same use case but different hardware also differ. However, the base profile (regardless of use case) is the same for everyone.

---

### Profile Content

**What settings does a generated profile control?**
A profile stores a snapshot of which tweaks were applied: `{ tweak_id: 'applied' | 'not-applied' }`. When applied, it re-runs those tweaks. The profile does not store the tweak's target value — it stores a pass/fail state token. Full list of tweak categories a profile may contain: Gaming, CPU, GPU, Network, Storage, Power, Input, Privacy, System, FiveM.

**Does the profile include the listed settings?**
- Windows Power Plan: ✅ (Intel/AMD Max Perf plan)
- Process priority rules: ✅ (foreground boost, FiveM priority)
- GPU power mode: ✅ (NVIDIA max perf, GPU HWSCH)
- Network adapter settings: ✅ (NIC tweaks)
- Service disabling: ✅ (SysMain, Cortana, Bluetooth, etc.)
- Startup item management: ❌ (not in current profiles)
- In-game overlay disabling: ✅ (Game DVR, Xbox Game Bar)
- Xbox Game Bar disabling: ✅
- Memory Compression: ✅
- CPU parking: ✅ (via power plan tweak)

**Are profiles stored in readable JSON?** Yes. `jt_profiles.json` in `%APPDATA%\Jylli Tool`, pretty-printed.

**Can users create, clone, rename, delete?**
- Create: ✅
- Delete: ✅
- Clone: ❌ (no clone operation)
- Rename: ❌ (save-new + delete-old workaround only)

**Are profiles applied atomically?**
No. Each tweak runs sequentially. If the process is interrupted mid-apply, partial application occurs with no rollback.

---

### Gamer-Specific Intelligence

**Does the wizard know competitive FPS vs casual?**
Partially. FPS use case adds `SPW_FPS_EXTRA` tweaks (more aggressive latency/gaming settings). Open-World adds `SPW_OPEN_EXTRA`. But the distinction does not affect aggressiveness of service disabling, registry tweaks, or memory settings — these are the same regardless.

**Does it detect monitor refresh rate and optimize accordingly?**
Refresh rate is detected but not used in profile decisions.

**Does it detect NVIDIA vs AMD and apply GPU-specific optimizations?**
Yes. GPU HWSCH tweak checks GPU model. NVIDIA Max Performance mode is NVIDIA-specific. AMD Max Perf power plan is AMD-specific. Intel Max Perf is Intel-specific.

---

### UX Quality

**Is the wizard visually compelling?**
Moderate. The SPW uses a purple modal with card-based use case selection and a 2-column game grid. Transitions are instant (no animation). Cards have hover border color changes but no lift/shadow effect. Step indicators are simple colored dots. The onboarding wizard is more polished with dot progress and spinner icons.

**Does it explain why it's making recommendations?**
The review step (Step 3) shows categorized tweak chips with counts but no per-tweak explanation of why it was selected or what it does.

**Does it feel intelligent and personalized?**
Basic personalization. The use case selection changes the tweak set. Hardware detection gates inapplicable tweaks. But there is no real-time explanation of detected hardware, no "we found your RTX 4070" moment, and no gaming-specific intelligence beyond the FiveM detection.

---

## 2.3 — Bug Classification

### AUTO-OPTIMIZER BUGS

| ID | Feature | File | Severity | Description | Root Cause | Fix |
|---|---|---|---|---|---|---|
| AO-1 | Auto-Optimizer | `main.js:2085`, `index.html:9275` | HIGH | `progress()` payload has no task ID or status field. UI log shows only `[step/total] label` in green — no distinction between success, failure, and skip. | Progress event defined as `{ step, total, label }` only. | Add `id` and `status: 'running'|'ok'|'failed'|'skipped'` fields. Update renderer to colour-code each log line. |
| AO-2 | Auto-Optimizer | `main.js:2103` | HIGH | No idempotency check at run time. Preflight cache is up to 24h stale. Tweaks already applied will be re-applied silently. | `alreadyApplied` is never checked inside the run loop; only the stale preflight state is used during planning. | Add `tweak.check()` function to high-risk tweaks (Game DVR, MMCSS, power plan). Skip with `status:'skipped'` if already applied. |
| AO-3 | Auto-Optimizer | `main.js:2115` | HIGH | When a tweak throws, the catch block sends a warn message but does not update the progress event with `status:'failed'`. The final result `{ ok: true }` is returned even if every single tweak failed. | No `failedTasks` tracking; catch block only calls `send(warn)`. | Track `failedTasks[]`. Return `{ ok: true, failedTasks }`. Emit `progress(..., status:'failed')` from catch block. |
| AO-4 | Auto-Optimizer | `index.html:9133–9136` | HIGH | If `sysInfo.isWifi` is `undefined` (detection failed or not yet run), `!si.isWifi` evaluates to `true`, incorrectly marking NIC tweaks as safe. NIC tweaks could then run on a Wi-Fi adapter. | `isWifi` defaults to `false` in `detectSystemInfo()` (`main.js:870`) but the renderer's `sysInfo` could be stale or empty if system scan step was skipped. The gate uses `!si.isWifi` which is truthy for both `false` and `undefined`. | Change to `safe: si.isWifi === false` to require explicit false. |
| AO-5 | Auto-Optimizer | `main.js:2154` | MEDIUM | No Session Impact Report. Result is `{ ok: true }` with no data on tweaks run, failures, or impact metrics. | Not implemented. | Return `{ ok: true, ran: tweakCount, failed: failedTasks.length, failedTasks }`. |
| AO-6 | Auto-Optimizer | `main.js:2111` | MEDIUM | No per-task timeout. A hanging PowerShell call blocks the entire run indefinitely. | `tweak.apply()` is awaited with no timeout. | Wrap each apply in `Promise.race([tweak.apply(...), rejectAfter(30000)])`. Emit `status:'failed'` on timeout and continue. |
| AO-7 | Auto-Optimizer | `main.js:2109–2114` | MEDIUM | `tweak.apply()` return value is discarded. Failures detected only via exception — not PS exit code. A PS command that exits 1 but doesn't throw is silently treated as success. | `runPS()` returns `{ ok, out, err }` but apply functions typically `await ps(...)` without checking `.ok`. | Apply functions should check `r.ok` and throw on failure, or the runner should check the return value. |
| AO-8 | Auto-Optimizer | `main.js:2182` | LOW | `buildAutoOptiSteps()` is a legacy parallel implementation of the same tweaks as `TWEAKS`. It is the fallback when `selectedTweaks` is empty. These two implementations can drift. | Legacy code not removed after TWEAKS registry was introduced. | Add deprecation warning log when this path executes. Document intent to remove. |
| AO-9 | Auto-Optimizer | `index.html:8585` | HIGH | No guard against double-click. Two concurrent `api.runAutoOpti()` calls will both create restore points and both apply all tweaks simultaneously, causing race conditions on the same registry keys. | No `_aomRunning` flag. | Add `let _aomRunning = false` guard. Set true on start, false on completion/abort. |
| AO-10 | Auto-Optimizer | `main.js:2153` | LOW | `sessionTweaksCount` accumulates across calls without reset. On a new app launch, the starting count is 0 (it is module-level, reset on process restart), which is correct — but if `run-auto-opti` is called multiple times in one session, the count compounds. This count is used only for Discord RPC and is a minor display issue. | Module-level accumulator. | Low priority — note for future analytics improvement. |

### SMART PROFILE WIZARD BUGS

| ID | Feature | File | Severity | Description | Root Cause | Fix |
|---|---|---|---|---|---|---|
| SPW-1 | Profile Wizard | `index.html:9640–9648` | HIGH | No draft persistence. Closing SPW mid-flow loses all state. Reopening starts from step 1. | State stored only in module-level `_spwUseCase` and `_spwGames`. No localStorage write per step. | Save `{ useCase, games: [...], step }` to `localStorage.spw_draft` after each step. On `spwOpen()`, check for draft and offer resume. |
| SPW-2 | Profile Wizard | `index.html:9648` | MEDIUM | `spwClose()` does not clear `_spwUseCase` or `_spwGames`. While `spwOpen()` correctly resets them on re-open, `spwClose()` itself leaves stale data — if any future code calls `spwStep1()` directly it would see the previous session's state. Also, no `spw_draft` to clear (per SPW-1 fix, close must also remove the draft). | `spwClose()` only hides the modal. | Clear module vars and `localStorage.removeItem('spw_draft')` inside `spwClose()`. |
| SPW-3 | Profile Wizard | N/A | N/A | No profile import feature exists in the codebase. SPW-3 (import validation) is not applicable. | Feature not implemented. | No bug to fix; note as missing feature for elevation sprint. |
| SPW-4 | Profile Wizard | `main.js:1257–1260` | HIGH | `load-profile` returns raw stored data with no reconciliation. If the system state has drifted (a tweak was manually reverted), the profile still shows `applied` with no warning. | `loadProfiles()` returns raw JSON; no system-state check. | After loading, compare each tweak's stored state against a quick system check (where available). Return `{ ...profile, driftDetected: bool, driftedTweaks: [] }`. Renderer shows a warning banner. |
| SPW-5 | Profile Wizard | `main.js:1251–1255` | MEDIUM | Profile JSON has no `version` field and no rollback data. If a profile applies a tweak, there is no record of what the previous registry value was. | `save-profile` handler stores only `{ name, tweaks, savedAt }`. | Add `version: 1` to saved profiles. Add `rollbackData: {}` placeholder. Handle profiles missing `version` as `version: 0` for backward compat. |
| SPW-6 | Profile Wizard | `main.js:1261–1266` | MEDIUM | `delete-profile` silently deletes the profile record. If the profile had tweaks applied to the system, those tweaks are NOT reverted. User has no warning. | Handler only removes from `jt_profiles.json`. | Return `{ ok: true, hadAppliedTweaks: bool }`. Renderer shows: "Tweaks from this profile were NOT reverted. Use Changelog to undo them individually." |
| SPW-7 | Profile Wizard | `index.html:9595–9635` | MEDIUM | Step 2 game selection is hardcoded to 8 games. No Steam/Epic/GOG launcher detection. Users without those games see irrelevant options; users with other games cannot add them. | `SPW_GAMES` is a static array. | Note as feature gap for elevation sprint (requires launcher detection). Low fix priority for this session. |
| SPW-8 | Profile Wizard | `main.js:1250–1266` | MEDIUM | No clone or rename operations. Save-new + delete-old workaround is the only path, which loses rollback data from the original profile. | IPC handlers not implemented. | Note as feature gap for elevation sprint. |
| SPW-9 | Profile Wizard | `index.html:9651–9682` | LOW | SPW uses purple (#9b59b6) theme vs app's cyan theme. This is intentional design differentiation (wizard = purple). Not a bug. | Design choice. | No action needed. |
| SPW-10 | Profile Wizard | `index.html` (profile save UI) | LOW | `save-profile` IPC handler overwrites silently if name already exists (`main.js:1251–1255` does `profiles[name] = ...`). The renderer shows no confirmation dialog before overwriting. | No pre-check in save UI. | Before calling `api.saveProfile()`, check if name already exists via `api.listProfiles()`. If yes, show `showConfirm()` dialog. |

---

## Summary

**Total bugs found: 20**
- CRITICAL: 0
- HIGH: 7 (AO-1, AO-2, AO-3, AO-4, AO-9, SPW-1, SPW-4)
- MEDIUM: 8 (AO-5, AO-6, AO-7, AO-8 reclassified below, SPW-5, SPW-6, SPW-7, SPW-8)
- LOW: 3 (AO-8, AO-10, SPW-9 non-issue, SPW-10)
- N/A: 1 (SPW-3 — feature doesn't exist)
- Not a bug: 1 (SPW-9)

**Fix priority this session:** AO-4 → AO-9 → AO-1+AO-3 → AO-2 → AO-6 → AO-8 → SPW-2 → SPW-1 → SPW-5 → SPW-6 → SPW-10

**Deferred to elevation sprint:** AO-5, AO-7, SPW-3, SPW-7, SPW-8
