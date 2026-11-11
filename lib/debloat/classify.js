'use strict'
// Debloat classifier: ALL "is this in use on this PC" rules live here and nowhere else. Pure, no dependencies, so the page can
// re-run it when an intent chip is toggled (no rescan). Input items come from model.js; facts and intents from the scan and the user.
//   verdict: { id, present, lane: 'safe'|'review'|'kept'|null, reason: { code, arg? }|null }
//   reason codes: protected | use (arg = fact name) | intent (arg = intent) | recent (arg = days since last opened) | unlocked
;(function (root) {
  const DAY = 86400000
  const RECENT_DAYS = 30
  const INTENTS = ['gaming', 'xbox', 'stream', 'work', 'dev', 'laptop', 'print']

  /** What the scan says this PC is for. The user can change any of it; their choice is stored and wins. */
  function autoIntents(facts) {
    const f = facts || {}
    return { gaming: true, xbox: f.gamePass > 0 || f.xboxController > 0, stream: !!f.obs, work: false, dev: !!f.dev, laptop: !!f.laptop, print: f.printers > 0 }
  }
  const asSet = i => (i instanceof Set ? i : new Set(Array.isArray(i) ? i : Object.keys(i || {}).filter(k => i[k])))

  /** classify(items, facts, intents, { shield = true, now, unlocked = Set<id> }) -> { [id]: verdict } */
  function classify(items, facts, intents, opts = {}) {
    const on = asSet(intents), shield = opts.shield !== false, now = opts.now || Date.now(), unlocked = opts.unlocked || new Set()
    const f = facts || {}
    const out = {}
    for (const it of items || []) {
      if (it.state !== 'on') { out[it.id] = { id: it.id, present: false, lane: null, reason: null }; continue }
      let lane = it.lane, reason = null
      const needed = (it.needs || []).find(n => on.has(n))
      if (it.protected && shield) { lane = 'kept'; reason = { code: 'protected' } }
      else if (it.use && f[it.use] > 0) { lane = 'kept'; reason = { code: 'use', arg: it.use } }
      else if (needed) { lane = 'kept'; reason = { code: 'intent', arg: needed } }
      else if (it.lastUsed && now - it.lastUsed < RECENT_DAYS * DAY) { lane = 'review'; reason = { code: 'recent', arg: Math.max(0, Math.floor((now - it.lastUsed) / DAY)) } }
      if (lane === 'kept' && unlocked.has(it.id)) { lane = 'review'; reason = { code: 'unlocked' } }
      out[it.id] = { id: it.id, present: true, lane, reason }
    }
    return out
  }

  /** What starts ticked: the safe lane, nothing else. Kept items can never be in here. */
  const defaultSelection = verdicts => new Set(Object.values(verdicts).filter(v => v.present && v.lane === 'safe').map(v => v.id))
  const laneItems = (items, verdicts, lane) => (items || []).filter(i => verdicts[i.id] && verdicts[i.id].lane === lane)

  const api = { INTENTS, RECENT_DAYS, autoIntents, classify, defaultSelection, laneItems }
  root.JylliDebloatClassify = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
