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

## NEXT
1. Capture all pages with pro.css (`--tag pro3`) and fix what looks off (known: tweak-card green gradients, Quick Wins card, "Search tweaks…" placeholder on Startups page, `[object Object]` in What's New is only a fixture bug).
2. Dashboard hero/tiles polish; premium-lock card; boot/lock/language-picker screens; command palette; Auto-Optimize + SPW dialogs; pages one by one.
3. Phase 7: link `css/tokens.css` + `css/pro.css` + `css/fonts.css` in pulse/fivem-settings/arma-settings/fps-hud-settings/HUD windows, theme broadcast.
4. Phase 8: move hard-coded English toasts/confirm titles into LANG (EN+FI), fix `premiumLockDesc` (EN string is Finnish), missing FI `vbs-disable`, `<html lang>`, a11y labels, drop `'unsafe-inline'` only if inline handlers are gone (they are not — keep).
5. Remaining Phase 3 leftovers: JylliSensor.cs improvements (needs rebuild, skipped), missing bridge APIs (fixtures list in harness report), process-manager polling.
6. Phase 10: CHANGELOG 1.6.0 entry (Finnish style), `npm run pack` to verify packaging (may need symlink rights), asar secret grep. User pushes/releases/deploys.

## Known limits to tell the user
Nothing has been run on real Windows (no launching allowed): fixes are verified by syntax checks, unit tests, scans and screenshots only. v1.5.9 clients cannot sign in until 1.6.0 + new bot are deployed. Inline-style purge and full per-page component rebuild are only partly done (pro.css layer restyles instead).
