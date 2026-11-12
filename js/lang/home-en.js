// Home "Helm" strings (group `home2`). Loaded after en.js. Product and hardware names are not translated.
// m_<id>Title / m_<id>Why: Next Best Move copy for the moves js/../lib/home/moves.js can raise.
LANG.en.home2 = {
  "whatsNew": "What's new", "myPc": "My PC", "uptime": "Uptime", "lastOpt": "Last optimized", "never": "Never", "yes": "Yes", "no": "No", "up": "up", "down": "down", "close": "Close", "undo": "Undo", "checking": "Checking…",
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

  "moveFirst": "Do this first", "moveNext": "Next best move", "notNow": "Not now", "upNext": "Up next", "minutes": "about {n} min", "reversible": "Can be undone",
  "impact_high": "High impact", "impact_medium": "Medium impact", "impact_low": "Small impact",
  "btn_restore": "Create restore point", "btn_autoOpti": "Run Auto-Optimize", "btn_tab": "Open", "btn_batch": "Apply", "btn_drift": "Apply again", "btn_admin": "Restart as admin", "btn_ai": "Apply",
  "btn_checkup": "Run a checkup", "btn_checkupAgain": "Check again", "btn_checkDrift": "Check settings now", "confirmApply": "Apply {n} setting(s) now? Each one can be undone from the Rewind strip.",
  "moveDoneEyebrow": "Done", "moveDoneTitle": "Finished. Home is re-reading your PC.",
  "clearEyebrow": "All clear", "clearTitle": "Nothing needs you right now", "clearWhy": "Jylli found no move worth your time. It keeps watching and will say so when that changes.", "clearLast": "Last optimized {ago}.",
  "aiWhy": "Suggested for this PC ({pct}% match)",

  "m_protectTitle": "Create a restore point first", "m_protectWhy": "This PC has none. A restore point is the one thing that lets you undo any change Windows will accept.",
  "m_protectStaleTitle": "Refresh your restore point", "m_protectStaleWhy": "Your newest restore point is more than a week old. A fresh one takes about a minute.",
  "m_vitalsTitle": "Fix {n} serious finding(s) from your checkup", "m_vitalsWhy": "Your last Vitals checkup found problems that can cause crashes or data loss. Open the checkup to see them and fix them.",
  "m_checkupTitle": "Run your first Vitals checkup", "m_checkupWhy": "One checkup looks at crashes, disks, memory, drivers, Windows and security, and makes the Health pillar real.",
  "m_driftTitle": "{n} tweak(s) were changed back", "m_driftWhy": "Windows or an app reset settings you had applied. Apply them again to get the benefit back.",
  "m_autoOptiFirstTitle": "Run Auto-Optimize for the first time", "m_autoOptiFirstWhy": "It scans this PC, picks only what suits it, applies it with a restore point, and measures the result.",
  "m_autoOptiAgainTitle": "Run Auto-Optimize again", "m_autoOptiAgainWhy": "It has been {days} days. Windows updates and new apps undo things quietly.",
  "m_reclaimTitle": "Free {size} of safe-to-clear files", "m_reclaimWhy": "Your last Cleanup scan found caches and temp files that rebuild themselves. Nothing personal is touched.",
  "m_leanTitle": "Remove {n} things you do not use", "m_leanWhy": "Lean found apps and background items that are safe to switch off on this PC. You choose each one.",
  "m_adminTitle": "Restart Jylli Tool as administrator", "m_adminWhy": "Without admin rights many readings and most tweaks are unavailable, and the Protected pillar stays low.",
  "m_gameLiveTitle": "Watch this game session", "m_gameLiveWhy": "A game is running. Pulse records frame pacing and tells you what held it back.",

  "proofTitle": "Proof Ledger", "proofLead": "What Jylli has actually done for this PC. Only things that were measured or recorded appear here.",
  "tileBootFaster": "Faster boot", "tileBootSlower": "Slower boot", "tileBootSub": "{a} s before, {b} s after", "tileReclaimed": "Space reclaimed", "tileReclaimedSub": "over {n} cleanup run(s)",
  "tileRemoved": "Items removed", "tileRemovedSub": "{s} startup, {k} tasks, {a} apps and features", "tileTweaks": "Tweaks in place", "tileTweaksSub": "{n} applied, none changed back", "tileTweaksDrift": "{n} changed back", "tileTweaksUnchecked": "{n} applied, not re-checked yet",
  "weekLine": "This week: {b} run(s), {c} change(s)", "weekUndone": "{n} undone", "weekFailed": "{n} failed", "undoLast": "Undo last Auto-Optimize run",
  "proofEmptyT": "Nothing to prove yet", "proofEmptyB": "After Auto-Optimize or a cleanup, this shows the real before and after: boot time, space reclaimed, items removed. It never shows a number that was not measured.",

  "rwTitle": "Rewind", "rwLead": "The last 7 days of CPU and memory with every change Jylli made marked on it. Move across the strip to see what changed, and undo it.", "rwMark": "Change", "rwAria": "Seven day history. Use the arrow keys to move through time.",
  "rwHint": "Move across the strip to see a moment in time. Arrow keys work too.", "rwEmpty": "Nothing recorded yet. History builds as Jylli runs.", "rwNoData": "No reading recorded", "rwNoChange": "No change made around this time.",
  "rwChange": "{n} change(s)", "rwUndone": "undone",
  "via_manual": "By you", "via_stage": "Stage", "via_auto-opti": "Auto-Optimize", "via_spw": "Profile wizard", "via_ai": "Suggested", "via_game-watcher": "Game profile", "via_scheduler": "Scheduled", "via_safety-revert": "Safety revert", "via_undo": "Undo",
  "undoTitle": "Undo these changes?", "undoBody": "{n} change(s) will be put back exactly as they were before.", "undoLastBody": "Everything the last Auto-Optimize run changed will be put back.", "undoConflict": "Something else changed these settings since, so they were left alone.", "undoFailed": "Could not undo. Nothing was changed.",

  "instTitle": "Live instruments", "instMore": "Show more", "instNow": "Now", "instAvg": "Average", "instPeak": "Peak", "instNote": "Since you opened Home. A sensor that is not available says so, never zero.",
  "instTemp": "Temp", "instProcs": "Processes", "failEyebrow": "Could not read", "failLead": "Something stopped Home from reading this PC. Nothing was changed. Try again; if it keeps failing, restart Jylli Tool.", "retry": "Try again", "instUsed": "Used", "instTotal": "Total",

  "gradesTitle": "Vitals by area", "gradesLead": "Ten areas, each scored from real checks.", "gradesFrom": "From your checkup {ago}.", "gradeOpen": "Open the checkup",
  "gradesEmptyT": "No checkup yet", "gradesEmptyB": "Run one to see how each area of this PC is doing.",
  "sub_stability": "Stability", "sub_storage": "Storage", "sub_memory": "Memory", "sub_cpu": "CPU", "sub_gpu": "GPU", "sub_drivers": "Drivers", "sub_windows": "Windows", "sub_security": "Security", "sub_network": "Network", "sub_config": "Config",

  "lastSession": "Last session", "lastSessionLine": "{m} min · {fps} FPS avg · {low} FPS 1% low",
  "dockTitle": "Quick actions", "dockLead": "Press Ctrl K anywhere to search every page and tweak.", "dockDns": "Flush DNS", "dockTemp": "Clear temp files", "dockRam": "Clean RAM", "dockGames": "Game optimizer", "dockFivem": "FiveM", "dockSpecs": "Refresh specs", "dockAdmin": "Restart as admin"
}
