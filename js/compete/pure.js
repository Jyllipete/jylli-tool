'use strict'
// Competitive Mode: the parts of the panel that need no DOM (what rows exist, what the status line says, game search, custom core presets).
// Unit-tested (test/compete-ui.test.js). Copy lives in LANG group `compete`.
;(function (root) {
  const STORES = { steam: 'Steam', epic: 'Epic Games', xbox: 'Xbox', custom: 'Custom' }
  // id, kind, premium. `kind`: select | check. Order = order on screen.
  const GROUPS = [
    { id: 'process', rows: [{ id: 'priority', kind: 'select' }, { id: 'eco', kind: 'check' }, { id: 'cores', kind: 'select', premium: true }] },
    { id: 'background', rows: [{ id: 'shield', kind: 'check', premium: true }, { id: 'services', kind: 'check', premium: true }, { id: 'tray', kind: 'check' }] },
    { id: 'system', rows: [{ id: 'power', kind: 'check' }, { id: 'standby', kind: 'check' }] },
  ]
  const DEFAULTS = { priority: 'above', eco: true, power: true, standby: false, cores: 'all', customCpus: [], shield: false, services: false, tray: false }

  const normalize = (o) => Object.assign({}, DEFAULTS, o || {})

  /** Games matching the typed text (all words, any order, punctuation ignored). */
  function filterGames(games, q) {
    const words = String(q || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)
    if (!words.length) return games.slice()
    return games.filter(g => { const n = String(g.name).toLowerCase().replace(/[^a-z0-9]+/g, ' '); return words.every(w => n.includes(w)) })
  }

  /** Select options for the core plan row: only plans valid on this PC, then Custom when there are enough CPUs. */
  function coreChoices(cores) {
    const kinds = cores && Array.isArray(cores.kinds) ? cores.kinds : []
    const out = ['all', ...['pcores', 'vcache', 'skip0'].filter(k => kinds.includes(k))]
    if (cores && cores.logical >= 8 && cores.logical <= 64) out.push('custom')
    return out
  }

  /** Custom-grid presets: which CPUs a button selects. cpus = [{ n, smt }]. */
  function presetCpus(kind, cpus) {
    const list = cpus || []
    if (kind === 'all') return list.map(c => c.n)
    if (kind === 'none') return []
    if (kind === 'smtOff') return list.filter(c => !c.smt).map(c => c.n)
    if (kind === 'smtOn') return list.map(c => c.n)
    return []
  }

  /** What the status line says: { key, vars }. s = session view from the service, games = list length, ended = last receipt. */
  function statusFor(s, games, ended) {
    s = s || { state: 'idle' }
    if (s.state === 'waiting') return { key: 'waiting', vars: { name: s.name || '' } }
    if (s.state === 'ending') return { key: 'ending', vars: {} }
    if (s.state === 'running') {
      const n = (s.steps || []).filter(x => x.state === 'apply' && x.ok && x.id !== 'tray').length
      return n ? { key: 'running', vars: { name: s.name || '', n } } : { key: 'runningNone', vars: { name: s.name || '' } }
    }
    if (ended) {
      if (ended.why === 'no-game-found') return { key: 'endedNone', vars: { name: ended.name || '' } }
      return ended.why === 'stopped' ? { key: 'endedStop', vars: { reverted: ended.reverted } } : { key: 'endedGame', vars: { applied: ended.applied, reverted: ended.reverted } }
    }
    if (!games) return { key: 'noneFound', vars: {} }
    return games === 1 ? { key: 'foundOne', vars: {} } : { key: 'found', vars: { n: games } }
  }

  /** Per-row badge while a session is on: the step result for that row. -> { kind: 'ok'|'skip'|'lock', reason?, detail? } | null */
  function badgeFor(rowId, steps) {
    const r = (steps || []).find(x => x.id === rowId)
    if (!r) return null
    if (r.state === 'locked') return { kind: 'lock' }
    if (r.state === 'skipped') return { kind: 'skip', reason: r.reason }
    return r.ok ? { kind: 'ok', detail: r.detail } : null
  }

  /** The core options the engine receives: customCpus only matter with cores === 'custom'. */
  function requestOpts(o) {
    const x = normalize(o)
    return { priority: x.priority, eco: !!x.eco, power: !!x.power, standby: !!x.standby, cores: x.cores, customCpus: x.cores === 'custom' ? x.customCpus.slice() : [], shield: !!x.shield, services: !!x.services, tray: !!x.tray }
  }

  const api = { STORES, GROUPS, DEFAULTS, normalize, filterGames, coreChoices, presetCpus, statusFor, badgeFor, requestOpts }
  root.JylliCompetePure = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
