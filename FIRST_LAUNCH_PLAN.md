# Plan: "Arrival" — premium first launch, guided tours, concierge suggestions

## Context
Today a new user picks a language and is then put through a utilitarian six-step wizard (`buildWizardSteps`, index.html:2520–2766). It waits on spinners (restore point, 1–2 min SFC/DISM health check, preflight), has hardcoded English strings and ends with a binary Auto/Manual choice. No page explains itself, and nothing tells the user what is worth doing first. The goal is a first launch that feels like a private lounge with professional staff: calm, anticipatory and personal. Every tab gets a short guided tour on its first visit, and the user gets a curated "first moves" menu before anything is applied.

Decisions you made: prep work runs in the background while you answer questions; the voice is an unnamed concierge ("We've prepared…", "May we suggest…") with a monogram mark; tours cover all 23 tabs plus the Pro lock screen; chimes are subtle and only play when UI sounds is on, with a toggle in the welcome.

Note: the `// === LANG/SETTINGS/WIZARD/UI ===` markers in CLAUDE.md don't exist. LANG lives in `js/lang/en.js` and `js/lang/fi.js`, and the wizard sits under `// ─── Onboarding Wizard ───`. Update the CLAUDE.md map as part of phase 1.

## Verified facts that shape the design
- The background preflight in `init` (index.html:1105–1118) would run a second scan during Arrival, so it must skip while `!settings.onboardingDone`.
- Preflight results are written in three places (1109, ~2599, ~4319). Extract one `storePreflightResult(r)` helper so the `runAutoOpti` gates (health < 72 h, preflight < 24 h) keep passing.
- `build-run-plan` (main.js:4414) doesn't exclude tweaks that are already applied. The renderer filters the plan with `pf_tweak_states`.
- `JylliSound.play` starts every segment at `t0`. Chimes need per-segment `at`, `gain` and `attack` fields.
- The `off*Progress` calls use `removeAllListeners`, so Arrival registers its own listeners and only removes them when nothing else is subscribed.
- Packaged builds already require admin. The non-admin path is mostly `npm start` or a declined UAC prompt (`relaunch-admin` doesn't quit on decline).
- Home's `twinFirstRun` (home.js:318) offers Auto-Optimize, which would compete with the concierge card.
- The CSP allows inline scripts and styles, and inline SVG masks and WebAudio work. No remote assets.

## A. Arrival flow (`js/arrival.js`, `css/arrival.css`)
**Doorstep (before auth).** Restyle `#lang-picker` (index.html:104–119): an inline SVG hairline monogram, a time-of-day greeting in both languages from the pure `greetingKey(hour)`, and two language buttons. `selectLanguage()` is unchanged.

**Start trigger.** `finishLoading()` resolves a new `window._bootFinished` promise. Replace the gate at index.html:1351–1403 (the countdown toast) with `_bootFinished.then(() => JylliArrival.maybeStart())`. Delete the old wizard functions; keep `startOnboarding()` as a shim that calls `JylliArrival.start({rerun:true})`. `#onboarding-overlay` becomes the empty `#arrival` dialog root.

| # | Scene | Content |
|---|---|---|
| 1 | Welcome | Monogram, greeting, "We'll look after the details. This takes about two minutes." A sounds switch (turning it on plays `welcome`). If not admin, an inline card: "May we restart as administrator? Your answers are kept." with **Restart** and **Continue with limited access**. **Begin** starts the prep. A quiet **Later** link. |
| 2 | Tell us about you | One question at a time, large tiles, keys 1–5. (1) Use case: fps / open / stream / work / mix. These reuse the AOM ids; work maps to mix and runMode `smart`. (2) Games from `api.detectGames()`, pre-checked. (3) Up to two priorities: performance, latency, quiet and cool, battery (laptops only), privacy, tidy startup. (4) Comfort: safe (tier 1) / balanced (tier ≤ 2) / expert (also sets `advancedMode`). The **Preparing your suite** ledger sits on the right. |
| 3 | Your PC, as we read it | Dossier cards. Hardware: `pcTier()` and `sysInfo`. Windows health. Already optimized: pre-applied count, stock or custom OS. Considerations: battery, low RAM, Wi-Fi, AV (`detectAv`), safety score < 50. A card still being checked says "Still checking, about a minute" and doesn't block Continue. |
| 4 | May we suggest | 3–5 move cards from `JylliConcierge.recommend()`. Each has a title, a one-line why, chips (impact, risk tier, ~minutes, "Undo anytime"), and a disclosure listing its tweaks. The top 3 are pre-checked and **nothing is applied**. Primary: "Keep these {n} as my first moves". Secondary: "Just let me look around". If health is bad, a repair move is pinned first. |
| 5 | One small question | Analytics consent with two equal buttons; focus starts on "No thank you". Skipped if already answered. |
| 6 | Your suite is ready | `ready` chime and a summary (restore point, n moves planned, tours on). Then Home with the concierge card, followed by the Home tour. |

**Background prep.** The pure `prepSteps(isAdmin)` defines dependencies. Order: admin → hardware (reuse `sysInfo`) → restore point `JylliTool_v1_FirstRun` (admin only; "already created in the last 24 h" counts as success). Then in parallel: preflight, Windows health (admin only), `detectGames`, `autodetectAomAnswers`, startup items, `getHealthScore`. Results go through `storePreflightResult` plus the existing `health_check_ts` / `health_check_ok` keys. The ledger is `role="status" aria-live="polite"` with rows in states waiting / working / done / attention / skipped, a reason for each, and localized sub-lines mapped from progress percent. After scene 2 it collapses to a pill. Health may finish after handoff; it then updates the Home card and shows one toast. Prep code shows no toasts while Arrival is open.

**Resume and exits.** Store `settings.arrival = {v:1, scene, profile, startedAt, completedAt, deferred, resumeAfterAdmin}` with an awaited save on every scene change and before `relaunchAdmin()`. The elevated instance resumes at `scene`, and prep steps are idempotent. If the app is still running 8 s after the relaunch request, say "The request was declined. We'll continue with limited access." Esc opens a small **Finish later / Stay** sheet. Later sets `onboardingDone=true` and `deferred=true`, and the Home card then offers "Finish setting up · 2 min".

## B. Tour engine (`js/tour.js`, `js/tours.js`, `css/tour.css`)
- **Pure functions (tested):** `nextIndex` (skips missing targets), `shouldShow`, `isStale(seenV, defV)`, `holeRect` (clamped spotlight), `placeCard` (flip and clamp).
- **DOM:** one `#jt-tour` layer at `--z-tooltip`. An SVG-mask dim with a rounded hole blocks clicks underneath. Between stops it fades out (120 ms), moves, then fades in (160 ms), animating opacity only. A glass card shows "2 of 4", Back, Next/Done, Skip tour and Turn off tours. Keys: → and Enter forward, ← back, Esc skips. A ResizeObserver plus scroll and resize listeners keep it in place. Targets scroll into view, and a MutationObserver waits up to 1.5 s per stop. If no stops are found, the tour isn't marked seen.
- **Arbiter:** one tour at a time. It waits while Arrival or the boot stage is active, a `.modal-overlay.open` or `#auto-opti-modal` is showing, the palette or shortcut sheet is open, a game is running, or the window is hidden. It polls every 500 ms for up to 20 s. If a blocker appears mid-tour, the tour pauses. Navigating away cancels it without marking it seen.
- **Hook:** after `c.classList.add('page-enter')` (index.html:1790): `setTimeout(() => window._navToken === navToken && JylliTour.onPage(route, c), 360)`. A `.tab-premium-lock` uses the global `prolock` tour, and that tab's own tour waits until it's unlocked.
- **Settings:** `toursEnabled`, `toursSeen {key: v}`. Raising a tour's `v` shows it again.
- **Replay:** a `circle-question` button in `renderHead` (js/shell.js:94) and **F1**, both listed in the shortcut sheet. Settings › General gets a Guided tours switch, **Reset tours** and **Run the welcome again**.
- **Selectors:** only `data-tour="<tab>-<topic>"` attributes added to the builders, or stable shell ids (`#j-nav`, `#j-head .j-tabs`). Never `jx-*` classes. `tools/check-ui.js` gains a check that every `data-tour` value in tours.js exists in index.html or `js/pages/**`.
- **Stops (2–4 per tab):**
  - home: nav and Ctrl K, health ring, 3D rig, first moves
  - windows: search and filters, card anatomy (tier and impact), apply / undo / staging
  - cpumem: hero, memory tweaks, reboot badge
  - gpu: hero, vendor section, power-limit caution
  - power: plan, storage, laptop note
  - network: scene, ping/DNS test, adapter tweaks
  - fixes: fixes, SFC/DISM repair
  - pulse: presets, session, before/after
  - games: carousel, profile
  - apps: list, priority
  - fivem: cache, tweaks
  - latency: DPC/ISR graph, drivers
  - replay: timeline, compare
  - cleanup: drive bar, categories, clean
  - debloat: list, Xbox & Store shield, restore
  - startup: impact, recommended, toggle
  - diagnostics: scan, score, recommendations
  - processes: list, priority, caution
  - bios: board card, read-only guidance
  - scheduler: schedule, task list
  - restore: create, roll back
  - history: journal, undo
  - settings: sounds/motion, accent/UI mode, tours and welcome
  - prolock: what Pro adds, CTA

## C. Concierge (`js/concierge.js`, pure UMD)
- **`recommend(input, deps)`:** `input = {sysInfo, profile, pfStates, safetyScore, osType, health, games, startupItems, aomDetected, isPremium, settings}`; `deps = {tier: pcTier(), plan: filtered buildRunPlan, meta: _tweakMeta, conflicts: TWEAK_CONFLICTS, startupRecommended: STARTUP_RECOMMENDED_DISABLE}`. Existing logic is reused, not rewritten.
- **Candidate moves:**
  - repair-health (blocking)
  - restore-safety (blocking)
  - essentials (tier-1 high-impact plan items, minus applied ones and `warnIf(si)` conflicts)
  - startup-quiet
  - cleanup
  - game-profile (Pro: games; free: Pulse preset)
  - network (Wi-Fi notes)
  - fivem
  - power (desktop only)
  - debloat (stock OS only)
  - latency (expert and fps)
- **Ranking:** score = base + profile and priority weights + hardware fit − risk penalty by comfort level. Blocking moves come first, at most one per tab, at most 5, deterministic order.
- **Output:** `{id, tab, titleKey, whyKey, vars, impact, risk, minutes, reversible, action:{type:'tab'|'batch'|'autoOpti', …}}`, plus `hintFor(tab, state)` and `isDone(move, settings)`.
- **Home card "Your first moves"** (`buildDashboard`, js/pages/home.js, `data-tour="home-moves"`): a progress meter and rows with **Do this / Mark done / Not for me**, plus dismiss. **Do this** uses existing flows: `showPage`, `applyTweakBatch` behind `showConfirm`, and `runAutoOpti()` with `aom_use_case` preset. State is `settings.concierge = {moves, done, dismissed}`. While the card is shown, `twinFirstRun` hides its Auto-Optimize button.
- **Per-tab hint:** after a tab's tour ends (or on first visit if tours are off), one "Recommended for you" `ui.callout` appears at the top of the page, once.

## D. Premium polish
- **Type:** new tokens `--font-size-display: 40px` (greeting, Geist 500, -0.02em) and `--font-size-hero: 28px`. Lead text 15/22 secondary. Mono eyebrow in sentence case ("02 · About you"). Tabular numbers in the ledger.
- **Motion:** scene changes are 180 ms opacity + 8px rise. Two arrival-only moments: the Welcome entrance (480 ms, 60 ms text stagger) and the Ready dissolve (520 ms). Everything scales with `--motion-scale`. Reduced motion or `motion-reduced` sets it to 0; Classic keeps 120 ms fades only; nothing animates while a game runs.
- **3D rig** (guarded by `JylliWorld.enabled()`): dimmed wide shot during scenes 1–2; `JylliTwin.shot('cpu'|'gpu'|'ram0'|'drive0')` when a dossier card is hovered or focused; `pulse(partFor(id))` when a suggestion is hovered; staggered part pulses on Ready. Without the rig (Classic, light, 3D off), the backdrop is graphite with a hairline monogram.
- **Sounds** (`js/sound.js`): segments gain `at`, `gain` and `attack`. `welcome` is three sines at 659/831/988 Hz staggered 90 ms; `step` is 880 Hz, 60 ms; `ready` is 440 → 659 Hz. All are gated by `canPlay`.
- **Voice:** first-person plural, calm, facts before offers. No "!", "please", "successfully" or hype. Samples:
  - "Good evening." / "Hyvää iltaa."
  - "Restore point created. Everything we do can be rolled back." / "Palautuspiste luotu. Kaiken voi perua."
  - "May we suggest" / "Ehdotamme"
  - "Just let me look around" / "Katselen ensin itse"
  - "Your suite is ready." / "Kaikki on valmiina."
- **Accessibility:** Arrival traps focus like `_openModal`. Tours are non-modal and restore focus afterwards. Tiles use radiogroup or checkbox roles. Live regions for the ledger and the tour counter. Existing tokens only, so `check-contrast` covers both schemes.
- **i18n:** new LANG groups `arrival`, `tour` and `concierge` in en.js and fi.js, read through a `tG(group, key)` helper. This also replaces the old wizard's hardcoded English strings.

## E. Persistence and migration
- New keys: `arrival`, `toursEnabled`, `toursSeen`, `toursOffered`, `concierge`. `migrateSettings` (main.js:1500) goes to v4 and drops these keys if they aren't objects; bump the schema version.
- New installs: `toursEnabled=true`.
- Existing users (`onboardingDone` already true): no Arrival. If `toursEnabled` is undefined, set it to false and, once What's New is closed (through the arbiter), show one toast: "New: guided tours. We can show you around each page the first time you open it." with a **Turn on** action. Then set `toursOffered`.
- Re-run from Settings: keeps the language and `onboardingDone`, and reuses a restore point younger than 24 h.
- `tools/ui-preview/fixtures.js`: seed `toursEnabled:false`, and add `arrival` / `tours` preview flags.

## F. Build order (each phase ships on its own)
1. **Foundations:**
   - sound.js segment fields and the three chimes
   - `storePreflightResult` helper, plus skipping the background preflight while onboarding
   - `_bootFinished`
   - settings v4
   - LANG groups
   - CLAUDE.md map fix
2. **Tour engine:** tour.js and tour.css, the showPage hook, the help button and F1, Settings rows, the check-ui `data-tour` check. Tours for home, windows, diagnostics, settings and prolock.
3. **Remaining tours:** `data-tour` attributes on the other builders and the full EN + FI copy in tours.js.
4. **Concierge:** concierge.js, the Home card, per-tab hints, and the `twinFirstRun` change.
5. **Arrival:** arrival.js and arrival.css (loaded after glass.css), the doorstep restyle, removing the old gate and wizard.
6. **Existing users:** the tours toast and "Run the welcome again".

New script tags go after `ui-helpers.js` (index.html:566). Add the new files to check-ui's file list.

**Critical files:**
- `index.html` (gate 1351–1403, wizard 2519–2766, showPage 1708–1792, finishLoading 780, preflight 1105, markup 86–119, builders)
- `js/sound.js`
- `js/shell.js`
- `js/pages/home.js`
- `js/pages/settings.js`
- `main.js` (migrateSettings)
- `js/lang/en.js`, `js/lang/fi.js`
- `tools/check-ui.js`
- `tools/ui-preview/fixtures.js`
- New: `js/arrival.js`, `js/tour.js`, `js/tours.js`, `js/concierge.js`, `css/arrival.css`, `css/tour.css`

## Tests
- `test/sound.test.js`: new specs have `at ≥ 0`, total < 700 ms, gain ≤ 1, 200–2000 Hz and no square waves.
- `test/tour.test.js`: `nextIndex`, `shouldShow`, `isStale`, `holeRect`, `placeCard` flip and clamp.
- `test/concierge.test.js` fixtures:
  - laptop on battery: no power or usb-suspend moves
  - RAM < 16 GB: no sysmain
  - corrupt health: repair is first
  - safe comfort: tier 1 only
  - applied tweaks dropped
  - at most 5 moves, one per tab
  - deterministic order
- `test/arrival.test.js`: `greetingKey`, `prepSteps` dependencies and skips, `resumeScene`, mapping from use case to `aom_use_case` / runMode.

## Verification
- `npm test` and `npm run check` (LANG parity, contrast, `data-tour` check), output filtered to errors.
- `npm start` with a fresh userData (rename `%APPDATA%\jylli-tool`):
  - full Arrival in EN and FI
  - non-admin path: relaunch and resume mid-profile, declined UAC
  - Esc, then Later, then "Finish setting up" from Home
  - health finishing after handoff
  - reduced motion, Classic mode, light scheme
- Tours: visit every tab once; the Pro lock as a free user; F1 replay; Reset tours; a game running (suppressed); `#auto-opti-modal` opened mid-tour (pauses).
- Existing-user path: a userData with `onboardingDone:true` shows the tours toast once and no Arrival.
- `npm run preview` with the arrival and tours flags for quick visual passes.

## Known risks
- An elevated relaunch under a different admin account uses a different userData, so the resume is lost. This is documented, not fixed.
- Windows allows one restore point per 24 h, so "already exists" counts as success.
- SFC can take about 180 s; Ready never waits for it.
- Toasts (z 8500) sit above Arrival, so prep code stays quiet while it's open.
