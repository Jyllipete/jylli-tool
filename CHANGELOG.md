## v1.4.8 — 2026-05-24

### Installer
- Dark-themed installer matching the app's look (#14141A bg, indigo accents)
- Correct "Jylli Tool" branding and v1.4.8 version on sidebar and header

### Cleanup tab
- Recycle Bin row — live size reading, one-click empty
- Scan Sizes button — scans all 17 targets and shows GB chips before you clean
- Size chips turn green after cleaning to show freed space
- Quick Clean now shows a live progress modal instead of a silent loop
- 4 new App Cache rows: Spotify, Xbox App, MS Store, Roblox

### Settings
- Start at Windows Startup toggle — registers/removes Jylli Tool from Windows startup

### Networking tab
- Adapter Info Card — shows NIC name, speed, driver (Ethernet) or SSID, band, signal (Wi-Fi)
- Apply Safe Defaults — applies 9 safe tweaks in one click
- 3 new DNS options: Quad9 (malware-blocking), AdGuard (ad-blocking), Custom DNS
- DNS conflict detection between providers
- Network Health Check — tests gateway ping, DNS speed, route hops, packet loss
- RSS CPU Affinity tweak — pins NIC processing off core 0 (Ethernet only)
- NDIS Polling Mode tweak — lower DPC latency on Intel/Realtek NICs (Ethernet only)
- DNS Benchmarker — tests Cloudflare/Google/Quad9/AdGuard latency, sorted by speed
- Live Ping Monitor — rolling 2-min canvas graph with avg/max/jitter

### General Tweaks tab
- Section collapse/expand with persistent state
- Apply counter: live X/56 total + per-section X/Y badge
- Reboot Queue Bar — sticky bar with "Restart Now" when reboot-required tweaks are applied
- Quick Win Strip — 6 highest-impact tweaks pinned at top with Apply All
- Info Popover (?) on 22 tweak cards showing registry key and expected impact

### System Restore tab
- Admin detection banner with Relaunch as Admin button
- Stale snapshot warning if no restore point in last 7 days
- Disk usage bar (color-coded)
- Auto-snapshot scheduler (Off / 1 / 3 / 7 days)
- Click-to-select rows with preview card; no more manual sequence number input
- Per-row delete with confirmation
- Age badges (★ latest, ⚠ old >30 days) and type pills
- Export restore points to .txt

### Fix
- Restore Point deletion was broken — now correctly finds the shadow copy and deletes it; reports real errors instead of false success
