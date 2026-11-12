'use strict'
// Symptom search: Ctrl K also answers "what is wrong" instead of only "where is it": typing stutter, high ping, loud fans or
// slow startup (English or Finnish) offers the page that fixes it. Keywords are search terms only; titles come from the LANG keys.
// The matching is pure and unit-tested.
;(function (root) {
  const SYMPTOMS = [
    { id: 'stutter', page: 'latency-monitor', tab: 'latency', icon: 'fa-wave-square', kw: 'stutter stuttering frame drops fps lag hitch freeze pätkii nykii nykintä kuristaa pudotus' },
    { id: 'ping', page: 'network', tab: 'network', icon: 'fa-globe', kw: 'ping high ping lag online latency packet loss slow internet viive hidas verkko' },
    { id: 'hot', page: 'hardware', tab: 'gpu', icon: 'fa-temperature-high', kw: 'hot loud fans fan noise noisy temperature heat overheating kuuma ääni äänekäs tuuletin lämpö ylikuumenee' },
    { id: 'startup', page: 'startup-manager', tab: 'startup', icon: 'fa-rocket', kw: 'slow startup boot slow boot takes long to start hidas käynnistys käynnistyy hitaasti' },
    { id: 'disk', page: 'privacy-cleanup', tab: 'cleanup', icon: 'fa-hard-drive', kw: 'disk space full storage low space cleanup levytila täynnä tila siivous' },
    { id: 'input', page: 'windows-opti', tab: 'windows', icon: 'fa-computer-mouse', kw: 'input lag mouse delay mouse acceleration keyboard hiiri viive kiihtyvyys näppäimistö' },
  ]

  /** q: user text. Returns the symptoms whose keywords contain every word of q (empty q = none). */
  function match(q, list = SYMPTOMS) {
    const words = String(q || '').toLowerCase().split(/\s+/).filter(w => w.length >= 2)
    if (!words.length) return []
    return list.filter(s => words.every(w => s.kw.includes(w)))
  }

  const api = { SYMPTOMS, match }
  root.JylliSymptoms = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
