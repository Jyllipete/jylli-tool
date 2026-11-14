# Game settings editor: evidence (lib/gameconfig)

Status: **written from knowledge of each game's config format, not yet run against a real install.** A key that a game version does not have simply does not show (rows only appear for keys that exist in the file, and a patch never adds a key), so a wrong name is harmless but a missing row is possible.

## Safety rules (all enforced in `lib/gameconfig/index.js`, tested in `test/gameconfig.test.js`)
- Never writes while the game runs (games rewrite the file on exit).
- Backup first (`userData/gamecfg-backups`, newest 40 kept), temp file + rename, read back and compare, restore the backup if it does not match.
- Journal kind `game-config-file`, control `gamecfg:<id>`: Undo restores the backed-up bytes; drift is detected by content hash.
- Only the value text of an existing line changes: key spelling, spacing, comments, line endings and BOM survive.
- Values are validated against the catalog (type, allowed choices, range). Launch builds its own URL from the catalog.

## Games
| Game | File | Format | Launch |
|---|---|---|---|
| CS2 | `<Steam>\userdata\<id>\730\local\cfg\cs2_video.txt` (newest account) | kv | `steam://rungameid/730` |
| Apex Legends | `%USERPROFILE%\Saved Games\Respawn\Apex\local\videoconfig.txt` | kv | `steam://rungameid/1172470` |
| Fortnite | `%LOCALAPPDATA%\FortniteGame\Saved\Config\WindowsClient\GameUserSettings.ini` | ini | Epic URL |
| Minecraft Java | `%APPDATA%\.minecraft\options.txt` | options | none |

Not included: **Valorant** (Riot syncs settings from the cloud and overwrites local edits), **Overwatch 2** and **Rocket League** (key names not confident enough for v1).

## Recommendations
Only two, both well understood: **V-Sync off** (adds a frame of delay, caps the frame rate) and **Fortnite motion blur off**. Nothing else is recommended; quality levels are left to the player.

## Known limits
- Choice labels such as Low/Medium/High/Epic are the games' own words and are not translated.
- Fortnite's Epic launch URL and the exact CS2/Apex key names need a check on a real install.
