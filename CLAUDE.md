## Translations

This app supports **English (en)** and **Finnish (fi)**. The translation system lives in the `LANG` object near the top of `index.html`.

**Rule: whenever you add new user-facing UI text, you MUST also add the Finnish translation with the same key.**

### Where strings go

| Content type | Object key | Helper function |
|---|---|---|
| UI labels, buttons, status text | `LANG.en.ui` / `LANG.fi.ui` | `tUI('key')` |
| Page titles (sidebar + header) | `LANG.en.titles` / `LANG.fi.titles` | `tTitle('page-id')` |
| Page subtitles | `LANG.en.subtitles` / `LANG.fi.subtitles` | `tSub('page-id')` |
| Onboarding wizard strings | `LANG.en.wizard` / `LANG.fi.wizard` | `tWizard('key')` |
| Tweak descriptions (optional) | `LANG.en.tweakDescs` / `LANG.fi.tweakDescs` | `tDesc('tweak-id')` |
| Fix descriptions (optional) | `LANG.en.fixDescs` / `LANG.fi.fixDescs` | `tFixDesc('fix-id')` |

### What to translate

Translate: descriptions, instructions, button labels, section headers, status messages, tooltips, modal text, empty states, toast messages.

Keep in English (never translate): CPU, RAM, GPU, VRAM, BIOS, UEFI, DPC, ISR, SFC, DISM, SMART, MHz, GB, MB, FPS, NVMe, Wi-Fi, Ethernet, Registry, PowerShell, Task Scheduler, Discord, FiveM, GTA V, CitizenFX.ini, Pulse, Windows, Microsoft Store, OneDrive, Xbox, Bluetooth, process names, file paths, tweak IDs, technical metric labels.

Log messages in `main.js` stay in English always.

### Language picker

On first launch (when `settings.language` is not set), the app shows a full-screen language picker before the loading screen. After selection it saves `settings.language` and continues the auth/boot flow.

The Settings tab → Appearance section has an EN / FI toggle that calls `setLanguage(lang)`.
