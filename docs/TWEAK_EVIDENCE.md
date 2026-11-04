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
