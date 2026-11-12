# CPU & Memory evidence

`lib/cpumem/catalog.js` is the only list of what the CPU & Memory tab shows or changes. Why a tweak is offered at all lives in [[TWEAK_EVIDENCE]]. This page says where every number on the tab comes from and which thresholds the tab may speak with. **Unverified = not shipped.**

## What the tab owns
Every CPU and memory switch moved here from the Windows, Power and GPU tabs (one owner per switch, `test/cpumem-engine.test.js` checks it). What was free stays free; what was Premium stays Premium, locked inline, not as a locked tab.

| Lane | Switches | Free |
|---|---|---|
| Processor | `power-throttling`, `global-timer-resolution`, `x3d-balanced`, `power-balanced-restore` | yes |
| Core power | `cpu-parking`, `cstates` | Premium |
| Memory | `sysmain`, `memory-compression`, `pagefile-auto` | yes |
| Security trade-offs | `spectre-meltdown` free; `hvci-offload`, `vbs-disable`, `hypervisor-off`, `full-mitigation-wipe` Premium | mixed |
| Retired | `memory-guard-tune`, `pool-usage-max`, `process-count-reduction`, `speed-shift` (restore only) | n/a |

No new global tweak was added: every candidate (Win32PrioritySeparation, HPET, MMCSS, large system cache, paging executive) is already retired as a placebo in [[TWEAK_EVIDENCE]], and nothing else has a credible measurement. The new performance features are per-program, not global: core plans and CPU priority (below).

## Status of a switch
Same table as [[WINDOWS_EVIDENCE]] (`statusOf` in `lib/windows/model.js`, shared). New probe kinds here:
| Probe | Read with | Match |
|---|---|---|
| `p` | `powercfg /qh SCHEME_CURRENT <subgroup> <alias>`, AC index (`/qh` also lists hidden settings such as core parking) | equals the value the tweak writes |
| `x:scheme` | `powercfg /getactivescheme` | equals (Balanced for `x3d-balanced`) or not equal (`power-balanced-restore`: not Power saver) |
| `x:hvlaunch` | `bcdedit /enum {current}`, `hypervisorlaunchtype` (absent = `auto`) | `off` |
| `x:pagefile` | `Win32_ComputerSystem.AutomaticManagedPagefile` | `True` |
| `x:procmit` | `Get-ProcessMitigation -System` CFG | `OFF` (only part of `full-mitigation-wipe`) |
A value that cannot be read (for example `Get-MMAgent` without administrator rights) is `unread`: the state is **unknown**, never "off".

## Where a live number comes from (lib/cpumem/live.js)
One PowerShell child, started only while the tab is open and visible, stopped by a 45 s heartbeat timeout, by leaving the tab, by a game starting and on quit. It reads performance counters once a second and writes nothing. Measured cost on the development laptop: about 10 ms of CPU per second.
| Number | Counter | Note |
|---|---|---|
| Core load | `Processor Information(g,i)\% Processor Utility` | task-manager style, clamped to 100 |
| Effective clock | `% Processor Performance` x the CPU base clock (`Win32_Processor.MaxClockSpeed`) | the usual way to read a turbo clock |
| Parked | `Parking Status` = 1 | Windows core parking |
| In use / modified / standby / free | `Memory\Available MBytes`, `Modified Page List Bytes`, `Standby Cache {Core,Normal Priority,Reserve} Bytes`, `Free & Zero Page List Bytes` | in use = installed - available; modified is part of in use; available = standby + free |
| Commit | `Committed Bytes` against `Commit Limit` | |
| Disk reads | `Memory\Page Reads/sec` | pages that had to come from disk |
| Compressed | working set of the `Memory Compression` process, every 5 s | shown as the hatched part of "in use" |
| Temperature, power | the telemetry hub (`cpu.temp.package`, `cpu.power`) | shown only when a sensor reports them |

## Topology (lib/cpumem/topology.js)
`GetLogicalProcessorInformationEx` (relationship all): one `C` line per physical core (efficiency class, group, affinity mask: the set bits are the SMT threads) and one `L` line per L3 cache. Hybrid CPUs split by efficiency class (highest = performance cores). Several L3 caches mean several CCDs; one is the V-Cache die only when it is at least 1.5x the size of the other. A single die is labelled V-Cache only when the CPU name says X3D.

