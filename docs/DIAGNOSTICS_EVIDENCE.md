# Diagnostics evidence

The checks in `lib/diagnostics/probes.js` and the findings in `lib/diagnostics/findings.js` are the only things Diagnostics measures and says. This file says where each number comes from and why a threshold is where it is. A check that cannot run is shown as "not measured"; it never counts as a pass or a fail.

## What is measured, and where it comes from

| Area | Check | Source |
|---|---|---|
| Stability | Blue screens, with stop code | System log event 1001 (WER-SystemErrorReporting) and `C:\Windows\Minidump` file dates |
| Stability | Power loss, unexpected shutdown | Kernel-Power 41, event 6008 |
| Stability | Hardware errors | WHEA-Logger 17, 18, 19, 20, 47 |
| Stability | Graphics driver resets | Display 4101 |
| Stability | Disk errors | disk / stornvme / ntfs events 7, 11, 15, 51, 55, 98, 129, 140, 153 |
| Stability | App crashes and hangs | `Win32_ReliabilityRecords` (Application Error, hang) |
| Stability | Stability index | `Win32_ReliabilityStabilityMetrics`. Empty on PCs where the reliability task is off; the timeline then says so |
| Storage | Failure prediction, health, wear, temperature, uncorrected errors | `MSStorageDriver_FailurePredictStatus`, `Get-PhysicalDisk`, `Get-StorageReliabilityCounter` (wear, temperature and error counters need admin) |
| Storage | Free space, TRIM | `Get-Volume`, `fsutil behavior query DisableDeleteNotify` |
| Storage | Battery wear | `root\wmi` BatteryStaticData, BatteryFullChargedCapacity, BatteryCycleCount |
| Memory | Commit charge | `Win32_OperatingSystem` (virtual size vs free virtual) |
| Memory | Last Windows memory test | MemoryDiagnostics-Results events 1201 (no errors) and 1202 (errors). Event ids, not message text, so it works in every language |
| Memory | Pattern test (deep, Pro) | The existing RAM stress handler (256 MB, six patterns) |
| CPU | Idle load | Two `os.cpus()` snapshots 1.2 s apart |
| CPU | Temperature now | The metrics loop (`_lastMetrics`), from LibreHardwareMonitor |
| CPU | Throttling (deep, Pro) | The existing Pulse thermal audit |
| GPU | Driver age, refresh rate | The Auto-Optimize system profile (`Win32_PnPSignedDriver`, display modes, EDID) |
| Drivers | Devices with errors | `Win32_PnPEntity` where `ConfigManagerErrorCode` is not 0, leaving out 22 (disabled by the user) and 45 (not connected) |
| Drivers | Driver age | `Win32_PnPSignedDriver` filtered on the server side by device class, so it no longer times out into an empty list |
| Drivers | Missing runtimes | The existing runtime detection (registry) |
| Windows | Image and system files (deep) | `Repair-WindowsImage -Online -CheckHealth` (`ImageHealthState`, locale-safe) and `sfc /verifyonly` |
| Windows | Pending restart, last update | CBS `RebootPending`, WindowsUpdate `RebootRequired`, `Get-HotFix` |
| Security | Firewall, Defender, UAC, Windows Update | The Auto-Optimize system profile |
| Security | TPM | `Get-Tpm`. Only asked when the app is elevated: without admin it reports "no TPM" on PCs that have one |
| Network | Router and internet | `Test-Connection` x4 to the default gateway and to 1.1.1.1. A router that drops ICMP while the internet answers is "not measured", not 100% loss |
| Configuration | Modified Windows, overlays, conflicts | The pre-flight scan (`runPreflightCore`): OEM markers, services, 70+ registry and service states |

## Thresholds

- **Blue screens**: any in 30 days is a finding; two or more is critical. Every one is a stop.
- **Disk wear** high at 80%, critical at 90%: SSD vendors rate endurance in written bytes and warranties usually end near 100%; past 80% there is little margin left.
- **Disk temperature** medium at 70 °C, high at 80 °C: NVMe controllers throttle from about 70-80 °C.
- **Free space** medium under 10%, high under 5% on the system drive: Windows needs room for updates, the page file and temporary files.
- **Commit charge** medium at 85%, high at 95%.
- **Stability index** below 6 averaged over the last 7 days. 10 is perfect; Reliability Monitor shows red below about 5.
- **Driver age** over 18 months (548 days) for display, network and audio drivers. GPU drivers over 180 days are a low finding, over 365 days medium.
- **Network** router loss over 2% or average over 25 ms; internet loss over 2% or average over 90 ms.
- **Throttling** 8% or more of samples under load.

## Likely cause (`causes.js`)

A change (a driver install, a Windows update, a tweak from the change journal) is blamed only when all of these hold: serious incidents follow it within 48 hours, the incident's cause class fits the kind of change, and the PC was not already crashing as often before it. A bare time match scores too low to show. Confidence is low, medium or high; low is never shown as a suspect. Undoing a tweak through the journal is the suggested test, never an automatic action.

## Score

Each area starts at 100 and loses the penalty of each finding. An area with no measurable rule has no grade. The overall score is the weighted blend of the measured areas (`js/score.js`), capped at the worst area plus 30, so one failing disk cannot be averaged away.

## What it may change (`repair.js`)

| Repair | What it does | Restore point | Undo |
|---|---|---|---|
| `enable-trim` | `fsutil behavior set DisableDeleteNotify 0` | no | set it back to 1 |
| `enable-firewall` | `Set-NetFirewallProfile` on for all profiles | no | turn it off in Windows Security |
| `enable-wu` | Windows Update service to Manual and started; removes the `NoAutoUpdate` policy | no | journal |
| `restore-pagefile` | System-managed page file | yes | restore point |
| `memdiag` | `bcdedit /bootsequence {memdiag}`: the Windows memory test on the next start | no | `bcdedit /bootsequence` entry is used once and removed by Windows |
| `dism-sfc` | `Repair-WindowsImage -RestoreHealth`, then `sfc /scannow` | yes | restore point |
| `restart` | `shutdown /r /t 30` (cancel with `shutdown /a`) | no | n/a |
| `runtimes` | The existing runtime installer (Pro) | no | uninstall in Windows |

Each one runs through the change journal as `diag:<id>`, so it appears in History. The page sends an id; no command text ever comes from the renderer.

## Benchmarks

Fixed amounts of work, timed, median of three runs. CPU and memory run in worker threads. The disk test writes a 512 MB temporary file next to the app data, reads it back and does 3000 random 4K reads at queue depth 1; the file is deleted in a `finally`. Node cannot bypass the Windows file cache, so disk read figures can be higher than the drive's real speed and are labelled so. A run is refused while a game is running.

1000 points is a Core i5-1135G7 laptop (4 cores, 8 threads, NVMe). The reference values live in `REF` in `lib/diagnostics/bench.js`. Twice as fast scores 2000. Points from different versions of the reference are not comparable.
