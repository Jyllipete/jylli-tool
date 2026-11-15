'use strict'
// Game Watcher targets: the only place that decides which running program counts as which game. Pure.
//   preset   a Pulse preset (id = preset id), the original detection list
//   curated  lib/games/known.js titles (more executables per game; the id is the Pulse preset id when the exe fits that preset)
//   custom   a game the user added (library, executable picked by the user)
//   library  a game found in a store folder whose executable is trusted (picked / learned / known, never a guess)
// A game only gets a Pulse preset when the RUNNING executable fits that preset, so GTA5.exe or Minecraft Bedrock never boost the wrong process.

const clean = s => String(s || '').trim().toLowerCase().replace(/\.exe$/, '')

/** "FiveM_GTAProcess" -> suffix, "ArmaReforger*" -> prefix, anything else -> exact (all lower case, no .exe). */
function matcherOf(exe) {
  const e = clean(exe)
  if (e.includes('_gtaprocess')) return { kind: 'suffix', key: '_gtaprocess' }
  if (e.endsWith('*')) return { kind: 'prefix', key: e.slice(0, -1) }
  return { kind: 'exact', key: e }
}

/** The running process name (lower case, no .exe) that fits the matcher, or null. */
function hit(names, m) {
  if (!m || !m.key) return null
  if (m.kind === 'exact') return names.has(m.key) ? m.key : null
  for (const n of names) if (m.kind === 'prefix' ? n.startsWith(m.key) : n.endsWith(m.key)) return n
  return null
}

/**
 * presets: { id: { name, exe } }   known: [{ id, name, exes[], pulse }]   library: [{ id, name, exes[], source: 'custom'|'library', pulse? }]
 * opts: { custom: true, library: false }  (library auto-found games are opt-in)
 */
function build({ presets = {}, known = [], library = [] } = {}, opts = {}) {
  const out = []
  for (const [id, p] of Object.entries(presets)) out.push({ id, name: p.name, matchers: [matcherOf(p.exe)], pulse: id, source: 'preset' })
  for (const k of known) out.push({ id: k.id, name: k.name, matchers: (k.exes || []).map(matcherOf), pulse: k.pulse || null, source: 'curated' })
  for (const g of library) {
    if (g.source === 'custom' ? opts.custom === false : !opts.library) continue
    out.push({ id: g.id, name: g.name, matchers: (g.exes || []).map(matcherOf), pulse: g.pulse || null, source: g.source === 'custom' ? 'custom' : 'library' })
  }
  return { list: out, presets }
}

/**
 * names: Set of running process names, lower case, no .exe.   current: id of the game already in a session (stays while it still runs).
 * -> { id, name, exe, pulse, source } or null
 */
function match(names, targets, current) {
  const found = []
  for (const t of targets.list) {
    let h = null
    for (const m of t.matchers) { h = hit(names, m); if (h) break }
    if (!h) continue
    let pulse = null
    if (t.source === 'preset') pulse = t.pulse
    else if (t.pulse && targets.presets[t.pulse] && hit(new Set([h]), matcherOf(targets.presets[t.pulse].exe))) pulse = t.pulse
    const id = pulse || t.id
    if (found.some(f => f.id === id)) continue
    found.push({ id, name: pulse && targets.presets[pulse] ? targets.presets[pulse].name : t.name, exe: h + '.exe', pulse, source: t.source })
  }
  if (!found.length) return null
  return (current && found.find(f => f.id === current)) || found[0]
}

/** What the watcher can recognise, for the "What is detected" list: one row per game. */
function describe(targets) {
  const seen = new Map()
  for (const t of targets.list) {
    const id = t.pulse && targets.presets[t.pulse] ? t.pulse : t.id
    if (seen.has(id)) continue
    seen.set(id, { id, name: t.pulse && targets.presets[t.pulse] ? targets.presets[t.pulse].name : t.name, pulse: !!(t.pulse && targets.presets[t.pulse]), source: t.source })
  }
  return [...seen.values()]
}

module.exports = { build, match, describe, matcherOf, hit, clean }
