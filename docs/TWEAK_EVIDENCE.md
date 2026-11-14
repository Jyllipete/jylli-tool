# Tweak evidence

Why each performance tweak is in, out or gated. Evidence is kept here, not in the UI (no verdict badges). Checked 3 Nov 2026.
"Measured" = a benchmark exists; "documented" = vendor/Microsoft says it works that way; "community" = forum reports only.

## Retired (no measurable effect, negative, or not a performance change)
| Tweak | Reason |
|---|---|
| tcp-stack | every value is the Windows default except `initialrto=2000`, which is slower than the default 1000 |
| tcp-keepalive, tcp-retransmit | idle-connection housekeeping, no effect on game latency |
| fivem-network, net-del-ack, tcp-buffers | Nagle / delayed-ACK settings only touch TCP; games use UDP and many already set TCP_NODELAY ([Wikipedia](https://en.wikipedia.org/wiki/Nagle%27s_algorithm), [GameLoopHub](https://gameloophub.com/?p=3043)) |
| mmcss, fivem-mmcss | only threads registered with MMCSS are affected; the values written are defaults |
| nvidia-* registry tweaks | `PowerMizer*`, `PerfLevelSrc`, `D3PCLatency`, `F1MaxLatency` are legacy/undocumented; the real controls live in the driver profile |
| amd-* registry tweaks | `KMD_*` keys unverified; ULPS only matters for CrossFire |
| process-count-reduction, split-large-caches, memory-guard-tune, fivem-vm | SvcHost split / `DisablePagingExecutive` / `LargeSystemCache`: no FPS effect on client Windows |
| disable-hdcp, bcd-tweaks, disable-auto-maintenance, speed-shift, nic-ndis-poll | no performance effect, cosmetic, or already the default |

## Kept, with conditions
| Tweak | Evidence | Condition in `lib/tweak-applicability.js` |
|---|---|---|
| global-timer-resolution | community, mixed; restores pre-2004 behaviour where one app's timer request applies system-wide ([Wagnard forum](https://www.wagnardsoft.com/forums/viewtopic.php?p=11479)); sometimes adds input lag on Win11 ([Blur Busters](https://forums.blurbusters.com/viewtopic.php?p=113547)) | Windows 11; caution on laptops |
| disable-mpo | community; Win11 24H2+ also needs `OverlayMinFPS=0`; driver/Windows updates reset it | NVIDIA/AMD, Windows 11 |
| vbs-disable, hvci-offload | measured ~8% on a Ryzen 7 5800X3D under 24H2 ([ComputerBase via Landian](https://landian.news/article/3401.html)); Microsoft auto-enables Memory Integrity from 13 Oct 2026 ([gHacks](https://www.ghacks.net/2026/09/07/windows-11-will-auto-enable-memory-integrity-starting-in-october-with-possible-gaming-impact-on-older-cpus/)) | caution on CPUs with MBEC (Intel 7th gen+, Zen 2+) |
| spectre-meltdown | community, 5-10% on old Intel (i7-8750H anecdote); microcode mitigations still apply | recommended only on Intel <= 8th gen |
| cpu-parking, amd-power-plan | breaks the V-Cache steering on dual-CCD X3D (AMD recommends Balanced) | hidden on dual-CCD X3D |
| msi-mode | documented mechanism ([Microsoft](https://learn.microsoft.com/windows-hardware/drivers/kernel/enabling-message-signaled-interrupts-in-the-registry)); gain unproven; NVIDIA drivers may reset it | graphics card only, only when it uses line-based interrupts |

## Added
| Tweak | Evidence |
|---|---|
| gpu-per-app-preference | documented Windows per-app GPU setting (`UserGpuPreferences`, `GpuPreference=2;`); hybrid-graphics systems often start games on the iGPU |
| mouse-pointer-1to1 | 6/11 is the only non-scaling pointer speed |
| fth-reset | Fault Tolerant Heap silently shims crashing apps; reset documented ([Microsoft](https://learn.microsoft.com/en-us/windows/win32/win7appqual/fault-tolerant-heap)) |
| wifi-gaming-tune | community + vendor guidance: background scans cause 2-5 s driver stalls ([SmallNetBuilder](https://www.smallnetbuilder.com/wireless/wireless-features/wi-fi-ping-spikes-causes-and-fixes/)) |
| hypervisor-off | Microsoft lists Memory Integrity and Virtual Machine Platform as the FPS costs; `bcdedit /set hypervisorlaunchtype off` |
| Info findings | Intel Vmin-shift microcode 0x12B / 0x12F ([Club386](https://www.club386.com/intel-publishes-new-microcode-to-further-improve-stability-on-13th-14th-gen-core-cpus)); Intel APO needs the DTT driver ([TweakTown](https://www.tweaktown.com/news/107612/intel-apo-support-expands-for-core-ultra-200-series-cpus-boosts-fps-by-up-to-14/)); Resizable BAR via nvidia-smi BAR1 total |

## Evaluated and not shipped
- **Native NVMe driver (`nvmedisk.sys`) via FeatureManagement overrides**: sources conflict on whether Microsoft removed the client workaround ([TechPowerUp](https://www.techpowerup.com/347650/microsoft-removes-registry-hack-for-faster-nvme-ssds-in-windows-11)), and a wrong guess can leave Windows unbootable. Only worth shipping after verifying on a machine with a restore point.
- **Defender game-folder exclusions**: speed-ups are anecdotal; commit 2f50738 removed exclusions for security reasons.
- **Win32PrioritySeparation variants, HPET bcdedit, NetworkThrottlingIndex, Dev Drive for games**: no credible measurements.

## Auto-Optimize Maximum mode
Maximum (Premium) adds tweaks with a trade-off to an Auto-Optimize run. Every row is gated by `lib/tweak-applicability.js`; an unknown fact offers nothing.
- **Moderate, on by default when the rules recommend them:** MSI mode (graphics card on line-based interrupts), MPO off (NVIDIA, several monitors), NIC interrupt moderation off, Wi-Fi tuning (off by default on laptops), Fault Tolerant Heap reset, PCIe link power management off, power throttling off, background Store apps off.
- **Optional, always off by default (weak or mixed evidence):** global timer resolution, fullscreen optimizations off, NIC offloads off, SysMain off, memory compression off.
- **Expert (tier 3), each needs the typed confirmation:** hypervisor off, Memory Integrity off, Spectre/Meltdown mitigations off. Offered only on PCs where they can help; never on domain-joined PCs or with a kernel anti-cheat service; the Memory Integrity row is dropped when the hypervisor row is offered.
- **Never in any mode:** Defender and notification tweaks, full mitigation wipe, VBS disable (redundant), biometrics and Bluetooth off.
- **Not in Maximum by design:** `cstates` (the max-performance plan already sets the useful values, and forcing idle states off stops Ryzen single-core boost).

## Audit 2 (14 Nov 2026)
Second pass over all 191 tweak ids (51 were already retired). "Measured" = a benchmark exists, "documented" = Microsoft or the vendor says so, "community" = forum reports only. Nothing here was measured on a real PC by this project: these are research findings and code reading, not benchmark results.

### Retired (Apply refuses, Restore still puts the original back)
| Tweak | Why |
|---|---|
| defender-quiet, rt-scan-trim | They write `MAPSReporting 0` and `SubmitSamplesConsent 2`: Defender cloud protection and sample submission off, not just notifications. Microsoft recommends keeping cloud protection on; "never send" also turns off Block at First Sight ([Microsoft Learn](https://learn.microsoft.com/en-us/defender-endpoint/enable-cloud-protection-microsoft-defender-antivirus)). No FPS measurement exists. `defender-quiet` was recommended and its text called it a notification mute. |
| defender-core-off | Microsoft: `DisableAntiSpyware` is ignored on current platform versions when Tamper Protection is on ([Microsoft Learn](https://learn.microsoft.com/en-us/windows-hardware/customize/desktop/unattend/security-malware-windows-defender-disableantispyware)). Where it works it removes the antivirus for an unmeasured gain. |
| defender-idle-priority | No measurement; its description claimed exclusions the code no longer adds and "50-200 ms DPC spikes" with no source. |
| full-mitigation-wipe | CFG, SEHOP and ASLR off for every program for an unmeasured gain. |

### Fixed
| Item | Finding | Source / evidence |
|---|---|---|
| App Optimizer: Steam, Epic, EA, Riot, Playnite, GeForce Experience at Idle priority | A child of an IDLE or BELOW_NORMAL parent gets that class when it does not set one, so games started from the launcher can run at Idle priority | [CreateProcess, Microsoft Learn](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessw). Priority is no longer written. EA, Riot and Playnite are hidden, Epic keeps only "do not start with Windows", Steam keeps "start minimized", GeForce Experience keeps the telemetry service off. Diagnostics finds leftovers (`launcher-idle-priority`) and removes them with one repair. `steam.cfg` (blocks Steam client updates) is no longer written and only a file with our exact content is removed. |
| Restore buttons that wrote a "default" | About 25 tweaks restored a hardcoded value, e.g. mouse acceleration forced on, TRIM forced off, an empty page-file list. The journal already recorded the real original | The Restore button now replays the journal for every tweak except those that snapshot something the journal cannot read (`ownRestoreOnly` in `lib/journal-service.js`). Fallbacks no longer disable TRIM or the page file, and partial fallbacks now cover everything the tweak wrote. |
| Windows tab probes | `explorer-perf`, `disable-background-apps`, `compat-scanner-off`, `diagnostics-off`, `search-cloud-off` read something their tweak does not write, so the row never showed the real state; `usb-suspend` read a registry key it never writes | Probes now read what is written; `usb-suspend` shows "unknown" |
| Recommended set | `security-quiet`, `security-toast-off` (hide protection alerts), `disable-fso` (mixed evidence, conflicts with flip-model windowed optimizations), `do-solo-mode` (same value as the other Delivery Optimization tweak), `compat-scanner-off`, `diag-tasks-off` (no evidence) were recommended | `rec` removed; they stay available |
| Debloat | `SysMain` was pre-ticked on every PC (the Windows tab gates it to 16 GB+ RAM and an SSD); Game Bar could be removed on a dual-CCD X3D | SysMain is now Review. Game Bar and its overlay are kept on a dual-CCD X3D (see below). |
| `fix-wifi` | Ran `netsh advfirewall reset` (wipes the user's firewall rules) at tier 1 | Reset removed, tier 2 so a restore point is made |
| Auto-Optimize `fivem` finding | Its `fivem-priority` step was retired and could never run | Step removed |
| Descriptions | About 20 described a different change than the code makes, or promised unmeasured numbers ("10-50 ms", "1-3 ms", "Measured 2-10%") | Rewritten in `js/lang/audit-en.js` / `audit-fi.js` (loaded last). Retired ones say "Retired". |
| Memory Integrity wording | Windows began enabling Memory Integrity automatically on eligible PCs on 13 Oct 2026 and will not re-enable it if the user turned it off | `vbs-disable` / `hvci-offload` text updated ([Tom's Hardware](https://www.tomshardware.com/software/windows/microsoft-will-expand-windows-11-memory-integrity-feature-to-more-pcs-starting-in-october-security-feature-reduces-gaming-performance-on-some-systems), [gHacks](https://www.ghacks.net/2026/09/07/windows-11-will-auto-enable-memory-integrity-starting-in-october-with-possible-gaming-impact-on-older-cpus/)). Microsoft lists Memory Integrity and Virtual Machine Platform as a possible gaming cost without figures; the figures online are inconsistent. |

### Added
| Finding | Evidence |
|---|---|
| `x3d-gamemode-off` (CPU & Memory, dual-CCD Ryzen X3D only, informational) | The AMD chipset driver relies on Game Mode / Game Bar to learn a game is running and keep it on the cache CCD; with Game Mode off it may not. Reported by [Neowin](https://www.neowin.net/news/microsofts-xbox-game-bar-boosts-windows-11-and-10-gaming-performance-on-amd-ryzen-7950x3d/), [Hardware Busters](https://hwbusters.com/cpu/amd-ryzen-9-7950x3d-core-parking-problem-solution/) and reviews; AMD's own page was not retrieved. Nothing is applied: it tells the user where to turn Game Mode on. An unset value is the Windows default (on) and is not flagged. |
| `launcher-idle-priority` (Diagnostics) + `launcher-priority` repair | See App Optimizer above. |

### Researched, not shipped
- **Frame cap just below refresh with VRR + V-Sync** ([Blur Busters G-SYNC 101](https://www.blurbusters.com/gsync/gsync101-input-lag-tests-and-settings/14/)): well supported, but it is a per-game / per-driver setting that cannot be applied or reverted safely from here.
- **Dynamic Refresh Rate / monitor running below its maximum** ([Microsoft](https://support.microsoft.com/article/c8ea729e-0678-015c-c415-f806f04aae5a)): the `refresh-below-max` GPU finding already covers it.
- **HAGS and Game Mode as default-on:** independent results are small and mixed, mostly frame-time consistency, so they stay opt-in with hedged copy.
- **NIC interrupt moderation off:** Intel documents low-latency use cases for it and warns of higher CPU use, but nothing is gaming-specific ([Intel](https://www.intel.com/content/www/us/en/support/articles/000005783/ethernet-products.html)); it stays Maximum-mode only.

### Known limits
- The NIC tweaks (`nic-*`) go through `Set-NetAdapter*`, which the journal cannot read, so their Restore still writes the driver default ("Enabled") when no snapshot exists. Snapshotting per adapter is not done yet.
- Several fallback restores for old tweaks still write defaults when no journal entry exists (for example an install that applied them before the journal). They are no longer destructive (TRIM, page file).
- Everything in this audit is verified by unit tests and code reading. It was not run on real hardware by this change.
