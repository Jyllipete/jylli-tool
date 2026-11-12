'use strict'
// CPU & Memory tab (js/cpumem/*). Group `cpumem2`; anything missing here falls back to the shared `net2` strings (receipt, sheets, row details). Switch names and
// descriptions stay in tweakNames / tweakDescs.
LANG.en.cpumem2 = {
  seg_overview: 'Overview', seg_tune: 'Tune', seg_lab: 'Lab', seg_history: 'History',
  chips: 'Filter switches', search: 'Find a switch',
  // stage
  eyeScan: 'Reading your CPU and memory', vScan: 'Reading this PC', leadScan: 'One read-only scan of your processor, memory and power settings. Nothing is changed.',
  eyeRun: 'Applying', vRun: 'Applying changes', leadRun: '{name} · step {step} of {total}', leadRunRp: 'Creating a restore point first…', working: 'Working…',
  eyeLive: 'Live · updates every second', eyePaused: 'Live view paused', eyeStatic: 'Static reading', eyeNever: 'Not read yet',
  vUnread: 'Could not read this PC', vUnreadS: 'The scan did not finish. Retry, or restart Jylli if it keeps failing.',
  vDrift: 'Windows put {n} setting(s) back', vDriftS: 'Windows reverted switches Jylli set earlier, usually after an update. Put them back in one step.',
  vOpen: '{n} safe change(s) available', vOpenS: 'Recommended for this PC from what the scan found. Nothing is applied until you confirm.',
  vPaused: 'Paused while you play', vPausedS: 'Live numbers stop while a game runs, so this tab never takes CPU from it.',
  vClean: 'Your CPU and memory setup looks right', vCleanS: 'Nothing needs attention. Live numbers come straight from the Windows performance counters.',
  factCores: '{c} cores · {t} threads', cpuUnknown: 'Processor', rescan: 'Rescan',
  plan_balanced: 'Balanced plan', plan_saver: 'Power saver plan', plan_high: 'High performance plan', plan_ultimate: 'Ultimate performance plan', plan_other: 'Custom power plan',
  pkgLoad: 'Load', pkgClock: 'Clock', pkgParked: 'Parked', pkgTemp: 'Temp', pkgPower: 'Power',
  ctaApply: 'Apply {n} recommended', ctaPutBack: 'Put {n} back', undoLast: 'Undo last change',
  // banners
  bnUnreadT: 'Could not read Windows just now', bnUnreadS: 'Switches show what Jylli remembers until a scan succeeds.',
  bnStaleT: 'Showing the reading from {when}', bnStaleS: 'A fresh scan could not finish. Retry to read this PC again.',
  bnDriftT: 'Windows put {n} setting(s) back', bnDriftS: 'These were applied earlier and read as default again.',
  bnRestartT: '{n} change(s) wait for a restart', bnRestartS: 'They take effect after Windows restarts.', restartNow: 'Restart now',
  // die map
  grp_p: 'Performance cores', grp_e: 'Efficiency cores', grp_lpe: 'Low-power cores', grp_ccd: 'CCD {n}', grp_all: 'Cores', l3: '{mb} MB L3', vcache: 'V-Cache', parked: 'parked',
  coreLabel: 'Core {n}: {load}% load, {ghz} GHz', dieNone: 'The core layout could not be read on this PC.',
  // memory
  memTitle: 'Memory', memWaiting: 'Waiting for the first reading', memSub: '{used} of {total} in use', memActive: 'In use', memModified: 'Modified', memStandby: 'Cached', memFree: 'Free',
  memCommit: 'Commit charge', memCompressed: 'Compressed', memFaults: 'Disk reads', memPools: 'Kernel pools', modChannel: 'Channel {c}', modEmpty: 'Empty slot',
  freeStandby: 'Free cached memory', freeStandbyHint: 'Drops the cache Windows keeps for fast re-opening. Windows refills it as you work, so this is for a one-off need, not a speed-up.',
  freeing: 'Freeing…', freeFailed: 'Could not run it.', freeDenied: 'Windows refused: this needs administrator rights.', freeNothing: 'Nothing to free: only {had} was cached.', freeDone: 'Freed {freed} of cached memory ({before} to {after}).',
  // findings
  findTitle: 'What Jylli noticed', findSub: 'From the scan of this PC', findSubLive: 'From the scan and the live numbers', findNoneT: 'Nothing to flag', findNoneS: 'No memory, core or clock problem shows up in the numbers.',
  actBios: 'Open BIOS tab', actConsumers: 'What is using it', actApply: 'Fix it', actReveal: 'Show the switch', actOpen: 'Open download page',
  fT_ram_below_rated: 'Memory runs below its rated speed', fS_ram_below_rated: 'Turning on XMP or EXPO in the BIOS usually lifts it to the speed you paid for, and is the biggest memory gain on most PCs.',
  fT_ram_single_channel: 'Only one memory module', fS_ram_single_channel: 'Memory runs on a single channel. A second matching module doubles the bandwidth, which helps games and integrated graphics most.',
  fT_ram_mixed: 'Memory modules differ', fS_ram_mixed: '{n} modules with different sizes or speeds run together, at the speed of the slowest and sometimes without dual channel.',
  fT_cpu_microcode: 'CPU microcode is out of date', fS_cpu_microcode: 'The {cpu} runs microcode {rev}. Revision {need} or newer fixes the Vmin Shift instability of 13th and 14th gen Intel desktop CPUs. Update the BIOS.',
  fT_x3d_driver: 'The AMD V-Cache driver is missing', fS_x3d_driver: 'Your {cpu} has two core groups and only one has the extra cache. Without the AMD chipset driver Windows cannot send games to the cache cores.',
  fT_x3d_steering_broken: 'Core settings fight the V-Cache scheduler', fS_x3d_steering_broken: 'On your {cpu} the Balanced plan with default core parking is what lets games land on the cache cores. A max-performance plan or switched-off parking breaks that.',
  fT_hybrid_win10: 'Windows 10 schedules hybrid cores poorly', fS_hybrid_win10: 'Your {cpu} has performance and efficiency cores. The hardware thread director only works fully on Windows 11.',
  fT_hvci_costly: 'Memory Integrity costs this CPU more than most', fS_hvci_costly: 'Your {cpu} is old enough that Memory Integrity (HVCI) takes a slow path. Turning it off can lift CPU-bound games, but lowers a Windows protection.',
  fT_power_saver: 'Windows is on the Power saver plan', fS_power_saver: 'Power saver caps how fast the CPU may run. Balanced is the normal plan.',
  fT_ram_pressure: 'Memory is almost full', fS_ram_pressure: '{pct}% of your memory has been in use for the last seconds. Windows starts using the disk instead, which feels like stutter. See what is using it, or close those programs.',
  fT_commit_pressure: 'Commit charge is close to its limit', fS_commit_pressure: 'Programs have claimed {pct}% of all memory plus page file. Near 100% they fail to allocate and may crash. Closing programs or a larger page file helps.',
  fT_hard_faults: 'Windows is reading memory back from disk', fS_hard_faults: '{reads} page reads a second while {pct}% of memory is in use: programs wait for the disk instead of RAM.',
  fT_thermal: 'The CPU is very hot', fS_thermal: 'Package temperature is {c} °C. At this level the CPU lowers its own clock to protect itself.',
  fT_clock_held: 'The CPU runs far below its base speed under load', fS_clock_held: 'Load is {load}% but the clock averages {mhz} MHz, under half of the {base} MHz base. A power plan, a power limit or heat is holding it back.',
  fT_bg_hog: '{name} is using a lot of CPU', fS_bg_hog: '{name} is using about {cpu}% of the CPU in the background.',
  // consumers
  consTitle: 'What is using it', consSub: 'Programs by CPU and by memory', consShow: 'Show', consRefresh: 'Refresh', consHint: 'Reads the running programs once when you ask, so it never adds load on its own.',
  consGame: 'Not read while a game is running.', consCpu: 'CPU', consRam: 'Memory', consNone: 'Nothing notable', consFailT: 'Could not read programs', consFailS: 'Try again in a moment.',
  // tune
  lane_processor: 'Processor', lane_corepower: 'Core power', lane_memory: 'Memory', lane_tradeoffs: 'Security trade-offs', lane_retired: 'No longer offered',
  laneSub_processor: 'Power throttling, timer and plan', laneSub_corepower: 'Core parking and idle states', laneSub_memory: 'SysMain, compression and the page file', laneSub_tradeoffs: 'Speed in exchange for protection', laneSub_retired: 'Only to restore an earlier change',
  tagPremium: 'Premium', st_locked: 'Premium', unlock: 'Unlock', unreadN: '{n} switch(es) could not be read on this PC. They show what Jylli remembers.', clearFilters: 'Clear filters',
  histPriority: 'CPU priority · {exe}', histApply: 'Applied', histRestore: 'Restored',
  scanFailT: 'Scan failed', scanFailS: 'Could not read this PC. Try again.', runFailT: 'Change failed', premiumT: 'Premium feature', premiumS: 'This switch is part of Premium.',
  // lab
  labPitchT: 'Lab: tools for one game at a time', labPitchS: 'Core plans, CPU priority and measurements that act on a named program, never a blanket tweak.',
  labPitch1: 'Pin a game to the right cores, previewed on your own die map', labPitch2: 'Give one program a higher CPU priority that survives restarts', labPitch3: 'Find out whether a game is CPU-bound or GPU-bound', unlockLab: 'Unlock Lab',
  planTitle: 'Core plan for a game', planSub: 'Choose which cores one program may use. The cores a plan keeps light up on the die map above.', exeLabel: 'Program', findGames: 'Find running games', noGamesRunning: 'No known game is running right now.',
  plan_pcores: 'Performance cores only', planS_pcores: 'Keeps {n} of {t} threads: the performance cores. The efficiency cores stay free for background work.',
  plan_vcache: 'V-Cache die only', planS_vcache: 'Keeps {n} of {t} threads on the die with the extra cache. Use it when the AMD chipset driver is not doing this for you.',
  plan_skip0: 'Leave the first core free', planS_skip0: 'Keeps {n} of {t} threads and leaves core 0, which handles most hardware interrupts, to Windows and your drivers.',
  planNone: 'No core plan fits this CPU. Plans exist for hybrid Intel CPUs, dual-die X3D CPUs, and CPUs with 8 or more threads.', planRemember: 'Pin it automatically every time this game starts',
  pinNow: 'Pin now', release: 'Give all cores back', forget: 'Remove', rulesTitle: 'Automatic plans', pinnedNow: 'pinned now',
  pinned: 'Pinned {n} process(es) to {c} of {t} threads.', pinnedLater: 'Saved. The program is not running, so the plan applies when it starts.', released: 'All cores are available to the program again.',
  pinErr_x: 'Could not change the program.', pinErr_premium_required: 'This is a Premium tool.', 'pinErr_bad-exe': 'Enter a program name like game.exe. Windows system programs are not allowed.',
  'pinErr_plan-not-available': 'That plan does not fit this CPU.', 'pinErr_script-failed': 'Windows did not answer. Try again.', 'pinErr_no-topology': 'The core layout is not known yet. Rescan first.',
  planFine: 'A plan applies to the running program now and ends with it, unless you tick the automatic option. It is not a general speed-up: use it when a game stutters while other programs compete.',
  prioTitle: 'CPU priority for a program', prioSub: 'Tells Windows to schedule one program before others.', prio_above: 'Above normal', prio_high: 'High', prio_other: 'Custom',
  prioS_above: 'Gentle: the program wins ties with normal programs.', prioS_high: 'Stronger: scheduled before most programs. Realtime is never offered because it can freeze Windows.',
  prioSet: 'Set priority for {exe}', prioDone: 'Saved. It applies the next time the program starts.', prioFine: 'Stored in Windows (Image File Execution Options) and listed in History, where it can be undone.', prioUnread: 'The current values could not be read from Windows.',
  bnTitle: 'CPU or GPU bound?', bnSub: 'Watches a running game and says which side limits its frame rate.', bnHint: 'Start the check, then play for a minute. It needs the PresentMon tool and a running game.',
  bnRunning: 'Measuring. Keep playing; the verdict settles after a few seconds.', bnCpu: 'Limited by the CPU', bnGpu: 'Limited by the GPU', bnCapturing: 'Collecting frames…', bnFrame: 'average {ms} ms', bnP99: '99th percentile {ms} ms', bnDisp: 'Display',
  bnNoTool: 'The PresentMon tool is missing, so frames cannot be measured.', start: 'Start', stop: 'Stop',
  checksTitle: 'Memory checks', checksSub: 'One-off measurements. Neither changes anything.', ramTitle: 'Quick RAM check', ramSub: 'Writes and reads patterns in 256 MB of memory for 30 seconds. It catches obvious faults, not every one.', ramRun: 'Run', ramRunning: 'Testing…',
  ramFail: 'The check could not run.', ramPass: 'No errors in 256 MB ({n} passes).', ramErrors: '{n} error(s) found. Test with a full memory tester and check XMP / EXPO settings.',
  timingsTitle: 'Memory timings', timingsSub: 'Reads CL, tRCD, tRP, tRAS and command rate with the bundled CPU-Z.', timingsRead: 'Read', timingsRunning: 'Reading…', timingsMissing: 'The CPU-Z file is not in this install.', timingsFail: 'Could not read the timings.',
}

