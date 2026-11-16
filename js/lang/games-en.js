'use strict'
// Games tab "Library" (js/games/*). Group `games2`, read with tG('games2', key, vars).
//   v_<kind> / vS_<kind> stage sentence   fT_<finding> / fS_<finding> finding   row_<id> / rowS_<id> per-game change   st_<status> row status
//   dot_<k> card status   r_<reason> why a change failed   tip_<curated id, - as _> game tip
LANG.en.games2 = {
  title: 'Games', seg_library: 'Library', seg_play: 'Play history', seg_auto: 'Automation', seg_history: 'History',
  search: 'Search your games', chips: 'Filter games', sortBy: 'Sort by', sort_recent: 'Recently played', sort_name: 'Name', sort_time: 'Most played', layout: 'Layout', layoutGrid: 'Grid', layoutList: 'List',
  add: 'Add a game', rescan: 'Rescan', retry: 'Try again', working: 'Working…', close: 'Close', apply: 'Apply', undo: 'Undo', review: 'Open it', unlock: 'Unlock with Premium',
  detailLabel: 'Game details', listLabel: 'Your games',
  chip_all: 'All', chip_fav: 'Favourites', chip_tuned: 'Tuned', chip_attention: 'Needs attention', chip_steam: 'Steam', chip_epic: 'Epic', chip_xbox: 'Xbox', chip_other: 'Other',
  src_steam: 'Steam', src_epic: 'Epic Games', src_xbox: 'Xbox', src_other: 'Installed separately',
  dot_running: 'Running now', dot_tuned: 'Tuned', dot_partial: 'Partly tuned', dot_open: 'Not tuned yet', dot_drift: 'Reset by Windows', dot_noexe: 'Program file not known', dot_unknown: 'Could not be read',
  st_running: 'Running now', playedAgo: 'Played {when}', never: 'Never',
  ago_now: 'just now', ago_min: '{n} min ago', ago_h: '{n} h ago', ago_d: '{n} d ago',
  dur_min: '{n} min', dur_h: '{n} h',
  fav: 'Add to favourites', unfav: 'Remove from favourites',

  // stage
  eyeScan: 'Looking for your games', eyeRun: 'Applying', eyeLib: 'Library · {n} games',
  vScan: 'Reading your launchers', vScanS: 'Steam, Epic and Xbox keep a list of what is installed. Jylli reads those files; nothing is uploaded.',
  vFail: 'The scan did not finish', vFailS: 'Your launchers could not be read. Nothing was changed.',
  vRun: 'Applying changes', vRunS: 'Changing {what}, then reading it back from Windows to check.',
  v_empty: 'No games found yet', vS_empty: 'Jylli reads Steam, Epic and Xbox on this PC. If a game is installed somewhere else, add its program file.',
  v_running: '{name} is running', vS_running: 'Changes you make now take effect the next time it starts.',
  v_free: '{n} games on this PC', vS_free: 'Play them from here and see how you played. Tuning each game is part of Premium.',
  v_todo: '{n} games can still be tuned', vS_todo: '{tuned} of {games} are tuned. Every change is read back from Windows and can be undone.',
  v_done: 'Everything recommended is set', vS_done: '{n} of {games} games are tuned. Nothing is waiting.',
  fT_drift: 'A game\'s tuning was reset', fS_drift: '{name} reads Windows defaults again for a change Jylli made. Open it to put it back.',
  fT_legacy: 'Old game profiles are still on', fS_legacy: '{n} game(s) still carry the old profile. It also added a Defender exclusion and system-wide changes. Put it back, then use the per-game rows.',
  fT_noexe: '{name} needs its program file', fS_noexe: 'Jylli cannot tell which .exe starts {name}. Pick it once and its rows unlock.',
  fT_unread: 'Some games could not be read', fS_unread: '{n} game(s) could not be read. Windows may need administrator rights for this.',
  fT_running: '{name} is running', fS_running: 'Changes take effect the next time it starts.',
  ctaTune: 'Tune {n} games', ctaPlay: 'Play {name}', pillOn: 'Auto-profiles on', pillOff: 'Auto-profiles off',
  confirmBody: 'This applies {n} recommended changes across {games} games. Each one is read back from Windows and can be undone from History.', whatAll: '{n} games',

  // banners
  bnFailT: 'The library could not be read', bnFailS: 'Showing what was found last time, if anything.',
  bnLegacyT: '{n} game(s) have the old profile', bnLegacyS: 'It added a Defender exclusion and system-wide changes. Putting it back also removes those.', bnLegacyCta: 'Put it back',
  bnAdminT: 'Power throttling cannot be read without administrator rights', bnAdminS: 'Start Jylli as administrator to read and verify that row. Other rows are unaffected.',
  legacyNote: 'This game still has the old profile. Put it back, then use the rows below.', migrated: 'Put back {n} old profile(s).',

  // grid and states
  emptyT: 'No games found', emptyS: 'Jylli reads Steam, Epic and Xbox. For a game installed somewhere else, add its program file.',
  noMatchT: 'No games match', noMatchS: 'Nothing for "{q}".', clearFilters: 'Clear filters', pickT: 'Pick a game', pickS: 'Choose a game on the left to play it or tune it.',
  scanFailed: 'The scan did not finish.', hidden: '{name} is hidden from the library.', launching: 'Starting {name}…', launchFailed: 'This game could not be started from here.',
  removeGame: 'Remove from the library', hideGame: 'Hide from the library',

  // detail
  play: 'Play', compete: 'Competitive Mode', competeS: 'Open this game in Competitive Mode above', folder: 'Open install folder',
  tab_tune: 'Tune', tab_perf: 'Performance', tab_cfg: 'Game settings', tab_tips: 'Tips',
  exeT: 'Program file', exePick: 'Choose…', exeSrc_picked: 'you chose', exeSrc_learned: 'seen running', exeSrc_known: 'found',
  exeGuess: 'Jylli thinks {exe} starts this game, but it is only a guess. Confirm it before anything is changed.', exeUse: 'Use {exe}',
  exeNone: 'Jylli could not find which program starts this game. Choose it once and the rows below unlock. Starting the game from here also teaches it.',
  rowsT: 'What Jylli can change for this game', rowsFoot: 'Each change is written, read back from Windows, and can be undone. Nothing here touches Windows Defender or system-wide settings.',
  recommended: 'Recommended', ctaTuneOne: 'Apply {n} recommended',
  lockedS: 'Per-game tuning is part of Premium.',
  whyNoExe: 'Needs the game\'s program file first.', whyElsewhere: 'Another tab or tool set a different value. Jylli will not overwrite it.', whyUnknown: 'Windows could not be read for this row.', whyDrift: 'Jylli applied this, but Windows reads the default again.',
  st_on: 'On', st_native: 'On (already)', st_off: 'Off', st_partial: 'Partly', st_drifted: 'Reset', st_elsewhere: 'Set elsewhere', st_unknown: 'Unknown', st_noexe: 'No program file',
  row_priority: 'High CPU priority', rowS_priority: 'Windows gives this game\'s process more processor time when something else competes for it. Set through the CPU & Memory service.',
  row_throttle: 'Never throttle for power', rowS_throttle: 'Stops Windows slowing this game down or moving it to efficiency cores to save power. Best on laptops and hybrid processors.',
  row_windowed: 'Optimisations for windowed games', rowS_windowed: 'Lets Windows present borderless and windowed frames the modern way, with less delay. Windows 11, per game.',
  row_fso: 'Disable fullscreen optimisations', rowS_fso: 'Only for a game that stutters in exclusive fullscreen. The effect varies between games, so it is never recommended automatically.',
  perfNoneT: 'No recorded sessions yet', perfNoneS: 'Jylli records frame rate while its watcher sees this game running. Turn on auto-profiles under Automation, then play.', perfNoneNoPreset: 'Frame rate is recorded for games Pulse knows by name. This one has no recorded sessions.',
  totTime: 'Played', totSessions: 'Sessions', totGames: 'Games', colAvg: 'Avg FPS', colLow: '1% low', colTrend: 'Trend', colGame: 'Game', colPlayed: 'Time played', sessionsN: '{n} sessions',
  imp_better: 'Smoother since you tuned it', imp_worse: 'Slightly worse since you tuned it', imp_same: 'No clear difference',
  impS: '1% lows {lows}%, average {avg}% (over {b} sessions before and {a} after).', impNeedT: 'Not enough sessions to compare yet', impNeedS: 'Needs {min} sessions before and after tuning (you have {b} before, {a} after).',
  lastSession: 'Last recorded {when}.', perfFoot: 'Only sessions Jylli recorded are counted.',
  fStore: 'Store', fPath: 'Folder', fId: 'Id', fExes: 'Program files',
  tip_generic: 'Close overlays and launchers you do not need while you play, and keep the game on an SSD if you can.',
  tip_fortnite: 'In NVIDIA Control Panel set Low Latency Mode to Ultra for the Fortnite program. Performance mode in the game\'s video settings gives the biggest frame-rate gain.',
  tip_gtav: 'Adding -dx11 to the Rockstar Launcher launch arguments can help older CPUs.',
  tip_valorant: 'Turn off Multithreaded Rendering if you get stutters on an older CPU.',
  tip_arma_reforger: 'Use exclusive fullscreen and turn V-Sync off in the game\'s settings for the best frame rate.',
  tip_minecraft: 'On Java Edition, the Sodium and Lithium mods (Fabric) often double the frame rate.',
  tip_cs2: 'Launch options: -novid -nojoy -fullscreen +fps_max 0 +mat_queue_mode 2',
  tip_apex: 'Use +fps_max unlimited in the launch options for uncapped frames.',
  tip_warzone: 'Use fullscreen exclusive and turn the in-game V-Sync off for the lowest input delay.',
  tip_rust: 'Launch options: -window-mode exclusive -high -maxMem=8192 -malloc=system -force-d3d11',
  tip_the_finals: 'Fullscreen exclusive with V-Sync off gives the lowest input delay.',
  tip_r6siege: 'Turn the Ubisoft overlay off for less input lag, and set texture quality to medium on competitive maps.',
  tip_overwatch2: 'Set Render Scale to 100%. Dynamic render scale causes frame-time spikes.',
  tip_tarkov: 'Turn HD textures off, set object LOD to 2, turn SSR off, and use fullscreen rather than borderless.',
  tip_squad: 'Lower shadows to medium, turn ambient occlusion off, and use DirectX 11 for stability.',
  tip_dayz: 'Lower the view distance to 1200 m, shadows to low, and turn volumetric clouds off.',
  tip_cyberpunk: 'Use DLSS or FSR, set crowd density to low, and turn ray tracing off for competitive play.',
  tip_rdr2: 'Lower grass quality and shadows first, they cost the most GPU time. Set TAA sharpening to 100%.',
  tip_pubg: 'Use the Smooth + Unlocked frame-rate preset, turn V-Sync off, and set foliage to very low.',
  tip_rocketleague: 'Cap the frame rate a little above your refresh rate and keep V-Sync off.',

  // results
  runFailed: 'That did not work. Nothing was left half-changed.', doneAll: 'Applied {n} change(s) and read them back.', doneSome: '{ok} applied, {bad} failed: {why}.', undoing: 'the last changes', undone: 'Put back.', undoFailed: 'Could not undo that run.',
  r_unknown: 'unknown game or change', r_noexe: 'no program file', r_elsewhere: 'set elsewhere, not overwritten', r_failed: 'Windows refused it', r_error: 'something went wrong', 'r_not-verified': 'Windows did not confirm it', r_premium_required: 'needs Premium',
  'e_bad-exe': 'That is not a usable program file.', 'e_unknown-game': 'That game is not in the library.',

  // play history
  playEmptyT: 'No recorded sessions yet', playEmptyS: 'Jylli records frame rate and play time while its watcher sees a game it knows running. Turn on auto-profiles under Automation, then play.', playEmptyCta: 'Open Pulse',
  playFoot: 'Only sessions Jylli recorded are listed. Games it does not know by name are not recorded.',

  // history
  histEmptyT: 'Nothing changed yet', histEmptyS: 'Every change you make to a game appears here, with an Undo.', runTitle: '{n} change(s)', runOk: '{n} done', runBad: '{n} failed',
  did_apply: 'turned on', did_restore: 'turned off', unverified: 'could not be read back', openJournal: 'Open the full change history',

  // automation
  autoWatchT: 'Auto-profiles', autoWatchOn: 'Watching. Session protections (Windows Update hold, Game Shield, Auto-Pulse, Game time) are put back when the game closes. A saved tweak profile stays applied until you undo it in History.', autoWatchOff: 'Off. Turn on to apply a saved profile when a game starts.',
  autoWatchS: 'Checks every 5 seconds for a game it knows by name. It records your sessions for the play history and can start Pulse.',
  autoPulseT: 'Start Pulse automatically', autoPulseS: 'Boosts the game while it runs, then restores everything.',
  profT: 'Tweak profile per game', profS: 'Applied when the game starts. Works for games Jylli knows by name.', assignFor: 'Profile for {name}', noProfile: 'None',
  profNone: 'None of your games is one the watcher knows by name yet.', profNoSaved: 'You have no saved tweak profiles yet. Save one from the Fixes or Windows tab, then assign it here.', assigned: 'Profile "{name}" will apply when the game starts.', unassigned: 'Profile removed for this game.',
  bundT: 'Saved setups', bundS: 'A game with its Pulse preset and tweak profile, started with one click.', bundNew: 'Save a setup', bundEmpty: 'No saved setups yet. Select a game, assign a profile, then save a setup.', bundPulse: 'Pulse', bundGo: 'Start', bundDel: 'Delete setup',
  bundPrompt: 'Name this setup', bundPlaceholder: 'Competitive CS2', bundSaved: 'Saved "{name}".', bundSome: 'Started, but {n} change(s) failed.', bundOn: '"{name}" is on.', bundDelBody: 'Delete the setup "{name}"?', bundGone: 'Deleted "{name}".',
  readyT: 'Windows basics', readyS: 'System-wide settings that help every game. They live in other tabs; this only shows where they stand.', rdGo: 'Open', rd_gamemode: 'Game Mode', rdS_gamemode: 'Keeps Windows from interrupting a game with updates and background work.', rd_gamedvr: 'Game DVR off', rdS_gamedvr: 'Stops background recording from costing frames.',
  bnLegacyT_1: 'One game has the old profile', fS_legacy_1: 'One game still carries the old profile. It also added a Defender exclusion and system-wide changes. Put it back, then use the per-game rows.', fS_unread_1: 'One game could not be read. Windows may need administrator rights for this.', runTitle_1: '1 change', doneAll_1: 'Applied 1 change and read it back.', migrated_1: 'Put back 1 old profile.', sessionsN_1: '1 session', ctaTuneOne_1: 'Apply 1 recommended', ctaTune_1: 'Tune 1 game', v_todo_1: '1 game can still be tuned', eyeLib_1: 'Library · 1 game', v_free_1: '1 game on this PC',
}
