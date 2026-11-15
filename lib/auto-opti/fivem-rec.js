'use strict'
// Recommended FiveM (gta5_settings.xml) graphics values for a given amount of video memory. Moved out of the old wizard so the run
// can apply them without the renderer. Only keys the settings writer knows (FIVEM_SETTINGS_DEFS in main.js) are ever written.

function recommend(vramMB) {
  const vram = Number(vramMB) || 0
  // TextureQuality: 0 Normal, 1 High, 2 Very High (Rockstar's 3 steps). ReflectionQuality: 0 Normal .. 3 Ultra.
  const textureQ = vram >= 6144 ? '2' : vram >= 3072 ? '1' : '0'
  const reflectionQ = vram >= 8192 ? '2' : vram >= 6144 ? '1' : '0'
  const shadowQ = vram >= 8192 ? '2' : '1'
  return {
    LodScale: '1.000000', PedLodBias: '0.000000', VehicleLodBias: '0.000000',
    ShadowQuality: shadowQ, ReflectionQuality: reflectionQ, ReflectionMSAA: '0',
    MSAA: '0', FXAA_Enabled: 'false', TXAA_Enabled: 'false',
    ParticleQuality: '1', WaterQuality: '0', GrassQuality: '0',
    ShaderQuality: '2', Shadow_Distance: '0.500000', Shadow_SoftShadows: '0',
    UltraShadows_Enabled: 'false', Shadow_ParticleShadows: 'false',
    Shadow_LongShadows: 'false', CityDensity: '0.000000', VehicleVarietyMultiplier: '0.000000',
    PedVarietyMultiplier: '0.000000', PostFX: '1', DoF: 'false',
    MotionBlurStrength: '0.000000', Tessellation: '0', AnisotropicFiltering: '16',
    TextureQuality: textureQ,
    SSAO: '0', Lighting_FogVolumes: 'false', HdStreamingInFlight: 'false',
  }
}

const G = require('../fivem/graphics')

/** Does `want` cost less than `cur` in the game's own step order (DEFS options run cheap -> expensive)? Unknown key or value -> false, so it is never written. */
function isLower(key, cur, want) {
  const d = G.BY_KEY[key]
  if (!d) return false
  const idx = v => d.opts.findIndex(o => o[0] === G.canonValue(key, String(v)))
  const a = idx(cur), b = idx(want)
  return a >= 0 && b >= 0 && b < a
}

module.exports = { recommend, isLower }
