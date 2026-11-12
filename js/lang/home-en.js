// Home "Helm" strings (group `home2`). Loaded after en.js. Product and hardware names are not translated.
// m_<id>Title / m_<id>Why: Next Best Move copy for the moves js/../lib/home/moves.js can raise.
LANG.en.home2 = {
  "myPc": "My PC", "uptime": "Uptime", "lastOpt": "Last optimized", "never": "Never", "yes": "Yes", "no": "No", "up": "up", "down": "down", "close": "Close", "undo": "Undo", "checking": "Checking…",
  "notMeasured": "not measured", "verifying": "Verifying remembered values…", "eyebrowLive": "Live reading", "dialAria": "Jylli Index: three bands for health, tuning and protection",
  "agoNow": "just now", "agoMin": "{n} min ago", "agoHour": "{n} h ago", "agoDay": "{n} d ago",

  "p_health": "Health", "p_tuned": "Tuned", "p_protected": "Protected",
  "pd_health": "From your latest Vitals checkup: crashes, disks, memory, drivers, Windows and security.",
  "pd_tuned": "How many of the tweaks that suit this PC are in place and still holding.",
  "pd_protected": "Whether you can get back: a fresh restore point, and admin rights to make changes safely.",
  "pdNone": "Not measured yet", "pdWaitProfile": "Reading your hardware…", "pdVitals": "Checkup {ago}", "pdQuick": "Quick check", "pdTuned": "{a} in place, {o} open",
  "rp_fresh": "Restore point is fresh", "rp_stale": "Restore point is old", "rp_never": "No restore point", "rp_unknown": "Restore point unknown", "noAdmin": "not admin",
  "weight": "{n}% of the Index", "whyOpen": "Why this number?", "whyTitle": "Why this number", "whyLead": "Every input is listed. Anything that could not be measured is left out, never counted as zero.",
  "whyTrend": "Compared with {d} days ago, the Index went {dir} by {n}.",
  "wyVitals": "Vitals checkup", "wyQuick": "Quick check", "wyFindings": "Open findings", "wyApplied": "Tweaks in place", "wyOpen": "Recommended, not applied", "wyDrifted": "Changed back by Windows", "wyNotChecked": "not checked", "wyProfile": "Hardware profile",
  "wyRestore": "Restore point", "wyAdmin": "Administrator rights",

  "verdictLoading": "Reading your PC…", "verdictFail": "Home could not read this PC", "verdictNone": "Not enough measured yet",
  "verdictStrong": "This PC is in great shape", "verdictFair": "This PC is doing fine, with room to improve",
  "verdictWeak_health": "Health needs attention", "verdictWeak_tuned": "This PC is not tuned yet", "verdictWeak_protected": "You are not protected yet",
  "leadNone": "Run a checkup and Jylli can put a number on this PC. Nothing is guessed in the meantime.", "leadQuick": "Based on the quick check. A full Vitals checkup makes this number far more exact.",
  "leadStale": "Your last checkup is old. Check again to see how the PC is doing today.", "leadPartial": "Based on {n} of 3 pillars. The others are left out until they can be measured.", "leadFull": "Based on all three pillars, measured on this PC.",
  "trendUp": "+{n} in {d} days", "trendDown": "−{n} in {d} days", "trendFlat": "Steady for {d} days", "driftChip": "{n} changed back",

  "moveFirst": "Do this first", "moveNext": "Next best move", "notNow": "Not now", "upNext": "Up next", "reversible": "Recorded, so you can undo it",
  "chipRam": "{size} of RAM in use by these", "chipScanned": "Scanned {ago}",
  "btn_restore": "Create restore point", "btn_autoOpti": "Run Auto-Optimize", "btn_tab": "Open", "btn_batch": "Apply", "btn_drift": "Apply again", "btn_admin": "Restart as admin", "btn_ai": "Apply",
  "btn_checkup": "Run a checkup", "btn_checkupAgain": "Check again", "btn_checkDrift": "Check settings now", "confirmApply": "Apply {n} setting(s) now? Each one can be undone from the Rewind strip.",
  "moveDoneEyebrow": "Done", "moveDoneTitle": "Finished. Home is re-reading your PC.",
  "clearEyebrow": "All clear", "clearTitle": "Nothing needs you right now", "clearWhy": "Jylli found no move worth your time. It keeps watching and will say so when that changes.", "clearLast": "Last optimized {ago}.",
  "aiWhy": "Suggested for this PC ({pct}% match)",

  "m_protectTitle": "Create a restore point first", "m_protectWhy": "This PC has none. A restore point lets you roll Windows settings back if a change causes trouble.",
  "m_protectStaleTitle": "Refresh your restore point", "m_protectStaleWhy": "Your newest restore point is more than a week old. A fresh one takes about a minute.",
  "m_vitalsTitle": "Fix {n} serious finding(s) from your checkup", "m_vitalsWhy": "Your last Vitals checkup found serious problems. Open the checkup to see what they are and how to fix them.",
  "m_checkupTitle": "Run your first Vitals checkup", "m_checkupWhy": "One checkup looks at crashes, disks, memory, drivers, Windows and security, and makes the Health pillar real.",
  "m_driftTitle": "{n} tweak(s) were changed back", "m_driftWhy": "Some settings you applied no longer hold. Windows or an app may have changed them. Apply them again to get them back.",
  "m_autoOptiFirstTitle": "Run Auto-Optimize for the first time", "m_autoOptiFirstWhy": "It scans this PC, picks only what suits it, applies it with a restore point, and measures the result.",
  "m_autoOptiAgainTitle": "Run Auto-Optimize again", "m_autoOptiAgainWhy": "It has been {days} days. Windows updates and new apps can change settings back without telling you.",
  "m_reclaimTitle": "Free {size} of safe-to-clear files", "m_reclaimWhy": "Your last Cleanup scan found caches and temp files that rebuild themselves. Nothing personal is touched.",
  "m_leanTitle": "{n} items are safe to switch off", "m_leanWhy": "Lean found apps and background items it considers safe to switch off on this PC. You review and choose each one.",
  "m_adminTitle": "Restart Jylli Tool as administrator", "m_adminWhy": "Many readings and tweaks need administrator rights, and the Protected pillar stays lower without them.",
  "m_gameLiveTitle": "Watch this game session", "m_gameLiveWhy": "A game is running. Pulse records frame pacing and tells you what held it back.",

  "proofTitle": "Proof Ledger", "proofLead": "Only what was measured or recorded.",
  "tileBootFaster": "Faster boot", "tileBootSlower": "Slower boot", "tileBootSub": "{a} s before, {b} s after", "tileReclaimed": "Space reclaimed", "tileReclaimedSub": "over {n} cleanup run(s)",
  "tileRemoved": "Items removed", "tileRemovedSub": "{s} startup, {k} tasks, {a} apps and features", "tileTweaks": "Tweaks in place", "tileTweaksSub": "{n} applied, none changed back", "tileTweaksDrift": "{n} changed back", "tileTweaksUnchecked": "{n} applied, not re-checked yet",
  "weekLine": "This week: {b} run(s), {c} change(s)", "weekUndone": "{n} undone", "weekFailed": "{n} failed", "undoLast": "Undo last Auto-Optimize run",
  "proofEmptyT": "Nothing to prove yet", "proofEmptyB": "After Auto-Optimize or a cleanup, this shows the real before and after: boot time, space reclaimed, items removed. It never shows a number that was not measured.",

  
  "rwHint": "Move across the strip to see a moment in time. Arrow keys work too.", "rwEmpty": "Nothing recorded yet. History builds as Jylli runs.", "rwNoData": "No reading recorded", "rwNoChange": "No change made around this time.",
  "rwChange": "{n} change(s)", "rwUndone": "undone",
  "via_manual": "By you", "via_stage": "Stage", "via_auto-opti": "Auto-Optimize", "via_spw": "Profile wizard", "via_ai": "Suggested", "via_game-watcher": "Game profile", "via_scheduler": "Scheduled", "via_safety-revert": "Safety revert", "via_undo": "Undo",
  "undoTitle": "Undo these changes?", "undoBody": "{n} change(s) will be put back exactly as they were before.", "undoLastBody": "Everything the last Auto-Optimize run changed will be put back.", "undoConflict": "Something else changed these settings since, so they were left alone.", "undoFailed": "Could not undo. Nothing was changed.",

  
  "failEyebrow": "Could not read", "failLead": "Something stopped Home from reading this PC. Nothing was changed. Try again; if it keeps failing, restart Jylli Tool.", "retry": "Try again", 

  "gradesTitle": "Vitals by area", "gradesFrom": "From your checkup {ago}.", 
  
  "sub_stability": "Stability", "sub_storage": "Storage", "sub_memory": "Memory", "sub_cpu": "CPU", "sub_gpu": "GPU", "sub_drivers": "Drivers", "sub_windows": "Windows", "sub_security": "Security", "sub_network": "Network", "sub_config": "Config",

  "lastSession": "Last session", "lastSessionLine": "{m} min · {fps} FPS avg · {low} FPS 1% low",
  "dockLead": "Press Ctrl K anywhere to search every page and tweak.", "dockDns": "Flush DNS", "dockTemp": "Clear temp files", "dockRam": "Clean RAM", "dockGames": "Game optimizer", "dockFivem": "FiveM", "dockSpecs": "Refresh specs", "dockAdmin": "Restart as admin"
}

