'use strict'
// gta5_settings.xml graphics keys. Community-graded (docs/FIVEM_EVIDENCE.md): there is no official key list, so the editor
// only ever touches keys that already exist in the user's own file, validates the value against the type below, and writes
// the value text only (the rest of the file is byte-for-byte what it was). Option sets are the in-game menu steps.
;(function (root) {
  const OFF_ON = [['false', 'off'], ['true', 'on']]
  const Q4 = [['0', 'low'], ['1', 'normal'], ['2', 'high'], ['3', 'veryHigh']]
  const Q5 = [['0', 'low'], ['1', 'normal'], ['2', 'high'], ['3', 'veryHigh'], ['4', 'ultra']]
  const MS = [['0', 'off'], ['2', 'x2'], ['4', 'x4'], ['8', 'x8']]
  const F = (...a) => a.map(v => [v.toFixed(6), v.toFixed(2).replace(/0$/, '')])

  // group: lighting | textures | world | effects | aa. impact: how much it costs when raised (community-reported).
  // perf = value for the "performance" preset, bal = "balanced"; quality keeps the user's own value for keys not listed.
  const DEFS = [
    { key: 'TextureQuality',        group: 'textures', impact: 3, type: 'select', opts: Q4, perf: '1', bal: '2', vram: true },
    { key: 'ShaderQuality',         group: 'textures', impact: 3, type: 'select', opts: Q5, perf: '1', bal: '2' },
    { key: 'AnisotropicFiltering',  group: 'textures', impact: 1, type: 'select', opts: [['0', 'off'], ['2', 'x2'], ['4', 'x4'], ['8', 'x8'], ['16', 'x16']], perf: '4', bal: '16' },
    { key: 'ShadowQuality',         group: 'lighting', impact: 4, type: 'select', opts: Q5, perf: '1', bal: '1' },
    { key: 'Shadow_Distance',       group: 'lighting', impact: 3, type: 'select', opts: F(0.25, 0.5, 0.75, 1), perf: '0.250000', bal: '0.500000' },
    { key: 'Shadow_SoftShadows',    group: 'lighting', impact: 2, type: 'select', opts: [['0', 'sharp'], ['1', 'softer'], ['2', 'softest'], ['3', 'chs']], perf: '0', bal: '1' },
    { key: 'UltraShadows_Enabled',  group: 'lighting', impact: 3, type: 'select', opts: OFF_ON, perf: 'false', bal: 'false' },
    { key: 'Shadow_ParticleShadows', group: 'lighting', impact: 2, type: 'select', opts: OFF_ON, perf: 'false', bal: 'false' },
    { key: 'Shadow_LongShadows',    group: 'lighting', impact: 1, type: 'select', opts: OFF_ON, perf: 'false', bal: 'false' },
    { key: 'ReflectionQuality',     group: 'lighting', impact: 2, type: 'select', opts: Q5, perf: '0', bal: '1' },
    { key: 'Lighting_FogVolumes',   group: 'lighting', impact: 2, type: 'select', opts: OFF_ON, perf: 'false', bal: 'false' },
    { key: 'SSAO',                  group: 'lighting', impact: 2, type: 'select', opts: [['0', 'off'], ['1', 'normal'], ['2', 'high']], perf: '0', bal: '1' },
    { key: 'LodScale',              group: 'world',    impact: 3, type: 'select', opts: F(0.5, 1, 1.5, 2), perf: '0.500000', bal: '1.000000' },
    { key: 'PedLodBias',            group: 'world',    impact: 2, type: 'select', opts: F(0, 0.2, 0.5, 1), perf: '0.000000', bal: '0.200000' },
    { key: 'VehicleLodBias',        group: 'world',    impact: 2, type: 'select', opts: F(0, 0.2, 0.5, 1), perf: '0.000000', bal: '0.200000' },
    { key: 'GrassQuality',          group: 'world',    impact: 4, type: 'select', opts: Q4, perf: '0', bal: '1' },
    { key: 'CityDensity',           group: 'world',    impact: 3, type: 'select', opts: F(0, 0.5, 1, 1.5), perf: '0.500000', bal: '1.000000' },
    { key: 'PedVarietyMultiplier',  group: 'world',    impact: 2, type: 'select', opts: F(0, 0.5, 1), perf: '0.500000', bal: '1.000000' },
    { key: 'VehicleVarietyMultiplier', group: 'world', impact: 2, type: 'select', opts: F(0, 0.5, 1, 1.5), perf: '0.500000', bal: '1.000000' },
    { key: 'HdStreamingInFlight',   group: 'world',    impact: 3, type: 'select', opts: OFF_ON, perf: 'false', bal: 'false' },
    { key: 'ParticleQuality',       group: 'effects',  impact: 2, type: 'select', opts: Q5, perf: '1', bal: '1' },
    { key: 'WaterQuality',          group: 'effects',  impact: 2, type: 'select', opts: Q5, perf: '0', bal: '1' },
    { key: 'PostFX',                group: 'effects',  impact: 2, type: 'select', opts: Q5, perf: '1', bal: '2' },
    { key: 'DoF',                   group: 'effects',  impact: 2, type: 'select', opts: OFF_ON, perf: 'false', bal: 'false' },
    { key: 'MotionBlurStrength',    group: 'effects',  impact: 1, type: 'select', opts: F(0, 0.5, 1), perf: '0.000000', bal: '0.000000' },
    { key: 'Tessellation',          group: 'effects',  impact: 2, type: 'select', opts: [['0', 'off'], ['1', 'normal'], ['2', 'high'], ['3', 'veryHigh']], perf: '0', bal: '0' },
    { key: 'MSAA',                  group: 'aa',       impact: 4, type: 'select', opts: MS, perf: '0', bal: '0' },
    { key: 'ReflectionMSAA',        group: 'aa',       impact: 3, type: 'select', opts: MS, perf: '0', bal: '0' },
    { key: 'FXAA_Enabled',          group: 'aa',       impact: 1, type: 'select', opts: OFF_ON, perf: 'true', bal: 'true' },
    { key: 'TXAA_Enabled',          group: 'aa',       impact: 2, type: 'select', opts: OFF_ON, perf: 'false', bal: 'false' },
  ]
  const GROUPS = ['textures', 'lighting', 'world', 'effects', 'aa']
  const BY_KEY = Object.fromEntries(DEFS.map(d => [d.key, d]))
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k)
  const num = v => (/^-?\d+(\.\d+)?$/.test(v) ? Number(v) : null)
  const same = (a, b) => (num(a) != null && num(b) != null ? Math.abs(num(a) - num(b)) < 1e-6 : String(a).toLowerCase() === String(b).toLowerCase())

  const esc = k => k.replace(/[^\w]/g, '')
  const keyRe = k => new RegExp('(<' + esc(k) + '(?=[\\s/>])[^>]*?\\bvalue\\s*=\\s*")([^"]*)(")', 'i')

  /** Is this a value the def accepts? Floats compare numerically so "1.0" matches "1.000000". */
  function validValue(key, value) {
    const d = BY_KEY[key]
    if (!d || typeof value !== 'string') return false
    return d.opts.some(o => same(o[0], value))
  }
  /** The text to write: the option's own spelling. */
  function canonValue(key, value) { const d = BY_KEY[key]; const o = d && d.opts.find(x => same(x[0], value)); return o ? o[0] : null }

  /** -> { structure: bool, values: { Key: string|null } }. null = the key is not in this file (never invented). */
  function read(xml) {
    const text = String(xml || '')
    const structure = /<graphics[\s>]/i.test(text) && /<\/graphics>/i.test(text)
    const values = {}
    for (const d of DEFS) { const m = text.match(keyRe(d.key)); values[d.key] = m ? m[2] : null }
    return { structure, values }
  }

  /** Writes values for keys that already exist. -> { text, changed: [key], skipped: [{key, reason}] } */
  function patch(xml, changes) {
    let text = String(xml || '')
    const changed = [], skipped = []
    for (const [key, val] of Object.entries(changes || {})) {
      if (!has(BY_KEY, key)) { skipped.push({ key, reason: 'unknown-key' }); continue }
      const v = canonValue(key, String(val))
      if (v == null) { skipped.push({ key, reason: 'bad-value' }); continue }
      const re = keyRe(key)
      const m = text.match(re)
      if (!m) { skipped.push({ key, reason: 'not-in-file' }); continue }
      if (m[2] === v) continue
      text = text.replace(re, (_, a, _old, c) => a + v + c)
      changed.push(key)
    }
    return { text, changed, skipped }
  }

  /** Preset values limited to keys the file really has. name: 'performance' | 'balanced' | 'quality' (quality only raises what is below balanced). */
  function preset(name, current, vramMB) {
    const out = {}
    for (const d of DEFS) {
      if (current[d.key] == null) continue
      let v = null
      if (name === 'performance') v = d.perf
      else if (name === 'balanced') v = d.bal
      else if (name === 'quality') v = d.vram ? d.opts[Math.min(d.opts.length - 1, vramTier(vramMB) + 1)][0] : d.bal
      if (v != null && !same(v, current[d.key])) out[d.key] = canonValue(d.key, v)
    }
    return out
  }

  /** 0 low, 1 normal, 2 high, 3 very high, by video memory. Unknown VRAM -> 1, never a silent "low-end". */
  function vramTier(vramMB) {
    const v = Number(vramMB)
    if (!(v > 0)) return 1
    return v >= 8192 ? 3 : v >= 6144 ? 3 : v >= 4096 ? 2 : v >= 2048 ? 1 : 0
  }
  /** Texture quality this much video memory can hold. null when VRAM is unknown. */
  function textureLimit(vramMB) { return Number(vramMB) > 0 ? vramTier(vramMB) : null }

  /** Share of the file's settings that sit above the balanced preset, weighted by impact: 0..100. Relative, not FPS. */
  function load(current) {
    let have = 0, over = 0
    for (const d of DEFS) {
      const cur = current[d.key]
      if (cur == null) continue
      const idx = d.opts.findIndex(o => same(o[0], cur)), ref = d.opts.findIndex(o => same(o[0], d.bal))
      if (idx < 0) continue
      have += d.impact
      if (idx > ref) over += d.impact * Math.min(2, idx - ref) / 2
    }
    return have ? Math.round((over / have) * 100) : null
  }

  const api = { DEFS, GROUPS, BY_KEY, validValue, canonValue, read, patch, preset, vramTier, textureLimit, load }
  root.JylliFivemGraphics = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
