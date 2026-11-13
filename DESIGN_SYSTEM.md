# Jylli Tool design system: "Quiet precision"

Visual reference: `design-preview.html` (approved 2026-10-30). Tokens live in `css/tokens.css`, components in `css/ui.css` (`j-` prefix) and `js/ui.js`.

## Principles
1. Restraint: graphite surfaces, hairline borders, one accent. Colour means something (status or the one primary action).
2. One primary action per view.
3. Density without noise: dense lists, not card grids; detail on demand.
4. Every state is designed: loading, empty, error, success, long text, 0 / 1 / 1,000 items.
5. Keyboard first: everything reachable, focus always visible, Ctrl K for anything.

## Type
- Geist (UI) and Geist Mono (all numbers, with tabular figures), bundled locally in `assets/fonts`.
- Scale: 11 / 12 / 13 (base) / 14 / 16 / 20 / 28 / 40. Minimum 11px.
- Weights: 400 body, 500 labels and buttons, 600 titles and key numbers. No uppercase tracked micro-labels; sentence case everywhere.
- Tracking: -0.02em on titles and big numbers, -0.003em base.
- Roles: page title 22/600, card title 13/600, body 13/400, secondary 12.5, caption 11.5, stat 20–40 mono/600.

## Colour (semantic tokens, dark default and light)
| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | #08080A | #F1F1F3 | app background |
| `--panel` | #0F0F11 | #FFFFFF | main content area |
| `--card` | #141417 | #FFFFFF | cards, lists |
| `--raised` | #1B1B1F | #F5F5F7 | inputs, secondary buttons |
| `--s3` | #232328 | #EBEBEE | pressed, selected, tracks |
| `--line` / `-2` / `-3` | white 7 / 11 / 17 % | black 7.5 / 11 / 18 % | hairlines |
| `--t1` / `--t2` / `--t3` | #EDEDEF / #B4B4BC / #858590 | #17171A / #4F4F58 / #6E6E78 | text |
| `--accent` | #8B7CF6 (user-selectable, 8 presets) | same | fills, rings, focus |
| `--accent-text` | accent mixed toward white | accent mixed toward black | accent used as text |
| `--ok` `--warn` `--danger` `--info` | #3DD68C #F5A524 #F2555A #4C9EFF | #15803D #B45309 #DC2626 #2563EB | status only |

Rules: accent text always uses `--accent-text` (contrast); status colours are never used as row borders; text never uses opacity to get a grey. `tools/check-contrast.js` verifies every text/surface pair at AA (4.5:1 body, 3:1 large and UI) in both schemes.

Theme presets change only the accent, with one exception: a preset may carry a `material` (today only **Liquid Glass**). `applyTheme` sets `<html data-material>` for it and removes it for every other preset; all of its styling is in `css/liquid-glass.css`, every rule scoped to that attribute. It floats the sidebar as a glass pane and gives chrome, selected nav/segments and floating surfaces (menus, palette, dialogs, drawer) a translucent fill, lit edge and restrained blur. Cards and content stay as they are. It layers on the colour scheme and UI style (no blur in Light style or while a game runs), and `tools/check-contrast.js` tests its fills at AA in both schemes.

## Spacing, shape, depth
- 4px grid: 4 / 8 / 12 / 16 / 20 / 24 / 32. Page gutter 32px, card padding 16px, list row min-height 56px.
- Radius: 6 (small controls), 7–8 (buttons, inputs), 12 (cards, lists), 14 (modals).
- Depth by hairline and a 1px top highlight on raised surfaces. Shadows only on popovers, modals and toasts. No glow on chrome. **Exception:** emissive material plus bloom on live hardware inside the 3D twin, and an accent shadow on the single primary action of a view. Never glow on text, cards or badges.
- Layout: sidebar 216px (rail 56px), content max width 1160px, title bar 40px, status bar 26px.

## Motion
120–200ms, ease-out (`cubic-bezier(.16,1,.3,1)`), opacity plus 4px translate for entering, scale .99 on press, switch thumb slides. Only transform and opacity animate. `prefers-reduced-motion` collapses everything to ~0. The existing snappy/smooth setting still scales durations.

## Icons
One set: Font Awesome Free (solid), already bundled and used by every page, at 12/14/16px. The plan to move to a Lucide sprite was dropped: it would mean rewriting about 1,400 icon references in pages that are otherwise unchanged, for little visual gain. Icon-only buttons get an `aria-label` (automatic from the title) and a tooltip (`data-tip`).

