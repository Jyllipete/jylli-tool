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
- `npm run preview -- --arrival` / `--tours` shoots those flows (`tools/ui-preview`)
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
