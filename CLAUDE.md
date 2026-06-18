## Translations (EN & FI)
All UI text needs both `en` and `fi` in the `LANG` object (`index.html`).

Helper functions: `tUI` (labels/buttons), `tTitle`/`tSub` (sidebar/header),
`tWizard` (onboarding), `tDesc`/`tFixDesc` (descriptions).

**Never translate:** CPU, RAM, GPU, VRAM, BIOS, UEFI, DPC, ISR, SFC, DISM,
SMART, MHz, GB, FPS, NVMe, Registry, PowerShell, Discord, FiveM, GTA V,
Windows, process names, file paths. Main.js logs always in English.

Flow: First launch → `language-picker` → save `settings.language`.
Settings tab toggle calls `setLanguage(lang)`.

## Large File Rules (>100KB)
- Use `replace` tool only — never rewrite whole file.
- Move ONE logical block per turn when refactoring.
- Run `npm run build` + user verify after every structural change. Never run `npm start` or launch the app — build only.
- Define global state (LANG, settings, api) before feature logic.
- Present plan and wait for approval before any structural edit.

## Context
- Check `/context` regularly. If Messages > 80k, remind user to `/clear`.
- Before `/clear`: summarize current task status for easy resumption.