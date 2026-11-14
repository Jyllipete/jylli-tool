'use strict'
// Apps tab "Backstage": the ONLY list of programs the tab knows by name. Pure and UMD (the page loads it too).
// A program that is not here is shown by its executable name and nothing else (never guessed at).
//   id        stable id (state, LANG keys n_<id> / d_<id>)
//   cat       group chip: browsers | comms | media | launchers | streaming | sync | gear | tools
//   role      decides what Game time may do (lib/apps/rules.js): browser voice music launcher capture peripheral sync chat dev gpu-tool desktop
//   stems     process names, lower case, no .exe; every one counts towards the app's cost
//   lower     OPTIONAL: only these stems may be lowered in Game time (a launcher's own process is never lowered: a game it starts inherits
//             its priority, Microsoft CreateProcess docs). Missing = every stem.
//   install   folders / files that prove it is installed; %VAR% is expanded by the probe
//   startup   lower-case pieces of a Run-key command that mean "this app starts with Windows"
;(function (root) {
  const LA = '%LOCALAPPDATA%\\', AD = '%APPDATA%\\', PF = '%ProgramFiles%\\', PF86 = '%ProgramFiles(x86)%\\', PD = '%ProgramData%\\'
  const APPS = [
    { id: 'edge', cat: 'browsers', role: 'browser', vendor: 'Microsoft', stems: ['msedge'], install: [PF86 + 'Microsoft\\Edge\\Application\\msedge.exe', PF + 'Microsoft\\Edge\\Application\\msedge.exe'], startup: ['msedge', 'microsoftedge'] },
    { id: 'chrome', cat: 'browsers', role: 'browser', vendor: 'Google', stems: ['chrome'], install: [PF + 'Google\\Chrome\\Application\\chrome.exe', PF86 + 'Google\\Chrome\\Application\\chrome.exe', LA + 'Google\\Chrome\\Application\\chrome.exe'], startup: ['chrome.exe', 'googlechrome'] },
    { id: 'brave', cat: 'browsers', role: 'browser', vendor: 'Brave', stems: ['brave'], install: [PF + 'BraveSoftware\\Brave-Browser\\Application\\brave.exe', PF86 + 'BraveSoftware\\Brave-Browser\\Application\\brave.exe', LA + 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'], startup: ['brave'] },
    { id: 'opera', cat: 'browsers', role: 'browser', vendor: 'Opera', stems: ['opera', 'opera_gx'], install: [AD + 'Opera Software\\Opera GX Stable\\launcher.exe', LA + 'Programs\\Opera GX\\opera.exe', LA + 'Programs\\Opera\\opera.exe'], startup: ['opera'] },
    { id: 'firefox', cat: 'browsers', role: 'browser', vendor: 'Mozilla', stems: ['firefox'], install: [PF + 'Mozilla Firefox\\firefox.exe', PF86 + 'Mozilla Firefox\\firefox.exe'], startup: ['firefox'] },

    { id: 'discord', cat: 'comms', role: 'voice', vendor: 'Discord', stems: ['discord', 'discordptb', 'discordcanary'], install: [LA + 'Discord', LA + 'DiscordPTB', LA + 'DiscordCanary'], startup: ['discord'] },
    { id: 'teams', cat: 'comms', role: 'voice', vendor: 'Microsoft', stems: ['ms-teams', 'teams', 'msteams'], install: [LA + 'Microsoft\\Teams', LA + 'Microsoft\\WindowsApps\\ms-teams.exe'], startup: ['teams'] },
    { id: 'zoom', cat: 'comms', role: 'voice', vendor: 'Zoom', stems: ['zoom'], install: [AD + 'Zoom\\bin\\Zoom.exe', PF + 'Zoom\\bin\\Zoom.exe'], startup: ['zoom'] },
    { id: 'slack', cat: 'comms', role: 'chat', vendor: 'Slack', stems: ['slack'], install: [LA + 'slack\\slack.exe', PF + 'Slack\\slack.exe'], startup: ['slack'] },
    { id: 'whatsapp', cat: 'comms', role: 'chat', vendor: 'WhatsApp', stems: ['whatsapp', 'whatsapp.root'], install: [LA + 'WhatsApp\\WhatsApp.exe'], startup: ['whatsapp'] },

    { id: 'spotify', cat: 'media', role: 'music', vendor: 'Spotify', stems: ['spotify'], install: [AD + 'Spotify\\Spotify.exe'], startup: ['spotify'] },
    { id: 'wallpaper', cat: 'media', role: 'desktop', vendor: 'Wallpaper Engine', stems: ['wallpaper32', 'wallpaper64', 'wallpaperservice32'], install: [PF86 + 'Steam\\steamapps\\common\\wallpaper_engine', PF + 'Steam\\steamapps\\common\\wallpaper_engine'], startup: ['wallpaper'] },

    { id: 'steam', cat: 'launchers', role: 'launcher', vendor: 'Valve', stems: ['steam', 'steamwebhelper', 'steamservice'], lower: ['steamwebhelper'], install: [PF86 + 'Steam\\steam.exe', PF + 'Steam\\steam.exe'], startup: ['steam'] },
    { id: 'epic', cat: 'launchers', role: 'launcher', vendor: 'Epic Games', stems: ['epicgameslauncher', 'epicwebhelper'], lower: ['epicwebhelper'], install: [PD + 'Epic\\EpicGamesLauncher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe', PF86 + 'Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe'], startup: ['epicgameslauncher', 'epic games'] },
    { id: 'ea', cat: 'launchers', role: 'launcher', vendor: 'Electronic Arts', stems: ['eadesktop', 'eabackgroundservice', 'ealauncher'], lower: [], install: [PF + 'Electronic Arts\\EA Desktop\\EA Desktop\\EADesktop.exe'], startup: ['eadesktop', 'ea desktop'] },
    { id: 'ubisoft', cat: 'launchers', role: 'launcher', vendor: 'Ubisoft', stems: ['upc', 'ubisoftconnect', 'uplaywebcore', 'ubisoftgamelauncher'], lower: ['uplaywebcore'], install: [PF86 + 'Ubisoft\\Ubisoft Game Launcher\\UbisoftConnect.exe'], startup: ['ubisoft', 'upc.exe'] },
    { id: 'battlenet', cat: 'launchers', role: 'launcher', vendor: 'Blizzard', stems: ['battle.net'], lower: [], install: [PF86 + 'Battle.net\\Battle.net.exe', PF + 'Battle.net\\Battle.net.exe'], startup: ['battle.net'] },
    { id: 'gog', cat: 'launchers', role: 'launcher', vendor: 'GOG', stems: ['galaxyclient', 'galaxyclient helper'], lower: ['galaxyclient helper'], install: [PF86 + 'GOG Galaxy\\GalaxyClient.exe'], startup: ['galaxyclient', 'gog galaxy'] },
    { id: 'riot', cat: 'launchers', role: 'launcher', vendor: 'Riot Games', stems: ['riotclientservices', 'riotclientux', 'riotclientuxrender'], lower: [], install: [PD + 'Riot Games\\RiotClientInstalls.json', 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe'], startup: ['riotclient'] },
    { id: 'xbox', cat: 'launchers', role: 'launcher', vendor: 'Microsoft', stems: ['xboxpcapp'], lower: [], install: [], startup: ['xbox'] },
    { id: 'playnite', cat: 'launchers', role: 'launcher', vendor: 'Playnite', stems: ['playnite.desktopapp', 'playnite.fullscreenapp'], lower: [], install: [LA + 'Playnite\\Playnite.DesktopApp.exe'], startup: ['playnite'] },

    { id: 'obs', cat: 'streaming', role: 'capture', vendor: 'OBS Project', stems: ['obs64', 'obs32'], install: [PF + 'obs-studio\\bin\\64bit\\obs64.exe', PF86 + 'obs-studio\\bin\\64bit\\obs64.exe'], startup: ['obs'] },
    { id: 'medal', cat: 'streaming', role: 'capture', vendor: 'Medal', stems: ['medal'], install: [LA + 'Medal\\Medal.exe', LA + 'Programs\\Medal'], startup: ['medal'] },
    { id: 'overwolf', cat: 'streaming', role: 'capture', vendor: 'Overwolf', stems: ['overwolf', 'overwolfbrowser', 'overwolfhelper'], install: [PF86 + 'Overwolf\\Overwolf.exe', PF + 'Overwolf\\Overwolf.exe'], startup: ['overwolf'] },

    { id: 'onedrive', cat: 'sync', role: 'sync', vendor: 'Microsoft', stems: ['onedrive', 'filecoauth'], install: [LA + 'Microsoft\\OneDrive\\OneDrive.exe', PF + 'Microsoft OneDrive\\OneDrive.exe'], startup: ['onedrive'] },
    { id: 'dropbox', cat: 'sync', role: 'sync', vendor: 'Dropbox', stems: ['dropbox'], install: [PF86 + 'Dropbox\\Client\\Dropbox.exe', PF + 'Dropbox\\Client\\Dropbox.exe'], startup: ['dropbox'] },
    { id: 'gdrive', cat: 'sync', role: 'sync', vendor: 'Google', stems: ['googledrivefs'], install: [PF + 'Google\\Drive File Stream'], startup: ['googledrive', 'drivefs'] },

    { id: 'icue', cat: 'gear', role: 'peripheral', vendor: 'Corsair', stems: ['icue', 'icuedevicepluginhost'], install: [PF86 + 'Corsair\\CORSAIR iCUE Software\\iCUE.exe', PF + 'Corsair\\CORSAIR iCUE 5 Software\\iCUE.exe'], startup: ['icue'] },
    { id: 'synapse', cat: 'gear', role: 'peripheral', vendor: 'Razer', stems: ['razer synapse 3', 'razercentral', 'razer central'], install: [PF86 + 'Razer\\Synapse3', PF86 + 'Razer\\RazerCentral'], startup: ['razer'] },
    { id: 'ghub', cat: 'gear', role: 'peripheral', vendor: 'Logitech', stems: ['lghub', 'lghub_agent', 'lghub_system_tray', 'lghub_updater'], install: [PF + 'LGHUB\\lghub.exe'], startup: ['lghub'] },
    { id: 'armoury', cat: 'gear', role: 'peripheral', vendor: 'ASUS', stems: ['armourycrate.service', 'armourycrate.usersessionhelper', 'armourycrate.lighteffectservice'], install: [PF86 + 'ASUS\\ARMOURY CRATE Service'], startup: ['armoury'] },

    { id: 'nvidia', cat: 'tools', role: 'gpu-tool', vendor: 'NVIDIA', stems: ['nvidia app', 'nvidia share', 'nvcontainer'], install: [PF + 'NVIDIA Corporation\\NVIDIA app\\CEF\\NVIDIA app.exe', PF + 'NVIDIA Corporation\\NVIDIA GeForce Experience\\NVIDIA GeForce Experience.exe', PF + 'NVIDIA Corporation\\GeForce Experience\\NVIDIA GeForce Experience.exe'], startup: ['nvidia'] },
    { id: 'vscode', cat: 'tools', role: 'dev', vendor: 'Microsoft', stems: ['code'], install: [LA + 'Programs\\Microsoft VS Code\\Code.exe', PF + 'Microsoft VS Code\\Code.exe'], startup: [] },
  ]

  const CATS = ['browsers', 'comms', 'media', 'launchers', 'streaming', 'sync', 'gear', 'tools']
  const ROLES = ['browser', 'voice', 'music', 'launcher', 'capture', 'peripheral', 'sync', 'chat', 'dev', 'gpu-tool', 'desktop']
  const BY_ID = Object.fromEntries(APPS.map(a => [a.id, a]))
  const BY_STEM = {}
  for (const a of APPS) for (const s of a.stems) BY_STEM[s] = a.id

  /** 'Chrome.exe#2' -> 'chrome'. */
  const stem = name => String(name == null ? '' : name).replace(/#\d+$/, '').replace(/\.exe$/i, '').trim().toLowerCase()
  const appOfStem = s => BY_STEM[stem(s)] || null
  /** Does a Run-key command belong to this app? */
  const startsApp = (app, cmd) => { const c = String(cmd || '').toLowerCase(); return (app.startup || []).some(p => p && c.includes(p)) }
  const lowerable = (app, s) => !app.lower || app.lower.includes(stem(s))

  const api = { APPS, CATS, ROLES, BY_ID, BY_STEM, stem, appOfStem, startsApp, lowerable }
  root.JylliAppsKnown = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
