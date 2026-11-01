# Project notes

## Commands
- Start app: `npm start`   <!-- replace with your real command -->
- Build/package: `npm run build`   <!-- replace with your real command -->

## Large File Rules (index.html is >100KB)
- NEVER Read `index.html` in full. Use Grep to find the section, then Read with `offset`/`limit`.
- Edit with the Edit tool only. Never rewrite the whole file.
- Define global state (LANG, settings, api) before feature logic.

## index.html map (keep updated)
Search for these section markers instead of reading the file:
- `// === LANG ===`      translations object
- `// === SETTINGS ===`  settings + `setLanguage(lang)`
- `// === WIZARD ===`     onboarding / `language-picker`
- `// === UI ===`         tab rendering
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
