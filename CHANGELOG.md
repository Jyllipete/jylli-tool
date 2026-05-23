# Changelog

## v1.4.7 — 2026-05-23
- 3 new tweaks: Global Timer Resolution (Win11), Disable VBS, Disable AMD ULPS — all wired into auto-optimize, command palette, EN + FI translations
- Ping Tester overhaul: parallel testing (~5s vs ~60s), Deep mode, per-host grades, live timeline canvas, Before/After comparison, bufferbloat detection, test history
- Persistent Specs HUD strip below titlebar on all pages (CPU/GPU/RAM/Storage chips with click-to-expand popovers); old Home Specifications panel removed
- Full i18n pass: ~70 remaining hardcoded strings wired through i18n including status badges, modal buttons, tooltips, restore messages
- Bug fix: FiveM CitizenFX.ini Full Editor IPC clone error fixed; 6 additional bug fixes across various tabs
- UI: Debloat tab segmented control, FiveM Optimization Score tier label + progress bar + pulsing glow
- Bug reports now capture full description + steps + page; CPU/GPU names up to 50 chars; crash reports include 8 stack lines

## 2026-05-23 (3 New Research-Backed Tweaks)
- NEW tweak: Global Timer Resolution (Win11) — restores system-wide 0.5ms timer precision via GlobalTimerResolutionRequests kernel key; fixes FPS caps in games that skip timeBeginPeriod(); Win11-only with auto version check
- NEW tweak: Disable VBS (Virtualization-Based Security) — full VBS umbrella disable beyond HVCI offload; ~5-10% FPS gain in CPU-bound games; safetyTier 3 with explicit anti-cheat warning (Vanguard/FACEIT/WSL2)
- NEW tweak: Disable AMD ULPS (Ultra Low Power State) — iterates all Video registry subkeys to zero EnableULPS/EnableULPS_NA; reduces stutter in CrossFireX multi-GPU setups
- All 3 tweaks wired into command palette, hardware auto-optimize section, EN + FI translations

## 2026-05-23 (Ping Tester Overhaul)
- Rebuilt ping tester with parallel testing — all 12 hosts tested simultaneously (~5s vs ~60s before)
- Added Deep mode (30 pings) alongside Quick mode (10 pings) for statistical accuracy
- New metrics per host: Min, Max, P95, Jitter (std dev), packet loss with proper granularity
- Letter grade (A+/A/B/C/D/F) per host and overall network grade, based on weighted composite score
- Live timeline canvas: all 12 hosts overlaid as colored lines, animates as pings arrive
- Distribution histogram per host: 5ms-bin bar chart colored green/amber/red by latency zone
- Before/After comparison mode: save a baseline snapshot, re-run after tweaks, see per-host deltas
- Bufferbloat detection toggle: pings run while streaming 25MB to reveal router queue bloat
- Fix recommendations per host: packet loss, high jitter, and high latency each surface a targeted tip
- Test history log: last 5 runs shown with grade, score, mode, and timestamp
- Full EN + FI translations for all new UI strings

## 2026-05-23 (Specs HUD Strip)
- Added persistent hardware HUD strip below the titlebar, visible on all pages
- Shows CPU, GPU, RAM, and Storage chips with key specs at a glance
- Clicking any chip opens a detailed popover (model, cores/threads, VRAM, driver, RAM type/speed, disk size/usage)
- Removed the old Specifications panel from the Home dashboard to eliminate duplication
- Home dashboard bottom grid updated to 2-column layout (Optimization Overview + Quick Health)

## 2026-05-23 (Full i18n Coverage)
- All ~70 remaining hardcoded English UI strings wired through i18n system (placeholders, window controls, tooltips, modal buttons, status badges, restore point messages)
- applyI18n() extended with data-i18n-placeholder and data-i18n-tooltip attribute support
- Status badges (APPLIED / RESTORED / DEFAULT / RUNNING / RESTORING / PRE-APPLIED) now translate to Finnish
- Modal Cancel/Confirm buttons, bug report Send/Sending, and undo snackbar label now translate
- Profile action tooltips (Rename, Clone, Export, Delete), toggle tooltips, and restore point error messages now translate
- What's New changelog fallback now shows Finnish when FI language is selected
- FiveM: added fivem-disable-update-checks tweak name/desc to Finnish LANG
- pulse.html, arma-settings.html, fivem-settings.html: tooltip translations wired up in applyTranslations()

## 2026-05-23 (CitizenFX.ini fix)
- FiveM: CitizenFX.ini Full Editor now loads correctly — fixed "An object could not be cloned" IPC error caused by function properties being sent over Electron IPC; danger warnings still display correctly using pre-evaluated hints

## 2026-05-23 (UI Polish)
- Debloat tab: "Desktop apps" / "Store apps" buttons replaced with a clean segmented control with a smooth sliding indicator and proper spacing before the app list
- FiveM: CitizenFX.ini Full Editor now correctly surfaces errors instead of silently failing — real error reason is shown in the UI
- FiveM: Optimization Score card now shows a tier label (Unoptimized → Fully Optimized), an in-card score progress bar, a pulsing glow when score is very low, and a contextual CTA that points to CitizenFX.ini tweaks once you're fully optimized

## 2026-05-23
- Bug reports now send full description, steps, and page info to Discord analytics channel
- Bug report CPU/GPU names no longer cut off at 28 characters (now up to 50)
- Crash reports now include 8 lines of stack trace instead of 5 for better debugging
