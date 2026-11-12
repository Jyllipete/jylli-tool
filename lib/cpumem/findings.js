'use strict'
// The only list of what the CPU & Memory tab may say about this PC. A finding exists only when its evidence is in the input, and every threshold
// below has a name and is documented in docs/CPUMEM_EVIDENCE.md. Pure + UMD: the service runs `statics` from a scan, the page re-runs `live` on live frames.
;(function (root) {
  const T = {
    LIVE_MIN_FRAMES: 10,         // a live finding needs this many one-second frames, so one spike never counts
    RAM_PRESSURE_PCT: 90,        // average memory in use
    COMMIT_PRESSURE_PCT: 90,     // average committed memory against the commit limit
    FAULT_READS: 200,            // average page reads per second that had to come from disk ...
    FAULT_RAM_PCT: 85,           // ... while memory in use is at least this high
    THERMAL_C: 95,               // package temperature, only when a sensor reports it
    CLOCK_HELD_LOAD: 60,         // average CPU load (%) ...
    CLOCK_HELD_RATIO: 0.5,       // ... with the effective clock at or below this share of the base clock
    BG_HOG_CPU: 25,              // one non-game program using this much CPU (%) in the consumers snapshot
    BELOW_RATED: 0.95,           // a module running below this share of its rated speed
    MICROCODE_MIN: 0x12F,        // Raptor Lake desktop: first microcode revision with the full Vmin Shift fix
    MICROCODE_HIGH: 0x12B,       // below this the instability risk is high
    LOW_RAM_GB: 12,              // under this, memory pressure is a likely limit (used only to word the pressure finding)
  }

  const RANK = { bad: 0, warn: 1, info: 2 }

  /**
   * Static findings. i = { caps, topo, mods (memory.modules), status: {tweakId: 'on'|'native'|'off'|...}, scheme, base }
   * Returns [{ id, kind:'static', tone:'bad'|'warn'|'info', vars, action }]
   */
  function statics(i = {}) {
    const out = []
    const caps = i.caps || {}, cpu = caps.cpu || null, sec = caps.sec || {}, st = i.status || {}
    const add = (id, tone, vars, action) => out.push({ id, kind: 'static', tone, vars: vars || {}, action: action || null })
    const set = id => st[id] === 'on' || st[id] === 'native'
    const mods = i.mods || { list: [] }

    const below = (mods.list || []).filter(m => m.below)
    if (below.length) add('ram-below-rated', 'warn', { cur: Math.min(...below.map(m => m.runMT)), rated: Math.max(...below.map(m => m.ratedMT)), type: below[0].type || '' }, { kind: 'bios' })
    else if (caps.ram && caps.ram.xmp === 'off') add('ram-below-rated', 'warn', { cur: '', rated: '', type: caps.ram.type || '' }, { kind: 'bios' })
    if (mods.singleChannel) add('ram-single-channel', caps.form === 'laptop' ? 'info' : 'warn', { type: (mods.list[0] && mods.list[0].type) || '' })
    const sizes = new Set((mods.list || []).map(m => m.capGB)), rates = new Set((mods.list || []).map(m => m.ratedMT).filter(Boolean))
    if ((mods.list || []).length > 1 && (sizes.size > 1 || rates.size > 1)) add('ram-mixed', 'info', { n: mods.list.length })

    if (cpu && cpu.raptorLakeDesktop && cpu.microcode != null && cpu.microcode < T.MICROCODE_MIN)
      add('cpu-microcode', cpu.microcode < T.MICROCODE_HIGH ? 'bad' : 'warn', { cpu: cpu.name, rev: '0x' + cpu.microcode.toString(16).toUpperCase(), need: '0x' + T.MICROCODE_MIN.toString(16).toUpperCase() }, { kind: 'bios' })
    if (cpu && cpu.dualCcdX3d) {
      if (caps.tools && caps.tools.amd3dSvc !== true) add('x3d-driver', 'warn', { cpu: cpu.name }, { kind: 'url', url: 'https://www.amd.com/en/support/download/drivers.html' })
      if (set('cpu-parking') || (i.scheme && i.scheme !== 'balanced')) add('x3d-steering-broken', 'warn', { cpu: cpu.name }, { kind: 'reveal', id: set('cpu-parking') ? 'cpu-parking' : 'x3d-balanced' })
    }
    if (cpu && cpu.vendor === 'intel' && cpu.hybrid === true && caps.os && caps.os.win10Eol === true) add('hybrid-win10', 'warn', { cpu: cpu.name })
    if (sec.hvciRunning === true && cpu && cpu.hvciCostly === true && !set('hvci-offload')) add('hvci-costly', 'info', { cpu: cpu.name }, { kind: 'reveal', id: 'hvci-offload' })
    if (i.scheme === 'saver') add('power-saver', 'warn', {}, { kind: 'switch', id: 'power-balanced-restore' })
    return sort(out)
  }

  const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)

  /**
   * Live findings over a window of frames (lib/cpumem/live.js). ctx = { base: MHz, cpuTemp: °C|null, consumers: [{name, cpu, game}]|null }
   * Returns [] until LIVE_MIN_FRAMES frames exist.
   */
  function live(frames, ctx = {}) {
    const out = []
    const f = (frames || []).filter(Boolean)
    if (f.length < T.LIVE_MIN_FRAMES) return out
    const add = (id, tone, vars, action) => out.push({ id, kind: 'live', tone, vars: vars || {}, action: action || null })
    const ramPct = mean(f.map(x => x.mem.totalMB ? (x.mem.totalMB - x.mem.availMB) / x.mem.totalMB * 100 : 0))
    const commitPct = mean(f.map(x => x.mem.commitLimitMB ? x.mem.committedMB / x.mem.commitLimitMB * 100 : 0))
    const reads = mean(f.map(x => x.mem.pageReads))
    const totalGB = (f[f.length - 1].mem.totalMB || 0) / 1024
    if (ramPct >= T.RAM_PRESSURE_PCT) add('ram-pressure', 'bad', { pct: Math.round(ramPct), gb: Math.round(totalGB), low: totalGB > 0 && totalGB < T.LOW_RAM_GB ? 1 : 0 }, { kind: 'consumers' })
    if (commitPct >= T.COMMIT_PRESSURE_PCT) add('commit-pressure', 'warn', { pct: Math.round(commitPct) }, { kind: 'consumers' })
    if (reads >= T.FAULT_READS && ramPct >= T.FAULT_RAM_PCT) add('hard-faults', 'warn', { reads: Math.round(reads), pct: Math.round(ramPct) }, { kind: 'consumers' })
    const temp = Number(ctx.cpuTemp)
    if (Number.isFinite(temp) && temp >= T.THERMAL_C) add('thermal', 'bad', { c: Math.round(temp) })
    const base = Number(ctx.base) || 0
    const withCpu = f.filter(x => x.cpu && x.cpu.total)
    if (base && withCpu.length >= T.LIVE_MIN_FRAMES) {
      const load = mean(withCpu.map(x => x.cpu.total.util)), mhz = mean(withCpu.map(x => x.cpu.total.mhz))
      if (load >= T.CLOCK_HELD_LOAD && mhz > 0 && mhz <= base * T.CLOCK_HELD_RATIO) add('clock-held', 'warn', { load: Math.round(load), mhz: Math.round(mhz), base })
    }
    const hog = (ctx.consumers || []).find(c => !c.game && Number(c.cpu) >= T.BG_HOG_CPU)
    if (hog) add('bg-hog', 'warn', { name: hog.name, cpu: Math.round(hog.cpu) }, { kind: 'consumers' })
    return sort(out)
  }

  function sort(list) { return list.sort((a, b) => RANK[a.tone] - RANK[b.tone]) }

  /** Active plan GUID -> 'balanced' | 'saver' | 'high' | 'other' | null (the three built-in plans; a custom plan is 'other'). */
  function schemeKind(guid) {
    const g = String(guid || '').toLowerCase()
    if (!g) return null
    if (g === '381b4222-f694-41f0-9685-ff5bb260df2e') return 'balanced'
    if (g === 'a1841308-3541-4fab-bc81-f71556f20b4a') return 'saver'
    if (g === '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c') return 'high'
    if (g === 'e9a42b02-d5df-448d-aa00-03f14749eb61') return 'ultimate'
    return 'other'
  }

  const IDS = ['ram-below-rated', 'ram-single-channel', 'ram-mixed', 'cpu-microcode', 'x3d-driver', 'x3d-steering-broken', 'hybrid-win10', 'hvci-costly', 'power-saver',
    'ram-pressure', 'commit-pressure', 'hard-faults', 'thermal', 'clock-held', 'bg-hog']

  const exported = { T, IDS, statics, live, schemeKind }
  if (typeof module !== 'undefined' && module.exports) module.exports = exported
  if (typeof window !== 'undefined') window.JylliCpuMemFindings = exported
})(typeof window !== 'undefined' ? window : globalThis)
