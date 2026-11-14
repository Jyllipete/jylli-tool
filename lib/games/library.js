'use strict'
// The library: one list of every game on this PC, merged from the launchers' own files (registry: Steam / Epic / Xbox), curated titles found
// by folder hints (Riot, Battle.net, Rockstar installs have no manifest), and games the user added by picking an exe. Pure.
const known = require('./known')
const launch = require('../compete/launch')
const path = require('node:path')

const STORE_ORDER = { steam: 0, epic: 1, xbox: 2, other: 3, custom: 4 }

/**
 * registry: [{ id, source, name, install, appid?, aumid?, exe? }]   (lib/games-registry scan)
 * hints:    [{ knownId, install }]                                 (curated titles found by folder name)
 * customs:  [{ path }]                                             (user added; exe path)
 * prefs:    { hidden: [id], fav: [id], exes: { id: [exe path] } }
 * -> [{ id, name, dev, source, install, knownId, pulse, icon, aliases, exes, launchable, aumid, appid, favorite, hidden, custom }]
 */
function build({ registry = [], hints = [], customs = [], prefs = {} } = {}) {
  const hidden = new Set(prefs.hidden || []), fav = new Set(prefs.fav || []), picked = prefs.exes || {}
  const out = new Map()
  const add = (e) => {
    const k = e.knownId ? known.BY_ID[e.knownId] : null
    const aliases = [...new Set([e.id, ...(k ? known.aliasesOf(k.id) : [])])]
    const exes = (picked[e.id] && picked[e.id].length ? picked[e.id] : null) || e.exes || []
    out.set(e.id, {
      id: e.id, name: e.name, dev: k ? k.dev : null, source: e.source, install: e.install || null, knownId: k ? k.id : null, pulse: k ? k.pulse || null : null,
      icon: k ? k.icon : null, aliases, exes, launchable: !!launch.launchFor({ id: e.id, aumid: e.aumid }), aumid: e.aumid || null, appid: e.appid || null,
      favorite: fav.has(e.id), hidden: hidden.has(e.id), custom: e.source === 'custom', gamecfg: k ? k.gamecfg || null : null,
    })
  }
  const seenKnown = new Set()
  for (const g of registry) {
    const k = known.matchName(g.name)
    // One curated title can have several store entries (a demo, a bundle): the first by name keeps the curated id, the rest are plain games.
    const claim = k && !seenKnown.has(k.id) ? k : null
    if (claim) seenKnown.add(claim.id)
    add({ id: g.id, name: claim ? claim.name : g.name, source: g.source, install: g.install, knownId: claim ? claim.id : null, aumid: g.aumid, appid: g.appid, exes: claim ? claim.exes : (g.exe ? [g.exe] : []) })
  }
  for (const h of hints) {
    const k = known.BY_ID[h.knownId]
    if (!k || seenKnown.has(k.id)) continue
    seenKnown.add(k.id)
    add({ id: k.id, name: k.name, source: 'other', install: h.install, knownId: k.id, exes: k.exes })
  }
  for (const c of customs) {
    if (!launch.validExePath(c.path)) continue
    const id = 'custom:' + c.path
    add({ id, name: path.win32.basename(c.path).replace(/\.exe$/i, ''), source: 'custom', install: path.win32.dirname(c.path), knownId: null, exes: [path.win32.basename(c.path)] })
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** Which curated games' folder hints exist? `exists(p)` is injected; bases are the usual install roots. */
function hintPaths(bases, exists) {
  const res = []
  for (const k of known.KNOWN) {
    let hit = null
    for (const base of bases) for (const h of k.hints) { if (!hit) { const p = path.win32.join(base, h); if (exists(p)) hit = p } }
    if (hit) res.push({ knownId: k.id, install: hit })
  }
  return res
}

function find(list, id) {
  if (!id) return null
  return list.find(g => g.id === id) || list.find(g => g.aliases.includes(id)) || null
}

module.exports = { build, hintPaths, find, STORE_ORDER }
