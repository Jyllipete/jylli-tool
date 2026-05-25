2. Server Bookmarks + Quick-Connect — Bookmark up to 5 servers (IP:port). Fetches live player count, map, and ping from the public FiveM /info.json API. Auto-refreshes every 60s. One-click Connect via fivem://connect/. fivem: protocol added to the allowed list.

4. Live Session HUD — fivem-hud.html — compact alwaysOnTop frameless Electron window. Shows CPU/GPU/RAM bars (every 2s) and CFX ping (every 3s). Auto-opens when FiveM is detected (if enabled via the checkbox), auto-closes on exit. Toggle checkbox in the hero card saves the preference to settings.

5. Session Timeline — Listens for aria-session-summary events (fires when a game exits). Records duration, peak CPU/GPU/RAM, and anomaly count to localStorage. Collapsible "Session History" panel at the bottom of the FiveM tab shows last 10 sessions with timestamps.

6. Per-Server Optimization Profiles — Each bookmark has a dropdown to link a Game Bundle profile. When you click Connect on a linked bookmark, Jylli auto-applies the bundle (CitizenFX.ini snapshot + tweaks) before launching FiveM.

8. Smart Tweak Conflict Detector — Added FiveM-specific rules to the existing TWEAK_CONFLICTS system: warns before applying fivem-streaming-mem on <12 GB RAM, fivem-gpu on non-NVIDIA GPUs, fivem-vm on <8 GB RAM, and fivem-worker-threads on <4 core CPUs. Warnings appear inline on the tweak rows.

---

## Session — 2026-05-25

### FiveM Tab — Hero Cards & HUD

1. Removed "WELL OPTIMIZED 14/15" score card and "Share My Setup" hero card — deemed unnecessary clutter.

2. Hero card visual overhaul — Update Readiness, Session HUD, and Resource Inspector cards now use the established CSS variant class system (`.fhc-variant-gold`, `.fhc-variant-purple`, `.fhc-variant-red`) instead of inline styles. Two new variant classes added to `style.css`.

3. Fixed Update Readiness icon — `fa-shield-check` (FA Pro, invisible) replaced with `fa-shield-halved` (FA free).

4. Session HUD card — replaced native checkbox with the app's standard `.toggle-switch` component. Card click now opens/closes the HUD. Label toggles between "Open HUD" and "Close HUD". EN + FI translations added.

5. HUD overlay redesign (`fivem-hud.html`) — reduced background opacity from 92% to 55%, removed hard border, tightened padding, softened all text/label colours. Feels like frosted glass rather than a solid card.

6. HUD click-through — `setIgnoreMouseEvents(true, { forward: true })` applied on the BrowserWindow so the HUD is never accidentally hovered while gaming. Close button removed (redundant; HUD closes from the main app or on game exit).

### FiveM HUD — Metrics Fix

7. Fixed frozen metrics while FiveM is running — root cause was `if (activeGameProfile && _lastMetrics) return _lastMetrics` which returned a permanently frozen snapshot. Extracted all PowerShell collection into `async function collectMetrics()` with a `_metricsCollecting` guard, started via `setInterval(collectMetrics, 3000)` on first `get-metrics` call. `clearInterval` on app quit.

8. Added CPU trend sparkline to HUD — canvas-based 24-point history, pink fill + stroke. Rendered on every 2s metrics poll.

### Server Bookmarks — Connect & Shortlink Fixes

9. Connect button launches FiveM without admin elevation — app runs as Administrator; `shell.openExternal('fivem://...')` inherited the elevated token, causing FiveM to reject the launch. Fixed by routing `fivem:` URLs through `explorer.exe` which always runs at user-level token.

10. cfx.re shortlink support expanded — post-resolve validation regex widened from IPv4-only `[\d.]+` to `[A-Za-z0-9.\-]+` so hostname endpoints pass. Shortlink detection regex already handled full `https://cfx.re/join/xxx` URLs as substrings.

11. Removed "System Tweaks" hero card from the FiveM tab — redundant as the tweaks are already listed directly below it.

