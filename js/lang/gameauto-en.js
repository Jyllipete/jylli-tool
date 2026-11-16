'use strict'
// Game automation (js/gameauto/*): Game Watcher, Update Guard, Game Shield, Auto-Pulse. Group `gameauto`, read with tG('gameauto', key, vars).
//   ph_<phase> chip of a protection   wph_<phase> chip of the watcher   ev_<feature>_<kind>[_fail][_<detail>] ledger line   v_<verdict> why a program did not restart
//   ex_<reason> exclusion form message   cov_<phase> what Game Shield does with an excluded program   err_<code> why a change was refused
LANG.en.gameauto = {
  loading: 'Loading game automation', failT: 'Game automation could not be read', failS: 'Nothing was changed. Try again; if it keeps failing, restart Jylli Tool.', retry: 'Try again', dismiss: 'Dismiss',
  durNow: 'just now', durMin: '{m} min', durHour: '{h} h {m} min',

  // watcher strip
  watcherT: 'Game Watcher',
  wph_off: 'Off', wph_paused: 'Paused', wph_degraded: 'Detection degraded', wph_active: 'Playing', wph_armed: 'Watching',
  stripOffT: 'Game detection is off', stripOffS: 'Nothing below starts on its own. Turn on Game Watcher so Update Guard, Game Shield and Auto-Pulse can react when a game launches.',
  stripPausedT: 'Paused for Competitive Mode', stripPausedS: 'Competitive Mode owns this game’s session. The watcher resumes when it ends.',
  stripDegradedT: 'Detection is struggling', stripDegradedS: 'The process list could not be read several times in a row. Your current session is kept as it is and nothing is ended because of this.',
  stripWatchT: 'Watching for games', stripWatchS: 'Checks every 5 seconds and knows {n} games.',
  stripPlaying: 'Playing for {since} · {armed} of {total} protections on',
  detTitle: 'What it can detect ({n} games)', detBody: 'Games are recognised by their program name, from a built-in list plus games you added in the Games tab. Each game gets its own session.',
  detPulseTip: 'Auto-Pulse can boost this game', detCustom: 'Added by you', detLibrary: 'Library',
  libT: 'Also detect games from my library', libS: 'Adds games Jylli Tool found in Steam, Epic or Xbox folders, but only when it is sure which program is the game.',
  detLimits: 'Not detected: games it does not know yet, and programs that share a name with other software. Games without a Pulse preset still get Update Guard, Game Shield and a saved tweak profile, but not Auto-Pulse. Browser games and launchers are not games.',
  openGames: 'Add or manage games',

  // plan
  flowT: 'What happens', flowS: 'Built from what is switched on right now.', flowEmpty: 'Nothing is switched on besides the watcher. Switch on a protection below to see what it would do.',
  flow_start: 'When a game starts', flow_playing: 'While you play', flow_exit: 'When it ends', flowNone: 'Nothing',
  planUgStart: 'Holds the Windows Update service.', planUgExit: 'Puts Windows Update back the way it was.',
  planGsStart: 'Closes {list}. If RAM use is at or above {t3}%, also {tier3}.', planGsMid: 'If RAM use reaches {mid}%, closes {list}.', planGsExit: 'Starts again only what Game Shield closed.',
  planApStart: 'Starts the Pulse boost for the game when it has a Pulse preset.', planApNone: 'This game has no Pulse preset, so Auto-Pulse will not start.', planApExit: 'Ends the boost it started.',
  planSummary: 'Saves a record of what changed and what was put back.',

  // shared
  ph_off: 'Off', ph_locked: 'Premium', ph_needsWatcher: 'Needs Game Watcher', ph_paused: 'Paused', ph_armed: 'Armed', ph_starting: 'Starting…', ph_active: 'Active', ph_skipped: 'Skipped', ph_failed: 'Needs attention', ph_restored: 'Restored', ph_degraded: 'Degraded', ph_unavailable: 'Unavailable', ph_manual: 'Left alone', ph_snoozed: 'Snoozed',
  notT: 'What it does not do', lockedS: 'Part of Premium. The Game Watcher itself is free.', unlock: 'See Premium',
  needsWatcher: 'This only starts with your games once Game Watcher is on.', turnOnWatcher: 'Turn on Game Watcher',

  // Update Guard
  updateGuardT: 'Update Guard', updateGuardS: 'Holds the Windows Update service while a game runs and puts it back the way it was when you quit.',
  updateGuardNot: 'It switches off one Windows service. It does not stop Microsoft Store updates, a restart that is already scheduled, or other updaters, and Windows can turn the service back on by itself. An update that is already installing is not interrupted. If the service was already off, Update Guard changes nothing.',
  ugL_off: 'Off. Windows Update is not touched.', ugL_armed: 'Armed. Windows Update is held the next time a game starts.', ugL_holding: 'Windows Update is held for this game.', ugL_skipped: 'The Windows Update service was already off, so nothing was changed and nothing needs to be restored.',
  ugL_failed: 'Windows Update could not be held. Whatever was changed has been put back.', ugL_restored: 'Windows Update was put back the way it was after the last game.', ugL_restoredRe: 'Windows Update is back as it was. Windows had already switched the service on during the game.',
  ugRestoreFail: 'Windows Update could not be put back as it was. Jylli Tool tries again at every start. To fix it now, press Try again, or open Services and set “Windows Update” to Manual.',
  ugPendN: 'Updates waiting when the game started: {n} (from Windows’ local update list).', ugPend0: 'No waiting updates in Windows’ local update list.', ugPendUnknown: 'Could not check for waiting updates. That does not mean there are none.',

  // Game Shield
  shieldT: 'Game Shield', shieldS: 'Closes background programs when a game starts and starts them again when it ends.',
  shieldNot: 'It force-closes the listed programs, so unsaved work in them is lost (browsers especially). It only restarts programs it closed itself, from the place they ran from. Steam is never closed. It does not free memory used by the game or by Windows, and it does not make a game faster by itself.',
  gsL_off: 'Off. No program is closed.', gsL_armed: 'Armed. Programs are closed the next time a game starts.', gsL_active: 'Closed {n} so far: {list}.', gsL_none: 'Nothing needed closing for this game.', gsL_failed: 'Game Shield could not start for this game. Nothing was closed.',
  gsL_restored: 'Last game: closed {n} program(s), about {mb} MB, and started them again.',
  gsRestoreFail: 'Some programs did not start again:', gsRetry: 'Try starting them again',
  gsAtLaunch: 'At launch', gsAlways: 'Always:', gsIfRam: 'If RAM use is {n}% or more:', gsDuring: 'During the game', gsDuringNote: 'Checked every 20 seconds. Programs closed earlier are not closed twice.',
  mkLaunch: 'Launch', mkDuring: 'During',
  gsSliderLaunch: 'Also close at launch from', gsSliderLaunchHint: 'RAM use at launch. 50–90%.',
  gsSliderMid: 'Close during the game from', gsSliderMidHint: 'Always at least 5 points above the launch value. 55–95%.',
  gsTasks: 'While Game Shield is on, the Edge and Google updater tasks are paused. Jylli Tool only turns back on the ones that were on before.',
  exT: 'Always keep alive', exS: 'Programs Game Shield must never close. Type the program’s file name, for example obs64.exe. If you leave out .exe it is added.',
  exNone: 'No exceptions yet.', exPlaceholder: 'obs64.exe', exAdd: 'Keep alive', exRemove: 'Remove {name}',
  ex_empty: 'Type a program name first.', ex_format: 'Use only letters, numbers, spaces and . _ - ( ) + — up to 64 characters, like obs64.exe.', ex_duplicate: 'That program is already on the list.', ex_limit: 'The list is full (50 programs). Remove one first.', ex_save: 'Could not save. The list was not changed.', exAdded: '{name} added.',
  cov_launch: 'Game Shield would close this at launch, so it is now kept alive.', cov_tier3: 'Game Shield would close this when RAM is high, so it is now kept alive.', cov_mid: 'Game Shield would close this during the game when RAM is high, so it is now kept alive.', cov_none: 'Game Shield never closes this program, so keeping it alive changes nothing.',
  v_restarted: 'started again', 'v_already-running': 'was already running', 'v_no-path': 'Jylli Tool did not record where it ran from, so it cannot start it. Open it yourself.', v_missing: 'the program file is gone', 'v_start-failed': 'it did not start. Try opening it yourself.', v_error: 'something went wrong',

  // Auto-Pulse
  autoPulseT: 'Auto-Pulse', autoPulseS: 'Starts the Pulse boost for a game when it is detected and ends it when the game closes.',
  autoPulseNot: 'It needs Game Watcher and only uses the game’s own Pulse preset. A boost you start yourself is never replaced. A boost you started for the same game still ends when that game closes. If Pulse cannot start, you are told, and nothing is shown as active.',
  apL_off: 'Off. Pulse only starts when you start it.', apL_armed: 'Armed. Pulse starts with the next game that has a preset.', apL_restored: 'Last game: the Pulse boost was ended.',
  apL_starting: 'Starting Pulse…', apL_active: 'Pulse is boosting {game}.', apL_failed: 'Pulse could not start: {reason}. Nothing was left changed. Open Pulse to start it yourself.',
  apL_manual: 'You had already started a boost, so Auto-Pulse left it alone.', apL_snoozed: 'You stopped Pulse. Auto-Pulse stays off until this game is closed and started again.',
  apL_unavailable: '{game} has no Pulse preset, so Auto-Pulse cannot boost it.', 'apL_off-for-game': 'Auto-Pulse is switched off for this game.',
  openPulse: 'Open Pulse',
  apPerGame: 'Per game', apPerGameS: 'On means the boost starts by itself for that game. Everything is on by default.', apGameAria: 'Boost {name} automatically', apReset: 'Reset all to on',
  apNoPreset: 'Games without a Pulse preset, including most library games, are not listed because Auto-Pulse cannot boost them.',
  apLegacy: 'Older versions let you pick another game’s Pulse preset for a game. That never aimed at the right program and was removed. {n} saved choice(s) were not carried over.',
  openGamesShort: 'Games',

  // ledger
  ledgerT: 'Session record', ledgerS: 'What the automation changed during a game and whether it was put back.', ledgerEmpty: 'No game sessions yet. Start a game and the record appears here.', ledgerNoEvents: 'Nothing was changed during this session.',
  ledgerNow: 'This session: {game}', ledgerLast: 'Last session: {game}', ledgerSince: 'Started {since} ago', ledgerEnded: 'Ended: {why} · played {dur}',
  end_exit: 'game closed', end_switch: 'another game started', 'end_watcher-stopped': 'Game Watcher was turned off', end_crash: 'Jylli Tool closed during the game', 'end_competitive-mode': 'Competitive Mode took over',
  allRestored: 'Everything restored', needsAttention: '{n} need attention', histT: 'Earlier sessions',
  ev_generic: '{feature}: {kind}',
  ev_updateGuard_applied: 'Windows Update held', ev_updateGuard_restored: 'Windows Update put back as it was', 'ev_updateGuard_restored_windows-reenabled': 'Windows Update put back (Windows had already switched it on during the game)',
  'ev_updateGuard_restored_time-limit': 'Windows Update put back after the 8 hour limit', ev_updateGuard_restored_recovery: 'Windows Update put back after Jylli Tool started again', ev_updateGuard_restored_fail: 'Windows Update could not be put back',
  ev_updateGuard_skipped: 'Windows Update was already off, nothing changed', ev_updateGuard_failed: 'Windows Update could not be held',
  ev_shield_applied: 'Closed {key}', ev_shield_applied_launch: 'Closed {key} at launch', 'ev_shield_applied_mid-session': 'Closed {key} during the game (RAM high)',
  ev_shield_restored: 'Started {key} again', 'ev_shield_restored_already-running': '{key} was already running again', ev_shield_restored_fail: 'Could not start {key} again: {verdict}',
  'ev_shield_info_nothing-to-stop': 'Nothing needed closing', ev_shield_failed: 'Game Shield could not start',
  ev_autoPulse_applied: 'Pulse boost started', ev_autoPulse_restored: 'Pulse boost ended', 'ev_autoPulse_restored_manual-boost-ended-with-game': 'Your Pulse boost ended with the game', ev_autoPulse_restored_fail: 'The Pulse boost could not be ended cleanly',
  ev_autoPulse_failed: 'Pulse could not start: {detail}', 'ev_autoPulse_skipped_no-preset': 'No Pulse preset for this game', 'ev_autoPulse_skipped_off-for-game': 'Auto-Pulse is off for this game',
  'ev_autoPulse_info_manual-boost-left-alone': 'Your own Pulse boost was left alone', 'ev_autoPulse_info_stopped-by-user': 'You stopped Pulse; Auto-Pulse stays off for this game',
  ev_mmcss_applied: 'Game scheduling priority raised (checked)', ev_mmcss_restored: 'Scheduling priority put back to your value', ev_mmcss_restored_fail: 'Scheduling priority could not be put back. It is retried at the next start.', ev_mmcss_failed: 'Game scheduling priority could not be set',
  'ev_profile_applied_kept-counts': 'Tweak profile “{name}”: {n} applied, {already} were already on. They stay until you undo them in History.', 'ev_profile_failed_tweak-failed': 'Tweak profile “{name}”: {id} did not apply ({error})',
  'ev_profile_skipped_refused-tier': 'Tweak profile “{name}”: {id} was not applied (too risky to run automatically)', 'ev_profile_skipped_refused-excluded': 'Tweak profile “{name}”: {id} was not applied (you excluded it from automatic runs)', 'ev_profile_skipped_unknown-tweak': 'Tweak profile “{name}”: {id} no longer exists and was skipped',
  ev_apps_applied: '{n} background process(es) stepped back for this game', ev_apps_restored: 'Background programs put back', ev_apps_restored_fail: 'Some background programs could not be put back', 'ev_apps_restored_fail_left': '{left} background process(es) could not be put back', ev_apps_failed: 'Game time could not start', 'ev_apps_info_nothing-to-lower': 'Game time found nothing to step back', 'ev_apps_info_still-ending': 'Game time from the previous game was still ending, so it did not start for this one',
  'ev_autoPulse_info_taken-over-by-user': 'You started your own Pulse boost. It ends with the game.',
  ev_profile_applied: 'Tweak profile “{name}” applied. It stays until you undo it in History.', ev_profile_failed: 'Tweak profile “{name}”: some tweaks did not apply ({detail})',
  'ev_watcher_info_app-closed-during-session': 'Jylli Tool closed during this game. What was left over was put back when it started again.',

  // refusals and failures
  changeFailed: 'That change was not made', retryFailed: 'Still not restored', retryFailedUg: 'Windows Update is still not back as it was. Set the “Windows Update” service to Manual in Services.', retryFailedGs: 'Some programs still did not start. Open them yourself.',
  err_premium_required: 'This needs Premium.', err_settings_write_failed: 'The setting could not be saved, so nothing was changed.', err_state_write_failed: 'The setting could not be saved, so nothing was changed.', err_bad_request: 'That request was not understood.', err_failed: 'Something went wrong. Nothing was changed.',
}
