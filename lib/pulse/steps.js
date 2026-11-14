'use strict'
// The changes a Pulse boost can make, in the order the receipt lists them. The planner (plan.js) decides which apply on this PC;
// main.js reports each one as it is applied and read back. Pure.
;(function (root) {
  const IDS = ['power', 'priority', 'deprio']
  const api = { IDS }
  root.JylliPulseSteps = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
