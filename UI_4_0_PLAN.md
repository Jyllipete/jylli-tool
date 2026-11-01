# Jylli Tool 4.0 — "Through the glass"

A plan for the next UI. 2.0 made the app calm and precise. 3.0 put a truthful 3D twin of the real rig on Home. 4.0 makes that twin the whole interface: you look into your own PC through glass, every panel is made of that glass, and every change you make lands visibly in the machine.

---

## 1. North star

**One continuous world, not pages.** The app is a single persistent 3D stage (your rig, then your network, then your games) with glass plates floating in front of it. Navigating is a camera move, not a page load. Opening GPU glides the camera into the graphics card. Cleanup pans to the SSD. Network pulls back out of the case to the router and the internet. The UI never "switches"; it travels.

**Three feelings, in this order:**
1. *"That's my PC."* Real parts, real names, real temperatures, lit only where the hardware is actually alive.
2. *"I can see what it did."* Every optimisation is a physical event: light travels from the button into the component, the number rolls to its verified new value, and the change drops into a timeline you can rewind.
3. *"It costs me nothing."* The second a game is in front, the stage stops rendering. Zero GPU, near-zero CPU. The beauty never eats a frame.

**Why this is new on the market:** optimiser apps are either utility dashboards (lists, toggles, gauges) or gamer "RGB HUD" skins. Nobody ties a truthful, live 3D model of *your* hardware to every action, with provenance on every number and an undoable, rewindable history. The truth system from 3.0 (journal, read-back, sources) becomes the spectacle instead of a footnote. That is the 500 € feeling: it looks like a film, and it is all real.

---

## 2. Design language: "Smoked glass and light"

Keeps the 2.0 discipline (graphite, one accent, Geist, colour means something). Adds two materials and one rule.

### Materials
| Material | What it is | Where |
|---|---|---|
| **Stage** | The Three.js world: the rig, the network scene, game environments. Only lit by real readings plus one key light. | Full window, behind everything |
| **Glass** | Smoked, slightly tinted panels that *refract the live stage behind them* (blurred, darkened, with a 1px light-catching edge). | Every plate, rail, palette, sheet |
| **Ink** | Text and numbers. Always on an opaque enough glass to pass AA contrast. Never glows, never parallaxes. | All content |

