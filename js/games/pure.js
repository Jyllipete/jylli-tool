'use strict'
// Games tab "Library": pure helpers (filters, sort, labels, sparkline geometry). No DOM, unit-tested (test/games-ui.test.js).
;(function (root) {
  const CHIPS = ['all', 'fav', 'tuned', 'attention', 'steam', 'epic', 'xbox', 'other']
  const VIEWS = ['library', 'play', 'auto', 'history']
  const VIEW_ICON = { library: 'table-cells-large', play: 'chart-line', auto: 'robot', history: 'clock-rotate-left' }
  const SORTS = ['recent', 'name', 'time']
  const ROW_ICON = { priority: 'gauge-high', throttle: 'bolt', windowed: 'window-restore', fso: 'display' }
  const SET = new Set(['on', 'native'])

  const norm = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const hue = id => [...String(id)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 360, 7)
  const initial = name => ((String(name || '').match(/[A-Za-z0-9]/) || ['?'])[0]).toUpperCase()
  const storeOf = g => (g.source === 'steam' || g.source === 'epic' || g.source === 'xbox' ? g.source : 'other')

  /** Tuned / needs-attention are about the model, not the store. */
  const attention = g => !!g.model && (g.model.summary === 'drift' || g.model.summary === 'open' || g.model.summary === 'partial') && g.model.trusted > 0
  function chipMatch(g, chip) {
    if (chip === 'all') return true
    if (chip === 'fav') return !!g.favorite
    if (chip === 'tuned') return !!g.model && g.model.summary === 'tuned'
    if (chip === 'attention') return attention(g)
    return storeOf(g) === chip
  }
  function chipCounts(games) {
    const out = {}
    for (const c of CHIPS) out[c] = games.filter(g => chipMatch(g, c)).length
    return out
  }
  /** Search matches the name, the developer and the store, ignoring case and punctuation ("counter strike" finds "Counter-Strike 2"). */
  function matches(g, q) {
    const n = norm(q); if (!n) return true
    const hay = norm([g.name, g.dev, g.source].join(' '))
    return n.split(' ').every(w => hay.includes(w))
  }
  /** recent = last played (Jylli's launch time or a recorded session), then name; time = recorded play time; running games lead every sort. */
  function sortGames(games, sort, stats, lastPlayed) {
    const last = g => Math.max((stats && stats[g.id] && stats[g.id].last) || 0, (lastPlayed && lastPlayed[g.id]) || 0)
    const time = g => (stats && stats[g.id] && stats[g.id].seconds) || 0
    const byName = (a, b) => a.name.localeCompare(b.name)
    const key = sort === 'name' ? byName : sort === 'time' ? (a, b) => time(b) - time(a) || byName(a, b) : (a, b) => last(b) - last(a) || byName(a, b)
    return [...games].sort((a, b) => (b.running ? 1 : 0) - (a.running ? 1 : 0) || key(a, b))
  }

  /** What the card's dot says: one word, the same ones the detail uses. */
  function dotOf(g) {
    if (g.running) return 'running'
    const s = g.model && g.model.summary
    return s || 'open'
  }

  // time
  const fmtHours = sec => { const m = Math.round((Number(sec) || 0) / 60); return m < 60 ? { k: 'min', n: m } : { k: 'h', n: Math.round(m / 6) / 10 } }
  function ago(ms, now) {
    if (!ms) return null
    const d = Math.max(0, (now || Date.now()) - ms), m = Math.floor(d / 60000)
    if (m < 2) return { k: 'now', n: 0 }
    if (m < 60) return { k: 'min', n: m }
    const h = Math.floor(m / 60)
    if (h < 48) return { k: 'h', n: h }
    return { k: 'd', n: Math.floor(h / 24) }
  }

  /** Sparkline path for values (>=2) in a w x h box; flat series stay centred. */
  function spark(values, w, h, pad = 3) {
    const v = (values || []).filter(x => Number.isFinite(x))
    if (v.length < 2) return ''
    const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1
    return v.map((y, i) => (i ? 'L' : 'M') + (pad + (i * (w - 2 * pad)) / (v.length - 1)).toFixed(1) + ' ' + (hi === lo ? h / 2 : h - pad - ((y - lo) / span) * (h - 2 * pad)).toFixed(1)).join(' ')
  }

  /** Rows grouped for the Tune tab: the ones with something recommended first. */
  const rowTone = r => (r.status === 'drifted' ? 'warn' : r.status === 'elsewhere' ? 'info' : SET.has(r.status) ? 'ok' : 'idle')
  const isSet = r => SET.has(r.status)
  /** A row can be switched when there is a trusted exe, the account may write, and it is not owned by something else. */
  const canSwitch = (r, premium) => premium && r.status !== 'noexe' && r.status !== 'elsewhere' && r.status !== 'unknown'

  const api = { CHIPS, VIEWS, VIEW_ICON, SORTS, ROW_ICON, norm, hue, initial, storeOf, chipMatch, chipCounts, matches, sortGames, dotOf, fmtHours, ago, spark, rowTone, isSet, canSwitch, attention }
  root.JylliGamesPure = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
