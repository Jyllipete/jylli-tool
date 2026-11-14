'use strict'
// Console coach: which documented FiveM console commands are worth trying after a session, picked from the hitch causes that were
// measured. It only returns text to copy into the F8 console; nothing is run or toggled by the app. Commands are from
// https://docs.fivem.net/docs/client-manual/console-commands/ and https://docs.fivem.net/docs/scripting-manual/debugging/using-profiler/
// ("documented"); the 512 in str_maxVehicleTextureRes is a suggestion (the documented default is 1024), said so in the wording.
// Wording lives in LANG co_<id> (title), cw_<id> (why). Pure, no require.
;(function (root) {
  const MIN_HITCHES = 2            // one hitch is noise
  const MIN_CPU_HITCHES = 3

  const count = (hitches, c) => hitches.filter(h => h.primary === c).length

  /** analysis.hitches ([{ primary, ... }]) -> [{ id, cmds: [{ cmd, dev }] }] */
  function advise(analysis) {
    const hs = analysis && Array.isArray(analysis.hitches) ? analysis.hitches : []
    if (hs.length < MIN_HITCHES) return []
    const out = []
    const vram = count(hs, 'vram-full'), ram = count(hs, 'ram-pressure')
    if (vram >= 1) out.push({ id: 'vram', cmds: [{ cmd: 'strmem true', dev: true }, { cmd: 'str_maxVehicleTextureRes 512', dev: false }] })
    else if (ram >= 1) out.push({ id: 'ram', cmds: [{ cmd: 'strmem true', dev: true }] })
    const cpu = count(hs, 'cpu-bound') + count(hs, 'unknown')
    if (cpu >= MIN_CPU_HITCHES) out.push({ id: 'scripts', cmds: [{ cmd: 'profiler record 500', dev: false }, { cmd: 'profiler saveJSON jylli-profile.json', dev: false }, { cmd: 'resmon true', dev: true }] })
    out.push({ id: 'overlay', cmds: [{ cmd: 'cl_drawperf true', dev: false }] })
    return out
  }

  const api = { MIN_HITCHES, MIN_CPU_HITCHES, advise }
  root.JylliFivemCoach = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
