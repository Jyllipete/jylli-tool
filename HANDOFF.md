# Handoff — Jylli Tool 1.6.0 rework (resume from here after /clear)

## UI 2.0 status (2026-10-30)

- Generated CSS: `css/inline-extract.css` holds 164 `jx-N` classes made from repeated static inline styles in index.html and js/fivem-logic.js (inline `style="` count 1790 -> 964; the rest are dynamic). Page style signatures were compared before and after.
Docs: `DESIGN_AUDIT.md` (what was wrong), `DESIGN_SYSTEM.md` (tokens, rules, decisions), `design-preview.html` (approved mock), `design-comparison.html` (before/after screenshots).
- Done: light theme (`colorScheme` setting, `js/theme-sync.js` applyScheme, `:root[data-scheme="light"]` in `css/tokens.css`), shell, Home/Settings/Processes/History/Scheduler on `ui.*`, Fixes, Latency and Diagnostics rebuilt on `ui.*` (js/pages/optimize-fixes.js, gaming-latency.js, system-diagnostics.js); 458 unused CSS rules pruned (`deadcss.js` idea: drop rules whose class/id never appears in any source), Pulse order and readability, translated command palette + shortcuts, legacy CSS/inline colours mapped to tokens, automatic a11y labels (`_a11yEnhance` in `js/ui-helpers.js`), `tools/check-contrast.js`.
- Real-app check (2026-10-30, re-run after the style extraction): launched with --remote-debugging-port, 14 routes in en + fi and dark + light, 0 console errors (driver: scratch cdp.js using Node global WebSocket; found and fixed an ASI bug in the health badge). Not done (honest list): the other 10 legacy pages are normalised through CSS/tokens, not rebuilt on `ui.*`; `css/style.css` and `css/pro.css` still exist because those pages need them; Font Awesome stays (Lucide dropped); modals are restyled, not moved to one `j-modal` flow; no light-theme pass on the BIOS and FiveM inline-styled sections beyond the lint (see `--lint --scheme light`).
- Also verified: confirm dialog + lock screen in light; Finnish UI has no English leftovers per `--lint` (english-in-fi). Verify without screenshots: `electron tools/ui-preview/preview-main.js --out <dir> --tag x --lint --noshot [--scheme light]` prints a text report per page (font size, contrast, targets, names, glow, side rails). jsdom scripts: `tools/ui-preview/dom-smoke.js`, `dom-interact.js` (npm i --no-save jsdom@24 in a scratch folder, set NODE_PATH).
- Gotcha: the Bash tool strips backslashes inside heredocs; write patch scripts with the Write tool.

Plan (approved): `C:\Users\Pete\.claude\plans\project-folder-for-this-bubbly-whale.md`
Projects: app = `C:\Users\Pete\Documents\Projektit\jylli-tool-1.5.9` (git, local only, nothing pushed), bot = `...\Projektit\jylli-bot` (branch `v2-secure-auth`, local only).
Hard rules: **never** `npm start` / launch the real app / anything elevating (UAC). User is away. Don't push to GitHub or deploy.

