'use strict'
// Spots games the built-in database does not know: a running process whose exe sits in a game-store library folder.
// The process listing (main.js) emits "@@exe|fullpath" lines for such processes; this module parses and filters them.

const LIBRARY_RE = /[\\/](steamapps[\\/]common|Epic Games|GOG Galaxy[\\/]Games|GOG Games|XboxGames|Riot Games|Ubisoft Game Launcher[\\/]games)[\\/]/i
const NOT_A_GAME_RE = /(crash|helper|launcher|setup|unins|redist|install|prereq|easyanticheat|battleye|eac_|vc_redist|dxsetup|webhelper|updater|reporter|bootstrap|service|server)/i

function parseCandidateLines(lines) {
  const out = []
  for (const line of lines) {
    if (!line.startsWith('@@')) continue
    const sep = line.indexOf('|')
    if (sep < 3) continue
    const exe = line.slice(2, sep).trim().toLowerCase()
    const full = line.slice(sep + 1).trim()
    if (!/^[\w .\-()]{1,100}\.exe$/.test(exe) || !LIBRARY_RE.test(full)) continue
    if (NOT_A_GAME_RE.test(exe)) continue
    out.push({ exe, name: displayName(exe, full) })
  }
  return out
}

// Prefer the install folder name (".../common/Hades/Hades.exe" -> "Hades"); fall back to the exe name.
function displayName(exe, full) {
  const m = full.match(/(?:steamapps[\\/]common|Epic Games|GOG Galaxy[\\/]Games|GOG Games|XboxGames|Riot Games|games)[\\/]([^\\/]+)[\\/]/i)
  return (m ? m[1] : exe.replace(/\.exe$/i, '')).slice(0, 60)
}

// Returns the first candidate that is not known, ignored or already offered this session; null when none qualifies.
function pickCandidate(candidates, { known = new Set(), blacklist = [], offered = new Set() } = {}) {
  const ignored = new Set(blacklist.map(e => String(e).toLowerCase()))
  for (const c of candidates) {
    if (known.has(c.exe) || ignored.has(c.exe) || offered.has(c.exe)) continue
    return c
  }
  return null
}

module.exports = { parseCandidateLines, pickCandidate }