## Findings: the only things the tab may say (lib/cpumem/findings.js)
A finding exists only when its evidence is in the input. Live findings need `LIVE_MIN_FRAMES` = 10 one-second frames.
| Finding | Evidence | Threshold |
|---|---|---|
| `ram-below-rated` | a module's configured speed against its rated speed (`Win32_PhysicalMemory`), or the capability scan's XMP state | running < 95 % of rated |
| `ram-single-channel` | one module in a board with 2 or more slots, not LPDDR | warn on desktop, info on laptop |
| `ram-mixed` | modules with different sizes or rated speeds | any difference |
| `cpu-microcode` | microcode revision of a 13th/14th gen desktop part (`caps.cpu`) | < 0x12F (bad below 0x12B). Same floor as Auto-Optimize |
| `x3d-driver` | dual-CCD X3D CPU, AMD 3D V-Cache driver service not present | service missing |
| `x3d-steering-broken` | dual-CCD X3D CPU with core parking disabled by Jylli, or a plan that is not Balanced | switch status / plan GUID |
| `hybrid-win10` | hybrid Intel CPU on Windows 10 | build < 22000 |
| `hvci-costly` | Memory Integrity running on a CPU older than Kaby Lake / Zen 2 and Jylli has not turned it off | `caps.cpu.hvciCostly`. See [[TWEAK_EVIDENCE]] |
| `power-saver` | active plan is Power saver | GUID |
| `ram-pressure` | average memory in use | >= 90 % |
| `commit-pressure` | average commit against limit | >= 90 % |
| `hard-faults` | average page reads per second while memory is high | >= 200 /s and >= 85 % in use |
| `thermal` | package temperature (only with a sensor) | >= 95 °C |
| `clock-held` | average load and effective clock | load >= 60 % and clock <= 50 % of base |
| `bg-hog` | a non-game program in the on-demand programs list | >= 25 % CPU |
Wording never promises a gain (`test/cpumem-ui.test.js` checks the English text).

## Lab (Premium)
| Tool | What it does | Why it is safe |
|---|---|---|
| Core plan | sets the allowed logical processors of the running processes of one named program: `pcores` (hybrid CPUs: the performance cores), `vcache` (dual-CCD with one V-Cache die), `skip0` (leave core 0, which services most interrupts, free) | offered only where it applies; never fewer than 4 or more than 64 logical processors; the plan ends with the process; "pin automatically" re-applies it twice after the game starts (games spawn processes over several seconds); the program name is validated and system programs are refused |
| CPU priority | `CpuPriorityClass` under `Image File Execution Options\<exe>\PerfOptions`: AboveNormal (6) or High (3) | Realtime is never offered; written through the change journal, so History can undo it; the value shown is read back from Windows |
| CPU or GPU bound | the existing PresentMon latency budget | needs the PresentMon tool and a running game |
| Quick RAM check | the existing `bios-ram-stress` (256 MB, address-XOR patterns) | worded as a quick check, not a memory test |
| Memory timings | the bundled CPU-Z | read only |

Evidence for the core plans: AMD routes games to the V-Cache CCD itself when its chipset driver is installed (so the plan is offered, and `x3d-driver` says when the driver is missing); on hybrid Intel parts the thread director does the same on Windows 11 (so `hybrid-win10` says when it cannot). A plan is a manual override for a game that misbehaves, not a general speed-up.

## Free cached memory
`NtSetSystemInformation(MemoryPurgeStandbyList)` with the profile privilege, the same call as the old Clean RAM button. The tab reads the standby size before and after and prints the difference; without administrator rights Windows refuses and the tab says so. Working sets are never trimmed. It is offered as a one-off action; the cache refills as you work.

## Removed
- The 3D hero and the static metric cells (nothing updated them).
- `cpu-pin-game` / `cpu-unpin-game` / `cpu-get-pin-status` / `cpu-get-topology`: the old pin skipped only logical CPU 0 without knowing the topology, detected hybrid CPUs with a name regex, and forgot its state on restart.
- Three of the four old memory cards were already retired; the fourth (`full-mitigation-wipe`) moved to the trade-offs lane.

Back to [[Home]]
