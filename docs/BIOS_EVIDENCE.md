# BIOS Easy mode: why each suggestion is in or out

Rules live in `lib/bios/advisor.js`, setting names and target options in `lib/bios/knowledge.js`. A suggestion needs a measured fact on this PC or a readable setting. Setting names come from public dumps and vendor documentation and are **not yet verified on many real boards**; anything ambiguous falls back to manual steps.

## In
| Suggestion | Fact it needs | Evidence | Guard |
|---|---|---|---|
| Memory profile (XMP/DOCP/EXPO) | Running speed below the speed decoded from the part number (`lib/auto-opti/ram-parts.js`) | Biggest free gain for CPU-bound games | Early Ryzen 7000 BIOS (before June 2023): update first, never offered ([AM5 SoC voltage fix](https://www.hwcooling.net/en/amd-fixes-bug-that-kills-ryzen-7000-cpus-update-your-bios/)). Setting already on but speed still low: check, not "do" |
| Resizable BAR (CSM off + Above 4G + ReBAR) | RTX 30/40/50, Windows reports ReBAR off (nvidia-smi BAR1 vs VRAM) | About +10 to +17% in some games, small loss in others ([Club386](https://www.club386.com/?p=145731), [Tom's Hardware](https://www.tomshardware.com/news/resizable-bar-intel-z490-motherboard-benchmarks)) | All three settings must be found, or nothing is changed. Legacy boot mode: check, never converted |
| Boost on | Setting reads Disabled | Boost is how the part is meant to run | Setting must be readable and unambiguous |
| Hyper-Threading / SMT on | Setting reads Disabled | More threads for general work | Offered, never inside a preset: some players turn it off on purpose |
| Idle power saving back on | C-states read Disabled | Disabling can lower boost clocks and AMD advises against it outside debugging ([Tier1Settings](https://tier1settings.com/should-you-disable-c-states-for-gaming/), [Ryzen BIOS guide](https://github.com/REVOL7/BIOS-GUIDE-FOR-AMD-RYZEN)) | Never suggested as off on any PC; not in any preset |
| PCIe ASPM, fan can stop (quiet preset) | Setting reads Disabled / fan always on on a laptop | No speed lost | Normal/Moderate only |
| Dedicated graphics always (gaming preset) | Laptop with hybrid graphics and a matching setting | Avoids switching hiccups | Costs battery, said in the text |

## Check, added with "Settings that matter"
| Suggestion | Fact it needs | Why it is only a check |
|---|---|---|
| Virtualization off in firmware | `Win32_Processor.VirtualizationFirmwareEnabled` false **and** WSL / Hyper-V / Docker / VMP installed | WSL2, Hyper-V and Memory Integrity need it. Never in a preset: some people keep it off on purpose |
| TPM missing or not ready | Windows 11 + anti-cheat present + `Get-Tpm` (admin only; unknown says nothing) | Switching fTPM/PTT type erases keys stored on the chip, so we never offer the switch |
| Memory context restore (AM5 + EXPO on) | Setting found on this board | Reuses the last memory training; can hide an unstable change until the next full training. Explained, never changed |

## Settings that matter (purpose cards)
Plain-language cards, one per setting found on this board (`CARDS` in `knowledge.js`). A grouped card (ASPM, C-states, LTR, L1 sub-states, prefetchers, spread spectrum) reads several raw settings as On / Off / Mixed and is read-and-explain only. Controls exist only for a single setting that `policy.assess` allows and are never critical or read-only. Secure Boot and TPM are shown, never switchable.

A card says "Jylli recommends" only where this file already backs it: Resizable BAR on, Above 4G on, CSM off, boost on. C-states, C1E, SpeedStep, spread spectrum, ASPM, LTR and L1 sub-states have **no** recommendation: other tools say Off for these, but we found no measured gain, and C-states stay out of every preset.

## Check (we cannot do it for the user)
Raptor Lake desktop below microcode 0x12F ([Intel](https://community.intel.com/t5/Mobile-and-Desktop-Processors/Intel-Core-13th-and-14th-Gen-Vmin-Shift-Instabilty-Update-New/m-p/1686948)), Secure Boot off with anti-cheat present, BIOS older than three years.

## Out on purpose
HPET changes (no credible measurements, see `TWEAK_EVIDENCE.md`), spread spectrum, and anything involving voltages, timings, clocks or limits: that is overclocking and stays in Workstation mode. `policy.classify` drops every Critical or Read-only setting from every preset, and `test/bios-advisor.test.js` pins that.

## Supported hardware and how support is decided
`lib/bios/capability.js` builds the matrix from detection; a bundled or imported tool alone never makes a setting changeable. A setting is changeable only when the engine's write is **verified**, its read worked, the process is elevated, the PC is not a virtual machine, and `policy.assess` allows the setting.

| Engine | Detected when | Read | Write |
|---|---|---|---|
| HP WMI (`root/HP/InstrumentedBIOS`) | HP identity and the namespace answers | **Verified** on an HP ProBook 440 G8 | **Verified** (same laptop, `tools/bios-hp-test.js`); boot trial armed after risky changes |
| Lenovo WMI (`root\wmi` `Lenovo_BiosSetting`) | Lenovo identity and the class answers | Unverified (from Lenovo documentation) | Locked, no write script |
| Dell WMI (`root\dcim\sysman\biosattributes`) | Dell identity and the namespace answers | Unverified (from Dell documentation) | Locked, no write script |
| SCEWIN (AMI boards) | AMI firmware, UEFI, not a VM, user imported a signed copy | Unverified on real boards | No write path |
| Anything else (ASUS/MSI/Gigabyte/ASRock boards on AMI, Insyde, Phoenix, Award, VMs, legacy BIOS) | | Identity and explanations only | Manual steps in BIOS setup |

No universal compatibility is claimed. Coverage grows only when a vendor, model, firmware and tool combination is proven on real hardware.

## Identity sources (`lib/bios/identity.js`)
Board, system, firmware and date are read from `Win32_BIOS`, `Win32_BaseBoard`, `Win32_ComputerSystem`, `Win32_ComputerSystemProduct`, `Win32_SystemEnclosure` and the `HKLM\HARDWARE\DESCRIPTION\System\BIOS` registry copy. All of them come from the same SMBIOS tables, so "2 sources agree" means Windows reports the same thing twice, not that the vendor confirmed it. Placeholder strings ("To Be Filled By O.E.M.", "System Product Name") are dropped and listed as unconfirmed; disagreeing sources are marked as a conflict. A virtual machine is recognised from SMBIOS strings only: `HypervisorPresent` alone is true on any PC with VBS or Hyper-V on.

## Backups, restore and audit
Every commit saves a snapshot first (SHA-256, written atomically, tagged with the device fingerprint and BIOS version). The first snapshot per device and engine is pinned and never pruned. Restore refuses a corrupt file, another PC (`device_mismatch`) and a different BIOS version (`bios_changed`). After any failed write the app reverts and **reads back**: a revert only counts if the old value is really there, otherwise the result is `revert_incomplete` with the values to set by hand. `userData/bios/audit.jsonl` records every attempt with its outcome. A successful write is shown as "restart to apply" until the next boot.

## SCEWIN licensing and signature rule
SCEWIN is AMI's tool and is not redistributable, so it is never bundled: the user imports their own copy. The import is refused unless every file (`SCEWIN_64.exe` and both drivers) has a Valid Authenticode signature and the executable is signed by American Megatrends. The signature status is stored in the manifest and re-required before every run.

## Recommendations that depend on the PC
CSM off is recommended, and its control offered, only on a UEFI boot (turning CSM off on a legacy install can make Windows unbootable). ReBAR and Above 4G are recommended only for a discrete GPU that supports it (RTX 30 and newer, RDNA2 and newer, Intel Arc) on UEFI. Cards carry a level: default, system (depends on this PC) or expert.

## Not yet verified
Setting-name aliases and option labels on real boards other than the HP ProBook 440 G8, the brand menu hints (`WHERE` in the advisor), which are worded "usually", the Lenovo and Dell readers, SCEWIN on any AMI board, and the whole identity layer on OEM, laptop and VM systems other than this development PC.

## Remaining gaps
Lenovo, Dell and SCEWIN writes; Insyde/Phoenix/Award engines; per-card gain and trade-off text for every card (Easy cards still use the existing purpose text); Intel Arc and AMD ReBAR detection (`caps.rebar` is measured through nvidia-smi, so non-NVIDIA cards get cards but no automatic suggestion).