### The one rule: shared light
The DOM and WebGL share one light. The stage's key light direction is projected to screen space every frame and written to a CSS variable (`--light-x`, `--light-y`). Every glass edge, sheen and highlight is computed from it. When the camera orbits, the highlights on every plate move together, like real glass under a real lamp. On top of that, a component's heat tint bleeds into the edge of the plate that describes it (GPU at 78 °C warms the GPU plate's rim a little). Driven by readings only; no reading, no tint.

### Type and numbers
- Geist / Geist Mono stay. New display size 56/64 for hero numbers only.
- **Odometer digits:** every live number rolls digit by digit (tabular, mono) instead of jumping. Settles in 240 ms on a spring.
- **Units in small text, baseline-aligned**, never the same weight as the value.
- **Provenance on hover** (the signature truth detail): hover or focus any number and a small glass tag says where it came from and how old it is: "nvidia-smi · 0.8 s ago", "LibreHardwareMonitor · CPU Package", "Not measured: no sensor". Numbers with no source are not shown, never estimated.

### Motion: springs, not curves
- One shared spring solver (`js/motion/spring.js`) drives both DOM and camera, so a plate and the camera it follows land at the same instant.
- Three presets: `snap` (UI controls, ~180 ms), `glide` (camera and plates, ~600 ms, no overshoot), `settle` (numbers, tiny overshoot).
- Tab changes inside a section use the native View Transitions API (cheap compositor morphs, shared elements like a title or a stat card fly to their new spot).
- Only transform, opacity and the camera animate. `prefers-reduced-motion` and the existing snappy setting: camera cuts instead of glides, numbers set instantly, light still moves (it is not motion, it is state).

### Sound (optional, off by default after first run, existing `sound.js`)
Soft mechanical ticks for toggles, a low "seat" thunk when a change is verified, a rising tone for hold-to-apply. Spatially panned by where the component is on screen. Never during games.

### Layout
- **Rail** (left, 56 px, glass): five section glyphs plus Settings. Hover expands labels over the stage instead of pushing content.
- **Plates** (glass panels): either *docked* (right side, 420–520 px, the main reading surface) or *anchored* (small callout plates pinned to a 3D point on a component).
- **Leader lines:** thin hairlines from anchored plates and key numbers to the exact part in 3D, like a technical drawing. They stay attached while the camera moves. This is the single strongest "woah" in still screenshots.
- **Chronoline** (bottom, 44 px, glass): the timeline of changes, sessions and sensor history (see 3.4).
- Title bar becomes part of the glass; window controls stay native-sized for Windows familiarity.

---

## 3. Signature moments

These are the five things people will record and post. Each one is built on data the app already has.

### 3.1 The assembly (boot and first run)
Already started in `boot-stage.js` (rig builds while the scan runs). 4.0 turns it into a three-act sequence under 2.5 s:
1. Dark stage, the case outline draws in as a hairline.
2. Parts drop in one by one as the inventory finds them, each with its real name typing in on a leader line ("NVIDIA GeForce RTX 5070", "32 GB DDR5-6000").
3. Power on: lights come up part by part *as each sensor actually connects*. Parts with no sensor stay unlit and say so. The camera settles on Home and the plates fade in.

Full version only on first run and once per day after; otherwise a 400 ms power-on. Always skippable with any key.

### 3.2 Apply as a physical event
The core interaction, used everywhere.
- **Hold to apply** for anything that changes the system: a ring fills around the button over 600 ms (with rising tone). Release early to cancel. Safe toggles stay one click.
- On apply, a light pulse runs from the button along a leader line into the target component on the twin (`engine.pulse(id)` exists already). The component flashes once.
- The number shows a "pending" shimmer until the journal's read-back confirms it, then rolls to the verified value. If read-back disagrees, it says so in plain words and nothing pretends.
- The change drops into the Chronoline as a new mark.
- **Undo plays it backwards:** the pulse flows out of the component, back into the timeline mark, which dissolves.
- Windows taskbar shows apply progress (`win.setProgressBar`) and an overlay icon if a reboot is needed.

### 3.3 Fly-through navigation
Each route has a named camera shot (`home`, `cpu`, `gpu`, `ram`, `storage`, `power`, `network`, `gaming`, `clean`, `system`). Switching routes is a `glide` from shot to shot while the old plate slides out and the new one slides in, both on the same spring. Number keys 1–5 jump sections; arrow keys gently orbit; Esc returns to the section shot. Clicking a component on the twin opens its page (picking exists: `engine.pick`).

Network continues the world: the camera pulls back through the case glass, the room fades, and the router / ISP scene from `netscene.js` is revealed in the same frame of reference, with real traffic as particles.

### 3.4 The Chronoline (rewind your PC)
A thin glass timeline at the bottom with three tracks: **changes** (journal entries), **sessions** (games played, from the session recorder), **health** (CPU/GPU temperature and load sparkline from telemetry history).
- Drag the playhead and the twin *replays that moment*: temperatures, fan speeds and loads as they were recorded. Plates show the values from then, marked "recorded 2 days ago".
- Click a change mark: the twin pulses the parts it touched; a sheet shows before/after and Undo.
- Click a session: jumps to its Replay.
- Only recorded data is replayed. Gaps are drawn as gaps.

### 3.5 Game mode and the Replay film
- When a game launches, the app does one quiet transformation: the stage stops rendering (hard 0 fps), the window can minimise to the overlay, nothing animates. This is a promise, measured and shown in Settings ("Jylli used 0.0 % GPU during your last session").
- When the session ends, the game's cover art (games registry already has covers) becomes the environment: its dominant colours are extracted and tint the stage and plate edges for that page only.
- **Replay** becomes a short auto-composed recap: frametime river, 1 % lows, temps on the twin, what changed since last time. One button exports a **share card** (PNG, 1200×630 and 1080×1920) rendered from the real scene: the rig at a nice angle, the game cover, three honest numbers and a source line. This is free marketing for the product.

---

## 4. Page by page

| Section | 4.0 shape |
|---|---|
| **Home** | The full rig at the hero angle. Anchored callouts on CPU, GPU, RAM, storage with live values and leader lines. A docked plate with one headline ("Your PC is ready", or the single most valuable next action as the one primary button), health ring around the base of the case (from `score.js`, with the reasons listed under it). |
| **Optimize › Windows / Fixes** | Camera on the board. Tweaks as grouped glass rows; each row's hover pulses the parts it affects. Batch apply uses the stage dock + review sheet (existing `stage.js`), now as a glass sheet that shows the affected parts lit on a mini twin. |
| **Optimize › CPU, GPU, Power** | Close-up shots. Hero number (56 px odometer), clocks/temps/power as anchored callouts on the part itself, power limit as a physical slider whose fill glows into the card's power connector. |
| **Optimize › Network** | Camera exits the case into the network world. Speed test is a *flight*: particles race out to the server node and back, the result numbers roll in. Latency and jitter as a live trace along the link. |
| **Gaming › Games / Pulse / Latency / Replay** | Cover-art carousel in 3D depth (cards on a gentle arc, real perspective, spring scroll). Pulse frametime as a flowing river rather than a jagged line. Replay as above. FiveM keeps its own page but on plates. |
| **Clean** | Camera on the storage drive. Found junk visualised as a stack filling the drive's capacity bar; cleaning "empties" it with the verified bytes rolling down. Startup apps as a row of lights on the board that switch off as you disable them. |
| **System** | Diagnostics as a scan sweep over the twin (a light plane passes through the case, each part ticks when checked). Processes as a dense glass table (density stays: this is a tool). History merges into the Chronoline. Restore points as marks on the same timeline. |
| **Settings** | Calm plates, no camera tricks. New: "Visual quality" (Cinematic / Balanced / Light / Classic), "Motion" (full / reduced / none), sound, and the measured GPU-cost line. |
| **Command palette (Ctrl K)** | Full-width glass bar over a dimmed stage. Fuzzy search over pages, tweaks and *symptoms* ("stutter", "high ping", "fans loud") using tags from `tweak-manifest.json`. Results show which part they touch with a tiny lit icon. Enter flies there. |

Empty and missing states become a feature: a part the app cannot read is drawn as a ghost wireframe with the honest reason ("No sensor reported this. Install the sensor bundle in Settings").

---

## 5. Architecture

Built on what exists. The twin is already a parked, persistent renderer (`js/twin/host.js`, `#twin-park`) with `setView`, `focus`, `screenPos`, `pick`, `pulse`, quality tiers and an SVG fallback.

```
js/world/
  director.js     route -> shot; owns the one renderer; glide/cut between shots; pause rules
  shots.js        named camera shots per route + per rig layout (desktop, AIO, laptop)
  anchors.js      3D point -> screen each frame (engine.screenPos), feeds callouts + leader lines
  light.js        projects key light to --light-x/--light-y; heat tints to per-plate CSS vars
  glass.js        blurred stage copy for the glass material (see below)
  chrono.js       timeline model: journal + sessions + telemetry history, playhead -> twin state
js/motion/
  spring.js       one solver for DOM and camera (pure, unit-tested)
  odometer.js     rolling digits component
  hold.js         hold-to-apply control
js/plates/
  plate.js        docked + anchored plates; wraps existing page DOM so legacy pages keep working
  leader.js       one SVG overlay for all leader lines
  provenance.js   hover/focus source tags for every [data-src] number
css/tokens.css    + material tokens (glass tint/edge/sheen), z-levels, spring durations
css/glass.css     glass material, edge light, heat rim
```

**Key decisions:**
- **Legacy pages are wrapped, not rewritten.** `showPage(page)` keeps driving lifecycle exactly as in 2.0. A plate hosts the existing page DOM; the director only adds a camera shot and anchors. Pages get upgraded one at a time, never a big-bang rewrite of `index.html`.
- **Glass without `backdrop-filter` over WebGL.** `backdrop-filter` on top of a live WebGL canvas forces expensive re-blurs every frame in Chromium. Instead the renderer writes a quarter-resolution, dual-Kawase-blurred copy of the stage into a second canvas once per frame (two cheap passes), and each plate shows that canvas through a CSS clip of its own rectangle. One blur per frame, no matter how many plates. A measured spike decides; `backdrop-filter` stays the fallback for the no-WebGL path.
- **Render on demand.** The stage renders only while something moves (camera glide, fan spin from a real RPM, a pulse, a hover). Static frames are not re-rendered. Live fans need ~30 fps, not 144.
- **Hard pause rules** (in `director.js`, unit-tested): window hidden, minimised or fully occluded, a tracked game in the foreground, battery saver on a laptop, or Settings › Visual quality = Classic. Pause means `setAnimationLoop(null)`, not a throttle.
- **One truth path.** Everything visual that implies a measurement reads from the telemetry hub through `mapping.js`. Decorative motion (the idle case fans, the assembly) is clearly decorative and never shows a number.

---

## 6. Guardrails (the parts that make it worth 500 €, not just pretty)

**Performance budgets** (measured in a real Electron run, gate for every phase):
- Game in foreground: stage GPU 0 %, app CPU < 0.5 %.
- App focused, idle on Home: < 3 % GPU on the RTX 5070, < 2 % CPU; ≤ 150 draw calls, ≤ 60k triangles.
- Glides at 60 fps on an integrated GPU at 1080p in Balanced quality.
- Cold start to interactive Home plate < 1.2 s (assembly may continue behind it).
- Memory over 2.0 baseline: < +120 MB.

**Quality tiers:** Cinematic (bloom, glass refraction, shadows, 1.5× DPR cap), Balanced (default on iGPU), Light (no refraction, flat glass, 1× DPR), Classic (no stage: the 2.0 UI on solid panels, SVG twin). Auto-picked from a 2-second benchmark on first run, changeable any time, and automatically stepped down if frame time stays high (the 3.0 context-loss lesson).

**Accessibility:** contrast checked on glass by sampling the worst case (glass over the brightest part of the stage) with `tools/check-contrast.js` extended; minimum glass opacity enforced per tier. Every camera action has a keyboard path; focus rings stay visible on glass; screen readers get the plates only (the stage is `aria-hidden`), with every callout value also in the plate text.

**Language:** all new strings in `en` and `fi` from day one (`tUI`, `tWizard` etc.), Finnish lengths checked against the narrow anchored plates.

**What we will not do:** no glow on text, cards or badges; no sci-fi HUD clutter or hexagon grids; no confetti; no fake or estimated numbers to fill a callout; no forced cinematics after the first time; no motion while a game runs.

---

## 6b. Toasts (added 2026-11-01: the current ones looked dated; BUILT 2026-11-01, `js/ui4/toast.js`, styles in `css/glass.css`)

The toast (`toast(title, msg, type, ms)` in `js/ui-helpers.js`, `.toast` in the legacy CSS) is the old flat box with a blue left rule, a round icon chip and a progress line, as in the "Restored: Disable Game DVR / Xbox Game Bar" example. It is the one 4.0 surface that still looks like 1.x. Redesign, keeping the call signature so no caller changes:

- **Material.** Smoked glass like every other 4.0 surface (same fill, same shared-light edge, same contrast guard), no coloured rule. Status shows as a small icon and, for warn/error only, a thin tint on the rim; never a coloured box.
- **Content.** A short sentence-case title; the second line is optional detail in secondary text; long names (tweak and process names) are shortened in the middle, never wrapped into a tall block.
- **Place and stacking.** Bottom centre above the Timeline tab, newest on top, at most three visible, older ones collapse into "+2 more". Never over the Apply controls or the hero window.
- **Action inside the toast.** Undo, Open, Details as a text button in the toast; the existing undo snackbar is folded into it, so there is one place for "I did something, here is the way back".
- **Tied to the rig.** Toasts about a part (a tweak, a clean, a restore) carry a tiny part glyph; hovering it pulses that part and clicking jumps there. The light pulse that already runs on apply and undo ends at the toast.
- **Motion.** Rises and fades in on the glide spring, the lifetime is shown as a thin fill under the text (pauses on hover and focus), and it leaves downward. Reduced motion: fade only. Nothing while a game runs (stage-paused rule); only errors may queue and show afterwards.
- **Sound.** Uses the existing palette (`apply`, `undo`, `warning`) only when UI Sounds is on.
- **Accessibility.** One polite live region for ok/info, an assertive one for warn/error, focusable action, Esc dismisses the newest, contrast on the worst-case backdrop checked by `tools/check-contrast.js`.
- **Language.** All titles stay `tUI` keys; Finnish lengths checked for the shortened form.
- **Done when.** Every existing `toast(...)` call renders in the new style without edits, the undo snackbar is gone, tests cover shortening, stacking order and the quiet-during-game rule, and the real app shows it on apply, undo, restore and error.

## 7. Phases

Each phase ends usable and committed, with its checks green (`npm test`, `npm run check`, jsdom smoke en+fi, browser-pane visuals, and a real Electron run for anything touching the stage).

| Phase | Scope | Proves |
|---|---|---|
| **P0 Prototype and spikes** | `design-4-preview.html`: one clickable vertical slice (Home → GPU → Network fly-through, apply-as-event, Chronoline scrub, provenance hover) with the real twin. Spikes: Kawase glass cost, render-on-demand idle cost, game-foreground pause = 0 GPU, shared light. | The direction, before any app change. Approval point. |
| **P1 Foundations** | `spring.js`, `odometer.js`, `hold.js`, `provenance.js`, material tokens + `glass.css`, View Transitions for tabs. Usable inside the current 2.0 shell. | Every page already feels better. |
| **P2 The world** | `director.js`, `shots.js`, persistent full-window stage, rail, docked plates wrapping legacy pages, pause rules, quality tiers + auto benchmark. | One continuous world; legacy pages still run. |
| **P3 Callouts** | `anchors.js`, `leader.js`, anchored plates; Home, CPU, GPU, Power rebuilt around them; shared light + heat rims. | The screenshot moment. |
| **P4 Apply as event** | Hold to apply, pulse along leader, pending → verified roll, undo reversal, taskbar progress. Wired into `stage.js` and the journal. | Truth becomes the spectacle. |
| **P5 Chronoline** | `chrono.js`, three tracks, playhead replay of recorded telemetry, History and Restore folded in. | "Rewind your PC". |
| **P6 Network world + game mode** | Camera exit into `netscene.js` world, speed test flight; game-foreground pause; cover-art environments; Replay recap + share card export. | Zero cost in game, marketing built in. |
| **P7 Assembly and sound** | Three-act boot, first-run onboarding (language picker as the first frame of the assembly), sound pass. | First impression. |
| **P8 Remaining pages** (+ toasts, see 6b) | Clean, System, Settings, Gaming lists, palette with symptoms, empty-state ghosts. | Nothing feels 2.0 anymore. |
| **P9 Polish and proof** | Perf budgets in real Electron on the desktop and a low-end/iGPU profile, 8 h soak, DPI matrix (100/125/150/200 %), a11y pass, FI review, reduced-motion and Classic walkthroughs. | Ships. |

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| GPU cost on weak PCs or while gaming | Hard pause rules, render on demand, tiers with auto step-down, Classic mode; budgets are phase gates, not hopes. |
| Glass hurts readability | Measured contrast on worst-case backgrounds, min opacity per tier, ink never on raw stage. |
| Camera motion causes nausea | Glides without overshoot, short distances, reduced motion = cuts, no camera movement on hover. |
| Scope (index.html is ~970 KB, 25 pages) | Wrap-don't-rewrite plates; each phase ships alone; P1 helps even if later phases slip. |
| WebGL context loss | 3.0 already falls back; director rebuilds the scene on restore, plates never depend on the stage. |
| "Gimmick" perception | Every effect maps to real data or a real action; the "will not do" list is enforced in review. |

---

## 9. Decisions for you

1. **Approve the direction from a prototype first (P0)?** Same as 2.0 and 3.0: I build `design-4-preview.html` and you judge it in the browser before the app changes.
2. **Default quality** on capable GPUs: Cinematic, or Balanced with Cinematic one click away?
3. **Sound:** on for the first run only, or off until enabled?
4. **Share cards:** include a small "Made with Jylli Tool" mark?
