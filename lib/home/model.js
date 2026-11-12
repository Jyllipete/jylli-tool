'use strict'
// Home "Helm": the Jylli Index (0-100) and its three pillars. Pure and UMD (main, renderer and tests share it).
// Nothing is guessed: a pillar whose input is unknown is "not measured" and is left out of the blend (js/score.js renormalises).
//   snapshot = { diag: { score, takenAt } | null, legacy: { score } | null,
//                tuned: { applied, open, drifted } | null,        // open = recommended for this PC and not applied yet
//                protect: { restore: { level }, isAdmin: bool|null }, now }
;(function (root) {
  const blend = (root.JylliScore || (typeof require === 'function' ? require('../../js/score.js') : null)).blend
  const DAY = 86400000
  const WEIGHT = { health: 50, tuned: 30, protected: 20 }
  const DIAG_STALE_MS = 30 * DAY
  const MAX_HISTORY = 60
  const num = n => typeof n === 'number' && Number.isFinite(n)
  const toneOf = s => s == null ? 'idle' : s >= 80 ? 'ok' : s >= 55 ? 'warn' : 'danger'

  /** Health pillar: the Vitals score when a checkup exists, else the quick score. -> { value 0..1|null, source, stale } */
  function health(snap) {
    const d = snap.diag, l = snap.legacy
    if (d && num(d.score)) return { value: d.score / 100, source: 'vitals', stale: num(d.takenAt) && (snap.now - d.takenAt) > DIAG_STALE_MS }
    if (l && num(l.score)) return { value: l.score / 100, source: 'quick', stale: false }
    return { value: null, source: null, stale: false }
  }

  /** Tuned pillar: share of the tweaks that apply to this PC that are in place and have not drifted back. */
  function tuned(t) {
    if (!t) return { value: null }
    const applied = Math.max(0, t.applied || 0), open = Math.max(0, t.open || 0), drifted = Math.min(applied, Math.max(0, t.drifted || 0))
    if (applied + open === 0) return { value: null, applied, open, drifted }
    return { value: (applied - drifted) / (applied + open), applied, open, drifted }
  }

  /** Protected pillar: restore point freshness (70) and admin rights (30). */
  function protectedPillar(p) {
    if (!p) return { value: null }
    const lvl = p.restore && p.restore.level
    const rp = lvl === 'fresh' ? 1 : lvl === 'stale' ? 0.5 : lvl === 'never' ? 0 : null
    const adm = p.isAdmin == null ? null : p.isAdmin ? 1 : 0
    const b = blend([{ key: 'restore', value: rp, weight: 70 }, { key: 'admin', value: adm, weight: 30 }])
    return { value: b.score == null ? null : b.score / 100, restore: lvl || null, isAdmin: p.isAdmin == null ? null : !!p.isAdmin }
  }

  /** The index plus the inputs behind it (the "why this number" drawer shows exactly these). */
  function buildIndex(snap) {
    snap = snap || {}
    snap = { ...snap, now: num(snap.now) ? snap.now : Date.now() }
    const pil = { health: health(snap), tuned: tuned(snap.tuned), protected: protectedPillar(snap.protect) }
    const b = blend(Object.keys(WEIGHT).map(k => ({ key: k, value: pil[k].value, weight: WEIGHT[k] })))
    const pct = k => pil[k].value == null ? null : Math.round(pil[k].value * 100)
    // Tuning and protection say little about how the PC is doing: without a measured Health pillar there is no Index, only the bands.
    const score = pil.health.value == null ? null : b.score
    const out = {
      score, tone: toneOf(score), used: b.used, missing: b.missing,
      pillars: {}, weakest: null, verdictKey: 'verdictNone',
    }
    for (const k of Object.keys(WEIGHT)) out.pillars[k] = { ...pil[k], pct: pct(k), weight: WEIGHT[k], tone: toneOf(pct(k)) }
    const measured = b.used.slice().sort((x, y) => pil[x].value - pil[y].value || (x < y ? -1 : 1))
    if (measured.length) out.weakest = measured[0]
    if (score != null) {
      const w = out.weakest
      out.verdictKey = score >= 80 && pil[w].value >= 0.6 ? 'verdictStrong' : pil[w].value < 0.6 && measured.length > 1 ? 'verdictWeak_' + w : 'verdictFair'
    }
    return out
  }

  /** Append today's reading: one entry per UTC day (a later reading replaces it), oldest first, capped. */
  function pushHistory(history, entry, max) {
    const day = e => Math.floor(e.ts / DAY)
    const cap = max || MAX_HISTORY
    const list = (Array.isArray(history) ? history : []).filter(e => e && num(e.ts) && num(e.score))
    if (!entry || !num(entry.ts) || !num(entry.score)) return list.slice(-cap)
    const rest = list.filter(e => day(e) !== day(entry))
    rest.push({ ts: entry.ts, score: entry.score, h: entry.h ?? null, t: entry.t ?? null, p: entry.p ?? null })
    rest.sort((a, b) => a.ts - b.ts)
    return rest.slice(-cap)
  }

  /** Change against about a week ago: { delta, days } or null when there is nothing to compare with. */
  function trend(history, now) {
    const list = (Array.isArray(history) ? history : []).filter(e => e && num(e.ts) && num(e.score)).sort((a, b) => a.ts - b.ts)
    if (list.length < 2) return null
    const last = list[list.length - 1]
    const t = (num(now) ? now : last.ts) - 7 * DAY
    let ref = null
    for (const e of list) { if (e === last) break; if (e.ts <= t || !ref) ref = e; if (e.ts > t) break }
    if (!ref || last.ts - ref.ts < DAY) return null
    return { delta: last.score - ref.score, days: Math.round((last.ts - ref.ts) / DAY) }
  }

  const api = { buildIndex, pushHistory, trend, toneOf, WEIGHT, MAX_HISTORY, DIAG_STALE_MS }
  root.JylliHomeModel = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