## Shell gotchas
- Bash tool collapses `\\` to `\` inside heredocs: write any patch script containing backslashes with the **Write tool**, not a heredoc.
- Use Windows paths inside `node -e` (`C:/Users/...`), not `/c/...`.
- `ELECTRON_RUN_AS_NODE=1` is set in this environment: run Electron with `env -u ELECTRON_RUN_AS_NODE`.
- Don't `git checkout <file>` (autocrlf converted a file once; repo now has `core.autocrlf=false`).
- Patch workflow used so far: small node scripts in the scratchpad that do exact-string replacements and abort on any miss.

## Checks (all pass at last commit)
`node tools/check.js` (syntax of main/preload/js/lib/test + every inline <script>), `node tools/scan-injection.js`, `node --test "test/**/*.test.js"` (19 tests).
Screenshot harness: `env -u ELECTRON_RUN_AS_NODE npx --no-install electron tools/ui-preview/preview-main.js --out <dir> --tag <name> --lang en --tier premium|free --pages a,b --windows`
(offscreen windows + mock `window.api` from `tools/ui-preview/fixtures.js`; add fixtures when a page renders empty). Baseline shots (old UI) are in the scratchpad `shots/baseline`.

## DONE (committed)
Phase 0 secrets rotated by user. Phase 1: no secrets/webhook in client, Ed25519 signed entitlements (`lib/auth.js`, `lib/entitlement.js`, public key embedded; private key + TOKEN_KEY only in `jylli-bot/.env.local` — user must copy to Railway, see `jylli-bot/RAILWAY_ENV.md`), opt-in telemetry + consent dialog, settings IPC sanitized (+corruption protection), command-injection fixes (`lib/validate.js`, `lib/shell.js`), safe paths/ini/xml/BIOS writers, XSS fixes (`js/esc.js`: escHtml/escAttr/jsArg/domId), sandboxed windows, `preload-overlay.js`, nav guards, single-instance lock, CSP. Phase 2: fail-closed tiers (all tweaks tagged), `invokeTweak`, snapshots (`lib/snapshot.js`) for MSI/NetBIOS/power plan/Pulse, restore-default fixes, Game Boost/freeze/CPU-pin fixes, BIOS refresh-before-write, etc. Phase 3 (mostly): runPS never rejects, quit cleanup + update-on-quit, history debounce, Electron 33→45 (+builder 26), dead deps removed, `on*` return unsubscribe, init guard, nav token, no page-HTML cache, CS2 dead page removed, sensor pipe retry, secondary-window language via URL. Bot v2 (`server.js`) done + tests.
Phase 4 harness done. Phase 5 started: `css/tokens.css` re-tokened (graphite + accent #8B7CF6, contrast fixed), themes are accent-only, Geist bundled (`css/fonts.css`, `assets/fonts`), **`css/pro.css`** (design-system layer, linked after style.css in index.html) restyles shell/cards/buttons/switches/tabs/inputs/dialogs; title bar + SVG window buttons fixed.

## DONE since last handoff
Phase 5 page review (all 17 pages captured and checked; flat tweak/quick-win cards, Pulse legibility, BIOS recovery guide on tokens, scheduler/startup placeholders). Phase 7 (tokens+fonts linked in secondary windows, `js/theme-sync.js` applies saved accent at window load; no live broadcast; fps-hud-settings uses preload-overlay so it keeps defaults). Phase 8 (67 toasts moved into LANG via `tUIf`, premiumLockDesc EN, html lang; a few dynamic error toasts like ``Failed: ${tweakId}`` remain English). Phase 10: CHANGELOG + WHATS_NEW 1.6.0 (EN+FI); `electron-builder --dir` packs OK (output to scratchpad), asar has no secrets/private key.

## DONE (later in the same session)
Dashboard fixtures + sparkline on accent; Premium lock card, Smart Profile Wizard, language picker, lock screen restyled on tokens (legacy #9b59b6 purple retired from css/style.css; flag emoji replaced by EN/FI chips); `--c-accent-rgb` default added to tokens.css; a11y: icon-only buttons get translated aria-labels (`_labelIconButtons` in js/ui-helpers.js); Update Guard/Game Shield toasts translated; hog rail no longer stacks scans; Privacy page tolerates `{ok:false}` from history/regrets. Harness: `--overlay "name=js"` opens dialogs before shooting (a string/number result is written to report.txt).

## Real-app testing (now allowed by the user)
Launch: `env -u ELECTRON_RUN_AS_NODE npx --no-install electron . --remote-debugging-port=9222`, drive it with a CDP script (Runtime.evaluate / Page.captureScreenshot). First launch auto-relaunches as admin after 3 s (dev: relaunches bare electron.exe and quits) — call `window._adminRelaunchCancel()` right after load. Bot v2 is deployed (main pushed, Railway env vars + Discord redirect set); Discord sign-in works. All 17 pages load with no console errors. Fixed from real data: game scan 23 s→4 s (PS 5.1 has no `??`), process CPU% was cumulative seconds, startup path abbreviation, What's New teaser. Game Shield + Update Guard are implemented (lib/gameshield.js, watcher hooks, events); not exercised end-to-end live (needs a running game; would stop the user's Discord/Spotify).

## NEXT
1. JylliSensor.cs improvements (needs rebuild; never specified what) — optional.
2. DONE: onUnknownGameCandidate (lib/gamecandidate.js, library-folder heuristic, blacklist file `unknown-game-blacklist.json`), onUpdateGuardWarning (offline pending-update count before the guard activates). STILL UNWIRED: onPulseCooldownTick — main has no Pulse cool-down feature, so there is nothing to emit; needs a decision on what "cool-down" should do.
3. DONE: health-score spinner. Core loads (~1 s warm) have none.
(Update Guard warning and unknown-game banner were verified only for API exposure/logic; not yet seen firing with a real game. Tests: 27.)
4. Release: version bump/tag, `npm run build`, publish (user).

## Known limits to tell the user
Nothing has been run on real Windows (no launching allowed): fixes are verified by syntax checks, unit tests, scans and screenshots only. v1.5.9 clients cannot sign in until 1.6.0 + new bot are deployed. Inline-style purge and full per-page component rebuild are only partly done (pro.css layer restyles instead).
