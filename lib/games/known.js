'use strict'
// The ONLY list of curated titles the Games tab knows by name. A title found in a launcher's own files (Steam, Epic, Xbox) is matched to
// one of these by name; the match carries the real game executables, the Pulse preset id the watcher uses, and the tip. Everything else
// in the library is still shown, tuned through the executable Jylli sees running (learned) or one the user picks.
//   id        stable key (kept from the old GAME_LIST so saved settings `gameProfile_<id>` / `tweak_game-<id>` keep meaning)
//   names     normalised-name matches against registry names (see ids.norm)
//   exes      GAME executables only: never a launcher, never an anti-cheat service (vgc, BattlEye, EAC), never javaw
//   hints     folder names to look for under the usual install bases when the game is not in a launcher manifest (Riot, Battle.net, Rockstar)
//   pulse     preset id in main.js PULSE_PRESETS (differs from `id` for cs2, arma-reforger, r6siege, overwatch2)
//   gamecfg   id in lib/gameconfig/catalog.js, when the settings sheet supports it
const KNOWN = [
  { id: 'fortnite', name: 'Fortnite', dev: 'Epic Games', icon: 'Fortnite.ico', names: ['fortnite'], exes: ['FortniteClient-Win64-Shipping.exe'], hints: ['Fortnite', 'FortniteGame'], pulse: 'fortnite', gamecfg: 'fortnite' },
  { id: 'gtav', name: 'GTA V', dev: 'Rockstar Games', icon: 'GTA5.ico', names: ['grand theft auto v', 'gta v', 'gtav'], exes: ['GTA5.exe'], hints: ['Grand Theft Auto V', 'GTAV'], pulse: 'fivem' },
  { id: 'valorant', name: 'Valorant', dev: 'Riot Games', icon: 'Valorant.ico', names: ['valorant'], exes: ['VALORANT-Win64-Shipping.exe'], hints: ['Riot Games\\VALORANT', 'VALORANT'], pulse: 'valorant' },
  { id: 'arma-reforger', name: 'Arma Reforger', dev: 'Bohemia Interactive', icon: 'Arma Reforger.ico', names: ['arma reforger'], exes: ['ArmaReforgerSteam.exe', 'ArmaReforger.exe'], hints: ['Arma Reforger'], pulse: 'arma' },
  { id: 'minecraft', name: 'Minecraft', dev: 'Mojang', icon: 'Minecraft.ico', names: ['minecraft', 'minecraft launcher', 'minecraft for windows', 'minecraft bedrock edition'], exes: ['Minecraft.Windows.exe'], hints: ['Minecraft Launcher'], pulse: 'minecraft', gamecfg: 'minecraft' },
  { id: 'cs2', name: 'Counter-Strike 2', dev: 'Valve', icon: 'Counter Strike 2.ico', names: ['counter strike 2', 'counter strike global offensive'], exes: ['cs2.exe'], hints: ['Counter-Strike Global Offensive'], pulse: 'csgo', gamecfg: 'cs2' },
  { id: 'apex', name: 'Apex Legends', dev: 'Respawn Entertainment', icon: 'Apex Legends.ico', names: ['apex legends'], exes: ['r5apex_dx12.exe', 'r5apex.exe'], hints: ['Apex Legends'], pulse: 'apex', gamecfg: 'apex' },
  { id: 'warzone', name: 'Warzone', dev: 'Activision', icon: 'Warzone.ico', names: ['call of duty', 'call of duty warzone', 'warzone'], exes: ['cod.exe'], hints: ['Call of Duty', 'Warzone'], pulse: 'warzone' },
  { id: 'rust', name: 'Rust', dev: 'Facepunch Studios', icon: 'Rust.ico', names: ['rust'], exes: ['RustClient.exe'], hints: [], pulse: 'rust' },
  { id: 'the-finals', name: 'THE FINALS', dev: 'Embark Studios', icon: 'The Finals.ico', names: ['the finals'], exes: ['Discovery.exe', 'FINALS-Win64-Shipping.exe'], hints: ['THE FINALS'] },
  { id: 'r6siege', name: 'Rainbow Six Siege', dev: 'Ubisoft', icon: 'R6.ico', names: ['tom clancy s rainbow six siege', 'rainbow six siege', 'tom clancys rainbow six siege'], exes: ['RainbowSix.exe', 'RainbowSix_Vulkan.exe'], hints: ["Tom Clancy's Rainbow Six Siege"], pulse: 'r6' },
  { id: 'overwatch2', name: 'Overwatch 2', dev: 'Blizzard', icon: 'Overwatch.ico', names: ['overwatch 2', 'overwatch'], exes: ['Overwatch.exe'], hints: ['Overwatch'], pulse: 'overwatch' },
  { id: 'tarkov', name: 'Escape from Tarkov', dev: 'Battlestate Games', icon: 'Tarkov.ico', names: ['escape from tarkov'], exes: ['EscapeFromTarkov.exe'], hints: ['Escape from Tarkov'], pulse: 'tarkov' },
  { id: 'squad', name: 'Squad', dev: 'Offworld Industries', icon: 'Squad.ico', names: ['squad'], exes: ['Squad.exe'], hints: [] },
  { id: 'dayz', name: 'DayZ', dev: 'Bohemia Interactive', icon: 'DayZ.ico', names: ['dayz'], exes: ['DayZ_x64.exe'], hints: [] },
  { id: 'cyberpunk', name: 'Cyberpunk 2077', dev: 'CD Projekt Red', icon: 'Cyberpunk.ico', names: ['cyberpunk 2077'], exes: ['Cyberpunk2077.exe'], hints: [] },
  { id: 'rdr2', name: 'Red Dead Redemption 2', dev: 'Rockstar Games', icon: 'Red Dead Redemption 2.ico', names: ['red dead redemption 2'], exes: ['RDR2.exe'], hints: [] },
  { id: 'pubg', name: 'PUBG', dev: 'Krafton', icon: 'Pubg.ico', names: ['pubg battlegrounds', 'pubg'], exes: ['TslGame.exe'], hints: ['PUBG'] },
  { id: 'rocketleague', name: 'Rocket League', dev: 'Psyonix', icon: null, names: ['rocket league'], exes: ['RocketLeague.exe'], hints: ['rocketleague'], pulse: 'rocketleague' },
]

const BY_ID = Object.fromEntries(KNOWN.map(k => [k.id, k]))
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const BY_NAME = new Map()
for (const k of KNOWN) { BY_NAME.set(norm(k.name), k); for (const n of k.names) BY_NAME.set(norm(n), k) }

/** Curated title for a registry name ("Counter-Strike 2" -> cs2), or null. Exact normalised match only: "Rust Hour" is not Rust. */
function matchName(name) { return BY_NAME.get(norm(name)) || null }

/** Every id that means the same game: library id, curated id, Pulse preset. Sessions and saved settings use any of them. */
function aliasesOf(knownId) {
  const k = BY_ID[knownId]
  return k ? [k.id, k.pulse].filter(Boolean) : [knownId]
}

/** Curated id for any alias (curated id, Pulse preset id), or null. */
function knownIdOf(alias) {
  if (BY_ID[alias]) return alias
  const k = KNOWN.find(x => x.pulse === alias)
  return k ? k.id : null
}

module.exports = { KNOWN, BY_ID, norm, matchName, aliasesOf, knownIdOf }
