# Debloat evidence

`lib/debloat/catalog.js` is the only list of what the Debloat tab may remove or switch off. This file says why things are in it, what decides the lane, and what a run can and cannot undo.

## Lanes (lib/debloat/classify.js, the only place these rules live)
An item that is present on this PC lands in exactly one lane, checked in this order:
1. **Kept: protected.** Store, Store purchases, App Installer, Gaming Services and Xbox sign-in (`lib/uwp-protect.js`) while the "Keep Xbox sign-in and Microsoft Store" switch is on.
2. **Kept: in use.** The item has a `use` fact and the scan found it: a physical printer (Print Spooler), a paired Bluetooth device (Bluetooth Support), an Xbox controller (Xbox Accessory Management).
3. **Kept: needed.** One of the item's `needs` intents is on (Xbox, Streaming, Work, Development, Laptop, Printing, Gaming). Intents are detected from the scan and can be changed on the page; the lists reclassify at once, without a rescan.
4. **Your call: opened recently.** The program was opened in the last 30 days (Prefetch). Not pre-ticked.
5. Otherwise the catalog lane: **Safe** (pre-ticked) or **Review** (never pre-ticked: some people use it).
A kept item can be unlocked with "Remove anyway"; it then moves to Your call, unticked.

## What is measured, and where it comes from (lib/debloat/probe.js, one PowerShell call)
| Shown | Source |
|---|---|
| Apps present, package family, disk size | `Get-AppxPackage -AllUsers` (catalog names only), size of `InstallLocation` |
| Provisioned (Windows reinstalls for new users) | `Get-AppxProvisionedPackage -Online` |
| Service state and start type, RAM | `Win32_Service`; RAM only when the service has its own process (a shared svchost is not that service's memory) |
| Wake-ups in 24 h | `Get-ScheduledTaskInfo` `NextRunTime` plus the trigger's repetition interval; no data means no tick |
| Ad surfaces | The registry values named in the catalog (`off` / `on` per value) |
| Optional features | `Get-WindowsOptionalFeature -Online` |
| Last opened | Prefetch `.pf` files (and UserAssist for Programs). Prefetch is empty when SysMain is off: the page then says "No launch record", never "never used". |
| Printer, Bluetooth, Xbox controller, Game Pass, OBS, git / VS Code, laptop | `Get-Printer`, `Get-PnpDevice`, `C:\XboxGames`, install folders, `Win32_Battery` / chassis type |

The receipt's before and after numbers are a second scan of the very items that were run.

## Undo
| Kind | How a run changes it | Undo |
|---|---|---|
| Ad surface | `Set-ItemProperty` through the journal | Exact: the journal restores the recorded old value |
| Service | `Set-Service -StartupType Disabled`, then stop | Exact start type (journal) |
| Scheduled task | `Disable-ScheduledTask` | Exact state (journal) |
| Context-menu entry | `Remove-ItemProperty` of the approval | Exact (journal) |
| Optional feature | `Disable-WindowsOptionalFeature -NoRestart` | `Enable-WindowsOptionalFeature` (journal handler `feature`) |
| App | `Remove-AppxPackage -AllUsers`, and `Remove-AppxProvisionedPackage` when "Stop Windows reinstalling removed apps" is on | **Way back**: offline when the package is still provisioned (`Add-AppxPackage -RegisterByFamilyName`), otherwise the Store page for the package family opens (internet and one click) |
| Win32 program, ghost device | The program's own uninstaller; `pnputil /remove-device` | None here; the tab says so |

A restore point is created first when a run includes apps or features, or more than five items. If it cannot be created the run stops and asks before continuing without one.

## Guard
The scan result is compared with what earlier runs switched off (`jt_debloat.json`, `removed`). Items that are on again are "came back". Free: shown when the tab opens. Premium: a background check at start-up when the Windows build or update revision changed (or after a week), with a notification or a quiet re-apply.

## Why some items are Review, not Safe
- Services: Search indexer, Program Compatibility Assistant, Mobile Hotspot, Print Spooler, Geolocation, Bluetooth, Xbox Accessory Management, Diagnostics Hub (each takes a visible feature away, text in `w_<id>`).
- Apps: Phone Link, Cross Device, Mail and Calendar, new Outlook, Teams, To Do, Power Automate, Dev Home, Copilot, Spotify, Widgets, and everything the shield protects.
- Tasks: Family Safety, automatic Store app updates.
- Ads: the taskbar Widgets button.
- Features: everything except SMB 1.0 and PowerShell 2.0 (known security holes) is Review.
