'use strict'
// WCAG contrast guard for the design tokens: every text colour must clear AA on the surfaces it is used on, in both schemes.
// Reads css/tokens.css (dark = :root, light = :root[data-scheme="light"]); handles #hex and rgba() (composited over the surface).
const fs = require('fs')
const path = require('path')
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'tokens.css'), 'utf8')

function block(selector) {
  const out = {}
  const re = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'g')
  let m
  while ((m = re.exec(css))) for (const d of m[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim()
  return out
}
const dark = block(':root')
const light = { ...dark, ...block(':root[data-scheme="light"]') }

function parse(v, vars, over) {
  v = String(v).trim()
  const ref = v.match(/^var\((--[\w-]+)\)$/)
  if (ref) return parse(vars[ref[1]], vars, over)
  let m = v.match(/^#([0-9a-f]{6})$/i)
  if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)).concat(1)
  m = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)$/)
  if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]]
  throw new Error('cannot parse colour: ' + v)
}
const over = (fg, bg) => [0, 1, 2].map(i => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1)
const lum = c => { const f = x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]) }
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

// [text token, min ratio, surfaces it appears on]
const SURFACES = ['--surface-0', '--surface-1', '--surface-2', '--surface-3']
const TEXT = [
  ['--c-text-primary', 4.5, SURFACES],
  ['--c-text-secondary', 4.5, SURFACES],
  ['--c-text-tertiary', 4.5, SURFACES],
  ['--c-accent-fg', 4.5, SURFACES],
  ['--c-success', 4.5, ['--surface-0', '--surface-1']],
  ['--c-warning', 4.5, ['--surface-0', '--surface-1']],
  ['--c-danger', 4.5, ['--surface-0', '--surface-1']],
  ['--c-info', 4.5, ['--surface-0', '--surface-1']],
  // 3D stage overlays (inspector, hints, assembly bar) sit on the always-dark stage in both schemes
  ['--twin-text', 4.5, ['--twin-bg-a', '--twin-bg-b']],
  ['--twin-text-dim', 4.5, ['--twin-bg-a', '--twin-bg-b']],
]

// accent presets: --on-accent text on the accent fill, and --c-accent-fg as text (accent is mixed toward white/black; approximate with the mix)
const ACCENTS = { jylli: '#8B7CF6', midnight: '#3B82F6', forest: '#22C55E', violet: '#9B59FF', slate: '#06B6D4', amber: '#F59E0B', rose: '#FB7185', neon: '#22D3EE' }
const mix = (hex, toward, pct) => { const a = parse(hex, {}), b = toward === 'white' ? [255, 255, 255] : [0, 0, 0]; return [0, 1, 2].map(i => a[i] * pct + b[i] * (1 - pct)).concat(1) }

let fail = 0
for (const [name, vars, scheme] of [['dark', dark, 'dark'], ['light', light, 'light']]) {
  const accentToward = scheme === 'dark' ? ['white', 0.78] : ['black', 0.72]
  for (const [tok, min, surfs] of TEXT) {
    for (const s of surfs) {
      const bg = parse(vars[s], vars)
      let fg
      if (tok === '--c-accent-fg') fg = mix(vars['--c-accent'], accentToward[0], accentToward[1])
      else fg = over(parse(vars[tok], vars), bg)
      const r = ratio(fg, bg)
      if (r < min) { fail++; console.log(`✗ ${name}: ${tok} on ${s} = ${r.toFixed(2)} (< ${min})`) }
    }
  }
  const onAccent = parse(vars['--on-accent'], vars)
  for (const [k, hex] of Object.entries(ACCENTS)) {
    const r = ratio(onAccent, parse(hex, vars))
    if (r < 4.5) { fail++; console.log(`✗ ${name}: --on-accent on accent '${k}' ${hex} = ${r.toFixed(2)}`) }
    const fgOn = ratio(mix(hex, accentToward[0], accentToward[1]), parse(vars['--surface-1'], vars))
    if (fgOn < 3) { fail++; console.log(`✗ ${name}: accent-fg for '${k}' on surface-1 = ${fgOn.toFixed(2)} (< 3)`) }
  }
}
if (fail) { console.error(`\ncontrast: ${fail} failing pair(s)`); process.exit(1) }
console.log('✔ contrast ok (dark + light)')
