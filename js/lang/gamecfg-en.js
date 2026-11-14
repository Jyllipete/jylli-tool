'use strict'
// Game settings sheet on the Games tab (js/gameconfig/sheet.js). Group `gamecfg`, read with tG('gamecfg', key, vars).
//   k_<key>  row label (the file key after the section, non-word characters turned into _)   why_<id> reason under a recommendation
LANG.en.gamecfg = {
  title: 'Game settings', loading: 'Reading the game file…', noFile: 'No settings file found. Start the game once so it creates one.', readFail: 'Could not read the game file.',
  noRows: 'No settings of this kind in your file.', on: 'on', off: 'off', launch: 'Launch', undo: 'Undo last change',
  g_all: 'All', g_display: 'Display', g_graphics: 'Graphics', g_performance: 'Performance',
  running: '{name} is running. Close it first: the game rewrites its settings file when it exits.',
  recommends: 'Jylli recommends {v}', recSet: 'Set as recommended', why_vsync: 'V-Sync adds a frame of delay and caps your frame rate', why_motionBlur: 'less blur, a clearer picture while you aim',
  applyRec: 'Use recommended ({n})', review: 'Review changes ({n})', reviewTitle: 'These lines change in the game file', reviewNone: 'Nothing would change.', reviewMissing: '{n} setting(s) are not in this version of the file and are skipped.',
  back: 'Back', apply: 'Apply ({n})',
  applied: 'Game settings saved', appliedMsg: '{n} change(s) written to {name}. A backup was kept.', undone: 'Game settings restored', undoFail: 'Could not undo', undoFailMsg: 'The file changed since, or the backup is gone.', launchFail: 'Could not start the launcher',
  errTitle: 'Nothing was changed', 'err_game-running': 'The game is running. Close it first.', 'err_no-file': 'The settings file is missing.',
  'err_bad-value': 'That value is not allowed for this setting.', 'err_out-of-range': 'That number is out of range.', 'err_verify-failed': 'The file did not read back correctly, so the original was put back.',
  'err_write-failed': 'The file could not be written, so the original was kept.', 'err_unknown-key': 'Unknown setting.', err_other: 'Something went wrong.',
  journal: 'Game settings',
  n_cs2: 'Counter-Strike 2', n_apex: 'Apex Legends', n_fortnite: 'Fortnite', n_minecraft: 'Minecraft',
  k_setting_fullscreen: 'Fullscreen', k_setting_nowindowborder: 'Borderless window', k_setting_defaultres: 'Resolution width', k_setting_defaultresheight: 'Resolution height',
  k_setting_mat_vsync: 'V-Sync', k_setting_mat_vsync_mode: 'V-Sync', k_setting_msaa_samples: 'Multisampling (MSAA)', k_setting_r_csgo_cmaa_enable: 'CMAA2 anti-aliasing',
  k_setting_videocfg_shadow_detail: 'Shadow quality', k_setting_videocfg_texture_detail: 'Texture detail', k_setting_videocfg_particle_detail: 'Particle detail',
  k_setting_videocfg_ao_detail: 'Ambient occlusion', k_setting_videocfg_fsr_detail: 'FidelityFX Super Resolution',
  k_FullscreenMode: 'Window mode', k_ResolutionSizeX: 'Resolution width', k_ResolutionSizeY: 'Resolution height', k_bUseVSync: 'V-Sync', k_bMotionBlur: 'Motion blur', k_bShowGrass: 'Grass',
  k_sg_ViewDistanceQuality: 'View distance', k_sg_ShadowQuality: 'Shadows', k_sg_AntiAliasingQuality: 'Anti-aliasing', k_sg_TextureQuality: 'Textures', k_sg_EffectsQuality: 'Effects',
  k_sg_PostProcessQuality: 'Post processing', k_sg_FoliageQuality: 'Foliage', k_FrameRateLimit: 'Frame rate limit',
  k_fullscreen: 'Fullscreen', k_enableVsync: 'V-Sync', k_maxFps: 'Frame rate limit', k_renderDistance: 'Render distance', k_simulationDistance: 'Simulation distance',
  k_particles: 'Particles', k_entityShadows: 'Entity shadows', k_mipmapLevels: 'Mipmap levels',
}