// names and descriptions the switches of this tab were missing
Object.assign(LANG.en.tweakNames, {
  'x3d-balanced': 'Ryzen X3D Balanced Plan', 'power-balanced-restore': 'Leave the Power Saver Plan', 'pagefile-auto': 'Let Windows Manage the Page File',
})
Object.assign(LANG.en.tweakDescs, {
  'x3d-balanced': 'Switches to the Balanced power plan, which lets Windows and the AMD driver send games to the V-Cache cores of a dual-die X3D CPU. A max-performance plan breaks that.',
  'power-balanced-restore': 'Moves Windows off the Power saver plan back to Balanced. Power saver caps how fast the CPU may run.',
  'pagefile-auto': 'Gives the page file back to Windows, which sizes it to the memory pressure it sees. A fixed or missing page file can crash programs when memory runs out. Restart required.',
  'cpu-parking': 'Keeps every CPU core awake while plugged in (core parking minimum 100%), so no core has to wake up before it can take work. Costs a little idle power.',
  'cstates': 'Keeps the CPU at full clock and out of deeper idle states while plugged in. Removes frequency-change delays; costs power, heat and fan noise.',
  'hvci-offload': 'Turns off Memory Integrity (HVCI). Drivers are no longer checked in isolated memory, which removes the overhead; the gain is mainly on older CPUs without mode-based execution control.',
  'vbs-disable': 'Turns off Virtualization-Based Security as a whole, which goes further than Memory Integrity alone. The gain is measurable mainly on older CPUs (about 8% seen on a Ryzen 7 5800X3D under 24H2).',
  'full-mitigation-wipe': 'Turns off Control Flow Guard, SEHOP, forced ASLR relocation and the Spectre/Meltdown mitigations system-wide. Valorant needs Control Flow Guard.',
})
