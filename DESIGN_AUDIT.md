# Design audit

Date: 2026-10-30. Baseline: commit b707101 (UI 2.0 partly done). Evidence: preview-harness shots (en, premium, 1280×820; dashboard, performance/fixes and pulse viewed), plus counts from the source. Screens not yet looked at are marked "not reviewed" and get covered in the next audit round.

## What the numbers say
| Measure | Value | Where |
|---|---|---|
| Inline `style="` attributes | 1,790 | `index.html` (builders for the 14 unrebuilt pages) |
| Hex colour literals | 730 | `index.html` |
| Font Awesome icon references | 1,365 | `index.html`: a second icon style next to the new shell |
| Legacy CSS | 6,498 + 284 lines | `css/style.css`, `css/pro.css`: still the real styling for 14 pages |
| `box-shadow` rules | 309 | `css/style.css` |
| Coloured left-border accents | 26 | `css/style.css` |
| Pages on the new component layer | 5 of 19 | Home, Settings, Processes, History, Scheduler |

## Seen on screen (blunt version)

### Shell: good, but the legacy layer leaks into it
1. **Spec chips under the title bar** (`Ryzen 7 7800X3D…`, GPU, RAM, disk) sit between the title bar and everything else, on every page. They were meant to move to Home and the status bar. The plan said so; the hidden `#specs-hud` is still rendered.
2. **Two icon dialects.** Sidebar and buttons use Font Awesome solid; the section header actions use outlined shapes. Weights and optical sizes don't match.
3. **Home has two hero systems.** A "What's new" banner, then a health card with a green ring, then uppercase tracked labels ("PC HEALTH", "CPU TEMPERATURE"). The tiles use big green numbers; the temperature cards use big violet numbers. Green is both "healthy" and "CPU", so colour carries no meaning.
4. **Wasted first screen.** Optimize now sits in a card with the ring, but the recommended fixes (the thing a user should act on) are below the fold.
5. **Home temperature cards** are large mostly-empty graph panels (axes with one data point) taking a third of the viewport.

### Optimize › Fixes (representative of every legacy page): not acceptable
6. **Card grid with equal weight.** Every fix is the same size card with the same full-width violet "Run Fix" button, so 8 identical primary buttons on one screen. The brief's rule is one primary action per view.
7. **Glow shadows are still there** under every button (visible violet halo). The quiet pass removed some, not the button halo.
8. **Hero banner with title** ("Fixes", wrench icon) repeats the tab name directly under the tab row. Pure duplicate chrome.
9. **Uppercase tracked section labels** with violet icons ("GAMING", "HARDWARE & CONNECTIVITY") at 11px: tiny and shouty, and the violet is spent on decoration.
10. **Body copy leads with implementation** ("polls system metrics every 3 seconds…") rather than the user outcome. No impact or risk indication, no undo hint.
11. **No states designed:** no loading skeleton (cards pop in), no empty state for search with 0 results, no error state for a failed fix, no applied/undo state.

### Gaming › Pulse: reads as disabled
12. **Everything is dimmed** (the whole "When a game is detected" block is at low opacity when Pulse is off) so the page looks broken rather than idle. Disabled-looking switches with real settings behind them.
13. **Four different accent colours** as left borders on the four rule cards (red, purple, blue, green): exactly the "coloured left border on every row" pattern the redesign set out to remove.
14. **Sliders** have a red and a purple track, with value badges that don't line up with the track end.
15. **No game picker, no obvious primary action.** The thing the user came for ("activate Pulse for game X") isn't a button on screen.

## Systemic problems (all unrebuilt pages)
- **Type:** several scales in parallel (legacy `font-size` values at 12/13/14/15/17/18 plus the new 11–40 scale), uppercase tracked micro-labels, numbers not tabular in lists.
- **Spacing:** card padding differs page to page (14/16/18/20/24px), gaps of 10/12/14/16.
- **Colour:** 730 literal hexes; status colours used as decoration (green/orange/red icons on neutral items); a purple `.pro` crown remnant in places.
- **Depth:** shadow + border + glow stacked on the same element.
- **Focus and keyboard:** most legacy buttons and cards are `div onclick`. No visible, consistent focus ring. Tabs are not arrow-key navigable.
- **Contrast:** secondary text on legacy cards (`opacity`-based greys) is below 4.5:1 in several places; tokens fixed this for the new components only.
- **Touch/click targets:** icon-only buttons at 24–26px in legacy rows.
- **States:** skeletons, empty and error states exist only on the five rebuilt pages.
- **Theme:** dark only. Hardcoded hex means a light theme cannot work until the legacy CSS is gone.
- **Icons:** Font Awesome throughout; one inline Discord mark.

## Not reviewed yet
Windows tweaks, CPU/GPU/Power, Network, Games, Apps, FiveM, Latency, Cleanup, Debloat, Startup, Diagnostics, BIOS, Restore points, lock screen, welcome flow, modals, secondary windows. The same legacy patterns are expected there; the text-based style scan (font sizes, targets, contrast, overflow) will cover them without screenshots.

## Priorities
1. Remove shell leaks (spec chips, banner stacking, hero duplication) and fix Home hierarchy.
2. One shared tweak/fix list component and move the 7 tweak-style pages onto it.
3. Pulse as a session card with a visible primary action.
4. Tokens with a light theme, then delete the legacy CSS.
5. States, keyboard and contrast pass on every page.
