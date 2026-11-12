'use strict'
// Home page helpers that need no DOM: dial geometry, number words, move copy keys. UMD; unit-tested in test/home-ui.test.js.
;(function (root) {
  const DAY = 86400000
  const num = n => typeof n === 'number' && Number.isFinite(n)

  // Three concentric bands, outermost first. Each is a circle drawn with pathLength=100, so a pillar value is its dash length.
  const BANDS = [{ key: 'health', r: 88 }, { key: 'tuned', r: 75 }, { key: 'protected', r: 62 }]
  const CIRC = r => 2 * Math.PI * r

  /** index (JylliHomeModel.buildIndex) -> [{ key, r, pct: 0..100, tone, dash: 'len 100', measured }]. An unmeasured band is empty, not zero. */
  function dial(index) {
    return BANDS.map(b => {
      const p = index && index.pillars && index.pillars[b.key]
      const pct = p && num(p.pct) ? p.pct : null
      return { key: b.key, r: b.r, pct: pct == null ? 0 : pct, tone: p ? p.tone : 'idle', dash: (pct == null ? 0 : pct) + ' 100', measured: pct != null }
    })
  }

  /** Bytes -> { n: '2.4', u: 'GB' } (binary units, one decimal under 10). */
  function bytes(v) {
    if (!num(v) || v < 0) return null
    const u = ['B', 'KB', 'MB', 'GB', 'TB']
    let i = 0, x = v
    while (x >= 1024 && i < u.length - 1) { x /= 1024; i++ }
    return { n: x >= 100 || i === 0 ? String(Math.round(x)) : x.toFixed(x >= 10 ? 0 : 1), u: u[i] }
  }

  /** Milliseconds -> seconds with one decimal ('9.2'). */
  const seconds = ms => (num(ms) ? (Math.abs(ms) / 1000).toFixed(1) : null)

  /** Age in words keys: { key: 'agoNow'|'agoMin'|'agoHour'|'agoDay', n }. */
  function ago(ts, now) {
    if (!num(ts)) return null
    const d = Math.max(0, (num(now) ? now : Date.now()) - ts)
    if (d < 90e3) return { key: 'agoNow', n: 0 }
    if (d < 3600e3) return { key: 'agoMin', n: Math.round(d / 60e3) }
    if (d < DAY) return { key: 'agoHour', n: Math.round(d / 3600e3) }
    return { key: 'agoDay', n: Math.round(d / DAY) }
  }

  /** Which LANG group and keys a move's text comes from. Concierge moves keep their own group; AI moves carry their text. */
  function moveCopy(m) {
    if (!m) return null
    if (m.kind === 'ai') return { group: null, title: m.text || m.id, why: m.why || '' }
    if (m.kind === 'concierge') return { group: 'concierge', titleKey: m.titleKey, whyKey: m.whyKey }
    return { group: 'home2', titleKey: 'm_' + m.titleKey, whyKey: 'm_' + m.whyKey }
  }

  /** Vars for a move's copy: byte counts are formatted, never shown raw. */
  function moveVars(m) {
    const v = { ...(m && m.vars) }
    if (num(v.bytes)) { const b = bytes(v.bytes); v.size = b ? b.n + ' ' + b.u : '' }
    return v
  }

  /** Tone of a 0..100 value for bars and chips (same boundaries as the index). */
  const tone = p => (!num(p) ? 'idle' : p >= 80 ? 'ok' : p >= 55 ? 'warn' : 'danger')

  /** Sparkline path for a series of 0..100 values (null = gap): 'M x y L x y M ...' in a w x h box. */
  function spark(values, w, h) {
    const vs = values || []
    if (vs.length < 2) return ''
    const step = w / (vs.length - 1)
    let d = '', pen = false
    vs.forEach((v, i) => {
      if (!num(v)) { pen = false; return }
      const x = Math.round(i * step * 10) / 10, y = Math.round((h - (Math.max(0, Math.min(100, v)) / 100) * h) * 10) / 10
      d += (pen ? ' L ' : (d ? ' M ' : 'M ')) + x + ' ' + y
      pen = true
    })
    return d
  }

  const api = { BANDS, CIRC, dial, bytes, seconds, ago, moveCopy, moveVars, tone, spark }
  root.JylliHomePure = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