// Timeline, narrator and the process list (lib/home/processes.js: pn_ = name, pr_ = what it is usually doing)
Object.assign(LANG.en.home2, { "trTitle": "Timeline", "trLead": "Live from your sensors, plus the last 7 days of CPU and memory.", "trAria": "Live timeline. Use the arrow keys to move along it, Escape to let go.", "trTab_cpu": "CPU", "trTab_gpu": "GPU", "trTab_ram": "RAM", "trTab_disk": "Disk", "trTab_net": "Network", "trWin_1m": "1 min", "trWin_10m": "10 min", "trWin_7d": "7 days", "trWinOnly7d": "Only CPU and memory are recorded for 7 days", "trNow": "now", "trAgo": "{n} s ago", "trAgoMin": "{n} min ago", "trAgoHour": "{n} h ago", "trAgoDay": "{n} d ago", "trNA": "Not available", "trLoad": "Load", "trTemp": "Temperature", "trPower": "Power", "trVram": "VRAM", "trClock": "Clock", "trUsed": "Used", "trTotal": "Total", "trRead": "Read", "trWrite": "Write", "trRx": "Down", "trTx": "Up", "trActive": "Active time", "trDriveTemp": "Drive temp", "trNormal": "Your usual range", "trNormalTip": "The typical range for this hour of the day, from your last days on this PC", "trLimit": "Throttle limit", "trLegendChange": "Change", "pinGameStart": "Game started: {name}", "pinGameEnd": "Game ended: {name}", "pinRestore": "Restore point created", "pinSpike": "Spike to {v} %", "pinSpikeBy": "{who} ({amount})", "pinSpikeSpread": "No single program stands out", "pinSpikeGame": "A game was running", "pinSpikeUnrecorded": "the cause was not recorded (Home was closed)", "pinSpikePending": "Looking for the cause…", "pinSpikeNone": "Cause could not be read", "amountCpu": "{n} % of the CPU", "amountRam": "{n} of memory", "amountDisk": "{n} of disk transfer", "nar_na": "Not available here: {why}.", "nar_why_needs_driver": "the sensor driver is not running", "nar_why_no_sensor": "this PC has no sensor for it, or it needs administrator rights", "nar_why_not_supported": "this hardware does not report it", "nar_why_stale": "the sensor stopped answering", "nar_spikeBy": "Jumped to {v} % {ago} s ago. Biggest user: {who} ({amount}). {what}", "nar_spikeSpread": "Jumped to {v} % {ago} s ago. No single program stands out: the load is spread across many.", "nar_spikeGame": "Jumped to {v} % {ago} s ago. A game is running, so Home did not look for the cause: that would add load of its own.", "nar_spikeUnknown": "Jumped to {v} % {ago} s ago. The cause could not be read.", "nar_spikePending": "Jumped to {v} % {ago} s ago. Looking for the cause…", "nar_hot": "Running at {t} °C. The throttle limit is {limit} °C.", "nar_high": "{x}× your usual level for this time of day.", "nar_low": "Quieter than your usual level for this time of day.", "nar_normal": "At your usual level for this time of day.", "nar_calm": "Nothing unusual.", "nar_week": "The last 7 days. Move across it to see what changed, and undo it.", "notesChip": "{n} notes for this PC", "notesTitle": "Notes for this PC", "whatsNewChip": "v{v} · What's new", "whatsNewTitle": "What's new in v{v}", "dismiss": "Dismiss", "pn_defender": "Windows Defender", "pr_defender": "Usually scanning files in the background.", "pn_indexer": "Windows Search indexer", "pr_indexer": "Usually indexing your files so search is fast.", "pn_winupdate": "Windows Update", "pr_winupdate": "Usually downloading or installing updates.", "pn_telemetry": "Windows compatibility check", "pr_telemetry": "Usually a scheduled Windows compatibility scan.", "pn_svchost": "A Windows service host", "pr_svchost": "Usually one of many built-in Windows services.", "pn_wmi": "Windows management service", "pr_wmi": "Usually answering system queries from other programs.", "pn_dwm": "Desktop Window Manager", "pr_dwm": "Draws the desktop, so it follows whatever is moving on screen.", "pn_explorer": "File Explorer", "pr_explorer": "Usually opening or refreshing a folder.", "pn_onedrive": "OneDrive", "pr_onedrive": "Usually syncing files.", "pn_teams": "Microsoft Teams", "pr_teams": "Usually a call or a meeting.", "pn_discord": "Discord", "pr_discord": "Usually voice chat or its overlay.", "pn_steam": "Steam", "pr_steam": "Usually downloading or updating a game.", "pn_epic": "Epic Games Launcher", "pr_epic": "Usually downloading or updating a game.", "pn_chrome": "Google Chrome", "pr_chrome": "Usually the pages and tabs you have open.", "pn_edge": "Microsoft Edge", "pr_edge": "Usually the pages and tabs you have open.", "pn_firefox": "Firefox", "pr_firefox": "Usually the pages and tabs you have open.", "pn_brave": "Brave", "pr_brave": "Usually the pages and tabs you have open.", "pn_opera": "Opera", "pr_opera": "Usually the pages and tabs you have open.", "pn_code": "Visual Studio Code", "pr_code": "Usually indexing a project or running an extension.", "pn_nvidia": "NVIDIA background services", "pr_nvidia": "Usually driver and overlay services.", "pn_powershell": "PowerShell", "pr_powershell": "This can include Jylli Tool's own readings.", "pn_jylli": "Jylli Tool", "pr_jylli": "That is this app.", "pn_electron": "An Electron app", "pr_electron": "This includes Jylli Tool and apps such as Discord or VS Code." })
