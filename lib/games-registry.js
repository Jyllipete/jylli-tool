'use strict'
// One registry of installed games from the launchers' own files: Steam (libraryfolders.vdf + appmanifest_*.acf) and Epic (*.item).
// Canonical ids: steam:<appid>, epic:<AppName>. `aliases` keeps the old preset id when a game matches a built-in preset by name, so
// existing per-game settings (gameProfile_<id>) keep working. Pure parsing here; file system access is injected.

/** Minimal Valve KeyValues parser: "key" "value" and "key" { ... } -> nested object. */
function parseVdf(text) {
  const tok = []
  const re = /"((?:\\.|[^"\\])*)"|([{}])/g
  let m
  while ((m = re.exec(String(text)))) tok.push(m[2] || m[1].replace(/\\(.)/g, '$1'))
  let i = 0
  function block() {
    const o = {}
    while (i < tok.length && tok[i] !== '}') {
      const k = tok[i++]
      if (tok[i] === '{') { i++; o[k] = block(); i++ } else o[k] = tok[i++]
    }
    return o
  }
  return block()
}

/** library folder paths from libraryfolders.vdf (old and new formats). */
function libraryPaths(vdfText) {
  const root = parseVdf(vdfText).libraryfolders || {}
  const out = []
  for (const [k, v] of Object.entries(root)) {
    if (!/^\d+$/.test(k)) continue
    if (typeof v === 'string') out.push(v)            // old format: "1" "D:\\SteamLibrary"
    else if (v && v.path) out.push(v.path)
  }
  return out
}

function parseAppManifest(text) {
  const s = parseVdf(text).AppState
  if (!s || !s.appid || !s.name) return null
  return { appid: String(s.appid), name: s.name, installdir: s.installdir || null }
}

function parseEpicItem(json) {
  let o; try { o = typeof json === 'string' ? JSON.parse(json) : json } catch { return null }
  if (!o || !o.AppName || !o.DisplayName) return null
  if (o.bIsApplication === false) return null
  return { id: String(o.AppName), name: o.DisplayName, install: o.InstallLocation || null, exe: o.LaunchExecutable || null }
}

// Steam also installs tools and runtimes as "apps"; they are not games
const NOT_GAMES = /redistributable|steamworks common|steam linux runtime|proton \d|steamvr|soundtrack|dedicated server|\bsdk\b/i
const normalize = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * io: { readFile(path)->string|null, listDir(path)->string[], join(...) , exists(path) }.
 * presets: { presetId: displayName }. Returns [{ id, source, name, install, aliases[] }] sorted by name.
 */
function scan({ steamRoot, epicDir, io, presets = {} }) {
  const games = []
  const byNorm = Object.fromEntries(Object.entries(presets).map(([id, name]) => [normalize(name), id]))
  const alias = name => { const id = byNorm[normalize(name)]; return id ? [id] : [] }
  if (steamRoot) {
    const libs = new Set([steamRoot])
    const lf = io.readFile(io.join(steamRoot, 'steamapps', 'libraryfolders.vdf'))
    if (lf) libraryPaths(lf).forEach(p => libs.add(p))
    for (const lib of libs) {
      const dir = io.join(lib, 'steamapps')
      for (const f of io.listDir(dir)) {
        if (!/^appmanifest_\d+\.acf$/.test(f)) continue
        const m = parseAppManifest(io.readFile(io.join(dir, f)) || '')
        if (!m || NOT_GAMES.test(m.name)) continue
        games.push({ id: 'steam:' + m.appid, source: 'steam', appid: m.appid, name: m.name, install: m.installdir ? io.join(dir, 'common', m.installdir) : null, aliases: alias(m.name), library: lib })
      }
    }
  }
  if (epicDir) {
    for (const f of io.listDir(epicDir)) {
      if (!f.endsWith('.item')) continue
      const e = parseEpicItem(io.readFile(io.join(epicDir, f)) || '')
      if (e) games.push({ id: 'epic:' + e.id, source: 'epic', name: e.name, install: e.install, exe: e.exe, aliases: alias(e.name) })
    }
  }
  const seen = new Set()
  return games.filter(g => (seen.has(g.id) ? false : seen.add(g.id))).sort((a, b) => a.name.localeCompare(b.name))
}

/** Candidate cover files in Steam's librarycache, best first (flat and per-appid layouts). */
function coverCandidates(steamRoot, appid, join) {
  const base = join(steamRoot, 'appcache', 'librarycache')
  return [
    join(base, `${appid}_library_600x900.jpg`), join(base, `${appid}_library_600x900_2x.jpg`), join(base, `${appid}_header.jpg`),
    join(base, String(appid), 'library_600x900.jpg'), join(base, String(appid), 'header.jpg'),
  ]
}

/** Resolve an id (new canonical, or an old preset alias) to a registry entry. */
function resolve(games, id) {
  return games.find(g => g.id === id) || games.find(g => g.aliases.includes(id)) || null
}

module.exports = { parseVdf, libraryPaths, parseAppManifest, parseEpicItem, scan, coverCandidates, resolve, normalize }
