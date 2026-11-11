'use strict'
// Maps the lines activatePulse() logs onto the boost's named steps, so the receipt can show each step live
// without a second source of truth. Pure. level 'ok' = done, anything else = skipped (the log says why).
;(function (root) {
  const TABLE = [
    ['timer', /^Timer resolution/],
    ['parking', /^(CPU core parking|Core unparking)/],
    ['power', /^Power plan/],
    ['mmcss', /^MMCSS/],
    ['affinity', /^Interrupt affinity/],
    ['kill', /^(Stopped:|Background kill|No background processes)/],
    ['priority', /^Game (priority|process)/],
    ['deprio', /background process\(es\) deprioritised/],
  ]
  const IDS = TABLE.map(r => r[0])

  /** @returns {{ id, state: 'ok'|'skip', detail }|null} */
  function stepOf(msg, level) {
    const m = String(msg || '').trim()
    for (const [id, rx] of TABLE) if (rx.test(m)) return { id, state: level === 'ok' ? 'ok' : 'skip', detail: m.slice(0, 120) }
    return null
  }

  const api = { IDS, stepOf }
  root.JylliPulseSteps = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
