'use strict'
// Which executables belong to a game. Per-game changes (priority, power throttling, windowed-game optimisations) need the real file, so this
// is the only place that decides it, and every answer says how sure it is:
//   picked   the user chose it            learned  Jylli saw it running out of the game's own folder
//   known    a curated name found on disk  guess    the biggest likely executable in the folder (shown, never applied silently)
const path = require('node:path')
const launch = require('../compete/launch')
const { NOT_A_GAME_RE } = require('../gamecandidate')

const MIN_GUESS_BYTES = 2 * 1024 * 1024
const SKIP_NAME = /unins|crash|report|setup|redist|dxsetup|dotnet|installer|helper|easyanticheat|battleye|beservice|cef|webview|updater|launcher_?helper|vgc|vgtray|eosoverlay/i
const SKIP_DIR = /^(_commonredist|redist|directx|__installer|support|crashpad|engine|thirdparty|content|paks|movies|videos|shadercache|shaders|logs|locales|localization|screenshots|\.)/i
const RANK = { picked: 0, learned: 1, known: 2, guess: 3 }
const SAFE = p => launch.validExePath(p) && !/['`$;&]/.test(p)

/** files: [{ path, size }] found under the install folder (bounded walk done by the caller). */
function locate(game, files, remembered) {
  const out = new Map()
  const put = (p, source) => { if (!SAFE(p)) return; const k = p.toLowerCase(); const cur = out.get(k); if (!cur || RANK[source] < RANK[cur.source]) out.set(k, { path: p, exe: path.win32.basename(p), source }) }
  for (const p of (remembered && remembered.picked) || []) put(p, 'picked')
  for (const p of (remembered && remembered.learned) || []) put(p, 'learned')
  if (game.custom) for (const p of game.exes.length && game.install ? [path.win32.join(game.install, game.exes[0])] : []) put(p, 'picked')
  const names = new Set((game.exes || []).map(e => e.toLowerCase()))
  for (const f of files || []) if (names.has(path.win32.basename(f.path).toLowerCase())) put(f.path, 'known')
  if (!out.size) {
    const best = (files || []).filter(f => f.size >= MIN_GUESS_BYTES && !SKIP_NAME.test(path.win32.basename(f.path)) && !NOT_A_GAME_RE.test(path.win32.basename(f.path)))
      .sort((a, b) => b.size - a.size)[0]
    if (best) put(best.path, 'guess')
  }
  return [...out.values()].sort((a, b) => RANK[a.source] - RANK[b.source])
}

/** The exe actually running out of this game's folder (or by its own name for custom games), for learning. lines: "@@exe|fullpath". */
function learn(game, lines, known) {
  return launch.matchProcess(lines, { install: game.install, customExe: game.custom ? game.exes[0] : null }, known || new Set())
}

/** Exes the user may change: picked, learned or known are trusted; a guess needs the user to confirm it first. */
const trusted = list => (list || []).filter(e => e.source !== 'guess')

module.exports = { locate, learn, trusted, SKIP_NAME, SKIP_DIR, MIN_GUESS_BYTES, SAFE }
