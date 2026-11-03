'use strict'
// Classifies Run-key startup items. Only categories that are safe to switch off on their own are ever selected: launchers,
// chat clients, media players, cloud-sync nags, vendor helper bloat and Edge's prelaunch. Security software, drivers,
// peripherals and anything that delivers patches stay untouched.

const RULES = [
  // never touch
  { cat: 'security', re: /defender|securityhealth|windows security|avast|avg\b|norton|bitdefender|kaspersky|mcafee|malwarebytes|eset|sophos|webroot|f-secure|trend ?micro|avira|crowdstrike|sentinel/i },
  { cat: 'driver', re: /realtek|rtkw*|nvidia|nvcpl|amd ?(radeon|software)|radeonsoftware|rtss|intel.*(rst|graphics|wireless|bluetooth|driver)|igfx|synaptics|elan|touchpad|bluetooth|waves ?maxx|dolby|nahimic|sonic ?studio|asus.*(armoury|aura|mb ?sensor)|msi ?(center|dragon|afterburner)|corsair|icue|logi(tech)?|lghub|razer|steelseries|hyperx|ngenuity|wacom|elgato|obs-studio|obs ?virtual|openrgb|fancontrol|hwinfo|ryzen ?master|rgb/i },
  { cat: 'updater-security', re: /windows ?update|updater.*(java|adobe)|jusched|adobe ?(arm|acrobat ?update)|googleupdate|microsoftedgeupdate|brave ?update/i },
  // safe to switch off
  { cat: 'launcher', re: /steam|epic ?games|epicgames|\borigin\b|ea ?(app|desktop)|ubisoft|uplay|battle\.?net|blizzard|gog ?galaxy|riot|rockstar|xbox|playnite/i },
  { cat: 'chat', re: /discord|teams|skype|slack|zoom|telegram|whatsapp|signal|viber|webex/i },
  { cat: 'media', re: /spotify|itunes|ipod|apple ?(music|devices)|vlc|deezer|tidal|plex|winamp/i },
  { cat: 'cloud', re: /onedrive|dropbox|google ?drive|googledrivefs|icloud|mega ?sync|box ?sync/i },
  { cat: 'vendor-bloat', re: /hp ?(support|smart|jumpstart|system ?event)|dell ?(supportassist|update|optimizer|digital)|lenovo ?(vantage|utility|hotkeys)|acer ?(care|quick)|asus ?(link|armoury ?crate ?service|armoury)|msi ?(live ?update)|samsung ?(magician|update)|adobe ?(creative|cc|collab)|ccxprocess|acrotray|java ?(update)|cyberlink|nitro|onenote|cortana|yourphone|phone ?link|msedge|microsoftedgeautolaunch/i },
]

// Categories that may be disabled without asking. 'cloud' is reviewable but not default-on; the user opts in.
const SAFE = new Set(['launcher', 'chat', 'media', 'vendor-bloat'])
const OPT_IN = new Set(['cloud'])

function categoryOf(name, command, company) {
  const hay = `${name || ''} ${command || ''} ${company || ''}`
  for (const r of RULES) if (r.re.test(hay)) return r.cat
  return 'unknown'
}

/** Normalises a probe item and adds category / safeToDisable / defaultOn. */
function classify(item) {
  const cat = categoryOf(item.name, item.cmd, item.company)
  return { ...item, category: cat, safeToDisable: SAFE.has(cat) || OPT_IN.has(cat), defaultOn: SAFE.has(cat) && !!item.enabled }
}

function summarize(items) {
  const list = (items || []).map(classify)
  return { items: list, enabledCount: list.filter(i => i.enabled).length, candidates: list.filter(i => i.enabled && i.safeToDisable) }
}

module.exports = { categoryOf, classify, summarize, SAFE, OPT_IN }
