'use strict'
// Apps tab "Backstage": Game time. The ONLY place that decides what may step back while a game runs, and how far. Pure and UMD.
//   off    nothing happens
//   calm   BelowNormal CPU priority (the program keeps working, the game wins when they compete)
//   quiet  BelowNormal + Windows Efficiency mode (EcoQoS): the program is also moved to efficient cores and a lower clock (Premium)
// Rules that never bend:
//   - only a process that is at Normal priority right now is touched (somebody else's choice is never overwritten)
//   - PROTECTED programs are never touched, whatever the user picks (the game, anti-cheat, audio, the shell, drivers, Jylli itself)
//   - roles that must keep running at full speed (capture, GPU tools) only ever offer "off"
//   - a launcher's own process is never lowered (a game it starts would inherit the priority): only its web helpers, see known.js `lower`
;(function (root) {
  const known = (typeof module !== 'undefined' && module.exports) ? require('./known') : root.JylliAppsKnown

  const LEVELS = ['off', 'calm', 'quiet']
  const ROLES = {
    browser: { allowed: ['off', 'calm', 'quiet'], def: 'calm' },
    voice: { allowed: ['off', 'calm'], def: 'off' },          // a call under load must not crackle: opt-in
    music: { allowed: ['off', 'calm'], def: 'off' },
    launcher: { allowed: ['off', 'calm'], def: 'calm' },
    chat: { allowed: ['off', 'calm', 'quiet'], def: 'calm' },
    sync: { allowed: ['off', 'calm', 'quiet'], def: 'quiet' },
    dev: { allowed: ['off', 'calm', 'quiet'], def: 'quiet' },
    desktop: { allowed: ['off', 'calm', 'quiet'], def: 'calm' },
    peripheral: { allowed: ['off', 'calm'], def: 'off' },
    capture: { allowed: ['off'], def: 'off' },
    'gpu-tool': { allowed: ['off'], def: 'off' },
  }

  // Lower-case process names that are never lowered.
  const PROTECTED = new Set([
    'system', 'idle', 'registry', 'memory compression', 'smss', 'csrss', 'wininit', 'winlogon', 'services', 'lsass', 'svchost', 'dwm', 'explorer',
    'audiodg', 'fontdrvhost', 'sihost', 'ctfmon', 'searchhost', 'startmenuexperiencehost', 'shellexperiencehost', 'textinputhost', 'taskmgr',
    'msmpeng', 'securityhealthservice', 'nvdisplay.container', 'nvcontainer', 'vgc', 'vgtray', 'easyanticheat', 'easyanticheat_eos', 'beservice',
    'battleye', 'faceitservice', 'faceit', 'esea', 'equ8', 'voicemeeter', 'voicemeeterpro', 'voicemeeter8x64', 'jylli tool', 'jylli-tool', 'electron',
    'powershell', 'pwsh', 'conhost', 'cmd', 'obs64', 'obs32', 'presentmon', 'rtss', 'msiafterburner',
  ])
  const isProtected = (name, gameStems) => {
    const s = known.stem(name)
    return PROTECTED.has(s) || (Array.isArray(gameStems) && gameStems.includes(s))
  }

  const roleOf = app => ROLES[app && app.role] || ROLES.capture
  const allowed = app => (app && app.lower && !app.lower.length ? ['off'] : roleOf(app).allowed)
  const defaultLevel = app => (allowed(app).includes(roleOf(app).def) ? roleOf(app).def : 'off')

  /** The level in force for one app: the user's pick if it is allowed, else the default; "quiet" needs Premium (falls back to calm, locked is reported by the model). */
  function levelOf(app, picks, premium) {
    const want = picks && LEVELS.includes(picks[app.id]) ? picks[app.id] : defaultLevel(app)
    let lv = allowed(app).includes(want) ? want : defaultLevel(app)
    if (lv === 'quiet' && !premium) lv = allowed(app).includes('calm') ? 'calm' : 'off'
    return lv
  }

  /**
   * procs: [{ pid, name, cls, st, cpu }], o: { picks, premium, gameStems, enabled } -> targets [{ pid, name, st, app, level, cls, cpu }] (max 120)
   * Sorted by CPU so the busiest are handled first when the cap bites.
   */
  function plan(procs, o) {
    const out = []
    if (!o || o.enabled === false) return out
    for (const p of procs || []) {
      const id = known.appOfStem(p.name)
      if (!id) continue
      const app = known.BY_ID[id]
      if (!known.lowerable(app, p.name)) continue
      if (isProtected(p.name, o.gameStems)) continue
      if (p.cls !== 'Normal') continue                          // somebody already chose something else, or it could not be read
      const level = levelOf(app, o.picks, o.premium)
      if (level === 'off') continue
      out.push({ pid: p.pid, name: p.name, st: p.st, app: id, level, cls: p.cls, cpu: p.cpu || 0 })
    }
    return out.sort((a, b) => b.cpu - a.cpu).slice(0, 120)
  }

  /** What the page may say about Game time without running anything: how many apps would step back at this moment. */
  function preview(apps, o) {
    const stepping = []
    for (const a of apps || []) {
      if (!a.running) continue
      const lv = levelOf(known.BY_ID[a.id], o && o.picks, o && o.premium)
      if (lv !== 'off') stepping.push({ id: a.id, level: lv })
    }
    return stepping
  }

  const api = { LEVELS, ROLES, PROTECTED, isProtected, roleOf, allowed, defaultLevel, levelOf, plan, preview }
  root.JylliAppsRules = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
