'use strict'
// Home Timeline: the ONLY list of processes Home may put a name and a plain-language job to. Pure and UMD.
// A process that is not here is shown by its executable name and nothing else: Home never guesses what an unknown program is doing.
// Copy: LANG group `home2`, `pn_<id>` (what to call it) and `pr_<id>` (what it is usually doing; always "usually", never a claim about this run).
;(function (root) {
  // id -> executable stems, lower case, without .exe. One id can cover several helpers of the same program.
  const ENTRIES = {
    defender: ['msmpeng', 'mpdefendercoreservice', 'nissrv'],
    indexer: ['searchindexer', 'searchprotocolhost', 'searchfilterhost'],
    winupdate: ['tiworker', 'trustedinstaller', 'mousocoreworker', 'usocoreworker', 'wuauclt', 'musnotification'],
    telemetry: ['compattelrunner', 'devicecensus'],
    svchost: ['svchost'],
    wmi: ['wmiprvse'],
    dwm: ['dwm'],
    explorer: ['explorer'],
    onedrive: ['onedrive', 'filecoauth'],
    teams: ['teams', 'ms-teams', 'msteams'],
    discord: ['discord'],
    steam: ['steam', 'steamwebhelper', 'steamservice'],
    epic: ['epicgameslauncher', 'epicwebhelper'],
    chrome: ['chrome'],
    edge: ['msedge', 'msedgewebview2'],
    firefox: ['firefox'],
    brave: ['brave'],
    opera: ['opera', 'opera_gx'],
    code: ['code'],
    nvidia: ['nvcontainer', 'nvidia share', 'nvdisplay.container'],
    powershell: ['powershell', 'pwsh'],
    jylli: ['jylli tool', 'jylli-tool'],
    electron: ['electron'],
  }
  const IDS = Object.keys(ENTRIES)
  const BY_STEM = {}
  for (const id of IDS) for (const stem of ENTRIES[id]) BY_STEM[stem] = id

  // Below these a process is not "the cause": the load is spread across many of them.
  const CULPRIT_MIN = { cpu: 15, ram: 300, disk: 2 * 1048576 }      // % of the whole CPU, MB private working set, bytes/s

  /** 'MsMpEng.exe#2' -> 'msmpeng'. */
  const stem = name => String(name == null ? '' : name).replace(/#\d+$/, '').replace(/\.exe$/i, '').trim().toLowerCase()
  /** Catalog id for a process name, or null (null means: show the plain executable name, say nothing about it). */
  const describe = name => BY_STEM[stem(name)] || null

  /**
   * Raw lines 'name|value' (one per process instance) -> top consumers. Instances of one program (chrome#1, chrome#2 ...) are added up:
   * the user's browser is one thing to them, not twenty. -> { top: [{ name, id, value }], total }
   */
  function parseTop(out, limit) {
    const by = new Map()
    let total = 0
    for (const line of String(out == null ? '' : out).split(/\r?\n/)) {
      const i = line.lastIndexOf('|')
      if (i < 1) continue
      const raw = line.slice(0, i).trim(), v = parseFloat(line.slice(i + 1))
      if (!raw || !Number.isFinite(v) || v < 0) continue
      const key = stem(raw)
      if (!key) continue
      const cur = by.get(key) || { name: raw.replace(/#\d+$/, '').replace(/\.exe$/i, '').trim(), value: 0 }
      cur.value += v; total += v
      by.set(key, cur)
    }
    const top = [...by.entries()].sort((a, b) => b[1].value - a[1].value || (a[0] < b[0] ? -1 : 1)).slice(0, limit || 3)
      .map(([, p]) => ({ name: p.name, id: describe(p.name), value: Math.round(p.value * 10) / 10 }))
    return { top, total: Math.round(total * 10) / 10 }
  }

  /**
   * What the chart pins at a spike. metric 'cpu' | 'ram' | 'disk'.
   *   { type: 'game' }                       a game is running: nothing was read
   *   { type: 'process', name, id, value }   one process clearly stands out
   *   { type: 'spread', value }              nothing stands out: the load is shared
   *   { type: 'none' }                       the read failed
   */
  function flagFor(metric, result) {
    if (!result || result.ok === false) return { type: 'none' }
    if (result.game) return { type: 'game' }
    const top = result.top || []
    if (!top.length) return { type: 'none' }
    const min = CULPRIT_MIN[metric]
    if (min == null || top[0].value < min) return { type: 'spread', value: top[0].value }
    return { type: 'process', name: top[0].name, id: top[0].id, value: top[0].value }
  }

  const api = { ENTRIES, IDS, CULPRIT_MIN, stem, describe, parseTop, flagFor }
  root.JylliHomeProcesses = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
