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

## Spacing, shape, depth
- 4px grid: 4 / 8 / 12 / 16 / 20 / 24 / 32. Page gutter 32px, card padding 16px, list row min-height 56px.
- Radius: 6 (small controls), 7–8 (buttons, inputs), 12 (cards, lists), 14 (modals).
- Depth by hairline and a 1px top highlight on raised surfaces. Shadows only on popovers, modals and toasts. No glow anywhere.
- Layout: sidebar 216px (rail 56px), content max width 1160px, title bar 40px, status bar 26px.

## Motion
120–200ms, ease-out (`cubic-bezier(.16,1,.3,1)`), opacity plus 4px translate for entering, scale .99 on press, switch thumb slides. Only transform and opacity animate. `prefers-reduced-motion` collapses everything to ~0. The existing snappy/smooth setting still scales durations.

## Icons
One set: Font Awesome Free (solid), already bundled and used by every page, at 12/14/16px. The plan to move to a Lucide sprite was dropped: it would mean rewriting about 1,400 icon references in pages that are otherwise unchanged, for little visual gain. Icon-only buttons get an `aria-label` (automatic from the title) and a tooltip (`data-tip`).

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
- Premium: a small outlined "Pro" badge on tabs and nav items, and one lock panel; no crowns or extra colours.
- Behaviour is unchanged. The flagged exceptions: the `colorScheme` setting, scheme passed to secondary windows plus window background, optimistic switch flips with rollback on error, removal of provably unused code.
