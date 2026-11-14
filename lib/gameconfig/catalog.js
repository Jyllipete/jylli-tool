'use strict'
// The only list of games whose own settings file Jylli may edit, and of the keys it may touch (docs/GAMECONFIG_EVIDENCE.md).
// A row only shows when its key really exists in the player's file, and a patch never adds a key (lib/gameconfig/formats.js), so a key
// that a game version dropped or renamed simply does not appear. Valorant is not listed: Riot syncs its settings from the cloud.
//   type    bool01 ('0'/'1') | boolTF ('True'/'False' as the file spells it, see `t`/`f`) | choice (values) | int (min..max)
//   rec     { value, why }  Jylli's recommendation, only for settings whose effect is understood (V-Sync off, motion blur off)

const U = '/Script/FortniteGame.FortGameUserSettings'
const choice = (...pairs) => pairs.map(([value, label]) => ({ value: String(value), label }))
const q4 = choice([0, '0'], [1, '1'], [2, '2'], [3, '3'])

const GAMES = {
  cs2: {
    name: 'Counter-Strike 2', format: 'kv', launcher: 'steam', appId: '730', procs: ['cs2.exe'],
    settings: [
      { key: 'setting.fullscreen', group: 'display', type: 'bool01' },
      { key: 'setting.nowindowborder', group: 'display', type: 'bool01' },
      { key: 'setting.defaultres', group: 'display', type: 'int', min: 640, max: 7680 },
      { key: 'setting.defaultresheight', group: 'display', type: 'int', min: 480, max: 4320 },
      { key: 'setting.mat_vsync', group: 'display', type: 'bool01', rec: { value: '0', why: 'vsync' } },
      { key: 'setting.msaa_samples', group: 'graphics', type: 'choice', values: choice([0, 'None'], [2, '2x'], [4, '4x'], [8, '8x']) },
      { key: 'setting.r_csgo_cmaa_enable', group: 'graphics', type: 'bool01' },
      { key: 'setting.videocfg_shadow_detail', group: 'graphics', type: 'choice', values: q4 },
      { key: 'setting.videocfg_texture_detail', group: 'graphics', type: 'choice', values: q4 },
      { key: 'setting.videocfg_particle_detail', group: 'graphics', type: 'choice', values: q4 },
      { key: 'setting.videocfg_ao_detail', group: 'graphics', type: 'choice', values: q4 },
      { key: 'setting.videocfg_fsr_detail', group: 'performance', type: 'choice', values: choice([0, '0'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']) },
    ],
  },
  apex: {
    name: 'Apex Legends', format: 'kv', launcher: 'steam', appId: '1172470', procs: ['r5apex.exe', 'r5apex_dx12.exe'],
    settings: [
      { key: 'setting.fullscreen', group: 'display', type: 'bool01' },
      { key: 'setting.nowindowborder', group: 'display', type: 'bool01' },
      { key: 'setting.defaultres', group: 'display', type: 'int', min: 640, max: 7680 },
      { key: 'setting.defaultresheight', group: 'display', type: 'int', min: 480, max: 4320 },
      { key: 'setting.mat_vsync_mode', group: 'display', type: 'choice', values: choice([0, 'Off'], [1, 'Double buffered'], [2, 'Triple buffered']), rec: { value: '0', why: 'vsync' } },
    ],
  },
  fortnite: {
    name: 'Fortnite', format: 'ini', launcher: 'epic', procs: ['FortniteClient-Win64-Shipping.exe'],
    settings: [
      { key: U + '|FullscreenMode', group: 'display', type: 'choice', values: choice([0, 'Fullscreen'], [1, 'Windowed fullscreen'], [2, 'Windowed']) },
      { key: U + '|ResolutionSizeX', group: 'display', type: 'int', min: 640, max: 7680 },
      { key: U + '|ResolutionSizeY', group: 'display', type: 'int', min: 480, max: 4320 },
      { key: U + '|bUseVSync', group: 'display', type: 'boolTF', rec: { value: 'False', why: 'vsync' } },
      { key: U + '|bMotionBlur', group: 'graphics', type: 'boolTF', rec: { value: 'False', why: 'motionBlur' } },
      { key: U + '|bShowGrass', group: 'graphics', type: 'boolTF' },
      { key: U + '|sg.ViewDistanceQuality', group: 'graphics', type: 'choice', values: choice([0, 'Low'], [1, 'Medium'], [2, 'High'], [3, 'Epic']) },
      { key: U + '|sg.ShadowQuality', group: 'graphics', type: 'choice', values: choice([0, 'Low'], [1, 'Medium'], [2, 'High'], [3, 'Epic']) },
      { key: U + '|sg.AntiAliasingQuality', group: 'graphics', type: 'choice', values: choice([0, 'Low'], [1, 'Medium'], [2, 'High'], [3, 'Epic']) },
      { key: U + '|sg.TextureQuality', group: 'graphics', type: 'choice', values: choice([0, 'Low'], [1, 'Medium'], [2, 'High'], [3, 'Epic']) },
      { key: U + '|sg.EffectsQuality', group: 'graphics', type: 'choice', values: choice([0, 'Low'], [1, 'Medium'], [2, 'High'], [3, 'Epic']) },
      { key: U + '|sg.PostProcessQuality', group: 'graphics', type: 'choice', values: choice([0, 'Low'], [1, 'Medium'], [2, 'High'], [3, 'Epic']) },
      { key: U + '|sg.FoliageQuality', group: 'graphics', type: 'choice', values: choice([0, 'Low'], [1, 'Medium'], [2, 'High'], [3, 'Epic']) },
      { key: U + '|FrameRateLimit', group: 'performance', type: 'int', min: 0, max: 1000, float: true },
    ],
  },
  minecraft: {
    name: 'Minecraft', format: 'options', launcher: null, procs: ['javaw.exe', 'java.exe', 'Minecraft.Windows.exe'],
    settings: [
      { key: 'fullscreen', group: 'display', type: 'boolTF2' },
      { key: 'enableVsync', group: 'display', type: 'boolTF2', rec: { value: 'false', why: 'vsync' } },
      { key: 'maxFps', group: 'performance', type: 'int', min: 10, max: 260 },
      { key: 'renderDistance', group: 'graphics', type: 'int', min: 2, max: 32 },
      { key: 'simulationDistance', group: 'graphics', type: 'int', min: 5, max: 32 },
      { key: 'particles', group: 'graphics', type: 'choice', values: choice([0, 'All'], [1, 'Decreased'], [2, 'Minimal']) },
      { key: 'entityShadows', group: 'graphics', type: 'boolTF2' },
      { key: 'mipmapLevels', group: 'graphics', type: 'choice', values: choice([0, 'Off'], [1, '1'], [2, '2'], [3, '3'], [4, '4']) },
    ],
  },
}
// boolTF writes True/False (Unreal), boolTF2 true/false (Minecraft)
const BOOLS = { bool01: ['0', '1'], boolTF: ['False', 'True'], boolTF2: ['false', 'true'] }

const IDS = Object.keys(GAMES)
const get = id => (typeof id === 'string' && Object.prototype.hasOwnProperty.call(GAMES, id) ? GAMES[id] : null)
const setting = (g, key) => (g ? g.settings.find(s => s.key === key) || null : null)

/** -> { ok, value } | { ok:false, reason }. The value is normalised to the text written to the file. */
function validate(def, raw) {
  if (!def) return { ok: false, reason: 'unknown-key' }
  const v = String(raw == null ? '' : raw).trim()
  if (BOOLS[def.type]) return BOOLS[def.type].includes(v) ? { ok: true, value: v } : { ok: false, reason: 'bad-value' }
  if (def.type === 'choice') return def.values.some(x => x.value === v) ? { ok: true, value: v } : { ok: false, reason: 'bad-value' }
  if (def.type === 'int') {
    if (!/^\d{1,5}(\.0+)?$/.test(v)) return { ok: false, reason: 'bad-value' }
    const n = Number(v)
    return n >= def.min && n <= def.max ? { ok: true, value: def.float ? n.toFixed(6) : String(n) } : { ok: false, reason: 'out-of-range' }
  }
  return { ok: false, reason: 'bad-value' }
}

/** Is a value the same setting as the file's text? (Unreal writes 120.000000 for 120, bool spellings differ in case.) */
function same(def, a, b) {
  if (def.type === 'int') return Number(a) === Number(b)
  return String(a).toLowerCase() === String(b).toLowerCase()
}

module.exports = { GAMES, IDS, BOOLS, get, setting, validate, same }
