// Pulse 2.0 "Flow" copy (group `pulse2`, read with tG('pulse2', key, vars); the Cockpit and the HUD read it through their own T()).
// Key families: lim_/limw_<limiter id> headline and why · sug_<target> · step_/stepState_ boost receipt · cause_<id> · pf_/pfw_<check>_<state>/pfFix_ pre-flight
// ck_* Cockpit only · hud_* HUD only. Names like CPU, GPU, VRAM, RAM, FPS, V-Sync, MMCSS, Game Shield stay as they are in every language.
globalThis.LANG = globalThis.LANG || { en: {}, fi: {} }
LANG.en.pulse2 = {
  // hero
  lead: 'Every frame, measured. Pulse tunes this PC for your game, shows what is holding it back and keeps the proof.',
  dial: 'Pulse score', statFps: 'Avg FPS', statLow: '1% low', statRules: 'Rules on',
  ctaChoose: 'Choose a game', ctaBoost: 'Boost {game}', ctaEnd: 'End boost', ctaWorking: 'Working…', openCockpit: 'Open cockpit',
  stReady: 'Ready', stBoosted: 'Boosted · {game}', stBoostedIdle: 'Boosted · waiting for a game', stPlaying: 'Playing · {game}', stWait: 'Waiting for a game',
  part_smooth: 'Smoothness', part_stable: 'Stability', part_thermal: 'Thermal headroom', part_boost: 'Boost steps',
  seg_live: 'Live', seg_sessions: 'Sessions', seg_rules: 'Rules', seg_preflight: 'Pre-flight',
  boostFail: 'Could not start the boost', endFail: 'Could not end the boost', marked: 'Moment marked',
  sessionSaved: 'Session saved', sessionSavedWhy: '{game} is recorded with its hitches and causes.', openDebrief: 'Open debrief',

  // river, fps, vitals
  mark: 'Mark moment', hud: 'HUD', riverAria: 'Frame time over the last minute. Each hitch is marked with its likely cause.', riverHint: 'The river fills as soon as a game draws frames.',
  tip: '{ago} s ago · {med} ms ({fps} FPS) · slowest {worst} ms', tipSession: '{at} · {fps} FPS · slowest {worst} ms',
  fps_avg: 'Avg FPS', fps_low1: '1% low', fps_low01: '0.1% low', fps_p99: '99th pct', fps_smooth: 'Smoothness', fps_hitches: 'Hitches', fps_length: 'Length',
  tip_avg: 'Average FPS over the last few seconds.', tip_low1: 'Average FPS of the slowest 1% of frames.', tip_low01: 'Average FPS of the slowest 0.1% of frames.',
  tip_p99: 'Frame time that 99% of frames beat, in milliseconds.', tip_smooth: 'How evenly frames arrive, 0 to 100. Steadier is higher.',
  notMeasured: 'Not measured', srcSensor: 'Sensors', srcNvidia: 'nvidia-smi', srcOs: 'Windows', srcPulse: 'Pulse',
  vt_cpu: 'CPU', vt_gpu: 'GPU', vt_gpuClock: 'GPU clock', vt_vram: 'VRAM', vt_ram: 'RAM', vt_net: 'Network',

  // limiter
  limiter: 'Limiter',
  lim_idle: 'Waiting for frames', limw_idle: 'Start a game and Pulse reads every frame it draws.',
  lim_thermal: 'Heat is holding you back', limw_thermal: 'CPU {cpuTemp}° · GPU {gpuTemp}°. The chip slows itself down to cool off.',
  lim_vram: 'Video memory is full', limw_vram: '{usedMB} of {totalMB} MB in use. Lower texture quality or resolution.',
  lim_ram: 'Memory is nearly full', limw_ram: 'RAM is at {ram}%. Windows starts swapping to disk, which shows up as hitches.',
  lim_background: 'A background app is competing', limw_background: 'It uses {bg}% of the CPU while you play.',
  lim_gpu: 'GPU-bound', limw_gpu: 'GPU at {gpu}%, CPU at {cpu}%. The graphics card is the limit, which is the healthy way to be limited.',
  lim_cpu: 'CPU-bound', limw_cpu: 'CPU at {cpu}%, GPU at {gpu}%. The processor cannot prepare frames fast enough.',
  lim_clock: 'GPU clock dropped', limw_clock: 'Running at {mhz} MHz, down from {baseMhz} MHz.',
  lim_capped: 'Held at a frame cap', limw_capped: 'Frames arrive evenly at {capHz} FPS, so a frame limiter or V-Sync is the limit.',
  lim_balanced: 'Balanced', limw_balanced: 'Nothing is maxed out (GPU {gpu}%, CPU {cpu}%). There is headroom.',
  sug_thermal: 'Run a thermal audit', sug_gameshield: 'Open Game Shield', sug_boost: 'Boost this game',

  hitLog: 'Recent hitches', hitNone: 'No hitches in the last minute.', hitAgo: '{n} s ago',

  // picker, receipt
  pickTitle: 'Game', killBg: 'Close background apps', receiptTitle: 'Boost receipt', receiptIdle: 'Nothing changed yet. A boost lists every step it takes, and every step is undone when you end it.',
  step_timer: 'Timer resolution 0.5 ms', step_parking: 'CPU core parking off', step_power: 'Power plan', step_mmcss: 'Game scheduling (MMCSS)', step_affinity: 'GPU and network interrupts',
  step_kill: 'Background apps', step_priority: 'Game priority', step_deprio: 'Background priority',
  fixMouse: 'Mouse feels off? Reset interrupt routing', fixMouseDone: 'Interrupt routing reset', fixMouseFail: 'Could not reset the routing',
  stepState_ok: 'Done', stepState_fail: 'Failed', stepState_run: 'Working', stepState_skip: 'Skipped', stepState_idle: 'Not run',

  // sessions and debrief
  noSessions: 'No sessions yet', noSessionsWhy: 'Play with Pulse open. When the game closes, the session lands here with its hitches, causes and score.', back: 'Back to sessions',
  verdict_clean: 'Clean',
  cause_thermal: 'Heat', 'cause_vram-full': 'Video memory full', 'cause_ram-pressure': 'Low free RAM', 'cause_background-spike': 'Busy background app', 'cause_gpu-bound': 'GPU at its limit', 'cause_cpu-bound': 'CPU at its limit', 'cause_clock-drop': 'GPU clock dropped', cause_unknown: 'Unknown',
  ago_now: 'just now', ago_min: '{n} min ago', ago_hour: '{n} h ago', ago_day: '{n} d ago',
  deb_clean: 'A clean session', deb_cleanWhy: 'No frame stalled long enough to count as a hitch.', deb_cause: 'Hitches mostly from: {cause}', deb_hitches: '{n} hitches, each tied to what the PC was doing at that second.',
  deb_noCauses: 'No hitches to explain.', deb_beforeAfter: 'Before and after the boost', deb_vsLast: 'Against your last session', deb_score: 'Pulse score', deb_hitchesLabel: 'Hitches', deb_marks: 'Your marks', deb_causes: 'What caused the hitches', deb_parts: 'How the score is made',
  deb_boost: 'Boost steps done: {ok} of {total}.', deb_noBoost: 'This session ran without a Pulse boost.',
  ba_cpu: 'CPU load', ba_gpu: 'GPU load', ba_ram: 'RAM in use', ba_cpuTemp: 'CPU temperature', ba_before: 'Before', ba_during: 'During play', ba_note: 'Before is the PC at the moment you started the boost; during is the middle of the session.',

  // pre-flight
  pfTitle: 'Pre-flight', pfLead: 'A quick read of the PC before you play. What cannot be read is shown as not measured, never as fine.', pfRun: 'Check again', pfRunning: 'Checking this PC…', pfFailed: 'The check could not run',
  pf_thermal: 'Temperature', pf_ram: 'Memory', pf_background: 'Background load', pf_updates: 'Windows Update', pf_power: 'Power plan', pf_reboot: 'Pending restart',
  pfw_thermal_ok: 'CPU is at {cpuTemp}°, plenty of headroom.', pfw_thermal_warn: 'CPU is already at {cpuTemp}° before you start.', pfw_thermal_bad: 'CPU is at {cpuTemp}°. Expect throttling in a long session.', pfw_thermal_unknown: 'No temperature sensor could be read.',
  pfw_ram_ok: 'RAM is at {ram}%.', pfw_ram_warn: 'RAM is at {ram}%. Less room for the game.', pfw_ram_bad: 'RAM is at {ram}%. The game will fight for memory.', pfw_ram_unknown: 'Memory use could not be read.',
  pfw_background_ok: 'The busiest app, {name}, uses {cpu}% of the CPU.', pfw_background_warn: '{name} uses {cpu}% of the CPU.', pfw_background_bad: '{name} uses {cpu}% of the CPU and will compete with the game.', pfw_background_unknown: 'Per-app load could not be read.',
  pfw_updates_ok: 'Windows Update is not working in the background.', pfw_updates_warn: 'Windows Update is busy and can spike the disk and CPU mid-game.', pfw_updates_unknown: 'Update activity could not be read.',
  pfw_power_ok: 'A high-performance power plan is active.', pfw_power_warn: 'The {plan} plan is active. A boost switches to a faster one.', pfw_power_unknown: 'The power plan could not be read.',
  pfw_reboot_ok: 'No restart is waiting.', pfw_reboot_warn: 'Windows is waiting for a restart. It can start it at a bad moment.', pfw_reboot_unknown: 'Restart status could not be read.',
  pfFix_gameshield: 'Open Game Shield', pfFix_updateguard: 'Open Update Guard', pfFix_boost: 'Go to boost',

  // rules, window prefs
  hudTitle: 'In-game HUD and window', hudWhy: 'The HUD floats over your game, never takes clicks and goes away with one key.',
  hudLayout: 'HUD layout', hudCorner: 'HUD corner', hudOpacity: 'HUD opacity', layout_minimal: 'Minimal', layout_standard: 'Standard', layout_full: 'Full',
  corner_tl: 'Top left', corner_tr: 'Top right', corner_bl: 'Bottom left', corner_br: 'Bottom right',
  pinCockpit: 'Keep the cockpit on top', pinWhy: 'Handy on a second monitor.', pinOn: 'On top', hotkeys: 'Hotkeys', hotkeysWhy: 'Active only while the HUD, the cockpit or a boost is open. Use Ctrl, Alt or Shift plus a letter, number or F key.',
  keyHud: 'Show or hide the HUD', keyMark: 'Mark a moment',

  // cockpit
  ck_hud: 'Show or hide the HUD', ck_min: 'Minimize', ck_close: 'Close', ck_keepAsk: 'A boost is running. Keep it running after you close the cockpit?', ck_keepYes: 'Keep it running', ck_keepNo: 'End boost and close', ck_keepCancel: 'Cancel',
  ck_game: 'Game', ck_low1: '1% low {n}', ck_score: 'Pulse score {n}',
  ck_cores: 'Per-core load', ck_core: 'Core {n}: {v}%', ck_coresN: '{n} logical processors, updated every 3 seconds.',
  ck_thermal: 'Thermal audit', ck_auditRun: 'Run audit', ck_auditWhy: 'Samples the CPU for about five seconds and tells you if it is throttling, and why. Run it under load for the truest answer.',
  ck_auditRunning: 'Sampling… {n} of {of}', ck_auditFail: 'The audit could not run. It needs the sensor service.',
  ck_sev_none: 'No throttling', ck_sev_light: 'Light', ck_sev_moderate: 'Moderate', ck_sev_heavy: 'Heavy',
  ck_cause_thermal: 'Heat', ck_cause_powerLimit: 'Power limit', ck_cause_vrm: 'Board power delivery', ck_cause_coreImbalance: 'Uneven cores', ck_causeNone: 'No cause found',
  ck_rec_thermalPaste: 'Fresh thermal paste or a better cooler would help most.', ck_rec_airflow: 'Case airflow is the likely fix: clear dust and check fan direction.', ck_rec_fanCurve: 'A more aggressive fan curve should hold the clocks.',
  ck_throttle: 'Throttled', ck_temp: 'Avg temp', ck_clock: 'Avg MHz', ck_boostScore: 'Boost score', ck_trend: 'Throttling changed by {d} points since the last audit.',
  ck_procs: 'Processes', ck_refresh: 'Refresh', ck_name: 'Name', ck_kill: 'End', ck_killSure: 'Sure?',

  // HUD
  hud_low1: '1% low {n}', hud_wait: 'Waiting for a game', hud_cpu: 'CPU', hud_gpu: 'GPU',
  hud_lim_thermal: 'Heat', hud_lim_vram: 'VRAM full', hud_lim_ram: 'RAM full', hud_lim_background: 'Background app', hud_lim_gpu: 'GPU-bound', hud_lim_cpu: 'CPU-bound', hud_lim_clock: 'Clock drop', hud_lim_capped: 'Frame cap', hud_lim_balanced: 'Headroom',
}
