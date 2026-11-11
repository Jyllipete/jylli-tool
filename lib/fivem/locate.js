'use strict'
// Where FiveM and GTA V are on this PC. IVPath in CitizenFX.ini is the documented source (docs/FIVEM_EVIDENCE.md); only when it
// is missing do we ask the Rockstar and Steam registry entries. No fixed drive letters. Every path is checked on disk, and a
// path that does not exist is "not found", never guessed.
const REG_SCRIPT = [
  "$ErrorActionPreference='SilentlyContinue'",
  "$o=[ordered]@{}",
  "$o.rockstar=(Get-ItemProperty 'HKLM:\\SOFTWARE\\WOW6432Node\\Rockstar Games\\Grand Theft Auto V').InstallFolder",
  "$s=(Get-ItemProperty 'HKLM:\\SOFTWARE\\WOW6432Node\\Valve\\Steam').InstallPath",
  "if($s){$m=Join-Path $s 'steamapps\\appmanifest_271590.acf'; if(Test-Path $m){$l=Get-Content $m|Where-Object{$_ -match '\"installdir\"'}|Select-Object -First 1; if($l -match '\"installdir\"\\s+\"([^\"]+)\"'){$o.steam=Join-Path (Join-Path $s 'steamapps\\common') $matches[1]}}}",
  "'JJLOC:'+($o|ConvertTo-Json -Compress)",
].join('\n')

function parseReg(out) {
  const m = String(out || '').match(/JJLOC:(\{.*\})/)
  if (!m) return {}
  try { const o = JSON.parse(m[1]); return { rockstar: typeof o.rockstar === 'string' ? o.rockstar : null, steam: typeof o.steam === 'string' ? o.steam : null } } catch { return {} }
}

/** deps: { fs, path, env, runPS, readIni(text)->{known} }. -> facts object (see the keys below). */
async function locate(deps) {
  const { fs, path, env } = deps
  const exists = p => { try { return !!p && fs.existsSync(p) } catch { return false } }
  const local = env.LOCALAPPDATA || '', roam = env.APPDATA || ''
  const appDir = path.join(local, 'FiveM', 'FiveM.app')
  const out = {
    installed: exists(appDir), appDir, dataDir: path.join(appDir, 'data'), logsDir: path.join(appDir, 'logs'),
    iniPath: path.join(appDir, 'CitizenFX.ini'), iniExists: false, iniText: null,
    settingsPath: path.join(roam, 'CitizenFX', 'gta5_settings.xml'), settingsExists: false,
    gtaPath: null, gtaSource: null, gtaOk: false, exes: [],
  }
  out.iniExists = exists(out.iniPath)
  out.settingsExists = exists(out.settingsPath)
  if (out.iniExists) { try { out.iniText = fs.readFileSync(out.iniPath, 'utf8') } catch { out.iniText = null } }

  const cands = []
  if (out.iniText && deps.readIni) { const iv = deps.readIni(out.iniText).known.find(k => k.key === 'IVPath'); if (iv && iv.value) cands.push(['ini', iv.value]) }
  if (!cands.some(c => exists(path.join(c[1], 'GTA5.exe'))) && deps.runPS) {
    let reg = {}
    try { const r = await deps.runPS(REG_SCRIPT, 8000); reg = parseReg(r && r.out) } catch { reg = {} }
    if (reg.rockstar) cands.push(['rockstar', reg.rockstar])
    if (reg.steam) cands.push(['steam', reg.steam])
  }
  for (const [src, p] of cands) if (exists(path.join(p, 'GTA5.exe'))) { out.gtaPath = p; out.gtaSource = src; out.gtaOk = true; break }
  if (!out.gtaPath && cands.length) { out.gtaPath = cands[0][1]; out.gtaSource = cands[0][0] }

  // The executables that are really in the FiveM folder (the game process name carries the build number).
  if (out.installed) {
    try { out.exes = fs.readdirSync(appDir).filter(f => /^FiveM(_b\d+_GTAProcess)?\.exe$/i.test(f)).map(f => path.join(appDir, f)) } catch { out.exes = [] }
  }
  return out
}

module.exports = { locate, parseReg, REG_SCRIPT }
