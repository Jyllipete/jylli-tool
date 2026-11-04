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

## Check (we cannot do it for the user)
Raptor Lake desktop below microcode 0x12F ([Intel](https://community.intel.com/t5/Mobile-and-Desktop-Processors/Intel-Core-13th-and-14th-Gen-Vmin-Shift-Instabilty-Update-New/m-p/1686948)), Secure Boot off with anti-cheat present, BIOS older than three years.

## Out on purpose
HPET changes (no credible measurements, see `TWEAK_EVIDENCE.md`), spread spectrum, and anything involving voltages, timings, clocks or limits: that is overclocking and stays in Workstation mode. `policy.classify` drops every Critical or Read-only setting from every preset, and `test/bios-advisor.test.js` pins that.

## Not yet verified
Setting-name aliases and option labels on real boards other than the HP ProBook 440 G8, and the brand menu hints (`WHERE` in the advisor), which are worded "usually".
