# Project notes

## Commands
- Start app: `npm start`   <!-- replace with your real command -->
- Build/package: `npm run dist` (uninstaller → NSIS → branded `dist/Jylli-Tool-Installer.exe`; plain `npm run build` needs `npm run build:uninstaller` first)

## Large File Rules (index.html is >100KB)
- NEVER Read `index.html` in full. Use Grep to find the section, then Read with `offset`/`limit`.
- Edit with the Edit tool only. Never rewrite the whole file.
- Define global state (LANG, settings, api) before feature logic.

## index.html map (keep updated)
Search for these section markers instead of reading the file:
- `js/lang/en.js`, `js/lang/fi.js`  translations (`LANG.en` / `LANG.fi`); helpers `tUI`, `tG(group, key, vars)` near `// ─── Language ───`
- `var settings = {}`  global settings; `async function setLanguage(lang)` saves the language
- `// ─── Onboarding Wizard ───`  `buildWizardSteps` / `startOnboarding` (being replaced by `js/arrival.js`); `js/boot-logic.js` `selectLanguage` for `#lang-picker`
- `function showPage(page, tabId)`  tab rendering; `js/shell.js` nav and header; `js/pages/*.js` page builders
- `js/arrival.js` first-launch flow (`JylliArrival`), `js/tour.js` + `js/tours.js` guided tours, `js/concierge.js` + `js/pages/home-concierge.js` first-move suggestions; LANG groups `arrival`, `tour`, `concierge`
- `js/auto-opti.js` + `js/auto-opti/reactor.js` + `css/auto-opti.css`: Auto-Optimize 2.0 (scan, diagnosis, plan, run, result, welcome back); engine in `lib/auto-opti/` (catalog = the only list of tweaks it may run); LANG group `autoOpti`; `npm run preview -- --auto-opti` shoots every scene
- BIOS workstation: `lib/bios/` (`scewin-format.js` parser + byte-preserving patcher, `policy.js` risk tiers + write locks, `model.js`, `hp-wmi.js`, `doctor.js`, `scewin-install.js` bring-your-own SCEWIN, `ipc.js` `bios2-*` handlers), `js/bios/workstation.js` + `category.js`, `css/bios.css`, LANG group `bios`; HP writes unlocked (`policy.WRITES_VERIFIED`), `boot-trial.js`, `transaction.js`, `snapshots.js`; Easy mode: `knowledge.js` + `advisor.js` (pure) + `js/bios/easy.js`, `docs/BIOS_EVIDENCE.md`; old BIOS tab UI and SCEWIN handlers removed (main.js keeps bios-hyper-v/cstates/intel-power/ram-stress/lhm-sensors/boot-chronicle/stability-check until Instruments are rebuilt in the workstation); `npm run preview -- --pages bios-tuner`
- `npm run preview -- --arrival` / `--tours` shoots those flows (`tools/ui-preview`)
- Premium pitch on locked tabs: `js/premium.js` (`JylliPremium.build(c, tabId)`, tab ids = `js/routes.js` tab ids, `premium: true` there drives the tab badge) + `css/premium.css`, LANG group `premium` (price is the `price` key); `npm run preview -- --tier free --pages bios-tuner,pulse,hardware`
- `lib/capabilities.js` (profile -> `caps`), `lib/tweak-applicability.js` (one rule table: which tweak shows/recommends on which PC), `lib/cpu-arch.js` / `lib/gpu-arch.js` (name -> generation/arch), `lib/auto-opti/probes2.js` (CPU layout, VBS, GPU memory/IRQ, disk bus, NIC props), `lib/tweak-risk.js` + LANG `tweakRisk`/`riskTag` (required for every tier >= 2 tweak); `docs/TWEAK_EVIDENCE.md` says why each tweak is in or out; IPC `get-applicability`
- Auto-Optimize Maximum mode: `intensity` ('safe'|'max') in `lib/auto-opti/{catalog,findings,plan,run}.js` (`isAllowedTweak`, `MAX_TWEAKS`, `EXPERT_TWEAKS`, `FOREVER_BANNED`); UI mode switch + expert section in `js/auto-opti.js` (`planReq` builds every plan/run request); `npm run preview -- --auto-opti --ao-max --ao-profile max-desktop`
- Tweak cards: `makeCard` + `tcMeasure`/`tcToggle` in index.html (More/Less button, `.tc-open` state, risk box folds into `.tc-details`); CSS in the "Legacy tweak cards" block of css/ui.css. Line-clamp is never changed on :hover (`tools/check-ui.js` guards it, lint-page flags `clamp-paints-outside`)
- `storePreflightResult(r)`  the single writer of preflight state; `window._bootFinished`  resolves when the splash is gone
<!-- Add these marker comments to index.html once; the map is only useful if they exist. -->

## Translations (EN & FI)
All UI text needs both `en` and `fi` in the `LANG` object.

Helpers: `tUI` (labels/buttons), `tTitle`/`tSub` (sidebar/header),
`tWizard` (onboarding), `tDesc`/`tFixDesc` (descriptions).

**Never translate:** CPU, RAM, GPU, VRAM, BIOS, UEFI, DPC, ISR, SFC, DISM,
SMART, MHz, GB, FPS, NVMe, Registry, PowerShell, Discord, FiveM, GTA V,
Windows, process names, file paths. Main.js logs always in English.

Flow: First launch → `language-picker` → save `settings.language`.
Settings tab toggle calls `setLanguage(lang)`.

## Working style
- Keep answers short. No recap of changes beyond one or two sentences.
- Run tests/builds with output filtered to errors only (`| tail -30` or `| grep -i error`).
