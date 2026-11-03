'use strict'
// Auto-Optimize engine: detection, findings, plan and change description. Pure modules; main.js supplies the PowerShell runner,
// the TWEAKS table and the controls.
module.exports = {
  catalog: require('./catalog'),
  probes: require('./probes'),
  detect: require('./detect'),
  findings: require('./findings'),
  plan: require('./plan'),
  describe: require('./describe'),
  display: require('./display'),
  startup: require('./startup'),
  ramParts: require('./ram-parts'),
}
