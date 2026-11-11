'use strict'
// Mod conflict scan. File names only (no reading of DLL contents: the old export-string search flagged every normal ASI
// loader). Patterns are anchored to the product's own file names so "enb" no longer matches half the alphabet. Wording
// lives in LANG mod_<id>; the scan states that a file is there, never that it will get anyone banned.
const PATTERNS = [
  { id: 'menyoo',        re: /menyoo/i, sev: 'high' },
  { id: 'trainer',       re: /(^|[^a-z])trainer([^a-z]|$)/i, sev: 'high' },
  { id: 'lambda',        re: /lambda ?menu|lambdamenu/i, sev: 'high' },
  { id: 'scripthookv',   re: /scripthookv/i, sev: 'high' },
  { id: 'lspdfr',        re: /lspdfr/i, sev: 'high' },
  { id: 'openiv',        re: /openiv/i, sev: 'medium' },
  { id: 'visualv',       re: /visualv/i, sev: 'medium' },
  { id: 'naturalvision', re: /naturalvision/i, sev: 'medium' },
  { id: 'enb',           re: /^enb(series|local|helper)?(\.|$)|enbseries/i, sev: 'medium' },
  { id: 'reshade',       re: /reshade/i, sev: 'low' },
]
const IDS = PATTERNS.map(p => p.id).concat(['dll-override'])
const MAX_ENTRIES = 2000

function match(file) {
  for (const p of PATTERNS) if (p.re.test(file)) return p
  return null
}

/** deps: { fs, path }; dirs: { plugins:[…], gta: path|null }. -> { found:[{ file, dir, id, sev }], scanned:[dir] } */
function scan(deps, dirs) {
  const { fs, path } = deps
  const found = [], scanned = [], seen = new Set()
  const walk = (dir, root) => {
    if (!dir) return
    let names
    try { names = fs.readdirSync(dir) } catch { return }
    scanned.push(dir)
    for (const file of names.slice(0, MAX_ENTRIES)) {
      const key = path.join(dir, file).toLowerCase()
      if (seen.has(key)) continue
      const p = match(file)
      if (p) { found.push({ file, dir, id: p.id, sev: p.sev }); seen.add(key); continue }
      // A graphics hook DLL next to GTA5.exe is only worth a mention in the GTA folder itself.
      if (root && /^(dxgi|d3d11|d3d9)\.dll$/i.test(file)) { found.push({ file, dir, id: 'dll-override', sev: 'low' }); seen.add(key) }
    }
  }
  for (const d of (dirs.plugins || [])) walk(d, false)
  if (dirs.gta) walk(dirs.gta, true)
  const rank = { high: 0, medium: 1, low: 2 }
  found.sort((a, b) => rank[a.sev] - rank[b.sev] || a.file.localeCompare(b.file))
  return { found, scanned }
}

module.exports = { PATTERNS, IDS, match, scan }
