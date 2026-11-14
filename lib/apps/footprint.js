'use strict'
// Apps tab "Backstage": what the programs cost right now. Pure and UMD.
//   group(procs)    -> { byApp: {id: cost}, others: [...] }   cost = { cpu, ram, vram, n, procs: [...] }
//   totals(byApp)   -> { cpu, ram, vram, apps }
//   segments(byApp, metric, top) -> [{ id, v }] biggest first, the rest folded into one { id: '_rest' }
//   Ring(n)         per-app history for the little sparklines
// cpu = % of the whole CPU, ram = private working set in MB, vram = dedicated GPU memory in MB (null on a PC that cannot report it).
;(function (root) {
  const known = (typeof module !== 'undefined' && module.exports) ? require('./known') : root.JylliAppsKnown

  // Windows' own and the user's tools: never listed as "other heavy programs" (Home explains those; this tab is about apps).
  const SYSTEM = new Set([
    'system', 'idle', 'registry', 'memory compression', 'smss', 'csrss', 'wininit', 'winlogon', 'services', 'lsass', 'svchost', 'dwm', 'explorer', 'audiodg',
    'fontdrvhost', 'sihost', 'ctfmon', 'searchhost', 'startmenuexperiencehost', 'shellexperiencehost', 'textinputhost', 'runtimebroker', 'taskhostw',
    'msmpeng', 'nissrv', 'securityhealthservice', 'wmiprvse', 'searchindexer', 'searchprotocolhost', 'conhost', 'powershell', 'pwsh', 'cmd', 'jylli tool',
    'jylli-tool', 'electron', 'msedgewebview2', 'nvdisplay.container', 'tiworker', 'trustedinstaller', 'mousocoreworker', 'compattelrunner', 'taskmgr',
  ])
  const OTHER_MIN = { cpu: 2, ram: 500 }          // % of the whole CPU, MB: below both a program is not listed

  const sum = (a, k) => a.reduce((s, x) => s + (x[k] || 0), 0)
  const r1 = n => Math.round(n * 10) / 10

  function group(procs, o) {
    const byApp = {}, others = [], gpu = !!(o && o.gpu)
    const skip = new Set((o && o.skip) || [])
    for (const p of procs || []) {
      if (skip.has(p.name)) continue
      const id = known.appOfStem(p.name)
      if (id) {
        const c = byApp[id] || (byApp[id] = { cpu: 0, ram: 0, vram: gpu ? 0 : null, n: 0, procs: [] })
        c.cpu += p.cpu; c.ram += p.ram; if (gpu) c.vram += p.vram; c.n += 1
        c.procs.push({ pid: p.pid, name: p.name, cpu: p.cpu, ram: p.ram, vram: gpu ? p.vram : null, cls: p.cls })
      } else if (!SYSTEM.has(p.name) && (p.cpu >= OTHER_MIN.cpu || p.ram >= OTHER_MIN.ram)) {
        others.push({ name: p.name, pid: p.pid, cpu: r1(p.cpu), ram: Math.round(p.ram), vram: gpu ? Math.round(p.vram) : null })
      }
    }
    for (const c of Object.values(byApp)) { c.cpu = r1(c.cpu); c.ram = Math.round(c.ram); if (c.vram != null) c.vram = Math.round(c.vram); c.procs.sort((a, b) => b.cpu - a.cpu || b.ram - a.ram) }
    // Several processes of one unknown program count once, by name.
    const merged = {}
    for (const x of others) { const m = merged[x.name] || (merged[x.name] = { name: x.name, n: 0, cpu: 0, ram: 0, vram: x.vram == null ? null : 0 }); m.n++; m.cpu += x.cpu; m.ram += x.ram; if (m.vram != null) m.vram += x.vram }
    const list = Object.values(merged).map(m => ({ ...m, cpu: r1(m.cpu) })).sort((a, b) => b.ram - a.ram).slice(0, 6)
    return { byApp, others: list }
  }

  function totals(byApp) {
    const v = Object.values(byApp || {})
    return { cpu: r1(sum(v, 'cpu')), ram: Math.round(sum(v, 'ram')), vram: v.length && v.every(c => c.vram == null) ? null : Math.round(sum(v, 'vram')), apps: v.length }
  }

  function segments(byApp, metric, top = 5) {
    const list = Object.entries(byApp || {}).map(([id, c]) => ({ id, v: c[metric] || 0 })).filter(x => x.v > 0).sort((a, b) => b.v - a.v)
    const head = list.slice(0, top), rest = list.slice(top)
    if (rest.length) head.push({ id: '_rest', v: rest.reduce((s, x) => s + x.v, 0), n: rest.length })
    return head
  }

  /** Fixed-size history per key. push() drops the oldest; keys that stop appearing fade out after `ttl` pushes. */
  function Ring(n = 24, ttl = 6) {
    const data = new Map(), miss = new Map()
    return {
      push(values) {
        for (const [k, v] of Object.entries(values || {})) { const a = data.get(k) || []; a.push(v); if (a.length > n) a.shift(); data.set(k, a); miss.set(k, 0) }
        for (const k of [...data.keys()]) if (!(k in (values || {}))) { const m = (miss.get(k) || 0) + 1; miss.set(k, m); if (m > ttl) { data.delete(k); miss.delete(k) } else { const a = data.get(k); a.push(0); if (a.length > n) a.shift() } }
      },
      get: k => (data.get(k) || []).slice(),
      all() { return Object.fromEntries([...data.entries()].map(([k, a]) => [k, a.slice()])) },
    }
  }

  const api = { group, totals, segments, Ring, SYSTEM, OTHER_MIN }
  root.JylliAppsFootprint = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