## 4.0 "Through the glass" (world, glass, light)
Plan: `UI_4_0_PLAN.md`; visual reference: `design-4-preview.html`. Code: `js/world.js`, `css/glass.css`, `js/ui4/*`, `js/chronoline.js`, `js/callouts.js`.
- **World.** The 3D rig (`#world`, dark scheme only) lives behind the whole app. A page's hero slot is a *window* onto it: the host centres and scales the rig on the slot by shifting the projection (`engine.setCenter`), so each page keeps its composition. Pages without a hero get a camera shot of the part they are about (`JylliWorld.shotFor`) with the rig dimmed. The Network tab fades and pauses the rig (it has its own scene). A game in front stops the stage (host fps 0), hides it and the extras (`body.game-live`).
- **Glass.** Surfaces are translucent graphite with one light: `--lx/--ly` (viewport px, ~15 Hz, drifting and leaning to the pointer) drive the edge highlight of every card. Fills are opaque enough that **tertiary text clears 4.5:1 over the brightest backdrop the rig can produce** (`tools/check-contrast.js` enforces it from the rgba stops in glass.css). Tiers (Settings › Visual style, `settings.uiMode`): *Cinematic* (blur on cards and chrome), *Balanced* (default, blur on chrome only), *Light* (flat translucent, no edge light), *Classic* (no world, the 2.0 layout).
- **Numbers.** Live values roll digit by digit (`JylliOdo`, `data-odo`); hover or focus shows where a number came from and its age (`JylliProv`, `data-prov`). Text without digits ("Not available") is never rolled.
- **Apply.** Anything that applies a batch (stage dock, review sheet) is *hold to apply* (`JylliHold`, 650 ms, pointer, Space or Enter; Ctrl+Enter and Classic stay immediate). A light travels from the control into the part the change touches (`JylliWorld.pulseTo`, part from `partFor(tweakId)`); single tweaks in "Immediately" mode pulse too but never need a hold. Undo plays it backwards (`undoPulse`).
- **Chronoline.** Bottom glass timeline of what was really recorded: journal batches, game sessions, CPU load (metrics history). Dragging it replays the recorded load only (no temperatures were recorded, so none are shown); gaps stay gaps.
- **Callouts.** On Home and the GPU, CPU & Memory and storage heroes, glass plates (with a heat tint from the real temperature, only when a reading exists) with live numbers join the parts by lines that follow the camera; only when the hero window is at least 560x250.
- **Toasts.** `toast(title, msg, type, ms, { action, tag, part })` (`js/ui4/toast.js`): glass, bottom centre above the Timeline, newest on top, three visible then "and N more", lifetime pauses on hover/focus, long names shortened in the middle, Undo lives inside the toast (the undo snackbar is gone), `part` adds a glyph that pulses/jumps to that part of the rig, warnings and errors tint the rim only and use `role="alert"`, only confirmations are silenced while a game runs, Esc dismisses the newest. Same look in Classic.
- **Also.** The Ctrl K palette and dialogs are glass over a softly blurred world; Network gets a "flight" (a bright comet along every link at the start and landing of a speed test, plus the test's own measured rate as particles); Clean shows the drive as a bar with the removable part inside it that empties after a clean; a batch that needs a restart puts an amber "!" overlay on the taskbar icon; Replay shows its lowest second and steadiness and exports a share card containing a still of the real rig.
- **Motion rules.** Reduced motion: no rolling digits, no pulse, camera cuts, light stays still. No glow on text, cards or badges. Nothing animates while a game runs.

## Tab kit (every tab uses it)
Code: `js/ui/tab-kit.js`, `js/ui/filter.js`, `css/tab-kit.css`. A tab is: **hero** (one number that matters, headline, ledger of its parts, stats, ONE primary action) → **toolbar** (search + status chips, only when the tab has a list) → **sections** (dense rows) → designed states.
- `JylliHero.mount(host, cfg)` → `update({ pct | value+unit, eyebrow, lead, ledger, stats, cta, tone, scanning })`. `pct` draws the arc (tone follows 80/50 unless `tone` is given; use `'accent'` for coverage, never red for "not done yet"); `value` shows a number with a unit and no arc (sizes, counts, DPC+ISR). Ledger rows beyond six fold behind Show all.
- `JylliTab.load(slot, fn)`: skeleton, then `fn`; a throw becomes an error state with Retry. A failed read is never shown as an empty result.
- `JylliFilter.mount(list, { item, section, input, chipsEl, expand, skip, onResult })`: sets `hidden` on items and on sections that contain items; everything else on the page is left alone. Items carry `data-search/applied/recommended/reboot/risk`.
- Rules: confirm before anything that deletes for good or applies a batch (showConfirm, with the number of items); strings in LANG for both languages; no hex in JS; `jk` on kit roots; `game-live` (not `game-running`) stops animation while a game runs.

## Components
Buttons: primary, secondary, ghost, danger, icon; sizes sm 28, md 32, lg 36; states default, hover, focus-visible, active, disabled, loading. Inputs, search, select, checkbox, switch, segmented control, slider. Cards, dense list rows (expandable), table (sticky head), tabs, badges, impact bars, stat tile, meter, ring, sparkline, avatar, tooltip, toast (with undo), modal (sm/md/lg), command palette, skeleton, empty and error states, kbd.

## State rules
- Loading: skeleton that matches the final layout (no layout shift); spinners only inside a button.
- Empty: icon, one-line headline naming the space, one sentence, one verb button.
- Error: what happened, what to do, Retry. Never a raw exception string.
- Success: a toast, with Undo when the action is reversible.
- Long text: single-line truncate with the full text in a tooltip.
- Disabled: only when truly impossible; explain why.

## Voice
Sentence case. Verb-first buttons ("Apply", "Create restore point"). No "please", "successfully" or exclamation marks. Errors say what happened and what to do. Every string in English and Finnish; terms from CLAUDE.md's never-translate list stay as is.

## Product decisions (made without asking, per the brief)
- Desktop Electron app: the responsive matrix is 1060×660 (minimum), 1280×820 and 1920×1080 plus 150% zoom, not 390px mobile.
- Click targets: 32px minimum for pointer controls, 36px for primary actions.
- Theme: System / Dark / Light in Settings › Appearance; default Dark so existing users see no change. The game HUDs stay dark, since they sit over games.
- Premium: a small outlined "Premium" badge on locked tabs and a lock on nav items. A free user who opens a locked tab sees one pitch (`js/premium.js`, `css/premium.css`): a headline written for that feature, three benefits, facts read from this PC (omitted when unknown), an animated example labelled "Example", the price (10 €, one-time) and chips for the rest of Premium. One accent, no glow on text, cards or badges; no performance numbers, reviews or counts in the copy (`test/premium.test.js` enforces it).
- Behaviour is unchanged. The flagged exceptions: the `colorScheme` setting, scheme passed to secondary windows plus window background, optimistic switch flips with rollback on error, removal of provably unused code.
