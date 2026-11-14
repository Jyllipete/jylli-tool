'use strict'
// The Pulse planner: from facts about this PC, this game and what is running, decide which changes are worth making, which things
// to only recommend, and say when there is nothing safe to do. Pure. Every threshold is named and is ours (docs/PULSE_EVIDENCE.md).
//   change     Pulse applies it, verifies it and undoes it when the boost ends.
//   skipped    a change that exists but does not fit this PC; carries the reason.
//   recommend  something the user may want to do; Pulse never does it.
;(function (root) {
  const has = v => typeof v === 'number' && Number.isFinite(v)
  const DEPRIO_MIN_CPU = 2        // % of the whole CPU a background process must use before lowering it is worth the risk
  const HEAVY_CPU = 20            // % of the whole CPU: worth telling the user about
  const RAM_TIGHT = 85            // % RAM in use
  const HOT_CPU = 85              // C at the start of a session
  const HIGH_PERF = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'
  const BALANCED = '381b4222-f694-41f0-9685-ff5bb260df2e'
  const GAME_LEVEL = 'AboveNormal'
  const DEPRIO_LEVEL = 'BelowNormal'

  // Never lowered: the system, the shell, drivers' helpers, Jylli itself, launchers (a game started from one inherits its priority),
  // anti-cheat, voice chat / streaming / audio, peripheral software.
  const PROTECTED = [
    /^(System|Idle|Registry|smss|csrss|wininit|winlogon|lsass|lsm|services|svchost|MsMpEng|NisSrv|SecurityHealth.*|audiodg|dwm|explorer|ctfmon|conhost|sihost|taskhostw|fontdrvhost|RuntimeBroker|SearchHost|SearchIndexer|StartMenuExperienceHost|ShellExperienceHost|TextInputHost|WmiPrvSE|Memory Compression|electron|Jylli.*|PresentMon.*|JylliSensor|LibreHardwareMonitor.*)$/i,
    /^(steam|steamwebhelper|steamservice|EpicGamesLauncher|EpicWebHelper|EOSOverlayRenderer.*|Battle\.net|Agent|RiotClient.*|vgc|vgtray|EADesktop|EABackgroundService|EALocalHostSvc|Origin.*|upc|UbisoftConnect|UplayWebCore|GalaxyClient.*|Playnite.*|GfExperience|NVIDIA.*|nvcontainer|nvsphelper.*|AMDRSServ|RadeonSoftware|cncmd)$/i,
    /^(EasyAntiCheat.*|BEService|BEDaisy|vgk|FACEIT.*|ESEA.*|PnkBstr.*|xigncode.*|GameGuard.*|EAAntiCheat.*)$/i,
    /^(Discord.*|Teamspeak.*|ts3client.*|Mumble.*|obs64|obs32|obs-.*|Streamlabs.*|XSplit.*|Voicemeeter.*|SteelSeriesSonar.*|WaveLink.*|Elgato.*|NVIDIA Broadcast.*|RTXVoice.*|Medal.*|Overwolf.*)$/i,
    /^(iCUE.*|LGHUB.*|lghub.*|RazerCentral.*|Razer.*|SteelSeriesGG.*|SteelSeriesEngine.*|Logi.*|Synapse.*|ArmouryCrate.*|MSI.*|NahimicService|NahimicSvc.*|RTHDVCPL|RtkAudUService.*)$/i,
  ]
  const isProtected = (name, extra) => {
    const n = String(name || '')
    if (PROTECTED.some(rx => rx.test(n))) return true
    return (extra || []).some(x => x && n.toLowerCase() === String(x).toLowerCase())
  }
  const gameMatch = (name, pattern) => {
    const n = String(name || '').toLowerCase(), p = String(pattern || '').toLowerCase()
    if (!p) return false
    if (p.includes('*')) return new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$').test(n)
    return n === p
  }

  /**
   * f: { form: 'laptop'|'desktop'|null, onBattery, dualCcdX3d, activePlan: { guid, name }|null, highPerfAvailable: bool|null, gameMode: bool|null,
   *      game: { pid, name, cls, st }|null, gamePattern, needs: [names], procs: [{ pid, name, cpu, ws, cls, st }], ramPct, cpuTemp, updateActive, frames: bool }
   * -> { changes, skipped, recommend, monitor, none }
   */
  function plan(f) {
    f = f || {}
    const changes = [], skipped = [], recommend = []
    const guid = f.activePlan && f.activePlan.guid ? String(f.activePlan.guid).toLowerCase() : null

    // ── power plan ──
    if (f.form === 'laptop') {
      skipped.push({ id: 'power', reason: 'laptop' })
      recommend.push({ id: 'laptop', vars: { battery: f.onBattery === true ? 1 : 0 } })
    } else if (f.dualCcdX3d === true) {
      skipped.push({ id: 'power', reason: 'x3d' })
      if (guid && guid !== BALANCED) recommend.push({ id: 'x3dPlan', vars: { plan: f.activePlan.name || '' } })
    } else if (!guid) {
      skipped.push({ id: 'power', reason: 'unknown' })
    } else if (guid !== BALANCED) {
      skipped.push({ id: 'power', reason: guid === HIGH_PERF ? 'already-high' : 'not-balanced', vars: { plan: f.activePlan.name || '' } })
    } else if (f.highPerfAvailable !== true) {
      skipped.push({ id: 'power', reason: 'no-high' })
      recommend.push({ id: 'noHigh', vars: {} })
    } else {
      changes.push({ id: 'power', to: HIGH_PERF, from: guid, vars: { from: f.activePlan.name || 'Balanced' } })
    }

    // ── game priority ──
    const g = f.game
    if (g && g.cls && g.cls !== 'Normal' && g.cls !== 'BelowNormal') skipped.push({ id: 'priority', reason: 'already-set', vars: { cls: g.cls } })
    else changes.push({ id: 'priority', level: GAME_LEVEL, target: g || null, deferred: !g })

    // ── background priority ──
    const procs = Array.isArray(f.procs) ? f.procs : []
    const targets = procs.filter(p => p && has(p.cpu) && p.cpu >= DEPRIO_MIN_CPU && p.cls === 'Normal' && p.name && !isProtected(p.name, f.needs) &&
      !gameMatch(p.name, f.gamePattern) && !(g && p.pid === g.pid)).sort((a, b) => b.cpu - a.cpu).slice(0, 12)
    if (targets.length) changes.push({ id: 'deprio', level: DEPRIO_LEVEL, targets: targets.map(p => ({ pid: p.pid, name: p.name, cpu: p.cpu, cls: p.cls, st: p.st })), vars: { n: targets.length } })
    else skipped.push({ id: 'deprio', reason: 'none-competing' })

    // ── recommendations (Pulse never does these) ──
    const heavy = procs.filter(p => p && has(p.cpu) && p.cpu >= HEAVY_CPU && !isProtected(p.name, f.needs) && !gameMatch(p.name, f.gamePattern)).sort((a, b) => b.cpu - a.cpu)[0]
    if (heavy) recommend.push({ id: 'heavy', vars: { name: heavy.name, cpu: Math.round(heavy.cpu) } })
    if (has(f.ramPct) && f.ramPct >= RAM_TIGHT) {
      const big = procs.filter(p => p && has(p.ws) && !isProtected(p.name, f.needs) && !gameMatch(p.name, f.gamePattern)).sort((a, b) => b.ws - a.ws)[0]
      recommend.push({ id: 'ram', vars: { ram: Math.round(f.ramPct), name: big ? big.name : '-', mb: big ? Math.round(big.ws) : 0 } })
    }
    if (f.gameMode === false) recommend.push({ id: 'gameMode', vars: {} })
    if (f.updateActive === true) recommend.push({ id: 'update', vars: {} })
    if (has(f.cpuTemp) && f.cpuTemp >= HOT_CPU) recommend.push({ id: 'hot', vars: { temp: Math.round(f.cpuTemp) } })

    return { changes, skipped, recommend, monitor: { frames: f.frames !== false }, none: changes.length === 0 }
  }

  const api = { plan, isProtected, gameMatch, DEPRIO_MIN_CPU, HEAVY_CPU, RAM_TIGHT, HOT_CPU, HIGH_PERF, BALANCED, GAME_LEVEL, DEPRIO_LEVEL }
  root.JylliPulsePlan = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
