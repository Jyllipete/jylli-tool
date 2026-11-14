'use strict'
// How to start a game from its registry id, and how to recognise its process. Pure; ids are validated before any string is built.
const path = require('node:path')
const { NOT_A_GAME_RE } = require('../gamecandidate')

const RE = { steam: /^steam:(\d{1,10})$/, epic: /^epic:([A-Za-z0-9_.\-]{1,80})$/, xbox: /^xbox:[A-Za-z0-9_.\-]{1,80}$/ }
const validExePath = p => typeof p === 'string' && p.length < 260 && /^[A-Za-z]:\\/.test(p) && /\.exe$/i.test(p) && !/[<>"|?*]/.test(p)

/** game: registry entry { id, aumid? } or { id:'custom:<path>' }. -> { kind:'url'|'exe', url|exe, cwd? } | null */
function launchFor(game) {
  const id = game && String(game.id || '')
  let m
  if ((m = RE.steam.exec(id))) return { kind: 'url', url: `steam://rungameid/${m[1]}` }
  if ((m = RE.epic.exec(id))) return { kind: 'url', url: `com.epicgames.launcher://apps/${m[1]}?action=launch&silent=true` }
  if (RE.xbox.test(id) && game.aumid && /^[A-Za-z0-9_.\-]+![A-Za-z0-9_.\-]+$/.test(game.aumid)) return { kind: 'shell', target: `shell:AppsFolder\\${game.aumid}` }
  if (id.startsWith('custom:')) { const p = id.slice(7); if (validExePath(p)) return { kind: 'exe', exe: p, cwd: path.win32.dirname(p) } }
  return null
}

/** The game id from a command line: `--compete <id>` or `--compete=<id>`. Only ids launchFor() can accept (no aumid needed to be well formed here). */
function idFromArgv(argv) {
  const a = Array.isArray(argv) ? argv.map(String) : []
  let id = null
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--compete') { id = a[i + 1] || null; break }
    if (a[i].startsWith('--compete=')) { id = a[i].slice(10); break }
  }
  if (!id) return null
  if (RE.steam.test(id) || RE.epic.test(id) || RE.xbox.test(id)) return id
  if (id.startsWith('custom:') && validExePath(id.slice(7))) return id
  return null
}

/** A file name for the desktop shortcut: the game's name without characters Windows refuses. */
const shortcutName = name => ('Competitive - ' + String(name || 'game').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 80).trim() + '.lnk'

const norm = p => String(p || '').replace(/\//g, '\\').toLowerCase().replace(/\\+$/, '')

/**
 * lines: "@@exe|fullpath" from the process listing. game: { install?, customExe? }. known: Set of exe names already running before launch.
 * -> first matching { exe, path } or null. Custom games match their own exe name; library games match any non-helper exe under install.
 */
function matchProcess(lines, game, known) {
  known = known || new Set()
  const inst = game && game.install ? norm(game.install) + '\\' : null
  const want = game && game.customExe ? path.win32.basename(game.customExe).toLowerCase() : null
  for (const line of lines || []) {
    if (!String(line).startsWith('@@')) continue
    const sep = line.indexOf('|'); if (sep < 3) continue
    const exe = line.slice(2, sep).trim().toLowerCase(), full = line.slice(sep + 1).trim()
    if (!/^[\w .\-()]{1,100}\.exe$/.test(exe) || known.has(exe)) continue
    if (want) { if (exe === want) return { exe, path: full }; continue }
    if (inst && norm(full).startsWith(inst) && !NOT_A_GAME_RE.test(exe)) return { exe, path: full }
  }
  return null
}

module.exports = { launchFor, matchProcess, validExePath, idFromArgv, shortcutName }
