# Handoff — Jylli Tool 1.6.0 rework (resume from here after /clear)

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

## NEXT
1. **Decision needed (product):** Game Shield's "kill background processes" is not implemented in main.js (`toggle-game-shield` only disables Edge/Google updater tasks; `set-game-shield-exclusions`, `onGameShieldEvent`, `onUnknownGameCandidate`, `onUpdateGuardStatus/Warning`, `onPulseCooldownTick`, `autodetectAomAnswers`, `onBudgetSessionReport`, `pulseGetHistory/CoreLoads` are called by the renderer behind `?.` guards but are not exposed in preload). Either implement them or remove the UI.
2. Visual: all pages, dialogs, wizards (SPW + Auto-Optimize) and secondary windows reviewed on tokens. HUD overlays (fps-hud, fivem-hud) intentionally keep their own game-overlay palette; fps-hud-settings is on tokens but English-only.
3. Profile/DNS/ping/re-enable dialogs and error toasts are now in LANG (dl*/tk* keys); other English left is minor (HUD windows, a few log lines).
4. JylliSensor.cs improvements (needs rebuild, skipped).
5. User: copy Ed25519 key + TOKEN_KEY to Railway (jylli-bot/RAILWAY_ENV.md), push, release, deploy bot.

## Known limits to tell the user
Nothing has been run on real Windows (no launching allowed): fixes are verified by syntax checks, unit tests, scans and screenshots only. v1.5.9 clients cannot sign in until 1.6.0 + new bot are deployed. Inline-style purge and full per-page component rebuild are only partly done (pro.css layer restyles instead).