11. EVO filter / proxied server endpoint parsing — `connectEndPoints` can return full HTTPS URLs like `"https://hostname.com/"` instead of bare `"host:port"`. Parser now detects the URL format, extracts hostname via `new URL()`, and defaults port to `30120`.

12. EVO filter server online status — servers behind EVO filter don't expose `/info.json` via HTTP/HTTPS. New `fivem-cfx-server-info` IPC handler polls the CFX API (`servers-frontend.fivem.net/api/servers/single/{code}`) for live name/players/maxClients. Shortlink-resolved bookmarks store a `cfxCode` field and use the CFX API for refresh; direct IP:port bookmarks fall back to the existing HTTP ping. Server info (name, player count) is pre-populated immediately on add from the resolve response.

13. Server ping HTTPS fallback — ping handler now tries plain HTTP first, then retries with HTTPS (`rejectUnauthorized: false`) if HTTP fails, covering proxied servers that serve over HTTPS.

---

## Session — 2026-05-25

### ARIA Advisor — Live FPS Benchmarking

1. AVG FPS + 1% Low counter in ARIA panel — rolls a 5-second PresentMon tail read every 5s and displays live AVG FPS, 1% Low FPS, and a Stability % score (how consistent framing is) as three tiles inside the ARIA panel while a game session is active.

2. Game PID targeting — PresentMon now captures only the detected game's process (resolved via PowerShell `Get-Process` at session start) instead of all GPU-presenting processes. Falls back to all-process capture if PID resolution fails.

3. 1% Low sparkline — 90-second rolling canvas sparkline of 1% Low FPS history beneath the three tiles. Clears when the game exits.

4. 1% Low floor alert — ARIA fires a toast warning if 1% Low drops below 30 FPS. 30-second cooldown prevents spam.

5. Session FPS summary — after game exit, the ARIA session summary card shows AVG FPS and 1% Low FPS chips alongside the existing peak CPU/GPU/RAM chips.

6. Per-tweak FPS delta — insight cards gain `+N FPS avg | +N FPS 1% Low` lines computed from PresentMon captures taken before/after each tweak application.

7. FPS Overlay window — always-on-top transparent `fps-hud.html` BrowserWindow (bottom-right, 160×72) showing AVG + 1% Low in large text. Auto-fades to 25% opacity after 6s of no updates. Toggle in ARIA settings. Opens automatically when ARIA detects a game; closes on game exit or ARIA disable.

---

## Session — 2026-05-25

### ARIA FPS Overlay — Bug Fixes

1. Overlay now auto-opens on game detection — `createFpsHud()` was only reachable via `ariaFpsStart()` which was gated behind PresentMon spawning successfully. Moved `createFpsHud()` call to the game-detected branch (independent of PresentMon) so the window always opens when a game starts with ARIA + FPS Overlay enabled. Also fires from `ariaStart()` for the late-enable path.

2. Fixed overlay invisible due to missing `ready-to-show` pattern — window was created with default `show: true` causing it to appear blank before HTML rendered. Changed to `show: false` + `ready-to-show` → `show()`, matching the FiveM HUD pattern. Added `setIgnoreMouseEvents(true, { forward: true })` so the overlay is click-through.

3. Fixed `alwaysOnTop` not piercing fullscreen games — changed from boolean `true` to `setAlwaysOnTop(true, 'screen-saver')` which sets Win32 `HWND_TOPMOST` at the highest z-order level, required to render above DirectX/Vulkan fullscreen surfaces. Applied same fix to the FiveM HUD.

4. Bundled PresentMon — `PresentMon.exe` was missing from `assets/presentmon/` entirely, causing `presentMonAvailable()` to silently return false and block all FPS tracking. Added the executable and fixed `PRESENTMON_EXE` to use the existing `assetPath()` helper (consistent with LHM, CpuZ, RyzenAdj, SCEWIN). Added diagnostic log warnings when PresentMon is unavailable or fails to spawn.

5. Fixed overlay appearing on wrong monitor — cursor-based display targeting caused the overlay to land on the Jylli monitor instead of the game monitor. Reverted to `getPrimaryDisplay()` so it always appears bottom-right of the primary display.